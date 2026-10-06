import { chromium } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";

it("keeps the packed tab's facts through a server stop/restart and pauses live work", async () => {
  await using fixture = await preferencesBrowser(chromium);
  const page = await fixture.context.newPage();
  await page.goto(`${fixture.server.origin}/?range=all`);
  const number = page.locator(".headline-number");
  await number.getByText("987", { exact: true }).waitFor();
  await fixture.server.stop();
  await page
    .getByRole("button", { name: "Not updating · Pause live updates", exact: true })
    .waitFor({ timeout: 6500 });
  expect(await number.textContent()).toBe("987");
  expect(await page.locator(".update-status").textContent()).toMatch(
    /Not updating since \d\d:\d\d · the dashboard server isn't running/u,
  );
  expect(await page.getByRole("status").textContent()).toContain(
    "the dashboard server isn't running",
  );
  fixture.server.writer.message({
    id: "msg-preferences",
    session: "ses-preferences",
    seq: 0,
    start: 1,
    tokens: { input: 2001 },
  });
  await fixture.server.start();
  await number.getByText("2,001", { exact: true }).waitFor();
  expect(await page.locator(".update-status").count()).toBe(0);
  expect(await page.getByRole("status").textContent()).toBe("Up to date again");
  await page.getByRole("button", { name: /Pause live updates/u }).click();
  expect(await page.locator(".update-status").textContent()).toMatch(
    /Paused at \d\d:\d\d · Resume/u,
  );
  fixture.server.writer.revert("ses-preferences", 0);
  await page.waitForTimeout(2200);
  expect(await number.textContent()).toBe("2,001");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await number.getByText("0", { exact: true }).waitFor();
  expect(await page.locator(".update-status").count()).toBe(0);
  expect(page.url()).toBe(`${fixture.server.origin}/?range=all`);
});
