# Game Labs

Physics games for smartphones, played in the browser. The phone's sensors are the controller, and the simulation takes the physics seriously: real dimensions, materials and contact mechanics, with every assumption and coefficient written down.

**Play:** https://uwarring82.github.io/game-labs/

## Games

| Game | Status | Play |
| --- | --- | --- |
| [Marble Lab](games/marble-lab/) | Relief v0.1: draft, not yet endorsed. Automated checks pass; real-phone validation is pending. | [Current build](https://uwarring82.github.io/game-labs/marble-lab/latest/) · [All stages](https://uwarring82.github.io/game-labs/marble-lab/) |
| [Dice Box](games/dice-box/) | Prototype v0.1: draft, not yet endorsed. Engine checks pass; real-phone testing is pending. | [Current build](https://uwarring82.github.io/game-labs/dice-box/latest/) · [All stages](https://uwarring82.github.io/game-labs/dice-box/) |

## Every development stage stays playable

Each game lists its milestone commits in `games/<game>/stages.json`. On every push to `main`, [tools/build-pages.mjs](tools/build-pages.mjs) extracts each milestone from the git history and publishes it next to the current build, so you can play the game as it was at each step. Each stage links to its source and to the changes since the previous stage.

To add a milestone, commit it, then add an entry with its full commit ID to `stages.json`.

## Layout

```
games/marble-lab/       the first game: source (dist/), tests, level generation, validation, docs
games/dice-box/         the second game: page at the folder root (index.html, src/, vendored three.js), tests, docs
tools/build-pages.mjs   builds the GitHub Pages site into _site/
.github/workflows/      tests every push and pull request; publishes main to GitHub Pages
```

Games are static pages with no build step. Marble Lab has no dependencies; Dice Box vendors three.js r128 (MIT) for 3D rendering. There is no shared engine code yet: each game has its own physics and sensor handling. The plan is a **phone layer** (motion sensors, calibration, timing, viewport, sound and haptics, diagnostics) plus **physics engines** (rolling-ball contact on heightfields, rigid dice), moved into `packages/` so that their interfaces are shaped by two games rather than one.

## Run locally

Requires Node.js 22 or newer. There is nothing to install.

```sh
npm test                # every game's tests
npm run build:pages     # builds _site/
python3 -m http.server 8000 --directory _site
```

Open http://localhost:8000 to play with touch or keyboard. Phone sensors only work over HTTPS, so test on a phone with the published site.

## Evidence

Claims about the physics or about phones need tests or recorded measurements. Measurements that haven't been made stay marked as pending. Marble Lab's [acceptance gates](games/marble-lab/docs/acceptance.md) show what that means in practice.

## History

The first seven commits are Marble Lab's original history, imported unchanged so that the commit IDs cited in its [changelog](games/marble-lab/CHANGELOG.md) still resolve. Their generic author names and commit messages come from the tools used during the original development.

## License

[MIT](LICENSE)
