// Package crosscheck confirms payments reported through a node that isn't the shop's own against a second node
// before the bridge reports confirmations (spec, Bridge service, duty 6; spec change 13). For each mined transfer it
// asks a second node for the whole block at the transfer's height: that block's hash must equal the configured
// node's, and the txid must be in its transaction list. The second node learns a height, never a txid.
// Confirmations become the smaller of the two nodes' counts. A mismatch holds the transfer at 0 confirmations; so does
// no second node answering (spec change 13 as amended for RT-26, Wyatt 2026-11-02: nothing then bounds the depth the
// configured node claims), reported as unavailable. A second node is
// never on the configured node's host (any scheme or port), and is used only while it says it has caught up with
// the network.
package crosscheck

import (
	"context"
	"fmt"
	"math/rand/v2"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/noderpc"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

// State is the check's outcome for one sync.
type State string

const (
	Off         State = "off"         // the configured node is the shop's own: nothing to check
	OK          State = "ok"          // every mined transfer checked out (or waits for the second node to catch up)
	Unavailable State = "unavailable" // no second node answered: confirmations reported as they are
	Mismatch    State = "mismatch"    // a transfer's block differs on the second node: held at 0 confirmations
)

// Report is what status and the site see.
type Report struct {
	State  State  `json:"state"`
	Detail string `json:"detail,omitempty"`
	Node   string `json:"node,omitempty"` // the second node used (host only)
}

// defaults are public nodes per network (spec change 13, open question 12). Stagenet: checked from the dev box on
// 2026-10-04 (get_info nettype and get_block at height 2221449 agreeing with the local node); kept with its http nodes,
// since only stagenet.xmr.kernal.eu has a certificate that verifies (2026-11-02). Mainnet (Wyatt, 2026-11-02): https
// only, one host per operator, each probed read-only on 2026-11-02 (synchronized, restricted, get_block by height, the
// same block hash at a common height, a certificate that verifies). Growing it is on the release checklist.
var defaults = map[string][]string{
	"stagenet": {
		"https://stagenet.xmr.kernal.eu:38089",
		"http://stagenet.xmr-tw.org:38081",
		"http://node.sethforprivacy.com:38089",
		"http://node.monerodevs.org:38089",
		"http://node2.monerodevs.org:38089",
		"http://xmr-lux.boldsuck.org:38081",
	},
	"mainnet": {
		"https://node.monerodevs.org:18089",
		"https://xmr-node.cakewallet.com:18081",
		"https://ravfx.its-a-node.org:18081",
	},
	"testnet": nil,
}

// DefaultNodes returns the built-in second nodes for network (nil for an unknown network).
func DefaultNodes(network string) []string {
	l, ok := defaults[network]
	if !ok {
		return nil
	}
	return append([]string{}, l...)
}

// IsOwnNode reports whether nodeURL points at the shop's own node: a loopback, private or link-local address, or
// a host name that resolves only to such addresses.
func IsOwnNode(ctx context.Context, nodeURL string) (bool, error) {
	u, err := url.Parse(nodeURL)
	if err != nil || u.Hostname() == "" {
		return false, fmt.Errorf("crosscheck: not a node URL")
	}
	host := u.Hostname()
	var ips []net.IP
	if ip := net.ParseIP(host); ip != nil {
		ips = []net.IP{ip}
	} else if host == "localhost" {
		return true, nil
	} else {
		rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		addrs, err := net.DefaultResolver.LookupIPAddr(rctx, host)
		if err != nil || len(addrs) == 0 {
			return false, fmt.Errorf("crosscheck: can't resolve %s", host)
		}
		for _, a := range addrs {
			ips = append(ips, a.IP)
		}
	}
	for _, ip := range ips {
		if !(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()) {
			return false, nil
		}
	}
	return true, nil
}

// Checker cross-checks against a list of second nodes. Safe for one caller at a time per sync.
type Checker struct {
	primary string
	network string
	all     []string // the second nodes as given
	seconds []string // those that may vouch for primary
	hc      *http.Client
	// order shuffles the second nodes for each pick, and operatorOf names a node's operator; both replaced in tests.
	order      func([]string)
	operatorOf func(string) string

	mu       sync.Mutex
	verified map[string]bool // txid + "@" + height
}

// New returns a checker for transfers reported through primary. Second nodes on primary's host are left out: the
// configured node can be on the built-in list, and a node can't vouch for itself.
func New(primary, network string, seconds []string, hc *http.Client) *Checker {
	if hc == nil {
		hc = &http.Client{Timeout: 20 * time.Second}
	}
	// No redirects (Wyatt, 2026-11-02): an https node can't send the checker on to plain http, or to another node.
	nc := *hc
	nc.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	hc = &nc
	c := &Checker{primary: primary, network: network, all: seconds, hc: hc, verified: map[string]bool{},
		order: func(s []string) { rand.Shuffle(len(s), func(i, j int) { s[i], s[j] = s[j], s[i] }) }, operatorOf: operatorOf}
	c.seconds = c.secondsFor(primary)
	return c
}

// secondsFor is the list without nodes that can't vouch for primary: on its host, or run by its operator (Wyatt,
// 2026-11-02). On mainnet only https nodes are used, never plain http.
func (c *Checker) secondsFor(primary string) []string {
	own, op := hostName(primary), c.operatorOf(primary)
	var others []string
	for _, s := range c.all {
		if own != "" && hostName(s) == own || op != "" && c.operatorOf(s) == op {
			continue
		}
		if c.network == "mainnet" && !strings.HasPrefix(strings.ToLower(s), "https://") {
			continue
		}
		others = append(others, s)
	}
	return others
}

// operatorOf names who runs a node: its host's last two labels (node.monerodevs.org and node2.monerodevs.org are one
// operator), or the whole host for an IP address or a single label. Without a public-suffix list a domain such as
// example.co.uk groups with every co.uk host, which only ever skips more nodes, never fewer.
func operatorOf(nodeURL string) string {
	h := hostName(nodeURL)
	if h == "" || net.ParseIP(h) != nil {
		return h
	}
	labels := strings.Split(h, ".")
	if len(labels) < 2 {
		return h
	}
	return strings.Join(labels[len(labels)-2:], ".")
}

// hostName is nodeURL's host without port, lower-cased and without a trailing dot ("" if it doesn't parse).
func hostName(nodeURL string) string {
	u, err := url.Parse(nodeURL)
	if err != nil {
		return ""
	}
	return strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
}

// Check returns the transfers with confirmations adjusted, and the outcome.
func (c *Checker) Check(ctx context.Context, ts []walletrpc.Transfer) ([]walletrpc.Transfer, Report) {
	out := append([]walletrpc.Transfer{}, ts...)
	mined := false
	for _, t := range out {
		mined = mined || t.Height > 0
	}
	if !mined {
		return out, Report{State: OK, Detail: "no mined payments to check"}
	}
	second, secondHeight, ok := c.pickSecond(ctx, nil)
	if !ok {
		return held(ts), Report{State: Unavailable, Detail: "no second node answered, so mined payments are held at 0 confirmations until one does. Use your own node, or one you trust"}
	}
	host := hostOf(second)
	rep := Report{State: OK, Node: host}
	primaryHashes := map[uint64]string{}
	var (
		altTried, altOK bool
		alt             string
		altHeight       uint64
	)
	for i, t := range out {
		if t.Height == 0 {
			continue
		}
		// The second node's own count; zero while it hasn't reached the block yet.
		var secondConf uint64
		if secondHeight > t.Height {
			secondConf = secondHeight - t.Height
		}
		if secondConf == 0 {
			out[i].Confirmations = 0
			continue
		}
		key := fmt.Sprintf("%s@%d", t.TxID, t.Height)
		c.mu.Lock()
		done := c.verified[key]
		c.mu.Unlock()
		if !done {
			ph, ok := primaryHashes[t.Height]
			if !ok {
				h, err := noderpc.BlockHash(ctx, c.primary, c.hc, t.Height)
				if err != nil {
					return held(ts), Report{State: Unavailable, Node: host, Detail: fmt.Sprintf("the configured node didn't give the block hash at height %d, so mined payments are held at 0 confirmations", t.Height)}
				}
				ph, primaryHashes[t.Height] = h, h
			}
			b, err := noderpc.GetBlock(ctx, second, c.hc, t.Height)
			if err != nil {
				return held(ts), Report{State: Unavailable, Node: host, Detail: fmt.Sprintf("%s didn't give block %d, so mined payments are held at 0 confirmations", host, t.Height)}
			}
			if b.Hash != ph || !b.Has(t.TxID) {
				// Wyatt, 2026-11-02: before holding, one more second node, from a different operator, is asked (once
				// per check). If it agrees with the configured node, the payment counts on its confirmations.
				if !altTried {
					altTried = true
					alt, altHeight, altOK = c.pickSecond(ctx, map[string]bool{c.operatorOf(second): true})
				}
				if altOK && altHeight > t.Height {
					if ab, err := noderpc.GetBlock(ctx, alt, c.hc, t.Height); err == nil && ab.Hash == ph && ab.Has(t.TxID) {
						c.mu.Lock()
						c.verified[key] = true
						c.mu.Unlock()
						out[i].Confirmations = min(t.Confirmations, altHeight-t.Height)
						continue
					}
				}
				out[i].Confirmations = 0
				also := ""
				if altOK {
					also = fmt.Sprintf(" (%s didn't confirm it either)", hostOf(alt))
				}
				if b.Hash != ph {
					rep = Report{State: Mismatch, Node: host, Detail: fmt.Sprintf("the configured node's block at height %d differs from %s's%s: payments in it are held at 0 confirmations. Use your own node, or one you trust", t.Height, host, also)}
				} else {
					rep = Report{State: Mismatch, Node: host, Detail: fmt.Sprintf("a payment the configured node reports at height %d isn't in that block on %s%s: it is held at 0 confirmations. Use your own node, or one you trust", t.Height, host, also)}
				}
				continue
			}
			c.mu.Lock()
			c.verified[key] = true
			c.mu.Unlock()
		}
		out[i].Confirmations = min(t.Confirmations, secondConf)
	}
	return out, rep
}

// HeightTolerance is how far the configured node's chain may run above a second node's before the bridge reports the
// second node's height instead (spec change 47, D2). It must stay below the plugin's floor margin (30 blocks).
const HeightTolerance = 10

// held is ts with every mined transfer at 0 confirmations (unavailable: nothing bounds the configured node's count).
func held(ts []walletrpc.Transfer) []walletrpc.Transfer {
	out := append([]walletrpc.Transfer{}, ts...)
	for i := range out {
		if out[i].Height > 0 {
			out[i].Confirmations = 0
		}
	}
	return out
}

// SecondHeight is a second node's height (RT-26, spec change 47): the bridge reports no more than this plus a small
// tolerance with a remote node. host is the node's host only; ok is false when no second node answers.
func (c *Checker) SecondHeight(ctx context.Context) (height uint64, host string, ok bool) {
	n, h, ok := c.pickSecond(ctx, nil)
	if !ok {
		return 0, "", false
	}
	return h, hostOf(n), true
}

// pickSecond returns the first second node, in random order, that answers on the right network and has caught up
// (a node still syncing would hold every payment at 0 confirmations).
func (c *Checker) pickSecond(ctx context.Context, skip map[string]bool) (string, uint64, bool) {
	order := append([]string{}, c.seconds...)
	c.order(order)
	for _, n := range order {
		if skip[c.operatorOf(n)] {
			continue
		}
		ictx, cancel := context.WithTimeout(ctx, 10*time.Second)
		info, err := noderpc.GetInfo(ictx, n, c.hc)
		cancel()
		if err == nil && info.NetType == c.network && !info.Offline && info.Synchronized && info.Height > 0 {
			return n, info.Height, true
		}
	}
	return "", 0, false
}

func hostOf(nodeURL string) string {
	if u, err := url.Parse(nodeURL); err == nil {
		return u.Host
	}
	return ""
}

// BoundedHeight is the chain height a pairing request may carry (spec change 47, part 4): the site resets its height
// to it, so it must be one a single node can't push up or down. 0 (the site keeps its own) unless the node answers
// synchronized and online; with a remote node, the second node's height when the two differ by more than
// HeightTolerance either way, and 0 when no second node answers. The shop's own node is trusted as is.
func BoundedHeight(ctx context.Context, nodeURL, network string, hc *http.Client) uint64 {
	ictx, cancel := context.WithTimeout(ctx, 10*time.Second)
	info, err := noderpc.GetInfo(ictx, nodeURL, hc)
	cancel()
	own, oerr := IsOwnNode(ctx, nodeURL)
	if oerr != nil {
		own = false
	}
	c := New(nodeURL, network, DefaultNodes(network), hc)
	return boundedHeight(ctx, info, err, own, c.SecondHeight)
}

func boundedHeight(ctx context.Context, info noderpc.Info, err error, own bool, second func(context.Context) (uint64, string, bool)) uint64 {
	if err != nil || !info.Synchronized || info.Offline || info.Height == 0 {
		return 0
	}
	if own {
		return info.Height
	}
	h, _, ok := second(ctx)
	if !ok {
		return 0
	}
	if info.Height > h+HeightTolerance || info.Height+HeightTolerance < h {
		return h
	}
	return info.Height
}
