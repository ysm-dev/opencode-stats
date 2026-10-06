import axe from "axe-core";
import { expect } from "vitest";

export const accessible = async (container: HTMLElement = document.body) => {
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
};
