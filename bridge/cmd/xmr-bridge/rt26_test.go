package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/config"
)

// Spec change 47, part 4: the pairing request's height resets the site's height (D4), so both pairing paths (this
// command and the installer's Pair step, through pairHeight) send only a bounded one: 0 unless the node is
// synchronized and online.

// heightSite accepts any pairing and records the height each request carried.
func heightSite(t *testing.T) (*httptest.Server, *[]uint64) {
	var heights []uint64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var b struct {
			Height uint64 `json:"height"`
		}
		json.Unmarshal(body, &b)
		heights = append(heights, b.Height)
		io.WriteString(w, `{"success":true,"data":{"ok":true,"poolFree":0,"poolTarget":50,"watch":[]}}`)
	}))
	t.Cleanup(srv.Close)
	return srv, &heights
}

// infoNode answers get_info with the given height and synchronized flag.
func infoNode(t *testing.T, height uint64, synced bool) string {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"jsonrpc":"2.0","id":"0","result":{"status":"OK","nettype":"stagenet","height":%d,"synchronized":%t}}`, height, synced)
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestPairHeightBounded(t *testing.T) {
	for _, c := range []struct {
		name   string
		synced bool
		want   uint64
	}{
		{"[T14][R09] [RT-26] a node still catching up: the pairing carries no height", false, 0},
		{"[T14][R09] a synchronized own node: its height", true, 2242155},
	} {
		t.Run(c.name, func(t *testing.T) {
			srv, heights := heightSite(t)
			p, cfg := writeConfig(t, srv.URL)
			height := uint64(94954)
			if c.synced {
				height = 2242155
			}
			cfg.Node = infoNode(t, height, c.synced) // loopback: the shop's own node
			if err := config.Save(p, cfg); err != nil {
				t.Fatal(err)
			}
			if code, out, errOut := run(context.Background(), "pair", "--config", p, "--code", testCode); code != 0 {
				t.Fatalf("pair: %d %q %q", code, out, errOut)
			}
			if len(*heights) != 1 || (*heights)[0] != c.want {
				t.Fatalf("pairing heights %v, want %d", *heights, c.want)
			}
		})
	}
}
