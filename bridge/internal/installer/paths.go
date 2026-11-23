package installer

import (
	"path/filepath"

	"github.com/dwightsabeast/coffer/bridge/internal/adminrefresh"
)

// The installed layout (spec, Bridge service, "Configuration"; 3f and 3g plans): the service's bridge binary lives in
// the data folder so a signed update can replace it under ProtectSystem=strict. The admin runs a separate root-owned
// copy in /usr/local/bin: root never runs a file the service account can write.
const (
	ServiceUser = "xmr-bridge"
	ServiceName = "xmr-bridge.service"
	dataDir     = "/var/lib/xmr-bridge"
	etcDir      = "/etc/xmr-bridge"
	binaryPath  = dataDir + "/bin/xmr-bridge"
	linkPath    = "/usr/local/bin/xmr-bridge"
	unitPath    = "/etc/systemd/system/" + ServiceName
	configPath  = etcDir + "/config"
	guardPath   = dataDir + "/bin/update-guard.sh"
	adminHash   = etcDir + "/admin-binary.sha256"
	// The admin copy's refresh (spec change 60): a root-owned oneshot and the timer that runs it.
	RefreshServiceName = "xmr-bridge-refresh.service"
	RefreshTimerName   = "xmr-bridge-refresh.timer"
	refreshServicePath = "/etc/systemd/system/" + RefreshServiceName
	refreshTimerPath   = "/etc/systemd/system/" + RefreshTimerName
)

// Paths places the layout under Root ("/" on a real install; a temporary folder in tests).
type Paths struct{ Root string }

func (p Paths) at(path string) string {
	if p.Root == "" || p.Root == "/" {
		return path
	}
	return filepath.Join(p.Root, path)
}

func (p Paths) DataDir() string { return p.at(dataDir) }
func (p Paths) BinDir() string  { return p.at(dataDir + "/bin") }
func (p Paths) Binary() string  { return p.at(binaryPath) }
func (p Paths) Link() string    { return p.at(linkPath) }
func (p Paths) EtcDir() string  { return p.at(etcDir) }
func (p Paths) Config() string  { return p.at(configPath) }
func (p Paths) Unit() string    { return p.at(unitPath) }
func (p Paths) Guard() string   { return p.at(guardPath) }

func (p Paths) RefreshService() string { return p.at(refreshServicePath) }
func (p Paths) RefreshTimer() string   { return p.at(refreshTimerPath) }

// Refresh is the layout the admin copy's refresh works on.
func (p Paths) Refresh() adminrefresh.Paths {
	return adminrefresh.Paths{DataDir: p.DataDir(), Admin: p.Link(), EtcDir: p.EtcDir()}
}

// AdminHash records the SHA-256 of the admin copy the installer wrote, so uninstall removes only that file.
func (p Paths) AdminHash() string { return p.at(adminHash) }
