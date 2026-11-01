// Package syncclient sends one signed request to the plugin's bridge/sync route and reads the answer, following the
// wire contract in contract/test-vectors/README.md: JSON body without a byte-order mark, x-xmr-ts and x-xmr-sig
// headers, no Origin or Authorization header, at most 256 KiB (4 KiB when pairing). Errors carry the site's code
// and the fix an admin can act on.
package syncclient

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/dwightsabeast/coffer/bridge/internal/sitetext"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
)

const (
	routePath    = "/_emdash/api/plugins/coffer/bridge/sync"
	MaxBody      = 256 << 10
	MaxPairBody  = 4 << 10
	maxResponse  = 1 << 20
	ProtocolV    = 1
	accessFixURL = "/_emdash/api/plugins/coffer/*"
	// Spec change 46: the site's check list and probes are capped, and a probe is always index 1.
	MaxCheck  = 150
	MaxProbes = 10
	MaxBad    = 20
)

// AddressDigest is what the site sends instead of an address (spec change 46, D3): the standard padded base64 of the
// first 16 bytes of SHA-256 over the address string. contract/test-vectors/address-digest.json pins it.
func AddressDigest(address string) string {
	sum := sha256.Sum256([]byte(address))
	return base64.StdEncoding.EncodeToString(sum[:16])
}

// isDigest: 24 characters of standard padded base64 for 16 bytes.
func isDigest(s string) bool {
	if len(s) != 24 || !strings.HasSuffix(s, "==") {
		return false
	}
	b, err := base64.StdEncoding.Strict().DecodeString(s)
	return err == nil && len(b) == 16
}

// ErrTooLarge: the body is over the plugin's limit; the caller sends fewer snapshots or addresses.
var ErrTooLarge = errors.New("syncclient: request body over the site's limit")

// Body is a bridge/sync request.
type Body struct {
	V         int        `json:"v"`
	Seq       int64      `json:"seq"`
	Height    uint64     `json:"height"`
	Addresses []Address  `json:"addresses"`
	Snapshots []Snapshot `json:"snapshots"`
	Pair      *Pair      `json:"pair,omitempty"`
	// Checks reports the wallet host's checks for the admin page (spec change 13). Optional: the plugin ignores
	// fields it doesn't know, and shows this one from phase 04.
	Checks *Checks `json:"checks,omitempty"`
	// Wallet answers the site's probes after a pairing (spec change 46, item 3).
	Wallet *WalletAnswer `json:"wallet,omitempty"`
	// ProbeDigest is the digest of this wallet's own index-1 address, sent with the answer and after a pairing on a
	// site with no history, until a sync carrying it succeeds (spec change 46, Wyatt's review).
	ProbeDigest string `json:"probeDigest,omitempty"`
}

// WalletAnswer says which of the site's wallets this one is: Match is the probe's wallet number, or nil for none.
// ReceivedTop is the wallet's highest subaddress index with a transfer (the site's gap baseline for a new wallet).
type WalletAnswer struct {
	Match       *int   `json:"match"`
	ReceivedTop uint32 `json:"receivedTop"`
}

// PoolReport is the bridge's check of the site's last check list (spec change 46, item 1): "ok", or "mismatch" with up
// to MaxBad of the wallet's own indexes the wallet doesn't hold with that digest.
type PoolReport struct {
	State string   `json:"state"`
	Bad   []uint32 `json:"bad"`
}

// Checks are the wallet host's health checks.
type Checks struct {
	Node   *Check      `json:"node,omitempty"`   // the remote-node cross-check
	Wallet *Check      `json:"wallet,omitempty"` // the wallet's height against its node's ("ok", "behind", "unavailable"), or "syncing" while the node catches up with the network
	Pool   *PoolReport `json:"pool,omitempty"`   // spec change 46: the check of the site's pool against this wallet
}

// Check is one check's state ("off", "ok", "unavailable" or "mismatch") and what it means.
type Check struct {
	State  string `json:"state"`
	Detail string `json:"detail,omitempty"`
}

// Address is a new pool subaddress.
type Address struct {
	Index   uint32 `json:"index"`
	Address string `json:"address"`
}

// Snapshot is every incoming transfer to one watched subaddress (empty when none).
type Snapshot struct {
	Index     uint32     `json:"index"`
	Transfers []Transfer `json:"transfers"`
}

// Transfer is one incoming transfer, with amount and unlock time as decimal strings.
type Transfer struct {
	TxID            string `json:"txid"`
	Amount          string `json:"amount"`
	Confirmations   uint64 `json:"confirmations"`
	Height          uint64 `json:"height"`
	Timestamp       uint64 `json:"timestamp"`
	DoubleSpendSeen bool   `json:"doubleSpendSeen"`
	UnlockTime      string `json:"unlockTime"`
}

