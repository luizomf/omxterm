// omxterm-ctl.exe: the agent client's launcher on Windows (ADR 0052). It runs
// OMXTerm's own executable in Node mode with omxterm-ctl.cjs and the caller's
// arguments exactly as the caller wrote them. A console program, unlike the GUI
// OMXTerm.exe, so shells wait for it and get its output and exit code; and an
// executable, unlike a .cmd, so no cmd.exe reads the arguments again.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#define MAX_COMMAND_LINE 32767

static void fail(const char *message) {
  DWORD written;
  HANDLE error = GetStdHandle(STD_ERROR_HANDLE);
  if (error != NULL && error != INVALID_HANDLE_VALUE)
    WriteFile(error, message, lstrlenA(message), &written, NULL);
  ExitProcess(1);
}

// The child's stdio is the launcher's own handles, so the console's Ctrl+C,
// Ctrl+Break and close never reach it. The launcher ends instead, as the
// console would have ended the child; that closes the job, which ends the
// child. Before the child exists, it never starts.
static BOOL WINAPI on_console_event(DWORD event) {
  (void)event;
  TerminateProcess(GetCurrentProcess(), (UINT)STATUS_CONTROL_C_EXIT);
  return TRUE;
}

// The arguments after the program name, untouched. The program name ends at
// the next quote when it starts with one, else at the first blank. The rest
// is the child's to parse, so it reads it as it would if OMXTerm.exe had been
// run directly.
static const wchar_t *arguments(const wchar_t *line) {
  if (*line == L'"') {
    for (line += 1; *line != L'\0' && *line != L'"'; line += 1) {
    }
    if (*line == L'"') line += 1;
  } else {
    while (*line != L'\0' && *line != L' ' && *line != L'\t') line += 1;
  }
  while (*line == L' ' || *line == L'\t') line += 1;
  return line;
}

static size_t length(const wchar_t *text) { return (size_t)lstrlenW(text); }

static void append(wchar_t *buffer, size_t *used, const wchar_t *text) {
  size_t size = length(text);
  if (*used + size >= MAX_COMMAND_LINE) fail("omxterm-ctl: command line too long\n");
  CopyMemory(buffer + *used, text, size * sizeof(wchar_t));
  *used += size;
  buffer[*used] = L'\0';
}

// The folder two levels above `folder`, which ends in a backslash, cut by
// hand: Windows doesn't collapse `..` after a \\?\ prefix, which callers such
// as Rust's fs::canonicalize put on OMXTERM_CTL.
static void package_folder(const wchar_t *folder, wchar_t *package) {
  size_t used = 0;
  append(package, &used, folder);
  for (int level = 0; level < 2; level += 1) {
    used -= 1;
    while (used > 0 && package[used - 1] != L'\\') used -= 1;
    if (used == 0) fail("omxterm-ctl: can't find OMXTerm\n");
  }
  package[used] = L'\0';
}

// An unpackaged build names its Electron binary in `runtime`, one UTF-8 line,
// beside the launcher; a package runs the OMXTerm.exe two folders up.
static void runtime_path(const wchar_t *folder, wchar_t *runtime) {
  static wchar_t file[MAX_COMMAND_LINE];
  char bytes[8192];
  DWORD read = 0;
  size_t used = 0;
  append(file, &used, folder);
  append(file, &used, L"runtime");
  HANDLE handle = CreateFileW(file, GENERIC_READ, FILE_SHARE_READ, NULL,
                              OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (handle == INVALID_HANDLE_VALUE) {
    package_folder(folder, runtime);
    used = length(runtime);
    append(runtime, &used, L"OMXTerm.exe");
    return;
  }
  BOOL ok = ReadFile(handle, bytes, sizeof bytes - 1, &read, NULL);
  CloseHandle(handle);
  if (!ok) fail("omxterm-ctl: can't read its runtime file\n");
  DWORD end = 0;
  while (end < read && bytes[end] != '\r' && bytes[end] != '\n') end += 1;
  int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes, (int)end,
                                 runtime, MAX_COMMAND_LINE - 1);
  if (size <= 0) fail("omxterm-ctl: can't read its runtime file\n");
  runtime[size] = L'\0';
}

