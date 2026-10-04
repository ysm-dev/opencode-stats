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
