# Development history

This record summarizes the development in the Marble Lab conversation. The six original source commits are preserved; their generic commit messages have not been rewritten. Dates below are normalized to Europe/Berlin. Milestone names are descriptive, not endorsed releases. This is a development summary, not a verbatim chat transcript.

| Date / time (Berlin) | Source commit | Milestone |
| --- | --- | --- |
| 25 September 2026, 17:54 | `b89157084a741a984640a33b799ba7664cb23aab` | Initial tilt maze |
| 25 September 2026, 18:31 | `4f8ae65448826abe7d5612a3131601af7bdbc02f` | Material physics |
| 25 September 2026, 19:06 | `3b37b4141c75175e530f03306e058480bad9f9f5` | Expanded material combinations |
| 25 September 2026, 19:32 | `54809a89744c4e75db3b70ea43d8f13b46fb00d8` | Screen space, look and sound |
| 25 September 2026, 20:39 | `13568f21749b6e01be77e9b194b6fbe31719d3ad` | Terrain dynamics and open edges |
| 25 September 2026, 22:17 | `cb911113a7319285f88ae9508359cb9d87630180` | Relief v0.1 draft |
| 26 September 2026, 13:09 | `2dd6400ee314a673591f651b298c9bb000df88a3` | Sculpt v0.1 draft |
| 26 September 2026, 18:37 | `9adb478563fec33cdb7db43d4bbd0bb937ae7968` | Movable walls and ball size |

## Initial tilt maze

A browser application with one top-down maze, phone orientation, pitched-neutral calibration, touch/keyboard acceleration control, fixed physics stepping, pause/resume handling and sensor diagnostics. No dedicated native app. Real momentum and counter-tilt braking are the control model.

## Material physics

Physical ball dimensions, mass and inertia; contact friction, rolling losses, restitution and spin. Steel and rubber respond differently on wood and sand. Parameters are scenario assumptions with documented sources and limits, rather than user-facing physics sliders. Hole capture and rim contact depend on motion and geometry.

## Expanded material combinations

Ice introduces slipping and re-grip. Table-tennis balls add shell inertia and visible drag. Cork supplies the low-rebound corner. Billiard/baize provides literature reference coefficients. Wall material is independent of floor material. Parameter tables and material-route regressions accompany the additions. A thin oil film was discussed but remains deferred.

## Screen space, look and sound

Portrait board units, uniform scaling, safe areas, capped pixel density, dynamic viewport handling, standalone manifest and icons, fullscreen/orientation handling where available. Cached procedural surfaces, spin marks, height/shadows and persistent surface marks. Web Audio rolling and impulse-driven impacts, optional haptics, and diagnostics for timing. Platform behavior still requires real-device checks.

## Terrain dynamics and open edges

A smooth heightfield adds slope and curvature to the contact model. Crests can launch the ball; landing reuses friction and restitution. The summit requires three seconds of dwell. Open edges removes perimeter walls and permits a physical fall. Point terrain was the predecessor of the full-board Relief landscape.

## Relief v0.1 — draft, unendorsed

Continuous Gaussian/warped landscape with hillshade and contours; drainage holes; four route passes; curved low/tall walls; a confinement pocket; sandy pothole; resin patch; and a goal summit with a 0.7 s lossless e-folding reference. Measured linear acceleration comes from orientation-derived gravity subtraction, with held samples, a 3g cap, and calibrated-frame alignment. Full motion has no gesture, shake, toss or stuck-state detector.

The generator and tilt-budget bot reject unsuitable candidates, including a deliberately blocked handmade level. Recorded acceptance: 93 automated checks; 10/10 route trials for each of five balls on wood at an 8° budget. Trials perturb initial positions; they do not establish human or noisy-phone reliability. Both physical-phone measurements remain pending.

The finite-stop calculation was corrected: a 0.4 m/s flick followed by a uniform 30 ms stop produces about 2.15 mm separation, not the 8.15 mm instantaneous-stop value. The route bot uses a stronger documented waveform. Observed accelerometer peaks are not hardware range measurements.

## Repository preparation — 26 September 2026

Added this readable development record, design decisions, acceptance checklist and contribution instructions. Game code and the published Site are unchanged by this documentation step. A GitHub repository has not yet been created at preparation time.

## Game Labs — 26 September 2026

Moved into the public Game Labs repository at `games/marble-lab/`. The seven earlier commits were imported unchanged, so the commit IDs above still resolve. GitHub Pages now publishes the current build and each milestone above as a playable development stage, extracted from these commits (`stages.json`).

The web-app manifest's `id`, `start_url` and `scope` are now `./` instead of `/`, so the game also runs under a subpath such as GitHub Pages. At a site root the two are equivalent. No game code changed. Both physical-phone measurements remain pending.

## iPhone gravity sign — 26 September 2026

