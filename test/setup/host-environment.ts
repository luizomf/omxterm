import { withoutAppImageRuntime } from "../../src/main/appimage-environment";

// Contributors often run the suite inside OMXTerm itself. A packaged Linux
// OMXTerm runs from an AppImage; keep its runtime variables and mount paths
// away from the Electron and PTY children these tests launch (see #609).
const cleaned = withoutAppImageRuntime(process.env, process.platform);
for (const name of Object.keys(process.env))
  if (!(name in cleaned)) delete process.env[name];
Object.assign(process.env, cleaned);
