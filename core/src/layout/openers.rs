//! Chapter openings and their ornaments.

use super::*;

impl<'a> Typesetter<'a> {
    // -----------------------------------------------------------------------------------
    // Openings
    // -----------------------------------------------------------------------------------

    pub(super) fn ornament(&mut self, key: &str, height: f32) {
        if key == "none" || key.is_empty() {
            return;
        }
        let tw = self.text_width();
        let (bw, bh, _) = crate::ornaments::shapes(key);
        let mut h = height;
        let mut w = bw / bh * h;
        if w > tw * 0.55 {
            w = tw * 0.55;
            h = bh / bw * w;
        }
        let left = self.left();
        let x = match self.st.heading_align {
            HAlign::Left => left,
            HAlign::Center => left + (tw - w) / 2.0,
            HAlign::Right => left + tw - w,
        };
        let color = hex_rgb(&self.st.ornament_color);
        let y = self.y;
        self.page().items.push(Item::Ornament { key: key.to_string(), x, y, w, h, color });
        self.y += h + self.base * 0.9;
    }

    /// Chapter-style heading: optional ornament, number label, title, subtitle, POV.
    /// A heading that would run off the page first loses its sink, then is set smaller.
    pub(super) fn opener(&mut self, label: Option<String>, title: Option<String>, subtitle: &str, pov: &str, sink: bool) {
        let (y0, n0) = (self.y, self.page().items.len());
        for (k, scale) in [1.0, 1.0, 0.8, 0.65, 0.5, 0.4].into_iter().enumerate() {
            self.page().items.truncate(n0);
            self.y = if k == 0 { y0 } else { self.top };
            self.opener_at(&label, &title, subtitle, pov, sink && k == 0, scale);
            if self.y <= self.text_bottom() + 0.5 {
                break;
            }
        }
    }

    pub(super) fn opener_at(&mut self, label: &Option<String>, title: &Option<String>, subtitle: &str, pov: &str, sink: bool, scale: f32) {
        let st = self.st.clone();
        if sink {
            self.y = self.top + st.sink_lines.clamp(0.0, 20.0) * self.leading;
        }
        let orn_h = self.base * 2.0 * st.ornament_scale.clamp(0.4, 3.0) * scale;
        self.ornament(&st.chapter_ornament, orn_h);
        let tw = self.text_width();
        let num_size = self.base * st.number_scale.clamp(0.6, 6.0) * scale;
        let title_size = self.base * st.title_scale.clamp(0.8, 6.0) * scale;
        let (title_face, title_slant) = self.heading.pick(false, st.title_italic);
        let num_face = self.number.regular;
        let ncol = hex_rgb(&st.number_color);
        let tcol = hex_rgb(&st.title_color);
        let inline = st.heading_layout == HeadingLayout::Inline;
        if let Some(l) = label {
            if !inline && st.heading_layout != HeadingLayout::TitleOnly {
                let text = if st.number_uppercase { l.to_uppercase() } else { l.clone() };
                let spacing = if st.number_uppercase { num_size * 0.12 } else { 0.0 };
                for (j, l) in self.wrap_plain(&text, num_face, num_size, tw, spacing).into_iter().enumerate() {
                    self.y += num_size * if j == 0 { 0.95 } else { 1.25 };
                    let by = self.y;
                    self.aligned(&l, num_face, num_size, by, st.heading_align, ncol, spacing, false);
                }
                self.y += num_size * 0.55;
            }
        }
        let mut title_text = match (title, label) {
            (Some(t), Some(l)) if inline => format!("{l}: {t}"),
            (Some(t), _) => t.clone(),
            (None, Some(l)) if inline || st.heading_layout == HeadingLayout::TitleOnly => l.clone(),
            _ => String::new(),
        };
        if st.heading_layout == HeadingLayout::NumberOnly && label.is_some() {
            title_text.clear();
        }
        if !title_text.is_empty() {
            let text = if st.title_uppercase { title_text.to_uppercase() } else { title_text };
            let spacing = if st.title_uppercase { title_size * 0.06 } else { 0.0 };
            let max_w = if st.heading_align == HAlign::Center { tw * 0.86 } else { tw };
            for l in self.wrap_plain(&text, title_face, title_size, max_w, spacing) {
                self.y += title_size * 0.95;
                let by = self.y;
                self.aligned(&l, title_face, title_size, by, st.heading_align, tcol, spacing, title_slant);
                self.y += title_size * 0.3;
            }
        }
        if !subtitle.trim().is_empty() {
            let size = self.base * 1.15 * scale;
            let (f, s) = self.body.pick(false, true);
            for l in self.wrap_plain(subtitle.trim(), f, size, tw * 0.9, 0.0) {
                self.y += size * 1.2;
                let by = self.y;
                self.aligned(&l, f, size, by, st.heading_align, INK, 0.0, s);
            }
            self.y += size * 0.3;
        }
        if st.show_pov && !pov.trim().is_empty() {
            // Running heads and folios are 0.8x the body size.
            let size = self.base * FURNITURE_SCALE;
            let text = pov.trim().to_uppercase();
            for l in self.wrap_plain(&text, self.body.regular, size, tw, size * 0.12) {
                self.y += size * 1.6;
                let by = self.y;
                self.aligned(&l, self.body.regular, size, by, st.heading_align, ncol, size * 0.12, false);
            }
        }
        self.y += st.opener_gap_em.clamp(0.0, 12.0) * self.base * scale;
        self.snap_to_grid();
    }

}
