package main

import (
	"fmt"
	"io"
	"runtime"

	"github.com/dwightsabeast/coffer/bridge/internal/adminrefresh"
	"github.com/dwightsabeast/coffer/bridge/internal/installer"
)

// cmdRefreshAdmin keeps the root-owned admin copy at the release the service verified and committed (spec change 60).
// It takes no config: /etc/xmr-bridge/config belongs to the service user, so root works only from the fixed install
// layout and this copy's own release keys.
func cmdRefreshAdmin(args []string, stdout, stderr io.Writer) int {
	if len(args) != 0 {
		fmt.Fprint(stderr, usage)
		return 2
	}
	if !isRoot() {
		fmt.Fprintln(stderr, "xmr-bridge: refreshing the admin copy needs root: run it with sudo")
		return 1
	}
	r := &adminrefresh.Refresher{Paths: installer.Paths{Root: "/"}.Refresh(), Keys: releaseKeys(), Own: version, Arch: runtime.GOARCH}
	res, err := r.Run()
	if err != nil {
		fmt.Fprintf(stderr, "xmr-bridge refresh-admin: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "xmr-bridge refresh-admin: %s: %s\n", res.Outcome, res.Note)
	return 0
}
