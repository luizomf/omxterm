import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { expect, it } from "vitest";

it("existing main emits capture as its first executable statement and claims before product writes", async () => {
  const text = await readFile(
    new URL("../../src/main/index.ts", import.meta.url),
    "utf8",
  );
  const { code } = await transform(text, { loader: "ts", format: "esm" });
  const body = code.replace(/^import[\s\S]*?;\n/gmu, "").trimStart();
  expect(
    body.startsWith("const defaultProfile = captureDefaultProfile(app);"),
  ).toBe(true);
  const claim = body.indexOf("await claimDefaultSnippets(");
  expect(claim).toBeGreaterThan(0);
  for (const name of [
    "createOperationalEventLog(",
    "startWithUserConfiguration(",
    "startApplicationExtensions(",
  ])
    expect(claim).toBeLessThan(body.indexOf(name));
  // Emitted wiring regression only, not native import-order/packaged startup proof.
});
