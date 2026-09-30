import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnFixtureProcess } from "./native-fixture-ownership";
import { spawnFixturePty } from "./native-fixture-pty";

// Opt-in comparison on a native POSIX desktop with tmux installed. Keep its
// server in the foreground and register it before it can create pane children.
export async function withTmuxImageOutput(options: {
  readonly root: string;
  readonly reference: string;
  readonly size: { cols: number; rows: number };
  readonly deliverOutput: (data: string) => void;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
  readonly check: (phase: string) => Promise<void>;
}): Promise<void> {
  if (process.platform === "win32") throw new Error("tmux requires POSIX");
  const node = process.env["npm_node_execpath"];
  if (!node) throw new Error("tmux comparison requires npm_node_execpath");
  const socket = path.join(options.root, "image-tmux.sock");
  const producer = path.join(options.root, "image-tmux-producer.cjs");
  await writeFile(
    producer,
    String.raw`process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write('\x1b[2J\x1b[H\x1b[?25l'+process.argv[2]+'\r\n__IMAGE_TMUX_READY__');process.stdin.on('data',()=>process.exit(0));`,
  );
  const server = spawnFixtureProcess(() => {
    const child = spawn("tmux", ["-D", "-S", socket, "-f", "/dev/null"], {
      cwd: options.root,
      stdio: "ignore",
    });
    if (!child.pid) throw new Error("tmux server did not spawn");
    return Object.assign(child, { pid: child.pid });
  });
  let serverExited = false;
  server.once("exit", () => {
    serverExited = true;
  });
  await options.waitFor(
    () => existsSync(socket),
    "owned foreground tmux server",
  );
  const client = spawnFixturePty(
    "tmux",
    [
      "-S",
      socket,
      "new-session",
      "-x",
      String(options.size.cols),
      "-y",
      String(options.size.rows),
      node,
      producer,
      options.reference,
    ],
    {
      name: "xterm-256color",
      cols: options.size.cols,
      rows: options.size.rows,
      cwd: options.root,
      env: { ...process.env, TERM: "xterm-256color" },
    },
  );
  let received = "";
  let outputEvents = 0;
  let clientExited = false;
  const output = client.onData((data) => {
    received += data;
    outputEvents++;
    options.deliverOutput(data);
  });
  const exit = client.onExit(() => {
    clientExited = true;
  });
  try {
    await options.waitFor(
      () => received.includes("__IMAGE_TMUX_READY__"),
      "real tmux pane output",
    );
    await options.check("tmux initial");
    const before = outputEvents;
    client.write("\u0002r");
    await options.waitFor(
      () => outputEvents > before,
      "tmux refresh-client redraw",
    );
    await options.check("tmux redraw");
    client.write("q");
    await options.waitFor(() => clientExited, "tmux pane/client exit");
    server.kill("SIGTERM");
    await options.waitFor(() => serverExited, "owned tmux server exit");
  } finally {
    output.dispose();
    exit.dispose();
    if (!clientExited) client.kill();
    if (!serverExited) server.kill("SIGTERM");
  }
}
