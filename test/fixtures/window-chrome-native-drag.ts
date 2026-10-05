import assert from "node:assert/strict";
import { execFile, type ChildProcess } from "node:child_process";
import { screen, type BrowserWindow, type Rectangle } from "electron";
import { spawnFixtureProcess } from "./native-fixture-ownership";

// Real desktop input: sendInputEvent does not exercise Windows nonclient drag
// hit testing. Never click unless the owned window is actually under the point.
export async function exerciseWindowsHandleDrag(
  window: BrowserWindow,
  useNativeCursor: () => void,
) {
  if (process.platform !== "win32") return "not-exercised";
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Pointer {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
# Finish native preparation before the parent requests focus. ReadLine uses the
# redirected stdin pipe, not a console or PowerShell's interactive Read-Host.
if ([Pointer]::SetThreadDpiAwarenessContext([IntPtr](-4)) -eq [IntPtr]::Zero) { throw 'Cannot establish physical coordinate space' }
[Console]::Out.WriteLine('OMXTERM_DRAG_READY')
[Console]::Out.Flush()
$command = [Console]::ReadLine()
if ($null -eq $command -or $command -notmatch '^([0-9]+) (-?[0-9]+) (-?[0-9]+)$') { throw 'Invalid native drag command' }
$handle = [Int64]::Parse($Matches[1])
$x = [Int32]::Parse($Matches[2])
$y = [Int32]::Parse($Matches[3])
$original = New-Object Pointer+Point
[Pointer]::GetCursorPos([ref]$original) | Out-Null
$down = $false
try {
  if ([Pointer]::GetForegroundWindow().ToInt64() -ne $handle) { throw 'Owned window is not foreground' }
  if (-not [Pointer]::SetCursorPos($x, $y)) { throw 'Pointer move failed' }
  Start-Sleep -Milliseconds 500
  $point = New-Object Pointer+Point
  [Pointer]::GetCursorPos([ref]$point) | Out-Null
  if ([Pointer]::GetAncestor([Pointer]::WindowFromPoint($point), 2).ToInt64() -ne $handle) { throw 'Owned window is not under pointer' }
  [Pointer]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  $down = $true
  for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Milliseconds 30
    [Pointer]::SetCursorPos($x + $i * 5, $y + $i * 5) | Out-Null
  }
  Start-Sleep -Milliseconds 100
} finally {
  if ($down) { [Pointer]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero) }
  [Pointer]::SetCursorPos($original.X, $original.Y) | Out-Null
}
`;
  let before: Rectangle | undefined;
  await new Promise<void>((resolve, reject) => {
    let child: ChildProcess | undefined;
    let registered = false;
    let ready = false;
    let started = false;
    let finished = false;
    let output = "";
    let failure: Error | undefined;
    const fail = (error: Error) => {
      if (failure || finished) return;
      failure = error;
      child?.stdin?.destroy();
      child?.kill();
      // execFile's callback joins termination and captured stream closure.
    };
    const start = () => {
      if (!registered || !ready || started || finished || failure) return;
      started = true;
      try {
        useNativeCursor();
        window.focus();
        before = window.getBounds();
        const bounds = window.getContentBounds();
        const point = screen.dipToScreenPoint({
          x: Math.round(bounds.x + bounds.width / 2),
          y: bounds.y + 8,
        });
        const handle = window.getNativeWindowHandle().readBigUInt64LE();
        child!.stdin!.end(`${handle} ${point.x} ${point.y}\n`);
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error("Native drag setup failed"),
        );
      }
    };
    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (ready || output.length > 32) {
        fail(new Error("Unexpected native drag helper output"));
        return;
      }
      if (!output.includes("\n")) return;
      if (
        output !== "OMXTERM_DRAG_READY\n" &&
        output !== "OMXTERM_DRAG_READY\r\n"
      ) {
        fail(new Error("Invalid native drag readiness"));
        return;
      }
      ready = true;
      start();
    };
    const onInputError = () =>
      fail(new Error("Native drag command delivery failed"));
    const onStderr = () => {
      // Before readiness, stderr invalidates preparation. During the drag let
      // PowerShell finish its finally block and retain the native guard error.
      if (!started) fail(new Error("Native drag helper wrote stderr"));
    };
    try {
      spawnFixtureProcess(() => {
        child = execFile(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            Buffer.from(script, "utf16le").toString("base64"),
          ],
          { timeout: 15_000, windowsHide: true },
          (error, _stdout, stderr) => {
            finished = true;
            child?.stdout?.removeListener("data", onData);
            child?.stderr?.removeListener("data", onStderr);
            child?.stdin?.destroy();
            // Keep the error listener until the destroyed pipe closes.
            const outcome =
              failure ??
              error ??
              (stderr.length
                ? new Error("Native drag helper wrote stderr")
                : undefined);
            if (outcome) reject(outcome);
            else if (!started)
              reject(new Error("Native drag helper exited before stimulus"));
            else resolve();
          },
        );
        child.stdout!.on("data", onData);
        child.stderr!.on("data", onStderr);
        child.stdin!.on("error", onInputError);
        child.stdin!.once("close", () =>
          child?.stdin?.removeListener("error", onInputError),
        );
        if (child.pid === undefined)
          throw new Error("Native pointer helper did not start");
        return Object.assign(child, { pid: child.pid });
      });
      // The wrapper's synchronous post-spawn inventory must finish before even
      // an already-buffered readiness message can authorize the focus request.
      registered = true;
      start();
    } catch (error) {
      const cause =
        error instanceof Error
          ? error
          : new Error("Native drag registration failed");
      if (child) fail(cause);
      else reject(cause);
    }
  });
  assert.ok(before, "Native drag stimulus started");
  const after = window.getBounds();
  assert.ok(
    after.x !== before.x && after.y !== before.y,
    "native handle drag moves the same window after fullscreen",
  );
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  return "verified";
}
