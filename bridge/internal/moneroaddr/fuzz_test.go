package moneroaddr

import (
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/testaddr"
)

// Phase 07b pass 1, round 2 (Step 3): whatever is pasted at the installer's address prompt, Parse never panics, and an
// accepted address has a known network and the right length for its kind.
func FuzzParse(f *testing.F) {
	f.Add(testaddr.Stagenet)
	f.Add(testaddr.Mainnet)
	f.Add("")
	f.Add("5" + string(make([]byte, 94)))
	f.Fuzz(func(t *testing.T, s string) {
		net, kind, err := Parse(s)
		if err != nil {
			return
		}
		if net != "mainnet" && net != "stagenet" && net != "testnet" {
			t.Fatalf("network %q", net)
		}
		if _, _, err := PublicKeys(s); kind != Integrated && err != nil {
			t.Fatalf("accepted %q but no keys: %v", s, err)
		}
	})
}
