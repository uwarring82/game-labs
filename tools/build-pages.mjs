// Builds the GitHub Pages site into _site/: a landing page and, for each game,
// its current build plus every development stage listed in games/<game>/stages.json.
// Stages are extracted from their original commits with `git archive`, so this
// needs full git history (in CI: actions/checkout with fetch-depth: 0).
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const REPO = process.env.GITHUB_REPOSITORY || 'uwarring82/game-labs';
const GITHUB = `https://github.com/${REPO}`;
const git = (...args) => execFileSync('git', args, {cwd: ROOT, maxBuffer: 1 << 28});

function extractCommit(commit, path, dir) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Stage commit must be a full 40-character ID: ${commit}`);
  try { git('cat-file', '-e', `${commit}^{commit}`); }
  catch { throw new Error(`Commit ${commit} is not available. Fetch full history (fetch-depth: 0).`); }
  mkdirSync(dir, {recursive: true});
  execFileSync('tar', ['-x', '-C', dir], {input: git('archive', '--format=tar', `${commit}:${path}`)});
}

// Stages 4–6 declare "/" as manifest id, start_url and scope, which under GitHub Pages
// means the domain root. Rewriting these to "./" is the only change made to a stage.
function relativeManifest(dir) {
  const file = join(dir, 'manifest.webmanifest');
  if (!existsSync(file)) return [];
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const changed = ['id', 'start_url', 'scope'].filter(k => typeof manifest[k] === 'string' && manifest[k].startsWith('/'));
  for (const k of changed) manifest[k] = '.' + manifest[k];
  if (changed.length) writeFileSync(file, JSON.stringify(manifest));
  return changed;
}

// Follows every local reference from index.html (HTML attributes, CSS url(), JS imports,
// manifest icons) and reports files that are missing or lie outside the build directory.
function brokenReferences(dir) {
  const broken = [], seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!existsSync(file)) return void broken.push(relative(dir, file));
    const text = readFileSync(file, 'utf8'), refs = [];
    if (file.endsWith('.html')) for (const m of text.matchAll(/\b(?:src|href)="([^"]+)"/g)) refs.push(m[1]);
    if (file.endsWith('.css')) for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)/g)) refs.push(m[1]);
    if (file.endsWith('.js')) for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) refs.push(m[1]);
    if (file.endsWith('.webmanifest')) for (const icon of JSON.parse(text).icons ?? []) refs.push(icon.src);
    for (const ref of refs) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(ref)) continue;
      const path = ref.split(/[?#]/)[0], target = resolve(dirname(file), path.endsWith('/') ? path + 'index.html' : path);
      if (!target.startsWith(dir + sep)) broken.push(`${relative(dir, file)} -> ${ref} (outside build)`);
      else if (/\.(?:html|css|js|webmanifest)$/.test(target)) visit(target);
      else if (!existsSync(target)) broken.push(relative(dir, target));
    }
  };
  visit(join(dir, 'index.html'));
  return broken;
}

function finishBuild(dir, label) {
  const changed = relativeManifest(dir);
  const broken = brokenReferences(dir);
  if (broken.length) throw new Error(`${label}: broken references\n  ${broken.join('\n  ')}`);
  console.log(`  ${label}${changed.length ? ` (manifest ${changed.join(', ')} made relative)` : ''}`);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Shows the local time as recorded in stages.json, independent of the build machine's locale.
const when = iso => { const [, y, m, d, time] = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/); return `${+d} ${MONTHS[m - 1]} ${y}, ${time}`; };

const STYLE = `
:root{color-scheme:light dark;--bg:#f5f2ea;--fg:#18201d;--muted:#5b6560;--card:#fffdf8;--line:#ddd5c6;--accent:#8a6424;--on-accent:#fffdf8;--dot:#2f7d68}
@media (prefers-color-scheme:dark){:root{--bg:#101714;--fg:#e6ede8;--muted:#9aa8a1;--card:#17211d;--line:#27342f;--accent:#c9a46c;--on-accent:#101714;--dot:#b7e7d4}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:44rem;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 56px max(16px,env(safe-area-inset-left))}
a{color:var(--accent)}
h1{font-size:2rem;line-height:1.15;margin:.15em 0 .3em}
h2{font-size:1.25rem;margin:2em 0 .6em}
h3{font-size:1.08rem;margin:.1em 0 .25em}
p{margin:.4em 0}
.lede{color:var(--muted);font-size:1.06rem}
.meta{color:var(--muted);font-size:.88rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:16px 0}
.links{display:flex;flex-wrap:wrap;align-items:center;gap:.5em 1.1em;margin-top:.6em}
.play{display:inline-block;background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600;padding:.5em 1.15em;border-radius:999px}
ol.stages{list-style:none;margin:0;padding:0;border-left:2px solid var(--line)}
ol.stages li{position:relative;padding:0 0 26px 20px}
ol.stages li::before{content:"";position:absolute;left:-8px;top:.4em;width:14px;height:14px;border-radius:50%;background:var(--dot);border:3px solid var(--bg)}
footer{color:var(--muted);font-size:.85rem;margin-top:40px;border-top:1px solid var(--line);padding-top:14px}`;

const page = (title, description, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23131918'/%3E%3Cpath d='M4 24c7 0 9-9 15-9s7 5 9 5' fill='none' stroke='%23c9a46c' stroke-width='3'/%3E%3Ccircle cx='19' cy='10' r='4' fill='%23b7e7d4'/%3E%3C/svg%3E">
<style>${STYLE}</style></head>
<body><main>${body}</main></body></html>
`;

function gamePage(game, config, head) {
  const last = config.stages.at(-1);
  const stages = config.stages.map((s, i) => {
    const prev = config.stages[i - 1];
    const notes = existsSync(join(OUT, game, 'stages', s.id, 'model-notes.html'));
    return `<li><span class="meta">Stage ${i + 1} · ${esc(when(s.date))}</span>
<h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p>
<div class="links"><a href="stages/${esc(s.id)}/">Play</a>${notes ? `<a href="stages/${esc(s.id)}/model-notes.html">Model notes</a>` : ''}<a href="${GITHUB}/tree/${s.commit}/${esc(s.path)}">Source</a>${prev ? `<a href="${GITHUB}/compare/${prev.commit}...${s.commit}">Changes</a>` : ''}</div></li>`;
  }).join('\n');
  return page(config.title, config.tagline, `
<p class="meta"><a href="../">Game Labs</a></p>
<h1>${esc(config.title)}</h1>
<p class="lede">${esc(config.tagline)}</p>
<div class="card"><h3>Current build</h3>
<p>${esc(config.status)}</p>
<p class="meta">main at <a href="${GITHUB}/commit/${head}">${head.slice(0, 7)}</a>. Tilt control needs a phone; on a computer, drag or use the keyboard.</p>
<div class="links"><a class="play" href="latest/">Play</a>${existsSync(join(OUT, game, 'latest', 'model-notes.html')) ? '<a href="latest/model-notes.html">Model notes</a>' : ''}<a href="${GITHUB}/compare/${last.commit}...${head}">Changes since stage ${config.stages.length}</a></div></div>
<h2>Development stages</h2>
<p>Each stage is the game as it was committed at that milestone, still playable.</p>
<ol class="stages">
${stages}
</ol>
<footer>Stages are extracted from their original commits by <a href="${GITHUB}/blob/main/tools/build-pages.mjs">tools/build-pages.mjs</a>. The only change is that absolute web-app manifest paths become relative, so each stage runs under this address.</footer>`);
}

function landingPage(games) {
  const cards = games.map(({game, config}) => `<div class="card"><h3>${esc(config.title)}</h3>
<p>${esc(config.tagline)}</p><p class="meta">${esc(config.status)}</p>
<div class="links"><a class="play" href="${game}/latest/">Play</a><a href="${game}/">All ${config.stages.length} development stages</a></div></div>`).join('\n');
  return page('Game Labs', 'Physics games for smartphones, played in the browser.', `
<h1>Game Labs</h1>
<p class="lede">Physics games for smartphones, played in the browser. The phone's sensors are the controller, and the simulation uses real dimensions, materials and contact mechanics with its assumptions written down.</p>
${cards}
<footer>Open source on <a href="${GITHUB}">GitHub</a>. Every development stage of every game stays playable.</footer>`);
}

rmSync(OUT, {recursive: true, force: true});
const head = git('rev-parse', 'HEAD').toString().trim();
const games = readdirSync(join(ROOT, 'games'), {withFileTypes: true})
  .filter(d => d.isDirectory() && existsSync(join(ROOT, 'games', d.name, 'stages.json')))
  .map(d => ({game: d.name, config: JSON.parse(readFileSync(join(ROOT, 'games', d.name, 'stages.json'), 'utf8'))}));

for (const {game, config} of games) {
  console.log(game);
  // The current build comes from the working tree, so a local preview includes uncommitted edits.
  const latest = join(OUT, game, 'latest');
  cpSync(join(ROOT, 'games', game, config.source), latest, {recursive: true});
  finishBuild(latest, 'latest');
  for (const s of config.stages) {
    const dir = join(OUT, game, 'stages', s.id);
    extractCommit(s.commit, s.path, dir);
    finishBuild(dir, s.id);
  }
  writeFileSync(join(OUT, game, 'index.html'), gamePage(game, config, head));
}
writeFileSync(join(OUT, 'index.html'), landingPage(games));
console.log(`Built ${relative(ROOT, OUT)}/ from ${head.slice(0, 7)}`);
