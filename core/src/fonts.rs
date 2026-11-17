//! The book fonts (all SIL Open Font License), their metrics for page layout,
//! and their registration with the window's text renderer.

use std::sync::OnceLock;

pub struct FaceData {
    pub family: &'static str,
    pub bold: bool,
    pub italic: bool,
    pub file: &'static str,
    pub bytes: &'static [u8],
}

macro_rules! face {
    ($family:expr, $bold:expr, $italic:expr, $file:expr) => {
        FaceData {
            family: $family,
            bold: $bold,
            italic: $italic,
            file: $file,
            bytes: include_bytes!(concat!("../assets/fonts/", $file)),
        }
    };
}

macro_rules! family4 {
    ($family:expr, $stem:expr) => {
        [
            face!($family, false, false, concat!($stem, "-Regular.ttf")),
            face!($family, false, true, concat!($stem, "-Italic.ttf")),
            face!($family, true, false, concat!($stem, "-Bold.ttf")),
            face!($family, true, true, concat!($stem, "-BoldItalic.ttf")),
        ]
    };
}

pub fn faces() -> &'static [FaceData] {
    static FACES: OnceLock<Vec<FaceData>> = OnceLock::new();
    FACES.get_or_init(|| {
        let mut v: Vec<FaceData> = Vec::new();
        v.extend(family4!("EB Garamond", "EBGaramond"));
        v.extend(family4!("Lora", "Lora"));
        v.extend(family4!("Libre Baskerville", "LibreBaskerville"));
        v.extend(family4!("Source Serif 4", "SourceSerif4"));
        v.extend(family4!("PT Serif", "PTSerif"));
        v.extend(family4!("Cormorant", "Cormorant"));
        v.extend(family4!("Alegreya", "Alegreya"));
        v.extend(family4!("Playfair Display", "PlayfairDisplay"));
        v.extend(family4!("Libre Franklin", "LibreFranklin"));
        v.extend(family4!("Instrument Sans", "InstrumentSans"));
        v.extend(family4!("Gelasio", "Gelasio"));
        v.extend(family4!("Source Code Pro", "SourceCodePro"));
        v.push(face!("Cinzel", false, false, "Cinzel-Regular.ttf"));
        v.push(face!("Cinzel", true, false, "Cinzel-Bold.ttf"));
        v.push(face!("Cinzel Decorative", false, false, "CinzelDecorative-Regular.ttf"));
        v.push(face!("Cinzel Decorative", true, false, "CinzelDecorative-Bold.ttf"));
        v.push(face!("Great Vibes", false, false, "GreatVibes-Regular.ttf"));
        v.push(face!("Parisienne", false, false, "Parisienne-Regular.ttf"));
        v.push(face!("Allura", false, false, "Allura-Regular.ttf"));
        v
    })
}

/// Font families, in the order shown to the person.
pub fn families() -> Vec<&'static str> {
    let mut out: Vec<&'static str> = Vec::new();
    for f in faces() {
        if !out.contains(&f.family) {
            out.push(f.family);
        }
    }
    out
}

pub fn family_kind(family: &str) -> &'static str {
    match family {
        "Libre Franklin" | "Instrument Sans" => "Sans serif",
        "Cinzel" | "Cinzel Decorative" | "Playfair Display" => "Display",
        "Great Vibes" | "Parisienne" | "Allura" => "Script",
        "Source Code Pro" => "Monospace",
        _ => "Serif",
    }
}

/// The bundled family a name refers to (trimmed, any case); unknown names get the first family.
fn resolve_family(family: &str) -> &'static str {
    let fs = faces();
    let t = family.trim();
    fs.iter().find(|f| f.family.eq_ignore_ascii_case(t)).unwrap_or(&fs[0]).family
}

/// Index of the face for a family and style, falling back to the closest style it has
/// (unknown families resolve to the first family).
pub fn face_index(family: &str, bold: bool, italic: bool) -> usize {
    let fs = faces();
    let family = resolve_family(family);
    let mut best: Option<(usize, i32)> = None;
    for (i, f) in fs.iter().enumerate() {
        if f.family != family {
            continue;
        }
        let score = (if f.bold == bold { 2 } else { 0 }) + (if f.italic == italic { 3 } else { 0 });
        if best.map(|b| score > b.1).unwrap_or(true) {
            best = Some((i, score));
        }
    }
    best.map(|b| b.0).unwrap_or(0)
}

/// Whether the face for this request really has the asked-for style (to fake it otherwise).
pub fn has_style(family: &str, bold: bool, italic: bool) -> bool {
    let family = resolve_family(family);
    faces().iter().any(|f| f.family == family && f.bold == bold && f.italic == italic)
}

