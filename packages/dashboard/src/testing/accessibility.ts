import axe from "axe-core";
import { expect } from "vitest";

export const accessible = async (container: HTMLElement = document.body) => {
  const started = performance.now();
  const result = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
    // Run every rule, but avoid serializing selectors for hundreds of passing marks.
    resultTypes: ["violations", "incomplete"],
  });
  process.stderr.write(`[DEBUG-a11y-duration] ${performance.now() - started}ms\n`);
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
};
