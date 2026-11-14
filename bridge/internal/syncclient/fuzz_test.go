package syncclient

import (
	"testing"
)

// Phase 07b pass 1, round 2 (Step 3): the site's bridge/sync reply, as parse reads it. Whatever the bytes, no panic,
// and an accepted reply keeps the bounds the loop relies on.
func FuzzParseReply(f *testing.F) {
	f.Add(200, []byte(okReply))
	f.Add(200, []byte(`{"success":true,"data":{"ok":true,"poolFree":1,"poolTarget":50,"poolTop":4294967295,"restoreHeight":9007199254740993,"watch":[2147483648]}}`))
	f.Add(403, []byte(`{"success":false,"error":{"code":"CSRF_REJECTED"}}`))
	f.Add(200, []byte(`{"success":true,"data":{"error":{"code":"NOT_PAIRED"}}}`))
	f.Fuzz(func(t *testing.T, status int, data []byte) {
		r, err := parse(status, data)
		if err != nil {
			return
		}
		if status != 200 || r.PoolFree < 0 || r.PoolTarget < 0 {
			t.Fatalf("accepted status %d, %+v", status, r)
		}
		for _, w := range r.Watch {
			if w < 1 || w > 1<<31 {
				t.Fatalf("watch index %d", w)
			}
		}
	})
}
