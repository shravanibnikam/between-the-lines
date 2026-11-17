//! Built-in book designs, trim sizes and default numbers (see MECHANICS.md for sources).
//!
//! Trim sizes are the common print-on-demand paperback sizes; each design is tuned for its genre.

use crate::model::*;

pub struct Trim {
    pub key: &'static str,
    pub name: &'static str,
    pub w_in: f32,
    pub h_in: f32,
    /// top, bottom, inside, outside (inches)
    pub margins: [f32; 4],
}

// Margins (top, bottom, inside, outside, inches) by size class. Sources: Amazon KDP "Set trim
// size, bleed, and margins" (minimum outside margin 0.25 in; minimum inside margin 0.375 in up
// to 150 pages, 0.5 to 300, 0.625 to 500, 0.75 to 700, 0.875 beyond) and IngramSpark's file
// creation guide (0.5 in safety margin). On top of those minimums, the usual book-design
// conventions: inside > outside (the gutter swallows some of the page), bottom >= top (room for
// the folio), and margins growing with the page. Inside margins here already clear the KDP
// minimum for books up to 700 pages.
const M_COMPACT: [f32; 4] = [0.6, 0.65, 0.65, 0.4]; // 4 to 4.4 in wide
const M_SMALL: [f32; 4] = [0.7, 0.8, 0.8, 0.5]; // 4.7 to 5.5 in wide
const M_MID: [f32; 4] = [0.8, 0.9, 0.85, 0.6]; // 5.8 to 6 in wide
const M_LARGE: [f32; 4] = [0.9, 1.0, 1.0, 0.7]; // 7 in wide and up

/// Trim sizes offered (KDP and IngramSpark paperback sizes, plus ISO A-sizes), with the margins
/// applied when one is chosen.
pub const TRIMS: &[Trim] = &[
    Trim { key: "5x8", name: "5 × 8 in", w_in: 5.0, h_in: 8.0, margins: M_SMALL },
    Trim { key: "5.25x8", name: "5.25 × 8 in", w_in: 5.25, h_in: 8.0, margins: M_SMALL },
    Trim { key: "5.5x8.5", name: "5.5 × 8.5 in", w_in: 5.5, h_in: 8.5, margins: M_SMALL },
    Trim { key: "6x9", name: "6 × 9 in", w_in: 6.0, h_in: 9.0, margins: M_MID },
    Trim { key: "4x6", name: "4 × 6 in (mass market)", w_in: 4.0, h_in: 6.0, margins: M_COMPACT },
    Trim { key: "4.12x6.75", name: "4.12 × 6.75 in (mass market)", w_in: 4.12, h_in: 6.75, margins: M_COMPACT },
    Trim { key: "4.25x7", name: "4.25 × 7 in (mass market)", w_in: 4.25, h_in: 7.0, margins: M_COMPACT },
    Trim { key: "4.37x7", name: "4.37 × 7 in (A-format)", w_in: 4.37, h_in: 7.0, margins: M_COMPACT },
    Trim { key: "a6", name: "A6 (4.13 × 5.83 in)", w_in: 4.13, h_in: 5.83, margins: [0.55, 0.6, 0.6, 0.4] },
    Trim { key: "5.12x7.09", name: "5.12 × 7.09 in (pocket)", w_in: 5.12, h_in: 7.09, margins: M_SMALL },
    Trim { key: "4.72x7.48", name: "4.72 × 7.48 in (pocket)", w_in: 4.72, h_in: 7.48, margins: M_SMALL },
    Trim { key: "5.31x8.07", name: "5.31 × 8.07 in", w_in: 5.31, h_in: 8.07, margins: M_SMALL },
    Trim { key: "a5", name: "A5 (5.83 × 8.27 in)", w_in: 5.83, h_in: 8.27, margins: M_MID },
    Trim { key: "5.31x8.46", name: "5.31 × 8.46 in", w_in: 5.31, h_in: 8.46, margins: M_SMALL },
    Trim { key: "b-format", name: "5.06 × 7.81 in (B-format)", w_in: 5.06, h_in: 7.81, margins: M_SMALL },
    Trim { key: "7x10", name: "7 × 10 in", w_in: 7.0, h_in: 10.0, margins: M_LARGE },
    Trim { key: "8x10", name: "8 × 10 in", w_in: 8.0, h_in: 10.0, margins: M_LARGE },
    Trim { key: "8.25x11", name: "8.25 × 11 in", w_in: 8.25, h_in: 11.0, margins: M_LARGE },
    Trim { key: "8.5x11", name: "8.5 × 11 in (letter)", w_in: 8.5, h_in: 11.0, margins: M_LARGE },
    Trim { key: "a4", name: "A4 (8.27 × 11.69 in)", w_in: 8.27, h_in: 11.69, margins: M_LARGE },
];

