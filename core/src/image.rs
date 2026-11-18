//! Book images: PNG and JPEG files in the book's `images/` folder. Every name is checked before
//! any file is touched, so manuscript text and book details can never reach outside that folder.

use crate::storage;
use std::io::Read;
use std::path::PathBuf;

/// Largest image file that can be added or read (bytes).
pub const MAX_BYTES: u64 = 40 * 1024 * 1024;
/// Largest image that will be measured or decoded (pixels).
pub const MAX_PIXELS: u64 = 50_000_000;

const NOT_IMAGE: &str = "That file isn't a PNG or JPEG image.";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Png,
    Jpeg,
}

impl Kind {
    /// From the file's first bytes, never its name.
    pub fn sniff(head: &[u8]) -> Option<Kind> {
        if head.starts_with(b"\x89PNG\r\n\x1a\n") {
            Some(Kind::Png)
        } else if head.starts_with(&[0xFF, 0xD8, 0xFF]) {
            Some(Kind::Jpeg)
        } else {
            None
        }
    }
    pub fn mime(self) -> &'static str {
        match self {
            Kind::Png => "image/png",
            Kind::Jpeg => "image/jpeg",
        }
    }
    pub fn ext(self) -> &'static str {
        match self {
            Kind::Png => "png",
            Kind::Jpeg => "jpg",
        }
    }
}

/// An image name as markup and book details hold it: 1-100 of `A-Z a-z 0-9 - _ .`, not starting
/// with a dot, no `..`, ending in .png, .jpg or .jpeg.
pub fn valid_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    (1..=100).contains(&name.len())
        && name.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
        && !name.starts_with('.')
        && !name.contains("..")
        && [".png", ".jpg", ".jpeg"].iter().any(|e| lower.ends_with(e))
}

/// The file an image name refers to, when the book id and the name are both valid.
pub fn path(book: &str, name: &str) -> Option<PathBuf> {
    (storage::valid_id(book) && valid_name(name)).then(|| storage::images_dir(book).join(name))
}

fn open(book: &str, name: &str) -> Result<std::fs::File, String> {
    let p = path(book, name).ok_or("That image name isn't valid.")?;
    let f = std::fs::File::open(p).map_err(|_| "That image wasn't found.".to_string())?;
    let m = f.metadata().map_err(|e| e.to_string())?;
    if !m.is_file() {
        return Err("That image wasn't found.".into());
    }
    if m.len() > MAX_BYTES {
        return Err("That image is over 40 MB.".into());
    }
    Ok(f)
}

/// The image's kind from its first bytes; None when it is missing or not a PNG or JPEG.
pub fn kind(book: &str, name: &str) -> Option<Kind> {
    let mut head = [0u8; 8];
    open(book, name).ok()?.read_exact(&mut head).ok()?;
    Kind::sniff(&head)
}

/// The whole file and its kind.
pub fn read(book: &str, name: &str) -> Result<(Kind, Vec<u8>), String> {
    let mut bytes = Vec::new();
    open(book, name)?.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    Ok((Kind::sniff(&bytes).ok_or(NOT_IMAGE)?, bytes))
}

/// Pixel width and height, from the file header alone.
pub fn dims(book: &str, name: &str) -> Result<(u32, u32), String> {
    let (w, h) = header_dims(&mut std::io::BufReader::new(open(book, name)?)).ok_or(NOT_IMAGE)?;
    check_size(w, h)?;
    Ok((w, h))
}

fn check_size(w: u32, h: u32) -> Result<(), String> {
    if w == 0 || h == 0 {
        Err(NOT_IMAGE.into())
    } else if w as u64 * h as u64 > MAX_PIXELS {
        Err("That image is too large (over 50 megapixels).".into())
    } else {
        Ok(())
    }
}

fn take<const N: usize>(r: &mut impl Read) -> Option<[u8; N]> {
    let mut b = [0u8; N];
    r.read_exact(&mut b).ok()?;
    Some(b)
}

