import { cleanup, within } from "@solidjs/testing-library";
import { beforeEach, afterEach, onTestFinished, expect, it, vi } from "vitest";
import { filterCopy } from "@opencode-stats/engine/testing";
import { dashboardEnvironment } from "./testing/environment.ts";
import { dashboardFixture } from "./testing/dashboard-fixture.tsx";
import { accessible } from "./testing/accessibility.ts";

beforeEach(() => dashboardEnvironment("/?range=all"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const filtersDashboard = (deliverAnswer: (deliver: () => void) => void = queueMicrotask) => {
  const f = dashboardFixture(filterCopy(), deliverAnswer);
  const { view } = f;
  onTestFinished(f.close);
  const number = () =>
    view.getByRole("region", { name: "Tokens" }).querySelector(".headline-number")!.textContent;
  const models = () => within(view.getByRole("region", { name: "Model" }));
  const announcement = () => view.container.querySelector(".filter-announcement")!.textContent;
  return { ...f, number, models, announcement };
};

const checkboxInput = (element: HTMLElement) => {
  if (!(element instanceof HTMLInputElement)) throw new Error("Expected a native checkbox input");
  expect(element.type).toBe("checkbox");
  return element;
};

it("renders native checklists below Pages, top five token amounts, proportional bars, search counts, and an accessible expanded list", async () => {
  const f = filtersDashboard();
  const search = await f.view.findByRole("searchbox", { name: "Search Model" });
  expect(f.view.getAllByRole("searchbox").map((box) => box.getAttribute("id"))).toEqual([
    "filter-search-project",
    "filter-search-provider",
    "filter-search-model",
    "filter-search-variant",
    "filter-search-agent",
    "filter-search-tool",
  ]);
  expect(
    f
      .models()
      .getAllByRole("checkbox")
      .map((box) => box.getAttribute("aria-label")),
  ).toEqual(["Model 6", "Model 5", "Model 4", "Model 3", "Model 2"]);
  expect(f.models().getByText("770 tokens")).toBeTruthy();
  const largest = f.models().getByRole("checkbox", { name: "Model 6" });
  expect(largest.closest("label")!.querySelector<HTMLElement>(".filter-bar")!.style.width).toBe(
    "100%",
  );
  expect(
    Number.parseFloat(
      f
        .models()
        .getByRole("checkbox", { name: "Model 3" })
        .closest("label")!
        .querySelector<HTMLElement>(".filter-bar")!.style.width,
    ),
  ).toBeCloseTo((440 / 770) * 100);
  const more = f.models().getByRole("button", { name: "2 more" });
  await f.user.click(more);
  expect(document.activeElement).toBe(f.models().getByRole("checkbox", { name: "Model 1" }));
  expect(f.models().getAllByRole("checkbox")).toHaveLength(7);
  expect(more.isConnected).toBe(false);
  await f.user.type(search, "model 0");
  expect(f.models().getAllByRole("checkbox")).toHaveLength(1);
  expect(
    f.view.getByRole("region", { name: "Model" }).querySelector("[aria-live]")!.textContent,
  ).toBe("1 results");
  await f.user.clear(search);
  expect(f.models().getAllByRole("checkbox")).toHaveLength(7);
  await f.user.type(search, "no such model");
  expect(f.models().queryAllByRole("checkbox")).toEqual([]);
  expect(
    f.view.getByRole("region", { name: "Model" }).querySelector("[aria-live]")!.textContent,
  ).toBe("No matches");
  expect(document.activeElement).toBe(search);
  await f.user.clear(search);
  await f.user.type(search, "provider-1");
  expect(f.models().getAllByRole("checkbox")).toHaveLength(3);
  expect(
    f.view.getByRole("region", { name: "Model" }).querySelector("[aria-live]")!.textContent,
  ).toBe("3 results");
  await accessible(f.view.container);
});

it("ticks and unticks with the headlines and all other checklist amounts, preserves focused controls, and sends no requests", async () => {
  const f = filtersDashboard();
  const model = checkboxInput(await f.view.findByRole("checkbox", { name: "Model 6" }));
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const requests = f.server.requests;
  await f.user.click(model);
  await vi.waitFor(() => expect(f.number()).toBe("770"));
  expect(model.checked).toBe(true);
  expect(document.activeElement).toBe(model);
  expect(f.models().getByText("660 tokens")).toBeTruthy();
  expect(within(f.view.getByRole("region", { name: "Agent" })).getByText("70 tokens")).toBeTruthy();
  expect(f.announcement()).toBe("");
  expect(f.view.getByRole("status").textContent).toBe("");
  await f.user.click(await f.view.findByRole("checkbox", { name: "Model 5" }));
  await vi.waitFor(() => expect(f.number()).toBe("1,430"));
  const build = f.view.getByRole("checkbox", { name: "build" });
  await f.user.click(build);
  await vi.waitFor(() => expect(f.number()).toBe("670"));
  expect(document.activeElement).toBe(build);
  expect(
    new Set(
      [...f.view.container.querySelectorAll("[data-range]")].map((element) =>
        element.getAttribute("data-range"),
      ),
    ).size,
  ).toBe(1);
  await f.user.click(model);
  await vi.waitFor(() => expect(f.number()).toBe("600"));
  expect(model.checked).toBe(false);
  expect(document.activeElement).toBe(model);
  const clear = f.view.getByRole("button", { name: "Clear all" });
  await f.user.click(clear);
  await vi.waitFor(() => expect(f.number()).toBe("3,080"));
  expect(document.activeElement).toBe(clear);
  expect(f.view.queryByRole("button", { name: /Remove .* filter/ })).toBeNull();
  expect(f.announcement()).toBe("Filters cleared");
  expect(f.server.requests).toBe(requests);
});

it("removes chips with next, previous and heading focus, announces only user changes, and leaves live announcements independent", async () => {
  const f = filtersDashboard();
  await f.view.findByRole("checkbox", { name: "Model 6" });
  for (const name of ["Model 6", "Model 5", "Model 4"])
    await f.user.click(f.view.getByRole("checkbox", { name }));
  const second = f.view.getByRole("button", { name: "Remove Model filter · Model 5" });
  await f.user.click(f.view.getByRole("button", { name: "Remove Model filter · Model 6" }));
  await vi.waitFor(() => expect(document.activeElement).toBe(second));
  expect(f.announcement()).toBe("Filter removed: model Model 6");
  await f.user.click(f.view.getByRole("button", { name: "Remove Model filter · Model 4" }));
  await vi.waitFor(() => expect(document.activeElement).toBe(second));
  await f.user.click(second);
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(f.view.getByRole("heading", { name: "Active filters" })),
  );
  expect(f.number()).toBe("3,080");
  const announced = f.announcement();
  const changes: string[] = [];
  const observer = new MutationObserver(() => changes.push(f.announcement()));
  observer.observe(f.view.container.querySelector(".filter-announcement")!, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  f.server.commit({ ...filterCopy(), revision: 2 });
  await vi.waitFor(() =>
    expect(f.view.container.querySelector(".filters")!.getAttribute("data-revision")).toBe("2"),
  );
  await f.clock.advance(60);
  expect(f.announcement()).toBe(announced);
  expect(changes).toEqual([]);
  observer.disconnect();
  await accessible(f.view.container);
});

it("restores bookmarks, raw unknown chips and Back/Forward by permanent IDs without filtering over the network", async () => {
  window.history.replaceState(
    null,
    "",
    "/?range=all&f.model=unknown%2Bmodel&f.session=deleted-session",
  );
  const f = filtersDashboard();
  const model = await f.view.findByRole("button", { name: "Remove Model filter · unknown+model" });
  expect(f.number()).toBe("0");
  expect(
    f.view.getByRole("button", { name: "Remove Session filter · deleted-session" }),
  ).toBeTruthy();
  const bookmarked = window.location.search;
  await f.user.click(model);
  await vi.waitFor(() =>
    expect(f.view.queryByRole("button", { name: /unknown\+model/ })).toBeNull(),
  );
  expect(f.number()).toBe("0");
  window.history.back();
  await f.view.findByRole("button", { name: "Remove Model filter · unknown+model" });
  expect(window.location.search).toBe(bookmarked);
  window.history.forward();
  await vi.waitFor(() =>
    expect(f.view.queryByRole("button", { name: /unknown\+model/ })).toBeNull(),
  );
  await f.user.click(f.view.getByRole("button", { name: "Clear all" }));
  await vi.waitFor(() => expect(f.number()).toBe("3,080"));
  expect(window.location.search).toBe("?range=all");
  expect(f.server.requests).toBe(2);
});

it("recovers focused deleted checklist rows at the same complete live paint, without announcing live data", async () => {
  const f = filtersDashboard();
  const project = await f.view.findByRole("checkbox", { name: "Project 1" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  project.focus();
  f.server.commit({ ...filterCopy(), revision: 2, projects: new Float64Array([100]) });
  await vi.waitFor(() => expect(project.isConnected).toBe(false));
  expect(document.activeElement).toBe(f.view.getByRole("checkbox", { name: "Project 0" }));
  f.server.commit({ ...filterCopy(), revision: 3, projects: new Float64Array() });
  await vi.waitFor(() => expect(f.view.queryByRole("checkbox", { name: "Project 0" })).toBeNull());
  expect(document.activeElement).toBe(f.view.getByRole("heading", { name: "Project" }));
  expect(f.announcement()).toBe("");
});

it.each([
  {
    removed: "Model 6",
    kept: "Model 5",
    amount: "660",
    ids: ["provider-0/model-6", "provider-1/model-5"],
  },
  {
    removed: "Model 5",
    kept: "Model 6",
    amount: "770",
    ids: ["provider-0/model-6", "provider-1/model-5"],
  },
  { removed: "Model 6", kept: "", amount: "3,080", ids: ["provider-0/model-6"] },
])(
  "removes $removed idempotently after delayed double activation and moves focus only at the whole final paint",
  async ({ removed, kept, amount, ids }) => {
    const params = new URLSearchParams({ range: "all" });
    for (const id of ids) params.append("f.model", id);
    window.history.replaceState(null, "", `/?${params}`);
    let waiting = false;
    const replies: (() => void)[] = [];
    const f = filtersDashboard((answer) => {
      if (waiting) replies.push(answer);
      else queueMicrotask(answer);
    });
    const chip = await f.view.findByRole("button", { name: `Remove Model filter · ${removed}` });
    const checkbox = checkboxInput(f.view.getByRole("checkbox", { name: removed }));
    const destination = kept
      ? f.view.getByRole("button", { name: `Remove Model filter · ${kept}` })
      : f.view.getByRole("heading", { name: "Active filters" });
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    const before = { tokens: f.number(), address: window.location.search };
    const requests = f.server.requests;
    const announced: string[] = [];
    const observer = new MutationObserver(() => announced.push(f.announcement()));
    observer.observe(f.view.container.querySelector(".filter-announcement")!, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    onTestFinished(() => observer.disconnect());
    waiting = true;
    await f.user.dblClick(chip);
    await vi.waitFor(() => expect(replies).toHaveLength(2));
    expect(checkbox.checked).toBe(true);
    expect(chip.isConnected).toBe(true);
    expect(document.activeElement).toBe(chip);
    expect(f.announcement()).toBe("");
    replies.shift()!();
    expect({ tokens: f.number(), address: window.location.search }).toEqual(before);
    expect(chip.isConnected).toBe(true);
    expect(document.activeElement).toBe(chip);
    replies.shift()!();
    await vi.waitFor(() => expect(chip.isConnected).toBe(false));
    expect(f.number()).toBe(amount);
    expect(checkbox.checked).toBe(false);
    expect(document.activeElement).toBe(destination);
    expect(new URL(window.location.href).searchParams.getAll("f.model")).toEqual(
      ids.filter((id) => !id.endsWith(`model-${removed.slice(-1)}`)),
    );
    expect(f.announcement()).toBe(`Filter removed: model ${removed}`);
    await vi.waitFor(() => expect(announced).toEqual([`Filter removed: model ${removed}`]));
    expect(
      new Set(
        [...f.view.container.querySelectorAll("[data-range]")].map((region) =>
          region.getAttribute("data-range"),
        ),
      ).size,
    ).toBe(1);
    expect(f.server.requests).toBe(requests);
  },
);

it("holds native checkbox ticks, chips, amounts and the address at the prior complete state until the worker answer arrives", async () => {
  let hold = false;
  const deliveries: (() => void)[] = [];
  const f = filtersDashboard((deliver) => {
    if (hold) deliveries.push(deliver);
    else queueMicrotask(deliver);
  });
  const checkbox = checkboxInput(await f.view.findByRole("checkbox", { name: "Model 6" }));
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  hold = true;
  const snapshot = () => ({
    tokens: f.number(),
    address: window.location.search,
    chips: f.view.getByRole("region", { name: "Active filters" }).textContent,
  });
  for (const amount of ["770", "3,080", "770"]) {
    const checked = checkbox.checked;
    const before = snapshot();
    await f.user.click(checkbox);
    await vi.waitFor(() => expect(deliveries).toHaveLength(1));
    expect(checkbox.checked).toBe(checked);
    expect(snapshot()).toEqual(before);
    deliveries.shift()!();
    expect(checkbox.checked).toBe(!checked);
    expect(f.number()).toBe(amount);
  }
  const chip = f.view.getByRole("button", { name: "Remove Model filter · Model 6" });
  await f.user.click(chip);
  await vi.waitFor(() => expect(deliveries).toHaveLength(1));
  expect(chip.isConnected).toBe(true);
  expect(document.activeElement).toBe(chip);
  expect(checkbox.checked).toBe(true);
  expect(f.number()).toBe("770");
  await f.user.click(f.view.getByRole("button", { name: "Clear all" }));
  await vi.waitFor(() => expect(deliveries).toHaveLength(2));
  // A newer action replaces a pending chip removal; its stale answer cannot steal focus.
  deliveries.shift()!();
  expect(chip.isConnected).toBe(true);
  deliveries.shift()!();
  await vi.waitFor(() => expect(f.number()).toBe("3,080"));
  expect(checkbox.checked).toBe(false);
  expect(chip.isConnected).toBe(false);
  expect(document.activeElement).toBe(f.view.getByRole("button", { name: "Clear all" }));
  expect(f.server.requests).toBe(2);
});
