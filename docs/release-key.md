# The release signing key

Coffer's bridge updates itself only from a `release.json` signed with the release key. This page says how Wyatt makes that key on an offline machine, backs it up, signs a release with it, and what happens if it's lost or stolen. **The private key never touches the dev box, CI or any machine with a network.** Only the public half comes back.

Status: keys 1 and 2 were made offline by Wyatt on 2026-11-23. Their public halves are `installer/coffer-release.pub.pem` (key 1, fingerprint `531183cd4dea6af723656e2196aa6826a7d2c3dc0d9877bfb92b7887e16c3192`) and `installer/coffer-release-next.pub.pem` (key 2, fingerprint `392a98064028199f53223cb8c7fe22d318ea3182661c316279778778239c27fa`), both pinned in release builds. Wyatt checked both fingerprints against his paper copies. This page was first written on 2026-11-20 and matches the code at `56168ff`, except for the pins:

- the bridge's verifier: `bridge/internal/selfupdate/core.go`, `VerifyManifest`;
- the pins: `bridge/cmd/xmr-bridge/release_release.go`, `releaseKeys()`;
- the dev signing scripts: `scripts/sign-dev-release.sh` and `scripts/check-dev-signature.sh`.

The commands were tested on the dev box (OpenSSL 3.5.7, Debian 13) with the published RFC 8032 test key 1, never a real key. The test covered restore from hex, encryption, the public half, the fingerprint, signing, a check with OpenSSL, and a check with the bridge's own `VerifyManifest`. They haven't been run on Debian Live itself: the first check in step 1 below covers that.

## 1. The key, and how to make it

**Format.** An Ed25519 key pair. The bridge pins the **raw 32-byte public key**: base64 in the build, one entry in `releaseKeys()`. OpenSSL uses the same key in standard files:

| File | What it is | Where it lives |
| --- | --- | --- |
| `coffer-release-1.key.pem` | The private key: PKCS#8, encrypted with a passphrase (PBKDF2-HMAC-SHA256, 2,000,000 rounds, AES-256) | Only on the offline machine's backups |
| `coffer-release.pub.pem` | The public key: an ordinary `BEGIN PUBLIC KEY` PEM file | Comes back to the dev box; published |

The signature is Ed25519 over the prefix `xmr-bridge-release-v1` and a newline (22 bytes), followed by `release.json`'s exact bytes. It is stored base64-encoded on one line in `release.json.sig`. The bridge accepts a release signed by **any** key in its pinned list, and the list can hold more than one (`docs/decisions.md`, 2026-10-04: "current and next").

**A second key, now (recommended; Wyatt to decide).** The decision of 2026-10-04 allows two pinned keys. If 1.0.0 pins both, a lost or stolen key 1 can be replaced through a normal update (section 5). If it pins one, losing that key ends automatic updates for every installed bridge. So make `coffer-release-2.key.pem` and `coffer-release-next.pub.pem` the same way, in the same session. Back key 2 up on its own media, and never use it unless key 1 is gone. The steps below say "key 1". For key 2, repeat them with `2` and `-next` in the names.

**The machine.** Use a Debian Live USB (Debian 12 or 13, any desktop), booted with no persistence.
- Unplug the network cable and turn Wi-Fi off before you boot (or in the firmware). Leave them off for the whole session.
- Everything you create lives in RAM until you copy it to a stick, and it is gone at shutdown.
- Use a terminal running `bash`, which is Debian Live's default.

**First, check the tools:**

```sh
openssl version
```

**Check:** it prints `OpenSSL 3.0` or later (Debian 12 has 3.0, Debian 13 has 3.5). OpenSSL is all you need for the key. The other commands used here (`sha256sum`, `base64`, `od`, `tail`, `tr`) are coreutils. If `openssl` is missing, stop: don't connect that machine to fetch it. Tell Claude, and we'll bring a verified `.deb` on a stick.

**Make key 1.** It's created already encrypted; the private key is never written to a file in the clear. Run in your home folder (RAM):

```sh
cd ~ && umask 077
```

```sh
openssl genpkey -algorithm ed25519 | openssl pkcs8 -topk8 -v2 aes-256-cbc -v2prf hmacWithSHA256 -iter 2000000 -out coffer-release-1.key.pem
```

It asks for the passphrase twice. Use one of seven or more random words (diceware). Anyone who gets a copy of the file can try passphrases offline, so its strength is the file's only protection.

**Check:**

```sh
head -1 coffer-release-1.key.pem
```

prints `-----BEGIN ENCRYPTED PRIVATE KEY-----`.

**The public half and its fingerprint:**

```sh
openssl pkey -in coffer-release-1.key.pem -pubout -out coffer-release.pub.pem
```

```sh
openssl pkey -pubin -in coffer-release.pub.pem -outform DER | sha256sum
```

