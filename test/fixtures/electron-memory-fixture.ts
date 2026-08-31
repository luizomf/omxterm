interface ChromiumPerformanceMemory {
  readonly usedJSHeapSize: number;
}

export function usedJavaScriptHeap(): number {
  return (
    (
      performance as Performance & {
        readonly memory?: ChromiumPerformanceMemory;
      }
    ).memory?.usedJSHeapSize ?? -1
  );
}
