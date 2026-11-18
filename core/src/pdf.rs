//! A small PDF writer for print-ready books: embedded TrueType fonts (searchable text),
//! vector ornaments, images, trim and bleed boxes, and optional PDF/X-1a:2001 output for printers.

use crate::fonts::{faces, metrics};
use crate::layout::{Doc, Item, PT_PER_IN};
use crate::ornaments::{self, Prim};
use std::collections::BTreeMap;
use std::fmt::Write as _;

pub const BLEED_IN: f32 = crate::themes::BLEED_IN;

struct Writer {
    out: Vec<u8>,
    offsets: Vec<usize>,
}

impl Writer {
    /// `pdfx` writes a 1.3 header (PDF/X-1a:2001 is built on PDF 1.3).
    fn new(pdfx: bool) -> Self {
        let mut out = Vec::new();
        out.extend_from_slice(if pdfx { b"%PDF-1.3\n%\xE2\xE3\xCF\xD3\n" } else { b"%PDF-1.7\n%\xE2\xE3\xCF\xD3\n" });
        Writer { out, offsets: vec![0] }
    }
    /// Reserve an object number.
    fn alloc(&mut self) -> usize {
        self.offsets.push(0);
        self.offsets.len() - 1
    }
    fn obj(&mut self, id: usize, body: &str) {
        self.offsets[id] = self.out.len();
        self.out.extend_from_slice(format!("{id} 0 obj\n{body}\nendobj\n").as_bytes());
    }
    fn stream(&mut self, id: usize, dict_extra: &str, data: &[u8], compress: bool) {
        self.offsets[id] = self.out.len();
        let (bytes, filter) = if compress {
            (miniz_oxide::deflate::compress_to_vec_zlib(data, 6), "/Filter /FlateDecode ")
        } else {
            (data.to_vec(), "")
        };
        self.out
            .extend_from_slice(format!("{id} 0 obj\n<< {filter}/Length {} {dict_extra}>>\nstream\n", bytes.len()).as_bytes());
        self.out.extend_from_slice(&bytes);
        self.out.extend_from_slice(b"\nendstream\nendobj\n");
    }
    fn finish(mut self, root: usize, info: usize) -> Vec<u8> {
        // a file identifier from the content (same book, same id)
        let id = {
            use std::hash::{Hash, Hasher};
            let h = |salt: u8| {
                let mut s = std::collections::hash_map::DefaultHasher::new();
                (salt, &self.out).hash(&mut s);
                s.finish()
            };
            format!("{:016X}{:016X}", h(0), h(1))
        };
        let xref = self.out.len();
        let n = self.offsets.len();
        let mut x = format!("xref\n0 {n}\n0000000000 65535 f \n");
        for off in self.offsets.iter().skip(1) {
            let _ = writeln!(x, "{off:010} 00000 n ");
        }
        let _ = write!(x, "trailer\n<< /Size {n} /Root {root} 0 R /Info {info} 0 R /ID [<{id}> <{id}>] >>\nstartxref\n{xref}\n%%EOF\n");
        self.out.extend_from_slice(x.as_bytes());
        self.out
    }
}

fn pdf_text_string(s: &str) -> String {
    let mut h = String::from("<FEFF");
    for u in s.encode_utf16() {
        let _ = write!(h, "{u:04X}");
    }
    h.push('>');
    h
}

fn f(v: f32) -> String {
    let s = format!("{v:.3}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s.is_empty() || s == "-" {
        "0".into()
    } else {
        s.to_string()
    }
}

fn color(c: [u8; 3]) -> String {
    format!("{} {} {}", f(c[0] as f32 / 255.0), f(c[1] as f32 / 255.0), f(c[2] as f32 / 255.0))
}

/// Neutral greys within this many levels (of 255) count as grey, not colour.
const NEUTRAL_TOLERANCE: u8 = 3;
/// In PDF/X, neutrals this dark or darker print as solid black.
const NEAR_BLACK: f32 = 0.15;

