package crosscheck

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/noderpc"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// TestLiveMainnetSecondNodes checks the built-in mainnet list over its real https path (Wyatt, 2026-11-02): for each
// node in turn as the configured node, one recent block and one transaction in it, checked by the bridge's own Checker
// against the rest of the list (certificates verified, no redirects, a different operator vouching). Read-only daemon
// RPC: get_info, get_block and get_block_header_by_height; the second nodes learn a height, never a txid. Mainnet is
// otherwise never used in development; this runs only when asked:
//
//	XMR_BRIDGE_LIVE_MAINNET_SECONDS=1 go test -count=1 -run TestLiveMainnetSecondNodes -v ./internal/crosscheck/
func TestLiveMainnetSecondNodes(t *testing.T) {
	t.Run("[T14] live: each mainnet second node vouches for a recent block over https", func(t *testing.T) {
		if os.Getenv("XMR_BRIDGE_LIVE_MAINNET_SECONDS") != "1" {
			t.Skip("set XMR_BRIDGE_LIVE_MAINNET_SECONDS=1 to check the mainnet list live (read-only)")
		}
		list := DefaultNodes("mainnet")
		for _, n := range list {
			if !strings.HasPrefix(n, "https://") {
				t.Fatalf("%s isn't https", n)
			}
		}
		for _, primary := range list {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			info, err := noderpc.GetInfo(ctx, primary, nil)
			if err != nil || info.NetType != "mainnet" || !info.Synchronized {
				cancel()
				t.Fatalf("%s: %+v %v", primary, info, err)
			}
			// A recent block with a transaction in it (20 below the tip, so every node has it), from the configured node.
			var b noderpc.Block
			for h := info.Height - 20; h > info.Height-60; h-- {
				if b, err = noderpc.GetBlock(ctx, primary, nil, h); err == nil && len(b.TxHashes) > 0 {
					break
				}
			}
			if err != nil || len(b.TxHashes) == 0 {
				cancel()
				t.Fatalf("%s: no recent block with a transaction: %v", primary, err)
			}
			conf := info.Height - b.Height
			// Every other node as the only second node, so each one's https path vouches at least once (a random pick
			// could leave one out).
			for _, second := range list {
				if second == primary {
					continue
				}
				c := New(primary, "mainnet", []string{second}, nil)
				got, rep := c.Check(ctx, []walletrpc.Transfer{{TxID: b.TxHashes[0], Index: 1, Amount: "1", Height: b.Height, Confirmations: conf, UnlockTime: "0"}})
				t.Logf("%s configured, block %d: %s via %s, confirmations %d -> %d", hostOf(primary), b.Height, rep.State, rep.Node, conf, got[0].Confirmations)
				if rep.State != OK || got[0].Confirmations == 0 || got[0].Confirmations > conf || rep.Node != hostOf(second) {
					t.Errorf("%s vouching for %s: %+v", second, primary, rep)
				}
			}
			cancel()
		}
	})
}
