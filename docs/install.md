# Coffer install guide

This is the long version of the listing's "Installation" section. It covers the wallet host: what it needs, how to install it, what to set up around your site, and what to do when something goes wrong. The theme steps (the pay page and the tip button) are in the listing.

Setup takes about 15 minutes. You work in three places, and every step below says which one.

| Where | What it is |
| --- | --- |
| **Your wallet app** | A Monero wallet on your own computer, for example Feather Wallet, with your **shop wallet** open. |
| **Your site's admin** | Your EmDash site's admin pages, in your web browser. |
| **The wallet host** | A separate Linux machine that watches your shop wallet for payments. It is **not** the machine your site runs on. |

## Before you start

**The wallet host needs:**

- Linux with systemd. 64-bit x86 or 64-bit ARM.
- `sh`, `curl` or `wget`, and `sha256sum`. A plain Ubuntu or Debian install has them.
- `sudo`, or a root login.
- A separate machine from your site. The installer refuses to run on the machine that serves your site: a break-in there must not reach your view key.
- No open ports. The wallet host only makes outgoing connections.

**Your shop wallet:**

- **Make a new wallet for this shop.** Don't reuse one that has received payments. A wallet restored from its keys stops looking after 200 unused addresses in a row, so a wallet with history can hand out addresses that were already paid.
- You'll type two things from it: its **primary address** and its **private view key**. Never the spend key or the seed words. Coffer never asks for them.
- Check the wallet's restore height in your wallet app. It must be at or below the current block, or the wallet app shows nothing that arrives.

**A Monero node:**

- Your own node on the wallet host is the most private choice. The installer finds it by itself.
- A remote node works too. The wallet host then checks each payment's block with a second, independent node before it reports confirmations. If no second node answers, payments wait and the payments page says so.
- **Give a node on your own network by its address,** for example `http://192.168.1.20:18081`, not by a name. A node given by name is always treated as someone else's and cross-checked, which shows the second nodes the block heights of your payments.

## Install

### 1. Open the payments page (your site's admin)

In your browser, sign in to your site's admin and open **Monero payments**.

**Check:** the page starts with "Monero payments" and a **Setup** section.

### 2. Get everything else ready first

The pairing code in the next step works once, for 15 minutes. Before you ask for it:

- Open a terminal on the wallet host.
- Open your shop wallet in your wallet app, at the screen that shows its primary address and private view key.

### 3. Get your install command (your site's admin)

Press **Connect wallet host**.

**Check:** a box says **Pairing code ready**, and below it is a command of four lines that starts with `if command -v curl`.

Copy all four lines.

### 4. Run the command (the wallet host)

On the **wallet host**, not your site's server, paste the four lines together and press Enter.

The command downloads the wallet host program from `get.coffer.party`, checks it against this release's checksum, and starts the installer. `sudo` may ask for your password.

### 5. Answer the questions (the wallet host)

1. **Primary address of the shop wallet.**
2. **Private view key of the shop wallet.** Nothing shows while you type or paste. That's expected.
3. **A Monero node address,** only if no node runs on the wallet host.

The installer then downloads Monero's own wallet program, checks it against the Monero project's signed list, makes a view-only copy of your wallet, sets up a background service and pairs with your site.

**Check:** it ends with "Done. The wallet host is installed and paired".

To stop before anything is installed, press Ctrl-C at a question. The installer says nothing was changed.

### 6. Finish on the payments page (your site's admin)

Reload the payments page. The Setup checklist turns green item by item, then asks for a test tip to your own wallet. Follow it to the end.

## If your site is behind a proxy

Read this if a proxy, tunnel or CDN ends https in front of your site and passes plain http to it.

- **EmDash must know your site's public address,** the way EmDash's own guide says: https://docs.emdashcms.com/reference/configuration/#reverse-proxy-setup. The Site URL field in Settings › General alone isn't enough. Without it, the payments page gets the right address but every visitor's tip is refused, and the tip page tells them the site can't take tips yet.
- **Before you change it, make sure you can still sign in afterward.** A passkey only works at the address where it was made. If you're the only admin and have no email sign-in set up, changing the address can lock you out.
- **Let Coffer's routes through.** If your site sits behind a login or access rules, allow `/_emdash/api/plugins/coffer/*` without one, and don't add an `Origin` or `Authorization` header to those requests.