The second command prints the **fingerprint**: 64 hex characters (then a ` -`). Write it on paper now. It's the reference for everything after this: the backups, the dev box, the GitHub release page and admins' checks all compare against it.

## 2. Backups

You make three copies of key 1. Keep them in different places.

**Two USB copies.** Use two new sticks, labelled "Coffer release key 1, copy A" and "copy B". The file is already encrypted, so a plain filesystem is enough. (If `cryptsetup` is on the live system you can add LUKS, but it isn't needed.) For each stick:

```sh
cp coffer-release-1.key.pem coffer-release.pub.pem /media/user/<stick>/ && sync
```

Then unmount the stick, plug it in again, and test that copy (below).

**A paper copy.** These are the 32 private bytes in hex, **in the clear**. Anyone who reads them has the key, so keep the paper sealed and away from the sticks and from the passphrase.

```sh
openssl pkey -in coffer-release-1.key.pem -outform DER | tail -c 32 | od -An -v -tx1 | tr -d ' \n' | sed 's/..../& /g'; echo
```

It asks for the passphrase and prints 16 groups of 4 hex characters. Copy them by hand. Under them, write "key 1" and the first 16 characters of the fingerprint, so a restore can be checked.

**Test a backup** (a stick, now and before each release). On the offline machine:

```sh
openssl pkey -in /media/user/<stick>/coffer-release-1.key.pem -pubout | openssl pkey -pubin -outform DER | sha256sum
```

**Check:** it asks for the passphrase and prints the fingerprint on your paper. A wrong passphrase prints `Could not find private key`.

**Restore from paper** (offline machine). Type the 16 groups between the quotes, spaces included:

```sh
paper='xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx'
```

```sh
hex=$(printf '%s' "$paper" | tr -d ' '); echo ${#hex}
```

**Check:** it prints `64`. Then rebuild the encrypted file. The hex is wrapped in Ed25519's standard PKCS#8 prefix and goes straight into encryption through a pipe:

```sh
printf '%b' "$(printf '302e020100300506032b657004220420%s' "$hex" | sed 's/../\\x&/g')" | openssl pkey -inform DER | openssl pkcs8 -topk8 -v2 aes-256-cbc -v2prf hmacWithSHA256 -iter 2000000 -out coffer-release-1.key.pem
```

Then test it as above. **Check:** the fingerprint matches the paper. Test the paper copy once, right after writing it. A typo found then costs nothing; found years later, it costs the key.

## 3. What comes back to the dev box

**Only `coffer-release.pub.pem`** (and `coffer-release-next.pub.pem` if you made key 2), plus the fingerprints on paper.
- Copy them to a separate, empty transfer stick that never holds a private key.
- From your PC, send them to the dev box the usual way:

  ```sh
  scp coffer-release*.pub.pem <your SSH shortcut to the dev box>:xmr-pay-dev-data/release-key/
  ```

**On the dev box (Claude, step 2):**

1. Check that each file is a public key and nothing more. `openssl pkey -pubin -in <file> -noout` succeeds, and a private-key check on the file fails.
2. Compute each fingerprint the same way, and show it for you to compare with your paper:

   ```sh
   openssl pkey -pubin -in coffer-release.pub.pem -outform DER | sha256sum
   ```

3. Take the raw key for the pin:

   ```sh
   openssl pkey -pubin -in coffer-release.pub.pem -outform DER | tail -c 32 | base64
   ```

4. Pin it (and key 2's) in `release_release.go`, test first. `TestReleaseKeysPinned` checks that the release build pins exactly the committed keys, in order, and that each committed file has the fingerprint Wyatt confirmed. `TestReleaseBuildHasNoDevValues` keeps the dev key out, and checks that the linked release binary holds both pins. Done 2026-11-23.
5. Commit the public files: `installer/coffer-release.pub.pem` and `installer/coffer-release-next.pub.pem` (done 2026-11-23). The install host's upload copies key 1's file to `coffer-release.pub.pem` and `<version>/coffer-release.pub.pem` (`docs/install-host.md`). Key 2's public file is committed too, but not uploaded until it's in use.

**The fingerprint admins compare** is this same `openssl pkey -pubin -in coffer-release.pub.pem -outform DER | sha256sum`. That is the SHA-256 of the public key's standard DER form, not of the PEM file's text, so line endings can't change it. In step 2:
- `docs/install.md`'s "Doing it by hand" gets that command;
- the GitHub release page shows the 64 characters;
- the admin compares the two.

## 4. Signing a release (step 2)

**On the dev box, before you go offline (Claude, then Wyatt):**

1. CI builds the release from a clean checkout. Claude downloads its two binaries. The decision of 2026-10-31 has Wyatt rebuild on the dev box with the same Go and flags and confirm the hashes match.
2. Claude writes `release.json` (product, version, date, and each binary's name, OS, CPU, size and SHA-256) and shows it with its own SHA-256.
3. Bridges wait 48 hours after the `date` inside `release.json`, so sign soon after it's written.

**Carry in** (on the transfer stick):

- `release.json`;
- on paper, the SHA-256 of `release.json` that the dev box printed;
- the commands below, on paper or typed from this page.

**On the offline machine,** with copy A plugged in:

```sh
sha256sum release.json
```

**Check:** it matches the paper. Then read it: `cat release.json` shows `"product":"xmr-bridge"`, the version you expect, and two files.

```sh
{ printf 'xmr-bridge-release-v1\n'; cat release.json; } > release.message
```

```sh
openssl pkeyutl -sign -rawin -inkey /media/user/<stick>/coffer-release-1.key.pem -in release.message -out release.sig
```

It asks for the passphrase. Signing takes about a second on the dev box; most of that is the 2,000,000 rounds.

```sh
base64 -w0 release.sig > release.json.sig && echo >> release.json.sig
```

Check it on the spot with the public key:

```sh
openssl pkeyutl -verify -pubin -inkey coffer-release.pub.pem -rawin -in release.message -sigfile release.sig
```

**Check:** `Signature Verified Successfully`.

**Carry out:** only `release.json.sig`. The key stick goes back in its place; it never goes into a networked machine.

**On the dev box (Claude):** `release.json.sig` goes next to `release.json` in the release folder. Two checks must both pass before anything is uploaded:
1. The OpenSSL check above, with the committed public key (`installer/coffer-release.pub.pem`).
2. The bridge's own verifier: a test runs `VerifyManifest` with the build's pinned `releaseKeys()` on these exact files. (Done today with the RFC 8032 key: it accepts the signature, and refuses the file with one bit changed.)

## 5. If the key is lost or stolen

A bridge accepts a release signed by any key it pins, and the release it installs brings its own list of pinned keys. **So keys can change only through a signed update.** A key removed from the new list stops working on every bridge that takes that update.

**Key 1 lost (all three copies), key 2 safe** (only if 1.0.0 pins both):
- Sign the next release with key 2.
- That release's binary pins key 2 plus a new key 3, made offline the same way as the new "next".
- Installed bridges accept it, because key 2 is pinned. No admin needs to do anything.

**Every pinned key lost: installed bridges can never update automatically again.** Nothing can reach them. Each admin has to update by hand: `sudo xmr-bridge uninstall` (keeping data), the new install command, and pairing again. That only reaches admins who read the notice on the listing or the GitHub page. This is the main reason to pin two keys from the first release.

**Key 1 stolen** (someone has a copy and can guess the passphrase, or has the paper):
- **To use it, the thief also needs bridges to download their release.** That means control of `get.coffer.party` (your Cloudflare account, DNS) or a way past the bridge's TLS check (T27). The key alone does nothing.
- **With both, they can push their own bridge program to every installed bridge at its next daily check.** The 48-hour delay doesn't stop them: it counts from the `date` inside `release.json`, which the thief writes, so a backdated release installs at once. **This is a gap.** The delay protects against your own mistakes, not against a thief. A proposal for spec-changes: count it from when a bridge first sees the release, as the wallet-rpc update already does.
- **What a malicious bridge can do:** it runs as the wallet host's service user with the view-only wallet.
  - It can read the view key and the shop's payment history (a privacy loss).
  - It can push its own addresses into the site's pool (the RT-08 kind), so new tips go to the thief.
  - It can't spend: the spend key is never on the wallet host.
- **The response:**
  1. Take the host back first.
  2. Sign a release with key 2, at a version higher than anything the thief published. Its binary pins key 2 and a new key 3, and drops key 1.
  3. Publish it, and tell admins on the listing and GitHub.
- **What can't be recovered:**
  - Wallet hosts that already ran the thief's release are the thief's. A later update can't be trusted to clean them. Their admins must reinstall from scratch: `uninstall --delete-data`, a fresh install, pairing again.
  - Those admins should treat the view key as exposed. Anyone with it keeps seeing that wallet's incoming payments, and only a new wallet ends that.
  - Payments already sent to the thief's addresses are gone.

**What this key doesn't cover:**
- A first install trusts `get.coffer.party` and its TLS, since `install.sh` checks SHA-256 values that came from the same host (spec change 57, a design limit). The by-hand path in `docs/install.md` checks the signature with this key's fingerprint.
- Monero's own wallet-rpc releases are checked against Monero's GPG key, not this one.

## Not covered yet

- Wyatt ran section 1's commands on Debian Live on 2026-11-23 to make keys 1 and 2; the OpenSSL version used there isn't recorded here. The dev box's own tests used 3.5.7.
- No release has been signed with either key yet. The first, 1.0.0, gets both checks in section 4 on its real files.
- The CI release build, `release.json` and the GitHub release page are still step 2's work.
