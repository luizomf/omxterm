# Opt-in disposable Linux desktop fixture. This temporary kernel keyboard goes
# through the compositor and active layout; Electron modifiers are not injected.
import fcntl
import os
import struct
import sys
import time

fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
held = set()
created = False


def event(key, down):
    os.write(fd, struct.pack('llHHI', 0, 0, 1, key, down))
    os.write(fd, struct.pack('llHHI', 0, 0, 0, 0, 0))
    if down:
        held.add(key)
    else:
        held.discard(key)
    time.sleep(.05)


try:
    fcntl.ioctl(fd, 0x40045564, 1)  # UI_SET_EVBIT: EV_KEY
    for key in [56, 100, 64, 36, 18, 40, 57]:
        fcntl.ioctl(fd, 0x40045565, key)  # UI_SET_KEYBIT
    fcntl.ioctl(fd, 0x405c5503, struct.pack(
        'HHHH80sI', 3, 1, 1, 1, b'OMXTerm-AltGr-fixture', 0))
    fcntl.ioctl(fd, 0x5501)  # UI_DEV_CREATE
    created = True
    time.sleep(.3)
    for pair in sys.argv[1].split(','):
        key, down = map(int, pair.split(':'))
        event(key, down)
finally:
    for key in list(held):
        event(key, 0)
    if created:
        fcntl.ioctl(fd, 0x5502)  # UI_DEV_DESTROY
    os.close(fd)
