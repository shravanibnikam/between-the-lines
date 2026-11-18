//! One typeset page as a standalone SVG (for the studio's preview). Items sit exactly where
//! the PDF writer and the old on-screen painter put them: points, y down from the top. Images
//! are embedded whole as `data:` URIs.

use crate::layout::{Doc, Item};
use crate::ornaments::{self, Prim};
use std::fmt::Write as _;

fn n(v: f32) -> String {
    let s = format!("{v:.3}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s.is_empty() || s == "-" || s == "-0" {
        "0".into()
    } else {
        s.to_string()
    }
}

fn hex(c: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", c[0], c[1], c[2])
}

/// Escape for XML text, dropping characters XML 1.0 cannot hold.
fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\t' | '\n' | '\r' => o.push(' '),
            '\u{20}'..='\u{D7FF}' | '\u{E000}'..='\u{FFFD}' | '\u{10000}'..='\u{10FFFF}' => o.push(c),
            _ => {}
        }
    }
    o
}

fn points(pts: impl Iterator<Item = (f32, f32)>) -> String {
    pts.map(|(x, y)| format!("{},{}", n(x), n(y))).collect::<Vec<_>>().join(" ")
}

/// Page `index` of `doc` on `paper` (a CSS colour). Out-of-range indexes give a blank page.
pub fn page_svg(doc: &Doc, index: usize, paper: &str) -> String {
    let (w, h) = (n(doc.w), n(doc.h));
    let mut s = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {w} {h}\" width=\"{w}\" height=\"{h}\" style=\"font-kerning:none;font-variant-ligatures:none;text-rendering:geometricPrecision\">\n<rect x=\"0\" y=\"0\" width=\"{w}\" height=\"{h}\" fill=\"{}\"/>\n",
        esc(paper)
    );
    let Some(page) = doc.pages.get(index) else {
        s.push_str("</svg>\n");
        return s;
    };
    // each image file read once per page, inline (the studio loads images only as data: URIs)
    let mut uris: std::collections::HashMap<&str, Option<String>> = std::collections::HashMap::new();
    for it in &page.items {
        match it {
            Item::Image { src, x, y, w, h } => {
                let uri = uris.entry(src).or_insert_with(|| crate::image::read(&doc.book_id, src).ok().map(|(k, b)| crate::image::data_uri(k, &b)));
                if let Some(u) = uri {
                    let _ = writeln!(s, "<image x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" preserveAspectRatio=\"none\" href=\"{u}\"/>", n(*x), n(*y), n(*w), n(*h));
                }
            }
            Item::Text { x, y, size, face, text, color, spacing, slant } => {
                // the PDF skews by 0.2 (x grows by 0.2 per point of height); y is down here
                let (px, py, tf) = if *slant {
                    ("0".to_string(), "0".to_string(), format!(" transform=\"matrix(1 0 -0.2 1 {} {})\"", n(*x), n(*y)))
                } else {
                    (n(*x), n(*y), String::new())
                };
                let _ = writeln!(
                    s,
                    "<text x=\"{px}\" y=\"{py}\"{tf} font-family=\"bbf-{face}\" font-size=\"{}\" fill=\"{}\" letter-spacing=\"{}\" xml:space=\"preserve\">{}</text>",
                    n(*size), hex(*color), n(*spacing), esc(text)
                );
            }
            Item::Line { x1, y1, x2, y2, width, color } => {
                let _ = writeln!(
                    s,
                    "<line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{}\" stroke-width=\"{}\"/>",
                    n(*x1), n(*y1), n(*x2), n(*y2), hex(*color), n(*width)
                );
            }
            Item::Ornament { key, x, y, w, h, color } => {
                let c = hex(*color);
                let _ = writeln!(s, "<g fill=\"none\" stroke=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\">");
                for p in ornaments::placed(key, *x, *y, *w, *h) {
                    match p {
                        Prim::Stroke { pts, width, closed } => {
                            let tag = if closed { "polygon" } else { "polyline" };
                            let _ = writeln!(s, "<{tag} points=\"{}\" fill=\"none\" stroke=\"{c}\" stroke-width=\"{}\"/>", points(pts.iter().copied()), n(width));
                        }
                        Prim::Fill { pts, .. } => {
                            let _ = writeln!(s, "<polygon points=\"{}\" fill=\"{c}\"/>", points(pts.iter().copied()));
                        }
                        Prim::Band { a, b } => {
                            let _ = writeln!(s, "<polygon points=\"{}\" fill=\"{c}\"/>", points(a.iter().chain(b.iter().rev()).copied()));
                        }
                        Prim::Disc { c: (cx, cy), r } => {
                            let _ = writeln!(s, "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"{c}\"/>", n(cx), n(cy), n(r));
                        }
                        Prim::Ring { c: (cx, cy), r, width } => {
                            let _ = writeln!(s, "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"none\" stroke=\"{c}\" stroke-width=\"{}\"/>", n(cx), n(cy), n(r), n(width));
                        }
                    }
                }
                s.push_str("</g>\n");
            }
        }
    }
    s.push_str("</svg>\n");
    s
}
