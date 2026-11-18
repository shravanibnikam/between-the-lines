//! End to end: everything the studio can ask for, driven through `Api::call` with JSON,
//! against a throwaway data folder.

use bookbinder_core::{api::Api, fonts, storage};
use serde_json::{json, Value};
use std::io::Read;
use std::path::{Path, PathBuf};

fn ok(api: &Api, cmd: &str, args: Value) -> Value {
    api.call(cmd, args.clone()).unwrap_or_else(|e| panic!("{cmd} {args:.200} failed: {e}"))
}

fn err(api: &Api, cmd: &str, args: Value) -> String {
    match api.call(cmd, args.clone()) {
        Ok(v) => panic!("{cmd} {args:.200} should have failed but gave {v:.200}"),
        Err(e) => {
            assert!(!e.is_empty(), "{cmd}: empty error");
            e
        }
    }
}

fn xml_ok(name: &str, s: &str) {
    let opts = roxmltree::ParsingOptions { allow_dtd: true, ..Default::default() };
    if let Err(e) = roxmltree::Document::parse_with_options(s, opts) {
        panic!("{name} is not well-formed XML: {e}\n{}", &s[..s.len().min(300)]);
    }
}

fn section(proto: &Value, id: &str, kind: &str, title: &str, text: &str) -> Value {
    let mut s = proto.clone();
    s["id"] = json!(id);
    s["kind"] = json!(kind);
    s["title"] = json!(title);
    s["text"] = json!(text);
    s
}

/// Lay the book out in a mode and check that every page is well-formed SVG.
fn layout_and_svgs(api: &Api, book: &Value, mode: &str, scale: f64) -> usize {
    layout_info(api, book, mode, scale)["pages"].as_array().unwrap().len()
}

