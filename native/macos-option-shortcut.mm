// Main-only, non-action snapshot for bounded Option shortcut interpretation.
// The code whitelist correlates Electron's event to AppKit; letter identity
// comes only from the active layout, never from the physical letter position.
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#include <node_api.h>
#include <cstring>

static napi_value Unavailable(napi_env env) {
  napi_value result;
  return napi_get_null(env, &result) == napi_ok ? result : nullptr;
}

static NSDictionary<NSString*, NSNumber*>* Codes() {
  static NSDictionary<NSString*, NSNumber*>* codes;
  if (!codes) codes = @{
    @"KeyA":@(kVK_ANSI_A), @"KeyB":@(kVK_ANSI_B), @"KeyC":@(kVK_ANSI_C),
    @"KeyD":@(kVK_ANSI_D), @"KeyE":@(kVK_ANSI_E), @"KeyF":@(kVK_ANSI_F),
    @"KeyG":@(kVK_ANSI_G), @"KeyH":@(kVK_ANSI_H), @"KeyI":@(kVK_ANSI_I),
    @"KeyJ":@(kVK_ANSI_J), @"KeyK":@(kVK_ANSI_K), @"KeyL":@(kVK_ANSI_L),
    @"KeyM":@(kVK_ANSI_M), @"KeyN":@(kVK_ANSI_N), @"KeyO":@(kVK_ANSI_O),
    @"KeyP":@(kVK_ANSI_P), @"KeyQ":@(kVK_ANSI_Q), @"KeyR":@(kVK_ANSI_R),
    @"KeyS":@(kVK_ANSI_S), @"KeyT":@(kVK_ANSI_T), @"KeyU":@(kVK_ANSI_U),
    @"KeyV":@(kVK_ANSI_V), @"KeyW":@(kVK_ANSI_W), @"KeyX":@(kVK_ANSI_X),
    @"KeyY":@(kVK_ANSI_Y), @"KeyZ":@(kVK_ANSI_Z),
    @"Digit0":@(kVK_ANSI_0), @"Digit1":@(kVK_ANSI_1), @"Digit2":@(kVK_ANSI_2),
    @"Digit3":@(kVK_ANSI_3), @"Digit4":@(kVK_ANSI_4), @"Digit5":@(kVK_ANSI_5),
    @"Digit6":@(kVK_ANSI_6), @"Digit7":@(kVK_ANSI_7), @"Digit8":@(kVK_ANSI_8),
    @"Digit9":@(kVK_ANSI_9)
  };
  return codes;
}

// Chromium's numeric exception uses native top-row positions (not keypad).
static char TopDigit(unsigned short code) {
  switch (code) {
    case kVK_ANSI_0: return '0'; case kVK_ANSI_1: return '1';
    case kVK_ANSI_2: return '2'; case kVK_ANSI_3: return '3';
    case kVK_ANSI_4: return '4'; case kVK_ANSI_5: return '5';
    case kVK_ANSI_6: return '6'; case kVK_ANSI_7: return '7';
    case kVK_ANSI_8: return '8'; case kVK_ANSI_9: return '9';
    default: return 0;
  }
}

static bool Contains(NSView* view, uintptr_t address, unsigned depth = 0) {
  if (!view || depth > 64) return false;
  if (reinterpret_cast<uintptr_t>((__bridge void*)view) == address) return true;
  for (NSView* child in view.subviews)
    if (Contains(child, address, depth + 1)) return true;
  return false;
}

// Compare a supplied handle only to live views of the current key window;
// never dereference or message a caller-supplied pointer.
static bool OwnsHandle(napi_env env, napi_value handle, NSWindow* window) {
  bool buffer = false;
  size_t length = 0;
  void* data = nullptr;
  napi_value global, constructor;
  if (!window || napi_get_global(env, &global) != napi_ok ||
      napi_get_named_property(env, global, "Buffer", &constructor) != napi_ok ||
      napi_instanceof(env, handle, constructor, &buffer) != napi_ok || !buffer ||
      napi_is_buffer(env, handle, &buffer) != napi_ok || !buffer ||
      napi_get_buffer_info(env, handle, &data, &length) != napi_ok ||
      length != sizeof(uintptr_t)) return false;
  uintptr_t address = 0;
  std::memcpy(&address, data, sizeof(address));
  if (!address) return false;
  NSView* root = window.contentView;
  while (root.superview) root = root.superview;
  return Contains(root, address);
}

