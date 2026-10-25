"""Signal only retained Linux launch identities, using pidfds against PID reuse."""
import hashlib
import json
import os
import select
import signal
import sys


def identity(pid):
    with open(f"/proc/{pid}/stat", encoding="utf-8") as source:
        fields = source.read().rsplit(") ", 1)[1].split()
    return {"pid": pid, "parent": int(fields[1]), "group": int(fields[2]),
            "start": fields[19]}


request = json.load(sys.stdin)
for target in request["targets"]:
    try:
        fd = os.pidfd_open(target["pid"])
    except ProcessLookupError:
        continue
    try:
        poll = select.poll()
        poll.register(fd, select.POLLIN)
        if poll.poll(0):
            continue
        actual = identity(target["pid"])
        if actual != {key: target[key] for key in actual}:
            raise RuntimeError("Linux launch identity changed; refusing signal")
        if "digest" in target:
            with open(f'/proc/{target["pid"]}/exe', "rb") as executable:
                hasher = hashlib.sha256()
                for chunk in iter(lambda: executable.read(1024 * 1024), b""):
                    hasher.update(chunk)
                digest = hasher.hexdigest()
            if digest != target["digest"]:
                raise RuntimeError("Linux main executable changed; refusing signal")
        # The fd was acquired BEFORE validation. Exit/reuse during validation
        # cannot redirect this signal to a replacement process.
        signal.pidfd_send_signal(fd, getattr(signal, request["signal"]))
    except (FileNotFoundError, ProcessLookupError):
        pass
    finally:
        os.close(fd)
