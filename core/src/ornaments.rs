//! Decorative ornaments for chapter openings and scene breaks, drawn as simple vector
//! shapes (our own designs) so the same artwork goes to the screen, PDF and EPUB (SVG).

pub type Pt = (f32, f32);

#[derive(Clone, Debug)]
pub enum Prim {
    /// An open or closed line through points.
    Stroke { pts: Vec<Pt>, width: f32, closed: bool },
    /// A filled shape whose every edge is visible from `center` (stars, leaves).
    Fill { pts: Vec<Pt>, center: Pt },
    /// A filled band between two lines with the same number of points (crescents).
    Band { a: Vec<Pt>, b: Vec<Pt> },
    Disc { c: Pt, r: f32 },
    Ring { c: Pt, r: f32, width: f32 },
}

/// (key, name) of every ornament, "none" first.
pub const ORNAMENTS: &[(&str, &str)] = &[
    ("none", "None"),
    ("asterism", "Asterism"),
    ("stars", "Three stars"),
    ("diamond-rule", "Diamond rule"),
    ("dots", "Three dots"),
    ("leaves", "Twin leaves"),
    ("flourish", "Flourish"),
    ("vine", "Vine"),
    ("wave", "Wave"),
    ("double-rule", "Double rule"),
    ("deco", "Art deco"),
    ("sun", "Sunburst"),
    ("moon", "Moon and stars"),
    ("compass", "Compass star"),
    ("rule", "Short rule"),
];

pub fn name(key: &str) -> &'static str {
    ORNAMENTS.iter().find(|o| o.0 == key).map(|o| o.1).unwrap_or("None")
}

fn star(cx: f32, cy: f32, outer: f32, inner: f32, points: usize, rot_deg: f32) -> Prim {
    let mut pts = Vec::new();
    for i in 0..points * 2 {
        let r = if i % 2 == 0 { outer } else { inner };
        let a = (rot_deg - 90.0).to_radians() + i as f32 * std::f32::consts::PI / points as f32;
        pts.push((cx + r * a.cos(), cy + r * a.sin()));
    }
    Prim::Fill { pts, center: (cx, cy) }
}

fn cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: usize) -> Vec<Pt> {
    (0..=n)
        .map(|i| {
            let t = i as f32 / n as f32;
            let u = 1.0 - t;
            let b0 = u * u * u;
            let b1 = 3.0 * u * u * t;
            let b2 = 3.0 * u * t * t;
            let b3 = t * t * t;
            (
                b0 * p0.0 + b1 * p1.0 + b2 * p2.0 + b3 * p3.0,
                b0 * p0.1 + b1 * p1.1 + b2 * p2.1 + b3 * p3.1,
            )
        })
        .collect()
}

/// A leaf from `base` to `tip`, `bulge` wide on each side.
fn leaf(base: Pt, tip: Pt, bulge: f32) -> Prim {
    let (dx, dy) = (tip.0 - base.0, tip.1 - base.1);
    let len = (dx * dx + dy * dy).sqrt().max(0.001);
    let (nx, ny) = (-dy / len * bulge, dx / len * bulge);
    let a1 = (base.0 + dx * 0.3 + nx, base.1 + dy * 0.3 + ny);
    let a2 = (base.0 + dx * 0.75 + nx * 0.7, base.1 + dy * 0.75 + ny * 0.7);
    let b1 = (base.0 + dx * 0.75 - nx * 0.7, base.1 + dy * 0.75 - ny * 0.7);
    let b2 = (base.0 + dx * 0.3 - nx, base.1 + dy * 0.3 - ny);
    let mut pts = cubic(base, a1, a2, tip, 14);
    let back = cubic(tip, b1, b2, base, 14);
    pts.extend(back.into_iter().skip(1));
    pts.pop();
    let center = (base.0 + dx * 0.45, base.1 + dy * 0.45);
    Prim::Fill { pts, center }
}