/// True when red, green and blue are (nearly) equal.
pub fn is_neutral(c: [u8; 3]) -> bool {
    c.iter().max().unwrap_or(&0) - c.iter().min().unwrap_or(&0) <= NEUTRAL_TOLERANCE
}

/// Brightness from 0 (black) to 1 (white), by Rec. 601 luma.
pub fn rgb_to_gray(c: [u8; 3]) -> f32 {
    (0.299 * c[0] as f32 + 0.587 * c[1] as f32 + 0.114 * c[2] as f32) / 255.0
}

/// Cyan, magenta, yellow and black, each 0 to 1.
// ponytail: naive conversion with no ink limit, black generation or profile, so saturated
// colours print duller than on screen; use an ICC transform (lcms2) if colour accuracy matters.
pub fn rgb_to_cmyk(c: [u8; 3]) -> [f32; 4] {
    let [r, g, b] = c.map(|v| v as f32 / 255.0);
    let k = 1.0 - r.max(g).max(b);
    if k >= 1.0 {
        return [0.0, 0.0, 0.0, 1.0];
    }
    [(1.0 - r - k) / (1.0 - k), (1.0 - g - k) / (1.0 - k), (1.0 - b - k) / (1.0 - k), k]
}

/// The fill-colour operator for `c`: `rg`, or in PDF/X (`pdfx`) `g` for neutrals and `k` for the rest.
// Near-black neutrals (the body ink, #1a1a1a) become `0 g`: as a 90% grey tint they would be
// halftoned on press and look fuzzy.
fn fill(c: [u8; 3], pdfx: bool) -> String {
    paint(c, pdfx, ["rg", "g", "k"])
}

/// The stroke-colour operator for `c`; see [`fill`].
fn stroke(c: [u8; 3], pdfx: bool) -> String {
    paint(c, pdfx, ["RG", "G", "K"])
}

fn paint(c: [u8; 3], pdfx: bool, ops: [&str; 3]) -> String {
    if !pdfx {
        return format!("{} {}", color(c), ops[0]);
    }
    if is_neutral(c) {
        let l = rgb_to_gray(c);
        return format!("{} {}", f(if l <= NEAR_BLACK { 0.0 } else { l }), ops[1]);
    }
    let [c, m, y, k] = rgb_to_cmyk(c);
    format!("{} {} {} {} {}", f(c), f(m), f(y), f(k), ops[2])
}

/// The output intent: a registered characterization (CGATS TR 001, SWOP), which PDF/X-1a lets
/// a file name without embedding an ICC profile. PDF 1.3 has no OutputIntents key, but ISO
/// 15930-1 requires it here.
const OUTPUT_INTENT: &str = " /OutputIntents [<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (CGATS TR 001) /RegistryName (http://www.color.org) /OutputCondition (U.S. Web Coated (SWOP) v2) /Info (CGATS TR 001 - SWOP) >>]";

fn circle_path(cx: f32, cy: f32, r: f32) -> String {
    let k = 0.552_284_8 * r;
    format!(
        "{} {} m {} {} {} {} {} {} c {} {} {} {} {} {} c {} {} {} {} {} {} c {} {} {} {} {} {} c h ",
        f(cx + r), f(cy),
        f(cx + r), f(cy + k), f(cx + k), f(cy + r), f(cx), f(cy + r),
        f(cx - k), f(cy + r), f(cx - r), f(cy + k), f(cx - r), f(cy),
        f(cx - r), f(cy - k), f(cx - k), f(cy - r), f(cx), f(cy - r),
        f(cx + k), f(cy - r), f(cx + r), f(cy - k), f(cx + r), f(cy)
    )
}

