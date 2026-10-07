import { render, cleanup } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { MediaSizeProvider, initialMedia, useMediaSize } from "./media-size.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const Probe = () => {
  const media = useMediaSize();
  return <output>{JSON.stringify(media())}</output>;
};

it("the real boundary shares five changing media queries and the column's ResizeObserver, and releases both", () => {
  const sensors = new Map<string, EventTarget & { matches: boolean; media: string }>();
  const remove = vi.fn();
  vi.stubGlobal("matchMedia", (query: string) => {
    const target = new EventTarget();
    const sensor = Object.assign(target, {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: (type: string, callback: EventListenerOrEventListenerObject) => {
        remove(type);
        target.removeEventListener(type, callback);
      },
    });
    sensors.set(query, sensor);
    return sensor;
  });
  let callback!: ResizeObserverCallback;
  const observe = vi.fn();
  const disconnect = vi.fn();
  const observer = { observe, disconnect, unobserve: () => {} };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(run: ResizeObserverCallback) {
        callback = run;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = observer.unobserve;
    },
  );
  const view = render(() => (
    <main id="main">
      <MediaSizeProvider>
        <Probe />
      </MediaSizeProvider>
    </main>
  ));
  const column = view.container.querySelector("main")!;
  expect(observe).toHaveBeenCalledWith(column);
  const entry = (target: Element, width: number): ResizeObserverEntry => ({
    target,
    contentRect: new DOMRect(0, 0, width, 700),
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
  });
  callback([entry(document.body, 999)], observer);
  expect(view.container.textContent).toContain('"columnWidth":1');
  callback([entry(column, 360)], observer);
  expect(view.container.textContent).toContain('"columnWidth":360');
  for (const [query, key] of [
    ["(any-pointer: coarse)", "coarse"],
    ["(hover: hover)", "hover"],
    ["(min-width: 768px)", "desktop"],
    ["(forced-colors: active)", "forcedColours"],
    ["(max-height: 479px)", "short"],
  ]) {
    const sensor = sensors.get(query!)!;
    Object.defineProperty(sensor, "matches", { configurable: true, value: true });
    sensor.dispatchEvent(new Event("change"));
    expect(view.container.textContent).toContain(`"${key}":true`);
  }
  view.unmount();
  expect(remove).toHaveBeenCalledTimes(5);
  expect(disconnect).toHaveBeenCalledOnce();
});

it("every form can instead be driven solely by the shared signals, without consulting browser sensors", () => {
  const matchMedia = vi.fn();
  vi.stubGlobal("matchMedia", matchMedia);
  const [media, setMedia] = createSignal(initialMedia);
  const view = render(() => (
    <MediaSizeProvider value={media}>
      <Probe />
    </MediaSizeProvider>
  ));
  setMedia({
    ...initialMedia,
    columnWidth: 190,
    coarse: true,
    hover: false,
    desktop: false,
    forcedColours: true,
    short: true,
  });
  expect(view.container.textContent).toContain('"columnWidth":190');
  expect(matchMedia).not.toHaveBeenCalled();
});
