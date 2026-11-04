import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: `${process.env.HOMEHUB_DATA_DIR ?? "./data"}/homehub.db`,
  },
  strict: true,
  verbose: true,
});