/// The book as a PDF. `bleed` adds the printer's bleed around the outer edges; `pdfx` writes
/// PDF/X-1a:2001 (PDF 1.3, CMYK and grey only, an output intent) for printers that ask for it.
pub fn write(doc: &Doc, title: &str, author: &str, bleed: bool, pdfx: bool) -> Vec<u8> {
    let b = if bleed { BLEED_IN * PT_PER_IN } else { 0.0 };
    // Which glyphs of which faces are used (for subsetting, widths and copy-paste mapping).
    let mut used: BTreeMap<usize, BTreeMap<u16, char>> = BTreeMap::new();
    for p in &doc.pages {
        for it in &p.items {
            if let Item::Text { face, text, .. } = it {
                let m = &metrics()[*face];
                let e = used.entry(*face).or_default();
                for c in text.chars() {
                    e.entry(m.glyph(c)).or_insert(c);
                }
            }
        }
    }
    let mut w = Writer::new(pdfx);
    let catalog = w.alloc();
    let pages_id = w.alloc();
    let info = w.alloc();
    // Fonts, embedded as subsets holding only the glyphs used; `gids` maps each face's
    // glyph ids to the subset's (identity when a font can't be subset and goes in whole).
    let mut font_ids: BTreeMap<usize, usize> = BTreeMap::new();
    let mut gids: BTreeMap<usize, BTreeMap<u16, u16>> = BTreeMap::new();
    for (face, glyphs) in &used {
        let fd = &faces()[*face];
        let m = &metrics()[*face];
        let scale = 1000.0 / m.units_per_em;
        let mut remap = subsetter::GlyphRemapper::new();
        for g in glyphs.keys() {
            remap.remap(*g);
        }
        let (data, map, tag): (Vec<u8>, BTreeMap<u16, u16>, String) = match subsetter::subset(fd.bytes, 0, &remap) {
            Ok(d) => (d, glyphs.keys().map(|g| (*g, remap.get(*g).unwrap_or(0))).collect(), subset_tag(*face, glyphs)),
            Err(_) => (fd.bytes.to_vec(), glyphs.keys().map(|g| (*g, *g)).collect(), String::new()),
        };
        let file_id = w.alloc();
        w.stream(file_id, &format!("/Length1 {} ", data.len()), &data, true);
        let ps: String = m.postscript_name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
        let ps = format!("{tag}{ps}");
        let desc_id = w.alloc();
        let flags = 32 | if fd.italic { 64 } else { 0 };
        w.obj(
            desc_id,
            &format!(
                "<< /Type /FontDescriptor /FontName /{ps} /Flags {flags} /FontBBox [{} {} {} {}] /ItalicAngle {} /Ascent {} /Descent {} /CapHeight {} /StemV {} /FontFile2 {file_id} 0 R >>",
                f(m.bbox[0] as f32 * scale), f(m.bbox[1] as f32 * scale), f(m.bbox[2] as f32 * scale), f(m.bbox[3] as f32 * scale),
                f(m.italic_angle), f(m.ascender * scale), f(m.descender * scale), f(m.cap_height * scale),
                if m.weight >= 600 { 140 } else { 80 }
            ),
        );
        let mut widths = String::new();
        for gid in glyphs.keys() {
            let _ = write!(widths, "{} [{}] ", map[gid], f(m.advance_units(*gid) * scale));
        }
        let cid_id = w.alloc();
        w.obj(
            cid_id,
            &format!(
                "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /{ps} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor {desc_id} 0 R /DW 1000 /W [{widths}] /CIDToGIDMap /Identity >>"
            ),
        );
        // ToUnicode
        let mut cmap = String::from(
            "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n",
        );
        let pairs: Vec<(&u16, &char)> = glyphs.iter().collect();
        for chunk in pairs.chunks(100) {
            let _ = writeln!(cmap, "{} beginbfchar", chunk.len());
            for (gid, ch) in chunk {
                let mut u = String::new();
                let mut buf = [0u16; 2];
                for unit in ch.encode_utf16(&mut buf) {
                    let _ = write!(u, "{unit:04X}");
                }
                let _ = writeln!(cmap, "<{:04X}> <{u}>", map[*gid]);
            }
            cmap.push_str("endbfchar\n");
        }
        cmap.push_str("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n");
        let tu_id = w.alloc();
        w.stream(tu_id, "", cmap.as_bytes(), true);
        let font_id = w.alloc();
        w.obj(
            font_id,
            &format!("<< /Type /Font /Subtype /Type0 /BaseFont /{ps} /Encoding /Identity-H /DescendantFonts [{cid_id} 0 R] /ToUnicode {tu_id} 0 R >>"),
        );
        font_ids.insert(*face, font_id);
        gids.insert(*face, map);
    }
    let mut font_res = String::new();
    for (face, id) in &font_ids {
        let _ = write!(font_res, "/F{face} {id} 0 R ");
    }
    let (images, xobj_res) = image_objects(&mut w, doc, pdfx);
    // Pages
    let mut kids = Vec::new();
    let (tw, th) = (doc.w, doc.h);
    for page in &doc.pages {
        let mut c = String::new();
        let xo = if page.recto { 0.0 } else { b };
        if b > 0.0 {
            let _ = writeln!(c, "1 0 0 1 {} {} cm", f(xo), f(b));
        }
        for it in &page.items {
            match it {
                Item::Text { x, y, size, face, text, color: col, spacing, slant } => {
                    let (m, map) = (&metrics()[*face], &gids[face]);
                    let mut hex = String::with_capacity(text.len() * 4);
                    for ch in text.chars() {
                        let _ = write!(hex, "{:04X}", map[&m.glyph(ch)]);
                    }
                    let skew = if *slant { 0.2 } else { 0.0 };
                    let _ = writeln!(
                        c,
                        "BT /F{face} {} Tf {} {} Tc 1 0 {} 1 {} {} Tm <{hex}> Tj ET",
                        f(*size), fill(*col, pdfx), f(*spacing), f(skew), f(*x), f(th - *y)
                    );
                }
                Item::Line { x1, y1, x2, y2, width, color: col } => {
                    let _ = writeln!(c, "{} w {} {} {} m {} {} l S", f(*width), stroke(*col, pdfx), f(*x1), f(th - y1), f(*x2), f(th - y2));
                }
                Item::Ornament { key, x, y, w: ow, h: oh, color: col } => {
                    let _ = writeln!(c, "q {} {} 1 J 1 j", fill(*col, pdfx), stroke(*col, pdfx));
                    for p in ornaments::placed(key, *x, *y, *ow, *oh) {
                        match p {
                            Prim::Stroke { pts, width, closed } => {
                                let _ = write!(c, "{} w ", f(width));
                                for (i, (px, py)) in pts.iter().enumerate() {
                                    let _ = write!(c, "{} {} {} ", f(*px), f(th - py), if i == 0 { "m" } else { "l" });
                                }
                                c.push_str(if closed { "h S\n" } else { "S\n" });
                            }
                            Prim::Fill { pts, .. } => {
                                for (i, (px, py)) in pts.iter().enumerate() {
                                    let _ = write!(c, "{} {} {} ", f(*px), f(th - py), if i == 0 { "m" } else { "l" });
                                }
                                c.push_str("h f\n");
                            }
                            Prim::Band { a, b: bb } => {
                                for (i, (px, py)) in a.iter().chain(bb.iter().rev()).enumerate() {
                                    let _ = write!(c, "{} {} {} ", f(*px), f(th - py), if i == 0 { "m" } else { "l" });
                                }
                                c.push_str("h f\n");
                            }
                            Prim::Disc { c: (cx, cy), r } => {
                                c.push_str(&circle_path(cx, th - cy, r));
                                c.push_str("f\n");
                            }
                            Prim::Ring { c: (cx, cy), r, width } => {
                                let _ = write!(c, "{} w ", f(width));
                                c.push_str(&circle_path(cx, th - cy, r));
                                c.push_str("S\n");
                            }
                        }
                    }
                    c.push_str("Q\n");
                }
                Item::Image { src, x, y, w: iw, h: ih } => {
                    if let Some(Some(k)) = images.get(src.as_str()) {
                        let _ = writeln!(c, "q {} 0 0 {} {} {} cm /Im{k} Do Q", f(*iw), f(*ih), f(*x), f(th - y - ih));
                    }
                }
            }
        }
        let content_id = w.alloc();
        w.stream(content_id, "", c.as_bytes(), true);
        let page_id = w.alloc();
        let media_w = tw + b;
        let media_h = th + 2.0 * b;
        let trim = format!("[{} {} {} {}]", f(xo), f(b), f(xo + tw), f(b + th));
        w.obj(
            page_id,
            &format!(
                "<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {} {}] /TrimBox {trim} /BleedBox [0 0 {} {}] /Resources << /Font << {font_res}>>{xobj_res} >> /Contents {content_id} 0 R >>",
                f(media_w), f(media_h), f(media_w), f(media_h)
            ),
        );
        kids.push(page_id);
    }
    let kids_s: Vec<String> = kids.iter().map(|k| format!("{k} 0 R")).collect();
    w.obj(pages_id, &format!("<< /Type /Pages /Kids [{}] /Count {} >>", kids_s.join(" "), kids.len()));
    // /Lang is PDF 1.4, so PDF/X goes without it
    let lang = if doc.lang.is_empty() || pdfx { String::new() } else { format!(" /Lang {}", pdf_text_string(&doc.lang)) };
    let intent = if pdfx { OUTPUT_INTENT } else { "" };
    w.obj(catalog, &format!("<< /Type /Catalog /Pages {pages_id} 0 R /PageLayout /TwoPageRight{lang}{intent} >>"));
    // the details as printed: curly quotes, no markup characters
    let clean = |s: &str| crate::markup::plain(&crate::markup::parse_inline(s, true));
    let x_info = if pdfx {
        let now = chrono::Utc::now().format("D:%Y%m%d%H%M%SZ");
        format!(" /CreationDate ({now}) /ModDate ({now}) /Trapped /False /GTS_PDFXVersion (PDF/X-1:2001) /GTS_PDFXConformance (PDF/X-1a:2001)")
    } else {
        String::new()
    };
    w.obj(
        info,
        &format!(
            "<< /Title {} /Author {} /Producer {} /Creator {}{x_info} >>",
            pdf_text_string(&clean(title)),
            pdf_text_string(&clean(author)),
            pdf_text_string(crate::storage::APP_NAME),
            pdf_text_string(crate::storage::APP_NAME)
        ),
    );
    w.finish(catalog, info)
}

