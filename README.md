# Marble Lab — prototype 01

One top-down maze, acceleration control, realistic momentum with forgiving geometry. Plain static HTML, CSS and JavaScript; no runtime dependencies, account database, analytics or sensor uploads. The hosting service may independently require sign-in because this Site starts private.

## Play

Open the HTTPS Site directly in Safari or Chrome. Touch is immediately available: Play, then drag the pad to accelerate; release coasts. Arrow keys / WASD also steer; Space pauses. For motion: Enable tilt → accept access → hold comfortably → Calibrate → Play. A 35° pitched neutral is supported. Large neutral inclinations are rejected to avoid Euler singularities. Settings offers Classic / Forgiving, sensitivity, 0–30 ms smoothing and fullscreen / orientation lock when supported. Rotating the screen pauses and requests a fresh calibration. Hiding or blurring the page pauses; resuming is explicit.

Permission requests are made synchronously from the Enable tilt click. Orientation permission is required; motion permission is requested concurrently when that API requires it, for optional rotation-rate diagnostics. A refusal preserves touch play. Browser policies vary: after denial, check motion/site permissions; Safari may require clearing this site's data. A containing frame must delegate `accelerometer; gyroscope` (and potentially magnetometer when the browser uses absolute-orientation fallback); the parent Permissions-Policy must allow this origin. The child cannot grant itself permission. Direct top-level navigation is the supported first test path.

## Model and known approximations

- Calibration subtracts beta and gamma separately, wraps angular differences, ignores alpha, then rotates control axes by the displayed screen angle. It does not form a relative-attitude quaternion. This defines the virtual board control law around the chosen neutral; it is not an exact finite-angle inclined-board reconstruction for arbitrary poses.
- 300 × 360 mm virtual board, 7.5 mm ball radius. Driving acceleration `(5/7) g sin(tilt) × sensitivity`; each control component saturates at ±18°. No translation/shake forces and no spin state.
- Classic: linear damping 0.12/s, constant rolling deceleration 0.0015 g, wall normal restitution 0.32, tangential velocity loss 3.5%. Forgiving: 1.5/s damping, restitution 0.20, tangential loss 5.5%, 3 mm additional hole margin. Both remain acceleration-controlled. These are tuning parameters, not measured steel/wood material properties.
- Maximum speed 0.85 m/s. Physics is fixed at 240 Hz; internal steps restrict maximum displacement to one-quarter radius. Circle/rectangle wall contacts resolve three times per internal step. No swept exact wall solution is needed at this bounded displacement.
- Hole capture accumulates the time along each segment inside `hole radius − ball radius − preset margin`. Capture occurs at `sqrt(2h/g)` with an effective catch depth `h = 4 mm`. A fast traversal can leave before capture. This finite-chord, free-fall criterion uses a conservative full-clearance disk. It omits partial support, detailed sphere/rim contact, bounce, and the changing normal gravity component: it should not be represented as a validated real wooden-toy simulator.
- A frame gap contributes at most 50 ms; no more than 12 physics ticks per frame. Long frames slow simulation rather than teleporting the ball. Hidden time is discarded. The timer counts integrated simulation time, not a competitive wall-clock result.

## Diagnostics and phone acceptance checks

Diagnostics pauses the game but keeps reading and filtering tilt. It plots raw and filtered X/Y over five seconds and exports a bounded CSV of event/frame timestamps (up to 12,000 records). Sensor data and logs remain in the browser unless the user downloads them. Event cadence may be change-driven. Rotation-rate availability does not establish which hardware is present or which fusion algorithm is used. Browser timestamps measure delivery and age; physical motion-to-pixel latency requires an external reference, e.g. high-speed video.

Test on iPhone Safari and Android Chrome, preferably including an Android without a gyroscope:

1. Grant / decline permission; verify touch remains fully usable after decline. In-app/iframe access is not assumed.
2. Calibrate around beta = 35°, hold tilt fixed and turn in the chair. Check zero drift and lateral/longitudinal gains. Repeat flat for comparison.
3. Verify steering direction in portrait, inverted portrait and both landscape orientations. If the browser does not rotate to one of these, it cannot be tested just by turning the hardware. Orientation changes pause and require recalibration.
4. Compare quick tilt steps at filter constants 0, 20 and 30 ms. Export timing records. Do not identify the displayed JS event age with sensor latency.
5. Check low-speed hole capture versus fast skipping, wall/corner collisions, coast and counter-tilt braking.
6. Switch apps for several seconds, then return. Marble position and timer must remain paused until Resume. Touch the screen during play: the page must not scroll or refresh.

## Validation

Run `npm test` (Node's built-in runner; no install). Tests cover pitched calibration, rotation mapping, acceleration/coast/braking, wall and corner tunnelling, speed/impact-parameter hole capture, fixed-step frame-rate independence, pause/clamp handling, filtering, and a full controlled route through the maze. Syntax is checked with `node --check dist/app.js` and `node --check dist/physics.js`.

Physical phones have not been tested in the build environment. No browser UI validation is claimed. Optional WebMCP tools are feature-detected on `document.modelContext`; supported-context validation is unavailable here.

Browser APIs: [W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/), [W3C Screen Orientation](https://www.w3.org/TR/screen-orientation/), [WebKit permission notes](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/).
