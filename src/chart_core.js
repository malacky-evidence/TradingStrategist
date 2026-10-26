'use strict';
/* ===================== CHART: layout + rendering ===================== */
const THEMES={
  dark:{bg:'#0e1218',grid:'#18202a',text:'#8b97a8',axisBg:'#121821',border:'#243040',up:'#26a69a',down:'#ef5350',
    cross:'#7d8a9e',tag:'#2a3647',tagText:'#e6edf6',rsi:'#b388ff',rsiBand:'rgba(179,136,255,.08)',draw:'#f5c542',
    fvgUp:'rgba(38,166,154,.18)',fvgDn:'rgba(239,83,80,.18)',volUp:'rgba(38,166,154,.55)',volDn:'rgba(239,83,80,.55)',ask:'#5c6b80'},
  light:{bg:'#ffffff',grid:'#eef1f5',text:'#556070',axisBg:'#f6f8fa',border:'#d5dbe3',up:'#14917f',down:'#d9363e',
    cross:'#7d8a9e',tag:'#e3e8ef',tagText:'#1b2430',rsi:'#7e57c2',rsiBand:'rgba(126,87,194,.08)',draw:'#c78a00',
    fvgUp:'rgba(20,145,127,.16)',fvgDn:'rgba(217,54,62,.16)',volUp:'rgba(20,145,127,.5)',volDn:'rgba(217,54,62,.5)',ask:'#9aa6b6'}
};
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const NICE_MS=[60e3,300e3,900e3,1800e3,3600e3,7200e3,14400e3,21600e3,43200e3,86400e3,172800e3,604800e3,1209600e3,2592000e3];
const RSI_P=14;

function fmtTime(t,full){
  const d=new Date(t),p=n=>String(n).padStart(2,'0');
  const s=p(d.getUTCHours())+':'+p(d.getUTCMinutes());
  return full?d.getUTCDate()+' '+MONTHS[d.getUTCMonth()]+' '+d.getUTCFullYear()+'  '+s:s;
}
function niceStep(range,target){
  const raw=range/target,pow=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/pow;
  return (f<1.5?1:f<3.5?2:f<7.5?5:10)*pow;
}
function rsiStep(c,i,s){
  const d=c[i].c-c[i-1].c,g=d>0?d:0,l=d<0?-d:0;
  if(i<RSI_P)return [{ag:0,al:0,sg:s.sg+g,sl:s.sl+l},NaN];
  let ag,al;
  if(i===RSI_P){ag=(s.sg+g)/RSI_P;al=(s.sl+l)/RSI_P;}
  else{ag=(s.ag*(RSI_P-1)+g)/RSI_P;al=(s.al*(RSI_P-1)+l)/RSI_P;}
  return [{ag,al,sg:0,sl:0},al===0?100:100-100/(1+ag/al)];
}

class Chart{
  constructor(canvas,opts){
    this.cv=canvas;this.ctx=canvas.getContext('2d');this.opts=opts;
    this.theme=THEMES.dark;this.sym=null;this.tf='M5';
    this.barW=9;this.shift=8;this.autoY=true;this.yMin=0;this.yMax=1;
    this.show={vol:true,rsi:true,fvg:false,grid:true,magnet:false};
    this.drawings={};this.tool=null;this.pendingDraw=null;this.selected=null;
    this.mouse=null;this.dragLine=null;this.lastN=0;this.rsiCache={};this.axisW=72;this.axisH=24;
    this.W=0;this.H=0;this.dpr=1;this.dirty=true;this.c=[];this.n=0;this.vis=[0,0];
    this.initInput();this.resize();
  }
  requestDraw(){this.dirty=true;}
  resize(){
    const r=this.cv.getBoundingClientRect();if(!r.width||!r.height)return;
    this.dpr=window.devicePixelRatio||1;this.W=Math.floor(r.width);this.H=Math.floor(r.height);
    this.cv.width=Math.floor(this.W*this.dpr);this.cv.height=Math.floor(this.H*this.dpr);
    this.layout();this.dirty=true;
  }
  layout(){
    const avail=this.H-this.axisH;this.plotW=this.W-this.axisW;
    const vh=this.show.vol?Math.max(48,Math.round(avail*0.12)):0,rh=this.show.rsi?Math.max(70,Math.round(avail*0.18)):0;
    const mh=avail-vh-rh;
    this.main={y0:0,y1:mh};
    this.volP=vh?{y0:mh,y1:mh+vh}:null;
    this.rsiP=rh?{y0:mh+vh,y1:mh+vh+rh}:null;
    this.timeY=avail;
  }
  setSymbol(sym,tf){
    if(sym===this.sym&&tf!==this.tf&&this.n&&this.shift<-1)this.anchorT=this.c[0].t+Math.round(this.idxOfXf(this.plotW))*this.tfMs();
    if(sym!==this.sym||tf!==this.tf){this.sym=sym;this.tf=tf;this.lastN=0;this.autoY=true;this.shift=this.anchorT?this.shift:8;}
    this.requestDraw();
  }
  tfMs(){return TFMS[this.tf];}

