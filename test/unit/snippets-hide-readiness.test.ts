// @vitest-environment jsdom
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { deferred, fixture, settle } from "../fixtures/companion-content";
import { cleanupSnippetsWindows } from "../fixtures/snippets-window";

const source = await readFile("test/fixtures/snippets-scenario.cjs", "utf8");
const labels = [
  "Hide retains native Snippets",
  "independent panel hide",
  "Hide acknowledged before reveal",
];
// Evaluate the actual shared readiness predicate against the actual renderer
// owners. Only Electron's native side effects and delayed IPC ACK are modeled.
function scenarioCheck(
  label: string,
  native: { getVisible(): boolean },
  core: { isFocused(): boolean },
) {
  const labelAt = source.indexOf(JSON.stringify(label));
  const marker = "await until(";
  const start = source.lastIndexOf(marker, labelAt);
  assert.ok(labelAt > start && start >= 0, "shared Hide wait exists");
  const predicate = source
    .slice(start + marker.length, labelAt)
    .trim()
    .replace(/,$/u, "");
  const helperStart = source.indexOf("    const panelHidden = async () =>");
  const helperEnd = source.indexOf("    await until(", helperStart);
  const helper = helperStart < 0 ? "" : source.slice(helperStart, helperEnd);
  const js = async (script: string) => {
    const evaluate = new Function("document", `return (${script});`) as (
      doc: Document,
    ) => boolean;
    return evaluate(document);
  };
  const createCheck = new Function(
    "native",
    "core",
    "js",
    `${helper}\nreturn (${predicate});`,
  ) as (
    child: typeof native,
    contents: typeof core,
    evaluate: typeof js,
  ) => () => boolean | Promise<boolean>;
  return createCheck(native, core, js);
}

afterEach(() => {
  cleanupSnippetsWindows();
  vi.unstubAllGlobals();
});
async function harness() {
  const f = await fixture();
  let visible = false;
  let coreFocused = true;
  const present = vi.mocked(f.bridge.present).getMockImplementation()!;
  vi.mocked(f.bridge.present).mockImplementation((request) => {
    visible = request.id !== null;
    coreFocused = request.id === null;
    return present(request);
  });
  f.open("optional-snippets");
  await settle();
  expect(f.root.hidden).toBe(false);
  const ack = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce((request) => {
    expect(request.id).toBeNull();
    // Main's present(null) hides/focuses core before IPC resolves. Renderer
    // selection, panel visibility and terminal DOM focus still await that ACK.
    visible = false;
    coreFocused = true;
    return ack.promise;
  });
  const native = { getVisible: () => visible };
  const core = { isFocused: () => coreFocused };
  const hide = f.root.querySelector<HTMLButtonElement>(".auxiliary-hide")!;
  hide.focus();
  hide.click();
  return {
    ...f,
    ack,
    native,
    core,
    legacyReady: () => !native.getVisible() && core.isFocused(),
    check: (label = labels[0]!) => scenarioCheck(label, native, core),
    setNative: (shown: boolean, focused: boolean) => {
      visible = shown;
      coreFocused = focused;
    },
  };
}

it("reproduces an early independent toggle choosing Hide again before renderer commit", async () => {
  const h = await harness();
  expect(h.legacyReady()).toBe(true);
  expect(h.root.hidden).toBe(false);
  const calls = vi.mocked(h.bridge.present).mock.calls.length;
  h.panelToggle(); // Real window toggle subscription and Auxiliary Panel owner.
  await settle();
  expect(h.bridge.present).toHaveBeenCalledTimes(calls + 1);
  expect(vi.mocked(h.bridge.present).mock.lastCall?.[0].id).toBeNull();
  expect(h.root.hidden).toBe(true); // The requested reveal did not reveal.
  h.ack.resolve(true);
  await settle();
  expect(h.root.hidden).toBe(true);
});

it.each(labels)(
  "%s refuses native-only readiness until Hide ACK and commit",
  async (label) => {
    const h = await harness();
    const check = h.check(label);
    expect(h.legacyReady()).toBe(true);
    expect(await check()).toBe(false);
    h.ack.resolve(true);
    // Resolving the native promise is not itself the renderer continuation.
    const beforeCommit = check();
    expect(await beforeCommit).toBe(false);
    await settle();
    expect(h.root.hidden).toBe(true);
    expect(document.activeElement?.closest(".terminal-surface")).not.toBeNull();
    expect(await check()).toBe(true);
    h.panelToggle();
    await settle();
    expect(h.root.hidden).toBe(false);
    expect(vi.mocked(h.bridge.present).mock.lastCall?.[0].id).toBe(
      "optional-snippets",
    );
  },
);

it("does not call a refused Hide ACK completed just because native effects happened", async () => {
  const h = await harness();
  h.ack.resolve(false);
  await settle();
  expect(h.legacyReady()).toBe(true);
  expect(h.root.hidden).toBe(false);
  expect(await h.check()()).toBe(false);
});

it("also requires terminal DOM focus and both native hide/focus conditions", async () => {
  const h = await harness();
  h.ack.resolve(true);
  await settle();
  const check = h.check();
  expect(await check()).toBe(true);
  const other = document.createElement("input");
  document.body.append(other);
  other.focus();
  expect(await check()).toBe(false);
  h.surfaces[0]!.focus();
  h.setNative(true, true);
  expect(await check()).toBe(false);
  h.setNative(false, false);
  expect(await check()).toBe(false);
  h.setNative(false, true);
  expect(await check()).toBe(true);
});
