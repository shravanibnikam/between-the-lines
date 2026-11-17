//! Front-matter pages: title, copyright, dedication-style and contents.

use super::*;

impl<'a> Typesetter<'a> {
    // -----------------------------------------------------------------------------------
    // Front matter pages
    // -----------------------------------------------------------------------------------

    pub(super) fn title_page(&mut self, key: (Area, usize)) {
        self.start_section(key, true, true);
        // a title too long for the page is set smaller until everything fits
        for scale in [1.0, 0.8, 0.65, 0.5, 0.4] {
            self.page().items.clear();
            if self.title_page_at(scale) {
                break;
            }
        }
    }

    /// Lay out the title page at a size; false when it runs past the text block.
    pub(super) fn title_page_at(&mut self, scale: f32) -> bool {
        let book = self.book;
        let m = &book.meta;
        let st = self.st.clone();
        let tw = self.text_width();
        let tcol = hex_rgb(&st.title_color);
        let (tface, tslant) = self.heading.pick(false, st.title_italic);
        let size = self.base * 2.6 * scale;
        self.y = self.top + (self.text_bottom() - self.top) * 0.22 * scale;
        let title = if st.title_uppercase { m.title.to_uppercase() } else { m.title.clone() };
        let spacing = if st.title_uppercase { size * 0.06 } else { 0.0 };
        for l in self.wrap_plain(&title, tface, size, tw * 0.92, spacing) {
            self.y += size;
            let by = self.y;
            self.aligned(&l, tface, size, by, HAlign::Center, tcol, spacing, tslant);
            self.y += size * 0.2;
        }
        if !m.subtitle.trim().is_empty() {
            let s = self.base * 1.3 * scale;
            let (f, sl) = self.body.pick(false, true);
            for l in self.wrap_plain(m.subtitle.trim(), f, s, tw * 0.85, 0.0) {
                self.y += s * 1.4;
                let by = self.y;
                self.aligned(&l, f, s, by, HAlign::Center, INK, 0.0, sl);
            }
        }
        self.y += self.base * 1.8 * scale;
        let orn = if st.chapter_ornament != "none" { st.chapter_ornament.clone() } else { st.scene_ornament.clone() };
        if st.scene_break == SceneBreakStyle::Ornament || st.chapter_ornament != "none" {
            let save = self.st.heading_align;
            self.st.heading_align = HAlign::Center;
            self.ornament(&orn, self.base * 1.6 * scale);
            self.st.heading_align = save;
        }
        // the author at two thirds down (or below a long title), the publisher at the foot
        if !m.author.trim().is_empty() {
            let s = self.base * 1.5 * scale;
            self.y = (self.y + s).max(self.top + (self.text_bottom() - self.top) * 0.66) - s * 1.25;
            let text = if st.title_uppercase { m.author.to_uppercase() } else { m.author.clone() };
            let spacing = if st.title_uppercase { s * 0.08 } else { 0.0 };
            for l in self.wrap_plain(&text, self.heading.regular, s, tw, spacing) {
                self.y += s * 1.25;
                let by = self.y;
                self.aligned(&l, self.heading.regular, s, by, HAlign::Center, INK, spacing, false);
            }
        }
        if !m.publisher.trim().is_empty() {
            let s = self.base * 0.85 * scale;
            let text = m.publisher.to_uppercase();
            let lines = self.wrap_plain(&text, self.body.regular, s, tw, s * 0.12);
            let first = (self.text_bottom() - s * (1.0 + 1.3 * (lines.len() as f32 - 1.0))).max(self.y + s * 2.5);
            for (j, l) in lines.iter().enumerate() {
                self.y = first + j as f32 * s * 1.3;
                let by = self.y;
                self.aligned(l, self.body.regular, s, by, HAlign::Center, INK, s * 0.12, false);
            }
        }
        self.y <= self.text_bottom() + 0.5
    }

