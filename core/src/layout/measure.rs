//! Measuring text, breaking paragraphs into lines and placing them.

use super::*;

impl<'a> Typesetter<'a> {
    pub(super) fn measure(&self, face: usize, s: &str, size: f32) -> f32 {
        metrics()[face].width(s, size)
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn text_item(&mut self, x: f32, y: f32, size: f32, face: usize, text: &str, color: [u8; 3], spacing: f32, slant: bool) {
        push_text(&mut self.page().items, x, y, size, face, text, color, spacing, slant);
    }

    /// Width of a string drawn with letter spacing.
    pub(super) fn spaced_width(&self, face: usize, s: &str, size: f32, spacing: f32) -> f32 {
        let n = s.chars().count();
        self.measure(face, s, size) + spacing * n.saturating_sub(1) as f32
    }

    /// Draw one line of a single style, aligned inside the text block. Returns its width.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn aligned(&mut self, text: &str, face: usize, size: f32, y: f32, align: HAlign, color: [u8; 3], spacing: f32, slant: bool) -> f32 {
        let wdt = self.spaced_width(face, text, size, spacing);
        let left = self.left();
        let tw = self.text_width();
        let x = match align {
            HAlign::Left => left,
            HAlign::Center => left + (tw - wdt) / 2.0,
            HAlign::Right => left + tw - wdt,
        };
        self.text_item(x, y, size, face, text, color, spacing, slant);
        wdt
    }

    /// Wrap single-style text into lines no wider than `max_w`.
    pub(super) fn wrap_plain(&self, text: &str, face: usize, size: f32, max_w: f32, spacing: f32) -> Vec<String> {
        let mut lines = Vec::new();
        let mut cur = String::new();
        for word in text.split_whitespace() {
            let cand = if cur.is_empty() { word.to_string() } else { format!("{cur} {word}") };
            if self.spaced_width(face, &cand, size, spacing) <= max_w {
                cur = cand;
                continue;
            }
            if !cur.is_empty() {
                lines.push(std::mem::take(&mut cur));
            }
            if self.spaced_width(face, word, size, spacing) <= max_w {
                cur = word.to_string();
                continue;
            }
            // a word wider than the line is cut at character boundaries
            for c in word.chars() {
                cur.push(c);
                if cur.chars().count() > 1 && self.spaced_width(face, &cur, size, spacing) > max_w {
                    cur.pop();
                    lines.push(std::mem::replace(&mut cur, c.to_string()));
                }
            }
        }
        if !cur.is_empty() {
            lines.push(cur);
        }
        lines
    }

    pub(super) fn snap_to_grid(&mut self) {
        let rel = ((self.y - self.top) / self.leading).ceil();
        self.y = self.top + rel.max(0.0) * self.leading;
    }

    pub(super) fn baseline(&self, line_top: f32) -> f32 {
        line_top + (self.leading - self.base) / 2.0 + self.base * 0.8
    }

    // -----------------------------------------------------------------------------------
    // Paragraph text
    // -----------------------------------------------------------------------------------

    pub(super) fn words_from_spans(&self, spans: &[Span], size: f32, faces: Faces, color: [u8; 3], force_italic: bool) -> Vec<Word> {
        let mut words = Vec::new();
        let mut cur = Word { runs: Vec::new(), width: 0.0 };
        for sp in spans {
            let (face, slant) = faces.pick(sp.bold, sp.italic ^ force_italic);
            let mut piece = String::new();
            for c in sp.text.chars() {
                if c.is_whitespace() && c != '\u{a0}' {
                    if !piece.is_empty() {
                        cur.push(&piece, face, size, color, slant);
                        piece.clear();
                    }
                    if !cur.runs.is_empty() {
                        words.push(std::mem::replace(&mut cur, Word { runs: Vec::new(), width: 0.0 }));
                    }
                } else {
                    piece.push(c);
                }
            }
            if !piece.is_empty() {
                cur.push(&piece, face, size, color, slant);
            }
        }
        if !cur.runs.is_empty() {
            words.push(cur);
        }
        words
    }

    /// Re-set a word in small capitals (capitals stay full size, lower case becomes smaller capitals).
    pub(super) fn small_caps(word: &Word) -> Word {
        let mut out = Word { runs: Vec::new(), width: 0.0 };
        for r in &word.runs {
            let mut seg = String::new();
            let mut seg_small = false;
            let flush = |out: &mut Word, seg: &mut String, small: bool| {
                if !seg.is_empty() {
                    let size = if small { r.size * 0.78 } else { r.size };
                    let t = if small { seg.to_uppercase() } else { seg.clone() };
                    out.push(&t, r.face, size, r.color, r.slant);
                    seg.clear();
                }
            };
            for c in r.text.chars() {
                let small = c.is_lowercase();
                if small != seg_small && !seg.is_empty() {
                    flush(&mut out, &mut seg, seg_small);
                }
                seg_small = small;
                seg.push(c);
            }
            flush(&mut out, &mut seg, seg_small);
        }
        out
    }

