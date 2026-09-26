# Marble Lab — Relief v0.1 and Sculpt v0.1 (drafts, unendorsed)

Owner: Ulrich Warring. [Development history](CHANGELOG.md) · [Design decisions](docs/design-decisions.md) · [Sculpt task card](docs/task-card-sculpt.md) · [Remaining acceptance gates](docs/acceptance.md) · [Working with this repository](CONTRIBUTING.md)

Mobile browser game, static HTML/CSS/ES modules, no runtime dependencies or sensor uploads. Part of [Game Labs](../../README.md): the current build and every development stage are playable at https://uwarring82.github.io/game-labs/marble-lab/. Both task cards are implemented as drafts. U. Warring's endorsement and both physical-phone acceptance runs remain outstanding.

## Play

Enable tilt → permit motion → hold a comfortable pose → Calibrate → Play. Materials & play offers Motion: tilt only / full and a comfortable tilt limit, default 8° (4–15°). Full motion applies device linear acceleration directly. Calibration also measures the sign of the phone's gravity reading (iPhones report it reversed); if the reading matches neither sign, full motion stays off and the settings say why. A persistent play-time button switches back to tilt only. Touch and keyboard supply tilt only. No gesture, toss, shake or stuck-state detectors exist.

Saddle and Basin is the sole playable level: continuous relief, drainage holes, three to five passes, a low curved wall, a walled dip, a sandy pothole, resin and a goal summit. Hold the whole ball inside the goal ring for three simulated seconds (centre within 2r). Open edges removes the outer walls and preserves the finite board drop/restart.

Sculpt ends the current run and reshapes the board; Done starts a new run. Pressing digs a hollow and pushes up a low rim (Pile does the opposite); holding deepens it and dragging ploughs a furrow. Three brush sizes, Undo and Reset. Each brush tick is limited so slopes stay at or below 14.6°, crests at or below 20 m⁻¹ curvature and hollows at or below 50 m⁻¹. Edits fade out around the start, the hole rims and the goal with its surroundings, which stay as they are. With the Walls tool the low wall and the pocket wall can be dragged to a new place or turned by their round handle. The border stays, walls keep clear of the start, the holes and the goal, and a way from the start to the goal must remain for the largest ball. An edited board is labelled, is saved in the browser and has not been checked by the route bot.

Materials & play also sets the ball size, 0.5–1.6× the nominal diameter. The board keeps its size, so smaller balls drop into holes more often and at higher speeds. Every size stays narrower than the holes, so a ball can never get stuck in one. Solid balls keep their density; the table-tennis shell keeps its wall. Level acceptance covers the nominal sizes.

## Sources and modules

- `dist/physics.js`: the level is an input (relief or an edited copy) and each ball carries its layout; ball size relative to the board; sphere translation/spin, unilateral surface contact, finite-height polyline curtains/top rims, Coulomb grip/slip, local rolling and torsional loss, granular load, ballistic flight, hole/edge capture, goal dwell, fixed clock.
- `dist/motion.js`: orientation-derived specific-force subtraction, screen mapping, event-time alignment, held samples, 3g vector cap, stale-sample expiry, diagnostic recording. Does not use DeviceMotionEvent.acceleration. Specific force is +g along z at face-up rest in the spec and −g on iPhone (WebKit); the sign is measured at calibration, not inferred from the browser.
- `dist/terrain.js`: C1 bicubic Hermite field, its consistent gradient/Hessian, normal-offset sphere geometry. Older compact terrain survives only as a test fixture.
- `dist/landscape.js`: seeded Gaussian/warped landscape, slope/crest-bounded construction, topology and gradient-flow drainage, local patches, material scaling and 0.7 s goal-curvature reference.
- `dist/relief-config.js`: generator-selected seed; no second level selector.
- `dist/walls.js`: movable authored walls: poses (turn about the box centre, then shift), handles and the placement rules.
- `dist/sculpt.js`: player edits as node deltas on the relief's Hermite grid (read by every ball's field), zero-volume clay brush, mirrored board edges, keep-out mask, per-tick projection onto the slope/crest/hollow bounds, stroke record with bit-identical replay for undo, reset and reload.
- `dist/materials.js`: fixed scenario coefficients, 5 balls × 4 floors × 2 wall materials, and spatial resin/sand patch profiles. Steel/rubber/cork reference radius is now 5 mm; shell/billiards retain physical dimensions and enlarge the board.
- `dist/render.js`, `viewport.js`, `sound.js`: cached floor texture and fixed-light relief/contours (redrawn only where a Sculpt edit changed them), material texture, polyline height cues, shadow on ground projection, actual spin, safe areas/DPR≤2, and contact-driven audio/haptics.
- `dist/model-notes.html`, `material-parameters.json`: active equations, all contact coefficients, assumptions, sources, scope and measurement gates.

