# Dice Box

Up to five fair dice in a glass box with a felt floor. The box is the phone: shake it and the dice fly, tilt it and they slide, hold it still and they settle where the physics puts them. Browser only, no install.

Prototype v0.1 (25 September 2026). Part of [Game Labs](../../README.md): the current build and every development stage are playable at https://uwarring82.github.io/game-labs/dice-box/. Sibling of Marble Lab; shares its input philosophy (the phone's measured motion drives the world frame, no gesture detection).

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
    docs/model-notes-v0.1.md    equations, parameters, fairness measurements, known limits
    vendor/three.min.js         three.js r128 (MIT)
    manifest.webmanifest, icon.svg

## Tests

    node test/engine.test.js    # or: npm test

Ten checks, about five seconds: rest, stacking, toss, sliding vs holding on a tilt, rotation transport of an airborne die, containment at the velocity cap, two fairness runs (χ² on 200 faces), determinism.

## Status

Contact coefficients are estimates. Real-phone testing (sensor sign detection, sample rate, accelerometer clipping) is outstanding. See the endorsement marker at the end of the model notes.
