import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { buildFixture } from "../fixtures/restty-scrollback-rendering-build";
import { removeFailedFixture } from "../fixtures/remove-failed-fixture";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import type { ScrollFeedbackEvent } from "../fixtures/restty-native-scroll-feedback-observer";

for (const mode of [
  "native-scroll-feedback",
  "native-scroll-feedback-ready-before-map",
] as const) {
  it(`keeps the native viewport live through queued spacer clamps and intentional scrolling (${mode})`, async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-native-scroll-feedback-"),
    );
    await buildFixture(root, mode);
    let supervised = false;
    try {
      const args: string[] = [];
      applyChromiumSandboxPolicy({
        appendSwitch: (name) => args.push(`--${name}`),
      });
      if (process.platform === "linux") args.push("--ozone-platform=x11");
      const executable = createRequire(import.meta.url)("electron") as string;
      supervised = true;
      const result = await runNativeFixture({
        executable,
        args: [...args, root],
        root,
        timeout: 60_000,
      });
      expect(result, result.stderr).toMatchObject({
        exitCode: 0,
        reason: "exit",
        cleanupErrors: [],
      });
      const prefix = "__OMXTERM_NATIVE_SCROLL_FEEDBACK__";
      const line = result.stdout
        .split("\n")
        .find((entry) => entry.startsWith(prefix));
      expect(line).toBeDefined();
      const feedback = JSON.parse(line!.slice(prefix.length)) as {
        transitions: Array<{
          scrollTop: number;
          scrollHeight: number;
          clientHeight: number;
          core: { total: number; offset: number; len: number };
        }>;
        events: ScrollFeedbackEvent[];
        dpr: number;
        baseline: {
          width: number;
          clientHeight: number;
          canvasWidth: number;
          canvasHeight: number;
          core: { len: number; cellH: number };
        };
        mapping: {
          readyBeforeMap: boolean;
          beforeMap: { visible: boolean; surfaceReady: boolean | null };
          content: { width: number; height: number };
        };
      };
      if (mode === "native-scroll-feedback-ready-before-map") {
        expect(feedback.mapping).toMatchObject({
          readyBeforeMap: true,
          beforeMap: { visible: false, surfaceReady: true },
        });
      }
      // Assert observed native/content/backing/core agreement, never a
      // requested/historical size that a tiler is free to replace.
      expect(feedback.baseline.width).toBe(feedback.mapping.content.width);
      expect(feedback.baseline.clientHeight).toBe(
        feedback.mapping.content.height,
      );
      expect(feedback.baseline.canvasWidth).toBe(
        Math.round(feedback.baseline.width * feedback.dpr),
      );
      expect(feedback.baseline.canvasHeight).toBe(
        Math.round(feedback.baseline.clientHeight * feedback.dpr),
      );
      expect(feedback.baseline.core.len).toBe(
        Math.floor(
          feedback.baseline.canvasHeight / feedback.baseline.core.cellH,
        ),
      );
      expect(feedback.transitions).toHaveLength(12);
      for (const transition of feedback.transitions) {
        expect(transition.scrollTop).toBe(
          transition.scrollHeight - transition.clientHeight,
        );
        expect(transition.core.offset).toBe(
          transition.core.total - transition.core.len,
        );
      }
      const clamps = feedback.events.filter(
        (event) => event.kind === "spacer-clamp",
      );
      expect(clamps.length).toBeGreaterThan(0);
      expect(clamps.every((event) => event.suppressed)).toBe(true);
    } catch (error) {
      if (!supervised) await removeFailedFixture(root, error);
      throw error;
    }
  }, 90_000);
}
