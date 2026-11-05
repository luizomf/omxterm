// @vitest-environment jsdom
/* eslint-disable max-lines -- One caller harness shares lifecycle and fault controls. */
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import {
  controlledDelivery,
  controlledFinalBarrier,
  controlledProbe,
  controlledReadiness,
} from "../fixtures/snippets-windows-controlled-probe";
import {
  catalogTestClock,
  deferredSettingsRenderer,
  freshPublicCatalog,
} from "../fixtures/snippets-windows-public-catalog-model";

const require = createRequire(import.meta.url);
const digest =
  "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7";

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
    output: "",
    outputTruncated: false,
    outputLimitCodeUnits: 65536,
    writes: [] as string[],
    cprTrace: trace,
  };
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

function loadPublicScenario(electron: object, simulatedNow?: () => number) {
  let sharedModule: { exports: object } | undefined;
  const loadSharedScenario = () => {
    if (sharedModule) return sharedModule.exports;
    const sharedPath = path.resolve("test/fixtures/snippets-scenario.cjs");
    const sharedRequire = createRequire(sharedPath);
    const loaded = { exports: {} };
    // Evaluate the real shared fixture without letting its Electron import load
    // the package (whose loader can synchronously start the installer).
    runInNewContext(readFileSync(sharedPath, "utf8"), {
      module: loaded,
      process,
      Buffer,
      setTimeout,
      clearTimeout,
      require: (name: string) =>
        name === "electron" ? electron : (sharedRequire(name) as unknown),
    });
    sharedModule = loaded;
    return sharedModule.exports;
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
      Date: simulatedNow ? { now: simulatedNow } : Date,
      JSON,
      require(name: string) {
        if (name === "electron") return electron;
        if (name === "./snippets-scenario.cjs") return loadSharedScenario();
        if (name.startsWith("./"))
          return require(`../fixtures/${name.slice(2)}`) as unknown;
        return require(name) as unknown;
      },
    },
  );
  return module.exports;
}

