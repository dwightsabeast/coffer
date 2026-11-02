package bridgeloop

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// Phase 07b pass 1, round 2 (Step 3, white box). An attack that lands is committed with t.Skip("RT-nn open") until
// the fix session flips it.

// RT-26: the height the bridge reports was wallet-rpc's get_height, sent unchecked. wallet-rpc's height is the length
// of the chain its node served (wallet2.h:1230), and wallet2 appends a node's blocks without checking proof of work
// (wallet2.cpp:3023-3056), so a dishonest remote node could make it as high as it liked; the site keeps the highest
// height it has seen. Spec change 47 (Wyatt, D1): with a remote node the bridge reports no more than the second node's
// height plus 10 blocks, from the first sync that is further ahead; with the shop's own node, as is. (The first form of
// this test bounded the rise by elapsed time, which D1 rejected.)
func TestRedteamReportedHeightJump(t *testing.T) {
	t.Run("[T14][R09] [RT-26] a wallet height a million blocks ahead of the second node is reported as the second node's", func(t *testing.T) {
		l, w, s, _ := setup(t)
		l.o.CrossCheck = &fakeCheck{second: func() (uint64, bool) { return 2222000, true }}
		ctx := context.Background()
		if err := l.SyncOnce(ctx); err != nil {
			t.Fatal(err)
		}
		if got := s.last().Height; got != 2222000 {
			t.Fatalf("level with the second node: reported %d", got)
		}
		w.height += 1_000_000
		if err := l.SyncOnce(ctx); err != nil {
			t.Fatal(err)
		}
		if got := s.last().Height; got != 2222000 {
			t.Fatalf("reported %d, %d blocks above the second node", got, got-2222000)
		}
	})
	t.Run("[T14] with the shop's own node the height is reported as is", func(t *testing.T) {
		l, w, s, _ := setup(t) // CrossCheck nil: the configured node is the shop's own
		w.height += 1_000_000
		if err := l.SyncOnce(context.Background()); err != nil {
			t.Fatal(err)
		}
		if got := s.last().Height; got != w.height {
			t.Fatalf("reported %d, the wallet is at %d", got, w.height)
		}
	})
}

// RT-23: the node check is set only when the cross-check runs (snapshots), and every sync sends the last one to the
// site and the status file. With nothing watched it never runs, so an old result is repeated unchanged.
func TestRedteamStaleNodeCheck(t *testing.T) {
	t.Run("[R13][T14] [RT-23] once nothing is watched, the node check sent isn't the old result repeated unchanged", func(t *testing.T) {
		t.Skip("RT-23 open")
		l, w, s, _ := setup(t)
		l.o.CrossCheck = &fakeCheck{}
		s.target, s.watch = 0, []uint32{5}
		w.transfers[5] = []walletrpc.Transfer{tr('a', "1000", 100)}
		ctx := context.Background()
		l.SyncOnce(ctx)
		l.SyncOnce(ctx)
		checked := *s.last().Checks.Node
		s.watch = nil
		l.SyncOnce(ctx)
		l.SyncOnce(ctx)
		if later := *s.last().Checks.Node; reflect.DeepEqual(later, checked) {
			t.Fatalf("with nothing watched, still sending %+v", later)
		}
	})
}

// cappedWallet stops creating addresses after limit, so a test of an unbounded catch-up can't run away.
type cappedWallet struct {
	*fakeWallet
	limit int
}

func (w *cappedWallet) CreateAddresses(ctx context.Context, label string, n int) ([]walletrpc.NewAddress, error) {
	w.mu.Lock()
	over := w.created+n > w.limit
	w.mu.Unlock()
	if over {
		return nil, errors.New("test limit reached")
	}
	return w.fakeWallet.CreateAddresses(ctx, label, n)
}

// RT-27 (E1): the bridge takes the site's poolTop and poolTarget as given. A poolTop of 2^32-1 (the most
// syncclient accepts) starts a catch-up that creates subaddresses up to that index (catchUp, 100 per call, no upper
// bound); a poolTarget of a billion makes every sync create 100 more, forever. Only whoever controls the site's replies
// can send these (the site, or a broken-in site server: T15). Fixed with spec change 46 (Wyatt, 2026-11-01): numbering
// follows claimedTop, the catch-up goes no further than claimedTop + 50, and poolTarget counts for at most 50.
func TestRedteamSiteNumbersBounded(t *testing.T) {
	t.Run("[T15][F08] [RT-27] E1: a poolTop of 2^32-1 doesn't start a catch-up of billions of addresses", func(t *testing.T) {
		l, w, s, _ := setup(t)
		cw := &cappedWallet{fakeWallet: w, limit: 20_000}
		l.o.Wallet = func(context.Context) (Wallet, error) { return cw, nil }
		s.target = 0
		s.pool[1<<32-1] = true
		l.SyncOnce(context.Background())
		if w.created >= cw.limit-100 {
			t.Fatalf("created %d addresses toward index %d", w.created, uint32(1<<32-1))
		}
	})
	t.Run("[T15][F08] [RT-27] E1: a poolTarget of a billion doesn't make every sync create more addresses", func(t *testing.T) {
		l, w, s, _ := setup(t)
		s.target = 1_000_000_000
		ctx := context.Background()
		for i := 0; i < 30; i++ {
			l.SyncOnce(ctx)
		}
		if w.created > 1_000 {
			t.Fatalf("created %d addresses in 30 syncs", w.created)
		}
	})
}
