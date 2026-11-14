// Package hostile plays a hostile peer for the bridge's tests (phase 07b): a site, node, wallet-rpc or release host
// that answers with whatever a test scripts, including replies no honest peer sends. Only test files import it, so it
// is never compiled into the bridge (the same arrangement as internal/testaddr).
//
// A Server answers each request with the next scripted Reply (the last one repeats), or with a Router's choice. A Reply
// can stream a body of any size without buffering it, drip it one byte at a time, redirect, hang until the client gives
// up, or cut the connection mid-body. NewTLS serves https with httptest's own certificate: Server.Client() trusts it,
// and a client built the way production builds one (system roots) doesn't. NewProxy sits in front of a real or fake
// upstream and rewrites its replies, for a node that lies about one detail.
//
// Each attacked package has a small hostile_test.go beside it that wires these to its client (syncclient, crosscheck,
// noderpc, walletrpc, selfupdate). monerodl's own test server is already https: set the Fetcher's HTTP to nil there
// for the production transport.
package hostile

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// Reply is what a Server sends for one request. The zero Reply is a 200 with an empty body.
type Reply struct {
	Status int               // 0 means 200
	Header map[string]string // set before the status is written
	Body   string            // sent first, as is

	Stream int64  // after Body, this many bytes of Fill (default "x"), written in chunks and never held in memory
	Fill   string // the pattern Stream repeats

	Drip time.Duration // when set, Body and Stream go out one byte at a time, this far apart, each one flushed

	Redirect string // when set, a 302 to this URL and nothing else
	Hang     bool   // never answer; returns when the client gives up or the server closes
	Cut      bool   // send the headers with a Content-Length larger than what follows, write Body, then close
}

// Request is what a Server saw.
type Request struct {
	Method string
	Path   string
	Query  string
	Header http.Header
	Body   []byte
}

// Router picks the Reply for a request.
type Router func(Request) Reply

// Server is an httptest server with a script.
type Server struct {
	*httptest.Server

	mu      sync.Mutex
	replies []Reply
	router  Router
	seen    []Request
	done    chan struct{}
}

// New starts a plain-http Server that answers with replies in order, the last one repeating.
func New(t testing.TB, replies ...Reply) *Server {
	return start(t, false, nil, replies)
}

// NewTLS is New over https with httptest's certificate, which only Server.Client() trusts.
func NewTLS(t testing.TB, replies ...Reply) *Server {
	return start(t, true, nil, replies)
}

// Routed starts a Server that asks route for each reply; tls picks https.
func Routed(t testing.TB, tls bool, route Router) *Server {
	return start(t, tls, route, nil)
}

func start(t testing.TB, tls bool, route Router, replies []Reply) *Server {
	t.Helper()
	s := &Server{replies: replies, router: route, done: make(chan struct{})}
	h := http.HandlerFunc(s.serve)
	if tls {
		s.Server = httptest.NewTLSServer(h)
	} else {
		s.Server = httptest.NewServer(h)
	}
	t.Cleanup(func() {
		close(s.done) // releases hanging and dripping handlers first, or Close would wait for them
		s.Server.CloseClientConnections()
		s.Server.Close()
	})
	return s
}

// Script replaces the remaining replies.
func (s *Server) Script(replies ...Reply) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.replies = replies
}

// Requests returns a copy of every request seen so far.
func (s *Server) Requests() []Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Request(nil), s.seen...)
}

func (s *Server) next(req Request) Reply {
	s.mu.Lock()
	s.seen = append(s.seen, req)
	route := s.router
	if route != nil {
		s.mu.Unlock()
		return route(req) // unlocked: a proxy's upstream call mustn't hold up other requests
	}
	defer s.mu.Unlock()
	if len(s.replies) == 0 {
		return Reply{}
	}
	r := s.replies[0]
	if len(s.replies) > 1 {
		s.replies = s.replies[1:]
	}
	return r
}

