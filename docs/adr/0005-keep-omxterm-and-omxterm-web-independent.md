# Keep OMXTerm and OMXTerm Web independent

OMXTerm and OMXTerm Web are separate products and repositories with different
runtime and security forces. OMXTerm may selectively port proven interface code,
tests, and design decisions from OMXTerm Web, but neither project will depend on
a shared terminal package until repeated, stable common behavior demonstrates a
real shared boundary; intentional local duplication is preferable to premature
cross-product coupling.

The canonical repository names match the product names: the web broker is
`luizomf/omxterm-web`, and the desktop terminal is `luizomf/omxterm`. During
bootstrap, the web repository occupied `luizomf/omxterm` while the desktop
repository used `luizomf/omxterm-local`, so the web repository had to move
first to free the canonical desktop name without collision. The transition
updated both GitHub repositories, local clone directories, Git remotes, and
repository-owned references after checking deployment and automation references
in OMXTerm Web. Those previous names remain part of the ordered decision
history, not current repository identities.
