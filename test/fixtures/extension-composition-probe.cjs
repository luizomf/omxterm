// The Windows composition fixture runs this real Node process inside ConPTY.
const readline = require("node:readline");

process.stdout.write("COMPOSITION_PROBE_READY\n");
const lines = readline.createInterface({
  input: process.stdin,
  terminal: false,
  crlfDelay: Infinity,
});
lines.on("line", (line) => {
  if (line === "COMPOSITION_INPUT") process.stdout.write("COMPOSITION_ACK\n");
});
