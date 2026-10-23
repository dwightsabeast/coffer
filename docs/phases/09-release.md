# Phase 09 — Release (release 1, tips; 09b, release 2, orders)

**Two releases (spec change 22).** This file first covers release 1, tips only, which comes after phases 05–07 and 07b. Phase 08's store adapter is not in it. The "Release 2 (09b)" section at the end covers the orders release, after phases 08 and 08b.

**Goal:** ship release 1, tips only: a reviewed, signed release of the bridge, the install script on its own host, the plugin in the EmDash registry, the theme package on npm, and a small mainnet tips trial on Wyatt's own site.
**Spec sections:** Build plan step 9, Bridge service (updates, install command), Security model, Open questions 10, 15, 16.
**Done when:** the security review gate passes; a fresh install from the registry, using the published install command, settles a stagenet test tip in under 15 minutes; Wyatt has run a mainnet tips-only trial on his own site.

This phase mixes Claude's work with steps only Wyatt can do. Claude never holds the signing key, never logs in to accounts, and never publishes without Wyatt approving each step.

## For Wyatt

**Before the session** (from the plan change's waiting list):

- [ ] Phase 07b is done: no Critical or High finding open, every Medium fixed or accepted in `docs/decisions.md`.
- [ ] The mainnet second-node list for the cross-check (spec change 13).
- [ ] The self-update admin-copy question.
- [ ] An install host that serves the bridge files without redirects (spec change 21).
- [x] The Atmosphere account to publish under (below; done 2026-10-23).
- [x] Your hand-made registry icon (Claude doesn't generate or draw one): `plugin/images/coffer-icon.png`, delivered 2026-10-23.
- [ ] Session 7g (EmDash 1.3 check) is done: `release.requires` and the listing text are in the manifest, and they name versions actually tested (spec change 41, items 3, 4, 9).
- [ ] A browser with passkey support, for approving each release (spec change 41 A).
- [ ] The repository is still public: the release service trusts only public GitHub provenance.

**Accounts and keys (in this order)**

1. **Atmosphere account (done 2026-10-23):** `dwightsabeast.tngl.sh`, a Tangled account on Tangled's PDS, DID `did:plc:cmbxrwdt4hdl43g67bd6xegk`. The manifest's `publisher` is the DID, never the handle (a handle can move; the DID is stable), and it's already set. The listing reads `@dwightsabeast.tngl.sh/coffer`. The registry stores the plugin bundle and listing images on this account's PDS (spec change 41 item 2), so there's no separate host for the plugin. Tangled's PDS is accepted for now; the account can move to another PDS later and keep the DID.
   - `emdash-plugin login dwightsabeast.tngl.sh` was run on the dev box from `plugin/` (plugin-cli 0.13.2) on 2026-10-23. The CLI session is saved on the dev box until the required logout in step 4.
   - **Headless login:** the login link's OAuth callback goes to a loopback port on the dev box, so the login fails from a browser on another machine unless you open a tunnel first. Read the port from the printed link's `redirect_uri` (it changes each run), open `ssh -N -L <port>:127.0.0.1:<port> <your SSH shortcut to the dev box>`, then open the link.
   - At releases.emdashcms.com/publisher, **Automated publishing** is enabled (2026-10-23). The grant is create-only.
   - If release setup fails with `MISSING_BLOB_SCOPE` (a login made before blob publishing), log out and back in.
2. **Release signing key, offline.** Claude prepares a short key ceremony checklist for the scheme chosen in phase 03. You generate the key on a machine that is offline (or a live USB), keep the private key on encrypted media with a backup, and give Claude only the public key. The private key never touches the dev box.
3. **Install host:** a subdomain such as `get.wyattdilley.com` served by Cloudflare Pages or GitHub Pages, set up with a DNS record only, so the live site at wyattdilley.com is untouched.
4. **npm org `cofferhq`** (created 2026-10-16) for the theme package `@cofferhq/astro`: set up GitHub Actions trusted publishing (OIDC) for it on npm.
5. **Live site:** before the mainnet trial, snapshot the live site's container. You decide when.

**Start the session:**

```text
Phase 09, release. Read docs/phases/09-release.md and docs/progress.md, then plan the security review first.
```

## For Claude

**1. Security review gate (before anything is published)**

- Start from `docs/redteam-findings.md` and the matrix (`docs/security-matrix.md`) as phase 07b left them, not from scratch.
- Walk the spec's Security model table row by row and point to the code and test that covers each threat. Anything uncovered is a blocker.
- Review: signature and freshness checks, pairing, spam limits, money math, the state machine, admin action validation, buyer-data purge, the pay page's privacy headers, the installer's prompts and file permissions, the systemd hardening, download and update verification, and dependency audits (`pnpm audit`, `govulncheck`, with Wyatt's approval to install it).
- Confirm the manifest's trust contract matches the spec exactly, and the bundle is under its caps. Confirm `release.requires` still names only versions tested (7g, or a later upgrade check).
- Write `docs/security-review.md` with findings and fixes. Wyatt decides whether an outside review is needed before mainnet.
- The published security report covers tips. Threats that only orders face stay in it, each marked "covered in release 2", not dropped.
- The release-1 switch is off in the release build (`checkout` takes tips only), and the theme package exports no PayButton.

**2. Build and sign**

- Reproducible bridge builds for linux amd64 and arm64: `CGO_ENABLED=0`, `-trimpath`, pinned Go version, version stamped from the tag. A script produces the binaries, a checksum file, and the unsigned release manifest.
- Wyatt signs the release manifest offline with the real key and hands back only the signature. Pin the real public key in the bridge (replacing the placeholder), with tests proving that release builds contain neither the placeholder, the dev release key, the `--release-url` dev option, nor the RFC 8032 test keys.
- GitHub Releases hold the binaries, checksums and signatures. Tags and releases are created only after Wyatt approves.

**3. Install host:** (before writing any admin-facing install text, reread `docs/setup-friction.md`) for the bridge and `install.sh` only; the registry hosts the plugin (spec change 41 item 2). The static `install.sh` for this release, verifying the bridge the way phase 03 decided, published to the install host. Replace the placeholder install URL in the plugin with the real one.

- **Open item (spec change 21, 2026-10-12): no redirects on the wget path.** On a machine without curl, `install.sh` downloads the bridge with `wget --max-redirect=0`, because wget can't limit a redirect's protocol the way curl's `--proto` does. The bridge binaries must therefore be served from `RELEASE_BASE` without a redirect. GitHub Releases asset URLs redirect, so either the install host serves the binaries itself, or `RELEASE_BASE` points at an address that answers directly. Test the published install command on a machine with wget and no curl.
- **The install docs list what the wallet host needs:** Linux with systemd, `sh`, curl or wget, `sha256sum`, and `sudo` or a root login.

**4. Registry (spec change 41):** `publisher` is Wyatt's DID (the DID, never the handle); `@emdash-cms/plugin-cli` is pinned exactly; `license`, `author`, the `security` contact URL and `repo` (`https://github.com/dwightsabeast/coffer`) are filled in.

- **Version 1.0.0** (decision C): set `plugin/package.json`'s `version` before the first publish. Registry versions can't be reused or edited, and overwriting one can be treated as a takedown.
- **Listing sections:** `description` (the short text and the long section, from 7g), `installation` (phase 06), `security` and a short `faq` if room allows.
  - **`sections.security`** comes from `./docs/security.md`: a plain-language summary of the security matrix for release 1 (what an attacker could try, what Coffer does, the test that proves it, the result), linking the full matrix or published report on GitHub. Written after step 1's gate, from its results. At most 2,000 graphemes and 20,000 bytes, like installation.
- **`keywords`** (up to five): for example `monero`, `xmr`, `payments`, `tips`, `privacy`.
- **Publishing through automated releases** (decision A), never `emdash-plugin publish` from the dev box:
  - Wyatt's login is done (Accounts step 1). `emdash-plugin release setup` creates the package profile from the manifest as it stands, so it waits until 7g has bumped plugin-cli to 0.13.4 and added `release.requires`, and until the manifest has version 1.0.0 and the icon under `release.artifacts`. Then Wyatt runs `pnpm exec emdash-plugin release setup` from `plugin/`. The dashboard shows the same `pnpm exec` form; `npx --no-install`, as used for the login, runs the same pinned CLI.
  - Settings: confirmation **For every release** (a passkey approval per version); provenance **Require provenance**; package tags `coffer@<version>` as the trigger (the repo doesn't use Changesets). Claude shows Wyatt the answers and the generated workflow before anything is committed.
  - **Required: `emdash-plugin logout` on the dev box** once release setup is committed and working. Automated releases don't need the local session, and decision A keeps Atmosphere credentials off the dev box.
  - First tagged run: Wyatt approves the repo connection under "Check for workflow requests", then the release with his passkey.
  - The generated `.github/workflows/emdash-release.yml` is reviewed before it's committed. Its third-party actions (pinned to full commits) are dependencies for Wyatt to approve; CI otherwise uses only GitHub's own actions (`docs/decisions.md`, CI hardening). Its plugin build uses the committed lockfile and CI's install-script allowlist. The approved actions get a decided row.
  - Every later release goes through the workflow too: required provenance refuses any other path.
  - GitHub Actions builds the bundle from a clean checkout, GitHub attests the exact bytes, and the release service checks the attestation before writing the release under Wyatt's account. No Atmosphere credential lives in the repo or on the dev box.
- **Listing approval** (item 7): a release isn't on plugins.emdashcms.com until the registry's labeler checks approve it. Watch with `emdash-plugin info @dwightsabeast.tngl.sh/coffer --version <version> --watch`. Step 6 waits for it to show publicly, and nothing is announced (r/Monero, Discord, the Otta discussion) before then.

- **Sidebar icon:** add `"icon": "coins"` to the admin page in `admin.pages` (spec change 22). The `icon` field takes a Phosphor icon name in kebab-case. Without one, EmDash shows its generic plug. Leave off the optional `group` (a sidebar folder) unless a payments folder emerges.
- **Listing images** go under `release.artifacts` in `emdash-plugin.jsonc`: `icon`, an optional `banner`, and up to eight `screenshots`. PNG, JPEG or WebP, 1 MiB at most each. The icon is Wyatt's hand-made pixel-art chest, `plugin/images/coffer-icon.png` (256×256 PNG, 855 bytes, transparent background), declared as `release.artifacts.icon`. It was chosen for now and may be replaced later.
- `bundle` packs a root-level `icon.png` and anything in `screenshots/` into the tarball, where they count toward the 128 KB per-file and 256 KB total caps. Keep declared listing images in another folder, such as `images/`. Check the bundle's headroom before deciding whether to also pack a small `icon.png` (256×256 is the recommended size).
- References: https://docs.emdashcms.com/plugins/creating-plugins/manifest/ and https://docs.emdashcms.com/plugins/creating-plugins/publishing/

**5. Theme package:** publish `@cofferhq/astro` from GitHub Actions with npm trusted publishing (OIDC, with provenance), never a stored npm token: npm restricts publishing with tokens that bypass 2FA from January 2027. The first publish of a scoped package needs `npm publish --access public`. The EmDash registry listing stays `@<atmosphere-handle>/coffer`; the npm scope covers only the theme kit (`docs/decisions.md`, 2026-10-16).

**6. Registry setup test:** once the listing shows publicly (step 4), repeat phase 05's timed run from the real registry click with the published install command, on stagenet. Announce only after it passes.

**7. Mainnet tips trial (Wyatt decides when):** on wyattdilley.com, after the container snapshot: install from the registry, tips only, a dedicated mainnet shop wallet, Standard or Strict speed, small amounts. Claude prepares a checklist and a rollback plan (uninstall the plugin; the bridge's `uninstall`), and touches nothing on the live site itself.

**Stop points:** every publish, tag, release, login and DNS step; the mainnet trial.

## Release 2 (09b): orders

After phases 08 and 08b. Same gates as release 1, with these differences:

- **Security review:** start from pass 2's findings and the matrix as phase 08b left them. Regenerate the published report to cover orders: every "covered in release 2" row gets its evidence.
- **Version:** registry versions are immutable. Release 1 is 1.0.0 (spec change 41 C). With the trust contract unchanged, release 2 is a minor version, 1.x (new features, no new routes). If phase 08 changed the trust contract (a new index, capability, host or route), it's 2.0.0 (EmDash's rule: major for a broadened contract) and the admin consents again; say so in the release notes. A new public route, or a private route made public, also asks for consent again.
- **Publishing:** through the same automated release workflow, with a passkey approval (spec change 41 A).
- **Build:** the release-1 switch is on, and the theme package exports PayButton.
- **Setup test:** repeat the registry setup test with an order through the store adapter, not only a tip.
- **Mainnet:** whether to run an orders trial on mainnet, and where, is Wyatt's call. Goods don't ship without pass 2 done.

**Start the session:**

```text
Phase 09b, release 2. Read docs/phases/09-release.md ("Release 2") and docs/progress.md, then plan the security review first.
```
