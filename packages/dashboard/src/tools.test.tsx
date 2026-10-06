import { cleanup, within } from "@solidjs/testing-library";
import { beforeEach, afterEach, onTestFinished, expect, it, vi } from "vitest";
import { toolCopy } from "@opencode-stats/engine/testing";
import { dashboardEnvironment } from "./testing/environment.ts";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";
import { accessible } from "./testing/accessibility.ts";

beforeEach(() => dashboardEnvironment("/?range=today"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the calls headline and outcome bar with readable exact outcome text, including calls with no outcome yet", async () => {
  const f = dashboardFixture(toolCopy());
  onTestFinished(f.close);
  const headline = await f.view.findByRole("region", { name: "Tool calls", exact: true });
  expect(headline.querySelector(".headline-number")!.textContent).toBe("11");
  expect(headline.textContent).toContain("6 succeeded, 2 failed, 2 stopped, 1 none yet");
  expect(headline.querySelector(".previous-period")!.textContent).toContain("↑ 1,000%");
  const bar = headline.querySelector(".tool-outcomes")!;
  expect(bar.getAttribute("aria-hidden")).toBe("true");
  expect(bar.querySelectorAll("span")).toHaveLength(3);
  expect(bar.getAttribute("data-state")).toBe(headline.getAttribute("data-state"));
  await accessible(f.view.container);
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit({ ...toolCopy(), revision: 2, toolIds: [], tools: toolCopy([]).tools });
  await vi.waitFor(() => expect(headline.querySelector(".headline-number")!.textContent).toBe("0"));
  expect(headline.textContent).toContain("0 succeeded, 0 failed, 0 stopped");
  expect(headline.textContent).not.toContain("none yet");
  expect(bar.querySelectorAll("span")).toHaveLength(0);
});

it("puts the native Tool checklist under Tool calls only, counts calls not tokens, and keeps other headlines unchanged", async () => {
  const f = dashboardFixture(toolCopy());
  onTestFinished(f.close);
  const region = await f.view.findByRole("region", { name: "Tool", exact: true });
  expect(region.previousElementSibling!.textContent).toBe("Tool calls only");
  const tools = within(region);
  expect(tools.getByText("5 tool calls")).toBeTruthy();
  const headline = f.view.getByRole("region", { name: "Tool calls", exact: true });
  const otherNumbers = () =>
    [...f.view.container.querySelectorAll(".headline-number")]
      .filter((element) => !headline.contains(element))
      .map((element) => element.textContent);
  const before = otherNumbers();
  const read = tools.getByRole("checkbox", { name: "read" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const requests = f.server.requests;
  await f.user.click(read);
  const chip = await f.view.findByRole("button", { name: "Remove Tool filter · read" });
  expect(chip.textContent).toBe("Tool calls: read ×");
  expect(headline.querySelector(".headline-number")!.textContent).toBe("5");
  expect(headline.textContent).toContain("4 succeeded, 1 failed, 0 stopped");
  expect(tools.getByText("5 tool calls")).toBeTruthy();
  expect(otherNumbers()).toEqual(before);
  expect(document.activeElement).toBe(read);
  expect(new URL(window.location.href).searchParams.get("f.tool")).toBe("read");
  await f.user.click(chip);
  await vi.waitFor(() => expect(chip.isConnected).toBe(false));
  expect(document.activeElement).toBe(f.view.getByRole("heading", { name: "Active filters" }));
  expect(headline.querySelector(".headline-number")!.textContent).toBe("11");
  expect(f.server.requests).toBe(requests);
  await accessible(f.view.container);
});
