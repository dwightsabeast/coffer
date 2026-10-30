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
	"github.com/dwightsabeast/coffer/bridge/internal/crosscheck"
	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
)

// Phase 07b pass 1, round 2 (Step 3, white box). An attack that lands is committed with t.Skip("RT-nn open") until
// the fix session flips it.

// RT-23: with mined payments to check there were none, the cross-check reports OK with the detail "no mined payments
// to check" (crosscheck.go:144), and status prints only "ok" (pairstatus.go:166). Seen live in F1's watch.
func TestRedteamNodeCheckNothingChecked(t *testing.T) {
	t.Run("[R13][T14] [RT-23] status doesn't say ok when the cross-check had nothing to check", func(t *testing.T) {
		t.Skip("RT-23 open")
		p, c := writeConfig(t, "https://shop.example")
		k, _ := syncsign.NewKey()
		syncsign.SaveKey(filepath.Join(c.DataDir, "bridge.key"), k)
		os.MkdirAll(filepath.Join(c.DataDir, "run"), 0o700)
		now := time.Now()
		b, _ := json.Marshal(bridgeloop.Status{LastAttemptAt: now, LastSyncAt: now, PoolTarget: 50, PoolFree: 50,
			NodeCheck: crosscheck.Report{State: crosscheck.OK, Detail: "no mined payments to check"}})
		os.WriteFile(filepath.Join(c.DataDir, "run", "status.json"), b, 0o600)
		_, out, _ := run(context.Background(), "status", "--config", p)
		if strings.Contains(out, "Node check: ok\n") {
			t.Fatalf("says ok with nothing checked: %q", out)
		}
	})
}
