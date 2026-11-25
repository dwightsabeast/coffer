# Coffer security report: release 1 (tips)

> Written on 2026-11-15 from `docs/security-review.md` and `docs/security-matrix.md`. Updated on 2026-11-25 for the 1.0.0 release, with the results of the tests at the release's commit.

| | |
| --- | --- |
| Release | Coffer 1.0.0: tips only. Orders are part of release 2 |
| Commit | `2e3c410aa9280ab346941bf6a909a23f435976fb`, the commit of the 1.0.0 tags |
| CI run | [45501345050](https://github.com/dwightsabeast/coffer/actions/runs/45501345050): passed |
| Test results | The appendix gives the result for each ID. [`docs/security-results-1.0.0.md`](security-results-1.0.0.md) names each test. These results come from a run of that commit on the project's development machine. CI passed the same commit but doesn't keep each test's result |
| Network for the live checks | Monero stagenet (test money). No check ran on mainnet |
| Review | By the project itself, in two steps: an attack phase and a line-by-line review. No outside review yet |

This report is for the person who runs a site with Coffer. For each threat, it tells you:

- what an attacker could try
- what would happen to your money
- what you would see on the **Monero payments** page
- how we tested it

The report also tells you what we didn't test, and which limits we decided to accept.

## In short

- **Nothing in Coffer can spend your Monero.** The spend key never leaves your wallet app. Your site holds no wallet key. The wallet host holds a view key, which can see incoming payments and nothing else.
- **A tip counts only after the Monero network confirms it.** Also, your own wallet host must report it with its signing key.
- **We filed 42 findings** during the attacks and the code review. No finding was Critical. Three were High. We fixed two of them. The third is an accepted limit, in full under "Limits we accepted". We fixed or accepted every Medium.
- **Two limits matter most:**
  - A thief can steal the wallet host's signing key and also stop the wallet host. Then the thief can send new tips to the thief's own wallet until you notice.
  - On a Node-hosted site, one stuck plugin request can delay the other plugin requests for up to 30 seconds.

## The parts

| Part | Where it runs | What it holds |
| --- | --- | --- |
| The plugin | Your EmDash site, in EmDash's sandbox | Tips, payment addresses and the wallet host's public key. No wallet key |
| The wallet host | A separate Linux machine | The view key of your shop wallet, and its own signing key |
| Your wallet app | Your own computer | The spend key. Coffer never sees it |

## What an attacker could try

Each entry gives the claim's ID in the test matrix (`docs/security-matrix.md`). Use the ID to find the claim's tests. The appendix gives the results for each ID.

### A bad update to the plugin (T01)

- **What could happen:** someone publishes a changed copy of Coffer.
- **Your money:** safe. The plugin has no wallet key. It can do two things only: read the content of your site, and get a price from two named price services. EmDash's sandbox enforces that list.
- **What you'd see:** before an update that asks for more permissions, EmDash asks you again.
- **Tested:** on every change, a test compares the permission list with the design. By hand on a real site, a test plugin tried 15 forbidden actions. EmDash refused each one.
- **Limit:** see T01 under "Partly tested".

### A leak of your site's database (T02)

- **What could happen:** someone reads the database of the site.
- **Your money:** safe. The database holds no wallet key and no pairing code. It holds only a hash of the code.
- **What they'd learn:** your tips, their notes and the payment addresses. Coffer deletes a note 30 days after its tip is final.
- **Tested:** after real test payments, a scanner searched a real test database, its side files and the logs. It found no view key, no pairing code and no IP address.
- **Limit:** the pay link of a tip works for as long as Coffer stores the tip. The link shows only the status of that one tip.

### A forged payment report (T03, T31)

- **What could happen:** someone sends your site a false "tip received" report.
- **Your money:** nobody can take money. Without the wallet host's signing key, Coffer refuses every report before it reads the report.
- **What you'd see:** no change.
- **Tested:** forged, changed, old and badly encoded reports change nothing.
- **Limit:** for a stolen signing key, see "If a thief steals the wallet host's signing key" below.

### An old report sent again (T04)

- **Your money:** safe. Coffer refuses a report older than 5 minutes. An older report never replaces a newer one.
- **Limit:** an attacker who captures a report can send it again for 5 minutes. This makes the wallet host seem active for a little longer. It can't change a tip.

### Spam tips (T05, T18)

- **What could happen:** someone starts many tips and pays none.
- **Your money:** safe.
- **What you'd see:** at most 40 open tips at one time. When the site knows the IP address of a visitor, Coffer holds each visitor to a small number of open tips.
- **Limit:** see "Spam can block new tips".

### A wrong price (T06)

- **Your money:** the tipper chooses the amount, so a wrong price can't take anything from you. Prices come from two fixed services. Coffer never uses a price that is too old.

### A tip that counts too early (T07, T11, T12)

- **What could happen:** a payment that the network reverses later, or a locked payment that can't be spent yet.
- **Your money:** a tip never counts at zero confirmations. Time-locked payments and double-spent payments never count.
- **What you'd see:** if the network reverses a counted tip, the tip returns to the waiting state, or goes to review.
- **Tested:** we replayed each case against the plugin.
- **Not seen live:** on the test network, we can't make a real chain reversal on demand.

### Hostile text in a tip's note (T08)

- **Your money:** safe.
- **What you'd see:** the note as plain text. Scripts, images and links in a note don't run or load.
- **Tested:** an automated test checks how Coffer cleans the note. We also checked the Monero payments page by eye.

### A leaked pay link (T09)

- **What they'd learn:** the status and the address of that one tip.
- **Protection:** pay pages are not cached and not indexed. They send no referrer and load nothing from other sites.

### Access to the wallet host (T10)

- **Your money:** safe. The wallet host holds no spend key.
- **Protection:** the wallet host opens no port. Its wallet program listens only inside the machine. A login in a private file protects the wallet program.
- **Limit:** the wallet host talks to your site over https only. It talks to a Monero node at the address that you give. That address may use plain http.

### A stolen or guessed pairing code (T13)

- **Your money:** safe.
- **Protection:** the code works one time, for 15 minutes. It is too long to guess. If two machines use the same code at the same time, one succeeds and Coffer refuses the other.

### A dishonest Monero node (T14)

- **What could happen:** a remote node reports payments that aren't on the real chain.
- **Your money:** before a payment counts, the wallet host checks its block with a second, independent node.
- **What you'd see:** if no second node answers, tips wait, and Health says so.
- **Limits:**
  - The list of second nodes is short.
  - On the test network, the second nodes use plain http. Use the test network only for tests, never for real tips.
  - Give a node on your own network by its address, not by a name. Only then does Coffer treat the node as yours.

### A full break-in on your site's server (T15)

- **Your money:** safe. The view key isn't on that machine. The installer refuses to put the wallet host there.
- **What they could do:** read tips and notes, and change what your site shows.

### Tampered downloads (T16, T26, T27, T28, T32, T37)

- **Monero's wallet program:** before the program runs, the wallet host checks it against the signed list of the Monero project.
- **Updates to the wallet host:** the wallet host checks each update against Coffer's release key. It waits 48 hours, and it never returns to an older version.
- **The first install** checks a checksum, not a signature. See "The first install trusts the download site".
- **A changed download site** can't send code to wallet hosts that are already installed, because they take only signed updates. We check each upload to the download site against the record of what we published.
- **The release itself (T37):** GitHub's build service builds each release of the wallet host from the tagged code, and it signs a record of the build. Before we sign a release, a second build on another machine must give the same bytes. For 1.0.0, both builds gave the same bytes for each program.
- **Coffer's own code** contains no third-party runtime packages. On every change, a scan looks for known vulnerabilities in the Go code of the wallet host. The scan also looks for any runtime package in the plugin or the theme.

## Privacy

| Claim | Result |
| --- | --- |
| The site never holds the view key (P01) | Holds. No code takes a view key, and the scanner found none |
| Each tip gets its own address (P02) | Holds, also when many tips start at one time |
| Coffer stores no IP address of a visitor (P03) | Holds as worded. Coffer keeps a salted hash for rate limits. Coffer doesn't delete the last hashes on a timer. With a leaked hash and its salt, an attacker could test every IPv4 address to find the one behind the hash |
| Coffer deletes notes 30 days after a tip is final (P04) | Holds |
| What remote nodes learn (P05) | Partly tested. See "Partly tested" below |

## Limits we accepted

These are decisions, not mistakes. The owner ruled on each one and recorded it in `docs/decisions.md`.

### If a thief steals the wallet host's signing key (RT-08, was High)

> The signing key can't spend from your wallet. If the thief took the key from the wallet host machine, the thief can also see the payments that your wallet receives. The reason is that the view key is on that machine too. The thief still can't spend those payments.
>
> While your wallet host runs, Coffer checks each new payment address against your wallet before it gives the address to a tipper. Coffer refuses an address that isn't yours. A red banner then tells you to connect a new wallet host.
>
> The thief can also stop your wallet host. This is likely when the thief took the key from that machine. Then new tips can go to the thief's wallet, and your Tips page may show forged tips as received. This continues until your wallet host runs again, or until you press **Connect wallet host** again.
>
> Health turns red 5 minutes after your wallet host goes silent. When your wallet host runs again, Coffer flags tips paid to addresses that weren't yours. It does this only for addresses that it added in the last 24 hours. After a longer outage, compare the Tips page with your wallet app.
>
> If your wallet host goes silent and you didn't stop it, connect a new wallet host on a machine that you trust.

### One stuck plugin request delays the others (RT-12, was Medium)

On a Node-hosted site, a plugin request that uses the CPU without a pause can delay every other plugin request. The delay can be up to 30 seconds, when EmDash stops the request. Coffer's own requests finish well inside that time.

This matters if another plugin on your site misbehaves. It also matters if someone finds a way to make any plugin work that hard. No money is at risk. Tips and the Monero payments page wait.

### Spam can block new tips

On most Node hosts, Coffer can't see the IP addresses of visitors. So one sender can fill the 40 open tips and block new tips for up to 30 minutes. The sender can't take money or mark anything paid. The install guide gives the rate-limit rule for your proxy.

### The first install trusts the download site

The install command checks the download against a checksum in the same script. A changed script would pass its own check. So the first install trusts the download site and its https. The install guide shows how to check the signature of the release by hand. After the first install, the wallet host itself checks the signature of each update.

### Known limits for release 1, each pinned by a test

These five low-rated findings are open in release 1. None of them lets anyone take money. Each finding has a test that describes the correct behavior. We mark each of these tests as an expected failure. When we fix a finding, its test passes, and the test suite reports this until we remove the mark. `docs/redteam-findings.md` lists the seven tests under their findings.

- **RT-01: an old product invoice shows product wording.** If the database already holds a product invoice, the Monero payments page shows a product link and order wording for it. Release 1 can't create a product invoice, because checkout takes tips only. So this applies only to a database that held product invoices before. One test.
- **RT-04: tips that start at the same time can get a false "no free address".** When many visitors start a tip at the same time, Coffer can tell some of them that no address is free. This can happen while free addresses remain. The visitors can try again. We saw this in the automated tests, not on a real Node site. One test.
- **RT-06: Coffer accepts a signed report with extra or odd fields.** The site accepts a correctly signed report from the wallet host that has unknown fields, repeated keys or out-of-range numbers. Only a person with the wallet host's signing key can send such a report. Three tests: repeated keys, out-of-range numbers and unknown fields.
- **RT-09: a forged report can repeat a payment address.** With the wallet host's signing key, a report can add a second pool entry for an address that the pool already holds. But two invoices can never share an address. Coffer refuses the second invoice, and checkout uses the next free address. One test.
- **RT-25: Coffer deletes buyer data in a review on the 30-day schedule.** Coffer deletes the buyer data of an invoice in review 30 days after the review starts. This happens even before the admin decides. In release 1, that data is the note of a tip. This matters for orders, so we will fix it before release 2. One test.

### Smaller ones

- **A slow upload can keep a connection open** for more than the 30 seconds. Set a body timeout at your proxy.
- **If the clock of the wallet host is more than 5 minutes wrong,** the site refuses its reports. At this time, the page doesn't say that the clock is the cause.
- **An attacker can send a captured report again for 5 minutes.** This makes the wallet host seem active. It changes no tip.
- **A tip can name any published entry on your site.** The tip then shows the title of that entry. "Published" means public.
- **The first page of tips can show fewer than 10 tips.** The reason is that Coffer hides test tips after it reads the list.
- **An admin who changes a page address by hand** may see a different page of the same tips list (RT-42). This applies to admins only, and nothing changes.
- **Eleven low-rated findings are open.** None of them lets anyone take money. Five are the known limits above: RT-01, RT-04, RT-06, RT-09 and RT-25. The others are:
  - RT-13, the slow upload above
  - RT-18
  - RT-19: the installer checks the pairing code last, so get the code last
  - RT-21
  - RT-16 and RT-17, which we reported to EmDash

  `docs/redteam-findings.md` describes each finding.

## Partly tested

We don't claim that a row in this table is fully proven. Each row says what we tested and what we didn't test.

| ID | Claim | Tested | Not tested, or the limit |
| --- | --- | --- | --- |
| T01 | A bad plugin update can't reach more than its permissions allow | The permission list, on every change | We saw the refusals of EmDash itself (another host, storage that the plugin didn't declare) by hand, not in the automated tests. Signed build records and the owner's approval of each release start with the first release made through that process |
| T02 | A database leak gives no key | The hash of the pairing code, the length of the pay link, and the scan of real test data | We read the code to confirm that pay links come from a secure random source. No test checks it |
| T08 | Hostile text can't run | The tip note | Email fields and refund-address fields don't exist yet. They are part of release 2 |
| T15 | A break-in on the site's server reaches no key | The scan, and the installer's refusal on the site's machine | A test-network switch for developers refuses a real-money wallet only after it asks for the view key (RT-21). Coffer doesn't offer this switch to admins |
| T23 | Coffer adds nothing to your site's own pages | Two tests of the pay page and the tip button | We read the code to confirm that Coffer sets its privacy headers only on its own responses. No test checks it |
| T32 | A person who controls the download site can't control installed wallet hosts | An installed wallet host takes an update only if it has a signature from the key in the wallet host. The update must also be newer than the version that runs now, and match the signed list of files. After every upload, a check compares each published file with the record of what we published. It also confirms that nothing redirects. The check passed on the live site | The check finds a change only when someone runs it. So a change between uploads appears at the next run. A first install trusts the download site (see "The first install trusts the download site"). Since 2026-11-25, release 1.0.0 is on the site, and the check passed for it |
| T38 | The theme package on npm comes only from the reviewed code, and it goes live only after the owner approves it | The contents of the package and the checks of the release workflow. The workflow uses no npm token, and npm keeps each new version back until the owner approves it | The theme package is published from a later commit than this report. Its code is the same; only its package file, a copy of the license and a test of the package changed. The first release through the workflow checks the npm settings and the build record |
| P05 | What remote nodes learn | Exactly what Coffer sends to a second node: a block height, never a payment ID | Together, the second nodes can link the IP address of your wallet host to the blocks that hold your payments. If you run your own node, this doesn't happen |
| R05 | A restart during a payment loses nothing | We killed the site, and separately the wallet host, during a report | An admin's decision and a report can arrive at the same instant. The admin's decision won in every test round. This is a strong sign, not a proof |
| F01 | Coffer refuses malformed reports | Size, encoding, signature and age | Coffer accepts a correctly signed report with unknown or repeated fields (RT-06). This needs the signing key |
| F04 | Only admins can open the admin page | The refusal without a sign-in and with a bad token, on a real site | EmDash makes these refusals. We checked them on a real site, not in the automated tests. We checked a signed-in non-admin by hand one time |

