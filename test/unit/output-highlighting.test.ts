import { describe, expect, it } from "vitest";
import {
  BUILTIN_HIGHLIGHT_CONTEXTS,
  DEFAULT_HIGHLIGHT_SETTINGS,
  validateHighlightSettings,
  type HighlightSettings,
} from "../../src/shared/highlight-settings";
import {
  checkPattern,
  commandName,
  compileRuleSet,
} from "../../src/renderer/highlighting/highlight-rules";
import {
  createOutputHighlighter,
  matchSpans,
} from "../../src/renderer/highlighting/output-highlighter";
import { colorSpecSgr } from "../../src/renderer/highlighting/highlight-colors";
import { createVtTokenizer } from "../../src/renderer/highlighting/vt-tokenizer";

const ESC = "\u001b";
const enabled: HighlightSettings = {
  ...DEFAULT_HIGHLIGHT_SETTINGS,
  enabled: true,
};
const ruleSet = compileRuleSet(BUILTIN_HIGHLIGHT_CONTEXTS, enabled);
const highlighter = (rules = ruleSet) =>
  createOutputHighlighter({ rules: () => rules, now: () => 0 });
const stripSgr = (text: string) => text.replace(/\u001b\[[0-9;]*m/gu, "");

// A stream mixing every construct the transform must leave intact.
const KITTY_IMAGE = `${ESC}_Gf=100,a=T;iVBORw0KGgo=error=ok+fail${ESC}\\`;
const MIXED_STREAM = [
  "error: build failed\r\n",
  `${ESC}]8;;https://example.com${ESC}\\link error${ESC}]8;;${ESC}\\\r\n`,
  `${ESC}[31mred error${ESC}[0m\r\n`,
  KITTY_IMAGE,
  "\r\n",
  `${ESC}[?1049h${ESC}[2Jvim error screen\r\nfailed${ESC}[?1049l`,
  "ok 日本語 emoji 👩🏽‍💻 error\r\n",
  `${ESC}[200~pasted error${ESC}[201~\n`,
  "progress 50%\rprogress 100% done\r\n",
  "10.0.0.1 is up\n",
].join("");

describe("output highlighting safety", () => {
  it("never removes, adds or reorders anything but SGR, at any chunk split", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const transform = highlighter();
      let random = seed;
      const next = () => {
        random = (random * 1103515245 + 12345) % 2 ** 31;
        return random;
      };
      let output = "";
      for (let index = 0; index < MIXED_STREAM.length;) {
        const size = 1 + (next() % 23);
        output += transform.transform(MIXED_STREAM.slice(index, index + size));
        index += size;
      }
      expect(stripSgr(output)).toBe(stripSgr(MIXED_STREAM));
    }
  });

  it("keeps every original escape sequence, in order, at any chunk split", () => {
    const sequences = (text: string) =>
      text.match(
        /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|_[^\u001b]*\u001b\\)/gu,
      ) ?? [];
    const expected = sequences(MIXED_STREAM);
    for (const size of [1, 2, 3, 5, 7, 11, 64, MIXED_STREAM.length]) {
      const transform = highlighter();
      let output = "";
      for (let index = 0; index < MIXED_STREAM.length; index += size)
        output += transform.transform(MIXED_STREAM.slice(index, index + size));
      const actual = sequences(output);
      let cursor = 0;
      for (const sequence of actual)
        if (sequence === expected[cursor]) cursor += 1;
      expect(cursor, `chunk size ${size}`).toBe(expected.length);
    }
  });

  it("colors the first output line after bash's bracketed-paste switch", () => {
    const transform = highlighter();
    transform.transform("$ printf x");
    expect(transform.transform(`\r\n${ESC}[?2004l\r`)).toBe(
      `\r\n${ESC}[?2004l\r`,
    );
    expect(transform.transform("build failed\r\n")).toBe(
      `${ESC}[1;31mfailed${ESC}[0m\r\n`.replace(/^/u, "build "),
    );
    // systemd's OSC 3008 context marker precedes command output.
    const systemd = highlighter();
    const marker = `${ESC}]3008;start=1;type=command${ESC}\\`;
    expect(systemd.transform(`${marker}build failed\r\n`)).toBe(
      `${marker}build ${ESC}[1;31mfailed${ESC}[0m\r\n`,
    );
    const sameChunk = highlighter();
    expect(sameChunk.transform(`\n${ESC}[?2004l\rerror\n`)).toBe(
      `\n${ESC}[?2004l\r${ESC}[1;31merror${ESC}[0m\n`,
    );
    expect(sameChunk.transform(`${ESC}[0mok\n`)).toBe(
      `${ESC}[0m${ESC}[1;32mok${ESC}[0m\n`,
    );
  });

  it("is byte-identical when off, for ignored commands and on bursts", () => {
    const off = createOutputHighlighter({
      rules: () => undefined,
      now: () => 0,
    });
    expect(off.transform(MIXED_STREAM)).toBe(MIXED_STREAM);
    const vim = highlighter();
    vim.transform("$ ");
    vim.userInput("v");
    vim.transform("vim notes.txt");
    vim.userInput("\r");
    expect(vim.transform("\r\nerror failed\r\n")).toBe("\r\nerror failed\r\n");
    const burst = highlighter();
    const large = "error\n".repeat(1_000);
    for (let index = 0; index < 8; index += 1) burst.transform(large);
    expect(burst.transform(large)).toBe(large);
    expect(burst.transform("error\n")).not.toBe("error\n");
  });

  it("leaves the alternate screen, Kitty images, links and colored lines untouched", () => {
    const transform = highlighter();
    for (const chunk of [
      `${ESC}[?1049herror failed\r\n`,
      `still error\r\n${ESC}[?1049l`,
      `${KITTY_IMAGE}\r\n`,
      `${ESC}]8;;https://x${ESC}\\error${ESC}]8;;${ESC}\\\r\n`,
      `${ESC}[1;32mok error\r\n`,
      `error while colored\r\n${ESC}[0m`,
    ])
      expect(transform.transform(chunk)).toBe(chunk);
    expect(transform.transform("error after reset\r\n")).toContain(
      `${ESC}[1;31m`,
    );
  });

  it("colors only complete lines and never a line continued from an earlier chunk", () => {
    const transform = highlighter();
    expect(transform.transform("build fail")).toBe("build fail");
    expect(transform.transform("ed\nerror\n")).toBe(
      `ed\n${ESC}[1;31merror${ESC}[0m\n`,
    );
    expect(transform.transform("prompt error $ ")).toBe("prompt error $ ");
  });

  it("keeps CRLF endings, wide characters and emoji while coloring", () => {
    const transform = highlighter();
    expect(transform.transform("日本 error 👩🏽‍💻 ok\r\n")).toBe(
      `日本 ${ESC}[1;31merror${ESC}[0m 👩🏽‍💻 ${ESC}[1;32mok${ESC}[0m\r\n`,
    );
    expect(transform.transform("50%\r100% done\r\n")).toBe(
      "50%\r100% done\r\n",
    );
  });
});

