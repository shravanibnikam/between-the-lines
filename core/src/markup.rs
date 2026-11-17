//! The light markup used in the editor, turned into blocks of styled text.
//!
//! One paragraph per line. `*italic*` or `_italic_`, `**bold**`, a line holding only
//! `***`, `* * *`, `#` or `~` is a scene break, `> ` starts a block quote,
//! `## ` and `### ` start subheadings.

#[derive(Clone, Debug, PartialEq)]
pub struct Span {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Block {
    Para(Vec<Span>),
    Quote(Vec<Span>),
    Heading(u8, Vec<Span>),
    SceneBreak,
}

pub fn is_scene_break(line: &str) -> bool {
    let t: String = line.chars().filter(|c| !c.is_whitespace()).collect();
    matches!(t.as_str(), "***" | "#" | "~" | "⁂" | "---" | "* * *" | "***." | "◆" | "§")
        || (t.len() >= 3 && t.chars().all(|c| c == '*'))
}

pub fn parse_blocks(text: &str, smart: bool) -> Vec<Block> {
    let mut out = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if is_scene_break(line) {
            out.push(Block::SceneBreak);
        } else if let Some(rest) = line.strip_prefix("### ") {
            out.push(Block::Heading(3, parse_inline(rest, smart)));
        } else if let Some(rest) = line.strip_prefix("## ") {
            out.push(Block::Heading(2, parse_inline(rest, smart)));
        } else if let Some(rest) = line.strip_prefix("# ") {
            out.push(Block::Heading(2, parse_inline(rest, smart)));
        } else if let Some(rest) = line.strip_prefix('>') {
            out.push(Block::Quote(parse_inline(rest.trim_start(), smart)));
        } else {
            out.push(Block::Para(parse_inline(line, smart)));
        }
    }
    out
}

/// Split inline markup into spans.
pub fn parse_inline(s: &str, smart: bool) -> Vec<Span> {
    let s = if smart { smarten(s) } else { s.to_string() };
    let chars: Vec<char> = s.chars().collect();
    let mut spans: Vec<Span> = Vec::new();
    let (mut bold, mut italic) = (false, false);
    let mut cur = String::new();
    let mut i = 0;
    let push = |cur: &mut String, spans: &mut Vec<Span>, bold: bool, italic: bool| {
        if !cur.is_empty() {
            spans.push(Span { text: std::mem::take(cur), bold, italic });
        }
    };
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && i + 1 < chars.len() {
            cur.push(chars[i + 1]);
            i += 2;
            continue;
        }
        if c == '*' && i + 1 < chars.len() && chars[i + 1] == '*' {
            if bold || has_closing(&chars, i + 2, "**") {
                push(&mut cur, &mut spans, bold, italic);
                bold = !bold;
                i += 2;
                continue;
            }
        } else if c == '*' || c == '_' {
            let marker = if c == '*' { "*" } else { "_" };
            // underscores inside words (snake_case) stay literal
            let inside_word = c == '_'
                && i > 0
                && chars[i - 1].is_alphanumeric()
                && i + 1 < chars.len()
                && chars[i + 1].is_alphanumeric();
            if !inside_word && (italic || has_closing(&chars, i + 1, marker)) {
                push(&mut cur, &mut spans, bold, italic);
                italic = !italic;
                i += 1;
                continue;
            }
        }
        cur.push(c);
        i += 1;
    }
    push(&mut cur, &mut spans, bold, italic);
    spans
}

fn has_closing(chars: &[char], from: usize, marker: &str) -> bool {
    let m: Vec<char> = marker.chars().collect();
    let mut i = from;
    while i + m.len() <= chars.len() {
        if chars[i..i + m.len()] == m[..] {
            // `*` must not be the start of `**`
            if m.len() == 1 && m[0] == '*' && i + 1 < chars.len() && chars[i + 1] == '*' {
                i += 2;
                continue;
            }
            // `_` inside a word (max_value) can't close
            let alnum = |k: Option<&char>| k.is_some_and(|c| c.is_alphanumeric());
            if m[0] == '_' && i > 0 && alnum(chars.get(i - 1)) && alnum(chars.get(i + 1)) {
                i += 1;
                continue;
            }
            return i > from;
        }
        i += 1;
    }
    false
}

/// Curly quotes, apostrophes, dashes and ellipses.
pub fn smarten(s: &str) -> String {
    let s = s.replace("---", "—").replace("--", "—").replace("...", "…");
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    for (i, &c) in chars.iter().enumerate() {
        // emphasis markers are transparent: `*"Hi"*` opens with the char before the `*`
        let prev = chars[..i].iter().rev().find(|p| **p != '*' && **p != '_').copied();
        let opening = match prev {
            None => true,
            Some(p) => p.is_whitespace() || "([{—–-/".contains(p) || p == '“' || p == '‘',
        };
        match c {
            '"' => out.push(if opening { '“' } else { '”' }),
            '\'' => out.push(if opening && chars.get(i + 1).map(|n| !n.is_numeric()).unwrap_or(false) { '‘' } else { '’' }),
            _ => out.push(c),
        }
    }
    out
}

/// Plain text of spans (for contents lists, running heads and searching).
pub fn plain(spans: &[Span]) -> String {
    spans.iter().map(|s| s.text.as_str()).collect()
}

/// Remove markup characters from a line (for word counts and titles).
pub fn strip(s: &str) -> String {
    plain(&parse_inline(s, false))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inline() {
        let v = parse_inline("a *b* **c** d_e_f", false);
        assert_eq!(plain(&v), "a b c d_e_f");
        assert!(v[1].italic && !v[1].bold);
        assert!(v[3].bold);
    }
    #[test]
    fn breaks() {
        assert!(is_scene_break("* * *"));
        assert!(is_scene_break("#"));
        assert!(!is_scene_break("# Heading"));
    }
    #[test]
    fn quotes() {
        assert_eq!(smarten("\"Hi,\" she said. It's"), "“Hi,” she said. It’s");
        assert_eq!(plain(&parse_inline("*\"Hi\"* and **\"Yo\"**", true)), "“Hi” and “Yo”");
        assert_eq!(plain(&parse_inline("_'Tis_ so", true)), "‘Tis so");
        assert_eq!(smarten("say \"*no*\""), "say “*no*”");
    }
    #[test]
    fn underscore_inside_word_never_closes() {
        let v = parse_inline("the variable _count and max_value", false);
        assert_eq!(plain(&v), "the variable _count and max_value");
        assert!(v.iter().all(|s| !s.italic), "{v:?}");
        assert!(parse_inline("an _italic_ word", false)[1].italic);
    }
}
