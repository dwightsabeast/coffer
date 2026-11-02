// Package bridgeloop is the bridge's sync loop (spec, Bridge service, duties 2 to 5): every 12 to 15 seconds, and
// at once when wallet-rpc reports a transaction, it reads the watched subaddresses' incoming transfers and posts a
// signed snapshot to the site; it tops up the site's address pool; and after a start it reconciles (the first sync
// learns the watch list, the next reports every watched index). It keeps no state between starts except subaddresses
// created but not yet acknowledged by the site (run/pending.json), so a restart never leaves them unused, and an
// unfinished catch-up (run/catchup.json, spec change 15): a wallet restored from keys lacks the subaddresses the site
// already holds, so before it reports anything it creates them up to the highest index the site has handed out (claimedTop, spec change 46) and rescans once.
package bridgeloop

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/dwightsabeast/coffer/bridge/internal/sitetext"
	"io"
	"log/slog"
	"math/rand/v2"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/crosscheck"
	"github.com/dwightsabeast/coffer/bridge/internal/noderpc"
	"github.com/dwightsabeast/coffer/bridge/internal/syncclient"
	"github.com/dwightsabeast/coffer/bridge/internal/walletrpc"
)

const (
	maxSnapshots  = 100 // the plugin's caps per request
	maxAddresses  = 100
	maxTransfers  = 32
	addressLabel  = "coffer"
	walletTimeout = 30 * time.Second
	// startingEvery spaces the "starting" messages while wallet-rpc isn't ready (spec change 29): with walletTimeout,
	// one about every 90 s, well inside the site's 5 minutes.
	startingEvery = time.Minute
	createBatch   = 100            // subaddresses per create_address call while catching up
	rescanLimit   = 24 * time.Hour // a rescan from the restore height; ctx (shutdown) ends it sooner
	// The wallet check (phase 04): behind when its node is more than walletBehind blocks ahead; the node is asked for
	// its height at most every nodeHeightEvery.
	walletBehind    = 5
	nodeHeightEvery = time.Minute
	// RT-26 (spec change 47, D2): Health's node check says "mismatch" once the wallet has been above the second node for
	// this long (the height is bounded from the first sync); while ahead, the second node is asked again at most this often.
	heightMismatchAfter = 5 * time.Minute
	secondAgainAfter    = 10 * time.Second
	// maxPool is the spec's fixed pool size (RT-27): a site's poolTarget above it is treated as this, and the catch-up
	// goes no further than claimedTop + maxPool (spec change 46, Wyatt's review).
	maxPool = 50
	// maxReoffer bounds the unused subaddresses a matched wallet re-offers after a re-pair.
	maxReoffer = 1000
)

// Wallet is what the loop needs from wallet-rpc (*walletrpc.Client).
type Wallet interface {
	GetHeight(ctx context.Context) (uint64, error)
	GetTransfers(ctx context.Context, indexes []uint32) ([]walletrpc.Transfer, error)
	CreateAddress(ctx context.Context, label string) (walletrpc.NewAddress, error)
	CreateAddresses(ctx context.Context, label string, n int) ([]walletrpc.NewAddress, error)
	HasSubaddress(ctx context.Context, index uint32) (bool, error)
	RescanBlockchain(ctx context.Context) error
	// Spec change 46: addresses by index (the pool check, the probe) and every index with a transfer.
	SubaddressAddresses(ctx context.Context, indexes []uint32) (map[uint32]string, error)
	ReceivedIndexes(ctx context.Context) ([]uint32, error)
}

// CrossChecker confirms mined transfers against a second node (*crosscheck.Checker); nil when the node is the
// shop's own.
type CrossChecker interface {
	Check(ctx context.Context, ts []walletrpc.Transfer) ([]walletrpc.Transfer, crosscheck.Report)
	// SecondHeight is a second node's height, which bounds the height reported (RT-26, spec change 47).
	SecondHeight(ctx context.Context) (height uint64, host string, ok bool)
}

// Sender posts one request to the site (*syncclient.Client).
type Sender interface {
	Send(ctx context.Context, key ed25519.PrivateKey, body syncclient.Body) (syncclient.Response, error)
}

// Options configures the loop. Zero durations take the defaults.
type Options struct {
	Wallet func(ctx context.Context) (Wallet, error) // waits until wallet-rpc is ready with the wallet open
	Site   Sender
	Key    ed25519.PrivateKey
	// LoadKey, when set, reads the key for every sync instead of Key (so pairing again needs no restart).
	LoadKey func() (ed25519.PrivateKey, error)
	DataDir string
	Log     *slog.Logger
	Now     func() time.Time
	// Extra is merged into the status file (wallet-rpc's state).
	Extra func() any
	// CrossCheck, when set, adjusts confirmations of mined transfers (spec change 13).
	CrossCheck CrossChecker
	// Updates, when set, describes the update state for the status file.
	Updates func() string
	// NodeInfo, when set, reads the node's get_info for the wallet check sent to the site.
	NodeInfo func(ctx context.Context) (noderpc.Info, error)

	Interval   time.Duration // default 12 s
	Jitter     time.Duration // default 3 s
	Debounce   time.Duration // default 1 s after a notify
	BackoffMin time.Duration // default 15 s
	BackoffMax time.Duration // default 5 min
}

// Status is written to <dataDir>/run/status.json after every sync attempt and read by `xmr-bridge status`.
type Status struct {
	LastAttemptAt time.Time         `json:"lastAttemptAt"`
	LastSyncAt    time.Time         `json:"lastSyncAt"`
	LastError     string            `json:"lastError,omitempty"`
	WalletHeight  uint64            `json:"walletHeight"`
	PoolFree      int               `json:"poolFree"`
	PoolTarget    int               `json:"poolTarget"`
	Watching      int               `json:"watching"`
	Pending       int               `json:"pending"`
	Warnings      []string          `json:"warnings,omitempty"`
	NodeCheck     crosscheck.Report `json:"nodeCheck"`
	// WalletCheck is the wallet check last sent to the site (nil without NodeInfo).
	WalletCheck *syncclient.Check `json:"walletCheck,omitempty"`
	// What the site did with the syncs sent since this process started (for the update rule).
	Synced      int    `json:"synced"`
	SiteRefused int    `json:"siteRefused"`
	Unreachable int    `json:"unreachable"`
	Updates     string `json:"updates,omitempty"`
	WalletRPC   any    `json:"walletRpc,omitempty"`
	// CatchUp is set while the wallet is being caught up to the site's pool (spec change 15).
	CatchUp *CatchUp `json:"catchUp,omitempty"`
	// PoolCheck is the last check of the site's pool against this wallet (spec change 46); nil until one.
	PoolCheck *PoolCheck `json:"poolCheck,omitempty"`
}

