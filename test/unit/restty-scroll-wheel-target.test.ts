import { runInNewContext } from "node:vm";
import type { BrowserWindow } from "electron";
import { expect, it } from "vitest";
import {
  scrollTerminal,
  terminalCellPoint,
} from "../fixtures/restty-link-gestures";
import type { HoverGeometry } from "../fixtures/restty-hover-evidence";

interface Snapshot {
  readonly canvasId: number;
  readonly geometry: HoverGeometry;
}
const initial: Snapshot = {
  canvasId: 11,
  geometry: {
    canvas: { x: 8, y: 32, width: 800, height: 400 },
    backing: { width: 800, height: 400 },
    viewport: { width: 1000, height: 600 },
    dpr: 1,
    cols: 80,
    rows: 20,
    cellWidth: 10,
    cellHeight: 20,
  },
};
const size = { cols: 80, rows: 20, snapshot: initial };
const scrollbackSize = { ...size, allowCanvasTranslation: true as const };
function translated(x = 9, y = 33): Snapshot {
  return {
    ...initial,
    geometry: {
      ...initial.geometry,
      canvas: { ...initial.geometry.canvas, x, y },
    },
  };
}

// Model only DOM/Electron I/O. Execute the real caller's renderer snippets;
// neither point calculation nor fixture helpers are mocked. This is not a
// parser, native layout, SGR routing, clipping, or pixel qualification.
function renderer(first: Snapshot, betweenOperations?: Snapshot) {
  let current = first;
  let transition = betweenOperations;
  let coreQueries = 0;
  const wheels: Array<{
    canvasId: number;
    type: string;
    input: Record<string, unknown>;
  }> = [];
  class Wheel {
    constructor(
      readonly type: string,
      readonly input: Record<string, unknown>,
    ) {}
  }
  const window = {
    webContents: {
      async executeJavaScript(script: string) {
        const observed = current;
        const canvas = {
          getBoundingClientRect: () => observed.geometry.canvas,
          __resttyHoverFixture: () => observed,
          __localImageFixtureCoreCells: () => {
            coreQueries++;
            throw new Error("Coordinate lookup queried the core");
          },
          dispatchEvent(event: Wheel) {
            wheels.push({
              canvasId: observed.canvasId,
              type: event.type,
              input: event.input,
            });
            return true;
          },
        };
        const result: unknown = runInNewContext(script, {
          document: { querySelectorAll: () => [canvas] },
          WheelEvent: Wheel,
        });
        // External layout/ownership may change between renderer operations,
        // after the completed observation and before the later input dispatch.
        if (transition) {
          current = transition;
          transition = undefined;
        }
        return result;
      },
    },
  } as unknown as BrowserWindow;
  return { window, wheels, coreQueries: () => coreQueries };
}

it("uses the current owned canvas origin for an opted-in scrollback cell without rebasing its grid", async () => {
  const fixture = renderer(translated());
  const frozen = JSON.stringify(scrollbackSize);
  expect(await terminalCellPoint(fixture.window, 1, 1, scrollbackSize)).toEqual(
    {
      x: 24,
      y: 63,
    },
  );
  expect(JSON.stringify(scrollbackSize)).toBe(frozen);
  expect(fixture.wheels).toEqual([]);
  expect(fixture.coreQueries()).toBe(0);
});

it.each([
  ["integral translation", translated(), 24, 63],
  ["fractional translation", translated(8, 32.2), 23, 62],
] as const)(
  "dispatches a scrollback wheel using %s without changing its frozen grid",
  async (_label, snapshot, x, y) => {
    const fixture = renderer(snapshot);
    const frozen = JSON.stringify(scrollbackSize);
    await scrollTerminal(fixture.window, 1, 1, scrollbackSize, -1);
    expect(fixture.wheels).toEqual([
      {
        canvasId: 11,
        type: "wheel",
        input: {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          deltaMode: 1,
          deltaY: -1,
        },
      },
    ]);
    expect(JSON.stringify(scrollbackSize)).toBe(frozen);
    expect(fixture.coreQueries()).toBe(0);
  },
);

it("preserves the exact cell-addressed reporting wheel stimulus under the strict default", async () => {
  const fixture = renderer(initial);
  await scrollTerminal(fixture.window, 0, 3, size, 2);
  expect(fixture.wheels).toEqual([
    {
      canvasId: 11,
      type: "wheel",
      input: {
        bubbles: true,
        cancelable: true,
        clientX: 43,
        clientY: 42,
        deltaMode: 1,
        deltaY: 2,
      },
    },
  ]);
  expect(fixture.coreQueries()).toBe(0);
});

it.each(["point", "wheel"] as const)(
  "retains strict historical geometry for a default %s",
  async (kind) => {
    const fixture = renderer(translated());
    const action =
      kind === "point"
        ? terminalCellPoint(fixture.window, 1, 1, size)
        : scrollTerminal(fixture.window, 1, 1, size, -1);
    await expect(action).rejects.toThrow("Restty hover geometry-changed");
    expect(fixture.wheels).toEqual([]);
    expect(fixture.coreQueries()).toBe(0);
  },
);

