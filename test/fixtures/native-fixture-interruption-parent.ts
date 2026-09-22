import { runNativeFixture } from "./run-native-fixture";
const [root, evidencePath, program, timeout] = process.argv.slice(2) as [
  string,
  string,
  string,
  string,
];
const result = await runNativeFixture({
  executable: process.execPath,
  args: [program, root],
  root,
  evidencePath,
  timeout: Number(timeout),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode =
  result.exitCode === 0 &&
  result.reason === "exit" &&
  result.cleanupErrors.length === 0
    ? 0
    : 1;
