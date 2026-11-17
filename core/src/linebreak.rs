//! Paragraph line breaking: optimal fit over the whole paragraph (in the manner of
//! Knuth and Plass), with English hyphenation, keeping justified word gaps between
//! 0.75 and 2.5 times a normal space.

use std::sync::OnceLock;

/// Narrowest and widest a justified gap may be, as a share of a normal space.
pub const GAP_MIN: f32 = 0.75;
pub const GAP_MAX: f32 = 2.5;
/// Slack (points) allowed on every fit and gap test, here and when lines are placed.
pub const FIT_SLACK: f32 = 0.01;

/// Whether a justified gap is within the limits.
pub fn gap_ok(gap: f32, space: f32) -> bool {
    gap >= space * GAP_MIN - FIT_SLACK && gap <= space * GAP_MAX + FIT_SLACK
}

/// TeX's usual costs: a line, a hyphen, two hyphens in a row, a hyphen before the last line.
const LINE_PENALTY: f32 = 10.0;
const HYPHEN_PENALTY: f32 = 50.0;
const DOUBLE_HYPHEN_DEMERITS: f32 = 10_000.0;
const FINAL_HYPHEN_DEMERITS: f32 = 5_000.0;
const INFEASIBLE: f32 = 1e9;

/// One unbreakable piece of a line (a word, or part of one between hyphenation points).
#[derive(Clone, Debug)]
pub struct Piece {
    pub width: f32,
    /// The next piece belongs to the same word (no space between them).
    pub join_next: bool,
    /// Breaking after this piece adds a hyphen (false at an existing hyphen or dash).
    pub needs_hyphen: bool,
    /// Width of that hyphen in this piece's own face and size.
    pub hyphen_w: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Break {
    /// Index of the last piece on the line.
    pub end: usize,
    /// The line ends inside a word and needs a hyphen drawn.
    pub hyphen: bool,
}

fn dictionary() -> Option<&'static hyphenation::Standard> {
    static D: OnceLock<Option<hyphenation::Standard>> = OnceLock::new();
    D.get_or_init(|| {
        use hyphenation::Load;
        hyphenation::Standard::from_embedded(hyphenation::Language::EnglishUS).ok()
    })
    .as_ref()
}

/// Where a word may be split, as character offsets into it, with whether a hyphen is needed.
pub fn split_points(word: &str) -> Vec<(usize, bool)> {
    let chars: Vec<char> = word.chars().collect();
    // after soft hyphens the author typed
    let shy: Vec<(usize, bool)> =
        (1..chars.len().saturating_sub(1)).filter(|i| chars[*i] == '\u{ad}').map(|i| (i + 1, true)).collect();
    if !shy.is_empty() {
        return shy;
    }
    let mut out = Vec::new();
    // after an existing hyphen or dash (not at the very ends)
    for (i, c) in chars.iter().enumerate() {
        if (*c == '-' || *c == '–' || *c == '—') && i >= 2 && i + 3 < chars.len() {
            out.push((i + 1, false));
        }
    }
    if !out.is_empty() {
        return out;
    }
    // dictionary hyphenation of the letters, leaving leading and trailing punctuation alone
    let start = chars.iter().position(|c| c.is_alphabetic());
    let end = chars.iter().rposition(|c| c.is_alphabetic());
    let (Some(s), Some(e)) = (start, end) else { return out };
    let core: String = chars[s..=e].iter().collect();
    if core.chars().count() < 5 || !core.chars().all(|c| c.is_alphabetic()) {
        return out;
    }
    if let Some(d) = dictionary() {
        use hyphenation::Hyphenator;
        let hy = d.hyphenate(&core);
        for b in hy.breaks {
            let ci = core[..b].chars().count();
            out.push((s + ci, true));
        }
    }
    out
}

/// Cost of one line, or None when it can't be set within the gap limits.
fn line_cost(natural: f32, glue: usize, space: f32, width: f32, last: bool) -> Option<f32> {
    if last {
        // the last line keeps normal spacing and may end short; it may tighten a little
        let tight = natural - glue as f32 * space * (1.0 - GAP_MIN);
        return if tight <= width + FIT_SLACK { Some(0.0) } else { None };
    }
    if glue == 0 {
        // a single word (or piece) can't be justified: allowed if it fits, but costly
        return if natural <= width + FIT_SLACK { Some(1000.0) } else { None };
    }
    let words = natural - glue as f32 * space;
    let gap = (width - words) / glue as f32;
    if !gap_ok(gap, space) {
        return None;
    }
    // badness as TeX counts it: glue stretches by half a space and shrinks by a third
    let r = if gap >= space { (gap - space) / (space * 0.5) } else { (space - gap) / (space / 3.0) };
    Some((100.0 * r * r * r).min(10_000.0))
}

