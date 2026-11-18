//! Dev bridge for the studio in a plain browser: POST /call {cmd, args} -> JSON.
//! `cargo run --example devserver` (set BOOKBINDER_DATA_DIR to keep it off the real library).
//! Every call must carry the per-run token (`BOOKBINDER_DEV_TOKEN`, or a random one printed at start).

use bookbinder_core::api::Api;
use std::io::Read;
use std::sync::Arc;
use tiny_http::{Header, Method, Request, Response, Server};

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

/// Only the Vite dev UI may call in. Any other web page the developer visits is refused, because
/// the API reads and writes local files (`book_import`, `copy_file`). Requests with no Origin
/// (curl, scripts) come from local processes, which can already touch those files.
const ALLOWED_ORIGINS: [&str; 2] = ["http://localhost:1420", "http://127.0.0.1:1420"];

/// Only these Host values are served, so a page that rebinds its DNS name to 127.0.0.1 is refused.
const ALLOWED_HOSTS: [&str; 2] = ["127.0.0.1:1421", "localhost:1421"];

/// Largest request body (a book with images can be several MB).
const MAX_BODY: u64 = 64 << 20;

fn handle(api: &Api, token: &str, mut req: Request) {
    let host = req.headers().iter().find(|h| h.field.equiv("Host")).map(|h| h.value.as_str().to_owned());
    if !host.as_deref().is_some_and(|h| ALLOWED_HOSTS.contains(&h)) {
        let _ = req.respond(Response::from_string("Forbidden host").with_status_code(403));
        return;
    }
    let origin = req.headers().iter().find(|h| h.field.equiv("Origin")).map(|h| h.value.as_str().to_owned());
    if origin.as_deref().is_some_and(|o| !ALLOWED_ORIGINS.contains(&o)) {
        let _ = req.respond(Response::from_string("Forbidden origin").with_status_code(403));
        return;
    }
    let allow = origin.unwrap_or_else(|| ALLOWED_ORIGINS[0].into());
    let cors = |r: Response<std::io::Cursor<Vec<u8>>>| {
        r.with_header(header("Access-Control-Allow-Origin", &allow))
            .with_header(header("Vary", "Origin"))
            .with_header(header("Access-Control-Allow-Headers", "content-type"))
            .with_header(header("Access-Control-Allow-Methods", "POST, OPTIONS"))
    };
    if *req.method() == Method::Options {
        let _ = req.respond(cors(Response::from_data(Vec::new()).with_status_code(204)));
        return;
    }
    let (code, body) = if *req.method() != Method::Post || req.url() != "/call" {
        (404, serde_json::json!("Not found"))
    } else {
        let mut s = String::new();
        let _ = req.as_reader().take(MAX_BODY + 1).read_to_string(&mut s);
        if s.len() as u64 > MAX_BODY {
            (413, serde_json::json!("Request too large"))
        } else {
            match serde_json::from_str::<serde_json::Value>(&s) {
                Ok(v) if v.get("token").and_then(|t| t.as_str()) != Some(token) => (403, serde_json::json!("Bad token")),
                Ok(v) => {
                    let cmd = v.get("cmd").and_then(|c| c.as_str()).unwrap_or("");
                    let args = v.get("args").cloned().unwrap_or(serde_json::json!({}));
                    match api.call(cmd, args) {
                        Ok(r) => (200, r),
                        Err(e) => (400, serde_json::json!(e)),
                    }
                }
                Err(e) => (400, serde_json::json!(format!("Bad request: {e}"))),
            }
        }
    };
    let _ = req.respond(cors(Response::from_string(body.to_string()).with_status_code(code).with_header(header("Content-Type", "application/json"))));
}

/// Per-run secret; random enough for a dev tool (std's per-instance random hash keys).
fn make_token() -> String {
    use std::hash::{BuildHasher, Hasher};
    let h = || std::collections::hash_map::RandomState::new().build_hasher().finish();
    format!("{:016x}{:016x}", h(), h())
}

fn main() {
    let token: Arc<str> = match std::env::var("BOOKBINDER_DEV_TOKEN") {
        Ok(t) if !t.is_empty() => t.into(),
        _ => make_token().into(),
    };
    let api = Arc::new(Api::new());
    let server = Arc::new(Server::http("127.0.0.1:1421").expect("port 1421 is busy"));
    println!("devserver on http://127.0.0.1:1421/call, data in {}", bookbinder_core::storage::app_dir().display());
    println!("open the studio at http://localhost:1420/#dev_token={token}");
    let workers: Vec<_> = (0..4)
        .map(|_| {
            let (api, server, token) = (api.clone(), server.clone(), token.clone());
            std::thread::spawn(move || {
                for req in server.incoming_requests() {
                    handle(&api, &token, req);
                }
            })
        })
        .collect();
    for w in workers {
        let _ = w.join();
    }
}
