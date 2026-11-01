const assert = require("node:assert/strict");
const path = require("node:path");

// Capture is opt-in and separate from the first-Insert stopping diagnostic.
function childInputCapture({ value, platform, evidence }) {
  if (value === undefined) return false;
  assert.equal(value, "1");
  assert.equal(platform, "win32");
  assert.ok(
    typeof evidence === "string" && path.win32.isAbsolute(evidence),
    "absolute diagnostic evidence directory required",
  );
  return true;
}

// Select literal argv for the existing supervised source fixture.
function sourceLaunch({ platform, arch, root, node, electron }) {
  assert.ok(
    (platform === "linux" && ["arm64", "x64"].includes(arch)) ||
      (["darwin", "win32"].includes(platform) && arch === "arm64"),
  );
  const paths = platform === "win32" ? path.win32 : path.posix;
  for (const value of [root, node, electron])
    assert.ok(paths.isAbsolute(value));
  const windows = platform === "win32";
  const args = [
    ...(platform === "linux"
      ? [
          "--no-sandbox",
          "--ozone-platform=x11",
          "--enable-unsafe-swiftshader",
          "--use-gl=angle",
          "--use-angle=swiftshader",
        ]
      : []),
    root,
    "-e",
    ...(windows
      ? [node, paths.join(root, "snippets-windows-probe.cjs")]
      : ["/bin/sh", "-i"]),
  ];
  return windows
    ? {
        executable: node,
        args: [
          paths.join(root, "extension-composition-launch.cjs"),
          electron,
          ...args,
        ],
      }
    : { executable: electron, args };
}
module.exports = { sourceLaunch, childInputCapture };
