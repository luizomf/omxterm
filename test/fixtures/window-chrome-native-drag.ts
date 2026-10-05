import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { screen, type BrowserWindow } from "electron";
import { spawnFixtureProcess } from "./native-fixture-ownership";

// Real desktop input: sendInputEvent does not exercise Windows nonclient drag
// hit testing. Never click unless the owned window is actually under the point.
export async function exerciseWindowsHandleDrag(
  window: BrowserWindow,
  useNativeCursor: () => void,
) {
  if (process.platform !== "win32") return "not-exercised";
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
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
# Electron supplies physical pixels. Keep Win32 hit testing in that space.
if ([Pointer]::SetThreadDpiAwarenessContext([IntPtr](-4)) -eq [IntPtr]::Zero) { throw 'Cannot establish physical coordinate space' }
$original = New-Object Pointer+Point
[Pointer]::GetCursorPos([ref]$original) | Out-Null
$down = $false
try {
  if ([Pointer]::GetForegroundWindow().ToInt64() -ne ${handle}) { throw 'Owned window is not foreground' }
  if (-not [Pointer]::SetCursorPos(${point.x}, ${point.y})) { throw 'Pointer move failed' }
  Start-Sleep -Milliseconds 500
  $point = New-Object Pointer+Point
  [Pointer]::GetCursorPos([ref]$point) | Out-Null
  if ([Pointer]::GetAncestor([Pointer]::WindowFromPoint($point), 2).ToInt64() -ne ${handle}) { throw 'Owned window is not under pointer' }
  [Pointer]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  $down = $true
  for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Milliseconds 30
    [Pointer]::SetCursorPos(${point.x} + $i * 5, ${point.y} + $i * 5) | Out-Null
  }
  Start-Sleep -Milliseconds 100
} finally {
  if ($down) { [Pointer]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero) }
  [Pointer]::SetCursorPos($original.X, $original.Y) | Out-Null
}
`;
  await new Promise<void>((resolve, reject) => {
    spawnFixtureProcess(() => {
      const child = execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        { timeout: 15_000, windowsHide: true },
        (error) => (error ? reject(error) : resolve()),
      );
      if (child.pid === undefined)
        throw new Error("Native pointer helper did not start");
      return Object.assign(child, { pid: child.pid });
    });
  });
  const after = window.getBounds();
  assert.ok(
    after.x !== before.x && after.y !== before.y,
    "native handle drag moves the same window after fullscreen",
  );
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  return "verified";
}
