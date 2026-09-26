# Relief acceptance and remaining work

Status: **v0.1 draft, unendorsed**. No physical-phone results have been supplied. Automated results are evidence for the model, not real-device certification.

## Completed software evidence

- [x] 93 automated regression checks at the published Relief source commit.
- [x] Intended steel/wood route: 10/10 at 8°.
- [x] Other four balls on wood: each 10/10 with seeded initial perturbations.
- [x] Deliberately blocked handmade level rejected.
- [x] Terrain slope/curvature/pass checks, basin holes and rigid-body drainage record.
- [x] Finite-stop toss, ballistic wall table, resin, pocket pulse, gravity subtraction, support-load and crest regressions.
- [x] Explicit null phone measurements and no endorser in the acceptance record.

## Two-phone gate

Prefer iPhone Safari and Android Chrome, including a lower-spec/no-gyroscope Android if available.

| Measurement | Phone 1 | Phone 2 |
| --- | --- | --- |
| Device / OS / browser | Pending | Pending |
| Delivered acceleration rate and intervals | Pending | Pending |
| Observed axis peaks / suspected clipping | Pending | Pending |
| Independently documented hardware range, if available | Unknown | Unknown |
| Stationary baseline and pitched calibration | Pending | Pending |
| Gravity sign at calibration (spec / reversed) and rest residual | Pending | Pending |
| 30° tilt over 0.3 s: unintended in-plane acceleration below 0.3 m/s² | Pending | Pending |
| Flick/toss repeatability at delivered sample rate | Pending | Pending |
| Reference pulse and pocket escape | Pending | Pending |
| Route in tilt-only and full motion | Pending | Pending |
| Rotation, pause/resume, permissions, viewport and performance | Pending | Pending |
| Visual contrast, contours, wall heights and sound | Pending | Pending |

Use Diagnostics → Clear motion → select scenario → perform motion → Export motion JSON. Record stationary baseline, fast tilt without intended translation, in-plane pulses and upward flicks. The export includes event/frame timing. Review raw exports before committing: they contain browser/device metadata. Observed peaks alone cannot establish accelerometer range. Browser timestamps cannot establish physical sensor-to-pixel latency.

The first iPhone export (26 September 2026, phone lying flat) showed the reversed WebKit gravity sign: full motion read about −2g up at rest. Calibration now measures the sign; the phone measurements above still have to be repeated with the corrected build.

If short flicks are unreliable at delivered rates, investigate longer waveforms rather than adding gesture detection. Keep full-motion fatigue and the tilt-only fallback in the physical play test.

## Sculpt v0.1 (S1, terrain editing)

Status: **draft, unendorsed**. Software evidence only.

- [x] Brush and edit layer: volume, derivatives and flat-ground limits; local updates equal to a full rebuild; bit-identical sampling without edits; every ball sees the edits in its own units. A source guard keeps engine-approximated Math out of the replay path.
- [x] Bounds after a random 24-stroke session stay within 2% of their bounds at 5 × 5 points per cell. The worst case is crest curvature 1.1% over, between the 3 × 3 check points. A long hold with every brush stops at the slope bound. With the crest bound lifted, a narrow press stops at the hollow bound.
- [x] After heavy editing around start, goal and holes, every ball's field is unchanged within those zones, including the whole goal blend. The 0.7 s summit test passes for every ball.
- [x] Mirrored edge presses conserve volume, and the keep-out fade has consistent node derivatives. Undo, reset and reload replay bit for bit. Stroke loading refuses foreign, malformed and inherited data.
- [x] A dug hollow holds a released steel ball that rolls away on the unedited slope. A brush tick redraws only its rectangle, and the brush rings are drawn.
- [x] The code was reviewed adversarially (core, integration and rendering, app, tests), and each finding was re-checked by a skeptic. Confirmed findings were fixed, and the mutants they described now fail the tests.
- [ ] Not yet: several fuzz seeds on every ball's field; reference strokes with a golden hash; frame-rate independence of the deposit; tests for the build-phase state logic. See the task card.
- [x] With no edits, regenerated relief-generation.json and relief-validation.json are byte-identical to a baseline generated before the change on the same machine (arm64, Node 25.9). The committed relief evidence is unchanged.
- [x] Driven in headless Chrome with emulated touch: dig, pile, drag, undo, reset, Done, play, reload with autosave. No page errors.

- [x] Movable walls and ball size:
  - placement rules and rigid poses, including a way from start to goal for the largest ball;
  - a moved wall is where the ball collides;
  - undo, reset and reload restore wall poses;
  - wall poses are saved apart from the strokes, which stage 07 shares;
  - a bad saved pose drops only its own wall;
  - mass and size scaling, and the 0.7 s summit time at every size;
  - smaller balls are captured by holes more often and up to higher speeds, and the largest ball can't get stuck;
  - resized layouts share the relief's cells and stay few;
  - moved walls redraw locally.
- [x] With the level as an input and nominal sizes, the regenerated relief evidence is byte-identical to the same-machine baseline.

| Measurement | Phone 1 | Phone 2 |
| --- | --- | --- |
| Board width on screen; fingertip size on the board | Pending | Pending |
| Walls tool: grabbing a wall and its handle with a finger; drag feel | Pending | Pending |
| Ball size: smallest and largest balls visible and controllable | Pending | Pending |
| Press and drag with the phone held: in-plane acceleration and tilt shift | Pending | Pending |
| Hold-to-depth feel; brush ring and limit colour visible around the finger | Pending | Pending |
| Brush tick time and frame intervals during a stroke; full redraw after undo | Pending | Pending |
| Long press: selection, callout, loupe, context menu, pointercancel near screen edges | Pending | Pending |
| Autosave survives app switch and reload | Pending | Pending |
| Edited board: play in tilt-only and full motion | Pending | Pending |

## Endorsement

- [ ] Both phone results reviewed and recorded honestly.
- [ ] Actual visual/audio/performance checks completed.
- [ ] U. Warring endorses Task Card Relief to v1.0.
- [ ] Sculpt phone rows recorded honestly; U. Warring endorses Task Card Sculpt.

No automatic endorsement, fabricated measurement or second playable level. An edited Saddle and Basin is a labelled variant of the one level.
