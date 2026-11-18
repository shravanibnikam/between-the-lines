//! The light markup used in the editor, turned into blocks of styled text.
//!
//! One paragraph per line. `*italic*` or `_italic_`, `**bold**`, a line holding only
//! `***`, `* * *`, `#` or `~` is a scene break, `> ` starts a block quote,
//! `## ` and `### ` start subheadings, and a line `![caption](name.png)` is an image from the
//! book's `images/` folder (the name is checked where the file is read, see `image.rs`).
//!
//! Print and ebooks (`parse_section`) also read tables and footnotes. Consecutive lines starting
//! with `|` are a table; a row like `|---|:--:|---:|` under the first makes it a header and sets
//! each column left, centred or right. `[^label]` calls a footnote and a line `[^label]: text`
//! anywhere in the section defines it.

use crate::model::HAlign;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Span {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    /// A footnote reference: the note's number (the text is the number too).
    pub note: Option<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Block {
    Para(Vec<Span>),
    Quote(Vec<Span>),
    Heading(u8, Vec<Span>),
    SceneBreak,
    Image { src: String, caption: Vec<Span> },
    /// Header cells (empty when there is none), body rows and one alignment per column.
    Table { header: Vec<Vec<Span>>, rows: Vec<Vec<Vec<Span>>>, align: Vec<HAlign> },
}

/// An image line `![caption](name.png)`: its caption markup and file name. Backslashes are
/// dropped from the name (the editor escapes `_` when it saves; names never hold `\`).
pub fn image_line(line: &str) -> Option<(&str, String)> {
    let (caption, src) = line.strip_prefix("![")?.strip_suffix(')')?.rsplit_once("](")?;
    Some((caption, src.trim().replace('\\', "")))
}

pub fn is_scene_break(line: &str) -> bool {
    let t: String = line.chars().filter(|c| !c.is_whitespace()).collect();
    matches!(t.as_str(), "***" | "#" | "~" | "⁂" | "---" | "* * *" | "***." | "◆" | "§")
        || (t.len() >= 3 && t.chars().all(|c| c == '*'))
}

pub fn parse_blocks(text: &str, smart: bool) -> Vec<Block> {
    let mut out = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if is_scene_break(line) {
            out.push(Block::SceneBreak);
        } else if let Some((caption, src)) = image_line(line) {
            out.push(Block::Image { src, caption: parse_inline(caption, smart) });
        } else if let Some(rest) = line.strip_prefix("### ") {
            out.push(Block::Heading(3, parse_inline(rest, smart)));
        } else if let Some(rest) = line.strip_prefix("## ") {
            out.push(Block::Heading(2, parse_inline(rest, smart)));
        } else if let Some(rest) = line.strip_prefix("# ") {
            out.push(Block::Heading(2, parse_inline(rest, smart)));
        } else if let Some(rest) = line.strip_prefix('>') {
            out.push(Block::Quote(parse_inline(rest.trim_start(), smart)));
        } else {
            out.push(Block::Para(parse_inline(line, smart)));
        }
    }
    out
}

/// A section's text for print and ebooks.
pub struct Parsed {
    pub blocks: Vec<Block>,
    /// Footnote texts by number (note 1 first).
    pub notes: Vec<Vec<Span>>,
    /// References without a definition, and definitions never referenced.
    pub warnings: Vec<String>,
}

/// `parse_blocks` plus tables and footnotes, numbered 1, 2, 3… in order of first reference.
/// The editor reads `parse_blocks`, so table and note lines stay plain paragraphs there.
pub fn parse_section(text: &str, smart: bool) -> Parsed {
    let mut defs: Vec<(String, &str)> = Vec::new();
    let mut blocks = Vec::new();
    let mut lines = String::new();
    let mut table: Vec<&str> = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if let Some(d) = note_def(line) {
            defs.push(d);
        } else if line.starts_with('|') {
            if table.is_empty() {
                blocks.extend(parse_blocks(&std::mem::take(&mut lines), smart));
            }
            table.push(line);
        } else {
            if !table.is_empty() {
                blocks.push(parse_table(&std::mem::take(&mut table), smart));
            }
            lines.push_str(line);
            lines.push('\n');
        }
    }
    if table.is_empty() {
        blocks.extend(parse_blocks(&lines, smart));
    } else {
        blocks.push(parse_table(&table, smart));
    }
    let defined: Vec<&str> = defs.iter().map(|d| d.0.as_str()).collect();
    let (mut order, mut missing) = (Vec::new(), Vec::new());
    for b in blocks.iter_mut() {
        let cells: Vec<&mut Vec<Span>> = match b {
            Block::Para(s) | Block::Quote(s) => vec![s],
            Block::Table { header, rows, .. } => header.iter_mut().chain(rows.iter_mut().flatten()).collect(),
            _ => Vec::new(),
        };
        for spans in cells {
            *spans = note_refs(std::mem::take(spans), &defined, &mut order, &mut missing);
        }
    }
    let mut warnings: Vec<String> = missing.iter().map(|l| format!("Footnote [^{l}] has no definition, so it prints as typed.")).collect();
    let mut unused: Vec<&str> = defined.iter().copied().filter(|l| !order.iter().any(|o| o.as_str() == *l)).collect();
    unused.dedup();
    warnings.extend(unused.iter().map(|l| format!("Footnote [^{l}] is defined but never referenced.")));
    let text_of = |l: &String| defs.iter().find(|d| d.0 == *l).map(|d| d.1).unwrap_or("");
    let notes = order.iter().map(|l| parse_inline(text_of(l), smart)).collect();
    Parsed { blocks, notes, warnings }
}

