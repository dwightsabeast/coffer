package crosscheck

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// Wyatt, 2026-11-02 (spec change 13 amended again):
// - the mainnet list is https only, with the certificate checked, and the checker never falls back to plain http (a
//   redirect is refused);
// - second nodes are skipped by operator, not only by the configured node's exact host;
// - on a mismatch, one more second node from a different operator is asked before the payment is held.
// Stagenet keeps its http nodes: only the configured live-step node has a certificate that verifies
// (~/xmr-pay-dev-data/stagenet-second-nodes-https-probe-2026-11-02.txt).

// fixed makes a checker's order and operators deterministic: seconds in the given order, and each URL's operator from
// ops (test servers all share 127.0.0.1).
func fixed(c *Checker, ops map[string]string) {
	c.order = func([]string) {}
	c.operatorOf = func(u string) string {
		if op, ok := ops[u]; ok {
			return op
		}
		return operatorOf(u)
	}
	// The primary's operator as the hook sees it, so the seconds list is filtered the same way.
	c.seconds = c.secondsFor(c.primary)
}

func TestMainnetList(t *testing.T) {
	t.Run("[T14] the mainnet list is the three https nodes with certificates that verified (Wyatt, 2026-11-02)", func(t *testing.T) {
		want := []string{"https://node.monerodevs.org:18089", "https://xmr-node.cakewallet.com:18081", "https://ravfx.its-a-node.org:18081"}
		got := DefaultNodes("mainnet")
		if strings.Join(got, " ") != strings.Join(want, " ") {
			t.Fatalf("mainnet list %v", got)
		}
	})
	t.Run("[T14] on mainnet a plain-http second node is never used, whatever the list says", func(t *testing.T) {
		c := New("https://shop-node.example:18081", "mainnet", []string{"http://plain.example:18081", "https://tls.example:18089"}, nil)
		if len(c.seconds) != 1 || c.seconds[0] != "https://tls.example:18089" {
			t.Fatalf("second nodes %v", c.seconds)
		}
	})
	t.Run("[T14] a redirect from a second node is refused, so https never falls back to http", func(t *testing.T) {
		target := chain(110).serve(t)
		redir := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, target.URL+r.URL.Path, http.StatusTemporaryRedirect)
		}))
		t.Cleanup(redir.Close)
		c := New(asLocalhost(chain(110).serve(t).URL), "stagenet", []string{redir.URL}, nil)
		if _, _, ok := c.SecondHeight(context.Background()); ok {
			t.Fatal("followed a redirect to another node")
		}
	})
}

func TestOperators(t *testing.T) {
	t.Run("[T14] an operator is its domain's last two labels; an IP address or a single label is its own", func(t *testing.T) {
		for u, want := range map[string]string{
			"https://xmr-node.cakewallet.com:18081": "cakewallet.com",
			"http://node2.monerodevs.org:38089":     "monerodevs.org",
			"https://Node.MoneroDevs.org.:18089":    "monerodevs.org",
			"http://192.0.2.7:18081":                "192.0.2.7",
			"http://[2001:db8::1]:18081":            "2001:db8::1",
			"http://localhost:18081":                "localhost",
		} {
			if got := operatorOf(u); got != want {
				t.Errorf("%s: %q, want %q", u, got, want)
			}
		}
	})
	t.Run("[T14] a second node run by the configured node's operator is skipped, not only the same host", func(t *testing.T) {
		c := New("http://node.monerodevs.org:38089", "stagenet", DefaultNodes("stagenet"), nil)
		for _, s := range c.seconds {
			if operatorOf(s) == "monerodevs.org" {
				t.Fatalf("%s can vouch for its own operator's node: %v", s, c.seconds)
			}
		}
		// The public-node live step (configured kernal) keeps four other operators.
		c = New("https://stagenet.xmr.kernal.eu:38089", "stagenet", DefaultNodes("stagenet"), nil)
		ops := map[string]bool{}
		for _, s := range c.seconds {
			ops[operatorOf(s)] = true
		}
		if len(ops) != 4 || ops["kernal.eu"] {
			t.Fatalf("operators %v from %v", ops, c.seconds)
		}
	})
}

func TestMismatchAsksAnotherOperator(t *testing.T) {
	liar := func() *node {
		n := chain(110)
		n.hashes[100] = fake1
		return n
	}
	t.Run("[T14] a mismatch from one second node, then another operator's node agrees: not held", func(t *testing.T) {
		a, b := liar(), chain(108)
		au, bu := a.serve(t).URL, b.serve(t).URL
		c := New(asLocalhost(chain(110).serve(t).URL), "stagenet", []string{au, bu}, nil)
		fixed(c, map[string]string{au: "a.example", bu: "b.example"})
		got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)})
		if rep.State != OK || got[0].Confirmations != 8 || b.blocks.Load() != 1 {
			t.Fatalf("report %+v, confirmations %d, b asked %d", rep, got[0].Confirmations, b.blocks.Load())
		}
	})
	t.Run("[T14] the next node asked is never the same operator's: with only that, held", func(t *testing.T) {
		a, b := liar(), chain(110)
		au, bu := a.serve(t).URL, b.serve(t).URL
		c := New(asLocalhost(chain(110).serve(t).URL), "stagenet", []string{au, bu}, nil)
		fixed(c, map[string]string{au: "a.example", bu: "a.example"})
		got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)})
		if rep.State != Mismatch || got[0].Confirmations != 0 || b.blocks.Load() != 0 {
			t.Fatalf("report %+v, confirmations %d, same-operator node asked %d", rep, got[0].Confirmations, b.blocks.Load())
		}
	})
	t.Run("[T14] both operators disagree with the configured node: held, and the second opinion is asked once", func(t *testing.T) {
		a, b := liar(), liar()
		au, bu := a.serve(t).URL, b.serve(t).URL
		c := New(asLocalhost(chain(110).serve(t).URL), "stagenet", []string{au, bu}, nil)
		fixed(c, map[string]string{au: "a.example", bu: "b.example"})
		got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)})
		if rep.State != Mismatch || got[0].Confirmations != 0 || b.blocks.Load() != 1 {
			t.Fatalf("report %+v, confirmations %d, b asked %d", rep, got[0].Confirmations, b.blocks.Load())
		}
	})
	t.Run("[T14] a mismatch with no other operator to ask: held", func(t *testing.T) {
		a := liar()
		au := a.serve(t).URL
		c := New(asLocalhost(chain(110).serve(t).URL), "stagenet", []string{au}, nil)
		fixed(c, map[string]string{au: "a.example"})
		got, rep := c.Check(context.Background(), []walletrpc.Transfer{transfer(tx1, 100, 10)})
		if rep.State != Mismatch || got[0].Confirmations != 0 {
			t.Fatalf("report %+v, confirmations %d", rep, got[0].Confirmations)
		}
	})
}