/// `layout_and_svgs`, returning the whole layout reply (its `key` pages it again).
fn layout_info(api: &Api, book: &Value, mode: &str, scale: f64) -> Value {
    let info = ok(api, "layout", json!({ "book": book, "mode": mode, "scale": scale }));
    let key = info["key"].as_str().expect("layout key").to_string();
    assert!(key.starts_with(mode), "{mode}: key {key} names its mode");
    let pages = info["pages"].as_array().expect("pages");
    assert!(!pages.is_empty(), "{mode}: no pages");
    assert!(info["w"].as_f64().unwrap() > 0.0 && info["h"].as_f64().unwrap() > 0.0);
    for p in pages {
        for k in ["folio", "recto", "section", "blank", "opener", "front"] {
            assert!(p.get(k).is_some(), "{mode}: page info lacks {k}");
        }
        assert!(p.get("items").is_none(), "DocInfo must not carry items");
    }
    assert!(info["toc"].is_array() && info["starts"].is_array());
    for (a, i) in info["starts"].as_array().unwrap().iter().map(|s| (s[0].clone(), s[1].as_u64().unwrap())) {
        assert!(a.is_array(), "start key is [Area, idx]");
        assert!((i as usize) < pages.len(), "{mode}: section start {i} is past the last page");
    }
    for i in 0..pages.len() {
        let svg = ok(api, "page_svg", json!({ "key": key, "index": i }));
        let svg = svg.as_str().expect("svg string");
        xml_ok(&format!("{mode} page {i}"), svg);
        assert!(svg.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 "));
    }
    info
}

fn pdf_pages(bytes: &[u8]) -> usize {
    let s = String::from_utf8_lossy(bytes);
    let at = s.find("/Type /Pages").expect("pages dict");
    let rest = &s[at..];
    let c = rest.find("/Count ").expect("count") + 7;
    rest[c..].split(|ch: char| !ch.is_ascii_digit()).next().unwrap().parse().unwrap()
}

fn check_epub(path: &Path) {
    let f = std::fs::File::open(path).unwrap();
    let mut z = zip::ZipArchive::new(f).expect("epub is a zip");
    {
        let first = z.by_index(0).unwrap();
        assert_eq!(first.name().unwrap(), "mimetype", "mimetype must be the first entry");
        assert_eq!(first.compression(), zip::CompressionMethod::Stored, "mimetype must be stored");
    }
    let mut mt = String::new();
    z.by_index(0).unwrap().read_to_string(&mut mt).unwrap();
    assert_eq!(mt, "application/epub+zip");
    let mut parsed = 0;
    for i in 0..z.len() {
        let mut e = z.by_index(i).unwrap();
        let name = e.name().unwrap().to_string();
        if [".xhtml", ".opf", ".ncx", ".svg", ".xml"].iter().any(|x| name.ends_with(x)) {
            let mut s = String::new();
            e.read_to_string(&mut s).unwrap();
            xml_ok(&format!("{} in {}", name, path.display()), &s);
            parsed += 1;
        }
    }
    assert!(parsed >= 3, "expected several XML entries, found {parsed}");
}

#[test]
fn end_to_end() {
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let tmp: PathBuf = std::env::temp_dir().join(format!("bookbinder-e2e-{}-{stamp}", std::process::id()));
    let outside: PathBuf = std::env::temp_dir().join(format!("bookbinder-e2e-outside-{}-{stamp}", std::process::id()));
    std::fs::create_dir_all(&tmp).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    std::env::set_var("BOOKBINDER_DATA_DIR", &tmp);
    assert!(
        storage::app_dir().starts_with(&tmp),
        "storage::app_dir() ({}) ignores BOOKBINDER_DATA_DIR; refusing to touch the real library",
        storage::app_dir().display()
    );

    let api = Api::new();

    // ---- errors that need no data ----
    assert!(err(&api, "bogus_command", json!({})).contains("bogus_command"));
    assert!(err(&api, "page_svg", json!({ "key": "print:0", "index": 0 })).contains("no longer available")); // nothing laid out yet
    err(&api, "book_load", json!({}));
    err(&api, "book_load", json!({ "id": 5 }));
    err(&api, "book_load", json!({ "id": "does-not-exist" }));
    assert!(err(&api, "book_load", json!({ "id": "../x" })).contains("isn't valid"));
    assert!(err(&api, "snapshots_list", json!({ "id": "a/b" })).contains("isn't valid"));
    for bad in ["", "../x", "..", "a/b", "a\\b", "/etc"] {
        err(&api, "book_load", json!({ "id": bad }));
        err(&api, "book_delete", json!({ "id": bad }));
        err(&api, "exports_list", json!({ "id": bad }));
        err(&api, "snapshots_list", json!({ "id": bad }));
        err(&api, "cover_svg", json!({ "id": bad }));
    }
    err(&api, "book_save", json!({ "book": "not a book" }));
    err(&api, "book_save", json!({}));
    err(&api, "layout", json!({ "mode": "print" }));
    err(&api, "layout", json!({ "book": 5, "mode": "print" }));
    err(&api, "settings_set", json!({ "settings": 3 }));
    err(&api, "copy_file", json!({ "src": "/etc/hostname" }));
    err(&api, "spell_suggest", json!({}));
    err(&api, "markup_blocks", json!({ "text": 5 }));
    assert!(storage::list().is_empty(), "error paths must not create anything");

    // ---- settings and the sample book ----
    let st = ok(&api, "settings_get", json!({}));
    assert_eq!(st["sample_created"], json!(true));
    for k in ["dark", "editor_size", "last_book", "typewriter", "dim_others", "lamp_brightness", "lamp_warmth", "typewriter_font", "accent"] {
        assert!(st.get(k).is_some(), "settings lacks {k}");
    }
    let mut st2 = st.clone();
    st2["dark"] = json!(true);
    ok(&api, "settings_set", json!({ "settings": st2 }));
    assert_eq!(ok(&api, "settings_get", json!({}))["dark"], json!(true));
    let lib = ok(&api, "library_list", json!({}));
    assert_eq!(lib.as_array().unwrap().len(), 1, "first run saves one sample book");
    for k in ["id", "title", "author", "words", "chapters", "modified", "today_words", "daily_goal", "streak", "trim_w_in", "trim_h_in"] {
        assert!(lib[0].get(k).is_some(), "summary lacks {k}");
    }
    assert!(lib[0]["words"].as_u64().unwrap() > 100);
    let sample_id = lib[0]["id"].as_str().unwrap().to_string();
    assert_eq!(ok(&api, "library_list", json!({})).as_array().unwrap().len(), 1);
    // the sample (all of it) lays out and renders in every mode
    let sample = ok(&api, "book_load", json!({ "id": sample_id }));
    assert!(sample["stats"]["days"].as_array().map(|d| !d.is_empty()).unwrap_or(false), "load records today's words");
    for (mode, scale) in [("print", 1.0), ("large", 1.0), ("phone", 1.0), ("phone", 1.4)] {
        layout_and_svgs(&api, &sample, mode, scale);
    }
    let cover = ok(&api, "cover_svg", json!({ "id": sample_id }));
    xml_ok("cover", cover.as_str().unwrap());
    assert_eq!(cover, ok(&api, "cover_svg", json!({ "id": sample_id })));
    let extra = ok(&api, "sample_add", json!({}));
    assert_ne!(extra["id"], sample["id"]);
    assert_eq!(ok(&api, "library_list", json!({})).as_array().unwrap().len(), 2);

    // ---- catalog ----
    let cat = ok(&api, "catalog", json!({}));
    let themes = cat["themes"].as_array().unwrap();
    let trims = cat["trims"].as_array().unwrap();
    assert!(themes.len() >= 10 && trims.len() >= 15);
    assert_eq!(cat["faces"].as_array().unwrap().len(), fonts::faces().len());
    for (i, f) in cat["faces"].as_array().unwrap().iter().enumerate() {
        assert_eq!(f["index"], json!(i));
        assert!(f["file"].as_str().unwrap().ends_with(".ttf"));
    }
    for f in cat["families"].as_array().unwrap() {
        assert!(["Serif", "Sans serif", "Display", "Script", "Monospace"].contains(&f["kind"].as_str().unwrap()));
        assert!(f["bold"].is_boolean() && f["italic"].is_boolean());
    }
    assert!(cat["ornaments"].as_array().unwrap().len() >= 10);
    for o in cat["ornaments"].as_array().unwrap() {
        xml_ok(o["key"].as_str().unwrap(), o["svg"].as_str().unwrap());
    }
    assert!(!cat["glyphs"].as_array().unwrap().is_empty());
    for t in themes {
        assert_eq!(t["style"]["builtin"], t["key"]);
        assert_eq!(t["margins"].as_array().unwrap().len(), 4);
        assert_eq!(t["trim"].as_array().unwrap().len(), 2);
    }

    // ---- create a book with every theme ----
    let mut created = Vec::new();
    for t in themes {
        let key = t["key"].as_str().unwrap();
        let b = ok(&api, "book_create", json!({ "title": format!("Book {key}"), "author": " Ann Author ", "theme": key, "trim": "5.5x8.5" }));
        assert_eq!(b["style"]["builtin"], json!(key));
        assert_eq!(b["meta"]["author"], json!("Ann Author"));
        let copy = b["front"].as_array().unwrap().iter().find(|s| s["kind"] == "Copyright").unwrap();
        assert_eq!(copy["text"], json!("All rights reserved."));
        created.push(b);
    }
    let a4 = ok(&api, "book_create", json!({ "title": "  ", "author": "", "theme": themes[0]["key"], "trim": "a4" }));
    assert_eq!(a4["meta"]["title"], json!("Untitled book"));
    assert_eq!(a4["print"]["trim_key"], json!("a4"));
    assert_eq!(a4["print"]["margin_top_in"], json!(0.9f32));
    assert_eq!(ok(&api, "library_list", json!({})).as_array().unwrap().len(), 2 + themes.len() + 1);
    err(&api, "book_create", json!({ "title": "x", "author": "y", "theme": "nope", "trim": "5x8" }));
    err(&api, "book_create", json!({ "title": "x", "author": "y", "theme": themes[0]["key"], "trim": "nope" }));
    err(&api, "book_create", json!({ "title": "x", "author": "y", "theme": themes[0]["key"] }));

    // ---- edit and save ----
    let mut book = created[0].clone();
    let id = book["id"].as_str().unwrap().to_string();
    let proto = book["body"][0].clone();
    let long_word = "x".repeat(300);
    book["body"] = json!([
        section(&proto, "s-hi", "Chapter", "Greetings & <Salutations>", "*\"Hi\"* she said, and \"he\" said **no**.\n\nA plain paragraph with 'single' quotes -- and an ellipsis...\n> A quoted line\n## A subheading\n***\nAfter the break."),
        section(&proto, "s-long", "Chapter", "The long word", &format!("Before {long_word} after.\n{long_word}")),
        section(&proto, "s-empty", "Chapter", "Nothing here", ""),
        section(&proto, "s-stars", "Chapter", "Only a break", "***"),
        section(&proto, "s-crlf", "Chapter", "Windows", "First line\r\n\r\nSecond line\r\n***\r\nThird line\r\n"),
        section(&proto, "s-intl", "Prologue", "Прощай 你好", "Привет, мир. 你好，世界。 مرحبا بالعالم 😀 ñandú café naïve\n日本語のテキストです。\nΕλληνικά και עברית"),
        section(&proto, "s-ctl", "Epilogue", "Odd chars", "Bell\u{7} and tab\there, <b>&amp;</b> \"quoted\" \u{0}null \u{feff}bom \u{2028}ls"),
        section(&proto, "s-part", "Part", "Part One", ""),
        section(&proto, "s-more", "Chapter", "A longer chapter", &(0..80).map(|i| format!("Paragraph {i} of a longer chapter, with enough words to wrap across several lines and fill a page or two of the printed book.")).collect::<Vec<_>>().join("\n")),
    ]);
    book["meta"]["title"] = json!("Edge & \"Cases\" <1>");
    book["meta"]["isbn_paperback"] = json!("978-0-306-40615-7");
    book["meta"]["isbn_ebook"] = json!("978-0-306-40615-8"); // bad checksum
    let saved = ok(&api, "book_save", json!({ "book": book }));
    assert!(saved["modified"].as_u64().unwrap() > 0);
    assert!(!saved["stats"]["days"].as_array().unwrap().is_empty());
    assert_eq!(saved["body"][0]["text"], book["body"][0]["text"]);
    let reload = ok(&api, "book_load", json!({ "id": id }));
    assert_eq!(reload["body"].as_array().unwrap().len(), 9);
    assert_eq!(reload["body"][4]["text"], book["body"][4]["text"]);
    assert_eq!(reload["body"][5]["text"], book["body"][5]["text"]);
    let book = saved;
    let lib = ok(&api, "library_list", json!({}));
    let mods: Vec<u64> = lib.as_array().unwrap().iter().map(|b| b["modified"].as_u64().unwrap()).collect();
    assert!(mods.windows(2).all(|w| w[0] >= w[1]), "library sorted by modified, newest first");
    let mine = lib.as_array().unwrap().iter().find(|b| b["id"] == json!(id)).unwrap();
    assert_eq!(mine["modified"].as_u64().unwrap(), mods[0], "just-saved book is among the newest");
    assert!(lib[0]["today_words"].as_u64().is_some());

    // ---- layout in all modes; every page parses ----
    let print_info = layout_info(&api, &book, "print", 1.0);
    let print_key = print_info["key"].clone();
    let print_pages = print_info["pages"].as_array().unwrap().len();
    let large_pages = layout_and_svgs(&api, &book, "large", 1.0);
    assert!(large_pages > print_pages, "large print needs more pages ({large_pages} vs {print_pages})");
    layout_and_svgs(&api, &book, "phone", 1.0);
    layout_and_svgs(&api, &book, "phone", 0.6);
    layout_and_svgs(&api, &book, "phone", 2.5);
    assert_eq!(layout_and_svgs(&api, &book, "print", 1.0), print_pages);
    let svg0 = ok(&api, "page_svg", json!({ "key": print_key, "index": 0 }));
    assert!(svg0.as_str().unwrap().contains("fill=\"#fbf6e8\""), "cream paper by default");
    let bad_index = err(&api, "page_svg", json!({ "key": print_key, "index": print_pages }));
    assert!(bad_index.contains("page"));
    err(&api, "page_svg", json!({ "key": print_key, "index": -1 }));
    err(&api, "page_svg", json!({ "key": "bogus", "index": 0 }));
    err(&api, "page_svg", json!({ "mode": "print", "index": 0 }));
    err(&api, "layout", json!({ "book": book, "mode": "bogus" }));
    // white paper and smart quotes
    let mut white = book.clone();
    white["print"]["paper"] = json!("White");
    white["smart_quotes"] = json!(true);
    let white_key = layout_info(&api, &white, "print", 1.0)["key"].clone();
    assert!(ok(&api, "page_svg", json!({ "key": white_key, "index": 0 })).as_str().unwrap().contains("#fffffd"));
    // every design and trim on the edge-case text
    for t in themes {
        let b = ok(&api, "apply_theme", json!({ "book": book, "key": t["key"] }));
        assert_eq!(b["style"]["builtin"], t["key"]);
        assert_eq!(b["body"], book["body"], "apply_theme leaves the text alone");
        layout_and_svgs(&api, &b, "print", 1.0);
    }
    err(&api, "apply_theme", json!({ "book": book, "key": "nope" }));
    for t in trims.iter().step_by(4) {
        let b = ok(&api, "apply_trim", json!({ "book": book, "key": t["key"] }));
        assert_eq!(b["print"]["trim_key"], t["key"]);
        assert_eq!(b["print"]["trim_w_in"], t["w_in"]);
        assert_eq!(b["print"]["margin_inside_in"], t["margins"][2]);
        assert_eq!(b["print"]["margin_outside_in"], t["margins"][3]);
        layout_and_svgs(&api, &b, "print", 1.0);
    }
    err(&api, "apply_trim", json!({ "book": book, "key": "nope" }));
    // an entirely empty book
    let mut empty = book.clone();
    empty["front"] = json!([]);
    empty["body"] = json!([]);
    empty["back"] = json!([]);
    layout_and_svgs(&api, &empty, "print", 1.0);
    layout_and_svgs(&api, &empty, "phone", 1.0);

    // ---- preflight ----
    let pf = ok(&api, "preflight", json!({ "book": book }));
    let pf = pf.as_array().unwrap();
    assert!(!pf.is_empty());
    for c in pf {
        assert!(["ok", "warn", "problem"].contains(&c["level"].as_str().unwrap()), "bad level {c}");
        assert!(!c["text"].as_str().unwrap().is_empty());
    }
    let texts: Vec<&str> = pf.iter().map(|c| c["text"].as_str().unwrap()).collect();
    assert!(texts.iter().any(|t| t.contains("Ebook ISBN")), "bad checksum flagged: {texts:?}");
    assert!(!texts.iter().any(|t| t.contains("Paperback ISBN")), "good ISBN not flagged: {texts:?}");
    assert!(texts.iter().any(|t| t.contains("Empty sections")), "{texts:?}");
    assert!(texts.iter().any(|t| t.contains(&format!("{print_pages} pages"))), "page count from the print layout: {texts:?}");
    let mut isbn = book.clone();
    isbn["meta"]["isbn_ebook"] = json!("978030640615X"); // X is never valid in an ISBN-13
    isbn["meta"]["isbn_hardcover"] = json!("0-8044-2957-X"); // valid ISBN-10 with an X check digit
    isbn["meta"]["isbn_paperback"] = json!("X-306-40615-2"); // X anywhere else is not
    let pf2 = ok(&api, "preflight", json!({ "book": isbn }));
    let t2: Vec<&str> = pf2.as_array().unwrap().iter().map(|c| c["text"].as_str().unwrap()).collect();
    assert!(t2.iter().any(|t| t.contains("Ebook ISBN")) && t2.iter().any(|t| t.contains("Paperback ISBN")), "{t2:?}");
    assert!(!t2.iter().any(|t| t.contains("Hardcover ISBN")), "{t2:?}");

    // ---- images and the cover ----
    assert!(texts.iter().any(|t| t.contains("No ebook cover")), "{texts:?}");
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let pid = created[1]["id"].as_str().unwrap().to_string();
    let png = ok(&api, "image_add", json!({ "book": pid, "path": fixtures.join("tiny.png") }));
    let jpg = ok(&api, "image_add", json!({ "book": pid, "path": fixtures.join("tiny.jpg") }));
    assert_eq!((png["w"].clone(), png["h"].clone()), (json!(40), json!(30)));
    let (png_name, jpg_name) = (png["name"].as_str().unwrap().to_string(), jpg["name"].as_str().unwrap().to_string());
    assert!(png_name.starts_with("tiny-") && png_name.ends_with(".png") && jpg_name.ends_with(".jpg"), "{png_name} {jpg_name}");
    assert_ne!(png_name, ok(&api, "image_add", json!({ "book": pid, "path": fixtures.join("tiny.png") }))["name"].as_str().unwrap());
    let fake = outside.join("fake.png");
    std::fs::write(&fake, "not really a picture").unwrap();
    let cut = outside.join("cut.png");
    std::fs::write(&cut, &std::fs::read(fixtures.join("tiny.png")).unwrap()[..200]).unwrap();
    let huge = outside.join("huge.jpg");
    std::fs::File::create(&huge).unwrap().set_len(41 * 1024 * 1024).unwrap();
    assert!(err(&api, "image_add", json!({ "book": pid, "path": fake })).contains("PNG and JPEG"));
    assert!(err(&api, "image_add", json!({ "book": pid, "path": huge })).contains("40 MB"));
    err(&api, "image_add", json!({ "book": pid, "path": cut }));
    err(&api, "image_add", json!({ "book": pid, "path": outside.join("missing.png") }));
    err(&api, "image_add", json!({ "book": pid, "path": outside }));
    err(&api, "image_add", json!({ "book": "../x", "path": fixtures.join("tiny.png") }));
    err(&api, "image_add", json!({ "book": "never-saved", "path": fixtures.join("tiny.png") }));
    err(&api, "image_add", json!({ "book": pid }));
    assert_eq!(std::fs::read_dir(storage::images_dir(&pid)).unwrap().count(), 3, "failed adds leave nothing behind");
    let uri = ok(&api, "image_data", json!({ "book": pid, "name": png_name }));
    assert!(uri.as_str().unwrap().starts_with("data:image/png;base64,iVBORw0KGgo"));
    assert!(ok(&api, "image_data", json!({ "book": pid, "name": jpg_name })).as_str().unwrap().starts_with("data:image/jpeg;base64,/9j/"));
    std::fs::write(storage::book_dir(&pid).join("secret.png"), "x").unwrap();
    for bad in ["../book.json", "../secret.png", "a/b.png", "x.gif", "", "nope.png", "/etc/hosts"] {
        err(&api, "image_data", json!({ "book": pid, "name": bad }));
    }
    err(&api, "image_data", json!({ "book": "../x", "name": png_name }));
    let mut pics = ok(&api, "book_load", json!({ "id": pid }));
    pics["meta"]["cover"] = json!(jpg_name);
    pics["body"][0]["text"] = json!(format!("Before.\n![A *small* picture]({png_name})\n![](../book.json)\n![](missing.png)\nAfter.\n![]({jpg_name})"));
    let pics = ok(&api, "book_save", json!({ "book": pics }));
    assert_eq!(ok(&api, "book_load", json!({ "id": pid }))["meta"]["cover"], json!(jpg_name));
    let info = layout_info(&api, &pics, "print", 1.0);
    let warnings = info["warnings"].as_array().unwrap();
    assert!(warnings.iter().any(|w| w.as_str().unwrap().contains("missing.png")), "{warnings:?}");
    let shown = (0..info["pages"].as_array().unwrap().len())
        .map(|i| ok(&api, "page_svg", json!({ "key": info["key"], "index": i })).as_str().unwrap().matches("<image ").count())
        .sum::<usize>();
    assert_eq!(shown, 2, "both good images are drawn");
    layout_and_svgs(&api, &pics, "phone", 1.0);
    let pf = ok(&api, "preflight", json!({ "book": pics }));
    assert!(!pf.as_array().unwrap().iter().any(|c| c["text"].as_str().unwrap().contains("ebook cover")), "{pf}");
    let pdf = std::fs::read(ok(&api, "export", json!({ "book": pics, "kind": "print" }))["path"].as_str().unwrap()).unwrap();
    let has = |s: &str| pdf.windows(s.len()).any(|w| w == s.as_bytes());
    assert!(has("/Subtype /Image") && has("/SMask") && has("/XObject << /Im0 ") && has("/Im1 "), "two image objects, the PNG with its alpha");
    let mut pdfx = pics.clone();
    pdfx["print"]["pdfx"] = json!(true);
    let x = std::fs::read(ok(&api, "export", json!({ "book": pdfx, "kind": "print" }))["path"].as_str().unwrap()).unwrap();
    let xhas = |s: &str| x.windows(s.len()).any(|w| w == s.as_bytes());
    assert!(xhas("/Im1 ") && !xhas("/SMask") && !xhas("DeviceRGB"), "PDF/X images are flattened, grey or CMYK");
    let blocks = ok(&api, "markup_blocks", json!({ "text": format!("![A *small* picture]({png_name})") }));
    assert_eq!(blocks[0]["type"], json!("Para"), "the editor keeps image lines as text");
    let line: String = blocks[0]["spans"].as_array().unwrap().iter().map(|s| s["text"].as_str().unwrap()).collect();
    assert_eq!(line, format!("![A small picture]({png_name})"));
    for kind in ["epub_kindle", "epub_apple", "epub_generic"] {
        let path = PathBuf::from(ok(&api, "export", json!({ "book": pics, "kind": kind }))["path"].as_str().unwrap());
        check_epub(&path);
        let mut z = zip::ZipArchive::new(std::fs::File::open(&path).unwrap()).unwrap();
        let mut opf = String::new();
        z.by_name("OEBPS/content.opf").unwrap().read_to_string(&mut opf).unwrap();
        assert!(opf.contains(&format!("<item id=\"img-{jpg_name}\" href=\"images/{jpg_name}\" media-type=\"image/jpeg\" properties=\"cover-image\"/>")), "{opf}");
        assert!(opf.contains(&format!("<meta name=\"cover\" content=\"img-{jpg_name}\"/>")));
        assert!(opf.contains(&format!("href=\"images/{png_name}\" media-type=\"image/png\"/>")));
        assert!(opf.find("<itemref idref=\"cover\"/>").unwrap() < opf.find("<itemref idref=\"front-00\"/>").unwrap(), "cover first");
        assert_eq!(opf.matches(&format!("href=\"images/{jpg_name}\"")).count(), 1, "cover and inline use share one item");
        let mut ch = String::new();
        z.by_name("OEBPS/chapter-001.xhtml").unwrap().read_to_string(&mut ch).unwrap();
        assert!(ch.contains(&format!("<img src=\"images/{png_name}\" alt=\"A small picture\"/>")) && ch.contains("<figcaption>A <em>small</em> picture</figcaption>"), "{ch}");
        assert!(!ch.contains("missing.png") && !ch.contains("book.json"));
        assert!(z.by_name(&format!("OEBPS/images/{png_name}")).is_ok() && z.by_name("OEBPS/cover.xhtml").is_ok());
    }

    // ---- export every kind ----
    ok(&api, "layout", json!({ "book": book, "mode": "print", "scale": 1 })); // layout state must not matter
    let mut seen = Vec::new();
    for (kind, suffix) in [
        ("print", "print.pdf"),
        ("print_bleed", "print with bleed.pdf"),
        ("large_print", "large print.pdf"),
        ("epub_kindle", "Kindle.epub"),
        ("epub_apple", "Apple Books.epub"),
        ("epub_generic", "Other stores.epub"),
    ] {
        let r = ok(&api, "export", json!({ "book": book, "kind": kind }));
        let path = PathBuf::from(r["path"].as_str().unwrap());
        assert!(path.starts_with(storage::exports_dir(&id).unwrap()), "{path:?}");
        assert!(r["name"].as_str().unwrap().ends_with(suffix), "{} vs {suffix}", r["name"]);
        assert!(r["name"].as_str().unwrap().starts_with("Edge Cases 1"), "{}", r["name"]);
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(r["bytes"].as_u64().unwrap(), bytes.len() as u64);
        if kind.starts_with("epub") {
            assert!(r["pages"].is_null());
            check_epub(&path);
        } else {
            assert!(bytes.starts_with(b"%PDF-"));
            assert!(bytes.windows(5).rev().take(64).any(|w| w == b"%%EOF"), "pdf trailer");
            let n = r["pages"].as_u64().unwrap() as usize;
            assert_eq!(n, pdf_pages(&bytes), "{kind}: reported pages match the PDF");
            assert_eq!(n, if kind == "large_print" { large_pages } else { print_pages }, "{kind}: pages match the layout");
        }
        seen.push(r["name"].as_str().unwrap().to_string());
    }
    err(&api, "export", json!({ "book": book, "kind": "docx" }));
    err(&api, "export", json!({ "book": book }));
    let mut ghost = book.clone();
    ghost["id"] = json!("never-saved");
    err(&api, "export", json!({ "book": ghost, "kind": "print" }));
    // the other themes export too
    for b in created.iter().skip(1).take(3) {
        ok(&api, "export", json!({ "book": b, "kind": "print" }));
        ok(&api, "export", json!({ "book": b, "kind": "epub_generic" }));
    }
    let files = ok(&api, "exports_list", json!({ "id": id }));
    let files = files.as_array().unwrap();
    assert_eq!(files.len(), 6);
    for n in &seen {
        assert!(files.iter().any(|f| f["name"] == json!(n)), "{n} listed");
    }
    let mods: Vec<u64> = files.iter().map(|f| f["modified"].as_u64().unwrap()).collect();
    assert!(mods.windows(2).all(|w| w[0] >= w[1]), "newest first");
    assert!(files.iter().all(|f| f["bytes"].as_u64().unwrap() > 0 && Path::new(f["path"].as_str().unwrap()).is_file()));
    assert!(ok(&api, "exports_list", json!({ "id": created[5]["id"] })).as_array().unwrap().is_empty());

    // ---- copy_file: inside the app folder only ----
    let src = files[0]["path"].as_str().unwrap();
    let dest = outside.join("copy.bin");
    ok(&api, "copy_file", json!({ "src": src, "dest": dest }));
    assert_eq!(std::fs::read(&dest).unwrap(), std::fs::read(src).unwrap());
    let secret = outside.join("secret.txt");
    std::fs::write(&secret, "x").unwrap();
    err(&api, "copy_file", json!({ "src": secret, "dest": outside.join("stolen.txt") }));
    err(&api, "copy_file", json!({ "src": "/etc/hostname", "dest": outside.join("h") }));
    let dotdot = format!("{}/books/../../{}/secret.txt", storage::app_dir().display(), outside.file_name().unwrap().to_string_lossy());
    err(&api, "copy_file", json!({ "src": dotdot, "dest": outside.join("stolen2.txt") }));
    err(&api, "copy_file", json!({ "src": storage::app_dir().join("no-such-file"), "dest": outside.join("n") }));
    err(&api, "copy_file", json!({ "src": src }));
    // destination rules: absolute, parent exists, not inside the app folder, not a directory
    err(&api, "copy_file", json!({ "src": src, "dest": "relative-copy.bin" }));
    err(&api, "copy_file", json!({ "src": src, "dest": outside.join("no-such-dir").join("c.bin") }));
    err(&api, "copy_file", json!({ "src": src, "dest": storage::app_dir().join("planted.bin") }));
    err(&api, "copy_file", json!({ "src": src, "dest": outside }));
    assert!(!storage::app_dir().join("planted.bin").exists() && !Path::new("relative-copy.bin").exists());
    assert!(!outside.join("stolen.txt").exists() && !outside.join("stolen2.txt").exists() && !outside.join("h").exists());

    // ---- snapshots ----
    assert!(ok(&api, "snapshots_list", json!({ "id": id })).as_array().unwrap().is_empty());
    let s1 = ok(&api, "snapshot_save", json!({ "book": book, "name": "first" }));
    assert_eq!(s1.as_array().unwrap().len(), 1);
    std::thread::sleep(std::time::Duration::from_millis(1100)); // snapshot files are named by the second
    let mut changed = book.clone();
    changed["body"][0]["text"] = json!("Changed text.");
    let s2 = ok(&api, "snapshot_save", json!({ "book": changed, "name": "second" }));
    let s2 = s2.as_array().unwrap();
    assert_eq!(s2.len(), 2);
    assert_eq!(ok(&api, "snapshots_list", json!({ "id": id })), json!(s2));
    for k in ["file", "name", "when", "words"] {
        assert!(s2[0].get(k).is_some(), "snapshot lacks {k}");
    }
    let names: Vec<&str> = s2.iter().map(|s| s["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"first") && names.contains(&"second"));
    let f1 = s2.iter().find(|s| s["name"] == "first").unwrap()["file"].as_str().unwrap();
    let f2 = s2.iter().find(|s| s["name"] == "second").unwrap()["file"].as_str().unwrap();
    assert_ne!(f1, f2);
    assert_eq!(ok(&api, "snapshot_load", json!({ "id": id, "file": f1 }))["body"][0]["text"], book["body"][0]["text"]);
    assert_eq!(ok(&api, "snapshot_load", json!({ "id": id, "file": f2 }))["body"][0]["text"], json!("Changed text."));
    err(&api, "snapshot_load", json!({ "id": id, "file": "nope.json" }));
    err(&api, "snapshot_load", json!({ "id": id, "file": "../book.json" }));
    err(&api, "snapshot_load", json!({ "id": id, "file": "index.json" }));
    err(&api, "snapshot_load", json!({ "id": "nope", "file": f1 }));
    err(&api, "snapshot_save", json!({ "book": ghost, "name": "x" }));

    // ---- import ----
    let md = tmp.join("My_Story.md");
    std::fs::write(&md, "# The Imported Tale\n\nby Some Author\n\n# Chapter One\n\nIt began *quietly*.\n\n## Chapter Two\n\nThen \"things\" happened.\n\n***\n\nAnd more.\n\n# Chapter Three\n\nThe end.\n").unwrap();
    let r = ok(&api, "book_import", json!({ "path": md }));
    assert!(r["notes"].is_array());
    let ib = &r["book"];
    let words = |b: &Value| b["body"].as_array().unwrap().iter().map(|s| s["text"].as_str().unwrap().split_whitespace().count()).sum::<usize>();
    assert!(!ib["body"].as_array().unwrap().is_empty() && words(ib) >= 8, "markdown text imported: {ib:.300}");
    let ep = tmp.join("epi.md");
    std::fs::write(&ep, "For my mother, who always knew.\n\n# Chapter One\n\nIt began.\n\n# Chapter Two\n\nIt went on.\n").unwrap();
    let r = ok(&api, "book_import", json!({ "path": ep }));
    let kinds = |k: &str| r["book"][k].as_array().unwrap().iter().map(|s| s["kind"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    assert!(!kinds("body").iter().any(|k| ["Epigraph", "Dedication", "Foreword", "Preface"].contains(&k.as_str())), "front matter left the body: {:?}", kinds("body"));
    assert_eq!(&kinds("front")[..2], ["TitlePage", "Copyright"], "{:?}", kinds("front"));
    assert!(kinds("front").len() >= 3, "short text before the first heading went to the front: {:?} / {:?}", kinds("front"), r["notes"]);
    assert!(kinds("body").iter().filter(|k| *k == "Chapter").count() >= 2);
    layout_and_svgs(&api, &r["book"], "print", 1.0);
    assert_eq!(ok(&api, "book_load", json!({ "id": ib["id"] }))["meta"]["title"], ib["meta"]["title"], "import is saved");
    layout_and_svgs(&api, ib, "print", 1.0);
    let txt = tmp.join("plain.txt");
    std::fs::write(&txt, "Chapter 1\r\n\r\nOnce upon a time there was a line.\r\n\r\nChapter 2\r\n\r\nAnd another line follows here.\r\n").unwrap();
    let r = ok(&api, "book_import", json!({ "path": txt }));
    assert!(words(&r["book"]) >= 10, "{:.300}", r["book"]);
    layout_and_svgs(&api, &r["book"], "print", 1.0);
    let blank = tmp.join("blank.txt");
    std::fs::write(&blank, "").unwrap();
    err(&api, "book_import", json!({ "path": blank })); // nothing to import
    err(&api, "book_import", json!({ "path": tmp.join("missing.md") }));
    let weird = tmp.join("data.xyz");
    std::fs::write(&weird, "hello").unwrap();
    err(&api, "book_import", json!({ "path": weird }));
    let bad_docx = tmp.join("broken.docx");
    std::fs::write(&bad_docx, "not a zip").unwrap();
    err(&api, "book_import", json!({ "path": bad_docx }));
    err(&api, "book_import", json!({}));

    // ---- editor helpers ----
    let blocks = ok(&api, "markup_blocks", json!({ "text": "*\"Hi\"* there **you**\n\n> quoted\n## Sub\n***\nplain" }));
    let b = blocks.as_array().unwrap();
    let types: Vec<&str> = b.iter().map(|x| x["type"].as_str().unwrap()).collect();
    assert_eq!(types, ["Para", "Quote", "Heading", "SceneBreak", "Para"]);
    assert_eq!(b[0]["spans"][0], json!({ "text": "\"Hi\"", "bold": false, "italic": true }));
    assert_eq!(b[2]["level"], json!(2));
    assert!(b[3].get("spans").is_none());
    assert_eq!(ok(&api, "markup_blocks", json!({ "text": "" })), json!([]));
    ok(&api, "markup_blocks", json!({ "text": "a\r\n\r\n***\r\n\u{0}\u{1}😀" }));
    // the dictionary loads in the background
    let t0 = std::time::Instant::now();
    while ok(&api, "spell_misspelled", json!({ "text": "zzxqvv", "extra": [] })).as_array().unwrap().is_empty() {
        assert!(t0.elapsed().as_secs() < 60, "spell checker never became ready");
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    let m = ok(&api, "spell_misspelled", json!({ "text": "The quikc brwon fox said quikc to Zorblax, and the cat.", "extra": [] }));
    assert_eq!(m, json!(["quikc", "brwon", "Zorblax"]), "unique, in order of first appearance");
    let m = ok(&api, "spell_misspelled", json!({ "text": "The quikc brwon fox said quikc to Zorblax.", "extra": ["zorblax", "quikc"] }));
    assert_eq!(m, json!(["brwon"]));
    assert_eq!(ok(&api, "spell_misspelled", json!({ "text": "", "extra": [] })), json!([]));
    err(&api, "spell_misspelled", json!({ "text": "x" }));
    let sg = ok(&api, "spell_suggest", json!({ "word": "quikc" }));
    assert!(sg.as_array().unwrap().len() <= 5 && sg.as_array().unwrap().contains(&json!("quick")), "{sg}");
    assert_eq!(ok(&api, "spell_suggest", json!({ "word": "" })), json!([]));

    // ---- a few threads at once ----
    let api = std::sync::Arc::new(api);
    let handles: Vec<_> = (0..4)
        .map(|i| {
            let api = api.clone();
            let book = book.clone();
            std::thread::spawn(move || {
                let mode = ["print", "large", "phone", "print"][i];
                for _ in 0..3 {
                    ok(&api, "library_list", json!({}));
                    ok(&api, "catalog", json!({}));
                    ok(&api, "preflight", json!({ "book": book }));
                    ok(&api, "layout", json!({ "book": book, "mode": mode, "scale": 1 }));
                }
            })
        })
        .collect();
    for h in handles {
        h.join().expect("worker thread panicked");
    }

    // ---- delete ----
    let before = ok(&api, "library_list", json!({})).as_array().unwrap().len();
    ok(&api, "book_delete", json!({ "id": id }));
    assert_eq!(ok(&api, "library_list", json!({})).as_array().unwrap().len(), before - 1);
    assert!(!storage::book_dir(&id).exists());
    err(&api, "book_load", json!({ "id": id }));
    err(&api, "book_delete", json!({ "id": id }));
    err(&api, "cover_svg", json!({ "id": id }));
    err(&api, "exports_list", json!({ "id": id }));
    assert!(!storage::book_dir(&id).exists(), "failed calls must not recreate a deleted book's folder");
    // settings_get after the library exists again does not add another sample
    assert_eq!(ok(&api, "settings_get", json!({}))["sample_created"], json!(true));
    assert_eq!(ok(&api, "library_list", json!({})).as_array().unwrap().len(), before - 1);

    let _ = std::fs::remove_dir_all(&tmp);
    let _ = std::fs::remove_dir_all(&outside);
}

/// Overlapping layouts (a slow typeset, or the ebook preview going 1.0 -> 1.1 -> 1.0) each keep
/// their own pages: `page_svg` draws exactly the layout its key names, not the latest one.
#[test]
fn layouts_keep_their_own_pages() {
    let api = Api::new();
    let book = serde_json::to_value(bookbinder_core::sample::sample_book()).unwrap();
    let mut short = book.clone();
    short["body"] = json!([book["body"][0].clone()]);
    let mut notes = book.clone();
    notes["body"][0]["notes"] = json!("a private note");
    notes["goals"]["daily_words"] = json!(1234);

    let layout = |b: &Value, mode: &str, scale: f64| ok(&api, "layout", json!({ "book": b, "mode": mode, "scale": scale }));
    let pages = |v: &Value| v["pages"].as_array().unwrap().len();
    let svg = |key: &Value, i: usize| ok(&api, "page_svg", json!({ "key": key, "index": i })).as_str().unwrap().to_string();

    let long = layout(&book, "print", 1.0);
    let small = layout(&short, "print", 1.0);
    assert!(pages(&long) > pages(&small));
    assert_ne!(long["key"], small["key"]);
    assert_eq!(layout(&notes, "print", 1.0)["key"], long["key"], "notes and goals don't change the layout key");
    let p10 = layout(&book, "phone", 1.0);
    let p11 = layout(&book, "phone", 1.1);
    assert_ne!(p10["key"], p11["key"]);

    // the earlier layouts still serve their own last pages, past the newer ones' counts
    let last = pages(&long) - 1;
    assert_eq!(svg(&long["key"], last), svg(&long["key"], last));
    err(&api, "page_svg", json!({ "key": small["key"], "index": pages(&small) }));
    assert!(svg(&small["key"], 0).starts_with("<svg"));
    assert_ne!(svg(&p10["key"], 0), svg(&p11["key"], 0), "scale 1.0 and 1.1 draw differently");
    assert!(svg(&p10["key"], pages(&p10) - 1).starts_with("<svg"));

    // old layouts drop out after a while instead of serving the wrong pages
    for i in 0..8 {
        let mut b = short.clone();
        b["meta"]["title"] = json!(format!("Title {i}"));
        layout(&b, "print", 1.0);
    }
    assert!(err(&api, "page_svg", json!({ "key": long["key"], "index": 0 })).contains("no longer available"));
}