The first real-phone test (iPhone, Safari) showed full motion reading about −2g upward at rest, which threw the ball off the board. Cause: the W3C specification and Android report `accelerationIncludingGravity` as +g along the upward screen normal, but WebKit passes Core Motion's opposite sign through unchanged, so every iPhone browser reports all three axes reversed. The game subtracted spec-convention gravity, doubling it instead of removing it. Tilt only was unaffected.

Calibration now measures the convention. During the hold-still window, the mean reading is compared with the gravity predicted from β/γ. A match within 0.1g directly or negated sets the sign for later samples. Anything else, or no readings, turns full motion off with an explanation, and tilt-only continues to work. Diagnostics show the detected sign and the rest residual, and motion exports (schema v0.2) include both. Three new tests cover the check, both conventions at four screen rotations, and 30 samples from the recorded iPhone export (rest residual below 0.1 m/s² after correction). Physical-phone acceptance remains pending.

## Sculpt v0.1 — 26 September 2026

The player can reshape Saddle and Basin. Sculpt ends the current run and opens a build phase:

- **Brush.** Pressing the board digs a hollow and pushes up a low rim around it; Pile does the opposite. Holding deepens it and dragging ploughs a furrow.
- **Controls.** Three brush sizes, Undo and Reset. Done starts a new run on the edited board.
- **Saving.** Edits are autosaved in the browser.
- **Labelling.** An edited board is labelled as edited and has not been checked by the route bot.

The specification, its decisions and the measurements behind them are in [docs/task-card-sculpt.md](docs/task-card-sculpt.md). S1, terrain editing, is implemented. Sand pits and player barriers (S2), checked puzzle boards (S3) and live editing (S4) are not.

**Model.** Edits are node deltas on the relief's own Hermite grid, added to every ball's field when it is sampled, so the edited board stays one C¹ potential for the unchanged contact solver.

- **Brush shape.** A compact Mexican hat with zero net volume. Stamps are mirrored at the board edges.
- **Protected zones.** A C² mask fades edits to zero over 30 mm around the start shelf, the hole rims and the goal. The goal zone covers the whole 83 mm blend in which each ball's summit curvature is tuned, so limits checked on the steel field hold for every ball.
- **Limits.** Each 50 ms brush tick is scaled so slopes stay at or below 14.6°, crest curvature at or below 20 m⁻¹ and hollow curvature at or below 50 m⁻¹. Where the relief already exceeds a bound, the tick makes it no worse.
- **Relaxed crest bound.** The crest bound is relaxed from the generator's 9.65 m⁻¹. On an edited level crest, contact holds to about 0.73 m/s rather than 1.03 m/s, and faster balls hop.

**Rendering.** The floor texture is now cached separately, and a brush tick redraws only the rectangle it changed. The contour interval is fixed per ball from the unedited relief. The last contour row no longer extends 1.7 mm past the bottom edge.

**Evidence.** Seventeen new tests bring the total to 113. They cover:
- brush volume, derivatives and flat-ground limits;
- a local update matching a full rebuild;
- bit-identical sampling without edits, and every ball seeing the edits in its own units;
- the bounds after a random editing session (crest curvature measured up to 1.1% over, between check points);
- a long hold stopping at the slope bound, and a narrow press stopping at the hollow bound;
- pristine keep-outs for every ball's field, with the 0.7 s summit test passing for every ball;
- mirrored edge volume and consistent fade derivatives;
- bit-identical undo, reset and reload, and load validation;
- a source guard on the replay arithmetic;
- a hollow that holds a released ball;
- the dirty-rectangle redraw and the brush rings;
- support-solver curvature regressions.

Before commit, the task card and the code were each reviewed adversarially, and a skeptic re-checked every finding. Confirmed findings were fixed, among them:
- the limits missing the goal correction on the table-tennis and billiard boards;
- fades too narrow around the holes;
- toolbar placement over the board;
- dropped brush ticks on slow frames;
- tests that let mutants through.

The listed mutants now fail the tests.

With no edits, regenerated relief-generation.json and relief-validation.json are byte-identical to a baseline generated before the change on the same machine. The committed relief evidence is unchanged.

On this arm64 Mac, even unchanged code differs from the committed files in the last digits of 36 values. The committed files reproduce on x64, so the engine-extraction check has to compare against a same-machine baseline.

The Sculpt flow was driven in headless Chrome with emulated touch. On an M1 Pro in Node, a brush tick measured 0.9, 1.7 and 3.5 ms median for the three sizes (p95 1.7, 3.1 and 6.4 ms). Phone timing and feel are pending.

Open S1 follow-ups are listed in the task card: a depth gauge, a fling rule, capped or snapshot undo, and tests for frame-rate independence and the build-phase logic.

U. Warring gave the go-ahead for this stage, and delegated its open choices, on 26 September 2026, before the Relief phone gate. No second level or level selector was added.

## Movable walls and ball size — 26 September 2026

After trying stage 07, U. Warring asked for movable authored walls and a variable ball size.

