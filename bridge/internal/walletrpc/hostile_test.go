package walletrpc

import (
	"context"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/hostile"
	"github.com/dwightsabeast/coffer/bridge/internal/secret"
)

// Phase 07b: hostileWallet is a wallet-rpc that answers each method with what the test scripts (internal/hostile),
// with no digest challenge, for replies the digest fake (fake_test.go) can't shape: streamed, dripped or cut bodies.
func hostileWallet(t *testing.T, methods map[string]hostile.Reply) (*hostile.Server, *Client) {
	s := hostile.Routed(t, false, hostile.RPC(methods))
	return s, New(s.URL, "user", secret.New("pass"), s.Client())
}

func TestHostileWalletHarness(t *testing.T) {
	_, c := hostileWallet(t, map[string]hostile.Reply{"get_height": hostile.Result(`{"height":123}`)})
	if h, err := c.GetHeight(context.Background()); err != nil || h != 123 {
		t.Fatalf("%d %v", h, err)
	}
}
