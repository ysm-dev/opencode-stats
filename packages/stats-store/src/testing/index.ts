import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "../source-schema/2.0.22.json" with { type: "json" };
export { readBuilt } from "./store.ts";
export { inThreadRuntime } from "./worker.ts";

export type SyntheticMessage = {
  readonly id: string;
  readonly session: string;
  readonly seq: number;
  readonly start: number;
  readonly type?: string;
  readonly tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  readonly content?: string;
  readonly error?: string;
};

export function syntheticDatabase(filename: string) {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL");
  for (const statement of schema.statements) db.exec(statement);
  db.exec("CREATE TABLE migration(id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)");
  for (const id of schema.migrations) db.prepare("INSERT INTO migration VALUES (?,0)").run(id);
  db.prepare(
    "INSERT INTO project(id,worktree,time_created,time_updated,sandboxes) VALUES ('synthetic-project','/made-up',0,0,'[]')",
  ).run();
  const atomic = (session: string, write: () => void) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      write();
      db.prepare(
        "INSERT INTO event_sequence(aggregate_id,seq) VALUES (?,0) ON CONFLICT(aggregate_id) DO UPDATE SET seq=seq+1",
      ).run(session);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  return {
    session(id: string, parent: string | null = null) {
      atomic(id, () => {
        db.prepare(
          "INSERT INTO session_v2(id,project_id,parent_id,slug,directory,version,time_created,time_updated) VALUES (?,'synthetic-project',?,'synthetic','/made-up','2.0.22',0,0)",
        ).run(id, parent);
      });
    },
    message(message: SyntheticMessage) {
      const data = JSON.stringify({
        time: { created: message.start },
        tokens: message.tokens,
        content: [{ type: "text", text: message.content ?? "SYNTHETIC PRIVATE CONTENT" }],
        error: message.error,
      });
      atomic(message.session, () => {
        db.prepare(
          "INSERT INTO session_message VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET time_created=excluded.time_created,time_updated=excluded.time_updated,data=excluded.data",
        ).run(
          message.id,
          message.session,
          message.type ?? "assistant",
          message.seq,
          message.start,
          message.start,
          data,
        );
      });
    },
    close() {
      db.close();
    },
  };
}

export function syntheticFixture() {
  const folder = mkdtempSync(join(tmpdir(), "stats-store-synthetic-"));
  const source = join(folder, "opencode.db");
  const writer = syntheticDatabase(source);
  return {
    folder,
    source,
    writer,
    dispose: () => {
      writer.close();
      rmSync(folder, { recursive: true });
    },
  };
}
