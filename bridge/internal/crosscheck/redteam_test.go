package crosscheck

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// Phase 07b pass 1, round 2 (Step 3), P05: exactly what a second node is sent. F1 on coffer-test saw a different
// second node on most syncs while a mined payment was watched; each learns the wallet host's address and timing, and
// one learns the payment's height. This pins that nothing else goes out: no txid, amount, subaddress index or address.
func TestRedteamWhatASecondNodeIsSent(t *testing.T) {
	t.Run("[P05][T14] a second node gets get_info and get_block by height, never a txid or amount", func(t *testing.T) {
		second := chain(110)
		inner := second.serve(t)
		var mu sync.Mutex
		var seen []string
		rec := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			b, _ := io.ReadAll(r.Body)
			mu.Lock()
			seen = append(seen, r.Method+" "+r.URL.String()+" "+string(b))
			mu.Unlock()
			resp, err := http.Post(inner.URL+r.URL.Path, "application/json", strings.NewReader(string(b)))
			if err != nil {
				http.Error(w, err.Error(), 502)
				return
			}
			defer resp.Body.Close()
			io.Copy(w, resp.Body)
		}))
		t.Cleanup(rec.Close)
		c := New(asLocalhost(chain(110).serve(t).URL), "stagenet", []string{rec.URL}, nil)
		ts := []walletrpc.Transfer{transfer(tx1, 100, 10)}
		ts[0].Amount, ts[0].Index = "123456789012", 777
		for i := 0; i < 3; i++ {
			if _, rep := c.Check(context.Background(), ts); rep.State != OK {
				t.Fatalf("round %d: %+v", i, rep)
			}
		}
		blocks := 0
		for _, s := range seen {
			for _, secret := range []string{tx1, "123456789012", "777"} {
				if strings.Contains(s, secret) {
					t.Fatalf("a second node was sent %q: %s", secret, s)
				}
			}
			switch {
			case strings.Contains(s, `"get_info"`):
			case strings.Contains(s, `"get_block"`):
				blocks++
				if !strings.Contains(s, `"height":100`) {
					t.Fatalf("get_block not by the payment's height: %s", s)
				}
			default:
				t.Fatalf("unexpected request: %s", s)
			}
		}
		// Once per payment and height (cached): every sync asks get_info, only the first asks get_block.
		if blocks != 1 || len(seen) != 4 {
			t.Fatalf("%d requests, %d get_block: %q", len(seen), blocks, seen)
		}
	})
}
