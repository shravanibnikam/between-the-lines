//! Importing a manuscript: Word (.docx), OpenDocument (.odt), Markdown and plain text.
//! Chapters are found from heading styles, or from lines such as "Chapter 3" or "Prologue".

use crate::model::{Section, SectionKind};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;

pub struct Imported {
    pub title: Option<String>,
    pub author: Option<String>,
    pub sections: Vec<Section>,
    pub notes: Vec<String>,
}

pub fn import_file(path: &Path) -> Result<Imported, String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Imported book").replace(['_', '-'], " ");
    let mut r = match ext.as_str() {
        "docx" => import_docx(path)?,
        "odt" => import_odt(path)?,
        "md" | "markdown" | "txt" | "text" | "" => {
            let (text, latin1) = read_text(path)?;
            let mut r = if matches!(ext.as_str(), "md" | "markdown") { import_markdown(&text) } else { import_text(&text) };
            if latin1 {
                r.notes.push("The file isn't UTF-8, so it was read as Latin-1. Check accented letters.".into());
            }
            r
        }
        other => return Err(format!("Files ending in .{other} can't be imported yet. Use .docx, .odt, .md or .txt.")),
    };
    if r.title.as_deref().map(|t| t.trim().is_empty()).unwrap_or(true) {
        r.title = Some(stem.trim().to_string());
    }
    if r.sections.is_empty() {
        return Err("No text was found in that file.".into());
    }
    Ok(r)
}

/// File text and whether the Latin-1 fallback was used. Handles UTF-8 (with or without BOM) and UTF-16.
fn read_text(path: &Path) -> Result<(String, bool), String> {
    let mut bytes = Vec::new();
    std::fs::File::open(path).and_then(|f| f.take(MAX_ENTRY + 1).read_to_end(&mut bytes)).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_ENTRY {
        return Err("That file is too large to import.".into());
    }
    Ok(decode_text(bytes))
}

fn decode_text(bytes: Vec<u8>) -> (String, bool) {
    let utf16 = |b: &[u8], le: bool| {
        let units = b.as_chunks::<2>().0.iter().map(|&c| if le { u16::from_le_bytes(c) } else { u16::from_be_bytes(c) });
        char::decode_utf16(units).map(|r| r.unwrap_or('\u{FFFD}')).collect::<String>()
    };
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return (utf16(&bytes[2..], true), false);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return (utf16(&bytes[2..], false), false);
    }
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
    match std::str::from_utf8(body) {
        Ok(s) => (s.to_string(), false),
        Err(_) => (body.iter().map(|&b| b as char).collect(), true), // Latin-1 fallback
    }
}

// ---------------------------------------------------------------------------------------------
// Chapter detection
// ---------------------------------------------------------------------------------------------

const NUMBER_WORDS: [&str; 31] = [
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
    "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety", "hundred", "first", "second", "third",
];

fn roman_value(s: &str) -> Option<u32> {
    let v = |c: char| match c.to_ascii_uppercase() {
        'I' => Some(1),
        'V' => Some(5),
        'X' => Some(10),
        'L' => Some(50),
        'C' => Some(100),
        'D' => Some(500),
        'M' => Some(1000),
        _ => None,
    };
    let vals: Option<Vec<u32>> = s.chars().map(v).collect();
    let vals = vals?;
    if vals.is_empty() || vals.len() > 15 {
        return None;
    }
    let mut n = 0;
    for (i, &x) in vals.iter().enumerate() {
        if vals.get(i + 1).map(|&y| y > x).unwrap_or(false) {
            n -= x as i32;
        } else {
            n += x as i32;
        }
    }
    let n = u32::try_from(n).ok().filter(|n| (1..=3999).contains(n))?;
    // only the canonical spelling counts ("IIII", "VX", "Did" are not numerals)
    let mut m = n;
    let mut canon = String::new();
    for (val, sym) in [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")] {
        while m >= val {
            canon.push_str(sym);
            m -= val;
        }
    }
    (canon == s.to_ascii_uppercase()).then_some(n)
}

/// A number after "Chapter"/"Part": digits, a roman numeral, or a number word ("twenty-one").
fn is_number_token(t: &str) -> bool {
    let t = t.trim_matches(|c: char| !c.is_alphanumeric());
    if t.is_empty() {
        return false;
    }
    if t.len() <= 4 && t.chars().all(|c| c.is_ascii_digit()) {
        return true;
    }
    roman_value(t).is_some() || t.to_lowercase().split('-').all(|p| NUMBER_WORDS.contains(&p))
}

/// A paragraph that is only a number: "7", "VII", "Seven" (not "I", "Did", "Mild" or ordinals).
fn is_bare_number(t: &str) -> bool {
    let t = t.strip_suffix('.').unwrap_or(t);
    if t.is_empty() || t.contains(char::is_whitespace) {
        return false;
    }
    if t.chars().all(|c| c.is_ascii_digit()) {
        return t.len() <= 3;
    }
    if roman_value(t).is_some() {
        return t != "I" && t == t.to_uppercase();
    }
    t.to_lowercase().split('-').all(|p| NUMBER_WORDS[..27].contains(&p))
}

/// `t` without its leading `word` (ASCII, any case); never splits a character.
fn strip_word<'a>(t: &'a str, word: &str) -> Option<&'a str> {
    let head = t.get(..word.len())?;
    head.eq_ignore_ascii_case(word).then(|| &t[word.len()..])
}

const DASHES: [char; 3] = ['-', '—', '–'];

/// Short title-case text without sentence punctuation ("The Storm"), as in "Chapter 3 The Storm".
fn is_title_case(s: &str) -> bool {
    const SMALL: [&str; 14] = ["a", "an", "the", "of", "and", "in", "on", "to", "for", "at", "by", "or", "but", "with"];
    if s.ends_with(['.', '!', '?', ';', ',', '…']) || s.split_whitespace().count() > 10 {
        return false;
    }
    s.split_whitespace().enumerate().all(|(i, w)| {
        let first = w.chars().find(|c| c.is_alphanumeric());
        match first {
            None => true,
            Some(c) if !c.is_alphabetic() || c.is_uppercase() => true,
            Some(_) => i > 0 && SMALL.contains(&w.to_lowercase().trim_matches(|c: char| !c.is_alphabetic())),
        }
    })
}

