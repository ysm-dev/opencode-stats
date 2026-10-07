import axe from "axe-core";
import { expect } from "vitest";

export const accessible = async (container: HTMLElement = document.body) => {
  const started = performance.now();
  process.stderr.write(`[DEBUG-axe-duration] start ${container.querySelectorAll("*").length}\n`);
  const result = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
    // Run every rule, but avoid serializing selectors for hundreds of passing marks.
    resultTypes: ["violations", "incomplete"],
  });
  process.stderr.write(`[DEBUG-axe-duration] end ${performance.now() - started}\n`);
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
};
