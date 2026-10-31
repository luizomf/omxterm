import type { AuxiliaryPanelSide } from "../shared/user-configuration";
import type { RendererLanguage } from "./renderer-language";

// Own preferred width, constrained layout and the separator gesture lifetime.
// Hiding/selection remains with the panel; geometry reports insufficient space.
export function createAuxiliaryPanelGeometry(
  root: HTMLElement,
  separator: HTMLElement,
  options: {
    content: HTMLElement;
    language: RendererLanguage;
    interactive(): boolean;
    tooNarrow(): void;
  },
) {
  const page = root.ownerDocument.defaultView!;
  let disposed = false;
  let side: AuxiliaryPanelSide = "right";
  let preferred = 280;
  let maximum = 560;
  let effective = 280;
  let drag: { id: number; x: number; width: number } | undefined;
  let frame: number | undefined;
  const removeLanguage = options.language.bind((t) => {
    separator.setAttribute("aria-label", t("panel.resize"));
    separator.setAttribute(
      "aria-valuetext",
      t("panel.width", { width: effective }),
    );
  });
  const paint = () => {
    effective = Math.max(220, Math.min(preferred, maximum));
    root.style.width = `${effective}px`;
    separator.setAttribute("aria-valuemin", "220");
    separator.setAttribute("aria-valuemax", String(maximum));
    separator.setAttribute("aria-valuenow", String(effective));
    separator.setAttribute(
      "aria-valuetext",
      options.language.t("panel.width", { width: effective }),
    );
  };
  const endDrag = () => {
    const previous = drag;
    drag = undefined;
    if (frame !== undefined) page.cancelAnimationFrame(frame);
    frame = undefined;
    if (previous) {
      separator.classList.remove("dragging");
      if (separator.hasPointerCapture?.(previous.id))
        separator.releasePointerCapture(previous.id);
      paint();
    }
  };
  const measure = () => {
    if (disposed) return false;
    maximum = Math.min(
      560,
      options.content.getBoundingClientRect().width - 186,
    );
    if (maximum < 220) {
      options.tooNarrow();
      return false;
    }
    paint();
    return true;
  };
  const resize = (width: number) => {
    preferred = Math.max(220, Math.min(width, maximum));
  };
  const onPointerDown = (event: PointerEvent) => {
    if (
      !options.interactive() ||
      event.button !== 0 ||
      !event.isPrimary ||
      drag
    )
      return;
    event.preventDefault();
    separator.focus();
    drag = { id: event.pointerId, x: event.clientX, width: effective };
    separator.setPointerCapture(event.pointerId);
    separator.classList.add("dragging");
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const delta = event.clientX - drag.x;
    resize(drag.width + (side === "left" ? delta : -delta));
    if (frame === undefined)
      frame = page.requestAnimationFrame(() => {
        frame = undefined;
        if (drag && options.interactive()) paint();
      });
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) endDrag();
  };
  const onResizeKey = (event: KeyboardEvent) => {
    if (!options.interactive()) return;
    let width: number;
    switch (event.key) {
      case "ArrowLeft":
        width = effective + (side === "right" ? 10 : -10);
        break;
      case "ArrowRight":
        width = effective + (side === "left" ? 10 : -10);
        break;
      case "Home":
        width = 220;
        break;
      case "End":
        width = maximum;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    endDrag();
    resize(width);
    paint();
  };
  separator.addEventListener("keydown", onResizeKey);
  separator.addEventListener("pointerdown", onPointerDown);
  separator.addEventListener("pointermove", onPointerMove);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    separator.addEventListener(type, onPointerEnd as EventListener);
  page.addEventListener("resize", measure);
  const observer =
    typeof page.ResizeObserver === "function"
      ? new page.ResizeObserver(measure)
      : undefined;
  observer?.observe(options.content);
  return {
    setSide(value: AuxiliaryPanelSide) {
      if (disposed || value === side) return false;
      endDrag();
      side = value;
      options.content.dataset.auxiliaryPanelSide = side;
      measure();
      return true;
    },
    measure,
    endDrag,
    dispose() {
      if (disposed) return;
      endDrag();
      disposed = true;
      delete options.content.dataset.auxiliaryPanelSide;
      removeLanguage();
      observer?.disconnect();
      page.removeEventListener("resize", measure);
      separator.removeEventListener("keydown", onResizeKey);
      separator.removeEventListener("pointerdown", onPointerDown);
      separator.removeEventListener("pointermove", onPointerMove);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
        separator.removeEventListener(type, onPointerEnd as EventListener);
    },
  };
}
