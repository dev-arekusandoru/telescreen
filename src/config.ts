import path from "node:path";

/** Directory holding the SQLite file (and anything else persistent). `HOMEHUB_DATA_DIR`, default `./data`. */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.HOMEHUB_DATA_DIR?.trim() || "./data");
}

export function dbPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(dataDir(env), "homehub.db");
}

/** `HOMEHUB_TRUST_NETWORK=1|true`. */
export function trustNetwork(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["1", "true"].includes(env.HOMEHUB_TRUST_NETWORK?.trim().toLowerCase() ?? "");
}
