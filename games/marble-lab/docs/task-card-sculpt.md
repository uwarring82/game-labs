# Task Card “Sculpt” v0.1 — adjustable landscape (draft, unendorsed)

Owner: U. Warring. Date: 26 September 2026. Status: **draft, unendorsed**.
- **Stage 07.** S1 (terrain editing) is implemented and published as development stage 07.
- **Stage 08.** Movable authored walls (the owner's choice under D6, part of S2) and a variable ball size (an owner request, D8) are implemented as development stage 08.
- **Stage 09.** A flat, empty open board as the start, and every object movable and scalable (D9), is implemented as development stage 09.
- **Not started.** Sand pits (the rest of S2), S3 and S4. The card depends on Task Card “Relief” v0.1, whose two-phone gate is still open. Values marked *proposed, to tune* have no measurement behind them.

For the owner: Purpose, Decisions and Stages take about ten minutes. The rest is for implementers.

## Purpose

The owner asked: “Pushing the screen may create valleys and hills, sand holes, barrieres could be made moveable.” This card specifies how a player reshapes Saddle and Basin without breaking what Relief v0.1 establishes:

- tilt sets acceleration;
- terrain derivatives come from one interpolated potential;
- bounds keep the contact model valid;
- nothing is called validated that was not checked.

## Decisions

On 26 September 2026 the owner wrote: “You have green light to go through with a next development stage of the game. Commit and push when it is ready. No need to ask me again.” The implementer decided D1–D5 and D7 under that delegation, as recorded below, and the owner can overrule any of them. After reviewing stage 07, the owner decided D6 (movable authored walls) and asked for a variable ball size (D8). That request also covered D4.

**D1. Publishing Sculpt before the Relief gate.** Decided: (c). An edited Saddle and Basin is a labelled variant of the one level, not a second playable level. There is no level selector, and the board says it is edited and unchecked. The rule “no second playable level before two-phone acceptance” stands; README.md, design-decisions.md and acceptance.md now say that an edited board is this variant. Options not chosen:
- (a) wait for the gate;
- (b) engine only;
- (d) hidden flag;
- (e) sandbox without a win state.

Every push to `main` republishes `latest/`, and stage entries stay playable permanently.

**D2. When editing happens.** Decided: (a), a paused build phase only.
- **Why.** A press moves the phone. In the only iPhone export (phone lying flat), two taps gave in-plane accelerations of 0.69 and 0.28 m/s² and tilt shifts of 0.83 and 0.31°. The steel/wood rolling onset is 0.016 m/s² (0.09°).
- **What is missing for live editing.** Contact with a moving surface and wall velocity do not exist. Live editing is S4, with its own card.

**D3. Crest bound on edited boards.** Decided: (b), relaxed from the Relief generator's 9.65 to 20 m⁻¹.
- **Why.** At 9.65, a press whose whole footprint fits under a fingertip digs at most 0.46 mm.
- **Cost.** A 5 mm ball on a level crest keeps contact up to √(g(1/κ + r)) = 0.73 m/s instead of 1.03 m/s. Faster balls hop through the existing flight model.
- **What stays.** The slope bound (tan 14.6°) is kept. A new hollow bound of 50 m⁻¹ keeps r·κ ≤ 0.25 for the single-contact support solver.
- **Reversal.** Switching back is one constant and a new stroke-format version (Persistence).

**D4. Level-as-input refactor (engine-extraction step 1).** Deferred from S1, done for stage 08.
- **Why S1 didn't need it.** The per-ball terrain wrappers read one shared edit layer.
- **Why movable walls do.** The owner's request for movable walls was read as the go-ahead for this step only. Nothing moved into `packages/`.
- **What changed.** physics.js now takes the level as an input, each ball carries its layout, and the renderer draws from a level object.
- **Unchanged without edits.** With the relief and nominal sizes the arithmetic is unchanged; the regenerated evidence is byte-identical to a same-machine baseline (E5).

**D5. Status of edited boards.** Decided: (a), labelled and unchecked.
- **Label.** The scene reads “SADDLE AND BASIN · EDITED”; the ready message reads “Edited board: the route bot has not checked it.”; a win adds “edited board”.
- **Never “validated”.** validate-relief.mjs:15 rejects any player-made basin (holes.length === basins.length), and the authored-route bot cannot see detours or shortcuts.
- **Later.** An in-browser check with the labels “Bot-finished / Not finished by the bot / Unchecked” belongs to S3.

**D6. Movable authored walls, or player-owned barriers?** Decided by the owner on 26 September 2026: (b), authored walls move.
- **What moves.** The low wall and the pocket wall; the border stays, being the board's edge.
- **Against the card's recommendation.** The card had recommended keeping them locked, because moving them changes what the level tests:
  - a 2 cm move of the low wall in y makes rubber fail 0/3;
  - a 2 cm move sideways opens a 4r gap and a tilt-only route (3/3 steel and rubber), while the authored-route bot still passes;
  - removing the pocket wall frees steel in 0.5 s, and pocketTrial still passes.
- **Consequence.** On an edited, unchecked board these changes are the player's to make (D5).

**D9. The open board and movable, scalable objects.** Requested by the owner on 26 September 2026: “Make also other obstacles move and scaleable. The initial board should start fully flat and empty.” The implementer decided the details:
- **Default board.** The game opens on a flat board with only the border, a start and a goal ring. Neither the start nor the goal is an obstacle.
- **Saddle and Basin.** It stays as a second board, to play or to edit.
- **Every object except the border moves.**
  - Walls turn and stretch.
  - Holes and the goal ring resize.
  - Patches scale.
  - Low or tall walls, holes, sand and resin can be added and removed.
- **Why the rules.** They keep every layout playable for every ball size.

**D8. Ball size.** Requested by the owner on 26 September 2026 and decided by the implementer: the size is relative to the board.
- **Range.** The ball ranges from 0.5 to 1.6 times its nominal diameter, while the board keeps the nominal ball's scale. Larger balls would be wider than the holes and could seat in them for good.
- **Why not scale the board.** Scaling the board with the ball, as the five materials already do, would change only the pace of play, not what can happen.

**D7. Keep-outs.** Decided: (c). Edits are multiplied by a C² fade that is exactly zero at the start shelf, the goal and the hole rims.
- **Why not hard keep-outs.** With hard keep-outs (no stamp may touch a zone), only 35% of positions could hold a medium brush centre, and the forbidden region would change with brush size.
- **Cost.** Next to the zones, a press is not volume-neutral.
- **What stays editable.** The lip, pocket and pothole, like the rest of an unchecked board (D5).

## Stages

| Stage | Scope | Playable stage |
| --- | --- | --- |
| S1 | Build phase and clay brush: dig or pile, hold, drag. Undo, reset, local autosave, dirty-rectangle rendering. Terrain only. | `07-sculpt`, implemented |
| S2 | Movable authored walls and the level-as-input refactor (done), with variable ball size (D8). Sand pits are still planned. | `08-walls-and-size`, implemented; sand pits later |
| — | The open board and movable, scalable objects (D9), beyond S2's walls. | `09-open-board`, implemented |
| S3 | In-browser check, share links, puzzle boards with a material budget. | `09`, only after the Relief two-phone gate (puzzles are new boards) |
| S4 | Live sculpting, with its own task card. | After its own gate |

**S1 delivered**
- [x] Edit layer, clay brush, projection, keep-outs, mirrored edges, per-ball scaling. With zero edits the Relief outputs are unchanged (A1).
- [x] Build phase, toolbar, undo, reset and autosave, driven with touch in headless Chrome.
- [x] Edited boards are labelled. relief-*.json are untouched.
- [x] README, design decisions, acceptance (Sculpt phone rows pending), CHANGELOG, model notes (test count computed), parameter ledger, `stages.json` status and the root README row.

**S1 follow-ups, not done**
- **Feedback.** A depth gauge in the toolbar, and a “no edit” ring state where the fade is zero.
- **Cost bounds.** A fling rule (a tick whose path is longer than 2R deposits nothing), and a cap on stored ticks or per-stroke undo snapshots. Undo and reload replay the whole history.
- **Test coverage.** Tests A6, A8 and A10 (below), and a fuzz test over several seeds and every ball's field (A4 runs one seed).
- **Measurement.** A Diagnostics scenario for press disturbance with the phone held.
- **Desktop.** Shift to invert the tool.

**S2 so far**
- [x] Level-as-input refactor, with the Relief outputs unchanged (E5).
- [x] Movable authored walls: poses, rules, undo, reset, autosave and local redraw.
- [x] Variable ball size (D8).
- [ ] Sand pits that respect the bounds and keep-outs, drawn exactly as patchAt tests them.
- [ ] A wall broadphase, merged with the Relief outputs unchanged.

**S3 done when:**
- [ ] Bot, planner and structural checks run as pure dist/ modules in a module Web Worker, with Node tests over the worker's module graph.
- [ ] The check reports the D5 labels, plus a separate tilt-only result.
- [ ] Share links round-trip bit for bit, have a size cap and open as unchecked.
- [ ] Puzzle boards: unedited, a board is not bot-finished at 8° (its premise); after a recorded reference edit within the budget (½∫|Δh| dA), it is. The owner decides whether player basins are exempt from the drainage rule and endorses each board.

**S4:** own task card. Minimum content: surface and wall velocity in contactImpulse, per-substep poses, a substep bound for moving geometry, and a speed cap. It also needs a two-pointer design, one finger on the pad and one sculpting, since the board takes one pointer.

## Specification (S1 as implemented)

### Build phase

- **Phase.** A new phase, `build` (label SCULPT), joins ready/running/paused/falling/won.
- **Entry.** From ready, paused or won, through the Sculpt button. Not while running or falling, and not while calibration samples are being collected. Entering ends the current run: restart() puts the ball on the start shelf and clears time, falls and marks.
- **What is hidden.** Every `.hud` element: header (so Settings and Diagnostics cannot open), controls, scorebar and board foot. The Sculpt toolbar appears.
- **Physics.** FixedClock runs no steps outside `running`, so physics.js is unchanged. Tilt and device motion keep updating but never reach the ball.
- **Leaving.** Done, Escape, Enter (unless a button has focus) or Space. Leaving saves and calls restart(). An edited board shows its label and message. The calibrated neutral is kept.
- **Interruptions.** Blur, visibility changes, rotation and dialog buttons call pause(), which ends and keeps the active stroke. The phase stays `build`.
- **Agent interface.** `start` and `resume` are refused with “Leave Sculpt with Done first.” `restart` leaves Sculpt. The state reports `build` and the edit count.
- **Reload.** The autosave loads at start-up; the phase is ready, never build.

### Input and gestures

- **Pointer handling.** Pointer Events on `#board`, with setPointerCapture and one pointer. pointerup, pointercancel and lostpointercapture end a stroke. A mouse shows the brush as a hover preview.
- **Hold time stands in for pressure.** Pressure, force and contact size are ignored. WebKit reports zero force for finger touches without 3D Touch; this was read in WebKit source, not verified on a device.
- **Gestures.** Pressing starts a stroke, holding deepens it, dragging ploughs. There is no tap/hold/swipe classifier (no-detector rule), no two-finger gesture and no pinch zoom.
- **Strokes.**
  - A stroke is {tool, size, ticks}; tool and size are fixed at pointerdown.
  - Positions are base-board coordinates quantized to 0.5 mm. A point is kept after 2 mm of movement.
  - Tick k is due 50 ms × k after pointerdown, whether or not the finger moves. It takes the points kept since the previous tick; with none, it stamps at the last point.
  - Each applied tick is stored as [α, path]. Ticks with α = 0 are not stored.
  - At most four ticks run per frame. A backlog carries over and is flushed on release, so the number of ticks depends only on how long the board was pressed.
- **Platform guards.** The shell suppresses user-select, touch-callout and tap highlights; dialogs lie outside it. In build, `touchstart`, `contextmenu` and `selectstart` on `#board` call preventDefault.
- **Toolbar.**
  - **Buttons.** Dig/Pile, size S/M/L, Undo, Reset, Done.
  - **Position.** In portrait it sits at the bottom edge, where it mostly covers the goal keep-out. In landscape and on wide screens it sits beside the board. A stroke cannot start under it, but a drag can continue under it.
  - **Keys.** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z does nothing. 1/2/3 set the size.
- **Feedback.** A finger hides 73–117 mm of board (estimate), so feedback sits on rings larger than the finger and in the toolbar.
  - A solid ring marks the dip radius R/√5 and a dashed ring the berm's outer edge R. The rings turn amber while the latest increment was limited.
  - Dashed rings mark the keep-outs.
  - The status line gives the flat-ground limit in millimetres at the current ball's scale, or “At the limit”.

### Terrain brush

**Kernel (“hat3”).** With support radius R and s = ρ²/R²:

h(s) = −a (1 − 5s)(1 − s)³ for s < 1, else 0.
∂h/∂s = a (1 − s)²(8 − 20s), ∂²h/∂s² = a (1 − s)(60s − 36).

- **Volume and smoothness.** Zero net volume, since ∫₀¹(1 − 5s)(1 − s)³ ds = 0. C² at the rim.
- **Shape.** Dig (a > 0) makes a dip that crosses zero at R/√5, with a berm of 0.216a peaking at 0.632R. Pile uses a < 0.
- **Why this kernel.** A two-cap “dip minus berm” kernel of the same footprint allows only half to two-thirds of the depth.

**Bounds and sizes.** Every tick keeps slope ≤ tan 14.6°, crest curvature ≤ 20 m⁻¹ and hollow curvature ≤ 50 m⁻¹ (D3).

| Brush | Radius R | Dip radius | Dig limit, level ground | Pile limit, level ground | Governing bound |
| --- | --- | --- | --- | --- | --- |
| S | 40 mm | 17.9 mm | 2.43 mm | 2.00 mm | crest |
| M (default) | 60 mm | 26.8 mm | 5.07 mm | 4.50 mm | slope (dig), crest (pile) |
| L | 90 mm | 40.2 mm | 7.61 mm | 7.61 mm | slope |

- **Units.** Limits are in steel-board units. The table-tennis board multiplies them by 4 and the billiard board by 5.715.
- **The hollow bound.** A single press never reaches it: the brush's hollow-to-crest curvature ratio is at most 16/13.16, below the bounds' ratio of 2.5. The bound remains a safeguard for stacked edits; a test reaches it by lifting the crest bound on its own instance.
- **Comparison.** The relief's Gaussians are 2.5–7.4 mm high with σ = 31–105 mm, and the contour interval is 2.46 mm. The board is drawn 51–66 mm wide on 390–430 CSS px viewports, so a 10 mm fingertip covers a board disc of 23–29 mm radius (estimate).

**Rate.**
- **Hold.** Each 50 ms tick deposits 1/40 of the tool's flat-ground limit, so a hold on level ground reaches it after 2 s (*proposed, to tune*).
- **Drag.** A tick's deposit is spread over ⌈L/(R/8)⌉ equal-arc stamps along its path of length L, so a slow drag ploughs deeper than a fast one. Ripple at R/8 spacing: 0.06% in height and 0.56% in crest curvature.

**Projection.**
- **What α is.** Each tick's increment δ is scaled by the largest α ∈ [0, 1] such that base + edits + αδ keeps these conditions at every check point:
  - slope ≤ max(tan 14.6°, current);
  - H + κc·I positive semidefinite, with κc = max(20 m⁻¹, current);
  - κv·I − H positive semidefinite, with κv = max(50 m⁻¹, current).
- **Existing violations.** “Current” lets points that already exceed a bound, such as the lip at 20.4 m⁻¹, stay there, but never worsens them.
- **How α is found.** Each point's feasible set in α is an interval containing 0. α is found by checking α = 1, then bisecting (24 steps) only at points that fail.
- **Check points.** 3 × 3 per changed cell, edges included, each on that cell's own polynomial, because the Hermite Hessian jumps at cell edges. Between check points the tests measured crest curvature up to 1.1% over the bound, and slope 0.04%.
- **Saturation.** A hold on already-dug ground often gets α = 0, so the ring turns amber and the status says so.
- **Every ball.** The bounds hold for every ball's field. Steel, rubber and cork share the base field. Table tennis and billiard differ from it only within the 83 mm goal blend, where scaledLevel adds a per-ball curvature correction, and the goal keep-out covers that blend.

**Keep-outs** (D7, base coordinates). The edit is exactly zero inside r₀, then fades to full strength over 30 mm with a C² ramp (*proposed, to tune*).

| Zone | r₀ | Reason |
| --- | --- | --- |
| Start (41, 67) mm | 25 mm | 18 mm flat shelf + r + 2 mm; newBall sets z = r |
| Goal (235, 568) mm | 86.6 mm | The 83 mm per-ball goal blend plus one cell diagonal (3.53 mm): the summit, the 3 s dwell and the 0.7 s summit time stay as validated for every ball |
| 2 holes | hole.r + 4 mm | Rim contact zone |

- **Where edits are zero.** Nodes inside r₀ are zero. Every cell lying wholly inside r₀ is therefore untouched, which covers radius r₀ − 3.53 mm.
- **Why the ramps are 30 mm.** A narrower ramp uses up the slope and curvature budget and blocks brushes well outside the ring. With 10 mm ramps, a large dig 7 cm from a hole reached only 18% of its limit.
- **Walls.** Walls need no keep-out, because a wall's base follows the local terrain.

**Edges.** A stamp within R of a board edge adds its mirror image across that edge; near a corner, three images. This conserves volume and keeps the edge level (zero normal slope). Truncation would leave up to 17–18% of the unsigned volume as net imbalance.

**Per-ball scaling.** Edits live in base (steel) coordinates. Every ball sees them through scaledLevel's wrapper, with heights × scale and curvature ÷ scale. The edit layer's nodes are exact because Hermite interpolation is linear in node data. Edits persist across ball, floor, wall and open-edge changes.

**Undo and reset.**
- **Undo** pops the last stroke and replays the list with the stored α. That costs about 0.074 ms per stored tick on the development Mac (590 ticks in 43 ms). Undo history is the stroke list, so it survives leaving the build phase and reloads.
- **Reset** clears the list, which restores the pristine field bit for bit. Reset is itself undoable, so there is no confirmation dialog.
- **Restart** keeps the edits.

**Persistence.**
- **Storage.** `localStorage` key `game-labs/marble-lab/sculpt/v<SCULPT_VERSION>/<seed>`, with every access in try/catch. Saved at stroke end, undo and reset; loaded at start-up.
- **Validation.** Loading checks the version, the seed, the tools, the sizes (own properties only), α ∈ (0, 1] and integer points on the board. A save that fails is ignored, not deleted, because every published stage shares one origin.
- **Versioning.** SCULPT_VERSION must be bumped whenever the brush, the bounds, the keep-outs or the relief change, because a stored α is valid only for what produced it.
- **Limits.** Autosave is a convenience only. All Game Labs games and stages share one 5 MiB quota, and Safari may evict data after 7 days without interaction.

### Objects and the open board (stage 09)

Stage 09 generalises the stage-08 walls to every object on a board (dist/objects.js).

- **Open board.** Same size as Saddle and Basin and perfectly flat.
  - **Contents.** The border (6r high), a start at (41, 67) mm and a goal ring of 15 mm radius at (235, 568) mm.
  - **No summit.** There is therefore no per-ball goal correction and there are no Sculpt keep-outs.
  - **Saves.** Its edits are saved under the seed `flat`.
- **Objects.** Start, goal ring, walls (border, low 10 mm, tall 30 mm, and the relief's pocket wall), holes, and sand or resin patches, in base coordinates.
- **Gestures.**
  - **Move.** Every object but the border moves.
  - **Turn and stretch.** A wall's handle, 85% along it, turns and stretches it about its box centre, in whole degrees and steps of 0.01.
  - **Resize.** The handle of a hole, patch or the goal ring sits 6 mm outside its rim, on the side that stays on the board. Dragging it away from or towards the centre changes the radius by that much; patches scale uniformly.
  - **Priority.** Only the selected object's handle is drawn and grabbed. It wins within about 24 CSS px, and only when the press is nearer to it than to the object's centre. Otherwise the body is taken, in this order: start, holes, goal ring, walls near their line, patches, walls within reach.
  - **Snapping.** Displacements snap to 0.5 mm, so a drag back to where it began changes nothing.
- **Add and remove.** ＋ Add opens a row of kinds. A new object goes at the board centre, or at the nearest place on a spiral that the rules accept and that does not cover another object of its kind. A full board says so. Holes, patches and non-border walls can be removed. The start and the goal ring cannot. Adding or removing ends any drag first.
- **Rules** (why): every layout stays playable for every ball size.
  - At most 12 movable walls, 12 holes and 10 patches.
  - The start stays on the board, with room for the largest ball.
  - The goal ring stays 12–40 mm in radius, on the board and 25 mm clear of the start.
  - Holes stay 8.25–25 mm in radius, never narrower than the largest ball (8 mm), on the board, 25 mm beyond their radius from the start and 5 mm from the goal ring.
  - Patches stay 8–80 mm in radius, with their centre on the board, and 25 mm clear of the start. Resin, and sand for some balls, holds a ball at rest against any tilt.
  - Where patches overlap, the one drawn on top (added later) applies.
  - Walls stay 20–350 mm long, on the board, 25 mm from the start and 12.5 mm beyond each hole's and the goal ring's radius.
  - A way from the start to the goal must remain for the largest ball. The check is a flood fill on a 4 mm grid, blocked near the border, near every wall except low walls (hoppable in full motion), and over holes. Its margin is widened by half a cell, so the path between two free cells never passes a wall tip closer than the ball's radius.
- **On Saddle and Basin.** The Sculpt keep-outs and the goal summit stay where the relief built them, even when the start, holes or goal ring move. The summit's per-ball correction stays at the built summit (level.summit).
- **Start height.** A ball starts on the ground: z = r + h(start) when the start sits on sculpted ground, and z = r on the relief's shelf, as before.
- **Saves.** Objects are saved per board under `board/v1/<seed>`, apart from the strokes, which stages 07 and 08 share for the relief. A stage-08 wall save is migrated once. Saved objects that break the rules, or touch the border, fall back to the board's own layout.
- **Drawing.** Patches are drawn axis-aligned, exactly where patchAt applies them. ⇅ moves the toolbar to the other edge wherever it covers the board: in portrait, one edge covers the start and the other the goal. Beside the board, in small landscape windows, it is hidden. On the flat board, contour levels are offset by half an interval, so no line sits where untouched ground meets an edit.

### Movable walls (stage 08; generalised in stage 09)

- **What moves.** Every wall except the border: the low wall and the pocket wall. Heights, kinds and materials never change, and a wall's foot follows the ground wherever it is put.
- **Pose.** A turn by a about the centre of the wall's bounding box, then a shift (dx, dy), in base coordinates. Poses are stored on a 0.5 mm grid and in whole degrees.
  - **Why the box centre.** The low wall's point centroid sits off-centre, at 180 mm on a 300 mm wall, and a turn about it pushed an end off the board.
- **Gestures.** With the Walls tool, a press within 20 mm of a wall and a drag move it. A press within 15 mm of its round handle and a drag turn it; the handle has priority.
  - **Handle position.** The handle sits 85% of the way along the wall, clear of the board edge and its system swipe gestures.
- **Rules.**
  - Points stay on the board; the 3 mm strip outside the border lines lies behind the border curtain.
  - Every wall keeps 25 mm from the start point and 12.5 mm beyond the radius of each hole and of the goal ring.
  - A way from the start to the goal must remain for the largest ball (8 mm radius at steel scale).
    - **Method.** A flood fill on a 4 mm grid, blocked within one ball radius of every wall except low walls, which a ball can hop in full motion.
    - **Why.** Without this rule, a legal turn of the pocket wall shut a 2× ball in at the start.
  - A drag moves a wall only after 4 mm of board or 2° of turn, so a tap is no move. A pose equal to the authored one removes the entry, and the level becomes the relief itself again.
  - A wall can't be dragged under the toolbar, so the point held stays reachable.
  - Walls may cross, as the authored pocket wall passes through the low wall; each segment collides on its own.
  - A drag that breaks a rule keeps the last valid pose and says why.
  - Moving a wall can open a tilt-only route or free the pocket trap. That is allowed on an unchecked board.
- **Undo, reset and saving.**
  - Wall moves share one undo history with strokes. Reset clears both and is itself undoable.
  - Poses are saved under their own key (`sculpt-walls/v1`). Stage 07 shares the strokes key and, saving, would drop anything it doesn't know.
  - Invalid saved poses are dropped, and the strokes still load.
  - The order of strokes and wall moves is not saved: after a reload, undo takes back wall moves, to the authored wall, before strokes.
- **Level and caches.** The level is the relief itself until a wall moves, then a copy with the moved walls. Each copy is a new object per wall change, so layouts cached per level object never go stale.
- **Redraw.** A moved wall redraws only the rectangle around its old and new place.

### Ball size (stage 08)

- **Range.** Materials & play sets 0.5–1.6× the nominal diameter in steps of 0.1. Changing it starts a new run.
- **Board.** The board keeps the nominal ball's scale, so holes (8.25 mm radius at steel scale), walls (10 and 30 mm high) and the goal ring (15 mm) keep their size.
- **Mass.** Solid balls keep their density (mass ∝ size³). The table-tennis shell keeps its wall (mass ∝ size²). The inertia ratio is unchanged.
- **Summit time.** Each size gets its own goal-curvature correction, keeping the 0.7 s summit time for every ball and size.
- **Memory.** Resized balls get a field that shares the relief's cells except within 87 mm of the goal: about 2 MB instead of 11 MB. At most four resized layouts stay cached per level.
- **Holes.** Every size stays narrower than the holes (1.65 reference radii).
  - **Why.** A wider ball would seat in the rim: the rim contact normal sits asin(a/r) from vertical, 56° at 2×, beyond any tilt. It would stay there, and the game has no stuck detector.
  - **Capture.** Smaller balls are captured more often and at higher speeds. In a scan of 0.1–1.5 m/s crossings, steel is captured up to 1.0 m/s at 0.5× and up to 0.52 m/s at 1.6×.
  - **Single speeds.** At any single speed, capture is not monotonic in size, because of rim bounces.
- **Goal.** A win needs the ball's centre within goal.r − r of the goal centre: 10 mm at nominal steel size, 7 mm at 1.6×.
- **Contact solver.** At 1.6× the Sculpt hollow bound reaches r·κ = 0.4 for every ball; the support solver was checked correct at 0.5.
- **Coverage.** Route acceptance covers the nominal sizes only.

### Sand pits (S2, planned)

- **Stamp.** h = −D q³ with q = 1 − ρ²/R² and R = √5·a, so the steepest ring sits at the visible radius a. The sand disc has radius 0.684a, the Relief pothole's sand-to-σ ratio.
- **Size.** a = 15–40 mm and D ≤ min(0.339a, 10.05 a²) in SI units: 2.3 / 4.0 / 9.0 / 13.6 mm at a = 15 / 20 / 30 / 40 mm (at crest 9.65; revisit under D3).
- **Rules.** Keep-outs are as for the brush. Registering pits as undrained exceptions amends design interpretation 4.
- **Physics facts for labels.**
  - At 8° a steel ball cannot start from rest even in flat sand; it needs 16.8°. Rubber needs 6.4°.
  - The reference pulse frees steel only from pits with a ≤ 20 mm, or with a = 30 mm and D ≤ 4 mm.
- **Drawing.** Patches must be drawn exactly as patchAt tests them. Today the drawing is rotated −0.15 rad while physics is axis-aligned (render.js, physics.js patchAt).

### Player barriers (not planned after D6)

- **Inventory** (*proposed*). Up to 4–6 straight walls, each 40–120 mm long, 300 mm in total. Height 2r or 6r, with the global wall material. The kind is never `border`, because open edges hides border walls.
- **Handles.** Move, rotate and resize, snapping to 2.5 mm and 15°. Endpoints within 5 mm join sealed.
- **Validity checks** (steel-board units):
  - **B1–B2.** Walls lie inside the border lines, and no segments cross.
  - **B3.** Every gap is either sealed (≤ 2.5 mm) or at least 2.5r = 12.5 mm. Gaps below 2r block every ball; exactly 2r passes only through the `d >= b.r` tie in resolvePolyline.
  - **B4–B7.** Walls keep 18 mm from the start, 20.75 mm from each hole and 27.5 mm from the goal. They also stay clear of the jump ellipse and of a landing ellipse still to be declared.
  - **B8.** A reachability flood fill must connect start to goal. It takes 18–51 ms.

### Rendering

- **Layers.** Floor texture (per surface and canvas size, cached whole, because it comes from a sequential RNG), then relief, then vector overlays: start, holes, goal, patches and walls.
- **Relief.** A 180 × 380 shading image and a 2.5 mm grid of contour heights, recomputed only inside the rectangle a brush tick changed (plus 4 mm). The result is composited into the base canvas under a clip aligned to device pixels.
- **Measured.** About 1.2 ms of JS for a 120 mm square, against about 15.5 ms for the whole relief.
- **Pixel identity.** Inside the clip, a partial redraw can differ from a full one in the anti-aliasing of vector edges. This is not visible.
- **Contours.** The interval is fixed per ball as (hi − lo)/8 of the unedited field, so an edit changes only its own contours. The last contour row no longer extends past the bottom edge.

### Engine changes

- **E1 Cell factoring.** `hermiteCell` and `sampleCell` were factored out of Heightfield with identical arithmetic. The edit layer (`EditField`) keeps its nodes as a Float64Array [h, dx, dy, dxy] (0.99 MB), refreshes only the cells around touched nodes, and uses an unrolled coefficient formula.
- **E2 Edit layer.**
  - **Where it lives.** One sparse layer of node deltas on the relief grid, in base coordinates. The app attaches it to the level as `edits`, and scaledLevel's wrapper adds it at sample time.
  - **Without edits.** With no edits, or outside edited cells, the wrapper returns exactly the unedited arithmetic. Scripts never attach edits.
- **E3 Level as input** (done for stage 08; see D4).
  - `layoutFor(material, level, radius)` caches layouts per level object (WeakMap) and radius.
  - `newBall(material, surface, wall, openEdges, {level, size})` gives the ball a non-enumerable layout, which `advance()` uses unless told otherwise.
  - The adjusted-field cache in scaledLevel is keyed on the relief field and radius, so a new level object does not rebuild the table-tennis and billiard fields.
  - The renderer draws walls, holes, start, goal and patches from its level, and `setLevel(level, rect)` redraws a rectangle.
- **E4 Determinism.**
  - **Replay arithmetic.** Stamps, mirror images, fades, stamp placement and rate use only + − × ÷, Math.sqrt, abs, min, max, floor, ceil and round, on quantized stroke input. tan 14.6° is a literal. A source-guard test enforces this.
  - **The projection.** It may use anything, because α is stored and replay never recomputes it.
  - **Result.** A saved board replays bit for bit in the browser that saved it. Across engines and CPU architectures it is expected but not confirmed: the keep-out centres come from the base landscape, whose last digits differ by engine.
- **E5 Unchanged Relief outputs.**
  - **The check.** With zero edits, relief-generation.json, relief-validation.json and relief-config.js must stay byte-identical. This is checked before each merge, not by `npm test`. On arm64, compare against a baseline made on the same machine before the change. On x64 Node 24, compare against the committed files.
  - **Why.** On arm64 even unchanged code differs from the committed files in 36 values of relief-validation.json and 6 of relief-generation.json (last digits only, no verdict changes). V8's transcendental Math differs by about 1 ulp between arm64 and x64; that this is the cause is inferred.
  - **For S1.** The same-machine check passed.

## Explicit interpretations and physical limitations

1. Clay is geometry, not soil: volume-conserving stamps (except in keep-out fades) with no slumping, grain flow or material memory. The bounds are model-validity limits, not a soil model.
2. Hold time stands in for pressure. No finger force is read.
3. Edited boards keep Relief's slope bound, a relaxed crest bound (20 m⁻¹) and a hollow bound (50 m⁻¹), on every ball's field. Contact holds to √(g(1/κ + r)) on a level crest: 0.73 m/s for steel at 20 m⁻¹, and more for the larger balls under similarity scaling. The hollow bound keeps r·κ ≤ 0.25. The support solver was checked correct at r·κ = 0.5 on one geometry, and regression tests cover 50, −20 and 100 m⁻¹.
4. Bounds are enforced on the interpolated field at 3 × 3 points per cell. Maxima between check points can exceed a bound slightly: 1.1% crest curvature, measured.
5. The ball never moves during editing, and leaving the build phase restarts the run. There is no moving-surface contact; S4 needs it.
6. Relief's drainage, pocket and bot evidence applies to the unedited board only. Player-made basins have no holes. Hole heights are read live from the field, so edits never leave a stale hole.
7. A bot failure is not evidence of impossibility. Bot success is not monotonic in the tilt budget: steel wins at 5°, 7° and 8° but times out at 6°. The ten seeded trials per ball have bit-identical times, so in effect they are one trajectory.
8. Ball trajectories and bot results are bit-identical only for the same engine build on the same CPU architecture.
9. There is no bot evidence that Saddle and Basin, edited or not, can be finished in tilt-only mode. Without the full-motion toss every ball stops at the low wall (0/3, also at 15° and with run-up speeds up to 1.3 m/s).
10. The press-disturbance data come from one phone lying flat on a table. Hand-held presses are unmeasured.
11. A moved wall changes what the level tests: the full-motion gate at the low wall and the pocket trap can disappear. An edited board is unchecked (D5).
12. Ball size is relative to the board. Rolling-resistance lengths and air drag follow the real ball size, not a similarity scaling, so a resized ball is a different physical scenario, not a rescaled one.

## Acceptance

### Checks

Done in S1 (tests in tests/sculpt.test.mjs, tests/presentation.test.mjs and tests/terrain.test.mjs):

- A1. With zero edits the Relief outputs are unchanged. Checked by hand against a same-machine baseline, as E5 requires.
- A2. Edit cells equal the shared Hermite construction, and local updates equal a full rebuild (h within 10⁻¹⁵ m, Hessian within 10⁻⁹ m⁻¹). Reset restores the field bit for bit.
- A3. The kernel has zero net volume, and a mirrored edge press conserves volume within 10⁻⁴ of ∫|Δh| dA with a level edge.
- A4. A random 24-stroke session, one seed, stays within 2% of max(bound, base) at 5 × 5 points per cell. A long hold with every brush reaches the slope bound and stops there. With the crest bound lifted, a narrow press reaches the hollow bound.
- A5. After heavy editing around start, goal and holes, every ball's field is unchanged within those keep-outs, including the whole goal blend. The 0.7 s summit test passes for every ball.
- A7. The source guard (E4).
- A9. Every ball sees the edits in its own units. The steel field equals the validated relief bit for bit without edits. Scripts see no edit layer.
- A11. A brush tick redraws a sub-rectangle of the shading image under a smaller clip, a full redraw covers everything, and the brush and keep-out rings are drawn.
- A12. An edited board is labelled; no wording says “validated” or “impossible”.
- Stage 08 (tests/walls.test.mjs, tests/presentation.test.mjs):
  - the authored walls pass the rules;
  - poses are rigid;
  - moves off the board, onto a hole, the start or the goal are refused;
  - a moved wall is where the ball collides, and the unedited level stays untouched;
  - undo, reset and reload restore wall poses exactly;
  - invalid saved poses are dropped;
  - ball size scales mass and size but not the board;
  - the 0.7 s summit time holds for every size;
  - resized layouts share the relief's cells and stay few;
  - holes capture smaller balls more often and faster, and the largest ball can't get stuck;
  - a way from start to goal remains for the largest ball;
  - wall poses save apart from the strokes, and a bad saved pose drops only its own wall;
  - a moved wall redraws only its rectangle, and handles are drawn.
- Also tested: stroke loading refuses other levels and malformed or inherited data; the keep-out fade has consistent node derivatives; a dug hollow holds a released ball that rolls away on the unedited slope; support-solver curvature regressions.

Open:

- A4. Several seeds, with presses and drags, on every ball's field.
- A6. Bundled reference strokes with a golden hash of the edit layer.
- A8. The deposit per second of hold does not depend on the frame rate (simulated 30, 60 and 120 Hz frames, and a backlog).
- A10. The build-phase state logic is factored out of app.js and tested against the transitions above.
- A13 (S2). B1–B8 reject a 2r gap and an enclosed start. Barrier kind is never `border`.
- A14 (S3). The planner plus bot finish the unedited board for all five balls and a board with a barrier across the authored corridor. The enclosed-start board is rejected.

### Performance (M1 Pro, Node 25.9; phones pending)

| Item | Measured | Budget |
| --- | --- | --- |
| Brush tick, press, S / M / L | median 0.9 / 1.7 / 3.5 ms; p95 1.7 / 3.1 / 6.4 ms | one tick ≤ 50 ms on the slowest phone (*proposed*) |
| Brush tick, drag at M, 30 / 100 / 250 mm of path per tick | median 2.6 / 3.9 / 7.5 ms; p95 3.7 / 4.4 / 14.3 ms | same |
| Dirty-rectangle relief redraw (120 mm square, JS only) | ≈ 1.2 ms | ≤ 2 ms (*proposed*) |
| Replay for undo and reload | 0.074 ms per stored tick (590 ticks: 43 ms) | ≤ 150 ms (*proposed*); not capped yet |
| Full relief redraw (JS only) | ≈ 15.5 ms | ≤ 100 ms (*proposed*) |
| Edit layer during play | +24 ns per terrain sample outside edited cells, +62 ns inside | ≤ 1 ms per frame |

Phones are estimated at 0.8× (recent iPhone) to 3.4× (budget Android) of this Mac's speed, from Geekbench single-core ratios; allow up to 6×.

### Phone rows (all pending; also in acceptance.md)

| Measurement | Phone 1 | Phone 2 |
| --- | --- | --- |
| Board width on screen; fingertip size on the board | Pending | Pending |
| Press and drag with the phone held: in-plane acceleration and tilt shift | Pending | Pending |
| Hold-to-depth feel; ring and limit colour visible around the finger | Pending | Pending |
| Brush tick time and frame intervals during a stroke; full redraw after undo | Pending | Pending |
| Long press: selection, callout, loupe, context menu, pointercancel near screen edges | Pending | Pending |
| Autosave survives an app switch and a reload | Pending | Pending |
| Edited board: play in tilt-only and in full motion | Pending | Pending |
| Walls tool: grabbing a wall and its handle with a finger; drag feel | Pending | Pending |
| Ball size: smallest and largest balls visible and controllable | Pending | Pending |

### Endorsement

- [ ] Relief two-phone gate completed.
- [ ] Sculpt phone rows recorded honestly.
- [ ] U. Warring endorses Task Card Sculpt.

No automatic endorsement, fabricated measurement, unlabelled player board, or second playable level before the two-phone gate.

## Deferred and out of scope

- **Live editing.** Live sculpting and live barriers (S4, own card).
- **Resin.** Placing resin: it is an absolute tilt-only trap and a provisional profile, and would in effect be a new selectable material.
- **Level geometry.** New or removed holes; moving the start or goal; movable border walls; free wall heights; per-wall materials; player-declared jump regions; new patch kinds.
- **Eraser.** An eraser that smooths back to the original: its increment depends on the current edits, so it needs its own replay and volume rules.
- **Other input.** Pressure input, two-finger gestures, a pinch magnifier.
- **Share links (S3).** A typical 30-stroke session is an estimated 830–1,035 characters as base64url of deflate-raw binary, before the stored α.

## Found while preparing this card (Relief, outside Sculpt)

These were observed in scratch runs on 26 September 2026 that are not recorded in the repository. Each needs a committed probe or test before it is cited elsewhere. Fixes belong in separate maintenance commits.

- **Evidence reproduction.** The committed relief-*.json reproduce byte for byte on x64 Node 24.21 (under Rosetta), not on arm64 Node 24.21 or 25.9 (E5).
- **Tilt-only play.** The Relief bot does not finish the board without the full-motion toss (interpretation 9).
- **Pocket.** pocketTrial still passes with the pocket wall removed. With the wall in place, a diagonal 8° tilt frees steel in 0.6 s, and pumping along x frees it in about 1.2 s.
- **Patches.** They are drawn rotated but tested axis-aligned (render.js, physics.js patchAt).
- **Stale text.** write-model-notes.mjs hard-codes “All five passed 10/10.” README.md says the publish sequence checks syntax and DOM wiring, but Game Labs CI runs `npm test` and a local-reference check only.
- **Resting creep.** The iPhone export predates the gravity-sign fix. Recomputed with sign −1 (phone lying flat), its full-motion noise at rest (in-plane p90 0.023–0.030 m/s²) is above the steel/wood rolling onset of 0.016 m/s², so a resting steel ball may creep in full motion.

## Measurements behind this card

Measured on 26 September 2026 on an Apple M1 Pro with Node 25.9.0 (arm64), unless stated otherwise. Rows marked with a test are reproduced by `npm test`; the rest come from scratch scripts that are not in the repository.

| Quantity | Value | How |
| --- | --- | --- |
| Heightfield grid | 120 × 254 cells, sx 2.5000 mm, sy 2.4934 mm, 30,855 nodes | terrain.js (ceil of width and height over 2.5 mm) |
| Full Heightfield rebuild | 37–66 ms (warm medians 39.6–44 ms) | four independent scratch runs |
| hat3 closed forms at crest κ | dig A_max = κR²/13.16; pile A_max = κR²/16; maximum slope 3.09 A/R | analytic; test “flat-ground limits” |
| Single fingertip press at crest 9.65 | 0.46 mm deep (R = 25 mm) | closed form |
| Lift-off speed at crest κ, steel, level | 1.032 m/s at 9.65; 0.735 m/s at 20 m⁻¹ | √(g(1/κ + r)), reproduced by normalAcceleration |
| Goal correction, table tennis / billiard | up to 2.72 / 3.42 m⁻¹ of crest curvature, 75 mm from the goal | scaledLevel; the reason for the 86.6 mm goal keep-out |
| Crest excess between check points | ≤ 1.1% of the bound | test “projected edits stay within …” |
| Unprojected 300 presses | slope 53°, crest 113, concave 122 m⁻¹ | random session, R 25–80 mm |
| supportAt on a concave bowl, r = 5 mm | correct at 100 m⁻¹; 0.34 mm false gap at 150 | ball 2 mm off-centre in a paraboloid |
| Base field maxima outside the lip | crest 9.46 m⁻¹, slope 13.07°, concave 11.3 m⁻¹ | 3 × 3 and 5 × 5 per cell |
| Hard keep-out brush-centre share | 35% at M with all six zones | 2 mm centre grid, mirrored edges |
| Tap disturbance, phone flat | in-plane 0.69 / 0.28 m/s²; tilt 0.83 / 0.31° | pre-fix iPhone export recomputed with gravity sign −1 |
| Steel/wood rolling onset | 0.016 m/s² (0.09°) | g·min(b₀/r, μs) |
| Board on screen | 51–66 mm wide; 4.6–5.9 board-mm per screen-mm | headless Chrome layout × published ppi (estimate) |
| Contour interval | 2.456 mm (range −12.65 to +6.99 mm) | render.js over the steel field |
| Committed vs regenerated evidence | arm64: 36 + 6 numeric leaves differ; x64 Node 24.21: identical | cmp and a JSON leaf diff |
| Cross-engine Math | exp, sin, cos, tan, atan2, hypot, cbrt, `**` differ by 1–2 ulp; sqrt identical | 4,000 inputs per function in Node, Chrome 153, Firefox 156, JavaScriptCore |
| Low-wall edits | ±2 cm in y: rubber 0/3; 2 cm sideways: tilt-only route 3/3 while the bot passes | runRoute plus a fixed tilt-only route |
| Sand start tilt, steel / rubber | 16.8° / 6.4° | granularState and the held rule |
| Brush tick, replay and redraw costs | as in Performance | scratch timing of the final code |
