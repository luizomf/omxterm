import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { onWindowClosed } from "../../src/main/window-closed";

describe("onWindowClosed", () => {
  it("serves any number of owners with one native listener", () => {
    const window = new EventEmitter();
    const order: number[] = [];
    for (let owner = 0; owner < 25; owner += 1)
      onWindowClosed(window, () => order.push(owner));
    expect(window.listenerCount("closed")).toBe(1);
    window.emit("closed");
    expect(order).toEqual(Array.from({ length: 25 }, (_, index) => index));
  });

  it("keeps separate windows independent", () => {
    const first = new EventEmitter();
    const second = new EventEmitter();
    const closed: string[] = [];
    onWindowClosed(first, () => closed.push("first"));
    onWindowClosed(second, () => closed.push("second"));
    first.emit("closed");
    expect(closed).toEqual(["first"]);
  });

  it("runs every owner even when one throws", () => {
    const window = new EventEmitter();
    let reached = false;
    onWindowClosed(window, () => {
      throw new Error("boom");
    });
    onWindowClosed(window, () => {
      reached = true;
    });
    expect(() => window.emit("closed")).toThrow(AggregateError);
    expect(reached).toBe(true);
  });
});
