//! Things to fix (or know) before sending the book to a printer or store.

use crate::model::*;
use crate::themes;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Ok,
    Warn,
    Problem,
}

#[derive(Clone, Debug, Serialize)]
pub struct Check {
    pub level: Level,
    pub text: String,
}

/// ISBN-13 (digits only) or ISBN-10 (`X` allowed only as the last character); hyphens and
/// spaces are ignored.
pub fn isbn_ok(s: &str) -> bool {
    let c: Vec<char> = s.chars().filter(|c| *c != '-' && !c.is_whitespace()).collect();
    let digit = |ch: char| ch.to_digit(10);
    match c.len() {
        13 => {
            let Some(d) = c.iter().map(|&ch| digit(ch)).collect::<Option<Vec<u32>>>() else { return false };
            d.iter().enumerate().map(|(i, v)| if i % 2 == 0 { *v } else { v * 3 }).sum::<u32>() % 10 == 0
        }
        10 => {
            let mut sum = 0;
            for (i, &ch) in c.iter().enumerate() {
                let v = if i == 9 && (ch == 'X' || ch == 'x') { 10 } else if let Some(v) = digit(ch) { v } else { return false };
                sum += (10 - i as u32) * v;
            }
            sum % 11 == 0
        }
        _ => false,
    }
}

pub fn preflight(book: &Book, pages: usize) -> Vec<Check> {
    let mut v = Vec::new();
    let mut push = |level, text: String| v.push(Check { level, text });
    if book.meta.title.trim().is_empty() || book.meta.title == "Untitled book" {
        push(Level::Warn, "The book has no title yet (Book details).".into());
    } else {
        push(Level::Ok, format!("Title: {}", book.meta.title));
    }
    if book.meta.author.trim().is_empty() {
        push(Level::Warn, "No author name yet (Book details).".into());
    }
    let numbers = book.numbers();
    let empty: Vec<String> = book
        .body
        .iter()
        .enumerate()
        .filter(|(_, s)| s.kind != SectionKind::Part && count_words(&s.text) == 0)
        .map(|(i, s)| book.display_title(s, numbers.get(i).copied().flatten()))
        .collect();
    if !empty.is_empty() {
        push(Level::Warn, format!("Empty sections: {}", empty.join(", ")));
    }
    if pages < 24 {
        push(Level::Warn, format!("{pages} pages: most print-on-demand services need at least 24."));
    } else if pages > 828 {
        push(Level::Problem, format!("{pages} pages: too many for most paperback printers (828 at most)."));
    } else {
        push(Level::Ok, format!("{pages} pages at {:.2} × {:.2} in", book.print.trim_w_in, book.print.trim_h_in));
    }
    let min_in = themes::min_inside_margin_in(pages);
    if book.print.margin_inside_in + 0.0001 < min_in {
        push(Level::Problem, format!("The inside margin is {:.3} in; a {pages}-page book needs at least {min_in} in.", book.print.margin_inside_in));
    } else {
        push(Level::Ok, format!("Inside margin {:.3} in (at least {min_in} in needed)", book.print.margin_inside_in));
    }
    let min_out = themes::MIN_OUTSIDE_MARGIN_IN + if book.print.bleed { themes::BLEED_IN } else { 0.0 };
    for (name, val) in [("top", book.print.margin_top_in), ("bottom", book.print.margin_bottom_in), ("outside", book.print.margin_outside_in)] {
        if val + 0.0001 < min_out {
            push(Level::Problem, format!("The {name} margin ({val:.3} in) is under the {min_out} in printers require."));
        }
    }
    for (label, isbn) in [("Paperback", &book.meta.isbn_paperback), ("Hardcover", &book.meta.isbn_hardcover), ("Ebook", &book.meta.isbn_ebook)] {
        if !isbn.trim().is_empty() && !isbn_ok(isbn) {
            push(Level::Warn, format!("The {label} ISBN doesn't look valid (check the digits)."));
        }
    }
    if !book.smart_quotes {
        let straight = book.all_sections().filter(|(_, _, s)| s.text.contains('"')).count();
        if straight > 0 {
            push(Level::Warn, "Straight quotes (\") are in the text; turn on curly quotes in Book details for print.".into());
        }
    }
    v
}

#[cfg(test)]
mod tests {
    use super::isbn_ok;

    #[test]
    fn isbn() {
        assert!(isbn_ok("978-0-306-40615-7"));
        assert!(!isbn_ok("978-0-306-40615-8"));
        assert!(isbn_ok("0-306-40615-2"));
        assert!(isbn_ok("0-8044-2957-X"));
        assert!(!isbn_ok("X-306-40615-2"));
        assert!(!isbn_ok("978-0-306-4061X-7"));
    }
}
