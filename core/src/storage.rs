//! Where books live on disk: one folder per book with `book.json`, exports, snapshots and images.

use crate::model::Book;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// App data folder; `BOOKBINDER_DATA_DIR` overrides it (used by tests).
pub fn app_dir() -> PathBuf {
    if let Some(d) = std::env::var_os("BOOKBINDER_DATA_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(d);
    }
    let base = dirs::data_dir().unwrap_or_else(std::env::temp_dir);
    let dir = base.join(APP_NAME);
    // The app used to be called Bookbinder: move an existing library across once, and keep
    // using the old folder if it can't be moved so no books go missing.
    let old = base.join("Bookbinder");
    if !dir.exists() && old.is_dir() && std::fs::rename(&old, &dir).is_err() {
        return old;
    }
    dir
}

pub const APP_NAME: &str = "Between the Lines";

pub fn library_dir() -> PathBuf {
    let d = app_dir().join("books");
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Book ids are folder names: 1-64 of `0-9 A-Z a-z _ -`.
pub fn valid_id(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

fn check_id(id: &str) -> Result<(), String> {
    if valid_id(id) {
        Ok(())
    } else {
        Err("That book id isn't valid.".into())
    }
}

/// An invalid id maps to a folder name no valid id can have, so it never escapes the library.
pub fn book_dir(id: &str) -> PathBuf {
    library_dir().join(if valid_id(id) { id } else { ".invalid" })
}

pub fn book_path(id: &str) -> PathBuf {
    book_dir(id).join("book.json")
}

pub fn exports_dir(id: &str) -> PathBuf {
    let d = book_dir(id).join("exports");
    let _ = std::fs::create_dir_all(&d);
    d
}

/// The book's pictures (its cover and the images in its text); made when the first is added.
pub fn images_dir(id: &str) -> PathBuf {
    book_dir(id).join("images")
}

pub fn snapshots_dir(id: &str) -> PathBuf {
    let d = book_dir(id).join("snapshots");
    let _ = std::fs::create_dir_all(&d);
    d
}

/// Write to a uniquely named temporary file next to `path` and flush it to disk.
fn write_tmp(path: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    use std::io::Write;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let tmp = path.with_file_name(format!("{name}.{}-{}.tmp", std::process::id(), crate::model::new_id()));
    let res = (|| {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()
    })();
    if let Err(e) = res {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(tmp)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = write_tmp(path, bytes)?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct Summary {
    pub id: String,
    pub title: String,
    pub author: String,
    pub words: u64,
    pub chapters: usize,
    pub modified: u64,
    pub heading_font: String,
    pub accent: String,
}

pub fn list() -> Vec<Summary> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(library_dir()) {
        for e in rd.flatten() {
            let Some(id) = e.file_name().to_str().filter(|n| valid_id(n)).map(str::to_string) else { continue };
            // load() sets the id from the folder name
            if let Ok(b) = load(&e.path().join("book.json")) {
                out.push(Summary {
                    id,
                    title: b.meta.title.clone(),
                    author: b.meta.author.clone(),
                    words: b.word_count(),
                    chapters: b.body.iter().filter(|s| s.kind == crate::model::SectionKind::Chapter).count(),
                    modified: b.modified,
                    heading_font: b.style.heading_font.clone(),
                    accent: b.style.title_color.clone(),
                });
            }
        }
    }
    out.sort_by_key(|b| std::cmp::Reverse(b.modified));
    out
}

fn read_book(path: &Path) -> Result<Book, String> {
    let s = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str::<Book>(&s).map_err(|e| format!("This book file couldn't be read: {e}"))
}

/// Load a book file; falls back to the `.bak` copy next to it. For `<folder>/book.json` the
/// book's id is the folder name.
pub fn load(path: &Path) -> Result<Book, String> {
    let mut book = match read_book(path) {
        Ok(b) => b,
        Err(e) => {
            let mut bak = path.as_os_str().to_owned();
            bak.push(".bak");
            read_book(Path::new(&bak)).map_err(|_| e)?
        }
    };
    if path.file_name().and_then(|n| n.to_str()) == Some("book.json") {
        if let Some(id) = path.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str()).filter(|n| valid_id(n)) {
            book.id = id.to_string();
        }
    }
    Ok(book)
}

/// Save atomically (write a temporary file, then rename), keeping the previous copy.
pub fn save(book: &Book) -> Result<PathBuf, String> {
    check_id(&book.id)?;
    let dir = book_dir(&book.id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("book.json");
    let json = serde_json::to_string_pretty(book).map_err(|e| e.to_string())?;
    let tmp = write_tmp(&path, json.as_bytes())?;
    if path.exists() {
        let _ = std::fs::copy(&path, dir.join("book.json.bak"));
    }
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(path)
}

pub fn delete(id: &str) -> Result<(), String> {
    check_id(id)?;
    let dir = book_dir(id);
    if dir.join("book.json").exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())
    } else {
        Err("That book wasn't found.".into())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Snapshot {
    pub file: String,
    pub name: String,
    pub when: u64,
    pub words: u64,
}

pub fn save_snapshot(book: &Book, name: &str) -> Result<(), String> {
    check_id(&book.id)?;
    let when = crate::model::now_secs();
    let file = format!("{when}-{}.json", crate::model::new_id());
    let dir = snapshots_dir(&book.id);
    let json = serde_json::to_string(book).map_err(|e| e.to_string())?;
    let mut list = snapshots(&book.id); // before the new file exists, so re-indexing doesn't list it twice
    write_atomic(&dir.join(&file), json.as_bytes())?;
    list.push(Snapshot { file, name: name.to_string(), when, words: book.word_count() });
    write_atomic(&dir.join("index.json"), serde_json::to_string_pretty(&list).unwrap_or_default().as_bytes())
}

pub fn snapshots(id: &str) -> Vec<Snapshot> {
    if !valid_id(id) {
        return Vec::new();
    }
    let dir = snapshots_dir(id);
    if let Some(list) = std::fs::read_to_string(dir.join("index.json")).ok().and_then(|s| serde_json::from_str(&s).ok()) {
        return list;
    }
    // missing or unreadable index: re-create it from the snapshot files
    let mut list: Vec<Snapshot> = Vec::new();
    for e in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
        let file = e.file_name().to_string_lossy().to_string();
        if !file.ends_with(".json") || file == "index.json" {
            continue;
        }
        let Ok(b) = read_book(&e.path()) else { continue };
        let when = file.split('-').next().and_then(|w| w.trim_end_matches(".json").parse().ok()).unwrap_or(0);
        list.push(Snapshot { file, name: "Recovered snapshot".into(), when, words: b.word_count() });
    }
    list.sort_by(|a, b| a.when.cmp(&b.when).then(a.file.cmp(&b.file)));
    list
}

pub fn load_snapshot(id: &str, file: &str) -> Result<Book, String> {
    check_id(id)?;
    if Path::new(file).file_name().and_then(|n| n.to_str()) != Some(file) || !file.ends_with(".json") {
        return Err("That snapshot isn't valid.".into());
    }
    let mut b = read_book(&snapshots_dir(id).join(file))?;
    b.id = id.to_string();
    Ok(b)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub dark: bool,
    pub sample_created: bool,
    pub editor_size: f32,
    pub last_book: Option<String>,
    /// Keep the line being typed a third of the way down the editor.
    pub typewriter: bool,
    /// Fade every paragraph except the one being written.
    pub dim_others: bool,
    /// The focus page's desk lamp: brightness and warmth (0..1).
    pub lamp_brightness: f32,
    pub lamp_warmth: f32,
    /// Write in a typewriter-style (monospaced) face.
    pub typewriter_font: bool,
    /// Interface accent preset (see studio/src/index.css); unknown names fall back to raspberry.
    pub accent: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            dark: false,
            sample_created: false,
            editor_size: 17.0,
            last_book: None,
            typewriter: false,
            dim_others: false,
            lamp_brightness: 0.8,
            lamp_warmth: 0.6,
            typewriter_font: true,
            accent: "raspberry".into(),
        }
    }
}

