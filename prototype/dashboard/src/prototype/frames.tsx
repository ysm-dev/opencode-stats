// PROTOTYPE chrome, not part of any design: the dashboard in frames of real widths, so its media
// and container queries respond as they would in a window that size. Settings from the bar reach
// every frame; range, filters and page follow whichever frame was used last.
import { createMemo, createSignal, Index, onCleanup, onMount } from "solid-js";
import { isProtoParam, setBroadcaster } from "../state";

const SIZES: Record<string, number[]> = {
  "360": [360],
  "390": [390],
  "768": [768],
  "1024": [1024],
  "1280": [1280],
  all: [360, 768, 1280],
};
export const FRAME_OPTIONS: [string, string][] = [
  ["", "full"],
  ["360", "360"],
  ["390", "390"],
  ["768", "768"],
  ["1024", "1024"],
  ["1280", "1280"],
  ["all", "360·768·1280"],
];

const GAP = 24;

export function Frames(props: { frame: string }) {
  const frames: (HTMLIFrameElement | undefined)[] = [];
  const [view, setView] = createSignal({ w: innerWidth, h: innerHeight });
  const src = () => {
    const p = new URLSearchParams(location.search);
    p.delete("frame");
    p.set("embed", "1");
    return `${location.pathname}?${p}`;
  };
  const post = (message: unknown, except?: MessageEventSource | null) => {
    for (const f of frames) {
      if (f?.isConnected && f.contentWindow && f.contentWindow !== except)
        f.contentWindow.postMessage(message, location.origin);
    }
  };
  setBroadcaster((name, value) => post({ type: "proto:set", name, value }));
  const onMessage = (e: MessageEvent<{ type?: string; search?: string }>) => {
    if (e.origin !== location.origin || e.data?.type !== "proto:url" || !e.data.search) return;
    const inner = new URLSearchParams(e.data.search);
    const next = new URLSearchParams();
    for (const [k, v] of new URLSearchParams(location.search)) if (isProtoParam(k)) next.set(k, v);
    for (const [k, v] of inner) if (!isProtoParam(k)) next.set(k, v);
    history.replaceState(null, "", `?${next}`);
    post({ type: "proto:sync", search: e.data.search }, e.source);
  };
  const resize = () => setView({ w: innerWidth, h: innerHeight });
  onMount(() => {
    addEventListener("resize", resize);
    addEventListener("message", onMessage);
  });
  onCleanup(() => {
    removeEventListener("resize", resize);
    removeEventListener("message", onMessage);
    setBroadcaster(() => {});
  });
  const layout = createMemo(() => {
    const widths = SIZES[props.frame] ?? SIZES["360"]!;
    const availW = view().w - 48 - GAP * (widths.length - 1);
    const availH = view().h - 72 - 26 - 16;
    const scale = Math.min(1, availW / widths.reduce((s, w) => s + w, 0));
    return widths.map((w) => ({ w, h: Math.round(availH / scale), scale }));
  });
  return (
    <div class="proto-frames">
      <Index each={layout()}>
        {(f, i) => (
          <figure class="proto-frame" style={{ width: `${f().w * f().scale}px` }}>
            <figcaption>
              {f().w} px wide
              {f().scale < 1 ? ` · shown at ${Math.round(f().scale * 100)}%` : ""}
            </figcaption>
            <div
              class="proto-frame-box"
              style={{ width: `${f().w * f().scale}px`, height: `${f().h * f().scale}px` }}
            >
              <iframe
                ref={(el) => (frames[i] = el)}
                src={src()}
                title={`Dashboard at ${f().w}px`}
                style={{
                  width: `${f().w}px`,
                  height: `${f().h}px`,
                  transform: `scale(${f().scale})`,
                }}
              />
            </div>
          </figure>
        )}
      </Index>
    </div>
  );
}
