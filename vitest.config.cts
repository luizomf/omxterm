const { defineConfig } =
  require("vitest/config") as typeof import("vitest/config");

// CJS config bundling stays in memory instead of writing node_modules/.vite-temp.
module.exports = defineConfig({
  cacheDir: ".scratch/vite",
  test: {
    include: ["test/{unit,integration}/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    environment: "node",
    reporters: ["default", "json"],
    outputFile: { json: ".scratch/vitest-results.json" },
    // Native Electron fixtures share the desktop compositor; keep them owned
    // and non-overlapping so background windows cannot race each other.
    fileParallelism: false,
    // A hang guard, not a speed check. test:unit runs every file in parallel;
    // tests that drive real modules, files or multi-MiB payloads take ~0.5 s
    // idle but approach 5 s when the machine is busy.
    testTimeout: 20_000,
    coverage: { enabled: false },
  },
});
