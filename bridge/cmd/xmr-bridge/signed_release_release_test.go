//go:build !devrelease

package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/selfupdate"
)

// The bridge's own check of a real signed release before it's uploaded (docs/release-key.md, section 4, check 2).
// OpenSSL's check is the other one. Given a release folder with release.json, release.json.sig and the files it
// lists, checkSignedRelease requires:
//   - selfupdate.VerifyManifest accepts the signature with the given keys (the live test passes key 1 alone);
//   - the signed version is the expected one;
//   - one changed bit in release.json, and one in the signature, are refused;
//   - every listed file is in the folder with the listed size and SHA-256.
func checkSignedRelease(dir string, keys []ed25519.PublicKey, wantVersion string) error {
	m, err := os.ReadFile(filepath.Join(dir, "release.json"))
	if err != nil {
		return err
	}
	sig, err := os.ReadFile(filepath.Join(dir, "release.json.sig"))
	if err != nil {
		return err
	}
	r, err := selfupdate.VerifyManifest(m, sig, keys)
	if err != nil {
		return fmt.Errorf("VerifyManifest: %w", err)
	}
	if r.Version != wantVersion {
		return fmt.Errorf("signed version %q, want %q", r.Version, wantVersion)
	}
	// One changed bit, in each file, must be refused (the check isn't accepting anything).
	m2 := bytes.Clone(m)
	m2[len(m2)/2] ^= 1
	if _, err := selfupdate.VerifyManifest(m2, sig, keys); err == nil {
		return errors.New("a one-bit change in release.json was accepted")
	}
	raw, err := base64.StdEncoding.DecodeString(string(bytes.TrimSpace(sig)))
	if err != nil {
		return err
	}
	raw[0] ^= 1
	if _, err := selfupdate.VerifyManifest(m, []byte(base64.StdEncoding.EncodeToString(raw)), keys); err == nil {
		return errors.New("a one-bit change in the signature was accepted")
	}
	for _, f := range r.Files {
		b, err := os.ReadFile(filepath.Join(dir, f.Name))
		if err != nil {
			return fmt.Errorf("listed file %s: %w", f.Name, err)
		}
		s := sha256.Sum256(b)
		if int64(len(b)) != f.Size || hex.EncodeToString(s[:]) != f.SHA256 {
			return fmt.Errorf("listed file %s: size %d, sha256 %x; release.json says %d, %s", f.Name, len(b), s, f.Size, f.SHA256)
		}
	}
	return nil
}

