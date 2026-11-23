package installer

// UnitText is the systemd unit (phase 03 rules: a dedicated user, NoNewPrivileges, ProtectSystem=strict with explicit
// ReadWritePaths, ProtectHome, PrivateTmp, RestrictAddressFamilies, no inbound listeners: wallet-rpc binds loopback).
// Updates (3g): the bridge exits 75 after swapping in an update and systemd restarts it; the guard runs before each
// start as the service user (no "+" prefix) and rolls back an update that fails to start 3 times. Starts come at most
// every RestartSec=10 s, so the guard's 4th start is about 40 s in, well inside StartLimitBurst=20 per 10 minutes.
func UnitText() string {
	return `[Unit]
Description=xmr-pay wallet host (xmr-bridge)
Documentation=https://github.com/dwightsabeast/coffer
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=600
StartLimitBurst=20

[Service]
Type=simple
User=` + ServiceUser + `
Group=` + ServiceUser + `
ExecStartPre=` + guardPath + `
ExecStart=` + binaryPath + ` run --config ` + configPath + `
Restart=on-failure
RestartForceExitStatus=75
RestartSec=10
UMask=0077

NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=` + dataDir + `
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
MemoryDenyWriteExecute=yes
ProtectProc=invisible
RemoveIPC=yes
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
`
}

// RefreshServiceText is the admin copy's refresh (spec change 60): a oneshot run as root by the timer. Root reads the
// service's files but never writes them, makes no network request, and can write only its own two folders.
func RefreshServiceText() string {
	return `[Unit]
Description=Refresh the xmr-bridge admin copy from the release the service verified
Documentation=https://github.com/dwightsabeast/coffer

[Service]
Type=oneshot
ExecStart=` + linkPath + ` refresh-admin
TimeoutStartSec=2min
UMask=0022

NoNewPrivileges=yes
PrivateNetwork=yes
ProtectSystem=strict
ReadWritePaths=/usr/local/bin ` + etcDir + `
ReadOnlyPaths=` + dataDir + `
CapabilityBoundingSet=CAP_DAC_READ_SEARCH
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
MemoryDenyWriteExecute=yes
ProtectProc=invisible
AmbientCapabilities=
`
}

// RefreshTimerText runs the refresh 15 minutes after boot and every 6 hours, on root's schedule only.
func RefreshTimerText() string {
	return `[Unit]
Description=Refresh the xmr-bridge admin copy every 6 hours
Documentation=https://github.com/dwightsabeast/coffer

[Timer]
OnBootSec=15min
OnUnitActiveSec=6h
RandomizedDelaySec=30min
Persistent=true
Unit=` + RefreshServiceName + `

[Install]
WantedBy=timers.target
`
}