    pub(super) fn break_lines(&self, words: Vec<Word>, widths: &dyn Fn(usize) -> f32, first_indent: f32, space: f32, hyphen: bool) -> Vec<Line> {
        use crate::linebreak::FIT_SLACK;
        let mut lines = Vec::new();
        let mut cur: Vec<Word> = Vec::new();
        let mut cur_w = 0.0;
        for mut word in words {
            loop {
                let idx = lines.len();
                let indent = if idx == 0 { first_indent } else { 0.0 };
                let avail = widths(idx) - indent;
                if cur.is_empty() && word.width > avail + FIT_SLACK {
                    // a word wider than the line is cut at character boundaries
                    if let Some((head, tail)) = Self::cut_word(&word, avail, hyphen) {
                        lines.push(Line { width: head.width, words: vec![head], indent, last: false });
                        word = tail;
                        continue;
                    }
                }
                let add = if cur.is_empty() { word.width } else { space + word.width };
                if !cur.is_empty() && cur_w + add > avail + FIT_SLACK {
                    lines.push(Line { words: std::mem::take(&mut cur), width: cur_w, indent, last: false });
                    cur_w = 0.0;
                    continue;
                }
                cur_w += add;
                cur.push(word);
                break;
            }
        }
        if !cur.is_empty() {
            let indent = if lines.is_empty() { first_indent } else { 0.0 };
            lines.push(Line { words: cur, width: cur_w, indent, last: true });
        }
        lines
    }