// RFC 8032 section 7.1, test keys 1 and 2 (published; the only private keys tests may hold).
var (
	srTestKey1 = ed25519.NewKeyFromSeed(srHex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"))
	srTestKey2 = ed25519.NewKeyFromSeed(srHex("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb"))
)

func srHex(s string) []byte {
	b, err := hex.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}

// srFolder writes a release folder as the release build lays it out: two fake binaries, release.json listing them,
// and release.json.sig signed by k, base64 on one line with a newline (docs/release-key.md, section 4).
func srFolder(t *testing.T, k ed25519.PrivateKey, version string) string {
	t.Helper()
	dir := t.TempDir()
	type file struct {
		Name   string `json:"name"`
		OS     string `json:"os"`
		Arch   string `json:"arch"`
		SHA256 string `json:"sha256"`
		Size   int    `json:"size"`
	}
	var files []file
	for _, arch := range []string{"amd64", "arm64"} {
		name := fmt.Sprintf("xmr-bridge-%s-linux-%s", version, arch)
		body := []byte("fake " + arch + " binary for " + version)
		if err := os.WriteFile(filepath.Join(dir, name), body, 0o644); err != nil {
			t.Fatal(err)
		}
		s := sha256.Sum256(body)
		files = append(files, file{name, "linux", arch, hex.EncodeToString(s[:]), len(body)})
	}
	m, err := json.Marshal(map[string]any{"product": "xmr-bridge", "version": version, "date": "2026-11-24T22:40:42Z", "files": files})
	if err != nil {
		t.Fatal(err)
	}
	srWrite(t, dir, "release.json", m)
	srSign(t, dir, k)
	return dir
}

func srWrite(t *testing.T, dir, name string, b []byte) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func srSign(t *testing.T, dir string, k ed25519.PrivateKey) {
	t.Helper()
	m, err := os.ReadFile(filepath.Join(dir, "release.json"))
	if err != nil {
		t.Fatal(err)
	}
	sig := ed25519.Sign(k, append([]byte(selfupdate.SignaturePrefix), m...))
	srWrite(t, dir, "release.json.sig", []byte(base64.StdEncoding.EncodeToString(sig)+"\n"))
}

func srPub(k ed25519.PrivateKey) []ed25519.PublicKey {
	return []ed25519.PublicKey{k.Public().(ed25519.PublicKey)}
}

func TestSignedReleaseCheck(t *testing.T) {
	t.Run("[T16] a folder signed by the given key, with matching files, passes", func(t *testing.T) {
		dir := srFolder(t, srTestKey1, "1.0.0")
		if err := checkSignedRelease(dir, srPub(srTestKey1), "1.0.0"); err != nil {
			t.Fatal(err)
		}
	})
	refused := []struct {
		name  string
		setup func(t *testing.T, dir string)
		keys  []ed25519.PublicKey
		ver   string
	}{
		{"signed by another key", func(t *testing.T, dir string) { srSign(t, dir, srTestKey2) }, nil, ""},
		{"the expected version is another", nil, nil, "1.0.1"},
		{"the signature file is missing", func(t *testing.T, dir string) {
			if err := os.Remove(filepath.Join(dir, "release.json.sig")); err != nil {
				t.Fatal(err)
			}
		}, nil, ""},
		{"release.json changed after signing", func(t *testing.T, dir string) {
			p := filepath.Join(dir, "release.json")
			b, _ := os.ReadFile(p)
			srWrite(t, dir, "release.json", bytes.Replace(b, []byte(`"1.0.0"`), []byte(`"1.0.9"`), 1))
		}, nil, ""},
		{"a listed binary changed", func(t *testing.T, dir string) {
			srWrite(t, dir, "xmr-bridge-1.0.0-linux-arm64", []byte("fake arm64 binary for 1.0.X"))
		}, nil, ""},
		{"a listed binary is missing", func(t *testing.T, dir string) {
			if err := os.Remove(filepath.Join(dir, "xmr-bridge-1.0.0-linux-amd64")); err != nil {
				t.Fatal(err)
			}
		}, nil, ""},
		{"a listed binary has extra bytes", func(t *testing.T, dir string) {
			p := filepath.Join(dir, "xmr-bridge-1.0.0-linux-amd64")
			b, _ := os.ReadFile(p)
			srWrite(t, dir, "xmr-bridge-1.0.0-linux-amd64", append(b, 0))
		}, nil, ""},
		{"no keys given", nil, []ed25519.PublicKey{}, ""},
	}
	for _, c := range refused {
		t.Run("[T16] refused: "+c.name, func(t *testing.T) {
			dir := srFolder(t, srTestKey1, "1.0.0")
			if c.setup != nil {
				c.setup(t, dir)
			}
			keys, ver := srPub(srTestKey1), "1.0.0"
			if c.keys != nil {
				keys = c.keys
			}
			if c.ver != "" {
				ver = c.ver
			}
			if err := checkSignedRelease(dir, keys, ver); err == nil {
				t.Fatal("accepted")
			}
		})
	}
}

// The real release, before upload (Claude, on the dev box, once Wyatt hands back release.json.sig):
//
//	cd bridge && GOTOOLCHAIN=local XMR_BRIDGE_LIVE_SIGNED_RELEASE=<release folder> XMR_BRIDGE_LIVE_SIGNED_VERSION=<x.y.z> \
//	  go test -count=1 -run TestLiveSignedRelease -v ./cmd/xmr-bridge/
//
// It uses the release build's own pins: key 1 alone must have signed it, and the full pinned list accepts it too.
func TestLiveSignedRelease(t *testing.T) {
	dir, ver := os.Getenv("XMR_BRIDGE_LIVE_SIGNED_RELEASE"), os.Getenv("XMR_BRIDGE_LIVE_SIGNED_VERSION")
	if dir == "" || ver == "" {
		t.Skip("set XMR_BRIDGE_LIVE_SIGNED_RELEASE and XMR_BRIDGE_LIVE_SIGNED_VERSION")
	}
	if devBuild {
		t.Fatal("built as a dev release")
	}
	keys := releaseKeys()
	t.Run("[T16] the real release is signed by release key 1", func(t *testing.T) {
		if err := checkSignedRelease(dir, keys[:1], ver); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("[T16] the release build's full pinned list accepts it", func(t *testing.T) {
		if err := checkSignedRelease(dir, keys, ver); err != nil {
			t.Fatal(err)
		}
	})
}
