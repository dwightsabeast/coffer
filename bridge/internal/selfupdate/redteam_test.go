package selfupdate

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Phase 07b pass 1, round 2 (Step 3), E3: the release host's certificate must be trusted by the system.
func TestRedteamUntrustedReleaseCertificate(t *testing.T) {
	t.Run("[T27][T16] E3: a release host with an untrusted certificate is refused and the bridge stays as it is", func(t *testing.T) {
		r := newTLSRelease(t)
		r.publish("0.2.0", t0.Add(-49*time.Hour), "0.2.0")
		u, d := updater(t, r, "0.1.0")
		u.HTTP = nil // the production transport: the system's roots
		p, err := u.PrepareBridge(context.Background())
		if err == nil || p != nil || !strings.Contains(err.Error(), "certificate") {
			t.Fatalf("%+v %v", p, err)
		}
		if b, _ := os.ReadFile(filepath.Join(d, "bin", "xmr-bridge")); string(b) != "current bridge" {
			t.Fatal("the installed bridge changed")
		}
	})
}