// PoolCheck is the result of checking the site's check list: "ok", or "mismatch" with the wallet's own indexes.
type PoolCheck struct {
	State string    `json:"state"`
	Bad   []uint32  `json:"bad,omitempty"`
	At    time.Time `json:"at"`
}

// CatchUp is the progress of a catch-up: subaddresses created up to Target, then one rescan.
type CatchUp struct {
	Target     uint32 `json:"target"`
	Addresses  uint32 `json:"addresses"` // the wallet's highest subaddress index so far (0 until the first one)
	Rescanning bool   `json:"rescanning"`
}

// Loop is one bridge's sync loop.
type Loop struct {
	o      Options
	notify chan struct{}

	mu      sync.Mutex
	watch   []uint32 // nil until the first sync after start
	cursor  int
	pending []syncclient.Address
	lastSeq int64
	soon    bool
	st      Status
	// Spec change 15: the highest index the wallet is known to have, and the target of an unfinished catch-up (0 when
	// none). Spec change 46 (Wyatt's review): the site's claimedTop, never poolTop, is the numbering cue, since a key
	// thief can add free rows but not hand them out.
	known      uint32
	claimedTop uint32
	catchup    uint32
	// Spec change 46. digests caches this wallet's own address digests (subaddresses never change). report is the
	// pool check to send; reportNow sends a mismatch at once, before any catch-up. waiting is set while the site waits
	// for the probe answer; answer is the answer to send; reofferPending asks for the re-offer after a match, and
	// reoffer holds its indexes. probeKey is the key whose site has this wallet's probe digest; receivedTop is the
	// wallet's highest index with a transfer (no created index at or below it is sent after a no-match).
	digests        map[uint32]string
	report         *syncclient.PoolReport
	reportNow      bool
	waiting        bool
	answer         *syncclient.WalletAnswer
	reofferPending bool
	reoffer        []uint32
	probeKey       string
	receivedTop    uint32
	// The wallet check's last node answer and when it was asked.
	nodeAt   time.Time
	nodeInfo noderpc.Info
	nodeErr  error
	// RT-30: when the "waiting for the wallet to scan" line was last logged (zero once the probe is answered).
	scanLoggedAt time.Time
	// RT-26 (spec change 47): the second node's last height and when it was asked, and since when the wallet has been
	// more than crosscheck.HeightTolerance blocks above it (zero when it isn't).
	secondAt     time.Time
	secondHeight uint64
	secondHost   string
	secondOK     bool
	aheadSince   time.Time
	// payCheck is the payment cross-check's last outcome and heightCheck the height bound's (nil: nothing to say);
	// Status.NodeCheck is the two combined.
	payCheck    crosscheck.Report
	heightCheck *crosscheck.Report
	// stateKey is the key the per-pairing state above was built under (46's step 5b, Wyatt): the watch list, the
	// answer, the pool report and the re-offer belong to one pairing and never go out under another.
	stateKey string
}

// New loads any pending addresses from a previous run.
func New(o Options) (*Loop, error) {
	def := func(d *time.Duration, v time.Duration) {
		if *d <= 0 {
			*d = v
		}
	}
	def(&o.Interval, 12*time.Second)
	def(&o.Jitter, 3*time.Second)
	def(&o.Debounce, time.Second)
	def(&o.BackoffMin, 15*time.Second)
	def(&o.BackoffMax, 5*time.Minute)
	if o.Log == nil {
		o.Log = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	l := &Loop{o: o, notify: make(chan struct{}, 1), digests: map[uint32]string{}}
	l.st.NodeCheck = crosscheck.Report{State: crosscheck.Off, Detail: "the configured node is your own"}
	if o.CrossCheck != nil {
		l.st.NodeCheck = crosscheck.Report{State: crosscheck.OK, Detail: "no mined payments checked yet"}
	}
	l.payCheck = l.st.NodeCheck
	if err := os.MkdirAll(l.runDir(), 0o700); err != nil {
		return nil, err
	}
	if err := os.Chmod(l.runDir(), 0o700); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(l.pendingFile())
	switch {
	case err == nil:
		if err := json.Unmarshal(data, &l.pending); err != nil {
			return nil, fmt.Errorf("bridgeloop: %s: %w", l.pendingFile(), err)
		}
	case !errors.Is(err, os.ErrNotExist):
		return nil, err
	}
	data, err = os.ReadFile(l.catchUpFile())
	switch {
	case err == nil:
		var m struct {
			Target uint32 `json:"target"`
		}
		if err := json.Unmarshal(data, &m); err != nil {
			return nil, fmt.Errorf("bridgeloop: %s: %w", l.catchUpFile(), err)
		}
		if m.Target > 0 {
			l.catchup = m.Target
			l.st.CatchUp = &CatchUp{Target: m.Target}
		}
	case !errors.Is(err, os.ErrNotExist):
		return nil, err
	}
	return l, nil
}

func (l *Loop) runDir() string      { return filepath.Join(l.o.DataDir, "run") }
func (l *Loop) pendingFile() string { return filepath.Join(l.runDir(), "pending.json") }
func (l *Loop) catchUpFile() string { return filepath.Join(l.runDir(), "catchup.json") }

// Notify asks for a sync now (wallet-rpc saw a transaction). It never blocks.
func (l *Loop) Notify() {
	select {
	case l.notify <- struct{}{}:
	default:
	}
}

// Soon reports whether the next sync should follow at once (reconcile, more watched indexes to cover, or new
// addresses to deliver).
func (l *Loop) Soon() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.soon
}

// Status returns a copy of the current status.
func (l *Loop) Status() Status {
	l.mu.Lock()
	defer l.mu.Unlock()
	st := l.st
	if st.CatchUp != nil {
		c := *st.CatchUp
		st.CatchUp = &c
	}
	return st
}

// Run syncs until ctx ends.
func (l *Loop) Run(ctx context.Context) error {
	var backoff time.Duration
	for {
		err := l.SyncOnce(ctx)
		if ctx.Err() != nil {
			return nil
		}
		var wait time.Duration
		notify := l.notify
		if err != nil {
			wait, backoff = retryWait(err, backoff, l.o.BackoffMin, l.o.BackoffMax)
			notify = nil // while backing off, a notify doesn't hammer an unreachable site
			l.o.Log.Warn("sync failed", "err", err, "retry in", wait)
		} else {
			backoff = 0
			if !l.Soon() {
				wait = l.o.Interval + time.Duration(rand.Int64N(int64(l.o.Jitter)+1))
			}
		}
		t := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			t.Stop()
			return nil
		case <-t.C:
		case <-notify:
			t.Stop()
			select { // let a burst of notifications settle into one sync
			case <-ctx.Done():
				return nil
			case <-time.After(l.o.Debounce):
			}
			select {
			case <-l.notify:
			default:
			}
		}
	}
}

