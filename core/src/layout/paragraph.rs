//! Paragraphs, scene breaks, subheadings and the flow of a section body.

use super::*;

impl<'a> Typesetter<'a> {
    /// Set a paragraph, breaking pages as needed (keeps at least two lines together at
    /// the bottom and top of a page).
    #[allow(clippy::too_many_arguments)]
    pub(super) fn paragraph(
        &mut self,
        spans: &[Span],
        indent_em: f32,
        first: bool,
        drop_cap: bool,
        lead_in: FirstParagraph,
        margin_l: f32,
        margin_r: f32,
        align_override: Option<HAlign>,
        force_italic: bool,
    ) {
        let size = self.base;
        let mut words = self.words_from_spans(spans, size, self.body, INK, force_italic);
        if words.is_empty() {
            return;
        }
        let tw = self.text_width() - margin_l - margin_r;
        // Drop cap: the first letter, `lines` lines tall.
        let mut dc: Option<(String, usize, f32, f32)> = None;
        let dc_lines = self.st.drop_cap_lines.clamp(2, 5) as usize;
        // the cap's whole zone (and two lines at least) must fit on one page
        let dc_room = dc_lines.max(2);
        if drop_cap && self.text_bottom() - self.top >= dc_room as f32 * self.leading {
            let first_run = words[0].runs[0].clone();
            let mut chars = first_run.text.chars();
            let mut cap = String::new();
            for c in chars.by_ref() {
                cap.push(c);
                if c.is_alphanumeric() {
                    break;
                }
            }
            let rest: String = chars.collect();
            if cap.chars().any(|c| c.is_alphanumeric()) {
                let face = self.heading.regular;
                let m = &metrics()[face];
                let body_cap = metrics()[self.body.regular].cap_height / metrics()[self.body.regular].units_per_em * size;
                let target = (dc_lines as f32 - 1.0) * self.leading + body_cap;
                let dc_size = target / (m.cap_height / m.units_per_em);
                let dc_w = m.width(&cap, dc_size) + size * 0.25;
                // re-make the first word without the dropped letter
                let mut nw = Word { runs: Vec::new(), width: 0.0 };
                nw.push(&rest, first_run.face, first_run.size, first_run.color, first_run.slant);
                for r in words[0].runs.iter().skip(1) {
                    nw.push(&r.text, r.face, r.size, r.color, r.slant);
                }
                // no cap when it is the paragraph's only word, or wider than half the column
                let only_word = nw.runs.is_empty() && words.len() == 1;
                if !only_word && dc_w <= tw * 0.5 {
                    if nw.runs.is_empty() {
                        words.remove(0);
                    } else {
                        words[0] = nw;
                    }
                    dc = Some((cap, face, dc_size, dc_w));
                }
            }
        }
        let fits = |s: &Self, k: usize| s.y + s.leading * k as f32 <= s.text_bottom() + 0.5;
        if dc.is_some() && !fits(self, dc_room) {
            self.continue_page();
        }
        // Small-caps lead-in.
        match lead_in {
            FirstParagraph::SmallCapsWords => {
                let n = self.st.small_caps_words.clamp(1, 12) as usize;
                for w in words.iter_mut().take(n) {
                    *w = Self::small_caps(w);
                }
            }
            FirstParagraph::SmallCapsLine => {
                // estimate the first line, then set those words in small caps
                let avail = tw - dc.as_ref().map(|d| d.3).unwrap_or(0.0);
                let mut acc = 0.0;
                for w in words.iter_mut() {
                    let sc = Self::small_caps(w);
                    acc += sc.width + self.space_w;
                    if acc > avail && acc - sc.width - self.space_w > 0.0 {
                        break;
                    }
                    *w = sc;
                }
            }
            FirstParagraph::Plain => {}
        }
        let dc_w = dc.as_ref().map(|d| d.3).unwrap_or(0.0);
        let first_indent = if first { 0.0 } else { indent_em * size };
        // lines beside a drop cap: this paragraph's own, or the rest of an earlier one's
        let (zone_lines, zone_w) = if dc_w > 0.0 {
            (dc_lines, dc_w)
        } else if self.wrap_left > 0 && fits(self, self.wrap_left) {
            (self.wrap_left, self.wrap_w)
        } else {
            (0, 0.0)
        };
        let widths = move |i: usize| if i < zone_lines { tw - zone_w } else { tw };
        let space = self.space_w;
        let lead_indent = if dc_w > 0.0 || zone_lines > 0 { 0.0 } else { first_indent };
        let justify = self.st.align == BodyAlign::Justify && align_override.is_none();
        let hyphenate = self.st.hyphenate && self.book.meta.language.trim().to_lowercase().starts_with("en");
        let lines = if justify {
            match self.break_optimal(&words, &widths, lead_indent, space, hyphenate) {
                Some(l) => l,
                None => self.break_lines(words, &widths, lead_indent, space, hyphenate),
            }
        } else {
            self.break_lines(words, &widths, lead_indent, space, hyphenate)
        };
        let align = align_override.unwrap_or(HAlign::Left);
        let n = lines.len();
        let mut dc_pending = dc;
        // set once a page break leaves the drop cap behind: no more narrowed lines
        let mut zone_dead = false;
        for (i, line) in lines.iter().enumerate() {
            let remaining_after = n - i - 1;
            let in_zone = i < zone_lines;
            let need_new = !fits(self, 1)
                // orphan: don't leave a single first line at the bottom
                || (i == 0 && n >= 2 && !fits(self, 2))
                // widow: carry two lines over instead of one (not from beside a cap)
                || (remaining_after == 1 && i >= 1 && !fits(self, 2) && n >= 4 && !in_zone);
            if need_new {
                self.continue_page();
                zone_dead |= dc_pending.is_none();
            }
            let bl = self.baseline(self.y);
            let x0 = self.left() + margin_l;
            if let Some((cap, face, dsize, _)) = dc_pending.take() {
                let cap_bl = bl + (dc_lines as f32 - 1.0) * self.leading;
                let color = hex_rgb(&self.st.drop_cap_color);
                self.text_item(x0, cap_bl, dsize, face, &cap, color, 0.0, false);
            }
            if in_zone && !zone_dead {
                self.place_line(line, x0 + zone_w, tw - zone_w, bl, justify, align, space);
            } else {
                self.place_line(line, x0, tw, bl, justify, align, space);
            }
            self.y += self.leading;
        }
        self.wrap_left = if zone_dead { 0 } else { zone_lines.saturating_sub(n) };
        self.wrap_w = zone_w;
    }