/// If a line looks like a chapter heading, its kind and title (title may be empty).
pub fn classify_heading(line: &str) -> Option<(SectionKind, String)> {
    let t = crate::markup::strip(line.trim());
    let t = t.trim();
    if t.is_empty() || t.chars().count() > 80 || t.ends_with(',') {
        return None;
    }
    for (word, kind) in [("prologue", SectionKind::Prologue), ("epilogue", SectionKind::Epilogue)] {
        if let Some(rest) = strip_word(t, word) {
            let r = rest.trim_start();
            if r.is_empty() || rest.starts_with(':') || (r.len() != rest.len() && r.starts_with(DASHES)) {
                return Some((kind, r.trim_start_matches([':', '-', '—', '–', ' ']).trim().to_string()));
            }
        }
    }
    for (word, kind) in [("chapter", SectionKind::Chapter), ("part", SectionKind::Part), ("book", SectionKind::Part)] {
        let Some(rest) = strip_word(t, word).filter(|r| r.starts_with(' ')) else { continue };
        let rest = rest.trim_start();
        // the number: alphanumerics, with hyphens inside words ("twenty-one")
        let chars: Vec<(usize, char)> = rest.char_indices().collect();
        let mut end = rest.len();
        for (k, &(i, c)) in chars.iter().enumerate() {
            let inner_hyphen = c == '-' && k > 0 && chars[k - 1].1.is_alphabetic() && chars.get(k + 1).map(|x| x.1.is_alphabetic()).unwrap_or(false);
            if !(c.is_alphanumeric() || inner_hyphen) {
                end = i;
                break;
            }
        }
        if !is_number_token(&rest[..end]) {
            continue;
        }
        let after = &rest[end..];
        let tail = after.trim_start();
        if tail.is_empty() {
            return Some((kind, String::new()));
        }
        // "Chapter 3: The Storm", "Chapter 3 - The Storm", or a short title-case "Chapter 3 The Storm"
        if tail.starts_with([':', '.', '-', '—', '–']) {
            return Some((kind, tail.trim_start_matches([':', '.', '-', '—', '–', ' ']).trim().to_string()));
        }
        if after.starts_with(char::is_whitespace) && is_title_case(tail) {
            return Some((kind, tail.to_string()));
        }
    }
    // A line that is only a number ("7", "VII", "Seven")
    if is_bare_number(t) {
        return Some((SectionKind::Chapter, String::new()));
    }
    None
}

/// Split paragraphs into chapters using heading lines. `guess` also looks for "Chapter 3"-style
/// lines in paragraphs that weren't marked as headings. Returns the sections and notes for the user.
fn split_into_chapters(paras: Vec<String>, explicit: Vec<Option<(SectionKind, String)>>, guess: bool) -> (Vec<Section>, Vec<String>) {
    let mut out: Vec<Section> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let mut cur: Option<Section> = None;
    let mut preface: Vec<String> = Vec::new();
    for (p, h) in paras.into_iter().zip(explicit) {
        let heading = h.or_else(|| if guess { classify_heading(&p) } else { None });
        if let Some((kind, title)) = heading {
            if let Some(c) = cur.take() {
                out.push(c);
            }
            let mut s = Section::new(kind, &title);
            s.title = title;
            cur = Some(s);
            continue;
        }
        match cur.as_mut() {
            Some(c) => {
                c.text.push_str(&p);
                c.text.push('\n');
            }
            None => preface.push(p),
        }
    }
    if let Some(c) = cur.take() {
        out.push(c);
    }
    if !preface.is_empty() {
        let text = preface.join("\n");
        let words = crate::model::count_words(&text);
        if out.is_empty() {
            let mut s = Section::new(SectionKind::Chapter, "");
            s.text = text;
            out.push(s);
        } else if words > 40 {
            let mut s = Section::new(SectionKind::Chapter, "");
            s.text = text;
            out.insert(0, s);
            notes.push(format!("Kept {words} words before the first chapter as its own chapter."));
        } else {
            let mut s = Section::new(SectionKind::Epigraph, "");
            s.text = text;
            out.insert(0, s);
            notes.push(format!("Kept {words} words before the first chapter as an epigraph."));
        }
    }
    for s in out.iter_mut() {
        s.text = s.text.trim_end().to_string();
    }
    (out, notes)
}

// ---------------------------------------------------------------------------------------------
// Plain text and Markdown
// ---------------------------------------------------------------------------------------------

fn escape_marks(s: &str) -> String {
    s.replace('\\', "\\\\").replace('*', "\\*")
}

pub fn import_text(text: &str) -> Imported {
    let text = text.trim_start_matches('\u{feff}').replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = text.lines().collect();
    let blank = lines.iter().filter(|l| l.trim().is_empty()).count();
    let blank_separated = lines.len() > 4 && blank * 10 > lines.len();
    let mut paras = Vec::new();
    if blank_separated {
        let mut cur = String::new();
        for l in &lines {
            let t = l.trim();
            if t.is_empty() {
                if !cur.is_empty() {
                    paras.push(std::mem::take(&mut cur));
                }
            } else if classify_heading(t).is_some() || crate::markup::is_scene_break(t) {
                if !cur.is_empty() {
                    paras.push(std::mem::take(&mut cur));
                }
                paras.push(t.to_string());
            } else {
                if !cur.is_empty() {
                    cur.push(' ');
                }
                cur.push_str(&escape_marks(t));
            }
        }
        if !cur.is_empty() {
            paras.push(cur);
        }
    } else {
        for l in &lines {
            let t = l.trim();
            if !t.is_empty() {
                paras.push(if crate::markup::is_scene_break(t) { t.to_string() } else { escape_marks(t) });
            }
        }
    }
    let n = paras.len();
    let (sections, notes) = split_into_chapters(paras, vec![None; n], true);
    Imported { title: None, author: None, sections, notes }
}

