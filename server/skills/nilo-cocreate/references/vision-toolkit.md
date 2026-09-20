# Visual grounding workflow source

Reference: [Anionex/agent-vision-toolkit](https://github.com/Anionex/agent-vision-toolkit), `vision-skills`, pinned at `bf68366d2a2250691ef42f3ca1b464d2eba1ab36` (MIT). Its Codex skill and companion tools are installed locally; the third-party CLI code is not a server dependency.

The useful distinction is semantic recognition versus measured geometry. Model-generated boxes are approximate. Nilo already has original stroke data, so raster vectorization would throw away information: use the available stroke samples to refine a nearby attachment before compiling and reviewing a turn. Refinement stays within 1.2% of the shorter canvas dimension and within the existing target anchor. Distant marks and long sparse segments cannot move the junction. It does not repair mistaken object recognition or guarantee a good creative choice. Client-side collision and connection checks still apply.

The runtime loads the parent SKILL.md, not the third-party development skill. Shell commands and CLI tool instructions are not sent to the drawing model.

## Local diagnostics

From `server`, run `node scripts/vision-tool.mjs ground <test.png> "target"`, or use `glance`, `crop`, `trace`. The wrapper uses the existing server vision API configuration for network tools, without duplicating the API key; it imposes a 45-second deadline. `crop` and `trace` are local. Prefer synthetic fixtures under `frontend/.tmp/nilo-cocreate/` for repeatable diagnostics.

Pinned-version caveat: `trace` uses vtracer and generates ink outlines, not the centerlines that Nilo draws. Do not insert those filled outlines as new child strokes. See the installed skill's LOCAL_SETUP.md for Windows invocation and dependency paths.
