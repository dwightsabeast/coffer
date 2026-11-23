//go:build !devrelease

package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The release build's update schedule (spec: Updates, a daily check). F1 on coffer-test (07b round 2) saw the dev
// build's one-minute checks; this pins that a release build waits 10 minutes, then checks every 24 h ± 1 h, and waits
// 48 h after a release before installing it.
func TestReleaseUpdateSchedule(t *testing.T) {
	t.Run("[T10][T26] a release build checks for updates daily, not every minute", func(t *testing.T) {
		if devBuild {
			t.Fatal("built as a dev release")
		}
		if firstCheckAfter != 10*time.Minute || checkEvery != 24*time.Hour || checkJitter != time.Hour {
			t.Fatalf("first after %v, every %v ± %v", firstCheckAfter, checkEvery, checkJitter)
		}
		if updateDelay != 48*time.Hour || walletRPCDelay != 48*time.Hour {
			t.Fatalf("delays %v, %v", updateDelay, walletRPCDelay)
		}
	})
}

// Release keys 1 and 2 (docs/release-key.md; made offline by Wyatt on 2026-11-23, only the public halves on this box).
// Key 1 signs releases; key 2 ("next") is used only if key 1 is lost. The fingerprints are the SHA-256 of each
// public key's DER form, as Wyatt confirmed them against his paper copy, so changing a committed .pem file and the
// pin together still fails here.
var wantReleaseKeys = []struct{ file, fingerprint, pin string }{
	{"coffer-release.pub.pem", "531183cd4dea6af723656e2196aa6826a7d2c3dc0d9877bfb92b7887e16c3192", releasePin1},
	{"coffer-release-next.pub.pem", "392a98064028199f53223cb8c7fe22d318ea3182661c316279778778239c27fa", releasePin2},
}

// RFC 8032 section 7.1, test keys 1 to 3 (public keys, published).
var rfc8032PublicKeys = []string{
	"d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
	"3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
	"fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
}

func TestReleaseKeysPinned(t *testing.T) {
	t.Run("[T16][T32] a release build pins exactly release keys 1 and 2", func(t *testing.T) {
		keys := releaseKeys()
		if len(keys) != len(wantReleaseKeys) {
			t.Fatalf("releaseKeys() has %d keys, want %d", len(keys), len(wantReleaseKeys))
		}
		for i, w := range wantReleaseKeys {
			b, err := os.ReadFile(filepath.Join("..", "..", "..", "installer", w.file))
			if err != nil {
				t.Fatal(err)
			}
			block, rest := pem.Decode(b)
			if block == nil || block.Type != "PUBLIC KEY" || len(bytes.TrimSpace(rest)) != 0 {
				t.Fatalf("installer/%s isn't one PEM public key", w.file)
			}
			if sum := sha256.Sum256(block.Bytes); hex.EncodeToString(sum[:]) != w.fingerprint {
				t.Fatalf("installer/%s has fingerprint %x, want %s", w.file, sum, w.fingerprint)
			}
			parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
			pub, ok := parsed.(ed25519.PublicKey)
			if err != nil || !ok {
				t.Fatalf("installer/%s isn't an Ed25519 public key: %v", w.file, err)
			}
			if len(keys[i]) != ed25519.PublicKeySize || !bytes.Equal(keys[i], pub) {
				t.Fatalf("pinned key %d isn't installer/%s", i+1, w.file)
			}
			for _, k := range rfc8032PublicKeys {
				if hex.EncodeToString(keys[i]) == k {
					t.Fatalf("pinned key %d is an RFC 8032 test key", i+1)
				}
			}
		}
		if bytes.Equal(keys[0], keys[1]) {
			t.Fatal("keys 1 and 2 are the same key")
		}
	})
}