/// `__x__` -> `**x**` (the book markup reads single underscores as italics).
fn underscores_to_bold(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find("__") {
        let after = &rest[i + 2..];
        let word_before = rest[..i].chars().next_back().map(|c| c.is_alphanumeric()).unwrap_or(false);
        let close = after.find("__").filter(|&j| {
            let inner = &after[..j];
            !inner.is_empty() && !inner.starts_with(' ') && !inner.ends_with(' ') && !after[j + 2..].starts_with(|c: char| c.is_alphanumeric())
        });
        match close {
            Some(j) if !word_before => {
                out.push_str(&rest[..i]);
                out.push_str("**");
                out.push_str(&after[..j]);
                out.push_str("**");
                rest = &after[j + 2..];
            }
            _ => {
                out.push_str(&rest[..i + 2]);
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// A list line: its marker ("•" or "3.") and the item text.
fn list_item(t: &str) -> Option<(String, &str)> {
    let t = t.trim_start();
    if let Some(r) = t.strip_prefix(['-', '*', '+']).and_then(|r| r.strip_prefix(' ')) {
        return Some(("•".into(), r.trim()));
    }
    let digits = t.chars().take_while(|c| c.is_ascii_digit()).count();
    if (1..=9).contains(&digits) {
        if let Some(r) = t[digits..].strip_prefix(['.', ')']).and_then(|r| r.strip_prefix(' ')) {
            return Some((format!("{}.", &t[..digits]), r.trim()));
        }
    }
    None
}

pub fn import_markdown(text: &str) -> Imported {
    let text = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let mut paras: Vec<String> = Vec::new();
    let mut heads: Vec<Option<(SectionKind, String)>> = Vec::new();
    let mut cur = String::new();
    let mut title = None;
    let flush = |cur: &mut String, paras: &mut Vec<String>, heads: &mut Vec<Option<(SectionKind, String)>>| {
        if !cur.trim().is_empty() {
            paras.push(cur.trim().to_string());
            heads.push(None);
        }
        cur.clear();
    };
    let h1_count = text.lines().filter(|l| l.starts_with("# ")).count();
    for l in text.lines() {
        let t = l.trim_end();
        if t.trim().is_empty() {
            flush(&mut cur, &mut paras, &mut heads);
            continue;
        }
        if let Some(h) = t.strip_prefix("# ") {
            flush(&mut cur, &mut paras, &mut heads);
            if h1_count == 1 && title.is_none() && paras.is_empty() {
                title = Some(h.trim().to_string());
                continue;
            }
            let (kind, ttl) = classify_heading(h).unwrap_or((SectionKind::Chapter, h.trim().to_string()));
            let ttl = if ttl.is_empty() && classify_heading(h).is_none() { h.trim().to_string() } else { ttl };
            paras.push(h.to_string());
            heads.push(Some((kind, ttl)));
            continue;
        }
        if let Some(h) = t.strip_prefix("## ") {
            flush(&mut cur, &mut paras, &mut heads);
            if h1_count <= 1 {
                let (kind, ttl) = classify_heading(h).unwrap_or((SectionKind::Chapter, h.trim().to_string()));
                paras.push(h.to_string());
                heads.push(Some((kind, ttl)));
            } else {
                paras.push(format!("## {}", h.trim()));
                heads.push(None);
            }
            continue;
        }
        if crate::markup::is_scene_break(t) || t.starts_with('>') || t.starts_with("### ") {
            flush(&mut cur, &mut paras, &mut heads);
            paras.push(t.trim().to_string());
            heads.push(None);
            continue;
        }
        // table rows and footnote definitions keep their own lines
        if t.trim_start().starts_with('|') || crate::markup::note_def(t).is_some() {
            flush(&mut cur, &mut paras, &mut heads);
            paras.push(underscores_to_bold(t.trim()));
            heads.push(None);
            continue;
        }
        if let Some((marker, item)) = list_item(t) {
            flush(&mut cur, &mut paras, &mut heads);
            cur = format!("{marker} {}", underscores_to_bold(item));
            continue;
        }
        if !cur.is_empty() {
            cur.push(' ');
        }
        cur.push_str(&underscores_to_bold(t.trim()));
    }
    flush(&mut cur, &mut paras, &mut heads);
    let (sections, notes) = split_into_chapters(paras, heads, true);
    Imported { title, author: None, sections, notes }
}

// ---------------------------------------------------------------------------------------------
// Word (.docx)
// ---------------------------------------------------------------------------------------------

const MAX_ENTRY: u64 = 64 * 1024 * 1024;
/// All the parts one import reads, together.
const MAX_PARTS: u64 = 128 * 1024 * 1024;
/// Footnote text after copying it for every reference to it.
const MAX_NOTES: usize = 64 * 1024 * 1024;

/// A zip entry as text: `Ok(None)` when it's missing or isn't text, an error when it's over 64 MB
/// or over what's left of `budget` (which it uses up).
fn zip_text(archive: &mut zip::ZipArchive<std::fs::File>, name: &str, budget: &mut u64) -> Result<Option<String>, String> {
    let Ok(f) = archive.by_name(name) else { return Ok(None) };
    let cap = MAX_ENTRY.min(*budget);
    let mut buf = Vec::new();
    let read = f.take(cap + 1).read_to_end(&mut buf);
    if buf.len() as u64 > cap {
        return Err("That document is too large to import.".into());
    }
    *budget -= buf.len() as u64;
    if read.is_err() {
        return Ok(None);
    }
    Ok(String::from_utf8(buf).ok())
}

fn attr<'a>(n: &roxmltree::Node<'a, 'a>, local: &str) -> Option<&'a str> {
    n.attributes().find(|a| a.name() == local).map(|a| a.value())
}

fn on(n: Option<roxmltree::Node>) -> bool {
    match n {
        None => false,
        Some(n) => !matches!(attr(&n, "val"), Some("0") | Some("false") | Some("off") | Some("none")),
    }
}

fn wrap_marks(text: &str, bold: bool, italic: bool) -> String {
    let t = escape_marks(text);
    if t.trim().is_empty() {
        return t;
    }
    // keep surrounding spaces outside the markers
    let lead = &t[..t.len() - t.trim_start().len()];
    let trail = &t[t.trim_end().len()..];
    let core = t.trim();
    match (bold, italic) {
        (true, true) => format!("{lead}***{core}***{trail}"),
        (true, false) => format!("{lead}**{core}**{trail}"),
        (false, true) => format!("{lead}*{core}*{trail}"),
        _ => t,
    }
}

fn merge_runs(runs: Vec<(String, bool, bool)>) -> String {
    // a scene-break line ("* * *", "#") stays as written so it is still read as a break
    let plain: String = runs.iter().map(|r| r.0.as_str()).collect();
    if crate::markup::is_scene_break(plain.trim()) && !plain.trim().is_empty() {
        return plain.trim().to_string();
    }
    // join runs of the same style first so markers don't break words apart
    let mut merged: Vec<(String, bool, bool)> = Vec::new();
    for r in runs {
        if let Some(last) = merged.last_mut() {
            if last.1 == r.1 && last.2 == r.2 {
                last.0.push_str(&r.0);
                continue;
            }
        }
        merged.push(r);
    }
    merged.into_iter().map(|(t, b, i)| wrap_marks(&t, b, i)).collect::<String>()
}

pub fn import_docx(path: &Path) -> Result<Imported, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut ar = zip::ZipArchive::new(file).map_err(|_| "That doesn't look like a Word document.".to_string())?;
    let mut budget = MAX_PARTS;
    let doc = zip_text(&mut ar, "word/document.xml", &mut budget)?.ok_or("The Word document has no text part.")?;
    let styles = zip_text(&mut ar, "word/styles.xml", &mut budget)?.unwrap_or_default();
    let core = zip_text(&mut ar, "docProps/core.xml", &mut budget)?.unwrap_or_default();
    let mut notes: Vec<String> = Vec::new();
    // note text by key: the footnote's w:id, or "e" and the endnote's
    let mut note_text: HashMap<String, String> = HashMap::new();
    for (part, prefix) in [("word/footnotes.xml", ""), ("word/endnotes.xml", "e")] {
        let xml = zip_text(&mut ar, part, &mut budget)?.unwrap_or_default();
        if let Ok(x) = roxmltree::Document::parse(&xml) {
            // separators carry a w:type; real notes don't
            for n in x.descendants().filter(|n| matches!(n.tag_name().name(), "footnote" | "endnote") && attr(n, "type").is_none()) {
                let paras = n.children().filter(|c| c.tag_name().name() == "p");
                let text: Vec<String> = paras.map(|p| merge_runs(docx_runs(p, &HashMap::new(), &mut Vec::new())).trim().to_string()).filter(|t| !t.is_empty()).collect();
                if let Some(id) = attr(&n, "id").filter(|_| !text.is_empty()) {
                    note_text.insert(format!("{prefix}{id}"), text.join(" "));
                }
            }
        }
    }
    let mut refs: Vec<String> = Vec::new();
    // style id -> (name, bold, italic)
    let mut style_names: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if let Ok(sx) = roxmltree::Document::parse(&styles) {
        for s in sx.descendants().filter(|n| n.tag_name().name() == "style") {
            if let Some(id) = attr(&s, "styleId") {
                let name = s.children().find(|c| c.tag_name().name() == "name").and_then(|c| attr(&c, "val")).unwrap_or(id);
                style_names.insert(id.to_string(), name.to_lowercase());
            }
        }
    }
    let (mut title, mut author) = (None, None);
    if let Ok(cx) = roxmltree::Document::parse(&core) {
        for n in cx.descendants() {
            match n.tag_name().name() {
                "title" => title = n.text().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()),
                "creator" => author = n.text().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()),
                _ => {}
            }
        }
    }
    let x = roxmltree::Document::parse(&doc).map_err(|e| format!("The Word document couldn't be read: {e}"))?;
    let body = x.descendants().find(|n| n.tag_name().name() == "body").ok_or("The Word document has no body.")?;
    struct P {
        text: String,
        level: Option<u8>,
        title_style: bool,
    }
    let mut ps: Vec<P> = Vec::new();
    let (mut toc_skipped, mut boxes) = (0, 0);
    // content controls holding a table-of-contents gallery, found once rather than per paragraph
    let mut toc_sdts = HashSet::new();
    for g in x.descendants().filter(|g| g.tag_name().name() == "docPartGallery" && attr(g, "val").map(|v| v.to_lowercase().contains("table of contents")).unwrap_or(false)) {
        for a in g.ancestors().filter(|a| a.tag_name().name() == "sdt") {
            if !toc_sdts.insert(a.id()) {
                break; // its outer ones are in already
            }
        }
    }
    boxes += body.descendants().filter(|n| n.tag_name().name() == "txbxContent" && !n.ancestors().any(|a| a.tag_name().name() == "Fallback")).count();
    // only top-level paragraphs: text boxes hold nested ones (and mc:Fallback repeats them)
    for p in body.descendants().filter(|n| n.tag_name().name() == "p" && !n.ancestors().skip(1).any(|a| a.tag_name().name() == "p")) {
        let in_toc_block = p.ancestors().any(|a| toc_sdts.contains(&a.id()));
        let mut toc_style = false;
        let mut level = None;
        let mut title_style = false;
        if let Some(ppr) = p.children().find(|c| c.tag_name().name() == "pPr") {
            if let Some(sid) = ppr.children().find(|c| c.tag_name().name() == "pStyle").and_then(|c| attr(&c, "val")) {
                let name = style_names.get(sid).cloned().unwrap_or_else(|| sid.to_lowercase());
                let compact = name.replace(' ', "");
                toc_style = compact.starts_with("toc");
                if compact == "title" {
                    title_style = true;
                } else if let Some(n) = compact.strip_prefix("heading") {
                    level = n.parse::<u8>().ok();
                }
            }
            if let Some(ol) = ppr.children().find(|c| c.tag_name().name() == "outlineLvl").and_then(|c| attr(&c, "val")) {
                if level.is_none() {
                    // outline level 9 (v = 8) means body text
                    level = ol.parse::<u8>().ok().and_then(|v| v.checked_add(1)).filter(|l| *l <= 8);
                }
            }
        }
        if in_toc_block || toc_style {
            toc_skipped += 1;
            continue;
        }
        let text = merge_runs(docx_runs(p, &note_text, &mut refs)).trim().to_string();
        if text.is_empty() {
            continue;
        }
        ps.push(P { text, level, title_style });
    }
    if toc_skipped > 0 {
        notes.push(format!("Skipped the table of contents ({toc_skipped} lines)."));
    }
    if boxes > 0 {
        notes.push(format!("Text boxes aren't imported: {boxes} skipped."));
    }
    // with real heading styles, don't also guess chapters from plain paragraphs
    let guess = !ps.iter().any(|p| p.level.is_some());
    let has_h1 = ps.iter().any(|p| p.level == Some(1));
    let chapter_level = if has_h1 { 1 } else { 2 };
    let mut paras = Vec::new();
    let mut heads = Vec::new();
    for (i, p) in ps.into_iter().enumerate() {
        if p.title_style && i < 5 {
            if title.is_none() {
                title = Some(crate::markup::strip(&p.text));
            }
            continue;
        }
        match p.level {
            Some(l) if l <= chapter_level => {
                let plain = crate::markup::strip(&p.text);
                let (kind, ttl) = classify_heading(&plain).unwrap_or((SectionKind::Chapter, plain.clone()));
                heads.push(Some((kind, ttl)));
                paras.push(plain);
            }
            Some(l) if l > chapter_level => {
                heads.push(None);
                paras.push(format!("## {}", crate::markup::strip(&p.text)));
            }
            _ => {
                heads.push(None);
                paras.push(p.text);
            }
        }
    }
    let (mut sections, split_notes) = split_into_chapters(paras, heads, guess);
    notes.extend(split_notes);
    let endnotes = refs.iter().filter(|r| r.starts_with('e')).count();
    if endnotes > 0 {
        notes.push(format!("Endnotes became footnotes ({endnotes})."));
    }
    if refs.iter().fold(0usize, |n, r| n.saturating_add(note_text[r].len())) > MAX_NOTES {
        return Err("That document has too many footnotes to import.".into());
    }
    let texts: Vec<String> = refs.iter().map(|r| note_text[r].clone()).collect();
    append_notes(&mut sections, &texts);
    Ok(Imported { title, author, sections, notes })
}

/// A Word paragraph's runs (text, bold, italic). A footnote or endnote reference with text in
/// `notes` becomes `[^n]`, n counting `refs`, which collects the notes' keys in order.
fn docx_runs(p: roxmltree::Node, notes: &HashMap<String, String>, refs: &mut Vec<String>) -> Vec<(String, bool, bool)> {
    let mut runs: Vec<(String, bool, bool)> = Vec::new();
    for r in p.descendants().filter(|n| n.tag_name().name() == "r") {
        if r.ancestors().any(|a| matches!(a.tag_name().name(), "del" | "moveFrom" | "txbxContent" | "Fallback")) {
            continue;
        }
        let rpr = r.children().find(|c| c.tag_name().name() == "rPr");
        if on(rpr.and_then(|x| x.children().find(|c| c.tag_name().name() == "vanish"))) {
            continue; // hidden text
        }
        let bold = on(rpr.and_then(|x| x.children().find(|c| c.tag_name().name() == "b")));
        let italic = on(rpr.and_then(|x| x.children().find(|c| c.tag_name().name() == "i")));
        let mut s = String::new();
        for c in r.children() {
            match c.tag_name().name() {
                "t" => s.push_str(c.text().unwrap_or("")),
                "tab" => s.push(' '),
                "br" | "cr" => s.push(' '),
                "noBreakHyphen" => s.push('-'),
                kind @ ("footnoteReference" | "endnoteReference") => {
                    let key = format!("{}{}", if kind == "endnoteReference" { "e" } else { "" }, attr(&c, "id").unwrap_or(""));
                    if notes.contains_key(&key) {
                        refs.push(key);
                        s.push_str(&format!("[^{}]", refs.len()));
                    }
                }
                _ => {}
            }
        }
        if !s.is_empty() {
            runs.push((s, bold, italic));
        }
    }
    runs
}

/// Add note `i` as a `[^i+1]: text` line at the end of the first section that refers to it.
fn append_notes(sections: &mut [Section], texts: &[String]) {
    // one pass over the text: the first section holding each `[^n]`
    let mut home: Vec<Option<usize>> = vec![None; texts.len()];
    for (si, s) in sections.iter().enumerate() {
        let b = s.text.as_bytes();
        let mut i = 0;
        while let Some(off) = s.text[i..].find("[^") {
            let start = i + off + 2;
            let mut end = start;
            while end < b.len() && b[end].is_ascii_digit() {
                end += 1;
            }
            if end > start && b[start] != b'0' && b.get(end) == Some(&b']') {
                if let Some(h) = s.text[start..end].parse::<usize>().ok().and_then(|n| home.get_mut(n - 1)) {
                    h.get_or_insert(si);
                }
            }
            i = start;
        }
    }
    for (i, text) in texts.iter().enumerate() {
        if let Some(si) = home[i] {
            sections[si].text.push_str(&format!("\n[^{}]: {text}", i + 1));
        }
    }
}

// ---------------------------------------------------------------------------------------------
// OpenDocument (.odt)
// ---------------------------------------------------------------------------------------------

pub fn import_odt(path: &Path) -> Result<Imported, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut ar = zip::ZipArchive::new(file).map_err(|_| "That doesn't look like an OpenDocument file.".to_string())?;
    let content = zip_text(&mut ar, "content.xml", &mut { MAX_PARTS })?.ok_or("The document has no text part.")?;
    let x = roxmltree::Document::parse(&content).map_err(|e| format!("The document couldn't be read: {e}"))?;
    // automatic styles: name -> (bold, italic)
    let mut fmt: std::collections::HashMap<String, (bool, bool)> = std::collections::HashMap::new();
    for s in x.descendants().filter(|n| n.tag_name().name() == "style") {
        if let Some(name) = attr(&s, "name") {
            if let Some(tp) = s.children().find(|c| c.tag_name().name() == "text-properties") {
                let bold = matches!(attr(&tp, "font-weight"), Some("bold") | Some("700") | Some("800") | Some("900"));
                let italic = matches!(attr(&tp, "font-style"), Some("italic") | Some("oblique"));
                fmt.insert(name.to_string(), (bold, italic));
            }
        }
    }
    let text_root = x.descendants().find(|n| n.tag_name().name() == "text" && n.parent().map(|p| p.tag_name().name() == "body").unwrap_or(false));
    let root = text_root.ok_or("The document has no text.")?;
    let mut paras = Vec::new();
    let mut heads = Vec::new();
    let mut toc_skipped = 0;
    let mut has_headings = false;
    let mut note_texts: Vec<String> = Vec::new();
    /// A paragraph's runs; a note becomes `[^n]` and its text goes in `texts` (n counts them).
    fn collect(n: roxmltree::Node, fmt: &HashMap<String, (bool, bool)>, style: (bool, bool), out: &mut Vec<(String, bool, bool)>, texts: &mut Vec<String>) {
        for c in n.children() {
            if c.is_text() {
                out.push((c.text().unwrap_or("").to_string(), style.0, style.1));
                continue;
            }
            match c.tag_name().name() {
                "span" => {
                    let st = attr(&c, "style-name").and_then(|s| fmt.get(s)).copied().unwrap_or(style);
                    collect(c, fmt, (st.0 || style.0, st.1 || style.1), out, texts);
                }
                "s" => out.push((" ".repeat(attr(&c, "c").and_then(|v| v.parse::<usize>().ok()).unwrap_or(1).min(64)), style.0, style.1)),
                "tab" | "line-break" => out.push((" ".into(), style.0, style.1)),
                "a" => collect(c, fmt, style, out, texts),
                "note" => {
                    let body = c.children().filter(|b| b.tag_name().name() == "note-body").flat_map(|b| b.children());
                    let text: Vec<String> = body
                        .filter(|p| matches!(p.tag_name().name(), "p" | "h"))
                        .map(|p| {
                            let mut runs = Vec::new();
                            collect(p, fmt, (false, false), &mut runs, &mut Vec::new());
                            merge_runs(runs).trim().to_string()
                        })
                        .filter(|t| !t.is_empty())
                        .collect();
                    if !text.is_empty() {
                        texts.push(text.join(" "));
                        out.push((format!("[^{}]", texts.len()), style.0, style.1));
                    }
                }
                _ => {}
            }
        }
    }
    for n in root.descendants().filter(|n| matches!(n.tag_name().name(), "p" | "h")) {
        if n.ancestors().skip(1).any(|a| matches!(a.tag_name().name(), "p" | "h" | "note")) {
            continue;
        }
        if n.ancestors().any(|a| matches!(a.tag_name().name(), "table-of-content" | "index-body")) {
            toc_skipped += 1;
            continue;
        }
        let base = attr(&n, "style-name").and_then(|s| fmt.get(s)).copied().unwrap_or((false, false));
        let mut runs = Vec::new();
        collect(n, &fmt, base, &mut runs, &mut note_texts);
        let text = merge_runs(runs).trim().to_string();
        if text.is_empty() {
            continue;
        }
        if n.tag_name().name() == "h" {
            has_headings = true;
            let level: u8 = attr(&n, "outline-level").and_then(|v| v.parse().ok()).unwrap_or(1);
            let plain = crate::markup::strip(&text);
            if level <= 1 {
                let (kind, ttl) = classify_heading(&plain).unwrap_or((SectionKind::Chapter, plain.clone()));
                heads.push(Some((kind, ttl)));
                paras.push(plain);
            } else {
                heads.push(None);
                paras.push(format!("## {plain}"));
            }
        } else {
            heads.push(None);
            paras.push(text);
        }
    }
    let mut notes = Vec::new();
    if toc_skipped > 0 {
        notes.push(format!("Skipped the table of contents ({toc_skipped} lines)."));
    }
    let endnotes = root.descendants().filter(|n| n.tag_name().name() == "note" && attr(n, "note-class") == Some("endnote")).count();
    if endnotes > 0 {
        notes.push(format!("Endnotes became footnotes ({endnotes})."));
    }
    let (mut sections, split_notes) = split_into_chapters(paras, heads, !has_headings);
    notes.extend(split_notes);
    append_notes(&mut sections, &note_texts);
    Ok(Imported { title: None, author: None, sections, notes })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn headings() {
        assert_eq!(classify_heading("Chapter 3: The Storm").map(|h| h.1), Some("The Storm".into()));
        assert!(classify_heading("CHAPTER SEVEN").is_some());
        assert!(classify_heading("Prologue").map(|h| h.0 == SectionKind::Prologue).unwrap_or(false));
        assert!(classify_heading("Chapter and verse were quoted at length by her.").is_none());
        assert!(classify_heading("XII").is_some());
    }
    #[test]
    fn docx_import() {
        use std::io::Write;
        let dir = std::env::temp_dir().join("bookbinder-selftest");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sample.docx");
        let mut zw = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let o = zip::write::SimpleFileOptions::default();
        zw.start_file("word/document.xml", o).unwrap();
        let w = "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"";
        let p = |style: &str, runs: &str| format!("<w:p><w:pPr><w:pStyle w:val=\"{style}\"/></w:pPr>{runs}</w:p>");
        let r = |t: &str, i: bool| format!("<w:r>{}<w:t xml:space=\"preserve\">{t}</w:t></w:r>", if i { "<w:rPr><w:i/></w:rPr>" } else { "" });
        let body = [
            p("Heading1", &r("Chapter 1: Arrival", false)),
            p("Normal", &(r("It was ", false) + &r("very", true) + &r(" late.", false))),
            p("Normal", &r("* * *", false)),
            p("Heading1", &r("Departure", false)),
            p("Normal", &r("Morning came.", false)),
        ]
        .join("");
        zw.write_all(format!("<w:document {w}><w:body>{body}</w:body></w:document>").as_bytes()).unwrap();
        zw.finish().unwrap();
        let r = import_file(&path).unwrap();
        assert_eq!(r.sections.len(), 2);
        assert_eq!(r.sections[0].title, "Arrival");
        assert_eq!(r.sections[0].text, "It was *very* late.\n* * *");
        assert_eq!(r.sections[1].title, "Departure");
    }

    fn heading_of(l: &str) -> Option<String> {
        classify_heading(l).map(|h| h.1)
    }

    #[test]
    fn prose_is_not_a_heading() {
        for l in ["Part I think he's right.", "Book two was better.", "Chapter 11 bankruptcy was the only option.", "Did", "Mild", "Civil", "I", "Mix", "Second.", "BOO\u{212A} two"] {
            assert!(classify_heading(l).is_none(), "{l}");
        }
        assert_eq!(heading_of("XIV"), Some(String::new()));
        assert_eq!(heading_of("7."), Some(String::new()));
        assert_eq!(heading_of("Seven"), Some(String::new()));
        assert_eq!(heading_of("Chapter 3: The Storm"), Some("The Storm".into()));
        assert_eq!(heading_of("Chapter 3 The Storm"), Some("The Storm".into()));
        assert_eq!(heading_of("Part I"), Some(String::new()));
        assert_eq!(heading_of("Chapter Twenty-One"), Some(String::new()));
        assert_eq!(heading_of("Chapter xii - Home"), Some("Home".into()));
        assert_eq!(heading_of("Prologue: Dust"), Some("Dust".into()));
        assert!(classify_heading("Prologues are dull").is_none());
        assert_eq!(roman_value("MCMXCIV"), Some(1994));
        assert_eq!(roman_value("IIII"), None);
    }

    #[test]
    fn decodes_bom_and_utf16() {
        assert_eq!(decode_text(b"\xEF\xBB\xBFChapter 1".to_vec()), ("Chapter 1".into(), false));
        let le: Vec<u8> = [0xFF, 0xFE].into_iter().chain("Héllo".encode_utf16().flat_map(|u| u.to_le_bytes())).collect();
        assert_eq!(decode_text(le), ("Héllo".into(), false));
        let be: Vec<u8> = [0xFE, 0xFF].into_iter().chain("Héllo".encode_utf16().flat_map(|u| u.to_be_bytes())).collect();
        assert_eq!(decode_text(be), ("Héllo".into(), false));
        assert_eq!(decode_text(vec![b'c', b'a', b'f', 0xE9]), ("café".into(), true));
        // end to end: a UTF-16 LE .md file gets its heading and a BOM'd .txt works too
        let dir = std::env::temp_dir().join("bookbinder-import-text");
        std::fs::create_dir_all(&dir).unwrap();
        let md: Vec<u8> = [0xFF, 0xFE].into_iter().chain("# One\n\nHello there.\n".encode_utf16().flat_map(|u| u.to_le_bytes())).collect();
        std::fs::write(dir.join("u16.md"), md).unwrap();
        let r = import_file(&dir.join("u16.md")).unwrap();
        assert_eq!((r.sections.len(), r.sections[0].text.as_str()), (1, "Hello there."));
        std::fs::write(dir.join("bom.txt"), "\u{feff}Chapter 1\n\nHi there.\n\nChapter 2\n\nBye now.\n\nMore.").unwrap();
        let r = import_file(&dir.join("bom.txt")).unwrap();
        assert_eq!(r.sections.len(), 2);
    }

    #[test]
    fn markdown_lists_and_bold() {
        let r = import_markdown("# Book\n\n## One\n\nIntro line\nsecond line.\n- apple\n* pear\n+ plum\n1. first\n2) second\n\nA __bold__ move and snake__case.\n\n* * *\n\nEnd.");
        let t = &r.sections[0].text;
        assert_eq!(t, "Intro line second line.\n• apple\n• pear\n• plum\n1. first\n2. second\nA **bold** move and snake__case.\n* * *\nEnd.");
    }

    #[test]
    fn short_preface_becomes_epigraph_with_note() {
        let r = import_text("Not all who wander are lost.\n\nChapter 1\n\nIt began.\n\nChapter 2\n\nIt went on.\n\nThe end.");
        assert_eq!(r.sections[0].kind, SectionKind::Epigraph);
        assert_eq!(r.sections[0].text, "Not all who wander are lost.");
        assert!(r.notes.iter().any(|n| n.contains("6 words") && n.contains("epigraph")), "{:?}", r.notes);
    }

    const W: &str = "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:mc=\"http://schemas.openxmlformats.org/markup-compatibility/2006\"";

    fn zip_file(name: &str, parts: &[(&str, &str)]) -> std::path::PathBuf {
        use std::io::Write;
        let dir = std::env::temp_dir().join("bookbinder-import-zip");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        let mut zw = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        for (n, c) in parts {
            zw.start_file(*n, zip::write::SimpleFileOptions::default()).unwrap();
            zw.write_all(c.as_bytes()).unwrap();
        }
        zw.finish().unwrap();
        path
    }

    fn wp(style: &str, text: &str) -> String {
        let st = if style.is_empty() { String::new() } else { format!("<w:pPr><w:pStyle w:val=\"{style}\"/></w:pPr>") };
        format!("<w:p>{st}<w:r><w:t>{text}</w:t></w:r></w:p>")
    }

    #[test]
    fn docx_toc_textbox_hidden_and_notes() {
        let boxed = "<w:p><w:r><w:t>Before box. </w:t></w:r><w:r><mc:AlternateContent><mc:Choice><w:txbxContent><w:p><w:r><w:t>BOXED</w:t></w:r></w:p></w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent><w:p><w:r><w:t>BOXED</w:t></w:r></w:p></w:txbxContent></mc:Fallback></mc:AlternateContent></w:r><w:r><w:t>After box.</w:t></w:r></w:p>";
        let hidden = "<w:p><w:r><w:t>Seen </w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>HIDDEN </w:t></w:r><w:r><w:rPr><w:vanish w:val=\"0\"/></w:rPr><w:t>shown</w:t></w:r><w:moveFrom><w:r><w:t> MOVED</w:t></w:r></w:moveFrom></w:p>";
        let sdt = format!("<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val=\"Table of Contents\"/></w:docPartObj></w:sdtPr><w:sdtContent>{}</w:sdtContent></w:sdt>", wp("", "Chapter 1 ... 3"));
        let body = [sdt, wp("TOC1", "Chapter 1: Start\t3"), wp("Heading1", "Chapter 1: Start"), boxed.to_string(), hidden.to_string(), wp("", "Part I think he's right.")].join("");
        let doc = format!("<w:document {W}><w:body>{body}</w:body></w:document>");
        let notes = format!("<w:footnotes {W}><w:footnote w:type=\"separator\"><w:p><w:r><w:t>-</w:t></w:r></w:p></w:footnote><w:footnote w:id=\"2\"><w:p><w:r><w:t>A note</w:t></w:r></w:p></w:footnote></w:footnotes>");
        let path = zip_file("toc.docx", &[("word/document.xml", &doc), ("word/footnotes.xml", &notes)]);
        let r = import_file(&path).unwrap();
        assert_eq!(r.sections.len(), 1, "{:?}", r.sections.iter().map(|s| &s.title).collect::<Vec<_>>());
        assert_eq!(r.sections[0].title, "Start");
        assert_eq!(r.sections[0].text, "Before box. After box.\nSeen shown\nPart I think he's right.");
        let n = r.notes.join("|");
        assert!(!n.contains("Footnotes") && n.contains("table of contents") && n.contains("Text boxes"), "{n}");
    }

    #[test]
    fn docx_notes_become_footnotes() {
        let fref = |id: &str| format!("<w:r><w:rPr><w:rStyle w:val=\"FootnoteReference\"/></w:rPr><w:footnoteReference w:id=\"{id}\"/></w:r>");
        let eref = "<w:r><w:endnoteReference w:id=\"2\"/></w:r>";
        let body = [
            wp("Heading1", "One"),
            format!("<w:p><w:r><w:t>First</w:t></w:r>{}<w:r><w:t xml:space=\"preserve\"> and *star*.</w:t></w:r></w:p>", fref("2")),
            wp("Heading1", "Two"),
            format!("<w:p><w:r><w:t>Second</w:t></w:r>{eref}{}</w:p>", fref("9")),
        ]
        .join("");
        let doc = format!("<w:document {W}><w:body>{body}</w:body></w:document>");
        let foot = format!("<w:footnotes {W}><w:footnote w:type=\"separator\" w:id=\"0\"><w:p><w:r><w:t>-</w:t></w:r></w:p></w:footnote><w:footnote w:id=\"2\"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space=\"preserve\"> A </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>note</w:t></w:r></w:p><w:p><w:r><w:t>Two paras.</w:t></w:r></w:p></w:footnote></w:footnotes>");
        let end = format!("<w:endnotes {W}><w:endnote w:id=\"2\"><w:p><w:r><w:t>An endnote.</w:t></w:r></w:p></w:endnote></w:endnotes>");
        let path = zip_file("notes.docx", &[("word/document.xml", &doc), ("word/footnotes.xml", &foot), ("word/endnotes.xml", &end)]);
        let r = import_file(&path).unwrap();
        assert_eq!(r.sections[0].text, "First[^1] and \\*star\\*.\n[^1]: A *note* Two paras.");
        // footnote 9 has no text, so no reference is left for it
        assert_eq!(r.sections[1].text, "Second[^2]\n[^2]: An endnote.");
        assert!(r.notes.iter().any(|n| n == "Endnotes became footnotes (1)."), "{:?}", r.notes);
        let p = crate::markup::parse_section(&r.sections[0].text, false);
        assert!(p.warnings.is_empty() && p.notes.len() == 1, "{:?}", p.warnings);
    }

    #[test]
    fn markdown_keeps_tables_and_notes() {
        let r = import_markdown("# One\n\nText with a note[^a] and\na soft break.\n| A | B |\n|---|--:|\n| __x__ | 2 |\n[^a]: The *note*.\nAfter.");
        assert_eq!(r.sections[0].text, "Text with a note[^a] and a soft break.\n| A | B |\n|---|--:|\n| **x** | 2 |\n[^a]: The *note*.\nAfter.");
    }

    #[test]
    fn docx_outline_level_overflow_and_size_cap() {
        let p = "<w:p><w:pPr><w:outlineLvl w:val=\"255\"/></w:pPr><w:r><w:t>Plain</w:t></w:r></w:p>";
        let doc = format!("<w:document {W}><w:body>{p}</w:body></w:document>");
        let r = import_file(&zip_file("lvl.docx", &[("word/document.xml", &doc)])).unwrap();
        assert_eq!(r.sections[0].text, "Plain");
        let big = format!("<w:document {W}><w:body>{}</w:body></w:document>", " ".repeat(65 * 1024 * 1024));
        let e = import_file(&zip_file("bomb.docx", &[("word/document.xml", &big)])).err().unwrap();
        assert!(e.contains("too large"), "{e}");
    }

    #[test]
    fn odt_toc_spaces_and_headings() {
        let ns = "xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\" xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\"";
        let c = format!(
            "<office:document-content {ns}><office:body><office:text>\
             <text:table-of-content><text:index-body><text:p>Chapter 1 Start 3</text:p></text:index-body></text:table-of-content>\
             <text:h text:outline-level=\"1\">Chapter 1: Start</text:h>\
             <text:p>a<text:s text:c=\"99999999999\"/>b<text:note><text:note-body><text:p>fn</text:p></text:note-body></text:note></text:p>\
             <text:p>Part I think he's right.</text:p>\
             </office:text></office:body></office:document-content>"
        );
        let r = import_file(&zip_file("toc.odt", &[("content.xml", &c)])).unwrap();
        assert_eq!(r.sections.len(), 1);
        let t = &r.sections[0].text;
        assert!(t.starts_with("a ") && t.contains("b[^1]\nPart I think") && t.ends_with("\n[^1]: fn"), "{t}");
        assert!(t.len() < 200);
        assert!(r.notes.iter().all(|n| !n.contains("Footnotes")), "{:?}", r.notes);
    }

    #[test]
    fn docx_note_copies_and_parts_are_capped() {
        // one 1 MB footnote referred to 65 times would copy 65 MB of note text
        let refs = "<w:r><w:footnoteReference w:id=\"1\"/></w:r>".repeat(65);
        let doc = format!("<w:document {W}><w:body><w:p><w:r><w:t>x</w:t></w:r>{refs}</w:p></w:body></w:document>");
        let foot = format!("<w:footnotes {W}><w:footnote w:id=\"1\"><w:p><w:r><w:t>{}</w:t></w:r></w:p></w:footnote></w:footnotes>", "n".repeat(1024 * 1024));
        let e = import_file(&zip_file("refs.docx", &[("word/document.xml", &doc), ("word/footnotes.xml", &foot)])).err().unwrap();
        assert!(e.contains("too many footnotes"), "{e}");
        // the parts of one import share a budget
        let path = zip_file("budget.docx", &[("a", &"a".repeat(20)), ("b", &"b".repeat(20))]);
        let mut ar = zip::ZipArchive::new(std::fs::File::open(path).unwrap()).unwrap();
        let mut budget = 30;
        assert_eq!(zip_text(&mut ar, "a", &mut budget).unwrap().as_deref(), Some("a".repeat(20).as_str()));
        assert!(zip_text(&mut ar, "b", &mut budget).is_err());
    }

    #[test]
    fn notes_go_to_the_first_section_naming_them() {
        let mut ss: Vec<Section> = ["a[^01] [^2", "b[^10] [^1] x[^2]", "[^2]"]
            .iter()
            .map(|t| Section { text: t.to_string(), ..Section::new(SectionKind::Chapter, "") })
            .collect();
        let texts: Vec<String> = (1..=11).map(|n| format!("n{n}")).collect();
        append_notes(&mut ss, &texts);
        assert_eq!(ss[0].text, "a[^01] [^2");
        assert_eq!(ss[1].text, "b[^10] [^1] x[^2]\n[^1]: n1\n[^2]: n2\n[^10]: n10");
        assert_eq!(ss[2].text, "[^2]");
    }

    #[test]
    fn text_split() {
        let t = "Chapter 1\n\nIt was a dark night.\nThe rain fell.\n\nShe waited.\n\nChapter 2\n\nMorning came.";
        let r = import_text(t);
        assert_eq!(r.sections.len(), 2);
        assert_eq!(r.sections[0].text, "It was a dark night. The rain fell.\nShe waited.");
    }
}
