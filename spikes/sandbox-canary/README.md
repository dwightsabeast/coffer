# Sandbox canary (phase 07b)

A throwaway plugin with Coffer's exact manifest (capabilities, allowed hosts, storage) that tries what EmDash's sandbox
must stop: raw `fetch`, hosts outside `allowedHosts` and URL tricks around them, `ctx.content.create`, an undeclared
storage collection, Coffer's rows, KV keys and settings, `process.env`, a Node built-in, and APIs the manifest didn't
ask for. A `spin` route burns the CPU for the 30-second wall-limit test. Catalog rows G1 and G2 in
`docs/phases/07b-adversarial-testing.md`; matrix T01 and R11.

**Never shipped, never published.** It is loaded on the dev site only while its probes run.

```sh
node scripts/redteam/canary-site.mjs on     # dev site stopped: builds, edits astro.config.mjs (backed up), links it
# start the dev site, then:
node scripts/redteam/canary.mjs             # one line per probe; exit 1 if any came back "allowed"
node scripts/redteam/canary.mjs --spin 60   # the spin, with Coffer's status route timed meanwhile
# stop the dev site, then:
node scripts/redteam/canary-site.mjs off    # astro.config.mjs back byte for byte, link removed
```

It builds with Coffer's own toolchain: `node_modules` here is a symlink to `../../plugin/node_modules` (made by
`canary-site.mjs on`), so nothing new is installed. Probes report counts and error messages only, never what another
plugin stores. They report and never grade; the attacker judges the results.
