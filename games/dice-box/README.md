# Dice Box

Up to five dice, each in its own colour, in a glass box with a felt floor. The box is the phone: shake it and the dice fly, tilt it and they slide, hold it still and they settle where the physics puts them. In Setup you can load one die (a hidden plate shifts its centre of mass, adjustable from fair to heavily loaded) and choose how hard a shake the glass survives. Browser only, no install.

v0.2 (26 September 2026): realistic dice, a loaded die, breakable glass. The v0.1 prototype (25 September) is development stage 1. Part of [Game Labs](../../README.md): the current build and every development stage are playable at https://uwarring82.github.io/game-labs/dice-box/. Sibling of Marble Lab; shares its input philosophy (the phone's measured motion drives the world frame, no gesture detection).

## Run

Motion sensors need a secure context, so serve the folder over HTTPS or from `localhost`:

    python3 -m http.server 8000        # then open http://localhost:8000/ on the same machine
    npx serve .                        # or any static server; for a phone, use an HTTPS host

On iPhone, Safari asks for motion access when you tap **Start**; a declined request is not asked again until site data is cleared. Add to Home Screen gives the full screen (the manifest is included). On a computer, drag the box to shake and press Space to toss.

three.js r128 is vendored in `vendor/` (MIT, licence alongside), so the page runs offline. Fonts come from Google Fonts with system fallbacks.

## Files

    index.html                  page shell, HUD, overlays
    src/phys.js                 rigid-body engine (no DOM; also loads as a CommonJS module)
    src/app.js                  sensors, rendering, audio, controls
    test/engine.test.js         headless checks, run with `node test/engine.test.js`
    docs/model-notes.md         equations, parameters, fairness and load measurements, known limits
    vendor/three.min.js         three.js r128 (MIT)
    manifest.webmanifest, icon.svg

## Tests

    node test/engine.test.js    # or: npm test

Nineteen checks, about fifteen seconds: rest, stacking, toss, sliding vs holding on a tilt, rotation transport of an airborne die, containment at the velocity cap, two fairness runs (χ² on 200 faces), determinism; then zero load identical to the uniform cube, a loaded die resting flat, free precession of a loaded die against the analytic torque-free top, a shattered box that keeps its dice while level and spills them when tilted, and a loaded die's bias with the fair dice beside it unaffected.

## Status

Contact coefficients are estimates. The glass breaks by a game rule (sustained acceleration above a limit), not a fracture model. Real-phone testing (sensor sign detection, sample rate, accelerometer clipping, the peak acceleration a hard shake reaches) is outstanding. See the endorsement marker at the end of the model notes.
