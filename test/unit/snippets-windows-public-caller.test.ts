// @vitest-environment jsdom
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const digest =
  "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7";

function deferredSettingsRenderer(
  phase: "navigation" | "browse",
  onBrowse: () => void,
) {
  let pending = false;
  return {
    open() {
      document.body.innerHTML = '<section class="settings-dialog"></section>';
      pending = true;
      if (phase === "browse") {
        const panel = document.createElement("section");
        panel.className = "extensions-panel";
        const browse = document.createElement("button");
        browse.textContent = "Browse official extensions";
        browse.disabled = true;
        Object.defineProperty(browse, "getClientRects", {
          value: () => [{ width: 40, height: 20 }],
        });
        browse.addEventListener("click", onBrowse);
        panel.append(browse);
        document.body.append(panel);
      }
    },
    evaluate(code: string): unknown {
      const result: unknown = runInNewContext(code, { document });
      if (!pending || code.includes(".click()")) return result;
      // Resolve controlled availability after its not-ready state was observed.
      // Navigation models the Settings snapshot; disabled Browse is a generic
      // synthetic condition, not an initial-management-snapshot dependency.
      if (phase === "navigation" && code.includes("#settings-tab-extensions")) {
        const tab = document.createElement("button");
        tab.id = "settings-tab-extensions";
        tab.setAttribute("aria-selected", "false");
        Object.defineProperty(tab, "getClientRects", {
          value: () => [{ width: 40, height: 20 }],
        });
        tab.addEventListener("click", () => {
          tab.setAttribute("aria-selected", "true");
          const panel = document.createElement("section");
          panel.className = "extensions-panel";
          document.body.append(panel);
        });
        document.body.append(tab);
        pending = false;
      }
      if (phase === "browse" && code.includes("Browse official extensions")) {
        document.querySelector<HTMLButtonElement>(
          ".extensions-panel button",
        )!.disabled = false;
        pending = false;
      }
      return result;
    },
    dispose: () => document.body.replaceChildren(),
  };
}

function controlledSession() {
  const trace = (
    require("../fixtures/snippets-windows-cpr.cjs") as {
      createWindowsCprTrace(): {
        output(data: string): void;
        write(index: number, data: string): void;
        snapshot(): object;
      };
    }
  ).createWindowsCprTrace();
  const session = {
    pid: 1,
    exited: false,
    output: "\u001b[?2004lSNIPPETS_SHELL_READY\r\n",
    outputTruncated: false,
    outputLimitCodeUnits: 65536,
    writes: [] as string[],
    cprTrace: trace,
  };
  trace.output(session.output);
  return {
    session,
    recordWrite(text: string) {
      trace.write(session.writes.length, text);
      session.writes.push(text);
    },
    output(text: string) {
      trace.output(text);
      session.output += text;
    },
  };
}

