// Phase 07b: back up the dev site's database before an attack run.
//
//   node scripts/redteam/backup.mjs <name> [--db <path>]
//
// Writes ~/xmr-pay-dev-data/redteam/<name>.db (mode 600) with VACUUM INTO on a read-only connection, so it works with
// the site running and keeps writes still in data.db-wal. Refuses to overwrite. Restore with
// `node scripts/setup-test-reset.mjs --restore <file>` (the site stopped).
import { DEFAULT_DB, backupDatabase } from "./lib.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--db");
const from = i === -1 ? DEFAULT_DB : args.splice(i, 2)[1];
if (args.length !== 1 || !from) {
	console.error("usage: node scripts/redteam/backup.mjs <name> [--db <path>]");
	process.exit(2);
}
console.log(`backed up ${from} to ${backupDatabase(args[0], { from })}`);
