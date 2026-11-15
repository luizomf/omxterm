import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { screen, type BrowserWindow } from "electron";
import { spawnFixtureProcess } from "./native-fixture-ownership";
import { assertWindowsDragGeometry } from "./window-chrome-drag-geometry";

// Real desktop input: sendInputEvent does not exercise Windows nonclient drag
// hit testing. Never click unless the owned window is actually under the point.
// Windows refuses focus() to a process without foreground rights (for example
// when the suite runs inside a terminal and another app is in front). Keep the
// window above everything during the drag and let the real press activate it,
// as a user's click would.
export async function exerciseWindowsHandleDrag(
  window: BrowserWindow,
  useNativeCursor: () => void,
) {
  if (process.platform !== "win32") return "not-exercised";
  const assertRestored = () =>
    assert.ok(
      !window.isFullScreen() && !window.isMaximized() && !window.isMinimized(),
      "native handle drag requires a restored window",
    );
  assertRestored();
  useNativeCursor();
  window.focus();
  const before = window.getBounds();
  const bounds = window.getContentBounds();
  const point = screen.dipToScreenPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: bounds.y + 8,
  });
  const handle = window.getNativeWindowHandle().readBigUInt64LE();
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Pointer {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Placement { public uint Length; public uint Flags; public uint Show; public Point Min; public Point Max; public Rect Normal; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr h, ref Placement p);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  public static object Snapshot(IntPtr h) {
    Rect outer, client;
    var placement = new Placement(); placement.Length = (uint)Marshal.SizeOf(placement);
    if (!GetWindowRect(h, out outer)) throw new Exception("GetWindowRect failed");
    if (!GetClientRect(h, out client)) throw new Exception("GetClientRect failed");
    if (!GetWindowPlacement(h, ref placement)) throw new Exception("GetWindowPlacement failed");
    uint dpi = GetDpiForWindow(h);
    if (dpi == 0) throw new Exception("GetDpiForWindow failed");
    IntPtr monitor = MonitorFromWindow(h, 0);
    if (monitor == IntPtr.Zero) throw new Exception("MonitorFromWindow failed");
    return new {
      hwnd = h.ToInt64().ToString(), monitor = monitor.ToInt64().ToString(), dpi,
      showCmd = placement.Show, flags = placement.Flags,
      outer = new { x = outer.Left, y = outer.Top, width = outer.Right - outer.Left, height = outer.Bottom - outer.Top },
      client = new { width = client.Right - client.Left, height = client.Bottom - client.Top }
    };
  }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder name, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  // Names whatever covers the point: class and process only, never a title.
  public static string Describe(IntPtr h) {
    var name = new System.Text.StringBuilder(256);
    GetClassName(h, name, 256);
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    string process = "unknown";
    try { process = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
    return name + " (" + process + ")";
  }
  // WM_NCHITTEST at a physical screen point, as the press will see it.
  public static long HitTest(IntPtr h, int x, int y) {
    IntPtr result;
    long point = (long)((((uint)y & 0xFFFFu) << 16) | ((uint)x & 0xFFFFu));
    if (SendMessageTimeout(h, 0x84, IntPtr.Zero, new IntPtr(point), 2, 1000, out result) == IntPtr.Zero) return -1;
    return result.ToInt64();
  }
}
'@
# Electron supplies physical pixels. Keep Win32 hit testing and geometry in that space.
if ([Pointer]::SetThreadDpiAwarenessContext([IntPtr](-4)) -eq [IntPtr]::Zero) { throw 'Cannot establish physical coordinate space' }
$original = New-Object Pointer+Point
if (-not [Pointer]::GetCursorPos([ref]$original)) { throw 'Original pointer read failed' }
$down = $false
try {
  if (-not [Pointer]::SetCursorPos(${point.x}, ${point.y})) { throw 'Pointer move failed' }
  # Hovering reveals the handle through main's cursor sampling and the
  # renderer's drag regions. Press only once the point is a caption (HTCAPTION).
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  while (($hit = [Pointer]::HitTest([IntPtr]${handle}, ${point.x}, ${point.y})) -ne 2) {
    if ([DateTime]::UtcNow -gt $deadline) { throw "Drag handle never became a caption (hit test $hit)" }
    Start-Sleep -Milliseconds 20
  }
  $point = New-Object Pointer+Point
  if (-not [Pointer]::GetCursorPos([ref]$point)) { throw 'Pointer read failed' }
  $under = [Pointer]::GetAncestor([Pointer]::WindowFromPoint($point), 2)
  if ($under.ToInt64() -ne ${handle}) { throw "Owned window is not under pointer; on top: $([Pointer]::Describe($under))" }
  $beforeGeometry = [Pointer]::Snapshot([IntPtr]${handle})
  [Pointer]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  $down = $true
  for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Milliseconds 30
    if (-not [Pointer]::SetCursorPos(${point.x} + $i * 5, ${point.y} + $i * 5)) { throw 'Drag pointer move failed' }
  }
  # Hold the button until the move loop has moved the window: a busy UI
  # thread that reads the press late would otherwise see it already released.
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  do {
    Start-Sleep -Milliseconds 20
    $held = [Pointer]::Snapshot([IntPtr]${handle})
  } while (($held.outer.x -eq $beforeGeometry.outer.x -or $held.outer.y -eq $beforeGeometry.outer.y) -and [DateTime]::UtcNow -lt $deadline)
  Start-Sleep -Milliseconds 100
  if ([Pointer]::GetForegroundWindow().ToInt64() -ne ${handle}) { throw 'Native press did not activate the owned window' }
} finally {
  if ($down) { [Pointer]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero) }
  if (-not [Pointer]::SetCursorPos($original.X, $original.Y)) { throw 'Pointer restoration failed' }
}
$afterGeometry = [Pointer]::Snapshot([IntPtr]${handle})
@{before=$beforeGeometry;after=$afterGeometry} | ConvertTo-Json -Depth 4 -Compress
`;
  window.setAlwaysOnTop(true);
  const geometry = await new Promise<string>((resolve, reject) => {
    spawnFixtureProcess(() => {
      const child = execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        { timeout: 15_000, windowsHide: true },
        (error, stdout) => (error ? reject(error) : resolve(stdout)),
      );
      if (child.pid === undefined)
        throw new Error("Native pointer helper did not start");
      return Object.assign(child, { pid: child.pid });
    });
  }).finally(() => window.setAlwaysOnTop(false));
  assertWindowsDragGeometry(geometry, handle);
  assertRestored();
  assert.equal(window.getNativeWindowHandle().readBigUInt64LE(), handle);
  const after = window.getBounds();
  assert.ok(
    after.x !== before.x && after.y !== before.y,
    "native handle drag moves the same window after fullscreen",
  );
  return "verified";
}