// Exercise the real scenario caller against controlled WebContents/process edges.
// eslint-disable-next-line max-lines-per-function -- Keep scenario lifecycle and fault boundaries in one caller.
async function exercise(
  fault?:
    | "extra-byte"
    | "duplicate-receipt"
    | "local-activation"
    | "changed-yaml"
    | "replaced-pty"
    | "backend-failure"
    | "late-settings-tab"
    | "late-browse-button"
    | "catalog-not-ready"
    | "wrong-reinstall-title"
    | "missing-reinstall-card"
    | "wrong-reinstall-generation"
    | "wrong-archive"
    | "snapshot-before-action"
    | "snapshot-between-check-and-click"
    | "ambiguous-acquisition"
    | "final-ack-delayed"
    | "final-ack-missing"
    | "final-frame-ack"
    | "final-invalid-ack",
  recordedActions?: string[],
  recordedFinalEvents?: string[],
  recordedWrites?: string[],
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "public-snippets-"));
  await mkdir(path.join(root, "config/omxterm"), { recursive: true });
  const yaml = await readFile(
    "test/fixtures/snippets-windows-catalog.json",
    "utf8",
  );
  await writeFile(path.join(root, "config/omxterm/snippets.yaml"), yaml);
  const { session, recordWrite, output } = controlledSession();
  const { probe, write, attach } = controlledDelivery((text) => {
    recordWrite(text);
    recordedWrites?.push(text);
  });
  const children: Array<{
    pid: number;
    closed: boolean;
    exit: { code: number; signal: null } | null;
  }> = [];
  let generation = 0;
  let status = "uninstalled";
  let local = "dormant";
  let approvals = 0;
  let coreFocus = true;
  const finalEvents: string[] = recordedFinalEvents ?? [];
  let view: typeof childView | undefined;
  const actions: string[] = recordedActions ?? [];
  const catalog = freshPublicCatalog({
    failLoad: fault === "catalog-not-ready",
    wrongTitle: fault === "wrong-reinstall-title",
    missingCard: fault === "missing-reinstall-card",
    ambiguous: fault === "ambiguous-acquisition",
    snapshot:
      fault === "snapshot-before-action"
        ? "before-action"
        : fault === "snapshot-between-check-and-click"
          ? "between-ready-and-click"
          : undefined,
    browse(_openCount, label) {
      actions.push(label === "Refresh catalog" ? "Refresh" : "Browse");
      if (fault === "wrong-reinstall-generation" && catalog.opens === 2)
        generation = 2;
    },
    action(action) {
      actions.push(action);
      if (
        (action === "Install" && generation !== 0) ||
        (action === "Reinstall" && generation !== 1)
      ) {
        status = "generation-conflict";
        return;
      }
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
    },
  });
  const deferred =
    fault === "late-settings-tab" || fault === "late-browse-button"
      ? deferredSettingsRenderer(
          fault === "late-settings-tab" ? "navigation" : "browse",
          () => {
            catalog.browse();
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
        write("SNIPPETS_RUN\r");
        if (fault === "extra-byte") write("x");
        // Simulated duplicate delivery after the observer boundary, not a
        // fabricated receipt or a claim about native ConPTY behavior.
        if (fault === "duplicate-receipt")
          probe.feed(Buffer.from("SNIPPETS_RUN\r"));
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
      finalBarrier.ping();
      actions.push("ping");
      write(text);
    },
    sendInputEvent(event: { type: string }) {
      if (event.type === "keyDown") write("\r");
    },
    // eslint-disable-next-line complexity -- Controlled WebContents boundary covers the scenario's fixed expressions.
    async executeJavaScript(code: string) {
      if (code.includes("selectPublicCatalogAction"))
        return catalog.evaluate(code);
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
        return catalog.evaluate(code);
      }
      if (code.includes("Catalog loaded.")) return catalog.evaluate(code);
      if (code.includes(".settings-close")) {
        coreFocus = true;
        if (actions.includes("Uninstall")) finalBarrier.close();
        return;
      }
      if (code.includes("requestAnimationFrame")) {
        finalBarrier.frame();
        return;
      }
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
  const readiness = controlledReadiness(core, session, output);
  const finalBarrier = controlledFinalBarrier(
    fault,
    readiness,
    core,
    session,
    finalEvents,
  );
  attach(readiness.deliver);
  const readinessBeforeAck = readiness.beforeAck;
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
        catalog.open();
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
  const scenario = loadPublicScenario(
    electron,
    finalBarrier.clock ?? catalogTestClock(fault, catalog),
  );
  try {
    const result = await scenario.runPublicScenario({
      window,
      fixture: {
        root,
        evidence: root,
        publicCatalog: true,
        archiveSha256: fault === "wrong-archive" ? "wrong" : digest,
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
      windowsProbeReady: finalBarrier.ready,
    });
    return {
      result,
      actions,
      session,
      readinessBeforeAck,
      finalEvents,
      childInput: Buffer.concat(probe.chunks),
      probeExit: probe.exited,
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
    readiness.dispose();
    deferred?.dispose();
    await rm(root, { recursive: true, force: true });
  }
}

it("loads the shared scenario with the controlled Electron boundary", () => {
  const accessed: string[] = [];
  loadPublicScenario({
    get Menu() {
      accessed.push("Menu");
      return {};
    },
    get webContents() {
      accessed.push("webContents");
      return {};
    },
  });
  expect(accessed).toEqual(["Menu", "webContents"]);
});

it("accepts public Run then Ping without Insert and the ordinary full byte sequence", () => {
  for (const [input, expected] of [
    [
      "SNIPPETS_RUN\rSNIPPETS_PING\r",
      "SNIPPETS_RUN_RECEIPT\nSNIPPETS_AFTER_RETIREMENT\n",
    ],
    [
      "  SNIPPETS_INSERT  \rSNIPPETS_RUN\r\rSNIPPETS_RUN\u0003  SNIPPETS_INSERT  \rSNIPPETS_PING\r",
      "SNIPPETS_INSERT_RECEIPT\nSNIPPETS_RUN_RECEIPT\nSNIPPETS_DRAFT_CLEARED\nSNIPPETS_INSERT_RECEIPT\nSNIPPETS_AFTER_RETIREMENT\n",
    ],
  ] as const) {
    let output = "";
    const probe = controlledProbe((chunk) => (output += chunk));
    const bytes = Buffer.from(input);
    for (let i = 0; i < bytes.length; i += 3)
      probe.feed(bytes.subarray(i, i + 3));
    expect(Buffer.concat(probe.chunks)).toEqual(bytes);
    expect(probe.exited).toBeUndefined();
    expect(probe.error).toBe("");
    expect(output).toBe(
      "\u001b[?1004l\u001b[?2004lSNIPPETS_SHELL_READY\n" + expected,
    );
  }
});

it.each([
  [
    "unknown terminated line",
    Buffer.from("unknown\r"),
    "Unexpected controlled probe input",
  ],
  [
    "overflow",
    Buffer.alloc(4097, 0x78),
    "Controlled probe input exceeded bound",
  ],
])("rejects %s at the actual child stdin", (_name, input, error) => {
  let output = "";
  const probe = controlledProbe((chunk) => (output += chunk));
  probe.feed(input);
  expect(probe.exited).toBe(1);
  expect(probe.error).toContain(error);
  expect(output).not.toContain("SNIPPETS_RUN_RECEIPT");
});

it("distinguishes an observed focus write from hypothetical child stdin delivery", () => {
  const { session, recordWrite, output } = controlledSession();
  let childOutput = "";
  const probe = controlledProbe((chunk) => (childOutput += chunk));
  output("\u001b[?2004lSNIPPETS_SHELL_READY\r\n");
  recordWrite("\u001b[I");
  recordWrite("SNIPPETS_RUN\r");
  // This is one hypothetical identity transformation, not a native capture.
  probe.feed(Buffer.from(session.writes.join("")));
  expect(session.writes).toEqual(["\u001b[I", "SNIPPETS_RUN\r"]);
  expect(Buffer.concat(probe.chunks)).toEqual(
    Buffer.from("\u001b[ISNIPPETS_RUN\r"),
  );
  expect(probe.exited).toBe(1);
  expect(probe.error).toContain("Unexpected controlled probe input");
  expect(childOutput).not.toContain("SNIPPETS_RUN_RECEIPT");
});

it("drives public acquisition, two dormant epochs, retirement and same-session Ping before Quit", async () => {
  const {
    result,
    actions,
    session,
    readinessBeforeAck,
    childInput,
    probeExit,
    yaml,
    evidence,
    capturedCatalog,
  } = await exercise();
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
    "Browse",
    "Reinstall",
    "Toggle",
    "Settings",
    "Disable",
    "Enable",
    "Uninstall",
    "ping",
  ]);
  expect(session.writes.join("")).toBe("SNIPPETS_RUN\rSNIPPETS_PING\r");
  expect(readinessBeforeAck.length).toBeGreaterThan(1);
  expect(readinessBeforeAck.every((ready) => !ready)).toBe(true);
  expect(childInput).toEqual(Buffer.from("SNIPPETS_RUN\rSNIPPETS_PING\r"));
  expect(probeExit).toBeUndefined();
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

it.each([
  "snapshot-before-action",
  "snapshot-between-check-and-click",
] as const)(
  "accepts the reopened cached catalog snapshot %s with one explicit refresh",
  async (fault) => {
    const { result, actions, childInput } = await exercise(fault);
    expect(result.checks).toHaveLength(5);
    expect(result.approvals).toBe(2);
    expect(actions).toEqual([
      "Settings",
      "Browse",
      "Install",
      "Toggle",
      "run",
      "Settings",
      "Refresh",
      "Reinstall",
      "Toggle",
      "Settings",
      "Disable",
      "Enable",
      "Uninstall",
      "ping",
    ]);
    expect(childInput).toEqual(Buffer.from("SNIPPETS_RUN\rSNIPPETS_PING\r"));
  },
);

it("refuses ambiguous catalog acquisition controls without clicking either", async () => {
  const actions: string[] = [];
  await expect(exercise("ambiguous-acquisition", actions)).rejects.toThrow(
    "Timed out: catalog acquisition control ready",
  );
  expect(actions).toEqual([
    "Settings",
    "Browse",
    "Install",
    "Toggle",
    "run",
    "Settings",
  ]);
});

it("waits for the final output ACK and frame recheck before Ping", async () => {
  const { result, finalEvents, childInput } =
    await exercise("final-ack-delayed");
  expect(finalEvents).toEqual([
    "output-ready:false",
    "poll:false",
    "ack",
    "poll:true",
    "frames",
    "poll:true",
    "ping-ready:true",
  ]);
  expect(result.checks).toHaveLength(5);
  expect(childInput).toEqual(Buffer.from("SNIPPETS_RUN\rSNIPPETS_PING\r"));
});

it("rechecks ACK progress when new output arrives during the frame opportunity", async () => {
  const { finalEvents, childInput, result } = await exercise("final-frame-ack");
  expect(finalEvents).toEqual([
    "output-ready:false",
    "poll:false",
    "ack",
    "poll:true",
    "frames",
    "frame-output-ready:false",
    "poll:false",
    "ack",
    "poll:true",
    "ping-ready:true",
  ]);
  expect(result.checks).toHaveLength(5);
  expect(childInput).toEqual(Buffer.from("SNIPPETS_RUN\rSNIPPETS_PING\r"));
});

it("does not release the barrier for foreign or beyond-sent ACKs", async () => {
  const { finalEvents, childInput } = await exercise("final-invalid-ack");
  expect(finalEvents).toEqual([
    "output-ready:false",
    "poll:false",
    "invalid-ack-ready:false",
    "ack",
    "poll:true",
    "frames",
    "poll:true",
    "ping-ready:true",
  ]);
  expect(childInput).toEqual(Buffer.from("SNIPPETS_RUN\rSNIPPETS_PING\r"));
});

it("does not attempt final Ping or Enter when the output ACK never arrives", async () => {
  const actions: string[] = [];
  const events: string[] = [];
  const writes: string[] = [];
  await expect(
    exercise("final-ack-missing", actions, events, writes),
  ).rejects.toThrow("Timed out: controlled probe ACK and modes");
  expect(events).toEqual(["output-ready:false", "poll:false"]);
  expect(actions).not.toContain("ping");
  expect(writes).toEqual(["SNIPPETS_RUN\r"]);
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

it("refuses an unbound archive identity before browsing", async () => {
  const actions: string[] = [];
  await expect(exercise("wrong-archive", actions)).rejects.toThrow();
  expect(actions).toEqual([]);
});

it.each([
  ["catalog-not-ready", "Timed out: public catalog loaded", false],
  ["wrong-reinstall-title", "exact Snippets catalog card unavailable", false],
  ["missing-reinstall-card", "exact Snippets catalog card unavailable", false],
  ["wrong-reinstall-generation", "unexpected management ordering", true],
] as const)(
  "refuses %s after reopening Settings",
  async (fault, message, clicked) => {
    const actions: string[] = [];
    await expect(exercise(fault, actions)).rejects.toThrow(message);
    expect(actions).toEqual([
      "Settings",
      "Browse",
      "Install",
      "Toggle",
      "run",
      "Settings",
      "Browse",
      ...(clicked ? ["Reinstall"] : []),
    ]);
  },
);

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
