import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "../source-schema/2.0.22.json" with { type: "json" };

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
  readonly provider?: string;
  readonly model?: string;
  readonly variant?: string;
  readonly agent?: string;
};

export function syntheticDatabase(filename: string) {
  const db = new DatabaseSync(filename);
  let closed = false;
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
    session(
      id: string,
      parent: string | null = null,
      details: { project?: string; title?: string; fork?: string } = {},
    ) {
      atomic(id, () => {
        db.prepare(
          "INSERT INTO session_v2(id,project_id,parent_id,title,fork_session_id,slug,directory,version,time_created,time_updated) VALUES (?,?,?,?,?,'synthetic','/made-up','2.0.22',0,0)",
        ).run(
          id,
          details.project ?? "synthetic-project",
          parent,
          details.title ?? null,
          details.fork ?? null,
        );
      });
    },
    message(message: SyntheticMessage, advanceCounter = true) {
      const data = JSON.stringify({
        time: { created: message.start },
        tokens: message.tokens,
        content: [{ type: "text", text: message.content ?? "SYNTHETIC PRIVATE CONTENT" }],
        error: message.error,
        providerID: message.provider ?? "synthetic-provider",
        modelID: message.model ?? "synthetic-model",
        variant: message.variant,
        agent: message.agent ?? "build",
      });
      const write = () => {
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
      };
      if (advanceCounter) atomic(message.session, write);
      else write();
    },
    revert(session: string, boundary: number) {
      atomic(session, () => {
        db.prepare("DELETE FROM session_message WHERE session_id=? AND seq>=?").run(
          session,
          boundary,
        );
      });
    },
    rewriteWithoutCounter(id: string, data: string) {
      db.prepare("UPDATE session_message SET data=? WHERE id=?").run(data, id);
    },
    positionWithoutCounter(id: string, position: number) {
      db.prepare("UPDATE session_message SET seq=? WHERE id=?").run(position, id);
    },
    reset() {
      db.exec("BEGIN IMMEDIATE; DELETE FROM session_v2; DELETE FROM event_sequence; COMMIT");
    },
    removeCounter(session: string) {
      db.prepare("DELETE FROM event_sequence WHERE aggregate_id=?").run(session);
    },
    sequence(session: string, value: string | number) {
      db.prepare("UPDATE event_sequence SET seq=? WHERE aggregate_id=?").run(value, session);
    },
    deleteSession(session: string) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("DELETE FROM session_v2 WHERE id=?").run(session);
        db.prepare("DELETE FROM event_sequence WHERE aggregate_id=?").run(session);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    fork(origin: string, id: string, suffix = 1) {
      atomic(id, () => {
        db.prepare(
          "INSERT INTO session_v2(id,project_id,fork_session_id,slug,directory,version,time_created,time_updated) SELECT ?,project_id,id,slug,directory,version,time_created,time_updated FROM session_v2 WHERE id=?",
        ).run(id, origin);
        db.prepare(
          "INSERT INTO session_message SELECT CASE WHEN substr(id,1,4)='msg_' AND length(id)>=30 THEN substr(id,1,30) ELSE 'msg_' || substr(id || '00000000000000000000000000',1,26) END || '_' || ?, ?, type,seq,time_created,time_updated,data FROM session_message WHERE session_id=?",
        ).run(suffix, id, origin);
      });
    },
    project(id: string, worktree: string, name: string | null = null) {
      atomic(id, () => {
        db.prepare(
          "INSERT INTO project(id,worktree,name,time_created,time_updated,sandboxes) VALUES (?,?,?,0,0,'[]') ON CONFLICT(id) DO UPDATE SET name=excluded.name,worktree=excluded.worktree",
        ).run(id, worktree, name);
      });
    },
    move(session: string, project: string) {
      atomic(project, () => {
        db.prepare("UPDATE session_v2 SET project_id=? WHERE id=?").run(project, session);
      });
    },
    deleteProject(id: string) {
      atomic(id, () => {
        db.prepare("DELETE FROM project WHERE id=?").run(id);
      });
    },
    title(session: string, title: string | null) {
      db.prepare("UPDATE session_v2 SET title=? WHERE id=?").run(title, session);
    },
    archive(session: string) {
      db.prepare("UPDATE session_v2 SET time_archived=1 WHERE id=?").run(session);
    },
    removeTree(session: string, afterDelete: (id: string) => void = () => {}) {
      const ids = db
        .prepare(
          "WITH RECURSIVE tree(id,depth) AS (SELECT id,0 FROM session_v2 WHERE id=? UNION ALL SELECT s.id,tree.depth+1 FROM session_v2 s JOIN tree ON s.parent_id=tree.id) SELECT id FROM tree ORDER BY depth DESC",
        )
        .all(session);
      for (const row of ids) {
        const id = String(row["id"]);
        atomic(id, () => {
          db.prepare("DELETE FROM session_v2 WHERE id=?").run(id);
        });
        afterDelete(id);
      }
    },
    close() {
      if (!closed) {
        db.close();
        closed = true;
      }
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

export function streamingFixture() {
  const fixture = syntheticFixture();
  fixture.writer.session("ses-live");
  fixture.writer.message({
    id: "msg-live",
    session: "ses-live",
    seq: 0,
    start: 1000,
    tokens: { output: 1 },
  });
  return fixture;
}
