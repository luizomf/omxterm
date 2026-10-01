// Chromium initializes Linux sandbox machinery before application main runs.
// Keep Electron's CLI responsible for spawning, signals and exit status.
if (process.platform === "linux") process.argv.splice(2, 0, "--no-sandbox");
await import("electron/cli.js");
