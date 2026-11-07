package bridgeloop

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/syncclient"
	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// RT-32 (spec change 48): an address the wallet holds is never bad on its index alone, every create is saved before its
// addresses go out, and a circuit breaker stops a top-up that runs away.

// rt32Shape is the combined live session's step 2: a re-pair matching a wallet with claimedTop 1 and receivedTop 2.
func rt32Shape(t *testing.T) (*Loop, *fakeWallet, *fakeSite) {
	t.Helper()
	l, w, s, _ := setup(t)
	syncedNode(l, w)
	w.next = 2
	w.transfers[2] = []walletrpc.Transfer{tr('a', "1000", 2221990)}
	s.pool[1] = true
	s.claimed = 1
	s.probes = []syncclient.Probe{probeFor(1, fakeAddr(1))}
	return l, w, s
}

func noMismatch(t *testing.T, s *fakeSite) {
	t.Helper()
	for n, b := range s.bodies {
		if b.Checks != nil && b.Checks.Pool != nil && b.Checks.Pool.State != "ok" {
			t.Fatalf("body %d reported %+v", n, b.Checks.Pool)
		}
	}
}

func poolRange(t *testing.T, s *fakeSite, lo, hi uint32) {
	t.Helper()
	for i := lo; i <= hi; i++ {
		if !s.pool[i] {
			t.Fatalf("row %d is missing", i)
		}
	}
	if s.pool[hi+1] {
		t.Fatalf("row %d exists; the pool should end at %d", hi+1, hi)
	}
}

