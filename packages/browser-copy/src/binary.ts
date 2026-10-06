import {
  tokenKinds,
  stepDimensions,
  stepFields,
  sessionFields,
  mapStepFields,
  mapSessionFields,
  promptFields,
  mapPromptFields,
  toolFields,
  mapToolFields,
  type BrowserCopy,
  type StepColumns,
  type PromptColumns,
} from "./facts.ts";
import { checkedLength, decodeStrings, encodeStrings } from "./strings.ts";

export const formatVersion = 6;
const headerLength = 128;
const columns = stepFields;
const magic = 0x5354434f;

// Format 6: little endian, 128-byte header, then Float64 fact columns and strings.
// Header: magic/u32, version/u32, generation/36 ASCII bytes, kind/u32,
// fromRevision/f64, revision/f64, historyCompleteFrom/f64, rows/u32, bytes/u32.
// Then strings bytes/u32, tombstone count/u32, name count/u32, reserved/u32.
// At 96: session, project, session-tombstone and project-tombstone counts/u32.
// At 112: prompt count/u32, tool count/u32, then two reserved/u32. Step columns precede prompt and tool columns,
// session columns, project codes and the two tombstone columns.
// Length-prefixed UTF-16LE strings carry row IDs, tombstones and dimension names.
// Each column has exactly `rows` entries. NaN means an unrecorded token kind.
// All column lengths are checked before any column view is constructed.
// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: untrusted HTTP binary body
export function decode(input: unknown): BrowserCopy {
  if (!(input instanceof ArrayBuffer) || input.byteLength < headerLength) {
    throw new Error("Truncated browser copy header");
  }
  const header = new DataView(input);
  if (header.getUint32(0, true) !== magic) throw new Error("Invalid browser copy magic");
  if (header.getUint32(4, true) !== formatVersion)
    throw new Error("Unsupported browser copy format version");
  const kind = header.getUint32(44, true);
  if (
    kind > 1 ||
    header.getUint32(92) !== 0 ||
    header.getUint32(120) !== 0 ||
    header.getUint32(124) !== 0
  )
    throw new Error("Invalid reserved header");
  const rows = header.getUint32(72, true);
  const sessionCount = header.getUint32(96, true);
  const projectCount = header.getUint32(100, true);
  const sessionDeleted = header.getUint32(104, true);
  const projectDeleted = header.getUint32(108, true);
  const promptCount = header.getUint32(112, true);
  const toolCount = header.getUint32(116, true);
  const stepEnd = headerLength + rows * columns.length * 8;
  const promptEnd = stepEnd + promptCount * promptFields.length * 8;
  const toolEnd = promptEnd + toolCount * toolFields.length * 8;
  const sessionEnd = toolEnd + sessionCount * sessionFields.length * 8;
  const stringOffset = sessionEnd + (projectCount + sessionDeleted + projectDeleted) * 8;
  const length = stringOffset + header.getUint32(80, true);
  if (length !== input.byteLength || header.getUint32(76, true) !== length) {
    throw new Error("Invalid browser copy lengths");
  }
  const generation = String.fromCharCode(...new Uint8Array(input, 8, 36));
  validateGeneration(generation);
  const { fromRevision, revision, historyCompleteFrom } = readRevisions(header);
  const strings = decodeStrings(
    input,
    stringOffset,
    rows,
    header.getUint32(84, true),
    header.getUint32(88, true),
    promptCount,
    toolCount,
  );
  if (kind === 0 && (fromRevision !== 0 || strings.tombstones.length > 0))
    throw new Error("Invalid whole browser copy revision range");
  const column = (index: number): Float64Array =>
    new Float64Array(input, headerLength + index * rows * 8, rows);
  const steps = mapStepFields((field) => column(columns.indexOf(field)));
  validateColumns(steps);
  const prompts = mapPromptFields(
    (field) =>
      new Float64Array(input, stepEnd + promptFields.indexOf(field) * promptCount * 8, promptCount),
  );
  validatePromptColumns(prompts);
  const tools = readTools(input, promptEnd, toolCount);
  const sessionColumn = (index: number) =>
    new Float64Array(input, toolEnd + index * sessionCount * 8, sessionCount);
  const sessions = mapSessionFields((field) => sessionColumn(sessionFields.indexOf(field)));
  const projects = new Float64Array(input, sessionEnd, projectCount);
  const sessionTombstones = new Float64Array(input, sessionEnd + projectCount * 8, sessionDeleted);
  const projectTombstones = new Float64Array(
    input,
    sessionEnd + (projectCount + sessionDeleted) * 8,
    projectDeleted,
  );
  for (const values of Object.values(sessions)) validateCodes(values);
  validateIdentities(sessions.code, sessionTombstones);
  validateIdentities(projects, projectTombstones);
  for (const values of [sessions.session, sessions.project]) validateRequiredCodes(values);
  if (kind === 0 && (sessionDeleted || projectDeleted))
    throw new Error("Invalid whole browser copy revision range");
  return {
    kind: kind === 0 ? "whole" : "changes",
    generation,
    fromRevision,
    revision,
    historyCompleteFrom,
    steps,
    prompts,
    tools,
    sessions,
    projects,
    sessionTombstones,
    projectTombstones,
    ...strings,
  };
}

