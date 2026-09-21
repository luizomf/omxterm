import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface FontSource {
  readonly kind: "buffer";
  readonly data: ArrayBuffer;
  readonly label: string;
  readonly weight?: number;
  readonly faceIndex?: number;
}

interface FontLease {
  readonly faces: readonly {
    readonly font: { glyphIdForChar(character: string): number };
    readonly label: string;
  }[];
  release(): void;
}

interface FontResourceStoreOptions {
  readonly maxSourceCacheBytes: number;
  readonly loadSourceBuffer?: (
    source: FontSource,
    key: string,
  ) => Promise<ArrayBuffer | null>;
}

type CreateFontResourceStore = (options: FontResourceStoreOptions) => {
  acquire(sources: readonly FontSource[]): Promise<FontLease>;
};

// The pinned package declares this runtime seam but does not export it from
// its bundled entry. Export the actual installed factory only in a disposable
// test bundle; no copied cache implementation or production diagnostic API.
export async function loadFontResourceStore(
  root: string,
): Promise<CreateFontResourceStore> {
  const require = createRequire(import.meta.url);
  const dist = path.dirname(require.resolve("restty"));
  const source = await readFile(path.join(dist, "chunk-c0rcpsc5.js"), "utf8");
  const outfile = path.join(root, "font-resource-store.mjs");
  await build({
    stdin: {
      contents: `${source}\nexport { createResttyFontResourceStore };`,
      resolveDir: dist,
      loader: "js",
    },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  await build({
    entryPoints: [
      path.resolve(import.meta.dirname, "restty-font-resource-lifetime.ts"),
    ],
    outfile: path.join(root, "lifetime.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  const loaded = (await import(pathToFileURL(outfile).href)) as {
    createResttyFontResourceStore: CreateFontResourceStore;
  };
  return loaded.createResttyFontResourceStore;
}
