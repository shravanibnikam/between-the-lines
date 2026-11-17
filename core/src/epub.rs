//! EPUB 3 export (with an EPUB 2 table of contents for older readers), tuned per store.

use crate::markup::{self, Block, Span};
use crate::model::*;
use std::io::Write;

pub fn esc(s: &str) -> String {
    // characters XML 1.0 can't carry are dropped
    let s: String = s
        .chars()
        .filter(|&c| !matches!(c, '\u{0}'..='\u{8}' | '\u{B}' | '\u{C}' | '\u{E}'..='\u{1F}' | '\u{FFFE}' | '\u{FFFF}'))
        .collect();
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// A BCP 47-ish language tag for xml:lang / dc:language; "en" when it doesn't look like one.
fn lang_tag(s: &str) -> String {
    let t = s.trim().replace('_', "-");
    let mut parts = t.split('-');
    let first_ok = parts.next().map(|p| (2..=3).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphabetic())).unwrap_or(false);
    if first_ok && parts.all(|p| (1..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric())) {
        t
    } else {
        "en".into()
    }
}

fn inline(spans: &[Span]) -> String {
    let mut out = String::new();
    for s in spans {
        let t = esc(&s.text);
        match (s.bold, s.italic) {
            (true, true) => out.push_str(&format!("<strong><em>{t}</em></strong>")),
            (true, false) => out.push_str(&format!("<strong>{t}</strong>")),
            (false, true) => out.push_str(&format!("<em>{t}</em>")),
            _ => out.push_str(&t),
        }
    }
    out
}

/// First paragraph with a drop cap and/or small-caps lead-in.
fn first_para(spans: &[Span], drop_cap: bool, lead: FirstParagraph, lead_words: u32) -> String {
    let text = inline(spans);
    let mut plain = markup::plain(spans);
    let mut out = String::new();
    let mut rest_html = text;
    if drop_cap && spans.first().map(|s| !s.bold && !s.italic).unwrap_or(false) {
        let mut cap = String::new();
        let mut chars = plain.chars();
        for c in chars.by_ref() {
            cap.push(c);
            if c.is_alphanumeric() {
                break;
            }
        }
        if cap.chars().any(|c| c.is_alphanumeric()) {
            plain = chars.collect();
            out.push_str(&format!("<span class=\"dropcap\">{}</span>", esc(&cap)));
            // re-make the rest from spans without the dropped letters
            let mut rest = spans.to_vec();
            let mut n = cap.chars().count();
            for sp in rest.iter_mut() {
                let k = sp.text.chars().count().min(n);
                sp.text = sp.text.chars().skip(k).collect();
                n -= k;
                if n == 0 {
                    break;
                }
            }
            rest_html = inline(&rest);
        }
    }
    if lead != FirstParagraph::Plain && spans.iter().all(|s| !s.bold && !s.italic) {
        let n = if lead == FirstParagraph::SmallCapsLine { 7 } else { lead_words.clamp(1, 12) as usize };
        let words: Vec<&str> = plain.split_whitespace().collect();
        if words.len() > n {
            let head = words[..n].join(" ");
            let tail = words[n..].join(" ");
            out.push_str(&format!("<span class=\"lead\">{}</span> {}", esc(&head), esc(&tail)));
            return out;
        }
    }
    out.push_str(&rest_html);
    out
}

