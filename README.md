# Coffer

Coffer is a sandboxed [EmDash](https://docs.emdashcms.com) plugin for taking Monero (XMR) payments and tips on an EmDash site. Each invoice gets its own subaddress and is settled only after enough confirmations. A small Go service, the bridge, runs next to Monero's official `monero-wallet-rpc` on a separate wallet host and pushes signed snapshots of incoming payments to the plugin. A one-command Linux installer sets the wallet host up.

## Status

**Release 1 (1.0.0) takes tips only.** Visitors can tip in Monero, with an open amount and a note, and you see each tip and the totals per entry in your admin. Orders, payment for goods and the pay button come in release 2, which is in development.

Release 1 was tested on Monero's test network (stagenet). The project reviewed itself; there was no outside review. The security report says what was tested and which limits were accepted: [`docs/security-report.md`](docs/security-report.md).

Release 1 has three parts:

- **The plugin**, version 1.0.0, from the EmDash plugin registry: `@dwightsabeast.tngl.sh/coffer`.
- **The theme components**, `@cofferhq/astro` on npm: the tip button, its endpoint and the pay page.
- **The wallet host program**, `xmr-bridge` 1.0.0, installed with the one command on your site's **Monero payments** page. It downloads from `https://get.coffer.party`. The files, their checksums and the release key's fingerprint are on the [GitHub release](https://github.com/dwightsabeast/coffer/releases/tag/xmr-bridge%401.0.0).

The install guide: [`docs/install.md`](docs/install.md).

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
| `plugin/` | The sandboxed EmDash plugin, slug `coffer` |
| `bridge/` | The Go bridge, `xmr-bridge` (Go standard library only) |
| `installer/` | `install.sh` and the release public keys |
| `theme/` | `@cofferhq/astro`: the tip button, its endpoint and the pay page |
| `contract/` | Test vectors that the plugin's and the bridge's tests share; the payment contract for stores comes in release 2 |
| `spikes/` | Throwaway experiments, never shipped |

## License

[MIT](LICENSE)