/// A footnote definition line `[^label]: text`: its label (without escapes) and text.
pub fn note_def(line: &str) -> Option<(String, &str)> {
    let (label, text) = line.trim().strip_prefix("[^")?.split_once("]:")?;
    let label = label.replace('\\', "");
    (!label.is_empty() && !label.contains(char::is_whitespace)).then(|| (label, text.trim()))
}

/// Split `[^label]` references to defined notes out of spans, numbering labels in `order`.
/// Undefined labels stay as typed and are listed in `missing`.
fn note_refs(spans: Vec<Span>, defined: &[&str], order: &mut Vec<String>, missing: &mut Vec<String>) -> Vec<Span> {
    let mut out = Vec::new();
    for sp in spans {
        let mut lit = String::new();
        let mut rest = sp.text.as_str();
        while let Some(i) = rest.find("[^") {
            let after = &rest[i + 2..];
            let label = after.find(']').map(|j| &after[..j]).filter(|l| !l.is_empty() && !l.contains(char::is_whitespace));
            match label {
                Some(l) if defined.contains(&l) => {
                    lit.push_str(&rest[..i]);
                    if !lit.is_empty() {
                        out.push(Span { text: std::mem::take(&mut lit), ..sp.clone() });
                    }
                    let n = match order.iter().position(|o| o == l) {
                        Some(k) => k + 1,
                        None => {
                            order.push(l.to_string());
                            order.len()
                        }
                    } as u32;
                    out.push(Span { text: n.to_string(), note: Some(n), ..sp.clone() });
                    rest = &after[l.len() + 1..];
                }
                _ => {
                    if let Some(l) = label.filter(|l| !missing.iter().any(|m| m == l)) {
                        missing.push(l.to_string());
                    }
                    lit.push_str(&rest[..i + 2]);
                    rest = after;
                }
            }
        }
        lit.push_str(rest);
        if !lit.is_empty() {
            out.push(Span { text: lit, ..sp });
        }
    }
    out
}

/// A table from its `|` lines; ragged rows are padded to the widest.
fn parse_table(lines: &[&str], smart: bool) -> Block {
    let mut rows: Vec<Vec<String>> = lines.iter().map(|l| table_cells(l)).collect();
    let sep: Option<Vec<HAlign>> = rows.get(1).and_then(|r| r.iter().map(|c| column_align(c)).collect());
    let has_header = sep.is_some();
    let mut align = sep.unwrap_or_default();
    if has_header {
        rows.remove(1);
    }
    let n = rows.iter().map(Vec::len).max().unwrap_or(0).max(align.len());
    align.resize(n, HAlign::Left);
    let mut cells = rows.into_iter().map(|mut r| {
        r.resize(n, String::new());
        r.iter().map(|c| parse_inline(c, smart)).collect::<Vec<_>>()
    });
    let header = if has_header { cells.next().unwrap_or_default() } else { Vec::new() };
    Block::Table { header, rows: cells.collect(), align }
}

/// The cells of a `| a | b |` row; `\|` stays inside a cell.
fn table_cells(line: &str) -> Vec<String> {
    let inner = line.strip_prefix('|').unwrap_or(line);
    let inner = if inner.ends_with('|') && !inner.ends_with("\\|") { &inner[..inner.len() - 1] } else { inner };
    let mut cells = vec![String::new()];
    let mut escaped = false;
    for c in inner.chars() {
        if c == '|' && !escaped {
            cells.push(String::new());
        } else {
            cells.last_mut().expect("a cell").push(c);
        }
        escaped = c == '\\' && !escaped;
    }
    cells.iter().map(|c| c.trim().to_string()).collect()
}

