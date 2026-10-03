// PROTOTYPE: width and pointer signals. Layout follows width; target size and tap behaviour
// follow the pointer, so a narrow mouse window and a wide touchscreen each get the right one.
import { createSignal, onCleanup } from "solid-js";
import { touch } from "../../state";

export function media(query: string): () => boolean {
  const list = matchMedia(query);
  const [matches, setMatches] = createSignal(list.matches);
  const update = () => setMatches(list.matches);
  list.addEventListener("change", update);
  onCleanup(() => list.removeEventListener("change", update));
  return matches;
}

/** Width of the page content column, which charts, tables and the graph adapt to. */
export const [contentWidth, setContentWidth] = createSignal(1000);

/** Below this content width, headline numbers, tables and the graph take their narrow form. */
export const NARROW = 720;
export const narrow = () => contentWidth() < NARROW;
export const phone = () => contentWidth() < 560;

export function observeWidth(el: HTMLElement, set: (width: number) => void): void {
  const observer = new ResizeObserver((entries) => set(entries[0]!.contentRect.width));
  observer.observe(el);
  set(el.getBoundingClientRect().width);
  onCleanup(() => observer.disconnect());
}

const coarse = matchMedia("(any-pointer: coarse)");
const [hasTouch, setHasTouch] = createSignal(coarse.matches);
coarse.addEventListener("change", () => setHasTouch(coarse.matches));

/** A touchscreen is present, or the prototype bar forces the touch presentation. */
export const touchScreen = () => touch() === "on" || hasTouch();

/** Taps inspect; clicks with a mouse act at once. The bar's Touch switch treats clicks as taps. */
export const isTap = (e: PointerEvent | MouseEvent) =>
  touch() === "on" || ("pointerType" in e && e.pointerType !== "" && e.pointerType !== "mouse");
