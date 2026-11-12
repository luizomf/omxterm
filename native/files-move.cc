// Bounded Node-API async Files operations. No overwrite/delete fallback.
#include <node_api.h>
#include <atomic>
#include <cerrno>
#include <string>
#if defined(__linux__) || defined(__APPLE__)
#include <fcntl.h>
#endif
#ifdef __APPLE__
#include <stdio.h>
#include "files-trash-macos.h"
#endif
#ifdef __linux__
#include <sys/syscall.h>
#include <unistd.h>
#endif
#ifdef _WIN32
#include "files-windows.h"
#endif

namespace {
std::atomic<unsigned> pending{0};
enum class Operation { Move, Trash };
struct Work {
  Operation operation;
  napi_async_work work = nullptr;
  napi_deferred promise = nullptr;
  std::string source, destination, trashed;
  int error = 0;
};
void Check(napi_status status) {
  if (status != napi_ok) napi_fatal_error("files-move", NAPI_AUTO_LENGTH,
      "FILES_RUNTIME", NAPI_AUTO_LENGTH);
}
napi_value Error(napi_env env, const char* code) {
  napi_value text, result;
  Check(napi_create_string_utf8(env, code, NAPI_AUTO_LENGTH, &text));
  Check(napi_create_error(env, text, text, &result));
  return result;
}
#ifdef _WIN32
// CON, PRN, AUX, NUL, COM1-9 and LPT1-9 name devices, with or without an
// extension and in any case.
bool DeviceName(const std::string& part) {
  std::string base = part.substr(0, part.find('.'));
  while (!base.empty() && base.back() == ' ') base.pop_back();
  for (auto& unit : base)
    if (unit >= 'a' && unit <= 'z') unit = static_cast<char>(unit - 'a' + 'A');
  if (base == "CON" || base == "PRN" || base == "AUX" || base == "NUL")
    return true;
  return base.size() == 4 && (base.rfind("COM", 0) == 0 || base.rfind("LPT", 0) == 0) &&
         base[3] >= '1' && base[3] <= '9';
}
// Drive-absolute paths with at least one entry, and no part Windows would
// rewrite or treat specially: empty, dot, trailing dot or space (`x.` names
// `x`), a colon (alternate data stream), wildcards and other reserved
// characters, control characters, or a device name. No UNC, device or
// drive-relative spellings.
bool WindowsPath(const std::string& value) {
  const char drive = value[0];
  if (value.size() < 4 ||
      !((drive >= 'A' && drive <= 'Z') || (drive >= 'a' && drive <= 'z')) ||
      value[1] != ':' || (value[2] != '\\' && value[2] != '/'))
    return false;
  size_t start = 3;
  while (start <= value.size()) {
    size_t end = value.find_first_of("\\/", start);
    if (end == std::string::npos) end = value.size();
    const auto part = value.substr(start, end - start);
    if (part.empty() || part.back() == '.' || part.back() == ' ' ||
        part.find_first_of(":<>\"|?*") != std::string::npos ||
        DeviceName(part))
      return false;
    for (const char unit : part)
      if (static_cast<unsigned char>(unit) < 0x20) return false;
    start = end + 1;
  }
  return true;
}
#endif
bool Path(napi_env env, napi_value value, std::string& result) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok ||
      !length || length > 16384) return false;
  result.resize(length + 1);
  if (napi_get_value_string_utf8(env, value, result.data(), result.size(), &length) != napi_ok)
    return false;
  result.resize(length);
  if (result.find('\0') != std::string::npos) return false;
#ifdef _WIN32
  return WindowsPath(result);
#else
  return result[0] == '/';