    /// The longest start of a word that fits `avail` (with a hyphen when `hyphen`), at
    /// least one character, and the rest; None for a single character.
    pub(super) fn cut_word(word: &Word, avail: f32, hyphen: bool) -> Option<(Word, Word)> {
        let hw = if hyphen { word.runs.iter().map(|r| metrics()[r.face].width("-", r.size)).fold(0.0, f32::max) } else { 0.0 };
        let (mut w, mut k) = (0.0, 0usize);
        'fill: for r in &word.runs {
            for c in r.text.chars() {
                let cw = metrics()[r.face].char_width(c, r.size);
                if k > 0 && w + cw + hw > avail {
                    break 'fill;
                }
                w += cw;
                k += 1;
            }
        }
        let mut parts = Self::split_word(word, &[k]);
        if parts.len() != 2 {
            return None;
        }
        let tail = parts.pop()?;
        let mut head = parts.pop()?;
        if hyphen {
            if let Some(r) = head.runs.last().cloned() {
                head.push("-", r.face, r.size, r.color, r.slant);
            }
        }
        Some((head, tail))
    }

    /// Split a word into pieces at character offsets (keeping each run's style).
    pub(super) fn split_word(word: &Word, cuts: &[usize]) -> Vec<Word> {
        let mut out = vec![Word { runs: Vec::new(), width: 0.0 }];
        let mut pos = 0usize;
        let mut ci = 0usize;
        for r in &word.runs {
            let mut seg = String::new();
            for c in r.text.chars() {
                if ci < cuts.len() && pos == cuts[ci] {
                    let last = out.last_mut().unwrap();
                    last.push(&seg, r.face, r.size, r.color, r.slant);
                    seg.clear();
                    out.push(Word { runs: Vec::new(), width: 0.0 });
                    ci += 1;
                }
                seg.push(c);
                pos += 1;
            }
            out.last_mut().unwrap().push(&seg, r.face, r.size, r.color, r.slant);
        }
        out.retain(|w| !w.runs.is_empty());
        out
    }

    /// Join the pieces of a line back into words, adding a hyphen at a hyphenated end.
    pub(super) fn assemble(pieces: &[(Word, bool)], hyphen: bool, space: f32, indent: f32, last: bool) -> Line {
        let mut words: Vec<Word> = Vec::new();
        let mut joining = false;
        for (w, join_next) in pieces {
            if joining {
                let cur = words.last_mut().unwrap();
                for r in &w.runs {
                    let dx = cur.width;
                    cur.runs.push(Run { dx: dx + r.dx, ..r.clone() });
                }
                cur.width += w.width;
            } else {
                words.push(w.clone());
            }
            joining = *join_next;
        }
        if hyphen {
            if let Some(cur) = words.last_mut() {
                if let Some(r) = cur.runs.last().cloned() {
                    cur.push("-", r.face, r.size, r.color, r.slant);
                }
            }
        }
        let width = words.iter().map(|w| w.width).sum::<f32>() + space * words.len().saturating_sub(1) as f32;
        Line { words, width, indent, last }
    }

    /// Optimal-fit lines with hyphenation (None when nothing fits the gap limits).
    pub(super) fn break_optimal(&self, words: &[Word], widths: &dyn Fn(usize) -> f32, first_indent: f32, space: f32, hyphenate: bool) -> Option<Vec<Line>> {
        use crate::linebreak::{optimal_breaks, split_points, Piece};
        let w = |i: usize| widths(i) - if i == 0 { first_indent } else { 0.0 };
        // a hyphen is drawn in the face and size of the run it ends
        let hyphen_w = |w: &Word| w.runs.last().map(|r| metrics()[r.face].width("-", r.size)).unwrap_or(0.0);
        let build = |pieces: &[(Word, bool)], breaks: &[crate::linebreak::Break]| -> Vec<Line> {
            let mut lines = Vec::new();
            let mut start = 0;
            for (k, b) in breaks.iter().enumerate() {
                let last = k + 1 == breaks.len();
                let indent = if k == 0 { first_indent } else { 0.0 };
                lines.push(Self::assemble(&pieces[start..=b.end], b.hyphen, space, indent, last));
                start = b.end + 1;
            }
            lines
        };
        // first try whole words only, accepting only good lines (TeX's pretolerance)
        let whole: Vec<(Word, bool)> = words.iter().map(|w| (w.clone(), false)).collect();
        let p1: Vec<Piece> = words.iter().map(|w| Piece { width: w.width, join_next: false, needs_hyphen: false, hyphen_w: 0.0 }).collect();
        if let Some(b) = optimal_breaks(&p1, space, &w, Some(100.0)) {
            return Some(build(&whole, &b));
        }
        // then allow hyphenation (or just looser lines when hyphenation is off)
        let mut pieces: Vec<(Word, bool)> = Vec::new();
        let mut meta: Vec<Piece> = Vec::new();
        for word in words {
            let text: String = word.runs.iter().map(|r| r.text.as_str()).collect();
            // soft hyphens the author typed count even when hyphenation is off
            let points = if hyphenate || text.contains('\u{ad}') { split_points(&text) } else { Vec::new() };
            if points.is_empty() {
                pieces.push((word.clone(), false));
                meta.push(Piece { width: word.width, join_next: false, needs_hyphen: false, hyphen_w: 0.0 });
                continue;
            }
            let cuts: Vec<usize> = points.iter().map(|p| p.0).collect();
            let parts = Self::split_word(word, &cuts);
            let n = parts.len();
            for (k, part) in parts.into_iter().enumerate() {
                let join = k + 1 < n;
                let needs = join && points.get(k).map(|p| p.1).unwrap_or(false);
                meta.push(Piece { width: part.width, join_next: join, needs_hyphen: needs, hyphen_w: hyphen_w(&part) });
                pieces.push((part, join));
            }
        }
        for limit in [Some(200.0), None] {
            if let Some(b) = optimal_breaks(&meta, space, &w, limit) {
                return Some(build(&pieces, &b));
            }
        }
        None
    }

    /// Place one line of words at a baseline.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn place_line(&mut self, line: &Line, x0: f32, avail: f32, baseline: f32, justify: bool, align: HAlign, space: f32) {
        let n = line.words.len();
        let room = avail - line.indent;
        let mut width = line.width;
        let mut gap = space;
        let mut x = x0 + line.indent;
        let justified = justify && !line.last && n > 1;
        if n > 1 && (justified || width > room) {
            let g = space + (room - width) / (n - 1) as f32;
            // a line too long always tightens to fit (the breaker allows that); justified
            // lines outside the gap limits stay ragged rather than distorted
            if width > room || crate::linebreak::gap_ok(g, space) {
                gap = g;
                width = room;
            }
        }
        if !justified {
            match align {
                HAlign::Center => x = x0 + (avail - width) / 2.0,
                HAlign::Right => x = x0 + avail - width,
                HAlign::Left => {}
            }
        }
        for wd in &line.words {
            for r in &wd.runs {
                self.text_item(x + r.dx, baseline, r.size, r.face, &r.text, r.color, 0.0, r.slant);
            }
            x += wd.width + gap;
        }
    }
}