// Exercise the real scenario caller against controlled WebContents/process edges.
// The separate DOM tests execute the actual selection function with real DOM nodes.
async function exercise(
  fault?:
    | "extra-byte"
    | "duplicate-receipt"
    | "local-activation"
    | "changed-yaml"
    | "replaced-pty"
    | "backend-failure"
    | "late-settings-tab"
    | "late-browse-button",
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "public-snippets-"));
  await mkdir(path.join(root, "config/omxterm"), { recursive: true });
  const yaml = await readFile(
    "test/fixtures/snippets-windows-catalog.json",
    "utf8",
  );
  await writeFile(path.join(root, "config/omxterm/snippets.yaml"), yaml);
  const { session, recordWrite, output } = controlledSession();
  const children: Array<{
    pid: number;
    closed: boolean;
    exit: { code: number; signal: null } | null;
  }> = [];
  let generation = 0;
  let status = "uninstalled";
  let local = "dormant";
  let approvals = 0;
  let browsed = false;
  let coreFocus = true;
  let view: typeof childView | undefined;
  const actions: string[] = [];
  const deferred =
    fault === "late-settings-tab" || fault === "late-browse-button"
      ? deferredSettingsRenderer(
          fault === "late-settings-tab" ? "navigation" : "browse",
          () => {
            actions.push("Browse");
            browsed = true;
          },
        )
      : undefined;
  const capturePage = async () => ({
    isEmpty: () => false,
    toPNG: () => Buffer.from("controlled-image"),
  });
  const childView = {
    capturePage,
    isDestroyed: () => view !== childView,
    getURL: () => "omx-extension://snippets/index.html",
    isFocused: () => !coreFocus,
    executeJavaScript: async (code: string) => {
      if (code.includes(".snippet-activate')") && !code.includes("nodes ="))
        return true;
      if (code.includes("requestAnimationFrame")) return;
      if (code.includes("li:last-child .snippet-activate")) {
        actions.push("run");
        coreFocus = true;
        recordWrite("SNIPPETS_RUN\r");
        if (fault === "extra-byte") recordWrite("x");
        output(
          "SNIPPETS_RUN_RECEIPT\r\n" +
            (fault === "duplicate-receipt" ? "SNIPPETS_RUN_RECEIPT\r\n" : ""),
        );
        return;
      }
      throw Error(`unexpected child expression ${code}`);
    },
  };
  const native = {
    webContents: childView,
    getVisible: () => !!view,
    getBounds: () => ({ width: 100 }),
  };
  const core = {
    capturePage,
    isFocused: () => coreFocus,
    async insertText(text: string) {
      actions.push("ping");
      recordWrite(text);
    },
    sendInputEvent(event: { type: string }) {
      if (event.type === "keyDown") {
        recordWrite("\r");
        output("SNIPPETS_AFTER_RETIREMENT\r\n");
      }
    },
    // eslint-disable-next-line complexity -- Controlled WebContents boundary covers the scenario's fixed expressions.
    async executeJavaScript(code: string) {
      if (code.includes("selectPublicCatalogAction")) {
        const match = /\)\(document, "(Install|Reinstall)"\)/.exec(code);
        if (!match) throw Error("catalog action missing");
        if (code.endsWith(").click()")) {
          actions.push(match[1]!);
          if (
            (match[1] === "Install" && generation !== 0) ||
            (match[1] === "Reinstall" && generation !== 1)
          )
            throw Error("wrong catalog action");
          if (generation === 1) {
            children[0]!.closed = true;
            children[0]!.exit = {
              code: fault === "backend-failure" ? 1 : 0,
              signal: null,
            };
            view = undefined;
          }
          generation++;
          approvals++;
          status = "enabled";
          local = "dormant";
          if (fault === "local-activation" && generation === 1)
            children.push({ pid: 9, closed: false, exit: null });
        }
        return true;
      }
      if (code.includes("managementState")) {
        const match =
          /\)\(document, (\d+), "(\w+)", "(\w+)", (?:null|"\w+")\)$/.exec(code);
        if (!match) throw Error("invalid management query");
        if (
          generation !== Number(match[1]) ||
          status !== match[2] ||
          local !== match[3]
        )
          throw Error("unexpected management ordering");
        return true;
      }
      if (code.includes("clickManagementAction")) {
        const action = /\)\(document, "(Disable|Enable|Uninstall)"\)$/.exec(
          code,
        )?.[1];
        if (!action) throw Error("invalid management action");
        actions.push(action);
        generation++;
        if (action === "Disable") {
          status = "disabled";
          local = "dormant";
          children[1]!.closed = true;
          children[1]!.exit = { code: 0, signal: null };
          view = undefined;
        }
        if (action === "Enable") {
          status = "enabled";
          local = "dormant";
        }
        if (action === "Uninstall") {
          status = "uninstalled";
          local = "dormant";
          if (fault === "changed-yaml")
            await writeFile(
              path.join(root, "config/omxterm/snippets.yaml"),
              "changed",
            );
        }
        return;
      }
      if (code.includes("Browse official extensions")) {
        if (fault === "late-browse-button") return deferred!.evaluate(code);
        if (code.includes(".click()")) {
          actions.push("Browse");
          browsed = true;
        }
        return true;
      }
      if (code.includes("Catalog loaded.")) return browsed;
      if (code.includes(".settings-close")) {
        coreFocus = true;
        return;
      }
      if (code.includes("requestAnimationFrame")) return;
      if (code.includes("#settings-tab-extensions")) {
        if (fault !== "late-settings-tab") return true;
        return deferred!.evaluate(code);
      }
      if (code.includes(".settings-dialog"))
        return fault === "late-settings-tab" ? deferred!.evaluate(code) : true;
      if (code.includes("window.__snippetsPublicCanvas ===")) return true;
      if (code.includes("window.__snippetsPublicCanvas =")) return;
      if (code.includes(".terminal-surface")) return true;
      throw Error(`unexpected core expression ${code}`);
    },
  };
  const window = {
    webContents: core,
    contentView: { children: [native] },
    focus() {
      coreFocus = true;
    },
  };
  const menu = [
    {
      label: "Settings",
      click() {
        actions.push("Settings");
        coreFocus = true;
        deferred?.open();
      },
    },
    {
      label: "Toggle Snippets",
      click() {
        actions.push("Toggle");
        const pid = children.length + 2;
        children.push({ pid, closed: false, exit: null });
        local = "active";
        coreFocus = false;
        view = childView;
      },
    },
  ];
  const electron = {
    Menu: { getApplicationMenu: () => ({ items: menu }) },
    webContents: { getAllWebContents: () => (view ? [view] : []) },
  };
  const module = {
    exports: {} as {
      runPublicScenario(context: object): Promise<{
        checks: string[];
        identities: unknown[];
        approvals: number;
      }>;
    },
  };
  runInNewContext(
    readFileSync("test/fixtures/snippets-windows-public-scenario.cjs", "utf8"),
    {
      module,
      setTimeout: (fn: () => void) => setTimeout(fn, 0),
      Date,
      JSON,
      require(name: string) {
        if (name === "electron") return electron;
        if (name.startsWith("./"))
          return require(`../fixtures/${name.slice(2)}`) as unknown;
        return require(name) as unknown;
      },
    },
  );
  try {
    const result = await module.exports.runPublicScenario({
      window,
      fixture: {
        root,
        evidence: root,
        publicCatalog: true,
        archiveSha256: digest,
      },
      ptys: [session],
      children,
      approvalCount: () => approvals,
      archiveSha256: digest,
      fixtureProcesses: () => [
        {
          pid: 1,
          parent: 41,
          identity:
            fault === "replaced-pty" && actions.includes("Uninstall")
              ? "pty2"
              : "pty1",
        },
        ...children
          .filter((child) => !child.closed)
          .map((child) => ({
            pid: child.pid,
            parent: 41,
            identity: `backend${child.pid}`,
          })),
      ],
      windowsProbeReady: () => true,
    });
    return {
      result,
      actions,
      session,
      evidence: JSON.parse(
        await readFile(path.join(root, "pty-writes.json"), "utf8"),
      ) as {
        writes: string[];
        childOutput: { text: string };
        cprTrace: object;
      },
      capturedCatalog: await readFile(
        path.join(root, "public-catalog-install.png"),
        "utf8",
      ),
      yaml: await readFile(
        path.join(root, "config/omxterm/snippets.yaml"),
        "utf8",
      ),
    };
  } finally {
    deferred?.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

it("drives public acquisition, two dormant epochs, retirement and same-session Ping before Quit", async () => {
  const { result, actions, session, yaml, evidence, capturedCatalog } =
    await exercise();
  expect(result.checks).toEqual([
    "public-catalog-install-official-trust-dormant",
    "explicit-toggle-exact-run-child-receipt",
    "public-reinstall-old-backend-joined-dormant",
    "disable-enable-uninstall-unchanged-catalog",
    "same-surface-pty-usable-before-quit",
  ]);
  expect(result.approvals).toBe(2);
  expect(result.identities).toHaveLength(3);
  expect(actions).toEqual([
    "Settings",
    "Browse",
    "Install",
    "Toggle",
    "run",
    "Settings",
    "Reinstall",
    "Toggle",
    "Settings",
    "Disable",
    "Enable",
    "Uninstall",
    "ping",
  ]);
  expect(session.writes.join("")).toBe("SNIPPETS_RUN\rSNIPPETS_PING\r");
  expect(evidence.writes).toEqual(["SNIPPETS_RUN\r", "SNIPPETS_PING", "\r"]);
  expect(evidence.childOutput.text).toContain("SNIPPETS_AFTER_RETIREMENT\r\n");
  expect(evidence.cprTrace).toMatchObject({ incomplete: false, writeEnd: 3 });
  expect(capturedCatalog).toBe("controlled-image");
  expect(JSON.parse(yaml)).toEqual(
    JSON.parse(
      await readFile("test/fixtures/snippets-windows-catalog.json", "utf8"),
    ),
  );
});

it("waits for Settings navigation built after the outer page becomes visible", async () => {
  const { result } = await exercise("late-settings-tab");
  expect(result.checks).toHaveLength(5);
  expect(result.approvals).toBe(2);
});

it("waits for a temporarily disabled Browse control before activation", async () => {
  const { result } = await exercise("late-browse-button");
  expect(result.checks).toHaveLength(5);
  expect(result.approvals).toBe(2);
});

it.each([
  ["extra-byte", "exact public interaction bytes"],
  ["duplicate-receipt", "duplicate Run child receipt"],
  ["local-activation", "install remains dormant"],
  ["changed-yaml", "Expected values to be strictly equal"],
  ["replaced-pty", "pty2"],
  ["backend-failure", "1 !== 0"],
] as const)(
  "refuses %s on the public scenario caller",
  async (fault, message) => {
    await expect(exercise(fault)).rejects.toThrow(message);
  },
);
