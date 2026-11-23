package installer

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"runtime"
	"strings"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/selfupdate"
)

// RFC 8032 section 7.1, test keys 1 and 2 (published).
func rfcKey(seed string) ed25519.PrivateKey {
	b, _ := hex.DecodeString(seed)
	return ed25519.NewKeyFromSeed(b)
}

var (
	testKey1 = rfcKey("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
	testKey2 = rfcKey("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb")
)

func TestRefreshUnits(t *testing.T) {
	svc, timer := RefreshServiceText(), RefreshTimerText()
	for _, want := range []string{
		"Type=oneshot", "ExecStart=/usr/local/bin/xmr-bridge refresh-admin\n",
		"PrivateNetwork=yes", "ProtectSystem=strict", "ReadWritePaths=/usr/local/bin /etc/xmr-bridge",
		"ReadOnlyPaths=/var/lib/xmr-bridge", "CapabilityBoundingSet=CAP_DAC_READ_SEARCH\n", "PrivateDevices=yes",
		"TimeoutStartSec=2min", "NoNewPrivileges=yes", "ProtectHome=yes", "PrivateTmp=yes", "UMask=0022",
		"RestrictAddressFamilies=AF_UNIX", "SystemCallFilter=@system-service", "MemoryDenyWriteExecute=yes",
	} {
		if !strings.Contains(svc, want) {
			t.Errorf("the refresh service lacks %q", want)
		}
	}
	if strings.Contains(svc, "User=") {
		t.Error("the refresh runs as root: it must never take the service user")
	}
	for _, want := range []string{"OnBootSec=15min", "OnUnitActiveSec=6h", "RandomizedDelaySec=30min", "Persistent=true",
		"Unit=xmr-bridge-refresh.service", "WantedBy=timers.target"} {
		if !strings.Contains(timer, want) {
			t.Errorf("the refresh timer lacks %q", want)
		}
	}
}

func TestInstallSetsUpRefresh(t *testing.T) {
	opts, sys, tty, st := harness(t)
	if err := Install(context.Background(), opts, sys, tty, st.steps(sys)); err != nil {
		t.Fatal(err)
	}
	p := opts.Paths
	for path, want := range map[string]string{p.RefreshService(): RefreshServiceText(), p.RefreshTimer(): RefreshTimerText()} {
		if b, err := os.ReadFile(path); err != nil || string(b) != want {
			t.Fatalf("%s: %v", path, err)
		}
	}
	if !sys.has("systemctl enable --now xmr-bridge-refresh.timer") {
		t.Fatalf("the timer isn't enabled: %v", sys.calls)
	}

	var out strings.Builder
	if err := Uninstall(p, nil, false, sys, &out); err != nil {
		t.Fatal(err)
	}
	if !sys.has("systemctl disable --now xmr-bridge-refresh.timer") {
		t.Fatalf("uninstall doesn't stop the timer: %v", sys.calls)
	}
	for _, path := range []string{p.RefreshService(), p.RefreshTimer()} {
		if _, err := os.Lstat(path); !os.IsNotExist(err) {
			t.Fatalf("%s kept", path)
		}
	}
}

// A crash between the refresh's swap steps can leave a new admin copy with the old hash file. Uninstall still
// recognizes it from the release kept in /etc, if that release's signature checks with the copy's own keys.
func TestUninstallRecognizesARefreshedCopy(t *testing.T) {
	t.Run("[T36] crash between swap steps: uninstall still recognizes the refreshed copy", func(t *testing.T) {
		for name, c := range map[string]struct {
			signer ed25519.PrivateKey
			remove bool
		}{
			"signed with a pinned key":         {testKey1, true},
			"signed with a key it doesn't pin": {testKey2, false},
		} {
			t.Run(name, func(t *testing.T) {
				opts, sys, tty, st := harness(t)
				keys := []ed25519.PublicKey{testKey1.Public().(ed25519.PublicKey)}
				opts.Keys = keys
				if err := Install(context.Background(), opts, sys, tty, st.steps(sys)); err != nil {
					t.Fatal(err)
				}
				p := opts.Paths
				bin := []byte("#!bridge binary 1.0.1\n")
				h := sha256.Sum256(bin)
				m := []byte(fmt.Sprintf(`{"product":"xmr-bridge","version":"1.0.1","date":"2026-11-23T00:00:00Z","files":[{"name":"xmr-bridge-1.0.1-linux-%s","os":"linux","arch":%q,"sha256":%q,"size":%d}]}`, runtime.GOARCH, runtime.GOARCH, hex.EncodeToString(h[:]), len(bin)))
				sig := base64.StdEncoding.EncodeToString(ed25519.Sign(c.signer, append([]byte(selfupdate.SignaturePrefix), m...)))
				os.WriteFile(p.Link(), bin, 0o755) // the new copy; admin-binary.sha256 still names the old one
				os.WriteFile(p.Refresh().AdminRelease(), m, 0o644)
				os.WriteFile(p.Refresh().AdminReleaseSig(), []byte(sig+"\n"), 0o644)
				var out strings.Builder
				if err := Uninstall(p, keys, false, sys, &out); err != nil {
					t.Fatal(err)
				}
				_, err := os.Lstat(p.Link())
				if removed := os.IsNotExist(err); removed != c.remove {
					t.Fatalf("admin copy removed = %v, want %v", removed, c.remove)
				}
			})
		}
	})
}

// Installing again replaces both binaries, so a release kept by an earlier self-update or refresh no longer describes
// them; left in place, every refresh would log a refusal.
func TestInstallDropsKeptReleases(t *testing.T) {
	opts, sys, tty, st := harness(t)
	if err := Install(context.Background(), opts, sys, tty, st.steps(sys)); err != nil {
		t.Fatal(err)
	}
	p := opts.Paths
	kept := []string{p.BinDir() + "/release.json", p.BinDir() + "/release.json.sig", p.Refresh().AdminRelease(), p.Refresh().AdminReleaseSig()}
	for _, f := range kept {
		os.WriteFile(f, []byte("an earlier release"), 0o600)
	}
	tty2 := &fakeTTY{answers: []string{stagenetAddr}, secrets: []string{viewKey}}
	if err := Install(context.Background(), opts, sys, tty2, st.steps(sys)); err != nil {
		t.Fatal(err)
	}
	for _, f := range kept {
		if _, err := os.Lstat(f); !os.IsNotExist(err) {
			t.Fatalf("%s kept after installing again", f)
		}
	}
}
