package bridgeloop

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/syncclient"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// Spec change 46 on the bridge: the probe answer, the pool check, and numbering cues only from rows the site handed
// out (claimedTop; Wyatt's review, 2026-11-01).

const thief = "9THIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFTHIEFT"

func syncN(t *testing.T, l *Loop, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		if err := l.SyncOnce(context.Background()); err != nil {
			t.Fatalf("sync %d: %v", i, err)
		}
	}
}

func probeFor(wallet int, address string) syncclient.Probe {
	return syncclient.Probe{Wallet: wallet, Index: 1, Digest: syncclient.AddressDigest(address)}
}

func TestProbeAnswer(t *testing.T) {
	t.Run("[T03][P02] a fresh wallet answering a probe creates only index 1, and answers no match with its index-1 digest", func(t *testing.T) {
		l, w, s, _ := setup(t)
		s.probes = []syncclient.Probe{probeFor(0, thief)}
		syncN(t, l, 1)
		if w.created != 1 || w.next != 1 || w.probedMax > 1 {
			t.Fatalf("answering: created %d, wallet at %d, probed up to %d", w.created, w.next, w.probedMax)
		}
		syncN(t, l, 1)
		if len(s.answers) != 1 || s.answers[0].Match != nil || s.answers[0].ReceivedTop != 0 {
			t.Fatalf("answers %+v", s.answers)
		}
		if got := s.bodies[1].ProbeDigest; got != syncclient.AddressDigest(fakeAddr(1)) {
			t.Fatalf("probeDigest %q", got)
		}
	})
	t.Run("[T03][P02] the same wallet with history matches, with its highest received index", func(t *testing.T) {
		l, w, s, _ := setup(t)
		w.next = 405
		w.transfers[300] = []walletrpc.Transfer{tr('a', "1000", 2221990)}
		s.probes = []syncclient.Probe{probeFor(1, thief), probeFor(0, fakeAddr(1))}
		syncN(t, l, 2)
		if w.created != 0 {
			t.Fatalf("created %d", w.created)
		}
		if len(s.answers) != 1 || s.answers[0].Match == nil || *s.answers[0].Match != 0 || s.answers[0].ReceivedTop != 300 {
			t.Fatalf("answers %+v", s.answers)
		}
	})
	t.Run("[T03][P02] the same wallet restored from keys with nothing received still matches", func(t *testing.T) {
		l, w, s, _ := setup(t)
		w.next = 0 // a fresh restore: no subaddresses yet
		s.probes = []syncclient.Probe{probeFor(0, fakeAddr(1))}
		syncN(t, l, 1)
		if w.created != 1 {
			t.Fatalf("answering: created %d", w.created)
		}
		syncN(t, l, 1)
		if len(s.answers) != 1 || s.answers[0].Match == nil || *s.answers[0].Match != 0 {
			t.Fatalf("answers %+v", s.answers)
		}
	})
	t.Run("[T03][P02] while the site waits: no addresses sent or created, pending kept, no catch-up", func(t *testing.T) {
		l, w, s, _ := setup(t)
		l.pending = []syncclient.Address{{Index: 7, Address: fakeAddr(7)}}
		w.next = 7
		s.probes, s.keepWaiting = []syncclient.Probe{probeFor(0, thief)}, true
		s.claimedTop = 300 // ignored while waiting: no catch-up from it
		syncN(t, l, 1)     // carries pending 7; the waiting site doesn't take it, so it stays pending
		if len(l.pending) != 1 || w.created != 0 || w.rescans != 0 {
			t.Fatalf("after the first: pending %d, created %d, rescans %d", len(l.pending), w.created, w.rescans)
		}
		syncN(t, l, 1)
		if b := s.last(); len(b.Addresses) != 0 || w.created != 0 || len(l.pending) != 1 || w.rescans != 0 {
			t.Fatalf("sent %d addresses, created %d, pending %d, rescans %d", len(b.Addresses), w.created, len(l.pending), w.rescans)
		}
		if !l.Soon() {
			t.Fatal("the answer should go at once")
		}
	})
	t.Run("[P02] after a match, the wallet's unused addresses above the matched wallet's claimedTop are re-offered first", func(t *testing.T) {
		l, w, s, _ := setup(t)
		w.next = 405
		w.transfers[360] = []walletrpc.Transfer{tr('b', "1000", 2221990)}
		for i := uint32(1); i <= 356; i++ {
			s.pool[i] = true
		}
		s.claimedTop, s.claimed = 356, 356
		s.probes = []syncclient.Probe{probeFor(0, fakeAddr(1))}
		syncN(t, l, 3) // the waiting response (claimedTop 0), the answer, then the re-offer
		var sent []uint32
		for _, b := range s.bodies {
			for _, a := range b.Addresses {
				sent = append(sent, a.Index)
			}
		}
		if len(sent) == 0 || sent[0] != 357 {
			t.Fatalf("first address sent %v; want 357 (above claimedTop 356, not above the waiting response's 0)", sent)
		}
		for _, i := range sent {
			if i == 360 || i <= 356 {
				t.Fatalf("sent %d (paid, or at or below claimedTop): %v", i, sent)
			}
		}
		// 48 unused (357-405 but 360) are re-offered; only the last 2 of the 50 are new.
		if w.created != 2 {
			t.Fatalf("created %d new addresses; want 2 beside the 48 re-offered", w.created)
		}
	})
	t.Run("[T03][P02] probeDigest is sent until a sync carrying it succeeds (Wyatt): a failed first sync doesn't lose it", func(t *testing.T) {
		l, w, s, _ := setup(t)
		w.next = 50 // a wallet with addresses, paired to a site with no history
		s.fail = errors.New("the site can't be reached")
		l.SyncOnce(context.Background())
		s.fail = nil
		syncN(t, l, 2)
		want := syncclient.AddressDigest(fakeAddr(1))
		if s.bodies[0].ProbeDigest != want || s.bodies[1].ProbeDigest != want {
			t.Fatalf("probeDigest in the failed and the next sync: %q, %q", s.bodies[0].ProbeDigest, s.bodies[1].ProbeDigest)
		}
		if s.bodies[2].ProbeDigest != "" {
			t.Fatalf("still sent after a sync carrying it succeeded: %q", s.bodies[2].ProbeDigest)
		}
	})
}

