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
      expect(runs).toContain(
        platform === "linux"
          ? "npm test -- test/unit"
          : "npm.cmd test -- test/unit",
      );
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