/// A separator cell (`---`, `:--`, `:-:`, `--:`) and the alignment it sets.
fn column_align(cell: &str) -> Option<HAlign> {
    let dashes = cell.strip_prefix(':').unwrap_or(cell);
    let dashes = dashes.strip_suffix(':').unwrap_or(dashes);
    if dashes.is_empty() || !dashes.chars().all(|c| c == '-') {
        return None;
    }
    Some(match (cell.starts_with(':'), cell.ends_with(':')) {
        (true, true) => HAlign::Center,
        (false, true) => HAlign::Right,
        _ => HAlign::Left,
    })
}

/// Split inline markup into spans.
pub fn parse_inline(s: &str, smart: bool) -> Vec<Span> {
    let s = if smart { smarten(s) } else { s.to_string() };
    let chars: Vec<char> = s.chars().collect();
    let mut spans: Vec<Span> = Vec::new();
    let (mut bold, mut italic) = (false, false);
    let mut cur = String::new();
    let mut i = 0;
    let push = |cur: &mut String, spans: &mut Vec<Span>, bold: bool, italic: bool| {
        if !cur.is_empty() {
            spans.push(Span { text: std::mem::take(cur), bold, italic, note: None });
        }
    };
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && i + 1 < chars.len() {
            cur.push(chars[i + 1]);
            i += 2;
            continue;
        }
        if c == '*' && i + 1 < chars.len() && chars[i + 1] == '*' {
            if bold || has_closing(&chars, i + 2, "**") {
                push(&mut cur, &mut spans, bold, italic);
                bold = !bold;
                i += 2;
                continue;
            }
        } else if c == '*' || c == '_' {
            let marker = if c == '*' { "*" } else { "_" };
            // underscores inside words (snake_case) stay literal
            let inside_word = c == '_'
                && i > 0
                && chars[i - 1].is_alphanumeric()
                && i + 1 < chars.len()
                && chars[i + 1].is_alphanumeric();
            if !inside_word && (italic || has_closing(&chars, i + 1, marker)) {
                push(&mut cur, &mut spans, bold, italic);
                italic = !italic;
                i += 1;
                continue;
            }
        }
        cur.push(c);
        i += 1;
    }
    push(&mut cur, &mut spans, bold, italic);
    spans
}

fn has_closing(chars: &[char], from: usize, marker: &str) -> bool {
    let m: Vec<char> = marker.chars().collect();
    let mut i = from;
    while i + m.len() <= chars.len() {
        if chars[i..i + m.len()] == m[..] {
            // `*` must not be the start of `**`
            if m.len() == 1 && m[0] == '*' && i + 1 < chars.len() && chars[i + 1] == '*' {
                i += 2;
                continue;
            }
            // `_` inside a word (max_value) can't close
            let alnum = |k: Option<&char>| k.is_some_and(|c| c.is_alphanumeric());
            if m[0] == '_' && i > 0 && alnum(chars.get(i - 1)) && alnum(chars.get(i + 1)) {
                i += 1;
                continue;
            }
            return i > from;
        }
        i += 1;
    }
    false
}

/// Curly quotes, apostrophes, dashes and ellipses.
pub fn smarten(s: &str) -> String {
    let s = s.replace("---", "—").replace("--", "—").replace("...", "…");
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    for (i, &c) in chars.iter().enumerate() {
        // emphasis markers are transparent: `*"Hi"*` opens with the char before the `*`
        let prev = chars[..i].iter().rev().find(|p| **p != '*' && **p != '_').copied();
        let opening = match prev {
            None => true,
            Some(p) => p.is_whitespace() || "([{—–-/".contains(p) || p == '“' || p == '‘',
        };
        match c {
            '"' => out.push(if opening { '“' } else { '”' }),
            '\'' => out.push(if opening && chars.get(i + 1).map(|n| !n.is_numeric()).unwrap_or(false) { '‘' } else { '’' }),
            _ => out.push(c),
        }
    }
    out
}

/// Plain text of spans (for contents lists, running heads and searching).
pub fn plain(spans: &[Span]) -> String {
    spans.iter().map(|s| s.text.as_str()).collect()
}

