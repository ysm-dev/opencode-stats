import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import { changes } from "./change-time.ts";

export type MediaSize = {
  coarse: boolean;
  hover: boolean;
  desktop: boolean;
  columnWidth: number;
  forcedColours: boolean;
  short: boolean;
};
export const initialMedia: MediaSize = {
  coarse: false,
  hover: true,
  desktop: true,
  columnWidth: 960,
  forcedColours: false,
  short: false,
};
const MediaSizeContext = createContext<Accessor<MediaSize>>();
export const useMediaSize = () => useContext(MediaSizeContext)!;

// Only this boundary reads browser sensors. All drawing consumes the same six
// signals; column narrowness is derived from its measured width, not the window.
export const MediaSizeProvider = (
  props: ParentProps<{ value?: Accessor<MediaSize> | undefined }>,
) => {
  const [media, setMedia] = createSignal(initialMedia);
  const update = (next: Partial<MediaSize>) =>
    changes.local("resize", () => setMedia((before) => ({ ...before, ...next })));
  onMount(() => {
    if (props.value) return;
    const queries = [
      ["coarse", "(any-pointer: coarse)"],
      ["hover", "(hover: hover)"],
      ["desktop", "(min-width: 768px)"],
      ["forcedColours", "(forced-colors: active)"],
      ["short", "(max-height: 479px)"],
    ] as const;
    for (const [key, query] of queries) {
      const sensor = window.matchMedia(query);
      update({ [key]: sensor.matches });
      const change = () => update({ [key]: sensor.matches });
      sensor.addEventListener("change", change);
      onCleanup(() => sensor.removeEventListener("change", change));
    }
    const column = document.getElementById("main")!;
    update({ columnWidth: Math.max(1, column.clientWidth - 48) });
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((item) => item.target === column);
      if (entry) update({ columnWidth: entry.contentRect.width });
    });
    observer.observe(column);
    onCleanup(() => observer.disconnect());
  });
  return (
    <MediaSizeContext.Provider value={props.value ?? media}>
      {props.children}
    </MediaSizeContext.Provider>
  );
};
