// Package adminrefresh keeps the root-owned admin copy of xmr-bridge (/usr/local/bin/xmr-bridge) at the version the
// service has verified and committed (spec change 60). It runs as root from a root-owned systemd timer, so it never
// trusts a file the service user can write: every byte it acts on is read once into memory, then checked against a
// release.json signed with this copy's own compiled-in release keys. Files the service writes (pending, refused) can
// only stop a refresh, never start one.
package adminrefresh

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/dwightsabeast/coffer/bridge/internal/selfupdate"
)

// Paths is where the files are. The data folder is the service user's; the admin copy and EtcDir are root's.
type Paths struct {
	DataDir string // /var/lib/xmr-bridge
	Admin   string // /usr/local/bin/xmr-bridge
	EtcDir  string // /etc/xmr-bridge
}

// AdminHash records the admin copy's SHA-256 (the installer's file; uninstall removes only a copy it recognizes).
func (p Paths) AdminHash() string { return filepath.Join(p.EtcDir, "admin-binary.sha256") }

// AdminRelease and AdminReleaseSig keep, in root's folder, the signed release the admin copy was refreshed from.
func (p Paths) AdminRelease() string    { return filepath.Join(p.EtcDir, "admin-release.json") }
func (p Paths) AdminReleaseSig() string { return p.AdminRelease() + ".sig" }

// Outcome is what a run did.
type Outcome int

const (
	NothingToDo Outcome = iota
	Refreshed           // the admin copy was replaced with a newer verified release
	Repaired            // the admin copy was already the verified release; its hash file was rewritten
)

func (o Outcome) String() string { return [...]string{"nothing to do", "refreshed", "repaired"}[o] }

// Result is a run's outcome, the release version it concerned, and why (for the journal).
type Result struct {
	Outcome Outcome
	Version string
	Note    string
}

// Refresher does one run.
type Refresher struct {
	Paths Paths
	Keys  []ed25519.PublicKey // this copy's releaseKeys(), never a key from a file
	Own   string              // this copy's version
	Arch  string              // runtime.GOARCH

	// Test hooks.
	afterVerify func()                                       // between the last check and the first write
	afterStep   func(step int) error                         // after each swap step; an error stops the run (a crash)
	devOf       func(st *syscall.Stat_t, path string) uint64 // the device an fd is on
}

// Run refreshes the admin copy if the service runs a newer, verified, committed release. A refusal is an error and
// changes nothing.
func (r *Refresher) Run() (Result, error) {
	m, err := r.read("bin/release.json", selfupdate.MaxManifest)
	if errors.Is(err, os.ErrNotExist) {
		return Result{Note: "the service hasn't kept a verified release yet (no update since the install)"}, nil
	}
	if err != nil {
		return Result{}, err
	}
	sig, err := r.read("bin/release.json.sig", selfupdate.MaxSignature)
	if err != nil {
		return Result{}, err
	}
	man, err := selfupdate.VerifyManifest(m, sig, r.Keys)
	if err != nil {
		return Result{}, fmt.Errorf("refused: bin/release.json's signature: %w", err)
	}
	file, err := fileFor(man, r.Arch)
	if err != nil {
		return Result{}, err
	}
	switch {
	case selfupdate.Newer(r.Own, man.Version):
		return Result{}, fmt.Errorf("refused: the service's release %s is older than this copy (%s)", man.Version, r.Own)
	case !selfupdate.Newer(man.Version, r.Own):
		return r.repair(man.Version, file)
	}
	// Files the service writes: they can only stop a refresh.
	pending, err := r.readOptional("run/update-pending", 4<<10)
	if err != nil {
		return Result{}, err
	}
	if p, ok := selfupdate.ParsePending(pending); ok {
		return Result{Version: man.Version, Note: fmt.Sprintf("waiting: the service's update to %s hasn't proved itself yet", p.Version)}, nil
	}
	refused, err := r.readOptional("run/refused", 64<<10)
	if err != nil {
		return Result{}, err
	}
	if selfupdate.RefusedIn(refused, selfupdate.KindBridge, man.Version) {
		return Result{Version: man.Version, Note: fmt.Sprintf("not refreshing: the service refused %s", man.Version)}, nil
	}
	bin, err := r.read("bin/xmr-bridge", selfupdate.MaxBinary)
	if err != nil {
		return Result{}, err
	}
	if int64(len(bin)) != file.Size || hash(bin) != file.SHA256 {
		return Result{}, fmt.Errorf("refused: the service's bin/xmr-bridge doesn't match release %s for linux/%s", man.Version, r.Arch)
	}
	if r.afterVerify != nil {
		r.afterVerify()
	}
	// The swap. From here on only bytes already in memory and checked are written, each through a temp file in
	// root's own folder. A crash between steps leaves a copy that Recognized accepts.
	steps := []func() error{
		func() error {
			if err := writeFile(r.Paths.AdminRelease(), m, 0o644, ""); err != nil {
				return err
			}
			return writeFile(r.Paths.AdminReleaseSig(), sig, 0o644, "")
		},
		func() error { return writeFile(r.Paths.Admin, bin, 0o755, file.SHA256) },
		func() error { return writeFile(r.Paths.AdminHash(), []byte(file.SHA256+"\n"), 0o644, "") },
	}
	for i, step := range steps {
		if err := step(); err != nil {
			return Result{}, fmt.Errorf("refreshing %s: %w", r.Paths.Admin, err)
		}
		if r.afterStep != nil {
			if err := r.afterStep(i + 1); err != nil {
				return Result{}, err
			}
		}
	}
	return Result{Outcome: Refreshed, Version: man.Version, Note: fmt.Sprintf("refreshed %s from %s to %s", r.Paths.Admin, r.Own, man.Version)}, nil
}

