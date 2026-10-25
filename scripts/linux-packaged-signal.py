"""Signal retained Linux launch identities, using pidfds against PID reuse."""
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
if request.get("check"):
    # Prove both APIs and kernel permission before launching any workload.
    fd = os.pidfd_open(os.getpid())
    try:
        signal.pidfd_send_signal(fd, 0)
    finally:
        os.close(fd)
    print("linux-pidfd-ready")
    sys.exit(0)

failures = []
for target in request["targets"]:
    fd = None
    try:
        fd = os.pidfd_open(target["pid"])
        poll = select.poll()
        poll.register(fd, select.POLLIN)
        if poll.poll(0):
            continue
        actual = identity(target["pid"])
        # Ancestry is authority for selecting/first-signaling main. Recovery
        # already owns these immutable identities; parent/group can change as
        # earlier targets exit. Reparenting must not strand later targets.
        keys = ("pid", "start") if request.get("recovery") else actual.keys()
        if any(actual[key] != target[key] for key in keys):
            raise RuntimeError("Linux launch identity changed; refusing signal")
        if "digest" in target and not request.get("recovery"):
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
    except Exception as cause:
        failures.append(f'target {target["pid"]}: {cause}')
    finally:
        if fd is not None:
            os.close(fd)
if failures:
    sys.exit("; ".join(failures))
