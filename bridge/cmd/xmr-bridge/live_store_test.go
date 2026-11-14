package main

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/config"
	"github.com/dwightsabeast/coffer/bridge/internal/noderpc"
	"github.com/dwightsabeast/coffer/bridge/internal/secret"
	"github.com/dwightsabeast/coffer/bridge/internal/supervise"
	"github.com/dwightsabeast/coffer/bridge/internal/wallet"
)

// TestLiveStoreSurvivesKill is RT-32's test 7: does a created address survive kill -9 of the real wallet-rpc? A view-only
// copy of the stagenet shop wallet in a temporary folder, deleted after; no site, no money, and the view key is never
// printed. XMR_BRIDGE_LIVE_NO_STORE=1 leaves out the store call and fails if the address is forgotten, which shows the
// test can fail (Wyatt: run it once that way first). Same setup as TestLiveShopWallet.
func TestLiveStoreSurvivesKill(t *testing.T) {
	addr, binDir, base := os.Getenv("SHOP_ADDRESS"), os.Getenv("XMR_BRIDGE_LIVE_BIN_DIR"), os.Getenv("XMR_BRIDGE_LIVE_DATA")
	view := secret.New(os.Getenv("SHOP_VIEW_KEY"))
	os.Unsetenv("SHOP_VIEW_KEY") // nothing started from here inherits it
	if addr == "" || view.IsEmpty() || binDir == "" || base == "" {
		t.Skip("run under scripts/with-shop-env.sh with XMR_BRIDGE_LIVE_BIN_DIR and XMR_BRIDGE_LIVE_DATA set")
	}
	withStore := os.Getenv("XMR_BRIDGE_LIVE_NO_STORE") != "1"
	data, err := os.MkdirTemp(base, "rt32-store-")
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := os.RemoveAll(data); err != nil {
			t.Errorf("cleanup: %v", err)
		}
	}()
	if err := os.MkdirAll(filepath.Join(data, "bin"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"monero-wallet-rpc", "installed.json"} {
		b, err := os.ReadFile(filepath.Join(binDir, f))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(data, "bin", f), b, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	nodeURL := "http://127.0.0.1:38081"
	node, err := noderpc.GetInfo(ctx, nodeURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	// A recent restore height: the test needs the wallet file, not its history.
	cfg := config.Config{Site: "http://localhost:4321", Network: config.Stagenet, Address: addr, Node: nodeURL, DataDir: data, RestoreHeight: node.Height - 5, AllowSameMachine: true}
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	sup, err := supervise.New(supervise.Options{Binary: filepath.Join(data, "bin", "monero-wallet-rpc"), DataDir: data, Network: cfg.Network, Node: cfg.Node, Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if err != nil {
		t.Fatal(err)
	}
	sctx, scancel := context.WithCancel(ctx)
	sdone := make(chan struct{})
	go func() { sup.Run(sctx); close(sdone) }()
	stopFirst := func() { scancel(); <-sdone }
	defer stopFirst()
	c, err := sup.WaitReady(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := wallet.Create(ctx, c, cfg, view, node); err != nil {
		t.Fatal(err)
	}
	stopFirst()

	h, err := defaultStartBridge(ctx, cfg, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	defer h.Stop()
	r := h.(*running)
	if c, err = r.sup.WaitReady(ctx); err != nil {
		t.Fatal(err)
	}
	as, err := c.CreateAddresses(ctx, "coffer", 50)
	if err != nil {
		t.Fatal(err)
	}
	top := as[len(as)-1].Index
	if withStore {
		if err := c.Store(ctx); err != nil {
			t.Fatalf("store: %v", err)
		}
	}
	first := r.sup.Status().PID
	if err := syscall.Kill(first, syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	for deadline := time.Now().Add(3 * time.Minute); ; time.Sleep(500 * time.Millisecond) {
		if st := r.sup.Status(); st.Ready && st.PID != first {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("not reopened after kill -9: %+v", r.sup.Status())
		}
	}
	if c, err = r.sup.WaitReady(ctx); err != nil {
		t.Fatal(err)
	}
	has, err := c.HasSubaddress(ctx, top)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("store called: %v; created up to index %d; after kill -9 the wallet holds it: %v", withStore, top, has)
	if !has {
		t.Fatalf("the wallet forgot index %d after kill -9", top)
	}
}
