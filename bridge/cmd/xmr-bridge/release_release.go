//go:build !devrelease

package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"time"
)

// Release builds. No dev key and no dev release address exist in this file, and TestReleaseBuildHasNoDevValues proves
// the linked binary doesn't contain them.
const devBuild = false

// The release keys (docs/release-key.md), made offline by Wyatt on 2026-11-23; only their public halves are in the
// repo. A release is accepted if any one of them signed it (selfupdate.VerifyManifest). Each is base64 of the raw
// 32-byte Ed25519 public key; the fingerprint is the SHA-256 of the key's DER form (openssl pkey -pubin -in <file>
// -outform DER | sha256sum), the value admins compare in docs/install.md.
const (
	// Key 1 signs releases. installer/coffer-release.pub.pem,
	// fingerprint 531183cd4dea6af723656e2196aa6826a7d2c3dc0d9877bfb92b7887e16c3192.
	releaseKey1 = "7XWKYjyY4eqgnqBZr2Pijp+sQeUhojuOtX/QK1D2kS0="
	// Key 2 ("next") signs only if key 1 is lost or stolen (docs/release-key.md, section 5).
	// installer/coffer-release-next.pub.pem,
	// fingerprint 392a98064028199f53223cb8c7fe22d318ea3182661c316279778778239c27fa.
	releaseKey2 = "zjnFM+HXXikCTnB+/7urbd2XSUPpJBwph8Q6culnp0I="
)

// releaseKeys returns keys 1 and 2, in that order (TestReleaseKeysPinned). A pin that doesn't decode to 32 bytes is a
// build mistake, so it panics instead of quietly turning updates off.
func releaseKeys() []ed25519.PublicKey {
	keys := make([]ed25519.PublicKey, 0, 2)
	for _, s := range []string{releaseKey1, releaseKey2} {
		k, err := base64.StdEncoding.DecodeString(s)
		if err != nil || len(k) != ed25519.PublicKeySize {
			panic("a pinned release key is malformed")
		}
		keys = append(keys, ed25519.PublicKey(k))
	}
	return keys
}

// devBreakMode is always "" in release builds (see release_dev.go).
func devBreakMode() string { return "" }

// releaseBase is the folder installed bridges poll for updates (spec change 58, docs/install-host.md): plain copies of
// the newest version's release.json, release.json.sig and binaries.
func releaseBase() string { return "https://get.coffer.party/latest" }

const (
	updateDelay     = 48 * time.Hour // after a bridge release's signed date
	walletRPCDelay  = 48 * time.Hour // after a new wallet-rpc version is first seen
	firstCheckAfter = 10 * time.Minute
	checkEvery      = 24 * time.Hour
	checkJitter     = time.Hour
)
