// omxterm-ctl: a small, dependency-free client for OMXTerm's local agent API
// (ADR 0052, docs/dev/agent-api.md). OMXTerm's own runtime runs it in Node
// mode through the launcher that $OMXTERM_CTL names.
import { AGENT_GRANT_ITEM, MAX_AGENT_REQUEST_BYTES } from "../shared/agent-api";
import { CtlError, EXIT } from "./client";
import { execute, parse, textFromStdin } from "./commands";
import { serveMcp } from "./mcp";
import guide from "./SKILL.md";

const usage = `Usage: omxterm-ctl <command> [options]

Drive a Terminal Window the user allowed (Window > ${AGENT_GRANT_ITEM}).
Inside an OMXTerm pane, run it as "$OMXTERM_CTL"; no options are needed.

Commands:
  status                       Say whether this window allows agents.
  guide                        Print the agent guide (a SKILL.md).
  mcp                          Serve these commands as MCP tools on stdio.
  grants                       List the windows of this profile that do.
  list                         List the window's tabs and panes.
  send <pane> [--text TEXT] [--keys KEY,...] [--enter]
              [--wait [--idle MS] [--match TEXT] [--timeout MS]]
                               Type into a pane. Keys: Enter, Tab, Escape,
                               Backspace, Space, Ctrl+A ... Ctrl+Z. With
                               --wait (or --match), then wait as below,
                               counting from before the typing. TEXT -
                               reads the text from stdin, as UTF-8, without
                               one final line break. A text with a line
                               break is one paste where the program takes
                               pastes; Enter runs it.
  press <pane> KEY...          Press keys in a pane, encoded for its modes as
                               the user's own keys: Up, Down, Left, Right,
                               Home, End, PageUp, PageDown, Insert, Delete,
                               F1 ... F12, Enter, Tab, Escape, Backspace,
                               Space, with any of Ctrl+, Alt+ and Shift+
                               (Ctrl+Shift+Up). A shortcut of the window
                               (Cmd+T) runs on that pane instead, on its
                               own, and prints the action and pane.
  keys                         List the window's shortcuts that press runs,
                               as the user set them (chord, action), with
                               refused or not-yet marked. Look here, don't guess.
  read <pane> [--lines N]      Print the last N lines (default 200).
  read <pane> --screen         Print exactly the screen's rows, one line each,
                               wherever the user scrolled.
  wait <pane> [--after OFFSET] [--idle MS] [--match TEXT] [--timeout MS]
                               Wait until the pane goes quiet, TEXT (literal,
                               not a pattern) shows up on its screen past
                               OFFSET, or its program ends. Prints idle,
                               match, exited or timeout. With --match alone,
                               quiet doesn't count. --match - reads TEXT from
                               stdin, like send --text -.

Options:
  --window ID      The granted window, when there is more than one.
  --profile DIR    OMXTerm's profile directory, for a non-default profile.
  --json           Print the raw result.

Exit status: 0 done, 1 API error, 2 usage, 3 no grant, 124 wait timeout.
`;

// Bounded: more than a request carries is a mistake, not text to send.
async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_AGENT_REQUEST_BYTES)
      throw new CtlError(EXIT.usage, "The text on stdin is too long.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function print(text: string) {
  process.stdout.write(text.endsWith("\n") || text === "" ? text : `${text}\n`);
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parse(argv);
  if (options.help || !options.command) {
    process.stdout.write(usage);
    return options.help ? EXIT.ok : EXIT.usage;
  }
  if (options.command === "guide") {
    process.stdout.write(guide);
    return EXIT.ok;
  }
  if (options.command === "mcp") {
    await serveMcp(options);
    return EXIT.ok;
  }
  await textFromStdin(options, readStdin);
  const outcome = await execute(options);
  print(outcome.output);
  return outcome.code;
}

const argv = process.argv.slice(2);
main(argv).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const failure =
      error instanceof CtlError
        ? error
        : new CtlError(EXIT.api, "omxterm-ctl failed unexpectedly.");
    // status answers on stdout either way, so an agent can relay it.
    const output =
      argv[0] === "status" && failure.exitCode === EXIT.absent
        ? process.stdout
        : process.stderr;
    output.write(`${failure.message}\n`);
    process.exitCode = failure.exitCode;
  },
);