/// Each image the pages use, decoded once into an Image XObject (Flate-compressed pixels, any
/// transparency as a soft mask). Returns the `/Im{k}` number per file (None when it couldn't be
/// read) and the pages' `/XObject` resource entry.
fn image_objects<'a>(w: &mut Writer, doc: &'a Doc, pdfx: bool) -> (BTreeMap<&'a str, Option<usize>>, String) {
    let mut images: BTreeMap<&str, Option<usize>> = BTreeMap::new();
    let mut res = String::new();
    for it in doc.pages.iter().flat_map(|p| &p.items) {
        let Item::Image { src, .. } = it else { continue };
        if images.contains_key(src.as_str()) {
            continue;
        }
        let Some(r) = crate::image::read(&doc.book_id, src).ok().and_then(|(_, b)| crate::image::decode(&b).ok()) else {
            images.insert(src, None);
            continue;
        };
        let dict = |cs: &str| format!("/Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /{cs} /BitsPerComponent 8 ", r.w, r.h);
        if pdfx {
            let (cs, px) = pdfx_pixels(&r);
            let id = w.alloc();
            w.stream(id, &dict(cs), &px, true);
            let k = images.values().flatten().count();
            let _ = write!(res, "/Im{k} {id} 0 R ");
            images.insert(src, Some(k));
            continue;
        }
        let smask = match &r.alpha {
            Some(a) => {
                let id = w.alloc();
                w.stream(id, &dict("DeviceGray"), a, true);
                format!("/SMask {id} 0 R ")
            }
            None => String::new(),
        };
        let id = w.alloc();
        w.stream(id, &format!("{}{smask}", dict(if r.channels == 1 { "DeviceGray" } else { "DeviceRGB" })), &r.pixels, true);
        let k = images.values().flatten().count();
        let _ = write!(res, "/Im{k} {id} 0 R ");
        images.insert(src, Some(k));
    }
    let res = if res.is_empty() { res } else { format!(" /XObject << {res}>>") };
    (images, res)
}

