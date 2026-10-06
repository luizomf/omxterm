import { expect, it } from "vitest";
import { realFrameFixture } from "../fixtures/restty-link-core-probe";
import { hardRows } from "../fixtures/restty-link-flow-readiness";

it("redraw alone keeps the epoch, but output requires a new submitted match with the same expectation", async () => {
  const fixture = await realFrameFixture();
  try {
    fixture.observer.prepareFrame(
      hardRows(["https://one.test/a", "https://two.test/b"], {
        offset: "bottom",
        alternate: false,
        mouseActive: false,
      }),
    );
    fixture.write("\u001b[2J\u001b[Hhttps://one.test/a\r\nhttps://two.test/b");
    fixture.produce();
    fixture.submit();
    const original = fixture.observer.snapshot()!;
    const before = fixture.observer.status();
    expect(original.matches).toBe(true);
    fixture.produce();
    fixture.submit();
    expect(fixture.observer.status()).toEqual(before);
    fixture.write("\u001b[?25l");
    expect(fixture.observer.status()).toMatchObject({
      frameId: before.frameId + 1,
      expectationId: before.expectationId,
      origin: "output",
    });
    fixture.observer.present(original); // A delayed old submission cannot resurrect it.
    expect(fixture.observer.snapshot()).toBeUndefined();
    const renderUpdate = fixture.wasm.renderUpdate;
    fixture.wasm.renderUpdate = () => {
      throw new Error("Observer forced preparation");
    };
    try {
      expect(fixture.observer.snapshot()).toBeUndefined();
      expect(fixture.observer.status().viewport).toEqual(before.viewport);
    } finally {
      fixture.wasm.renderUpdate = renderUpdate;
    }
    fixture.produce();
    fixture.submit();
    expect(fixture.observer.snapshot()).toMatchObject({
      matches: true,
      frameId: before.frameId + 1,
      expectationId: before.expectationId,
      viewport: before.viewport,
    });
  } finally {
    fixture.dispose();
  }
});

it("drops a submitted match on actual scalar viewport movement outside the pinned scroll owner", async () => {
  const fixture = await realFrameFixture();
  try {
    fixture.observer.prepareFrame(
      hardRows(
        ["https://one.test/a", "row-1", "row-2", "row-3", "row-4", "row-5"],
        { offset: 0, total: 7, alternate: false, mouseActive: false },
      ),
    );
    fixture.write(
      "\u001b[3J\u001b[2J\u001b[Hhttps://one.test/a\r\nrow-1\r\nrow-2\r\nrow-3\r\nrow-4\r\nrow-5\r\nrow-6",
    );
    fixture.runtime.scroll.scrollViewportByLines(-1);
    fixture.produce();
    fixture.submit();
    expect(fixture.observer.snapshot()?.matches).toBe(true);
    const before = fixture.observer.status();
    expect(before.origin).toBe("viewport-scroll");
    fixture.wasm.scrollViewport(fixture.handle, 1);
    expect(fixture.observer.snapshot()).toBeUndefined();
    expect(fixture.observer.status()).toMatchObject({
      frameId: before.frameId + 1,
      expectationId: before.expectationId,
      origin: "viewport-scalar",
      viewport: { offset: 1, total: 7, length: 6 },
    });
  } finally {
    fixture.dispose();
  }
});
