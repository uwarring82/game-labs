# Marble Lab — material model 03

One top-down maze with phone tilt, touch steering and keyboard controls. Static HTML/CSS/JavaScript; no runtime dependencies, analytics, or sensor uploads. The Site remains private.

## Player controls

Enable tilt → allow access → hold a comfortable angle → Calibrate → Play. Touch is available immediately. A touch-pad displacement sets virtual tilt (a cubic radial response gives fine centre control), not velocity. Arrow keys / WASD supply 16° virtual tilt. Phone tilt is relative beta/gamma, independent of alpha, with screen-axis remapping and recalibration after a screen rotation. Tilt magnitude is limited to 28°; gravity magnitude stays 9.81 m/s². Hiding or blurring the page pauses until Resume.

Materials replaces Classic/Forgiving presets, damping, sensitivity and filter sliders. Choose steel, bouncy rubber, hollow table tennis, cork or billiard resin; wood, sand, ice or baize; and independent hardwood walls or passive rubber bumpers. Changing materials resets the run. Steel/rubber/cork have 15 mm diameter, table tennis 40 mm and billiards 57.15 mm. Maze geometry scales with radius; board dimensions appear in Materials. Hole rims stay hardwood. All 40 combinations are available. The input filter is fixed at 15 ms.

## Physics

Source: `dist/physics.js`. Fixed profiles: `dist/materials.js`. Parameter ledger, equations, references, limitations and an experimental calibration plan: `dist/model-notes.html` (linked from Diagnostics).

The ball has position, velocity, angular velocity, mass, isotropic inertia and a visual quaternion. Coulomb contact impulses determine rolling/sliding; normal and tangential restitution determine impact response. Rolling loss is a contact moment, with separate torsional resistance. Sand adds estimated density-dependent penetration, a plough force, a rolling moment and inertial drag. Quadratic air drag applies to all balls with fixed rho=1.225 kg/m³ and Cd=.47. Shell inertia is 2/3 mR². No global damping and no speed clamp remain. Internal steps are at most 1/960 s and restrict displacement to R/5. The public fixed clock remains 240 Hz and clamps long frame gaps to 50 ms.

Sphere–box contacts include finite wall height; forward roll at a wall can produce a hop. Hole capture now comes from free fall and geometric rim / cylindrical-wall contact. It supersedes the v1 chord-time / 4 mm catch-depth heuristic. Capture occurs when the centre is more than one radius below the aperture. Clearing the outer frame ends a run.

### Evidence status

This is a physically structured, literature-informed prototype, **not an experimentally calibrated digital twin**. Most numerical contact coefficients are estimates; billiard/baize uses pooltool reference defaults muK=.2 and horizontal rolling deceleration=.01g, while billiard/rubber borrows e=.98 and impact friction=.14 from Mathavan et al. These do not calibrate the maze or reproduce regulation cushion geometry; no exact steel-on-wood or rubber-on-wood measurements were available for the specified specimens. Density and geometry have explicit SI values. The granular penetration scaling is taken from a glass-bead experiment, while transfer to sand, finite-depth clipping and resistance prefactors are provisional extrapolations. Sand depth is 5 mm; its deformation state enters resistance, not a dynamically depressed support surface. Individual grains and evolving terrain are absent. The restitution interpolation is not a fitted constitutive law for wood/sand.

Calibration requires measured ball mass/diameter, named wood/finish/backing, and defined sand grain distribution, packing, moisture and depth. Fit coast-down, sliding, normal rebound and oblique spin-impact observations; check predictions on held-out tracks. See model-notes.html for details and primary sources.

## Diagnostics

Raw/filtered tilt, browser timing and simulated contact regime, slip, spin, height, kinetic energy and estimated sinkage. CSV includes material identity and simulated state for each record, up to 12,000 records. All data remain local unless downloaded. Browser event age is not physical motion-to-pixel latency. Event rate may be change-driven; rotation-rate fields do not prove that a device has a particular gyroscope or sensor-fusion algorithm.

## Verification

`npm test` runs 61 checks, including full routes for all 40 combinations and shell inertia, ice slip threshold, air drag decay, billiard reference deceleration, independent walls, plus ideal 5/7 rolling acceleration for both masses, analytic sliding-to-rolling velocity, passive impacts with spin, material rebound, coast-down and sand ordering, high-speed contacts, geometric holes, energy bounds, valid maze routes, calibration/remapping, time-step independence and pauses. Syntax and local HTML/JS references are checked separately.

No physical-phone, browser visual, or supported-context WebMCP verification was available in this build environment. The existing optional WebMCP read/control interface remains feature-detected.

## Permission and phone checks

Enable tilt requests motion/orientation permission directly from its tap. Denial leaves touch available. Open the HTTPS page directly in Safari / Chrome. A containing frame must delegate accelerometer / gyroscope (potentially magnetometer for an absolute-orientation fallback), with permission from its parent policy. The child cannot grant this to itself. Safari may require clearing the site data after denial.

Test iPhone Safari and Android Chrome (including a low-cost device without a gyro if available): pitched neutral near 35°, chair yaw, screen rotations, a quick tilt step, slow/fast hole approaches, coast/counter-tilt braking, wall hops, changing app and resuming, page-scroll suppression. Test all four material pairs; sand intentionally needs larger tilts. Compare with physical specimens before describing the parameters as calibrated.

## Material documentation

`node scripts/write-model-notes.mjs` regenerates the complete 20 floor / 10 wall contact-pair tables and `dist/material-parameters.json` from the active profiles. Re-run when profiles change. Source selection and limitations appear next to each interpretation. The optional oil film is deferred until viscosity, thickness and flow/contact assumptions are defined.

## Scenery

The canvas uses distinct functional floor textures for wood, sand, ice and baize, corresponding surrounding colours, separate rubber bumper surfaces and material-specific ball finishes. Spin markers follow the simulated quaternion. Texture marks exert no force. Screen coordinates are normalised; all recorded positions, velocities and sizes remain physical SI quantities.
