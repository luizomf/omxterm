// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { PtyTransport } from "restty";
import { harness } from "../fixtures/restty-surface-harness";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";

afterEach(() => vi.restoreAllMocks());

it("reports current CSS cell metrics and all non-grid overhead without estimating cells from columns", async () => {
  harness.instances.length = 0;
  harness.setInitError(undefined);
  const adapter = {
    start: vi.fn(async () => {}),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  };
  const container = document.createElement("main");
  document.body.append(container);
  const surface = await mountResttyTerminalSurface(container, adapter);
  const canvas = container.querySelector("canvas")!;
  canvas.width = 820;
  canvas.height = 200;
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    width: 436,
    height: 138,
  } as DOMRect);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 410,
    height: 100,
  } as DOMRect);
  const transport = (
    harness.instances[0]!.options.services as { ptyTransport: PtyTransport }
  ).ptyTransport;
  transport.resize(41, 5, {
    widthPx: 820,
    heightPx: 200,
    cellW: 20,
    cellH: 40,
  });
  expect(surface.geometry()).toEqual({
    cellWidth: 10,
    cellHeight: 20,
    insetWidth: 26,
    insetHeight: 38,
  });
  container.hidden = true;
  expect(surface.geometry()).toBeUndefined();
  container.hidden = false;
  surface.dispose();
  expect(surface.geometry()).toBeUndefined();
  container.remove();
});
