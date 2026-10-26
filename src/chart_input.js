'use strict';
/* ===================== CHART: zoom, scroll, drawing tools, trade lines ===================== */
Object.assign(Chart.prototype,{

  /* ---------- navigation (also used by toolbar buttons / keyboard) ---------- */
  zoomTo(barW,x){
    if(!this.n)return;
    if(x===undefined)x=this.plotW;
    const f=this.idxOfXf(x);
    this.barW=Math.max(1.5,Math.min(60,barW));
    this.shift=(this.plotW-x)/this.barW-(this.n-1-f)-0.5;
    this.requestDraw();
  },
  zoom(factor){this.zoomTo(this.barW*factor,this.plotW*0.6);},
  scrollBars(k){this.shift-=k;this.requestDraw();},            // k>0 moves back in time (older candles)
  goLive(){this.shift=8;this.autoY=true;this.requestDraw();},
  goStart(){this.shift=-(this.n-Math.floor(this.plotW/this.barW)+3);this.requestDraw();},
  isLive(){return this.shift>=-1;},
  setTool(t){this.tool=t;this.pendingDraw=null;this.cv.style.cursor=t?'crosshair':'';this.requestDraw();if(this.opts.onToolChange)this.opts.onToolChange(t);},
  toggle(k){this.show[k]=!this.show[k];this.layout();this.requestDraw();},
  setTheme(name){this.theme=THEMES[name];this.requestDraw();},
  exportDrawings(){return this.drawings;},
  importDrawings(d){this.drawings=d||{};this.requestDraw();},
  clearDrawings(){this.drawings[this.sym]=[];this.selected=null;this.changed();},
  changed(){this.requestDraw();if(this.opts.onDrawingsChanged)this.opts.onDrawingsChanged();},

  /* ---------- input ---------- */
  initInput(){
    const cv=this.cv;cv.style.touchAction='none';this.ptrs=new Map();this.drag=null;this.pinch=null;this.uid=1;
    cv.addEventListener('pointerdown',e=>this.onDown(e));
    cv.addEventListener('pointermove',e=>this.onMove(e));
    cv.addEventListener('pointerup',e=>this.onUp(e));
    cv.addEventListener('pointercancel',e=>this.onUp(e));
    cv.addEventListener('pointerleave',()=>{if(!this.drag){this.mouse=null;this.requestDraw();}});
    cv.addEventListener('wheel',e=>this.onWheel(e),{passive:false});
    cv.addEventListener('dblclick',e=>{const p=this.pos(e);if(p.x>this.plotW&&p.y<this.timeY){this.autoY=true;this.requestDraw();}});
    cv.addEventListener('contextmenu',e=>{
      e.preventDefault();const p=this.pos(e);
      if(this.opts.onContext&&p.x<this.plotW&&p.y<this.main.y1)this.opts.onContext({price:this.pOfY(p.y),cx:e.clientX,cy:e.clientY});
    });
    window.addEventListener('keydown',e=>this.onKey(e));
    if(window.ResizeObserver)new ResizeObserver(()=>this.resize()).observe(cv);
    window.addEventListener('resize',()=>this.resize());
  },
  pos(e){const r=this.cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};},
  onKey(e){
    const tg=e.target&&e.target.tagName;if(tg==='INPUT'||tg==='SELECT'||tg==='TEXTAREA')return;
    if(e.key==='ArrowLeft'){this.scrollBars(e.shiftKey?60:10);e.preventDefault();}
    else if(e.key==='ArrowRight'){this.scrollBars(e.shiftKey?-60:-10);e.preventDefault();}
    else if(e.key==='+'||e.key==='='){this.zoom(1.2);}
    else if(e.key==='-'||e.key==='_'){this.zoom(1/1.2);}
    else if(e.key==='End'){this.goLive();}
    else if(e.key==='Home'){this.goStart();}
    else if(e.key==='Escape'){this.pendingDraw=null;this.selected=null;if(this.tool)this.setTool(null);this.requestDraw();}
    else if((e.key==='Delete'||e.key==='Backspace')&&this.selected){
      const l=this.drawings[this.sym]||[];this.drawings[this.sym]=l.filter(d=>d.id!==this.selected);this.selected=null;this.changed();
    }
  },
  onWheel(e){
    e.preventDefault();const p=this.pos(e);
    if(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)){
      this.scrollBars((e.deltaX||e.deltaY)/Math.max(4,this.barW)*0.6);return;
    }
    this.zoomTo(this.barW*Math.exp(-e.deltaY*0.0015),Math.min(p.x,this.plotW));
  },
  onDown(e){
    if(e.button===2)return;
    this.cv.setPointerCapture(e.pointerId);
    const p=this.pos(e);this.ptrs.set(e.pointerId,p);this.mouse=p;
    if(this.ptrs.size===2){
      const [a,b]=[...this.ptrs.values()];
      this.pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,barW:this.barW,f:this.idxOfXf((a.x+b.x)/2)};
      this.drag=null;return;
    }
    if(p.y>this.timeY){this.drag={mode:'xaxis',x:p.x,barW:this.barW};return;}
    if(p.x>this.plotW){
      this.drag={mode:'yaxis',y:p.y,min:this.yMin,max:this.yMax};return;
    }
    if(this.tool&&p.y<this.main.y1){this.drag={mode:'tool',x:p.x,y:p.y,moved:false};return;}
    const ln=p.y<this.main.y1?this.hitLine(p.y):null;
    if(ln){this.drag={mode:'line',line:ln};this.dragLine={line:ln,price:ln.price};this.requestDraw();return;}
    this.drag={mode:'pan',x:p.x,y:p.y,shift:this.shift,min:this.yMin,max:this.yMax,moved:false};
  },
  onMove(e){
    const p=this.pos(e);this.mouse=p;
    if(this.ptrs.has(e.pointerId))this.ptrs.set(e.pointerId,p);
    if(this.pinch&&this.ptrs.size>=2){
      const [a,b]=[...this.ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y)||1,mx=(a.x+b.x)/2;
      this.barW=Math.max(1.5,Math.min(60,this.pinch.barW*d/this.pinch.d));
      this.shift=(this.plotW-mx)/this.barW-(this.n-1-this.pinch.f)-0.5;
      this.requestDraw();return;
    }
    const d=this.drag;
    if(!d){
      let cur='crosshair';
      if(p.x>this.plotW||p.y>this.timeY)cur=p.y>this.timeY?'ew-resize':'ns-resize';
      else if(p.y<this.main.y1&&this.hitLine(p.y))cur='ns-resize';
      else if(!this.tool&&p.y<this.main.y1&&this.hitDrawing(p.x,p.y))cur='pointer';
      this.cv.style.cursor=cur;this.requestDraw();return;
    }
    if(d.mode==='pan'){
      const dx=p.x-d.x,dy=p.y-d.y;
      if(Math.abs(dx)>3||Math.abs(dy)>3)d.moved=true;
      if(d.moved){
        this.shift=d.shift-dx/this.barW;
        if(!this.autoY){const dp=dy/(this.main.y1-this.main.y0)*(d.max-d.min);this.yMin=d.min+dp;this.yMax=d.max+dp;}
        this.cv.style.cursor='grabbing';
      }
    }else if(d.mode==='line'){
      this.dragLine={line:d.line,price:this.pOfY(Math.max(this.main.y0,Math.min(this.main.y1,p.y)))};
    }else if(d.mode==='yaxis'){
      const f=Math.exp((p.y-d.y)*0.004),c=(d.min+d.max)/2,h=(d.max-d.min)/2*f;
      this.autoY=false;this.yMin=c-h;this.yMax=c+h;
    }else if(d.mode==='xaxis'){
      const f=Math.exp((p.x-d.x)*0.004);this.zoomTo(d.barW*f,this.plotW);
    }else if(d.mode==='tool'){
      if(Math.hypot(p.x-d.x,p.y-d.y)>6)d.moved=true;
    }
    this.requestDraw();
  },
  onUp(e){
    const p=this.pos(e),d=this.drag;this.ptrs.delete(e.pointerId);
    if(this.ptrs.size<2)this.pinch=null;
    if(!d)return;
    this.drag=null;
    if(d.mode==='line'){
      const dl=this.dragLine;this.dragLine=null;
      if(dl&&this.opts.onLineDrag)this.opts.onLineDrag(dl.line,dl.price);
    }else if(d.mode==='tool'){
      this.toolPoint(p.x,p.y,d.moved,d);
    }else if(d.mode==='pan'&&!d.moved){
      const h=p.y<this.main.y1&&p.x<this.plotW?this.hitDrawing(p.x,p.y):null;
      this.selected=h?h.id:null;
    }
    this.cv.style.cursor=this.tool?'crosshair':'';
    this.requestDraw();
  },

  /* ---------- drawing tools ---------- */
  snap(x,y){
    let idx=Math.round(this.idxOfXf(x)),p=this.pOfY(y);
    if(this.show.magnet&&idx>=0&&idx<this.n){
      const k=this.c[idx];let best=null,bd=18;
      for(const v of [k.o,k.h,k.l,k.c]){const dd=Math.abs(this.yOfP(v)-y);if(dd<bd){bd=dd;best=v;}}
      if(best!==null)p=best;
    }
    return {t:this.c[0].t+idx*this.tfMs(),p};
  },
  toolPoint(x,y,moved,d){
    const pt=this.snap(x,y),type=this.tool;
    if(type==='hline'){this.addDrawing({type,pts:[pt]});return;}
    if(!this.pendingDraw){
      if(moved){this.addDrawing({type,pts:[this.snap(d.x,d.y),pt]});return;}   // click-drag draws in one gesture
      this.pendingDraw={type,pts:[pt]};return;                                 // click, then click again
    }
    this.pendingDraw.pts.push(pt);
    const done=this.pendingDraw;this.pendingDraw=null;this.addDrawing(done);
  },
  addDrawing(d){
    d.id=this.uid++;d.color=this.theme.draw;
    (this.drawings[this.sym]=this.drawings[this.sym]||[]).push(d);
    this.selected=d.id;this.setTool(null);this.changed();
  },
  shapePx(d){return d.pts.map(q=>({x:this.xOfTime(q.t),y:this.yOfP(q.p),p:q.p}));},
  distSeg(px,py,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
    let t=l2?((px-a.x)*dx+(py-a.y)*dy)/l2:0;t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(a.x+t*dx),py-(a.y+t*dy));
  },
  hitDrawing(x,y){
    const list=this.drawings[this.sym]||[];
    for(let i=list.length-1;i>=0;i--){
      const d=list[i],q=this.shapePx(d);
      if(d.type==='hline'){if(Math.abs(y-q[0].y)<6)return d;}
      else if(d.type==='trend'){if(this.distSeg(x,y,q[0],q[1])<7)return d;}
      else if(d.type==='rect'){
        const x0=Math.min(q[0].x,q[1].x),x1=Math.max(q[0].x,q[1].x),y0=Math.min(q[0].y,q[1].y),y1=Math.max(q[0].y,q[1].y);
        if(x>=x0-4&&x<=x1+4&&y>=y0-4&&y<=y1+4)return d;
      }else if(d.type==='fib'){
        const x0=Math.min(q[0].x,q[1].x);
        if(x>=x0-4)for(const lv of FIB_LEVELS){const yy=q[0].y+(q[1].y-q[0].y)*lv;if(Math.abs(y-yy)<5)return d;}
      }
    }
    return null;
  },
  drawShape(d,sel,preview){
    const ctx=this.ctx,T=this.theme,q=this.shapePx(d),col=d.color||T.draw,dg=INST_BY_SYM[this.sym].digits;
    ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=sel?2:1.3;
    if(preview)ctx.setLineDash([5,4]);
    if(d.type==='hline'){
      const y=Math.round(q[0].y)+0.5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this.plotW,y);ctx.stroke();
    }else if(q.length>=2){
      const a=q[0],b=q[1];
      if(d.type==='trend'){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
      else if(d.type==='rect'){
        ctx.globalAlpha=0.14;ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));ctx.globalAlpha=1;
        ctx.strokeRect(Math.min(a.x,b.x)+0.5,Math.min(a.y,b.y)+0.5,Math.abs(b.x-a.x),Math.abs(b.y-a.y));
      }else if(d.type==='fib'){
        const xl=Math.min(a.x,b.x);
        ctx.beginPath();ctx.setLineDash([2,3]);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash(preview?[5,4]:[]);
        for(const lv of FIB_LEVELS){
          const y=a.y+(b.y-a.y)*lv,pr=a.p+(b.p-a.p)*lv;
          ctx.globalAlpha=lv===0.5||lv===0.618?1:0.65;
          ctx.beginPath();ctx.moveTo(xl,Math.round(y)+0.5);ctx.lineTo(this.plotW,Math.round(y)+0.5);ctx.stroke();
          ctx.textAlign='left';ctx.fillText((lv*100).toFixed(1)+'%  '+pr.toFixed(dg),xl+4,y-7);
        }
        ctx.globalAlpha=1;
      }
    }
    if(sel){ctx.fillStyle='#fff';for(const p of q){ctx.fillRect(p.x-3,p.y-3,6,6);}}
    ctx.setLineDash([]);ctx.lineWidth=1;
  },
  drawDrawings(){
    for(const d of this.drawings[this.sym]||[])this.drawShape(d,d.id===this.selected,false);
    if(this.pendingDraw&&this.mouse&&this.mouse.x<this.plotW){
      const pt=this.snap(this.mouse.x,this.mouse.y);
      this.drawShape({type:this.pendingDraw.type,color:this.theme.draw,pts:[this.pendingDraw.pts[0],pt]},false,true);
    }
  },

  /* ---------- trade lines (positions, pending orders, SL, TP) ---------- */
  hitLine(y){
    const ls=this.opts.getLines?this.opts.getLines(this.sym):[];
    let best=null,bd=6;
    for(const l of ls){if(!l.drag)continue;const dd=Math.abs(this.yOfP(l.price)-y);if(dd<bd){bd=dd;best=l;}}
    return best;
  },
  drawTradeLines(){
    const ls=this.opts.getLines?this.opts.getLines(this.sym):[];
    const ctx=this.ctx,dg=INST_BY_SYM[this.sym].digits;
    for(const l of ls){
      const dl=this.dragLine&&this.dragLine.line.id===l.id&&this.dragLine.line.kind===l.kind?this.dragLine:null;
      const price=dl?dl.price:l.price,y=this.yOfP(price);
      if(y<-20||y>this.main.y1+20)continue;
      const yy=Math.round(y)+0.5;
      ctx.strokeStyle=l.color;ctx.lineWidth=l.kind==='pos'?1.5:1;
      ctx.setLineDash(l.kind==='pos'?[]:[6,4]);
      ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(this.plotW,yy);ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=1;
      const text=dl?l.label.split('  ')[0]+'  '+price.toFixed(dg):l.label;
      ctx.font='bold 11px system-ui,Segoe UI,Arial,sans-serif';
      const w=ctx.measureText(text).width+14;
      ctx.fillStyle=l.color;ctx.fillRect(10,y-9,w,18);
      ctx.fillStyle='#fff';ctx.textAlign='left';ctx.fillText(text,17,y);
      ctx.font='11px system-ui,Segoe UI,Arial,sans-serif';
      if(l.drag){ctx.fillStyle='rgba(255,255,255,.85)';ctx.fillText('⇕',10+w+4,y);}
    }
  },
  /* axis tags for trade lines are drawn after clipping is restored */
  drawCrosshair(){
    const ctx=this.ctx,T=this.theme,m=this.mouse;
    // axis tags for trade lines
    const ls=this.opts.getLines?this.opts.getLines(this.sym):[],dg=INST_BY_SYM[this.sym].digits;
    for(const l of ls){
      const dl=this.dragLine&&this.dragLine.line.id===l.id&&this.dragLine.line.kind===l.kind?this.dragLine:null;
      this.tagY(this.yOfP(dl?dl.price:l.price),(dl?dl.price:l.price).toFixed(dg),l.color,'#fff');
    }
    for(const d of this.drawings[this.sym]||[])if(d.type==='hline')this.tagY(this.yOfP(d.pts[0].p),d.pts[0].p.toFixed(dg),d.color||T.draw,'#111');
    if(!m||m.x<0||m.x>this.plotW||m.y<0||m.y>this.timeY)return;
    if(this.drag&&this.drag.mode==='pan'&&this.drag.moved)return;
    const idx=Math.round(this.idxOfXf(m.x)),cx=Math.round(this.xOfIdx(idx))+0.5;
    ctx.strokeStyle=T.cross;ctx.setLineDash([4,4]);ctx.beginPath();
    ctx.moveTo(cx,0);ctx.lineTo(cx,this.timeY);
    if(m.y<this.main.y1){ctx.moveTo(0,Math.round(m.y)+0.5);ctx.lineTo(this.plotW,Math.round(m.y)+0.5);}
    ctx.stroke();ctx.setLineDash([]);
    if(m.y<this.main.y1)this.tagY(m.y,this.pOfY(m.y).toFixed(dg),T.tag,T.tagText);
    const t=this.c[0].t+idx*this.tfMs(),s=new Date(t),txt=s.getUTCDate()+' '+MONTHS[s.getUTCMonth()]+'  '+fmtTime(t);
    const w=ctx.measureText(txt).width+14;
    ctx.fillStyle=T.tag;ctx.fillRect(Math.max(0,Math.min(this.plotW-w,cx-w/2)),this.timeY+2,w,this.axisH-4);
    ctx.fillStyle=T.tagText;ctx.textAlign='center';ctx.fillText(txt,Math.max(w/2,Math.min(this.plotW-w/2,cx)),this.timeY+this.axisH/2+1);
  }
});
const FIB_LEVELS=[0,0.236,0.382,0.5,0.618,0.786,1];

Object.assign(Chart.prototype,{
  drawMarkers(){
    const ms=this.tfMs(),t0=this.c[0].t+this.vis[0]*ms-ms,t1=this.c[0].t+Math.ceil(this.idxOfXf(this.plotW))*ms;
    const list=this.opts.getMarkers(this.sym,t0,t1),ctx=this.ctx,T=this.theme;
    let lastEnd=-1e9;
    for(const m of list){
      const x=Math.round(this.xOfIdx((m.t-this.c[0].t)/ms)-this.barW/2)+0.5,col=m.impact===3?'#ff5a5f':m.impact===2?'#f5a623':'#e8c547';
      ctx.strokeStyle=col;ctx.globalAlpha=0.7;ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,this.timeY);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      ctx.font='10px system-ui,Segoe UI,Arial,sans-serif';const w=ctx.measureText(m.label).width+10;
      if(x+2>lastEnd+4&&m.impact>=2){lastEnd=x+2+w;ctx.fillStyle=col;ctx.fillRect(x+2,36,w,15);ctx.fillStyle='#111';ctx.textAlign='left';ctx.fillText(m.label,x+7,44);}
      ctx.font='11px system-ui,Segoe UI,Arial,sans-serif';
    }
  }
});
