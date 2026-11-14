package installer

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestPrompter(t *testing.T) {
	var out strings.Builder
	var echo []bool
	p := newPrompter(strings.NewReader("  5abc  \r\nsecret-value\n"), &out, func(on bool) error { echo = append(echo, on); return nil })
	a, err := p.Ask("Address: ")
	if err != nil || a != "5abc" {
		t.Fatalf("%q %v", a, err)
	}
	s, err := p.AskSecret("Key: ")
	if err != nil || s.Reveal() != "secret-value" {
		t.Fatalf("%v", err)
	}
	if len(echo) != 2 || echo[0] || !echo[1] {
		t.Fatalf("echo must be turned off then back on: %v", echo)
	}
	if strings.Contains(out.String(), "secret-value") || !strings.Contains(out.String(), "Address: ") || !strings.Contains(out.String(), "Key: ") {
		t.Fatalf("output %q", out.String())
	}
	if _, err := p.Ask("More: "); err == nil {
		t.Fatal("no input left, but no error")
	}
}

func TestPrompterRestoresEchoOnError(t *testing.T) {
	var echo []bool
	p := newPrompter(strings.NewReader(""), &strings.Builder{}, func(on bool) error { echo = append(echo, on); return nil })
	if _, err := p.AskSecret("Key: "); err == nil {
		t.Fatal("no error at end of input")
	}
	if len(echo) != 2 || !echo[1] {
		t.Fatalf("echo not restored: %v", echo)
	}
	p = newPrompter(strings.NewReader("x\n"), &strings.Builder{}, func(on bool) error {
		if !on {
			return errors.New("not a terminal")
		}
		return nil
	})
	if _, err := p.AskSecret("Key: "); err == nil || !strings.Contains(err.Error(), "terminal") {
		t.Fatalf("a key must not be read when echo can't be turned off: %v", err)
	}
}

func TestPrompterLineCap(t *testing.T) {
	p := newPrompter(strings.NewReader(strings.Repeat("a", 5000)+"\n"), &strings.Builder{}, func(bool) error { return nil })
	if _, err := p.Ask("x: "); err == nil {
		t.Fatal("a 5000-character line was accepted")
	}
}

func TestChownWalksWithoutFollowingLinks(t *testing.T) {
	dir := t.TempDir()
	outside := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "a/b"), 0o700)
	os.WriteFile(filepath.Join(dir, "a/b/f"), []byte("x"), 0o600)
	os.Symlink(outside, filepath.Join(dir, "a/link"))
	// Chown to ourselves (tests aren't root): it must walk the tree and not fail on the symlink.
	if err := (realSystem{}).Chown(dir, os.Getuid(), os.Getgid()); err != nil {
		t.Fatal(err)
	}
}

// RT-22: the real prompter, with the terminal played by a pipe nobody writes to (a person who pressed Ctrl-C and
// nothing else). The prompt returns, echo is back on, and nothing more is asked.
func TestRedteamPrompterCtrlC(t *testing.T) {
	for _, hidden := range []bool{true, false} {
		name := "[T15] [RT-22] Ctrl-C at a visible prompt ends it"
		if hidden {
			name = "[T15] [RT-22] Ctrl-C at the hidden prompt ends it and turns echo back on"
		}
		t.Run(name, func(t *testing.T) {
			r, w := io.Pipe()
			defer w.Close()
			var mu sync.Mutex
			var echo []bool
			var out strings.Builder
			p := newPrompter(r, &out, func(on bool) error { mu.Lock(); echo = append(echo, on); mu.Unlock(); return nil })
			ctx, cancel := context.WithCancel(context.Background())
			p.done = ctx.Done()
			got := make(chan error, 1)
			go func() {
				var err error
				if hidden {
					_, err = p.AskSecret("Key: ")
				} else {
					_, err = p.Ask("Address: ")
				}
				got <- err
			}()
			select {
			case err := <-got:
				t.Fatalf("returned before Ctrl-C: %v", err)
			case <-time.After(50 * time.Millisecond):
			}
			cancel()
			select {
			case err := <-got:
				if !errors.Is(err, ErrCancelled) {
					t.Fatalf("after Ctrl-C: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("the prompt went on waiting after Ctrl-C")
			}
			mu.Lock()
			defer mu.Unlock()
			if hidden && (len(echo) != 2 || echo[0] || !echo[1]) {
				t.Fatalf("echo must be turned off then back on: %v", echo)
			}
			if !strings.HasSuffix(out.String(), "\n") {
				t.Fatalf("the next line would start on the prompt's line: %q", out.String())
			}
			if _, err := p.Ask("More: "); !errors.Is(err, ErrCancelled) {
				t.Fatalf("a prompt after Ctrl-C: %v", err)
			}
		})
	}
}