function readRevisions(header: DataView) {
  const fromRevision = header.getFloat64(48, true);
  const revision = header.getFloat64(56, true);
  if (
    !Number.isSafeInteger(fromRevision) ||
    fromRevision < 0 ||
    !Number.isSafeInteger(revision) ||
    revision < fromRevision
  )
    throw new Error("Invalid browser copy revision range");
  const historyCompleteFrom = header.getFloat64(64, true);
  if (!Number.isSafeInteger(historyCompleteFrom))
    throw new Error("Invalid history-complete instant");
  return { fromRevision, revision, historyCompleteFrom };
}

function readTools(input: ArrayBuffer, offset: number, count: number) {
  const tools = mapToolFields(
    (field) => new Float64Array(input, offset + toolFields.indexOf(field) * count * 8, count),
  );
  validateInstants(tools.start, false);
  validateInstants(tools.runStart, true);
  validateInstants(tools.completed, true);
  validateRequiredCodes(tools.tool);
  for (const dimension of stepDimensions) validateCodes(tools[dimension]);
  if (tools.outcome.some((value) => !Number.isNaN(value) && ![1, 2, 3].includes(value)))
    throw new Error("Invalid tool outcome");
  return tools;
}

function validateGeneration(generation: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(generation)) {
    throw new Error("Invalid browser copy generation");
  }
}

function validateColumns(steps: StepColumns): void {
  validateInstants(steps.start, false);
  validateInstants(steps.streamEnd, true);
  validateInstants(steps.completed, true);
  validateCodes(steps.error);
  for (const flag of [steps.failed, steps.interrupted]) {
    if (flag.some((value) => value !== 0 && value !== 1)) throw new Error("Invalid step outcome");
  }
  for (const kind of tokenKinds) {
    for (const amount of steps[kind]) {
      if (!Number.isNaN(amount) && (!Number.isSafeInteger(amount) || amount < 0)) {
        throw new Error("Invalid step tokens");
      }
    }
  }
  for (const dimension of stepDimensions) validateCodes(steps[dimension]);
  for (const costs of [steps.recordedCost, steps.estimatedCost])
    for (const value of costs)
      if (!Number.isNaN(value) && (!Number.isFinite(value) || value < 0))
        throw new Error("Invalid step cost");
}

function validatePromptColumns(prompts: PromptColumns): void {
  const { start, ...dimensions } = prompts;
  validateInstants(start, false);
  for (const values of Object.values(dimensions)) validateCodes(values);
}

function validateInstants(values: Float64Array, nullable: boolean): void {
  for (const value of values) {
    if (!(nullable && Number.isNaN(value)) && !Number.isSafeInteger(value))
      throw new Error("Invalid step instant");
  }
}

