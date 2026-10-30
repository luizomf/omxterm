// Bounded Node-API async no-replace moves. No check-then-rename fallback.
#include <node_api.h>
#include <atomic>
#include <cerrno>
#include <string>
#if defined(__linux__) || defined(__APPLE__)
#include <fcntl.h>
#endif
#ifdef __APPLE__
#include <stdio.h>
#endif
#ifdef __linux__
#include <sys/syscall.h>
#include <unistd.h>
#endif

namespace {
std::atomic<unsigned> pending{0};
struct Move {
  napi_async_work work = nullptr;
  napi_deferred promise = nullptr;
  std::string source, destination;
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
bool Path(napi_env env, napi_value value, std::string& result) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok ||
      !length || length > 16384) return false;
  result.resize(length + 1);
  if (napi_get_value_string_utf8(env, value, result.data(), result.size(), &length) != napi_ok)
    return false;
  result.resize(length);
  return result.find('\0') == std::string::npos && result[0] == '/';
}
void Execute(napi_env, void* data) {
  auto* move = static_cast<Move*>(data);
#ifdef __linux__
  // RENAME_NOREPLACE=1. The kernel linearizes destination exclusion, including
  // dangling symlinks/directories and competing writers. EXDEV stays refusal.
  if (syscall(SYS_renameat2, AT_FDCWD, move->source.c_str(), AT_FDCWD,
              move->destination.c_str(), 1U) < 0) move->error = errno;
#elif defined(__APPLE__)
  // RENAME_EXCL excludes existing entries atomically; never retry or fall back.
  if (renameatx_np(AT_FDCWD, move->source.c_str(), AT_FDCWD,
                  move->destination.c_str(), RENAME_EXCL) < 0) move->error = errno;
#else
  move->error = ENOSYS;
#endif
}
const char* Code(int error) {
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
  auto* move = static_cast<Move*>(data);
  if (status == napi_cancelled) {
    Check(napi_reject_deferred(env, move->promise, Error(env, "ECANCELED")));
  } else if (move->error) {
    Check(napi_reject_deferred(env, move->promise, Error(env, Code(move->error))));
  } else {
    napi_value value;
    Check(napi_get_undefined(env, &value));
    Check(napi_resolve_deferred(env, move->promise, value));
  }
  Check(napi_delete_async_work(env, move->work));
  delete move;
  pending.fetch_sub(1);
}
napi_value MoveNoReplace(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  Check(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr));
  auto* move = new Move;
  if (argc != 2 || !Path(env, argv[0], move->source) || !Path(env, argv[1], move->destination)) {
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
  Check(napi_create_string_utf8(env, "files-move", NAPI_AUTO_LENGTH, &name));
  Check(napi_create_async_work(env, nullptr, name, Execute, Complete, move, &move->work));
  Check(napi_queue_async_work(env, move->work));
  return promise;
}
napi_value Init(napi_env env, napi_value exports) {
  napi_value function;
  Check(napi_create_function(env, "moveNoReplace", NAPI_AUTO_LENGTH, MoveNoReplace, nullptr, &function));
  Check(napi_set_named_property(env, exports, "moveNoReplace", function));
  return exports;
}
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
