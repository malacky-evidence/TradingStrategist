'use strict';
/* ===================== MARKET ENGINE =====================
 * Deterministic (seeded) price-action simulator.
 * Regimes: range / uptrend / downtrend, impulse+pullback legs,
 * displacement candles (create FVGs), liquidity sweeps at range edges,
 * session volatility, and randomly generated macro news with pre-release
 * predictions and post-release price shocks.
 */
const TFMS = {M1:60000,M5:300000,M15:900000,M30:1800000,H1:3600000,H4:14400000,D1:86400000};
const TF_KEYS = Object.keys(TFMS);
const NEWS_SLOTS={USD:[12.5,12.5,12.5,14,14,15],EUR:[9,10,10,11],GBP:[7,7,9.5],JPY:[0,0.5,3]};
const ENGINE_VER = 2;     // bump whenever price generation changes: older saved markets can no longer be replayed
const SUB = 12;            // sub-ticks per M1 candle (one every 5 sim-seconds)
const HIST_MIN = 43200;    // 30 days of M1 history

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeRng(seed){
  const r=mulberry32(seed>>>0);
  r.gauss=()=>{let u=0;while(u===0)u=r();const v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  r.range=(a,b)=>a+(b-a)*r();
  r.int=(a,b)=>Math.floor(a+(b-a+1)*r());
  return r;
}

const INSTRUMENTS = [
  {sym:'EURUSD',name:'Euro / US Dollar',cls:'Forex',p0:1.0850,digits:5,vol:0.000097,contract:100000,spread:0.00012,tv:90,sess:'fx',fx:{EUR:1,USD:-1},quote:'USD'},
  {sym:'GBPUSD',name:'Pound / US Dollar',cls:'Forex',p0:1.2900,digits:5,vol:0.000115,contract:100000,spread:0.00015,tv:85,sess:'fx',fx:{GBP:1,USD:-1},quote:'USD'},
  {sym:'USDJPY',name:'US Dollar / Yen',cls:'Forex',p0:151.20,digits:3,vol:0.000106,contract:100000,spread:0.012,tv:85,sess:'fx',fx:{USD:1,JPY:-1},quote:'JPY'},
  {sym:'XAUUSD',name:'Gold / US Dollar',cls:'Metals',p0:2650,digits:2,vol:0.00024,contract:100,spread:0.25,tv:70,sess:'fx',fx:{USD:-1},quote:'USD'},
  {sym:'BTCUSD',name:'Bitcoin / US Dollar',cls:'Crypto',p0:68000,digits:2,vol:0.00038,contract:1,spread:12,tv:60,sess:'crypto',fx:{USD:-0.7},quote:'USD'},
  {sym:'ETHUSD',name:'Ethereum / US Dollar',cls:'Crypto',p0:2600,digits:2,vol:0.00048,contract:1,spread:1.2,tv:55,sess:'crypto',fx:{USD:-0.7},quote:'USD'},
  {sym:'AAPL',name:'Apple Inc.',cls:'Stocks',p0:228,digits:2,vol:0.00017,contract:100,spread:0.02,tv:50,sess:'stock',fx:{USD:-0.4},quote:'USD'},
  {sym:'V10',name:'Volatility 10 Index',cls:'Synthetic',p0:6200,digits:3,vol:0.00018,contract:1,spread:0.3,tv:40,sess:'synth',fx:{},quote:'USD'},
  {sym:'V75',name:'Volatility 75 Index',cls:'Synthetic',p0:38000,digits:2,vol:0.0006,contract:1,spread:3,tv:40,sess:'synth',fx:{},quote:'USD'}
];
const INST_BY_SYM = {}; INSTRUMENTS.forEach(d=>INST_BY_SYM[d.sym]=d);

/* dir: +1 means a higher-than-forecast number is bullish for that currency */
const NEWS_TPL = [
  {title:'US CPI m/m',ccy:'USD',impact:3,unit:'%',base:0.3,step:0.1,dec:1,dir:1,w:2},
  {title:'US Core CPI m/m',ccy:'USD',impact:3,unit:'%',base:0.3,step:0.1,dec:1,dir:1,w:1.5},
  {title:'US Non-Farm Payrolls',ccy:'USD',impact:3,unit:'K',base:180,step:10,sd:70,dec:0,dir:1,w:2},
  {title:'US Unemployment Rate',ccy:'USD',impact:2,unit:'%',base:4.1,step:0.1,dec:1,dir:-1,w:3},
  {title:'FOMC Rate Decision',ccy:'USD',impact:3,unit:'%',base:4.5,step:0.25,sd:0,dec:2,dir:1,w:0.8,calm:true},
  {title:'US Retail Sales m/m',ccy:'USD',impact:2,unit:'%',base:0.4,step:0.1,dec:1,dir:1,w:3},
  {title:'US GDP q/q',ccy:'USD',impact:2,unit:'%',base:2.4,step:0.1,dec:1,dir:1,w:2},
  {title:'US ISM Manufacturing PMI',ccy:'USD',impact:2,unit:'',base:49.5,step:0.2,dec:1,dir:1,w:2},
  {title:'ECB Rate Decision',ccy:'EUR',impact:3,unit:'%',base:3.25,step:0.25,sd:0,dec:2,dir:1,w:0.7,calm:true},
  {title:'Eurozone CPI y/y',ccy:'EUR',impact:2,unit:'%',base:2.2,step:0.1,dec:1,dir:1,w:2},
  {title:'Eurozone GDP q/q',ccy:'EUR',impact:1,unit:'%',base:0.3,step:0.1,dec:1,dir:1,w:1},
  {title:'UK CPI y/y',ccy:'GBP',impact:2,unit:'%',base:2.8,step:0.1,dec:1,dir:1,w:2},
  {title:'BoE Rate Decision',ccy:'GBP',impact:3,unit:'%',base:4.75,step:0.25,sd:0,dec:2,dir:1,w:0.7,calm:true},
  {title:'UK GDP m/m',ccy:'GBP',impact:1,unit:'%',base:0.2,step:0.1,dec:1,dir:1,w:1},
  {title:'BoJ Policy Rate',ccy:'JPY',impact:3,unit:'%',base:0.25,step:0.1,sd:0,dec:2,dir:1,w:0.7,calm:true},
  {title:'Japan CPI y/y',ccy:'JPY',impact:2,unit:'%',base:2.5,step:0.1,dec:1,dir:1,w:1.5}
];

function marketClosed(def,h,dow){
  if(def.sess==='fx')return dow===6||(dow===0&&h<22)||(dow===5&&h>=22);
  if(def.sess==='stock')return dow===6||dow===0;
  return false;
}
function sessionMult(def,h,dow){
  if(marketClosed(def,h,dow))return 0.12;     // weekend: thin, near-flat (real FX/stock markets are closed)
  switch(def.sess){
    case 'fx':{let m;
      if(h<7)m=0.6;else if(h<9)m=1.5;else if(h<12)m=1.15;else if(h<16)m=1.55;else if(h<20)m=0.95;else m=0.5;
      if(def.sym==='USDJPY'&&h<7)m=1.0;return m;}
    case 'stock': return (h>=13.5&&h<20)?(h<15?1.8:1.2):0.3;
    case 'crypto': return (h>=13&&h<21)?1.25:0.85;
    default: return 1;
  }
}
function sessionName(h,dow){
  if(dow===6||(dow===0&&h<22)||(dow===5&&h>=22))return 'Weekend — FX & stocks closed';
  if(h>=13&&h<16)return 'London / New York overlap';
  if(h>=7&&h<13)return 'London session';
  if(h>=16&&h<21)return 'New York session';
  if(h>=0&&h<7)return 'Asian session';
  return 'Late / low liquidity';
}

function newRegime(st,sig){
  const r=st.rng,prev=st.regime,pick=r();
  if(prev==='range'){
    if(pick<0.62) st.regime = st.lastSweep ? (st.lastSweep>0?'down':'up') : (r()<0.5?'up':'down');
    else st.regime='range';
  }else{
    if(pick<0.45) st.regime='range';
    else if(pick<0.70) st.regime = prev==='up'?'down':'up';
    else st.regime=prev;
  }
  st.regLeft = st.regime==='range' ? r.int(80,300) : r.int(45,160);
  if(st.regime==='range'){const half=sig*r.range(10,24);st.rHi=st.price+half;st.rLo=st.price-half;}
  st.dir = st.regime==='up'?1:st.regime==='down'?-1:0;
  st.leg='impulse'; st.legLeft=r.int(6,22);
  st.lastSweep=0;
}

class Market{
  constructor(seed,t0,minutes){
    this.seed=seed; this.t0=t0; this.minutes=0; this.minuteT=t0; this.sub=0; this.live=false; this.hour=0;
    this.newsRng=makeRng(seed*7919+13); this.news=[]; this.newsDay=t0-(t0%86400000); this.scanFrom=0; this.nid=0;
    this.handlers={}; this.st={};
    INSTRUMENTS.forEach((d,i)=>{
      const rng=makeRng(seed*31+i*977+1);
      const s={def:d,rng,price:d.p0*(1+rng.range(-0.01,0.01)),regime:'range',regLeft:0,leg:'impulse',legLeft:0,dir:0,rHi:0,rLo:0,
        script:[],candles:{},plan:null,newsVol:1,spreadMult:1,lastSweep:0};
      TF_KEYS.forEach(k=>s.candles[k]=[]);
      this.st[d.sym]=s;
    });
    this.generate(minutes);
  }
  on(ev,fn){(this.handlers[ev]=this.handlers[ev]||[]).push(fn);}
  emit(ev,x){if(!this.live)return;(this.handlers[ev]||[]).forEach(f=>f(x));}

  /* ---------- news ---------- */
  round(x,step){return Math.round(x/step)*step;}
  makeEvent(tpl,t){
    const r=this.newsRng;
    const sd=tpl.sd!==undefined?tpl.sd:tpl.step*2;
    const fc=this.round(tpl.base+r.gauss()*sd,tpl.step);
    const prev=this.round(fc+r.gauss()*tpl.step*1.5,tpl.step);
    const w=tpl.calm?[0.01,0.04,0.12,0.66,0.12,0.04,0.01]:[0.05,0.13,0.2,0.24,0.2,0.13,0.05];
    let x=r(),acc=0,k=0;for(;k<7;k++){acc+=w[k];if(x<acc)break;}
    const steps=Math.min(k,6)-3;
    const conf=Math.round(r.range(52,82));
    let lean=Math.sign(steps);
    if(r()*100>conf) lean=[-1,0,1][r.int(0,2)];
    return {id:0,t,title:tpl.title,ccy:tpl.ccy,impact:tpl.impact,unit:tpl.unit,dec:tpl.dec,dir:tpl.dir,
      forecast:fc,previous:prev,actual:fc+steps*tpl.step,steps,z:steps/1.5,conf,lean,
      mag:tpl.impact===3?5:tpl.impact===2?3.2:2,state:0};
  }
  genDay(day){
    const dow=new Date(day).getUTCDay();if(dow===0||dow===6)return;
    const r=this.newsRng,n=r.int(3,6),used=new Set(),evs=[];let calm=false;
    let tw=0;NEWS_TPL.forEach(x=>tw+=x.w);
    for(let k=0,guard=0;k<n&&guard<40;guard++){
      let pick=r()*tw,tpl=NEWS_TPL[0];
      for(const x of NEWS_TPL){pick-=x.w;if(pick<=0){tpl=x;break;}}
      if(used.has(tpl.title)||(tpl.calm&&calm))continue;
      used.add(tpl.title);if(tpl.calm)calm=true;
      const slots=NEWS_SLOTS[tpl.ccy],hr=slots[r.int(0,slots.length-1)];
      const t=Math.round((day+hr*3600000)/300000)*300000;
      if(t<this.t0+60000)continue;
      evs.push(this.makeEvent(tpl,t));k++;
    }
    evs.sort((a,b)=>a.t-b.t);evs.forEach(x=>{x.id=++this.nid;this.news.push(x);});
  }
  ensureNews(t){
    while(this.newsDay<t+80*3600000){this.genDay(this.newsDay);this.newsDay+=86400000;}
  }
  affects(def,ev){return def.fx[ev.ccy]!==undefined;}
  applyNews(ev){
    for(const sym in this.st){
      const st=this.st[sym],d=st.def;
      if(!this.affects(d,ev))continue;
      const sig=st.price*d.vol,scale=ev.impact===3?16:ev.impact===2?8:3.5;
      let total=ev.z*d.fx[ev.ccy]*ev.dir*scale*sig;
      if(ev.z===0)total=(st.rng()<0.5?1:-1)*scale*sig*0.25;
      const sg=Math.sign(total)||1,a=Math.abs(total);
      const sc=[];
      if(st.rng()<0.35)sc.push({d:-sg*a*0.4,v:3.5});          // fake-out spike against the real direction
      sc.push({d:sg*a*0.55,v:3.5},{d:sg*a*0.30,v:2.5},{d:sg*a*0.15,v:1.8},{d:-sg*a*0.08,v:1.4});
      st.script=sc;
    }
  }
  upcoming(n){return this.news.filter(e=>e.state<3).slice(0,n||6);}
  released(n){const o=this.news.filter(e=>e.state===3);return o.slice(-(n||20)).reverse();}

  /* ---------- minute generation ---------- */
  beginMinute(){
    const t=this.minuteT;this.ensureNews(t);
    const d=new Date(t);this.hour=d.getUTCHours()+d.getUTCMinutes()/60;this.dow=d.getUTCDay();
    for(let i=this.scanFrom;i<this.news.length;i++){
      const ev=this.news[i],dt=ev.t-t;
      if(dt>15*60000)break;
      if(dt<=10*60000&&ev.state<1){ev.state=1;this.emit('pre',ev);}
      if(dt<=2*60000&&ev.state<2){ev.state=2;this.emit('soon',ev);}
      if(dt<=0&&ev.state<3){ev.state=3;this.applyNews(ev);this.emit('release',ev);}
      if(ev.state===3&&t-ev.t>40*60000&&i===this.scanFrom)this.scanFrom++;
    }
    for(const sym in this.st){
      const st=this.st[sym];let nv=1,sp=1;
      for(let i=this.scanFrom;i<this.news.length;i++){
        const ev=this.news[i],dt=t-ev.t;
        if(dt<-10*60000)break;
        if(!this.affects(st.def,ev))continue;
        if(dt<0){nv=Math.min(nv,0.6);sp=Math.max(sp,1.5);}
        else if(dt<3*60000){nv=Math.max(nv,ev.mag);sp=Math.max(sp,5);}
        else if(dt<10*60000){nv=Math.max(nv,ev.mag*0.6);sp=Math.max(sp,2.5);}
        else if(dt<25*60000){nv=Math.max(nv,1.4);sp=Math.max(sp,1.3);}
      }
      st.newsVol=nv;st.spreadMult=sp;
    }
  }
  queueSweep(st,dir,sig){
    const r=st.rng;
    st.script.push({d:dir*sig*r.range(2,5),v:1.6});
    st.script.push({d:-dir*sig*r.range(6,12),v:2.2});   // reversal displacement after the stop hunt
    st.script.push({d:-dir*sig*r.range(1,3),v:1.5});
    st.lastSweep=dir;
  }
  genMinute(st){
    const d=st.def,r=st.rng,sm=sessionMult(d,this.hour,this.dow),sig=st.price*d.vol;
    if(st.regLeft<=0)newRegime(st,sig);
    st.regLeft--;
    let total,nm,scripted=false;
    if(st.script.length){const s=st.script.shift();total=s.d;nm=s.v*sm;scripted=true;}
    else{
      let drift=0;
      if(st.regime==='range'){
        const mid=(st.rHi+st.rLo)/2,half=(st.rHi-st.rLo)/2;
        drift=-(st.price-mid)/half*sig*0.35;
        if(r()<0.012){
          if(st.price>mid+half*0.6)this.queueSweep(st,1,sig);
          else if(st.price<mid-half*0.6)this.queueSweep(st,-1,sig);
        }
      }else{
        if(--st.legLeft<=0){
          st.leg=st.leg==='impulse'?'pullback':'impulse';
          st.legLeft=st.leg==='impulse'?r.int(8,28):r.int(4,14);
        }
        if(st.leg==='impulse'){
          drift=st.dir*sig*0.20;
          if(r()<0.035){
            st.script.push({d:st.dir*sig*r.range(3,5),v:2.2});       // displacement candle
            st.script.push({d:st.dir*sig*r.range(1.5,3),v:1.6});     // continuation leaves an FVG
          }
        }else drift=-st.dir*sig*0.13;
      }
      drift+=-Math.log(st.price/d.p0)/(d.vol*38)*0.105*sig;  // weak pull back to the anchor, scaled by each instrument's own volatility
      total=drift*sm*st.newsVol;
      nm=sm*st.newsVol;
    }
    const sg=sig*nm/Math.sqrt(SUB),path=[],minP=d.p0*0.2;
    let p=st.price;
    for(let i=0;i<SUB;i++){
      p+=total/SUB+r.gauss()*sg;
      if(p<minP)p=minP;
      path.push(p);
    }
    const net=Math.abs(p-st.price);
    const vol=Math.max(1,Math.round(d.tv*nm*(0.6+r()*0.8)*(1+net/(sig*nm+1e-12)*0.5)));
    return {path,vol};
  }
  pushTick(st,prev,p,v){
    const t=this.minuteT;
    for(const k of TF_KEYS){
      const ms=TFMS[k],b=t-t%ms,arr=st.candles[k],last=arr[arr.length-1];
      if(!last||last.t!==b)arr.push({t:b,o:prev,h:Math.max(prev,p),l:Math.min(prev,p),c:p,v:v});
      else{if(p>last.h)last.h=p;if(p<last.l)last.l=p;last.c=p;last.v+=v;}
    }
  }
  generate(n){
    for(let i=0;i<n;i++){
      this.beginMinute();
      for(const sym in this.st){
        const st=this.st[sym],pl=this.genMinute(st);
        let h=st.price,l=st.price;
        for(const p of pl.path){if(p>h)h=p;if(p<l)l=p;}
        st.candles.M1.push({t:this.minuteT,o:st.price,h,l,c:pl.path[SUB-1],v:pl.vol});
        st.price=pl.path[SUB-1];
      }
      this.minuteT+=60000;this.minutes++;
    }
    for(const sym in this.st){
      const st=this.st[sym],m1=st.candles.M1;
      for(const k of TF_KEYS){
        if(k==='M1')continue;
        const ms=TFMS[k],out=[];
        for(const c of m1){
          const b=c.t-c.t%ms,last=out[out.length-1];
          if(!last||last.t!==b)out.push({t:b,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v});
          else{if(c.h>last.h)last.h=c.h;if(c.l<last.l)last.l=c.l;last.c=c.c;last.v+=c.v;}
        }
        st.candles[k]=out;
      }
    }
  }

  /* ---------- live ---------- */
  tick(){
    if(this.sub===0){
      this.beginMinute();
      for(const sym in this.st)this.st[sym].plan=this.genMinute(this.st[sym]);
    }
    for(const sym in this.st){
      const st=this.st[sym],p=st.plan.path[this.sub];
      this.pushTick(st,st.price,p,Math.max(1,Math.round(st.plan.vol/SUB)));
      st.price=p;
    }
    this.sub++;
    if(this.sub>=SUB){this.sub=0;this.minuteT+=60000;this.minutes++;}
  }
  get simTime(){return this.minuteT+this.sub*5000;}
  quote(sym){
    const st=this.st[sym],d=st.def,sp=d.spread*st.spreadMult;
    return {bid:st.price,ask:st.price+sp,spread:sp};
  }
  candles(sym,tf){return this.st[sym].candles[tf];}
  fmt(sym,p){return p.toFixed(INST_BY_SYM[sym].digits);}
}