// restarted is the same wallet and site under a new process, which has forgotten receivedTop.
func restarted(t *testing.T, l *Loop) *Loop {
	t.Helper()
	n, err := New(l.o)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func TestRT32PoolCheck(t *testing.T) {
	t.Run("[R08][F08] [RT-32] step 2's live shape, claimedTop 1 and receivedTop 2: no address comes back bad and the top-up doesn't loop", func(t *testing.T) {
		l, w, s := rt32Shape(t)
		syncN(t, l, 20)
		noMismatch(t, s)
		poolRange(t, s, 3, 52)
		if w.created != 50 {
			t.Fatalf("created %d addresses; want 50", w.created)
		}
		if st := l.Status(); st.PoolCheck == nil || st.PoolCheck.State != "ok" {
			t.Fatalf("status %+v", st.PoolCheck)
		}
	})
	t.Run("[R08][F08] [RT-32] a bridge restart in the middle: receivedTop is gone, and the rows above the bound still check out", func(t *testing.T) {
		l, w, s := rt32Shape(t)
		syncN(t, l, 4)
		n := restarted(t, l)
		syncN(t, n, 10)
		noMismatch(t, s)
		poolRange(t, s, 3, 52)
		if w.created != 50 {
			t.Fatalf("created %d addresses; want 50", w.created)
		}
	})
	t.Run("[R08][F08] [RT-32] a switch to a used wallet with no match: claimedTop 0, receivedTop 5, no address comes back bad", func(t *testing.T) {
		l, w, s, _ := setup(t)
		syncedNode(l, w)
		w.next = 5
		w.transfers[5] = []walletrpc.Transfer{tr('b', "1000", 2221990)}
		s.probes = []syncclient.Probe{probeFor(0, thief)}
		syncN(t, l, 20)
		noMismatch(t, s)
		poolRange(t, s, 6, 55)
	})
	t.Run("[T03][R08][F08] [RT-32] a held index above the bound with another address is still bad; RT-27 stays closed", func(t *testing.T) {
		l, w, s, _ := setup(t)
		w.next = 200
		s.pool[1] = true
		s.claimed = 1
		syncN(t, l, 2)
		created := w.created
		s.forged[150] = thief
		s.pool[150] = true
		syncN(t, l, 2)
		if p := s.last().Checks.Pool; p == nil || p.State != "mismatch" || len(p.Bad) != 1 || p.Bad[0] != 150 {
			t.Fatalf("report %+v", p)
		}
		if w.created != created || w.rescans != 0 {
			t.Fatalf("created %d, rescans %d", w.created-created, w.rescans)
		}
	})
	t.Run("[R08][F08] [RT-32] the fixed shape, then a fresh install of the same wallet from keys: the new file holds only what it received, and no row comes back bad", func(t *testing.T) {
		l, _, s := rt32Shape(t)
		syncN(t, l, 6)
		poolRange(t, s, 3, 52)
		// The fresh install: a new wallet file up to the paid index, a new key, and a pairing, which drops the free rows.
		for i := range s.pool {
			if i > 1 {
				delete(s.pool, i)
			}
		}
		w2 := &fakeWallet{height: 2222000, next: 2, transfers: map[uint32][]walletrpc.Transfer{2: {tr('a', "1000", 2221990)}}}
		k, _ := syncsign.NewKey()
		o := l.o
		o.Key = k
		o.DataDir = t.TempDir()
		o.Wallet = func(context.Context) (Wallet, error) { return w2, nil }
		n, err := New(o)
		if err != nil {
			t.Fatal(err)
		}
		syncedNode(n, w2)
		s.probes = []syncclient.Probe{probeFor(1, fakeAddr(1))}
		s.bodies = nil
		syncN(t, n, 20)
		noMismatch(t, s)
		poolRange(t, s, 3, 52)
		if w2.created != 50 {
			t.Fatalf("created %d addresses; want 50", w2.created)
		}
	})
}

// sendGuard fails if an address goes out before the wallet was saved holding it.
type sendGuard struct {
	*fakeSite
	t *testing.T
	w *fakeWallet
}

func (g sendGuard) Send(ctx context.Context, k ed25519.PrivateKey, b syncclient.Body) (syncclient.Response, error) {
	for _, a := range b.Addresses {
		if a.Index > g.w.storedNext {
			g.t.Errorf("address %d went out with the wallet saved only up to %d", a.Index, g.w.storedNext)
		}
	}
	return g.fakeSite.Send(ctx, k, b)
}

func TestRT32Store(t *testing.T) {
	t.Run("[R08] [RT-32] top-up: the wallet is saved before its new addresses go out", func(t *testing.T) {
		l, w, s, _ := setup(t)
		l.o.Site = sendGuard{s, t, w}
		syncN(t, l, 3)
		if w.created == 0 || w.stores == 0 {
			t.Fatalf("created %d, stores %d", w.created, w.stores)
		}
	})
	t.Run("[R08] [RT-32] the probe's index 1: saved before it goes out", func(t *testing.T) {
		l, w, s, _ := setup(t)
		syncedNode(l, w)
		l.o.Site = sendGuard{s, t, w}
		s.probes = []syncclient.Probe{probeFor(0, thief)}
		syncN(t, l, 1) // answering the probe creates only index 1
		if w.created != 1 || w.storedNext != 1 {
			t.Fatalf("created %d, saved up to %d", w.created, w.storedNext)
		}
		syncN(t, l, 1) // it goes out, past the guard
	})
	t.Run("[R08][R09] [RT-32] catch-up: saved before the rescan, so a crash during it keeps the addresses", func(t *testing.T) {
		l, w, _, _ := reinstalled(t)
		var saved uint32
		w.onRescan = func() { saved = w.storedNext }
		syncN(t, l, 1)
		if saved < 262 {
			t.Fatalf("saved up to %d when the rescan began; want 262", saved)
		}
	})
	t.Run("[R08] [RT-32] a failed save: warned on Health, the addresses still go out, and the next sync tries again", func(t *testing.T) {
		l, w, s, _ := setup(t)
		w.storeErr = errors.New("disk full")
		syncN(t, l, 2)
		if len(s.pool) != 50 {
			t.Fatalf("%d rows on the site; want 50 despite the failed save", len(s.pool))
		}
		syncN(t, l, 1)
		if c := s.last().Checks; c == nil || c.Save == nil || c.Save.State != "failed" {
			t.Fatalf("checks %+v", c)
		}
		if !l.Status().StoreFailed {
			t.Fatal("status doesn't show the failed save")
		}
		w.storeErr = nil
		syncN(t, l, 2)
		if c := s.last().Checks; c != nil && c.Save != nil {
			t.Fatalf("still warning after a good save: %+v", c.Save)
		}
		if l.Status().StoreFailed {
			t.Fatal("status still shows the failed save")
		}
	})
}

func stopped(t *testing.T, s *fakeSite, reason string) {
	t.Helper()
	c := s.last().Checks
	if c == nil || c.TopUp == nil || c.TopUp.State != "stopped" || c.TopUp.Reason != reason {
		t.Fatalf("checks %+v, want topUp stopped with reason %q", c, reason)
	}
}

// siteDrops removes every free row without a report, as spec change 45's wrong-network and unreadable drops do.
func siteDrops(s *fakeSite) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ct := s.claimedTopNow()
	for i := range s.pool {
		if i > ct {
			delete(s.pool, i)
		}
	}
}

