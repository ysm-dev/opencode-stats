import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { chromium } from "playwright";

let cssRequested: () => void = () => undefined;
const requested = new Promise<void>((resolve) => {
  cssRequested = resolve;
});
let releaseCss: () => void = () => undefined;
const held = new Promise<void>((resolve) => {
  releaseCss = resolve;
});

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const path = pathname.startsWith("/assets/") ? pathname : "/index.html";
  void readFile(join(import.meta.dirname, "dist", path))
    .then((body) => {
      const contentType = path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : "text/html";
      response.setHeader("Content-Type", contentType);
      return response.end(body);
    })
    .catch(() => {
      response.writeHead(404);
      response.end("Not found");
    });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${baseUrl}/`);
  await page.getByRole("heading", { name: "Overview" }).waitFor();
  assert.equal(await page.title(), "Overview");
  assert.equal(await page.locator('head link[rel="stylesheet"]').count(), 1);
  assert.equal(
    await page.locator("main").evaluate((main) => getComputedStyle(main).padding),
    "32px",
  );
  await page.getByRole("link", { name: "Models" }).click();
  await page.getByRole("heading", { name: "Models" }).waitFor();
  assert(page.url().endsWith("/models"));
  assert.equal(await page.title(), "Models");
  await page.getByRole("button", { name: "Overview" }).click();
  await page.getByRole("heading", { name: "Overview" }).waitFor();
  assert.equal(await page.title(), "Overview");
  await page.goto(`${baseUrl}/models`);
  await page.getByRole("heading", { name: "Models" }).waitFor();
  assert.equal(await page.title(), "Models");
  assert.deepEqual(errors, []);

  const coldPage = await browser.newPage();
  await coldPage.route("**/*.css", async (route) => {
    cssRequested();
    await held;
    await route.continue();
  });
  await coldPage.goto(`${baseUrl}/`, { waitUntil: "commit" });
  await requested;
  await setTimeout(150);
  assert.equal(await coldPage.evaluate(() => performance.getEntriesByType("paint").length), 0);
  releaseCss();
  await coldPage.getByRole("heading", { name: "Overview" }).waitFor();
  assert.equal(
    await coldPage.locator("main").evaluate((main) => getComputedStyle(main).padding),
    "32px",
  );
  process.stdout.write(
    "PASS: navigation, direct /models, dynamic titles, global CSS; no page/console errors; no paint while CSS is held\n",
  );
} finally {
  await browser.close();
  server.close();
}