fn mirror_x(p: &Prim, w: f32) -> Prim {
    let m = |v: &Vec<Pt>| v.iter().map(|&(x, y)| (w - x, y)).collect::<Vec<Pt>>();
    match p {
        Prim::Stroke { pts, width, closed } => Prim::Stroke { pts: m(pts), width: *width, closed: *closed },
        Prim::Fill { pts, center } => Prim::Fill { pts: m(pts), center: (w - center.0, center.1) },
        Prim::Band { a, b } => Prim::Band { a: m(a), b: m(b) },
        Prim::Disc { c, r } => Prim::Disc { c: (w - c.0, c.1), r: *r },
        Prim::Ring { c, r, width } => Prim::Ring { c: (w - c.0, c.1), r: *r, width: *width },
    }
}

fn line(a: Pt, b: Pt, width: f32) -> Prim {
    Prim::Stroke { pts: vec![a, b], width, closed: false }
}

/// The ornament's design box (width, height) and its shapes inside it (y grows downwards).
pub fn shapes(key: &str) -> (f32, f32, Vec<Prim>) {
    match key {
        "asterism" => (60.0, 52.0, vec![star(30.0, 13.0, 11.0, 4.0, 6, 0.0), star(14.0, 39.0, 11.0, 4.0, 6, 0.0), star(46.0, 39.0, 11.0, 4.0, 6, 0.0)]),
        "stars" => (120.0, 26.0, vec![star(30.0, 13.0, 8.0, 3.4, 5, 0.0), star(60.0, 13.0, 11.0, 4.6, 5, 0.0), star(90.0, 13.0, 8.0, 3.4, 5, 0.0)]),
        "diamond-rule" => (
            200.0,
            20.0,
            vec![
                line((8.0, 10.0), (84.0, 10.0), 1.2),
                Prim::Disc { c: (88.0, 10.0), r: 1.8 },
                Prim::Fill { pts: vec![(91.0, 10.0), (100.0, 2.5), (109.0, 10.0), (100.0, 17.5)], center: (100.0, 10.0) },
                Prim::Disc { c: (112.0, 10.0), r: 1.8 },
                line((116.0, 10.0), (192.0, 10.0), 1.2),
            ],
        ),
        "dots" => (90.0, 16.0, vec![Prim::Disc { c: (25.0, 8.0), r: 3.2 }, Prim::Disc { c: (45.0, 8.0), r: 3.2 }, Prim::Disc { c: (65.0, 8.0), r: 3.2 }]),
        "leaves" => {
            let w = 120.0;
            let right = leaf((66.0, 22.0), (108.0, 22.0), 11.0);
            let left = mirror_x(&right, w);
            (
                w,
                44.0,
                vec![
                    right,
                    left,
                    Prim::Disc { c: (60.0, 22.0), r: 4.2 },
                    Prim::Disc { c: (60.0, 11.0), r: 2.0 },
                    Prim::Disc { c: (60.0, 33.0), r: 2.0 },
                ],
            )
        }
        "flourish" => {
            let w = 200.0;
            let mut s = cubic((110.0, 20.0), (130.0, 2.0), (155.0, 38.0), (178.0, 20.0), 24);
            s.extend(cubic((178.0, 20.0), (186.0, 13.0), (194.0, 18.0), (188.0, 24.0), 10).into_iter().skip(1));
            let right = Prim::Stroke { pts: s, width: 1.6, closed: false };
            let left = mirror_x(&right, w);
            (
                w,
                40.0,
                vec![
                    right,
                    left,
                    Prim::Fill { pts: vec![(92.0, 20.0), (100.0, 11.0), (108.0, 20.0), (100.0, 29.0)], center: (100.0, 20.0) },
                ],
            )
        }
        "vine" => {
            let w = 180.0;
            let stem = Prim::Stroke {
                pts: cubic((97.0, 24.0), (120.0, 40.0), (142.0, 2.0), (168.0, 20.0), 24),
                width: 1.4,
                closed: false,
            };
            let small = leaf((128.0, 22.0), (140.0, 34.0), 4.0);
            let tipdot = Prim::Disc { c: (170.0, 21.0), r: 2.2 };
            let mut v = vec![leaf((90.0, 36.0), (90.0, 4.0), 7.5)];
            for p in [stem, small, tipdot] {
                v.push(mirror_x(&p, w));
                v.push(p);
            }
            (w, 40.0, v)
        }
        "wave" => {
            let pts: Vec<Pt> = (0..=80)
                .map(|i| {
                    let x = 10.0 + i as f32 * 140.0 / 80.0;
                    let y = 10.0 + 5.0 * ((x - 10.0) / 140.0 * std::f32::consts::PI * 5.0).sin();
                    (x, y)
                })
                .collect();
            (160.0, 20.0, vec![Prim::Stroke { pts, width: 1.4, closed: false }])
        }
        "double-rule" => (160.0, 14.0, vec![line((20.0, 4.0), (140.0, 4.0), 1.0), line((32.0, 10.0), (128.0, 10.0), 1.0)]),
        "deco" => {
            let w = 200.0;
            let right = vec![
                line((114.0, 15.0), (192.0, 15.0), 1.3),
                line((114.0, 9.5), (170.0, 9.5), 0.8),
                line((114.0, 20.5), (170.0, 20.5), 0.8),
            ];
            let mut v: Vec<Prim> = right.iter().map(|p| mirror_x(p, w)).collect();
            v.extend(right);
            v.push(Prim::Fill { pts: vec![(100.0, 2.0), (110.0, 15.0), (100.0, 28.0), (90.0, 15.0)], center: (100.0, 15.0) });
            (w, 30.0, v)
        }
        "sun" => {
            let mut v = vec![Prim::Disc { c: (30.0, 30.0), r: 8.5 }];
            for i in 0..12 {
                let a = i as f32 * std::f32::consts::PI / 6.0;
                let r2 = if i % 2 == 0 { 25.0 } else { 20.0 };
                v.push(line((30.0 + 12.5 * a.cos(), 30.0 + 12.5 * a.sin()), (30.0 + r2 * a.cos(), 30.0 + r2 * a.sin()), 1.6));
            }
            (60.0, 60.0, v)
        }
        "moon" => {
            let n = 30;
            let (a0, a1) = (65f32.to_radians(), 295f32.to_radians());
            let mut outer = Vec::new();
            let mut inner = Vec::new();
            for i in 0..=n {
                let t = a0 + (a1 - a0) * i as f32 / n as f32;
                outer.push((34.0 + 18.0 * t.cos(), 25.0 - 18.0 * t.sin()));
                inner.push((41.0 + 14.0 * t.cos(), 25.0 - 14.0 * t.sin()));
            }
            inner[0] = outer[0];
            inner[n] = outer[n];
            (80.0, 50.0, vec![Prim::Band { a: outer, b: inner }, star(60.0, 14.0, 5.5, 2.3, 5, 0.0), star(67.0, 32.0, 3.6, 1.5, 5, 0.0)])
        }
        "compass" => (
            60.0,
            60.0,
            vec![
                Prim::Fill {
                    pts: vec![(30.0, 3.0), (34.0, 26.0), (57.0, 30.0), (34.0, 34.0), (30.0, 57.0), (26.0, 34.0), (3.0, 30.0), (26.0, 26.0)],
                    center: (30.0, 30.0),
                },
                Prim::Ring { c: (30.0, 30.0), r: 13.0, width: 1.0 },
            ],
        ),
        "rule" => (120.0, 6.0, vec![line((0.0, 3.0), (120.0, 3.0), 1.0)]),
        _ => (1.0, 1.0, Vec::new()),
    }
}