fn blocks_html(book: &Book, text: &str, drop_cap: bool, lead: FirstParagraph, centered: bool, scene_img: Option<&str>) -> String {
    let st = &book.style;
    let mut html = String::new();
    let mut first = true;
    let mut after_break = st.no_indent_after_heading;
    for b in markup::parse_blocks(text, book.smart_quotes) {
        match b {
            Block::Para(spans) => {
                let class = if centered {
                    " class=\"centered\""
                } else if after_break {
                    " class=\"first\""
                } else {
                    ""
                };
                let body = if first { first_para(&spans, drop_cap, lead, st.small_caps_words) } else { inline(&spans) };
                html.push_str(&format!("<p{class}>{body}</p>\n"));
                first = false;
                after_break = false;
            }
            Block::Quote(spans) => {
                html.push_str(&format!("<blockquote><p>{}</p></blockquote>\n", inline(&spans)));
                after_break = st.no_indent_after_heading;
                first = false;
            }
            Block::Heading(level, spans) => {
                let l = level.clamp(2, 4);
                html.push_str(&format!("<h{l}>{}</h{l}>\n", inline(&spans)));
                after_break = st.no_indent_after_heading;
            }
            Block::SceneBreak => {
                match (st.scene_break, scene_img) {
                    (SceneBreakStyle::Ornament, Some(src)) => html.push_str(&format!(
                        "<div class=\"scene-break\"><img src=\"{src}\" alt=\"* * *\" class=\"ornament\"/></div>\n"
                    )),
                    (SceneBreakStyle::Space, _) => html.push_str("<div class=\"scene-break space\"></div>\n"),
                    _ => html.push_str(&format!("<p class=\"scene-break\">{}</p>\n", esc(if st.scene_glyph.trim().is_empty() { "* * *" } else { st.scene_glyph.trim() }))),
                }
                after_break = st.no_indent_after_heading;
                first = false;
            }
        }
    }
    html
}

fn page(lang: &str, title: &str, body: &str, epub_type: &str) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" xml:lang=\"{lang}\" lang=\"{lang}\">\n<head>\n<meta charset=\"UTF-8\"/>\n<title>{}</title>\n<link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/>\n</head>\n<body epub:type=\"{epub_type}\">\n{body}</body>\n</html>\n",
        esc(title)
    )
}

fn css(book: &Book, fonts: &[(String, String, bool, bool)]) -> String {
    let st = &book.style;
    let mut c = String::new();
    for (family, file, bold, italic) in fonts {
        c.push_str(&format!(
            "@font-face {{ font-family: \"{family}\"; src: url(\"fonts/{file}\"); font-weight: {}; font-style: {}; }}\n",
            if *bold { "bold" } else { "normal" },
            if *italic { "italic" } else { "normal" }
        ));
    }
    let align = match st.align {
        BodyAlign::Justify => "justify",
        BodyAlign::Left => "left",
    };
    let halign = match st.heading_align {
        HAlign::Left => "left",
        HAlign::Center => "center",
        HAlign::Right => "right",
    };
    let serif = |f: &str| match crate::fonts::family_kind(f) {
        "Sans serif" => "sans-serif",
        _ => "serif",
    };
    c.push_str(&format!(
        "body {{ font-family: \"{bf}\", {bs}; line-height: {lh}; margin: 0 1em; }}\n\
p {{ margin: 0; text-indent: {ind}em; text-align: {align}; margin-top: {pg}em; }}\n\
p.first, p.centered {{ text-indent: 0; }}\n\
p.centered {{ text-align: center; }}\n\
blockquote {{ margin: 0.8em 2em; }}\n\
blockquote p {{ text-indent: 0; }}\n\
.chapter-head {{ text-align: {halign}; margin: {sink}em 0 {gap}em 0; page-break-before: always; }}\n\
.chapter-number {{ font-family: \"{nf}\", {ns}; font-size: {ns_em}em; color: {ncol}; text-indent: 0; text-align: {halign}; {nupper} margin: 0 0 0.4em 0; }}\n\
h1.chapter-title {{ font-family: \"{hf}\", {hs}; font-size: {ts_em}em; font-weight: normal; color: {tcol}; {tupper} {titalic} margin: 0; line-height: 1.2; }}\n\
.chapter-subtitle {{ font-style: italic; text-indent: 0; text-align: {halign}; margin-top: 0.4em; }}\n\
.pov {{ text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.85em; text-indent: 0; text-align: {halign}; margin-top: 0.8em; }}\n\
h2, h3, h4 {{ font-family: \"{hf}\", {hs}; font-weight: normal; text-align: {halign}; margin: 1.2em 0 0.6em 0; }}\n\
h2 {{ font-size: 1.5em; }} h3 {{ font-size: 1.2em; }}\n\
.scene-break {{ text-align: center; text-indent: 0; margin: 1em 0; }}\n\
.scene-break.space {{ height: 1.5em; }}\n\
img.ornament {{ height: {orn_h}em; width: auto; }}\n\
.chapter-ornament {{ text-align: {halign}; margin-bottom: 0.8em; }}\n\
.dropcap {{ float: left; font-family: \"{hf}\", {hs}; font-size: {dcs}em; line-height: 0.85; margin: 0.05em 0.08em 0 0; color: {dccol}; }}\n\
.lead {{ font-variant: small-caps; letter-spacing: 0.04em; }}\n\
.titlepage {{ text-align: center; margin-top: 20%; }}\n\
.titlepage .title {{ font-family: \"{hf}\", {hs}; font-size: 2.2em; {tupper} margin: 0; text-indent: 0; text-align: center; }}\n\
.titlepage .subtitle {{ font-style: italic; font-size: 1.2em; margin-top: 0.6em; text-indent: 0; text-align: center; }}\n\
.titlepage .author {{ font-family: \"{hf}\", {hs}; font-size: 1.3em; margin-top: 3em; text-indent: 0; text-align: center; }}\n\
.titlepage .publisher {{ font-size: 0.85em; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 4em; text-indent: 0; text-align: center; }}\n\
.copyright p {{ text-indent: 0; text-align: left; font-size: 0.8em; margin-bottom: 0.6em; }}\n\
.centered-page {{ margin-top: 25%; text-align: center; font-style: italic; }}\n\
nav ol {{ list-style: none; padding-left: 0; }} nav ol ol {{ padding-left: 1.5em; }}\n\
.contents li {{ margin: 0.3em 0; }}\n\
a {{ color: inherit; text-decoration: none; }}\n",
        bf = st.body_font,
        bs = serif(&st.body_font),
        lh = st.line_height,
        ind = st.first_indent_em,
        pg = st.paragraph_spacing_em,
        sink = (st.sink_lines * 0.5).clamp(0.0, 8.0),
        gap = st.opener_gap_em.clamp(0.5, 6.0),
        nf = st.number_font,
        ns = serif(&st.number_font),
        ns_em = st.number_scale,
        ncol = st.number_color,
        nupper = if st.number_uppercase { "text-transform: uppercase; letter-spacing: 0.12em;" } else { "" },
        hf = st.heading_font,
        hs = serif(&st.heading_font),
        ts_em = st.title_scale,
        tcol = st.title_color,
        tupper = if st.title_uppercase { "text-transform: uppercase; letter-spacing: 0.06em;" } else { "" },
        titalic = if st.title_italic { "font-style: italic;" } else { "" },
        orn_h = (1.4 * st.ornament_scale).clamp(0.6, 4.0),
        dcs = (st.drop_cap_lines.clamp(2, 5) as f32 * 1.05 + 0.4),
        dccol = st.drop_cap_color,
    ));
    c
}

