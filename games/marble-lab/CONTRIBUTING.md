# Working with Marble Lab

Use Git commits for each coherent change. Keep parameter rationale and test evidence alongside physics changes. The original six Site commits are preserved; see `CHANGELOG.md` for their meaning.

## Run and check

This is a static ES-module browser application with no package dependencies. Use a current Node.js version supporting `node:test` and `Array.findLast`. Run these commands from `games/marble-lab/`; `npm test` at the repository root runs every game's tests.

```sh
npm test
node scripts/generate-relief.mjs
node scripts/validate-relief.mjs
node scripts/write-model-notes.mjs
npm test
```

Generation selects and records a level; validation and documentation update tracked outputs. Review those diffs before committing. Run generation/validation when terrain, material coefficients or physics change; they are not necessary for prose-only edits.

For desktop touch/keyboard preview:

```sh
python3 -m http.server 8000 --directory dist
```

Phone sensors need a secure browser context; an ordinary LAN HTTP preview does not provide that. Test on phones with the GitHub Pages build, which is served over HTTPS and republished from `main`: https://uwarring82.github.io/game-labs/marble-lab/latest/.

## Maintain the record

1. Change source and relevant tests.
2. Update model notes and the parameter ledger when assumptions or coefficients change.
3. Regenerate affected acceptance evidence; keep phone measurements pending until actually performed.
4. Add a concise entry to `CHANGELOG.md` describing behavior, evidence and limitations.
5. Commit and push. Every push to `main` runs the tests and republishes GitHub Pages.
6. When a commit completes a milestone, add it to `stages.json` with its full commit ID, so it stays playable as a development stage.

The original ChatGPT Sites deployment is separate: pushes here do not update it. Publish there only when a site change is requested, and keep its project identity in `.openai/hosting.json` rather than creating a replacement Site.

Game Labs is public and open source; see the root `LICENSE`. Motion exports contain browser and device metadata, so review them before committing.
