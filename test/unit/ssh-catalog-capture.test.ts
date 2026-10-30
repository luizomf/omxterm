// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { renderExtensions } from "../../src/renderer/settings/settings-extensions";

const source = readFileSync("test/fixtures/ssh-packaged.cjs", "utf8");
const require = createRequire(path.resolve("package.json"));
const title = "SSH Connect · 0.3.0";
interface Image {
  isEmpty(): boolean;
}
interface Core {
  executeJavaScript(script: string): Promise<unknown>;
  capturePage(): Promise<Image>;
  isDestroyed(): boolean;
}
type Install = (
  core: Core,
  title: string,
  action: string,
  save: (image: Image) => void,
) => Promise<void>;
const drain = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
afterEach(() => {
  (
    window as unknown as { __sshCatalogCapture?: { dispose(): void } }
  ).__sshCatalogCapture?.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

async function fixture(action = "Install") {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const exports = { exports: {} as { catalogInstall: Install } };
  runInNewContext(source, {
    module: exports,
    require: (name: string): unknown =>
      name === "electron" ? {} : (require(name) as unknown),
    Date,
    setTimeout,
    clearTimeout,
  });
  document.body.innerHTML = `<div class="settings-dialog"><button id="settings-tab-extensions" aria-selected="true">Extensions</button><div class="settings-panels" style="overflow-x: auto; overflow-y: auto"></div></div>`;
  const panel = renderExtensions(
    document,
    {
      request: async () => ({
        ok: true,
        entries: [],
        catalog: {
          loaded: true,
          stale: false,
          entries: [
            {
              id: "omxterm.ssh",
              name: "SSH Connect",
              version: "0.3.0",
              description: "Synthetic SSH",
              installedVersion: action === "Reinstall" ? "0.3.0" : null,
              selection: "a".repeat(36),
              compatible: true,
              action: action === "Install" ? "install" : "reinstall",
            },
            {
              id: "omxterm.files",
              name: "Files",
              version: "0.1.0",
              description: "Incompatible",
              installedVersion: null,
              selection: "b".repeat(36),
              compatible: false,
              action: "install",
            },
          ],
        },
      }),
    },
    () => true,
  );
  document.querySelector(".settings-panels")!.append(panel);
  await drain();
  const card = panel.querySelector<HTMLElement>(".extension-catalog-card")!;
  const heading = card.querySelector("h4")!;
  const button = card.querySelector("button")!;
  const order: string[] = [];
  button.addEventListener("click", () => order.push("click"));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const [x, y, width, height] =
        this === heading
          ? [250, 200, 300, 30]
          : this === button
            ? [250, 350, 100, 35]
            : [0, 0, 960, 640];
      return {
        x,
        y,
        width,
        height,
        top: y,
        left: x,
        right: x + width,
        bottom: y + height,
        toJSON() {},
      };
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.getBoundingClientRect().width;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.getBoundingClientRect().height;
    },
  );
  Object.defineProperty(card, "scrollIntoView", {
    value: () => order.push("scroll"),
  });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const renderer = {
    window,
    document,
    Date,
    innerWidth: 960,
    innerHeight: 640,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const image = { isEmpty: () => false };
  const core = {
    isDestroyed: vi.fn(() => false),
    executeJavaScript: vi.fn(
      async (script: string) => runInNewContext(script, renderer) as unknown,
    ),
    capturePage: vi.fn(async () => {
      order.push("capture");
      return image;
    }),
  };
  const save = vi.fn((_image: Image) => order.push("save"));
  return {
    core,
    image,
    save,
    order,
    panel,
    card,
    heading,
    button,
    frames,
    start: () => exports.exports.catalogInstall(core, title, action, save),
    frame: async () => {
      const batch = [...frames.entries()];
      for (const [id, callback] of batch) {
        frames.delete(id);
        callback(Date.now());
      }
      await drain();
    },
  };
}

it.each(["Install", "Reinstall"])(
  "keeps %s capture and action behind both frame opportunities, despite an unrelated incompatible card",
  async (action) => {
    const f = await fixture(action);
    const running = f.start();
    await drain();
    expect(f.order).toEqual(["scroll"]);
    await f.frame();
    expect(f.order).toEqual(["scroll"]);
    await f.frame();
    await running;
    expect(f.order).toEqual(["scroll", "capture", "save", "click"]);
    expect(f.save).toHaveBeenCalledExactlyOnceWith(f.image);
  },
);

it("expires a held frame at 3 seconds and ignores its late callback", async () => {
  const f = await fixture();
  const result = f.start().catch((error: Error) => error.message);
  await drain();
  const late = [...f.frames.values()][0]!;
  await vi.advanceTimersByTimeAsync(2999);
  expect(f.order).toEqual(["scroll"]);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatch(/deadline exceeded/);
  expect(f.frames.size).toBe(0);
  late(Date.now());
  await f.frame();
  expect(f.order).toEqual(["scroll"]);
});

it("shares the frame budget with a hanging capture and ignores late pixels", async () => {
  const f = await fixture("Reinstall");
  let release!: (image: Image) => void;
  f.core.capturePage.mockImplementation(() => {
    f.order.push("capture");
    return new Promise<Image>((resolve) => {
      release = resolve;
    });
  });
  const result = f.start().catch((error: Error) => error.message);
  await drain();
  await vi.advanceTimersByTimeAsync(2000);
  await f.frame();
  await f.frame();
  await vi.advanceTimersByTimeAsync(999);
  expect(f.order).toEqual(["scroll", "capture"]);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatch(/deadline exceeded/);
  release(f.image);
  await drain();
  expect(f.save).not.toHaveBeenCalled();
  expect(f.order).toEqual(["scroll", "capture"]);
});

it.each(["initial", "revalidation", "click"] as const)(
  "bounds a stalled %s renderer request and refuses late effects",
  async (phase) => {
    const f = await fixture();
    const evaluate = f.core.executeJavaScript.getMockImplementation()!;
    let release!: () => void;
    f.core.executeJavaScript.mockImplementation((script) => {
      // A late action must reject on expiry even if best-effort cleanup stalls.
      if (phase === "click" && script.includes(".dispose();"))
        return new Promise(() => {});
      const held =
        phase === "initial"
          ? script.startsWith("(function prepareCatalogCapture")
          : script.endsWith(phase === "revalidation" ? ".check()" : ".click()");
      if (!held) return evaluate(script);
      return new Promise((resolve, reject) => {
        release = () => {
          evaluate(script).then(resolve, reject);
        };
      });
    });
    const result = f.start().catch((error: Error) => error.message);
    await drain();
    if (phase !== "initial") {
      await f.frame();
      await f.frame();
    }
    await vi.advanceTimersByTimeAsync(3000);
    expect(await result).toMatch(/deadline exceeded/);
    release();
    await drain();
    expect(f.order).not.toContain("click");
    expect(f.save).toHaveBeenCalledTimes(phase === "click" ? 1 : 0);
  },
);

it.each([
  "hidden document",
  "hidden panel",
  "inert ancestor",
  "wrong category",
  "missing controls",
  "busy controls",
  "disabled target",
  "wrong action",
  "clipped heading",
  "clipped action",
  "duplicate target",
] as const)("refuses %s before capture or action", async (fault) => {
  const f = await fixture();
  if (fault === "hidden document")
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  if (fault === "hidden panel") f.panel.hidden = true;
  if (fault === "inert ancestor")
    f.panel.parentElement!.setAttribute("inert", "");
  if (fault === "wrong category")
    document
      .querySelector("#settings-tab-extensions")!
      .setAttribute("aria-selected", "false");
  if (fault === "missing controls")
    f.panel.querySelector(":scope > .application-page-actions")!.remove();
  if (fault === "busy controls")
    f.panel.querySelector<HTMLButtonElement>(
      ":scope > .application-page-actions button",
    )!.disabled = true;
  if (fault === "disabled target") f.button.disabled = true;
  if (fault === "wrong action") f.button.textContent = "Reinstall";
  if (fault === "duplicate target") f.card.after(f.card.cloneNode(true));
  if (fault === "clipped heading" || fault === "clipped action") {
    const element = fault === "clipped heading" ? f.heading : f.button;
    const rect = element.getBoundingClientRect();
    Object.defineProperty(element, "getBoundingClientRect", {
      value: () => ({ ...rect, right: 961, width: 711 }),
    });
  }
  await expect(f.start()).rejects.toThrow(/unavailable or changed/);
  expect(f.core.capturePage).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
  expect(f.order).not.toContain("click");
});

it("rejects a title outside the scrolling ancestor even when inside the viewport", async () => {
  const f = await fixture();
  const container = f.panel.parentElement!;
  expect(getComputedStyle(container).overflowX).toBe("auto");
  const rect = container.getBoundingClientRect();
  Object.defineProperty(container, "getBoundingClientRect", {
    value: () => ({ ...rect, left: 300, x: 300, width: 660 }),
  });
  await expect(f.start()).rejects.toThrow(/unavailable or changed/);
  expect(f.core.capturePage).not.toHaveBeenCalled();
});

it.each(["action", "identity", "geometry", "selection"] as const)(
  "rejects %s drift during capture rather than saving or clicking",
  async (fault) => {
    const f = await fixture("Reinstall");
    f.core.capturePage.mockImplementation(async () => {
      if (fault === "action") f.button.textContent = "Install";
      if (fault === "identity") f.card.replaceWith(f.card.cloneNode(true));
      if (fault === "selection")
        document
          .querySelector("#settings-tab-extensions")!
          .setAttribute("aria-selected", "false");
      if (fault === "geometry") {
        const rect = f.button.getBoundingClientRect();
        Object.defineProperty(f.button, "getBoundingClientRect", {
          value: () => ({
            ...rect,
            x: rect.x + 1,
            left: rect.left + 1,
            right: rect.right + 1,
          }),
        });
      }
      return f.image;
    });
    const result = f.start().catch((error: Error) => error.message);
    await drain();
    await f.frame();
    await f.frame();
    expect(await result).toMatch(/unavailable or changed/);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.order).not.toContain("click");
  },
);

