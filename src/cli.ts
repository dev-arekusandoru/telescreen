/** Tiny admin CLI: `pnpm cli token create <name>` | `token list` | `token revoke <id>`. */
import { dbPath } from "./config.js";
import { openDb, runMigrations } from "./db/client.js";
import { createToken, listTokens, revokeToken } from "./auth/tokens.js";
import { seedIfEmpty } from "./services/households.js";

const [group, action, arg] = process.argv.slice(2);
const { db, sqlite } = openDb(dbPath());
try {
  runMigrations(db);
  const household = seedIfEmpty(db);
  if (group === "token" && action === "create" && arg) {
    const created = createToken(db, household.id, arg);
    console.log(`Token ${created.id} (${created.name}). Shown once:\n${created.token}`);
  } else if (group === "token" && action === "list") {
    for (const t of listTokens(db, household.id)) {
      console.log(`${t.id}  ${t.prefix}…  ${t.name}${t.revokedAt ? "  (revoked)" : ""}`);
    }
  } else if (group === "token" && action === "revoke" && arg) {
    revokeToken(db, household.id, arg);
    console.log("Revoked.");
  } else {
    console.error("Usage: pnpm cli token create <name> | token list | token revoke <id>");
    process.exitCode = 1;
  }
} finally {
  sqlite.close();
}
