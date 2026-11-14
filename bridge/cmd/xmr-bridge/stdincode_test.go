package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/bridgeloop"
	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
)

// Spec change 46, item 6 (T29): `--code -` and `--pair -` read the one-time code from stdin, one line, so it isn't on
// the command line while the command runs.

func withStdin(t *testing.T, s string) {
	t.Helper()
	old := stdin
	stdin = strings.NewReader(s)
	t.Cleanup(func() { stdin = old })
}

func TestPairCodeFromStdin(t *testing.T) {
	t.Run("[T29] pair --code - reads the code from stdin", func(t *testing.T) {
		srv, paired := pairingSite(t)
		p, c := writeConfig(t, srv.URL)
		withStdin(t, testCode+"\n")
		code, out, errOut := run(context.Background(), "pair", "--config", p, "--code", "-")
		if code != 0 || !strings.Contains(out, "Paired") {
			t.Fatalf("pair: %d %q %q", code, out, errOut)
		}
		k, err := syncsign.LoadKey(filepath.Join(c.DataDir, "bridge.key"))
		if err != nil || syncsign.PublicKeyText(k) != *paired {
			t.Fatalf("saved key doesn't match the paired one: %v", err)
		}
	})
	t.Run("[T29] surrounding spaces and a missing newline are fine", func(t *testing.T) {
		srv, _ := pairingSite(t)
		p, _ := writeConfig(t, srv.URL)
		withStdin(t, "  "+testCode+"  ")
		if code, _, errOut := run(context.Background(), "pair", "--config", p, "--code", "-"); code != 0 {
			t.Fatalf("pair: %d %q", code, errOut)
		}
	})
	t.Run("[T29] an empty stdin is refused before anything is sent, and a bad line is refused as a bad code", func(t *testing.T) {
		srv, paired := pairingSite(t)
		p, _ := writeConfig(t, srv.URL)
		withStdin(t, "")
		if code, _, errOut := run(context.Background(), "pair", "--config", p, "--code", "-"); code != 2 || !strings.Contains(errOut, "no pairing code on stdin") {
			t.Fatalf("empty stdin: %d %q", code, errOut)
		}
		withStdin(t, "not-a-code\n")
		if code, _, errOut := run(context.Background(), "pair", "--config", p, "--code", "-"); code != 1 || !strings.Contains(errOut, "isn't a pairing code") {
			t.Fatalf("bad line: %d %q", code, errOut)
		}
		if *paired != "" {
			t.Fatal("something paired")
		}
	})
}

func TestInstallCodeFromStdin(t *testing.T) {
	t.Run("[T29] install --pair - takes the code from stdin, refusing an empty one", func(t *testing.T) {
		withStdin(t, "")
		code, _, errOut := run(context.Background(), "install", "--site", "https://shop.example", "--pair", "-")
		if code != 2 || !strings.Contains(errOut, "no pairing code on stdin") {
			t.Fatalf("empty stdin: %d %q", code, errOut)
		}
		got, err := codeArg("-")
		if err == nil || got != "" {
			t.Fatalf("codeArg on an empty stdin: %q %v", got, err)
		}
		withStdin(t, testCode+"\nextra line\n")
		if got, err := codeArg("-"); err != nil || got != testCode {
			t.Fatalf("codeArg: %q %v", got, err)
		}
		if got, err := codeArg(testCode); err != nil || got != testCode {
			t.Fatalf("codeArg on a plain value: %q %v", got, err)
		}
	})
}

func TestStatusAddressCheck(t *testing.T) {
	t.Run("[T03][R08] status shows the address check: not asked yet, ok, or a mismatch (unhealthy) with the indexes", func(t *testing.T) {
		p, c := writeConfig(t, "https://shop.example")
		k, _ := syncsign.NewKey()
		syncsign.SaveKey(filepath.Join(c.DataDir, "bridge.key"), k)
		os.MkdirAll(filepath.Join(c.DataDir, "run"), 0o700)
		now := time.Now()
		for name, want := range map[string]struct {
			pc   *bridgeloop.PoolCheck
			code int
			text string
		}{
			"none":     {nil, 0, "Address check: not asked yet"},
			"ok":       {&bridgeloop.PoolCheck{State: "ok", At: now}, 0, "Address check: ok"},
			"mismatch": {&bridgeloop.PoolCheck{State: "mismatch", Bad: []uint32{9, 4000000000}, At: now}, 1, "Address check: MISMATCH: the site holds addresses that aren't from this wallet (#9, #4000000000)"},
		} {
			b, _ := json.Marshal(bridgeloop.Status{LastAttemptAt: now, LastSyncAt: now, WalletHeight: 2222000, PoolFree: 48, PoolTarget: 50, PoolCheck: want.pc})
			os.WriteFile(filepath.Join(c.DataDir, "run", "status.json"), b, 0o600)
			code, out, _ := run(context.Background(), "status", "--config", p)
			if code != want.code || !strings.Contains(out, want.text) {
				t.Errorf("%s: %d %q", name, code, out)
			}
		}
	})
}
