import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: `${process.env.TELESCREEN_DATA_DIR ?? "./data"}/telescreen.db`,
  },
  strict: true,
  verbose: true,
});
