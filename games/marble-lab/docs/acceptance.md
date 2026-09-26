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
| 30° tilt over 0.3 s: unintended in-plane acceleration below 0.3 m/s² | Pending | Pending |
| Flick/toss repeatability at delivered sample rate | Pending | Pending |
| Reference pulse and pocket escape | Pending | Pending |
| Route in tilt-only and full motion | Pending | Pending |
| Rotation, pause/resume, permissions, viewport and performance | Pending | Pending |
| Visual contrast, contours, wall heights and sound | Pending | Pending |

Use Diagnostics → Clear motion → select scenario → perform motion → Export motion JSON. Record stationary baseline, fast tilt without intended translation, in-plane pulses and upward flicks. The export includes event/frame timing. Review raw exports before committing: they contain browser/device metadata. Observed peaks alone cannot establish accelerometer range. Browser timestamps cannot establish physical sensor-to-pixel latency.

If short flicks are unreliable at delivered rates, investigate longer waveforms rather than adding gesture detection. Keep full-motion fatigue and the tilt-only fallback in the physical play test.

## Endorsement

- [ ] Both phone results reviewed and recorded honestly.
- [ ] Actual visual/audio/performance checks completed.
- [ ] U. Warring endorses Task Card Relief to v1.0.

No automatic endorsement, fabricated measurement or second playable level.
