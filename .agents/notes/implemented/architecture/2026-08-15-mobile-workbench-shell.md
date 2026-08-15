# Agent Note: the mobile workbench uses overlays instead of compressed columns

Status: implemented

English | [中文](2026-08-15-mobile-workbench-shell.zh.md)

## Problem

The workbench shell was a three-column desktop grid at every viewport width. Its narrow state collapsed the sidebar to a 56px rail, but opening that rail restored a 280px column inside the same grid. At a 390px viewport the conversation then retained roughly 110px. The details column followed the desktop concession solver and collapsed to zero instead of presenting its content. Both outcomes preserved the desktop geometry while making the requested surface unusable.

The conversation and settings interiors had the same mismatch at a smaller scale. The new-Session hero placed the workspace, task launcher, and agent-preset controls on one row; the composer kept both tool groups on one row; and the settings dialog retained a 188px vertical navigation rail. Those controls competed for width and overlapped even when the center column was otherwise available.

## Decision

At frame widths up to and including 640px, `AppFrame` keeps the existing sidebar, conversation, details, and overlay slot occupants mounted but removes both side columns from grid sizing. The collapsed sidebar is presented as a full-width 56px top toolbar. Expanding it presents the same sidebar subtree as a masked drawer, capped at 320px with a 48px page strip left visible. Selecting another Session, clicking the mask, or pressing Escape dismisses the drawer. A frame-owned details surface opens over the full frame and takes Escape before the drawer; an accessible modal keeps ownership of its own Escape lifecycle.

The same breakpoint changes only presentation inside the existing components. The hero gives workspace selection and product controls separate rows, the composer gives its left and right tool groups separate rows, and settings uses its existing title, actions, navigation, and section occupants as a title row, horizontal scrollable category row, and content row. Provider editors and agent-preset cards may wrap or reduce to one column. Above 640px, the original grid tracks, sidebar rail, details resizing, hero rows, composer row, and settings rail remain the active cascade.

## Alternatives considered

**Continue shrinking the desktop columns.** This would preserve one geometry algorithm, but a 280px navigation column and a useful conversation cannot coexist on a phone. It also leaves details with no usable width. Rejected because the problem is simultaneous presentation, not a missing minimum-width constant.

**Build separate mobile component trees.** Dedicated mobile sidebar, composer, and settings implementations could be styled independently. Rejected because they would duplicate Session selection, local dialog state, slot registration, focus management, and configuration writes. The existing occupants already own the correct behavior; only their narrow-screen geometry needed to change.

**Wrap only the visibly overlapping controls.** Local wrapping would improve the hero and composer while leaving the open sidebar and details behavior broken. Rejected because it would treat symptoms below the frame without closing the mobile navigation and inspection paths.

## Consequences

The mobile shell has one primary surface at a time: conversation, navigation drawer, full-frame details, or a modal. No backend API, configuration shape, CLI, slot key, or Session identity model changes. `SidebarOwnerProps` gains the frame-derived `mobile` presentation fact and reports the drawer width so the existing sidebar can render the correct posture.

The 640px boundary now exists in both the frame's TypeScript presentation decision and component media queries. Behavioral tests pin the zero-width mobile grid tracks, drawer dismissal, Session-change dismissal, modal Escape ownership, full-frame details, and mobile new-Session behavior. Browser validation at mobile and desktop widths remains necessary because jsdom cannot prove rendered rectangles or detect visual overlap.