// sendStarting tells the site the wallet host is up but wallet-rpc isn't ready (spec change 29): no wallet data, height
// 0 (the site never lowers its height), the node check, and wallet "starting". It returns notReady wrapped with
// ErrStarting once the site has it, or notReady with the send's own error.
func (l *Loop) sendStarting(ctx context.Context, key ed25519.PrivateKey, notReady error) error {
	l.mu.Lock()
	nc := l.st.NodeCheck
	l.mu.Unlock()
	checks := &syncclient.Checks{Node: &syncclient.Check{State: string(nc.State), Detail: nc.Detail},
		Wallet: &syncclient.Check{State: "starting", Detail: "starting Monero's wallet program"}}
	body := syncclient.Body{V: syncclient.ProtocolV, Seq: l.nextSeq(), Height: 0, Addresses: []syncclient.Address{}, Snapshots: []syncclient.Snapshot{}, Checks: checks}
	// Not counted in Synced, SiteRefused or Unreachable: those describe full syncs, and the update guard
	// (selfupdate.Decide) must keep seeing a wallet-rpc that never gets ready as no syncs at all.
	if _, err := l.o.Site.Send(ctx, key, body); err != nil {
		return fmt.Errorf("%w (and telling the site: %w)", notReady, err)
	}
	return fmt.Errorf("%w: %w", ErrStarting, notReady)
}

// retryWait is how long Run waits after a failed sync, and the backoff to carry: a steady startingEvery while
// wallet-rpc is starting (so the site keeps hearing from the wallet host), the usual backoff for anything else.
func retryWait(err error, backoff, min, max time.Duration) (wait, next time.Duration) {
	if errors.Is(err, ErrStarting) {
		return startingEvery, 0
	}
	next = nextBackoff(backoff, min, max)
	return next, next
}

func nextBackoff(prev, min, max time.Duration) time.Duration {
	if prev == 0 {
		return min
	}
	if prev*2 > max {
		return max
	}
	return prev * 2
}

// SyncOnce makes one sync: snapshots for (the next chunk of) the watch list, any pending addresses, then a top-up
// if the site's pool is short. It records the outcome in the status file.
func (l *Loop) SyncOnce(ctx context.Context) error {
	err := l.syncOnce(ctx)
	l.mu.Lock()
	l.st.LastAttemptAt = l.o.Now()
	if err != nil {
		l.st.LastError = err.Error()
	} else {
		l.st.LastError = ""
		l.st.LastSyncAt = l.st.LastAttemptAt
	}
	l.st.Pending = len(l.pending)
	l.mu.Unlock()
	l.writeStatus()
	return err
}

// ErrStarting: wallet-rpc isn't ready yet, and the site was told the wallet host is starting (spec change 29).
var ErrStarting = errors.New("wallet-rpc isn't ready yet; told the site the wallet host is starting")

// ErrNotPaired: no bridge key yet.
var ErrNotPaired = errors.New("this wallet host is not paired yet. Press " + sitetext.Button + " and run the command it shows")

// loadKey reads the bridge key (Options.LoadKey, else Options.Key).
func (l *Loop) loadKey() (ed25519.PrivateKey, error) {
	if l.o.LoadKey == nil {
		return l.o.Key, nil
	}
	k, err := l.o.LoadKey()
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotPaired
	}
	if err != nil {
		return nil, fmt.Errorf("bridge key: %w", err)
	}
	return k, nil
}

// adoptKey makes key the one the per-pairing state belongs to. After a pairing (a new key) that state is dropped:
// the watch list is learned again, and an answer, a pool report or a re-offer made for the old pairing is never sent
// under the new one (a stale "mismatch" would raise the sticky banner on it). Pending addresses stay: they are this
// wallet's unused addresses, and the new pairing's site decides whether to take them. Called with l.mu held.
func (l *Loop) adoptKey(key ed25519.PrivateKey) {
	k := keyText(key)
	if l.stateKey != "" && l.stateKey != k {
		l.watch, l.cursor = nil, 0
		l.answer, l.report, l.reportNow = nil, nil, false
		l.reofferPending, l.reoffer = false, nil
		l.waiting = false
	}
	l.stateKey = k
}

// keyChanged reads the key again just before a send. If a pairing replaced it after this sync began, the body built
// under the old pairing is dropped, not re-signed (Wyatt, 5b): the state is reset and the next sync starts at once
// with the new key. Nothing in the dropped body counts as delivered.
func (l *Loop) keyChanged(key ed25519.PrivateKey) (bool, error) {
	now, err := l.loadKey()
	if err != nil {
		return false, err
	}
	if keyText(now) == keyText(key) {
		return false, nil
	}
	l.mu.Lock()
	l.adoptKey(now)
	l.soon = true
	l.mu.Unlock()
	l.o.Log.Info("the bridge key changed during this sync (a new pairing); starting again with the new key")
	return true, nil
}

