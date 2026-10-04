import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const steps = sqliteTable("step", {
  id: text().primaryKey(),
  session: text().notNull(),
  position: integer().notNull(),
  start: integer().notNull(),
  input: integer(),
  cacheRead: integer("cache_read"),
  cacheWrite: integer("cache_write"),
  output: integer(),
  reasoning: integer(),
});

export const metadata = sqliteTable("metadata", {
  id: integer().primaryKey(),
  version: integer().notNull(),
  generation: text().notNull(),
  revision: integer().notNull(),
  historyCompleteFrom: integer("history_complete_from").notNull(),
});
