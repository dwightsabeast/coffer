package walletrpc

import (
	"context"
	"encoding/json"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

// Spec change 46: the bridge reads its own addresses by index (the pool check, the probe) and every index with a
// transfer (receivedTop, and which created addresses are unused for the re-offer).

func TestSubaddressAddresses(t *testing.T) {
	t.Run("[T03] get_address with an address_index list returns each index's address", func(t *testing.T) {
		f, srv := newFake(t)
		f.results["get_address"] = `{"address":"5main","addresses":[{"address":"7one","address_index":1,"label":"coffer","used":false},{"address":"7three","address_index":3,"label":"coffer","used":true}]}`
		got, err := client(f, srv).SubaddressAddresses(context.Background(), []uint32{1, 3})
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, map[uint32]string{1: "7one", 3: "7three"}) {
			t.Fatalf("got %v", got)
		}
		var p map[string]any
		json.Unmarshal(f.calls[len(f.calls)-1].Params, &p)
		if p["account_index"] != float64(0) || !reflect.DeepEqual(p["address_index"], []any{float64(1), float64(3)}) {
			t.Fatalf("params %v", p)
		}
	})
	t.Run("[T03] an answer for another index, or a missing one, is an error, not a match", func(t *testing.T) {
		f, srv := newFake(t)
		f.results["get_address"] = `{"address":"5main","addresses":[{"address":"7one","address_index":2}]}`
		if _, err := client(f, srv).SubaddressAddresses(context.Background(), []uint32{1}); err == nil {
			t.Fatal("accepted an answer for index 2")
		}
	})
	t.Run("no indexes, no call", func(t *testing.T) {
		f, srv := newFake(t)
		got, err := client(f, srv).SubaddressAddresses(context.Background(), nil)
		if err != nil || len(got) != 0 || len(f.calls) != 0 {
			t.Fatalf("got %v, %v, %d calls", got, err, len(f.calls))
		}
	})
}

func TestReceivedIndexes(t *testing.T) {
	t.Run("[P02] every account-0 index with an incoming or pool transfer, sorted, once each", func(t *testing.T) {
		f, srv := newFake(t)
		tx := func(minor int, id string) string {
			return `{"txid":"` + id + `","amount":1,"confirmations":1,"height":1,"timestamp":1,"double_spend_seen":false,"unlock_time":0,"subaddr_index":{"major":0,"minor":` + strconv.Itoa(minor) + `}}`
		}
		a, b := "aa"+strings.Repeat("0", 62), "bb"+strings.Repeat("0", 62)
		f.results["get_transfers"] = `{"in":[` + tx(305, a) + `,` + tx(2, b) + `,` + tx(305, b) + `],"pool":[` + tx(356, a) + `]}`
		got, err := client(f, srv).ReceivedIndexes(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, []uint32{2, 305, 356}) {
			t.Fatalf("got %v", got)
		}
		var p map[string]any
		json.Unmarshal(f.calls[len(f.calls)-1].Params, &p)
		if p["in"] != true || p["pool"] != true || p["out"] != false || p["account_index"] != float64(0) || p["subaddr_indices"] != nil {
			t.Fatalf("params %v", p)
		}
	})
	t.Run("[P02] nothing received: none", func(t *testing.T) {
		f, srv := newFake(t)
		f.results["get_transfers"] = `{}`
		got, err := client(f, srv).ReceivedIndexes(context.Background())
		if err != nil || len(got) != 0 {
			t.Fatalf("got %v, %v", got, err)
		}
	})
}