/// New books use the first built-in design's page: 5.5 × 8.5 in.
pub const DEFAULT_TRIM: &str = "5.5x8.5";

pub fn default_trim() -> &'static Trim {
    TRIMS.iter().find(|t| t.key == DEFAULT_TRIM).unwrap_or(&TRIMS[0])
}

pub fn trim_for(w: f32, h: f32) -> Option<&'static Trim> {
    TRIMS.iter().find(|t| (t.w_in - w).abs() < 0.005 && (t.h_in - h).abs() < 0.005)
}

pub const DEFAULT_MARGIN_TOP_IN: f32 = 0.7;
pub const DEFAULT_MARGIN_BOTTOM_IN: f32 = 0.8;
pub const DEFAULT_MARGIN_INSIDE_IN: f32 = 0.8;
pub const DEFAULT_MARGIN_OUTSIDE_IN: f32 = 0.5;
pub const BLEED_IN: f32 = 0.125;
/// The large-print design: 16 pt text (the usual minimum for large print) on 1.4 line spacing.
pub const LARGE_PRINT_BODY_PT: f32 = 16.0;
pub const LARGE_PRINT_LINE_HEIGHT: f32 = 1.4;
pub const DEFAULT_DAILY_GOAL: u32 = 500;
pub const DEFAULT_BOOK_GOAL: u32 = 80_000;
pub const WORDS_PER_MINUTE: u32 = 250;
/// Switching to "spaced" paragraphs gives this gap and no indent; back to "indented" gives
/// this indent and no gap.
pub const SPACED_PARAGRAPH_EM: f32 = 0.9;
pub const INDENTED_PARAGRAPH_EM: f32 = 1.2;

/// The smallest inside (gutter) margin a printer accepts for a page count
/// (Amazon KDP's published minimums).
pub fn min_inside_margin_in(pages: usize) -> f32 {
    match pages {
        0..=150 => 0.375,
        151..=300 => 0.5,
        301..=500 => 0.625,
        501..=700 => 0.75,
        _ => 0.875,
    }
}

pub const MIN_OUTSIDE_MARGIN_IN: f32 = 0.25;

/// A built-in design: the style plus the page it was made for.
pub struct Theme {
    pub style: StyleProfile,
    pub trim: (f32, f32),
    pub margins: [f32; 4],
}

#[allow(clippy::too_many_arguments)]
fn base(key: &str, name: &str, body: &str, heading: &str, size: f32, lead: f32, para_em: f32, indent_em: f32, no_indent: bool) -> StyleProfile {
    StyleProfile {
        name: name.to_string(),
        builtin: key.to_string(),
        body_font: body.to_string(),
        heading_font: heading.to_string(),
        number_font: heading.to_string(),
        base_size_pt: size,
        line_height: lead,
        paragraph_spacing_em: para_em,
        first_indent_em: indent_em,
        no_indent_after_heading: no_indent,
        align: BodyAlign::Justify,
        heading_layout: HeadingLayout::NumberAboveTitle,
        number_format: NumberFormat::LabelWord,
        heading_align: HAlign::Center,
        title_scale: 1.8,
        number_scale: 0.85,
        title_uppercase: false,
        title_italic: false,
        number_uppercase: true,
        title_color: "#222222".into(),
        number_color: "#222222".into(),
        chapter_ornament: "none".into(),
        ornament_color: "#222222".into(),
        ornament_scale: 1.0,
        scene_break: SceneBreakStyle::Glyph,
        scene_ornament: "leaves".into(),
        scene_glyph: "* * *".into(),
        drop_cap: false,
        drop_cap_lines: 3,
        drop_cap_color: "#222222".into(),
        first_paragraph: FirstParagraph::Plain,
        small_caps_words: 3,
        sink_lines: 5.0,
        opener_gap_em: 2.0,
        show_pov: true,
        header_rule: false,
        header_small_caps: true,
        hyphenate: true,
    }
}

