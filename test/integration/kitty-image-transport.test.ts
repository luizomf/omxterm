import * as nodePty from "node-pty";
import { describe, expect, it } from "vitest";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import { isNativeTestArchitecture } from "../fixtures/native-architecture";

// The renderer fixture cannot detect a ConPTY implementation dropping APCs
// before the Terminal Surface receives them. Exercise the real Adapter too.
describe.skipIf(process.platform !== "win32" || !isNativeTestArchitecture())(
  "Kitty image transport through Windows ConPTY",
  () => {
    it("delivers a complete Kitty image sequence without consuming it", async () => {
      const image = "\u001b_Ga=T,f=32,s=1,v=1,m=0;AAAA/w==\u001b\\";
      let output = "";
      let session: ReturnType<typeof createLocalTerminalSession> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const exited = new Promise<void>((resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Kitty transport timed out")),
          10_000,
        );
        session = createLocalTerminalSession(nodePty.spawn, {
          shell: process.execPath,
          launchRequest: {
            kind: "explicit-command",
            executable: process.execPath,
            arguments: ["-e", `process.stdout.write(${JSON.stringify(image)})`],
          },
          platform: process.platform,
          homeDirectory: process.cwd(),
          applicationVersionProvider: { getVersion: () => "9.8.7-test" },
          environment: process.env,
          onOutput(data) {
            output = (output + data).slice(-16_384);
          },
          onExit(event) {
            if (event.exitCode === 0) resolve();
            else reject(new Error("Kitty image emitter failed"));
          },
        });
      });
      try {
        await exited;
        expect(output).toContain(image);
      } finally {
        clearTimeout(timeout);
        session?.close();
      }
    }, 15_000);
  },
);