    pub(super) fn copyright_page(&mut self, key: (Area, usize), extra: &str) {
        self.start_section(key, false, true);
        let m = self.book.meta.clone();
        let size = self.base * 0.8;
        let lead = size * 1.4;
        let tw = self.text_width();
        let mut paras: Vec<String> = Vec::new();
        paras.push(m.title.clone());
        if !m.author.trim().is_empty() {
            paras.push(format!("Copyright © {} {}", m.year.trim(), m.author.trim()));
        }
        for l in extra.lines().map(str::trim).filter(|l| !l.is_empty()) {
            paras.push(markup::strip(&if self.book.smart_quotes { markup::smarten(l) } else { l.to_string() }));
        }
        for (label, v) in [("Paperback ISBN", &m.isbn_paperback), ("Hardcover ISBN", &m.isbn_hardcover), ("Ebook ISBN", &m.isbn_ebook)] {
            if !v.trim().is_empty() {
                paras.push(format!("{label}: {}", v.trim()));
            }
        }
        if !m.edition.trim().is_empty() {
            paras.push(m.edition.trim().to_string());
        }
        if !m.publisher.trim().is_empty() {
            paras.push(format!("Published by {}", m.publisher.trim()));
        }
        let face = self.body.regular;
        let mut lines: Vec<(String, bool)> = Vec::new();
        for p in &paras {
            for l in self.wrap_plain(p, face, size, tw, 0.0) {
                lines.push((l, false));
            }
            lines.push((String::new(), true));
        }
        lines.pop(); // no gap after the last paragraph
        let step = |gap: bool| if gap { lead * 0.5 } else { lead };
        let total: f32 = lines.iter().map(|l| step(l.1)).sum();
        // set at the foot of the page; text taller than the page flows onto more pages
        let mut y = (self.text_bottom() - total).max(self.top);
        for (l, gap) in lines {
            if !gap {
                if y + lead > self.text_bottom() + 0.5 && y > self.top + 0.5 {
                    self.new_page(Some(key), false, true);
                    y = self.top;
                }
                self.aligned(&l, face, size, y + size, HAlign::Left, INK, 0.0, false);
            }
            y += step(gap);
        }
    }

    pub(super) fn centered_page(&mut self, key: (Area, usize), text: &str, italic: bool) {
        self.start_section(key, true, true);
        self.y = self.top + (self.text_bottom() - self.top) * 0.28;
        self.flow(text, false, FirstParagraph::Plain, true, italic);
    }

    pub(super) fn contents_page(&mut self, key: (Area, usize)) {
        self.start_section(key, true, true);
        let label = self.book.terms.contents.clone();
        self.opener(None, Some(label), "", "", true);
        let entries = self.known_toc.clone();
        let has_parts = entries.iter().any(|e| e.level == 0);
        let size = self.base;
        let tw = self.text_width();
        for e in entries {
            if self.y + self.leading > self.text_bottom() {
                self.new_page(Some(key), false, true);
            }
            let bl = self.baseline(self.y);
            let left = self.left();
            let indent = if e.level > 0 && has_parts { size * 1.5 } else { 0.0 };
            let (face, slant) = if e.level == 0 { (self.body.regular, false) } else { self.body.pick(false, false) };
            let title = if e.level == 0 && e.folio.is_empty() { e.title.to_uppercase() } else { e.title.clone() };
            let fw = self.measure(self.body.regular, &e.folio, size);
            let max_title = tw - indent - fw - size * 2.0;
            let mut t = title.clone();
            while self.measure(face, &t, size) > max_title && t.chars().count() > 4 {
                t.pop();
            }
            if t != title {
                t = format!("{}…", t.trim_end());
            }
            self.text_item(left + indent, bl, size, face, &t, INK, 0.0, slant);
            if !e.folio.is_empty() {
                let folio = e.folio.clone();
                self.text_item(left + tw - fw, bl, size, self.body.regular, &folio, INK, 0.0, false);
            }
            self.y += self.leading;
        }
    }

}