// The retained ID lets one call reject a source switch during translation.
static CFStringRef CopyCurrentLayoutID() {
  TISInputSourceRef input = TISCopyCurrentKeyboardInputSource();
  TISInputSourceRef layout = TISCopyCurrentKeyboardLayoutInputSource();
  CFTypeRef type = input ? TISGetInputSourceProperty(input, kTISPropertyInputSourceType) : nullptr;
  CFTypeRef inputID = input ? TISGetInputSourceProperty(input, kTISPropertyInputSourceID) : nullptr;
  CFTypeRef layoutID = layout ? TISGetInputSourceProperty(layout, kTISPropertyInputSourceID) : nullptr;
  bool matches = type && inputID && layoutID &&
      CFGetTypeID(type) == CFStringGetTypeID() &&
      CFGetTypeID(inputID) == CFStringGetTypeID() &&
      CFGetTypeID(layoutID) == CFStringGetTypeID() &&
      CFEqual(type, kTISTypeKeyboardLayout) && CFEqual(inputID, layoutID);
  CFStringRef result = matches ? static_cast<CFStringRef>(CFRetain(inputID)) : nullptr;
  if (input) CFRelease(input);
  if (layout) CFRelease(layout);
  return result;
}

struct LayoutID {
  CFStringRef value = CopyCurrentLayoutID();
  ~LayoutID() { if (value) CFRelease(value); }
};

static NSString* ReadString(napi_env env, napi_value value) {
  char bytes[128];
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, bytes, sizeof(bytes), &length) != napi_ok ||
      !length || length >= sizeof(bytes) - 1 || std::memchr(bytes, 0, length)) return nil;
  return [[NSString alloc] initWithBytes:bytes length:length encoding:NSUTF8StringEncoding];
}

static napi_value Resolve(napi_env env, napi_callback_info info) {
  @autoreleasepool { @try {
    if (![NSThread isMainThread]) return Unavailable(env);
    static bool resolving = false;
    if (resolving) return Unavailable(env);
    struct ResolutionGuard {
      bool& active;
      explicit ResolutionGuard(bool& flag) : active(flag) { active = true; }
      ~ResolutionGuard() { active = false; }
    } guard(resolving);
    size_t argc = 4;
    napi_value argv[4];
    if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc != 3)
      return Unavailable(env);
    NSString* code = ReadString(env, argv[1]);
    NSString* characters = ReadString(env, argv[2]);
    NSNumber* expected = code ? Codes()[code] : nil;
    // Sample synchronously before inspecting event-specific fields.
    NSEvent* event = NSApp.currentEvent;
    NSWindow* window = NSApp.keyWindow;
    if (!expected || !characters || !event || event.type != NSEventTypeKeyDown ||
        !window || !OwnsHandle(env, argv[0], window) ||
        event.windowNumber == 0 || event.windowNumber != window.windowNumber || event.window != window ||
        event.keyCode != expected.unsignedShortValue || event.ARepeat ||
        (event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask) != NSEventModifierFlagOption ||
        ![event.characters isEqualToString:characters])
      return Unavailable(env);
    LayoutID before;
    if (!before.value) return Unavailable(env);
    char identity = 0;
    if ([code hasPrefix:@"Digit"]) identity = TopDigit(event.keyCode);
    else {
      NSString* plain = [event charactersByApplyingModifiers:0];
      if (plain.length == 1) {
        unichar letter = [plain characterAtIndex:0];
        if (letter >= 'A' && letter <= 'Z') letter += 'a' - 'A';
        if (letter >= 'a' && letter <= 'z') identity = static_cast<char>(letter);
      }
    }
    LayoutID after;
    if (!identity || !after.value || !CFEqual(before.value, after.value) ||
        NSApp.currentEvent != event || NSApp.keyWindow != window) return Unavailable(env);
    napi_value result;
    return napi_create_string_utf8(env, &identity, 1, &result) == napi_ok ? result : nullptr;
  } @catch (NSException*) { return Unavailable(env); } }
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value operation;
  if (napi_create_function(env, "resolve", NAPI_AUTO_LENGTH, Resolve, nullptr, &operation) != napi_ok ||
      napi_set_named_property(env, exports, "resolve", operation) != napi_ok) return nullptr;
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