/// PNG: the IHDR chunk. JPEG: the first start-of-frame segment, skipping the ones before it.
fn header_dims(r: &mut impl Read) -> Option<(u32, u32)> {
    let be = |b: &[u8]| b.iter().fold(0u32, |n, x| n << 8 | *x as u32);
    let head: [u8; 3] = take(r)?;
    if head != [0xFF, 0xD8, 0xFF] {
        let rest: [u8; 21] = take(r)?;
        let b: Vec<u8> = head.iter().chain(&rest).copied().collect();
        return (Kind::sniff(&b) == Some(Kind::Png) && &b[12..16] == b"IHDR").then(|| (be(&b[16..20]), be(&b[20..24])));
    }
    loop {
        // the marker's 0xFF has been read; more 0xFF bytes are padding
        let mut m = take::<1>(r)?[0];
        while m == 0xFF {
            m = take::<1>(r)?[0];
        }
        match m {
            0x01 | 0xD0..=0xD8 => {}
            0xD9 | 0xDA => return None,
            _ => {
                let len = be(&take::<2>(r)?) as u64;
                if (0xC0..=0xCF).contains(&m) && !matches!(m, 0xC4 | 0xC8 | 0xCC) {
                    let f: [u8; 5] = take(r)?;
                    return Some((be(&f[3..5]), be(&f[1..3])));
                }
                let skip = len.checked_sub(2)?;
                if std::io::copy(&mut r.by_ref().take(skip), &mut std::io::sink()).ok()? != skip {
                    return None;
                }
            }
        }
        if take::<1>(r)?[0] != 0xFF {
            return None;
        }
    }
}

/// Decoded pixels, 8 bits a sample, rows top to bottom: grey (1 channel) or RGB (3), with any
/// transparency kept apart in `alpha` (one byte a pixel), None when the image is opaque.
pub struct Raster {
    pub w: u32,
    pub h: u32,
    pub channels: u8,
    pub pixels: Vec<u8>,
    pub alpha: Option<Vec<u8>>,
}

pub fn decode(bytes: &[u8]) -> Result<Raster, String> {
    match Kind::sniff(bytes) {
        Some(Kind::Png) => decode_png(bytes),
        Some(Kind::Jpeg) => decode_jpeg(bytes),
        None => Err(NOT_IMAGE.into()),
    }
}

fn unreadable(e: impl std::fmt::Display) -> String {
    format!("That image couldn't be read: {e}")
}

fn decode_png(bytes: &[u8]) -> Result<Raster, String> {
    let mut d = png::Decoder::new_with_limits(std::io::Cursor::new(bytes), png::Limits { bytes: (MAX_PIXELS * 4) as usize });
    d.set_transformations(png::Transformations::normalize_to_color8());
    let mut r = d.read_info().map_err(unreadable)?;
    check_size(r.info().width, r.info().height)?;
    let mut buf = vec![0; r.output_buffer_size().ok_or(NOT_IMAGE)?];
    let info = r.next_frame(&mut buf).map_err(unreadable)?;
    buf.truncate(info.buffer_size());
    let (channels, alpha) = match info.color_type {
        png::ColorType::Grayscale => (1, false),
        png::ColorType::GrayscaleAlpha => (1, true),
        png::ColorType::Rgb => (3, false),
        png::ColorType::Rgba => (3, true),
        png::ColorType::Indexed => return Err(unreadable("unexpected palette")),
    };
    if !alpha {
        return Ok(Raster { w: info.width, h: info.height, channels, pixels: buf, alpha: None });
    }
    let n = channels as usize;
    let mut pixels = Vec::with_capacity(buf.len() / (n + 1) * n);
    let mut a = Vec::with_capacity(buf.len() / (n + 1));
    for px in buf.chunks_exact(n + 1) {
        pixels.extend_from_slice(&px[..n]);
        a.push(px[n]);
    }
    let alpha = a.iter().any(|v| *v != 255).then_some(a);
    Ok(Raster { w: info.width, h: info.height, channels, pixels, alpha })
}

