//! The book: its text, details, design (style profile), print and ebook settings,
//! world notes and writing goals. Everything here is saved as one JSON file per book.

use serde::{Deserialize, Serialize};

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn new_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}{:04x}", t & 0xffff_ffff_ffff, n & 0xffff)
}

/// Today's local date as YYYY-MM-DD, used for daily word counts.
pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn year_now() -> i32 {
    use chrono::Datelike;
    chrono::Local::now().year()
}

// ---------------------------------------------------------------------------------------------
// Sections (front matter, chapters, back matter)
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SectionKind {
    // front matter
    TitlePage,
    Copyright,
    Dedication,
    Epigraph,
    Contents,
    Foreword,
    Preface,
    // body
    Prologue,
    Chapter,
    Part,
    Epilogue,
    // back matter
    Afterword,
    Acknowledgements,
    AboutAuthor,
    AlsoBy,
    Custom,
}

impl SectionKind {
    pub fn label(self) -> &'static str {
        match self {
            SectionKind::TitlePage => "Title page",
            SectionKind::Copyright => "Copyright",
            SectionKind::Dedication => "Dedication",
            SectionKind::Epigraph => "Epigraph",
            SectionKind::Contents => "Contents",
            SectionKind::Foreword => "Foreword",
            SectionKind::Preface => "Preface",
            SectionKind::Prologue => "Prologue",
            SectionKind::Chapter => "Chapter",
            SectionKind::Part => "Part",
            SectionKind::Epilogue => "Epilogue",
            SectionKind::Afterword => "Afterword",
            SectionKind::Acknowledgements => "Acknowledgements",
            SectionKind::AboutAuthor => "About the author",
            SectionKind::AlsoBy => "Also by",
            SectionKind::Custom => "Other page",
        }
    }
    pub const FRONT: [SectionKind; 7] = [
        SectionKind::TitlePage,
        SectionKind::Copyright,
        SectionKind::Dedication,
        SectionKind::Epigraph,
        SectionKind::Contents,
        SectionKind::Foreword,
        SectionKind::Preface,
    ];
    pub const BODY: [SectionKind; 4] =
        [SectionKind::Chapter, SectionKind::Prologue, SectionKind::Epilogue, SectionKind::Part];
    pub const BACK: [SectionKind; 5] = [
        SectionKind::Afterword,
        SectionKind::Acknowledgements,
        SectionKind::AboutAuthor,
        SectionKind::AlsoBy,
        SectionKind::Custom,
    ];
    /// Whether this kind of page has a running text body the author writes.
    pub fn has_body(self) -> bool {
        !matches!(self, SectionKind::TitlePage | SectionKind::Contents)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Section {
    pub id: String,
    pub kind: SectionKind,
    pub title: String,
    pub subtitle: String,
    /// The text, one paragraph per line. `*italic*`, `**bold**`, a line with `***` is a
    /// scene break, `> ` starts a block quote, `## ` a subheading.
    pub text: String,
    /// Point-of-view character shown under the chapter title (if the design shows it).
    pub pov: String,
    pub in_contents: bool,
    /// Chapter-level switch for the design's drop cap.
    pub drop_cap: bool,
    /// Private notes for the author; never exported.
    pub notes: String,
}

impl Default for Section {
    fn default() -> Self {
        Section {
            id: new_id(),
            kind: SectionKind::Chapter,
            title: String::new(),
            subtitle: String::new(),
            text: String::new(),
            pov: String::new(),
            in_contents: true,
            drop_cap: true,
            notes: String::new(),
        }
    }
}

impl Section {
    pub fn new(kind: SectionKind, title: &str) -> Self {
        Section {
            kind,
            title: title.to_string(),
            in_contents: !matches!(
                kind,
                SectionKind::TitlePage | SectionKind::Copyright | SectionKind::Dedication | SectionKind::Epigraph | SectionKind::Contents
            ),
            ..Default::default()
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Book details
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct BookMeta {
    pub title: String,
    pub subtitle: String,
    pub author: String,
    pub series: String,
    pub series_number: String,
    pub publisher: String,
    pub year: String,
    pub edition: String,
    pub isbn_paperback: String,
    pub isbn_hardcover: String,
    pub isbn_ebook: String,
    pub language: String,
    pub description: String,
    pub keywords: String,
}

impl Default for BookMeta {
    fn default() -> Self {
        BookMeta {
            title: "Untitled book".into(),
            subtitle: String::new(),
            author: String::new(),
            series: String::new(),
            series_number: String::new(),
            publisher: String::new(),
            year: year_now().to_string(),
            edition: String::new(),
            isbn_paperback: String::new(),
            isbn_hardcover: String::new(),
            isbn_ebook: String::new(),
            language: "en".into(),
            description: String::new(),
            keywords: String::new(),
        }
    }
}

/// The words used for chapter labels and the like.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Terminology {
    pub chapter: String,
    pub part: String,
    pub prologue: String,
    pub epilogue: String,
    pub contents: String,
}

impl Default for Terminology {
    fn default() -> Self {
        Terminology {
            chapter: "Chapter".into(),
            part: "Part".into(),
            prologue: "Prologue".into(),
            epilogue: "Epilogue".into(),
            contents: "Contents".into(),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Design (style profile)
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BodyAlign {
    Justify,
    Left,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum HAlign {
    Left,
    Center,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum HeadingLayout {
    /// The number (with or without its label) on its own line above the title.
    NumberAboveTitle,
    /// Only the title.
    TitleOnly,
    /// Only the number.
    NumberOnly,
    /// Number and title on one line ("1. The Storm").
    Inline,
}

impl HeadingLayout {
    pub const ALL: [HeadingLayout; 4] =
        [HeadingLayout::NumberAboveTitle, HeadingLayout::TitleOnly, HeadingLayout::NumberOnly, HeadingLayout::Inline];
    pub fn label(self) -> &'static str {
        match self {
            HeadingLayout::NumberAboveTitle => "Number above title",
            HeadingLayout::TitleOnly => "Title only",
            HeadingLayout::NumberOnly => "Number only",
            HeadingLayout::Inline => "Number and title on one line",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum NumberFormat {
    /// 1
    Arabic,
    /// One
    Word,
    /// I
    Roman,
    /// Chapter 1
    LabelArabic,
    /// Chapter One
    LabelWord,
    /// Chapter I
    LabelRoman,
}

impl NumberFormat {
    pub const ALL: [NumberFormat; 6] = [
        NumberFormat::LabelArabic,
        NumberFormat::LabelWord,
        NumberFormat::LabelRoman,
        NumberFormat::Arabic,
        NumberFormat::Word,
        NumberFormat::Roman,
    ];
    pub fn label(self) -> &'static str {
        match self {
            NumberFormat::Arabic => "1",
            NumberFormat::Word => "One",
            NumberFormat::Roman => "I",
            NumberFormat::LabelArabic => "Chapter 1",
            NumberFormat::LabelWord => "Chapter One",
            NumberFormat::LabelRoman => "Chapter I",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum FirstParagraph {
    Plain,
    /// The first line in small capitals.
    SmallCapsLine,
    /// The first few words in small capitals.
    SmallCapsWords,
}

impl FirstParagraph {
    pub const ALL: [FirstParagraph; 3] =
        [FirstParagraph::Plain, FirstParagraph::SmallCapsWords, FirstParagraph::SmallCapsLine];
    pub fn label(self) -> &'static str {
        match self {
            FirstParagraph::Plain => "Plain",
            FirstParagraph::SmallCapsWords => "Small caps: first words",
            FirstParagraph::SmallCapsLine => "Small caps: first line",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SceneBreakStyle {
    Ornament,
    Glyph,
    Space,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PageNumberPos {
    BottomCenter,
    BottomOutside,
    TopOutside,
}

impl PageNumberPos {
    pub const ALL: [PageNumberPos; 3] = [PageNumberPos::BottomCenter, PageNumberPos::BottomOutside, PageNumberPos::TopOutside];
    pub fn label(self) -> &'static str {
        match self {
            PageNumberPos::BottomCenter => "Bottom, centred",
            PageNumberPos::BottomOutside => "Bottom, outside corner",
            PageNumberPos::TopOutside => "Top, outside corner",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum HeaderContent {
    Nothing,
    Author,
    BookTitle,
    ChapterTitle,
}

impl HeaderContent {
    pub const ALL: [HeaderContent; 4] =
        [HeaderContent::Author, HeaderContent::BookTitle, HeaderContent::ChapterTitle, HeaderContent::Nothing];
    pub fn label(self) -> &'static str {
        match self {
            HeaderContent::Nothing => "Nothing",
            HeaderContent::Author => "Author name",
            HeaderContent::BookTitle => "Book title",
            HeaderContent::ChapterTitle => "Chapter title",
        }
    }
}

/// A book design ("style profile"): fonts, spacing, chapter openings, ornaments.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct StyleProfile {
    pub name: String,
    /// Which built-in theme this started from.
    pub builtin: String,
    pub body_font: String,
    pub heading_font: String,
    pub number_font: String,
    pub base_size_pt: f32,
    pub line_height: f32,
    pub paragraph_spacing_em: f32,
    pub first_indent_em: f32,
    pub no_indent_after_heading: bool,
    pub align: BodyAlign,
    pub heading_layout: HeadingLayout,
    pub number_format: NumberFormat,
    pub heading_align: HAlign,
    /// Chapter title size as a multiple of the body size.
    pub title_scale: f32,
    pub number_scale: f32,
    pub title_uppercase: bool,
    pub title_italic: bool,
    pub number_uppercase: bool,
    pub title_color: String,
    pub number_color: String,
    pub chapter_ornament: String,
    pub ornament_color: String,
    pub ornament_scale: f32,
    pub scene_break: SceneBreakStyle,
    pub scene_ornament: String,
    pub scene_glyph: String,
    pub drop_cap: bool,
    pub drop_cap_lines: u32,
    pub drop_cap_color: String,
    pub first_paragraph: FirstParagraph,
    pub small_caps_words: u32,
    /// How far down the page a chapter opening starts, in body lines.
    pub sink_lines: f32,
    /// Space between the chapter heading and the text, in ems of the body size.
    pub opener_gap_em: f32,
    pub show_pov: bool,
    pub header_rule: bool,
    pub header_small_caps: bool,
    /// Hyphenate justified English text where it helps the spacing.
    pub hyphenate: bool,
}

impl Default for StyleProfile {
    fn default() -> Self {
        crate::themes::builtin_themes().into_iter().next().unwrap()
    }
}

// ---------------------------------------------------------------------------------------------
// Print and ebook settings
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Paper {
    Cream,
    White,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Binding {
    Paperback,
    Hardback,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PrintSettings {
    pub trim_key: String,
    pub trim_w_in: f32,
    pub trim_h_in: f32,
    pub margin_top_in: f32,
    pub margin_bottom_in: f32,
    pub margin_inside_in: f32,
    pub margin_outside_in: f32,
    pub bleed: bool,
    pub page_numbers: bool,
    pub page_number_pos: PageNumberPos,
    pub running_headers: bool,
    pub header_left: HeaderContent,
    pub header_right: HeaderContent,
    pub recto_chapter_start: bool,
    pub paper: Paper,
    pub binding: Binding,
}

impl Default for PrintSettings {
    fn default() -> Self {
        let t = crate::themes::default_trim();
        PrintSettings {
            trim_key: t.key.to_string(),
            trim_w_in: t.w_in,
            trim_h_in: t.h_in,
            margin_top_in: crate::themes::DEFAULT_MARGIN_TOP_IN,
            margin_bottom_in: crate::themes::DEFAULT_MARGIN_BOTTOM_IN,
            margin_inside_in: crate::themes::DEFAULT_MARGIN_INSIDE_IN,
            margin_outside_in: crate::themes::DEFAULT_MARGIN_OUTSIDE_IN,
            bleed: false,
            page_numbers: true,
            page_number_pos: PageNumberPos::BottomCenter,
            running_headers: true,
            header_left: HeaderContent::Author,
            header_right: HeaderContent::BookTitle,
            recto_chapter_start: false,
            paper: Paper::Cream,
            binding: Binding::Paperback,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EbookTarget {
    Kindle,
    Apple,
    Generic,
}

impl EbookTarget {
    pub fn label(self) -> &'static str {
        match self {
            EbookTarget::Kindle => "Kindle",
            EbookTarget::Apple => "Apple Books",
            EbookTarget::Generic => "Other stores",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct EbookSettings {
    pub embed_fonts: bool,
    pub contents_page: bool,
}

impl Default for EbookSettings {
    fn default() -> Self {
        EbookSettings { embed_fonts: true, contents_page: true }
    }
}

// ---------------------------------------------------------------------------------------------
// World notes (characters, places, things)
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorldKind {
    Character,
    Place,
    Item,
    Group,
    Lore,
}

impl WorldKind {
    pub const ALL: [WorldKind; 5] = [WorldKind::Character, WorldKind::Place, WorldKind::Item, WorldKind::Group, WorldKind::Lore];
    pub fn label(self) -> &'static str {
        match self {
            WorldKind::Character => "Character",
            WorldKind::Place => "Place",
            WorldKind::Item => "Object",
            WorldKind::Group => "Group",
            WorldKind::Lore => "Lore",
        }
    }
    pub fn plural(self) -> &'static str {
        match self {
            WorldKind::Character => "Characters",
            WorldKind::Place => "Places",
            WorldKind::Item => "Objects",
            WorldKind::Group => "Groups",
            WorldKind::Lore => "Lore",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct WorldEntry {
    pub id: String,
    pub kind: WorldKind,
    pub name: String,
    /// Other names, comma separated.
    pub aliases: String,
    pub summary: String,
    pub notes: String,
}

impl Default for WorldEntry {
    fn default() -> Self {
        WorldEntry {
            id: new_id(),
            kind: WorldKind::Character,
            name: String::new(),
            aliases: String::new(),
            summary: String::new(),
            notes: String::new(),
        }
    }
}

impl WorldEntry {
    pub fn names(&self) -> Vec<String> {
        let mut v = vec![self.name.trim().to_string()];
        v.extend(self.aliases.split(',').map(|s| s.trim().to_string()));
        v.retain(|s| s.chars().count() >= 2);
        v
    }
}

// ---------------------------------------------------------------------------------------------
// Goals and writing stats
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Goals {
    pub daily_words: u32,
    pub book_words: u32,
}

impl Default for Goals {
    fn default() -> Self {
        Goals { daily_words: crate::themes::DEFAULT_DAILY_GOAL, book_words: crate::themes::DEFAULT_BOOK_GOAL }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct WritingDay {
    pub date: String,
    /// Book word count when the day began.
    pub start_words: u64,
    /// Latest word count that day.
    pub end_words: u64,
}

impl WritingDay {
    pub fn written(&self) -> u64 {
        self.end_words.saturating_sub(self.start_words)
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct WritingStats {
    pub days: Vec<WritingDay>,
}

impl WritingStats {
    /// Record the current word count for today.
    pub fn record(&mut self, words: u64) {
        let d = today();
        if let Some(last) = self.days.last_mut() {
            if last.date == d {
                last.end_words = words;
                return;
            }
        }
        let start = self.days.last().map(|l| l.end_words).unwrap_or(words);
        self.days.push(WritingDay { date: d, start_words: start.min(words), end_words: words });
        if self.days.len() > 400 {
            self.days.remove(0);
        }
    }
    pub fn today_written(&self) -> u64 {
        let d = today();
        self.days.last().filter(|l| l.date == d).map(|l| l.written()).unwrap_or(0)
    }
    /// Consecutive days (ending today or yesterday) on which the daily goal was met.
    pub fn streak(&self, goal: u32) -> u32 {
        self.streak_on(goal, chrono::Local::now().date_naive())
    }
    fn streak_on(&self, goal: u32, today: chrono::NaiveDate) -> u32 {
        let met: std::collections::HashSet<chrono::NaiveDate> = self
            .days
            .iter()
            .filter(|d| d.written() >= goal.max(1) as u64)
            .filter_map(|d| chrono::NaiveDate::parse_from_str(&d.date, "%Y-%m-%d").ok())
            .collect();
        // today still being written doesn't break the streak
        let mut d = if met.contains(&today) { today } else { today.pred_opt().unwrap_or(today) };
        let mut n = 0;
        while met.contains(&d) {
            n += 1;
            match d.pred_opt() {
                Some(p) => d = p,
                None => break,
            }
        }
        n
    }
}

// ---------------------------------------------------------------------------------------------
// The book
// ---------------------------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Book {
    pub format: u32,
    pub id: String,
    pub meta: BookMeta,
    pub front: Vec<Section>,
    pub body: Vec<Section>,
    pub back: Vec<Section>,
    pub style: StyleProfile,
    pub print: PrintSettings,
    pub ebook: EbookSettings,
    pub terms: Terminology,
    pub world: Vec<WorldEntry>,
    pub goals: Goals,
    pub stats: WritingStats,
    pub restart_numbers_each_part: bool,
    pub smart_quotes: bool,
    pub spelling: SpellSettings,
    pub created: u64,
    pub modified: u64,
}

impl Default for Book {
    fn default() -> Self {
        Book {
            format: 1,
            id: new_id(),
            meta: BookMeta::default(),
            front: Vec::new(),
            body: Vec::new(),
            back: Vec::new(),
            style: StyleProfile::default(),
            print: PrintSettings::default(),
            ebook: EbookSettings::default(),
            terms: Terminology::default(),
            world: Vec::new(),
            goals: Goals::default(),
            stats: WritingStats::default(),
            restart_numbers_each_part: false,
            smart_quotes: true,
            spelling: SpellSettings::default(),
            created: now_secs(),
            modified: now_secs(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct SpellSettings {
    pub enabled: bool,
    /// Words this book accepts (names, invented words).
    pub personal: Vec<String>,
}

impl Default for SpellSettings {
    fn default() -> Self {
        SpellSettings { enabled: true, personal: Vec::new() }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Area {
    Front,
    Body,
    Back,
}

impl Book {
    /// A new, empty book with the usual front matter and one chapter.
    pub fn new_empty(title: &str, author: &str) -> Book {
        let mut b = Book::default();
        b.meta.title = title.to_string();
        b.meta.author = author.to_string();
        b.front = vec![
            Section::new(SectionKind::TitlePage, "Title page"),
            Section::new(SectionKind::Copyright, "Copyright"),
        ];
        let mut c = Section::new(SectionKind::Chapter, "");
        c.title = String::new();
        b.body = vec![c];
        b.back = vec![Section::new(SectionKind::AboutAuthor, "About the author")];
        b
    }

    pub fn area(&self, a: Area) -> &Vec<Section> {
        match a {
            Area::Front => &self.front,
            Area::Body => &self.body,
            Area::Back => &self.back,
        }
    }
    pub fn area_mut(&mut self, a: Area) -> &mut Vec<Section> {
        match a {
            Area::Front => &mut self.front,
            Area::Body => &mut self.body,
            Area::Back => &mut self.back,
        }
    }

    /// Every section in reading order with its area.
    pub fn all_sections(&self) -> impl Iterator<Item = (Area, usize, &Section)> {
        self.front
            .iter()
            .enumerate()
            .map(|(i, s)| (Area::Front, i, s))
            .chain(self.body.iter().enumerate().map(|(i, s)| (Area::Body, i, s)))
            .chain(self.back.iter().enumerate().map(|(i, s)| (Area::Back, i, s)))
    }

    pub fn word_count(&self) -> u64 {
        self.all_sections().map(|(_, _, s)| count_words(&s.text) as u64).sum()
    }

    pub fn body_word_count(&self) -> u64 {
        self.body.iter().map(|s| count_words(&s.text) as u64).sum()
    }

    /// Chapter numbers for body sections (None for prologue, epilogue and parts),
    /// and part numbers for parts.
    pub fn numbers(&self) -> Vec<Option<u32>> {
        let mut out = Vec::with_capacity(self.body.len());
        let (mut ch, mut part) = (0u32, 0u32);
        for s in &self.body {
            match s.kind {
                SectionKind::Chapter => {
                    ch += 1;
                    out.push(Some(ch));
                }
                SectionKind::Part => {
                    part += 1;
                    if self.restart_numbers_each_part {
                        ch = 0;
                    }
                    out.push(Some(part));
                }
                _ => out.push(None),
            }
        }
        out
    }

    /// The heading label for a body section, e.g. "Chapter Three" or "Prologue".
    pub fn number_label(&self, s: &Section, number: Option<u32>) -> String {
        let fmt = self.style.number_format;
        match s.kind {
            SectionKind::Chapter => {
                let n = number.unwrap_or(1);
                format_number(&self.terms.chapter, n, fmt)
            }
            SectionKind::Part => {
                let n = number.unwrap_or(1);
                let f = match fmt {
                    NumberFormat::Arabic | NumberFormat::LabelArabic => NumberFormat::LabelArabic,
                    NumberFormat::Word | NumberFormat::LabelWord => NumberFormat::LabelWord,
                    _ => NumberFormat::LabelRoman,
                };
                format_number(&self.terms.part, n, f)
            }
            SectionKind::Prologue => self.terms.prologue.clone(),
            SectionKind::Epilogue => self.terms.epilogue.clone(),
            other => other.label().to_string(),
        }
    }

    /// The title shown in the contents list and running heads.
    pub fn display_title(&self, s: &Section, number: Option<u32>) -> String {
        if !s.title.trim().is_empty() {
            return s.title.trim().to_string();
        }
        match s.kind {
            SectionKind::Chapter | SectionKind::Part | SectionKind::Prologue | SectionKind::Epilogue => {
                self.number_label(s, number)
            }
            k => k.label().to_string(),
        }
    }
}

pub fn count_words(text: &str) -> usize {
    text.split(|c: char| c.is_whitespace() || c == '—' || c == '–')
        .filter(|w| w.chars().any(|c| c.is_alphanumeric()))
        .count()
}

pub fn format_number(label: &str, n: u32, fmt: NumberFormat) -> String {
    match fmt {
        NumberFormat::Arabic => n.to_string(),
        NumberFormat::Word => number_words(n),
        NumberFormat::Roman => roman(n),
        NumberFormat::LabelArabic => format!("{label} {n}"),
        NumberFormat::LabelWord => format!("{label} {}", number_words(n)),
        NumberFormat::LabelRoman => format!("{label} {}", roman(n)),
    }
}

pub fn roman(mut n: u32) -> String {
    if n == 0 {
        return "0".into();
    }
    const T: [(u32, &str); 13] = [
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ];
    let mut s = String::new();
    for (v, r) in T {
        while n >= v {
            s.push_str(r);
            n -= v;
        }
    }
    s
}

pub fn number_words(n: u32) -> String {
    const ONES: [&str; 20] = [
        "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
        "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
    ];
    const TENS: [&str; 10] = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    if n < 20 {
        return ONES[n as usize].to_string();
    }
    if n < 100 {
        let t = TENS[(n / 10) as usize];
        return if n.is_multiple_of(10) { t.to_string() } else { format!("{t}-{}", ONES[(n % 10) as usize]) };
    }
    if n < 1000 {
        let h = format!("{} Hundred", ONES[(n / 100) as usize]);
        return if n.is_multiple_of(100) { h } else { format!("{h} and {}", number_words(n % 100)) };
    }
    n.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn day(date: &str, words: u64) -> WritingDay {
        WritingDay { date: date.into(), start_words: 0, end_words: words }
    }

    #[test]
    fn streak_needs_consecutive_days() {
        let today = NaiveDate::from_ymd_opt(2026, 3, 10).unwrap();
        let s = WritingStats { days: vec![day("2026-03-05", 500), day("2026-03-06", 500), day("2026-03-08", 500), day("2026-03-09", 500), day("2026-03-10", 500)] };
        assert_eq!(s.streak_on(300, today), 3); // 03-07 missing
        let s = WritingStats { days: vec![day("2026-03-08", 500), day("2026-03-09", 500), day("2026-03-10", 10)] };
        assert_eq!(s.streak_on(300, today), 2); // today unfinished, yesterday counts
        let s = WritingStats { days: vec![day("2026-03-07", 500), day("2026-03-08", 500)] };
        assert_eq!(s.streak_on(300, today), 0); // last met day is 2 days ago
    }

    #[test]
    fn today_is_local_date() {
        let t = today();
        assert_eq!(t, chrono::Local::now().format("%Y-%m-%d").to_string());
        assert_eq!(year_now().to_string(), &t[..4]);
    }
}