pub struct EpubResult {
    pub bytes: Vec<u8>,
    pub files: usize,
}

pub fn write(book: &Book, target: EbookTarget) -> Result<EpubResult, String> {
    let m = &book.meta;
    let lang = lang_tag(&m.language);
    let title = if m.title.trim().is_empty() { "Untitled".to_string() } else { m.title.trim().to_string() };
    let st = &book.style;
    let mut files: Vec<(String, Vec<u8>, String, String)> = Vec::new(); // path, data, media type, id
    let mut spine: Vec<String> = Vec::new();
    let mut nav: Vec<(String, String, u8)> = Vec::new(); // title, href, level
    let scene_img = if st.scene_break == SceneBreakStyle::Ornament && st.scene_ornament != "none" {
        files.push(("images/scene-break.svg".into(), crate::ornaments::svg(&st.scene_ornament, &st.ornament_color).into_bytes(), "image/svg+xml".into(), "img-scene".into()));
        Some("images/scene-break.svg")
    } else {
        None
    };
    let chapter_img = if st.chapter_ornament != "none" {
        files.push(("images/chapter-ornament.svg".into(), crate::ornaments::svg(&st.chapter_ornament, &st.ornament_color).into_bytes(), "image/svg+xml".into(), "img-chapter".into()));
        Some("images/chapter-ornament.svg")
    } else {
        None
    };
    let add_page = |files: &mut Vec<(String, Vec<u8>, String, String)>, spine: &mut Vec<String>, name: String, html: String| {
        let id = name.trim_end_matches(".xhtml").replace('/', "-");
        files.push((name, html.into_bytes(), "application/xhtml+xml".into(), id.clone()));
        spine.push(id);
    };
    // Front matter
    for (i, s) in book.front.iter().enumerate() {
        let name = format!("front-{i:02}.xhtml");
        let html = match s.kind {
            SectionKind::TitlePage => {
                let mut b = String::from("<section class=\"titlepage\" epub:type=\"titlepage\">\n");
                b.push_str(&format!("<p class=\"title\">{}</p>\n", esc(&title)));
                if !m.subtitle.trim().is_empty() {
                    b.push_str(&format!("<p class=\"subtitle\">{}</p>\n", esc(&m.subtitle)));
                }
                if !m.author.trim().is_empty() {
                    b.push_str(&format!("<p class=\"author\">{}</p>\n", esc(&m.author)));
                }
                if !m.publisher.trim().is_empty() {
                    b.push_str(&format!("<p class=\"publisher\">{}</p>\n", esc(&m.publisher)));
                }
                b.push_str("</section>\n");
                page(&lang, &title, &b, "frontmatter")
            }
            SectionKind::Copyright => {
                let mut b = String::from("<section class=\"copyright\" epub:type=\"copyright-page\">\n");
                b.push_str(&format!("<p>{}</p>\n", esc(&title)));
                if !m.author.trim().is_empty() {
                    b.push_str(&format!("<p>Copyright © {} {}</p>\n", esc(m.year.trim()), esc(m.author.trim())));
                }
                for l in s.text.lines().map(str::trim).filter(|l| !l.is_empty()) {
                    b.push_str(&format!("<p>{}</p>\n", inline(&markup::parse_inline(l, book.smart_quotes))));
                }
                for (label, v) in [("Paperback ISBN", &m.isbn_paperback), ("Hardcover ISBN", &m.isbn_hardcover), ("Ebook ISBN", &m.isbn_ebook)] {
                    if !v.trim().is_empty() {
                        b.push_str(&format!("<p>{label}: {}</p>\n", esc(v.trim())));
                    }
                }
                if !m.edition.trim().is_empty() {
                    b.push_str(&format!("<p>{}</p>\n", esc(m.edition.trim())));
                }
                if !m.publisher.trim().is_empty() {
                    b.push_str(&format!("<p>Published by {}</p>\n", esc(m.publisher.trim())));
                }
                b.push_str("</section>\n");
                page(&lang, "Copyright", &b, "frontmatter")
            }
            SectionKind::Dedication | SectionKind::Epigraph => {
                let t = if s.kind == SectionKind::Dedication { "dedication" } else { "epigraph" };
                let body = format!("<section class=\"centered-page\" epub:type=\"{t}\">\n{}</section>\n", blocks_html(book, &s.text, false, FirstParagraph::Plain, true, scene_img));
                page(&lang, s.kind.label(), &body, "frontmatter")
            }
            SectionKind::Contents => {
                if !book.ebook.contents_page {
                    continue;
                }
                // filled in below once the chapter files are known
                String::from("__CONTENTS__")
            }
            _ => {
                let t = book.display_title(s, None);
                let body = format!(
                    "<section epub:type=\"preface\">\n<header class=\"chapter-head\"><h1 class=\"chapter-title\">{}</h1></header>\n{}</section>\n",
                    esc(&t),
                    blocks_html(book, &s.text, false, FirstParagraph::Plain, false, scene_img)
                );
                if s.in_contents {
                    nav.push((t.clone(), name.clone(), 2));
                }
                page(&lang, &t, &body, "frontmatter")
            }
        };
        add_page(&mut files, &mut spine, name, html);
    }
    // Body
    let numbers = book.numbers();
    let mut first_chapter_href = None;
    for (i, s) in book.body.iter().enumerate() {
        let name = format!("chapter-{:03}.xhtml", i + 1);
        let n = numbers[i];
        let label = book.number_label(s, n);
        let disp = book.display_title(s, n);
        let mut head = String::from("<header class=\"chapter-head\">\n");
        if let Some(src) = chapter_img {
            head.push_str(&format!("<div class=\"chapter-ornament\"><img src=\"{src}\" alt=\"\" class=\"ornament\"/></div>\n"));
        }
        let has_title = !s.title.trim().is_empty();
        match st.heading_layout {
            HeadingLayout::NumberAboveTitle => {
                head.push_str(&format!("<p class=\"chapter-number\">{}</p>\n", esc(&label)));
                if has_title {
                    head.push_str(&format!("<h1 class=\"chapter-title\">{}</h1>\n", esc(s.title.trim())));
                }
            }
            HeadingLayout::NumberOnly => head.push_str(&format!("<h1 class=\"chapter-title\">{}</h1>\n", esc(&label))),
            HeadingLayout::TitleOnly => head.push_str(&format!("<h1 class=\"chapter-title\">{}</h1>\n", esc(&disp))),
            HeadingLayout::Inline => {
                let t = if has_title { format!("{label}: {}", s.title.trim()) } else { label.clone() };
                head.push_str(&format!("<h1 class=\"chapter-title\">{}</h1>\n", esc(&t)));
            }
        }
        if !s.subtitle.trim().is_empty() {
            head.push_str(&format!("<p class=\"chapter-subtitle\">{}</p>\n", esc(s.subtitle.trim())));
        }
        if st.show_pov && !s.pov.trim().is_empty() {
            head.push_str(&format!("<p class=\"pov\">{}</p>\n", esc(s.pov.trim())));
        }
        head.push_str("</header>\n");
        let (dc, lead) = if s.kind == SectionKind::Part { (false, FirstParagraph::Plain) } else { (st.drop_cap && s.drop_cap, st.first_paragraph) };
        let body = blocks_html(book, &s.text, dc, lead, s.kind == SectionKind::Part, scene_img);
        let et = match s.kind {
            SectionKind::Part => "part",
            SectionKind::Prologue => "prologue",
            SectionKind::Epilogue => "epilogue",
            _ => "chapter",
        };
        let html = page(&lang, &disp, &format!("<section epub:type=\"{et}\">\n{head}{body}</section>\n"), "bodymatter");
        if s.in_contents {
            let level = match s.kind {
                SectionKind::Part => 0,
                SectionKind::Chapter => 1,
                _ => 2, // prologue, epilogue...: not inside a part
            };
            nav.push((disp.clone(), name.clone(), level));
        }
        if first_chapter_href.is_none() {
            first_chapter_href = Some(name.clone());
        }
        add_page(&mut files, &mut spine, name, html);
    }
    // Back matter
    for (i, s) in book.back.iter().enumerate() {
        let name = format!("back-{i:02}.xhtml");
        let t = book.display_title(s, None);
        let body = format!(
            "<section epub:type=\"{}\">\n<header class=\"chapter-head\"><h1 class=\"chapter-title\">{}</h1></header>\n{}</section>\n",
            match s.kind {
                SectionKind::Acknowledgements => "acknowledgments",
                SectionKind::Afterword => "afterword",
                _ => "backmatter",
            },
            esc(&t),
            blocks_html(book, &s.text, false, FirstParagraph::Plain, s.kind == SectionKind::AlsoBy, scene_img)
        );
        if s.in_contents {
            nav.push((t.clone(), name.clone(), 2));
        }
        add_page(&mut files, &mut spine, name, page(&lang, &t, &body, "backmatter"));
    }
    // Contents page (in the book) and the reader's navigation
    let first_href = first_chapter_href
        .clone()
        .or_else(|| files.iter().find(|f| f.0.ends_with(".xhtml")).map(|f| f.0.clone()))
        .unwrap_or_else(|| "nav.xhtml".into());
    if nav.is_empty() {
        nav.push((title.clone(), first_href.clone(), 2)); // a nav needs at least one entry
    }
    // level 0 = part (nested list only when chapters follow), 1 = chapter, 2 = top-level entry
    let mut list = String::from("<ol>\n");
    let mut in_part = false;
    for (k, (t, href, level)) in nav.iter().enumerate() {
        if *level != 1 && in_part {
            list.push_str("</ol></li>\n");
            in_part = false;
        }
        if *level == 0 && nav.get(k + 1).map(|n| n.2 == 1).unwrap_or(false) {
            list.push_str(&format!("<li><a href=\"{href}\">{}</a><ol>\n", esc(t)));
            in_part = true;
        } else {
            list.push_str(&format!("<li><a href=\"{href}\">{}</a></li>\n", esc(t)));
        }
    }
    if in_part {
        list.push_str("</ol></li>\n");
    }
    list.push_str("</ol>\n");
    let contents_title = book.terms.contents.clone();
    for f in files.iter_mut() {
        if f.1 == b"__CONTENTS__" {
            let body = format!(
                "<nav class=\"contents\" epub:type=\"toc\">\n<header class=\"chapter-head\"><h1 class=\"chapter-title\">{}</h1></header>\n{list}</nav>\n",
                esc(&contents_title)
            );
            f.1 = page(&lang, &contents_title, &body, "frontmatter").into_bytes();
        }
    }
    let nav_doc = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" xml:lang=\"{lang}\" lang=\"{lang}\">\n<head><meta charset=\"UTF-8\"/><title>{ct}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/></head>\n<body>\n<nav epub:type=\"toc\" id=\"toc\"><h1>{ct}</h1>\n{list}</nav>\n<nav epub:type=\"landmarks\" hidden=\"hidden\"><ol><li><a epub:type=\"bodymatter\" href=\"{first_href}\">Start</a></li></ol></nav>\n</body>\n</html>\n",
        ct = esc(&contents_title)
    );
    // NCX
    let uid = if !m.isbn_ebook.trim().is_empty() { format!("urn:isbn:{}", m.isbn_ebook.trim().replace(['-', ' '], "")) } else { format!("urn:uuid:{}", uuidish(&book.id)) };
    let mut ncx = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\">\n<head><meta name=\"dtb:uid\" content=\"{}\"/><meta name=\"dtb:depth\" content=\"2\"/><meta name=\"dtb:totalPageCount\" content=\"0\"/><meta name=\"dtb:maxPageNumber\" content=\"0\"/></head>\n<docTitle><text>{}</text></docTitle>\n<navMap>\n",
        esc(&uid),
        esc(&title)
    );
    for (k, (t, href, _)) in nav.iter().enumerate() {
        ncx.push_str(&format!("<navPoint id=\"np{k}\" playOrder=\"{}\"><navLabel><text>{}</text></navLabel><content src=\"{href}\"/></navPoint>\n", k + 1, esc(t)));
    }
    ncx.push_str("</navMap>\n</ncx>\n");
    // Fonts
    let mut font_files: Vec<(String, String, bool, bool)> = Vec::new();
    if book.ebook.embed_fonts {
        let mut fams = vec![st.body_font.clone()];
        for f in [&st.heading_font, &st.number_font] {
            if !fams.contains(f) {
                fams.push(f.clone());
            }
        }
        for fam in fams {
            for fd in crate::fonts::faces().iter().filter(|f| f.family == fam) {
                let path = format!("fonts/{}", fd.file);
                files.push((path, fd.bytes.to_vec(), "font/ttf".into(), format!("font-{}", fd.file.trim_end_matches(".ttf"))));
                font_files.push((fam.clone(), fd.file.to_string(), fd.bold, fd.italic));
            }
        }
    }
    files.push(("style.css".into(), css(book, &font_files).into_bytes(), "text/css".into(), "css".into()));
    files.push(("nav.xhtml".into(), nav_doc.into_bytes(), "application/xhtml+xml".into(), "nav".into()));
    files.push(("toc.ncx".into(), ncx.into_bytes(), "application/x-dtbncx+xml".into(), "ncx".into()));
    // Package
    let modified = iso_now();
    let mut manifest = String::new();
    for (path, _, mt, id) in &files {
        let props = if id == "nav" {
            " properties=\"nav\""
        } else {
            ""
        };
        manifest.push_str(&format!("<item id=\"{id}\" href=\"{}\" media-type=\"{mt}\"{props}/>\n", esc(path)));
    }
    let mut spine_s = String::new();
    for id in &spine {
        spine_s.push_str(&format!("<itemref idref=\"{id}\"/>\n"));
    }
    let apple_prefix = if target == EbookTarget::Apple { " prefix=\"ibooks: http://vocabulary.itunes.apple.com/rdf/ibooks/vocabulary-extensions-1.0/\"" } else { "" };
    let apple_meta = if target == EbookTarget::Apple && book.ebook.embed_fonts { "<meta property=\"ibooks:specified-fonts\">true</meta>\n" } else { "" };
    let mut extra_meta = String::new();
    if !m.publisher.trim().is_empty() {
        extra_meta.push_str(&format!("<dc:publisher>{}</dc:publisher>\n", esc(m.publisher.trim())));
    }
    if !m.description.trim().is_empty() {
        extra_meta.push_str(&format!("<dc:description>{}</dc:description>\n", esc(m.description.trim())));
    }
    for k in m.keywords.split(',').map(str::trim).filter(|k| !k.is_empty()) {
        extra_meta.push_str(&format!("<dc:subject>{}</dc:subject>\n", esc(k)));
    }
    if !m.year.trim().is_empty() {
        extra_meta.push_str(&format!("<dc:date>{}</dc:date>\n", esc(m.year.trim())));
    }
    if !m.series.trim().is_empty() {
        extra_meta.push_str(&format!(
            "<meta property=\"belongs-to-collection\" id=\"series\">{}</meta>\n<meta refines=\"#series\" property=\"collection-type\">series</meta>\n",
            esc(m.series.trim())
        ));
        if !m.series_number.trim().is_empty() {
            extra_meta.push_str(&format!("<meta refines=\"#series\" property=\"group-position\">{}</meta>\n", esc(m.series_number.trim())));
        }
    }
    let creator = if m.author.trim().is_empty() { String::new() } else { format!("<dc:creator>{}</dc:creator>\n", esc(m.author.trim())) };
    let opf = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"bookid\" xml:lang=\"{lang}\"{apple_prefix}>\n<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n<dc:identifier id=\"bookid\">{}</dc:identifier>\n<dc:title>{}</dc:title>\n{creator}<dc:language>{lang}</dc:language>\n{extra_meta}<meta property=\"dcterms:modified\">{modified}</meta>\n{apple_meta}</metadata>\n<manifest>\n{manifest}</manifest>\n<spine toc=\"ncx\">\n{spine_s}</spine>\n</package>\n",
        esc(&uid),
        esc(&title)
    );
    // Zip it (the mimetype must come first, uncompressed)
    let mut zw = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let stored = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let e = |r: zip::result::ZipResult<()>| r.map_err(|e| e.to_string());
    e(zw.start_file("mimetype", stored))?;
    zw.write_all(b"application/epub+zip").map_err(|e| e.to_string())?;
    e(zw.start_file("META-INF/container.xml", deflated))?;
    zw.write_all(b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">\n<rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles>\n</container>\n").map_err(|e| e.to_string())?;
    e(zw.start_file("OEBPS/content.opf", deflated))?;
    zw.write_all(opf.as_bytes()).map_err(|e| e.to_string())?;
    let n = files.len();
    for (path, data, _, _) in &files {
        e(zw.start_file(format!("OEBPS/{path}"), deflated))?;
        zw.write_all(data).map_err(|e| e.to_string())?;
    }
    let cur = zw.finish().map_err(|e| e.to_string())?;
    Ok(EpubResult { bytes: cur.into_inner(), files: n + 3 })
}

