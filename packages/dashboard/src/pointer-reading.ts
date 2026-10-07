import { onCleanup } from "solid-js";

export function pointerReading(read: (event: PointerEvent) => void) {
  let x: number | undefined;
  let y: number | undefined;
  let moved = false;
  const track = (event: PointerEvent) => {
    moved = event.clientX !== x || event.clientY !== y;
    x = event.clientX;
    y = event.clientY;
  };
  // Scrolling can dispatch pointermove without moving the pointer. Track input
  // outside the drawing too; WebKit's movementX/Y are also zero for real moves.
  const events = ["pointerdown", "pointermove", "pointerup"] as const;
  for (const event of events) window.addEventListener(event, track, true);
  onCleanup(() => {
    for (const event of events) window.removeEventListener(event, track, true);
  });
  return (event: PointerEvent) => {
    if (moved) read(event);
  };
}
