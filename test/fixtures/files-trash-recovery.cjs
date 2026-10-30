// One owned entry only. Never enumerate Trash, infer success from disappearance,
// follow a mismatched inode, overwrite a restored source or retry a mutation.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { lstat, readFile, writeFile, rename } = require("node:fs/promises");
const path = require("node:path");
const execute = promisify(execFile);
const identity = (stat) => ({ device: stat.dev, inode: stat.ino });
async function absent(file) {
  await assert.rejects(lstat(file), { code: "ENOENT" });
}
async function save(evidence, record) {
  const next = path.join(evidence, "trash-recovery.next.json");
  await writeFile(next, JSON.stringify(record, null, 2), {
    flag: "wx",
    mode: 0o600,
    flush: true,
  });
  await rename(next, path.join(evidence, "trash-recovery.json"));
}
async function prepare({ files, evidence, lookup }) {
  const { stdout } = await execute(lookup, [], {
    timeout: 5000,
    maxBuffer: 16384,
  });
  const { directory } = JSON.parse(stdout);
  assert.ok(typeof directory === "string" && path.isAbsolute(directory));
  const trash = await lstat(directory);
  assert.ok(trash.isDirectory() && !trash.isSymbolicLink());
  assert.equal(
    trash.dev,
    (await lstat(files)).dev,
    "Recovery lane requires local same-device Trash",
  );
  const name = `omxterm-files-${randomUUID()}.txt`;
  const source = path.join(files, name);
  const destination = path.join(directory, name);
  await absent(destination);
  const contents = `owned Files UI trash ${name}`;
  await writeFile(source, contents, { flag: "wx", mode: 0o600, flush: true });
  const record = {
    source,
    destination,
    contents,
    identity: identity(await lstat(source)),
    trashIdentity: identity(trash),
    phase: "prepared",
    verified: false,
    restored: false,
  };
  // Durable source identity precedes dispatch. An SDK-documented rename in
  // Trash remains a failed oracle, not permission to scan for another entry.
  await save(evidence, record);
  return record;
}
async function recover(record, evidence, moveNoReplace) {
  await absent(record.source);
  assert.deepEqual(
    identity(await lstat(path.dirname(record.destination))),
    record.trashIdentity,
  );
  const entry = await lstat(record.destination);
  assert.ok(entry.isFile() && !entry.isSymbolicLink());
  assert.deepEqual(identity(entry), record.identity);
  assert.equal(await readFile(record.destination, "utf8"), record.contents);
  record.verified = true;
  record.phase = "verified-before-restore";
  await save(evidence, record);
  await moveNoReplace(record.destination, record.source);
  assert.deepEqual(identity(await lstat(record.source)), record.identity);
  assert.equal(await readFile(record.source, "utf8"), record.contents);
  await absent(record.destination);
  record.restored = true;
  record.phase = "restored";
  await save(evidence, record);
}
module.exports = { prepare, recover };
