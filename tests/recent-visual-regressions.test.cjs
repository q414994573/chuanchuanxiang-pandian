'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p));
const v77Approved=new Set(['redesign-preview/preview.js','redesign-preview/preview.bundle.js']);
for(const [file,hash] of Object.entries(require('./v76-preserved-files.json'))){
 if(v77Approved.has(file))continue; // These two files are intentionally changed by v77.
 test('v76 preserve unrelated production file '+file,()=>a.equal(crypto.createHash('sha256').update(read(file)).digest('hex'),hash));
}
test('v77 intentional production source changes retain approved scope',()=>{
 const js=read('redesign-preview/preview.js').toString();
 const bundle=read('redesign-preview/preview.bundle.js').toString();
 a.match(js,/moduleScroll\[departing\]=leavingY/);
 a.match(js,/archiveNotice=failed/);
 a.match(js,/ResizeObserver\(syncBanner\)/);
 a.match(bundle,/\.banner|banner|loadArchives/);
});
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
