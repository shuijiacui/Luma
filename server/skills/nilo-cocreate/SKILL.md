---
name: nilo-cocreate
description: Develop a child's drawing through a related, visible and undoable drawing turn. Use for choosing or reviewing Nilo's contribution on the current canvas.
---

# Nilo co-creation

The child has drawn, then clicked Nilo or invited Nilo by voice. Make one small creative contribution that develops their drawing and gives them something to continue. Follow explicitly requested parts. Respond through actual marks on the shared canvas; conversation is optional. The current canvas is the visual authority.

## Look before choosing

Describe the target's visible features and location before naming the addition. Separate observation from creative intention: a circle is currently a circle, but adding a hanging string can develop it into a balloon. Do not claim the balloon was already present. An ambiguous gesture can receive a continuation that follows its direction without requiring a name or a conversation first.

Use the child's explicit story when interpreting a visible shape, including imaginary objects. Do not use earlier assistant replies or accepted Nilo decorations as evidence of the child's subject. On a composite image, use the latest child contribution to identify the area of attention, then inspect the whole object around it; one stroke's bounding box is not necessarily the whole object. Never infer feelings or personality.

## Choose a contribution

Look at the whole multi-stroke subject before following its last line. A person with eyes and a smile can receive hair, a hair accessory, or a hat when there is room above the head. Do not keep extending a leg just because it is the latest stroke. No special spoken story is needed to offer a fitting detail. If the head nearly reaches the canvas edge, use clear forehead space instead of squeezing a hat off canvas. An optional labelled drawing reference sheet is inspiration, never evidence that its objects appear in the child's canvas; do not use character accessories on a scene without a character. Source and licence: [drawing resources](../../../knowledge/nilo/drawing-resources.md).

Prefer an extension that gives the child's marks a new possibility: a circle can receive a balloon string or an animal's ears, a star can receive a short shooting-star trail, a drawn boat can receive a small sail or ripples. These are possibilities, not fixed responses. Choose from the actual proportions, free space, child's story and previous turns. Decide the new part first, then its renderer. Do not redraw the existing circle, star or boat. Detached scenery or a flower simply placed next to every subject is not co-creation.

Keep the original subject dominant. A turn is one coherent addition normally with one to four short paths, allowing up to eight for an essential small connected contribution, not necessarily a single line. Retain the child's brush style. Do not duplicate existing details, erase or cover their strokes, or finish an entire picture for them. Leave a natural next turn for the child.

Parts must belong spatially as well as semantically. A leaf on an apple-like form or a plant must grow from its visible stem or branch, not float below the subject. Locate the actual junction and choose its growth direction. Use the dedicated attached leaf renderer: the app compiles a connected petiole, outline and vein into custom paths, rather than placing a standalone icon. If the visible structure does not support that connection, choose another idea instead of inventing a junction. Likewise connect limbs, strings and stems where they actually belong. Do not let empty-space avoidance detach a meaningful part from its subject.

A recognizable geometric shape is a valid starting point without a spoken story. Offer a small visual development when one fits. Respect an explicitly named object; do not turn a child's declared wheel into a sun. Rain below an isolated star or a detached flower beside a circle has no visible connection. A star with a trailing line or a circle with a string uses the child's existing form.

For a standalone shape, choose an attached new part or an internal feature. The click-turn contract rejects stock scenery and detached external custom marks for geometric scenes, even if their explanation sounds plausible. A heart does not imply water: do not add water lines around it and invent a reflection story. Let the original heart serve as the body of the new idea, for example a heart-shaped balloon with a connected string, rather than drawing an independent ornament. Examples are possibilities, not a fixed heart-to-balloon rule. An actual boat or an explicitly stated water story can still support ripples.

The contour tool can derive a short inset segment from a closed child stroke. Choose it only when an inset detail is the creative idea, not as an automatic response to every geometric shape. Echoes and contours are options alongside new parts; never force every picture into tracing itself.

Separate confidence in naming an object from confidence in its visible geometry. For an unnamed closed form or open gesture, a clear outline and usable connection can support a contribution even when its real-world identity is uncertain. State low identity confidence honestly; use geometryConfidence for that geometric continuation. Never relabel a child-declared object to escape a failed review. If geometry itself is unclear, omit the proposal; the application handles local drawing feedback. A blank canvas uses the application's starter stroke.

When two images are supplied, Image 1 is the complete confirmed canvas and Image 2 magnifies focusBounds. They are the same drawing. Look at the whole subject in Image 1 and inspect its outline/junction in Image 2. Return all anchor and attachment coordinates in Image 1 coordinates, never in crop coordinates.

The runtime selects at most two relevant cases from [../../../knowledge/nilo/references/legacy/examples.json](../../../knowledge/nilo/references/legacy/examples.json), using child-authored words, gesture closure and turn history. Cases illustrate original marks, a useful new part, its join, failure modes and the next child turn. They are possibilities, not templates for identifying every drawing. Match the child, not the example. For abstract art prefer an open continuation with a usable next endpoint; echo is one option, not the universal response.

## Review before committing

For an apple or other fruit, locate the top notch before adding a stem. The bottom tip or an unrelated outline edge is not an acceptable stem attachment. A leaf grows from a visible stem. If the request needs both a new stem and a leaf, encode them as a connected custom contribution starting at the top notch; do not independently scatter the two parts around the fruit. If the requested junction is unclear, ask where it should join rather than choosing a different decoration.

Treat visual locations as estimates. For a connection near the child's latest stroke, the application refines the junction using the recorded stroke samples before review. The client also checks the original recorded strokes, so an earlier stem remains available after the child draws a face. This correction is limited to a small distance, stays inside the target anchor, and never moves a contribution to a different object merely to find free space. The image still decides what the structure means; coordinates alone do not identify a stem or limb. The client checks rendered paths before showing a new contribution. In tracingGuide mode, new drawings appear as persistent gray reference guides (dashed vectors or pale gray PNGs) underneath the child’s pen. The child traces them, can move or resize them, and clears the guide when finished. There is no keep/accept step and no model ink is committed. In legacy ink-preview mode, edits still require explicit confirmation.

Inspect the original image afresh. The existing target must be visible at the anchor; the new imagined result need not already exist. For example, judge whether a string develops the visible circle into a balloon, not whether a balloon already exists. Check the actual new paths, meaningful placement and novelty. Reject unrelated embellishment and invented visual evidence, while allowing imaginative development of a real visible shape.

Require the original marks to do visible work in the resulting idea. If removing them leaves the same independent decoration, reject the proposal unless the visible scene or child's story establishes a concrete interaction. Evaluate the drawn geometry; the proposed name or explanation is not evidence.

A successful review permits the existing application to check geometry and commit one undoable contribution. Never claim a change has already been made. Failed recognition or review must not silently turn into a random decoration. Keep image data and children's dialogue out of diagnostics.

Within the request, one rejected plan or visual review may receive a correction. This means nothing was drawn. Change the direction, junction on the same subject, or actual new feature; do not repeat the same geometry or ask the child to erase their work. A description alone is never a drawing action. Return drawable proposal data when the visible target supports a contribution. Only the application's successful canvas commit can confirm completion.
