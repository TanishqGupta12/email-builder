import { defineConfig } from "drizzle-kit";

const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();

export default defineConfig(
  remoteUrl
    ? {
        schema: "./src/lib/db/schema.ts",
        dialect: "turso",
        dbCredentials: {
          url: remoteUrl,
          authToken: process.env.TURSO_AUTH_TOKEN,
        },
      }
    : {
        schema: "./src/lib/db/schema.ts",
        dialect: "sqlite",
        dbCredentials: {
          url: "file:./data/email-builder.sqlite",
        },
      },
);
