import { For, Show, useContext } from "solid-js";
import { PageState } from "./page-context.ts";
import { stateMark } from "./change-time.ts";

export const PreviousNumber = (props: {
  metric:
    | "tokens"
    | "sessions"
    | "steps"
    | "prompts"
    | "failed"
    | "response"
    | "cacheHitRate"
    | "tools"
    | "cost";
}) => {
  const state = useContext(PageState)!;
  return (
    <Show when={state().comparison[props.metric]}>
      <p class="previous-period" data-state={stateMark(state())}>
        {state().comparison[props.metric]}
        <br />
        <small>{state().comparison.caption}</small>
      </p>
    </Show>
  );
};
const number = (value: number | null, digits = 2) =>
  value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });
const percent = (value: number | null) => (value === null ? "—" : `${number(value * 100)}%`);
const duration = (value: number | null) => (value === null ? "—" : `${number(value / 1000, 3)} s`);
const HeadlineText = (props: { text: string; about: boolean }) => (
  <>
    <span aria-hidden={props.about || undefined}>
      {props.about ? "≈ " : ""}
      {props.text}
    </span>
    <Show when={props.about}>
      <span class="sr-only">about {props.text}</span>
    </Show>
  </>
);
const Headline = (props: {
  id: string;
  title: string;
  about?: boolean;
  value: string;
  line?: string;
  metric: Parameters<typeof PreviousNumber>[0]["metric"];
  children?: import("solid-js").JSX.Element;
}) => {
  const state = useContext(PageState)!;
  return (
    <section
      aria-labelledby={props.id}
      data-state={stateMark(state())}
      data-generation={state().generation}
      data-revision={state().revision}
      data-range={state().address}
    >
      <h2 id={props.id}>
        <HeadlineText text={props.title} about={props.about ?? false} />
      </h2>
      <p class="headline-number">
        <HeadlineText text={props.value} about={props.about ?? false} />
      </p>
      <Show when={props.line}>
        <p>{props.line}</p>
      </Show>
      {props.children}
      <PreviousNumber metric={props.metric} />
    </section>
  );
};
export const StepHeadlines = () => {
  const state = useContext(PageState)!;
  const metrics = () => state().metrics;
  const recordedFrom = () => metrics().response.recordedFrom;
  return (
    <>
      <Headline
        id="cost"
        title="Cost"
        about
        value={metrics().cost.estimated === null ? "—" : `$${number(metrics().cost.estimated)}`}
        line={`$${number(metrics().cost.recorded)} recorded cost · ${percent(metrics().cost.pricedShare)} of tokens priced`}
        metric="cost"
      />
      <Headline
        id="steps"
        title="Steps"
        value={number(metrics().steps)}
        line={`${number(metrics().stepsPerPrompt)} per prompt`}
        metric="steps"
      />
      <Headline id="prompts" title="Prompts" value={number(metrics().prompts)} metric="prompts" />
      <Headline
        id="failed-steps"
        title="Failed steps"
        value={number(metrics().failed)}
        line={`${percent(metrics().failureRate)} failure rate · ${number(metrics().interrupted)} interrupted`}
        metric="failed"
      >
        <Show when={metrics().errors.length > 0}>
          <ul aria-label="Failure rate by error type">
            <For each={metrics().errors}>
              {(error) => (
                <li>
                  {error.name} · {number(error.failed)} failed · {percent(error.rate)}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Headline>
      <Headline
        id="response-time"
        title="Response time p50"
        value={duration(metrics().response.p50)}
        line={`p95 ${duration(metrics().response.p95)} · ${percent(metrics().response.timedShare)} of steps timed`}
        metric="response"
      >
        <Show when={recordedFrom() !== null}>
          <p>Recorded from {state().recordedFromLabel}</p>
        </Show>
      </Headline>
      <Headline
        id="cache-hit-rate"
        title="Cache hit rate"
        value={percent(metrics().cacheHitRate)}
        line={`context size median ${number(metrics().context.median)}`}
        metric="cacheHitRate"
      />
      <ToolHeadline />
    </>
  );
};

const ToolHeadline = () => {
  const state = useContext(PageState)!;
  const tools = () => state().tools;
  const outcomes = ["succeeded", "failed", "stopped"] as const;
  return (
    <Headline id="tool-calls" title="Tool calls" value={number(tools().calls)} metric="tools">
      <p data-state={stateMark(state())}>
        {outcomes.map((outcome) => `${number(tools()[outcome])} ${outcome}`).join(", ")}
        <Show when={tools().pending > 0}>{`, ${number(tools().pending)} none yet`}</Show>
      </p>
      <div class="tool-outcomes" aria-hidden="true" data-state={stateMark(state())}>
        <For each={outcomes.filter((outcome) => tools()[outcome] > 0)}>
          {(outcome) => <span data-outcome={outcome} style={{ "flex-grow": tools()[outcome] }} />}
        </For>
      </div>
    </Headline>
  );
};