// repair handles a release at this copy's own version: if the admin copy is that release's file but the hash file
// says otherwise (a crash between swap steps), it rewrites the hash file. Root's own files only.
func (r *Refresher) repair(v string, file selfupdate.File) (Result, error) {
	got, err := fileHash(r.Paths.Admin)
	if err != nil || got != file.SHA256 {
		return Result{Version: v, Note: "this copy is already at the service's version"}, nil
	}
	recorded, _ := os.ReadFile(r.Paths.AdminHash())
	if strings.TrimSpace(string(recorded)) == got {
		return Result{Version: v, Note: "this copy is already at the service's version"}, nil
	}
	if err := writeFile(r.Paths.AdminHash(), []byte(got+"\n"), 0o644, ""); err != nil {
		return Result{}, err
	}
	return Result{Outcome: Repaired, Version: v, Note: "rewrote " + r.Paths.AdminHash() + " for the admin copy"}, nil
}

// Recognized reports whether the file at the admin copy's place is the installer's: its SHA-256 is the recorded one,
// or it is this CPU's file of the release kept in root's folder, whose signature checks against keys. A crash between
// the refresh's swap steps leaves one of the two true.
func Recognized(p Paths, keys []ed25519.PublicKey, arch string) bool {
	fi, err := os.Lstat(p.Admin)
	if err != nil || !fi.Mode().IsRegular() {
		return false
	}
	got, err := fileHash(p.Admin)
	if err != nil {
		return false
	}
	if recorded, err := os.ReadFile(p.AdminHash()); err == nil && strings.TrimSpace(string(recorded)) == got {
		return true
	}
	m, err1 := os.ReadFile(p.AdminRelease())
	sig, err2 := os.ReadFile(p.AdminReleaseSig())
	if err1 != nil || err2 != nil {
		return false
	}
	man, err := selfupdate.VerifyManifest(m, sig, keys)
	if err != nil {
		return false
	}
	file, err := fileFor(man, arch)
	return err == nil && file.SHA256 == got
}

func fileFor(man selfupdate.Manifest, arch string) (selfupdate.File, error) {
	for _, f := range man.Files {
		if f.OS == "linux" && f.Arch == arch {
			return f, nil
		}
	}
	return selfupdate.File{}, fmt.Errorf("refused: release %s has no file for linux/%s", man.Version, arch)
}

func (r *Refresher) readOptional(rel string, limit int64) ([]byte, error) {
	b, err := r.read(rel, limit)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	return b, err
}