/// Pixels for PDF/X-1a, which allows no RGB and no transparency: see-through areas are
/// flattened onto white paper, then the image becomes grey when every pixel is neutral, else CMYK.
fn pdfx_pixels(r: &crate::image::Raster) -> (&'static str, Vec<u8>) {
    let n = (r.w * r.h) as usize;
    let rgb = |i: usize| -> [u8; 3] {
        let c = if r.channels == 1 { [r.pixels[i]; 3] } else { [r.pixels[3 * i], r.pixels[3 * i + 1], r.pixels[3 * i + 2]] };
        match &r.alpha {
            // over white: c * a + 255 * (1 - a)
            Some(a) => c.map(|v| ((v as u32 * a[i] as u32 + 255 * (255 - a[i] as u32)) / 255) as u8),
            None => c,
        }
    };
    if r.channels == 1 || (0..n).all(|i| is_neutral(rgb(i))) {
        return ("DeviceGray", (0..n).map(|i| (rgb_to_gray(rgb(i)) * 255.0).round() as u8).collect());
    }
    let px = (0..n).flat_map(|i| rgb_to_cmyk(rgb(i)).map(|v| (v * 255.0).round() as u8)).collect();
    ("DeviceCMYK", px)
}

/// The six-capital tag that marks a subset font's name (PDF 9.6.4), stable for its glyphs.
fn subset_tag(face: usize, glyphs: &BTreeMap<u16, char>) -> String {
    use std::hash::{Hash, Hasher};
    let mut s = std::collections::hash_map::DefaultHasher::new();
    (face, glyphs.keys().collect::<Vec<_>>()).hash(&mut s);
    let mut v = s.finish();
    let mut tag: String = (0..6)
        .map(|_| {
            let c = (b'A' + (v % 26) as u8) as char;
            v /= 26;
            c
        })
        .collect();
    tag.push('+');
    tag
}

