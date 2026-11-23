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
)

// Spec change 60: status shows this copy's version and the service's, and says how the older one catches up.
func TestStatusShowsBothVersions(t *testing.T) {
	prev := version
	version = "1.0.0"
	defer func() { version = prev }()
	p, c := writeConfig(t, "https://shop.example")
	os.MkdirAll(filepath.Join(c.DataDir, "run"), 0o700)
	now := time.Now()
	for _, tc := range []struct {
		service string
		want    []string
		not     string
	}{
		{"1.0.0", []string{"Version:    1.0.0 (this copy); the service runs 1.0.0"}, "refresh-admin"},
		{"1.0.1", []string{"Version:    1.0.0 (this copy); the service runs 1.0.1", "sudo xmr-bridge refresh-admin"}, ""},
	} {
		b, _ := json.Marshal(bridgeloop.Status{LastAttemptAt: now, LastSyncAt: now, PoolTarget: 50, PoolFree: 50, Version: tc.service})
		os.WriteFile(filepath.Join(c.DataDir, "run", "status.json"), b, 0o600)
		_, out, _ := run(context.Background(), "status", "--config", p)
		for _, w := range tc.want {
			if !strings.Contains(out, w) {
				t.Errorf("service %s: status lacks %q:\n%s", tc.service, w, out)
			}
		}
		if tc.not != "" && strings.Contains(out, tc.not) {
			t.Errorf("service %s: status mentions %q:\n%s", tc.service, tc.not, out)
		}
	}
}

func TestRefreshAdminNeedsRoot(t *testing.T) {
	prevRoot := isRoot
	isRoot = func() bool { return false }
	defer func() { isRoot = prevRoot }()
	code, _, errOut := run(context.Background(), "refresh-admin")
	if code != 1 || !strings.Contains(errOut, "sudo") {
		t.Fatalf("%d %q", code, errOut)
	}
	if code, _, _ := run(context.Background(), "refresh-admin", "--config", "/etc/xmr-bridge/config"); code != 2 {
		t.Fatalf("refresh-admin takes no config (it's the service user's file): exit %d", code)
	}
}
