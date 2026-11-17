use bookbinder_core::api::Api;
use std::sync::Arc;

/// The one bridge to the core: every studio request is `call(cmd, args)`.
#[tauri::command]
async fn call(cmd: String, args: serde_json::Value, state: tauri::State<'_, Arc<Api>>) -> Result<serde_json::Value, String> {
    let api = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || api.call(&cmd, args)).await.map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(Api::new()))
        .invoke_handler(tauri::generate_handler![call])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
