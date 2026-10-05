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
  revision: integer().notNull(),
});

export const metadata = sqliteTable("metadata", {
  id: integer().primaryKey(),
  version: integer().notNull(),
  generation: text().notNull(),
  revision: integer().notNull(),
  historyCompleteFrom: integer("history_complete_from").notNull(),
  expiredRevision: integer("expired_revision").notNull(),
});

export const sessions = sqliteTable("session_sync", {
  id: text().primaryKey(),
  counter: integer(),
  messageCount: integer("message_count").notNull(),
  highestPosition: integer("highest_position"),
});

export const tombstones = sqliteTable("tombstone", {
  id: text().primaryKey(),
  revision: integer().notNull(),
  deletedAt: integer("deleted_at").notNull(),
});
