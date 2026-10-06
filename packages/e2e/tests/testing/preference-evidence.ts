import type { Locator, Page } from "playwright";

// Synthetic installed-page tests only. Never read content, URLs, storage or headers.
const installPreferenceEvidence = () => {
  const root = document;
  const trigger = (label: string) => {
    const element = root.querySelector<HTMLElement>(`[role="button"][aria-labelledby~="${label}"]`);
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const hit = document.elementFromPoint(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    return {
      connected: element.isConnected,
      disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
      focused: element === document.activeElement,
      centreHit: hit === element || element.contains(hit),
      rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      transform: style.transform,
      transitionDuration: style.transitionDuration,
      animationDuration: style.animationDuration,
    };
  };
  const snapshot = () => {
    const active = root.activeElement;
    return {
      timeOrigin: performance.timeOrigin,
      time: performance.now(),
      visibility: document.visibilityState,
      focus: document.hasFocus(),
      active: active?.matches("#settings-title")
        ? "settings-heading"
        : active?.matches('[role="option"]')
          ? "option"
          : "other",
      animations: document.getAnimations().length,
      viewport: { width: innerWidth, height: innerHeight },
      theme: trigger("theme-label"),
      scheme: trigger("scheme-label"),
    };
  };
  const frames: Array<ReturnType<typeof snapshot> & { rafTime: number }> = [];
  const events: Array<{ kind: string; time: number; visibility: string; focus: boolean }> = [];
  const lifecycle = (event: Event) => {
    events.push({
      kind: event.type,
      time: performance.now(),
      visibility: document.visibilityState,
      focus: document.hasFocus(),
    });
    if (events.length > 32) events.shift();
  };
  document.addEventListener("visibilitychange", lifecycle);
  for (const kind of ["focus", "blur", "pagehide", "pageshow"])
    window.addEventListener(kind, lifecycle);
  const evidence = {
    running: true,
    rafCount: 0,
    frames,
    events,
    snapshot,
    frame: (rafTime: number) => {
      if (!evidence.running) return;
      evidence.rafCount++;
      frames.push({ ...snapshot(), rafTime });
      if (frames.length > 8) frames.shift();
    },
    stop: () => {
      evidence.running = false;
      cancelAnimationFrame(window.preferenceRAF);
      document.removeEventListener("visibilitychange", lifecycle);
      for (const kind of ["focus", "blur", "pagehide", "pageshow"])
        window.removeEventListener(kind, lifecycle);
    },
  };
  window.preferenceEvidence = evidence;
  return evidence;
};

declare global {
  interface Window {
    preferenceEvidence: ReturnType<typeof installPreferenceEvidence>;
  }
}

// Evaluation has no Playwright timeout. Reporting/cleanup must not mask or hang
// the original failed action if the renderer stops responding.
const boundedEvaluation = async <T>(evaluation: Promise<T>) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      evaluation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Evidence unavailable")), 100);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const preferenceEvidence = async (page: Page) => {
  await page.addInitScript(installPreferenceEvidence);
  const phases: Array<{ sequence: number; time: number; label: string; state: string }> = [];
  let sequence = 0;
  let reported = false;
  const mark = (label: string, state: string) => {
    phases.push({
      sequence: ++sequence,
      time: performance.timeOrigin + performance.now(),
      label,
      state,
    });
    if (phases.length > 64) phases.shift();
  };
  const closed = () => mark("page", "closed");
  const crashed = () => mark("page", "crashed");
  const loaded = () => mark("page", "loaded");
  page.on("close", closed);
  page.on("crash", crashed);
  page.on("load", loaded);
  const report = async () => {
    if (reported) return;
    reported = true;
    const browser = await boundedEvaluation(
      page.evaluate(() => {
        const evidence = window.preferenceEvidence;
        return {
          current: evidence.snapshot(),
          rafCount: evidence.rafCount,
          frames: evidence.frames,
          events: evidence.events,
        };
      }),
    ).catch(() => ({ unavailable: true, pageClosed: page.isClosed() }));
    process.stderr.write(`[preference-failure-evidence] ${JSON.stringify({ phases, browser })}\n`);
  };
  const action = async <T>(label: string, operation: () => Promise<T>) => {
    mark(label, "started");
    try {
      const result = await operation();
      mark(label, "completed");
      return result;
    } catch (error) {
      mark(label, "failed");
      await report().catch(() => {});
      throw error;
    }
  };
  return {
    mark,
    action,
    click: (label: string, locator: Locator) => action(label, () => locator.click()),
    [Symbol.asyncDispose]: async () => {
      page.off("close", closed);
      page.off("crash", crashed);
      page.off("load", loaded);
      await boundedEvaluation(page.evaluate(() => window.preferenceEvidence.stop())).catch(
        () => {},
      );
    },
  };
};
