import { rename, writeFile } from "node:fs/promises";

const [firstArgument, secondArgument] = process.argv.slice(2);
const readinessFile = process.env.OMXTERM_PACKAGE_READINESS_FILE;
const expectedHome = process.env.OMXTERM_PACKAGE_EXPECTED_HOME;
const expectedArgument = process.env.OMXTERM_PACKAGE_ARGUMENT_CANARY;

const environmentMatches =
  process.cwd() === expectedHome &&
  process.env.TERM === "xterm-256color" &&
  process.env.COLORTERM === "truecolor" &&
  process.env.TERM_PROGRAM === "OMXTerm" &&
  Boolean(process.env.TERM_PROGRAM_VERSION) &&
  firstArgument === "--literal-option-looking-argument" &&
  secondArgument === expectedArgument &&
  Boolean(readinessFile);

if (!environmentMatches) process.exit(23);
if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function")
  process.exit(24);

process.stdin.setRawMode(true);
process.stdin.resume();
let input = "";
let complete = false;
const deadline = setTimeout(() => process.exit(25), 15_000);

process.stdin.on("data", (chunk) => {
  input = (input + chunk.toString("utf8")).slice(-256);
  const match = /\u001b\[6;(\d+);(\d+)t/u.exec(input);
  if (!match || complete) return;
  if (Number(match[1]) < 1 || Number(match[2]) < 1) process.exit(26);
  complete = true;
  clearTimeout(deadline);
  const linux = process.platform === "linux";
  const publicationFile = linux ? `${readinessFile}.pending` : readinessFile;
  void writeFile(
    publicationFile,
    linux
      ? `${JSON.stringify({ mainPid: process.ppid, probePid: process.pid })}\n`
      : "packaged output parsed\n",
    { flag: "wx" },
  )
    .then(() => (linux ? rename(publicationFile, readinessFile) : undefined))
    .catch(() => process.exit(27));
});

// The printable marker and parsed cell-size query traverse the same packaged
// PTY-to-Terminal-Surface output path. The query reply proves Restty processed
// output; a startup event or a live shell alone cannot create the proof file.
process.stdout.write("OMXTERM_PACKAGED_OUTPUT_PROBE\u001b[16t");
setInterval(() => undefined, 30_000);
