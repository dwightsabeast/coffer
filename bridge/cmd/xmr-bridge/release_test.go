package main

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// The pins Wyatt confirmed on 2026-11-23 (base64 of each release key's 32 raw bytes; docs/release-key.md). Kept
// here as literals, apart from release_release.go, so the test doesn't check the code against itself.
const (
	releasePin1 = "7XWKYjyY4eqgnqBZr2Pijp+sQeUhojuOtX/QK1D2kS0="
	releasePin2 = "zjnFM+HXXikCTnB+/7urbd2XSUPpJBwph8Q6culnp0I="
)

// A release build must not contain the dev public key or the dev release address, even when the dev values are
// passed to the linker (a normal build has nowhere to put them). A devrelease build with the same values must
// contain both: the control that shows the check would notice.
func TestReleaseBuildHasNoDevValues(t *testing.T) {
	if testing.Short() {
		t.Skip("builds the bridge twice")
	}
	const key = "U0VOVElORUwtZGV2LWtleS1kby1ub3Qtc2hpcC0wMDA=" // "SENTINEL-dev-key-do-not-ship-000", base64
	const url = "http://sentinel-dev-release.invalid:8099"
	ldflags := "-X main.devReleaseKey=" + key + " -X main.devReleaseURL=" + url
	build := func(tags string) []byte {
		out := filepath.Join(t.TempDir(), "xmr-bridge")
		args := []string{"build", "-trimpath", "-ldflags", ldflags, "-o", out}
		if tags != "" {
			args = append(args, "-tags", tags)
		}
		cmd := exec.Command("go", append(args, ".")...)
		cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOTOOLCHAIN=local")
		if b, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("go build %s: %v %s", tags, err, b)
		}
		b, _ := os.ReadFile(out)
		return b
	}
	release, dev := build(""), build("devrelease")
	if bytes.Contains(release, []byte(key)) || bytes.Contains(release, []byte(url)) {
		t.Fatal("the release build contains a dev value")
	}
	if bytes.Contains(release, []byte("main.devReleaseKey")) || bytes.Contains(release, []byte("main.devReleaseURL")) || bytes.Contains(release, []byte("main.devBreak")) {
		t.Fatal("the release build has the dev variables")
	}
	if !bytes.Contains(dev, []byte(key)) || !bytes.Contains(dev, []byte(url)) {
		t.Fatal("control failed: the devrelease build should contain both values")
	}
	// Release keys 1 and 2 are in the linked release binary, and not in the devrelease one (which pins only the
	// dev key set at build time).
	for _, pin := range []string{releasePin1, releasePin2} {
		if !bytes.Contains(release, []byte(pin)) {
			t.Fatalf("the release build doesn't pin %s", pin)
		}
		if bytes.Contains(dev, []byte(pin)) {
			t.Fatalf("the devrelease build contains release pin %s", pin)
		}
	}
	// Spec change 58: the linked release binary polls get.coffer.party, and the placeholder host is gone.
	if bytes.Contains(release, []byte("REPLACE-RELEASE-HOST")) || bytes.Contains(release, []byte(".pages.dev")) {
		t.Fatal("the release build contains a placeholder or pages.dev host")
	}
	if !bytes.Contains(release, []byte(releaseUpdateURL)) {
		t.Fatalf("the release build doesn't contain %s", releaseUpdateURL)
	}
}

// Spec change 58 (Wyatt, 2026-11-20): installed bridges check https://get.coffer.party/latest for updates.
const releaseUpdateURL = "https://get.coffer.party/latest"

func TestReleaseBase(t *testing.T) {
	if devBuild {
		t.Skip("a devrelease build uses its own release address")
	}
	if got := releaseBase(); got != releaseUpdateURL {
		t.Fatalf("releaseBase() = %q, want %q", got, releaseUpdateURL)
	}
}
