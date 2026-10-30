// Explicit provisioning on the assigned disposable macOS desktop, never npm hooks.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

assert.equal(process.platform, "darwin");
assert.equal(process.arch, "arm64");
const output = process.argv[2];
assert.ok(
  output && path.isAbsolute(output),
  "Supply a new absolute stable tool directory",
);
mkdirSync(output); // Never replace a permission-approved binary or unsettled marker.
const source = path.join(output, "snippets-quartz.swift");
const executable = path.join(output, "quartz-input");
copyFileSync(path.join(import.meta.dirname, "snippets-quartz.swift"), source);
execFileSync("/usr/bin/xcrun", ["swiftc", source, "-o", executable], {
  stdio: "inherit",
});
execFileSync(
  "/usr/bin/codesign",
  [
    "--force",
    "--sign",
    "-",
    "--identifier",
    "io.omxterm.fixture.quartz-input",
    executable,
  ],
  { stdio: "inherit" },
);
execFileSync("/usr/bin/codesign", ["--verify", "--strict", executable], {
  stdio: "inherit",
});
const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
writeFileSync(
  path.join(output, "tool.json"),
  JSON.stringify(
    { executable, sourceSha256: hash(source), binarySha256: hash(executable) },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
// No input or permission requests. Operator preflights/provisions the stable binary.