func TestRT32Breaker(t *testing.T) {
	t.Run("[R08][F08] [RT-32] trigger 1: an address the bridge just created comes back bad: reported, top-ups stop, payments keep syncing, a restart clears it", func(t *testing.T) {
		l, w, s, _ := setup(t)
		s.watch = []uint32{1}
		syncN(t, l, 2)
		s.forged[50] = thief // the bridge created 50 in this run
		syncN(t, l, 2)
		if p := s.last().Checks.Pool; p == nil || p.State != "mismatch" || p.Bad[0] != 50 {
			t.Fatalf("the mismatch wasn't reported: %+v", p)
		}
		// The site marks the row bad; it leaves the check list and the pool is one short.
		delete(s.forged, 50)
		delete(s.pool, 50)
		created := w.created
		s.bodies = nil
		syncN(t, l, 20)
		if w.created != created {
			t.Fatalf("created %d more after the breaker tripped", w.created-created)
		}
		stopped(t, s, "bad_created")
		if st := l.Status(); st.TopUpStopped != "bad_created" {
			t.Fatalf("status %q", st.TopUpStopped)
		}
		snapshots := 0
		for _, b := range s.bodies {
			snapshots += len(b.Snapshots)
		}
		if snapshots == 0 {
			t.Fatal("payments stopped syncing with the top-ups")
		}
		n := restarted(t, l)
		syncN(t, n, 2)
		if w.created == created {
			t.Fatal("a restart didn't clear the breaker")
		}
		if c := s.last().Checks; c != nil && c.TopUp != nil {
			t.Fatalf("still stopped after a restart: %+v", c.TopUp)
		}
	})
	t.Run("[T03][R08] [RT-32] a bad row the bridge didn't create in this run reports as before and doesn't trip the breaker", func(t *testing.T) {
		l, _, s, _ := setup(t)
		syncN(t, l, 2)
		n := restarted(t, l)
		syncN(t, n, 1)
		s.forged[20] = thief
		syncN(t, n, 2)
		if p := s.last().Checks.Pool; p == nil || p.State != "mismatch" {
			t.Fatalf("report %+v", p)
		}
		if n.Status().TopUpStopped != "" {
			t.Fatalf("tripped: %q", n.Status().TopUpStopped)
		}
	})
	t.Run("[F08] [RT-32] trigger 2: the site drops rows without reporting them: stops at 100 created", func(t *testing.T) {
		l, w, s, _ := setup(t)
		for i := 0; i < 30; i++ {
			syncN(t, l, 1)
			siteDrops(s)
		}
		if w.created != 100 {
			t.Fatalf("created %d; want exactly 100", w.created)
		}
		stopped(t, s, "too_many")
		if l.Status().TopUpStopped != "too_many" {
			t.Fatalf("status %q", l.Status().TopUpStopped)
		}
	})
	t.Run("[F08] [RT-32] trigger 2 resets when claimedTop rises", func(t *testing.T) {
		l, w, s, _ := setup(t)
		for i := 0; i < 2; i++ { // 50 delivered, dropped; 50 more on the way
			syncN(t, l, 1)
		}
		s.claimedTop, s.claimed = 50, 50 // tips used the first fill
		for i := 0; i < 4; i++ {
			syncN(t, l, 1)
		}
		if w.created <= 50 || l.Status().TopUpStopped != "" {
			t.Fatalf("created %d, stopped %q", w.created, l.Status().TopUpStopped)
		}
		// The same drops as above now take 100 more from the new base.
		base := w.created
		for i := 0; i < 30; i++ {
			siteDrops(s)
			syncN(t, l, 1)
		}
		if w.created-base > 100 {
			t.Fatalf("created %d after claimedTop rose", w.created-base)
		}
		stopped(t, s, "too_many")
	})
	t.Run("[F08] [RT-32] a new pairing clears the breaker and the count", func(t *testing.T) {
		l, w, s, _ := setup(t)
		for i := 0; i < 30; i++ {
			syncN(t, l, 1)
			siteDrops(s)
		}
		stopped(t, s, "too_many")
		k, _ := syncsign.NewKey()
		l.o.Key = k
		created := w.created
		syncN(t, l, 2)
		if w.created == created || l.Status().TopUpStopped != "" {
			t.Fatalf("created %d more, stopped %q", w.created-created, l.Status().TopUpStopped)
		}
	})
	t.Run("[F08][R09] [RT-32] a re-pair with a 359 catch-up and a 50 fill doesn't trip it: catch-up isn't pool creation", func(t *testing.T) {
		l, w, s, _ := setup(t)
		syncedNode(l, w)
		for i := uint32(1); i <= 359; i++ {
			s.pool[i] = true
		}
		s.claimed = 359
		s.probes = []syncclient.Probe{probeFor(0, fakeAddr(1))}
		syncN(t, l, 8)
		noMismatch(t, s)
		poolRange(t, s, 360, 409)
		if w.next != 409 {
			t.Fatalf("wallet at %d", w.next)
		}
		if st := l.Status().TopUpStopped; st != "" {
			t.Fatalf("tripped: %q", st)
		}
		if c := s.last().Checks; c != nil && c.TopUp != nil {
			t.Fatalf("topUp sent: %+v", c.TopUp)
		}
	})
}