describe("rule semantics", () => {
  it("compiles every built-in AshyTerm rule", () => {
    expect(BUILTIN_HIGHLIGHT_CONTEXTS).toHaveLength(51);
    const total = BUILTIN_HIGHLIGHT_CONTEXTS.reduce(
      (sum, context) => sum + context.rules.length,
      0,
    );
    expect(total).toBe(486);
    for (const context of BUILTIN_HIGHLIGHT_CONTEXTS)
      for (const rule of context.rules) {
        expect(() => new RegExp(rule.pattern, "gid"), rule.name).not.toThrow();
        for (const color of rule.colors)
          if (color !== null) expect(colorSpecSgr(color), color).toBeDefined();
      }
  });

  it("maps AshyTerm color specifications to palette SGR", () => {
    expect(colorSpecSgr("bold red")).toBe("1;31");
    expect(colorSpecSgr("bright_green")).toBe("92");
    expect(colorSpecSgr("bold white on_red")).toBe("1;37;41");
    expect(colorSpecSgr("underline cyan")).toBe("4;36");
    expect(colorSpecSgr("purple")).toBeUndefined();
  });

  it("colors groups, repeats the last color and lets earlier longer spans win", () => {
    const rules = [
      {
        name: "pair",
        expression: /(\w+)=(\w+)/dgi,
        colors: ["33", undefined],
        stop: false,
      },
      { name: "word", expression: /value/dgi, colors: ["31"], stop: false },
    ];
    expect(matchSpans("key=value other", rules)).toEqual([
      { start: 0, end: 3, sgr: "33" },
      { start: 4, end: 9, sgr: "31" },
    ]);
  });

  it("selects rules for a command OMXTerm types and resumes after readline's paste mark", () => {
    const transform = highlighter();
    transform.transform(`${ESC}[?2004h$ `);
    transform.injected("ping -c 1 10.0.0.1", true);
    // bash 5.2 as captured: the pasted command in reverse video, ended by
    // ESC[27m rather than a full reset.
    transform.transform(
      `${ESC}[7mping -c 1 10.0.0.1${ESC}[27m\r${ESC}[C${ESC}[Cping -c 1 10.0.0.1\r\n${ESC}[?2004l\r`,
    );
    const line = transform.transform(
      "64 bytes from 10.0.0.1: icmp_seq=1 ttl=64 time=0.05 ms\r\n",
    );
    expect(line).toContain(`icmp_seq=${ESC}[33m1${ESC}[0m`);
    // Typing after an inserted (not submitted) command keeps its start.
    const inserted = highlighter();
    inserted.transform("$ ");
    inserted.injected("ping example.com", false);
    inserted.transform("ping example.com");
    inserted.userInput(" ");
    inserted.transform(" ");
    inserted.userInput("\r");
    inserted.transform("\r\n");
    expect(
      inserted.transform("64 bytes from h: icmp_seq=2 ttl=1 time=1.1 ms\r\n"),
    ).toContain(`icmp_seq=${ESC}[33m2${ESC}[0m`);
  });

  it("keeps reading commands after very long lines", () => {
    const transform = highlighter();
    for (let index = 0; index < 5; index += 1)
      transform.transform("y".repeat(4_000));
    transform.transform("\r\n$ ");
    for (const key of "ping h") transform.userInput(key);
    transform.transform("ping h");
    transform.userInput("\r");
    transform.transform("\r\n");
    expect(
      transform.transform("64 bytes from h: icmp_seq=3 ttl=1 time=1.1 ms\r\n"),
    ).toContain(`icmp_seq=${ESC}[33m3${ESC}[0m`);
  });

  it("tracks each SGR attribute so only a line in default attributes is colored", () => {
    const partial = highlighter();
    partial.transform(`${ESC}[1;7mbold${ESC}[27m\r\n`);
    expect(partial.transform("error\r\n")).toBe("error\r\n");
    partial.transform(`${ESC}[22m`);
    expect(partial.transform("\r\nerror\r\n")).toContain(`${ESC}[1;31merror`);
    const extended = highlighter();
    extended.transform(`${ESC}[38;2;1;2;3m${ESC}[22;27m\r\n`);
    expect(extended.transform("error\r\n")).toBe("error\r\n");
    extended.transform(`${ESC}[39m\r\n`);
    expect(extended.transform("error\r\n")).toContain(`${ESC}[1;31merror`);
  });

  it("selects command rules on Enter and returns to global rules for unknown commands", () => {
    const transform = highlighter();
    transform.transform("user@host:~$ ");
    for (const key of "ping example.com") transform.userInput(key);
    transform.transform("ping example.com");
    transform.userInput("\r");
    transform.transform("\r\n");
    const line = transform.transform(
      "64 bytes from 93.184.216.34: icmp_seq=1 ttl=56 time=11.2 ms\r\n",
    );
    expect(stripSgr(line)).toBe(
      "64 bytes from 93.184.216.34: icmp_seq=1 ttl=56 time=11.2 ms\r\n",
    );
    expect(line).not.toBe(stripSgr(line));
  });

  it("extracts commands like AshyTerm, past prefixes, assignments and pipes", () => {
    expect(commandName("user@host:~$ sudo -E LANG=C systemctl status x")).toBe(
      "systemctl",
    );
    expect(commandName("❯ cat log | /usr/bin/grep error")).toBe("grep");
    expect(commandName("$ docker --help")).toBe("help");
    expect(commandName("% man ls")).toBe("help");
    expect(commandName("no prompt here")).toBeUndefined();
    expect(commandName("kubectl get pods", true)).toBe("kubectl");
  });

  it("rejects user patterns that are invalid or risk catastrophic backtracking", () => {
    expect(checkPattern("\\berror\\b")).toBe("valid");
    expect(checkPattern("(")).toBe("invalid");
    expect(checkPattern("(a+)+$")).toBe("unsafe");
    expect(checkPattern("")).toBe("invalid");
  });

  it("honors disabled contexts, disabled rules, ignored commands and custom rules", () => {
    const custom = compileRuleSet(BUILTIN_HIGHLIGHT_CONTEXTS, {
      ...enabled,
      disabledRules: ["global/Critical/Error"],
      disabledContexts: ["ping"],
      ignoredCommands: ["make"],
      customRules: [{ name: "ticket", pattern: "JIRA-\\d+", colors: ["cyan"] }],
    });
    expect(custom.global.map((rule) => rule.name)).not.toContain(
      "Critical/Error",
    );
    expect(custom.global.map((rule) => rule.name)).toContain("ticket");
    expect(custom.rulesFor("ping")).toBe(custom.global);
    expect(custom.rulesFor("make")).toBeUndefined();
    const plain = compileRuleSet(BUILTIN_HIGHLIGHT_CONTEXTS, {
      ...enabled,
      contextAware: false,
    });
    expect(plain.rulesFor("ping")).toBe(plain.global);
  });

  it("validates persisted settings strictly", () => {
    expect(validateHighlightSettings({})).toEqual({
      ...DEFAULT_HIGHLIGHT_SETTINGS,
      ignoredCommands: [...DEFAULT_HIGHLIGHT_SETTINGS.ignoredCommands],
    });
    expect(() => validateHighlightSettings({ enabled: "yes" })).toThrow();
    expect(() => validateHighlightSettings({ extra: true })).toThrow(
      /unknown/u,
    );
    expect(() =>
      validateHighlightSettings({
        customRules: [{ name: "x", pattern: "(", colors: ["red"] }],
      }),
    ).toThrow(/regular expression/u);
  });
});

describe("VT tokenizer", () => {
  it("keeps sequences split across chunks as control, never as text", () => {
    const tokenizer = createVtTokenizer();
    const parts = [`a${ESC}`, "[3", "1mb", `${ESC}_Gpay`, `load${ESC}`, "\\c"];
    const tokens = parts.flatMap((part) => tokenizer.tokenize(part));
    expect(
      tokens
        .filter((token) => token.kind === "text")
        .map((token) => token.text),
    ).toEqual(["a", "b", "c"]);
    const csi = tokens.flatMap((token) =>
      token.kind === "control" && token.csi ? [token.csi] : [],
    );
    expect(csi).toEqual([{ prefix: "", parameters: "31", final: "m" }]);
  });
});
