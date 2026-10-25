import { PANE_DIVIDER_SIZE } from "./pane-geometry";
import type { PaneLayout, SplitAxis } from "./pane-layout";

export interface PaneViewItem {
  readonly container: HTMLElement;
}

export interface PaneViewOptions {
  readonly isInteractive?: () => boolean;
  readonly resizeLabel?: string;
  // `delta` is a fraction of the split's `length` (CSS px) along its axis.
  readonly onResize: (
    path: readonly number[],
    index: number,
    delta: number,
    length: number,
  ) => void;
}

const KEYBOARD_RESIZE_STEP = 0.02;

// Rebuild the split structure around the existing pane elements. Pane
// containers are moved, never recreated, so each Terminal Surface keeps its
// canvas, WebGL context and session; Restty refits through its own observer.
// Adapted from ruscher/omxterm PR #622 at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
export function renderPaneLayout<Pane extends PaneViewItem>(
  host: HTMLElement,
  layout: PaneLayout<Pane>,
  options: PaneViewOptions,
): void {
  host.style.setProperty(
    "--terminal-pane-divider-size",
    `${PANE_DIVIDER_SIZE}px`,
  );
  const active = host.ownerDocument.activeElement;
  const retained =
    active instanceof HTMLElement && host.contains(active) ? active : undefined;
  host.replaceChildren(buildNode(host.ownerDocument, layout, [], options));
  // Moving a surviving Surface through a detached split loses DOM focus,
  // including its search field. Restore that exact control, not generic input.
  if (
    retained?.isConnected &&
    host.contains(retained) &&
    options.isInteractive?.() !== false
  )
    retained.focus({ preventScroll: true });
}

// Resizing changes only weights: update flex shares in place so a focused
// divider keeps keyboard focus and no element is moved.
export function applyPaneWeights<Pane extends PaneViewItem>(
  host: HTMLElement,
  layout: PaneLayout<Pane>,
): void {
  const root = host.firstElementChild;
  if (root instanceof HTMLElement) applyNodeWeights(root, layout);
}

function applyNodeWeights<Pane extends PaneViewItem>(
  element: HTMLElement,
  layout: PaneLayout<Pane>,
): void {
  if (layout.kind === "leaf") return;
  const children = [...element.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      !child.classList.contains("terminal-pane-divider"),
  );
  const dividers = [...element.children].filter((child) =>
    child.classList.contains("terminal-pane-divider"),
  );
  let before = 0;
  layout.children.forEach((child, index) => {
    const childElement = children[index];
    if (!childElement) return;
    setFlexShare(childElement, layout.weights[index]!);
    applyNodeWeights(childElement, child);
    before += layout.weights[index]!;
    dividers[index]?.setAttribute(
      "aria-valuenow",
      String(Math.round(before * 100)),
    );
  });
}

function buildNode<Pane extends PaneViewItem>(
  document: Document,
  layout: PaneLayout<Pane>,
  path: readonly number[],
  options: PaneViewOptions,
): HTMLElement {
  if (layout.kind === "leaf") {
    for (const property of ["flex-grow", "flex-shrink", "flex-basis"])
      layout.pane.container.style.removeProperty(property);
    return layout.pane.container;
  }
  const split = document.createElement("div");
  split.className = "terminal-pane-split";
  split.dataset.direction = layout.direction;
  layout.children.forEach((child, index) => {
    if (index > 0)
      split.append(
        createDivider(document, split, layout, path, index - 1, options),
      );
    const element = buildNode(document, child, [...path, index], options);
    setFlexShare(element, layout.weights[index]!);
    split.append(element);
  });
  return split;
}

function createDivider<Pane>(
  document: Document,
  split: HTMLElement,
  layout: PaneLayout<Pane> & { readonly kind: "split" },
  path: readonly number[],
  index: number,
  options: PaneViewOptions,
): HTMLElement {
  const direction: SplitAxis = layout.direction;
  const divider = document.createElement("div");
  divider.className = "terminal-pane-divider";
  divider.tabIndex = 0;
  divider.setAttribute("role", "separator");
  divider.setAttribute(
    "aria-orientation",
    direction === "row" ? "vertical" : "horizontal",
  );
  divider.setAttribute("aria-label", options.resizeLabel ?? "Resize panes");
  const before = layout.weights
    .slice(0, index + 1)
    .reduce((sum, weight) => sum + weight, 0);
  divider.setAttribute("aria-valuenow", String(Math.round(before * 100)));
  divider.setAttribute("aria-valuemin", "0");
  divider.setAttribute("aria-valuemax", "100");

  const length = () => {
    if (!split.isConnected || options.isInteractive?.() === false) return 0;
    const rectangle = split.getBoundingClientRect();
    return (
      (direction === "row" ? rectangle.width : rectangle.height) -
      PANE_DIVIDER_SIZE * (layout.children.length - 1)
    );
  };
  let dragging = false;
  divider.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      dragging ||
      length() <= 0
    )
      return;
    event.preventDefault();
    const pointerId = event.pointerId;
    let last = direction === "row" ? event.clientX : event.clientY;
    divider.setPointerCapture?.(pointerId);
    dragging = true;
    divider.classList.add("dragging");
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const total = length();
      if (total <= 0) {
        stop();
        return;
      }
      const position =
        direction === "row" ? moveEvent.clientX : moveEvent.clientY;
      if (position === last) return;
      options.onResize(path, index, (position - last) / total, total);
      last = position;
    };
    const stop = () => {
      dragging = false;
      divider.classList.remove("dragging");
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", end);
      divider.removeEventListener("pointercancel", end);
      divider.removeEventListener("lostpointercapture", end);
      if (divider.hasPointerCapture?.(pointerId))
        divider.releasePointerCapture(pointerId);
    };
    const end = (endEvent: PointerEvent) => {
      if (endEvent.pointerId === pointerId) stop();
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", end);
    divider.addEventListener("pointercancel", end);
    divider.addEventListener("lostpointercapture", end);
  });
  divider.addEventListener("keydown", (event) => {
    const decrease = direction === "row" ? "ArrowLeft" : "ArrowUp";
    const increase = direction === "row" ? "ArrowRight" : "ArrowDown";
    if ((event.key !== decrease && event.key !== increase) || length() <= 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    options.onResize(
      path,
      index,
      event.key === increase ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP,
      length(),
    );
  });
  return divider;
}

function setFlexShare(element: HTMLElement, weight: number): void {
  element.style.flexGrow = String(weight);
  element.style.flexShrink = "1";
  element.style.flexBasis = "0px";
}
