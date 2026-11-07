import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Step {
  id?: string;
  uses: string;
  run: string;
  if?: string;
  with: {
    ref?: string;
    architecture?: string;
    path: string;
    [key: string]: string | boolean | number | undefined;
  };
}
interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: { candidate: { steps: Step[] } };
}

describe("bounded manual x64 artifact workflows", () => {
  it.each(["linux", "windows"])(
    "%s only uploads allowlisted files after successful checks",
    (platform) => {
      const workflow = parse(
        readFileSync(
          new URL(
            `../../.github/workflows/${platform}-x64.yml`,
            import.meta.url,
          ),
          "utf8",
        ),
      ) as Workflow;
      expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
      expect(workflow.permissions).toEqual({ contents: "read" });
      const steps = workflow.jobs.candidate.steps;
      const actions = steps.filter((step: { uses?: string }) => step.uses);
      for (const step of actions) expect(step.uses).toMatch(/@[a-f0-9]{40}$/u);
      const checkout = actions.find((step: { uses: string }) =>
        step.uses.startsWith("actions/checkout@"),
      );
      expect(checkout!.with.ref).toBe("${{ github.sha }}");
      expect(checkout!.with["persist-credentials"]).toBe(false);
      const node = actions.find((step: { uses: string }) =>
        step.uses.startsWith("actions/setup-node@"),
      );
      expect(node!.with["package-manager-cache"]).toBe(false);
      expect(node!.with.architecture).toBe("x64");
      if (platform === "windows") {
        expect(node!.with["node-version"]).toBe("24.22.2");
        const setup = steps.find((step) => step.id === "extension-toolchain")!;
        expect(setup.run).toContain("vswhere.exe");
        expect(setup.run).toContain("VC.Tools.x86.x64");
        expect(setup.run).toContain(
          "https://nodejs.org/dist/v24.22.2/win-x64/node.lib",
        );
        expect(setup.run).toContain(
          "a0a84aa03917b578d286010b7521837e9ff1136ffb2e4a406c14316c33fd06f7",
        );
        expect(setup.run).toContain("Get-FileHash");
        const native = steps.find((step) => step.id === "extension-native")!;
        const build = steps.find((step) => step.id === "build")!;
        for (const step of [native, build]) {
          expect(step.run).toContain('call "%OMXTERM_VCVARS%" x64');
          expect(step.run).toContain("process.version!=='v24.22.2'");
          expect(step.run).toContain("process.arch!=='x64'");
        }
        expect(native.run).toContain(
          "test/integration/installed-packages.test.ts",
        );
        expect(native.run).toContain(
          "test/integration/extension-runtime.test.ts",
        );
        expect(steps.indexOf(setup)).toBeLessThan(steps.indexOf(native));
        expect(steps.indexOf(native)).toBeLessThan(steps.indexOf(build));
      }
      const upload = actions.find((step: { uses: string }) =>
        step.uses.startsWith("actions/upload-artifact@"),
      );
      expect(upload!.if).toBeUndefined(); // default success(), never always()
      expect(upload!.with["retention-days"]).toBe(7);
      expect(upload!.with["if-no-files-found"]).toBe("error");
      const paths = upload!.with.path.trim().split("\n");
      expect(paths).toHaveLength(platform === "linux" ? 5 : 3);
      expect(paths.some((entry: string) => entry.includes("*"))).toBe(false);
      expect(paths.at(-1)).toBe("release/build-evidence.json");
      const runs = steps
        .filter((step: { run?: string }) => step.run)
        .map((step: { run: string }) => step.run);
      const npm = platform === "linux" ? "npm" : "npm.cmd";
      const cancellation = steps.findIndex(
        (step) => step.run === `${npm} run test:panel-cancellation`,
      );
      expect(cancellation).toBeGreaterThan(-1);
      expect(steps[cancellation]!.if).toBeUndefined();
      expect(cancellation).toBeLessThan(
        steps.findIndex((step) => step.run === `${npm} test -- test/unit`),
      );
      expect(runs).toContain(`${npm} test -- test/unit`);
      expect(runs).toContain(
        platform === "linux"
          ? "npm run package:verify -- --inspection-only"
          : "npm.cmd run package:verify -- --inspection-only",
      );
      expect(
        steps.findIndex((step: { id?: string }) => step.id === "upload"),
      ).toBeGreaterThan(
        steps.findIndex((step: { run?: string }) =>
          step.run?.includes("write-ci-build-evidence"),
        ),
      );
      expect(steps.at(-1)!.if).toBe("${{ always() }}");
      expect(actions).toHaveLength(3);
    },
  );
});
