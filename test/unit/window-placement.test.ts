import { describe, expect, it } from "vitest";
import {
  displayKey,
  parseMonitorGeometry,
  placeWindow,
  validateWindowPlacementDocument,
  type PlacementDisplay,
} from "../../src/main/window-placement";

const left: PlacementDisplay = {
  bounds: { x: 0, y: 0, width: 3440, height: 1440 },
  workArea: { x: 0, y: 0, width: 3440, height: 1400 },
};
const right: PlacementDisplay = {
  bounds: { x: 6880, y: 360, width: 2560, height: 1080 },
  workArea: { x: 6880, y: 360, width: 2560, height: 1080 },
};
const sizes = {
  defaultSize: { width: 960, height: 640 },
  minimumSize: { width: 400, height: 300 },
};

describe("window placement", () => {
  it("centers a first window on the display the user works on", () => {
    expect(
      placeWindow({
        display: right,
        remembered: undefined,
        occupied: [],
        ...sizes,
      }),
    ).toEqual({ x: 7680, y: 580, width: 960, height: 640, maximized: false });
  });

  it("reopens at the size and spot remembered for that display", () => {
    expect(
      placeWindow({
        display: right,
        remembered: {
          x: 220,
          y: 140,
          width: 1100,
          height: 700,
          maximized: true,
        },
        occupied: [],
        ...sizes,
      }),
    ).toEqual({ x: 7100, y: 500, width: 1100, height: 700, maximized: true });
  });

  it("keeps the window inside the work area and steps past an open one", () => {
    const placed = placeWindow({
      display: left,
      remembered: {
        x: 3300,
        y: 1300,
        width: 5000,
        height: 900,
        maximized: false,
      },
      occupied: [],
      ...sizes,
    });
    expect(placed).toEqual({
      x: 0,
      y: 500,
      width: 3440,
      height: 900,
      maximized: false,
    });
    expect(
      placeWindow({
        display: left,
        remembered: {
          x: 100,
          y: 100,
          width: 960,
          height: 640,
          maximized: false,
        },
        occupied: [{ x: 100, y: 100, width: 960, height: 640 }],
        ...sizes,
      }),
    ).toMatchObject({ x: 132, y: 132 });
  });

  it("names displays by geometry and reads xrandr monitors by name", () => {
    expect(displayKey(right)).toBe("2560x1080+6880+360");
    const listing = [
      "Monitors: 3",
      " 0: +*DP-1 3440/800x1440/334+3440+0  DP-1",
      " 1: +DP-2 2560/798x1080/334+6880+360  DP-2",
      " 2: +HDMI-A-1 3440/800x1440/334+0+0  HDMI-A-1",
    ].join("\n");
    expect(parseMonitorGeometry(listing, "DP-2")).toEqual(right.bounds);
    expect(parseMonitorGeometry(listing, "DP-9")).toBeUndefined();
  });

  it("accepts only well-formed remembered placements", () => {
    const entry = { x: 1, y: 2, width: 800, height: 600, maximized: false };
    expect(
      validateWindowPlacementDocument({
        displays: { "2560x1080+6880+360": entry },
      }),
    ).toEqual({ displays: { "2560x1080+6880+360": entry } });
    for (const document of [
      [],
      { displays: { "../x": entry } },
      { displays: { "1x1+0+0": { ...entry, width: 0 } } },
      { displays: { "1x1+0+0": { ...entry, maximized: "yes" } } },
    ])
      expect(() => validateWindowPlacementDocument(document)).toThrow(
        TypeError,
      );
  });
});