// The bridge's side of contract/test-vectors/bridge-checks.json; the plugin reads the same file. The reasons come from
// the states the breaker really sets, so a renamed constant fails here.
func TestBridgeChecksVector(t *testing.T) {
	data, err := os.ReadFile("../../../contract/test-vectors/bridge-checks.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Cases []struct {
			Name   string
			Bridge struct {
				TopUpStopped string
				StoreFailed  bool
			}
			Wire map[string]any
		}
	}
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatal(err)
	}
	if len(v.Cases) != 5 {
		t.Fatalf("%d cases", len(v.Cases))
	}
	for _, c := range v.Cases {
		t.Run("[R08][F08] [RT-32] "+c.Name, func(t *testing.T) {
			l, _, _, _ := setup(t)
			l.mu.Lock()
			if c.Bridge.TopUpStopped != "" {
				l.stopTopUp(c.Bridge.TopUpStopped)
			}
			l.st.StoreFailed = c.Bridge.StoreFailed
			checks := &syncclient.Checks{}
			l.addBreakerChecks(checks)
			l.mu.Unlock()
			b, err := json.Marshal(checks)
			if err != nil {
				t.Fatal(err)
			}
			var got map[string]any
			if err := json.Unmarshal(b, &got); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, c.Wire) {
				t.Fatalf("sent %s, want %v", b, c.Wire)
			}
		})
	}
	for _, reason := range []string{stopBadCreated, stopTooMany} {
		found := false
		for _, c := range v.Cases {
			found = found || c.Bridge.TopUpStopped == reason
		}
		if !found {
			t.Errorf("the vector doesn't cover %q", reason)
		}
	}
}
