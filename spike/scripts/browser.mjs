import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const server = createServer((request, response) => {
  const path = request.url?.startsWith("/assets/") ? request.url : "/_shell.html";
  void readFile(join(import.meta.dirname, "../dist/client", path)).then((body) => {
    response.setHeader("Content-Type", path.endsWith(".js") ? "text/javascript" : "text/html");
    response.end(body);
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Missing port");
const browser = await chromium.launch({ headless: true });
const baseUrl = process.env["SPIKE_URL"] ?? `http://127.0.0.1:${address.port}`;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/`);
  await page.getByRole("heading", { name: "Overview" }).waitFor();
  await page.getByRole("link", { name: "Models" }).click();
  await page.getByRole("heading", { name: "Models" }).waitFor();
  if (!page.url().endsWith("/models")) throw new Error("Navigation URL mismatch");
  await page.getByRole("button", { name: "Overview" }).click();
  await page.getByRole("heading", { name: "Overview" }).waitFor();
  await page.goto(`${baseUrl}/models`);
  await page.getByRole("heading", { name: "Models" }).waitFor();
  if (errors.length) throw new Error(errors.join("\n"));
  process.stdout.write("PASS: Overview → Models → Overview; direct /models load; no page errors\n");
} finally {
  await browser.close();
  server.close();
}