func TestPoolCheck(t *testing.T) {
	t.Run("[T03][R08] an honest pool is reported ok", func(t *testing.T) {
		l, _, s, _ := setup(t)
		syncN(t, l, 3)
		if p := s.last().Checks.Pool; p == nil || p.State != "ok" || len(p.Bad) != 0 {
			t.Fatalf("pool report %+v", p)
		}
		if st := l.Status(); st.PoolCheck == nil || st.PoolCheck.State != "ok" {
			t.Fatalf("status %+v", st.PoolCheck)
		}
	})
	t.Run("[T03][R08] a row the wallet holds with another address: mismatch, at once, in a report-only sync", func(t *testing.T) {
		l, w, s, _ := setup(t)
		syncN(t, l, 2) // 50 addresses delivered
		s.forged[20] = thief
		l.SyncOnce(context.Background())
		if !l.Soon() {
			t.Fatal("a mismatch should be reported at once")
		}
		created := w.created
		l.SyncOnce(context.Background())
		b := s.last()
		if b.Checks == nil || b.Checks.Pool == nil || b.Checks.Pool.State != "mismatch" || len(b.Checks.Pool.Bad) != 1 || b.Checks.Pool.Bad[0] != 20 {
			t.Fatalf("report %+v", b.Checks)
		}
		if len(b.Snapshots) != 0 || len(b.Addresses) != 0 || w.created != created {
			t.Fatalf("a report-only sync carried %d snapshots, %d addresses, created %d", len(b.Snapshots), len(b.Addresses), w.created-created)
		}
	})
	t.Run("[T03][R08] at most 20 bad indexes per report", func(t *testing.T) {
		l, _, s, _ := setup(t)
		syncN(t, l, 2)
		for i := uint32(1); i <= 30; i++ {
			s.forged[i] = thief
		}
		syncN(t, l, 2)
		if p := s.last().Checks.Pool; p == nil || p.State != "mismatch" || len(p.Bad) != syncclient.MaxBad {
			t.Fatalf("report %+v", p)
		}
	})
	t.Run("[T03][R08][F08] a forged free row far above the wallet's highest: nothing created, reported bad within one sync", func(t *testing.T) {
		l, w, s, _ := setup(t)
		syncN(t, l, 2)
		created := w.created
		s.forged[99_999] = thief
		s.pool[99_999] = true
		syncN(t, l, 2)
		if w.created != created || w.rescans != 0 {
			t.Fatalf("created %d, rescans %d", w.created-created, w.rescans)
		}
		if p := s.last().Checks.Pool; p == nil || p.State != "mismatch" || len(p.Bad) != 1 || p.Bad[0] != 99_999 {
			t.Fatalf("report %+v", p)
		}
	})
	t.Run("[T03][R09] a wallet restored from keys at re-pair catches up to claimedTop and flags none of the site's honest rows", func(t *testing.T) {
		l, w, s, _ := reinstalled(t) // claimed 1-262, free 263-312, wallet at 10
		syncN(t, l, 3)
		for _, b := range s.bodies {
			if b.Checks != nil && b.Checks.Pool != nil && b.Checks.Pool.State != "ok" {
				t.Fatalf("an honest row was flagged: %+v", b.Checks.Pool)
			}
		}
		if w.next < 262 || w.rescans != 1 {
			t.Fatalf("wallet at %d, rescans %d", w.next, w.rescans)
		}
		if p := s.last().Checks.Pool; p == nil || p.State != "ok" {
			t.Fatalf("after the catch-up: %+v", p)
		}
	})
	t.Run("[T03][R08] a forged row at an index the wallet holds is reported before a catch-up runs", func(t *testing.T) {
		l, w, s, _ := reinstalled(t)
		s.forged[5] = thief // the wallet (at 10) holds index 5
		rescansAtReport := -1
		l.SyncOnce(context.Background())
		l.SyncOnce(context.Background())
		for _, b := range s.bodies {
			if b.Checks != nil && b.Checks.Pool != nil && b.Checks.Pool.State == "mismatch" {
				rescansAtReport = w.rescans
				break
			}
		}
		if rescansAtReport != 0 {
			t.Fatalf("the mismatch went out after %d rescans (-1: never)", rescansAtReport)
		}
	})
	t.Run("[T03] no report to an older plugin that sends no check list", func(t *testing.T) {
		l, _, s, _ := setup(t)
		s.noCheck = true
		syncN(t, l, 3)
		if b := s.last(); b.Checks != nil && b.Checks.Pool != nil {
			t.Fatalf("report %+v", b.Checks.Pool)
		}
	})
}