/// Chapter number formats: none, numeric, roman, written.
fn numbers(s: &mut StyleProfile, fmt: &str) {
    match fmt {
        "none" => s.heading_layout = HeadingLayout::TitleOnly,
        "numeric" => s.number_format = NumberFormat::LabelArabic,
        "roman" => s.number_format = NumberFormat::Roman,
        _ => s.number_format = NumberFormat::LabelWord,
    }
}

fn ornament_break(s: &mut StyleProfile, key: &str) {
    s.scene_break = SceneBreakStyle::Ornament;
    s.scene_ornament = key.into();
}

fn drop_cap(s: &mut StyleProfile, lines: u32) {
    s.drop_cap = true;
    s.drop_cap_lines = lines;
}

pub fn themes() -> Vec<Theme> {
    let mut v = Vec::new();
    let mut push = |style: StyleProfile, trim: (f32, f32), margins: [f32; 4]| v.push(Theme { style, trim, margins });

    // Each design: body / heading face, size pt, leading (x size), paragraph gap em, first-line
    // indent em. The measure (text width / average character width) is kept near 55-70
    // characters for running text; leading sits at 1.3-1.45 (a little more for sans faces and
    // for the accessibility designs).

    // classic-fiction: Gelasio 10.5 / 1.38, 1.2 em indent, ~60 characters a line, no chapter numbers
    let mut t = base("classic-fiction", "Classic fiction", "Gelasio", "Gelasio", 10.5, 1.38, 0.0, 1.2, true);
    numbers(&mut t, "none");
    t.title_scale = 1.7;
    t.first_paragraph = FirstParagraph::SmallCapsWords;
    push(t, (5.5, 8.5), [0.7, 0.8, 0.8, 0.5]);

    // literary: EB Garamond 12 / 1.32 (small x-height, so a larger size), roman numbers, leaf break
    let mut t = base("literary", "Literary", "EB Garamond", "EB Garamond", 12.0, 1.32, 0.0, 1.1, true);
    numbers(&mut t, "roman");
    t.number_scale = 1.15;
    t.title_scale = 1.9;
    t.title_italic = true;
    ornament_break(&mut t, "leaves");
    drop_cap(&mut t, 3);
    push(t, (5.5, 8.5), [0.8, 0.9, 0.85, 0.6]);

    // thriller: Gelasio body, Libre Franklin headings, 10 / 1.3, tight 1 em indent, numbered chapters
    let mut t = base("thriller", "Thriller", "Gelasio", "Libre Franklin", 10.0, 1.3, 0.0, 1.0, true);
    numbers(&mut t, "numeric");
    t.title_uppercase = true;
    t.title_scale = 1.35;
    t.heading_align = HAlign::Left;
    t.header_rule = true;
    t.sink_lines = 4.0;
    drop_cap(&mut t, 2);
    push(t, (5.5, 8.5), [0.65, 0.75, 0.75, 0.5]);

    // romance: PT Serif body, Gelasio headings, 10.5 / 1.4, written numbers, flourish
    let mut t = base("romance", "Romance", "PT Serif", "Gelasio", 10.5, 1.4, 0.0, 1.3, true);
    numbers(&mut t, "written");
    t.title_italic = true;
    t.title_scale = 1.9;
    t.title_color = "#7d2f45".into();
    t.number_color = "#7d2f45".into();
    t.ornament_color = "#7d2f45".into();
    t.drop_cap_color = "#7d2f45".into();
    t.chapter_ornament = "flourish".into();
    ornament_break(&mut t, "flourish");
    drop_cap(&mut t, 2);
    push(t, (5.5, 8.5), [0.8, 0.9, 0.85, 0.6]);

    // fantasy: EB Garamond 12 / 1.35 with Cinzel capitals, roman numbers, rule ornament, 6 x 9
    let mut t = base("fantasy", "Epic fantasy", "EB Garamond", "Cinzel", 12.0, 1.35, 0.0, 1.3, true);
    numbers(&mut t, "roman");
    t.number_scale = 1.2;
    t.title_uppercase = true;
    t.title_scale = 1.5;
    t.chapter_ornament = "diamond-rule".into();
    t.ornament_color = "#5e4518".into();
    t.drop_cap_color = "#5e4518".into();
    ornament_break(&mut t, "asterism");
    drop_cap(&mut t, 3);
    t.first_paragraph = FirstParagraph::SmallCapsWords;
    push(t, (6.0, 9.0), [0.85, 0.95, 0.9, 0.65]);

    // romantasy: Lora body, Cormorant headings, 11 / 1.42, written numbers, vine and stars
    let mut t = base("romantasy", "Romantasy", "Lora", "Cormorant", 11.0, 1.42, 0.0, 1.25, true);
    numbers(&mut t, "written");
    t.title_scale = 2.1;
    t.chapter_ornament = "vine".into();
    t.ornament_color = "#46603a".into();
    ornament_break(&mut t, "stars");
    drop_cap(&mut t, 3);
    push(t, (5.5, 8.5), [0.8, 0.9, 0.85, 0.6]);

    // gothic-romance: Lora body, Cinzel Decorative titles, 10.5 / 1.38, roman numbers, moon, 4-line cap
    let mut t = base("gothic-romance", "Gothic romance", "Lora", "Cinzel Decorative", 10.5, 1.38, 0.0, 1.1, true);
    numbers(&mut t, "roman");
    t.number_font = "Cinzel".into();
    t.number_scale = 1.2;
    t.title_scale = 1.6;
    t.chapter_ornament = "moon".into();
    t.ornament_color = "#352b45".into();
    t.drop_cap_color = "#5c2230".into();
    ornament_break(&mut t, "moon");
    drop_cap(&mut t, 4);
    push(t, (5.5, 8.5), [0.85, 0.95, 0.85, 0.6]);

    // horror: Alegreya body (narrow, so 11.5), Playfair Display headings, 11.5 / 1.35, dots
    let mut t = base("horror", "Horror", "Alegreya", "Playfair Display", 11.5, 1.35, 0.0, 1.15, true);
    numbers(&mut t, "numeric");
    t.title_italic = true;
    t.title_scale = 1.9;
    t.ornament_color = "#5c2230".into();
    t.drop_cap_color = "#5c2230".into();
    ornament_break(&mut t, "dots");
    drop_cap(&mut t, 3);
    push(t, (5.5, 8.5), [0.75, 0.85, 0.8, 0.55]);

    // sci-fi: PT Serif body, Source Code Pro headings, 10.5 / 1.35, block paragraphs with a 0.6 em gap
    let mut t = base("sci-fi", "Science fiction", "PT Serif", "Source Code Pro", 10.5, 1.35, 0.6, 0.0, false);
    numbers(&mut t, "numeric");
    t.title_uppercase = true;
    t.title_scale = 1.25;
    t.heading_align = HAlign::Left;
    t.chapter_ornament = "compass".into();
    t.ornament_scale = 0.7;
    t.ornament_color = "#285063".into();
    t.number_color = "#285063".into();
    ornament_break(&mut t, "compass");
    push(t, (6.0, 9.0), [0.8, 0.9, 0.85, 0.6]);

    // memoir: PT Serif 11 / 1.4, written numbers, italic titles, a tilde as the scene break
    let mut t = base("memoir", "Memoir", "PT Serif", "PT Serif", 11.0, 1.4, 0.0, 1.2, true);
    numbers(&mut t, "written");
    t.title_italic = true;
    t.title_scale = 1.7;
    t.scene_glyph = "~".into();
    push(t, (5.5, 8.5), [0.75, 0.85, 0.8, 0.55]);

    // clean-nonfiction: PT Serif body, Libre Franklin headings, 10.5 / 1.4, 0.6 em gap, 6 x 9
    let mut t = base("clean-nonfiction", "Clean non-fiction", "PT Serif", "Libre Franklin", 10.5, 1.4, 0.6, 0.0, false);
    numbers(&mut t, "none");
    t.heading_align = HAlign::Left;
    t.title_scale = 1.7;
    ornament_break(&mut t, "diamond-rule");
    t.ornament_scale = 0.6;
    drop_cap(&mut t, 3);
    push(t, (6.0, 9.0), [0.85, 0.95, 0.9, 0.65]);

    // modern-minimal: Instrument Sans 10 / 1.45, left-aligned, 0.8 em gap, generous margins
    let mut t = base("modern-minimal", "Minimal", "Instrument Sans", "Instrument Sans", 10.0, 1.45, 0.8, 0.0, false);
    numbers(&mut t, "none");
    t.heading_align = HAlign::Left;
    t.title_scale = 1.7;
    t.align = BodyAlign::Left;
    t.scene_glyph = "—".into();
    t.header_small_caps = false;
    drop_cap(&mut t, 3);
    push(t, (6.0, 9.0), [1.0, 1.1, 1.0, 0.8]);

    // academic: Source Serif 4 11 / 1.4 with indents (a printed monograph, not a double-spaced draft)
    let mut t = base("academic", "Academic", "Source Serif 4", "Source Serif 4", 11.0, 1.4, 0.0, 1.2, false);
    numbers(&mut t, "numeric");
    t.heading_align = HAlign::Left;
    t.title_scale = 1.5;
    t.sink_lines = 3.0;
    t.show_pov = false;
    push(t, (6.0, 9.0), [0.9, 1.0, 0.95, 0.7]);

    // poetry: EB Garamond 11.5 / 1.45, ragged right, a 1 em gap for stanzas, narrow measure
    let mut t = base("poetry", "Poetry", "EB Garamond", "EB Garamond", 11.5, 1.45, 1.0, 0.0, true);
    numbers(&mut t, "none");
    t.align = BodyAlign::Left;
    t.title_italic = true;
    t.title_scale = 1.6;
    ornament_break(&mut t, "asterism");
    t.ornament_scale = 0.7;
    push(t, (5.5, 8.5), [0.9, 1.0, 0.9, 0.75]);

    // childrens: Gelasio body, Libre Franklin headings, 13 / 1.45, ragged right, written numbers
    let mut t = base("childrens", "Children's", "Gelasio", "Libre Franklin", 13.0, 1.45, 0.6, 0.0, false);
    numbers(&mut t, "written");
    t.title_scale = 1.8;
    t.align = BodyAlign::Left;
    t.title_color = "#285063".into();
    t.number_color = "#285063".into();
    t.ornament_color = "#b87a14".into();
    ornament_break(&mut t, "stars");
    push(t, (6.0, 9.0), [0.8, 0.9, 0.85, 0.7]);

    // large-print: Gelasio 16 / 1.4, ragged right, 0.6 em gap; the shorter measure is normal here
    let mut t = base("large-print", "Large print", "Gelasio", "Gelasio", LARGE_PRINT_BODY_PT, LARGE_PRINT_LINE_HEIGHT, 0.6, 0.0, false);
    numbers(&mut t, "numeric");
    t.align = BodyAlign::Left;
    t.title_scale = 1.5;
    drop_cap(&mut t, 3);
    push(t, (6.0, 9.0), [0.7, 0.8, 0.75, 0.6]);

    // dyslexia-friendly: Instrument Sans 13 / 1.5 ragged right (British Dyslexia Association style
    // guide: sans serif, 12-14 pt, line spacing about 1.5, no justification), 1 em gap
    let mut t = base("dyslexia-friendly", "Easy reading", "Instrument Sans", "Instrument Sans", 13.0, 1.5, 1.0, 0.0, false);
    numbers(&mut t, "numeric");
    t.align = BodyAlign::Left;
    t.heading_align = HAlign::Left;
    t.title_scale = 1.5;
    t.header_small_caps = false;
    drop_cap(&mut t, 3);
    push(t, (6.0, 9.0), [0.85, 0.95, 0.9, 0.75]);

    v
}

pub fn builtin_themes() -> Vec<StyleProfile> {
    themes().into_iter().map(|t| t.style).collect()
}

/// Apply a design and the page it was made for.
pub fn apply_theme(book: &mut Book, t: &Theme) {
    book.style = t.style.clone();
    book.print.trim_w_in = t.trim.0;
    book.print.trim_h_in = t.trim.1;
    book.print.trim_key = trim_for(t.trim.0, t.trim.1).map(|t| t.key.to_string()).unwrap_or_else(|| "custom".into());
    book.print.margin_top_in = t.margins[0];
    book.print.margin_bottom_in = t.margins[1];
    book.print.margin_inside_in = t.margins[2];
    book.print.margin_outside_in = t.margins[3];
}