## Covered in release 2

Release 1 takes tips only. These topics belong to orders, and this report doesn't claim them:

- payment for goods
- price checks against an order
- email fields and refund-address fields
- the buyer data that Coffer holds during a review

## How we tested Coffer

- **Automated tests** run on every change. They test the plugin, the theme and the wallet host, and they include a race detector. At the release's commit: 1,410 tests. 1,388 passed. 7 failed as expected: they are the known limits under "Limits we accepted". 15 were skipped in this run. No test failed. The 15 skipped tests are:
  - 10 tests of the wallet host that need a live wallet, a node or the network. We ran them by hand during development, and `docs/progress.md` records each run
  - a comparison with OpenSSL, which needs its own setup
  - the test of RT-21, an open low-rated finding. Go has no mark for an expected failure, so this test is skipped while RT-21 is open
  - a check that runs only when the QR decoder is missing
  - in each of the two plugin runs, the test for the other setting of the release-1 switch
- **An attack phase** before the release:
  - hostile requests against a site that runs Coffer
  - a hostile node
  - a hostile site against the wallet host
  - real payments on the test network
- **A review of the 16 threats in the design.** We checked each threat against the code and its tests. A second reader then did the same review independently, without the conclusions of the first reader. 11 threats hold as designed. 5 hold with a limit that this report states.
- **Not done:** an outside review, any test on mainnet, a real chain reversal, or a site on Cloudflare.