func TestClaimedTopDrivesNumbering(t *testing.T) {
	t.Run("[T03][F08] free rows above claimedTop (which a key thief can add) never start a catch-up", func(t *testing.T) {
		l, w, s, _ := setup(t)
		s.noCheck = true
		for i := uint32(1); i <= 5000; i++ {
			s.pool[i] = true
		}
		s.target = 0
		syncN(t, l, 2)
		if w.created != 0 || w.probedMax > 1 || w.rescans != 0 {
			t.Fatalf("created %d, probed up to %d, rescans %d", w.created, w.probedMax, w.rescans)
		}
	})
}

func TestSeqStaysNearTheClock(t *testing.T) {
	t.Run("[T04] seq stays within 300 s of the clock the request is signed with, the bump past lastSeq included", func(t *testing.T) {
		l, _, s, _ := setup(t)
		clock := time.Unix(1790000000, 0)
		l.o.Now = func() time.Time { return clock }
		syncN(t, l, 1)
		clock = clock.Add(-time.Minute) // a small step back: seq is bumped past the last one
		syncN(t, l, 1)
		for _, b := range s.bodies {
			if d := b.Seq - clock.UnixMilli(); d < -300_000 || d > 300_000 {
				t.Fatalf("seq %d is %d ms from the clock", b.Seq, d)
			}
		}
	})
}
