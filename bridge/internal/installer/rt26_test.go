package installer

import (
	"context"
	"strings"
	"testing"

	"github.com/dwightsabeast/coffer/bridge/internal/config"
)

// Spec change 47, D3 (RT-26): a new wallet never scans from above the node's bounded height. A site whose height a
// dishonest remote node pushed up suggests a restore height in the future, and a wallet scanning from there would miss
// every payment (run A attempt 2's failure, caused remotely). The cap is the bounded height (crosscheck.BoundedHeight),
// or the node's own height when there is none.
func TestRestoreHeightClamp(t *testing.T) {
	for _, c := range []struct {
		name             string
		suggest, bounded uint64
		want             uint64
		line             bool
	}{
		{"[R09][T14] [RT-26] a suggestion above the bounded height: the bounded height minus the margin", 3222000, 2221900, 2221900 - restoreMarginBlocks, true},
		{"[R09][T14] [RT-26] a suggestion above the node's height, no bounded height: the node's height minus the margin", 3222000, 0, 2222000 - restoreMarginBlocks, true},
		{"[R09][T14] [RT-26] nothing suggested: the bounded height, not the node's own", 0, 2221500, 2221500, false},
		{"[R09] a suggestion at or below the bounded height is used as is", 2221280, 2221900, 2221280, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			opts, sys, tty, st := harness(t)
			st.suggest, st.bounded = c.suggest, c.bounded
			if err := Install(context.Background(), opts, sys, tty, st.steps(sys)); err != nil {
				t.Fatalf("%v\n%s", err, tty.said.String())
			}
			cfg, err := config.Load(opts.Paths.Config())
			if err != nil || cfg.RestoreHeight != c.want || st.walletCfg.RestoreHeight != c.want {
				t.Fatalf("restore height: config %d, wallet %d, want %d (%v)", cfg.RestoreHeight, st.walletCfg.RestoreHeight, c.want, err)
			}
			if said := strings.Contains(tty.said.String(), "above the node's height"); said != c.line {
				t.Fatalf("the clamp line %v, want %v:\n%s", said, c.line, tty.said.String())
			}
		})
	}
}