/// Map an ornament into a rectangle (x, y, w, h), keeping its proportions and centring it.
pub fn placed(key: &str, x: f32, y: f32, w: f32, h: f32) -> Vec<Prim> {
    let (bw, bh, prims) = shapes(key);
    let s = (w / bw).min(h / bh);
    let ox = x + (w - bw * s) / 2.0;
    let oy = y + (h - bh * s) / 2.0;
    let t = |p: &Pt| (ox + p.0 * s, oy + p.1 * s);
    let tv = |v: &Vec<Pt>| v.iter().map(t).collect::<Vec<Pt>>();
    prims
        .iter()
        .map(|p| match p {
            Prim::Stroke { pts, width, closed } => Prim::Stroke { pts: tv(pts), width: width * s, closed: *closed },
            Prim::Fill { pts, center } => Prim::Fill { pts: tv(pts), center: t(center) },
            Prim::Band { a, b } => Prim::Band { a: tv(a), b: tv(b) },
            Prim::Disc { c, r } => Prim::Disc { c: t(c), r: r * s },
            Prim::Ring { c, r, width } => Prim::Ring { c: t(c), r: r * s, width: width * s },
        })
        .collect()
}

/// The ornament's height for a given width.
pub fn height_for_width(key: &str, w: f32) -> f32 {
    let (bw, bh, _) = shapes(key);
    w * bh / bw
}

