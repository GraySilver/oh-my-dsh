# Agent Note: Review-gated upstream sync and product release

Status: implemented

English | [中文](2026-08-15-fork-upstream-and-product-release.zh.md)

## Problem

An enhanced fork must consume upstream changes without letting a scheduled merge publish unreviewed product bytes. Source commits and official npm artifacts also advance on different clocks: merging a commit does not prove that an installable upstream engine containing it exists. The existing dsh release family cannot own independently versioned `@graysilver` packages.

## Decision

`origin` identifies `GraySilver/oh-my-dsh`; `upstream` identifies `deepseek-ai/deepseek-harness`. `.github/workflows/upstream-sync.yml` runs weekly and on demand. It merges `upstream/master` into the stable `automation/upstream-sync` branch, records the upstream commit, aligns both official runtime dependencies with the current npm version, updates the lockfile, pushes the branch, and creates or updates one Draft pull request. Compatibility checks run after the Draft PR exists, so a failure remains visible and reviewable. The workflow never publishes and never pushes to `main`.

The existing release framework gains the `oh-my-dsh` family. Its exact members are the wrapper and the two product browser packages; all share one product version but do not change the upstream workspace-root version. The family uses `oh-my-dsh-v<version>`, applies the ordinary no-source tarball policy, orders the browser packages before the wrapper by runtime dependencies, and verifies the installed wrapper with plain Node.

`.github/workflows/release-oh-my-dsh.yml` builds and packs without registry credentials. A product tag or explicit publish dispatch promotes the same artifact through the protected `npm-publish` environment. The publish job does not rebuild. Registry integrity comparison makes retrying the artifact idempotent, using the release framework's existing rules.

## Alternatives considered

**Automatically publish after each successful upstream merge.** Rejected because upstream source compatibility, official npm availability, and product UX compatibility are separate facts. Human review remains the boundary before a product version and tag.

**Make the product packages members of the dsh family.** Rejected because that would force the fork's product version to equal every upstream package and the workspace root, and an upstream release would implicitly republish the product.

**Copy selected upstream commits instead of merging the upstream branch.** Rejected because cherry-picking turns the fork into an unrecorded patch queue and makes omissions hard to distinguish from intentional product changes.

**Publish directly from the source checkout.** Rejected because a rebuilt publish can differ from the artifact that passed packed-install verification. The artifact is the release boundary.

## Consequences

Every upstream adoption has one visible compatibility PR, an exact source commit, an exact official engine package, and check results. Product releases remain independent and review-gated. Force-updating one automation branch keeps the PR inventory bounded, at the cost that reviewers must use the PR history or upstream commit field when comparing successive sync attempts.

Merge conflicts stop the workflow before a branch update; they require a manual compatibility branch because committing unresolved conflict markers would create a misleading Draft PR. Missing GitHub or npm permissions likewise fail loudly rather than skipping synchronization or publication.
