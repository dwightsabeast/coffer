package installer

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"syscall"
	"unsafe"

	"github.com/dwightsabeast/coffer/bridge/internal/secret"
)

const maxAnswer = 512

// ErrCancelled: the admin pressed Ctrl-C (or the installer was told to stop) before anything was changed.
var ErrCancelled = errors.New("cancelled")

type prompter struct {
	in   *bufio.Reader
	out  io.Writer
	echo func(on bool) error
	// done, when set, ends a prompt that is waiting for its answer (RT-22: Ctrl-C at a prompt). The read it leaves
	// behind stays blocked until the process exits, so nothing is asked after it.
	done <-chan struct{}
}

func newPrompter(in io.Reader, out io.Writer, echo func(on bool) error) *prompter {
	return &prompter{in: bufio.NewReaderSize(in, maxAnswer+2), out: out, echo: echo}
}

// OpenTTY returns a prompter on /dev/tty, which works when the installer's own input is a pipe from curl. Close it
// when done. A prompt waiting for its answer returns ErrCancelled when ctx is cancelled.
func OpenTTY(ctx context.Context) (Prompter, func() error, error) {
	f, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
	if err != nil {
		return nil, nil, errors.New("the installer needs a terminal to ask for the shop wallet's details")
	}
	fd := f.Fd()
	echo := func(on bool) error {
		var t syscall.Termios
		if _, _, e := syscall.Syscall(syscall.SYS_IOCTL, fd, syscall.TCGETS, uintptr(unsafe.Pointer(&t))); e != 0 {
			return fmt.Errorf("not a terminal: %w", e)
		}
		if on {
			t.Lflag |= syscall.ECHO
		} else {
			t.Lflag &^= syscall.ECHO
		}
		if _, _, e := syscall.Syscall(syscall.SYS_IOCTL, fd, syscall.TCSETS, uintptr(unsafe.Pointer(&t))); e != 0 {
			return fmt.Errorf("not a terminal: %w", e)
		}
		return nil
	}
	p := newPrompter(f, f, echo)
	p.done = ctx.Done()
	return p, f.Close, nil
}

// readLine waits for one line, or for done.
func (p *prompter) readLine() (string, error) {
	if p.done == nil {
		return p.read()
	}
	select {
	case <-p.done:
		return "", ErrCancelled
	default:
	}
	type answer struct {
		line string
		err  error
	}
	ch := make(chan answer, 1)
	go func() {
		line, err := p.read()
		ch <- answer{line, err}
	}()
	select {
	case a := <-ch:
		return a.line, a.err
	case <-p.done:
		return "", ErrCancelled
	}
}

func (p *prompter) read() (string, error) {
	line, err := p.in.ReadSlice('\n')
	if errors.Is(err, bufio.ErrBufferFull) || len(line) > maxAnswer+1 {
		return "", errors.New("that answer is too long")
	}
	if err != nil && (len(line) == 0 || !errors.Is(err, io.EOF)) {
		return "", errors.New("no answer (end of input)")
	}
	return strings.TrimSpace(string(line)), nil
}

func (p *prompter) Ask(prompt string) (string, error) {
	fmt.Fprint(p.out, prompt)
	line, err := p.readLine()
	if errors.Is(err, ErrCancelled) {
		fmt.Fprintln(p.out) // the cursor is still on the prompt's line
	}
	return line, err
}

func (p *prompter) AskSecret(prompt string) (secret.String, error) {
	fmt.Fprint(p.out, prompt)
	if err := p.echo(false); err != nil {
		p.echo(true)
		return secret.String{}, err
	}
	line, err := p.readLine()
	p.echo(true)
	fmt.Fprintln(p.out)
	if err != nil {
		return secret.String{}, err
	}
	return secret.New(line), nil
}

func (p *prompter) Say(format string, a ...any) { fmt.Fprintf(p.out, format+"\n", a...) }
