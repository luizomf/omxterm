import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type {
  loadFontResourceStore,
  FontSource,
} from "./restty-font-resource-store";

const loaded = (await import(pathToFileURL(process.argv[2]!).href)) as {
  createResttyFontResourceStore: Awaited<
    ReturnType<typeof loadFontResourceStore>
  >;
};
const bytes = await readFile(process.argv[3]!);
const source = (label: string): FontSource => ({
  kind: "buffer",
  data: new Uint8Array(bytes).buffer,
  label,
});
const store = loaded.createResttyFontResourceStore({
  maxSourceCacheBytes: bytes.byteLength,
});
async function closedTab() {
  const live = await store.acquire([source("live")]);
  const temporary = await store.acquire([source("temporary")]);
  const reference = new WeakRef(temporary.faces[0]!.font);
  temporary.release();
  temporary.release();
  return { reference, live };
}
async function failedAcquisition() {
  const first = source("first");
  const seed = await store.acquire([first]);
  const reference = new WeakRef(seed.faces[0]!.font);
  seed.release();
  await assert.rejects(
    store.acquire([
      first,
      {
        kind: "buffer",
        data: new ArrayBuffer(4),
        label: "invalid",
        weight: 400,
      },
    ]),
  );
  const live = await store.acquire([source("replacement")]);
  return { reference, live };
}
const { reference, live } = await (process.argv[4] === "failure"
  ? failedAcquisition()
  : closedTab());
for (let i = 0; i < 5; i += 1) {
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.ok(globalThis.gc, "Fixture requires --expose-gc");
  globalThis.gc();
}
assert.ok(
  reference.deref() === undefined,
  "Released font remains strongly retained under cache pressure",
);
assert.ok(live.faces[0]!.font.glyphIdForChar("A") > 0);
live.release();
process.stdout.write("released\n");
