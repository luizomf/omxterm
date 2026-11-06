// Exact-package adapter for the existing bounded Files0.7 consumer, not a new
// product entry. Loaded by the observer after untouched packaged startup.
const { app } = require("electron");
const assert = require("node:assert/strict");
const { readFile, writeFile } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const processIdentity = require("./snippets-process-identity.cjs");

async function run(context) {
  const {
    options,
    core,
    children,
    hosted,
    js,
    until,
    terminal,
    settings,
    installArchive,
    state,
    openFiles,
    shell,
    identity,
    shellStat,
    initialShell,
    publicLinkInstalls,
  } = context;
  assert.equal(options.extensionVersion, "0.7.0");
  assert.equal(options.extensionName, "Files — ARM64 preview");
  assert.equal(
    options.archiveSha256,
    "611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef",
  );
  assert.ok(!options.catalogMode && !options.publicCatalog);
  if (options.publicLink)
    assert.equal(
      options.archive,
      undefined,
      "public archive is only a controller-side hash oracle",
    );
  else assert.equal((await readFile(options.archive)).length, 23285);
  const sameTerminal = async () => {
    assert.equal(
      shellStat()?.start,
      identity.start,
      "same live shell identity",
    );
    assert.equal(
      await js(
        "Math.max(1, document.querySelectorAll('#tab-strip [role=tab]').length)",
      ),
      1,
    );
    assert.equal(
      await js(
        "window.__packagedCanvas === document.querySelector('.terminal-surface canvas') && window.__packagedCanvas.getBoundingClientRect().width > 0",
      ),
      true,
    );
  };
  const { runFiles070Consumer } = await import(
    pathToFileURL(path.join(options.root, "files-070-consumer.mjs")).href
  );
  await runFiles070Consumer({
    ...context,
    files: options.files,
    evidence: options.evidence,
    sameTerminal,
  });
  await sameTerminal();
  // Capture the surviving terminal only after a real same-shell receipt, with
  // child-free host render opportunities. Actual pixels still need inspection.
  await core.insertText("printf 'OMX_FILES_070_PACKAGED_TERMINAL\\n'");
  core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  await terminal("after-capture-marker");
  await js(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  await writeFile(
    path.join(options.evidence, "terminal-after.png"),
    (await core.capturePage()).toPNG(),
  );

  // The shared consumer covers Disable/Uninstall. Deliberate install/reinstall
  // adds exact-byte replacement retirement and leaves a real backend at Quit.
  await settings();
  await installArchive();
  await state("generation 4");
  assert.equal(children.length, 1, "installation remains dormant");
  await openFiles();
  assert.equal(children.length, 2);
  await settings();
  await installArchive();
  await state("generation 5");
  await until(
    () => children[1].closed && hosted().length === 0,
    "reinstall retirement",
  );
  assert.deepEqual(children[1].exit, { code: 0, signal: null });
  assert.equal(children.length, 2, "reinstall remains dormant");
  const finalView = await openFiles();
  assert.equal(children.length, 3);
  assert.equal(finalView.isDestroyed(), false);
  assert.equal(children[2].exit, null);
  assert.equal(children[2].closed, false);
  context.checks.push(
    "reinstall-retirement-dormant-third-consent-active-Files-at-Quit",
  );
  const result = {
    checks: context.checks,
    approvals: globalThis.__omxtermPackagedState.approvals,
    ...(options.publicLink
      ? {
          publicLink: {
            url: options.publicLink,
            installs: [...publicLinkInstalls],
          },
        }
      : {}),
    archiveSha256: options.archiveSha256,
    extensionVersion: options.extensionVersion,
    extensionName: options.extensionName,
    children,
    shell: { ...shell, start: identity.start },
    host: app.getVersion(),
    executable: process.execPath,
    appPath: app.getAppPath(),
    input: "synthetic Chromium; native consent controlled; inspector observer",
  };
  assert.equal(result.approvals, 3);
  if (options.publicLink)
    assert.deepEqual(
      publicLinkInstalls,
      [options.publicLink, options.publicLink, options.publicLink],
      "every installation must use the public Settings link",
    );
  app.once("will-quit", () => {
    const remaining = shellStat();
    assert.ok(
      !remaining ||
        remaining.start !== identity.start ||
        /^[ZXx]/.test(remaining.state),
      "shell kernel exit before will-quit",
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
          quit: "joined",
          joined: true,
          baselineExited: !processIdentity.alive({
            pid: initialShell.probePid,
            start: initialShell.start,
          }),
          shellAtQuit: remaining,
        },
        null,
        2,
      ),
    );
  });
  return result;
}
module.exports = { run };
