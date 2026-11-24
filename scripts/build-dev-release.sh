#!/bin/sh
# Builds a development release of the wallet host (phase 03, sessions 3f-2 and 3g): xmr-bridge for linux/amd64 and
# linux/arm64 with the devrelease build tag (the dev public key and the loopback release address set at build time),
# an install.sh filled with their SHA-256s, and an unsigned release.json for Wyatt to sign
# (scripts/sign-dev-release.sh), the last three through scripts/assemble-release.sh. Stagenet testing only; real
# releases (https, the real key) come from CI (.github/workflows/bridge-release.yml).
#
#   scripts/build-dev-release.sh [--version <x.y.z[-suffix]>] [--break crash|badsig] [--base http://<address>:<port>]
#   serve:  tmux new -d -s release 'cd ~/xmr-pay-dev-data/dev-release && python3 -m http.server 8099 --bind 127.0.0.1'
#   --base: where the wallet host fetches the release (default loopback). Phase 05's setup test serves it on the dev
#   box's LAN address so a second machine can install; serve with --bind set to that address then.
#   install (Wyatt): curl -fsSL http://127.0.0.1:8099/install.sh | sh -s -- --site <site> --pair <code> --allow-same-machine
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
out="$HOME/xmr-pay-dev-data/dev-release"
pubfile="$HOME/xmr-pay-dev-data/dev-release.pub"
base="http://127.0.0.1:8099"
version=""
breakmode=""
while [ $# -gt 0 ]; do
	case "$1" in
	--version) version=$2; shift 2 ;;
	--break) breakmode=$2; shift 2 ;;
	--base) base=$2; shift 2 ;;
	*) echo "usage: $0 [--version x.y.z] [--break crash|badsig] [--base http://<address>:<port>]" >&2; exit 2 ;;
	esac
done
case "$breakmode" in "" | crash | badsig) ;; *) echo "--break is crash or badsig" >&2; exit 2 ;; esac
# A scheme, a host and an optional port, nothing after: it's pasted into sed, install.sh and the bridge's build flags.
if ! printf '%s' "$base" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then echo "--base is http(s)://<address>[:<port>], no path or trailing slash" >&2; exit 2; fi
[ -f "$pubfile" ] || { echo "no $pubfile: Wyatt runs scripts/dev-release-key.sh first" >&2; exit 1; }
pub=$(tr -d '\n' <"$pubfile")
sha=$(git -C "$repo" rev-parse --short HEAD)
[ -n "$version" ] || version="0.0.$(date -u +%Y%m%d%H%M)-dev.$sha"
if ! git -C "$repo" diff --quiet -- bridge installer; then version="$version.dirty"; fi

rm -rf "$out"
mkdir -p "$out"
for arch in amd64 arm64; do
	(cd "$repo/bridge" && GOTOOLCHAIN=local CGO_ENABLED=0 GOOS=linux GOARCH=$arch go build -trimpath -tags devrelease \
		-ldflags "-X main.version=$version -X main.devReleaseKey=$pub -X main.devReleaseURL=$base -X main.devBreak=$breakmode" \
		-o "$out/xmr-bridge-$version-linux-$arch" ./cmd/xmr-bridge)
done
# install.sh, release.json and SHA256SUMS: the same script real releases use (bridge-release.yml), so both match.
"$repo/scripts/assemble-release.sh" "$out" "$version" "$base" "=http,https"
echo "dev release $version${breakmode:+ (deliberately broken: $breakmode)} in $out; release.json is unsigned until Wyatt runs scripts/sign-dev-release.sh"