/// Always RGB: grey and CMYK JPEGs are converted by the decoder.
fn decode_jpeg(bytes: &[u8]) -> Result<Raster, String> {
    let mut d = zune_jpeg::JpegDecoder::new(std::io::Cursor::new(bytes));
    d.decode_headers().map_err(unreadable)?;
    let info = d.info().ok_or(NOT_IMAGE)?;
    let (w, h) = (info.width as u32, info.height as u32);
    check_size(w, h)?;
    let pixels = d.decode().map_err(unreadable)?;
    Ok(Raster { w, h, channels: 3, pixels, alpha: None })
}

/// A `data:` URI holding the file, for the studio (its pages load images only inline).
pub fn data_uri(kind: Kind, bytes: &[u8]) -> String {
    const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = format!("data:{};base64,", kind.mime());
    s.reserve(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            s.push(if i <= c.len() { B64[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    s
}

/// A PNG of a colour gradient, `alpha` making its right half see-through (for tests).
#[cfg(test)]
pub(crate) fn test_png(w: u32, h: u32, alpha: bool) -> Vec<u8> {
    let mut out = Vec::new();
    let mut e = png::Encoder::new(&mut out, w, h);
    e.set_color(if alpha { png::ColorType::Rgba } else { png::ColorType::Rgb });
    let mut px = Vec::new();
    for y in 0..h {
        for x in 0..w {
            px.extend_from_slice(&[(x % 256) as u8, (y % 256) as u8, 128]);
            if alpha {
                px.push(if x < w / 2 { 255 } else { 80 });
            }
        }
    }
    let mut wr = e.write_header().unwrap();
    wr.write_image_data(&px).unwrap();
    wr.finish().unwrap();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const JPG: &[u8] = include_bytes!("../tests/tiny.jpg");

    #[test]
    fn names() {
        for ok in ["a.png", "Photo_2-1.jpg", "x.JPEG", "a.b.png"] {
            assert!(valid_name(ok), "{ok}");
        }
        for bad in ["", ".png", "../a.png", "a/b.png", "a\\b.png", "a..png", "a.gif", "a.png.txt", "a b.png", "book.json", "é.png", &format!("{}.png", "x".repeat(100))] {
            assert!(!valid_name(bad), "{bad}");
        }
        assert!(path("bad id", "a.png").is_none() && path("ok-id", "../a.png").is_none());
        assert!(path("ok-id", "a.png").unwrap().starts_with(storage::images_dir("ok-id")));
    }

    #[test]
    fn headers_match_the_decoders() {
        let png = test_png(7, 5, true);
        assert_eq!(header_dims(&mut &png[..]), Some((7, 5)));
        let r = decode(&png).unwrap();
        assert_eq!((r.w, r.h, r.channels, r.pixels.len()), (7, 5, 3, 7 * 5 * 3));
        assert_eq!(r.alpha.as_ref().unwrap()[..4], [255, 255, 255, 80]);
        assert!(decode(&test_png(3, 3, false)).unwrap().alpha.is_none());
        // the JPEG has an Exif segment before its frame header
        assert_eq!(header_dims(&mut &JPG[..]), Some((40, 30)));
        let r = decode(JPG).unwrap();
        assert_eq!((r.w, r.h, r.channels, r.pixels.len()), (40, 30, 3, 40 * 30 * 3));
        assert!(decode(b"GIF89a").is_err() && header_dims(&mut &b"\xFF\xD8\xFF\xD9"[..]).is_none());
        assert!(decode(&png[..png.len() / 2]).is_err() && decode(&JPG[..200]).is_err());
    }

    #[test]
    fn base64() {
        assert_eq!(data_uri(Kind::Png, b"Man"), "data:image/png;base64,TWFu");
        assert_eq!(data_uri(Kind::Jpeg, b"Ma"), "data:image/jpeg;base64,TWE=");
        assert_eq!(data_uri(Kind::Png, b"M"), "data:image/png;base64,TQ==");
    }
}
