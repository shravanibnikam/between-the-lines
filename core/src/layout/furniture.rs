//! The whole-book pass, plus running heads and page numbers.

use super::*;

impl<'a> Typesetter<'a> {
    // -----------------------------------------------------------------------------------
    // The whole book
    // -----------------------------------------------------------------------------------

    pub(super) fn run(&mut self) {
        let book = self.book;
        for (i, s) in book.front.iter().enumerate() {
            let key = (Area::Front, i);
            match s.kind {
                SectionKind::TitlePage => self.title_page(key),
                SectionKind::Copyright => self.copyright_page(key, &s.text),
                SectionKind::Dedication => self.centered_page(key, &s.text, true),
                SectionKind::Epigraph => self.centered_page(key, &s.text, true),
                SectionKind::Contents => self.contents_page(key),
                _ => {
                    self.start_section(key, true, true);
                    let t = book.display_title(s, None);
                    self.opener(None, Some(t), &s.subtitle, "", true);
                    self.flow(&s.text, false, FirstParagraph::Plain, false, false);
                }
            }
        }
        // The story starts on a right-hand page numbered 1.
        let numbers = book.numbers();
        for (i, s) in book.body.iter().enumerate() {
            let key = (Area::Body, i);
            let n = numbers[i];
            let recto = i == 0 || book.print.recto_chapter_start || s.kind == SectionKind::Part;
            self.start_section(key, recto, false);
            if self.body_started_at.is_none() {
                self.body_started_at = Some(self.pages.len() - 1);
            }
            let disp = book.display_title(s, n);
            if let Some(t) = self.running_title.last_mut() {
                *t = disp.clone();
            }
            match s.kind {
                SectionKind::Part => {
                    self.y = self.top + (self.text_bottom() - self.top) * 0.25;
                    let label = book.number_label(s, n);
                    let title = if s.title.trim().is_empty() { None } else { Some(s.title.trim().to_string()) };
                    self.opener(Some(label), title, &s.subtitle, "", false);
                    self.flow(&s.text, false, FirstParagraph::Plain, true, true);
                }
                _ => {
                    let label = book.number_label(s, n);
                    let title = if s.title.trim().is_empty() { None } else { Some(s.title.trim().to_string()) };
                    self.opener(Some(label), title, &s.subtitle, &s.pov, true);
                    let dc = self.st.drop_cap && s.drop_cap;
                    self.flow(&s.text, dc, self.st.first_paragraph, false, false);
                }
            }
            if s.in_contents {
                self.toc.push(TocEntry { title: disp, folio: String::new(), level: if s.kind == SectionKind::Part { 0 } else { 1 } });
            }
        }
        for (i, s) in book.back.iter().enumerate() {
            let key = (Area::Back, i);
            self.start_section(key, book.print.recto_chapter_start, false);
            let t = book.display_title(s, None);
            if let Some(r) = self.running_title.last_mut() {
                *r = t.clone();
            }
            self.opener(None, Some(t.clone()), &s.subtitle, "", true);
            let centered = s.kind == SectionKind::AlsoBy;
            self.flow(&s.text, false, FirstParagraph::Plain, centered, false);
            if s.in_contents {
                self.toc.push(TocEntry { title: t, folio: String::new(), level: 1 });
            }
        }
        if self.pages.is_empty() {
            self.new_page(None, false, false);
        }
        // An even number of pages.
        if self.pages.len() % 2 == 1 {
            self.new_page(None, false, false);
            self.page().blank = true;
        }
    }

    /// A running head's words (italic or small capitals) and its width.
    pub(super) fn running_head(&self, text: &str, size: f32, track: f32) -> (Vec<Word>, f32) {
        let spans = [Span { text: text.to_string(), bold: false, italic: !self.st.header_small_caps }];
        let mut words = self.words_from_spans(&spans, size, self.body, INK, false);
        if self.st.header_small_caps {
            words = words.iter().map(Self::small_caps).collect();
        }
        let wdt: f32 = words.iter().map(|w| w.width + track * w.runs.iter().map(|r| r.text.chars().count()).sum::<usize>() as f32).sum::<f32>()
            + self.space_w * FURNITURE_SCALE * 1.4 * words.len().saturating_sub(1) as f32;
        (words, wdt)
    }

