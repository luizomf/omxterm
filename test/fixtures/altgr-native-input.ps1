param([long]$Handle, [string]$Sequence)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class AltGrKeys {
  [StructLayout(LayoutKind.Explicit, Size=40)] public struct Input {
    [FieldOffset(0)] public uint type;
    [FieldOffset(10)] public ushort scan;
    [FieldOffset(12)] public uint flags;
  }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, Input[] input, int size);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint thread);
  public static void Key(ushort scan, bool extended, bool up) {
    Input i=new Input();i.type=1;i.scan=scan;i.flags=8u|(extended?1u:0u)|(up?2u:0u);
    if(SendInput(1,new Input[]{i},40)!=1) throw new Exception("SendInput failed");
  }
}
'@
if ([AltGrKeys]::GetForegroundWindow().ToInt64() -ne $Handle) { throw 'Wrong foreground window' }
$pidValue = [uint32]0
$thread = [AltGrKeys]::GetWindowThreadProcessId([IntPtr]$Handle, [ref]$pidValue)
"layout=$([AltGrKeys]::GetKeyboardLayout($thread).ToInt64().ToString('X'))"
$held = @{}
try {
  foreach ($pair in $Sequence.Split(',')) {
    if ([AltGrKeys]::GetForegroundWindow().ToInt64() -ne $Handle) { throw 'Foreground changed' }
    $key, $down = $pair.Split(':')
    # Linux evdev identities in the shared fixture sequence; real PC scan codes.
    $scan = @{ '56'=0x38; '100'=0x38; '64'=0x40; '36'=0x24; '18'=0x12; '40'=0x28; '57'=0x39 }[$key]
    if ($null -eq $scan) { throw 'Unknown fixture key' }
    [AltGrKeys]::Key($scan, $key -eq '100', $down -eq '0')
    if ($down -eq '1') { $held[$key]=$scan } else { $held.Remove($key) }
    Start-Sleep -Milliseconds 50
  }
} finally {
  foreach ($key in @($held.Keys)) { [AltGrKeys]::Key($held[$key], $key -eq '100', $true) }
}
