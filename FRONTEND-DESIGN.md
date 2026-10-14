# FRONTEND-DESIGN.md — Family Story Keeper Design Contract

## Product feeling
Story Keeper is a calm, emotionally warm family-memory experience, not an admin console. Communicate trust, warmth, clarity, continuity, family connection, gentle guidance, and narrator control.

## Primary users
Narrator (Rosa): large readable questions, simple controls, minimal technical language, clear save state, gentle conflict clarification, approval control, easy chapter review.

Relative/grandchild (Maya): simple question queue, clear approved family history, timeline, relationships, approved chapters, grounded search.

## Demo modes
Support narrator mode, relative mode, and `+3 Days`. Mode changes must be visually obvious. Never confuse narrator-private pending content with family-visible approved content.

## Visual hierarchy
Prioritize: current question/action, response/input, relevant memory/context, provenance/status, then secondary navigation. Diagnostics must not dominate.

## Typography and spacing
Use large readable question text, comfortable line-height, strong contrast, short readable chapter line lengths, generous spacing, and elder-friendly touch targets.

## Color
Use warm neutral foundations. Semantic states must be understandable without color alone: approved positive, pending calm waiting, conflict attention-not-alarm, rejected subdued, processing calm activity.

## Controls
Use real buttons, labeled selectors, readable toggles/segmented controls. Avoid icon-only critical actions.

## Interview UX
One question at a time, clear answer area, save/processing state, gentle continuation. Do not expose all upcoming questions.

## Conflict UX
Never say “you were wrong” or “this answer is incorrect.” Prefer gentle language such as “Earlier you remembered 1962, and now you mentioned 1964. Which feels right?” Only show supported backend choices.

## Approval UX
Make pending, approved, rejected/deleted, and pending-chapter-review states clear. Family-visible approved content must not look identical to narrator-private pending memory.

## Provenance UX
Use human language and safe metadata; do not show raw IDs as primary UX.

## Timeline UX
Preserve exact/approximate/range/unknown semantics. Examples: `1964`, `Around 1964`, `1962–1964`, `Date unknown`.

## Family tree UX
Render only confirmed backend identities and approved relationship types. Avoid implying unresolved or unapproved relationships. Keep readable on Echo Show/tablet-like viewport.

## Chapter UX
Approved reading should feel book-like. Review must clearly separate generated/pending review, sources, narrator actions, and approved final state. Family members never see pending drafts.

## Search UX
Provide clear query input, loading, empty state, short approved excerpts, source type, and safe metadata. Never expose FTS/BM25 mechanics in user-facing UI.

## Loading and empty states
Use contextual labels like “Saving...”, “Processing your memory...”, “Drafting chapter...”, “Searching family stories...”. Empty states should explain next steps.

## Errors
Keep errors short, user-safe, and retry-oriented where appropriate. Never show stack traces, SQL, filesystem paths, raw JSON, or provider messages.

## Motion
Use restrained motion for state/view transitions. Avoid constant floating effects, parallax, blocking animation, or distracting celebration.

## Accessibility
Require keyboard navigation, visible focus, semantic headings/landmarks, labels, adequate contrast, meaningful button text, accessible status announcements where practical, large targets, and no hover-only critical state.

## Responsive targets
Must work well at normal desktop demo size and tablet/Echo Show-like viewport roughly 800–1280px wide. Mobile-phone perfection is lower priority.

## Developer panels
Temporary developer panels are allowed early. By simulator-polish phase, hide behind explicit developer mode or remove from primary demo.

## Final demo principle
Every visible element should help show one of these truths: Alexa asks the right question; memory persists over time; family can contribute questions; contradictions are handled gently; narrator controls what becomes history; approved memories become timeline/story.
