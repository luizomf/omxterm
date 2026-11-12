# Linux x64 qualification plan (#706)

This plan accompanies the bounded results in
[the qualification report](linux-x64-qualification-results.md) for
[#706](https://github.com/luizomf/omxterm/issues/706). It adds no release gate or
product behavior. ADR 0036's build-only delivery policy remains unchanged.

## Artifact and environment

Start with the published `OMXTerm-0.22.0-x64.AppImage` and matching helper and
checksum files from v0.22.0. Verify their published checksums before execution;
record exact artifact hashes, source provenance where available, OS, architecture,
desktop/session, display and relevant runtime versions. Keep observations of this
release separate from development checks on any newer source revision.

## Bounded tasks

1. Inspect existing installation paths and available desktop/input capabilities
   without changing personal configuration. Preserve any existing installation.
2. On an appropriate idle desktop, launch the exact verified AppImage, exercise
   interactive shell input with synthetic content and observe corresponding
   output, resize and normal shutdown. Record the actual input method; synthetic
   window events do not establish physical HID qualification.
3. After explicit consent to the concrete per-user installation changes, run the
   matching helper, launch the installed desktop entry and exercise the installed
   application. Run the helper's actual uninstall command and verify that user
   configuration remains unchanged. Removing a temporary verifier home is not
   uninstall evidence. Keep isolated-home and ordinary-user evidence distinct.
4. If the environment supports them, run development-shell and full portable
   checks on a separately identified source revision. Inspect the architecture of
   the repository's packaging commands before selecting any Linux package check;
   do not silently substitute ARM64 packaging for x64 verification.
5. Report each observed result, first failure, unperformed check and cleanup
   outcome. Preserve raw failures. Use a new bounded experiment only when it
   distinguishes a specific hypothesis, rather than retrying unchanged until green.

## Acceptance and limits

Each claimed pass must identify its exact inputs and observable result. Missing
native input admission, desktop access, installation consent or runtime support
must remain an explicit limitation. Do not change deadlines, bypass prerequisites,
add compatibility flags without recording them, or infer broad distro/GPU support.
Run graphical suites serially; clean up only owned processes and installed files.

Qualification results, performed helper changes and remaining failures are
recorded in the companion report; this plan alone is not evidence of a pass.
Any useful source correction needs its own reproducible regression and reviewable
scope.
