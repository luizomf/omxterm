import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import { spawnFixturePty } from "./native-fixture-pty";
import { literalArguments } from "./literal-argv";

// Short ASCII lines survive ConPTY's screen-buffer wrapping. The child reports
// its received argv, not the parent's requested vector or a simulated parser.
const child = path.resolve(process.argv[2]!);
await writeFile(
  child,
  `const encoded = Buffer.from(JSON.stringify(process.argv.slice(2))).toString('base64');
process.stdout.write(['__ARGV_BEGIN__', ...encoded.match(/.{1,48}/g), '__ARGV_END__', ''].join('\\n'));
`,
);
let output = "";
const exit = await new Promise<unknown>((resolve) => {
  createLocalTerminalSession(spawnFixturePty, {
    shell: process.execPath,
    launchRequest: {
      kind: "explicit-command",
      executable: process.execPath,
      arguments: [child, ...literalArguments],
    },
    platform: process.platform,
    homeDirectory: process.cwd(),
    applicationVersionProvider: { getVersion: () => "argv-test" },
    environment: process.env,
    onOutput(data) {
      output += data;
    },
    onExit: resolve,
  });
});
const esc = String.fromCharCode(27);
const bel = String.fromCharCode(7);
const plain = output
  .replace(new RegExp(`${esc}\\][^]*?(?:${bel}|${esc}\\\\)`, "gu"), "")
  .replace(new RegExp(`${esc}\\[[0-9;?]*[ -/]*[@-~]`, "gu"), "")
  .replace(new RegExp(`${esc}[@-Z\\\\-_]`, "gu"), "")
  .replace(/[\r\n]/gu, "");
const encoded = plain.match(
  /__ARGV_BEGIN__([A-Za-z0-9+/=]+)__ARGV_END__/u,
)?.[1];
if (!encoded) throw new Error("Child did not echo argv through the PTY");
const argv: unknown = JSON.parse(
  Buffer.from(encoded, "base64").toString("utf8"),
);
// node-pty's Windows helper handles can outlive the native exit callback.
// Publish only after that callback; supervision still verifies helper cleanup.
process.stdout.write(
  `__OMXTERM_LITERAL_ARGV__${JSON.stringify({ argv, exit })}\n`,
  () => process.exit(0),
);
