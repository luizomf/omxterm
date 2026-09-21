import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadFontResourceStore,
  loadFontPicker,
  type FontSource,
} from "../fixtures/restty-font-resource-store";

import { fontCollection } from "../fixtures/font-collection";

let root: string;
let createStore: Awaited<ReturnType<typeof loadFontResourceStore>>;
let fontBytes: Uint8Array;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "omxterm-font-resources-"));
  createStore = await loadFontResourceStore(root);
  fontBytes = await readFile(
    path.resolve(import.meta.dirname, "../../assets/fonts/DejaVuSansMono.ttf"),
  );
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function source(label: string): FontSource {
  return { kind: "buffer", data: new Uint8Array(fontBytes).buffer, label };
}

describe("Restty font resource lifetime under cache pressure", () => {
  it("keeps explicit text presentation on the real requested style", async () => {
    const store = createStore({ maxSourceCacheBytes: 1_000_000 });
    const bold = await readFile("assets/fonts/DejaVuSansMono-Bold.ttf");
    const lease = await store.acquire([
      { ...source("DejaVu Sans Mono"), weight: 400 },
      {
        kind: "buffer",
        label: "DejaVu Sans Mono Bold",
        weight: 700,
        data: new Uint8Array(bold).buffer,
      },
    ]);
    try {
      const pick = (await loadFontPicker(root))(lease.faces);
      expect(pick("↔", "bold")).toBe("DejaVu Sans Mono Bold");
      expect(pick("↔\uFE0E", "bold")).toBe("DejaVu Sans Mono Bold");
      expect(pick("↔\uFE0E", "regular")).toBe("DejaVu Sans Mono");
    } finally {
      lease.release();
    }
  });
  it("selects exact collection faces without duplicating their shared parsed resource", async () => {
    const bold = await readFile("assets/fonts/DejaVuSansMono-Bold.ttf");
    const data = fontCollection([fontBytes, bold]).buffer as ArrayBuffer;
    const store = createStore({ maxSourceCacheBytes: data.byteLength });
    const regularSource = {
      kind: "buffer" as const,
      data,
      label: "DejaVu Sans Mono",
      weight: 400,
      faceIndex: 0,
    };
    const boldSource = {
      ...regularSource,
      label: "DejaVu Sans Mono Bold",
      weight: 700,
      faceIndex: 1,
    };
    const first = await store.acquire([regularSource, boldSource]);
    const second = await store.acquire([boldSource]);
    expect(first.faces).toHaveLength(2);
    expect(first.faces[0]!.label).not.toMatch(/Bold/);
    expect(first.faces[1]!.label).toMatch(/Bold/);
    expect(second.faces).toHaveLength(1);
    expect(first.faces[1]!.font).toBe(second.faces[0]!.font);
    await expect(
      store.acquire([{ ...regularSource, faceIndex: 2 }]),
    ).rejects.toThrow("face");
    first.release();
    expect(second.faces[0]!.font.glyphIdForChar("A")).toBeGreaterThan(0);
    second.release();
  });
  it.each(["closed-tab", "failure"])(
    "releases parsed resources after %s under cache pressure",
    async (scenario) => {
      const execution = await promisify(execFile)(
        process.execPath,
        [
          "--expose-gc",
          path.join(root, "lifetime.mjs"),
          path.join(root, "font-resource-store.mjs"),
          path.resolve(
            import.meta.dirname,
            "../../assets/fonts/DejaVuSansMono.ttf",
          ),
          scenario,
        ],
        { timeout: 20_000 },
      );
      expect(execution.stdout.trim()).toBe("released");
    },
  );

  it("does not mutate a borrowed native source while parsing and using it", async () => {
    const borrowed = new Uint8Array(fontBytes).buffer;
    const before = Buffer.from(borrowed).toString("base64");
    const store = createStore({
      maxSourceCacheBytes: fontBytes.byteLength,
      loadSourceBuffer: async (input) => input.data,
    });

    const lease = await store.acquire([
      { kind: "buffer", data: borrowed, label: "borrowed-native-source" },
    ]);
    expect(lease.faces[0]!.font.glyphIdForChar("A")).toBeGreaterThan(0);
    expect(Buffer.from(borrowed).toString("base64")).toBe(before);
    lease.release();
    expect(Buffer.from(borrowed).toString("base64")).toBe(before);
  });

  it("shares concurrent loads and keeps each lease live independently under pressure", async () => {
    const shared = source("shared");
    let finishLoad: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      finishLoad = resolve;
    });
    const store = createStore({
      maxSourceCacheBytes: fontBytes.byteLength,
      loadSourceBuffer: async (input) => {
        if (input === shared) await gate;
        return input.data;
      },
    });
    const firstPending = store.acquire([shared]);
    const secondPending = store.acquire([shared]);
    const other = await store.acquire([source("other")]);
    finishLoad();
    const [first, second] = await Promise.all([firstPending, secondPending]);
    expect(first.faces[0]!.font).toBe(second.faces[0]!.font);
    first.release();
    const stillLive = await store.acquire([shared]);
    expect(stillLive.faces[0]!.font).toBe(second.faces[0]!.font);
    expect(second.faces[0]!.font.glyphIdForChar("A")).toBeGreaterThan(0);
    stillLive.release();
    second.release();
    const reloaded = await store.acquire([shared]);
    expect(reloaded.faces[0]!.font).not.toBe(second.faces[0]!.font);
    reloaded.release();
    other.release();
  });
});
