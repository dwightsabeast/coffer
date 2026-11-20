package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/bridgeloop"
	"github.com/dwightsabeast/coffer/bridge/internal/selfupdate"
	"github.com/dwightsabeast/coffer/bridge/internal/testaddr"
)

func TestStagenetWallet(t *testing.T) {
	addr := func(a string, err error) func(context.Context) (string, error) {
		return func(context.Context) (string, error) { return a, err }
	}
	if err := stagenetWallet(context.Background(), addr(testaddr.Stagenet, nil)); err != nil {
		t.Fatalf("stagenet refused: %v", err)
	}
	for name, get := range map[string]func(context.Context) (string, error){
		"mainnet wallet":          addr(testaddr.Mainnet, nil),
		"testnet wallet":          addr(testaddr.Testnet, nil),
		"wallet-rpc says nothing": addr("", errors.New("No wallet file")),
		"garbage address":         addr("not an address", nil),
	} {
		if err := stagenetWallet(context.Background(), get); err == nil {
			t.Errorf("%s: a dev update was allowed", name)
		}
	}
}

func TestUpdateHealthR14(t *testing.T) {
	t.Run("[R14] the update guard gets the loop's counts and its unreachable time, an ongoing outage included", func(t *testing.T) {
		now := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
		ls := bridgeloop.Status{Synced: 0, SiteRefused: 2, Unreachable: 5, UnreachableSince: now.Add(-3 * time.Minute), UnreachableTotal: 4 * time.Minute}
		h := updateHealth(true, 1, ls, now)
		want := selfupdate.Health{WalletOpen: true, WalletRPCRestarts: 1, Synced: 0, SiteRefused: 2, Unreachable: 5, UnreachableFor: 7 * time.Minute}
		if h != want {
			t.Errorf("got %+v, want %+v", h, want)
		}
	})
}
