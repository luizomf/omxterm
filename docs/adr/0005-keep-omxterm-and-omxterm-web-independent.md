# Keep OMXTerm and OMXTerm Web independent

OMXTerm and OMXTerm Web are separate products and repositories with different
runtime and security forces. OMXTerm may selectively port proven interface code,
tests, and design decisions from OMXTerm Web, but neither project will depend on
a shared terminal package until repeated, stable common behavior demonstrates a
real shared boundary; intentional local duplication is preferable to premature
cross-product coupling.

The canonical repository names will match the product names. The existing web
broker currently named `omxterm` locally and on GitHub must first become
`omxterm-web`; the desktop repository currently named `omxterm-local` must then
become `omxterm`. This order frees the canonical desktop name without collision.
The transition must update both GitHub repositories, local clone directories,
Git remotes, and repository-owned references, while checking deployment and
automation references in OMXTerm Web before changing them. The current names are
temporary bootstrap identities, not a reason to block specification work.
