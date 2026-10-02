export interface ScrollFeedbackCore {
  readonly total: number;
  readonly offset: number;
  readonly len: number;
  readonly cellH: number;
}
export interface ScrollFeedbackEvent {
  readonly kind: "spacer-clamp" | "native-scroll" | "core-offset";
  readonly top?: number;
  readonly before?: number;
  readonly suppressed?: boolean;
  readonly trusted?: boolean;
  readonly delta?: number;
  readonly total: number;
  readonly offset: number;
  readonly len: number;
}
declare global {
  var __scrollFeedbackCore: WeakMap<
    HTMLCanvasElement,
    () => ScrollFeedbackCore
  >;
  var __scrollFeedbackEvents: ScrollFeedbackEvent[];
}

// Read-only fixture observations in the actual pinned runtime. No event,
// viewport offset, resize, suppression state or production API is substituted.
export function observeNativeScrollFeedback(source: string): string {
  const replacements = [
    [
      "  let scrollRemainder = 0;",
      `  (globalThis.__scrollFeedbackCore ??= new WeakMap()).set(getCanvas(), () => {
    const exports = getWasmExports(), handle = getWasmHandle();
    return { total: exports.restty_scrollbar_total(handle), offset: exports.restty_scrollbar_offset(handle), len: exports.restty_scrollbar_len(handle), cellH: getGridState().cellH };
  });
  let scrollRemainder = 0;`,
    ],
    [
      "  let dragGrabRatio = 0.5;",
      `  let dragGrabRatio = 0.5;
  const observeScrollFeedback = (event) => {
    const events = globalThis.__scrollFeedbackEvents ??= [];
    if (events.length < 128) events.push({ ...globalThis.__scrollFeedbackCore.get(canvas)(), ...event });
  };`,
    ],
    [
      "  const onHostScroll = () => {\n    if (ignoreNextScroll) {",
      "  const onHostScroll = (event) => {\n    observeScrollFeedback({ kind: 'native-scroll', top: host.scrollTop, suppressed: ignoreNextScroll, trusted: event.isTrusted });\n    if (ignoreNextScroll) {",
    ],
    [
      "      spacer.style.height = `${currentScrollRangePx}px`;",
      "      const observedTopBeforeSpacer = host.scrollTop;\n      spacer.style.height = `${currentScrollRangePx}px`;",
    ],
    [
      "      const nextScrollTop = Math.round(offset / currentDenom * currentScrollRangePx);",
      "      if (host.scrollTop !== observedTopBeforeSpacer) observeScrollFeedback({ kind: 'spacer-clamp', before: observedTopBeforeSpacer, top: host.scrollTop, suppressed: ignoreNextScroll });\n      const nextScrollTop = Math.round(offset / currentDenom * currentScrollRangePx);",
    ],
    [
      "    const delta = clamped - current;\n    if (!delta)",
      "    const delta = clamped - current;\n    if (delta) { const events = globalThis.__scrollFeedbackEvents ??= []; if (events.length < 128) events.push({ kind: 'core-offset', total, offset: current, len, delta }); }\n    if (!delta)",
    ],
  ];
  for (const [original, observed] of replacements) {
    if (!original || !observed || source.split(original).length !== 2)
      throw new Error("Native scroll feedback observer drifted");
    source = source.replace(original, observed);
  }
  return source;
}