    /// Page numbers and running heads.
    pub(super) fn furniture(&mut self) {
        let book = self.book;
        let pr = &book.print;
        let start = self.body_started_at.unwrap_or(self.pages.len());
        let size = self.base * FURNITURE_SCALE;
        let face = self.body.regular;
        let (_hface, hslant) = if self.st.header_small_caps { (self.body.regular, false) } else { self.body.pick(false, true) };
        let tw = self.text_width();
        // page index -> section start index for the contents
        for idx in 0..self.pages.len() {
            let recto = self.pages[idx].recto;
            let left = if recto { self.inside } else { self.outside };
            let folio = if idx >= start { Some((idx - start + 1).to_string()) } else { None };
            self.pages[idx].folio = folio.clone();
            let p = &self.pages[idx];
            if p.blank || p.front || idx < start {
                continue;
            }
            let mut items = Vec::new();
            let show_number = pr.page_numbers && folio.is_some();
            // Running-head baseline 0.55 of the top margin down from the trim edge.
            let header_y = self.top * HEADER_DROP;
            if pr.running_headers && !p.opener {
                let what = if recto { pr.header_right } else { pr.header_left };
                let text = match what {
                    HeaderContent::Nothing => String::new(),
                    HeaderContent::Author => book.meta.author.clone(),
                    HeaderContent::BookTitle => book.meta.title.clone(),
                    HeaderContent::ChapterTitle => self.running_title.get(idx).cloned().unwrap_or_default(),
                };
                if !text.trim().is_empty() {
                    let track = if self.st.header_small_caps { size * 0.08 } else { 0.0 };
                    let (mut words, mut wdt) = self.running_head(&text, size, track);
                    // too long for the line: shorten it with an ellipsis
                    let mut chars: Vec<char> = text.chars().collect();
                    while wdt > tw && chars.len() > 1 {
                        chars.pop();
                        let t: String = chars.iter().collect();
                        (words, wdt) = self.running_head(&format!("{}…", t.trim_end()), size, track);
                    }
                    let mut x = left + (tw - wdt) / 2.0;
                    for w in &words {
                        for r in &w.runs {
                            let n = r.text.chars().count() as f32;
                            push_text(&mut items, x, header_y, r.size, r.face, &r.text, INK, track, r.slant && hslant);
                            x += metrics()[r.face].width(&r.text, r.size) + track * n;
                        }
                        x += self.space_w * FURNITURE_SCALE * 1.4;
                    }
                    if self.st.header_rule {
                        // the rule sits 2 mm under the running head
                        let ry = header_y + HEADER_RULE_GAP_PT;
                        items.push(Item::Line { x1: left, y1: ry, x2: left + tw, y2: ry, width: 0.4, color: INK });
                    }
                }
            }
            if show_number {
                let f = folio.unwrap();
                let wdt = self.measure(face, &f, size);
                let foot = self.h - self.bottom * FOLIO_RISE;
                let (x, y) = match pr.page_number_pos {
                    PageNumberPos::BottomCenter => (left + (tw - wdt) / 2.0, foot),
                    PageNumberPos::BottomOutside => (if recto { left + tw - wdt } else { left }, foot),
                    // chapter openings have no running head: their number goes to the foot
                    PageNumberPos::TopOutside if p.opener => (left + (tw - wdt) / 2.0, foot),
                    PageNumberPos::TopOutside => (if recto { left + tw - wdt } else { left }, header_y),
                };
                push_text(&mut items, x, y, size, face, &f, INK, 0.0, false);
            }
            self.pages[idx].items.extend(items);
        }
        // contents folios
        let mut k = 0;
        let starts = self.starts.clone();
        for (key, page) in starts {
            let s = match key.0 {
                Area::Body => &book.body[key.1],
                Area::Back => &book.back[key.1],
                Area::Front => continue,
            };
            if !s.in_contents {
                continue;
            }
            if let Some(e) = self.toc.get_mut(k) {
                e.folio = self.pages[page].folio.clone().unwrap_or_default();
                if s.kind == SectionKind::Part {
                    e.folio.clear();
                }
            }
            k += 1;
        }
    }
}
