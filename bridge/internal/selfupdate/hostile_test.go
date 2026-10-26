package selfupdate

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/hostile"
)

// Phase 07b: newTLSRelease is newRelease over https, with httptest's certificate (internal/hostile). updater() trusts it
// through r.srv.Client(); set the Updater's HTTP to nil for the production transport, which doesn't.
func newTLSRelease(t *testing.T) *release {
	r := &release{files: map[string][]byte{}}
	r.pub, r.priv = keyPair(t)
	r.srv = hostile.Routed(t, true, func(req hostile.Request) hostile.Reply {
		b, ok := r.files[strings.TrimPrefix(req.Path, "/")]
		if !ok {
			return hostile.Reply{Status: 404, Body: "not found"}
		}
		return hostile.Reply{Body: string(b)}
	}).Server
	return r
}

func TestTLSReleaseHarness(t *testing.T) {
	r := newTLSRelease(t)
	r.publish("0.2.0", t0.Add(-49*time.Hour), "0.2.0")
	u, _ := updater(t, r, "0.1.0")
	if p, err := u.PrepareBridge(context.Background()); err != nil || p == nil || p.Version != "0.2.0" {
		t.Fatalf("%+v %v", p, err)
	}
}
