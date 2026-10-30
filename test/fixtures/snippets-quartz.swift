import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

// Private disposable-guest diagnostic. Never run this binary on the host.
let args = CommandLine.arguments
let key: CGKeyCode = 36 // kVK_Return, verified in HIToolbox Events.h
func emit(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data + Data([10]))
}
func state() -> [String: Any] {
    ["sessionDown": CGEventSource.keyState(.combinedSessionState, key: key),
     "hidDown": CGEventSource.keyState(.hidSystemState, key: key),
     "frontmostPID": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1]
}
func fail(_ text: String) -> Never { emit(["kind": "error", "message": text]); exit(2) }
func access() -> [String: Any] {
    ["kind": "access", "listen": CGPreflightListenEventAccess(),
     "post": CGPreflightPostEventAccess(), "accessibility": AXIsProcessTrusted()]
}
if args.count == 2 && args[1] == "status" {
    emit(access()); emit(["kind": "state", "state": state()]); exit(0)
}
if args.count == 2 && args[1] == "request-access" {
    // Explicit provisioning only, not called by the campaign. May show guest UI.
    emit(["kind": "requested", "listen": CGRequestListenEventAccess(),
          "post": CGRequestPostEventAccess()]); emit(access()); exit(0)
}
// Explicit file-scope storage: guard-bound values become captured context in
// Swift's C callback conversion during code generation (typecheck misses it).
let token = args.count > 2 ? (Int64(args[2]) ?? 0) : 0
let target = args.count > 3 ? (Int32(args[3]) ?? 0) : 0
guard args.count >= 5, token > 0, target > 0 else { fail("usage: post TOKEN PID down|repeat|up OR observe TOKEN PID STOPFILE") }
func post(_ operation: String) {
    guard CGPreflightPostEventAccess() else { fail("post access unavailable") }
    guard ["down", "repeat", "up"].contains(operation) else { fail("invalid operation") }
    if operation != "up" {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == target else { fail("target is not frontmost") }
        let flags = CGEventSource.flagsState(.combinedSessionState)
        guard flags.intersection([.maskShift, .maskControl, .maskAlternate, .maskCommand]).isEmpty else { fail("modifier key active") }
    }
    guard let source = CGEventSource(stateID: .combinedSessionState),
          let event = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: operation != "up") else { fail("cannot create Quartz event") }
    event.setIntegerValueField(.eventSourceUserData, value: token)
    event.setIntegerValueField(.keyboardEventAutorepeat, value: operation == "repeat" ? 1 : 0)
    event.flags = []
    event.post(tap: .cgSessionEventTap)
    emit(["kind": "submitted", "operation": operation, "token": token, "state": state()])
    // A CGEventPost return and this state sample are NOT receipt or acceptance.
}
if args[1] == "post" { post(args[4]); exit(0) }
guard args[1] == "observe", args.count == 5 else { fail("invalid arguments") }
guard CGPreflightListenEventAccess(), CGPreflightPostEventAccess() else { emit(access()); fail("provision listen/post access before campaign") }
let stop = args[4]
var sawDown = false
var sawUp = false
var observerFailed = false
let mask = (CGEventMask(1) << CGEventType.keyDown.rawValue) | (CGEventMask(1) << CGEventType.keyUp.rawValue)
let callback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        observerFailed = true
        emit(["kind": "tap-disabled", "type": type.rawValue])
        CFRunLoopStop(CFRunLoopGetMain())
        return Unmanaged.passUnretained(event)
    }
    if event.getIntegerValueField(.eventSourceUserData) == token && event.getIntegerValueField(.keyboardEventKeycode) == Int64(key) {
        let repeatFlag = event.getIntegerValueField(.keyboardEventAutorepeat)
        if type == .keyDown { sawDown = true }
        if type == .keyUp { sawUp = true }
        emit(["kind": "tap", "type": type == .keyUp ? "keyUp" : "keyDown", "repeat": repeatFlag,
              "token": token, "targetPID": event.getIntegerValueField(.eventTargetUnixProcessID),
              "sourcePID": event.getIntegerValueField(.eventSourceUnixProcessID),
              "timestamp": event.timestamp, "state": state()])
    }
    return Unmanaged.passUnretained(event)
}
guard let tap = CGEvent.tapCreate(tap: .cgAnnotatedSessionEventTap, place: .tailAppendEventTap,
                                  options: .listenOnly, eventsOfInterest: mask, callback: callback, userInfo: nil),
      let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0) else { fail("listen-only annotated-session tap unavailable") }
CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
guard CGEvent.tapIsEnabled(tap: tap) else { fail("tap not enabled") }
var lastSession = CGEventSource.keyState(.combinedSessionState, key: key)
var lastHID = CGEventSource.keyState(.hidSystemState, key: key)
emit(["kind": "ready", "state": state(), "token": token, "targetPID": target])
let deadline = Date().addingTimeInterval(75)
let timer = Timer(timeInterval: 0.01, repeats: true) { _ in
    let session = CGEventSource.keyState(.combinedSessionState, key: key)
    let hid = CGEventSource.keyState(.hidSystemState, key: key)
    if session != lastSession || hid != lastHID {
        lastSession = session; lastHID = hid
        emit(["kind": "state-edge", "state": state()])
    }
    if FileManager.default.fileExists(atPath: stop) { CFRunLoopStop(CFRunLoopGetMain()) }
    else if Date() >= deadline {
        observerFailed = true; emit(["kind": "observer-deadline"]); CFRunLoopStop(CFRunLoopGetMain())
    }
}
RunLoop.main.add(timer, forMode: .common)
CFRunLoopRun()
timer.invalidate()
// Cleanup submission is distinctly labeled and never satisfies the scenario.
if sawDown && (!sawUp || CGEventSource.keyState(.combinedSessionState, key: key)) {
    emit(["kind": "cleanup-release"]); post("up")
}
CGEvent.tapEnable(tap: tap, enable: false)
CFMachPortInvalidate(tap)
emit(["kind": "observer-stopped", "failed": observerFailed, "state": state()])
exit(observerFailed ? 2 : 0)
