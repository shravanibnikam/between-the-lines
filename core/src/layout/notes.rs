//! Footnotes at the foot of the page where they are referenced.

use super::*;

impl<'a> Typesetter<'a> {
    /// Set a section's footnotes into lines, ready for their references (and note its warnings).
    pub(super) fn start_notes(&mut self, notes: &[Vec<Span>], warnings: Vec<String>) {
        let title = self.running_title.last().cloned().unwrap_or_default();
        self.warnings.extend(warnings.into_iter().map(|w| if title.is_empty() { w } else { format!("{title}: {w}") }));
        self.notes = notes.iter().enumerate().map(|(i, spans)| Some(self.note_lines(i as u32 + 1, spans))).collect();
    }

    /// A note's lines: its raised number, then its text, across the full text width.
    fn note_lines(&self, n: u32, spans: &[Span]) -> Vec<Line> {
        let size = self.base * NOTE_SCALE;
        let mut all = vec![Span { text: n.to_string(), note: Some(n), ..Default::default() }, Span { text: " ".into(), ..Default::default() }];
        all.extend_from_slice(spans);
        let words = self.words_from_spans(&all, size, self.body, INK, false);
        let tw = self.text_width();
        let space = self.space_w * NOTE_SCALE;
        let hyphenate = self.st.hyphenate && self.book.meta.language.trim().to_lowercase().starts_with("en");
        let lines = if self.st.align == BodyAlign::Justify { self.break_optimal(&words, &|_| tw, 0.0, space, hyphenate) } else { None };
        lines.unwrap_or_else(|| self.break_lines(words, &|_| tw, 0.0, space, hyphenate))
    }

    /// The footnotes a line refers to.
    pub(super) fn line_refs(line: &Line) -> Vec<u32> {
        let mut v: Vec<u32> = line.words.iter().flat_map(|w| &w.runs).filter_map(|r| r.note).collect();
        v.sort_unstable();
        v.dedup();
        v
    }

    /// Height of the foot holding `lines` note lines: a body line for the rule, then the notes.
    pub(super) fn foot_height(&self, lines: usize) -> f32 {
        if lines == 0 {
            0.0
        } else {
            self.leading + lines as f32 * self.leading * NOTE_SCALE
        }
    }

    /// Whether `h` more points of text fit on this page along with the notes `refs` would add.
    pub(super) fn room_for(&self, h: f32, refs: &[u32]) -> bool {
        let new: usize = refs.iter().filter_map(|&n| self.notes.get(n as usize - 1)?.as_ref()).map(Vec::len).sum();
        self.y + h <= self.h - self.bottom - self.foot_height(self.foot.len() + new) + 0.5
    }

    /// Owe this page the notes of references it has just set (each note once, at its first).
    pub(super) fn queue_notes(&mut self, refs: &[u32]) {
        for &n in refs {
            if let Some(lines) = self.notes.get_mut(n as usize - 1).and_then(Option::take) {
                self.foot.extend(lines);
            }
        }
    }

    /// Set the notes owed to this page at its foot, under a short rule. Lines that don't fit
    /// below the text carry on at the foot of the next page; the page then takes no more text.
    pub(super) fn flush_notes(&mut self) {
        if self.foot.is_empty() || self.pages.is_empty() {
            return;
        }
        let size = self.base * NOTE_SCALE;
        let lead = self.leading * NOTE_SCALE;
        let bottom = self.h - self.bottom;
        // never above the text already set (a drop cap can hang below the last line)
        let text_end = self.y + self.leading * self.wrap_left as f32;
        let top = (bottom - self.foot_height(self.foot.len())).max(text_end - 0.5);
        let fit = ((bottom - top - self.leading) / lead + 0.01).floor().max(0.0) as usize;
        // ponytail: a fresh page always takes one note line, so a text block shorter than a
        // body line plus a note line can overflow; such pages can't hold notes anyway
        let fit = fit.max(usize::from(self.y <= self.top + 0.5)).min(self.foot.len());
        if fit == 0 {
            return;
        }
        let (left, tw) = (self.left(), self.text_width());
        let ry = top + self.leading * 0.5;
        self.page().items.push(Item::Line { x1: left, y1: ry, x2: left + tw * 0.3, y2: ry, width: 0.4, color: INK });
        let justify = self.st.align == BodyAlign::Justify;
        let lines: Vec<Line> = self.foot.drain(..fit).collect();
        for (j, line) in lines.iter().enumerate() {
            let bl = top + self.leading + j as f32 * lead + (lead - size) / 2.0 + size * 0.8;
            self.place_line(line, left, tw, bl, justify, HAlign::Left, self.space_w * NOTE_SCALE);
        }
        self.y = self.h;
    }

    /// At the end of a section: set its last notes, giving any overflow pages of its own.
    pub(super) fn drain_notes(&mut self) {
        self.flush_notes();
        while !self.foot.is_empty() {
            self.continue_page();
            self.flush_notes();
        }
    }
}
