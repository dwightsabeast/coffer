package adminrefresh

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/dwightsabeast/coffer/bridge/internal/selfupdate"
)

// RFC 8032 section 7.1, test keys 1 and 2 (published; the only private keys tests may hold).
var (
	key1 = ed25519.NewKeyFromSeed(mustHex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"))
	key2 = ed25519.NewKeyFromSeed(mustHex("4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb"))
)

func mustHex(s string) []byte {
	b, err := hex.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return b
}

func pub(k ed25519.PrivateKey) ed25519.PublicKey { return k.Public().(ed25519.PublicKey) }

func sum(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

func signWith(k ed25519.PrivateKey, m []byte) []byte {
	return []byte(base64.StdEncoding.EncodeToString(ed25519.Sign(k, append([]byte(selfupdate.SignaturePrefix), m...))) + "\n")
}

// manifest is a release.json for version v whose amd64 entry describes bin (and an arm64 entry for other bytes).
func manifest(v string, bin []byte, size int) []byte {
	return []byte(fmt.Sprintf(`{"product":"xmr-bridge","version":%q,"date":"2026-11-23T00:00:00Z","files":[`+
		`{"name":"xmr-bridge-%s-linux-amd64","os":"linux","arch":"amd64","sha256":%q,"size":%d},`+
		`{"name":"xmr-bridge-%s-linux-arm64","os":"linux","arch":"arm64","sha256":%q,"size":%d}]}`+"\n",
		v, v, sum(bin), size, v, sum(armBin(v)), len(armBin(v))))
}

func binFor(v string) []byte {
	return []byte("\x7fELF amd64 xmr-bridge " + v + strings.Repeat(".", 300))
}
func armBin(v string) []byte {
	return []byte("\x7fELF arm64 xmr-bridge " + v + strings.Repeat(",", 300))
}

// host is a fake machine: the service's data folder (which the service user owns) and root's admin copy and /etc.
type host struct {
	t    *testing.T
	root string
	p    Paths
}

func newHost(t *testing.T, own string) *host {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	h := &host{t: t, root: root, p: Paths{
		DataDir: filepath.Join(root, "var/lib/xmr-bridge"),
		Admin:   filepath.Join(root, "usr/local/bin/xmr-bridge"),
		EtcDir:  filepath.Join(root, "etc/xmr-bridge"),
	}}
	for _, d := range []string{filepath.Join(h.p.DataDir, "bin"), filepath.Join(h.p.DataDir, "run"), filepath.Dir(h.p.Admin), h.p.EtcDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	h.write(h.p.Admin, binFor(own), 0o755)
	h.write(h.p.AdminHash(), []byte(sum(binFor(own))+"\n"), 0o644)
	return h
}

func (h *host) write(path string, b []byte, mode os.FileMode) {
	h.t.Helper()
	if err := os.WriteFile(path, b, mode); err != nil {
		h.t.Fatal(err)
	}
}

func (h *host) data(rel string) string { return filepath.Join(h.p.DataDir, rel) }

// service puts down what a self-update to v leaves: the binary and the release it verified.
func (h *host) service(v string, m, sig, bin []byte) {
	h.write(h.data("bin/xmr-bridge"), bin, 0o755)
	h.write(h.data("bin/release.json"), m, 0o600)
	if sig != nil {
		h.write(h.data("bin/release.json.sig"), sig, 0o600)
	}
}

func (h *host) refresher(own string) *Refresher {
	return &Refresher{Paths: h.p, Keys: []ed25519.PublicKey{pub(key1)}, Own: own, Arch: "amd64"}
}

// snapshot is root's three files, to show a refusal changed nothing.
func (h *host) snapshot() string {
	var b strings.Builder
	for _, f := range []string{h.p.Admin, h.p.AdminHash(), h.p.AdminRelease(), h.p.AdminReleaseSig()} {
		raw, err := os.ReadFile(f)
		fmt.Fprintf(&b, "%s %v %x\n", f, errors.Is(err, os.ErrNotExist), raw)
	}
	return b.String()
}

func (h *host) refused(r *Refresher, want string) {
	h.t.Helper()
	before := h.snapshot()
	out, err := r.Run()
	if err == nil {
		h.t.Fatalf("not refused (outcome %v)", out)
	}
	if !strings.Contains(err.Error(), want) {
		h.t.Fatalf("refused for the wrong reason: %v (want %q)", err, want)
	}
	if after := h.snapshot(); after != before {
		h.t.Fatalf("a refusal changed root's files:\nbefore %s\nafter  %s", before, after)
	}
}

func TestRefreshNewer(t *testing.T) {
	h := newHost(t, "1.0.0")
	bin := binFor("1.0.1")
	m := manifest("1.0.1", bin, len(bin))
	h.service("1.0.1", m, signWith(key1, m), bin)
	out, err := h.refresher("1.0.0").Run()
	if err != nil || out.Outcome != Refreshed || out.Version != "1.0.1" {
		t.Fatalf("%+v %v", out, err)
	}
	got, _ := os.ReadFile(h.p.Admin)
	hash, _ := os.ReadFile(h.p.AdminHash())
	rel, _ := os.ReadFile(h.p.AdminRelease())
	if !bytes.Equal(got, bin) || strings.TrimSpace(string(hash)) != sum(bin) || !bytes.Equal(rel, m) {
		t.Fatal("the admin copy, its hash or the kept release isn't the verified one")
	}
	if fi, _ := os.Stat(h.p.Admin); fi.Mode().Perm() != 0o755 {
		t.Fatalf("admin copy mode %v", fi.Mode())
	}
	if !Recognized(h.p, []ed25519.PublicKey{pub(key1)}, "amd64") {
		t.Fatal("the refreshed copy isn't recognized as the installer's")
	}
	// Run again as the new copy: nothing to do.
	if out, err := h.refresher("1.0.1").Run(); err != nil || out.Outcome != NothingToDo {
		t.Fatalf("second run %+v %v", out, err)
	}
}

func TestRefreshNothingYet(t *testing.T) {
	h := newHost(t, "1.0.0")
	before := h.snapshot()
	out, err := h.refresher("1.0.0").Run()
	if err != nil || out.Outcome != NothingToDo || h.snapshot() != before {
		t.Fatalf("a fresh install (no verified release kept yet): %+v %v", out, err)
	}
}

func TestTamperedBinary(t *testing.T) {
	t.Run("[T33] tampered binary", func(t *testing.T) {
		bin := binFor("1.0.1")
		for name, c := range map[string]struct {
			m    []byte
			disk []byte
			want string
		}{
			"one changed byte":   {manifest("1.0.1", bin, len(bin)), append(append([]byte{}, bin[:20]...), append([]byte{'X'}, bin[21:]...)...), "doesn't match"},
			"wrong size, signed": {manifest("1.0.1", bin, len(bin)+1), bin, "doesn't match"},
			"a byte appended":    {manifest("1.0.1", bin, len(bin)), append(append([]byte{}, bin...), 0), "doesn't match"},
			"the arm64 file":     {manifest("1.0.1", bin, len(bin)), armBin("1.0.1"), "doesn't match"},
		} {
			t.Run(name, func(t *testing.T) {
				h := newHost(t, "1.0.0")
				h.service("1.0.1", c.m, signWith(key1, c.m), c.disk)
				h.refused(h.refresher("1.0.0"), c.want)
			})
		}
		t.Run("no file for this CPU", func(t *testing.T) {
			h := newHost(t, "1.0.0")
			m := manifest("1.0.1", bin, len(bin))
			h.service("1.0.1", m, signWith(key1, m), bin)
			r := h.refresher("1.0.0")
			r.Arch = "riscv64"
			h.refused(r, "no file for linux/riscv64")
		})
	})
}

func TestBadSignature(t *testing.T) {
	t.Run("[T34] bad signature", func(t *testing.T) {
		bin := binFor("1.0.1")
		m := manifest("1.0.1", bin, len(bin))
		good := signWith(key1, m)
		for name, c := range map[string]struct{ m, sig []byte }{
			"release.json changed after signing":    {bytes.Replace(m, []byte(`"1.0.1"`), []byte(`"1.0.2"`), 1), good},
			"signed by a key this copy doesn't pin": {m, signWith(key2, m)},
			"a cut signature":                       {m, good[:40]},
			"not base64":                            {m, []byte("not a signature!\n")},
			"empty":                                 {m, []byte{}},
		} {
			t.Run(name, func(t *testing.T) {
				h := newHost(t, "1.0.0")
				h.service("1.0.1", c.m, c.sig, bin)
				h.refused(h.refresher("1.0.0"), "signature")
			})
		}
		t.Run("no release.json.sig", func(t *testing.T) {
			h := newHost(t, "1.0.0")
			h.service("1.0.1", m, nil, bin)
			h.refused(h.refresher("1.0.0"), "release.json.sig")
		})
		t.Run("the keys come from the copy, not a file: key 2's signature with key 2's public key on disk", func(t *testing.T) {
			h := newHost(t, "1.0.0")
			h.service("1.0.1", m, signWith(key2, m), bin)
			h.write(h.data("bin/coffer-release.pub"), []byte(base64.StdEncoding.EncodeToString(pub(key2))), 0o600)
			h.refused(h.refresher("1.0.0"), "signature")
		})
	})
}

func TestOlderVersion(t *testing.T) {
	t.Run("[T35] older version", func(t *testing.T) {
		old := binFor("1.0.0")
		m := manifest("1.0.0", old, len(old))
		t.Run("a signed older release is refused", func(t *testing.T) {
			h := newHost(t, "1.0.1")
			h.service("1.0.0", m, signWith(key1, m), old)
			h.refused(h.refresher("1.0.1"), "older")
		})
		t.Run("an equal version does nothing", func(t *testing.T) {
			h := newHost(t, "1.0.0")
			h.service("1.0.0", m, signWith(key1, m), old)
			before := h.snapshot()
			out, err := h.refresher("1.0.0").Run()
			if err != nil || out.Outcome != NothingToDo || h.snapshot() != before {
				t.Fatalf("%+v %v", out, err)
			}
		})
		bin := binFor("1.0.1")
		nm := manifest("1.0.1", bin, len(bin))
		for name, setup := range map[string]func(h *host){
			"a pending update": func(h *host) {
				h.write(h.data("run/update-pending"), []byte("kind=bridge\nversion=1.0.1\nprevious=1.0.0\nat=1795000000\n"), 0o600)
			},
			"a refused version": func(h *host) { h.write(h.data("run/refused"), []byte("bridge=1.0.1\n"), 0o600) },
		} {
			t.Run(name+" stops the refresh", func(t *testing.T) {
				h := newHost(t, "1.0.0")
				h.service("1.0.1", nm, signWith(key1, nm), bin)
				setup(h)
				before := h.snapshot()
				out, err := h.refresher("1.0.0").Run()
				if err != nil || out.Outcome != NothingToDo || h.snapshot() != before {
					t.Fatalf("%+v %v", out, err)
				}
			})
		}
		t.Run("the service's files can't start a refresh: a refused list naming an older version changes nothing", func(t *testing.T) {
			h := newHost(t, "1.0.1")
			h.service("1.0.0", m, signWith(key1, m), old)
			h.write(h.data("run/refused"), []byte("bridge=0.9.0\n"), 0o600)
			h.refused(h.refresher("1.0.1"), "older")
		})
	})
}

func TestSwappedAfterVerification(t *testing.T) {
	bin := binFor("1.0.1")
	m := manifest("1.0.1", bin, len(bin))
	keys := []ed25519.PublicKey{pub(key1)}

	t.Run("[T36] swapped after verification", func(t *testing.T) {
		h := newHost(t, "1.0.0")
		h.service("1.0.1", m, signWith(key1, m), bin)
		r := h.refresher("1.0.0")
		evil := []byte("\x7fELF evil")
		r.afterVerify = func() {
			h.write(h.data("bin/xmr-bridge"), evil, 0o755)
			h.write(h.data("bin/release.json"), []byte(`{"evil":true}`), 0o600)
		}
		if out, err := r.Run(); err != nil || out.Outcome != Refreshed {
			t.Fatalf("%+v %v", out, err)
		}
		got, _ := os.ReadFile(h.p.Admin)
		rel, _ := os.ReadFile(h.p.AdminRelease())
		if !bytes.Equal(got, bin) || sum(got) != sum(bin) || !bytes.Equal(rel, m) {
			t.Fatal("root installed bytes it didn't verify")
		}
	})

	t.Run("[T36] parent folder is a symlink", func(t *testing.T) {
		for name, setup := range map[string]func(h *host) *Refresher{
			// bin/ itself: a folder holding a valid signed newer release, so only the path check can refuse it.
			"bin/ is a symlink": func(h *host) *Refresher {
				elsewhere := filepath.Join(h.root, "elsewhere")
				os.MkdirAll(elsewhere, 0o755)
				h.write(filepath.Join(elsewhere, "xmr-bridge"), bin, 0o755)
				h.write(filepath.Join(elsewhere, "release.json"), m, 0o600)
				h.write(filepath.Join(elsewhere, "release.json.sig"), signWith(key1, m), 0o600)
				os.RemoveAll(h.data("bin"))
				if err := os.Symlink(elsewhere, h.data("bin")); err != nil {
					t.Fatal(err)
				}
				return h.refresher("1.0.0")
			},
			"the data folder is reached through a symlink": func(h *host) *Refresher {
				h.service("1.0.1", m, signWith(key1, m), bin)
				link := filepath.Join(h.root, "var/lib/xmr-bridge-link")
				os.Symlink(h.p.DataDir, link)
				r := h.refresher("1.0.0")
				r.Paths.DataDir = link
				return r
			},
			"bin/xmr-bridge is a symlink": func(h *host) *Refresher {
				h.service("1.0.1", m, signWith(key1, m), bin)
				h.write(filepath.Join(h.root, "real-bin"), bin, 0o755)
				os.Remove(h.data("bin/xmr-bridge"))
				os.Symlink(filepath.Join(h.root, "real-bin"), h.data("bin/xmr-bridge"))
				return h.refresher("1.0.0")
			},
			"bin/release.json is a symlink": func(h *host) *Refresher {
				h.service("1.0.1", m, signWith(key1, m), bin)
				h.write(filepath.Join(h.root, "real-release.json"), m, 0o600)
				os.Remove(h.data("bin/release.json"))
				os.Symlink(filepath.Join(h.root, "real-release.json"), h.data("bin/release.json"))
				return h.refresher("1.0.0")
			},
			"bin/release.json.sig is a symlink": func(h *host) *Refresher {
				h.service("1.0.1", m, signWith(key1, m), bin)
				h.write(filepath.Join(h.root, "real.sig"), signWith(key1, m), 0o600)
				os.Remove(h.data("bin/release.json.sig"))
				os.Symlink(filepath.Join(h.root, "real.sig"), h.data("bin/release.json.sig"))
				return h.refresher("1.0.0")
			},
			"bin/ is on another filesystem": func(h *host) *Refresher {
				h.service("1.0.1", m, signWith(key1, m), bin)
				r := h.refresher("1.0.0")
				r.devOf = func(st *syscall.Stat_t, path string) uint64 {
					if strings.HasSuffix(path, "/bin") {
						return uint64(st.Dev) + 1
					}
					return uint64(st.Dev)
				}
				return r
			},
		} {
			t.Run(name, func(t *testing.T) {
				h := newHost(t, "1.0.0")
				r := setup(h)
				h.refused(r, "refused")
			})
		}
	})

	t.Run("[T36] FIFO", func(t *testing.T) {
		for _, rel := range []string{"bin/xmr-bridge", "bin/release.json", "bin/release.json.sig", "run/update-pending"} {
			t.Run(rel, func(t *testing.T) {
				h := newHost(t, "1.0.0")
				h.service("1.0.1", m, signWith(key1, m), bin)
				os.Remove(h.data(rel))
				if err := syscall.Mkfifo(h.data(rel), 0o600); err != nil {
					t.Fatal(err)
				}
				done := make(chan struct{})
				go func() { defer close(done); h.refused(h.refresher("1.0.0"), "refused") }()
				select {
				case <-done:
				case <-time.After(5 * time.Second):
					t.Fatal("the refresh blocked on a FIFO")
				}
			})
		}
		t.Run("a folder or a socket at the binary's path", func(t *testing.T) {
			for name, put := range map[string]func(t *testing.T, path string){
				"folder": func(t *testing.T, p string) {
					if err := os.Mkdir(p, 0o700); err != nil {
						t.Fatal(err)
					}
				},
				// A socket path is capped at 108 bytes, so it's made from inside its folder.
				"socket": func(t *testing.T, p string) {
					t.Chdir(filepath.Dir(p))
					l, err := net.Listen("unix", filepath.Base(p))
					if err != nil {
						t.Fatal(err)
					}
					t.Cleanup(func() { l.Close() })
				},
			} {
				t.Run(name, func(t *testing.T) {
					h := newHost(t, "1.0.0")
					h.service("1.0.1", m, signWith(key1, m), bin)
					os.Remove(h.data("bin/xmr-bridge"))
					put(t, h.data("bin/xmr-bridge"))
					h.refused(h.refresher("1.0.0"), "refused")
				})
			}
		})
	})

	t.Run("[T36] crash between swap steps", func(t *testing.T) {
		t.Run("after the kept release, before the binary: still the old copy, still recognized; the next run refreshes", func(t *testing.T) {
			h := newHost(t, "1.0.0")
			h.service("1.0.1", m, signWith(key1, m), bin)
			r := h.refresher("1.0.0")
			r.afterStep = func(step int) error {
				if step == 1 {
					return errors.New("power cut")
				}
				return nil
			}
			if _, err := r.Run(); err == nil {
				t.Fatal("the simulated crash didn't stop the run")
			}
			got, _ := os.ReadFile(h.p.Admin)
			if !bytes.Equal(got, binFor("1.0.0")) || !Recognized(h.p, keys, "amd64") {
				t.Fatal("after step 1 the old copy should be in place and recognized")
			}
			if out, err := h.refresher("1.0.0").Run(); err != nil || out.Outcome != Refreshed {
				t.Fatalf("the next run: %+v %v", out, err)
			}
		})
		t.Run("after the binary, before the hash file: the new copy is recognized by its signed release; the next run repairs the hash", func(t *testing.T) {
			h := newHost(t, "1.0.0")
			h.service("1.0.1", m, signWith(key1, m), bin)
			r := h.refresher("1.0.0")
			r.afterStep = func(step int) error {
				if step == 2 {
					return errors.New("power cut")
				}
				return nil
			}
			if _, err := r.Run(); err == nil {
				t.Fatal("the simulated crash didn't stop the run")
			}
			got, _ := os.ReadFile(h.p.Admin)
			hash, _ := os.ReadFile(h.p.AdminHash())
			if !bytes.Equal(got, bin) || strings.TrimSpace(string(hash)) != sum(binFor("1.0.0")) {
				t.Fatal("the crash after step 2 didn't leave the new binary with the old hash")
			}
			if !Recognized(h.p, keys, "amd64") {
				t.Fatal("uninstall wouldn't recognize the new copy")
			}
			// The new copy runs next time.
			out, err := h.refresher("1.0.1").Run()
			hash, _ = os.ReadFile(h.p.AdminHash())
			if err != nil || out.Outcome != Repaired || strings.TrimSpace(string(hash)) != sum(bin) {
				t.Fatalf("the next run didn't repair the hash: %+v %v", out, err)
			}
		})
	})
}

func TestRecognized(t *testing.T) {
	keys := []ed25519.PublicKey{pub(key1)}
	bin := binFor("1.0.1")
	m := manifest("1.0.1", bin, len(bin))
	t.Run("a file matching neither the hash nor a signed release isn't the installer's", func(t *testing.T) {
		h := newHost(t, "1.0.0")
		h.write(h.p.Admin, []byte("someone else's program"), 0o755)
		if Recognized(h.p, keys, "amd64") {
			t.Fatal("recognized a foreign file")
		}
	})
	t.Run("a kept release with a bad signature isn't used", func(t *testing.T) {
		h := newHost(t, "1.0.0")
		h.write(h.p.Admin, bin, 0o755)
		h.write(h.p.AdminRelease(), m, 0o644)
		h.write(h.p.AdminReleaseSig(), signWith(key2, m), 0o644)
		if Recognized(h.p, keys, "amd64") {
			t.Fatal("recognized through a release signed by a key the copy doesn't pin")
		}
	})
}
