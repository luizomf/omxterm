import { expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { exerciseExplicitResttyTab } from "../fixtures/restty-host-explicit-tab";

it.each(["startup", "unicode-input"] as const)(
  "does not print gesture destinations when the owned child has not acknowledged %s",
  async (missing) => {
    const deliverOutput = vi.fn();
    const outputs: string[][] = [[]];
    const inputs: string[][] = [[]];
    const resizes = [[{ cols: 80, rows: 20 }]];
    const launchKinds = ["default-shell"];
    const reload = vi.fn(async () => undefined);
    const window = {
      webContents: {
        send() {
          launchKinds.push("explicit-command");
          resizes.push([{ cols: 80, rows: 20 }]);
          outputs.push(
            missing === "startup" ? [] : ["__EXPLICIT_READY__Olá🙂"],
          );
          inputs.push([]);
        },
        async executeJavaScript(script: string) {
          if (script.startsWith("({ fonts:")) return { fonts: [], notice: "" };
          if (script.includes("new InputEvent"))
            inputs[1]!.push("second🙂", "\r");
          return true;
        },
      },
    } as unknown as BrowserWindow;
    const outcome = exerciseExplicitResttyTab({
      window,
      root: "/owned-fixture",
      launchKinds,
      resizes,
      outputs,
      inputs,
      deliverOutputs: [deliverOutput, deliverOutput],
      externalLinks: [],
      localImageRequests: [],
      titleEvents: [null, null, null],
      bellSessionIds: ["first", "second"],
      ended: [],
      reload,
      async waitFor(predicate, label) {
        if (!(await predicate()))
          throw new Error(`Unacknowledged fixture: ${label}`);
      },
    });
    await expect(outcome).rejects.toThrow(
      missing === "startup"
        ? "Explicit command produced no readiness marker"
        : "selected-tab Unicode input isolation",
    );
    expect(deliverOutput).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(missing === "startup" ? 0 : 1);
    expect(inputs[1]).toEqual(missing === "startup" ? [] : ["second🙂", "\r"]);
  },
);
