//! A short sample book (our own text) so a first launch has something to look at.

use crate::model::*;

pub fn sample_book() -> Book {
    let mut b = Book::new_empty("Where the Rivers Run Upward", "Imre Calloway");
    b.meta.subtitle = "Book One of the Saltmarch Cycle".into();
    b.meta.publisher = "Windle & Thorn".into();
    b.meta.description = "When the rivers of Saltmarch begin to run uphill, toward a mountain no map will name, a disgraced cartographer is the only one who can read where they are going, and why the empire wants every copy of her maps burned.".into();
    let all = crate::themes::themes();
    let theme = all.iter().find(|t| t.style.builtin == "fantasy").unwrap_or(&all[0]);
    crate::themes::apply_theme(&mut b, theme);
    let mut copyright = Section::new(SectionKind::Copyright, "Copyright");
    copyright.text = "All rights reserved. No part of this book may be reproduced without written permission, except for brief quotations in reviews.\nThis is a work of fiction. Names, characters and places are products of the author's imagination.".into();
    let mut dedication = Section::new(SectionKind::Dedication, "Dedication");
    dedication.text = "For the ones who drew the map anyway.".into();
    b.front = vec![
        Section::new(SectionKind::TitlePage, "Title page"),
        copyright,
        dedication,
        Section::new(SectionKind::Contents, "Contents"),
    ];
    let mut c1 = Section::new(SectionKind::Chapter, "The River That Climbed");
    c1.pov = "Iske".into();
    c1.text = "On the morning the Tamsel turned around, Iske Varrow was selling her last good compass for the price of a week's bread.\n\
The fishwives saw it first. A cry went up along the quay at Lowmere, then another, and then the whole market was crowding the river wall to watch the water slow, and stop, and begin, with the patience of something that had made up its mind, to climb.[^lowmere]\n\
It went up the weir steps like a congregation. It went up the tanners' lane and the long hill past the bell tower, carrying leaves and gulls and one astonished rowing boat, and it did not spill a drop.\n\
\"Rivers don't do that,\" said the man holding her compass.\n\
\"No,\" Iske agreed. She took the compass back out of his hand, because she had a feeling she was going to need it. \"They don't.\"\n\
***\n\
By noon there were soldiers on the bridges, and by evening there were notices nailed to every door in the lower town. They were short, and the ink was still wet. *By order of the Ninefold Gate: all charts, maps and surveys of the Saltmarch are to be surrendered for burning.*\n\
Iske read it twice by lamplight. Then she went home, lifted the loose board under her bed, and unrolled the one map she had sworn never to look at again.\n\
[^lowmere]: *Lowmere* is the old marsh tongue for \"the low lake.\" There has been no lake there for three hundred years.".into();
    let mut c2 = Section::new(SectionKind::Chapter, "A Ledger of Names");
    c2.pov = "Iske".into();
    c2.text = "Ten years ago she had drawn every river in the Saltmarch, and the empire had paid her in silver and then in disgrace, because the map was too honest about where the border ran.\n\
She had drawn it carefully. She remembered every line, and the ledger in the case still held the figures:\n\
| River | Charted | Leagues |\n\
|---|:-:|--:|\n\
| Tamsel | spring | 42 |\n\
| Orrin | summer | 17 |\n\
| Lesser Vey | autumn | 9 |\n\
She did not remember the mountain.\n\
It sat at the very top of the sheet where there should have been nothing but salt flats and the blank, polite space a cartographer leaves for what she has not seen. A dark peak, inked in a hand very like her own, and around it, like the spokes of a wheel, every river she had ever charted, all of them bending toward it.\n\
Beneath it, in letters so small she needed her glass to read them, someone had written: *Not yet. Not until the water remembers.*\n\
Outside, in the dark, the Tamsel went on climbing.".into();
    let mut c3 = Section::new(SectionKind::Chapter, "The Warden of the Ninefold Gate");
    c3.pov = "Corran".into();
    c3.text = "Corran Ash had arrested a great many people in his nine years as a warden, and he had never once been offered tea.\n\
\"You're here for the map,\" said the cartographer, pouring. She did not look up. \"Sit down. You'll want to see it before you burn it.\"\n\
\"I'm here for you,\" said Corran, who had rehearsed this on the stairs. \"The map is a separate matter.\"\n\
\"It isn't,\" she said, and turned the sheet toward him, and he saw the mountain, and the rivers bending toward it, and his own name written in the margin in a hand he knew very well, because it was his.".into();
    b.body = vec![c1, c2, c3];
    let mut about = Section::new(SectionKind::AboutAuthor, "About the author");
    about.text = "Imre Calloway lives in a narrow house full of borrowed atlases and has never once returned one on time. This is the first book of the Saltmarch Cycle.".into();
    b.back = vec![about];
    b.world = vec![
        WorldEntry {
            kind: WorldKind::Character,
            name: "Iske Varrow".into(),
            aliases: "Iske, the cartographer".into(),
            summary: "A cartographer disgraced for drawing the border where it really runs.".into(),
            notes: "Keeps every compass she has ever owned. Trusts maps more than people, and is usually right to.".into(),
            ..Default::default()
        },
        WorldEntry {
            kind: WorldKind::Character,
            name: "Corran Ash".into(),
            aliases: "Corran, the warden".into(),
            summary: "A warden of the Ninefold Gate, sent to collect the maps and the woman who drew them.".into(),
            notes: String::new(),
            ..Default::default()
        },
        WorldEntry {
            kind: WorldKind::Place,
            name: "Saltmarch".into(),
            aliases: String::new(),
            summary: "A borderland of salt flats and braided rivers at the edge of the empire.".into(),
            notes: String::new(),
            ..Default::default()
        },
        WorldEntry {
            kind: WorldKind::Place,
            name: "Lowmere".into(),
            aliases: "Tamsel".into(),
            summary: "A river town on the Tamsel, where the water first turns uphill.".into(),
            notes: String::new(),
            ..Default::default()
        },
        WorldEntry {
            kind: WorldKind::Group,
            name: "The Ninefold Gate".into(),
            aliases: "Ninefold".into(),
            summary: "The empire's wardens, who keep its borders and burn its inconvenient maps.".into(),
            notes: String::new(),
            ..Default::default()
        },
    ];
    b.goals.daily_words = 500;
    b
}