const geometryChanges: Array<[string, Partial<HoverGeometry>]> = [
  [
    "columns",
    {
      cols: 79,
      canvas: { ...initial.geometry.canvas, width: 790 },
      backing: { width: 790, height: 400 },
    },
  ],
  [
    "rows",
    {
      rows: 19,
      canvas: { ...initial.geometry.canvas, height: 380 },
      backing: { width: 800, height: 380 },
    },
  ],
  [
    "canvas width",
    {
      canvas: { ...initial.geometry.canvas, width: 801 },
      backing: { width: 801, height: 400 },
    },
  ],
  [
    "canvas height",
    {
      canvas: { ...initial.geometry.canvas, height: 401 },
      backing: { width: 800, height: 401 },
    },
  ],
  ["backing width", { backing: { width: 801, height: 400 } }],
  ["backing height", { backing: { width: 800, height: 401 } }],
  ["viewport width", { viewport: { width: 1001, height: 600 } }],
  ["viewport height", { viewport: { width: 1000, height: 601 } }],
  [
    "DPR",
    {
      dpr: 2,
      backing: { width: 1600, height: 800 },
      cellWidth: 20,
      cellHeight: 40,
    },
  ],
  ["cell width", { cellWidth: 9 }],
  ["cell height", { cellHeight: 19 }],
];

it.each(geometryChanges)(
  "refuses changed %s for both opted-in callers before input",
  async (_label, change) => {
    const snapshot = {
      ...initial,
      geometry: { ...initial.geometry, ...change },
    };
    for (const kind of ["point", "wheel"]) {
      const fixture = renderer(snapshot);
      const action =
        kind === "point"
          ? terminalCellPoint(fixture.window, 1, 1, scrollbackSize)
          : scrollTerminal(fixture.window, 1, 1, scrollbackSize, -1);
      await expect(action).rejects.toThrow("Restty hover geometry-changed");
      expect(fixture.wheels).toEqual([]);
      expect(fixture.coreQueries()).toBe(0);
    }
  },
);

it("refuses a different canvas identity despite the scrollback origin opt-in", async () => {
  const fixture = renderer({ ...translated(), canvasId: 12 });
  await expect(
    terminalCellPoint(fixture.window, 1, 1, scrollbackSize),
  ).rejects.toThrow("Restty hover geometry-changed");
  await expect(
    scrollTerminal(fixture.window, 1, 1, scrollbackSize, -1),
  ).rejects.toThrow("Restty hover geometry-changed");
  expect(fixture.wheels).toEqual([]);
  expect(fixture.coreQueries()).toBe(0);
});

it.each([
  ["negative origin", translated(-1, 32)],
  ["clipped right edge", translated(201, 32)],
  ["clipped bottom edge", translated(8, 201)],
  ["nonfinite origin", translated(8, Number.NaN)],
] as const)(
  "still validates current point visibility with %s",
  async (_label, snapshot) => {
    const fixture = renderer(snapshot);
    await expect(
      terminalCellPoint(fixture.window, 1, 1, scrollbackSize),
    ).rejects.toThrow("Restty hover preparation");
    await expect(
      scrollTerminal(fixture.window, 1, 1, scrollbackSize, -1),
    ).rejects.toThrow("Restty hover preparation");
    expect(fixture.wheels).toEqual([]);
    expect(fixture.coreQueries()).toBe(0);
  },
);

it("refuses an opted-in point that cannot map back to its requested cell", async () => {
  const tiny: Snapshot = {
    ...initial,
    geometry: {
      ...initial.geometry,
      canvas: { x: 0, y: 0, width: 40, height: 20 },
      backing: { width: 80, height: 40 },
      dpr: 2,
      cellWidth: 1,
      cellHeight: 2,
    },
  };
  const target = { ...scrollbackSize, snapshot: tiny };
  const fixture = renderer({
    ...tiny,
    geometry: {
      ...tiny.geometry,
      canvas: { ...tiny.geometry.canvas, x: 0.1, y: 0.1 },
    },
  });
  await expect(terminalCellPoint(fixture.window, 1, 1, target)).rejects.toThrow(
    "Restty hover preparation",
  );
  await expect(
    scrollTerminal(fixture.window, 1, 1, target, -1),
  ).rejects.toThrow("Restty hover preparation");
  expect(fixture.wheels).toEqual([]);
  expect(fixture.coreQueries()).toBe(0);
});

it.each([
  ["origin", translated(8, 32.4)],
  [
    "viewport",
    {
      ...initial,
      geometry: {
        ...translated(8, 32.2).geometry,
        viewport: { width: 1001, height: 600 },
      },
    },
  ],
] as const)(
  "refuses a %s change between current-origin observation and wheel dispatch",
  async (_label, atUse) => {
    const fixture = renderer(translated(8, 32.2), atUse);
    await expect(
      scrollTerminal(fixture.window, 1, 1, scrollbackSize, -1),
    ).rejects.toThrow("Restty hover geometry-changed");
    expect(fixture.wheels).toEqual([]);
    expect(fixture.coreQueries()).toBe(0);
  },
);

it("binds a wheel to its observed canvas even without an earlier snapshot", async () => {
  const fixture = renderer(initial, { ...initial, canvasId: 12 });
  await expect(
    scrollTerminal(fixture.window, 1, 1, { cols: 80, rows: 20 }, -1),
  ).rejects.toThrow("Restty hover geometry-changed");
  expect(fixture.wheels).toEqual([]);
  expect(fixture.coreQueries()).toBe(0);
});

it("refuses a wheel if the owned canvas is replaced after coordinate observation", async () => {
  const fixture = renderer(initial, { ...initial, canvasId: 12 });
  await expect(scrollTerminal(fixture.window, 1, 1, size, -1)).rejects.toThrow(
    "Restty hover geometry-changed",
  );
  expect(fixture.wheels).toEqual([]);
  expect(fixture.coreQueries()).toBe(0);
});
