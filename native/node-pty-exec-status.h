// OMXTerm's pinned node-pty exec-status channel. Never carries terminal data.
#ifndef OMXTERM_PTY_EXEC_STATUS_H
#define OMXTERM_PTY_EXEC_STATUS_H

#include <errno.h>
#include <fcntl.h>
#include <unistd.h>

// Both ends stay above stdio and close on exec. macOS explicitly inherits the
// writer into node-pty's existing helper; that helper restores FD_CLOEXEC.
class PtyExecStatus {
 public:
  int reader = -1;
  int writer = -1;

  bool open() {
    int descriptors[2];
#if defined(__linux__)
    if (pipe2(descriptors, O_CLOEXEC) == -1) return false;
#else
    if (pipe(descriptors) == -1) return false;
#endif
    reader = fcntl(descriptors[0], F_DUPFD_CLOEXEC, 3);
    writer = fcntl(descriptors[1], F_DUPFD_CLOEXEC, 3);
    close(descriptors[0]);
    close(descriptors[1]);
    return reader != -1 && writer != -1;
  }

  void closeWriter() {
    close(writer);
    writer = -1;
  }

  int releaseReader() {
    int descriptor = reader;
    reader = -1;
    return descriptor;
  }

  ~PtyExecStatus() {
    if (reader != -1) close(reader);
    if (writer != -1) close(writer);
  }
};

// Only called in the child after a failed setup or exec. No stderr/payload or
// executable/argument/path contents become the startup status.
[[noreturn]] inline void pty_exec_failed(int writer) {
  const char failed = 1;
  ssize_t result;
  do { result = write(writer, &failed, 1); } while (result == -1 && errno == EINTR);
  _exit(1);
}

// Called after native waitpid completion, never while the child can still
// report status. EOF means exec closed the descriptor; a byte or a channel
// error means startup failed. Signals retain their independent exit metadata.
inline bool pty_exec_failure(int reader) {
  char status;
  ssize_t result;
  do { result = read(reader, &status, 1); } while (result == -1 && errno == EINTR);
  close(reader);
  return result != 0;
}

#endif