// read returns <DataDir>/<rel>, read once, with no symlink anywhere on the path and nothing but a regular file on the
// data folder's own filesystem at the end. The path is walked from / one component at a time: folders with
// O_NOFOLLOW|O_DIRECTORY, the file with O_NOFOLLOW|O_NONBLOCK (a FIFO can't block the open), then fstat before any
// read. That is openat2's RESOLVE_NO_SYMLINKS|RESOLVE_NO_MAGICLINKS|RESOLVE_NO_XDEV with the standard library alone
// (magic links are symlinks too). A missing final file is os.ErrNotExist; everything else wrong is a refusal.
func (r *Refresher) read(rel string, limit int64) ([]byte, error) {
	dataDir := filepath.Clean(r.Paths.DataDir)
	if !filepath.IsAbs(dataDir) {
		return nil, fmt.Errorf("refused: the data folder %q isn't an absolute path", r.Paths.DataDir)
	}
	parts := strings.Split(strings.TrimPrefix(dataDir, "/"), "/")
	relParts := strings.Split(filepath.Clean(rel), "/")
	for _, p := range relParts {
		if p == ".." || p == "." || p == "" {
			return nil, fmt.Errorf("refused: %q", rel)
		}
	}
	fd, err := syscall.Open("/", syscall.O_RDONLY|syscall.O_DIRECTORY|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil, err
	}
	closeFd := func() { syscall.Close(fd) }
	walked := ""
	var dev uint64
	step := func(name string, flags int) error {
		next, err := syscall.Openat(fd, name, flags|syscall.O_NOFOLLOW|syscall.O_CLOEXEC, 0)
		walked += "/" + name
		if err != nil {
			if errors.Is(err, syscall.ENOENT) {
				return &os.PathError{Op: "open", Path: walked, Err: os.ErrNotExist}
			}
			return fmt.Errorf("refused: %s: %w (a symlink, or not a folder or file)", walked, err)
		}
		syscall.Close(fd)
		fd = next
		return nil
	}
	for _, name := range parts {
		if name == "" {
			continue
		}
		if err := step(name, syscall.O_RDONLY|syscall.O_DIRECTORY); err != nil {
			closeFd()
			return nil, err
		}
	}
	if dev, err = r.dev(fd, walked); err != nil {
		closeFd()
		return nil, err
	}
	for i, name := range relParts {
		flags := syscall.O_RDONLY | syscall.O_DIRECTORY
		if i == len(relParts)-1 {
			flags = syscall.O_RDONLY | syscall.O_NONBLOCK
		}
		if err := step(name, flags); err != nil {
			closeFd()
			return nil, err
		}
		d, err := r.dev(fd, walked)
		if err != nil {
			closeFd()
			return nil, err
		}
		if d != dev {
			closeFd()
			return nil, fmt.Errorf("refused: %s is on another filesystem than %s", walked, dataDir)
		}
	}
	var st syscall.Stat_t
	if err := syscall.Fstat(fd, &st); err != nil {
		closeFd()
		return nil, err
	}
	if st.Mode&syscall.S_IFMT != syscall.S_IFREG {
		closeFd()
		return nil, fmt.Errorf("refused: %s isn't a regular file", walked)
	}
	f := os.NewFile(uintptr(fd), walked)
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, fmt.Errorf("refused: %s is larger than %d bytes", walked, limit)
	}
	return b, nil
}

func (r *Refresher) dev(fd int, path string) (uint64, error) {
	var st syscall.Stat_t
	if err := syscall.Fstat(fd, &st); err != nil {
		return 0, err
	}
	if r.devOf != nil {
		return r.devOf(&st, path), nil
	}
	return uint64(st.Dev), nil
}

// writeFile replaces path with data through a temp file in the same folder: write, fsync, (for the binary) read the
// temp file back and check its SHA-256, chmod, rename, fsync the folder. Root's folders only.
func writeFile(path string, data []byte, mode os.FileMode, wantSHA string) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+"-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if wantSHA != "" {
		if got, err := fileHash(name); err != nil || got != wantSHA {
			return fmt.Errorf("the written copy of %s doesn't match the signed release", path)
		}
	}
	if err := os.Chmod(name, mode); err != nil {
		return err
	}
	if err := os.Rename(name, path); err != nil {
		return err
	}
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}

func hash(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
