//! The command layer behind the studio: one `Api::call(cmd, json args) -> json` entry point
//! that the Tauri shell and the dev server both use. Every failure comes back as a string.

use crate::layout::{self, Doc, Opts};
use crate::model::*;
use crate::{epub, fonts, image, import, markup, ornaments, preflight, sample, spell, storage, svg, themes};
use std::io::Read as _;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

type Res<T> = Result<T, String>;

const CREAM: &str = "#fbf6e8";
const WHITE_PAPER: &str = "#fffffd";

/// A cached layout: its key, the pages, and the paper colour of the book that made it.
type Cached = (String, Arc<Doc>, &'static str);

/// How many recent layouts `page_svg` can still draw from.
const KEEP_DOCS: usize = 8;

#[derive(Default)]
pub struct Api {
    /// Recent layouts, least recently used first.
    docs: Mutex<Vec<Cached>>,
    covers: Mutex<HashMap<String, (u64, String)>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn arg<T: DeserializeOwned>(a: &Value, name: &str) -> Res<T> {
    match a.get(name) {
        Some(v) => serde_json::from_value(v.clone()).map_err(|e| format!("Bad argument '{name}': {e}")),
        None => Err(format!("Missing argument '{name}'.")),
    }
}

fn out<T: Serialize>(v: T) -> Res<Value> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

/// Book ids are folder names; keep them from reaching outside the library.
fn check_id(id: &str) -> Res<()> {
    if storage::valid_id(id) {
        Ok(())
    } else {
        Err("That book id isn't valid.".into())
    }
}

/// The id is well-formed and the book exists on disk.
fn existing(id: &str) -> Res<()> {
    check_id(id)?;
    if storage::book_path(id).is_file() {
        Ok(())
    } else {
        Err("That book wasn't found.".into())
    }
}

fn paper_of(b: &Book) -> &'static str {
    if b.print.paper == Paper::Cream {
        CREAM
    } else {
        WHITE_PAPER
    }
}

fn mode_name(m: &str) -> Res<&'static str> {
    match m {
        "print" => Ok("print"),
        "large" => Ok("large"),
        "phone" => Ok("phone"),
        _ => Err(format!("Unknown layout mode '{m}'.")),
    }
}

/// Hash of everything that changes the typeset result: fields layout.rs never reads
/// (notes, world, goals, stats, spelling, ebook settings and cover, section ids, times) are left
/// out. The book id stays in: it says whose images the pages show.
fn content_key(book: &Book, mode: &str, scale: f32) -> u64 {
    let mut b = book.clone();
    b.meta.cover.clear();
    b.world.clear();
    b.goals = Goals::default();
    b.stats = WritingStats::default();
    b.spelling = SpellSettings::default();
    b.ebook = EbookSettings::default();
    b.created = 0;
    b.modified = 0;
    for s in b.front.iter_mut().chain(b.body.iter_mut()).chain(b.back.iter_mut()) {
        s.id.clear();
        s.notes.clear();
    }
    let mut h = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_string(&b).unwrap_or_default().hash(&mut h);
    mode.hash(&mut h);
    scale.to_bits().hash(&mut h);
    h.finish()
}

/// A phone-sized reflow of the book (the ebook preview).
fn phone_doc(book: &Book, scale: f32) -> Doc {
    let mut b = book.clone();
    b.print.trim_w_in = 3.4;
    b.print.trim_h_in = 6.0;
    b.print.margin_top_in = 0.35;
    b.print.margin_bottom_in = 0.35;
    b.print.margin_inside_in = 0.25;
    b.print.margin_outside_in = 0.25;
    b.print.running_headers = false;
    b.print.page_numbers = false;
    b.print.recto_chapter_start = false;
    b.style.base_size_pt = (b.style.base_size_pt * 0.9 * scale).clamp(6.0, 20.0);
    b.style.sink_lines = (b.style.sink_lines * 0.4).min(3.0);
    let mut d = layout::typeset(&b, Opts::default());
    // dropping blank pages shifts the later ones down; keep section starts pointing at them
    let mut new_index = Vec::with_capacity(d.pages.len());
    let mut kept: usize = 0;
    for p in &d.pages {
        new_index.push(kept);
        if !p.blank {
            kept += 1;
        }
    }
    for (_, p) in d.starts.iter_mut() {
        *p = new_index.get(*p).copied().unwrap_or(kept.saturating_sub(1));
    }
    d.pages.retain(|p| !p.blank);
    for p in d.pages.iter_mut() {
        p.recto = true;
    }
    d
}

