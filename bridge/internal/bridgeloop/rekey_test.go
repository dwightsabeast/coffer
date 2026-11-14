package bridgeloop

import (
	"context"
	"crypto/ed25519"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/syncclient"
	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
)

// 46's step 5b, the bridge side (Wyatt, 2026-11-02): `xmr-bridge pair` saves a new key while the service runs. A body
// built under the old pairing is never sent, under either key: a stale pool-check "mismatch" would raise the sticky
// banner on the new pairing, and its snapshots follow the old watch list. The next send is a fresh body under the new key.

// rekeyed gives the loop a key file it reads on every sync; switch changes it, as `xmr-bridge pair` does.
func rekeyed(t *testing.T, l *Loop) (old, next ed25519.PrivateKey, switchKey func()) {
	t.Helper()
	old, _ = syncsign.NewKey()
	next, _ = syncsign.NewKey()
	cur := old
	l.o.Key = nil
	l.o.LoadKey = func() (ed25519.PrivateKey, error) { return cur, nil }
	return old, next, func() { cur = next }
}

// staleMismatch is a pool report from the old pairing, not yet sent.
func staleMismatch(l *Loop) {
	l.mu.Lock()
	l.report = &syncclient.PoolReport{State: "mismatch", Bad: []uint32{7}}
	l.mu.Unlock()
}

func TestNewKeyMidSync(t *testing.T) {
	t.Run("[T03][R08] the key file changes during the rescan: the old pairing's body is never sent; the next is fresh, under the new key", func(t *testing.T) {
		l, w, s, _ := setup(t)
		old, next, switchKey := rekeyed(t, l)
		syncN(t, l, 1) // learn, under the old key
		// An unfinished catch-up (the marker from a restart): the next sync rescans before it builds its body.
		l.mu.Lock()
		l.catchup = 300
		l.mu.Unlock()
		s.claimedTop = 300
		staleMismatch(l)
		w.onRescan = switchKey
		before := len(s.bodies)
		if err := l.SyncOnce(context.Background()); err != nil {
			t.Fatal(err)
		}
		for i := before; i < len(s.bodies); i++ {
			if s.signers[i] == keyText(old) {
				t.Fatalf("body %d was signed with the old key after the pairing", i)
			}
			if b := s.bodies[i]; b.Checks != nil && b.Checks.Pool != nil {
				t.Fatalf("body %d carried the old pairing's pool report %+v", i, *b.Checks.Pool)
			}
		}
		if !l.Soon() {
			t.Fatal("a fresh sync should follow at once")
		}
		syncN(t, l, 1)
		if got := s.signers[len(s.signers)-1]; got != keyText(next) {
			t.Fatal("the next send isn't signed with the new key")
		}
		if b := s.last(); b.Checks != nil && b.Checks.Pool != nil {
			t.Fatalf("the fresh body carried the old pairing's pool report %+v", *b.Checks.Pool)
		}
	})
	t.Run("[T03][R08] a new key between syncs: the old pairing's report and probe answer aren't sent under it", func(t *testing.T) {
		l, _, s, _ := setup(t)
		_, next, switchKey := rekeyed(t, l)
		syncN(t, l, 1)
		staleMismatch(l)
		l.mu.Lock()
		m := 0
		l.answer = &syncclient.WalletAnswer{Match: &m}
		l.mu.Unlock()
		switchKey()
		syncN(t, l, 1)
		b := s.last()
		if s.signers[len(s.signers)-1] != keyText(next) {
			t.Fatal("not signed with the new key")
		}
		if (b.Checks != nil && b.Checks.Pool != nil) || b.Wallet != nil {
			t.Fatalf("sent the old pairing's report %+v or answer %+v", b.Checks, b.Wallet)
		}
	})
	t.Run("[T03][R08] the mismatch fast path: a key changed before the report goes out drops the report", func(t *testing.T) {
		l, _, s, _ := setup(t)
		_, next, switchKey := rekeyed(t, l)
		syncN(t, l, 1)
		staleMismatch(l)
		l.mu.Lock()
		l.reportNow = true
		l.mu.Unlock()
		switchKey()
		syncN(t, l, 1)
		for i, b := range s.bodies[1:] {
			if b.Checks != nil && b.Checks.Pool != nil {
				t.Fatalf("body %d carried the old pairing's report", i+1)
			}
		}
		if s.signers[len(s.signers)-1] != keyText(next) {
			t.Fatal("not signed with the new key")
		}
	})
}