pub struct Metrics {
    face: ttf_parser::Face<'static>,
    index: usize,
    pub units_per_em: f32,
    pub ascender: f32,
    pub descender: f32,
    pub cap_height: f32,
    pub x_height: f32,
    pub italic_angle: f32,
    pub bbox: [i16; 4],
    pub weight: u16,
    pub postscript_name: String,
}

impl Metrics {
    pub fn glyph(&self, c: char) -> u16 {
        self.face.glyph_index(c).map(|g| g.0).unwrap_or(0)
    }
    pub fn has_char(&self, c: char) -> bool {
        self.face.glyph_index(c).is_some()
    }
    /// Advance width of a glyph in font units.
    pub fn advance_units(&self, gid: u16) -> f32 {
        self.face.glyph_hor_advance(ttf_parser::GlyphId(gid)).unwrap_or(0) as f32
    }
    /// Width of a string at a size in points (no kerning), as drawn with fallback faces.
    pub fn width(&self, s: &str, size: f32) -> f32 {
        s.chars().map(|c| self.char_width(c, size)).sum()
    }
    pub fn char_width(&self, c: char, size: f32) -> f32 {
        if is_invisible(c) {
            return 0.0;
        }
        let m = if self.has_char(c) { self } else { fallback(self.index, c).map(|i| &metrics()[i]).unwrap_or(self) };
        m.advance_units(m.glyph(c)) * size / m.units_per_em
    }
}

/// Characters that are never drawn: soft hyphen (a break point), zero-width space, BOM.
pub fn is_invisible(c: char) -> bool {
    matches!(c, '\u{ad}' | '\u{200b}' | '\u{feff}')
}

/// A face that has `c` when `face` lacks it: the first of the same style, else any.
pub fn fallback(face: usize, c: char) -> Option<usize> {
    let (fs, ms) = (faces(), metrics());
    let style = |i: usize| (fs[i].bold, fs[i].italic);
    let has = |i: &usize| ms[*i].has_char(c);
    (0..fs.len()).filter(|i| style(*i) == style(face)).find(has).or_else(|| (0..fs.len()).find(has))
}

/// Split text into runs of faces that can draw it, starting from `face` (invisible
/// characters dropped; characters no face has stay with `face` and print as .notdef).
pub fn segments(face: usize, text: &str) -> Vec<(usize, String)> {
    let mut out: Vec<(usize, String)> = Vec::new();
    let m = &metrics()[face];
    for c in text.chars().filter(|c| !is_invisible(*c)) {
        let f = if m.has_char(c) { face } else { fallback(face, c).unwrap_or(face) };
        match out.last_mut() {
            Some((lf, s)) if *lf == f => s.push(c),
            _ => out.push((f, c.to_string())),
        }
    }
    out
}

pub fn metrics() -> &'static [Metrics] {
    static M: OnceLock<Vec<Metrics>> = OnceLock::new();
    M.get_or_init(|| {
        faces()
            .iter()
            .enumerate()
            .map(|(index, f)| {
                let face = ttf_parser::Face::parse(f.bytes, 0).expect("bundled font parses");
                let upm = face.units_per_em() as f32;
                let cap = face.capital_height().map(|v| v as f32).unwrap_or(upm * 0.68);
                let xh = face.x_height().map(|v| v as f32).unwrap_or(upm * 0.45);
                let bb = face.global_bounding_box();
                let ps = face
                    .names()
                    .into_iter()
                    .find(|n| n.name_id == ttf_parser::name_id::POST_SCRIPT_NAME)
                    .and_then(|n| n.to_string())
                    .unwrap_or_else(|| f.family.replace(' ', ""));
                Metrics {
                    units_per_em: upm,
                    ascender: face.ascender() as f32,
                    descender: face.descender() as f32,
                    cap_height: cap,
                    x_height: xh,
                    italic_angle: face.italic_angle(),
                    bbox: [bb.x_min, bb.y_min, bb.x_max, bb.y_max],
                    weight: face.weight().to_number(),
                    postscript_name: ps,
                    face,
                    index,
                }
            })
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unknown_family_keeps_styles() {
        let (r, b, i) = (face_index(" lora ", false, false), face_index("Nope", true, false), face_index("Nope", false, true));
        assert_eq!(faces()[r].family, "Lora");
        assert!(faces()[b].bold && !faces()[b].italic);
        assert!(faces()[i].italic && has_style("Nope", false, true));
    }
    #[test]
    fn greek_falls_back() {
        let lora = face_index("Lora", false, false);
        let segs = segments(lora, "a αβγ");
        assert!(segs.iter().all(|(f, s)| s.chars().all(|c| metrics()[*f].has_char(c))), "{segs:?}");
        assert_eq!(segments(lora, "a\u{ad}b"), vec![(lora, "ab".to_string())]);
    }
}
