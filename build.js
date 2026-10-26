const fs=require('fs'),path=require('path');
const D=__dirname,r=f=>fs.readFileSync(path.join(D,'src',f),'utf8');
let html=r('template.html');
const js=['engine.js','trading.js','chart_core.js','chart_input.js','app_core.js','app_panels.js','pwa.js'].map(r).join('\n');
html=html.replace('/*__CSS__*/',()=>r('styles.css')).replace('/*__JS__*/',()=>js.replace(/<\/script>/g,'<\\/script>'));
fs.writeFileSync(path.join(D,'TradingStrategist.html'),html);
// installable web-app site folder (what GitHub Pages serves)
const site=path.join(D,'site');fs.rmSync(site,{recursive:true,force:true});fs.mkdirSync(path.join(site,'icons'),{recursive:true});
fs.writeFileSync(path.join(site,'index.html'),html);fs.writeFileSync(path.join(site,'TradingStrategist.html'),html);
fs.copyFileSync(path.join(D,'src/pwa/manifest.webmanifest'),path.join(site,'manifest.webmanifest'));
fs.copyFileSync(path.join(D,'src/pwa/sw.js'),path.join(site,'sw.js'));
for(const f of fs.readdirSync(path.join(D,'src/pwa/icons')))fs.copyFileSync(path.join(D,'src/pwa/icons',f),path.join(site,'icons',f));
console.log('built',(html.length/1024).toFixed(0)+' KB ->','TradingStrategist.html + site/');
