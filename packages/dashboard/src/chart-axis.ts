import type { ChartTick } from "@tanstack/charts";

// HTML text has a real CSS background: axe cannot resolve SVG text over an image.
export const paintChartAxis = (axis: Element, ticks: readonly ChartTick[], height: number) => {
  axis.replaceChildren(
    ...ticks.map((tick) => {
      const label = document.createElement("span");
      label.textContent = tick.label;
      label.style.top = `${(tick.position / height) * 100}%`;
      return label;
    }),
  );
};
