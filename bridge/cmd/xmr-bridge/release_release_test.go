//go:build !devrelease

package main

import (
	"testing"
	"time"
)

// The release build's update schedule (spec: Updates, a daily check). F1 on coffer-test (07b round 2) saw the dev
// build's one-minute checks; this pins that a release build waits 10 minutes, then checks every 24 h ± 1 h, and waits
// 48 h after a release before installing it.
func TestReleaseUpdateSchedule(t *testing.T) {
	t.Run("[T10][T26] a release build checks for updates daily, not every minute", func(t *testing.T) {
		if devBuild {
			t.Fatal("built as a dev release")
		}
		if firstCheckAfter != 10*time.Minute || checkEvery != 24*time.Hour || checkJitter != time.Hour {
			t.Fatalf("first after %v, every %v ± %v", firstCheckAfter, checkEvery, checkJitter)
		}
		if updateDelay != 48*time.Hour || walletRPCDelay != 48*time.Hour {
			t.Fatalf("delays %v, %v", updateDelay, walletRPCDelay)
		}
	})
}
