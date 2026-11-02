package bridgeloop

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/crosscheck"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// Spec change 47 on the bridge (RT-26; Wyatt's D1 and D2, 2026-11-02): with a remote node the reported height is the
// wallet's while it is at most 10 blocks above a second node's, else the second node's, from the first such sync. Health's
// node check says "mismatch" only after 5 minutes of it. With no second node answering the bridge reports no height (0:
// the site keeps its own) and the node check is "unavailable". The shop's own node is unchanged.

// remote gives the loop a remote node whose second node is at *second (ok false: none answers), and a movable clock.
func remote(l *Loop, second *uint64, ok *bool) (*fakeCheck, *time.Time) {
	fc := &fakeCheck{second: func() (uint64, bool) { return *second, *ok }, payment: &crosscheck.Report{State: crosscheck.OK, Detail: "no mined payments to check"}}
	l.o.CrossCheck = fc
	l.payCheck = crosscheck.Report{State: crosscheck.OK, Detail: "no mined payments checked yet"} // as New sets it with a CrossCheck
	clock := time.Unix(1790000000, 0)
	l.o.Now = func() time.Time { return clock }
	return fc, &clock
}

func sync1(t *testing.T, l *Loop, s *fakeSite) (uint64, string, string) {
	t.Helper()
	if err := l.SyncOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	b := s.last()
	if b.Checks == nil || b.Checks.Node == nil {
		t.Fatalf("no node check: %+v", b.Checks)
	}
	return b.Height, b.Checks.Node.State, b.Checks.Node.Detail
}

func TestHeightBoundedBySecondNode(t *testing.T) {
	t.Run("[T14] [RT-26] the edge: 10 blocks above the second node is reported as is, 11 is clamped", func(t *testing.T) {
		l, w, s, _ := setup(t)
		second, ok := w.height-10, true
		remote(l, &second, &ok)
		if h, _, _ := sync1(t, l, s); h != w.height {
			t.Fatalf("10 ahead: reported %d, wallet %d", h, w.height)
		}
		second--
		l.mu.Lock()
		l.secondAt = time.Time{} // a fresh read, as the minute has passed
		l.mu.Unlock()
		if h, _, _ := sync1(t, l, s); h != second {
			t.Fatalf("11 ahead: reported %d, second node %d", h, second)
		}
	})
	t.Run("[T14] [RT-26] Health says mismatch only after 5 minutes ahead, and clears when they agree", func(t *testing.T) {
		l, w, s, _ := setup(t)
		second, ok := w.height-100, true
		_, clock := remote(l, &second, &ok)
		h, state, _ := sync1(t, l, s)
		if h != second || state != "ok" {
			t.Fatalf("first sync ahead: height %d, node check %s", h, state)
		}
		*clock = clock.Add(4*time.Minute + 59*time.Second)
		if h, state, _ = sync1(t, l, s); h != second || state != "ok" {
			t.Fatalf("at 4:59: height %d, node check %s", h, state)
		}
		*clock = clock.Add(time.Second)
		h, state, detail := sync1(t, l, s)
		if h != second || state != "mismatch" || !strings.Contains(detail, "100 blocks above") || !strings.Contains(detail, "second.example:38089") {
			t.Fatalf("at 5:00: height %d, node check %s %q", h, state, detail)
		}
		if st := l.Status(); st.NodeCheck.State != crosscheck.Mismatch || st.WalletHeight != w.height {
			t.Fatalf("status: node check %+v, wallet height %d", st.NodeCheck, st.WalletHeight)
		}
		second = w.height
		*clock = clock.Add(time.Minute)
		if h, state, _ = sync1(t, l, s); h != w.height || state != "ok" {
			t.Fatalf("agreeing again: height %d, node check %s", h, state)
		}
	})
	t.Run("[T14] [RT-26] no second node answers: no height (0) and the node check is unavailable", func(t *testing.T) {
		l, _, s, _ := setup(t)
		second, ok := uint64(0), false
		remote(l, &second, &ok)
		h, state, detail := sync1(t, l, s)
		if h != 0 || state != "unavailable" || !strings.Contains(detail, "no chain height") {
			t.Fatalf("height %d, node check %s %q", h, state, detail)
		}
	})
	t.Run("[T14] [RT-26] a stale second height is asked again before clamping; otherwise at most once a minute", func(t *testing.T) {
		l, w, s, _ := setup(t)
		second, ok := w.height, true
		fc, clock := remote(l, &second, &ok)
		sync1(t, l, s)
		*clock = clock.Add(30 * time.Second)
		sync1(t, l, s) // level: the cached height is used
		if fc.secondCalls != 1 {
			t.Fatalf("second node asked %d times within the minute", fc.secondCalls)
		}
		w.height += 15 // past the cached height + 10
		second += 12   // but the second node has moved too
		if h, _, _ := sync1(t, l, s); h != w.height || fc.secondCalls != 2 {
			t.Fatalf("reported %d (wallet %d), second node asked %d times", h, w.height, fc.secondCalls)
		}
	})
	t.Run("[T14] [RT-26] a payment-block mismatch keeps precedence over the height's", func(t *testing.T) {
		l, w, s, _ := setup(t)
		second, ok := w.height-100, true
		fc, clock := remote(l, &second, &ok)
		fc.payment = nil // the payment check finds a different block
		s.target, s.watch = 0, []uint32{5}
		w.transfers[5] = []walletrpc.Transfer{tr('a', "1000", 100)}
		sync1(t, l, s)
		sync1(t, l, s)
		*clock = clock.Add(6 * time.Minute)
		if _, state, detail := sync1(t, l, s); state != "mismatch" || detail != "block 100 differs" {
			t.Fatalf("node check %s %q", state, detail)
		}
	})
}