fn record_stats(b: &mut Book) {
    let words = b.word_count();
    b.stats.record(words);
}

/// The editor's view of a section. An image comes back as a paragraph holding its own line
/// (`![caption](name.png)`), so the editor shows and saves it as text.
fn blocks_dto(text: &str) -> Value {
    #[derive(Serialize)]
    struct S {
        text: String,
        bold: bool,
        italic: bool,
    }
    #[derive(Serialize)]
    #[serde(tag = "type")]
    enum B {
        Para { spans: Vec<S> },
        Quote { spans: Vec<S> },
        Heading { level: u8, spans: Vec<S> },
        SceneBreak,
    }
    let spans = |v: Vec<markup::Span>| v.into_iter().map(|s| S { text: s.text, bold: s.bold, italic: s.italic }).collect::<Vec<_>>();
    let v: Vec<B> = markup::parse_blocks(text, false)
        .into_iter()
        .map(|b| match b {
            markup::Block::Para(s) => B::Para { spans: spans(s) },
            markup::Block::Quote(s) => B::Quote { spans: spans(s) },
            markup::Block::Heading(level, s) => B::Heading { level, spans: spans(s) },
            markup::Block::SceneBreak => B::SceneBreak,
            markup::Block::Image { src, caption } => {
                let plain = |t: String| S { text: t, bold: false, italic: false };
                B::Para { spans: std::iter::once(plain("![".into())).chain(spans(caption)).chain([plain(format!("]({src})"))]).collect() }
            }
            // parse_blocks keeps table lines as paragraphs, so this never happens
            markup::Block::Table { .. } => B::Para { spans: Vec::new() },
        })
        .collect();
    serde_json::to_value(v).unwrap_or(Value::Null)
}

fn catalog() -> &'static Value {
    static CAT: OnceLock<Value> = OnceLock::new();
    CAT.get_or_init(|| {
        let themes: Vec<Value> = themes::themes()
            .into_iter()
            .map(|t| json!({ "key": t.style.builtin, "name": t.style.name, "style": t.style, "trim": [t.trim.0, t.trim.1], "margins": t.margins }))
            .collect();
        let trims: Vec<Value> = themes::TRIMS
            .iter()
            .map(|t| json!({ "key": t.key, "name": t.name, "w_in": t.w_in, "h_in": t.h_in, "margins": t.margins }))
            .collect();
        let faces: Vec<Value> = fonts::faces()
            .iter()
            .enumerate()
            .map(|(i, f)| json!({ "index": i, "family": f.family, "bold": f.bold, "italic": f.italic, "file": f.file }))
            .collect();
        let families: Vec<Value> = fonts::families()
            .into_iter()
            .map(|f| json!({ "family": f, "kind": fonts::family_kind(f), "italic": fonts::has_style(f, false, true), "bold": fonts::has_style(f, true, false) }))
            .collect();
        let orn: Vec<Value> = ornaments::ORNAMENTS
            .iter()
            .map(|(k, n)| json!({ "key": k, "name": n, "svg": ornaments::svg(k, "#1a1a1a") }))
            .collect();
        json!({ "themes": themes, "trims": trims, "faces": faces, "families": families, "ornaments": orn, "glyphs": ornaments::GLYPHS })
    })
}

fn set_trim(b: &mut Book, t: &themes::Trim) {
    b.print.trim_key = t.key.into();
    b.print.trim_w_in = t.w_in;
    b.print.trim_h_in = t.h_in;
    b.print.margin_top_in = t.margins[0];
    b.print.margin_bottom_in = t.margins[1];
    b.print.margin_inside_in = t.margins[2];
    b.print.margin_outside_in = t.margins[3];
}

