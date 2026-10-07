import { webkit, type BrowserType } from "playwright";
import { preferencesBrowser } from "./preferences-server.ts";

type Writer = Awaited<ReturnType<typeof preferencesBrowser>>["server"]["writer"];

const seedFilters = (writer: Writer) => {
  writer.reset();
  const now = Date.now() - 60000;
  for (let i = 0; i < 7; i++) {
    const session = `ses-filter-${i}`;
    writer.session(session, null, { title: `Synthetic ${i}` });
    writer.message({
      id: `msg-filter-${i}`,
      session,
      seq: 0,
      start: now,
      model: `filter-model-${i}`,
      provider: `filter-provider-${i % 2}`,
      variant: i % 2 ? "high" : "default",
      agent: i % 2 ? "plan" : "build",
      tokens: { input: (i + 1) * 100 },
    });
  }
};

export async function filterBrowser(browser: BrowserType) {
  await using resources = new AsyncDisposableStack();
  const touch = browser === webkit;
  const fixture = resources.use(
    await preferencesBrowser(browser, {
      hasTouch: touch,
      viewport: { width: touch ? 360 : 1280, height: 720 },
      timezoneId: "UTC",
    }),
  );
  const page = await fixture.context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${fixture.server.origin}/?range=all`);
  // Observe the default fact before deleting it: its permanent model name stays
  // in this generation. Seven current models plus that zero-token value = eight.
  await page.waitForFunction(
    () => document.querySelector(".headline-number")?.textContent === "987",
  );
  seedFilters(fixture.server.writer);
  await page.waitForFunction(
    () => document.querySelector(".headline-number")?.textContent === "2,800",
  );
  return Object.assign(resources.move(), {
    server: fixture.server,
    context: fixture.context,
    page,
    errors,
  });
}
