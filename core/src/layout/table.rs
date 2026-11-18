//! Tables: booktabs-style rules, rows kept whole, the header repeated on each new page.

use super::*;

/// Column widths from natural (one-line) and smallest (longest-word) widths, fitted to `room`:
/// natural widths when they fit, otherwise every column gives up the same share of its slack.
fn column_widths(nat: &[f32], min: &[f32], room: f32) -> Vec<f32> {
    let (sn, sm): (f32, f32) = (nat.iter().sum(), min.iter().sum());
    if sn <= room {
        return nat.to_vec();
    }
    if sm >= room {
        // ponytail: columns narrower than their longest word cut it at a letter, and a column
        // narrower than one letter overflows; tables that wide want a landscape page
        return min.iter().map(|m| m * room / sm).collect();
    }
    let k = (room - sm) / (sn - sm);
    nat.iter().zip(min).map(|(n, m)| m + (n - m) * k).collect()
}

impl<'a> Typesetter<'a> {
    /// Set a table centred in the text block, smaller than the text, then return to the grid.
    pub(super) fn table(&mut self, header: &[Vec<Span>], rows: &[Vec<Vec<Span>>], align: &[HAlign]) {
        self.y += self.leading * self.wrap_left as f32;
        self.wrap_left = 0;
        let ncol = align.len();
        if ncol == 0 {
            return;
        }
        let size = self.base * TABLE_SCALE;
        let lead = self.leading * TABLE_SCALE;
        let space = self.space_w * TABLE_SCALE;
        let tw = self.text_width();
        // an em between columns, less when there are many
        let gap = size.min(tw / ncol as f32 / 4.0);
        let words = |s: &Self, row: &[Vec<Span>], bold: bool| -> Vec<Vec<Word>> {
            let cell = |c: &Vec<Span>| c.iter().map(|sp| Span { bold: sp.bold || bold, ..sp.clone() }).collect::<Vec<_>>();
            row.iter().map(|c| s.words_from_spans(&cell(c), size, s.body, INK, false)).collect()
        };
        let mut head = words(self, header, true);
        let mut body: Vec<_> = rows.iter().map(|r| words(self, r, false)).collect();
        if body.is_empty() {
            body.push(std::mem::take(&mut head)); // a header alone is just a row
        }
        let (mut nat, mut min) = (vec![0.0f32; ncol], vec![0.0f32; ncol]);
        for row in std::iter::once(&head).chain(&body) {
            for (k, ws) in row.iter().enumerate() {
                let one_line = ws.iter().map(|w| w.width).sum::<f32>() + space * ws.len().saturating_sub(1) as f32;
                nat[k] = nat[k].max(one_line);
                min[k] = min[k].max(ws.iter().map(|w| w.width).fold(0.0, f32::max));
            }
        }
        let gaps = gap * (ncol - 1) as f32;
        let widths = column_widths(&nat, &min, (tw - gaps).max(1.0));
        let table_w = widths.iter().sum::<f32>() + gaps;
        let set = |s: &Self, row: Vec<Vec<Word>>| -> Vec<Vec<Line>> { row.into_iter().zip(&widths).map(|(ws, &w)| s.break_lines(ws, &|_| w, 0.0, space, false)).collect() };
        let head = set(self, head);
        let body: Vec<_> = body.into_iter().map(|r| set(self, r)).collect();
        let height = |row: &[Vec<Line>]| row.iter().map(Vec::len).max().unwrap_or(0).max(1) as f32 * lead;
        // a rule sits in a band `pad` deep on either side; top and bottom rules are heavier
        let pad = lead * 0.3;
        let (heavy, light) = (size * 0.08, size * 0.05);
        let rule = |s: &mut Self, width: f32| {
            s.y += pad;
            let x = s.left() + (tw - table_w) / 2.0;
            let y = s.y;
            s.page().items.push(Item::Line { x1: x, y1: y, x2: x + table_w, y2: y, width, color: INK });
            s.y += pad;
        };
        let draw = |s: &mut Self, row: &[Vec<Line>]| {
            let mut x = s.left() + (tw - table_w) / 2.0;
            for (k, cell) in row.iter().enumerate() {
                for (j, line) in cell.iter().enumerate() {
                    let bl = s.y + j as f32 * lead + (lead - size) / 2.0 + size * 0.8;
                    s.place_line(line, x, widths[k], bl, false, align[k], space);
                }
                x += widths[k] + gap;
            }
            s.y += height(row);
            let refs: Vec<u32> = row.iter().flatten().flat_map(Self::line_refs).collect();
            s.queue_notes(&refs);
        };
        let head_h = if head.is_empty() { 0.0 } else { height(&head) + 2.0 * pad };
        if self.y > self.top + 0.1 {
            self.y += self.leading * 0.5;
        }
        let mut open = false;
        for row in &body {
            let refs: Vec<u32> = row.iter().flatten().flat_map(Self::line_refs).collect();
            // rows never split: a row that doesn't fit (with its notes and the bottom rule)
            // closes the table here and starts it again on the next page
            // ponytail: a single row taller than a page runs past the foot
            let need = if open { 0.0 } else { 2.0 * pad + head_h } + height(row) + 2.0 * pad;
            if self.y > self.top + 0.5 && !self.room_for(need, &refs) {
                if open {
                    rule(self, heavy);
                }
                self.continue_page();
                open = false;
            }
            if !open {
                rule(self, heavy);
                if !head.is_empty() {
                    draw(self, &head);
                    rule(self, light);
                }
                open = true;
            }
            draw(self, row);
        }
        rule(self, heavy);
        // back onto the grid (on average half a line below, as above)
        self.snap_to_grid();
    }
}