/// Best breaks for pieces; `widths(n)` is the width available to line n (indent included).
/// `badness_limit` rejects lines looser than that (None = anything within the gap limits).
pub fn optimal_breaks(pieces: &[Piece], space: f32, widths: &dyn Fn(usize) -> f32, badness_limit: Option<f32>) -> Option<Vec<Break>> {
    let n = pieces.len();
    if n == 0 {
        return Some(Vec::new());
    }
    // best[j]: cost of setting pieces 0..=j with a break after j
    let mut best = vec![INFEASIBLE; n];
    let mut prev: Vec<Option<usize>> = vec![None; n];
    let mut lines = vec![0usize; n];
    let mut hyphened = vec![false; n];
    for j in 0..n {
        let is_end = j == n - 1;
        let hyphen_here = !is_end && pieces[j].join_next && pieces[j].needs_hyphen;
        let mut natural = 0.0f32;
        let mut glue = 0usize;
        // walk back over possible line starts
        let mut i = j as isize;
        while i >= 0 {
            let iu = i as usize;
            natural += pieces[iu].width;
            if iu < j && !pieces[iu].join_next {
                natural += space;
                glue += 1;
            }
            {
                let before = if iu == 0 { 0.0 } else { best[iu - 1] };
                let line_no = if iu == 0 { 0 } else { lines[iu - 1] + 1 };
                if before < INFEASIBLE {
                    let w = widths(line_no);
                    let nat = natural + if hyphen_here { pieces[j].hyphen_w } else { 0.0 };
                    if let Some(bad) = line_cost(nat, glue, space, w, is_end) {
                        if badness_limit.map(|l| bad <= l || is_end).unwrap_or(true) {
                            let mut d = (LINE_PENALTY + bad).powi(2);
                            if hyphen_here {
                                d += HYPHEN_PENALTY * HYPHEN_PENALTY;
                                if iu > 0 && hyphened[iu - 1] {
                                    d += DOUBLE_HYPHEN_DEMERITS;
                                }
                            }
                            if is_end && iu > 0 && hyphened[iu - 1] {
                                d += FINAL_HYPHEN_DEMERITS;
                            }
                            let total = before + d;
                            if total < best[j] {
                                best[j] = total;
                                prev[j] = if iu == 0 { None } else { Some(iu - 1) };
                                lines[j] = line_no;
                                hyphened[j] = hyphen_here;
                            }
                        }
                    }
                }
            }
            // stop once even the tightest setting can't fit the widest line
            let tight = natural - glue as f32 * space * (1.0 - GAP_MIN);
            if tight > widths(0).max(widths(8)) + 1.0 {
                break;
            }
            i -= 1;
        }
    }
    if best[n - 1] >= INFEASIBLE {
        return None;
    }
    let mut out = Vec::new();
    let mut j = Some(n - 1);
    while let Some(k) = j {
        out.push(Break { end: k, hyphen: hyphened[k] });
        j = prev[k];
    }
    out.reverse();
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hyphenates_english() {
        let p = split_points("hyphenation");
        assert!(!p.is_empty(), "{p:?}");
        assert!(p.iter().all(|x| x.1));
        assert!(split_points("well-known").iter().any(|x| !x.1));
        assert!(split_points("I").is_empty());
        assert_eq!(split_points("ab\u{ad}cd"), vec![(3, true)]);
    }
    #[test]
    fn breaks_evenly() {
        // ten equal words, room for about four a line
        let pieces: Vec<Piece> = (0..10).map(|_| Piece { width: 20.0, join_next: false, needs_hyphen: false, hyphen_w: 3.0 }).collect();
        let w = |_: usize| 4.0 * 20.0 + 3.0 * 5.0 + 4.0;
        let b = optimal_breaks(&pieces, 5.0, &w, None).unwrap();
        assert_eq!(b.last().unwrap().end, 9);
        assert!(b.len() >= 3);
    }
}
