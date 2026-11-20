## What Coffer can and can't reach

- **Your site holds no wallet key.** A break-in on the site can't spend your Monero or read your wallet.
- **The wallet host holds a view key only.** It sees incoming payments but can't spend them.
- **The spend key stays in your wallet app.** Coffer never asks for it.

## What we tested

Before the release, we attacked Coffer with:

- forged, changed and replayed payment reports
- guessed pairing codes and spam tips
- hostile notes, a dishonest Monero node and changed downloads

No finding rated Critical or High is open. On every change, a named test checks each protection.

## Known limits

- **A thief with the wallet host's signing key can't spend.** While your wallet host runs, Coffer refuses payment addresses that aren't yours. If the thief also stops your wallet host, new tips can go to the thief until it runs again or you connect a new one. Health turns red after 5 minutes of silence.
- **Spam.** One sender can fill the 40 open tips and block new ones for up to 30 minutes, unless your proxy limits them. They can't take money.
- **On a Node-hosted site,** one stuck plugin request can delay every plugin request for up to 30 seconds.
- **The install command checks a checksum, not a signature,** so the first install trusts the download site. The guide shows a signature check by hand. The wallet host checks each later update's signature.
- **With a remote node,** the second nodes that check it learn which blocks hold your payments.
- **Checked by hand or in the code, not by an automated test:**
  - EmDash's refusals (other hosts, undeclared storage, non-admin users)
  - the random source of pay links
  - that Coffer's privacy headers stay on its own pages
- **Not in this release:** orders, email and refund addresses.

Full report, with each claim's test:
https://github.com/dwightsabeast/coffer/blob/coffer%401.0.0/docs/security-report.md

Report a problem privately: https://github.com/dwightsabeast/coffer/security/advisories/new
