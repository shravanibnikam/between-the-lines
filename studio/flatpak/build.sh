#!/bin/sh
# Package an already built app (./run.sh build) as a Flatpak bundle. Packaging is only copying
# files into /app, so this needs `flatpak` and the GNOME runtime below: no flatpak-builder, no SDK.
#   studio/flatpak/build.sh [binary] [out.flatpak]
# Install the result with `flatpak install --user <out.flatpak>`.
set -eu
ID=app.betweenthelines.studio
RUNTIME=org.gnome.Platform
BRANCH=51 # ships WebKitGTK 4.1, the web view Tauri uses
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
bin=${1:-$root/target/release/bookbinder-studio}
out=${2:-$root/target/release/bundle/flatpak/between-the-lines.flatpak}
icons=$root/studio/src-tauri/icons
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

app=$work/app
flatpak build-init "$app" "$ID" "$RUNTIME" "$RUNTIME" "$BRANCH"
install -Dm755 "$bin" "$app/files/bin/bookbinder-studio"
install -Dm644 "$here/$ID.desktop" "$app/files/share/applications/$ID.desktop"
install -Dm644 "$here/$ID.metainfo.xml" "$app/files/share/metainfo/$ID.metainfo.xml"
for icon in 32x32:32x32.png 128x128:128x128.png 256x256:128x128@2x.png 512x512:icon.png; do
  install -Dm644 "$icons/${icon#*:}" "$app/files/share/icons/hicolor/${icon%%:*}/apps/$ID.png"
done
# No network: the app never goes online. Home is readable so a manuscript dropped on the window
# can be opened (file dialogs go through the desktop portal). The library is the same folder the
# other packages use (core storage::app_dir).
flatpak build-finish "$app" --command=bookbinder-studio \
  --share=ipc --socket=wayland --socket=fallback-x11 --device=dri --socket=pulseaudio \
  --filesystem=home:ro --filesystem="~/.local/share/Between the Lines:create" \
  --talk-name=org.freedesktop.FileManager1
flatpak build-export "$work/repo" "$app"
mkdir -p "$(dirname "$out")"
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo "$work/repo" "$out" "$ID"
echo "$out"
