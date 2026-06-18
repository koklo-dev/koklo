#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

desktop_dir="${HOME}/.local/share/applications"
desktop_file="${desktop_dir}/koklo-dev.desktop"
icon_path="${repo_root}/apps/desktop/src-tauri/icons/icon.png"
exec_path="bash -lc 'cd \"${repo_root}/apps/desktop\" && pnpm desktop'"
wm_class="${1:-dev.koklo.app}"

mkdir -p "${desktop_dir}"

cat > "${desktop_file}" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Koklo Dev
Comment=Launch Koklo desktop in Tauri dev mode
Exec=${exec_path}
Path=${repo_root}/apps/desktop
Terminal=false
Icon=${icon_path}
Categories=Development;
StartupNotify=true
StartupWMClass=${wm_class}
EOF

chmod 644 "${desktop_file}"

printf 'Installed %s\n' "${desktop_file}"
printf 'StartupWMClass=%s\n' "${wm_class}"
printf 'Launch it from the app grid as "Koklo Dev".\n'
printf 'If Ubuntu still shows a generic icon, rerun with: %s koklo-desktop\n' "$0"
