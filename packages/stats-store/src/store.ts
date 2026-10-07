import * as Effect from "effect/Effect";
import {
  metadata,
  steps,
  prompts,
  tools,
  tombstones,
  pricingCatalog,
  modelPrices,
} from "./schema.ts";
import { countedSteps, readDimensions } from "./read-dimensions.ts";
import { gt, eq, or } from "drizzle-orm";
import { Database, type StoreRuntime } from "./database.ts";
import { storePaths, type StoreOptions } from "./location.ts";
import { unbuiltCopy } from "./unbuilt-copy.ts";
import type {
  Step,
  StepDimensions,
  SessionFact,
  DimensionName,
  Prompt,
  ToolCall,
} from "@opencode-stats/browser-copy";
import * as Cause from "effect/Cause";
import { sqlFailure } from "./errors.ts";
import { statsStoreVersion } from "./build.ts";

export type StoreCopy = {
  readonly kind: "whole" | "changes";
  readonly fromRevision: number;
  readonly generation: string;
  readonly revision: number;
  readonly historyCompleteFrom: number;
  readonly historyComplete: boolean;
  readonly steps: ReadonlyArray<Step & StepDimensions>;
  readonly prompts: ReadonlyArray<Prompt & { readonly id: string }>;
  readonly tools: ReadonlyArray<ToolCall & { readonly id: string }>;
  readonly facts: ReadonlyArray<
    Step &
      Omit<StepDimensions, "session"> & {
        id: string;
        session: string;
        sessionCode: number;
        position: number;
        revision: number;
      }
  >;
  readonly tombstones: ReadonlyArray<{ id: string; revision: number }>;
  readonly names: ReadonlyArray<DimensionName>;
  readonly sessions: ReadonlyArray<SessionFact>;
  readonly projects: ReadonlyArray<number>;
  readonly sessionTombstones: ReadonlyArray<number>;
  readonly projectTombstones: ReadonlyArray<number>;
  readonly pricing: {
    readonly catalog: typeof pricingCatalog.$inferSelect;
    readonly models: ReadonlyArray<typeof modelPrices.$inferSelect>;
  };
};
export type StoreCursor = { readonly generation: string; readonly revision: number };
export type { StoreRuntime } from "./database.ts";
export { statsStoreVersion } from "./build.ts";
export { sqlFailure, SqlFailure } from "./errors.ts";
export type { BuildEvent } from "./build-events.ts";
export type { StoreEvent } from "./build-events.ts";

export const stayInSync = Effect.fnUntraced(function* (
  options: StoreOptions,
  runtime: StoreRuntime,
  announce: (copy: StoreCopy) => void,
  report: (event: import("./build-events.ts").StoreEvent) => void = () => {},
) {
  const readonly = true;
  const paths = yield* Effect.try({
    try: () => storePaths(options),
    catch: () => new Error("OpenCode database must be an existing readable file."),
  });
  const read = (since?: StoreCursor) =>
    Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.$client.withTransaction(
        Effect.gen(function* () {
          const headers = yield* db.select().from(metadata);
          const header = headers[0]!;
          if (header.version !== statsStoreVersion)
            return yield* Effect.fail(sqlFailure(undefined, "readStore"));
          const changes =
            since &&
            since.generation === header.generation &&
            since.revision >= header.expiredRevision &&
            since.revision <= header.revision;
          const facts = yield* db
            .select()
            .from(steps)
            .where(changes ? gt(steps.revision, since.revision) : undefined)
            .orderBy(steps.session, steps.position);
          const deleted = changes
            ? yield* db
                .select({ id: tombstones.id, revision: tombstones.revision })
                .from(tombstones)
                .where(gt(tombstones.revision, since.revision))
                .orderBy(tombstones.id)
            : [];
          const delivered = yield* db
            .select()
            .from(prompts)
            .where(changes ? gt(prompts.revision, since.revision) : undefined)
            .orderBy(prompts.session, prompts.position);
          // A step rewrite (including a project move) re-emits its calls with the same attribution.
          const calls = yield* db
            .select({
              id: tools.id,
              start: steps.start,
              runStart: tools.runStart,
              completed: tools.completed,
              outcome: tools.outcome,
              tool: tools.tool,
              provider: steps.provider,
              model: steps.model,
              variant: steps.variant,
              agent: steps.agent,
              project: steps.project,
              session: steps.sessionCode,
              subagent: steps.subagent,
            })
            .from(tools)
            .innerJoin(steps, eq(tools.stepId, steps.id))
            .where(
              changes
                ? or(gt(tools.revision, since.revision), gt(steps.revision, since.revision))
                : undefined,
            )
            .orderBy(tools.id);
          const dimensions = yield* readDimensions(changes ? since.revision : undefined, deleted);
          return {
            kind: changes ? ("changes" as const) : ("whole" as const),
            fromRevision: changes ? since.revision : 0,
            generation: header.generation,
            revision: header.revision,
            historyCompleteFrom: header.historyCompleteFrom,
            historyComplete: header.historyComplete,
            steps: countedSteps(facts),
            facts,
            tools: calls,
            prompts: delivered.map((row) => ({
              id: row.id,
              start: row.start,
              provider: row.provider,
              model: row.model,
              variant: row.variant,
              agent: row.agent,
              project: row.project,
              session: row.sessionCode,
            })),
            tombstones: deleted.filter(
              (row) => !row.id.startsWith("session:") && !row.id.startsWith("project:"),
            ),
            pricing: {
              catalog: (yield* db.select().from(pricingCatalog))[0]!,
              models: yield* db.select().from(modelPrices).orderBy(modelPrices.id),
            },
            ...dimensions,
          };
        }),
      );
    }).pipe(
      Effect.provide(
        runtime.database({
          filename: paths.store,
          readonly,
          disableWAL: readonly,
          busyTimeout: "20 millis",
        }),
      ),
      Effect.catchCause((cause) => Effect.fail(sqlFailure(Cause.squash(cause), "readStore"))),
    );
  let last: StoreCursor | undefined;
  let cacheBlocked = false;
  const notify = (copy: StoreCopy) => {
    if (last?.generation === copy.generation && last.revision === copy.revision) return;
    last = copy;
    announce(copy);
  };
  const refresh = () =>
    read().pipe(
      Effect.map(notify),
      Effect.catch((error) => {
        if (!cacheBlocked) return Effect.fail(error);
        // The public SQL reader still reports its exact failure. Only the served initial
        // copy is synthetic: unbuilt, revision zero, and unable to claim today's history.
        return Effect.sync(() => {
          if (!last) notify(unbuiltCopy());
        });
      }),
    );
  // Serve a usable existing store before the worker opens or reconciles the source.
  yield* read().pipe(
    Effect.map(notify),
    Effect.catch(() => Effect.void),
  );
  yield* runtime.worker(paths, refresh, (event) =>
    Effect.sync(() => {
      if (event.kind === "sync.stopped") cacheBlocked = event.reason === "store.unwritable";
      if (event.kind === "sync.resumed") cacheBlocked = false;
      report(event);
    }),
  );
  yield* refresh();
  return { read };
});
