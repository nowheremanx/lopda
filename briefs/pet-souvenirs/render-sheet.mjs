// node render.mjs batch.js out.png  -> contact sheet via Playwright: grids at 4x with id + names
import fs from 'fs'; import vm from 'vm'; import {createRequire} from 'module'; const {chromium}=createRequire(import.meta.url)('playwright');
const [,,batchFile,out,withOld]=process.argv;
const ctx={window:{}}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(batchFile,'utf8'),ctx);
let items=ctx.window.BATCH;
if(withOld){const c2={window:{}};vm.createContext(c2);vm.runInContext(fs.readFileSync('/home/user/lopda/runtime/petsouv.js','utf8').toString(),c2);}
const bad=[];items.forEach(it=>{if(it.grid.length!==16||it.grid.some(r=>r.length!==16||/[^.kdmp]/.test(r)))bad.push(it.id)});
if(bad.length){console.log('BAD',bad);}
const html=`<html><body style="margin:0;background:#a3ad7e;font:12px sans-serif;color:#1f2a14"><div id=g style="display:grid;grid-template-columns:repeat(5,150px);gap:8px;padding:8px"></div><script>
const T={k:[31,42,20],d:[74,90,50],m:[125,138,88],p:[163,173,126],'.':[163,173,126]};
const items=${JSON.stringify(items)};
for(const it of items){const d=document.createElement('div');const c=document.createElement('canvas');c.width=16;c.height=16;c.style.cssText='width:96px;height:96px;image-rendering:pixelated;border:2px solid #1f2a14';const x=c.getContext('2d'),im=x.createImageData(16,16);it.grid.forEach((r,y)=>[...r].forEach((ch,i)=>{const o=(y*16+i)*4;const t=T[ch];im.data[o]=t[0];im.data[o+1]=t[1];im.data[o+2]=t[2];im.data[o+3]=255}));x.putImageData(im,0,0);d.appendChild(c);const l=document.createElement('div');l.innerHTML='<b>'+it.zh+'</b> '+it.en+'<br><small>'+it.id+' · '+it.season+' · '+it.where+'</small><br><small>'+it.lzh+'</small><br><small>'+it.len+'</small>';d.appendChild(l);g.appendChild(d)}
</script></body></html>`;
const b=await chromium.launch();const p=await b.newPage({viewport:{width:800,height:400},deviceScaleFactor:1});await p.setContent(html);await p.screenshot({path:out,fullPage:true});await b.close();
