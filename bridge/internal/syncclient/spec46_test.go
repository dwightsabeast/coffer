package syncclient

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/syncsign"
)

// Spec change 46: the probe answer, the bridge's index-1 digest and the pool report go out; claimedTop, the check list
// and the probes come back.

func TestSpec46BodyFields(t *testing.T) {
	t.Run("[T03][P02] the answer, the probe digest and the pool report are sent; nothing extra when unset", func(t *testing.T) {
		zero := 0
		cases := []struct {
			body Body
			want []string
			not  []string
		}{
			{Body{V: 1, Seq: 1}, nil, []string{`"wallet"`, `"probeDigest"`, `"pool"`}},
			{Body{V: 1, Seq: 1, Wallet: &WalletAnswer{ReceivedTop: 5}, ProbeDigest: "qYtoTZjlFXXSf7Ul9MFxxg=="},
				[]string{`"wallet":{"match":null,"receivedTop":5}`, `"probeDigest":"qYtoTZjlFXXSf7Ul9MFxxg=="`}, nil},
			{Body{V: 1, Seq: 1, Wallet: &WalletAnswer{Match: &zero, ReceivedTop: 405}}, []string{`"wallet":{"match":0,"receivedTop":405}`}, nil},
			{Body{V: 1, Seq: 1, Checks: &Checks{Pool: &PoolReport{State: "mismatch", Bad: []uint32{3, 9}}}}, []string{`"checks":{"pool":{"state":"mismatch","bad":[3,9]}}`}, nil},
			{Body{V: 1, Seq: 1, Checks: &Checks{Pool: &PoolReport{State: "ok"}}}, []string{`"pool":{"state":"ok","bad":[]}`}, nil},
		}
		for _, c := range cases {
			srv, s := site(t, 200, okReply)
			k, _ := syncsign.NewKey()
			if _, err := client(srv).Send(context.Background(), k, c.body); err != nil {
				t.Fatal(err)
			}
			for _, w := range c.want {
				if !strings.Contains(string(s.body), w) {
					t.Errorf("body %s lacks %s", s.body, w)
				}
			}
			for _, n := range c.not {
				if strings.Contains(string(s.body), n) {
					t.Errorf("body %s has %s", s.body, n)
				}
			}
		}
	})
}

func reply46(data string) string {
	return `{"success":true,"data":{"ok":true,"poolFree":0,"poolTarget":50,"watch":[]` + data + `}}`
}

func TestSpec46ResponseFields(t *testing.T) {
	t.Run("[T03][P02] claimedTop, the check list and the probes are read; absent from an older plugin", func(t *testing.T) {
		srv, _ := site(t, 200, reply46(`,"claimedTop":356,"check":[{"index":357,"digest":"qYtoTZjlFXXSf7Ul9MFxxg=="}],"probes":[{"wallet":0,"index":1,"digest":"qYtoTZjlFXXSf7Ul9MFxxg=="}]`))
		k, _ := syncsign.NewKey()
		r, err := client(srv).Send(context.Background(), k, Body{V: 1, Seq: 1})
		if err != nil {
			t.Fatal(err)
		}
		if r.ClaimedTop != 356 || len(r.Check) != 1 || r.Check[0] != (CheckEntry{Index: 357, Digest: "qYtoTZjlFXXSf7Ul9MFxxg=="}) ||
			len(r.Probes) != 1 || r.Probes[0] != (Probe{Wallet: 0, Index: 1, Digest: "qYtoTZjlFXXSf7Ul9MFxxg=="}) {
			t.Fatalf("got %+v", r)
		}
		srv, _ = site(t, 200, okReply)
		r, err = client(srv).Send(context.Background(), k, Body{V: 1, Seq: 1})
		if err != nil || r.ClaimedTop != 0 || r.Check != nil || r.Probes != nil {
			t.Fatalf("an older plugin: %+v, %v", r, err)
		}
	})
	t.Run("[T03][P02] an empty probes list is kept apart from none: the site is waiting with nothing to match", func(t *testing.T) {
		srv, _ := site(t, 200, reply46(`,"probes":[]`))
		k, _ := syncsign.NewKey()
		r, err := client(srv).Send(context.Background(), k, Body{V: 1, Seq: 1})
		if err != nil || r.Probes == nil || len(r.Probes) != 0 {
			t.Fatalf("got %+v, %v", r.Probes, err)
		}
	})
	t.Run("[T03][P02][F08] a malformed check list or probe makes the response malformed; a probe must be index 1", func(t *testing.T) {
		d := `"qYtoTZjlFXXSf7Ul9MFxxg=="`
		many := func(n int, item string) string {
			parts := make([]string, n)
			for i := range parts {
				parts[i] = item
			}
			return "[" + strings.Join(parts, ",") + "]"
		}
		for name, data := range map[string]string{
			"probe at index 2":      `,"probes":[{"wallet":0,"index":2,"digest":` + d + `}]`,
			"probe at index 0":      `,"probes":[{"wallet":0,"index":0,"digest":` + d + `}]`,
			"probe wallet negative": `,"probes":[{"wallet":-1,"index":1,"digest":` + d + `}]`,
			"11 probes":             `,"probes":` + many(11, `{"wallet":0,"index":1,"digest":`+d+`}`),
			"digest short":          `,"check":[{"index":3,"digest":"qYtoTZjl"}]`,
			"digest not base64":     `,"check":[{"index":3,"digest":"qYtoTZjlFXXSf7Ul9MFxx-=="}]`,
			"check index 0":         `,"check":[{"index":0,"digest":` + d + `}]`,
			"check index 2^32":      `,"check":[{"index":4294967296,"digest":` + d + `}]`,
			"151 check entries":     `,"check":` + many(151, `{"index":3,"digest":`+d+`}`),
			"claimedTop negative":   `,"claimedTop":-1`,
			"claimedTop past 2^32":  `,"claimedTop":4294967296`,
		} {
			srv, _ := site(t, 200, reply46(data))
			k, _ := syncsign.NewKey()
			_, err := client(srv).Send(context.Background(), k, Body{V: 1, Seq: 1})
			var se *Error
			if !errors.As(err, &se) || se.Code != "BAD_RESPONSE" {
				t.Errorf("%s: got %v", name, err)
			}
		}
	})
}

func TestAddressDigestVector(t *testing.T) {
	t.Run("[T03] AddressDigest matches contract/test-vectors/address-digest.json", func(t *testing.T) {
		data, err := os.ReadFile("../../../contract/test-vectors/address-digest.json")
		if err != nil {
			t.Fatal(err)
		}
		var v struct{ Address, Digest string }
		if err := json.Unmarshal(data, &v); err != nil {
			t.Fatal(err)
		}
		if got := AddressDigest(v.Address); got != v.Digest || len(got) != 24 {
			t.Fatalf("AddressDigest = %q, want %q", got, v.Digest)
		}
	})
}

func TestSeqOutOfRangeHint(t *testing.T) {
	t.Run("[T04] SEQ_OUT_OF_RANGE says the clock moved back and that it fixes itself", func(t *testing.T) {
		srv, _ := site(t, 200, `{"success":true,"data":{"error":{"code":"SEQ_OUT_OF_RANGE"}}}`)
		k, _ := syncsign.NewKey()
		_, err := client(srv).Send(context.Background(), k, Body{V: 1, Seq: 1})
		var se *Error
		if !errors.As(err, &se) || se.Code != "SEQ_OUT_OF_RANGE" || !strings.Contains(se.Hint, "clock moved back more than 5 minutes") || !strings.Contains(se.Hint, "timedatectl") {
			t.Fatalf("got %v", err)
		}
	})
}