    pub(super) fn scene_break(&mut self) {
        self.y += self.leading * self.wrap_left as f32;
        self.wrap_left = 0;
        let lines = if self.st.scene_break == SceneBreakStyle::Ornament { 2.0 } else { 1.0 };
        // keep the break with two lines of the text after it
        if self.y + self.leading * (lines + 2.0) > self.text_bottom() + 0.5 {
            self.continue_page();
        }
        let tw = self.text_width();
        let left = self.left();
        // a blank-line break at the top of a page would be invisible: show the glyph instead
        let style = match self.st.scene_break {
            SceneBreakStyle::Space if self.y <= self.top + 0.5 => SceneBreakStyle::Glyph,
            s => s,
        };
        match style {
            SceneBreakStyle::Ornament if self.st.scene_ornament != "none" => {
                let hgt = self.base * 1.25 * self.st.ornament_scale.clamp(0.4, 3.0);
                let wid = (crate::ornaments::shapes(&self.st.scene_ornament).0
                    / crate::ornaments::shapes(&self.st.scene_ornament).1
                    * hgt)
                    .min(tw * 0.6);
                let hgt = crate::ornaments::height_for_width(&self.st.scene_ornament, wid).min(hgt);
                let cy = self.y + self.leading * lines / 2.0;
                let color = hex_rgb(&self.st.ornament_color);
                let key = self.st.scene_ornament.clone();
                self.page().items.push(Item::Ornament { key, x: left + (tw - wid) / 2.0, y: cy - hgt / 2.0, w: wid, h: hgt, color });
            }
            SceneBreakStyle::Space => {}
            _ => {
                let glyph = if self.st.scene_glyph.trim().is_empty() { "* * *".to_string() } else { self.st.scene_glyph.clone() };
                let face = if glyph.chars().all(|c| metrics()[self.body.regular].has_char(c)) { self.body.regular } else { self.heading.regular };
                let bl = self.baseline(self.y);
                self.aligned(&glyph, face, self.base, bl, HAlign::Center, INK, 0.0, false);
            }
        }
        self.y += self.leading * lines;
    }

