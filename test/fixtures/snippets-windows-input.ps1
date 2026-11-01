param(
  [long]$Handle,
  [int]$Owner,
  [ValidateSet('state', 'down', 'repeat', 'up')][string]$Operation
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class SnippetsWindowsInput {
  [StructLayout(LayoutKind.Explicit, Size=40)] public struct Input {
    [FieldOffset(0)] public uint type;
    [FieldOffset(10)] public ushort scan;
    [FieldOffset(12)] public uint flags;
  }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, Input[] input, int size);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  public static uint Enter(bool up) {
    Input input = new Input(); input.type = 1; input.scan = 0x1c;
    input.flags = 8u | (up ? 2u : 0u);
    return SendInput(1, new Input[] { input }, 40);
  }
}
'@
if ($Handle -le 0 -or $Owner -le 0) { throw 'Invalid owned window' }
$window = [IntPtr]$Handle
$ownerPid = [uint32]0
$thread = [SnippetsWindowsInput]::GetWindowThreadProcessId($window, [ref]$ownerPid)
if ($thread -eq 0 -or $ownerPid -ne $Owner) { throw 'Window owner changed' }
$foreground = [SnippetsWindowsInput]::GetForegroundWindow() -eq $window
if (!$foreground -and $Operation -ne 'up') { throw 'Owned window is not foreground' }
$result = [ordered]@{
  operation = $Operation
  handle = "$Handle"
  owner = [int]$ownerPid
  foreground = $foreground
}
if ($Operation -ne 'state') {
  $sent = [SnippetsWindowsInput]::Enter($Operation -eq 'up')
  if ($sent -ne 1) { throw 'SendInput failed' }
  $result['sent'] = [int]$sent
}
$result['down'] = (([int][SnippetsWindowsInput]::GetAsyncKeyState(0x0d) -band 0x8000) -ne 0)
$result | ConvertTo-Json -Compress