// Our own handles, inheritable, so the child writes where we would.
static HANDLE inherited(DWORD which) {
  HANDLE handle = GetStdHandle(which);
  if (handle != NULL && handle != INVALID_HANDLE_VALUE)
    SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
  return handle;
}

int wmain(void) {
  static wchar_t folder[MAX_COMMAND_LINE];
  static wchar_t runtime[MAX_COMMAND_LINE];
  static wchar_t line[MAX_COMMAND_LINE];
  DWORD size = GetModuleFileNameW(NULL, folder, MAX_COMMAND_LINE);
  if (size == 0 || size >= MAX_COMMAND_LINE)
    fail("omxterm-ctl: can't find its own folder\n");
  wchar_t *slash = folder + size;
  while (slash > folder && slash[-1] != L'\\') slash -= 1;
  // Without a folder, runtime and OMXTerm.exe would be read from the cwd.
  if (slash == folder) fail("omxterm-ctl: can't find its own folder\n");
  *slash = L'\0';
  runtime_path(folder, runtime);

  size_t used = 0;
  append(line, &used, L"\"");
  append(line, &used, runtime);
  append(line, &used, L"\" \"");
  append(line, &used, folder);
  append(line, &used, L"omxterm-ctl.cjs\"");
  const wchar_t *rest = arguments(GetCommandLineW());
  if (*rest != L'\0') {
    append(line, &used, L" ");
    append(line, &used, rest);
  }

  // Only the child runs as Node; the caller's environment is its own.
  SetEnvironmentVariableW(L"ELECTRON_RUN_AS_NODE", L"1");

  // The child starts inside a kill-on-close job, so a caller that kills the
  // launcher at any point, as agent hosts do on a timeout, ends the client
  // with it. The client never runs outside one.
  HANDLE job = CreateJobObjectW(NULL, NULL);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
  ZeroMemory(&limits, sizeof limits);
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (job == NULL ||
      !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits,
                               sizeof limits))
    fail("omxterm-ctl: can't start OMXTerm\n");
  SetConsoleCtrlHandler(on_console_event, TRUE);

  SIZE_T bytes = 0;
  InitializeProcThreadAttributeList(NULL, 1, 0, &bytes);
  LPPROC_THREAD_ATTRIBUTE_LIST attributes =
      (LPPROC_THREAD_ATTRIBUTE_LIST)HeapAlloc(GetProcessHeap(), 0, bytes);
  if (attributes == NULL ||
      !InitializeProcThreadAttributeList(attributes, 1, 0, &bytes) ||
      !UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
                                 &job, sizeof job, NULL, NULL))
    fail("omxterm-ctl: can't start OMXTerm\n");

  STARTUPINFOEXW startup;
  PROCESS_INFORMATION process;
  ZeroMemory(&startup, sizeof startup);
  startup.StartupInfo.cb = sizeof startup;
  // No busy cursor for a GUI-subsystem child that never shows a window.
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES | STARTF_FORCEOFFFEEDBACK;
  startup.StartupInfo.hStdInput = inherited(STD_INPUT_HANDLE);
  startup.StartupInfo.hStdOutput = inherited(STD_OUTPUT_HANDLE);
  startup.StartupInfo.hStdError = inherited(STD_ERROR_HANDLE);
  startup.lpAttributeList = attributes;
  if (!CreateProcessW(runtime, line, NULL, NULL, TRUE,
                      EXTENDED_STARTUPINFO_PRESENT, NULL, NULL,
                      &startup.StartupInfo, &process))
    fail("omxterm-ctl: can't start OMXTerm\n");
  CloseHandle(process.hThread);

  DWORD code = 1;
  WaitForSingleObject(process.hProcess, INFINITE);
  GetExitCodeProcess(process.hProcess, &code);
  return (int)code;
}
