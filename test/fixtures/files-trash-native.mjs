// Assigned ordinary-user macOS only. Never enumerate Trash: inspect only the
// exact URL returned by this invocation, and restore only verified owned inodes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const identity = (value) => ({ device: value.dev, inode: value.ino });
const same = (a, b) => a.device === b.device && a.inode === b.inode;

// Exported only for headless ownership/failure tests; CLI always loads the real
// addon. The service never exposes native resulting paths to extension views.
export async function runTrashFixture(
  native,
  { evidence, parent, otherParent },
) {
  assert.ok(path.isAbsolute(evidence) && path.isAbsolute(parent));
  if (otherParent) assert.ok(path.isAbsolute(otherParent));
  await mkdir(evidence, { mode: 0o700 }); // Exclusive new evidence directory.
  const receipt = {
    checks: [],
    roots: [],
    entries: [],
    pending: null,
    outcome: "running",
    cleanup: "not-started",
  };
  const save = async () => {
    // Never truncate the last recovery record during an interrupted update.
    // A failed staged write is preserved, not overwritten or retried.
    const next = path.join(evidence, "receipt.next.json");
    await writeFile(next, JSON.stringify(receipt, null, 2), {
      mode: 0o600,
      flag: "wx",
      flush: true,
    });
    await rename(next, path.join(evidence, "receipt.json"));
  };
  async function absent(target) {
    await assert.rejects(lstat(target), { code: "ENOENT" });
  }
  async function verify(entry) {
    assert.ok(
      same(identity(await lstat(entry.result)), entry.identity),
      "returned entry identity changed",
    );
    if (entry.kind === "link")
      assert.equal(await readlink(entry.result), entry.contents);
    else if (entry.kind === "file")
      assert.equal(await readFile(entry.result, "utf8"), entry.contents);
    else if (entry.kind === "directory")
      assert.equal(
        await readFile(path.join(entry.result, "payload"), "utf8"),
        entry.contents,
      );
    else assert.ok((await lstat(entry.result)).isDirectory());
  }
  async function trash(source, kind, contents) {
    const entry = {
      source,
      identity: identity(await lstat(source)),
      kind,
      contents,
      result: null,
      verified: false,
      restored: false,
    };
    receipt.entries.push(entry);
    receipt.pending = { source, identity: entry.identity };
    await save(); // Persist identity before dispatch; failures retain all fixtures.
    entry.result = await native.trash(source);
    await save(); // Retain even an unexpected destination, but never clean it.
    assert.ok(
      typeof entry.result === "string" && path.isAbsolute(entry.result),
    );
    assert.notEqual(entry.result, source);
    await absent(source);
    await verify(entry);
    entry.verified = true;
    receipt.pending = null;
    await save();
    return entry;
  }
  try {
    const root = await mkdtemp(path.join(parent, "omx-trash-native-"));
    receipt.roots.push(root);
    await save();
    const prefix = path.basename(root);
    const file = path.join(root, `${prefix}-space ' \" ; $() % # café`);
    await writeFile(file, "recoverable-file");
    await trash(file, "file", "recoverable-file");
    receipt.checks.push("literal-file-recoverable");
    for (const populated of [false, true]) {
      const folder = path.join(root, `${prefix}-directory-${populated}`);
      await mkdir(folder);
      if (populated)
        await writeFile(path.join(folder, "payload"), "recoverable-directory");
      await trash(
        folder,
        populated ? "directory" : "empty-directory",
        "recoverable-directory",
      );
    }
    receipt.checks.push("empty-and-nonempty-directories-recoverable");
    const referentFile = path.join(root, "referent-file");
    const referentDirectory = path.join(root, "referent-directory");
    await writeFile(referentFile, "untouched-file");
    await mkdir(referentDirectory);
    await writeFile(
      path.join(referentDirectory, "payload"),
      "untouched-directory",
    );
    for (const [label, target] of [
      ["file", referentFile],
      ["directory", referentDirectory],
      ["dangling", path.join(root, "missing")],
    ]) {
      const link = path.join(root, `${prefix}-link-${label}`);
      await symlink(target, link);
      await trash(link, "link", target);
      assert.equal(await readFile(referentFile, "utf8"), "untouched-file");
      assert.equal(
        await readFile(path.join(referentDirectory, "payload"), "utf8"),
        "untouched-directory",
      );
      await absent(path.join(root, "missing"));
    }
    receipt.checks.push("file-directory-dangling-links-not-referents");
    const ambiguous = path.join(root, `${prefix}-ambiguous-link`);
    await symlink(referentDirectory, ambiguous);
    for (const target of [
      ambiguous + "/",
      ambiguous + "/.",
      ambiguous + "/..",
      "/",
      "//invalid",
      "/invalid\0path",
      "relative",
      "/" + "x".repeat(16385),
    ]) {
      assert.throws(() => native.trash(target), { code: "EINVAL" });
    }
    assert.throws(() => native.trash(ambiguous, "extra"), { code: "EINVAL" });
    assert.equal(await readlink(ambiguous), referentDirectory);
    assert.equal(
      await readFile(path.join(referentDirectory, "payload"), "utf8"),
      "untouched-directory",
    );
    receipt.checks.push("ambiguous-paths-refused-before-dispatch");
    const collisions = [];
    for (const label of ["a", "b"]) {
      const directory = path.join(root, label);
      await mkdir(directory);
      const source = path.join(directory, `${prefix}-same-name`);
      await writeFile(source, label);
      collisions.push(await trash(source, "file", label));
    }
    assert.notEqual(collisions[0].result, collisions[1].result);
    await verify(collisions[0]);
    await verify(collisions[1]);
    receipt.checks.push("trash-name-collision-preserves-both");
    const missing = path.join(root, "absent-source");
    await assert.rejects(native.trash(missing), { code: "EIO" });
    await absent(missing);
    receipt.checks.push("missing-source-fixed-error");
    const denied = path.join(root, "denied");
    await mkdir(denied);
    const deniedFile = path.join(denied, `${prefix}-permission`);
    await writeFile(deniedFile, "preserved");
    receipt.pending = {
      source: deniedFile,
      identity: identity(await lstat(deniedFile)),
    };
    await save();
    await chmod(denied, 0o500);
    try {
      const outcome = await native.trash(deniedFile).then(
        (result) => ({ result }),
        (error) => ({ code: error?.code }),
      );
      receipt.pending.outcome = outcome;
      await save();
      assert.deepEqual(outcome, { code: "EIO" });
    } finally {
      await chmod(denied, 0o700);
    }
    assert.equal(await readFile(deniedFile, "utf8"), "preserved");
    receipt.pending = null;
    receipt.checks.push("ordinary-user-permission-no-delete-fallback");
    // Completion callbacks cannot run until this synchronous dispatch burst
    // returns. Missing sources ensure this queue-bound check has no effects.
    const queued = Array.from({ length: 32 }, (_, i) =>
      i % 2
        ? native.trash(missing)
        : native.moveNoReplace(missing, path.join(root, "never-created")),
    );
    const settled = Promise.allSettled(queued);
    assert.throws(() => native.trash(missing), { code: "EBUSY" });
    assert.throws(
      () => native.moveNoReplace(missing, path.join(root, "never-created")),
      { code: "EBUSY" },
    );
    const outcomes = await settled;
    assert.ok(outcomes.every((outcome) => outcome.status === "rejected"));
    await assert.rejects(native.trash(missing), { code: "EIO" });
    await absent(path.join(root, "never-created"));
    receipt.checks.push("shared-32-operation-bound-and-release");
    if (otherParent) {
      const other = await mkdtemp(path.join(otherParent, "omx-trash-native-"));
      receipt.roots.push(other);
      await save();
      assert.notEqual(
        (await stat(root)).dev,
        (await stat(other)).dev,
        "distinct-device precondition",
      );
      const source = path.join(other, `${path.basename(other)}-volume-file`);
      await writeFile(source, "other-volume");
      await trash(source, "file", "other-volume");
      receipt.checks.push("other-volume-recoverable");
    }
    receipt.cleanup = "restoring-verified-entries";
    await save();
    for (const entry of receipt.entries) {
      assert.ok(entry.verified);
      await verify(entry); // Do not remove/restore a replaced or unknown entry.
      await native.moveNoReplace(entry.result, entry.source);
      assert.ok(same(identity(await lstat(entry.source)), entry.identity));
      entry.restored = true;
      await save();
    }
    for (const root of receipt.roots)
      await rm(root, { recursive: true, force: false });
    receipt.cleanup = "completed";
    receipt.outcome = "passed";
  } catch {
    // No cleanup on failure/unknown. Private receipt retains owned identities
    // and exact returned paths for deliberate recovery, never Trash enumeration.
    receipt.outcome = "failed";
    if (receipt.cleanup === "not-started") receipt.cleanup = "preserved";
  }
  await save();
  return receipt;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(process.platform, "darwin");
  assert.equal(process.arch, "arm64");
  assert.ok(process.versions.electron && !process.type);
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, "1");
  assert.notEqual(process.getuid(), 0);
  assert.notEqual(process.geteuid(), 0);
  const [addon, evidence, parent, otherParent] = process.argv.slice(2);
  assert.ok(addon && path.isAbsolute(addon));
  const result = await runTrashFixture(createRequire(import.meta.url)(addon), {
    evidence,
    parent,
    otherParent,
  });
  console.log(
    JSON.stringify({
      checks: result.checks,
      outcome: result.outcome,
      cleanup: result.cleanup,
      runtime: process.versions,
      target: "darwin-arm64",
    }),
  );
  if (result.outcome !== "passed") process.exitCode = 1;
}
