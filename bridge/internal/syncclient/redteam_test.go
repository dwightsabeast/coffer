package syncclient

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/hostile"
	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
)

// Phase 07b pass 1, round 2 (Step 3), E3: the site's certificate must be trusted by the system. The client is built
// the way cmd/xmr-bridge builds it (no HTTP client injected), against a server whose certificate isn't trusted.
func TestRedteamUntrustedSiteCertificate(t *testing.T) {
	t.Run("[T27] E3: a site with an untrusted certificate is refused before anything is sent", func(t *testing.T) {
		s, c := hostileTLSSite(t, hostile.Reply{Body: okReply})
		k, _ := syncsign.NewKey()
		_, err := c.Send(context.Background(), k, Body{V: 1, Seq: 1})
		if err == nil || !strings.Contains(err.Error(), "certificate") {
			t.Fatalf("got %v", err)
		}
		if r := s.Requests(); len(r) != 0 {
			t.Fatalf("the site saw %d requests", len(r))
		}
	})
}

// E2: a site that answers too much, too slowly, never, or only part of an answer. Each one is an error within the
// caller's deadline, and a huge answer is read only up to the 1 MiB cap.
func TestRedteamHostileSiteReplies(t *testing.T) {
	t.Run("[F08] E2: 100 MB, a drip, a hang and a cut reply are errors, each within the deadline", func(t *testing.T) {
		k, _ := syncsign.NewKey()
		for name, r := range map[string]hostile.Reply{
			"100 MB": {Body: `{"success":true,"data":{"ok":true,"poolFree":1,"poolTarget":50,"watch":[`, Stream: 100 << 20, Fill: "1,"},
			"drip":   {Body: okReply, Drip: 200 * time.Millisecond},
			"hang":   {Hang: true},
			"cut":    {Body: `{"success":true,"data":{"ok":tr`, Cut: true},
		} {
			_, c := hostileSite(t, r)
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			start := time.Now()
			_, err := c.Send(ctx, k, Body{V: 1, Seq: 1})
			cancel()
			if err == nil {
				t.Errorf("%s: accepted", name)
			}
			if d := time.Since(start); d > 4*time.Second {
				t.Errorf("%s: took %v", name, d)
			}
		}
	})
}
