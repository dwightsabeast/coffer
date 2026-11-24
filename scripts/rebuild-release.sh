#!/bin/sh
# Wyatt's matching rebuild of a bridge release (phase 09, Part C step 5; T37), on the dev box, no sudo. Run it after
# bridge-release.yml has built the xmr-bridge@<version> tag and before anything is signed or uploaded:
#
#   scripts/rebuild-release.sh <version> <full commit sha> <CI artifact folder>
#
# The artifact folder is CI's "xmr-bridge-<version>" artifact, downloaded in the browser and unzipped. The script:
# 1. clones https://github.com/dwightsabeast/coffer.git fresh into a temporary folder, and checks that the tag
#    xmr-bridge@<version> is the commit given and that main is that commit;
# 2. checks Go is bridge/go.mod's exact version on linux/amd64, as CI's runner;
# 3. builds both binaries with that commit's own scripts/release-build.sh (the flags CI used);
# 4. checks the artifact holds exactly the six release files, that each binary is byte-for-byte the rebuild, and
#    that SHA256SUMS and release.json list the rebuilt sha256 (and size);
# 5. runs that commit's scripts/assemble-release.sh on the rebuilt binaries with CI's release date, and checks
#    install.sh, release.json and SHA256SUMS come out byte-for-byte the same;
# 6. checks coffer-release.pub.pem is the commit's own and has release key 1's fingerprint.
# PASS/FAIL lines go to the terminal and to ~/xmr-pay-dev-data/release-<version>/rebuild-output.txt; exit 0 only with
# no FAIL. Nothing is signed or uploaded until every line is PASS (Wyatt, 2026-11-23).
# REBUILD_REPO_URL is for the script's tests only: any other repository is reported as a FAIL.
set -u