function validateCodes(values: Float64Array): void {
  for (const code of values) {
    if (!Number.isNaN(code) && (!Number.isSafeInteger(code) || code < 0 || code > 0xffffffff))
      throw new Error("Invalid browser copy dimension code");
  }
}

function validateRequiredCodes(values: Float64Array): void {
  validateCodes(values);
  if (values.some(Number.isNaN)) throw new Error("Invalid browser copy required code");
}

function validateIdentities(current: Float64Array, deleted: Float64Array): void {
  validateRequiredCodes(current);
  validateRequiredCodes(deleted);
  const identities = [...current, ...deleted];
  if (new Set(identities).size !== identities.length)
    throw new Error("Duplicate browser copy fact code");
}

export function encode(copy: BrowserCopy): ArrayBuffer {
  const rows = copy.steps.start.length;
  const sessionCount = copy.sessions.code.length;
  const promptCount = copy.prompts.start.length;
  const toolCount = copy.tools.start.length;
  const values = [
    ...columns.map((field) => copy.steps[field]),
    ...promptFields.map((field) => copy.prompts[field]),
    ...toolFields.map((field) => copy.tools[field]),
    ...sessionFields.map((field) => copy.sessions[field]),
    copy.projects,
    copy.sessionTombstones,
    copy.projectTombstones,
  ];
  const stringOffset = checkedLength(
    headerLength + values.reduce((size, column) => size + column.length * 8, 0),
  );
  if (copy.ids.length !== rows) throw new Error("Inconsistent browser copy ID columns");
  if (copy.promptIds.length !== promptCount)
    throw new Error("Inconsistent browser copy prompt IDs");
  if (copy.toolIds.length !== toolCount) throw new Error("Inconsistent browser copy tool IDs");
  if (toolFields.some((field) => copy.tools[field].length !== toolCount))
    throw new Error("Inconsistent browser copy tool columns");
  const strings = encodeStrings(copy);
  const length = checkedLength(stringOffset + strings.length);
  validateGeneration(copy.generation);
  const buffer = new ArrayBuffer(length);
  const header = new DataView(buffer);
  header.setUint32(0, magic, true);
  header.setUint32(4, formatVersion, true);
  for (const [i, char] of copy.generation.split("").entries())
    header.setUint8(8 + i, char.charCodeAt(0));
  header.setUint32(44, copy.kind === "whole" ? 0 : 1, true);
  header.setFloat64(48, copy.fromRevision, true);
  header.setFloat64(56, copy.revision, true);
  header.setFloat64(64, copy.historyCompleteFrom, true);
  header.setUint32(72, rows, true);
  header.setUint32(76, length, true);
  header.setUint32(80, strings.length, true);
  header.setUint32(84, copy.tombstones.length, true);
  header.setUint32(88, copy.names.length, true);
  header.setUint32(96, sessionCount, true);
  header.setUint32(100, copy.projects.length, true);
  header.setUint32(104, copy.sessionTombstones.length, true);
  header.setUint32(108, copy.projectTombstones.length, true);
  header.setUint32(112, promptCount, true);
  header.setUint32(116, toolCount, true);
  let offset = headerLength;
  for (const [index, column] of values.entries()) {
    if (index < columns.length && column.length !== rows)
      throw new Error("Inconsistent browser copy columns");
    if (
      index >= columns.length &&
      index < columns.length + promptFields.length &&
      column.length !== promptCount
    )
      throw new Error("Inconsistent browser copy prompt columns");
    if (
      index >= columns.length + promptFields.length + toolFields.length &&
      index < columns.length + promptFields.length + toolFields.length + sessionFields.length &&
      column.length !== sessionCount
    )
      throw new Error("Inconsistent browser copy session columns");
    for (const value of column) {
      header.setFloat64(offset, value, true);
      offset += 8;
    }
  }
  new Uint8Array(buffer, stringOffset).set(strings);
  decode(buffer);
  return buffer;
}
