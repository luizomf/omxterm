# Isolate the renderer from local capabilities

OMXTerm will keep React and the Terminal Surface in an isolated renderer without
unrestricted Node.js access. The Electron main process owns PTYs, filesystem
access, configuration, logs, and window lifecycle; a minimal preload bridge
exposes only the typed, validated terminal operations and events the renderer
actually needs. This boundary protects the machine and prevents interface code
from depending directly on infrastructure details without adding user-facing
security ceremony.
