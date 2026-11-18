use bookbinder_core::api::Api;
use std::sync::Arc;

/// The one bridge to the core: every studio request is `call(cmd, args)`.
#[tauri::command]
async fn call(cmd: String, args: serde_json::Value, state: tauri::State<'_, Arc<Api>>) -> Result<serde_json::Value, String> {
    let api = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || api.call(&cmd, args)).await.map_err(|e| e.to_string())?
}

/// The window only ever shows the app's own pages: `tauri://localhost` (macOS, Linux),
/// `http(s)://tauri.localhost` (Windows), or the Vite server during `tauri dev`.
fn own_page(url: &tauri::Url) -> bool {
    url.scheme() == "tauri"
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
        || (cfg!(dev) && url.scheme() == "http" && url.host_str() == Some("localhost") && url.port() == Some(1420))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard").on_navigation(|_, url| own_page(url)).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(Api::new()))
        .invoke_handler(tauri::generate_handler![call])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