## Limits to set at your proxy or host

Coffer can't see your visitors' addresses on most Node hosts, so these limits belong in front of the site.

- **Rate-limit tip creation.** Coffer allows 40 open tips at a time. Without a limit, one sender can fill them and block new tips for up to 30 minutes. They can't take money or mark anything paid. Add a rate-limit rule for `POST /pay/coffer/tip` (your tip endpoint) and `POST /_emdash/api/plugins/coffer/checkout`.
- **Limit slow connections.** A request body sent very slowly can hold a connection open. Set a body timeout at the proxy.
- **One busy plugin can hold up the others.** On a Node-hosted site, a plugin request that uses the CPU without pause can delay every other plugin request for up to 30 seconds. Coffer's own requests finish well inside that. It matters if another plugin on your site misbehaves.

## Doing it by hand (optional)

The install command does three things you can do yourself: download the program, check it, and run its installer. The release address is `https://get.coffer.party/<version>/`, for example `https://get.coffer.party/1.0.0/`: the folder that step 3's command, `https://get.coffer.party/install.sh`, downloads from.

1. **Download** `xmr-bridge-<version>-linux-amd64` (or `-arm64`), `SHA256SUMS`, `release.json` and `release.json.sig` from the release address, into one folder on the wallet host.

2. **Check the download against the checksum list:**

   ```sh
   sha256sum --check --ignore-missing SHA256SUMS
   ```

   **Check:** it prints the file's name and `OK`.

3. **Check the release's signature (optional).** The install command checks the checksum only, so it trusts the place it downloaded from. The signature ties `release.json`, and the checksums inside it, to Coffer's release key. The public key is `coffer-release.pub.pem` at the release address. Download it into the same folder, and compare its fingerprint with the one on Coffer's release page on GitHub: a key from the same place as the download proves nothing by itself. Then run these one at a time:

   ```sh
   { printf 'xmr-bridge-release-v1\n'; cat release.json; } > release.message
   ```

   ```sh
   base64 -d release.json.sig > release.sig
   ```

   ```sh
   openssl pkeyutl -verify -pubin -inkey coffer-release.pub.pem -rawin -in release.message -sigfile release.sig
   ```

   **Check:** the last one prints `Signature Verified Successfully`. Then open `release.json` and compare the `sha256` for your file with the one `sha256sum` printed.

4. **Run the installer.** Make the program runnable:

   ```sh
   chmod 755 xmr-bridge-*-linux-*
   ```

   Then type the line below and, before pressing Enter, add the end of step 3's command to it: everything from `--site` to the end of its last line.

   ```sh
   sudo ./xmr-bridge-*-linux-* install
   ```

   **Check:** the installer asks for your shop wallet's primary address, as in step 5.

After the first install, the wallet host checks every update's signature itself before installing it, waits 48 hours after a release, and never installs an older version.

## Looking after it

There is nothing to do regularly. Two commands tell you what's going on, both on the wallet host.

What the wallet host is doing:

```sh
sudo xmr-bridge status --config /etc/xmr-bridge/config
```

The installer's own record (your answers are never written there):

```sh
sudo cat /var/lib/xmr-bridge/log/install.log
```

## If something goes wrong

- **The pairing code ran out or was refused.** Press **Connect wallet host** again and run the new command. The old code no longer works.
- **A red line on the payments page** names its fix. Do what it says.
- **You ran the command on the wrong machine.** If it was your site's server, the installer refused and changed nothing. Run it on the wallet host.
- **You want to move or rebuild the wallet host.** Press **Connect wallet host** on the payments page and install on the new machine. The old one stops syncing.
- **You want to remove it.** On the wallet host:

  ```sh
  sudo xmr-bridge uninstall
  ```

  Add `--delete-data` to also delete the view-only wallet, the wallet host's key and its settings. Your shop wallet and its funds are never on the wallet host.

## What Coffer can and can't do with your money

- The site holds no keys. The wallet host holds a view key, which can see payments and can't spend.
- The spend key stays in your wallet app. No break-in on the site or the wallet host can move your funds.
- A break-in on the wallet host could read your shop wallet's incoming payments and could tell the site that tips arrived when they didn't. That's why the shop wallet is one you made for this shop.

The full security report, with the test behind each claim, is linked from the listing's Security section.