    pub(super) fn subheading(&mut self, level: u8, spans: &[Span]) {
        self.y += self.leading * self.wrap_left as f32;
        self.wrap_left = 0;
        // Level-2 headings are 1.5x and level-3 1.2x the body size.
        let scale = if level <= 2 { 1.5 } else { 1.2 };
        let size = self.base * scale;
        if self.y > self.top + 0.1 {
            self.y += self.leading * 0.5;
        }
        let text = markup::plain(spans);
        let face = self.heading.regular;
        let tw = self.text_width();
        let lines = self.wrap_plain(&text, face, size, tw, 0.0);
        // keep the heading with two lines of text (after it snaps to the grid)
        let end = self.y + lines.len() as f32 * size * 1.25 + self.leading * 0.35;
        let end = self.top + ((end - self.top) / self.leading).ceil().max(0.0) * self.leading;
        if end + self.leading * 2.0 > self.text_bottom() + 0.5 {
            self.continue_page();
        }
        for l in lines {
            let bl = self.y + size;
            self.aligned(&l, face, size, bl, self.st.heading_align, hex_rgb(&self.st.title_color), 0.0, false);
            self.y += size * 1.25;
        }
        self.y += self.leading * 0.35;
        self.snap_to_grid();
    }

    /// Set a section's running text (paragraphs, quotes, breaks, subheadings).
    pub(super) fn flow(&mut self, text: &str, drop_cap: bool, lead_in: FirstParagraph, centered: bool, italic: bool) {
        let blocks = markup::parse_blocks(text, self.book.smart_quotes);
        let mut first = self.st.no_indent_after_heading;
        let mut first_para = true;
        let indent = self.st.first_indent_em;
        let para_gap = self.st.paragraph_spacing_em * self.base;
        let align = if centered { Some(HAlign::Center) } else { None };
        for b in blocks {
            match b {
                Block::Para(spans) => {
                    if !first_para && para_gap > 0.0 {
                        self.y += para_gap;
                    }
                    let dc = drop_cap && first_para;
                    let li = if first_para { lead_in } else { FirstParagraph::Plain };
                    self.paragraph(&spans, if centered { 0.0 } else { indent }, first || centered, dc, li, 0.0, 0.0, align, italic);
                    first = false;
                    first_para = false;
                }
                Block::Quote(spans) => {
                    self.y += self.leading * 0.5;
                    let m = self.base * 2.0;
                    self.paragraph(&spans, 0.0, true, false, FirstParagraph::Plain, m, m, align, italic);
                    self.y += self.leading * 0.5;
                    self.snap_to_grid();
                    first = self.st.no_indent_after_heading;
                    first_para = false;
                }
                Block::Heading(level, spans) => {
                    self.subheading(level, &spans);
                    first = self.st.no_indent_after_heading;
                }
                Block::SceneBreak => {
                    self.scene_break();
                    first = self.st.no_indent_after_heading;
                    first_para = false;
                }
            }
        }
    }

}