it("rejects action drift while frames are held before requesting pixels", async () => {
  const f = await fixture();
  const result = f.start().catch((error: Error) => error.message);
  await drain();
  await f.frame();
  f.button.textContent = "Reinstall";
  await f.frame();
  expect(await result).toMatch(/unavailable or changed/);
  expect(f.core.capturePage).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
  expect(f.order).not.toContain("click");
});

it("does not click if saving consumes the remaining deadline", async () => {
  const f = await fixture();
  f.save.mockImplementation(() => {
    vi.setSystemTime(3000);
    return 0;
  });
  const result = f.start().catch((error: Error) => error.message);
  await drain();
  await f.frame();
  await f.frame();
  expect(await result).toMatch(/deadline exceeded/);
  expect(f.save).toHaveBeenCalledExactlyOnceWith(f.image);
  expect(f.order).not.toContain("click");
});

it("preserves a capture failure if renderer cleanup throws synchronously", async () => {
  const f = await fixture();
  const evaluate = f.core.executeJavaScript.getMockImplementation()!;
  f.core.executeJavaScript.mockImplementation((script) => {
    if (script.includes(".dispose();"))
      throw Error("synthetic cleanup failure");
    return evaluate(script);
  });
  f.core.capturePage.mockRejectedValue(Error("synthetic capture failure"));
  const result = f.start().catch((error: Error) => error.message);
  await drain();
  await f.frame();
  await f.frame();
  expect(await result).toBe("synthetic capture failure");
  expect(f.save).not.toHaveBeenCalled();
  expect(f.order).not.toContain("click");
});

it.each(["empty", "capture error", "destroyed"] as const)(
  "rejects %s capture",
  async (fault) => {
    const f = await fixture();
    f.core.capturePage.mockImplementation(async () => {
      if (fault === "capture error") throw Error("synthetic capture failure");
      if (fault === "destroyed") f.core.isDestroyed.mockReturnValue(true);
      return { isEmpty: () => fault === "empty" };
    });
    const result = f.start().catch((error: Error) => error.message);
    await drain();
    await f.frame();
    await f.frame();
    expect(await result).toMatch(/empty|synthetic capture failure|destroyed/);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.order).not.toContain("click");
  },
);
