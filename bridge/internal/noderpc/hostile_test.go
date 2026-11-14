package noderpc

import (
	"context"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/hostile"
)

// Phase 07b: hostileNode is a node that answers each JSON-RPC method with what the test scripts (internal/hostile;
// hostile.Result for a raw "result"), and -32601 for any other method.
func hostileNode(t *testing.T, methods map[string]hostile.Reply) *hostile.Server {
	return hostile.Routed(t, false, hostile.RPC(methods))
}

func TestHostileNodeHarness(t *testing.T) {
	s := hostileNode(t, map[string]hostile.Reply{"get_info": hostile.Result(`{"status":"OK","nettype":"stagenet","height":2236600,"synchronized":true}`)})
	info, err := GetInfo(context.Background(), s.URL, s.Client())
	if err != nil || info.Height != 2236600 {
		t.Fatalf("%+v %v", info, err)
	}
}
