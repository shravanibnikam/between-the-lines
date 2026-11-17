//! Spell checking with the open-source English (US) Hunspell dictionary from LibreOffice
//! (SCOWL word list), read by the `spellbook` crate. Results are cached per word.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const AFF: &str = include_str!("../assets/dictionaries/en_US.aff");
const DIC: &str = include_str!("../assets/dictionaries/en_US.dic");

struct Speller {
    dict: spellbook::Dictionary,
    known: HashMap<String, bool>,
    suggestions: HashMap<String, Vec<String>>,
}

fn cell() -> &'static OnceLock<Mutex<Speller>> {
    static S: OnceLock<Mutex<Speller>> = OnceLock::new();
    &S
}

/// Load the dictionary in the background (it takes a moment); checks pass until it's ready.
pub fn preload() {
    std::thread::spawn(|| {
        let _ = speller();
    });
}

fn speller() -> Option<&'static Mutex<Speller>> {
    if let Some(s) = cell().get() {
        return Some(s);
    }
    let dict = spellbook::Dictionary::new(AFF, DIC).ok()?;
    let _ = cell().set(Mutex::new(Speller { dict, known: HashMap::new(), suggestions: HashMap::new() }));
    cell().get()
}

fn ready() -> Option<&'static Mutex<Speller>> {
    cell().get()
}

/// Words of a text with their byte ranges (letters and digits with inner apostrophes or hyphens).
pub fn words(text: &str) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    for (k, &(i, c)) in chars.iter().enumerate() {
        let inner = (c == '\'' || c == '’' || c == '-')
            && start.is_some()
            && chars.get(k + 1).map(|(_, n)| n.is_alphabetic()).unwrap_or(false);
        if c.is_alphabetic() || c.is_ascii_digit() || inner {
            if start.is_none() {
                start = Some(i);
            }
        } else if let Some(s) = start.take() {
            out.push((s, i));
        }
    }
    if let Some(s) = start {
        out.push((s, text.len()));
    }
    out
}

/// Whether a word should be flagged. `extra` holds names the book accepts (its own
/// dictionary and the names in its world notes), compared without case.
pub fn misspelled(word: &str, extra: &[String]) -> bool {
    misspelled_norm(word, &norm_extra(extra))
}

/// Accepted words in the form `misspelled_norm` compares against (normalise once per text).
pub fn norm_extra(extra: &[String]) -> Vec<String> {
    extra.iter().map(|e| e.replace('’', "'").to_lowercase()).collect()
}

/// `misspelled` with `extra` already normalised by `norm_extra`.
pub fn misspelled_norm(word: &str, extra: &[String]) -> bool {
    let w = word.replace('’', "'");
    if w.chars().any(|c| c.is_ascii_digit()) {
        return false; // ordinals, years, codes
    }
    let letters = w.chars().filter(|c| c.is_alphabetic()).count();
    if letters < 2 || w.chars().all(|c| c.is_uppercase() || !c.is_alphabetic()) {
        return false; // single letters and acronyms
    }
    let lower = w.to_lowercase();
    if extra.contains(&lower) {
        return false;
    }
    let Some(s) = ready() else { return false };
    let Ok(mut s) = s.lock() else { return false };
    if let Some(v) = s.known.get(&w) {
        return !*v;
    }
    // hyphenated words are fine when each part is
    let ok = if w.contains('-') {
        w.split('-').filter(|p| !p.is_empty()).all(|p| s.dict.check(p))
    } else {
        s.dict.check(&w) || w.strip_suffix("'s").map(|b| s.dict.check(b)).unwrap_or(false)
    };
    s.known.insert(w, ok);
    !ok
}

/// Up to `n` suggestions for a word (cached).
pub fn suggest(word: &str, n: usize) -> Vec<String> {
    let w = word.replace('’', "'");
    let Some(s) = ready() else { return Vec::new() };
    let Ok(mut s) = s.lock() else { return Vec::new() };
    if let Some(v) = s.suggestions.get(&w) {
        return v.iter().take(n).cloned().collect();
    }
    let mut out = Vec::new();
    s.dict.suggest(&w, &mut out);
    s.suggestions.insert(w, out.clone());
    out.into_iter().take(n).collect()
}

/// Misspelled words of a text, most frequent first, with how often each appears.
pub fn misspellings(text: &str, extra: &[String]) -> Vec<(String, usize)> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    let extra = norm_extra(extra);
    for (a, b) in words(text) {
        let w = &text[a..b];
        if misspelled_norm(w, &extra) {
            *counts.entry(w.to_string()).or_default() += 1;
        }
    }
    let mut v: Vec<(String, usize)> = counts.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    v
}

/// Replace every whole-word occurrence of `from` with `to`.
pub fn replace_word(text: &str, from: &str, to: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for (a, b) in words(text) {
        if &text[a..b] == from {
            out.push_str(&text[last..a]);
            out.push_str(to);
            last = b;
        }
    }
    out.push_str(&text[last..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn checks_words() {
        let _ = speller();
        assert!(!misspelled("lighthouse", &[]));
        assert!(!misspelled("Keeper’s", &[]));
        assert!(!misspelled("don't", &[]));
        assert!(misspelled("lighthuose", &[]));
        assert!(!misspelled("Nell", &["Nell".into()]));
        assert!(!suggest("lighthuose", 3).is_empty());
        assert_eq!(replace_word("the teh cat teh", "teh", "the"), "the the cat the");
        assert_eq!(words("well-known, don't stop"), vec![(0, 10), (12, 17), (18, 22)]);
    }
    #[test]
    fn extras_and_digits() {
        let _ = speller();
        assert!(misspelled("Zorblax’s", &[]));
        assert!(!misspelled("O’Brien", &["O’Brien".into()]));
        assert!(!misspelled("O'Brien", &["O’Brien".into()]));
        assert!(!misspelled("O’brien", &["o'brien".into()]));
        assert!(!misspelled("2nd", &[]));
        assert!(!misspelled("4th", &[]));
        assert_eq!(words("the 2nd time"), vec![(0, 3), (4, 7), (8, 12)]);
        assert!(misspellings("his 2nd and 1990s O’Brien", &["O’Brien".into()]).is_empty());
    }
}
