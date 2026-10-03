import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/{unit,integration}/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    environment: "node",
    reporters: ["default", "json"],
    outputFile: { json: ".scratch/vitest-results.json" },
    // Native Electron fixtures share the desktop compositor; keep them owned
    // and non-overlapping so background windows cannot race each other.
    fileParallelism: false,
    coverage: { enabled: false },
  },
});
