## What you'll need

- **EmDash 1.3.1 or later, hosted on Node.js.** Sites hosted on Cloudflare aren't supported yet.
- **A separate, always-on Linux machine with systemd**, such as a small VPS or a home server. The wallet runs there,
  never on your site's server.
- **Your shop wallet's address and view key.** Never the spend key.
- **Access to your site's code**, to add the pay page and the tip button, then redeploy.
- **About 15 minutes**, ending with a test tip to your own wallet.

## Why a separate machine

Your site never holds a wallet key. A small program on the wallet host watches your wallet with its view key and sends
signed updates to the site. If your site is compromised, the attacker can't spend your Monero or look into your wallet.
The view key stays on the wallet host, and even there it can only see incoming payments, never spend them.

An option to run the wallet host on the same server, for an easier setup, is planned for an upcoming release.
