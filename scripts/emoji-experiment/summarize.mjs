import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile(process.argv[2], "utf8"));
const { runs, ...identity } = data;
const summary = {
  ...identity,
  units: { heap: "bytes", mainMemory: "bytes", processMemory: "KiB" },
  runtime: Object.fromEntries(
    ["electron", "chrome", "node", "v8"].map((name) => [
      name,
      runs[0].versions[name],
    ]),
  ),
  runs: runs.map((run, index) => ({
    mode: run.mode,
    trial: run.trial,
    variant: run.variant,
    reads: run.reads,
    fontBytes: run.result.fontBytes,
    probe: run.result.probe,
    dpr: run.result.dpr,
    renderingMatchesPair: run.phases.every(
      (phase, i) => phase.hash === runs[index ^ 1].phases[i].hash,
    ),
    geometryMatchesPair:
      JSON.stringify(run.result.results) ===
      JSON.stringify(runs[index ^ 1].result.results),
    phases: run.phases
      .filter((phase) => ["startup", "emoji-16"].includes(phase.name))
      .map(({ hash: _hash, ...phase }) => phase),
  })),
};
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