#[cfg(test)]
mod tests {
    /// Check every cross-reference offset points at its object; returns the table.
    fn xref_table(pdf: &[u8]) -> &str {
        let sx = pdf.windows(10).rposition(|w| w == b"startxref\n").unwrap();
        let tail = std::str::from_utf8(&pdf[sx + 10..]).unwrap();
        let xref: usize = tail.lines().next().unwrap().trim().parse().unwrap();
        let table = std::str::from_utf8(&pdf[xref..]).unwrap();
        assert!(table.starts_with("xref\n0 "));
        let n: usize = table.lines().nth(1).unwrap().split(' ').nth(1).unwrap().parse().unwrap();
        for (i, line) in table.lines().skip(2).take(n).enumerate().skip(1) {
            assert_eq!(line.len(), 19, "{line:?}"); // 20 bytes with the newline
            let off: usize = line[..10].parse().unwrap();
            assert!(pdf[off..].starts_with(format!("{i} 0 obj").as_bytes()), "object {i}");
        }
        table
    }

    /// Every content stream's operators, decompressed (binary streams such as fonts are skipped).
    fn content(pdf: &[u8]) -> String {
        let mut all = String::new();
        let mut at = 0;
        while let Some(i) = pdf[at..].windows(10).position(|w| w == b">>\nstream\n") {
            let start = at + i + 10;
            let end = start + pdf[start..].windows(10).position(|w| w == b"\nendstream").unwrap();
            if let Ok(Ok(text)) = miniz_oxide::inflate::decompress_to_vec_zlib(&pdf[start..end]).map(String::from_utf8) {
                all.push_str(&text);
            }
            at = end;
        }
        all
    }