func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 64<<20))
	rep := s.next(Request{Method: r.Method, Path: r.URL.Path, Query: r.URL.RawQuery, Header: r.Header.Clone(), Body: body})
	gone := func() bool {
		select {
		case <-r.Context().Done():
			return true
		case <-s.done:
			return true
		default:
			return false
		}
	}
	switch {
	case rep.Hang:
		select {
		case <-r.Context().Done():
		case <-s.done:
		}
		return
	case rep.Redirect != "":
		http.Redirect(w, r, rep.Redirect, http.StatusFound)
		return
	case rep.Cut:
		cut(w, rep)
		return
	}
	for k, v := range rep.Header {
		w.Header().Set(k, v)
	}
	status := rep.Status
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	flusher, _ := w.(http.Flusher)
	write := func(p []byte) bool {
		if rep.Drip <= 0 {
			_, err := w.Write(p)
			return err == nil
		}
		for i := range p {
			if _, err := w.Write(p[i : i+1]); err != nil {
				return false
			}
			if flusher != nil {
				flusher.Flush()
			}
			select {
			case <-time.After(rep.Drip):
			case <-r.Context().Done():
				return false
			case <-s.done:
				return false
			}
		}
		return true
	}
	if !write([]byte(rep.Body)) {
		return
	}
	if rep.Stream > 0 {
		fill := rep.Fill
		if fill == "" {
			fill = "x"
		}
		chunk := []byte(strings.Repeat(fill, 32<<10/len(fill)+1))[:32<<10]
		for left := rep.Stream; left > 0 && !gone(); {
			n := min(left, int64(len(chunk)))
			if !write(chunk[:n]) {
				return
			}
			left -= n
		}
	}
}

// cut takes over the connection, promises more body than it sends, and closes.
func cut(w http.ResponseWriter, rep Reply) {
	hj, ok := w.(http.Hijacker)
	if !ok {
		panic("hostile: Cut needs an HTTP/1 connection")
	}
	conn, buf, err := hj.Hijack()
	if err != nil {
		return
	}
	defer conn.Close()
	status := rep.Status
	if status == 0 {
		status = http.StatusOK
	}
	fmt.Fprintf(buf, "HTTP/1.1 %d %s\r\nContent-Length: %d\r\n", status, http.StatusText(status), len(rep.Body)+1000)
	for k, v := range rep.Header {
		fmt.Fprintf(buf, "%s: %s\r\n", k, v)
	}
	buf.WriteString("\r\n" + rep.Body)
	buf.Flush()
}

// RPC routes JSON-RPC 2.0 requests by method name. A method missing from methods gets error -32601, as Monero's daemon
// and wallet-rpc answer; a body that isn't JSON-RPC gets a 400.
func RPC(methods map[string]Reply) Router {
	return func(req Request) Reply {
		var call struct{ Method string }
		if json.Unmarshal(req.Body, &call) != nil || call.Method == "" {
			return Reply{Status: http.StatusBadRequest, Body: "not JSON-RPC"}
		}
		if rep, ok := methods[call.Method]; ok {
			return rep
		}
		return RPCError(-32601, "Method not found")
	}
}

// Result is a JSON-RPC 2.0 success whose "result" is raw, sent exactly as given (huge numbers, missing fields).
func Result(raw string) Reply {
	return Reply{Header: map[string]string{"Content-Type": "application/json"}, Body: `{"jsonrpc":"2.0","id":"0","result":` + raw + `}`}
}

// RPCError is a JSON-RPC 2.0 error reply.
func RPCError(code int, message string) Reply {
	msg, _ := json.Marshal(message)
	return Reply{Header: map[string]string{"Content-Type": "application/json"}, Body: fmt.Sprintf(`{"jsonrpc":"2.0","id":"0","error":{"code":%d,"message":%s}}`, code, msg)}
}

// Rewrite changes one upstream reply: it gets the request and the upstream's status and body, and returns what to send.
type Rewrite func(req Request, status int, body []byte) (int, []byte)

// NewProxy starts a plain-http Server that forwards each request (method, path, query and body; the Content-Type
// header) to upstream and passes the reply through rewrite. A nil rewrite passes everything through unchanged.
func NewProxy(t testing.TB, upstream string, rewrite Rewrite) *Server {
	t.Helper()
	client := &http.Client{Timeout: 30 * time.Second}
	return Routed(t, false, func(req Request) Reply {
		out, err := http.NewRequest(req.Method, strings.TrimSuffix(upstream, "/")+req.Path+query(req.Query), bytes.NewReader(req.Body))
		if err != nil {
			return Reply{Status: http.StatusBadGateway, Body: err.Error()}
		}
		if ct := req.Header.Get("Content-Type"); ct != "" {
			out.Header.Set("Content-Type", ct)
		}
		resp, err := client.Do(out)
		if err != nil {
			return Reply{Status: http.StatusBadGateway, Body: err.Error()}
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
		status := resp.StatusCode
		if rewrite != nil {
			status, body = rewrite(req, status, body)
		}
		return Reply{Status: status, Header: map[string]string{"Content-Type": resp.Header.Get("Content-Type")}, Body: string(body)}
	})
}

func query(q string) string {
	if q == "" {
		return ""
	}
	return "?" + q
}