## Verification and generation

`node scripts/generate-relief.mjs` considers deterministic candidates. Geometry and pocket gates precede bot pilots and 10-trial suites; failure rejects a candidate. It preserves the previous seed if none pass. It also verifies that a handmade tall enclosure around the start is rejected by the bot. It writes `relief-generation.json` and the chosen seed.

`node scripts/validate-relief.mjs` validates the selected level and writes `relief-validation.json`. The route must cross 3–5 saddle neighbourhoods and contain an uphill slope above the 8° budget, not merely have steep terrain elsewhere. It checks actual rigid-body drainage releases with holes removed, pocket confinement/escape, 10/10 intended-ball completion and ≥7/10 for the hardest tested ball.

Acceptance scope is all five balls on hardwood, not every whole-board floor swap. Trials perturb initial position; they are not a phone latency/noise model or independent human trials. Bot acceleration is allowed only inside declared jump regions. It supplies acceleration waveforms, never a ball velocity or jump flag. The 0.65√s m/s carried-speed fixture is stronger than the task card's illustrative 0.4 m/s motion, for a physically sufficient finite-stop jump.

`npm test` runs 126 checks. Forty legacy maze routes remain as non-playable regression fixtures for material mechanics. Relief has its own acceptance trials and tests for gravity removal, the gravity sign check (including a recorded iPhone export), sample holds, finite-stop toss, load-dependent grip, 3×3 jump table, resin, confinement, drainage and summit tuning. Sculpt has tests for brush volume and derivatives, every ball seeing the edits in its own units, the slope, crest and hollow bounds, untouched keep-outs, mirrored edges, bit-identical undo/reset/reload, stroke loading, a hollow that holds a ball, and the dirty-rectangle redraw. Walls and ball size have tests for the placement rules, collisions at the moved wall, undo/reset/reload of wall poses, mass and size scaling, the summit time at every size, and hole capture across sizes. Drawing/audio tests use API doubles, not actual pixels or listening.

`node scripts/write-model-notes.mjs` regenerates the notes and coefficient ledger from the active code and acceptance record. Run after validation. The publish sequence also checks JavaScript syntax, DOM wiring and local asset references.

## Explicit interpretations and physical limitations

- Solid balls obtain 5/7 from contact; hollow balls obtain 3/5. Gravity magnitude is preserved under virtual tilt, and measured linear acceleration is subtracted in board coordinates. A minimal yaw-free rotation aligns physical with calibrated virtual gravity and rotates acceleration identically, preserving free fall at pitched neutral.
- Relative velocity is zero at separation from a carried board. It develops during the board's deceleration. A 0.4 m/s, uniform 30 ms stop gives about 2.15 mm separation above the final board, versus 8.15 mm for an instantaneous stop. Synthetic regression uses the finite waveform.
- Euler, Coriolis, centrifugal and sensor lever-arm terms are omitted. Full motion means the specified translational approximation plus virtual tilt, not full six-DOF dynamics.
- DeviceMotion exposes no hardware range. Flat tops are only suspected clipping; observed axis peaks are lower bounds. The engine never boosts acceleration from a guessed sensor range.
- Broad drainage basins get holes. The confinement pocket and sandy pothole are deliberately undrained; otherwise they cannot act as traps.
- The pocket test checks constant exit-directed 8° tilt for 30 s followed by one 5 m/s², 0.1 s pulse. It does not prove impossibility of escape under every possible resonant tilt sequence.
- The resin patch is a spatial provisional contact profile. It adds no selectable material or nonphysical latch. Sand has estimated instantaneous load-dependent penetration, no grains or terrain memory.
- C1 cells have small curvature discontinuities. The lip is a declared exception to broad wavelength/crest-radius bounds. All force derivatives come from the same interpolated height potential.
- Most contact coefficients are estimates. Billiard reference coefficients are traceable literature/software values, not calibration of this board or curtain geometry.

## Two-phone gate

On each phone use Diagnostics → Clear motion → choose scenario → perform motion → Export motion JSON. Record stationary baseline, 30° tilt in 0.3 s without intended translation, in-plane pulses and upward flicks. Inspect leakage (<0.3 m/s² target), sample timing, caps and possible clipping. Play the route in tilt-only and full modes. Phone recordings stay local until exported; there is no telemetry or inferred pass result.

Both phone entries in the acceptance record remain pending, with null measurements and no endorser. Browser visual inspection and real-device permission, performance, sound and motion testing were unavailable in this execution environment. No second level is exposed before those gates. An edited Saddle and Basin is a labelled variant of the one level, published before the gates with U. Warring's go-ahead of 26 September 2026.
