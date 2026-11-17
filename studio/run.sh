#!/bin/sh
# Run the Tauri CLI (`./run.sh dev`, `./run.sh build`). Uses the project's private Rust
# toolchain in ../.tools when it exists, otherwise the cargo on PATH (install via rustup).
cd "$(dirname "$0")" || exit 1
APP="$(cd .. && pwd)"
if [ -x "$APP/.tools/cargo/bin/cargo" ]; then
  export RUSTUP_HOME="$APP/.tools/rustup" CARGO_HOME="$APP/.tools/cargo" PATH="$APP/.tools/cargo/bin:$PATH"
fi
exec npx tauri "$@"
