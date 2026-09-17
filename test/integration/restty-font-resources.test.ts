import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadFontResourceStore,
  type FontSource,
} from "../fixtures/restty-font-resource-store";

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
