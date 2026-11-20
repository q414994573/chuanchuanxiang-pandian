'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p));
for(const [file,hash] of Object.entries(require('./v77-preserved-files.json')))test('v77 preserve reviewed production file '+file,()=>a.equal(crypto.createHash('sha256').update(read(file)).digest('hex'),hash));
for(const dir of ['ordering','redesign-preview'])test('desktop entry and safe-area contract '+dir,()=>{
 const html=read(dir+'/index.html').toString(),m=JSON.parse(read(dir+'/manifest.webmanifest'));
 a.match(html,/viewport-fit=cover/);a.doesNotMatch(html,/apple-mobile-web-app-status-bar-style/);
 a.equal(m.start_url,'./');a.equal(m.scope,'./');a.equal(m.display,'standalone');
 for(const icon of m.icons){const png=read(path.posix.join(dir,icon.src));const [w,h]=icon.sizes.split('x').map(Number);a.equal(png.readUInt32BE(16),w);a.equal(png.readUInt32BE(20),h);}
});
test('opening contains only emblem and skip text, not duplicated Chinese title or feature slogans',()=>{
 const html=read('ordering/index.html').toString();const opening=html.slice(html.indexOf('<div id="ccx-welcome"'),html.indexOf('<div class="banner">'));
 a.doesNotMatch(opening,/川川香|订货总控台|共同盘货|实时同步|welcome-title/);a.match(opening,/轻点跳过/);a.match(opening,/emblem-v65\.png/);
});
test('full browser runner includes every available suite instead of a manually incomplete list',()=>{
 const runner=read('scripts/run-browser-regression.py').toString();a.match(runner,/glob\('\*\.browser\.cjs'\)/);
 const footer=read('tests/footer-relief.browser.cjs').toString();a.match(footer,/footer-report\.json/);
});
