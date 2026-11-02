package bridgeloop

import (
	"context"
	"errors"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/noderpc"
	"github.com/dwightsabeast/coffer/bridge/internal/syncclient"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// RT-30 (46's live check, step 6): the bridge answered the site's wallet probe 35 ms after the wallet opened, 1.66
// million blocks behind its node, so receivedTop was 0 and index 1, paid three times, went into the pool. The probe is
// answered only once the wallet has scanned to its node's height and the node itself is synchronized and online.

// fakeNode is the wallet host's node as the loop's NodeInfo sees it.
type fakeNode struct {
	height  uint64
	synced  bool
	offline bool
	err     error
	calls   int
}

func (n *fakeNode) info(context.Context) (noderpc.Info, error) {
	n.calls++
	return noderpc.Info{NetType: "stagenet", Height: n.height, Synchronized: n.synced, Offline: n.offline}, n.err
}

// syncedNode gives the loop a node that is synchronized and level with the wallet, whatever its height becomes.
func syncedNode(l *Loop, w *fakeWallet) {
	l.o.NodeInfo = func(context.Context) (noderpc.Info, error) {
		return noderpc.Info{NetType: "stagenet", Height: w.height, Synchronized: true}, nil
	}
}

// noAnswer fails the test if any body so far carried a wallet answer, or the wallet was asked what it received.
func noAnswer(t *testing.T, w *fakeWallet, s *fakeSite) {
	t.Helper()
	for i, b := range s.bodies {
		if b.Wallet != nil {
			t.Fatalf("body %d carried an answer %+v", i, *b.Wallet)
		}
	}
	if len(s.answers) != 0 || w.receivedReads != 0 {
		t.Fatalf("answers %+v, ReceivedIndexes called %d times", s.answers, w.receivedReads)
	}
}

// oldPayments are index 1's three transfers in 46's step 6 (heights 2,230,085 to 2,240,100).
func oldPayments() []walletrpc.Transfer {
	return []walletrpc.Transfer{tr('a', "1000000000", 2230085), tr('b', "1000000000", 2230165), tr('c', "1000000000", 2240100)}
}

func TestProbeWaitsForTheScan(t *testing.T) {
	t.Run("[P02][R09] [RT-30] a wallet far behind its node doesn't answer; once scanned it answers receivedTop 1 and never sends index 1", func(t *testing.T) {
		l, w, s, _ := setup(t)
		n := &fakeNode{height: 2242155, synced: true}
		l.o.NodeInfo = n.info
		w.height, w.next = 579994, 0 // restored from keys: no subaddresses, nothing scanned
		s.probes = []syncclient.Probe{probeFor(0, thief)}
		syncN(t, l, 3)
		noAnswer(t, w, s)
		if w.created != 0 {
			t.Fatalf("created %d while the wallet scans", w.created)
		}
		if l.Soon() {
			t.Fatal("no hurry while the wallet scans: the normal interval")
		}
		// The scan reaches the node and finds index 1's old payments.
		w.height = 2242155
		w.transfers[1] = oldPayments()
		syncN(t, l, 2) // the answer is made, then sent
		if len(s.answers) != 1 || s.answers[0].Match != nil || s.answers[0].ReceivedTop != 1 {
			t.Fatalf("answers %+v", s.answers)
		}
		syncN(t, l, 3) // the site takes addresses now
		sent := 0
		for _, b := range s.bodies {
			for _, a := range b.Addresses {
				sent++
				if a.Index <= 1 {
					t.Fatalf("sent index %d, which has received before", a.Index)
				}
			}
		}
		if sent == 0 {
			t.Fatal("no addresses sent after the answer")
		}
	})
	t.Run("[P02][R09] [RT-30] a node still catching up: no answer, even with the wallet level with it, until it is synchronized and the wallet has caught up", func(t *testing.T) {
		l, w, s, _ := setup(t)
		n := &fakeNode{height: 94954}
		l.o.NodeInfo = n.info
		w.height = 94954
		s.probes = []syncclient.Probe{probeFor(0, fakeAddr(1))}
		syncN(t, l, 2)
		noAnswer(t, w, s)
		n.height, n.synced = 2242155, true // synchronized, the wallet not yet caught up
		syncN(t, l, 2)
		noAnswer(t, w, s)
		w.height = 2242155
		syncN(t, l, 2)
		if len(s.answers) != 1 || s.answers[0].Match == nil || *s.answers[0].Match != 0 {
			t.Fatalf("answers %+v", s.answers)
		}
	})
	t.Run("[P02][R09] [RT-30] a node that doesn't answer, or is offline: no answer", func(t *testing.T) {
		for name, n := range map[string]*fakeNode{
			"error":   {height: 2222000, synced: true, err: errors.New("connection refused")},
			"offline": {height: 2222000, synced: true, offline: true},
		} {
			l, w, s, _ := setup(t)
			l.o.NodeInfo = n.info
			s.probes = []syncclient.Probe{probeFor(0, fakeAddr(1))}
			syncN(t, l, 3)
			if len(s.answers) != 0 || w.receivedReads != 0 {
				t.Fatalf("%s: answers %+v", name, s.answers)
			}
		}
	})
	t.Run("[P02][R09] [RT-30] no node to ask: no answer (fail closed)", func(t *testing.T) {
		l, w, s, _ := setup(t)
		s.probes = []syncclient.Probe{probeFor(0, fakeAddr(1))}
		syncN(t, l, 3)
		noAnswer(t, w, s)
	})
	t.Run("[P02][R09] [RT-30] the node is read fresh while the site waits, not from the wallet check's one-minute cache", func(t *testing.T) {
		l, w, s, _ := setup(t)
		n := &fakeNode{height: w.height, synced: true}
		l.o.NodeInfo = n.info
		syncN(t, l, 1) // not waiting: the wallet check caches the node at the wallet's height
		n.height = w.height + 1
		s.probes = []syncclient.Probe{probeFor(0, fakeAddr(1))} // the same clock: well inside the minute
		syncN(t, l, 2)
		noAnswer(t, w, s)
		if n.calls < 2 {
			t.Fatalf("node asked %d times", n.calls)
		}
	})
	t.Run("[P02][R09] [RT-30] a wallet ahead of its node (the node restarting) answers", func(t *testing.T) {
		l, w, s, _ := setup(t)
		l.o.NodeInfo = (&fakeNode{height: w.height - 3, synced: true}).info
		s.probes = []syncclient.Probe{probeFor(0, fakeAddr(1))}
		syncN(t, l, 2)
		if len(s.answers) != 1 {
			t.Fatalf("answers %+v", s.answers)
		}
	})
}