  /* ---------- coordinate transforms ---------- */
  xOfIdx(i){return this.plotW-(this.shift+(this.n-1-i)+0.5)*this.barW;}
  idxOfXf(x){return this.n-1-((this.plotW-x)/this.barW-this.shift-0.5);}
  xOfTime(t){return this.xOfIdx((t-this.c[0].t)/this.tfMs());}
  timeOfX(x){return this.c[0].t+Math.round(this.idxOfXf(x))*this.tfMs();}
  yOfP(p){return this.main.y0+(this.yMax-p)/(this.yMax-this.yMin)*(this.main.y1-this.main.y0);}
  pOfY(y){return this.yMax-(y-this.main.y0)/(this.main.y1-this.main.y0)*(this.yMax-this.yMin);}

  /* ---------- indicators ---------- */
  rsi(){
    const c=this.c,n=this.n,key=this.sym+'|'+this.tf;
    let k=this.rsiCache[key];
    if(!k||k.firstT!==c[0].t||k.len>n){k={vals:[NaN],len:1,st:{ag:0,al:0,sg:0,sl:0},firstT:c[0].t};this.rsiCache[key]=k;}
    for(let i=k.len;i<n-1;i++){const r=rsiStep(c,i,k.st);k.st=r[0];k.vals[i]=r[1];}
    if(n-1>=k.len)k.len=n-1;
    if(n>1&&n-1>=1){k.vals[n-1]=rsiStep(c,n-1,k.st)[1];}
    k.vals.length=n;
    return k.vals;
  }

  /* ---------- main draw ---------- */
  draw(){
    if(!this.sym)return;
    const c=this.opts.getCandles(this.sym,this.tf);if(!c||!c.length)return;
    this.c=c;const n=c.length;
    if(this.anchorT){this.shift=(this.anchorT-c[0].t)/this.tfMs()-(n-1)-0.5;this.anchorT=null;this.lastN=n;}
    if(this.lastN&&n>this.lastN&&this.shift<-1)this.shift-=(n-this.lastN);   // keep a scrolled-back view fixed while new candles form
    this.lastN=n;this.n=n;
    this.layout();
    this.barW=Math.max(1.5,Math.min(60,this.barW));
    this.shift=Math.max(-(n-3),Math.min(this.plotW/this.barW*0.6,this.shift));
    const i0=Math.max(0,Math.floor(this.idxOfXf(0))-1),i1=Math.min(n-1,Math.ceil(this.idxOfXf(this.plotW))+1);
    this.vis=[i0,i1];
    if(this.autoY||!(this.yMax>this.yMin)){
      let lo=Infinity,hi=-Infinity;
      for(let i=i0;i<=i1;i++){if(c[i].l<lo)lo=c[i].l;if(c[i].h>hi)hi=c[i].h;}
      if(!isFinite(lo)){lo=c[n-1].l;hi=c[n-1].h;}
      const R=(hi-lo)||hi*0.0005;
      if(this.opts.getLines)for(const l of this.opts.getLines(this.sym)){if(l.price>lo-3*R&&l.price<hi+3*R){if(l.price<lo)lo=l.price;if(l.price>hi)hi=l.price;}}
      const pad=(hi-lo)*0.1||hi*0.0005;this.yMin=lo-pad;this.yMax=hi+pad;
    }
    const ctx=this.ctx,T=this.theme,dpr=this.dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle=T.bg;ctx.fillRect(0,0,this.W,this.H);
    ctx.font='11px system-ui,Segoe UI,Arial,sans-serif';ctx.textBaseline='middle';
    this.drawGrid();
    ctx.save();ctx.beginPath();ctx.rect(0,0,this.plotW,this.timeY);ctx.clip();
    if(this.show.fvg)this.drawFVG(i0,i1);
    this.drawCandles(i0,i1);
    this.drawDrawings();
    if(this.opts.getMarkers)this.drawMarkers();
    this.drawTradeLines();
    ctx.restore();
    if(this.volP)this.drawVolume(i0,i1);
    if(this.rsiP)this.drawRSI(i0,i1);
    this.drawPriceLine();
    this.drawAxes();
    this.drawCrosshair();
    this.drawLegend();
    this.dirty=false;
  }

