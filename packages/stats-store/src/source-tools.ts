import * as Schema from "effect/Schema";

const instant = Schema.NullOr(Schema.Number.check(Schema.isInt()));
export const SourceTool = Schema.Struct({
  id: Schema.String,
  stepId: Schema.String,
  session: Schema.String,
  tool: Schema.String,
  outcome: instant,
  runStart: instant,
  completed: instant,
});

// OpenCode 2.0.22 d259ae716379a67bcc35943ba75590f1fc7a1b26:
// packages/schema/src/session-message.ts AssistantTool; only top-level content items.
// Never return input, output, metadata or error messages to the application.
export const toolsSql = (countedSteps: string) => `WITH counted AS (${countedSteps})
  SELECT 'tool:' || c.id || ':' || json_extract(j.value,'$.id') AS id,
  c.id AS stepId, c.session,
  CASE json_extract(j.value,'$.name') WHEN 'bash' THEN 'shell' WHEN 'task' THEN 'subagent'
    WHEN 'apply_patch' THEN 'patch' ELSE json_extract(j.value,'$.name') END AS tool,
  CASE
    WHEN json_extract(j.value,'$.state.status') IN ('streaming','running') THEN NULL
    WHEN json_extract(j.value,'$.name')='invalid' THEN 2
    WHEN json_extract(j.value,'$.state.status')='completed' THEN 1
    WHEN json_extract(j.value,'$.state.error.type') IN ('aborted','tool.interrupted','permission.rejected') THEN 3
    ELSE 2 END AS outcome,
  json_extract(j.value,'$.time.ran') AS runStart,
  json_extract(j.value,'$.time.completed') AS completed
  FROM counted c JOIN session_message m ON m.id=c.id, json_each(m.data,'$.content') j
  WHERE json_extract(j.value,'$.type')='tool' ORDER BY c.position,j.key`;
