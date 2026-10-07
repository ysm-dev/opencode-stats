import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { syntheticFixture } from "./index.ts";

it("projects sessions and message rewrites atomically with their aggregate counters, rolling both back on failure", () => {
  const fixture = syntheticFixture();
  const db = new DatabaseSync(fixture.source, { readOnly: true });
  try {
    fixture.writer.session("ses-atomic");
    expect(
      db.prepare("SELECT seq FROM event_sequence WHERE aggregate_id='ses-atomic'").get(),
    ).toMatchObject({ seq: 0 });
    const message = { id: "msg-atomic", session: "ses-atomic", seq: 0, start: 1000 };
    fixture.writer.message(message);
    fixture.writer.message({ ...message, start: 2000 });
    expect(
      db.prepare("SELECT seq FROM event_sequence WHERE aggregate_id='ses-atomic'").get(),
    ).toMatchObject({ seq: 2 });
    expect(
      db
        .prepare(
          "SELECT time_created, json_extract(data,'$.time.created') AS start FROM session_message",
        )
        .get(),
    ).toMatchObject({ time_created: 2000, start: 2000 });
    expect(() => fixture.writer.message({ ...message, id: "msg-conflict" })).toThrow(
      /UNIQUE constraint/iu,
    );
    expect(db.prepare("SELECT count(*) AS count FROM session_message").get()).toMatchObject({
      count: 1,
    });
    expect(
      db.prepare("SELECT seq FROM event_sequence WHERE aggregate_id='ses-atomic'").get(),
    ).toMatchObject({ seq: 2 });
  } finally {
    db.close();
    fixture.dispose();
  }
});

it("gives each fork's copied messages the exact OpenCode ID shape", () => {
  const fixture = syntheticFixture();
  const db = new DatabaseSync(fixture.source, { readOnly: true });
  try {
    fixture.writer.session("origin");
    fixture.writer.message({
      id: "msg_abcdefghijklmnopqrstuvwxyz",
      session: "origin",
      seq: 0,
      start: 1,
    });
    fixture.writer.fork("origin", "fork");
    fixture.writer.fork("fork", "nested-fork", 2);
    expect(db.prepare("SELECT id FROM session_message ORDER BY id").all()).toEqual([
      { id: "msg_abcdefghijklmnopqrstuvwxyz" },
      { id: "msg_abcdefghijklmnopqrstuvwxyz_1" },
      { id: "msg_abcdefghijklmnopqrstuvwxyz_2" },
    ]);
  } finally {
    db.close();
    fixture.dispose();
  }
});

it("moves and renames through the project's counter while titles and archives leave the session counter alone", () => {
  const fixture = syntheticFixture();
  const db = new DatabaseSync(fixture.source, { readOnly: true });
  try {
    fixture.writer.session("moving");
    fixture.writer.project("destination", "/destination");
    fixture.writer.move("moving", "destination");
    fixture.writer.project("destination", "/destination", "Renamed");
    fixture.writer.title("moving", "A current title");
    fixture.writer.archive("moving");
    expect(
      db.prepare("SELECT aggregate_id,seq FROM event_sequence ORDER BY aggregate_id").all(),
    ).toEqual([
      { aggregate_id: "destination", seq: 2 },
      { aggregate_id: "moving", seq: 0 },
    ]);
    expect(
      db.prepare("SELECT project_id,title,time_archived FROM session_v2 WHERE id='moving'").get(),
    ).toMatchObject({ project_id: "destination", title: "A current title", time_archived: 1 });
    expect(db.prepare("SELECT name FROM project WHERE id='destination'").get()).toMatchObject({
      name: "Renamed",
    });
  } finally {
    db.close();
    fixture.dispose();
  }
});