func (l *Loop) syncOnce(ctx context.Context) error {
	key, err := l.loadKey()
	if err != nil {
		return err
	}
	l.mu.Lock()
	l.adoptKey(key)
	l.mu.Unlock()
	wctx, cancel := context.WithTimeout(ctx, walletTimeout)
	w, err := l.o.Wallet(wctx)
	cancel()
	if err != nil {
		// Waiting for wallet-rpc can take walletTimeout: the key is read again, and this message holds nothing from a
		// pairing, so it simply goes out under the current key.
		if k, kerr := l.loadKey(); kerr == nil {
			key = k
		}
		return l.sendStarting(ctx, key, fmt.Errorf("wallet-rpc isn't ready: %w", err))
	}
	height, err := w.GetHeight(ctx)
	if err != nil {
		return fmt.Errorf("wallet: %w", err)
	}
	// RT-26: the height sent is bounded by a second node's with a remote node; height stays the wallet's own, for the
	// wallet check, the probe and the status file.
	reported := l.boundHeight(ctx, height)
	// Spec change 46 (Wyatt's review): a mismatch goes out as soon as it's found, before any catch-up work.
	l.mu.Lock()
	reportNow := l.reportNow
	l.mu.Unlock()
	if reportNow {
		return l.sendReport(ctx, key, reported)
	}
	l.mu.Lock()
	target := l.catchup
	l.mu.Unlock()
	if target > 0 { // unfinished (a failed rescan, or a restart): redo it before any snapshot
		if err := l.catchUp(ctx, w, target); err != nil {
			return err
		}
	}

	l.mu.Lock()
	learning := l.watch == nil
	var chunk []uint32
	if !learning {
		if l.cursor >= len(l.watch) {
			l.cursor = 0
		}
		end := min(l.cursor+maxSnapshots, len(l.watch))
		chunk = append(chunk, l.watch[l.cursor:end]...)
	}
	var addresses []syncclient.Address
	if !l.waiting { // while the site waits for the probe answer it takes no addresses: keep them pending
		addresses = append(addresses, l.pending[:min(len(l.pending), maxAddresses)]...)
	}
	answer, report := l.answer, l.report
	sendDigest := l.probeKey != keyText(key)
	l.mu.Unlock()
	// The wallet's index-1 digest goes with every sync until one carrying it succeeds (Wyatt): the site keeps the
	// first as this wallet's probe and ignores later ones.
	// A wallet without index 1 yet sends none: the top-up creates it, and the next sync carries the digest.
	var probeDigest string
	if sendDigest || answer != nil {
		d, err := l.index1Digest(ctx, w, false)
		if err != nil {
			return fmt.Errorf("wallet: %w", err)
		}
		probeDigest = d
	}

	snapshots, warnings, err := l.snapshots(ctx, w, chunk)
	if err != nil {
		return err
	}
	var resp syncclient.Response
	sent := len(snapshots)
	l.mu.Lock()
	nc := l.st.NodeCheck
	l.mu.Unlock()
	checks := &syncclient.Checks{Node: &syncclient.Check{State: string(nc.State), Detail: nc.Detail}, Wallet: l.walletCheck(ctx, height), Pool: report}
	l.mu.Lock()
	l.st.WalletCheck = checks.Wallet
	l.mu.Unlock()
	if changed, err := l.keyChanged(key); err != nil || changed {
		return err
	}
	for {
		body := syncclient.Body{V: syncclient.ProtocolV, Seq: l.nextSeq(), Height: reported, Addresses: addresses, Snapshots: snapshots[:sent], Checks: checks, Wallet: answer, ProbeDigest: probeDigest}
		resp, err = l.o.Site.Send(ctx, key, body)
		if errors.Is(err, syncclient.ErrTooLarge) && sent > 1 {
			sent /= 2
			continue
		}
		l.mu.Lock()
		var se *syncclient.Error
		switch {
		case err == nil:
			l.st.Synced++
		case errors.As(err, &se):
			l.st.SiteRefused++
		case !errors.Is(err, syncclient.ErrTooLarge):
			l.st.Unreachable++
		}
		l.mu.Unlock()
		if err != nil {
			return err
		}
		break
	}

	l.mu.Lock()
	// What this sync delivered: the addresses (by value: pending may have changed), the answer, the digest, the report.
	// A response that says the site is waiting for the probe answer took no addresses, so they stay pending.
	if resp.Probes == nil {
		l.pending = dropSent(l.pending, addresses)
		if len(addresses) > 0 {
			l.savePending()
		}
	}
	if probeDigest != "" {
		l.probeKey = keyText(key)
	}
	if answer != nil && l.answer == answer {
		l.answer = nil
	}
	if report != nil && l.report == report {
		l.report = nil
	}
	l.watch = resp.Watch
	passDone := true
	if !learning {
		l.cursor += sent
		passDone = l.cursor >= len(l.watch)
		if passDone {
			l.cursor = 0
		}
	}
	l.st.WalletHeight, l.st.PoolFree, l.st.PoolTarget, l.st.Watching, l.st.Warnings = height, resp.PoolFree, resp.PoolTarget, len(resp.Watch), warnings

	// Spec change 46, item 3: the site waits for this wallet's answer. Nothing is created, sent or caught up meanwhile.
	// RT-30: and nothing is answered until the wallet has scanned to its node's height, on a node that has caught up.
	if resp.Probes != nil {
		l.waiting = true
		l.mu.Unlock()
		if ok, why := l.probeReady(ctx, height); !ok {
			l.mu.Lock()
			defer l.mu.Unlock()
			l.soon = false
			if now := l.o.Now(); l.scanLoggedAt.IsZero() || now.Sub(l.scanLoggedAt) >= time.Minute {
				l.scanLoggedAt = now
				l.o.Log.Info("waiting for the wallet to scan before answering the site's wallet probe", why...)
			}
			return nil
		}
		ans, err := l.answerProbes(ctx, w, resp.Probes)
		l.mu.Lock()
		defer l.mu.Unlock()
		if err != nil {
			return fmt.Errorf("wallet: %w", err)
		}
		l.answer = ans
		l.reofferPending = ans.Match != nil
		l.soon = true
		return nil
	}
	l.waiting = false
	l.claimedTop = resp.ClaimedTop
	claimedTop := l.claimedTop
	reofferPending := l.reofferPending
	l.mu.Unlock()

	// Spec change 46, item 1: check the site's rows against this wallet. A mismatch is sent at once (next sync, before
	// any catch-up); "ok" waits until every row can be compared.
	catchTarget := claimedTop
	if resp.Check != nil {
		rep, within, err := l.checkPool(ctx, w, resp.Check, claimedTop)
		catchTarget = max(catchTarget, within)
		if err != nil {
			l.o.Log.Warn("checking the site's addresses", "err", err)
		} else if rep != nil {
			l.mu.Lock()
			l.report = rep
			l.st.PoolCheck = &PoolCheck{State: rep.State, Bad: rep.Bad, At: l.o.Now()}
			if rep.State == "mismatch" {
				l.reportNow, l.soon = true, true
				l.mu.Unlock()
				l.o.Log.Warn("the site holds addresses that aren't from this wallet", "indexes", rep.Bad)
				return nil
			}
			l.mu.Unlock()
		}
	}

	// The site has handed out an index the wallet may lack (a reinstall from keys): catch up before anything is
	// reported or topped up. Probed only when the target outgrows what the wallet is known to have. The target is
	// claimedTop, or a check-list row within claimedTop + maxPool, never further (RT-27).
	l.mu.Lock()
	known := l.known
	l.mu.Unlock()
	if catchTarget > known {
		has, err := w.HasSubaddress(ctx, catchTarget)
		if err == nil && !has {
			err = l.catchUp(ctx, w, catchTarget)
		}
		if err != nil {
			return fmt.Errorf("wallet: %w", err)
		}
		if !has {
			return nil // caught up; the next sync reconciles and tops up
		}
		l.mu.Lock()
		l.known = max(l.known, catchTarget)
		l.mu.Unlock()
	}

	// Spec change 46, item 4: after a match, the wallet's own unused subaddresses above claimedTop go first.
	if reofferPending {
		if err := l.prepareReoffer(ctx, w, claimedTop); err != nil {
			return fmt.Errorf("wallet: %w", err)
		}
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	// Top up: the site's free addresses plus those already on their way must reach the target, at most maxPool (RT-27).
	need := min(resp.PoolTarget, maxPool) - resp.PoolFree - len(l.pending)
	need = min(need, maxAddresses-len(l.pending))
	if need > 0 && len(l.reoffer) > 0 {
		take := l.reoffer[:min(need, len(l.reoffer))]
		l.mu.Unlock()
		got, err := w.SubaddressAddresses(ctx, take)
		l.mu.Lock()
		if err != nil {
			return fmt.Errorf("wallet: %w", err)
		}
		for _, i := range take {
			l.pending = append(l.pending, syncclient.Address{Index: i, Address: got[i]})
		}
		l.reoffer = l.reoffer[len(take):]
		l.savePending()
		need -= len(take)
	}
	if need > 0 {
		l.mu.Unlock()
		created, cerr := l.create(ctx, w, need)
		l.mu.Lock()
		// An index the site has already handed out means the wallet is behind after all: never send it (the duplicate
		// loop of 3h's L3), catch up on the next sync instead. Spec change 46: claimedTop, not poolTop.
		behind := false
		for _, a := range created {
			l.known = max(l.known, a.Index)
			if a.Index <= l.claimedTop {
				behind = true
				continue
			}
			if a.Index <= l.receivedTop {
				continue // after a no-match: an address that has received before is never handed out again
			}
			l.pending = append(l.pending, a)
		}
		if len(created) > 0 {
			l.savePending()
		}
		if behind && l.catchup == 0 {
			target := max(l.claimedTop, catchTarget)
			l.o.Log.Warn("the wallet returned an address the site has handed out; catching it up", "claimedTop", l.claimedTop)
			l.catchup = target
			l.st.CatchUp = &CatchUp{Target: target}
			l.saveCatchUp()
		}
		if cerr != nil {
			l.o.Log.Warn("creating pool addresses", "err", cerr)
		}
	}
	l.soon = learning || !passDone || len(l.pending) > 0 || l.catchup > 0 || l.answer != nil
	return nil
}

// dropSent removes the addresses a sync delivered from pending.
func dropSent(pending, sent []syncclient.Address) []syncclient.Address {
	if len(sent) == 0 {
		return pending
	}
	gone := make(map[uint32]bool, len(sent))
	for _, a := range sent {
		gone[a.Index] = true
	}
	out := pending[:0:0]
	for _, a := range pending {
		if !gone[a.Index] {
			out = append(out, a)
		}
	}
	return out
}

func keyText(k ed25519.PrivateKey) string {
	if len(k) != ed25519.PrivateKeySize {
		return ""
	}
	return string(k.Public().(ed25519.PublicKey))
}

// sendReport sends a mismatch at once, before any catch-up (spec change 46, Wyatt's review): no snapshots and no
// addresses, so it needs nothing from a wallet that may be behind.
func (l *Loop) sendReport(ctx context.Context, key ed25519.PrivateKey, height uint64) error {
	l.mu.Lock()
	report := l.report
	nc := l.st.NodeCheck
	l.mu.Unlock()
	checks := &syncclient.Checks{Node: &syncclient.Check{State: string(nc.State), Detail: nc.Detail}, Pool: report}
	body := syncclient.Body{V: syncclient.ProtocolV, Seq: l.nextSeq(), Height: height, Addresses: []syncclient.Address{}, Snapshots: []syncclient.Snapshot{}, Checks: checks}
	if changed, err := l.keyChanged(key); err != nil || changed {
		return err
	}
	_, err := l.o.Site.Send(ctx, key, body)
	l.mu.Lock()
	defer l.mu.Unlock()
	var se *syncclient.Error
	switch {
	case err == nil:
		l.st.Synced++
		l.reportNow = false
		if l.report == report {
			l.report = nil
		}
		l.soon = true
	case errors.As(err, &se):
		l.st.SiteRefused++
	default:
		l.st.Unreachable++
	}
	return err
}

// index1Digest is the digest of the wallet's own index-1 address, the probe the site keeps (spec change 46). Without
// index 1 the wallet creates it when create is set (to answer a probe), and nothing more; the new address joins the
// pending ones. Without create, it returns "".
func (l *Loop) index1Digest(ctx context.Context, w Wallet, create bool) (string, error) {
	l.mu.Lock()
	d, ok := l.digests[1]
	has := l.known >= 1
	l.mu.Unlock()
	if ok {
		return d, nil
	}
	if !has {
		var err error
		if has, err = w.HasSubaddress(ctx, 1); err != nil {
			return "", err
		}
	}
	if !has && !create {
		return "", nil
	}
	if !has {
		a, err := w.CreateAddress(ctx, addressLabel)
		if err != nil {
			return "", err
		}
		if a.Index != 1 || a.Address == "" {
			return "", fmt.Errorf("wallet-rpc created index %d, not 1", a.Index)
		}
		l.mu.Lock()
		l.known = max(l.known, 1)
		l.pending = append(l.pending, syncclient.Address{Index: 1, Address: a.Address})
		l.savePending()
		l.mu.Unlock()
	}
	got, err := w.SubaddressAddresses(ctx, []uint32{1})
	if err != nil {
		return "", err
	}
	d = syncclient.AddressDigest(got[1])
	l.mu.Lock()
	l.known = max(l.known, 1)
	l.digests[1] = d
	l.mu.Unlock()
	return d, nil
}

// probeReady says whether the wallet may answer the site's probe (RT-30): its node answered, is synchronized and
// online, and the wallet has scanned to the node's height, so ReceivedIndexes sees every payment the chain holds. The
// node is read fresh, not from the wallet check's one-minute cache, and the cache takes the new answer. Without a node
// to ask, never (fail closed; the service always has one). why holds log attributes for a no.
func (l *Loop) probeReady(ctx context.Context, wallet uint64) (ok bool, why []any) {
	if l.o.NodeInfo == nil {
		return false, []any{"reason", "no node to compare the wallet with"}
	}
	info, err := l.o.NodeInfo(ctx)
	l.mu.Lock()
	l.nodeAt, l.nodeInfo, l.nodeErr = l.o.Now(), info, err
	l.mu.Unlock()
	switch {
	case err != nil:
		return false, []any{"reason", "the node didn't answer", "err", err}
	case info.Offline:
		return false, []any{"reason", "the node is offline"}
	case !info.Synchronized:
		return false, []any{"reason", "the node is still catching up with the network", "node", info.Progress()}
	case wallet < info.Height:
		return false, []any{"reason", "the wallet is still scanning", "wallet", wallet, "node", info.Height}
	}
	return true, nil
}

// answerProbes compares the wallet's index-1 digest with each probe (spec change 46, item 3): the first match, or none.
// RT-30: a pending address that has received (index 1, created to answer, among them) is dropped, and after no match
// so is every one at or below receivedTop, the rule the top-up already applies to new addresses.
func (l *Loop) answerProbes(ctx context.Context, w Wallet, probes []syncclient.Probe) (*syncclient.WalletAnswer, error) {
	d, err := l.index1Digest(ctx, w, true)
	if err != nil {
		return nil, err
	}
	received, err := w.ReceivedIndexes(ctx)
	if err != nil {
		return nil, err
	}
	ans := &syncclient.WalletAnswer{}
	if len(received) > 0 {
		ans.ReceivedTop = received[len(received)-1]
	}
	for _, p := range probes {
		if p.Index == 1 && p.Digest == d {
			m := p.Wallet
			ans.Match = &m
			break
		}
	}
	paid := make(map[uint32]bool, len(received))
	for _, i := range received {
		paid[i] = true
	}
	l.mu.Lock()
	l.receivedTop = ans.ReceivedTop
	l.scanLoggedAt = time.Time{}
	kept := l.pending[:0:0]
	for _, a := range l.pending {
		if paid[a.Index] || (ans.Match == nil && a.Index <= ans.ReceivedTop) {
			continue
		}
		kept = append(kept, a)
	}
	if len(kept) != len(l.pending) {
		l.pending = kept
		l.savePending()
	}
	l.mu.Unlock()
	l.o.Log.Info("answering the site's wallet probe", "match", ans.Match != nil, "receivedTop", ans.ReceivedTop)
	return ans, nil
}

// walletTop finds the wallet's highest subaddress index at or below hi, from what's known (subaddress indexes have no
// gaps, so a binary search over HasSubaddress finds it).
func (l *Loop) walletTop(ctx context.Context, w Wallet, hi uint32) (uint32, error) {
	l.mu.Lock()
	lo := l.known
	l.mu.Unlock()
	if hi <= lo {
		return lo, nil
	}
	has, err := w.HasSubaddress(ctx, hi)
	if err != nil {
		return 0, err
	}
	if has {
		lo = hi
	} else {
		top := hi // lo has it, top doesn't
		for top-lo > 1 {
			mid := lo + (top-lo)/2
			ok, err := w.HasSubaddress(ctx, mid)
			if err != nil {
				return 0, err
			}
			if ok {
				lo = mid
			} else {
				top = mid
			}
		}
	}
	l.mu.Lock()
	l.known = max(l.known, lo)
	l.mu.Unlock()
	return lo, nil
}

// checkPool compares the site's check list with this wallet (spec change 46, item 1). An index the wallet holds with
// another address is bad; so is one it doesn't hold above claimedTop + maxPool, at once, with nothing created. One it
// doesn't hold within that is left for the catch-up (within returns the highest such row, up to the limit), and while
// any is left, a clean list gives no report: only "ok" waits for a catch-up.
func (l *Loop) checkPool(ctx context.Context, w Wallet, entries []syncclient.CheckEntry, claimedTop uint32) (rep *syncclient.PoolReport, within uint32, err error) {
	limit := uint64(claimedTop) + maxPool
	var hi uint32
	for _, e := range entries {
		if uint64(e.Index) <= limit {
			within = max(within, e.Index)
			hi = max(hi, e.Index)
		}
	}
	top, err := l.walletTop(ctx, w, hi)
	if err != nil {
		return nil, within, err
	}
	var bad, lookup []uint32
	missing := false
	l.mu.Lock()
	for _, e := range entries {
		switch {
		case uint64(e.Index) > limit:
			bad = append(bad, e.Index)
		case e.Index > top:
			missing = true
		default:
			if _, ok := l.digests[e.Index]; !ok {
				lookup = append(lookup, e.Index)
			}
		}
	}
	l.mu.Unlock()
	for len(lookup) > 0 {
		batch := lookup[:min(len(lookup), maxAddresses)]
		lookup = lookup[len(batch):]
		got, err := w.SubaddressAddresses(ctx, batch)
		if err != nil {
			return nil, within, err
		}
		l.mu.Lock()
		for i, a := range got {
			l.digests[i] = syncclient.AddressDigest(a)
		}
		l.mu.Unlock()
	}
	l.mu.Lock()
	for _, e := range entries {
		if uint64(e.Index) <= limit && e.Index <= top && l.digests[e.Index] != e.Digest {
			bad = append(bad, e.Index)
		}
	}
	l.mu.Unlock()
	if len(bad) > 0 {
		sort.Slice(bad, func(a, b int) bool { return bad[a] < bad[b] })
		return &syncclient.PoolReport{State: "mismatch", Bad: bad[:min(len(bad), syncclient.MaxBad)]}, within, nil
	}
	if missing {
		return nil, within, nil
	}
	return &syncclient.PoolReport{State: "ok", Bad: []uint32{}}, within, nil
}

// prepareReoffer lists the wallet's own created, unused subaddresses above the matched wallet's claimedTop (spec change
// 46, item 4): they go to the site before any new one, so a re-pair that keeps the wallet skips no numbers. Pending
// addresses the site already handed out are dropped.
func (l *Loop) prepareReoffer(ctx context.Context, w Wallet, claimedTop uint32) error {
	// The wallet's highest index: grow the bound until HasSubaddress says no, then search.
	l.mu.Lock()
	hi := max(l.known, claimedTop) + 1
	l.mu.Unlock()
	for {
		has, err := w.HasSubaddress(ctx, hi)
		if err != nil {
			return err
		}
		if !has || hi >= 1<<31 {
			break
		}
		hi = hi*2 + 1
	}
	top, err := l.walletTop(ctx, w, hi)
	if err != nil {
		return err
	}
	received, err := w.ReceivedIndexes(ctx)
	if err != nil {
		return err
	}
	paid := make(map[uint32]bool, len(received))
	for _, i := range received {
		paid[i] = true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	inPending := map[uint32]bool{}
	kept := l.pending[:0:0]
	for _, a := range l.pending {
		if a.Index > claimedTop {
			kept = append(kept, a)
			inPending[a.Index] = true
		}
	}
	l.pending = kept
	l.savePending()
	l.reoffer = nil
	for i := claimedTop + 1; i <= top && len(l.reoffer) < maxReoffer; i++ {
		if !paid[i] && !inPending[i] {
			l.reoffer = append(l.reoffer, i)
		}
	}
	l.reofferPending = false
	l.o.Log.Info("re-offering this wallet's unused addresses", "from", claimedTop+1, "count", len(l.reoffer))
	return nil
}

// catchUp brings a wallet restored from keys up to the site's pool (spec change 15): it creates subaddresses up to
// target without sending them (the site has them), then rescans once so payments mined to them before they existed
// in this wallet are found. The marker file makes an interrupted catch-up start again, rescan included.
func (l *Loop) catchUp(ctx context.Context, w Wallet, target uint32) error {
	l.mu.Lock()
	l.catchup = target
	l.st.CatchUp = &CatchUp{Target: target}
	err := l.saveCatchUp()
	l.mu.Unlock()
	l.writeStatus()
	if err != nil {
		return err
	}
	l.o.Log.Info("catching the wallet up to the site's addresses", "target", target)

	// One address first: its index says where the wallet stands. If that is already past the target, it is a new
	// address for the pool (a catch-up redone after its addresses were made), so nothing is wasted.
	first, err := w.CreateAddresses(ctx, addressLabel, 1)
	if err != nil {
		return fmt.Errorf("catching up the wallet: %w", err)
	}
	top := first[0].Index
	var extra []syncclient.Address
	if top > target {
		extra = append(extra, syncclient.Address{Index: top, Address: first[0].Address})
	}
	for top < target {
		l.progress(top, false)
		as, err := w.CreateAddresses(ctx, addressLabel, int(min(target-top, createBatch)))
		if err != nil {
			return fmt.Errorf("catching up the wallet: %w", err)
		}
		if as[0].Index != top+1 {
			return fmt.Errorf("catching up the wallet: wallet-rpc skipped from index %d to %d", top, as[0].Index)
		}
		top = as[len(as)-1].Index
	}
	l.progress(top, true)
	l.o.Log.Info("rescanning the wallet", "addresses", top)
	rctx, cancel := context.WithTimeout(ctx, rescanLimit)
	err = w.RescanBlockchain(rctx)
	cancel()
	if err != nil {
		return fmt.Errorf("rescanning the wallet: %w", err)
	}

	l.mu.Lock()
	l.catchup, l.st.CatchUp = 0, nil
	l.known = max(l.known, top)
	if len(extra) > 0 {
		l.pending = append(l.pending, extra...)
		l.savePending()
	}
	l.cursor, l.soon = 0, true
	if err := os.Remove(l.catchUpFile()); err != nil && !errors.Is(err, os.ErrNotExist) {
		l.o.Log.Error("removing the catch-up marker", "err", err)
	}
	l.mu.Unlock()
	l.writeStatus()
	l.o.Log.Info("the wallet is caught up", "addresses", top)
	return nil
}

func (l *Loop) progress(top uint32, rescanning bool) {
	l.mu.Lock()
	if l.st.CatchUp != nil {
		l.st.CatchUp.Addresses, l.st.CatchUp.Rescanning = top, rescanning
	}
	l.mu.Unlock()
	l.writeStatus()
}

// saveCatchUp records the catch-up's target. Called with l.mu held.
func (l *Loop) saveCatchUp() error {
	data, _ := json.Marshal(map[string]uint32{"target": l.catchup})
	if err := writeAtomic(l.catchUpFile(), data); err != nil {
		l.o.Log.Error("saving the catch-up marker", "err", err)
		return err
	}
	return nil
}

func (l *Loop) create(ctx context.Context, w Wallet, n int) ([]syncclient.Address, error) {
	var out []syncclient.Address
	for i := 0; i < n; i++ {
		a, err := w.CreateAddress(ctx, addressLabel)
		if err != nil {
			return out, err
		}
		if a.Index < 1 || a.Address == "" {
			return out, errors.New("wallet-rpc returned an unusable address")
		}
		out = append(out, syncclient.Address{Index: a.Index, Address: a.Address})
	}
	l.o.Log.Info("created pool addresses", "count", len(out))
	return out, nil
}

// snapshots reads the chunk's transfers in one call and builds one snapshot per index (empty when nothing
// arrived), each with at most 32 transfers: the largest, ties to the earlier height (spec change 12).
func (l *Loop) snapshots(ctx context.Context, w Wallet, chunk []uint32) ([]syncclient.Snapshot, []string, error) {
	if len(chunk) == 0 {
		return nil, nil, nil
	}
	all, err := w.GetTransfers(ctx, chunk)
	if err != nil {
		return nil, nil, fmt.Errorf("wallet: %w", err)
	}
	if l.o.CrossCheck != nil {
		var rep crosscheck.Report
		all, rep = l.o.CrossCheck.Check(ctx, all)
		l.mu.Lock()
		l.payCheck = rep
		l.combineNodeCheck()
		l.mu.Unlock()
		if rep.State == crosscheck.Mismatch || rep.State == crosscheck.Unavailable {
			l.o.Log.Warn("node cross-check", "state", rep.State, "detail", rep.Detail)
		}
	}
	by := map[uint32][]walletrpc.Transfer{}
	seen := map[uint32]map[string]bool{}
	for _, t := range all {
		if seen[t.Index] == nil {
			seen[t.Index] = map[string]bool{}
		}
		if seen[t.Index][t.TxID] {
			continue // one entry per transaction and address; the plugin refuses duplicates
		}
		seen[t.Index][t.TxID] = true
		by[t.Index] = append(by[t.Index], t)
	}
	var warnings []string
	out := make([]syncclient.Snapshot, 0, len(chunk))
	for _, idx := range chunk {
		ts := by[idx]
		if len(ts) > maxTransfers {
			sort.SliceStable(ts, func(i, j int) bool {
				if ts[i].Amount != ts[j].Amount {
					return less(ts[j].Amount, ts[i].Amount)
				}
				return ts[i].Height < ts[j].Height
			})
			warnings = append(warnings, fmt.Sprintf("subaddress %d has %d incoming transfers; only the 32 largest are reported (spec change 12)", idx, len(ts)))
			ts = ts[:maxTransfers]
		}
		snap := syncclient.Snapshot{Index: idx, Transfers: make([]syncclient.Transfer, 0, len(ts))}
		for _, t := range ts {
			snap.Transfers = append(snap.Transfers, syncclient.Transfer{TxID: t.TxID, Amount: t.Amount, Confirmations: t.Confirmations,
				Height: t.Height, Timestamp: t.Timestamp, DoubleSpendSeen: t.DoubleSpendSeen, UnlockTime: t.UnlockTime})
		}
		out = append(out, snap)
	}
	for _, w := range warnings {
		l.o.Log.Warn(w)
	}
	return out, warnings, nil
}

// less compares decimal strings without leading zeros (amounts from strconv.FormatUint).
func less(a, b string) bool {
	if len(a) != len(b) {
		return len(a) < len(b)
	}
	return a < b
}

// boundHeight is the height to report (RT-26, spec change 47, D1 and D2). With the shop's own node, the wallet's.
// With a remote node: the wallet's while it is at most crosscheck.HeightTolerance blocks above a second node's, else
// the second node's, from the first such sync; the node check says "mismatch" after heightMismatchAfter of it. With no
// second node answering, 0, which the site reads as no new height, and the node check says "unavailable". The second
// node is asked at most once a minute, and again (at most every secondAgainAfter) before a height is clamped, so a
// stale answer doesn't hold honest progress back.
func (l *Loop) boundHeight(ctx context.Context, wallet uint64) uint64 {
	if l.o.CrossCheck == nil {
		return wallet
	}
	now := l.o.Now()
	l.mu.Lock()
	age := now.Sub(l.secondAt)
	ask := l.secondAt.IsZero() || age >= nodeHeightEvery || (l.secondOK && wallet > l.secondHeight+crosscheck.HeightTolerance && age >= secondAgainAfter)
	l.mu.Unlock()
	if ask {
		h, host, ok := l.o.CrossCheck.SecondHeight(ctx)
		l.mu.Lock()
		l.secondAt, l.secondHeight, l.secondHost, l.secondOK = now, h, host, ok
		l.mu.Unlock()
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	defer l.combineNodeCheck()
	second, host := l.secondHeight, l.secondHost
	switch {
	case !l.secondOK:
		l.aheadSince = time.Time{}
		l.heightCheck = &crosscheck.Report{State: crosscheck.Unavailable, Detail: "no second node answered, so the bridge reports no chain height and mined payments are held at 0 confirmations until one does. Use your own node, or one you trust"}
		return 0
	case wallet <= second+crosscheck.HeightTolerance:
		l.aheadSince, l.heightCheck = time.Time{}, nil
		return wallet
	}
	if l.aheadSince.IsZero() {
		l.aheadSince = now
		l.o.Log.Warn("the configured node's chain is ahead of a second node's; reporting the second node's height", "wallet", wallet, "second", second, "node", host)
	}
	l.heightCheck = nil
	if now.Sub(l.aheadSince) >= heightMismatchAfter {
		l.heightCheck = &crosscheck.Report{State: crosscheck.Mismatch, Node: host, Detail: fmt.Sprintf("the configured node reports block %d, %d blocks above %s's %d, so the bridge reports %d. Use your own node, or one you trust", wallet, wallet-second, host, second, second)}
	}
	return second
}

// combineNodeCheck sets the node check from the payment check and the height bound: a payment-block mismatch first,
// then anything the height bound has to say, then the payment check. Called with l.mu held.
func (l *Loop) combineNodeCheck() {
	l.st.NodeCheck = l.payCheck
	if l.heightCheck != nil && l.payCheck.State != crosscheck.Mismatch {
		l.st.NodeCheck = *l.heightCheck
	}
}

// walletCheck compares the wallet's height with its node's (asked at most every nodeHeightEvery), and says when
// the node itself hasn't caught up with the network (spec change 20); nil without NodeInfo. The node's error stays in
// the log: it can hold the node's address, which the site doesn't need.
func (l *Loop) walletCheck(ctx context.Context, wallet uint64) *syncclient.Check {
	if l.o.NodeInfo == nil {
		return nil
	}
	now := l.o.Now()
	l.mu.Lock()
	stale := l.nodeAt.IsZero() || now.Sub(l.nodeAt) >= nodeHeightEvery
	l.mu.Unlock()
	if stale {
		info, err := l.o.NodeInfo(ctx)
		if err != nil {
			l.o.Log.Warn("reading the node's height", "err", err)
		}
		l.mu.Lock()
		l.nodeAt, l.nodeInfo, l.nodeErr = now, info, err
		l.mu.Unlock()
	}
	l.mu.Lock()
	info, err := l.nodeInfo, l.nodeErr
	l.mu.Unlock()
	if err != nil {
		return &syncclient.Check{State: "unavailable", Detail: "the wallet host's node didn't answer; on the wallet host, run xmr-bridge status"}
	}
	if !info.Synchronized {
		return &syncclient.Check{State: "syncing", Detail: "the wallet host's node is still catching up with the network (" + info.Progress() + "); payments show up once it has"}
	}
	detail := fmt.Sprintf("the wallet is at block %d, its node at %d", wallet, info.Height)
	if info.Height > wallet+walletBehind {
		return &syncclient.Check{State: "behind", Detail: detail}
	}
	return &syncclient.Check{State: "ok", Detail: detail}
}

func (l *Loop) nextSeq() int64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	s := l.o.Now().UnixMilli()
	if s <= l.lastSeq {
		s = l.lastSeq + 1
	}
	l.lastSeq = s
	return s
}

// savePending writes the pending addresses (or removes the file when none). Called with l.mu held.
func (l *Loop) savePending() {
	if len(l.pending) == 0 {
		os.Remove(l.pendingFile())
		return
	}
	data, _ := json.Marshal(l.pending)
	if err := writeAtomic(l.pendingFile(), data); err != nil {
		l.o.Log.Error("saving pending addresses", "err", err)
	}
}

func (l *Loop) writeStatus() {
	st := l.Status()
	if l.o.Extra != nil {
		st.WalletRPC = l.o.Extra()
	}
	if l.o.Updates != nil {
		st.Updates = l.o.Updates()
	}
	data, _ := json.MarshalIndent(st, "", "  ")
	if err := writeAtomic(filepath.Join(l.runDir(), "status.json"), append(data, '\n')); err != nil {
		l.o.Log.Error("writing status", "err", err)
	}
}

// ReadStatus reads the status file the running bridge writes.
func ReadStatus(dataDir string) (Status, error) {
	var st Status
	data, err := os.ReadFile(filepath.Join(dataDir, "run", "status.json"))
	if err != nil {
		return st, err
	}
	return st, json.Unmarshal(data, &st)
}

func writeAtomic(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	if err := tmp.Chmod(0o600); err != nil {
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
