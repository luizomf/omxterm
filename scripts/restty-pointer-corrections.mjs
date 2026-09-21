// Some virtual input stacks split one desktop drag across mouse and pen IDs.
// Use the browser's compatibility mouse stream only to complete an existing
// primary-button press; do not merge arbitrary pointer identities.
export const pointerCorrections = [
  {
    original: `  const { onWheel, onContextMenu, onPointerLeave } = auxHandlers;
  canvas.addEventListener("pointerdown", onPointerDown);`,
    corrected: `  const { onWheel, onContextMenu, onPointerLeave } = auxHandlers;
  const onCompatibilityMouseMove = (event) => {
    const pointerId = desktopSelectionState.pendingPointerId;
    const anchor = desktopSelectionState.pendingCell;
    if (pointerId === null || !anchor || selectionState.dragging ||
        event.buttons !== 1 || event.sourceCapabilities?.firesTouchEvents) return;
    const cell = normalizeSelectionCell(positionToCell(event));
    if (anchor.row === cell.row && anchor.col === cell.col) return;
    // Ordinary pointer movement already clears this pending press. This fallback
    // handles a compatibility move when the native pointer identity changed.
    beginSelectionDrag(anchor, pointerId);
    selectionState.focus = cell;
    syncSelectionAutoScroll(event);
    updateLinkHover(null);
    updateCanvasCursor();
    markNeedsRender();
    event.preventDefault();
  };
  canvas.addEventListener("mousemove", onCompatibilityMouseMove);
  canvas.addEventListener("pointerdown", onPointerDown);`,
  },
  {
    original: `    canvas.removeEventListener("pointerdown", onPointerDown);`,
    corrected: `    canvas.removeEventListener("mousemove", onCompatibilityMouseMove);
    canvas.removeEventListener("pointerdown", onPointerDown);`,
  },
];
