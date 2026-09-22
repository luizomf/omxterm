# Use Electron for the desktop runtime

OMXTerm uses Electron because TypeScript and the web platform support fast
iteration, flexible interface design, direct integration with local Node.js
capabilities, and selective reuse of experience from OMXTerm Web. Electron costs
more in memory, application size, and startup time than a lower-level native
implementation. The project accepts those costs while continuing to require
responsive interactive terminal behavior.
