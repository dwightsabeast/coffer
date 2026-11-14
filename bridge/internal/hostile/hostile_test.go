package hostile

import (
	"bytes"
	"crypto/tls"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func get(t *testing.T, c *http.Client, url string) (*http.Response, []byte, error) {
	t.Helper()
	resp, err := c.Get(url)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return resp, b, err
}

func TestScriptInOrderLastRepeats(t *testing.T) {
	s := New(t, Reply{Status: 503, Body: "one"}, Reply{Header: map[string]string{"Content-Type": "text/html"}, Body: "two"})
	for i, want := range []string{"503 one", "200 two", "200 two"} {
		resp, b, err := get(t, s.Client(), s.URL+"/p?q=1")
		if err != nil || resp.Status[:3]+" "+string(b) != want {
			t.Fatalf("request %d: %v %q %v, want %s", i, resp, b, err, want)
		}
	}
	if _, err := s.Client().Post(s.URL+"/sync", "application/json", strings.NewReader(`{"v":1}`)); err != nil {
		t.Fatal(err)
	}
	seen := s.Requests()
	if len(seen) != 4 || seen[0].Path != "/p" || seen[0].Query != "q=1" || seen[3].Method != "POST" || string(seen[3].Body) != `{"v":1}` || seen[3].Header.Get("Content-Type") != "application/json" {
		t.Fatalf("requests: %+v", seen)
	}
}

func TestStreamIsExact(t *testing.T) {
	s := New(t, Reply{Body: "{", Stream: 5<<20 + 3, Fill: "ab"})
	_, b, err := get(t, s.Client(), s.URL)
	if err != nil || len(b) != 1+5<<20+3 || b[0] != '{' || string(b[1:5]) != "abab" {
		t.Fatalf("got %d bytes, %v", len(b), err)
	}
}

func TestDrip(t *testing.T) {
	s := New(t, Reply{Body: "hello", Drip: 20 * time.Millisecond})
	start := time.Now()
	_, b, err := get(t, s.Client(), s.URL)
	if err != nil || string(b) != "hello" || time.Since(start) < 80*time.Millisecond {
		t.Fatalf("%q %v after %v", b, err, time.Since(start))
	}
}

func TestHangUntilTheClientGivesUp(t *testing.T) {
	s := New(t, Reply{Hang: true})
	c := s.Client()
	c.Timeout = 100 * time.Millisecond
	if _, _, err := get(t, c, s.URL); err == nil {
		t.Fatal("a hanging server answered")
	}
	// The cleanup must not wait for the handler either: a second request is left hanging when the test ends.
	go c.Get(s.URL)
}

func TestCutMidBody(t *testing.T) {
	s := New(t, Reply{Body: `{"partial`, Cut: true})
	if _, b, err := get(t, s.Client(), s.URL); !errors.Is(err, io.ErrUnexpectedEOF) || string(b) != `{"partial` {
		t.Fatalf("%q %v", b, err)
	}
}

func TestRedirect(t *testing.T) {
	s := New(t, Reply{Redirect: "https://elsewhere.invalid/x"})
	c := s.Client()
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, _, err := get(t, c, s.URL)
	if err != nil || resp.StatusCode != http.StatusFound || resp.Header.Get("Location") != "https://elsewhere.invalid/x" {
		t.Fatalf("%v %v", resp, err)
	}
}

func TestTLSIsTrustedOnlyByItsOwnClient(t *testing.T) {
	s := NewTLS(t, Reply{Body: "ok"})
	if _, b, err := get(t, s.Client(), s.URL); err != nil || string(b) != "ok" {
		t.Fatalf("own client: %q %v", b, err)
	}
	// A client like production's: no injected roots, so the system's.
	_, _, err := get(t, &http.Client{Timeout: 5 * time.Second}, s.URL)
	var unknown *tls.CertificateVerificationError
	if !errors.As(err, &unknown) {
		t.Fatalf("a default client accepted httptest's certificate: %v", err)
	}
}

func TestRPC(t *testing.T) {
	s := Routed(t, false, RPC(map[string]Reply{"get_info": Result(`{"height":18446744073709551616}`)}))
	post := func(body string) (int, string) {
		resp, err := s.Client().Post(s.URL+"/json_rpc", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(b)
	}
	if st, b := post(`{"jsonrpc":"2.0","id":"0","method":"get_info"}`); st != 200 || b != `{"jsonrpc":"2.0","id":"0","result":{"height":18446744073709551616}}` {
		t.Fatalf("get_info: %d %s", st, b)
	}
	if _, b := post(`{"method":"get_block"}`); !strings.Contains(b, `"code":-32601`) {
		t.Fatalf("unknown method: %s", b)
	}
	if st, _ := post(`nope`); st != 400 {
		t.Fatalf("not JSON-RPC: %d", st)
	}
}

func TestProxyRewrites(t *testing.T) {
	up := New(t, Reply{Header: map[string]string{"Content-Type": "application/json"}, Body: `{"height":100}`})
	pass := NewProxy(t, up.URL, nil)
	liar := NewProxy(t, up.URL, func(_ Request, status int, body []byte) (int, []byte) {
		return status, bytes.Replace(body, []byte("100"), []byte("999"), 1)
	})
	if _, b, err := get(t, pass.Client(), pass.URL+"/json_rpc"); err != nil || string(b) != `{"height":100}` {
		t.Fatalf("pass-through: %q %v", b, err)
	}
	resp, b, err := get(t, liar.Client(), liar.URL+"/json_rpc?x=1")
	if err != nil || string(b) != `{"height":999}` || resp.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("rewrite: %q %v", b, err)
	}
	if r := up.Requests(); len(r) != 2 || r[1].Path != "/json_rpc" || r[1].Query != "x=1" {
		t.Fatalf("upstream saw %+v", r)
	}
}