pub fn load_settings() -> Settings {
    let p = app_dir().join("settings.json");
    std::fs::read_to_string(p).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

pub fn save_settings(s: &Settings) {
    let _ = std::fs::create_dir_all(app_dir());
    let _ = write_atomic(&app_dir().join("settings.json"), serde_json::to_string_pretty(s).unwrap_or_default().as_bytes());
}

/// Write bytes to a file in the book's exports folder, returning the full path.
pub fn write_export(id: &str, file_name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    check_id(id)?;
    if Path::new(file_name).file_name().and_then(|n| n.to_str()) != Some(file_name) {
        return Err("That file name isn't valid.".into());
    }
    let p = exports_dir(id).join(file_name);
    std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p)
}

/// Save a new image in the book's images folder; an existing one is never replaced.
pub fn add_image(id: &str, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    check_id(id)?;
    if !crate::image::valid_name(name) {
        return Err("That image name isn't valid.".into());
    }
    let dir = images_dir(id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(name);
    if p.exists() {
        return Err("An image with that name is already in the book.".into());
    }
    write_atomic(&p, bytes)?;
    Ok(p)
}

pub fn safe_file_name(s: &str) -> String {
    let t: String = s
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { ' ' })
        .collect();
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.is_empty() {
        "Book".into()
    } else {
        t
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Point the library at a temporary folder (once per test run).
    pub(crate) fn setup() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let d = std::env::temp_dir().join(format!("bookbinder-storage-test-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&d);
            std::fs::create_dir_all(&d).unwrap();
            std::env::set_var("BOOKBINDER_DATA_DIR", &d);
        });
    }

    fn book(id: &str, title: &str) -> Book {
        let mut b = Book { id: id.into(), ..Default::default() };
        b.meta.title = title.into();
        b
    }

    #[test]
    fn round_trip_list_delete() {
        setup();
        assert!(app_dir().starts_with(std::env::temp_dir()));
        let b = book("rt-book_1", "Round trip");
        let p = save(&b).unwrap();
        save(&b).unwrap(); // second save makes the .bak
        assert_eq!(load(&p).unwrap().meta.title, "Round trip");
        assert!(list().iter().any(|s| s.id == "rt-book_1" && s.title == "Round trip"));
        // a copied folder takes its id from the folder name
        std::fs::create_dir_all(library_dir().join("rt-copy")).unwrap();
        std::fs::copy(&p, library_dir().join("rt-copy").join("book.json")).unwrap();
        assert!(list().iter().any(|s| s.id == "rt-copy"));
        std::fs::create_dir_all(library_dir().join("bad name")).unwrap();
        std::fs::copy(&p, library_dir().join("bad name").join("book.json")).unwrap();
        assert!(list().iter().all(|s| valid_id(&s.id)));
        // corrupt book.json falls back to .bak
        std::fs::write(&p, "{ not json").unwrap();
        assert_eq!(load(&p).unwrap().meta.title, "Round trip");
        delete("rt-book_1").unwrap();
        assert!(delete("rt-book_1").is_err());
        let _ = delete("rt-copy");
    }

    #[test]
    fn bad_ids_rejected() {
        setup();
        for id in ["", "..", "../x", "a/b", "a b", "a.b", &"x".repeat(65)] {
            assert!(!valid_id(id), "{id}");
            assert!(delete(id).is_err());
            assert!(save(&book(id, "x")).is_err());
            assert!(save_snapshot(&book(id, "x"), "n").is_err());
            assert!(load_snapshot(id, "a.json").is_err());
            assert!(write_export(id, "a.txt", b"x").is_err());
            assert!(snapshots(id).is_empty());
        }
        assert!(load_snapshot("ok-id", "../../book.json").is_err());
        assert!(valid_id("Ab_c-9"));
        assert!(book_dir("..").starts_with(library_dir()));
    }

    #[test]
    fn snapshots_same_second_and_index_recovery() {
        setup();
        let mut b = book("snap-book", "Snap");
        b.front.clear();
        save_snapshot(&b, "one").unwrap();
        b.meta.title = "Snap two".into();
        save_snapshot(&b, "two").unwrap();
        let l = snapshots("snap-book");
        assert_eq!(l.len(), 2);
        assert_ne!(l[0].file, l[1].file);
        assert_eq!(load_snapshot("snap-book", &l[0].file).unwrap().meta.title, "Snap");
        assert_eq!(load_snapshot("snap-book", &l[1].file).unwrap().meta.title, "Snap two");
        // a broken index is rebuilt from the files instead of losing the history
        std::fs::write(snapshots_dir("snap-book").join("index.json"), "garbage").unwrap();
        assert_eq!(snapshots("snap-book").len(), 2);
        save_snapshot(&b, "three").unwrap();
        assert_eq!(snapshots("snap-book").len(), 3);
        let _ = delete("snap-book");
    }

    #[test]
    fn settings_and_export() {
        setup();
        let s = Settings { dark: true, ..Settings::default() };
        save_settings(&s);
        assert!(load_settings().dark);
        save(&book("exp-book", "E")).unwrap();
        let p = write_export("exp-book", "a.txt", b"hi").unwrap();
        assert_eq!(std::fs::read(p).unwrap(), b"hi");
        assert!(write_export("exp-book", "../a.txt", b"hi").is_err());
        let _ = delete("exp-book");
    }
}
