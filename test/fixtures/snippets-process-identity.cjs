// Kernel process identity for the packaged observer (not a kill authority).
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
function identity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid PID");
  if (process.platform === "darwin") {
    let text;
    try {
      text = execFileSync(
        "/bin/ps",
        ["-p", String(pid), "-o", "lstart=,stat="],
        {
          encoding: "utf8",
          timeout: 5000,
          env: { ...process.env, LC_ALL: "C" },
        },
      );
    } catch (error) {
      if (
        error.status === 1 &&
        !String(error.stdout).trim() &&
        !String(error.stderr).trim()
      )
        return null;
      throw error;
    }
    const match =
      /^\s*(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s*$/.exec(
        text,
      );
    if (!match) throw new Error("Cannot parse macOS process identity");
    return { pid, start: match[1], state: match[2] };
  }
  if (process.platform !== "linux")
    throw new Error("Unsupported packaged observer platform");
  try {
    const text = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = text
      .slice(text.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/);
    return { pid, start: fields[19], state: fields[0] };
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes(error.code)) return null;
    throw error;
  }
}
function alive(record) {
  const current = identity(record.pid);
  return current?.start === record.start && !/^[ZXx]/.test(current.state);
}
module.exports = { identity, alive };
