# Keep OMXTerm and OMXTerm Web independent

OMXTerm and OMXTerm Web are separate products and repositories with different
runtime and security forces. OMXTerm may selectively port proven interface code,
tests and design decisions from OMXTerm Web. They have no shared terminal
package: local duplication keeps different transport and privilege policies
independent without premature cross-product coupling.

The canonical repositories are `luizomf/omxterm` for the desktop terminal and
`luizomf/omxterm-web` for the browser broker.