    /// The four numbers after the `page`-th `key` (such as `/TrimBox [`).
    fn boxes(pdf: &[u8], key: &str, page: usize) -> Vec<f32> {
        let text = String::from_utf8_lossy(pdf);
        let at = text.match_indices(key).nth(page).unwrap().0 + key.len();
        text[at..].split(']').next().unwrap().split(' ').map(|n| n.parse().unwrap()).collect()
    }

    /// PDF/X-1a: PDF 1.3, the Info and Catalog keys, only grey and CMYK, no 1.4+ keys.
    #[test]
    fn pdfx_structure() {
        let book = crate::sample::sample_book();
        let doc = crate::layout::typeset(&book, crate::layout::Opts::default());
        let pdf = super::write(&doc, "Title", "Author", true, true);
        let has = |s: &str| pdf.windows(s.len()).any(|w| w == s.as_bytes());
        xref_table(&pdf);
        assert!(pdf.starts_with(b"%PDF-1.3\n"));
        for key in [
            "/Title ", "/Author ", "/CreationDate (D:", "/ModDate (D:", "/Trapped /False", "/GTS_PDFXVersion (PDF/X-1:2001)",
            "/GTS_PDFXConformance (PDF/X-1a:2001)", "/OutputIntents [<<", "/S /GTS_PDFX", "/OutputConditionIdentifier (CGATS TR 001)",
            "/RegistryName (http://www.color.org)", "/OutputCondition (", "/Info (", "/ID [<",
        ] {
            assert!(has(key), "{key}");
        }
        assert!(!has("/Lang") && !has("DeviceRGB") && !has("/SMask"));
        let ops = content(&pdf);
        assert!(!ops.contains(" rg") && !ops.contains(" RG"), "RGB operator in X mode");
        assert!(ops.contains(" 0 g\n") || ops.contains(" 0 g "), "near-black ink should be solid black");
        assert!(content(&super::write(&doc, "T", "A", true, false)).contains(" rg"));
    }

    /// PDF/X images: alpha flattened onto white, neutral images grey, colour images CMYK.
    #[test]
    fn pdfx_image_pixels() {
        use crate::image::Raster;
        let grey = Raster { w: 2, h: 1, channels: 3, pixels: vec![0, 0, 0, 200, 200, 200], alpha: Some(vec![0, 255]) };
        assert_eq!(super::pdfx_pixels(&grey), ("DeviceGray", vec![255, 200])); // see-through black is white paper
        let red = Raster { w: 1, h: 1, channels: 3, pixels: vec![255, 0, 0], alpha: None };
        assert_eq!(super::pdfx_pixels(&red), ("DeviceCMYK", vec![0, 255, 255, 0]));
        let one = Raster { w: 1, h: 1, channels: 1, pixels: vec![10], alpha: Some(vec![255]) };
        assert_eq!(super::pdfx_pixels(&one), ("DeviceGray", vec![10]));
    }

    /// Near-black neutrals are solid black, other neutrals grey, colours CMYK; normal mode is RGB.
    #[test]
    fn colour_operators() {
        assert_eq!(super::fill([0x1a; 3], true), "0 g");
        assert_eq!(super::stroke([0x1a; 3], true), "0 G");
        assert_eq!(super::fill([0x1a; 3], false), "0.102 0.102 0.102 rg");
        assert_eq!(super::fill([255; 3], true), "1 g");
        assert_eq!(super::fill([128; 3], true), "0.502 g");
        assert_eq!(super::fill([255, 0, 0], true), "0 1 1 0 k");
        assert_eq!(super::stroke([0, 0, 0], true), "0 G");
        assert_eq!(super::fill([0, 0, 255], false), "0 0 1 rg");
    }

