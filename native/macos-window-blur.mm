// Optional, main-only per-window effect. Private CGS ABI as used by Ghostty
// v1.3.1 src/apprt/embedded.zig; availability and visible behavior are not stable.
#import <Cocoa/Cocoa.h>
#include <node_api.h>
#include <dlfcn.h>
#include <cstring>

using Connection = void* (*)();
using Blur = int32_t (*)(void*, uintptr_t, int);

static napi_value Fail(napi_env env, const char* message) {
  napi_throw_type_error(env, nullptr, message);
  return nullptr;
}

static napi_value Code(napi_env env, int32_t code) {
  napi_value result;
  if (napi_create_int32(env, code, &result) != napi_ok) return nullptr;
  return result;
}

static bool Contains(NSView* view, uintptr_t address, unsigned depth = 0) {
  if (!view || depth > 64) return false;
  // Never cast/message the supplied pointer. Traverse only live AppKit views
  // from this process, comparing their addresses with the supplied bytes.
  if (reinterpret_cast<uintptr_t>((__bridge void*)view) == address) return true;
  for (NSView* child in view.subviews)
    if (Contains(child, address, depth + 1)) return true;
  return false;
}

static NSWindow* Resolve(napi_env env, napi_value handle) {
  bool buffer = false;
  size_t length = 0;
  void* data = nullptr;
  napi_value global, constructor;
  // Some runtimes report Uint8Array as a buffer at the N-API seam. Require
  // Node's Buffer identity as well as its byte storage and exact pointer size.
  if (napi_get_global(env, &global) != napi_ok ||
      napi_get_named_property(env, global, "Buffer", &constructor) != napi_ok ||
      napi_instanceof(env, handle, constructor, &buffer) != napi_ok || !buffer ||
      napi_is_buffer(env, handle, &buffer) != napi_ok || !buffer ||
      napi_get_buffer_info(env, handle, &data, &length) != napi_ok ||
      length != sizeof(uintptr_t)) {
    Fail(env, "Expected an Electron NSView handle Buffer of pointer size");
    return nil;
  }
  uintptr_t address = 0;
  std::memcpy(&address, data, sizeof(address));
  if (address != 0) {
    for (NSWindow* candidate in NSApp.windows) {
      NSView* root = candidate.contentView;
      while (root.superview) root = root.superview;
      if (Contains(root, address)) return candidate;
    }
  }
  Fail(env, "Handle does not belong to a live owned AppKit window");
  return nil;
}

static napi_value SetBlur(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    // A worker can load Node-API modules, but must never touch the AppKit tree.
    if (![NSThread isMainThread])
      return Fail(env, "Blur requires the AppKit main thread");
    size_t argc = 3;
    napi_value argv[3];
    if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok)
      return nullptr;
    if (argc != 2)
      return Fail(env, "setBlur(handle, enabled) requires exactly two arguments");
    bool enabled = false;
    if (napi_get_value_bool(env, argv[1], &enabled) != napi_ok)
      return Fail(env, "enabled must be a boolean");
    @try {
      NSWindow* window = Resolve(env, argv[0]);
      if (!window) return nullptr;
      // Reset our background even if private symbol lookup/reset later fails.
      // The JS owner retains uncertainty and will not stack HUD onto a radius
      // whose removal could not be confirmed.
      if (!enabled) window.backgroundColor = NSColor.clearColor;
      auto connection = reinterpret_cast<Connection>(
          dlsym(RTLD_DEFAULT, "CGSDefaultConnectionForThread"));
      auto blur = reinterpret_cast<Blur>(
          dlsym(RTLD_DEFAULT, "CGSSetWindowBackgroundBlurRadius"));
      if (!connection || !blur) {
        napi_value unavailable;
        napi_get_null(env, &unavailable);
        return unavailable; // No private mutation was attempted.
      }
      if (enabled && !window.visible) return Code(env, -1);
      void* cid = connection();
      if (!cid || window.windowNumber <= 0) return Code(env, -1);
      const int32_t code = blur(
          cid, static_cast<uintptr_t>(window.windowNumber), enabled ? 20 : 0);
      if (enabled && code == 0)
        window.backgroundColor =
            [NSColor.whiteColor colorWithAlphaComponent:0.001];
      return Code(env, code);
    } @catch (NSException*) {
      // A caller must assume partial mutation and attempt reset. No exception
      // detail (which may include native window data) leaves the addon.
      return Code(env, -1);
    }
  }
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value operation;
  if (napi_create_function(env, "setBlur", NAPI_AUTO_LENGTH, SetBlur,
                           nullptr, &operation) != napi_ok ||
      napi_set_named_property(env, exports, "setBlur", operation) != napi_ok)
    return nullptr;
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
