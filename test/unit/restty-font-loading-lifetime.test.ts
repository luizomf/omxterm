// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { createResttyRuntime } from "restty/internal";
import { Font } from "text-shaper";
import { expect, it, vi } from "vitest";

it("releases an acquired font lease when its runtime closes during font loading", async () => {
  const bytes = readFileSync(
    path.resolve(import.meta.dirname, "../../assets/fonts/DejaVuSansMono.ttf"),
  );
  const font = Font.load(new Uint8Array(bytes).buffer);
  const release = vi.fn();
  const lease = { faces: [{ font, label: "Fixture" }], release };
  let finish: (value: typeof lease) => void = () => undefined;
  const pending = new Promise<typeof lease>((resolve) => {
    finish = resolve;
  });
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const runtime = createResttyRuntime({
    terminal: {
      renderer: "webgl2",
      fonts: [{ data: new Uint8Array(bytes).buffer }],
      autoResize: false,
      attachWindowEvents: false,
      attachCanvasEvents: false,
    },
    mount: {
      canvas,
      session: {
        getFontResourceStore: () => ({ acquire: () => pending }),
        getWasm: async () => {
          throw new Error("Closed runtime must not load WASM");
        },
        getWebGPUCore: async () => null,
      },
    },
  });
  try {
    const initialization = runtime.lifecycle.init();
    runtime.lifecycle.destroy();
    finish(lease);
    await initialization;
    expect(runtime.lifecycle.state()).toBe("destroyed");
    expect(release).toHaveBeenCalledExactlyOnceWith();
  } finally {
    runtime.lifecycle.destroy();
    canvas.remove();
  }
});
