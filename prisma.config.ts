import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 reads migration/introspection connection details from here (the
// schema no longer holds a `url`). The Prisma CLI does not auto-load .env, so
// load it manually (Node 20.12+ ships process.loadEnvFile).
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional (e.g. on Vercel where vars are injected directly).
}

export default defineConfig({
  // Schema is applied with `prisma db push` (see build script) — the app stores
  // only ephemeral coordination rows, so there is no migration history to keep.
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
});
