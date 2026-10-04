# Keep OMXTerm and OMXTerm Web independent

OMXTerm and OMXTerm Web are separate products and repositories with different
runtime and security forces. OMXTerm may selectively port proven interface code,
tests, and design decisions from OMXTerm Web, but neither project will depend on
a shared terminal package until repeated, stable common behavior demonstrates a
real shared boundary; intentional local duplication is preferable to premature
cross-product coupling.

The canonical repositories are `luizomf/omxterm` for the desktop terminal and
`luizomf/omxterm-web` for the browser broker. Earlier repository names are not
current identities; Git retains the bootstrap rename history.
