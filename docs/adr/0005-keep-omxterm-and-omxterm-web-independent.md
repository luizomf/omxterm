# Keep OMXTerm and OMXTerm Web independent

OMXTerm and OMXTerm Web are separate products and repositories with different
runtimes and security requirements. OMXTerm may selectively port proven interface
code, tests and design decisions from OMXTerm Web. They have no shared terminal
package: keeping transport and privilege policies separate lets each product
evolve independently.

The canonical repositories are `luizomf/omxterm` for the desktop terminal and
`luizomf/omxterm-web` for the browser broker.
