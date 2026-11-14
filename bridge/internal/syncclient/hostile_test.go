package syncclient

import (
	"context"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/hostile"
	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
)

// Phase 07b: a site that answers anything (internal/hostile), for attacks on the sync client.

// hostileSite serves replies over plain http to a Client that trusts it.
func hostileSite(t *testing.T, replies ...hostile.Reply) (*hostile.Server, *Client) {
	s := hostile.New(t, replies...)
	return s, &Client{Site: s.URL + "/", HTTP: s.Client(), Now: func() time.Time { return now }}
}

// hostileTLSSite serves replies over https with a certificate the system doesn't trust, to a Client built the way
// cmd/xmr-bridge builds one (no HTTP client injected, so the system's roots).
func hostileTLSSite(t *testing.T, replies ...hostile.Reply) (*hostile.Server, *Client) {
	s := hostile.NewTLS(t, replies...)
	return s, &Client{Site: s.URL + "/", Now: func() time.Time { return now }}
}

func TestHostileSiteHarness(t *testing.T) {
	s, c := hostileSite(t, hostile.Reply{Body: okReply})
	k, _ := syncsign.NewKey()
	resp, err := c.Send(context.Background(), k, Body{V: 1, Seq: 1})
	if err != nil || resp.PoolFree != 41 {
		t.Fatalf("%+v %v", resp, err)
	}
	if r := s.Requests(); len(r) != 1 || r[0].Header.Get("x-xmr-sig") == "" || r[0].Path != routePath {
		t.Fatalf("site saw %+v", r)
	}
	if ts, tc := hostileTLSSite(t); tc.HTTP != nil || tc.Site != ts.URL+"/" {
		t.Fatal("the TLS site's client must use the production transport")
	}
}
