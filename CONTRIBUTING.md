# Working with Marble Lab

Use Git commits for each coherent change. Keep parameter rationale and test evidence alongside physics changes. The original six Site commits are preserved; see `CHANGELOG.md` for their meaning.

## Run and check

This is a static ES-module browser application with no package dependencies. Use a current Node.js version supporting `node:test` and `Array.findLast`.

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

Phone sensors need a secure browser context; an ordinary LAN HTTP preview does not provide that. The existing private Site remains the phone testing surface.

## Maintain the record

1. Change source and relevant tests.
2. Update model notes and the parameter ledger when assumptions or coefficients change.
3. Regenerate affected acceptance evidence; keep phone measurements pending until actually performed.
4. Add a concise entry to `CHANGELOG.md` describing behavior, evidence and limitations.
5. Commit and push to the GitHub repository once created and connected.

GitHub records pushed commits. Creating a repository does not automatically synchronize future chat edits or the separate Sites hosting repository. Future development should explicitly commit and push here, and publish through Sites only when a site change is requested. Preserve the existing Sites project identity in `.openai/hosting.json`; do not create a replacement Site merely to host an edit.

No license grant has been selected by the owner. Do not add one or change repository visibility without instruction.
