// Files-only exact-DMG adapter. Never send input to the terminal.
const { app } = require("electron");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const processIdentity = require("./snippets-process-identity.cjs");

async function run(context) {
  const {
    options,
    checks,
    children,
    shellStat,
    identity,
    initialShell,
    publicCatalogInstalls,
  } = context;
  assert.equal(options.filesOnly, true);
  assert.equal(options.version, "0.25.0");
  assert.equal(options.extensionVersion, "0.7.0");
  assert.equal(
    options.archiveSha256,
    "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef",
  );
  if (options.publicCatalog) {
    assert.deepEqual(publicCatalogInstalls, ["Install"]);
    checks.push("catalog-activation-active-Files-at-Quit");
  } else {
    assert.equal((await readFile(options.archive)).length, 23285);
    const { runFiles070Consumer } = await import(
      pathToFileURL(path.join(options.root, "files-070-consumer.mjs")).href
    );
    await runFiles070Consumer({
      ...context,
      files: options.files,
      evidence: options.evidence,
      filesOnly: true,
    });
  }
  assert.equal(children.length, 1);
  assert.equal(children[0].exit, null);
  assert.equal(children[0].closed, false);
  assert.equal(shellStat()?.start, identity.start);
  const result = {
    checks,
    approvals: globalThis.__omxtermPackagedState.approvals,
    archiveSha256: options.archiveSha256,
    ...(options.publicCatalog
      ? {
          publicCatalog: {
            url: options.publicCatalog,
            installs: [...publicCatalogInstalls],
          },
          catalog: { mode: "public", requests: null, transportClosed: null },
        }
      : {}),
    children,
    host: app.getVersion(),
    input: "synthetic Chromium and controlled consent; no terminal input",
  };
  assert.equal(result.approvals, 1);
  app.once("will-quit", () => {
    const remaining = shellStat();
    assert.ok(
      !remaining ||
        remaining.start !== identity.start ||
        /^[ZXx]/.test(remaining.state),
    );
    for (const child of children) {
      assert.equal(child.closed, true);
      assert.deepEqual(child.exit, { code: 0, signal: null });
    }
    writeFileSync(
      path.join(options.evidence, "quit.json"),
      JSON.stringify(
        {
          ...result,
          joined: true,
          baselineExited: !processIdentity.alive({
            pid: initialShell.probePid,
            start: initialShell.start,
          }),
        },
        null,
        2,
      ),
    );
  });
  return result;
}
module.exports = { run };