/// Remove markup characters from a line (for word counts and titles).
pub fn strip(s: &str) -> String {
    plain(&parse_inline(s, false))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inline() {
        let v = parse_inline("a *b* **c** d_e_f", false);
        assert_eq!(plain(&v), "a b c d_e_f");
        assert!(v[1].italic && !v[1].bold);
        assert!(v[3].bold);
    }
    #[test]
    fn breaks() {
        assert!(is_scene_break("* * *"));
        assert!(is_scene_break("#"));
        assert!(!is_scene_break("# Heading"));
    }
    #[test]
    fn images() {
        let b = parse_blocks("![A *fine* view](my\\_pic.png)\n![](a.jpg)\n!(not.png)\nsee ![x](y.png) here", false);
        assert_eq!(b[0], Block::Image { src: "my_pic.png".into(), caption: parse_inline("A *fine* view", false) });
        assert_eq!(b[1], Block::Image { src: "a.jpg".into(), caption: vec![] });
        assert!(matches!(b[2], Block::Para(_)) && matches!(b[3], Block::Para(_)));
        assert_eq!(image_line("![a](b](c.png)"), Some(("a](b", "c.png".into())));
        // print and ebooks see images too; a note call in a caption stays as typed
        let p = parse_section("![See[^a]](p.png)\n[^a]: A.", false);
        assert!(matches!(&p.blocks[..], [Block::Image { caption, .. }] if plain(caption) == "See[^a]"), "{:?}", p.blocks);
        assert!(p.notes.is_empty() && p.warnings.len() == 1, "{:?}", p.warnings);
    }
    #[test]
    fn quotes() {
        assert_eq!(smarten("\"Hi,\" she said. It's"), "“Hi,” she said. It’s");
        assert_eq!(plain(&parse_inline("*\"Hi\"* and **\"Yo\"**", true)), "“Hi” and “Yo”");
        assert_eq!(plain(&parse_inline("_'Tis_ so", true)), "‘Tis so");
        assert_eq!(smarten("say \"*no*\""), "say “*no*”");
    }
    #[test]
    fn underscore_inside_word_never_closes() {
        let v = parse_inline("the variable _count and max_value", false);
        assert_eq!(plain(&v), "the variable _count and max_value");
        assert!(v.iter().all(|s| !s.italic), "{v:?}");
        assert!(parse_inline("an _italic_ word", false)[1].italic);
    }
    #[test]
    fn tables() {
        let p = parse_section("Before.\n| A | *B* | C |\n|:--|:-:|--:|\n| 1 | 2 |\n| x \\| y | z | w | extra |\nAfter.", false);
        assert_eq!(p.blocks.len(), 3);
        let Block::Table { header, rows, align } = &p.blocks[1] else { panic!("{:?}", p.blocks) };
        assert_eq!(align, &[HAlign::Left, HAlign::Center, HAlign::Right, HAlign::Left]);
        assert_eq!((header.len(), plain(&header[1]), header[1][0].italic), (4, "B".to_string(), true));
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.len() == 4));
        assert_eq!(plain(&rows[1][0]), "x | y");
        // no separator row: no header; and `|---|` is not a scene break
        let p = parse_section("| a | b |\n| c | d |", false);
        assert!(matches!(&p.blocks[..], [Block::Table { header, rows, .. }] if header.is_empty() && rows.len() == 2));
        assert!(!is_scene_break("|---|"));
        // the editor still sees plain paragraphs
        assert!(parse_blocks("| a | b |\n|---|---|\n[^1]: n", false).iter().all(|b| matches!(b, Block::Para(_))));
    }
    #[test]
    fn footnotes() {
        let t = "One[^b] and two[^a], one again[^b].\n[^a]: Note A.\n> Quoted[^c] and [^missing] and [^not a label].\n[^b]: Note *B*.\n[^c]: C.\n[^unused]: Never.\n| cell[^my\\_x] |\n[^my\\_x]: In a cell.";
        let p = parse_section(t, false);
        assert_eq!(p.blocks.len(), 3, "definitions leave the flow: {:?}", p.blocks);
        let Block::Para(s) = &p.blocks[0] else { panic!() };
        assert_eq!(s.iter().filter_map(|x| x.note).collect::<Vec<_>>(), [1, 2, 1]);
        assert_eq!(plain(s), "One1 and two2, one again1.");
        assert_eq!(p.notes.len(), 4);
        assert_eq!((plain(&p.notes[0]), p.notes[0][1].italic), ("Note B.".to_string(), true));
        assert_eq!(plain(&p.notes[2]), "C.");
        assert_eq!(plain(&p.notes[3]), "In a cell.");
        let Block::Quote(q) = &p.blocks[1] else { panic!() };
        assert!(plain(q).contains("[^missing] and [^not a label]"));
        assert_eq!(p.warnings.len(), 2, "{:?}", p.warnings);
        assert!(p.warnings[0].contains("[^missing]") && p.warnings[1].contains("[^unused]"));
    }
}
