package crosscheck

import (
	"context"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/hostile"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// Phase 07b: liar puts a rewriting proxy (internal/hostile) in front of a fake node and returns its URL, for a node
// that lies about one detail (a height, a hash, a block's transactions). The offline version of live_test.go's
// dishonest proxy.
func liar(t *testing.T, upstream *node, rewrite hostile.Rewrite) string {
	return hostile.NewProxy(t, upstream.serve(t).URL, rewrite).URL
}

func TestLiarHarness(t *testing.T) {
	// A proxy that changes nothing gives the honest result.
	c := New(asLocalhost(chain(110).serve(t).URL), "stagenet", []string{liar(t, chain(108), nil)}, nil)
	got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)})
	if rep.State != OK || got[0].Confirmations != 8 {
		t.Fatalf("%+v %+v", rep, got)
	}
}
