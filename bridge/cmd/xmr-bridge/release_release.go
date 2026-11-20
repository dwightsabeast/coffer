//go:build !devrelease

package main

import (
	"crypto/ed25519"
	"time"
)

// Release builds. The release public key is pinned in phase 09, when Wyatt provides it (decisions.md); until then
// automatic updates report "off: no release key pinned yet". No dev key and no dev release address exist in this
// file, and TestReleaseBuildHasNoDevValues proves the linked binary doesn't contain them.
const devBuild = false

func releaseKeys() []ed25519.PublicKey { return nil }

// devBreakMode is always "" in release builds (see release_dev.go).
func devBreakMode() string { return "" }

// releaseBase is the folder installed bridges poll for updates (spec change 58, docs/install-host.md): plain copies of
// the newest version's release.json, release.json.sig and binaries.
func releaseBase() string { return "https://get.coffer.party/latest" }

const (
	updateDelay     = 48 * time.Hour // after a bridge release's signed date
	walletRPCDelay  = 48 * time.Hour // after a new wallet-rpc version is first seen
	firstCheckAfter = 10 * time.Minute
	checkEvery      = 24 * time.Hour
	checkJitter     = time.Hour
)
