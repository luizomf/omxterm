// Windows no-replace move and Recycle Bin trash for the Files service.
#define NOMINMAX
#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <cerrno>
#include "files-windows.h"

namespace {
bool Wide(const std::string& value, std::wstring& result) {
  if (value.size() > 16384) return false;
  const int size = static_cast<int>(value.size());
  const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                                         value.data(), size, nullptr, 0);
  if (length <= 0) return false;
  result.resize(static_cast<size_t>(length));
  return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), size,
                             result.data(), length) == length;
}

int FromWindows(DWORD error) {
  switch (error) {
    case ERROR_ALREADY_EXISTS:
    case ERROR_FILE_EXISTS:
    case ERROR_DIR_NOT_EMPTY:
      return EEXIST;
    case ERROR_NOT_SAME_DEVICE:
      return EXDEV;
    case ERROR_ACCESS_DENIED:
    case ERROR_SHARING_VIOLATION:
    case ERROR_LOCK_VIOLATION:
    case ERROR_WRITE_PROTECT:
      return EACCES;
    case ERROR_FILE_NOT_FOUND:
    case ERROR_PATH_NOT_FOUND:
      return ENOENT;
    default:
      return EIO;
  }
}

// Refuses every delete the shell would not send to the Recycle Bin, such as
// items that are too large or on drives without one. Never a permanent delete.
class RecycleOnly final : public IFileOperationProgressSink {
 public:
  IFACEMETHODIMP QueryInterface(REFIID id, void** result) override {
    if (id == __uuidof(IUnknown) ||
        id == __uuidof(IFileOperationProgressSink)) {
      *result = static_cast<IFileOperationProgressSink*>(this);
      return S_OK;
    }
    *result = nullptr;
    return E_NOINTERFACE;
  }
  // Stack-owned for one synchronous PerformOperations call.
  IFACEMETHODIMP_(ULONG) AddRef() override { return 1; }
  IFACEMETHODIMP_(ULONG) Release() override { return 1; }
  IFACEMETHODIMP PreDeleteItem(DWORD flags, IShellItem*) override {
    if (flags & TSF_DELETE_RECYCLE_IF_POSSIBLE) return S_OK;
    refused = true;
    return E_ABORT;
  }
  // Set when the shell would have deleted permanently; the operation then
  // fails with E_ABORT and leaves the item untouched.
  bool refused = false;
  IFACEMETHODIMP StartOperations() override { return S_OK; }
  IFACEMETHODIMP FinishOperations(HRESULT) override { return S_OK; }
  IFACEMETHODIMP PreRenameItem(DWORD, IShellItem*, LPCWSTR) override {
    return S_OK;
  }
  IFACEMETHODIMP PostRenameItem(DWORD, IShellItem*, LPCWSTR, HRESULT,
                                IShellItem*) override {
    return S_OK;
  }
  IFACEMETHODIMP PreMoveItem(DWORD, IShellItem*, IShellItem*,
                             LPCWSTR) override {
    return S_OK;
  }
  IFACEMETHODIMP PostMoveItem(DWORD, IShellItem*, IShellItem*, LPCWSTR,
                              HRESULT, IShellItem*) override {
    return S_OK;
  }
  IFACEMETHODIMP PreCopyItem(DWORD, IShellItem*, IShellItem*,
                             LPCWSTR) override {
    return S_OK;
  }
  IFACEMETHODIMP PostCopyItem(DWORD, IShellItem*, IShellItem*, LPCWSTR,
                              HRESULT, IShellItem*) override {
    return S_OK;
  }
  IFACEMETHODIMP PostDeleteItem(DWORD, IShellItem*, HRESULT,
                                IShellItem*) override {
    return S_OK;
  }
  IFACEMETHODIMP PreNewItem(DWORD, IShellItem*, LPCWSTR) override {
    return S_OK;
  }
  IFACEMETHODIMP PostNewItem(DWORD, IShellItem*, LPCWSTR, LPCWSTR, DWORD,
                             HRESULT, IShellItem*) override {
    return S_OK;
  }
  IFACEMETHODIMP UpdateProgress(UINT, UINT) override { return S_OK; }
  IFACEMETHODIMP ResetTimer() override { return S_OK; }
  IFACEMETHODIMP PauseTimer() override { return S_OK; }
  IFACEMETHODIMP ResumeTimer() override { return S_OK; }
};

int Recycle(const std::wstring& path) {
  IShellItem* item = nullptr;
  HRESULT result =
      SHCreateItemFromParsingName(path.c_str(), nullptr, IID_PPV_ARGS(&item));
  if (FAILED(result))
    return result == HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND) ||
                   result == HRESULT_FROM_WIN32(ERROR_PATH_NOT_FOUND)
               ? ENOENT
               : EIO;
  IFileOperation* operation = nullptr;
  result = CoCreateInstance(__uuidof(FileOperation), nullptr, CLSCTX_ALL,
                            IID_PPV_ARGS(&operation));
  RecycleOnly sink;
  if (SUCCEEDED(result))
    result = operation->SetOperationFlags(
        FOF_NO_UI | FOF_ALLOWUNDO | FOFX_EARLYFAILURE | FOFX_RECYCLEONDELETE);
  if (SUCCEEDED(result)) result = operation->DeleteItem(item, &sink);
  BOOL aborted = FALSE;
  if (SUCCEEDED(result)) result = operation->PerformOperations();
  // Never answer success for an operation the shell reports as aborted.
  if (operation && FAILED(operation->GetAnyOperationsAborted(&aborted)))
    aborted = TRUE;
  if (operation) operation->Release();
  item->Release();
  if (sink.refused) return FILES_NOT_RECYCLED;
  return FAILED(result) || aborted ? EIO : 0;
}
}  // namespace

// Long-path form: no 260-character limit and no further name rewriting. The
// caller already refused every part Windows would otherwise normalize.
bool LongPath(const std::string& value, std::wstring& result) {
  if (!Wide(value, result)) return false;
  for (auto& unit : result)
    if (unit == L'/') unit = L'\\';
  result.insert(0, L"\\\\?\\");
  return true;
}

int MoveWindows(const std::string& source, const std::string& destination) {
  std::wstring from, to;
  if (!LongPath(source, from) || !LongPath(destination, to)) return EINVAL;
  // No MOVEFILE_REPLACE_EXISTING or MOVEFILE_COPY_ALLOWED: the filesystem
  // refuses an existing destination, and another volume stays EXDEV.
  if (!MoveFileExW(from.c_str(), to.c_str(), 0))
    return FromWindows(GetLastError());
  return 0;
}

int TrashWindows(const std::string& source) {
  std::wstring path;
  if (!Wide(source, path)) return EINVAL;
  for (auto& unit : path)
    if (unit == L'/') unit = L'\\';
  const HRESULT initialized =
      CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
  if (FAILED(initialized)) return EIO;
  const int error = Recycle(path);
  CoUninitialize();
  return error;
}
