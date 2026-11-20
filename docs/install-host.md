# The install host: get.coffer.party

Wallet hosts get `install.sh` and the bridge from `https://get.coffer.party`, a Cloudflare Pages site that Wyatt uploads by hand from his PC (spec change 58, decided 2026-11-20). The apex `coffer.party` is kept for a future landing page; releases never use it. No deploy credential is on the dev box. The plugin itself is on the EmDash registry, not here.

## What is served

```text
get.coffer.party/
  404.html                 top level, so a missing file is a 404, never Pages' single-page-app fallback
  install.sh               fixed; the newest release's script (it downloads from https://get.coffer.party/<version>)
  coffer-release.pub.pem   the release public key, fixed
  versions.json            each version's files and their SHA-256
  latest/                  fixed; what installed bridges poll for updates: plain copies of the newest version's files
    release.json  release.json.sig  xmr-bridge-<version>-linux-amd64  xmr-bridge-<version>-linux-arm64
  <version>/               for example 1.0.0/: written once, never changed or removed
    install.sh  SHA256SUMS  release.json  release.json.sig  coffer-release.pub.pem
    xmr-bridge-<version>-linux-amd64  xmr-bridge-<version>-linux-arm64
```

- **Paths the code depends on:**
  - The admin page's command fetches `https://get.coffer.party/install.sh`.
  - `install.sh` fetches the binary from its own version folder.
  - The bridge checks `https://get.coffer.party/latest/` for updates.
- **Never add** `_redirects`, `_headers`, `_worker.js`, `_routes.json` or a `functions/` folder. The wget path in `install.sh` follows no redirect at all (spec change 21).
- **Versions are plain `x.y.z`.** The bridge ignores a `-suffix` when it compares versions, so a bridge on `1.0.0-rc1` would never update to `1.0.0`.
- **Only `get.coffer.party` goes in docs and code.** The project's `*.pages.dev` address serves the same files, but it isn't the install URL. The check below warns about any repo file that mentions one.
- **The key file here adds no trust.** Whoever controls this host controls the binaries too. The install guide tells admins to compare the key's fingerprint with the GitHub release page.

### `versions.json`

```json
{
  "format": 1,
  "versions": {
    "1.0.0": {
      "1.0.0/install.sh": "<sha256>",
      "1.0.0/SHA256SUMS": "<sha256>",
      "1.0.0/release.json": "<sha256>",
      "1.0.0/release.json.sig": "<sha256>",
      "1.0.0/coffer-release.pub.pem": "<sha256>",
      "1.0.0/xmr-bridge-1.0.0-linux-amd64": "<sha256>",
      "1.0.0/xmr-bridge-1.0.0-linux-arm64": "<sha256>"
    }
  }
}
```

Every file in a version folder is listed. A version's entry is added once, when that version is first uploaded, and never edited.

## The upload folder: back it up

**Every Pages upload replaces the whole site.** A file missing from an upload is no longer served. Your upload folder is therefore the only complete copy of every published version.

- Keep one upload folder and let it grow. Upload all of it every time.
- **Back it up** after every change, on a second disk or an encrypted USB stick, not only on the PC. If the folder is lost, the next release can't be uploaded without dropping the old versions.
- Pages keeps earlier deployments, and its dashboard can roll back to one. That isn't a backup: old deployments are deleted after a while.

## A release, step by step

Step 2 of phase 09 will add how the files are built and signed. The upload itself:

1. Add the new `<version>/` folder. Don't touch the existing ones.
2. Replace `latest/` with copies of the new version's `release.json`, `release.json.sig` and both binaries, and nothing else.
3. Replace the top-level `install.sh` with the new version's copy.
4. Add the version's entry to `versions.json`.
5. Back up the folder.
6. Upload the whole folder in the Pages dashboard: drag and drop, which takes at most 1,000 files and 25 MiB a file.
7. Copy the same folder to the dev box, then have Claude run the check below.

## The check

From the dev box, with an exact copy of the uploaded folder at `~/xmr-pay-dev-data/install-host-upload/`:

```sh
node scripts/check-install-host.mjs --base https://get.coffer.party --folder ~/xmr-pay-dev-data/install-host-upload
```

It sends only GET requests to the host and writes `~/xmr-pay-dev-data/install-host-check-output.txt`. Each check prints one PASS, FAIL or WARN line, and the script exits 1 on any FAIL. It checks:

- **The folder:**
  - `versions.json` lists every file of every version, and the local copies still match it.
  - `latest/`, `install.sh` and the key are the newest version's files.
  - Each `install.sh` downloads from its own version folder.
  - There are no rule files, there is a top-level `404.html`, and there are no suffixed versions.
- **The host:**
  - Every file, and every file `versions.json` lists for any version, is served with HTTP 200 and no redirect. Its bytes must match `versions.json`, or the folder for files it doesn't list.
  - A missing file gets a 404 with `404.html`.
  - `install.sh` and the newest binaries also download with `wget --max-redirect=0` and with `curl --max-redirs 0`.
- **The repo:** a WARN for any tracked file that mentions a `*.pages.dev` address.

Tests: `node --test scripts/check-install-host.test.mjs`, against a local server that plays the host.