usage() { echo "usage: $0 <version x.y.z> <full commit sha> <CI artifact folder>" >&2; exit 2; }
[ $# -eq 3 ] || usage
version=$1 commit=$2 art=$3
printf '%s' "$version" | grep -Eqx '[0-9]+\.[0-9]+\.[0-9]+' || { echo "version '$version' isn't x.y.z" >&2; exit 2; }
printf '%s' "$commit" | grep -Eqx '[0-9a-f]{40}' || { echo "commit '$commit' isn't a full 40-character sha" >&2; exit 2; }
[ -d "$art" ] || { echo "the artifact folder '$art' doesn't exist" >&2; exit 2; }
art=$(cd "$art" && pwd -P)

github=https://github.com/dwightsabeast/coffer.git
url=${REBUILD_REPO_URL:-$github}
key1=531183cd4dea6af723656e2196aa6826a7d2c3dc0d9877bfb92b7887e16c3192 # release key 1's DER SHA-256 (docs/install.md)
amd64=xmr-bridge-$version-linux-amd64
arm64=xmr-bridge-$version-linux-arm64

dir="$HOME/xmr-pay-dev-data/release-$version"
mkdir -p "$dir"
out="$dir/rebuild-output.txt"
: >"$out"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT TERM
fails=0
say() { printf '%s\n' "$*" | tee -a "$out"; }
pass() { say "[$1] PASS $2"; }
fail() { say "[$1] FAIL $2"; fails=$((fails + 1)); }
finish() { say ""; say "done: $fails FAIL"; [ "$fails" -eq 0 ] || exit 1; exit 0; }
sum() { sha256sum "$1" | cut -d ' ' -f 1; }

say "rebuild check of xmr-bridge $version at $commit, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "artifact: $art"
say ""

# 1. The source: a fresh clone, the tag and main.
if [ "$url" = "$github" ]; then pass CLONE "cloned $github"; else fail CLONE "not the GitHub repository: $url"; fi
if ! git clone -q --no-checkout "$url" "$work/src" 2>>"$out"; then fail CLONE "git clone failed"; finish; fi
tagc=$(git -C "$work/src" rev-parse -q --verify "refs/tags/xmr-bridge@$version^{commit}" 2>/dev/null) || tagc=""
if [ -z "$tagc" ]; then fail TAG "no tag xmr-bridge@$version"; finish; fi
[ "$tagc" = "$commit" ] && pass TAG "xmr-bridge@$version is $tagc" || fail TAG "xmr-bridge@$version is $tagc, not $commit"
mainc=$(git -C "$work/src" rev-parse -q --verify refs/remotes/origin/main 2>/dev/null) || mainc=""
[ "$mainc" = "$tagc" ] && pass MAIN "main is the tagged commit" || fail MAIN "main is ${mainc:-missing}, not the tagged commit"
if ! git -C "$work/src" checkout -q --detach "$commit" 2>>"$out"; then fail CLONE "no commit $commit in the clone"; finish; fi

# 2. Go: go.mod's exact version on the same host as CI's runner (linux/amd64; arm64 is cross-built on both).
want="go$(sed -n 's/^go \([0-9][0-9.]*\)$/\1/p' "$work/src/bridge/go.mod")"
have=$(go version 2>&1)
if [ "$have" = "go version $want linux/amd64" ]; then pass GO "$want linux/amd64, as bridge/go.mod says"; else fail GO "$have; bridge/go.mod wants $want on linux/amd64"; finish; fi

# 3. The build, with the commit's own build script.
if sh "$work/src/scripts/release-build.sh" "$version" "$work/out" >"$dir/rebuild-go-version-m.txt" 2>&1; then
	pass BUILD "both binaries built by the commit's scripts/release-build.sh (go version -m in rebuild-go-version-m.txt)"
else
	fail BUILD "scripts/release-build.sh failed: $(tail -n 1 "$dir/rebuild-go-version-m.txt")"
	finish
fi

# 4. The artifact: exactly the six files, each binary the rebuild's bytes, the listings naming the rebuild.
expected="SHA256SUMS
coffer-release.pub.pem
install.sh
release.json
$amd64
$arm64"
have_files=$(ls -A "$art" | LC_ALL=C sort)
want_files=$(printf '%s\n' "$expected" | LC_ALL=C sort)
if [ "$have_files" = "$want_files" ]; then
	pass FILES "the artifact holds exactly the six release files"
else
	for f in $(printf '%s\n' "$want_files" | grep -vxF "$have_files"); do fail FILES "missing: $f"; done
	for f in $(printf '%s\n' "$have_files" | grep -vxF "$want_files"); do fail FILES "unexpected: $f"; done
fi
for f in "$amd64" "$arm64"; do
	r=$(sum "$work/out/$f")
	if [ -f "$art/$f" ] && cmp -s "$work/out/$f" "$art/$f"; then
		pass BINARY "$f identical, sha256 $r"
	else
		fail BINARY "$f differs from the rebuild (CI $([ -f "$art/$f" ] && sum "$art/$f" || echo missing), rebuilt $r)"
		if [ -f "$art/$f" ]; then
			say "  go version -m, CI's then the rebuild's, paths dropped:"
			go version -m "$art/$f" 2>&1 | sed 's|^[^:]*: |  CI: |' | tee -a "$out" >/dev/null
			go version -m "$work/out/$f" 2>&1 | sed 's|^[^:]*: |  rebuilt: |' | tee -a "$out" >/dev/null
		fi
	fi
	listed=$(awk -v n="$f" '$2 == n { print $1 }' "$art/SHA256SUMS" 2>/dev/null)
	[ "$listed" = "$r" ] && pass SUMS "SHA256SUMS lists $f with the rebuilt sha256" || fail SUMS "SHA256SUMS lists $f as '${listed:-nothing}', rebuilt $r"
	entry=$(sed -n "s/.*{\"name\":\"$f\",\"os\":\"linux\",\"arch\":\"[a-z0-9]*\",\"sha256\":\"\([0-9a-f]\{64\}\)\",\"size\":\([0-9]*\)}.*/\1 \2/p" "$art/release.json" 2>/dev/null)
	size=$(wc -c <"$work/out/$f" | tr -d ' ')
	[ "$entry" = "$r $size" ] && pass RELEASE "release.json lists $f with the rebuilt sha256 and size" || fail RELEASE "release.json lists $f as '${entry:-nothing}', rebuilt $r $size"
done

# 5. The other release files, reassembled from the rebuild by the commit's own script with CI's date.
date=$(sed -n 's/.*"date":"\([^"]*\)".*/\1/p' "$art/release.json" 2>/dev/null)
if sh "$work/src/scripts/assemble-release.sh" "$work/out" "$version" "https://get.coffer.party/$version" =https "$date" 2>>"$out"; then
	for f in install.sh release.json SHA256SUMS; do
		[ -f "$art/$f" ] && cmp -s "$work/out/$f" "$art/$f" && pass ASSEMBLE "$f identical" || fail ASSEMBLE "$f differs from the reassembled one"
	done
else
	fail ASSEMBLE "scripts/assemble-release.sh refused (release.json's date: '$date')"
fi

# 6. The public key.
pem="$art/coffer-release.pub.pem"
fp=$(openssl pkey -pubin -in "$pem" -outform DER 2>/dev/null | sha256sum | cut -d ' ' -f 1)
if [ -f "$pem" ] && cmp -s "$pem" "$work/src/installer/coffer-release.pub.pem" && [ "$fp" = "$key1" ]; then
	pass KEY "coffer-release.pub.pem is the tagged commit's, fingerprint $fp"
else
	fail KEY "coffer-release.pub.pem isn't the tagged commit's release key 1 (fingerprint ${fp:-unreadable})"
fi

finish