    /// Every page has a trim box inside a bleed box inside the media box, with bleed only above,
    /// below and on the outside edge.
    #[test]
    fn boxes_nest() {
        let book = crate::sample::sample_book();
        let doc = crate::layout::typeset(&book, crate::layout::Opts::default());
        let b = super::BLEED_IN * crate::layout::PT_PER_IN;
        for bleed in [false, true] {
            let pdf = super::write(&doc, "T", "A", bleed, false);
            for (i, page) in doc.pages.iter().enumerate() {
                let (m, bl, t) = (boxes(&pdf, "/MediaBox [", i), boxes(&pdf, "/BleedBox [", i), boxes(&pdf, "/TrimBox [", i));
                assert!(m[0] <= bl[0] && m[1] <= bl[1] && bl[2] <= m[2] && bl[3] <= m[3], "bleed in media, page {i}");
                assert!(bl[0] <= t[0] && bl[1] <= t[1] && t[2] <= bl[2] && t[3] <= bl[3], "trim in bleed, page {i}");
                assert!((t[2] - t[0] - doc.w).abs() < 0.01 && (t[3] - t[1] - doc.h).abs() < 0.01, "trim size, page {i}");
                let want = if !bleed { [0.0; 4] } else { [if page.recto { 0.0 } else { b }, b, if page.recto { b } else { 0.0 }, b] };
                let got = [t[0] - m[0], t[1] - m[1], m[2] - t[2], m[3] - t[3]];
                assert!(got.iter().zip(want).all(|(g, w)| (g - w).abs() < 0.01), "page {i}: {got:?} vs {want:?}");
            }
        }
    }
    /// Cross-reference offsets point at their objects; catalog, trailer and details are right.
    #[test]
    fn structure_is_valid() {
        let book = crate::sample::sample_book();
        let doc = crate::layout::typeset(&book, crate::layout::Opts::default());
        let pdf = super::write(&doc, "It's *Big*", "Ada \"A\" Marlowe", true, false);
        let has = |s: &str| pdf.windows(s.len()).any(|w| w == s.as_bytes());
        let table = xref_table(&pdf);
        assert!(has(&format!("/Lang {}", super::pdf_text_string("en"))));
        assert!(table.contains("/ID [<"));
        assert!(has(&super::pdf_text_string("It’s Big")) && has(&super::pdf_text_string("Ada “A” Marlowe")));
        // fonts are subset (each whole face is 200-800 KB)
        assert!(has("+EBGaramond-Regular") && pdf.len() < 120_000, "{}", pdf.len());
    }

    /// Typeset the sample book and write every export format to a temporary folder.
    #[test]
    fn sample_exports() {
        let book = crate::sample::sample_book();
        let doc = crate::layout::typeset(&book, crate::layout::Opts::default());
        assert!(doc.pages.len() >= 8, "pages: {}", doc.pages.len());
        let dir = std::env::temp_dir().join("bookbinder-selftest");
        std::fs::create_dir_all(&dir).unwrap();
        let pdf = super::write(&doc, &book.meta.title, &book.meta.author, false, false);
        assert!(pdf.starts_with(b"%PDF-1.7"));
        std::fs::write(dir.join("print.pdf"), &pdf).unwrap();
        std::fs::write(dir.join("bleed.pdf"), super::write(&doc, &book.meta.title, &book.meta.author, true, false)).unwrap();
        std::fs::write(dir.join("print-x.pdf"), super::write(&doc, &book.meta.title, &book.meta.author, true, true)).unwrap();
        let lp = crate::layout::typeset(&book, crate::layout::Opts { large_print: true });
        assert!(lp.pages.len() > doc.pages.len());
        std::fs::write(dir.join("large.pdf"), super::write(&lp, &book.meta.title, &book.meta.author, false, false)).unwrap();
        for t in [crate::model::EbookTarget::Kindle, crate::model::EbookTarget::Apple, crate::model::EbookTarget::Generic] {
            let e = crate::epub::write(&book, t).unwrap();
            std::fs::write(dir.join(format!("{}.epub", t.label())), &e.bytes).unwrap();
        }
        for th in crate::themes::builtin_themes() {
            let mut b = book.clone();
            b.style = th.clone();
            let d = crate::layout::typeset(&b, crate::layout::Opts::default());
            assert!(!d.pages.is_empty(), "{}", th.name);
        }
    }
}
