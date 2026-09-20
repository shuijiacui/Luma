# Nilo runtime drawing skills

These application-owned skills are loaded by `src/services/niloDrawingSkills.js`, not by the developer's Codex installation.

- `nilo-line-art`: compact curves, consistent physical proportions and connected parts.
- `nilo-composition`: visual hierarchy, useful empty space and restrained additions.

Both bodies enter click planning, bounded correction and visual review. Voice requests load them when drawing or drawing-intent inference is enabled and an image is present. Ordinary conversation does not load them. The existing deterministic renderer for explicitly named basic objects remains unchanged. The existing `nilo-cocreate` skill continues to govern click co-creation and review.

The loader uses a fixed list of local files and caches their bodies for the server process. Include `server/skills` in deployments and restart the backend after editing skills. Skills guide model proposals; existing geometry checks, canvas commit confirmation, persistence and undo remain authoritative.

## Provenance and adaptation

The selection of principles was informed by Anthropic's [algorithmic-art](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/algorithmic-art) and [canvas-design](https://github.com/anthropics/skills/tree/34040c9c568585f6929bedeaad110ad08f079624/skills/canvas-design) skills, reviewed at commit `34040c9c568585f6929bedeaad110ad08f079624` (upstream Apache-2.0).

The two Nilo skills are newly written, task-specific guidance, not unmodified installations of those upstream skills. No upstream templates, fonts, scripts or text are bundled here. Whole-image generation, p5.js interfaces, poster typography, artist manifestos and random particle decoration are deliberately excluded because Nilo extends the child's existing vector drawing.

## Verification

`tests/niloDialogue.test.js` checks the actual outbound model requests for full skill bodies in click planning, correction, review and voice drawing, and excludes them from ordinary conversation. Existing permission and geometry tests still apply. `scripts/check-nilo-cocreate.mjs --live --check-canvas` can exercise synthetic drawings through the configured model and production canvas geometry. Small synthetic checks do not establish a general recognition or drawing accuracy rate.

Verification on 2026-09-20: both skills passed the skill format validator and all 273 server tests passed. Synthetic live click checks produced a connected balloon string for a circle and a leaf on the latest stemmed shape; the latter needed one canvas placement repair. Both passed production canvas geometry checks and visual inspection of the composed output. Two voice apple checks returned clarification rather than drawing; the diagnostic run generated a leaf proposal but its model review rejected placement. Runtime loading is verified, but voice placement/review reliability remains an open issue; installing these skills does not resolve every co-creation failure.

Later corrections on the same day added bounded snapping to unambiguous nearby ink, exact pixel contact checks and a 256-by-256 collision grid. An open click may mirror a blocked attached part horizontally around its unchanged joint; explicit voice/edit directions remain fixed. A final three-run synthetic heart-then-apple check produced connected leaves in all three runs, with automatic correction in two runs. Synthetic heart-string and voice apple-leaf checks also passed. These limited checks do not establish reliability on arbitrary child drawings: subsequent user requests still failed target recognition/review. Known server clarification reasons now retain their specific questions in the UI, with an integration test confirming the button is released and a later drawing can commit.
