import { describe, expect, it } from "vitest";
import {
  hasNativeDrag,
  type NativeInputObservation,
} from "../fixtures/scrollback-native-input";

const point = { x: 80, startY: 438, endY: 0 };
function delivered(): NativeInputObservation {
  return {
    ready: true,
    down: {
      trusted: true,
      canvas: true,
      id: 1,
      buttons: 1,
      x: 80,
      y: 438,
      dragging: false,
    },
    move: {
      trusted: true,
      canvas: true,
      id: 1,
      buttons: 1,
      x: 80,
      y: 0,
      dragging: true,
    },
    up: null,
    character: null,
    accepted: false,
    geometry: { x: 0, y: 0, width: 800, height: 468 },
    viewport: { top: 39368, height: 39836, clientHeight: 468 },
  };
}

describe("scrollback native drag acknowledgement", () => {
  it("acknowledges the delivered held-left gesture and actual dragging independently of scrolling", () => {
    expect(hasNativeDrag(delivered(), point)).toBe(true);
  });
  it("keeps delivery evidence distinct from focus readiness before the gesture", () => {
    expect(hasNativeDrag({ ...delivered(), ready: false }, point)).toBe(true);
  });
  it.each([
    { trusted: false },
    { canvas: false },
    { buttons: 0 },
    { buttons: 2 },
    { id: 2 },
    { y: 10 },
    { dragging: false },
  ])("rejects malformed or unacknowledged movement %j", (change) => {
    const value = delivered();
    expect(
      hasNativeDrag({ ...value, move: { ...value.move!, ...change } }, point),
    ).toBe(false);
  });
  it("does not infer delivery from a changed viewport or a pending press", () => {
    expect(
      hasNativeDrag(
        {
          ...delivered(),
          move: null,
          viewport: { top: 100, height: 39836, clientHeight: 468 },
        },
        point,
      ),
    ).toBe(false);
    expect(hasNativeDrag({ ...delivered(), down: null }, point)).toBe(false);
  });
});
