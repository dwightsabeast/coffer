# Coffer

Coffer is a sandboxed [EmDash](https://docs.emdashcms.com) plugin for taking Monero (XMR) payments and tips on an EmDash site. Each invoice gets its own subaddress and is settled only after enough confirmations. A small Go service, the bridge, runs next to Monero's official `monero-wallet-rpc` on a separate wallet host and pushes signed snapshots of incoming payments to the plugin. A one-command Linux installer sets the wallet host up.

## Status

**In development, not ready for use.** Nothing here has been released, and the design may still change. Do not use it to take real payments.

Once released, the plugin comes from the EmDash plugin registry, and the wallet host's installer and the bridge from `https://get.coffer.party` (`docs/install.md`).

## Security model

- **No keys on the site.** The plugin stores no wallet material and no credentials, only the bridge's public key. The spend key is nowhere on the live path, and the view-only wallet stays on the wallet host, which must be a separate machine from the site.
- **Signed, replay-proof updates.** Every snapshot from the bridge is Ed25519-signed and carries a timestamp (300-second window) and a monotonic sequence number. Old or forged snapshots are rejected.
- **The plugin never calls the wallet.** Its network access is limited to two price APIs (`api.coingecko.com`, `api.kraken.com`). The wallet host opens no inbound ports.
- **Nothing ships at zero confirmations.** Required confirmations are locked per invoice at checkout. Time-locked and double-spend-flagged transfers never count, and settled invoices stay watched until 10 confirmations deep.
- **Verified downloads.** The install command fetches `install.sh` from `https://get.coffer.party`, and `install.sh` carries the bridge's SHA-256 for its release: the download must match it before anything runs. Admins who want more check the release's signature by hand, comparing the release key's fingerprint with the GitHub release page (`docs/install.md`). The bridge checks its own updates against the release key built into it, and Monero's wallet program against the Monero project's GPG-signed hash list before running it.

## Layout

| Path | What |
| --- | --- |
| `docs/` | Design spec, decisions, build phases, progress log, proof of concept and references |
| `scripts/` | Development helpers |
| `plugin/` | The sandboxed EmDash plugin (later phase) |
| `bridge/` | The Go bridge, `xmr-bridge` (later phase) |
| `installer/` | `install.sh` and the systemd unit (later phase) |
| `theme/` | Astro components: pay button and `/pay` page (later phase) |
| `contract/` | Payment contract doc and conformance tests (later phase) |
| `spikes/` | Throwaway experiments, never shipped (later phase) |

## License

[MIT](LICENSE)
