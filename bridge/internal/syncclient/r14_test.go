package syncclient

import (
	"errors"
	"strings"
	"testing"
)

// R14 (spec change 59 item 4): which site answers count as the site being down rather than a refusal.
func TestR14SiteDown(t *testing.T) {
	t.Run("[R14] 502, 503 and 504 are the site being down; 500 and every 4xx are refusals", func(t *testing.T) {
		for status, down := range map[int]bool{502: true, 503: true, 504: true, 500: false, 400: false, 401: false, 403: false, 404: false, 409: false, 429: false} {
			_, err := parse(status, []byte(`{"success":false,"error":{"code":"SOME_CODE","message":"x"}}`))
			var se *Error
			if !errors.As(err, &se) {
				t.Fatalf("%d: not a site answer: %v", status, err)
			}
			if se.SiteDown() != down {
				t.Errorf("%d: SiteDown() = %v, want %v", status, se.SiteDown(), down)
			}
		}
	})
	t.Run("[R14] EmDash's STORAGE_INDEXES_NOT_READY 503 is the site being down, with a status hint", func(t *testing.T) {
		_, err := parse(503, []byte(`{"success":false,"error":{"code":"STORAGE_INDEXES_NOT_READY","message":"Plugin storage indexes are not ready"}}`))
		var se *Error
		if !errors.As(err, &se) || se.Code != "STORAGE_INDEXES_NOT_READY" || !se.SiteDown() {
			t.Fatalf("got %#v", err)
		}
		if !strings.Contains(se.Hint, "storage") || !strings.Contains(se.Hint, "log") {
			t.Errorf("hint %q should say the site is preparing Coffer's storage and point at the site's logs", se.Hint)
		}
	})
}
