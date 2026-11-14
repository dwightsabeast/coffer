package crosscheck

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/noderpc"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// RT-26 and spec change 13 as amended (Wyatt, 2026-11-02). With a remote node and no second node to compare with,
// nothing bounds what the configured node claims, so the height fails closed and so do confirmations: every mined
// transfer is held at 0 until a second node answers. Unmined transfers stay as they are (already 0).

func TestUnavailableHoldsConfirmations(t *testing.T) {
	t.Run("[T14] [RT-26] no second node answers: every mined transfer is held at 0, an unmined one is untouched", func(t *testing.T) {
		down := chain(110)
		down.down = true
		c := checker(t, chain(110), down)
		got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10), transfer(tx2, 0, 0)})
		if rep.State != Unavailable || got[0].Confirmations != 0 || got[1].Confirmations != 0 || got[0].Height != 100 {
			t.Fatalf("report %+v, transfers %+v", rep, got)
		}
		if !strings.Contains(rep.Detail, "held at 0 confirmations") {
			t.Fatalf("detail %q", rep.Detail)
		}
	})
	t.Run("[T14] [RT-26] already verified once, then no second node: still held (nothing bounds the depth now)", func(t *testing.T) {
		second := chain(110)
		c := checker(t, chain(110), second)
		if _, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)}); rep.State != OK {
			t.Fatalf("first: %+v", rep)
		}
		second.down = true
		got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)})
		if rep.State != Unavailable || got[0].Confirmations != 0 {
			t.Fatalf("report %+v, confirmations %d", rep, got[0].Confirmations)
		}
	})
	t.Run("[T14] [RT-26] the configured node gives no block hash: held at 0", func(t *testing.T) {
		primary := chain(110)
		delete(primary.hashes, 100)
		c := checker(t, primary, chain(110))
		got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)})
		if rep.State != Unavailable || got[0].Confirmations != 0 {
			t.Fatalf("report %+v, confirmations %d", rep, got[0].Confirmations)
		}
	})
	t.Run("[T14] [RT-26] the second node gives no block: held at 0", func(t *testing.T) {
		second := chain(110)
		delete(second.hashes, 100)
		c := checker(t, chain(110), second)
		got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)})
		if rep.State != Unavailable || got[0].Confirmations != 0 {
			t.Fatalf("report %+v, confirmations %d", rep, got[0].Confirmations)
		}
	})
}

func TestSecondHeight(t *testing.T) {
	t.Run("[T14] [RT-26] the second node's height: a synchronized node on the right network, never the configured node's host", func(t *testing.T) {
		syncing := chain(500)
		syncing.syncing = true
		wrongNet := chain(900)
		wrongNet.net = "mainnet"
		c := checker(t, chain(110), syncing, wrongNet, chain(108))
		h, host, ok := c.SecondHeight(context.Background())
		if !ok || h != 108 || host == "" {
			t.Fatalf("height %d, host %q, ok %v", h, host, ok)
		}
		down := chain(110)
		down.down = true
		if _, _, ok := checker(t, chain(110), down).SecondHeight(context.Background()); ok {
			t.Fatal("a height with no second node answering")
		}
	})
}

func TestBoundedHeight(t *testing.T) {
	// Spec change 47, part 4 (Wyatt, D4 and answer 3): the height a pairing request carries resets the site's height, so
	// it is 0 unless the node is synchronized and online, and with a remote node it is the second node's height when the
	// two differ by more than HeightTolerance either way (0 with no second node).
	synced := func(h uint64) noderpc.Info { return noderpc.Info{NetType: "stagenet", Height: h, Synchronized: true} }
	second := func(h uint64, ok bool) func(context.Context) (uint64, string, bool) {
		return func(context.Context) (uint64, string, bool) { return h, "second.example", ok }
	}
	none := second(0, false)
	cases := []struct {
		name   string
		info   noderpc.Info
		err    error
		own    bool
		second func(context.Context) (uint64, string, bool)
		want   uint64
	}{
		{"own node, synchronized", synced(2242155), nil, true, none, 2242155},
		{"own node, still catching up", noderpc.Info{Height: 94954, TargetHeight: 2227755}, nil, true, none, 0},
		{"own node, offline", noderpc.Info{Height: 2242155, Synchronized: true, Offline: true}, nil, true, none, 0},
		{"the node didn't answer", noderpc.Info{}, errors.New("connection refused"), true, none, 0},
		{"remote, level with the second node", synced(2242155), nil, false, second(2242150, true), 2242155},
		{"remote, 10 above", synced(2242160), nil, false, second(2242150, true), 2242160},
		{"remote, 11 above: the second node's", synced(2242161), nil, false, second(2242150, true), 2242150},
		{"remote, a million above: the second node's", synced(3242155), nil, false, second(2242155, true), 2242155},
		{"remote, 11 below: the second node's", synced(2242139), nil, false, second(2242150, true), 2242150},
		{"remote, no second node: none", synced(2242155), nil, false, none, 0},
	}
	for _, c := range cases {
		t.Run("[T14][R09] [RT-26] "+c.name, func(t *testing.T) {
			if got := boundedHeight(context.Background(), c.info, c.err, c.own, c.second); got != c.want {
				t.Fatalf("got %d, want %d", got, c.want)
			}
		})
	}
}
