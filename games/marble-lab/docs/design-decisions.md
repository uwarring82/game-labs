# Design decisions and scope

Owner: U. Warring. Current specification: Task Card “Relief” v0.1, 25 September 2026, draft and unendorsed. This file summarizes decisions from the conversation; implementation details, coefficients and sources are in `dist/model-notes.html` and `dist/material-parameters.json`.

## Product and controls

- A mobile browser game, initially one maze and two test phones; no dedicated app.
- Tilt controls acceleration. Momentum and counter-tilt braking remain fundamental. Difficulty must emerge from materials and geometry, not a tilt-to-velocity control law.
- Pitched-neutral beta/gamma calibration; hardware axes remapped to screen orientation. Touch and keyboard remain usable tilt controls.
- Enable tilt is a separate user action. Audio/permission/fullscreen initialization follows browser activation requirements.
- Full motion applies measured translation; tilt-only remains one tap away. No shake, toss, jump or stuck detector.
- Material choices expose meaningful physical scenarios. Most coefficients remain estimates, not calibrated specimens.

## Relief specification

- Terrain is a heightfield. Local gradient and curvature feed the equations of motion; visual exaggeration never alters physics.
- Comfortable tilt starts at 8°, terrain stays below 15°, and levels combine free, committed and momentum-only slopes.
- Broad irregular features, smooth first derivatives, routes through three to five passes, drainage-based holes, and a gentle summit held for three seconds.
- Walls have low (2r) and tall (6r) heights. Top edges are rims, not platforms. Optional outer-edge falls are retained.
- Traps arise from confinement or loss thresholds. A pocket, sandy pothole and resin patch replace nonphysical latches or jamming states.
- Precomputed fixed-light relief shading, contours, material patches, physically driven spin and flight shadows communicate state without terrain labels.
- Generator acceptance uses a bounded tilt bot; impossible candidates must be rejected. No second authored level before two-phone acceptance. An edited Saddle and Basin, and the open board the player builds on (owner's request, 26 September 2026), are labelled and unchecked, not authored levels.

## Explicit implementation interpretations

1. A carried ball starts separation with zero velocity relative to the board; relative launch speed develops during the stop. Finite-duration acceleration is integrated instead of injecting velocity.
2. Linear acceleration and gravity use the same calibrated frame. Otherwise pitched calibration creates false support in free fall.
3. Accelerometer full-scale range is not exposed by the browser. Logs contain measured peaks and suspected clipping; no guessed device-dependent acceleration boost is applied.
4. Broad basins are drained; the confinement pocket and sandy pothole are intentionally undrained exceptions.
5. The pocket regression checks 30 seconds of constant exit-directed tilt, then one reference pulse. It does not prove confinement against all possible resonant pumping sequences.
6. Route acceptance covers all five balls on wood. Whole-board floor swaps are exploratory and may be impassable at the default budget.
7. Full motion is translational inertia plus virtual tilt. Euler, Coriolis, centrifugal and sensor lever-arm terms are omitted; this is not a complete rotating six-DOF board model.
8. The accelerationIncludingGravity sign is measured during calibration, not inferred from the user agent. The spec and Android report +g face up; WebKit (every iPhone browser) reports −g on all three axes. A reading that matches neither sign within 0.1g turns full motion off; tilt-only still works.
9. No full 3D steep contact, grain-level sand, new selectable Relief materials, or gesture library. Oil film remains deferred.

## Sculpt (Task Card “Sculpt” v0.1, draft)

The owner asked for a landscape the player can reshape: valleys and hills from pressing the screen, sand holes and movable barriers. The task card ([task-card-sculpt.md](task-card-sculpt.md)) plans four stages; S1, terrain editing, is implemented. On 26 September 2026 U. Warring gave the go-ahead for the next development stage and delegated the open choices. They were decided as follows:

1. Sculpt edits the one level in place and is published before the Relief phone gate. It adds no level selector. An edited board is labelled and saved only in the browser.
2. Edits happen only in a paused build phase. Entering and leaving it starts a new run. A press moves the phone, and the ball would feel it; moving-surface contact does not exist.
3. Edited boards keep Relief's slope bound (14.6°) and add a hollow bound of 50 m⁻¹. The crest bound is relaxed from 9.65 to 20 m⁻¹. At 9.65 a fingertip-sized press is under 1 mm deep and feels like nothing. At 20, a 5 mm ball on a level crest keeps contact up to about 0.73 m/s instead of 1.03 m/s.
4. Edits fade to zero, over 30 mm, around the start shelf, the hole rims and the goal. The goal zone covers the whole 83 mm blend in which each ball's summit curvature is tuned, so the limits checked on the steel field hold for every ball. The pocket, pothole and lip stay editable. Hard keep-outs covering the whole brush would have left only about a third of the board editable at the medium size.
5. The level-as-input refactor, which is also engine-extraction step 1, was deferred to S2: terrain edits need only the per-ball terrain wrappers. It was done for movable walls (below).
6. Undo replays the stroke list from scratch rather than storing per-stroke snapshots. Replay is exact and simple; a heavy session replays in about 0.1 s on the development Mac.
7. Edited boards are never called validated. The route bot, drainage and pocket evidence apply to the unedited relief only.

**Movable walls and ball size**

On 26 September 2026 the owner reviewed stage 07 and asked for movable authored walls and a variable ball size. That settled task-card decision D6 in favour of the level's own walls, not player-placed barriers.

The owner had asked to be consulted before engine-extraction step 1. The request was read as the go-ahead for that step only, because moving walls needs it: physics.js takes the level as an input, and each ball carries its layout. Nothing moved into `packages/`. With the relief and nominal sizes, the arithmetic is unchanged, and the regenerated evidence is byte-identical to a same-machine baseline.

8. The low wall and the pocket wall move. The border stays, because it is the board's edge.
   - **Gestures.** A wall moves when dragged. It turns about the centre of its bounding box when its handle is dragged; the handle sits 85% of the way along the wall, away from the screen edge.
   - **Rules.** Walls stay on the board and keep clear of the start (25 mm), the holes and the goal ring (their radius plus 12.5 mm).
   - **Crossing.** Walls may cross, as the authored pocket wall passes through the low wall.
   - **Gates.** Moving a wall can open a tilt-only route past the low wall, or free the pocket trap. That is allowed on an unchecked board.
9. Ball size changes the ball, not the board. The table-tennis and billiard boards keep the scale of their nominal ball, while the ball ranges from 0.5 to 1.6 times its nominal diameter.
   - **Mass.** Solid balls keep their density. The table-tennis shell keeps its wall, so its mass scales with area.
   - **Why.** Scaling the board with the ball, as the materials already do, would change only the pace. A size relative to the board changes what happens: smaller balls drop into holes more often and at higher speeds, and walls are relatively lower for large balls.
   - **Why 1.6×.** From 1.7× a ball is wider than a hole. It then seats in the rim, which holds it at an angle no tilt overcomes, and the game has no stuck detector to end the run.
   - **Summit timing.** Each size gets its own goal-curvature correction, keeping the 0.7 s summit time.
   - **Coverage.** Level acceptance covers the nominal sizes only.
   - **Contact solver.** At 1.6× the Sculpt hollow bound reaches r·κ = 0.4 for every ball; the support solver was checked correct at 0.5.
10. Walls must leave a way from the start to the goal for the largest ball, checked by a coarse flood fill that treats low walls as hoppable. Without it, a legal pose of the pocket wall shut a 2× ball in at the start. Wall poses are saved under their own key, because stage 07 shares the strokes key and would erase them.

**The open board and movable objects**

On 26 September 2026 the owner asked: “Make also other obstacles move and scaleable. The initial board should start fully flat and empty.”

11. The game opens on a flat, empty board of the same size as Saddle and Basin. It has the border, a start and a goal ring, and nothing else.
   - **Why a start and a goal remain.** The game needs both, but neither is an obstacle.
   - **No summit.** The goal ring sits on flat ground, so there is no per-ball goal correction and there are no Sculpt keep-outs.
   - **Saddle and Basin stays.** It remains a second board under Materials & play: the validated relief, and still the physics default for scripts and tests. It is a template to play or edit, not a new authored level. The owner can remove it.
   - **Saves.** Each board keeps its own edits.
12. Every object except the border moves.
   - **Scaling.** Walls turn and stretch about their box centre; holes and the goal ring change radius; patches scale uniformly.
   - **The handle.** A round handle, drawn only on the selected object, does both jobs. It sits 85% along a wall, or 6 mm outside a round object's rim, on the side that stays on the board. It is grabbed within about 24 CSS px, but only when the press is nearer to it than to the object's centre, so short walls and small holes can still be moved.
   - **Snapping.** Drags move by snapped displacements, so a drag back to where it began changes nothing.
   - **Adding and removing.** Low walls (10 mm), tall walls (30 mm), holes, sand and resin can be added and removed.
   - **Rules.**
     - The start stays 25 mm from walls and holes, and outside every patch, because resin, and sand for some balls, would hold it against any tilt.
     - Holes stay 8.25–25 mm in radius, never narrower than the largest ball, and clear of the start and the goal.
     - The goal ring stays 12–40 mm in radius.
     - Walls stay 20–350 mm long and clear of the start, the holes and the goal.
     - A way from the start to the goal must remain for the largest ball. Holes count as blocked and low walls as hoppable, and the flood fill keeps half a cell of margin at wall tips.
   - **The relief's terrain.** On Saddle and Basin the terrain keep-outs and the goal summit stay where the relief built them, wherever the objects move.
13. Objects are saved under their own key per board, because stages 07 and 08 share the relief's strokes key. A stage-08 wall save is read once and turned into objects.
14. Patches are now drawn axis-aligned, exactly where patchAt applies them. The earlier drawing was rotated by 0.15 rad, so 4–8% of a patch was drawn where it did not act.

## Evidence

- `dist/relief-generation.json`: selected candidate and blocked-level rejection.
- `dist/relief-validation.json`: geometry, drainage, pocket, all route trials and pending phone entries.
- `tests/`: reproducible regression tests; legacy material routes are non-playable fixtures. `tests/sculpt.test.mjs` covers the edit layer.
- `docs/task-card-sculpt.md`: the Sculpt specification, its decisions and the measurements behind them.
- `docs/acceptance.md`: remaining gates. Only U. Warring can endorse the task card to v1.0.