#endif
}
bool TrashPath(const std::string& value) {
#ifdef _WIN32
  (void)value;
  return true;  // Path() already refused every ambiguous Windows spelling.
#else
  // A trailing separator or dot component can turn a final symlink into its
  // referent. Refuse these spellings, including root, rather than resolve them.
  if (value.back() == '/') return false;
  size_t start = 1;
  while (start < value.size()) {
    size_t end = value.find('/', start);
    if (end == std::string::npos) end = value.size();
    const auto component = value.substr(start, end - start);
    if (component.empty() || component == "." || component == "..") return false;
    start = end + 1;
  }
  return true;
#endif
}
void Execute(napi_env, void* data) {
  auto* move = static_cast<Work*>(data);
  if (move->operation == Operation::Trash) {
#ifdef __APPLE__
    move->error = TrashMacOS(move->source, move->trashed);
#elif defined(_WIN32)
    move->error = TrashWindows(move->source);
#else
    move->error = ENOSYS;
#endif
    return;
  }
#ifdef __linux__
  // RENAME_NOREPLACE=1. The kernel linearizes destination exclusion, including
  // dangling symlinks/directories and competing writers. EXDEV stays refusal.
  if (syscall(SYS_renameat2, AT_FDCWD, move->source.c_str(), AT_FDCWD,
              move->destination.c_str(), 1U) < 0) move->error = errno;
#elif defined(__APPLE__)
  // RENAME_EXCL excludes existing entries atomically; never retry or fall back.
  if (renameatx_np(AT_FDCWD, move->source.c_str(), AT_FDCWD,
                  move->destination.c_str(), RENAME_EXCL) < 0) move->error = errno;
#elif defined(_WIN32)
  move->error = MoveWindows(move->source, move->destination);
#else
  move->error = ENOSYS;
#endif
}
const char* Code(int error) {
#ifdef _WIN32
  // The shell would have deleted it permanently, so nothing was done.
  if (error == FILES_NOT_RECYCLED) return "ENOTRASH";
#endif
  // ENOTSUP and EOPNOTSUPP may alias; keep them out of duplicate case labels.
  if (error == ENOTSUP || error == EOPNOTSUPP) return "ENOTSUP";
  switch (error) {
    case EEXIST: case ENOTEMPTY: return "EEXIST";
    case EXDEV: return "EXDEV";
    case EACCES: case EPERM: return "EACCES";
    case ENOENT: return "ENOENT";
    case ENOSYS: case EINVAL: return "ENOTSUP";
    default: return "EIO";
  }
}
void Complete(napi_env env, napi_status status, void* data) {
  auto* move = static_cast<Work*>(data);
  if (status != napi_ok) {
    Check(napi_reject_deferred(env, move->promise,
        Error(env, status == napi_cancelled ? "ECANCELED" : "EIO")));
  } else if (move->error) {
    Check(napi_reject_deferred(env, move->promise, Error(env, Code(move->error))));
  } else {
    napi_value value;
    // Only the host-internal native caller receives the resulting Trash path.
    // The JS service discards it; native qualification can verify recovery.
    if (move->operation == Operation::Trash)
      Check(napi_create_string_utf8(env, move->trashed.c_str(), move->trashed.size(), &value));
    else
      Check(napi_get_undefined(env, &value));
    Check(napi_resolve_deferred(env, move->promise, value));
  }
  Check(napi_delete_async_work(env, move->work));
  delete move;
  pending.fetch_sub(1);
}
napi_value Queue(napi_env env, napi_callback_info info, Operation operation) {
  size_t argc = 3;
  napi_value argv[3];
  Check(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
  auto* move = new Work;
  move->operation = operation;
  const bool trash = operation == Operation::Trash;
  if (argc != (trash ? 1U : 2U) || !Path(env, argv[0], move->source) ||
      (trash ? !TrashPath(move->source) : !Path(env, argv[1], move->destination))) {
    delete move;
    Check(napi_throw(env, Error(env, "EINVAL")));
    return nullptr;
  }
  if (pending.fetch_add(1) >= 32) {
    pending.fetch_sub(1);
    delete move;
    Check(napi_throw(env, Error(env, "EBUSY")));
    return nullptr;
  }
  napi_value promise, name;
  Check(napi_create_promise(env, &move->promise, &promise));
  Check(napi_create_string_utf8(env, "files-operation", NAPI_AUTO_LENGTH, &name));
  napi_status status = napi_create_async_work(env, nullptr, name, Execute, Complete, move, &move->work);
  if (status == napi_ok) status = napi_queue_async_work(env, move->work);
  if (status != napi_ok) {
    if (move->work) Check(napi_delete_async_work(env, move->work));
    Check(napi_reject_deferred(env, move->promise, Error(env, "EIO")));
    delete move;
    pending.fetch_sub(1);
  }
  return promise;
}
napi_value MoveNoReplace(napi_env env, napi_callback_info info) {
  return Queue(env, info, Operation::Move);
}
#if defined(__APPLE__) || defined(_WIN32)
napi_value Trash(napi_env env, napi_callback_info info) {
  return Queue(env, info, Operation::Trash);
}
#endif
napi_value Init(napi_env env, napi_value exports) {
  napi_value function;
  Check(napi_create_function(env, "moveNoReplace", NAPI_AUTO_LENGTH, MoveNoReplace, nullptr, &function));
  Check(napi_set_named_property(env, exports, "moveNoReplace", function));
#if defined(__APPLE__) || defined(_WIN32)
  Check(napi_create_function(env, "trash", NAPI_AUTO_LENGTH, Trash, nullptr, &function));
  Check(napi_set_named_property(env, exports, "trash", function));
#endif
  return exports;
}
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
