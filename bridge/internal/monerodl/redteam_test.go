package monerodl

import (
	"context"
	"strings"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/hostile"
)

// Phase 07b pass 1, round 2 (Step 3), E3: the Monero download host's certificate must be trusted by the system.
func TestRedteamUntrustedDownloadCertificate(t *testing.T) {
	t.Run("[T27] E3: a download host with an untrusted certificate is refused", func(t *testing.T) {
		s := hostile.NewTLS(t, hostile.Reply{Body: string(fixture(t, "hashes-good.txt"))})
		f := &Fetcher{HashesURL: s.URL + "/downloads/hashes.txt", ArchiveBase: s.URL + "/cli/", Key: fixtureKey(t), Arch: "x64"}
		_, err := f.Latest(context.Background())
		if err == nil || !strings.Contains(err.Error(), "certificate") {
			t.Fatalf("got %v", err)
		}
	})
}
