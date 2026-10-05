#!/bin/sh
# usage: vps-publish.sh upload <build dir> (goes to staging) | promote (staging to stable, what installs actually use)
set -eu

HOST=streamflix-deploy@207.180.196.99
KEY=${VPS_KEY:-$HOME/.ssh/streamflix_deploy}
SSH="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes"

case "${1:-}" in
  upload)
    cd "${2:?build dir missing}"
    # globs not ls, blockmaps and the rest of electron-builder's output dont belong on the feed
    files=""
    for f in StreamFlix-*.exe StreamFlix-*.dmg StreamFlix-*.zip StreamFlix-*.AppImage StreamFlix-*.deb updates*.yml; do
      [ -f "$f" ] && files="$files $f"
    done
    [ -n "$files" ] || { echo "nothing to upload in $(pwd)" >&2; exit 1; }
    echo "uploading to staging:$files"
    tar -cf - $files | $SSH "$HOST" upload
    ;;
  promote)
    $SSH "$HOST" promote
    ;;
  *)
    echo "usage: $0 upload <dir> | promote" >&2
    exit 1
    ;;
esac
