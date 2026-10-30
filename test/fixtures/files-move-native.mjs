import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  symlink,
  readlink,
  readdir,
  stat,
  lstat,
  chmod,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

assert.ok(["linux", "darwin"].includes(process.platform));
assert.equal(process.arch, "arm64");
assert.ok(process.versions.electron, "must use bundled Electron Run-as-Node");
assert.notEqual(
  process.getuid(),
  0,
  "permission evidence requires ordinary user",
);
assert.notEqual(
  process.geteuid(),
  0,
  "permission evidence requires ordinary effective user",
);
const native = createRequire(import.meta.url)(path.resolve(process.argv[2]));
// macOS callers must supply a writable directory on a distinct mounted device.
const otherDirectory =
  process.argv[3] ?? (process.platform === "linux" ? "/dev/shm" : undefined);
assert.ok(
  otherDirectory && path.isAbsolute(otherDirectory),
  "absolute other-device directory required",
);
let root, other;
const checks = [];
let failure;
try {
  root = await mkdtemp(path.join(os.tmpdir(), "omx-files-native-"));
  other = await mkdtemp(path.join(otherDirectory, "omx-files-native-"));
  assert.notEqual(
    (await stat(root)).dev,
    (await stat(other)).dev,
    "cross-device precondition",
  );
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");
  await writeFile(source, "source");
  await writeFile(destination, "preserved");
  await assert.rejects(native.moveNoReplace(source, destination), {
    code: "EEXIST",
  });
  assert.equal(await readFile(destination, "utf8"), "preserved");
  assert.equal(await readFile(source, "utf8"), "source");
  checks.push("existing-file-no-clobber");
  await native.moveNoReplace(source, path.join(root, "moved"));
  assert.equal(await readFile(path.join(root, "moved"), "utf8"), "source");
  checks.push("file-move");
  await mkdir(path.join(root, "folder"));
  await writeFile(path.join(root, "folder", "entry"), "inside");
  await native.moveNoReplace(
    path.join(root, "folder"),
    path.join(root, "renamed-folder"),
  );
  assert.equal(
    await readFile(path.join(root, "renamed-folder", "entry"), "utf8"),
    "inside",
  );
  checks.push("directory-move");
  const sourceDirectory = path.join(root, "source-directory");
  const existingDirectory = path.join(root, "existing-directory");
  await mkdir(sourceDirectory);
  await writeFile(path.join(sourceDirectory, "entry"), "source-entry");
  await mkdir(existingDirectory);
  const directoryInode = (await lstat(existingDirectory)).ino;
  for (const populated of [false, true]) {
    if (populated)
      await writeFile(
        path.join(existingDirectory, "entry"),
        "destination-entry",
      );
    await assert.rejects(
      native.moveNoReplace(sourceDirectory, existingDirectory),
      { code: "EEXIST" },
    );
    assert.equal((await lstat(existingDirectory)).ino, directoryInode);
    assert.deepEqual(
      await readdir(existingDirectory),
      populated ? ["entry"] : [],
    );
    assert.equal(
      await readFile(path.join(sourceDirectory, "entry"), "utf8"),
      "source-entry",
    );
    if (populated)
      assert.equal(
        await readFile(path.join(existingDirectory, "entry"), "utf8"),
        "destination-entry",
      );
  }
  checks.push("existing-directory-no-clobber");
  await symlink("destination", path.join(root, "link"));
  await native.moveNoReplace(
    path.join(root, "link"),
    path.join(root, "moved-link"),
  );
  assert.equal(await readlink(path.join(root, "moved-link")), "destination");
  assert.equal(await readFile(destination, "utf8"), "preserved");
  checks.push("symlink-entry-not-target");
  await symlink("absent", path.join(root, "dangling"));
  await assert.rejects(
    native.moveNoReplace(destination, path.join(root, "dangling")),
    { code: "EEXIST" },
  );
  assert.equal(await readlink(path.join(root, "dangling")), "absent");
  assert.equal(await readFile(destination, "utf8"), "preserved");
  checks.push("dangling-destination-conflict");
  const target = path.join(root, "link-target");
  const existingLink = path.join(root, "existing-link");
  await writeFile(target, "target-preserved");
  await symlink("link-target", existingLink);
  await assert.rejects(native.moveNoReplace(destination, existingLink), {
    code: "EEXIST",
  });
  assert.equal(await readlink(existingLink), "link-target");
  assert.equal(await readFile(target, "utf8"), "target-preserved");
  assert.equal(await readFile(destination, "utf8"), "preserved");
  checks.push("existing-symlink-no-clobber");
  const raceA = path.join(root, "race-a"),
    raceB = path.join(root, "race-b"),
    winner = path.join(root, "winner");
  await writeFile(raceA, "A");
  await writeFile(raceB, "B");
  const races = await Promise.allSettled([
    native.moveNoReplace(raceA, winner),
    native.moveNoReplace(raceB, winner),
  ]);
  assert.equal(
    races.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const loser = races.find((result) => result.status === "rejected");
  assert.equal(loser.reason.code, "EEXIST");
  const winningText = await readFile(winner, "utf8");
  assert.equal(
    await readFile(winningText === "A" ? raceB : raceA, "utf8"),
    winningText === "A" ? "B" : "A",
  );
  checks.push("competing-destination");
  const denied = path.join(root, "denied");
  await mkdir(denied);
  await chmod(denied, 0o500);
  try {
    await assert.rejects(
      native.moveNoReplace(destination, path.join(denied, "target")),
      { code: "EACCES" },
    );
  } finally {
    await chmod(denied, 0o700);
  }
  assert.equal(await readFile(destination, "utf8"), "preserved");
  checks.push("ordinary-user-permission");
  assert.notEqual(
    (await stat(root)).dev,
    (await stat(other)).dev,
    "cross-device precondition",
  );
  await assert.rejects(
    native.moveNoReplace(destination, path.join(other, "target")),
    { code: "EXDEV" },
  );
  assert.equal(await readFile(destination, "utf8"), "preserved");
  await assert.rejects(lstat(path.join(other, "target")), { code: "ENOENT" });
  checks.push("cross-device-refusal");
} catch (error) {
  failure = error;
} finally {
  // Attempt both cleanups even if setup or one removal fails.
  const cleanup = await Promise.allSettled(
    [root, other]
      .filter(Boolean)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  const cleanupFailure = cleanup.find((result) => result.status === "rejected");
  failure ??= cleanupFailure?.reason;
  console.log(
    JSON.stringify({
      checks,
      passed: checks.length,
      failed: failure ? 1 : 0,
      runtime: process.versions,
      platform: process.platform,
      arch: process.arch,
      cleanup: cleanupFailure ? "failed" : "completed",
    }),
  );
}
if (failure) throw failure;