// Pair carries the one-time code and the new public key; the request is signed with that key.
type Pair struct {
	Code      string `json:"code"`
	PublicKey string `json:"publicKey"`
}

// Response is a successful sync's answer.
type Response struct {
	PoolFree   int
	PoolTarget int
	// PoolTop is the highest subaddress index the site holds, 0 when the site doesn't say (spec change 15).
	PoolTop uint32
	Watch   []uint32
	// RestoreHeight is the site's suggested restore height for a new wallet, on a pairing response only (spec change
	// 17); 0 when the site doesn't say. A suggestion of 0 reads as 1, so it can never be taken for "today".
	RestoreHeight uint64
	// ClaimedTop is the current wallet's highest index the site has handed out (spec change 46, Wyatt's review): the
	// only numbering cue the bridge follows, since a key thief can add free rows (and so move PoolTop) but not claim.
	ClaimedTop uint32
	// Check is the site's rows for this wallet to check, by digest (spec change 46, item 1); nil from an older plugin.
	Check []CheckEntry
	// Probes is non-nil while the site waits for this wallet's answer (spec change 46, item 3), possibly empty.
	Probes []Probe
}

// CheckEntry is one of the site's pool rows: the wallet's own index and the address's digest.
type CheckEntry struct {
	Index  uint32
	Digest string
}

// Probe is one wallet the site has used: its number and the digest of its index-1 address.
type Probe struct {
	Wallet int
	Index  uint32
	Digest string
}

// Error is a refusal by the site (Code is the plugin's or EmDash's code, or HTTP_<status>) with the fix.
type Error struct {
	Code   string
	Status int
	Hint   string
}

func (e *Error) Error() string {
	if e.Hint == "" {
		return "the site answered " + e.Code
	}
	return "the site answered " + e.Code + ": " + e.Hint
}

func hint(code string) string {
	switch code {
	case "NOT_PAIRED", "BAD_SIGNATURE":
		return "the site doesn't know this wallet host's key. Press " + sitetext.Button + " and run the new command to pair again"
	case "PAIRING_REJECTED", "PAIRING_NOT_ACTIVE":
		return "the pairing code is wrong, used or expired. Press " + sitetext.Button + " again for a new code (valid 15 minutes)"
	case "STALE_TIMESTAMP":
		return "this machine's clock is more than 5 minutes off. Fix the clock (timedatectl set-ntp true)"
	case "UNSUPPORTED_PLATFORM":
		// Spec change 35: on EmDash's Cloudflare runner a plugin gets too few storage calls to pair or take payments.
		return "this site runs on Cloudflare Workers, which Coffer doesn't support yet; it works on EmDash sites hosted on Node.js. Nothing was set up, and the pairing code wasn't used"
	case "UNSUPPORTED_VERSION":
		return "the site's plugin and this bridge don't share a protocol version. Update the older one"
	case "SEQ_OUT_OF_RANGE":
		return "this machine's clock moved back more than 5 minutes; syncs resume when it catches up (check: timedatectl)"
	case "INVALID_BODY", "INVALID_ENCODING":
		return "the site refused the request's contents. This is a bridge bug; the log has details"
	case "INVALID_PLUGIN_REQUEST":
		return "the request was too large for the site"
	case "INVALID_TOKEN":
		return "something in front of the site added an Authorization header. Let " + accessFixURL + " through without a login, and add no Origin or Authorization header"
	case "CSRF_REJECTED":
		return "something in front of the site added an Origin header. Let " + accessFixURL + " through without a login, and add no Origin or Authorization header"
	}
	return ""
}

// Client sends to one site.
type Client struct {
	Site      string // base URL, e.g. https://shop.example
	HTTP      *http.Client
	Now       func() time.Time
	UserAgent string
}

func (c *Client) endpoint() string { return strings.TrimSuffix(c.Site, "/") + routePath }

