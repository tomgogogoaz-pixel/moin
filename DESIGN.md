# Moin Design System

## Source of truth

This file is the durable UI and interaction contract for Moin. It is based on the implemented responsive application in `public/app.js` and `public/styles.css`, the product documents under `docs/`, and the approved warm interior visual references supplied during development. Update this file when an interaction or visual rule changes materially.

## Brand

Moin helps people turn photos of their current space and preferred materials into a transparent, realistic interior record. The experience should feel warm, restrained, trustworthy, and editorial rather than technical or game-like.

## Product goals

- Preserve the source room's geometry while making material changes easy to understand.
- Let non-experts select surfaces, objects, and material samples without learning professional image-editing software.
- Keep estimates, reports, and project history visually consistent and readable.

## Personas and jobs

- Home residents testing materials before renovation: select a wall, floor, furniture item, or fixture and preview only that target.
- DIY planners comparing options: save versions and review a realistic estimate.
- Mobile users: complete uploads and selections with touch targets and a single-column workflow.

## Information architecture

- Signed out: Landing, Login.
- Signed in: Home, My Project, Estimation, My Page.
- Home opens the upload workflow; reports and estimates remain downstream results.

## Design principles

1. Preserve context: source imagery remains visible while editing.
2. One clear next action: each panel has a dominant CTA and reversible secondary actions.
3. Progressive precision: start with automatic selection, then refine with add, subtract, undo, redo, or polygon lasso.
4. Never hide failure: generation and authentication failures appear beside the action with recovery controls.

## Visual language

- Use SUIT for Korean and Latin copy.
- Use white and warm ivory surfaces with the Moin wood accent and restrained alpha variants.
- Cards use generous whitespace, subtle borders, and soft radii; avoid heavy opaque colour blocks.
- Selected image regions use translucent wood overlays so source details remain visible.

## Components

- Header and mobile bottom navigation expose the same destination hierarchy.
- Upload modal: current-space image, per-target material cards, selection canvas, and final result CTA.
- Material selection tools:
  - Object Selection: drag a region over a named target; detect its edge inside the region.
  - Quick Selection: brush over target fragments to add or subtract edge-aware connected areas.
  - Magic Wand: select one adjacent area with similar colour and tone.
  - Polygon Lasso: retain manual point-by-point precision and explicit closing feedback.
- A source mask is a maximum editable ROI. The named target and depth order decide the actual edited pixels.
- Background surfaces preserve foreground occluders. Foreground targets preserve the background visible through holes and gaps.

## Accessibility

- Interactive controls have visible labels, keyboard focus, and at least 44px touch targets where space allows.
- Selection meaning is communicated by text and geometry, not colour alone.
- Progress and failure messages use `role=status` or `role=alert`.

## Responsive behavior

- Desktop uses side-by-side navigation and wider image work areas.
- Mobile uses one column, sticky bottom navigation, full-width actions, and scroll-safe modals.
- Selection canvases keep the source aspect ratio and use normalized coordinates across viewport sizes.

## Interaction states

- Default, hover, focus, active, disabled, loading, success, and error states are required for primary controls.
- Shift/Ctrl adds selection; Alt subtracts; clicking an already selected point removes that connected area.
- Undo, redo, and clear-all remain available for source and material-swatch selections.

## Content voice

Use concise Korean instructions with concrete verbs: 선택, 추가, 제외, 저장, 다시 시도. Explain recovery in the same panel as the error. Avoid AI marketing language when describing deterministic controls.

## Implementation constraints

- Vanilla browser modules in `public/`; Node.js server in `src/`.
- Selection coordinates and masks must remain aligned to the original image dimensions.
- Gemini receives the source image, named target, material sample, and mask separately.
- Generated output must remain one full-frame image aligned to the source for before/after comparison.

## Open questions

- A dedicated segmentation service can later replace the browser edge-aware selection while keeping the same tool and mask contract.
- Mobile stylus pressure and feathering are future refinements, not required for the current selection model.
