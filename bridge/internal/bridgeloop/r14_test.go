package bridgeloop

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/selfupdate"
	"github.com/dwightsabeast/coffer/bridge/internal/syncclient"
	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// R14 (spec change 59 item 4, Wyatt 2026-11-20): a 502, 503 or 504 is the site being down. It counts as unreachable,
// and unreachable time pauses the update guard's clock; a 500 or a 4xx is still a refusal.

func clockLoop(t *testing.T) (*Loop, *fakeSite, *time.Time) {
	t.Helper()
	w := &fakeWallet{height: 2222000, transfers: map[uint32][]walletrpc.Transfer{}}
	s := &fakeSite{pool: map[uint32]bool{}, target: 50, forged: map[uint32]string{}}
	k, _ := syncsign.NewKey()
	clock := time.Unix(1790000000, 0)
	l, err := New(Options{Wallet: func(context.Context) (Wallet, error) { return w, nil }, Site: s, Key: k, DataDir: t.TempDir(), Now: func() time.Time { return clock }})
	if err != nil {
		t.Fatal(err)
	}
	return l, s, &clock
}

var (
	notReady = &syncclient.Error{Code: "STORAGE_INDEXES_NOT_READY", Status: 503}
	crashed  = &syncclient.Error{Code: "INTERNAL_ERROR", Status: 500}
)

// health is the update guard's view, built the way cmd/xmr-bridge's watchPending builds it.
func health(l *Loop, now time.Time) selfupdate.Health {
	st := l.Status()
	return selfupdate.Health{WalletOpen: true, Synced: st.Synced, SiteRefused: st.SiteRefused, Unreachable: st.Unreachable, UnreachableFor: st.UnreachableFor(now)}
}

func TestR14Outcomes(t *testing.T) {
	t.Run("[R14] a 503 counts as unreachable, not as the site refusing, and the time until the site answers again is recorded", func(t *testing.T) {
		l, s, clock := clockLoop(t)
		s.fail = notReady
		l.SyncOnce(context.Background())
		if st := l.Status(); st.Unreachable != 1 || st.SiteRefused != 0 {
			t.Fatalf("unreachable %d, refused %d", st.Unreachable, st.SiteRefused)
		}
		*clock = clock.Add(5 * time.Minute)
		l.SyncOnce(context.Background())
		if got := l.Status().UnreachableFor(*clock); got != 5*time.Minute {
			t.Errorf("unreachable for %v, want 5m (still down)", got)
		}
		*clock = clock.Add(time.Minute)
		s.fail = nil
		l.SyncOnce(context.Background())
		later := clock.Add(time.Hour)
		if st := l.Status(); st.Synced == 0 || st.UnreachableFor(later) != 6*time.Minute {
			t.Errorf("synced %d, unreachable for %v; want a sync and 6m", st.Synced, st.UnreachableFor(later))
		}
	})
	t.Run("[R14] a 500 and a 4xx still count as the site refusing, and pause nothing", func(t *testing.T) {
		l, s, clock := clockLoop(t)
		for _, e := range []error{crashed, &syncclient.Error{Code: "INVALID_BODY", Status: 400}} {
			s.fail = e
			l.SyncOnce(context.Background())
			*clock = clock.Add(time.Minute)
		}
		if st := l.Status(); st.SiteRefused != 2 || st.Unreachable != 0 || st.UnreachableFor(*clock) != 0 {
			t.Errorf("refused %d, unreachable %d for %v", st.SiteRefused, st.Unreachable, st.UnreachableFor(*clock))
		}
	})
}

// The guard over time: one sync attempt a minute, the guard asked after each, as watchPending does every 15 s.
func TestR14UpdateGuard(t *testing.T) {
	run := func(l *Loop, s *fakeSite, clock *time.Time, p selfupdate.Pending, minutes int, fail func(int) error) (selfupdate.Action, int) {
		for m := 1; m <= minutes; m++ {
			s.fail = fail(m)
			l.SyncOnce(context.Background())
			*clock = clock.Add(time.Minute)
			if a := selfupdate.Decide(p, health(l, *clock), *clock); a != selfupdate.Wait {
				return a, m
			}
		}
		return selfupdate.Wait, minutes
	}
	pending := func(clock *time.Time) selfupdate.Pending {
		return selfupdate.Pending{Kind: selfupdate.KindBridge, Version: "0.2.0", Previous: "0.1.0", At: *clock}
	}
	t.Run("[R14] an hour of 503 STORAGE_INDEXES_NOT_READY during a bridge update doesn't roll it back, so the version is never refused", func(t *testing.T) {
		l, s, clock := clockLoop(t)
		p := pending(clock)
		if a, m := run(l, s, clock, p, 60, func(int) error { return notReady }); a != selfupdate.Wait {
			t.Fatalf("minute %d: %v; a version is refused only after a rollback, so a 503 must never roll back", m, a)
		}
		s.fail = nil
		l.SyncOnce(context.Background())
		if a := selfupdate.Decide(p, health(l, *clock), *clock); a != selfupdate.Commit {
			t.Errorf("once the site answers: %v, want commit", a)
		}
	})
	t.Run("[R14] 502 and 504 never roll it back either", func(t *testing.T) {
		for _, status := range []int{502, 504} {
			l, s, clock := clockLoop(t)
			if a, m := run(l, s, clock, pending(clock), 60, func(int) error { return &syncclient.Error{Code: "HTTP_" + strconv.Itoa(status), Status: status} }); a != selfupdate.Wait {
				t.Errorf("%d: minute %d: %v", status, m, a)
			}
		}
	})
	t.Run("[R14] 10 minutes of HTTP 500 roll it back", func(t *testing.T) {
		l, s, clock := clockLoop(t)
		if a, m := run(l, s, clock, pending(clock), 30, func(int) error { return crashed }); a != selfupdate.RollBack || m != 10 {
			t.Errorf("got %v at minute %d, want a rollback at minute 10", a, m)
		}
	})
	t.Run("[R14] 503 time pauses the clock: a 500, 19 minutes of 503, then 500s roll back only after 10 minutes of reachable time", func(t *testing.T) {
		l, s, clock := clockLoop(t)
		fail := func(m int) error {
			if m >= 2 && m <= 20 {
				return notReady
			}
			return crashed
		}
		a, m := run(l, s, clock, pending(clock), 60, fail)
		// Reachable minutes: 1 (the first 500), then from minute 21 on. The 503 streak runs from the minute-2 attempt to
		// the minute-21 attempt, 19 minutes, so 10 reachable minutes end at minute 29.
		if a != selfupdate.RollBack || m != 29 {
			t.Errorf("got %v at minute %d, want a rollback at minute 29", a, m)
		}
	})
}