  drawGrid(){
    const ctx=this.ctx,T=this.theme,m=this.main;
    ctx.strokeStyle=T.border;ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(this.plotW+0.5,0);ctx.lineTo(this.plotW+0.5,this.timeY);
    ctx.moveTo(0,this.timeY+0.5);ctx.lineTo(this.W,this.timeY+0.5);
    for(const p of [this.volP,this.rsiP]){if(p){ctx.moveTo(0,p.y0+0.5);ctx.lineTo(this.W,p.y0+0.5);}}
    ctx.stroke();
    if(!this.show.grid)return;
    ctx.strokeStyle=T.grid;ctx.beginPath();
    const step=niceStep(this.yMax-this.yMin,(m.y1-m.y0)/55);
    for(let p=Math.ceil(this.yMin/step)*step;p<this.yMax;p+=step){const y=Math.round(this.yOfP(p))+0.5;ctx.moveTo(0,y);ctx.lineTo(this.plotW,y);}
    for(const t of this.timeTicks()){const x=Math.round(t.x)+0.5;ctx.moveTo(x,0);ctx.lineTo(x,this.timeY);}
    ctx.stroke();
  }
  timeTicks(){
    const out=[],ms=this.tfMs(),c=this.c;
    const want=ms*Math.ceil(95/this.barW);
    let step=NICE_MS[NICE_MS.length-1];
    for(const s of NICE_MS){if(s>=want&&s>=ms){step=s;break;}}
    const tL=c[0].t+Math.floor(this.idxOfXf(0))*ms,tR=c[0].t+Math.ceil(this.idxOfXf(this.plotW))*ms;
    for(let t=Math.ceil(tL/step)*step;t<=tR;t+=step){
      const x=this.xOfTime(t);if(x<0||x>this.plotW)continue;
      out.push({x,t,day:step>=86400000||t%86400000===0});
    }
    return out;
  }
  drawCandles(i0,i1){
    const ctx=this.ctx,T=this.theme,c=this.c,bw=this.barW;
    if(bw<3){ // zoomed far out: draw as thin OHLC lines
      for(const up of [true,false]){
        ctx.strokeStyle=up?T.up:T.down;ctx.beginPath();
        for(let i=i0;i<=i1;i++){const k=c[i];if((k.c>=k.o)!==up)continue;const x=Math.round(this.xOfIdx(i))+0.5;ctx.moveTo(x,this.yOfP(k.h));ctx.lineTo(x,this.yOfP(k.l));}
        ctx.stroke();
      }
      return;
    }
    const body=Math.max(1,Math.floor(bw*0.72));
    for(const up of [true,false]){
      const col=up?T.up:T.down;ctx.fillStyle=col;ctx.strokeStyle=col;
      ctx.beginPath();
      for(let i=i0;i<=i1;i++){
        const k=c[i];if((k.c>=k.o)!==up)continue;
        const x=Math.round(this.xOfIdx(i))+0.5;ctx.moveTo(x,this.yOfP(k.h));ctx.lineTo(x,this.yOfP(k.l));
      }
      ctx.stroke();
      for(let i=i0;i<=i1;i++){
        const k=c[i];if((k.c>=k.o)!==up)continue;
        const x=Math.round(this.xOfIdx(i)-body/2),yo=this.yOfP(k.o),yc=this.yOfP(k.c);
        ctx.fillRect(x,Math.min(yo,yc),body,Math.max(1,Math.abs(yc-yo)));
      }
    }
  }
  drawFVG(i0,i1){
    if(i1-i0>1600)return;
    const ctx=this.ctx,T=this.theme,c=this.c;
    let avg=0;for(let i=i0;i<=i1;i++)avg+=c[i].h-c[i].l;avg/=Math.max(1,i1-i0+1);
    for(let i=Math.max(2,i0);i<=i1;i++){
      let top,bot,bull;
      if(c[i-2].h<c[i].l){bot=c[i-2].h;top=c[i].l;bull=true;}
      else if(c[i-2].l>c[i].h){top=c[i-2].l;bot=c[i].h;bull=false;}
      else continue;
      if(top-bot<avg*0.25)continue;
      let end=this.n-1;
      for(let j=i+1;j<=i1;j++){if(bull?c[j].l<=bot:c[j].h>=top){end=j;break;}}
      const x0=this.xOfIdx(i-1)-this.barW/2,x1=end===this.n-1?this.plotW:this.xOfIdx(end)+this.barW/2;
      ctx.fillStyle=bull?T.fvgUp:T.fvgDn;
      ctx.fillRect(x0,this.yOfP(top),x1-x0,this.yOfP(bot)-this.yOfP(top));
    }
  }
  drawVolume(i0,i1){
    const ctx=this.ctx,T=this.theme,c=this.c,p=this.volP;let mx=1;
    for(let i=i0;i<=i1;i++)if(c[i].v>mx)mx=c[i].v;
    ctx.save();ctx.beginPath();ctx.rect(0,p.y0+1,this.plotW,p.y1-p.y0-1);ctx.clip();
    const h=p.y1-p.y0-16,body=Math.max(1,Math.floor(this.barW*0.72));
    for(const up of [true,false]){
      ctx.fillStyle=up?T.volUp:T.volDn;
      for(let i=i0;i<=i1;i++){
        const k=c[i];if((k.c>=k.o)!==up)continue;
        const bh=Math.max(1,k.v/mx*h);ctx.fillRect(Math.round(this.xOfIdx(i)-body/2),p.y1-bh-2,body,bh);
      }
    }
    ctx.restore();
    ctx.fillStyle=T.text;ctx.textAlign='left';
    const k=c[this.hoverIdx()??this.n-1];
    ctx.fillText('Volume  '+(k?k.v.toLocaleString():''),8,p.y0+10);
    ctx.textAlign='right';ctx.fillText(mx>=1000?(mx/1000).toFixed(1)+'K':String(mx),this.W-6,p.y0+10);
  }
  drawRSI(i0,i1){
    const ctx=this.ctx,T=this.theme,p=this.rsiP,vals=this.rsi(),h=p.y1-p.y0-18,top=p.y0+10;
    const y=v=>top+(100-v)/100*h;
    ctx.save();ctx.beginPath();ctx.rect(0,p.y0+1,this.plotW,p.y1-p.y0-1);ctx.clip();
    ctx.fillStyle=T.rsiBand;ctx.fillRect(0,y(70),this.plotW,y(30)-y(70));
    ctx.strokeStyle=T.grid;ctx.setLineDash([3,3]);ctx.beginPath();
    for(const lv of [30,50,70]){ctx.moveTo(0,y(lv)+0.5);ctx.lineTo(this.plotW,y(lv)+0.5);}
    ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle=T.rsi;ctx.lineWidth=1.3;ctx.beginPath();let on=false;
    for(let i=i0;i<=i1;i++){
      const v=vals[i];if(!(v>=0)){on=false;continue;}
      const x=this.xOfIdx(i),yy=y(v);if(on)ctx.lineTo(x,yy);else{ctx.moveTo(x,yy);on=true;}
    }
    ctx.stroke();ctx.lineWidth=1;ctx.restore();
    ctx.fillStyle=T.text;ctx.textAlign='left';
    const hv=vals[this.hoverIdx()??this.n-1];
    ctx.fillText('RSI ('+RSI_P+')  '+(hv>=0?hv.toFixed(2):'—'),8,p.y0+10);
    ctx.textAlign='right';
    for(const lv of [30,70])ctx.fillText(String(lv),this.W-6,y(lv));
  }
  hoverIdx(){
    if(!this.mouse||this.mouse.x>this.plotW||this.mouse.x<0)return null;
    const i=Math.round(this.idxOfXf(this.mouse.x));return i>=0&&i<this.n?i:null;
  }
  drawPriceLine(){
    const q=this.opts.getQuote(this.sym);if(!q)return;
    const ctx=this.ctx,T=this.theme,m=this.main,dg=INST_BY_SYM[this.sym].digits;
    const c=this.c[this.n-1],up=c.c>=c.o;
    const ya=this.yOfP(q.ask),yb=this.yOfP(q.bid);
    ctx.save();ctx.beginPath();ctx.rect(0,m.y0,this.plotW,m.y1-m.y0);ctx.clip();
    ctx.setLineDash([2,3]);ctx.strokeStyle=T.ask;ctx.beginPath();ctx.moveTo(0,Math.round(ya)+0.5);ctx.lineTo(this.plotW,Math.round(ya)+0.5);ctx.stroke();
    ctx.setLineDash([4,3]);ctx.strokeStyle=up?T.up:T.down;ctx.beginPath();ctx.moveTo(0,Math.round(yb)+0.5);ctx.lineTo(this.plotW,Math.round(yb)+0.5);ctx.stroke();
    ctx.restore();ctx.setLineDash([]);
    this.tagY(yb,q.bid.toFixed(dg),up?T.up:T.down,'#fff');
    this.tagY(ya,q.ask.toFixed(dg),T.ask,'#fff');
  }
  tagY(y,text,bg,fg){
    if(y<this.main.y0-6||y>this.main.y1+6)return;
    const ctx=this.ctx;ctx.fillStyle=bg;ctx.fillRect(this.plotW,y-9,this.axisW,18);
    ctx.fillStyle=fg;ctx.textAlign='left';ctx.fillText(text,this.plotW+6,y);
  }
  drawAxes(){
    const ctx=this.ctx,T=this.theme,m=this.main,dg=INST_BY_SYM[this.sym].digits;
    ctx.fillStyle=T.axisBg;ctx.fillRect(this.plotW+1,0,this.axisW,this.timeY);ctx.fillRect(0,this.timeY+1,this.W,this.axisH);
    ctx.strokeStyle=T.border;ctx.beginPath();ctx.moveTo(this.plotW+0.5,0);ctx.lineTo(this.plotW+0.5,this.timeY);ctx.moveTo(0,this.timeY+0.5);ctx.lineTo(this.W,this.timeY+0.5);ctx.stroke();
    ctx.fillStyle=T.text;ctx.textAlign='left';
    const step=niceStep(this.yMax-this.yMin,(m.y1-m.y0)/55),dec=Math.max(0,Math.min(dg,Math.ceil(-Math.log10(step))+1));
    for(let p=Math.ceil(this.yMin/step)*step;p<this.yMax;p+=step){
      const y=this.yOfP(p);if(y<10||y>m.y1-8)continue;ctx.fillText(p.toFixed(Math.max(dec,0)),this.plotW+6,y);
    }
    ctx.textAlign='center';
    for(const t of this.timeTicks()){
      const d=new Date(t.t);
      ctx.fillStyle=t.day?T.tagText:T.text;ctx.font=(t.day?'bold ':'')+'11px system-ui,Segoe UI,Arial,sans-serif';
      ctx.fillText(t.day?d.getUTCDate()+' '+MONTHS[d.getUTCMonth()]:fmtTime(t.t),t.x,this.timeY+this.axisH/2+1);
    }
    ctx.font='11px system-ui,Segoe UI,Arial,sans-serif';
  }
  drawLegend(){
    const ctx=this.ctx,T=this.theme,k=this.c[this.hoverIdx()??this.n-1];if(!k)return;
    const dg=INST_BY_SYM[this.sym].digits,i=this.c.indexOf(k),pv=this.c[i-1],ch=pv?(k.c-pv.c)/pv.c*100:0;
    const up=k.c>=k.o,col=up?T.up:T.down;
    ctx.textAlign='left';ctx.font='bold 12px system-ui,Segoe UI,Arial,sans-serif';ctx.fillStyle=T.tagText;
    const head=this.sym+' · '+this.tf+'   ';ctx.fillText(head,10,14);
    let x=10+ctx.measureText(head).width;ctx.font='11px system-ui,Segoe UI,Arial,sans-serif';
    for(const [l,v] of [['O',k.o],['H',k.h],['L',k.l],['C',k.c]]){
      ctx.fillStyle=T.text;ctx.fillText(l,x,14);x+=ctx.measureText(l).width+3;
      ctx.fillStyle=col;const s=v.toFixed(dg)+'  ';ctx.fillText(s,x,14);x+=ctx.measureText(s).width+4;
    }
    ctx.fillStyle=col;ctx.fillText((ch>=0?'+':'')+ch.toFixed(2)+'%',x,14);
    ctx.fillStyle=T.text;ctx.fillText(fmtTime(k.t,true)+' UTC',10,30);
  }
}
