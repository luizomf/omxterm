import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Native Electron fixtures share the desktop compositor; keep them owned
    // and non-overlapping so background windows cannot race each other.
    fileParallelism: false,
    coverage: { enabled: false },
  },
});