fn find_theme(key: &str) -> Res<themes::Theme> {
    themes::themes().into_iter().find(|t| t.style.builtin == key).ok_or_else(|| format!("Unknown design '{key}'."))
}

fn find_trim(key: &str) -> Res<&'static themes::Trim> {
    themes::TRIMS.iter().find(|t| t.key == key).ok_or_else(|| format!("Unknown page size '{key}'."))
}

fn load_book(id: &str) -> Res<Book> {
    existing(id)?;
    storage::load(&storage::book_path(id))
}

fn summary(b: &Book) -> Value {
    json!({
        "id": b.id, "title": b.meta.title, "author": b.meta.author, "words": b.word_count(),
        "chapters": b.body.iter().filter(|s| s.kind == SectionKind::Chapter).count(),
        "modified": b.modified, "today_words": b.stats.today_written(), "daily_goal": b.goals.daily_words,
        "streak": b.stats.streak(b.goals.daily_words), "trim_w_in": b.print.trim_w_in, "trim_h_in": b.print.trim_h_in,
    })
}

/// A new image's file name: the picked file's name in lower-case letters, digits and hyphens,
/// a unique suffix, and the extension of what the file really is.
fn image_name(path: &Path, kind: image::Kind) -> String {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    let stem: Vec<&str> = stem.split(|c: char| !c.is_ascii_alphanumeric()).filter(|p| !p.is_empty()).collect();
    let stem: String = stem.join("-").chars().take(40).collect();
    let stem = if stem.is_empty() { "image" } else { stem.trim_end_matches('-') };
    format!("{stem}-{}.{}", new_id(), kind.ext())
}

fn secs(t: std::io::Result<std::time::SystemTime>) -> u64 {
    t.ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0)
}

impl Api {
    pub fn new() -> Self {
        spell::preload();
        Api::default()
    }

