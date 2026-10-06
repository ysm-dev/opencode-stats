// Recover only focus actually lost by a complete paint. A pending chip removal
// must not steal focus if the user moved to another control while awaiting it.
export function preserveFilterFocus(paint: () => void) {
  const focused = document.activeElement!;
  const section = focused.closest(".filter-checklist, .filter-chips");
  if (!section) {
    paint();
    return;
  }
  const items = [...section.querySelectorAll<HTMLElement>('input[type="checkbox"], button')];
  const index = items.findIndex((item) => item === focused);
  const neighbors = [...items.slice(index + 1), ...items.slice(0, index).reverse()];
  const heading = section.querySelector<HTMLElement>("h2, h3")!;
  paint();
  if (!focused.isConnected) (neighbors.find((item) => item.isConnected) ?? heading).focus();
}
