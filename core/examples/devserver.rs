//! Dev bridge for the studio in a plain browser: POST /call {cmd, args} -> JSON.
//! `cargo run --example devserver` (set BOOKBINDER_DATA_DIR to keep it off the real library).

use bookbinder_core::api::Api;
use std::sync::Arc;
use tiny_http::{Header, Method, Request, Response, Server};

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

/// Only the Vite dev UI may call in. Any other web page the developer visits is refused, because
/// the API reads and writes local files (`book_import`, `copy_file`). Requests with no Origin
/// (curl, scripts) come from local processes, which can already touch those files.
const ALLOWED_ORIGINS: [&str; 2] = ["http://localhost:1420", "http://127.0.0.1:1420"];

fn handle(api: &Api, mut req: Request) {
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
        let _ = std::io::Read::read_to_string(req.as_reader(), &mut s);
        match serde_json::from_str::<serde_json::Value>(&s) {
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
    };
    let _ = req.respond(cors(Response::from_string(body.to_string()).with_status_code(code).with_header(header("Content-Type", "application/json"))));
}

fn main() {
    let api = Arc::new(Api::new());
    let server = Arc::new(Server::http("127.0.0.1:1421").expect("port 1421 is busy"));
    println!("devserver on http://127.0.0.1:1421/call, data in {}", bookbinder_core::storage::app_dir().display());
    let workers: Vec<_> = (0..4)
        .map(|_| {
            let (api, server) = (api.clone(), server.clone());
            std::thread::spawn(move || {
                for req in server.incoming_requests() {
                    handle(&api, req);
                }
            })
        })
        .collect();
    for w in workers {
        let _ = w.join();
    }
}