// Send signs and posts body with key and returns the site's answer.
func (c *Client) Send(ctx context.Context, key ed25519.PrivateKey, body Body) (Response, error) {
	if body.Addresses == nil {
		body.Addresses = []Address{}
	}
	if body.Snapshots == nil {
		body.Snapshots = []Snapshot{}
	}
	for i := range body.Snapshots {
		if body.Snapshots[i].Transfers == nil {
			body.Snapshots[i].Transfers = []Transfer{}
		}
	}
	if body.Checks != nil && body.Checks.Pool != nil && body.Checks.Pool.Bad == nil {
		c, p := *body.Checks, *body.Checks.Pool
		p.Bad = []uint32{}
		c.Pool = &p
		body.Checks = &c
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return Response{}, err
	}
	limit := MaxBody
	if body.Pair != nil {
		limit = MaxPairBody
	}
	if len(raw) > limit {
		return Response{}, ErrTooLarge
	}
	now := time.Now()
	if c.Now != nil {
		now = c.Now()
	}
	ts := strconv.FormatInt(now.Unix(), 10)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint(), bytes.NewReader(raw))
	if err != nil {
		return Response{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-xmr-ts", ts)
	req.Header.Set("x-xmr-sig", syncsign.Sign(key, ts, raw))
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	hc := http.Client{Timeout: 30 * time.Second}
	if c.HTTP != nil {
		hc = *c.HTTP
	}
	// A redirect is a login page or a misconfigured proxy: report it, don't follow it.
	hc.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := hc.Do(req)
	if err != nil {
		return Response{}, fmt.Errorf("syncclient: the site can't be reached: %w", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponse+1))
	if err != nil {
		return Response{}, fmt.Errorf("syncclient: %w", err)
	}
	return parse(resp.StatusCode, data)
}

func parse(status int, data []byte) (Response, error) {
	var env struct {
		Success bool            `json:"success"`
		Data    json.RawMessage `json:"data"`
		Error   *struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	jsonErr := json.Unmarshal(data, &env)
	if status != http.StatusOK {
		code := fmt.Sprintf("HTTP_%d", status)
		if jsonErr == nil && env.Error != nil && env.Error.Code != "" {
			code = env.Error.Code
		}
		h := hint(code)
		if h == "" && (status == http.StatusForbidden || status == http.StatusUnauthorized || (status >= 300 && status < 400)) {
			h = "the site answered with a login page, a redirect or a refusal. Let " + accessFixURL + " through any access rules without a login"
		}
		return Response{}, &Error{Code: code, Status: status, Hint: h}
	}
	bad := &Error{Code: "BAD_RESPONSE", Status: status, Hint: "the site's answer isn't a bridge/sync response. Is the coffer plugin installed on this site?"}
	if jsonErr != nil || !env.Success || len(data) > maxResponse {
		return Response{}, bad
	}
	var d struct {
		OK         bool   `json:"ok"`
		PoolFree   *int   `json:"poolFree"`
		PoolTarget *int   `json:"poolTarget"`
		PoolTop    int64  `json:"poolTop"`
		Watch      []int  `json:"watch"`
		Restore    *int64 `json:"restoreHeight"`
		ClaimedTop int64  `json:"claimedTop"`
		Check      *[]struct {
			Index  int64  `json:"index"`
			Digest string `json:"digest"`
		} `json:"check"`
		Probes *[]struct {
			Wallet int64  `json:"wallet"`
			Index  int64  `json:"index"`
			Digest string `json:"digest"`
		} `json:"probes"`
		Error *struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(env.Data, &d); err != nil {
		return Response{}, bad
	}
	if d.Error != nil {
		return Response{}, &Error{Code: d.Error.Code, Status: status, Hint: hint(d.Error.Code)}
	}
	if !d.OK || d.PoolFree == nil || d.PoolTarget == nil || *d.PoolFree < 0 || *d.PoolTarget < 0 || d.PoolTop < 0 || d.PoolTop > 1<<32-1 || d.Watch == nil || (d.Restore != nil && *d.Restore < 0) {
		return Response{}, bad
	}
	if d.ClaimedTop < 0 || d.ClaimedTop > 1<<32-1 {
		return Response{}, bad
	}
	r := Response{PoolFree: *d.PoolFree, PoolTarget: *d.PoolTarget, PoolTop: uint32(d.PoolTop), ClaimedTop: uint32(d.ClaimedTop), Watch: make([]uint32, 0, len(d.Watch))}
	if d.Check != nil {
		if len(*d.Check) > MaxCheck {
			return Response{}, bad
		}
		r.Check = make([]CheckEntry, 0, len(*d.Check))
		for _, c := range *d.Check {
			if c.Index < 1 || c.Index > 1<<32-1 || !isDigest(c.Digest) {
				return Response{}, bad
			}
			r.Check = append(r.Check, CheckEntry{Index: uint32(c.Index), Digest: c.Digest})
		}
	}
	if d.Probes != nil {
		if len(*d.Probes) > MaxProbes {
			return Response{}, bad
		}
		r.Probes = make([]Probe, 0, len(*d.Probes))
		for _, p := range *d.Probes {
			// Spec change 46 (Wyatt's review): a probe is always index 1, so answering one never creates more than that.
			if p.Index != 1 || p.Wallet < 0 || p.Wallet > 1<<21 || !isDigest(p.Digest) {
				return Response{}, bad
			}
			r.Probes = append(r.Probes, Probe{Wallet: int(p.Wallet), Index: 1, Digest: p.Digest})
		}
	}
	if d.Restore != nil {
		r.RestoreHeight = max(uint64(*d.Restore), 1)
	}
	for _, w := range d.Watch {
		if w < 1 || w > 1<<31 {
			return Response{}, bad
		}
		r.Watch = append(r.Watch, uint32(w))
	}
	return r, nil
}
