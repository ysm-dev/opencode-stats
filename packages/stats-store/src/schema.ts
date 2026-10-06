import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const steps = sqliteTable("step", {
  id: text().primaryKey(),
  session: text().notNull(),
  position: integer().notNull(),
  start: integer().notNull(),
  streamEnd: integer("stream_end"),
  completed: integer(),
  error: integer(),
  failed: integer().notNull(),
  interrupted: integer().notNull(),
  input: integer(),
  cacheRead: integer("cache_read"),
  cacheWrite: integer("cache_write"),
  output: integer(),
  reasoning: integer(),
  recordedCost: real("recorded_cost"),
  estimatedCost: real("estimated_cost"),
  provider: integer(),
  model: integer(),
  variant: integer().notNull(),
  agent: integer(),
  project: integer().notNull(),
  sessionCode: integer("session_code").notNull(),
  subagent: integer(),
  revision: integer().notNull(),
});

export const pricingCatalog = sqliteTable("pricing_catalog", {
  id: integer().primaryKey(),
  source: text().notNull(),
  stamp: integer(),
  updatedAt: integer("updated_at").notNull(),
  digest: text(),
});
export const modelPrices = sqliteTable("model_price", {
  id: text().primaryKey(),
  name: text().notNull(),
  price: text(),
});

export const prompts = sqliteTable("prompt", {
  id: text().primaryKey(),
  session: text().notNull(),
  position: integer().notNull(),
  start: integer().notNull(),
  provider: integer(),
  model: integer(),
  variant: integer(),
  agent: integer(),
  project: integer().notNull(),
  sessionCode: integer("session_code").notNull(),
  revision: integer().notNull(),
});

export const tools = sqliteTable("tool_call", {
  id: text().primaryKey(),
  stepId: text("step_id").notNull(),
  session: text().notNull(),
  tool: integer().notNull(),
  outcome: integer(),
  runStart: integer("run_start"),
  completed: integer(),
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

export const dimensionNames = sqliteTable("dimension_name", {
  code: integer().primaryKey({ autoIncrement: true }),
  dimension: text().notNull(),
  id: text().notNull(),
  name: text().notNull(),
  revision: integer().notNull(),
});

export const sessionFacts = sqliteTable("session_fact", {
  id: text().primaryKey(),
  parent: text(),
  session: text().notNull(),
  project: text().notNull(),
  title: text().notNull(),
  fork: text(),
  revision: integer().notNull(),
});

export const projectFacts = sqliteTable("project_fact", {
  id: text().primaryKey(),
  name: text(),
  worktree: text().notNull(),
  revision: integer().notNull(),
});
