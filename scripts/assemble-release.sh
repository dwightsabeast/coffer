#!/bin/sh
# Assembles a wallet-host release folder around two xmr-bridge binaries that are already built (phase 09, Part C):
# install.sh filled from installer/install.sh, the unsigned release.json and SHA256SUMS. The same code makes dev
# releases (scripts/build-dev-release.sh) and real ones (.github/workflows/bridge-release.yml), so both have the
# same layout byte for byte. Signing comes after, never here: release.json.sig is Wyatt's (offline key for a real
# release, scripts/sign-dev-release.sh for a dev one).
#
#   scripts/assemble-release.sh <out> <version> <base> <curl-proto> [<date>]
#   <out>         folder holding xmr-bridge-<version>-linux-amd64 and -arm64; the three files are written there
#   <version>     x.y.z, or x.y.z-<suffix> for a dev build
#   <base>        where install.sh downloads the binaries from: http(s)://<host>[:<port>][/<path>], no trailing slash
#                 (a real release: https://get.coffer.party/<version>)
#   <curl-proto>  install.sh's curl --proto: =https for a real release, =http,https for a dev one
#   <date>        release.json's date, YYYY-MM-DDTHH:MM:SSZ (default: now, UTC)
set -eu

[ $# -eq 4 ] || [ $# -eq 5 ] || { echo "usage: $0 <out> <version> <base> <curl-proto> [<date>]" >&2; exit 2; }
out=$1 version=$2 base=$3 proto=$4
date=${5:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
repo=$(cd "$(dirname "$0")/.." && pwd)

# Each value is pasted into sed, install.sh and release.json, so each is held to a charset with no quote, backslash,
# '|' or '&'.
printf '%s' "$version" | grep -Eqx '[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?' || { echo "version '$version' isn't x.y.z[-suffix]" >&2; exit 2; }
printf '%s' "$base" | grep -Eqx 'https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._-]+)*' ||
	{ echo "base '$base' isn't http(s)://<host>[:<port>][/<path>] with no trailing slash" >&2; exit 2; }
case "$proto" in =https | =http,https) ;; *) echo "curl-proto is =https or =http,https" >&2; exit 2 ;; esac
case "$proto:$base" in =https:http:*) echo "an http base needs curl-proto =http,https" >&2; exit 2 ;; esac
printf '%s' "$date" | grep -Eqx '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' || { echo "date '$date' isn't YYYY-MM-DDTHH:MM:SSZ" >&2; exit 2; }

a="$out/xmr-bridge-$version-linux-amd64"
r="$out/xmr-bridge-$version-linux-arm64"
for f in "$a" "$r"; do [ -f "$f" ] || { echo "no $f" >&2; exit 1; }; done

sum() { sha256sum "$1" | cut -d ' ' -f 1; }
size() { wc -c <"$1" | tr -d ' '; }
sed -e "s|__RELEASE_BASE__|$base|" -e "s|__VERSION__|$version|" -e "s|__SHA256_AMD64__|$(sum "$a")|" \
	-e "s|__SHA256_ARM64__|$(sum "$r")|" -e "s|__CURL_PROTO__|$proto|" "$repo/installer/install.sh" >"$out/install.sh"
if grep -q '__[A-Z0-9_]*__' "$out/install.sh"; then echo "a placeholder was left in install.sh" >&2; exit 1; fi
printf '{"product":"xmr-bridge","version":"%s","date":"%s","files":[{"name":"%s","os":"linux","arch":"amd64","sha256":"%s","size":%s},{"name":"%s","os":"linux","arch":"arm64","sha256":"%s","size":%s}]}\n' \
	"$version" "$date" "$(basename "$a")" "$(sum "$a")" "$(size "$a")" "$(basename "$r")" "$(sum "$r")" "$(size "$r")" >"$out/release.json"
(cd "$out" && sha256sum "$(basename "$a")" "$(basename "$r")" install.sh release.json >SHA256SUMS)