## Check it yourself

- **The signature of the release, by hand:** see "Doing it by hand" in the install guide. https://github.com/dwightsabeast/coffer/blob/coffer%401.0.0/docs/install.md
- **The tests behind each ID:** `docs/security-matrix.md`.
- **Every finding, fixed or open:** `docs/redteam-findings.md`.

## Report a problem

Report it privately at https://github.com/dwightsabeast/coffer/security/advisories/new

## Appendix: results by ID

We generated this section from the test results at the release's commit, with `scripts/security-report-results.mjs`. [`docs/security-results-1.0.0.md`](security-results-1.0.0.md) names each test and its result.

How to read it:

- **Passed:** the test ran and the claim held.
- **Expected failure:** the test describes the correct behavior, and the behavior isn't correct yet. These are the known limits under "Limits we accepted".
- **Skipped:** the test didn't run in this run. "How we tested Coffer" says why for each one.
- **No automated test ran:** the claim's evidence isn't a test in these suites. For T37, the evidence is CI's reproducibility build and the rebuild before signing. For P01, it is the data-at-rest scanner, which we ran by hand. The matrix row of each ID gives its evidence.

| | |
| --- | --- |
| Commit | `2e3c410aa9280ab346941bf6a909a23f435976fb` |
| CI run on that commit | [45501345050](https://github.com/dwightsabeast/coffer/actions/runs/45501345050), passed |
| Where these results come from | A clean clone of that commit on the project's development machine, 2026-11-25: Go 1.27.4, Node 24.21.0, pnpm 12.8.1, each package's committed lockfile. CI's race-detector run isn't included |

**Totals**

| Suite | Passed | Expected failure (known limit) | Skipped (didn't run) | Failed |
| --- | ---: | ---: | ---: | ---: |
| plugin | 547 | 7 | 1 | 0 |
| plugin (release-2 switch on) | 102 | 0 | 1 | 0 |
| theme | 79 | 0 | 1 | 0 |
| wallet host (bridge) | 547 | 0 | 12 | 0 |
| scripts | 113 | 0 | 0 | 0 |
| **All** | 1388 | 7 | 15 | 0 |

**By ID**

| ID | Passed | Expected failure (known limit) | Skipped (didn't run) | Failed | Note |
| --- | ---: | ---: | ---: | ---: | --- |
| T01 | 2 | 0 | 0 | 0 | |
| T02 | 2 | 0 | 0 | 0 | |
| T03 | 118 | 0 | 0 | 0 | |
| T04 | 16 | 0 | 0 | 0 | |
| T05 | 56 | 1 | 0 | 0 | Known limit: an expected failure is open |
| T06 | 17 | 0 | 0 | 0 | |
| T07 | 23 | 0 | 0 | 0 | |
| T08 | 10 | 0 | 0 | 0 | |
| T09 | 12 | 0 | 0 | 0 | |
| T10 | 6 | 0 | 0 | 0 | |
| T11 | 18 | 0 | 0 | 0 | |
| T12 | 10 | 0 | 0 | 0 | |
| T13 | 32 | 0 | 0 | 0 | |
| T14 | 74 | 0 | 1 | 0 | |
| R14 | 14 | 0 | 0 | 0 | |
| T15 | 21 | 0 | 1 | 0 | |
| T16 | 30 | 0 | 0 | 0 | |
| T17 | 7 | 0 | 0 | 0 | |
| T18 | 44 | 0 | 0 | 0 | |
| T19 | 8 | 0 | 0 | 0 | |
| T20 | 29 | 0 | 0 | 0 | |
| T21 | 8 | 1 | 0 | 0 | Known limit: an expected failure is open |
| T22 | 12 | 0 | 0 | 0 | |
| T23 | 2 | 0 | 0 | 0 | |
| T24 | 7 | 0 | 1 | 0 | |
| T25 | 10 | 0 | 0 | 0 | |
| T26 | 3 | 0 | 0 | 0 | |
| T27 | 4 | 0 | 0 | 0 | |
| T28 | 1 | 0 | 0 | 0 | |
| T29 | 11 | 0 | 0 | 0 | |
| T30 | 4 | 0 | 0 | 0 | |
| T31 | 1 | 0 | 0 | 0 | |
| T32 | 20 | 0 | 0 | 0 | |
| T33 | 5 | 0 | 0 | 0 | |
| T34 | 7 | 0 | 0 | 0 | |
| T35 | 5 | 0 | 0 | 0 | |
| T36 | 17 | 0 | 0 | 0 | |
| T37 | 0 | 0 | 0 | 0 | No automated test ran |
| P01 | 0 | 0 | 0 | 0 | No automated test ran |
| P02 | 92 | 1 | 0 | 0 | Known limit: an expected failure is open |
| P03 | 6 | 0 | 0 | 0 | |
| P04 | 6 | 1 | 0 | 0 | Known limit: an expected failure is open |
| P05 | 1 | 0 | 0 | 0 | |
| R01 | 4 | 0 | 0 | 0 | |
| R02 | 3 | 0 | 0 | 0 | |
| R03 | 9 | 0 | 0 | 0 | |
| R04 | 7 | 0 | 0 | 0 | |
| R05 | 4 | 0 | 0 | 0 | |
| R06 | 2 | 0 | 0 | 0 | |
| R07 | 3 | 0 | 0 | 0 | |
| R08 | 74 | 0 | 0 | 0 | |
| R09 | 42 | 0 | 0 | 0 | |
| R10 | 6 | 0 | 0 | 0 | |
| R11 | 8 | 0 | 0 | 0 | |
| R12 | 4 | 0 | 0 | 0 | |
| R13 | 24 | 0 | 0 | 0 | |
| F01 | 17 | 3 | 0 | 0 | Known limit: an expected failure is open |
| F02 | 19 | 0 | 0 | 0 | |
| F03 | 4 | 0 | 0 | 0 | |
| F04 | 21 | 0 | 0 | 0 | |
| F05 | 26 | 0 | 0 | 0 | |
| F06 | 1 | 0 | 0 | 0 | |
| F07 | 5 | 0 | 0 | 0 | |
| F08 | 27 | 0 | 0 | 0 | |
