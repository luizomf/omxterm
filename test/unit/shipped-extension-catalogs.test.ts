import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { version as appVersion } from "../../package.json";
import {
  catalogCompatible,
  parseCatalog,
} from "../../src/main/extension-catalog";

// The macOS ARM64 host reads its own catalog; every other host reads the
// legacy one (see createExtensionCatalog).
const catalogs = [
  [
    "distribution/official-extensions-v1.json",
    ["linux-arm64", "linux-x64", "win32-arm64", "win32-x64", "darwin-x64"],
  ],
  ["distribution/official-extensions-darwin-arm64-v1.json", ["darwin-arm64"]],
] as const;
const read = async (file: string) => parseCatalog(await readFile(file));

it("keeps entries other than the per-target Files offer identical across catalogs", async () => {
  const legacy = await read(catalogs[0][0]);
  const macos = await read(catalogs[1][0]);
  expect(macos.map(({ id }) => id)).toEqual(legacy.map(({ id }) => id));
  for (const entry of legacy.filter(({ id }) => id !== "omxterm.files"))
    expect(macos.find(({ id }) => id === entry.id)).toEqual(entry);
});

it.each(catalogs)(
  "offers every %s entry to the current host on its own targets only",
  async (file, served) => {
    for (const release of await read(file)) {
      for (const target of served) {
        const runtime = { appVersion, apiVersion: "0.1.0" };
        expect(
          catalogCompatible(release, runtime, target),
          `${release.id} on ${target}`,
        ).toBe(release.targets.includes(target));
        expect(
          catalogCompatible(
            release,
            { ...runtime, apiVersion: "0.2.0" },
            target,
          ),
        ).toBe(false);
      }
    }
  },
);
