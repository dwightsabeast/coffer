#!/bin/sh
# The release build of xmr-bridge (phase 09, Part C): the one place its Go command, flags and environment are written.
# .github/workflows/bridge-release.yml runs it for a release, ci.yml's reproducibility check for 0.0.0-repro, and
# scripts/rebuild-release.sh for Wyatt's matching rebuild, so the three can't drift apart.
#
#   scripts/release-build.sh <version> <out>
#   <version>  x.y.z, or 0.0.0-repro for the reproducibility check
#   <out>      an absolute folder outside the repository, missing or empty; gets xmr-bridge-<version>-linux-amd64 and
#              -arm64
#
# The binaries are byte-for-byte reproducible from the same commit: the same Go release (bridge/go.mod's go line,
# checked exactly), -trimpath, and -buildvcs=true from a clean tree, so vcs.modified is false. That is why the tree
# must be clean and <out> must be outside it. Every setting that could change the output is set here, never taken
# from the caller: GOENV=off ignores `go env -w`, GOWORK=off any workspace, GOEXPERIMENT and GOFIPS140 are unset.
set -eu

[ $# -eq 2 ] || { echo "usage: $0 <version> <out>" >&2; exit 2; }
version=$1 out=$2
repo=$(cd "$(dirname "$0")/.." && pwd -P)

printf '%s' "$version" | grep -Eqx '[0-9]+\.[0-9]+\.[0-9]+|0\.0\.0-repro' || { echo "version '$version' isn't x.y.z or 0.0.0-repro" >&2; exit 2; }
case "$out" in /*) ;; *) echo "out '$out' must be an absolute path" >&2; exit 2 ;; esac
case "$out/" in "$repo"/*) echo "out '$out' is inside the repository: the build would see it as a change" >&2; exit 2 ;; esac
mkdir -p "$out"
outp=$(cd "$out" && pwd -P)
case "$outp/" in "$repo"/*) echo "out '$out' is inside the repository: the build would see it as a change" >&2; exit 2 ;; esac
[ -z "$(ls -A "$outp")" ] || { echo "out '$out' isn't empty" >&2; exit 2; }

export GOTOOLCHAIN=local CGO_ENABLED=0 GOFLAGS=-mod=readonly GOOS=linux GOAMD64=v1 GOARM64=v8.0 GOENV=off GOWORK=off
unset GOEXPERIMENT GOFIPS140

want="go$(sed -n 's/^go \([0-9][0-9.]*\)$/\1/p' "$repo/bridge/go.mod")"
[ "$want" != go ] || { echo "no go line in bridge/go.mod" >&2; exit 1; }
have=$(go env GOVERSION)
[ "$have" = "$want" ] || { echo "go is $have; bridge/go.mod wants $want exactly" >&2; exit 1; }
if [ -n "$(git -C "$repo" status --porcelain --untracked-files=all)" ]; then
	echo "the repository isn't clean (git status shows changes): the build would record vcs.modified=true" >&2
	exit 1
fi

cd "$repo/bridge"
for arch in amd64 arm64; do
	GOARCH=$arch go build -trimpath -buildvcs=true -ldflags "-X main.version=$version" \
		-o "$outp/xmr-bridge-$version-linux-$arch" ./cmd/xmr-bridge
done
for arch in amd64 arm64; do go version -m "$outp/xmr-bridge-$version-linux-$arch"; done
