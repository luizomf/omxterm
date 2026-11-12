import { expect, it } from "vitest";
import {
  inspectAsarEntries,
  inspectForbiddenPackagedEntries,
} from "../../scripts/verify-packaged-app.mjs";

const runtime = [
  "/dist/preload/extension-view.cjs",
  "/dist/extension-runtime/bootstrap.mjs",
  "/dist/extension-runtime/index.mjs",
  "/dist/extension-runtime/packages.mjs",
  "/dist/extension-runtime/extension-leases.node",
  "/node_modules/semver/package.json",
  "/node_modules/yauzl/package.json",
  "/dist/extension-runtime/files-move.node",
];

it.each(["arm64", "x64"] as const)(
  "requires the Windows %s extension runtime including Files move",
  (arch) => {
    expect(inspectAsarEntries([], "win32", arch).missing).toEqual(
      expect.arrayContaining(runtime),
    );
    for (const entry of runtime) {
      const result = inspectAsarEntries(
        runtime.filter((file) => file !== entry),
        "win32",
        arch,
      );
      expect(result.missing).toContain(entry);
      for (const present of runtime.filter((file) => file !== entry))
        expect(result.missing).not.toContain(present);
    }
    expect(inspectAsarEntries(runtime, "win32", arch).forbidden).toEqual([]);
  },
);

it("rejects extension compiler intermediates in packaged output", () => {
  const intermediates = [
    "/dist/extension-runtime/extension-leases.lib",
    "/dist/extension-runtime/extension-leases.exp",
    "/resources/app.asar.unpacked/dist/extension-runtime/extension-leases-delay-load.obj",
  ];
  expect(inspectForbiddenPackagedEntries(intermediates)).toEqual(intermediates);
  expect(
    inspectForbiddenPackagedEntries([
      "/dist/extension-runtime/extension-leases.node",
    ]),
  ).toEqual([]);
});