- **Walls.** Sculpt has a third tool, Walls. The low wall and the pocket wall can be dragged to a new place or turned with a round handle; the border stays.
  - **Rules.** Walls stay on the board and keep clear of the start (25 mm), the holes and the goal ring (their radius plus 12.5 mm). A way from the start to the goal must remain for the largest ball; a flood fill checks this.
  - **Undo and saving.** Wall moves share undo and reset with terrain strokes. They are autosaved under their own key, because stage 07 shares the strokes key and would drop them.
  - **Consequence.** Moving a wall can open a tilt-only route or free the pocket trap. An edited board stays labelled and unchecked.
- **Ball size.** Materials & play sets 0.5–1.6× the nominal diameter; the board keeps its size.
  - **Mass.** Solid balls keep their density; the table-tennis shell keeps its wall, so its mass scales with area.
  - **Summit time.** Each size keeps the 0.7 s summit time.
  - **What changes.** Smaller balls drop into holes more often and at higher speeds. At 0.5× steel is captured up to 1.0 m/s, at 1.6× only up to 0.52 m/s.
  - **Why the limit is 1.6×.** From 1.7× a ball would be wider than a hole and seat in its rim for good. The game has no stuck detector, so the range stops below that.
  - **Coverage.** Route acceptance covers the nominal sizes.

**Engine.** This is engine-extraction step 1, done at the owner's request for movable walls; nothing moved into `packages/`.
- **Level as input.** physics.js takes the level as an input, and each ball carries its layout.
- **Resized balls.** They get a terrain field that shares the relief's cells except near the goal, and at most four such layouts stay cached.
- **Renderer.** It draws walls, holes, start, goal and patches from its level and redraws a moved wall locally.
- **Unchanged without edits.** With the relief and nominal sizes the regenerated evidence is byte-identical to the same-machine baseline.

**Evidence.** 126 tests, 13 of them new. They cover:
- the wall rules and rigid poses;
- collisions at a moved wall;
- undo, reset and reload of wall poses, and dropped invalid poses;
- mass and size scaling, and the summit time at every size;
- the resized-layout cache;
- hole capture across sizes, and no seating for the largest ball;
- the local wall redraw and its handles.

Before commit, the code was reviewed adversarially and each finding re-checked by a skeptic. The confirmed findings are fixed:
- unwrapped turn angles that could lose all wall moves on reload;
- stage 07 erasing wall moves through the shared save key;
- taps recorded as moves;
- a legal pose that shut a large ball in at the start;
- balls wider than a hole seating for good;
- exports without ball size or wall poses;
- test gaps.

The flow was driven in headless Chrome, and phone checks for both features are pending.

## The open board and movable objects — 26 September 2026

The owner asked: “Make also other obstacles move and scaleable. The initial board should start fully flat and empty.”

- **Open board.** The game now opens on a flat, empty board: the border, a start and a goal ring. The player builds the course with Sculpt. Saddle and Basin remains as a second board under Materials & play, and each board keeps its own edits.
- **Move tool.** It moves every object except the border. A round handle turns and stretches walls, or resizes holes, patches and the goal ring. Add places low or tall walls, holes, sand and resin, and ✕ removes the selected one.
- **Rules.** Every layout stays playable for every ball size:
  - holes are never narrower than the largest ball;
  - start and goal keep clearances;
  - a way from the start to the goal must remain, with holes and tall walls blocking and low walls hoppable.
- **Flip.** On a phone in portrait, ⇅ moves the toolbar to the other edge, since either edge covers the start or the goal.
- **Model.**
  - The open board has no goal summit, so it has no per-ball goal correction and no Sculpt keep-outs.
  - On Saddle and Basin, the summit and keep-outs stay where the relief built them.
  - A ball starts on the ground even where the start sits on sculpted ground.
  - Patches are now drawn axis-aligned, exactly where the physics applies them.
- **Saves.** Objects are saved per board, apart from the strokes that stages 07 and 08 share, and a stage-08 wall save is migrated.
- **Review.** Before commit, the code was reviewed adversarially and each finding was re-checked by a skeptic. The confirmed findings are fixed:
  - deleting during a drag corrupted another object;
  - short walls could not be moved;
  - Add stacked objects on top of each other;
  - a drag back to the start counted as an edit;
  - resin or sand could cover the start;
  - wall-tip gaps were 0.25 mm too narrow for the largest ball;
  - overlapping patches acted differently from how they were drawn;
  - handles were too small, or sat off the board;
  - the toolbar could cover the goal on wide screens;
  - the Add dropdown could zoom on iOS;
  - the ball was drawn at the old start;
  - help text and exports were wrong for the open board;
  - tests let mutants survive.
- **Evidence.**
  - The regenerated relief evidence is still byte-identical to the same-machine baseline.
  - `npm test` runs 130 tests. The object tests replace the wall tests, and the ball-size tests moved to their own file.
  - The flow was driven in headless Chrome.
  - Phone checks are pending.
