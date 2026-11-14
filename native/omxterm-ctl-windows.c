// omxterm-ctl.exe: the agent client's launcher on Windows (ADR 0052). It runs
// OMXTerm's own executable in Node mode with omxterm-ctl.cjs and the caller's
// arguments exactly as the caller wrote them. A console program, unlike the GUI
// OMXTerm.exe, so shells wait for it and get its output and exit code; and an
// executable, unlike a .cmd, so no cmd.exe reads the arguments again.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#define MAX_COMMAND_LINE 32767

static HANDLE child;

static void fail(const char *message) {
  DWORD written;
  HANDLE error = GetStdHandle(STD_ERROR_HANDLE);
  if (error != NULL && error != INVALID_HANDLE_VALUE)
    WriteFile(error, message, lstrlenA(message), &written, NULL);
  ExitProcess(1);
}

// The child's stdio is the launcher's own handles, so the console's Ctrl+C,
// Ctrl+Break and close never reach it: end it as the console would have, and
// let wmain return its exit code.
static BOOL WINAPI on_console_event(DWORD event) {
  (void)event;
  if (child != NULL) TerminateProcess(child, (UINT)STATUS_CONTROL_C_EXIT);
  return TRUE;
}

// The arguments after the program name, untouched. The program name ends at
// the next quote when it starts with one, else at the first blank, as both
// CommandLineToArgvW and the C runtime read it.
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
    used = 0;
    append(runtime, &used, folder);
    append(runtime, &used, L"..\\..\\OMXTerm.exe");
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

  // A caller that kills the launcher, as agent hosts do on a timeout, ends
  // the client with it.
  HANDLE job = CreateJobObjectW(NULL, NULL);
  if (job != NULL) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
    ZeroMemory(&limits, sizeof limits);
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits,
                            sizeof limits);
  }

  STARTUPINFOW startup;
  PROCESS_INFORMATION process;
  ZeroMemory(&startup, sizeof startup);
  startup.cb = sizeof startup;
  // No busy cursor for a GUI-subsystem child that never shows a window.
  startup.dwFlags = STARTF_USESTDHANDLES | STARTF_FORCEOFFFEEDBACK;
  startup.hStdInput = inherited(STD_INPUT_HANDLE);
  startup.hStdOutput = inherited(STD_OUTPUT_HANDLE);
  startup.hStdError = inherited(STD_ERROR_HANDLE);
  if (!CreateProcessW(runtime, line, NULL, NULL, TRUE, CREATE_SUSPENDED, NULL,
                      NULL, &startup, &process))
    fail("omxterm-ctl: can't start OMXTerm\n");
  child = process.hProcess;
  // Best effort: a job that refuses nesting still runs the client.
  if (job != NULL) AssignProcessToJobObject(job, process.hProcess);
  SetConsoleCtrlHandler(on_console_event, TRUE);
  ResumeThread(process.hThread);
  CloseHandle(process.hThread);

  DWORD code = 1;
  WaitForSingleObject(process.hProcess, INFINITE);
  GetExitCodeProcess(process.hProcess, &code);
  return (int)code;
}
