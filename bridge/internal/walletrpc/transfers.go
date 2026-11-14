package walletrpc

import (
	"context"
	"fmt"
	"sort"
	"strconv"
)

// Transfer is one incoming transfer to a watched subaddress, with the fields the plugin uses (spec, bridge/sync,
// "Transfer fields"). Amount and UnlockTime are decimal strings. wallet-rpc's `locked` is deliberately not read: it
// is Monero's 10-block spendable age, not a time lock (phase 01 spike, Q7).
type Transfer struct {
	TxID            string
	Index           uint32 // subaddress index in account 0
	Amount          string // atomic units
	Confirmations   uint64 // 0 while in the pool
	Height          uint64 // 0 while in the pool
	Timestamp       uint64
	DoubleSpendSeen bool
	UnlockTime      string
	Pool            bool
}

type rawTransfer struct {
	TxID            string `json:"txid"`
	Amount          uint64 `json:"amount"`
	Confirmations   uint64 `json:"confirmations"`
	Height          uint64 `json:"height"`
	Timestamp       uint64 `json:"timestamp"`
	DoubleSpendSeen bool   `json:"double_spend_seen"`
	UnlockTime      uint64 `json:"unlock_time"`
	SubaddrIndex    struct {
		Major uint32 `json:"major"`
		Minor uint32 `json:"minor"`
	} `json:"subaddr_index"`
}

// GetTransfers returns incoming and pool transfers to the given subaddress indexes of account 0, incoming first.
// With no indexes it makes no call: wallet-rpc would return every subaddress.
func (c *Client) GetTransfers(ctx context.Context, indexes []uint32) ([]Transfer, error) {
	if len(indexes) == 0 {
		return nil, nil
	}
	var r struct {
		In   []rawTransfer `json:"in"`
		Pool []rawTransfer `json:"pool"`
	}
	params := map[string]any{"in": true, "pool": true, "out": false, "account_index": 0, "subaddr_indices": indexes}
	if err := c.call(ctx, "get_transfers", params, &r); err != nil {
		return nil, err
	}
	want := make(map[uint32]bool, len(indexes))
	for _, i := range indexes {
		want[i] = true
	}
	out := make([]Transfer, 0, len(r.In)+len(r.Pool))
	for _, group := range []struct {
		list []rawTransfer
		pool bool
	}{{r.In, false}, {r.Pool, true}} {
		for _, t := range group.list {
			if !isTxID(t.TxID) {
				return nil, fmt.Errorf("walletrpc: get_transfers: malformed txid")
			}
			if t.SubaddrIndex.Major != 0 || !want[t.SubaddrIndex.Minor] {
				return nil, fmt.Errorf("walletrpc: get_transfers: transfer for an index that wasn't asked for (%d/%d)", t.SubaddrIndex.Major, t.SubaddrIndex.Minor)
			}
			out = append(out, Transfer{
				TxID:            t.TxID,
				Index:           t.SubaddrIndex.Minor,
				Amount:          strconv.FormatUint(t.Amount, 10),
				Confirmations:   t.Confirmations,
				Height:          t.Height,
				Timestamp:       t.Timestamp,
				DoubleSpendSeen: t.DoubleSpendSeen,
				UnlockTime:      strconv.FormatUint(t.UnlockTime, 10),
				Pool:            group.pool,
			})
		}
	}
	return out, nil
}

// isTxID reports whether s is 64 lowercase hex characters, as wallet-rpc writes transaction ids.
func isTxID(s string) bool {
	if len(s) != 64 {
		return false
	}
	for i := 0; i < len(s); i++ {
		if !('0' <= s[i] && s[i] <= '9' || 'a' <= s[i] && s[i] <= 'f') {
			return false
		}
	}
	return true
}

// ReceivedIndexes returns every account-0 subaddress index with an incoming or pool transfer, sorted, once each (spec
// change 46: the probe answer's receivedTop, and which created addresses are unused for the re-offer). It asks for
// every subaddress, so the answer grows with the shop's history; the client's 16 MiB response cap bounds it.
func (c *Client) ReceivedIndexes(ctx context.Context) ([]uint32, error) {
	var r struct {
		In   []rawTransfer `json:"in"`
		Pool []rawTransfer `json:"pool"`
	}
	params := map[string]any{"in": true, "pool": true, "out": false, "account_index": 0}
	if err := c.call(ctx, "get_transfers", params, &r); err != nil {
		return nil, err
	}
	seen := map[uint32]bool{}
	for _, t := range append(r.In, r.Pool...) {
		if t.SubaddrIndex.Major == 0 {
			seen[t.SubaddrIndex.Minor] = true
		}
	}
	out := make([]uint32, 0, len(seen))
	for i := range seen {
		out = append(out, i)
	}
	sort.Slice(out, func(a, b int) bool { return out[a] < out[b] })
	return out, nil
}
