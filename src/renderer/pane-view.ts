import type { PaneLayout } from "./pane-layout";

export interface PaneViewItem {
  readonly container: HTMLElement;
}

export interface PaneViewOptions {
  readonly dividerLabel: string;
  // `delta` is a fraction of the split's length along its axis.
  readonly onResize: (
    path: readonly number[],
    index: number,
    delta: number,
  ) => void;
  readonly onResizeEnd?: () => void;
}

const KEYBOARD_RESIZE_STEP = 0.02;

// Rebuild the split structure around the existing pane elements. Pane
// containers are moved, never recreated, so each Terminal Surface keeps its
// canvas, WebGL context and session; Restty refits through its own observer.
export function renderPaneLayout<Pane extends PaneViewItem>(
  host: HTMLElement,
  layout: PaneLayout<Pane>,
  options: PaneViewOptions,
): void {
  host.replaceChildren(buildNode(host.ownerDocument, layout, [], options));
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
    layout.pane.container.style.removeProperty("flex-grow");
    layout.pane.container.style.removeProperty("flex-shrink");
    layout.pane.container.style.removeProperty("flex-basis");
    return layout.pane.container;
  }
  const split = document.createElement("div");
  split.className = "terminal-pane-split";
  split.dataset.direction = layout.direction;
  layout.children.forEach((child, index) => {
    if (index > 0)
      split.append(
        createDivider(document, split, layout.direction, path, index - 1, {
          ...options,
          weights: layout.weights,
        }),
      );
    const element = buildNode(document, child, [...path, index], options);
    setFlexShare(element, layout.weights[index]!);
    split.append(element);
  });
  return split;
}

function createDivider(
  document: Document,
  split: HTMLElement,
  direction: "row" | "column",
  path: readonly number[],
  index: number,
  options: PaneViewOptions & { readonly weights: readonly number[] },
): HTMLElement {
  const divider = document.createElement("div");
  divider.className = "terminal-pane-divider";
  divider.tabIndex = 0;
  divider.setAttribute("role", "separator");
  divider.setAttribute(
    "aria-orientation",
    direction === "row" ? "vertical" : "horizontal",
  );
  divider.setAttribute("aria-label", options.dividerLabel);
  const before = options.weights
    .slice(0, index + 1)
    .reduce((sum, weight) => sum + weight, 0);
  divider.setAttribute("aria-valuenow", String(Math.round(before * 100)));
  divider.setAttribute("aria-valuemin", "0");
  divider.setAttribute("aria-valuemax", "100");

  const length = () => {
    const rectangle = split.getBoundingClientRect();
    return direction === "row" ? rectangle.width : rectangle.height;
  };
  divider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    let last = direction === "row" ? event.clientX : event.clientY;
    divider.setPointerCapture?.(event.pointerId);
    divider.classList.add("dragging");
    const move = (moveEvent: PointerEvent) => {
      const position =
        direction === "row" ? moveEvent.clientX : moveEvent.clientY;
      const total = length();
      if (total <= 0 || position === last) return;
      options.onResize(path, index, (position - last) / total);
      last = position;
    };
    const end = () => {
      divider.classList.remove("dragging");
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", end);
      divider.removeEventListener("pointercancel", end);
      options.onResizeEnd?.();
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", end);
    divider.addEventListener("pointercancel", end);
  });
  divider.addEventListener("keydown", (event) => {
    const decrease = direction === "row" ? "ArrowLeft" : "ArrowUp";
    const increase = direction === "row" ? "ArrowRight" : "ArrowDown";
    if (event.key !== decrease && event.key !== increase) return;
    event.preventDefault();
    event.stopPropagation();
    options.onResize(
      path,
      index,
      event.key === increase ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP,
    );
    options.onResizeEnd?.();
  });
  return divider;
}

function setFlexShare(element: HTMLElement, weight: number): void {
  element.style.flexGrow = String(weight);
  element.style.flexShrink = "1";
  element.style.flexBasis = "0px";
}