    /// Run one command. Panics inside a command come back as errors too.
    pub fn call(&self, cmd: &str, args: Value) -> Res<Value> {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| self.dispatch(cmd, &args)))
            .unwrap_or_else(|_| Err(format!("Something went wrong while running '{cmd}'.")))
    }

    /// The typeset book for a mode and its key (mode + content + scale), from the cache when
    /// that exact layout was made recently.
    fn doc_for(&self, book: &Book, mode: &'static str, scale: f32) -> (String, Arc<Doc>) {
        let scale = if mode == "phone" { scale.clamp(0.5, 3.0) } else { 1.0 };
        let key = format!("{mode}:{:016x}", content_key(book, mode, scale));
        {
            let mut docs = lock(&self.docs);
            if let Some(i) = docs.iter().position(|c| c.0 == key) {
                let hit = docs.remove(i);
                let d = hit.1.clone();
                docs.push(hit);
                return (key, d);
            }
        }
        let doc = Arc::new(match mode {
            "large" => layout::typeset(book, Opts { large_print: true }),
            "phone" => phone_doc(book, scale),
            _ => layout::typeset(book, Opts::default()),
        });
        let mut docs = lock(&self.docs);
        docs.retain(|c| c.0 != key); // another call may have made the same layout meanwhile
        docs.push((key.clone(), doc.clone(), paper_of(book)));
        if docs.len() > KEEP_DOCS {
            docs.remove(0);
        }
        (key, doc)
    }

    fn dispatch(&self, cmd: &str, a: &Value) -> Res<Value> {
        match cmd {
            "settings_get" => {
                // Two overlapping first calls (React StrictMode in dev) must not both add the sample.
                static FIRST_RUN: std::sync::Mutex<()> = std::sync::Mutex::new(());
                let _first = FIRST_RUN.lock().unwrap_or_else(|e| e.into_inner());
                let mut s = storage::load_settings();
                if !s.sample_created {
                    if storage::list().is_empty() {
                        storage::save(&sample::sample_book())?;
                    }
                    s.sample_created = true;
                    storage::save_settings(&s);
                }
                out(s)
            }
            "settings_set" => {
                storage::save_settings(&arg::<storage::Settings>(a, "settings")?);
                Ok(Value::Null)
            }
            "library_list" => {
                let mut v: Vec<Book> = storage::list().iter().filter_map(|s| storage::load(&storage::book_path(&s.id)).ok()).collect();
                v.sort_by_key(|x| std::cmp::Reverse(x.modified));
                out(v.iter().map(summary).collect::<Vec<_>>())
            }
            "book_load" => {
                let mut b = load_book(&arg::<String>(a, "id")?)?;
                record_stats(&mut b);
                out(b)
            }
            "book_save" => {
                let mut b: Book = arg(a, "book")?;
                check_id(&b.id)?;
                record_stats(&mut b);
                b.modified = now_secs();
                storage::save(&b)?;
                out(b)
            }
            "book_create" => {
                let (title, author): (String, String) = (arg(a, "title")?, arg(a, "author")?);
                let th = find_theme(&arg::<String>(a, "theme")?)?;
                let t = find_trim(&arg::<String>(a, "trim")?)?;
                let title = if title.trim().is_empty() { "Untitled book".to_string() } else { title.trim().to_string() };
                let mut b = Book::new_empty(&title, author.trim());
                themes::apply_theme(&mut b, &th);
                if (t.w_in - th.trim.0).abs() > 0.005 || (t.h_in - th.trim.1).abs() > 0.005 {
                    set_trim(&mut b, t);
                }
                if let Some(c) = b.front.iter_mut().find(|s| s.kind == SectionKind::Copyright) {
                    c.text = "All rights reserved.".into();
                }
                record_stats(&mut b);
                storage::save(&b)?;
                out(b)
            }
            "book_delete" => {
                let id: String = arg(a, "id")?;
                existing(&id)?;
                lock(&self.covers).remove(&id);
                storage::delete(&id)?;
                Ok(Value::Null)
            }
            "book_import" => {
                let path: String = arg(a, "path")?;
                let imp = import::import_file(Path::new(&path))?;
                let title = imp.title.clone().unwrap_or_else(|| "Imported book".into());
                let mut b = Book::new_empty(&title, imp.author.as_deref().unwrap_or(""));
                // front-matter kinds (an epigraph before the first heading, ...) belong in the front
                let (front, body): (Vec<Section>, Vec<Section>) = imp.sections.into_iter().partition(|s| {
                    SectionKind::FRONT.contains(&s.kind) && !matches!(s.kind, SectionKind::TitlePage | SectionKind::Copyright | SectionKind::Contents)
                });
                if !body.is_empty() {
                    b.body = body;
                }
                let at = b.front.iter().position(|s| s.kind == SectionKind::Contents).unwrap_or(b.front.len());
                b.front.splice(at..at, front);
                record_stats(&mut b);
                storage::save(&b)?;
                out(json!({ "book": b, "notes": imp.notes }))
            }
            "sample_add" => {
                let mut b = sample::sample_book();
                record_stats(&mut b);
                storage::save(&b)?;
                out(b)
            }
            "cover_svg" => {
                let id: String = arg(a, "id")?;
                let b = load_book(&id)?;
                let key = content_key(&b, "cover", 1.0);
                if let Some((m, s)) = lock(&self.covers).get(&id) {
                    if *m == key {
                        return out(s);
                    }
                }
                // the title page doubles as the cover on the shelf
                let mut cover = b.clone();
                cover.body.clear();
                cover.back.clear();
                cover.front.retain(|f| f.kind == SectionKind::TitlePage);
                if cover.front.is_empty() {
                    cover.front.push(Section::new(SectionKind::TitlePage, "Title page"));
                }
                let svg = svg::page_svg(&layout::typeset(&cover, Opts::default()), 0, paper_of(&b));
                lock(&self.covers).insert(id, (key, svg.clone()));
                out(svg)
            }
            "catalog" => Ok(catalog().clone()),
            "apply_theme" => {
                let mut b: Book = arg(a, "book")?;
                themes::apply_theme(&mut b, &find_theme(&arg::<String>(a, "key")?)?);
                out(b)
            }
            "apply_trim" => {
                let mut b: Book = arg(a, "book")?;
                set_trim(&mut b, find_trim(&arg::<String>(a, "key")?)?);
                out(b)
            }
            "layout" => {
                let b: Book = arg(a, "book")?;
                let mode = mode_name(&arg::<String>(a, "mode")?)?;
                let scale: f32 = arg(a, "scale").unwrap_or(1.0);
                let (key, d) = self.doc_for(&b, mode, scale);
                let pages: Vec<Value> = d
                    .pages
                    .iter()
                    .map(|p| json!({ "folio": p.folio, "recto": p.recto, "section": p.section, "blank": p.blank, "opener": p.opener, "front": p.front }))
                    .collect();
                Ok(json!({ "key": key, "w": d.w, "h": d.h, "pages": pages, "toc": d.toc, "starts": d.starts, "warnings": d.warnings }))
            }
            "page_svg" => {
                let key: String = arg(a, "key")?;
                let index: usize = arg(a, "index")?;
                let (d, paper) = match lock(&self.docs).iter().find(|c| c.0 == key) {
                    Some((_, d, p)) => (d.clone(), *p),
                    None => return Err("That layout is no longer available.".into()),
                };
                if index >= d.pages.len() {
                    return Err(format!("There is no page {index} (the layout has {} pages).", d.pages.len()));
                }
                out(svg::page_svg(&d, index, paper))
            }
            "preflight" => {
                let b: Book = arg(a, "book")?;
                let (_, d) = self.doc_for(&b, "print", 1.0);
                let mut checks = preflight::preflight(&b, d.pages.len());
                // problems the typesetter found (e.g. characters no bundled font can print)
                checks.extend(d.warnings.iter().map(|w| preflight::Check { level: preflight::Level::Warn, text: w.clone() }));
                out(checks)
            }
            "export" => {
                let b: Book = arg(a, "book")?;
                let kind: String = arg(a, "kind")?;
                existing(&b.id)?;
                let base = storage::safe_file_name(&b.meta.title);
                let (name, bytes, pages) = match kind.as_str() {
                    "print" | "print_bleed" => {
                        let (_, d) = self.doc_for(&b, "print", 1.0);
                        let bleed = kind == "print_bleed";
                        let n = if bleed { "print with bleed" } else { "print" };
                        (format!("{base} - {n}.pdf"), crate::pdf::write(&d, &b.meta.title, &b.meta.author, bleed, b.print.pdfx), Some(d.pages.len()))
                    }
                    "large_print" => {
                        let (_, d) = self.doc_for(&b, "large", 1.0);
                        (format!("{base} - large print.pdf"), crate::pdf::write(&d, &b.meta.title, &b.meta.author, false, false), Some(d.pages.len()))
                    }
                    "epub_kindle" | "epub_apple" | "epub_generic" => {
                        let target = match kind.as_str() {
                            "epub_kindle" => EbookTarget::Kindle,
                            "epub_apple" => EbookTarget::Apple,
                            _ => EbookTarget::Generic,
                        };
                        (format!("{base} - {}.epub", target.label()), epub::write(&b, target)?.bytes, None)
                    }
                    _ => return Err(format!("Unknown export kind '{kind}'.")),
                };
                let path = storage::write_export(&b.id, &name, &bytes)?;
                out(json!({ "path": path, "name": name, "bytes": bytes.len(), "pages": pages }))
            }
            "exports_list" => {
                let id: String = arg(a, "id")?;
                existing(&id)?;
                let mut v: Vec<(u64, Value)> = Vec::new();
                for e in std::fs::read_dir(storage::exports_dir(&id)).map_err(|e| e.to_string())?.flatten() {
                    let Ok(m) = e.metadata() else { continue };
                    if m.is_file() {
                        let modified = secs(m.modified());
                        v.push((modified, json!({ "name": e.file_name().to_string_lossy(), "path": e.path(), "bytes": m.len(), "modified": modified })));
                    }
                }
                v.sort_by_key(|x| std::cmp::Reverse(x.0));
                out(v.into_iter().map(|x| x.1).collect::<Vec<_>>())
            }
            "copy_file" => {
                let (src, dest): (String, String) = (arg(a, "src")?, arg(a, "dest")?);
                let root = std::fs::canonicalize(storage::app_dir()).map_err(|e| e.to_string())?;
                let src = std::fs::canonicalize(&src).map_err(|e| format!("Couldn't find that file: {e}"))?;
                if !src.starts_with(&root) {
                    return Err("Only files in the Between the Lines folder can be copied.".into());
                }
                let dest = std::path::Path::new(&dest);
                if !dest.is_absolute() {
                    return Err("The copy needs a full destination path.".into());
                }
                let parent = dest.parent().and_then(|p| std::fs::canonicalize(p).ok()).ok_or("The destination folder doesn't exist.")?;
                if parent.starts_with(&root) {
                    return Err("Copies can't be saved inside the Between the Lines folder.".into());
                }
                if dest.is_dir() || dest.file_name().is_none() {
                    return Err("The destination is a folder, not a file.".into());
                }
                std::fs::copy(&src, dest).map_err(|e| format!("Couldn't save the copy: {e}"))?;
                Ok(Value::Null)
            }
            "image_add" => {
                let (id, path): (String, String) = (arg(a, "book")?, arg(a, "path")?);
                existing(&id)?;
                let path = Path::new(&path);
                let mut bytes = Vec::new();
                std::fs::File::open(path)
                    .and_then(|f| f.take(image::MAX_BYTES + 1).read_to_end(&mut bytes))
                    .map_err(|e| format!("Couldn't read that image: {e}"))?;
                if bytes.len() as u64 > image::MAX_BYTES {
                    return Err("That image is over 40 MB.".into());
                }
                let kind = image::Kind::sniff(&bytes).ok_or("Only PNG and JPEG images can be added.")?;
                let r = image::decode(&bytes)?;
                let name = image_name(path, kind);
                storage::add_image(&id, &name, &bytes)?;
                Ok(json!({ "name": name, "w": r.w, "h": r.h }))
            }
            "image_data" => {
                let (id, name): (String, String) = (arg(a, "book")?, arg(a, "name")?);
                existing(&id)?;
                let (kind, bytes) = image::read(&id, &name)?;
                out(image::data_uri(kind, &bytes))
            }
            "markup_blocks" => Ok(blocks_dto(&arg::<String>(a, "text")?)),
            "spell_misspelled" => {
                let (text, extra): (String, Vec<String>) = (arg(a, "text")?, arg(a, "extra")?);
                let extra = spell::norm_extra(&extra);
                let mut seen = std::collections::HashSet::new();
                let mut v = Vec::new(); // in order of first appearance
                for (s, e) in spell::words(&text) {
                    let w = &text[s..e];
                    if spell::misspelled_norm(w, &extra) && seen.insert(w) {
                        v.push(w.to_string());
                    }
                }
                out(v)
            }
            "spell_suggest" => out(spell::suggest(&arg::<String>(a, "word")?, 5)),
            "snapshots_list" => {
                let id: String = arg(a, "id")?;
                existing(&id)?;
                out(storage::snapshots(&id))
            }
            "snapshot_save" => {
                let b: Book = arg(a, "book")?;
                existing(&b.id)?;
                storage::save_snapshot(&b, &arg::<String>(a, "name")?)?;
                out(storage::snapshots(&b.id))
            }
            "snapshot_load" => {
                let (id, file): (String, String) = (arg(a, "id")?, arg(a, "file")?);
                existing(&id)?;
                if Path::new(&file).file_name().and_then(|f| f.to_str()) != Some(file.as_str()) {
                    return Err("That snapshot wasn't found.".into());
                }
                out(storage::load_snapshot(&id, &file)?)
            }
            _ => Err(format!("Unknown command '{cmd}'.")),
        }
    }
}
