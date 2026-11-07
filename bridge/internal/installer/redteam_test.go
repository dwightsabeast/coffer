package installer

import (
	"context"
	"strings"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/secret"
)

// Phase 07b pass 1, round 2 (Step 3, white box), from F4 on coffer-test. An attack that lands is committed with
// t.Skip("RT-nn open") until the fix session flips it.

// RT-21: with the stagenet-only flag, a mainnet address is refused only after the view key is asked for. The network
// is known from the address alone (install.go reads it at the address prompt, line 193), so the refusal can come
// before the second prompt, as the same-machine refusal already does (run A attempt 1).
func TestRedteamDevFlagRefusesMainnetBeforeTheViewKey(t *testing.T) {
	t.Run("[T15] [RT-21] the dev flag's mainnet refusal comes before the view-key prompt", func(t *testing.T) {
		t.Skip("RT-21 open")
		opts, sys, tty, st := harness(t)
		opts.AllowSameMachine = true
		tty.answers = []string{mainnetAddr}
		err := Install(context.Background(), opts, sys, tty, st.steps(sys))
		if err == nil || !strings.Contains(err.Error(), "stagenet") {
			t.Fatalf("mainnet with the dev flag: %v", err)
		}
		for _, p := range tty.asked {
			if strings.Contains(p, "view key") {
				t.Fatalf("asked %q before refusing", tty.asked)
			}
		}
	})
}

// ctrlCTTY plays a person at the real terminal: at the view-key prompt they press Ctrl-C, which the real installer
// turns into a cancelled context (main.go's signal.NotifyContext) while its blocking read goes on, then Enter.
type ctrlCTTY struct {
	*fakeTTY
	cancel    context.CancelFunc
	cancelled bool
	after     []string // prompts asked after the Ctrl-C
}

func (p *ctrlCTTY) Ask(prompt string) (string, error) {
	if p.cancelled {
		p.after = append(p.after, prompt)
	}
	return p.fakeTTY.Ask(prompt)
}

func (p *ctrlCTTY) AskSecret(prompt string) (secret.String, error) {
	if p.cancelled {
		p.after = append(p.after, prompt)
		return p.fakeTTY.AskSecret(prompt)
	}
	p.fakeTTY.asked = append(p.fakeTTY.asked, prompt)
	p.cancel()
	p.cancelled = true
	return secret.New(""), nil // Enter
}

// RT-22: Ctrl-C at a prompt is ignored; the installer asks again and, with real answers, carries on until a network
// step fails on the cancelled context with a wrong diagnosis ("doesn't answer as a Monero node"). Live: F4 b and
// F4c on coffer-test, 2026-10-30 (the machine stayed unchanged).
func TestRedteamCtrlCAtAPromptStopsTheInstaller(t *testing.T) {
	t.Run("[T15] [RT-22] Ctrl-C at the view-key prompt stops the installer, says so, and asks nothing more", func(t *testing.T) {
		t.Skip("RT-22 open")
		opts, sys, fake, st := harness(t)
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		tty := &ctrlCTTY{fakeTTY: fake, cancel: cancel}
		err := Install(ctx, opts, sys, tty, st.steps(sys))
		if err == nil || !strings.Contains(strings.ToLower(err.Error()), "cancel") {
			t.Fatalf("after Ctrl-C: %v", err)
		}
		if len(tty.after) != 0 {
			t.Fatalf("asked %q after Ctrl-C", tty.after)
		}
		if len(sys.calls) != 0 {
			t.Fatal("changed the machine after Ctrl-C")
		}
	})
}
