//! Typesetting: turns a book into printed pages (positions in points, y measured down
//! from the top of the trimmed page). The same pages feed the on-screen preview and the
//! PDF export, so what you see is what gets printed.

use crate::fonts::{self, metrics};
use crate::markup::{self, Block, Span};
use crate::model::*;

mod furniture;
mod measure;
mod notes;
mod openers;
mod pages;
mod paragraph;
mod table;

pub const PT_PER_IN: f32 = 72.0;
pub const PT_PER_MM: f32 = 72.0 / 25.4;
/// Running heads and page numbers are this many times the body size.
pub const FURNITURE_SCALE: f32 = 0.8;
/// Running-head baseline, as a share of the top margin from the trim edge.
pub const HEADER_DROP: f32 = 0.55;
/// Folio baseline, as a share of the bottom margin up from the trim edge.
pub const FOLIO_RISE: f32 = 0.5;
/// Gap from the running head's baseline to its rule.
pub const HEADER_RULE_GAP_PT: f32 = 2.0 * PT_PER_MM;
/// Body size used by the large-print export (points).
pub const LARGE_PRINT_SIZE: f32 = crate::themes::LARGE_PRINT_BODY_PT;
/// Image captions are this many times the body size.
pub const CAPTION_SCALE: f32 = 0.85;
/// Images printing at fewer pixels per inch than this get a warning.
pub const MIN_IMAGE_DPI: f32 = 200.0;
/// Tables are set at this many times the body size and leading.
pub const TABLE_SCALE: f32 = 0.9;
/// Footnotes are set at this many times the body size and leading.
pub const NOTE_SCALE: f32 = 0.8;
/// Footnote numbers are this many times the size of the text they sit in...
pub const NOTE_REF_SCALE: f32 = 0.65;
/// ...raised by this many times their own size.
pub const NOTE_REF_RISE: f32 = 0.6;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
pub enum Item {
    Text { x: f32, y: f32, size: f32, face: usize, text: String, color: [u8; 3], spacing: f32, slant: bool },
    Line { x1: f32, y1: f32, x2: f32, y2: f32, width: f32, color: [u8; 3] },
    Ornament { key: String, x: f32, y: f32, w: f32, h: f32, color: [u8; 3] },
    /// A file in the book's `images/` folder (`Doc::book_id`), top-left at x, y.
    Image { src: String, x: f32, y: f32, w: f32, h: f32 },
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Page {
    pub items: Vec<Item>,
    pub folio: Option<String>,
    pub recto: bool,
    pub section: Option<(Area, usize)>,
    pub blank: bool,
    pub opener: bool,
    pub front: bool,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct TocEntry {
    pub title: String,
    pub folio: String,
    pub level: u8,
}

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct Doc {
    pub w: f32,
    pub h: f32,
    pub pages: Vec<Page>,
    pub toc: Vec<TocEntry>,
    /// Page index where each section starts.
    pub starts: Vec<((Area, usize), usize)>,
    /// Problems worth telling the person about (e.g. characters no bundled font has).
    #[serde(default)]
    pub warnings: Vec<String>,
    /// The book's language (as in its details), for the PDF.
    #[serde(default)]
    pub lang: String,
    /// The book the pages came from, whose images folder the image items name.
    #[serde(default)]
    pub book_id: String,
}

impl Doc {
    pub fn page_of(&self, area: Area, idx: usize) -> Option<usize> {
        self.starts.iter().find(|(k, _)| *k == (area, idx)).map(|(_, p)| *p)
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Opts {
    pub large_print: bool,
}

pub fn hex_rgb(s: &str) -> [u8; 3] {
    let t = s.trim().trim_start_matches('#');
    if t.len() == 6 {
        if let Ok(v) = u32::from_str_radix(t, 16) {
            return [(v >> 16) as u8, (v >> 8) as u8, v as u8];
        }
    }
    if t.len() == 3 {
        let c: Vec<u8> = t.chars().filter_map(|c| c.to_digit(16)).map(|d| (d * 17) as u8).collect();
        if c.len() == 3 {
            return [c[0], c[1], c[2]];
        }
    }
    [0x1a, 0x1a, 0x1a]
}

const INK: [u8; 3] = [0x1a, 0x1a, 0x1a];

/// Text items for a string, split into runs of faces that have its glyphs.
#[allow(clippy::too_many_arguments)]
fn push_text(items: &mut Vec<Item>, x: f32, y: f32, size: f32, face: usize, text: &str, color: [u8; 3], spacing: f32, slant: bool) {
    let mut x = x;
    for (face, text) in fonts::segments(face, text) {
        let adv = metrics()[face].width(&text, size) + spacing * text.chars().count() as f32;
        items.push(Item::Text { x, y, size, face, text, color, spacing, slant });
        x += adv;
    }
}

#[derive(Clone, Debug)]
struct Run {
    text: String,
    face: usize,
    size: f32,
    color: [u8; 3],
    slant: bool,
    dx: f32,
    /// The footnote this (raised) number calls.
    note: Option<u32>,
}

#[derive(Clone, Debug)]
struct Word {
    runs: Vec<Run>,
    width: f32,
}

impl Word {
    fn push(&mut self, text: &str, face: usize, size: f32, color: [u8; 3], slant: bool) {
        if text.is_empty() {
            return;
        }
        let w = metrics()[face].width(text, size);
        self.runs.push(Run { text: text.to_string(), face, size, color, slant, dx: self.width, note: None });
        self.width += w;
    }

    /// Push text in the style of `r` (keeping a footnote number a footnote number).
    fn push_like(&mut self, text: &str, r: &Run) {
        self.push(text, r.face, r.size, r.color, r.slant);
        if let Some(last) = self.runs.last_mut().filter(|_| !text.is_empty()) {
            last.note = r.note;
        }
    }
}

#[derive(Clone)]
struct Line {
    words: Vec<Word>,
    width: f32,
    indent: f32,
    last: bool,
}

#[derive(Clone, Copy)]
struct Faces {
    regular: usize,
    italic: usize,
    bold: usize,
    bold_italic: usize,
    italic_fake: bool,
}

fn faces_for(family: &str) -> Faces {
    Faces {
        regular: fonts::face_index(family, false, false),
        italic: fonts::face_index(family, false, true),
        bold: fonts::face_index(family, true, false),
        bold_italic: fonts::face_index(family, true, true),
        italic_fake: !fonts::has_style(family, false, true),
    }
}

impl Faces {
    fn pick(&self, bold: bool, italic: bool) -> (usize, bool) {
        match (bold, italic) {
            (false, false) => (self.regular, false),
            (false, true) => (self.italic, self.italic_fake),
            (true, false) => (self.bold, false),
            (true, true) => (self.bold_italic, self.italic_fake),
        }
    }
}

struct Typesetter<'a> {
    book: &'a Book,
    st: StyleProfile,
    w: f32,
    h: f32,
    top: f32,
    bottom: f32,
    inside: f32,
    outside: f32,
    base: f32,
    leading: f32,
    body: Faces,
    heading: Faces,
    number: Faces,
    pages: Vec<Page>,
    y: f32,
    starts: Vec<((Area, usize), usize)>,
    toc: Vec<TocEntry>,
    /// Folios from a previous pass, for the contents page.
    known_toc: Vec<TocEntry>,
    running_title: Vec<String>,
    body_started_at: Option<usize>,
    space_w: f32,
    /// Lines still to set beside a drop cap (it can be taller than its paragraph).
    wrap_left: usize,
    wrap_w: f32,
    /// This section's footnotes, set into lines, until their first reference is placed.
    notes: Vec<Option<Vec<Line>>>,
    /// Footnote lines owed to the foot of the current page.
    foot: Vec<Line>,
    warnings: Vec<String>,
}

impl<'a> Typesetter<'a> {
    fn new(book: &'a Book, opts: Opts) -> Self {
        let mut st = book.style.clone();
        if opts.large_print {
            st.base_size_pt = st.base_size_pt.max(LARGE_PRINT_SIZE);
            st.line_height = st.line_height.max(crate::themes::LARGE_PRINT_LINE_HEIGHT);
            st.align = BodyAlign::Left;
            st.drop_cap = false;
        }
        let pr = &book.print;
        let w = pr.trim_w_in.clamp(3.0, 12.0) * PT_PER_IN;
        let h = pr.trim_h_in.clamp(4.0, 14.0) * PT_PER_IN;
        let clamp_m = |v: f32| (v.clamp(0.2, 2.0)) * PT_PER_IN;
        // margins shrink (in proportion) to leave a text block of at least 1 in x 1 in
        let fit = |a: f32, b: f32, room: f32| {
            let (a, b) = (clamp_m(a), clamp_m(b));
            let k = ((room - PT_PER_IN) / (a + b)).min(1.0);
            (a * k, b * k)
        };
        let (inside, outside) = fit(pr.margin_inside_in, pr.margin_outside_in, w);
        let (top, bottom) = fit(pr.margin_top_in, pr.margin_bottom_in, h);
        let base = st.base_size_pt.clamp(6.0, 30.0);
        let leading = base * st.line_height.clamp(1.0, 2.5);
        let body = faces_for(&st.body_font);
        let space_w = metrics()[body.regular].char_width(' ', base);
        Typesetter {
            book,
            w,
            h,
            top,
            bottom,
            inside,
            outside,
            base,
            leading,
            body,
            heading: faces_for(&st.heading_font),
            number: faces_for(&st.number_font),
            st,
            pages: Vec::new(),
            y: 0.0,
            starts: Vec::new(),
            toc: Vec::new(),
            known_toc: Vec::new(),
            running_title: Vec::new(),
            body_started_at: None,
            space_w,
            wrap_left: 0,
            wrap_w: 0.0,
            notes: Vec::new(),
            foot: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn warn(&mut self, w: String) {
        if !self.warnings.contains(&w) {
            self.warnings.push(w);
        }
    }

    fn text_width(&self) -> f32 {
        (self.w - self.inside - self.outside).max(72.0)
    }
    fn left(&self) -> f32 {
        if self.pages.last().map(|p| p.recto).unwrap_or(true) {
            self.inside
        } else {
            self.outside
        }
    }
    /// Where text must end: the bottom margin, less the footnotes queued for this page.
    fn text_bottom(&self) -> f32 {
        self.h - self.bottom - self.foot_height(self.foot.len())
    }
    fn page(&mut self) -> &mut Page {
        self.pages.last_mut().expect("a page")
    }

    fn new_page(&mut self, section: Option<(Area, usize)>, opener: bool, front: bool) {
        self.flush_notes();
        let recto = self.pages.len().is_multiple_of(2);
        self.pages.push(Page { items: Vec::new(), folio: None, recto, section, blank: false, opener, front });
        self.running_title.push(String::new());
        self.y = self.top;
        self.wrap_left = 0;
    }

    /// Start the next page on a right-hand page, leaving a blank left-hand page if needed.
    fn ensure_recto(&mut self, front: bool) {
        if self.pages.len() % 2 == 1 {
            self.new_page(None, false, front);
            self.page().blank = true;
        }
    }

    /// Continue the current section on a new page (same section, matter and running head).
    fn continue_page(&mut self) {
        let sec = self.pages.last().and_then(|p| p.section);
        let front = self.pages.last().map(|p| p.front).unwrap_or(false);
        let title = self.running_title.last().cloned().unwrap_or_default();
        self.new_page(sec, false, front);
        if let Some(t) = self.running_title.last_mut() {
            *t = title;
        }
    }

    fn start_section(&mut self, key: (Area, usize), recto: bool, front: bool) {
        if recto {
            self.ensure_recto(front);
        }
        self.new_page(Some(key), true, front);
        self.starts.push((key, self.pages.len() - 1));
    }
}


/// The contents list without page numbers (same length as the final one).
fn toc_skeleton(book: &Book) -> Vec<TocEntry> {
    let numbers = book.numbers();
    let mut v = Vec::new();
    for (i, s) in book.body.iter().enumerate() {
        if s.in_contents {
            v.push(TocEntry { title: book.display_title(s, numbers[i]), folio: String::new(), level: if s.kind == SectionKind::Part { 0 } else { 1 } });
        }
    }
    for s in &book.back {
        if s.in_contents {
            v.push(TocEntry { title: book.display_title(s, None), folio: String::new(), level: 1 });
        }
    }
    v
}

/// Curly quotes in titles and book details too (the text itself is handled by the markup).
/// None when the book doesn't use them. Only what layout reads is copied.
fn smarten_titles(book: &Book) -> Option<Book> {
    if !book.smart_quotes {
        return None;
    }
    let mut b = Book {
        id: book.id.clone(),
        meta: book.meta.clone(),
        front: book.front.clone(),
        body: book.body.clone(),
        back: book.back.clone(),
        style: book.style.clone(),
        print: book.print.clone(),
        terms: book.terms.clone(),
        restart_numbers_each_part: book.restart_numbers_each_part,
        smart_quotes: true,
        ..Default::default()
    };
    let f = |s: &mut String| *s = markup::smarten(s);
    for v in [&mut b.meta.title, &mut b.meta.subtitle, &mut b.meta.author, &mut b.meta.publisher] {
        f(v);
    }
    for s in b.front.iter_mut().chain(b.body.iter_mut()).chain(b.back.iter_mut()) {
        f(&mut s.title);
        f(&mut s.subtitle);
        f(&mut s.pov);
    }
    Some(b)
}

/// A warning listing characters that print as empty boxes (no bundled face has them).
fn glyph_warnings(pages: &[Page]) -> Vec<String> {
    let mut missing: Vec<char> = Vec::new();
    for it in pages.iter().flat_map(|p| &p.items) {
        if let Item::Text { face, text, .. } = it {
            for c in text.chars() {
                if !metrics()[*face].has_char(c) && !missing.contains(&c) {
                    missing.push(c);
                }
            }
        }
    }
    if missing.is_empty() {
        return Vec::new();
    }
    let shown: Vec<String> = missing.iter().take(12).map(|c| c.to_string()).collect();
    let more = if missing.len() > 12 { " …" } else { "" };
    let s = if missing.len() == 1 { "" } else { "s" };
    vec![format!("{} character{s} can't be printed with the chosen fonts: {}{more}", missing.len(), shown.join(" "))]
}

/// Lay out the whole book.
pub fn typeset(book: &Book, opts: Opts) -> Doc {
    let titled = smarten_titles(book);
    let book = titled.as_ref().unwrap_or(book);
    let mut doc = typeset_passes(book, opts);
    doc.warnings.extend(glyph_warnings(&doc.pages));
    doc.lang = book.meta.language.trim().to_string();
    doc.book_id = book.id.clone();
    doc
}

fn typeset_passes(book: &Book, opts: Opts) -> Doc {
    // First pass finds where chapters land; the second fills in the contents page
    // (both passes have the same number of contents lines, so pages don't move).
    let mut first = Typesetter::new(book, opts);
    first.known_toc = toc_skeleton(book);
    first.run();
    first.furniture();
    let has_contents = book.front.iter().any(|s| s.kind == SectionKind::Contents);
    if !has_contents {
        return Doc { w: first.w, h: first.h, toc: first.toc, starts: first.starts, pages: first.pages, warnings: first.warnings, ..Default::default() };
    }
    let mut second = Typesetter::new(book, opts);
    second.known_toc = first.toc.clone();
    second.run();
    second.furniture();
    Doc { w: second.w, h: second.h, toc: second.toc, starts: second.starts, pages: second.pages, warnings: second.warnings, ..Default::default() }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The sample book in the literary design, which these tests' expectations are written for.
    fn book() -> Book {
        let mut b = crate::sample::sample_book();
        crate::themes::apply_theme(&mut b, &crate::themes::themes()[1]);
        b
    }

    fn width_of(face: usize, text: &str, size: f32, spacing: f32) -> f32 {
        metrics()[face].width(text, size) + spacing * text.chars().count().saturating_sub(1) as f32
    }

    /// Text-block edges (left, right, top, bottom) of a page as the layout sets them.
    fn block(b: &Book, opts: Opts, recto: bool) -> (f32, f32, f32, f32) {
        let t = Typesetter::new(b, opts);
        let left = if recto { t.inside } else { t.outside };
        (left, left + t.text_width(), t.top, t.text_bottom())
    }

    /// Every text item stays inside the text block horizontally and on the page vertically.
    fn assert_inside(b: &Book, opts: Opts, what: &str) -> Doc {
        let d = typeset(b, opts);
        for (pi, p) in d.pages.iter().enumerate() {
            let (l, r, _, _) = block(b, opts, p.recto);
            for it in &p.items {
                if let Item::Text { x, y, size, face, text, spacing, .. } = it {
                    let w = width_of(*face, text, *size, *spacing);
                    assert!(*x >= l - 0.05 && x + w <= r + 0.05, "{what}: page {pi} {text:?} x {x} w {w} block {l}..{r}");
                    assert!(*y >= 0.0 && *y <= d.h, "{what}: page {pi} {text:?} y {y}");
                }
                if let Item::Line { x1, x2, .. } = it {
                    assert!(*x1 >= l - 0.05 && *x2 <= r + 0.05, "{what}: page {pi} rule {x1}..{x2} block {l}..{r}");
                }
                if let Item::Image { src, x, w, .. } = it {
                    assert!(*x >= l - 0.05 && x + w <= r + 0.05, "{what}: page {pi} image {src} {x}..{} block {l}..{r}", x + w);
                }
            }
        }
        d
    }

    fn texts(p: &Page) -> Vec<(f32, f32, f32, String)> {
        p.items
            .iter()
            .filter_map(|it| match it {
                Item::Text { x, y, size, text, .. } => Some((*x, *y, *size, text.clone())),
                _ => None,
            })
            .collect()
    }

    fn one_chapter(text: &str) -> Book {
        let mut b = book();
        b.body.truncate(1);
        b.body[0].text = text.to_string();
        b
    }

    #[test]
    fn all_themes_and_trims_stay_inside_the_text_block() {
        let all = crate::themes::themes();
        for t in &all {
            for tr in crate::themes::TRIMS {
                let mut b = book();
                crate::themes::apply_theme(&mut b, t);
                b.print.trim_w_in = tr.w_in;
                b.print.trim_h_in = tr.h_in;
                [b.print.margin_top_in, b.print.margin_bottom_in, b.print.margin_inside_in, b.print.margin_outside_in] = tr.margins;
                let d = assert_inside(&b, Opts::default(), &format!("{} {}", t.style.builtin, tr.key));
                assert!(d.warnings.is_empty(), "{:?}", d.warnings);
            }
            let mut b = book();
            crate::themes::apply_theme(&mut b, t);
            assert_inside(&b, Opts { large_print: true }, &format!("{} large", t.style.builtin));
        }
    }

    #[test]
    fn overlong_words_are_cut() {
        let long = "x".repeat(300);
        for align in [BodyAlign::Justify, BodyAlign::Left] {
            let mut b = one_chapter(&format!("A {long} b.\n## {long}"));
            b.body[0].title = long.clone();
            b.meta.title = long.clone();
            b.style.align = align;
            let d = assert_inside(&b, Opts::default(), "long word");
            let xs: usize = d.pages.iter().flat_map(texts).filter(|t| t.3.starts_with('x')).map(|t| t.3.matches('x').count()).sum();
            assert!(xs >= 300 * 4, "{xs}"); // nothing lost (body, subheading, title, running head may be cut short)
        }
    }

    #[test]
    fn opener_pages_get_a_folio_with_top_outside_numbers() {
        let mut b = book();
        b.print.page_number_pos = PageNumberPos::TopOutside;
        let d = typeset(&b, Opts::default());
        let t = Typesetter::new(&b, Opts::default());
        let foot = t.h - t.bottom * FOLIO_RISE;
        let p = &d.pages[d.page_of(Area::Body, 0).unwrap()];
        assert!(p.opener);
        let folio = p.folio.clone().unwrap();
        let f = texts(p).into_iter().find(|t| t.3 == folio && (t.1 - foot).abs() < 0.01).expect("opener folio at the foot");
        assert!((f.2 - t.base * FURNITURE_SCALE).abs() < 0.001, "folio size {}", f.2);
    }

    /// The leftmost x of each body-size line (front matter, openers and furniture excluded).
    fn line_starts(p: &Page, base: f32) -> Vec<(f32, f32)> {
        let mut v: Vec<(f32, f32)> = Vec::new();
        for (x, y, s, _) in texts(p) {
            if (s - base).abs() < 0.01 {
                match v.iter_mut().find(|e| (e.1 - y).abs() < 0.01) {
                    Some(e) => e.0 = e.0.min(x),
                    None => v.push((x, y)),
                }
            }
        }
        v
    }

    #[test]
    fn drop_cap_zone_stays_on_its_page() {
        let base_book = book(); // literary design: 3-line drop cap
        assert!(base_book.style.drop_cap);
        for sink in 0..40 {
            let mut b = base_book.clone();
            b.style.sink_lines = sink as f32;
            b.print.running_headers = false;
            let d = typeset(&b, Opts::default());
            let t = Typesetter::new(&b, Opts::default());
            let indent = b.style.first_indent_em * t.base;
            for p in d.pages.iter().filter(|p| !p.front) {
                let caps: Vec<_> = texts(p).into_iter().filter(|t2| t2.2 > t.base * 2.0 && t2.3.chars().count() == 1).collect();
                for c in &caps {
                    assert!(c.1 <= t.text_bottom() + 0.5, "sink {sink}: cap below the text block");
                }
                if caps.is_empty() {
                    let left = if p.recto { t.inside } else { t.outside };
                    for (x, y) in line_starts(p, t.base) {
                        assert!(x <= left + indent + 0.5, "sink {sink}: narrowed line at y {y} on a page without a cap");
                    }
                }
            }
        }
    }

    #[test]
    fn drop_cap_on_a_one_word_paragraph_keeps_the_letter() {
        for text in ["I", "**I**", "A\nAnd more text follows here."] {
            let mut b = one_chapter(text);
            b.body[0].title = "Title".into();
            b.style.heading_layout = HeadingLayout::TitleOnly; // no "I" chapter label
            let d = typeset(&b, Opts::default());
            let p = &d.pages[d.page_of(Area::Body, 0).unwrap()];
            let first = text.trim_matches('*').chars().next().unwrap().to_string();
            assert!(texts(p).iter().any(|t| t.3 == first), "{text:?}");
        }
    }

    #[test]
    fn drop_cap_skipped_when_wider_than_half_the_column() {
        let mut b = one_chapter("Wide letters make wide caps, and this paragraph is long enough to wrap a few times over.");
        b.print.trim_w_in = 3.0;
        b.print.margin_inside_in = 2.0;
        b.print.margin_outside_in = 2.0;
        b.style.drop_cap_lines = 5;
        let d = assert_inside(&b, Opts::default(), "narrow cap");
        let base = Typesetter::new(&b, Opts::default()).base;
        let p = &d.pages[d.page_of(Area::Body, 0).unwrap()];
        assert!(!texts(p).iter().any(|t| t.3 == "W" && t.2 > base * 2.0));
    }

    #[test]
    fn last_line_too_long_is_tightened() {
        let b = book();
        let mut t = Typesetter::new(&b, Opts::default());
        t.new_page(None, false, false);
        let mut words = t.words_from_spans(&markup::parse_inline("aaaa bbbb cccc dddd", false), t.base, t.body, INK, false);
        let natural: f32 = words.iter().map(|w| w.width).sum::<f32>() + 3.0 * t.space_w;
        let avail = natural - t.space_w * 0.6; // within the breaker's shrink allowance
        let line = Line { words: std::mem::take(&mut words), width: natural, indent: 0.0, last: true };
        t.place_line(&line, 10.0, avail, 50.0, true, HAlign::Left, t.space_w);
        let (x, _, s, txt) = texts(t.pages.last().unwrap()).pop().unwrap();
        assert!(x + width_of(t.body.regular, &txt, s, 0.0) <= 10.0 + avail + 0.01);
    }

    #[test]
    fn hyphens_are_measured_in_their_own_face() {
        let b = book();
        let t = Typesetter::new(&b, Opts::default());
        let text = "**Extraordinarily comprehensive internationalization considerations notwithstanding, institutionalized bureaucracies characteristically procrastinate indefinitely.**";
        let words = t.words_from_spans(&markup::parse_inline(text, false), t.base, t.body, INK, false);
        for k in 0..120 {
            let avail = 120.0 + k as f32 * 1.37;
            let Some(lines) = t.break_optimal(&words, &|_| avail, 0.0, t.space_w, true) else { continue };
            for l in lines.iter().filter(|l| !l.last && l.words.len() > 1) {
                let gap = t.space_w + (avail - l.width) / (l.words.len() - 1) as f32;
                assert!(crate::linebreak::gap_ok(gap, t.space_w), "width {avail}: gap {gap}");
            }
        }
    }

    #[test]
    fn hyphenated_bold_justified_text_fits() {
        let para = "**Extraordinarily comprehensive internationalization considerations notwithstanding, institutionalized bureaucracies characteristically procrastinate.**";
        let mut b = one_chapter(&[para; 6].join("\n"));
        b.style.align = BodyAlign::Justify;
        b.style.hyphenate = true;
        b.print.trim_w_in = 4.0;
        assert_inside(&b, Opts::default(), "bold hyphens");
    }

    #[test]
    fn long_copyright_text_paginates() {
        let mut b = book();
        b.front[1].text = (0..80).map(|i| format!("Line {i} of a very long copyright notice that keeps going.")).collect::<Vec<_>>().join("\n");
        let d = assert_inside(&b, Opts::default(), "copyright");
        let t = Typesetter::new(&b, Opts::default());
        let all: Vec<_> = d.pages.iter().flat_map(texts).filter(|t| t.3.starts_with("Line")).collect();
        assert_eq!(all.len(), 80);
        assert!(all.iter().all(|x| x.1 <= t.text_bottom() + 0.5 && x.1 >= t.top));
        assert!(d.pages.iter().filter(|p| texts(p).iter().any(|x| x.3.starts_with("Line"))).count() >= 2);
    }

    #[test]
    fn long_titles_fit_their_pages() {
        let mut b = book();
        let long = "A Very Long Title That Goes On and On Across Many Many Lines of the Page Without End ".repeat(4);
        b.meta.title = long.clone();
        b.body[0].title = long.clone();
        b.body[0].subtitle = long.clone();
        let d = assert_inside(&b, Opts::default(), "long titles");
        let t = Typesetter::new(&b, Opts::default());
        for k in [(Area::Front, 0), (Area::Body, 0)] {
            let p = &d.pages[d.page_of(k.0, k.1).unwrap()];
            let folio = p.folio.clone().unwrap_or_default();
            assert!(texts(p).iter().all(|x| x.1 <= t.text_bottom() + 0.5 || x.3 == folio), "{k:?}");
        }
        // the author sits below the title, the publisher below the author
        let tp = texts(&d.pages[0]);
        let y_of = |s: &str| tp.iter().find(|x| x.3.contains(s)).map(|x| x.1).unwrap();
        let last_title = tp.iter().filter(|x| x.3.contains("Title") || x.3.contains("TITLE")).map(|x| x.1).fold(0.0, f32::max);
        assert!(y_of("Imre") > last_title && y_of("WINDLE") > y_of("Imre"));
    }

    #[test]
    fn headings_and_breaks_keep_two_lines_after_them() {
        let after = "After one.\nAfter two.\nAfter three.";
        let later = "Later one.\nLater two.\nLater three.";
        for style in [SceneBreakStyle::Glyph, SceneBreakStyle::Space] {
            for n in 0..45 {
                let before: Vec<String> = (0..n).map(|i| format!("Before {i}.")).collect();
                let mut b = one_chapter(&format!("{}\n## Heading here\n{}\n***\n{later}", before.join("\n"), after));
                b.style.scene_break = style;
                b.style.scene_glyph = "* * *".into();
                b.style.drop_cap = false;
                let d = typeset(&b, Opts::default());
                let base = Typesetter::new(&b, Opts::default()).base;
                for p in &d.pages {
                    let tx = texts(p);
                    for marker in tx.iter().filter(|x| x.3 == "Heading here" || x.3 == "* * *") {
                        let below: Vec<_> = tx.iter().filter(|x| (x.2 - base).abs() < 0.01 && x.1 > marker.1 + 0.1).map(|x| (x.1 * 10.0) as i32).collect();
                        let mut ys = below.clone();
                        ys.dedup();
                        assert!(ys.len() >= 2, "{style:?} n {n}: {:?} with {} lines after", marker.3, ys.len());
                    }
                }
                if style == SceneBreakStyle::Space {
                    // a space break between pages shows the glyph on the page after it
                    let p = d.pages.iter().find(|p| texts(p).iter().any(|x| x.3 == "Later")).unwrap();
                    let tx = texts(p);
                    let same_page = tx.iter().any(|x| x.3 == "three." && x.1 < tx.iter().find(|x| x.3 == "Later").unwrap().1);
                    assert!(same_page || tx.iter().any(|x| x.3 == "* * *"), "n {n}: space break lost at a page top");
                }
            }
        }
    }

    #[test]
    fn continued_front_matter_pages_stay_front() {
        for n in 0..40 {
            let mut b = book();
            let mut fw = Section::new(SectionKind::Foreword, "Foreword");
            let paras: Vec<String> = (0..n).map(|i| format!("Paragraph {i}.")).collect();
            fw.text = format!("{}\n***\nAfter.\n## Sub\nMore.\nMore.", paras.join("\n"));
            b.front.push(fw);
            let d = typeset(&b, Opts::default());
            let start = d.page_of(Area::Body, 0).unwrap();
            assert!(d.pages[..start].iter().all(|p| p.front || p.blank), "n {n}");
        }
    }

    #[test]
    fn running_heads_are_shortened() {
        let mut b = book();
        b.meta.title = "An Exceedingly Long Book Title That Would Never Fit In A Running Head At All ".repeat(3);
        b.print.header_left = HeaderContent::BookTitle;
        let d = assert_inside(&b, Opts::default(), "running head");
        let hs: Vec<_> = d.pages.iter().flat_map(texts).filter(|t| t.1 < 50.0).map(|t| t.3).collect();
        assert!(hs.iter().any(|t| t.ends_with('…')), "{hs:?}");
    }

    #[test]
    fn huge_margins_leave_a_text_block() {
        let mut b = book();
        b.print.trim_w_in = 3.0;
        b.print.trim_h_in = 4.0;
        for m in [&mut b.print.margin_top_in, &mut b.print.margin_bottom_in, &mut b.print.margin_inside_in, &mut b.print.margin_outside_in] {
            *m = 2.0;
        }
        let t = Typesetter::new(&b, Opts::default());
        assert!(t.text_width() >= PT_PER_IN - 0.01 && t.w - t.inside - t.outside >= PT_PER_IN - 0.01);
        assert!(t.text_bottom() - t.top >= PT_PER_IN - 0.01);
        let d = assert_inside(&b, Opts::default(), "huge margins");
        assert!(d.pages.len() < 200, "{}", d.pages.len());
    }

    #[test]
    fn missing_glyphs_fall_back_or_warn() {
        let mut b = one_chapter("Greek: αβγδ. Soft\u{ad}hyphen and zero\u{200b}width. Unknowable: \u{2a6d6}.");
        b.style.body_font = "Lora".into();
        let d = typeset(&b, Opts::default());
        let mut greek = false;
        for p in &d.pages {
            for it in &p.items {
                if let Item::Text { face, text, .. } = it {
                    assert!(!text.contains(['\u{ad}', '\u{200b}']), "{text:?}");
                    if text.contains('α') {
                        greek = true;
                        assert!(text.chars().all(|c| metrics()[*face].has_char(c)), "{text:?} in {}", fonts::faces()[*face].family);
                    }
                }
            }
        }
        assert!(greek);
        assert_eq!(d.warnings.len(), 1, "{:?}", d.warnings);
        assert!(d.warnings[0].starts_with("1 character can't be printed") && d.warnings[0].contains('\u{2a6d6}'));
        assert_eq!(d.lang, "en");
    }

    /// A one-chapter book whose images folder holds `pic.png` (600 x 400) and `tall.png` (300 x 1200).
    fn image_book(text: &str) -> Book {
        crate::storage::tests::setup();
        let mut b = one_chapter(text);
        b.id = "layout-images".into();
        let dir = crate::storage::images_dir(&b.id);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("pic.png"), crate::image::test_png(600, 400, false)).unwrap();
        std::fs::write(dir.join("tall.png"), crate::image::test_png(300, 1200, true)).unwrap();
        b
    }

    fn images(d: &Doc) -> Vec<(usize, String, f32, f32, f32, f32)> {
        let mut v = Vec::new();
        for (i, p) in d.pages.iter().enumerate() {
            for it in &p.items {
                if let Item::Image { src, x, y, w, h } = it {
                    v.push((i, src.clone(), *x, *y, *w, *h));
                }
            }
        }
        v
    }

    #[test]
    fn images_stay_inside_the_text_block_with_their_caption() {
        let b = image_book("Before the picture.\n![A *quiet* harbour](pic.png)\nAfter the picture.");
        let d = assert_inside(&b, Opts::default(), "image");
        let t = Typesetter::new(&b, Opts::default());
        let imgs = images(&d);
        assert_eq!(imgs.len(), 1, "{:?}", d.warnings);
        let (pi, _, x, y, w, h) = imgs[0].clone();
        let (l, r, top, bottom) = block(&b, Opts::default(), d.pages[pi].recto);
        assert!(x >= l - 0.01 && x + w <= r + 0.01 && y >= top && y + h <= bottom + 0.5, "{x} {y} {w} {h}");
        assert!(((x - l) - (r - x - w)).abs() < 0.01 && (w / h - 1.5).abs() < 0.01, "centred, in proportion");
        let tx = texts(&d.pages[pi]);
        let cap = tx.iter().find(|t| t.3.contains("harbour")).expect("caption");
        assert!(cap.1 > y + h && (cap.2 - t.base * CAPTION_SCALE).abs() < 0.01);
        let after = tx.iter().find(|t| t.3 == "After").unwrap();
        assert!(after.1 > cap.1);
        let lines = (after.1 - t.baseline(t.top)) / t.leading;
        assert!((lines - lines.round()).abs() < 0.01, "back on the baseline grid: {lines}");
        // 600 px across a text block of about 4 in is under 200 dpi
        assert!(d.warnings.iter().any(|w| w.contains("pic.png") && w.contains("dpi")), "{:?}", d.warnings);
    }

    #[test]
    fn a_tall_image_moves_to_the_next_page() {
        let paras: Vec<String> = (0..12).map(|i| format!("Paragraph {i} before the tall picture.")).collect();
        let b = image_book(&format!("{}\n![](tall.png)\nAfter.", paras.join("\n")));
        let d = assert_inside(&b, Opts::default(), "tall image");
        let t = Typesetter::new(&b, Opts::default());
        let (pi, _, _, y, _, h) = images(&d)[0].clone();
        assert!((y - t.top).abs() < 0.01 && y + h <= t.text_bottom() + 0.5, "{y} {h}");
        assert!(texts(&d.pages[pi - 1]).iter().any(|x| x.3.contains("11")), "the page before keeps the text");
        assert!(!texts(&d.pages[pi]).iter().any(|x| x.3.contains("Paragraph")), "nothing moved up beside it");
    }

    #[test]
    fn missing_and_invalid_images_warn() {
        let b = image_book("![](nope.png)\n![](../book.json)\n![](pic.png)\nText.");
        let d = typeset(&b, Opts::default());
        assert_eq!(images(&d).len(), 1);
        assert!(d.warnings.iter().any(|w| w.contains("nope.png") && w.contains("wasn't found")), "{:?}", d.warnings);
        assert!(d.warnings.iter().any(|w| w.contains("../book.json") && w.contains("isn't valid")), "{:?}", d.warnings);
        assert_eq!(d.book_id, "layout-images");
    }

    #[test]
    fn images_tables_and_footnotes_share_pages_without_overlapping() {
        let mut shared = 0;
        for img in ["pic.png", "tall.png"] {
            for long in [1, 40] {
                for k in 0..16 {
                    let fill: Vec<String> = (0..k).map(|i| format!("Paragraph {i} is filler, long enough to wrap onto a second line of the page.")).collect();
                    let text = format!(
                        "{}\nThis paragraph calls a note near the foot of the page.[^a] More words follow it.\n![A view](IMG)\n| Name | Count |\n|---|--:|\n| one | 1 |\n| two[^b] | 2 |\nAfter the table.\n[^a]: {}\n[^b]: A note from the table.",
                        fill.join("\n"),
                        "Note words here. ".repeat(long)
                    )
                    .replace("IMG", img);
                    let b = image_book(&text);
                    let what = format!("{img} long {long} k {k}");
                    assert_inside(&b, Opts::default(), &what);
                    // the text block before furniture is added: every item of the chapter sits in it
                    let mut t = Typesetter::new(&b, Opts::default());
                    t.run();
                    let (top, bottom, base) = (t.top, t.h - t.bottom, t.base);
                    let is = |s: f32, k: f32| (s - base * k).abs() < 0.01;
                    for (pi, p) in t.pages.iter().enumerate().filter(|(_, p)| p.section == Some((Area::Body, 0))) {
                        let rule = p.items.iter().find_map(|it| match it {
                            Item::Line { x1, x2, y1, width, .. } if *width == 0.4 && (x2 - x1 - t.text_width() * 0.3).abs() < 0.01 => Some(*y1),
                            _ => None,
                        });
                        let foot = rule.unwrap_or(bottom);
                        shared += usize::from(rule.is_some() && p.items.iter().any(|it| matches!(it, Item::Image { .. })));
                        for it in &p.items {
                            match it {
                                Item::Image { y, h, .. } => {
                                    assert!(*y >= top - 0.01 && y + h <= foot + 0.5, "{what}: page {pi} image {y}+{h} reaches the notes at {foot}");
                                    // sized for the page it lands on, not the notes of the page it left
                                    let cap_h = t.leading * 0.35 + base * CAPTION_SCALE * 1.25;
                                    assert!(img != "tall.png" || rule.is_some() || (y + h + cap_h - bottom).abs() < 0.5, "{what}: page {pi} tall image ends at {}", y + h + cap_h);
                                }
                                Item::Line { y1, .. } if Some(*y1) != rule => assert!(*y1 >= top - 0.01 && *y1 <= foot + 0.5, "{what}: page {pi} table rule at {y1} below {foot}"),
                                Item::Text { y, size, text, .. } => {
                                    assert!(y - size * 0.8 >= top - 0.5 && y + size * 0.25 <= bottom + 0.5, "{what}: page {pi} {text:?} at {y} outside the block");
                                    let note = rule.is_some_and(|r| *y > r) && (is(*size, NOTE_SCALE) || is(*size, NOTE_SCALE * NOTE_REF_SCALE));
                                    assert!(note || y + size * 0.25 <= foot + 0.5, "{what}: page {pi} {text:?} at {y} overlaps the notes at {foot}");
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
        assert!(shared > 0, "some page holds both an image and footnotes");
    }

    /// `n` paragraphs, every third calling its own footnote, `long` sets how long the notes run.
    fn noted_chapter(n: usize, long: usize) -> Book {
        let (mut text, mut defs) = (Vec::new(), Vec::new());
        for i in 0..n {
            if i % 3 == 1 {
                text.push(format!("Paragraph {i} runs on for a while so that it fills a line or two, and then it calls a note.[^n{i}] A little more follows."));
                defs.push(format!("[^n{i}]: {}", "Note words here. ".repeat(1 + (i % 5) * long)));
            } else {
                text.push(format!("Paragraph {i} is ordinary filler, long enough to wrap onto a second line of the page."));
            }
        }
        one_chapter(&format!("{}\n{}", text.join("\n"), defs.join("\n")))
    }

    #[test]
    fn footnotes_sit_at_the_foot_of_their_page() {
        for (n, long) in [(12, 0), (30, 1), (45, 3), (20, 40)] {
            for sink in [0.0, 3.0, 7.0] {
                let mut b = noted_chapter(n, long);
                b.style.sink_lines = sink;
                let what = format!("n {n} long {long} sink {sink}");
                let d = assert_inside(&b, Opts::default(), &what);
                assert!(d.warnings.is_empty(), "{:?}", d.warnings);
                let t = Typesetter::new(&b, Opts::default());
                let (base, bottom, folio) = (t.base, t.h - t.bottom, t.h - t.bottom * FOLIO_RISE);
                let is = |s: f32, k: f32| (s - base * k).abs() < 0.01;
                let (mut refs_all, mut words) = (Vec::new(), 0);
                for p in d.pages.iter().filter(|p| !p.front) {
                    let tx = texts(p);
                    // the short rule over the notes
                    let rule = p.items.iter().find_map(|it| match it {
                        Item::Line { x1, x2, y1, .. } if (x2 - x1 - t.text_width() * 0.3).abs() < 0.01 => Some(*y1),
                        _ => None,
                    });
                    let in_foot = |y: f32| rule.is_some_and(|r| y > r) && y <= bottom + 0.5;
                    let mut refs: Vec<String> = tx.iter().filter(|x| is(x.2, NOTE_REF_SCALE)).map(|x| x.3.clone()).collect();
                    let mut marks: Vec<String> = tx.iter().filter(|x| is(x.2, NOTE_SCALE * NOTE_REF_SCALE)).map(|x| x.3.clone()).collect();
                    refs.sort();
                    marks.sort();
                    assert_eq!(refs, marks, "{what}: every note starts on its reference's page");
                    refs_all.extend(refs);
                    let body_end = tx.iter().filter(|x| is(x.2, 1.0)).map(|x| x.1 + base * 0.25).fold(0.0, f32::max);
                    let notes: Vec<_> = tx.iter().filter(|x| in_foot(x.1)).collect();
                    words += notes.iter().filter(|x| x.3 == "Note").count();
                    assert!(rule.is_none_or(|r| r > body_end), "{what}: rule above the text");
                    for x in &notes {
                        assert!(is(x.2, NOTE_SCALE) || is(x.2, NOTE_SCALE * NOTE_REF_SCALE), "{what}: {x:?} in the notes");
                        assert!(x.1 - x.2 * 0.8 > body_end, "{what}: note {:?} at {} overlaps the text ending {body_end}", x.3, x.1);
                        assert!(x.1 + x.2 * 0.25 < folio - base * FURNITURE_SCALE * 0.8, "{what}: note {:?} reaches the folio", x.3);
                    }
                }
                let expect: Vec<String> = (1..=(n + 1) / 3).map(|k| k.to_string()).collect();
                refs_all.sort();
                let mut want = expect.clone();
                want.sort();
                assert_eq!(refs_all, want, "{what}: notes numbered once each");
                let total: usize = (0..n).filter(|i| i % 3 == 1).map(|i| 1 + (i % 5) * long).sum();
                assert_eq!(words, total, "{what}: no note text lost");
            }
        }
    }

    #[test]
    fn footnotes_restart_each_chapter_and_warn() {
        let mut b = book();
        b.body.truncate(2);
        b.body[0].text = "First[^a] and second[^b].\n[^a]: A.\n[^b]: B.".into();
        b.body[1].text = "Again[^z] and [^nope].\n[^z]: Z.\n[^spare]: Unused.".into();
        let d = typeset(&b, Opts::default());
        let base = Typesetter::new(&b, Opts::default()).base;
        let refs = |i: usize| texts(&d.pages[d.page_of(Area::Body, i).unwrap()]).into_iter().filter(|x| (x.2 - base * NOTE_REF_SCALE).abs() < 0.01).map(|x| x.3).collect::<Vec<_>>();
        assert_eq!(refs(0), ["1", "2"]);
        assert_eq!(refs(1), ["1"]);
        assert_eq!(d.warnings.len(), 2, "{:?}", d.warnings);
        assert!(d.warnings[0].contains("[^nope]") && d.warnings[1].contains("[^spare]") && d.warnings[1].contains("A Ledger of Names"), "{:?}", d.warnings);
    }

    #[test]
    fn tables_keep_rows_whole_and_repeat_the_header() {
        let long = "words that wrap within a narrow cell ".repeat(2);
        let rows: Vec<String> = (0..60).map(|i| format!("| start{i} {long} end{i} | {i} | short |")).collect();
        let text = format!("Before.\n| Header one | Two | Three |\n|---|--:|:-:|\n{}\nAfter the table.", rows.join("\n"));
        for trim in [3.0, 5.5] {
            let mut b = one_chapter(&text);
            b.print.trim_w_in = trim;
            let d = assert_inside(&b, Opts::default(), "table");
            let t = Typesetter::new(&b, Opts::default());
            let mut pages_with_rows = 0;
            for (i, p) in d.pages.iter().enumerate() {
                let tx = texts(p);
                for r in 0..60 {
                    let (s, e) = (tx.iter().any(|x| x.3 == format!("start{r}")), tx.iter().any(|x| x.3 == format!("end{r}")));
                    assert_eq!(s, e, "trim {trim}: row {r} split at page {i}");
                }
                if tx.iter().any(|x| x.3.starts_with("start")) {
                    pages_with_rows += 1;
                    assert!(tx.iter().any(|x| x.3 == "Header"), "trim {trim}: page {i} has no header");
                    assert!(p.items.iter().filter(|it| matches!(it, Item::Line { .. })).count() >= 3, "trim {trim}: page {i} rules");
                }
                // back on the grid after the table
                if let Some(a) = tx.iter().find(|x| x.3 == "After") {
                    let k = (a.1 - t.baseline(t.top)) / t.leading;
                    assert!((k - k.round()).abs() < 0.01, "trim {trim}: off the grid by {k}");
                }
            }
            assert!(pages_with_rows >= 3, "{pages_with_rows}");
        }
        // too many wide columns for the page still stay inside the block
        let row = format!("| {} |", ["Supercalifragilistic"; 8].join(" | "));
        let mut b = one_chapter(&format!("{row}\n|---|---|---|---|---|---|---|---|\n{row}"));
        b.print.trim_w_in = 4.0;
        assert_inside(&b, Opts::default(), "wide table");
    }

    #[test]
    fn indent_after_breaks_follows_the_setting() {
        let mut b = one_chapter("First paragraph.\n***\nAfter the break.");
        b.style.drop_cap = false;
        let x_of = |d: &Doc| {
            let p = &d.pages[d.page_of(Area::Body, 0).unwrap()];
            texts(p).into_iter().find(|t| t.3 == "After").unwrap().0
        };
        b.style.no_indent_after_heading = true;
        let flush = x_of(&typeset(&b, Opts::default()));
        b.style.no_indent_after_heading = false;
        let indented = x_of(&typeset(&b, Opts::default()));
        assert!((indented - flush - b.style.first_indent_em * b.style.base_size_pt).abs() < 0.01, "{flush} {indented}");
    }
}
