#!/bin/sh
# xmr-bridge installer for the wallet host.
#
#   curl -fsSL <release host>/install.sh | sh -s -- --site https://your-site.example --pair <one-time code>
#
# (The site's admin page shows the same command with a wget fallback, for machines without curl.) It downloads the xmr-bridge program for this machine's CPU, checks it against the SHA-256 written into this file
# for this release, and runs `xmr-bridge install` with sudo. That program asks for the shop wallet's address and
# private view key on the terminal (never on the command line), checks this machine isn't serving the site, sets up
# a background service and pairs with the site. The cautious path does the same by hand: download xmr-bridge,
# check it, run `sudo ./xmr-bridge install --site ... --pair ...`.
#
# The build fills in the four values below; the copy in the repository is a template and refuses to run.
set -eu

RELEASE_BASE="__RELEASE_BASE__"
VERSION="__VERSION__"
SHA256_AMD64="__SHA256_AMD64__"
SHA256_ARM64="__SHA256_ARM64__"
CURL_PROTO="__CURL_PROTO__"

fail() {
	printf 'xmr-bridge installer: %s\n' "$*" >&2
	exit 1
}

case "$RELEASE_BASE$VERSION$CURL_PROTO" in
*__*) fail "this install.sh is a template; use the one from a release" ;;
esac
[ "$(uname -s)" = "Linux" ] || fail "the wallet host runs on Linux only"
case "$(uname -m)" in
x86_64 | amd64) arch=amd64 sum=$SHA256_AMD64 ;;
aarch64 | arm64) arch=arm64 sum=$SHA256_ARM64 ;;
*) fail "no xmr-bridge for this CPU ($(uname -m)); x86-64 and 64-bit ARM are supported" ;;
esac
if command -v curl >/dev/null 2>&1; then
	fetch=curl
elif command -v wget >/dev/null 2>&1; then
	fetch=wget
else
	fail "this needs curl or wget. Install one (on Debian or Ubuntu: sudo apt install curl), then paste the install command again"
fi
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is needed (coreutils)"
if [ "$(id -u)" -eq 0 ]; then
	as_root=""
else
	command -v sudo >/dev/null 2>&1 || fail "run this as root, or install sudo"
	as_root="sudo"
fi

# A folder for the download; /tmp may forbid running programs, so fall back to the home folder.
dir=$(mktemp -d "${TMPDIR:-/tmp}/xmr-bridge.XXXXXX")
trap 'rm -rf "$dir"' EXIT INT TERM
bin="$dir/xmr-bridge"

printf 'Downloading xmr-bridge %s for %s...\n' "$VERSION" "$arch"
url="$RELEASE_BASE/xmr-bridge-$VERSION-linux-$arch"
if [ "$fetch" = curl ]; then
	curl -fsSL --proto "$CURL_PROTO" -o "$bin" "$url" || fail "the download failed"
else
	# wget can't limit the protocol a redirect goes to (curl's --proto), so it follows none: the release URL keeps the
	# protocol the build allows. The checksum below is the same either way.
	wget -q --max-redirect=0 -O "$bin" "$url" || fail "the download failed"
fi
got=$(sha256sum "$bin" | cut -d ' ' -f 1)
[ "$got" = "$sum" ] || fail "the download doesn't match this release's checksum; nothing was installed"
chmod 755 "$bin"
if ! "$bin" version >/dev/null 2>&1; then
	home_dir=$(mktemp -d "$HOME/.xmr-bridge.XXXXXX") || fail "can't run the download from ${TMPDIR:-/tmp}"
	cp "$bin" "$home_dir/xmr-bridge" || fail "can't run the download from ${TMPDIR:-/tmp}"
	rm -rf "$dir"
	dir=$home_dir
	bin="$dir/xmr-bridge"
	"$bin" version >/dev/null 2>&1 || fail "the downloaded program doesn't run on this machine"
fi
printf 'Checked: SHA-256 matches this release. Starting the installer%s...\n' "${as_root:+ (sudo may ask for your password)}"

# Spec change 46 (T29): the pairing code goes to the installer on stdin, as "--pair -", so it isn't on the installer's
# command line where other processes on this machine could read it while the install runs. It's still in this
# script's own arguments and the shell's history (single use, 15 minutes).
code=""
n=$#
while [ "$n" -gt 0 ]; do
	a=$1
	shift
	n=$((n - 1))
	case "$a" in
	--pair | -pair)
		if [ "$n" -gt 0 ]; then
			code=$1
			shift
			n=$((n - 1))
			set -- "$@" --pair -
		else
			set -- "$@" "$a"
		fi
		;;
	--pair=* | -pair=*)
		code=${a#*=}
		set -- "$@" --pair -
		;;
	*) set -- "$@" "$a" ;;
	esac
done

# The installer reads its questions from the terminal itself, so this works when the script is piped from curl.
if [ -n "$code" ]; then
	printf '%s\n' "$code" | $as_root "$bin" install "$@"
elif (: </dev/tty) 2>/dev/null; then
	$as_root "$bin" install "$@" </dev/tty
else
	$as_root "$bin" install "$@"
fi
