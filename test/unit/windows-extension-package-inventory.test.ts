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
];

it("requires the Windows ARM64 extension runtime without changing x64 or Files admission", () => {
  expect(inspectAsarEntries([], "win32", "arm64").missing).toEqual(
    expect.arrayContaining(runtime),
  );
  for (const entry of runtime) {
    const result = inspectAsarEntries(
      runtime.filter((file) => file !== entry),
      "win32",
      "arm64",
    );
    expect(result.missing).toContain(entry);
    for (const present of runtime.filter((file) => file !== entry))
      expect(result.missing).not.toContain(present);
  }
  const move = "/dist/extension-runtime/files-move.node";
  expect(
    inspectAsarEntries([...runtime, move], "win32", "arm64").forbidden,
  ).toContain(move);
  for (const entry of runtime)
    expect(inspectAsarEntries([], "win32", "x64").missing).not.toContain(entry);
});

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