fn uuidish(id: &str) -> String {
    let mut h: u128 = 0xcbf2_9ce4_8422_2325;
    for b in id.bytes() {
        h ^= b as u128;
        h = h.wrapping_mul(0x1000_0000_0000_0000_0000_0000_013B);
    }
    let s = format!("{h:032x}");
    format!("{}-{}-4{}-a{}-{}", &s[0..8], &s[8..12], &s[13..16], &s[17..20], &s[20..32])
}

fn iso_now() -> String {
    let t = now_secs();
    let days = (t / 86_400) as i64;
    let rem = t % 86_400;
    let d = today_from_days(days);
    format!("{d}T{:02}:{:02}:{:02}Z", rem / 3600, (rem % 3600) / 60, rem % 60)
}

fn today_from_days(days: i64) -> String {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("{:04}-{:02}-{:02}", if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn parts(bytes: &[u8]) -> Vec<(String, String)> {
        let mut ar = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut out = Vec::new();
        for i in 0..ar.len() {
            let mut f = ar.by_index(i).unwrap();
            let name = f.name().unwrap().to_string();
            if [".xhtml", ".opf", ".ncx", ".xml", ".svg"].iter().any(|e| name.ends_with(e)) {
                let mut s = String::new();
                f.read_to_string(&mut s).unwrap();
                out.push((name, s));
            }
        }
        out
    }

    fn parse(s: &str) -> Result<roxmltree::Document<'_>, roxmltree::Error> {
        roxmltree::Document::parse_with_options(s, roxmltree::ParsingOptions { allow_dtd: true, ..Default::default() })
    }

    fn assert_well_formed(bytes: &[u8]) -> Vec<(String, String)> {
        let ps = parts(bytes);
        for (n, s) in &ps {
            let d = parse(s).unwrap_or_else(|e| panic!("{n}: {e}"));
            for ol in d.descendants().filter(|x| x.has_tag_name("ol")) {
                assert!(ol.children().any(|c| c.has_tag_name("li")), "{n}: empty <ol>");
            }
        }
        ps
    }

    #[test]
    fn well_formed_with_hostile_metadata_and_empty_part() {
        let mut b = Book::default();
        b.meta.title = "Bad\u{0}Title & Co".into();
        b.meta.author = "  ".into();
        b.meta.language = "en&<x>".into();
        b.meta.isbn_paperback = "111".into();
        b.meta.edition = "Second edition".into();
        b.front.push(Section::new(SectionKind::Copyright, ""));
        b.front.push(Section::new(SectionKind::Contents, ""));
        let mut c = Section::new(SectionKind::Chapter, "One\u{1}");
        c.text = "Nul\u{0} here & there.".into();
        b.body.push(c);
        b.body.push(Section::new(SectionKind::Part, "Lonely part"));
        b.back.push(Section::new(SectionKind::Acknowledgements, ""));
        let r = write(&b, EbookTarget::Generic).unwrap();
        let ps = assert_well_formed(&r.bytes);
        let get = |n: &str| ps.iter().find(|p| p.0.ends_with(n)).unwrap().1.clone();
        let opf = get("content.opf");
        assert!(!opf.contains("dc:creator"));
        assert!(opf.contains("<dc:language>en</dc:language>"));
        assert!(!opf.contains('\u{0}'));
        let copy = get("front-00.xhtml");
        assert!(copy.contains("Paperback ISBN: 111") && copy.contains("Second edition"));
        // back matter is not nested under the childless last part
        let nav = parse(&get("nav.xhtml")).unwrap().descendants().filter(|n| n.has_tag_name("li")).count();
        assert_eq!(nav, 4); // 3 entries + the landmarks link
        let mut b2 = b.clone();
        b2.meta.title = " ".into();
        b2.meta.language = "pt_BR".into();
        let ps = assert_well_formed(&write(&b2, EbookTarget::Generic).unwrap().bytes);
        let opf = &ps.iter().find(|p| p.0.ends_with("content.opf")).unwrap().1;
        assert!(opf.contains("<dc:title>Untitled</dc:title>") && opf.contains("<dc:language>pt-BR</dc:language>"));
    }

    #[test]
    fn empty_book_has_a_nav_entry() {
        let ps = assert_well_formed(&write(&Book::default(), EbookTarget::Kindle).unwrap().bytes);
        let ncx = &ps.iter().find(|p| p.0.ends_with("toc.ncx")).unwrap().1;
        assert!(ncx.contains("<navPoint"));
    }

    #[test]
    fn front_section_respects_in_contents() {
        let mut b = Book::default();
        let mut f = Section::new(SectionKind::Foreword, "");
        f.in_contents = false;
        b.front.push(f);
        b.body.push(Section::new(SectionKind::Chapter, "Only"));
        let ps = assert_well_formed(&write(&b, EbookTarget::Generic).unwrap().bytes);
        let nav = &ps.iter().find(|p| p.0.ends_with("nav.xhtml")).unwrap().1;
        assert!(!nav.contains("front-00") && nav.contains("chapter-001"));
    }

    #[test]
    fn drop_cap_spans_and_no_indent_setting() {
        let sp = |t: &str, bold| Span { text: t.into(), bold, italic: false };
        let out = first_para(&[sp("“", false), sp("Wait", true)], true, FirstParagraph::Plain, 3);
        assert!(out.contains(">“W</span>") && out.ends_with("<strong>ait</strong>"), "{out}");
        let mut b = Book::default();
        b.style.no_indent_after_heading = false;
        let h = blocks_html(&b, "## Sub\n\nText", false, FirstParagraph::Plain, false, None);
        assert!(!h.contains("class=\"first\""), "{h}");
        b.style.no_indent_after_heading = true;
        let h = blocks_html(&b, "## Sub\n\nText", false, FirstParagraph::Plain, false, None);
        assert!(h.contains("class=\"first\""), "{h}");
    }
}
