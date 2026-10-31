package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
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

// RT-28 (Step 6, F5): govulncheck v1.9.0 finds 10 called standard-library vulnerabilities in go1.27.1, the Go the dev
// releases, the installed dev bridge and CI's setup-go pin all use. Two reach the shipped bridge in practice:
// GO-2026-6809 (crypto/x509's distrust list, fixed in go1.27.3) and GO-2026-6611 (HTTP/2 client CPU, fixed in
// go1.27.2). The test binary is built by the same toolchain as the bridge in the same place (this box, CI), so it
// checks that toolchain. It's a floor for today's advisories, not a substitute for running govulncheck (T28).
func TestRedteamToolchainFloor(t *testing.T) {
	t.Run("[T28] [RT-28] the bridge is built with go1.27.3 or later (known standard-library fixes)", func(t *testing.T) {
		t.Skip("RT-28 open")
		v := runtime.Version()
		m := regexp.MustCompile(`^go(\d+)\.(\d+)(?:\.(\d+))?$`).FindStringSubmatch(v)
		if m == nil {
			t.Skipf("not a release toolchain: %s", v)
		}
		n := func(s string) int { i, _ := strconv.Atoi(s); return i }
		got := [3]int{n(m[1]), n(m[2]), n(m[3])}
		floor := [3]int{1, 27, 3}
		for i := range got {
			if got[i] != floor[i] {
				if got[i] < floor[i] {
					t.Fatalf("built with %s; go1.27.3 or later has the fixes for GO-2026-6809 and GO-2026-6611", v)
				}
				return
			}
		}
	})
}