/// The ornament as a standalone SVG document (for ebooks).
pub fn svg(key: &str, color: &str) -> String {
    let (w, h, prims) = shapes(key);
    // the colour goes into attributes: accept hex or a colour name only
    let c = color.trim();
    let ok = (c.starts_with('#') && (4..=9).contains(&c.len()) && c[1..].chars().all(|x| x.is_ascii_hexdigit()))
        || (!c.is_empty() && c.len() <= 20 && c.chars().all(|x| x.is_ascii_alphabetic()));
    let color = if ok { c } else { "#000000" };
    let mut s = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {w} {h}\" width=\"{w}\" height=\"{h}\">\n"
    );
    let path = |pts: &Vec<Pt>, close: bool| {
        let mut d = String::new();
        for (i, p) in pts.iter().enumerate() {
            d.push_str(&format!("{}{:.2} {:.2} ", if i == 0 { "M" } else { "L" }, p.0, p.1));
        }
        if close {
            d.push('Z');
        }
        d
    };
    for p in prims {
        match p {
            Prim::Stroke { pts, width, closed } => s.push_str(&format!(
                "<path d=\"{}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"{width}\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n",
                path(&pts, closed)
            )),
            Prim::Fill { pts, .. } => s.push_str(&format!("<path d=\"{}\" fill=\"{color}\"/>\n", path(&pts, true))),
            Prim::Band { a, b } => {
                let mut all = a.clone();
                all.extend(b.iter().rev());
                s.push_str(&format!("<path d=\"{}\" fill=\"{color}\"/>\n", path(&all, true)))
            }
            Prim::Disc { c, r } => s.push_str(&format!("<circle cx=\"{}\" cy=\"{}\" r=\"{r}\" fill=\"{color}\"/>\n", c.0, c.1)),
            Prim::Ring { c, r, width } => s.push_str(&format!(
                "<circle cx=\"{}\" cy=\"{}\" r=\"{r}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"{width}\"/>\n",
                c.0, c.1
            )),
        }
    }
    s.push_str("</svg>\n");
    s
}

/// Scene-break glyph choices (text drawn in the body font).
pub const GLYPHS: &[&str] = &["* * *", "⁂", "•  •  •", "~", "§", "◆", "#"];

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn svg_color_is_sanitised() {
        let k = "asterism";
        let s = svg(k, "\"/><script>x</script>");
        assert!(!s.contains("<script") && roxmltree::Document::parse(&s).is_ok());
        assert!(svg(k, "#8a6d3b").contains("#8a6d3b"));
    }
}
