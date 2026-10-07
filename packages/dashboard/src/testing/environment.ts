import { vi } from "vitest";

export const dashboardEnvironment = (address: string) => {
  window.history.replaceState(null, "", address);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", () => {});
};
