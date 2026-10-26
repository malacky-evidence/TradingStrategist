'use strict';
/* ===================== APP: boot, loop, header, ticket, accounts ===================== */
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=(v,d=2)=>(v<0?'-':'')+'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(v,d=2)=>(v>0?'+':v<0?'-':'')+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const cls=v=>v>0?'up':v<0?'dn':'';
const SPEEDS=[{k:'⏸',tps:0,t:'Pause'},{k:'1×',tps:1,t:'1 M1 candle every 12 s'},{k:'3×',tps:3,t:'1 M1 candle every 4 s'},
  {k:'12×',tps:12,t:'1 M1 candle per second'},{k:'60×',tps:60,t:'5 M1 candles per second'},{k:'240×',tps:240,t:'20 M1 candles per second'}];
const G={market:null,broker:null,chart:null,acc:0,last:0,lastPanel:0,ui:{sym:'EURUSD',tf:'M5',speed:2,theme:'dark',tab:'pos',sound:true,show:{},drawings:{}}};
window.UI_STATE=G.ui;
const def=()=>INST_BY_SYM[G.ui.sym];
const pipSize=d=>d.cls==='Forex'?Math.pow(10,-(d.digits-1)):1;
const num=id=>{const v=parseFloat($(id).value);return isFinite(v)?v:0;};

G.journal=[];
function logEv(msg,kind){
  G.journal.unshift({t:G.market?G.market.simTime:Date.now(),msg:String(msg).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),kind:kind||''});
  if(G.journal.length>400)G.journal.length=400;G.panelsDirty=true;
}
function setStatus(html,kind){const el=$('tkStatus');el.hidden=!html;el.className='status '+(kind||'');el.innerHTML=html||'';}
function toast(msg,kind,ms){
  logEv(msg,kind);
  const el=document.createElement('div');el.className='toast '+(kind||'');el.innerHTML=msg;$('toasts').appendChild(el);
  while($('toasts').children.length>5)$('toasts').firstChild.remove();
  setTimeout(()=>el.remove(),ms||5000);
}
let actx=null;
function beep(f,dur){
  if(!G.ui.sound)return;
  try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();const o=actx.createOscillator(),g=actx.createGain();
    o.frequency.value=f||880;g.gain.value=0.04;o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+(dur||0.15));}catch(e){}
}

/* New sessions open on a weekday shortly before the London open, never in a dead weekend market. */
function startTime(){
  const now=Date.now();let d=now-(now%86400000);
  for(let i=0;i<8;i++,d-=86400000){const dow=new Date(d).getUTCDay();if(dow>=1&&dow<=5&&d+6.5*3600000<=now)return d+6.5*3600000;}
  return now-(now%60000);
}
/* ---------- boot ---------- */
function boot(){
  let saved=null;try{saved=JSON.parse(localStorage.getItem(STORE_KEY));}catch(e){}
  setTimeout(()=>{try{init(saved);}catch(err){console.error(err);$('loading').innerHTML='<div><p>Could not start the simulator.</p><pre style="max-width:80vw;white-space:pre-wrap">'+esc(err&&err.stack||err)+'</pre><button class="tb" onclick="localStorage.removeItem(STORE_KEY);location.reload()">Reset saved data and retry</button></div>';}},40);
}
function init(saved){
  const stale=!!saved&&saved.v!==ENGINE_VER;          // saved by an older version whose market can't be replayed
  const keep=!!saved&&!stale;
  const seed=keep?saved.seed:(Math.random()*2147483647)|0;
  const t0=keep?saved.t0:startTime()-HIST_MIN*60000;
  const mins=keep?Math.max(saved.minutes,HIST_MIN):HIST_MIN;
  const market=G.market=new Market(seed,t0,mins);
  if(keep&&saved.sub>0)for(let i=0;i<saved.sub&&i<SUB;i++)market.tick();   // resume mid-minute so prices match exactly
  const broker=G.broker=new Broker(market);
  let dropped=0;
  if(saved){
    broker.restore(saved);if(saved.ui)Object.assign(G.ui,saved.ui);
    if(stale){dropped=broker.positions.length+broker.pending.length;broker.positions=[];broker.pending=[];G.ui.drawings={};}
  }
  window.UI_STATE=G.ui;
  if(!INST_BY_SYM[G.ui.sym])G.ui.sym='EURUSD';
  if(!TFMS[G.ui.tf])G.ui.tf='M5';
  if(!(G.ui.speed>=0&&G.ui.speed<SPEEDS.length))G.ui.speed=2;
  G.chart=new Chart($('cv'),{
    getCandles:(s,tf)=>market.candles(s,tf),getQuote:s=>market.quote(s),getLines,onLineDrag,onContext,getMarkers,
    onToolChange:t=>document.querySelectorAll('#drawBar [data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===(t||''))),
    onDrawingsChanged:()=>{G.ui.drawings=G.chart.exportDrawings();broker.save();}
  });
  Object.assign(G.chart.show,G.ui.show||{});G.ui.show=G.chart.show;
  G.chart.importDrawings(G.ui.drawings);G.ui.drawings=G.chart.drawings;
  setTheme(G.ui.theme,true);
  buildHeader();bindUI();bindMarket();
  G.chart.setSymbol(G.ui.sym,G.ui.tf);G.chart.resize();
  market.live=true;
  $('loading').style.display='none';
  refreshAll();
  if(!saved)welcomeModal();
  else if(stale)openModal('<h3>TradingStrategist was updated</h3><p>This version has a more realistic market, so the market from your old session cannot continue. Your balances, transfers and trade history were kept and a fresh market was generated.'+(dropped?' <b>'+dropped+' open trade(s) / pending order(s)</b> from the old market were removed without profit or loss.':'')+'</p><div class="btns"><button class="tb accent" id="uOk">Continue</button></div>',true),$('uOk').onclick=closeModal;
  try{localStorage.setItem('tl_probe','1');localStorage.removeItem('tl_probe');}catch(e){toast('Your browser is blocking storage (private mode?). The simulator works, but progress will not be saved.','warn',9000);}
  document.querySelectorAll('button[title]').forEach(b=>{if(!b.getAttribute('aria-label'))b.setAttribute('aria-label',b.title);});
  setInterval(()=>broker.save(),5000);
  window.addEventListener('beforeunload',()=>broker.save());
  G.last=performance.now();requestAnimationFrame(frame);
}
function bindMarket(){
  const m=G.market,b=G.broker;
  m.on('pre',onNewsPre);m.on('soon',onNewsSoon);m.on('release',onNewsRelease);
  b.on('toast',t=>toast(t.msg,t.kind==='bad'?'bad':''));
  b.on('change',()=>{G.panelsDirty=true;});
  b.on('closed',r=>{
    const why={tp:'Take profit hit',sl:'Stop loss hit',manual:'Closed',so:'STOP OUT'}[r.reason]||'Closed';
    const d=INST_BY_SYM[r.p.sym],slip=r.reason==='sl'&&r.p.sl?Math.abs(r.price-r.p.sl)/pipSize(d):0;
    toast(why+': <b>'+r.p.sym+'</b> #'+r.p.id+' <span class="'+cls(r.net)+'">'+signed(r.net)+'</span>'+(slip>=0.5?'<br><span class="mute">Slipped '+slip.toFixed(1)+(d.cls==='Forex'?' pips':' pts')+' past your stop</span>':''),r.net>=0?'good':'bad',r.reason==='manual'?5000:9000);
    if(r.reason!=='manual')beep(r.net>=0?988:330,0.2);
  });
}
function frame(ts){
  const dt=Math.min(0.25,(ts-G.last)/1000);G.last=ts;
  const rate=SPEEDS[G.ui.speed].tps;let ticked=false;
  if(rate>0&&!G.hold){
    G.acc+=dt*rate;const n=Math.min(Math.floor(G.acc),600);G.acc=Math.min(G.acc-n,1);
    for(let i=0;i<n;i++){G.market.tick();G.broker.onTick();ticked=true;}
  }
  if(ticked)G.chart.requestDraw();
  if(G.chart.dirty)G.chart.draw();
  if(ts-G.lastPanel>250||G.panelsDirty){G.lastPanel=ts;G.panelsDirty=false;refreshAll();}
  requestAnimationFrame(frame);
}

/* ---------- header ---------- */
function buildHeader(){
  const groups={};INSTRUMENTS.forEach(d=>(groups[d.cls]=groups[d.cls]||[]).push(d));
  $('symSel').innerHTML=Object.keys(groups).map(g=>'<optgroup label="'+g+'">'+groups[g].map(d=>'<option value="'+d.sym+'">'+d.sym+' — '+d.name+'</option>').join('')+'</optgroup>').join('');
  $('symSel').value=G.ui.sym;
  $('tfBar').innerHTML=TF_KEYS.map(k=>'<button data-tf="'+k+'">'+k+'</button>').join('');
  $('speedBar').innerHTML=SPEEDS.map((s,i)=>'<button data-sp="'+i+'" title="'+(s.t||'')+'">'+s.k+'</button>').join('');
  syncHeader();
}
function syncHeader(){
  $('symSel').value=G.ui.sym;
  document.querySelectorAll('#tfBar button').forEach(b=>b.classList.toggle('on',b.dataset.tf===G.ui.tf));
  document.querySelectorAll('#speedBar button').forEach(b=>b.classList.toggle('on',+b.dataset.sp===G.ui.speed));
  const s=G.chart.show;
  $('bVol').classList.toggle('on',s.vol);$('bRsi').classList.toggle('on',s.rsi);$('bFvg').classList.toggle('on',s.fvg);
  $('bGrid').classList.toggle('on',s.grid);$('bMagnet').classList.toggle('on',s.magnet);
}
function setSymbol(sym){
  if(sym===G.ui.sym)return;G.ui.sym=sym;
  for(const id of ['oSL','oTP','oPrice'])$(id).value='';setStatus('');
  G.chart.setSymbol(G.ui.sym,G.ui.tf);syncHeader();G.panelsDirty=true;G.broker.save();
}
function setTF(tf){G.ui.tf=tf;G.chart.setSymbol(G.ui.sym,tf);syncHeader();G.broker.save();}
function setTheme(t,quiet){
  G.ui.theme=t;document.documentElement.dataset.theme=t;G.chart.setTheme(t);
  for(const l of Object.values(G.chart.drawings))for(const d of l)d.color=THEMES[t].draw;
  if(!quiet)G.broker.save();
}

/* ---------- bindings ---------- */
function bindUI(){
  $('symSel').onchange=e=>setSymbol(e.target.value);
  $('tfBar').onclick=e=>{const b=e.target.closest('[data-tf]');if(b)setTF(b.dataset.tf);};
  $('speedBar').onclick=e=>{const b=e.target.closest('[data-sp]');if(b){G.ui.speed=+b.dataset.sp;syncHeader();G.broker.save();}};
  for(const [id,k] of [['bVol','vol'],['bRsi','rsi'],['bFvg','fvg'],['bGrid','grid'],['bMagnet','magnet']])
    $(id).onclick=()=>{G.chart.toggle(k);syncHeader();G.broker.save();};
  $('bTheme').onclick=()=>setTheme(G.ui.theme==='dark'?'light':'dark');
  $('bMenu').onclick=menuModal;$('bNext').onclick=skipToNews;$('bStep').onclick=stepCandle;
  window.addEventListener('keydown',e=>{
    const tg=e.target&&e.target.tagName;if(tg==='INPUT'||tg==='SELECT'||tg==='TEXTAREA'||!$('modal').hidden)return;
    if(e.key===' '){e.preventDefault();if(G.ui.speed>0){G.prevSpeed=G.ui.speed;G.ui.speed=0;}else G.ui.speed=G.prevSpeed||2;syncHeader();}
    else if(e.key==='n'||e.key==='N')stepCandle();
  });
  $('drawBar').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)G.chart.setTool(b.dataset.tool||null);};
  $('bClear').onclick=()=>{if(confirm('Delete all drawings on '+G.ui.sym+'?'))G.chart.clearDrawings();};
  $('nStart').onclick=()=>G.chart.goStart();$('nBack').onclick=()=>G.chart.scrollBars(Math.max(10,Math.round(G.chart.plotW/G.chart.barW*0.4)));
  $('nFwd').onclick=()=>G.chart.scrollBars(-Math.max(10,Math.round(G.chart.plotW/G.chart.barW*0.4)));
  $('nZin').onclick=()=>G.chart.zoom(1.25);$('nZout').onclick=()=>G.chart.zoom(0.8);
  $('nAuto').onclick=()=>{G.chart.autoY=true;G.chart.requestDraw();};$('nLive').onclick=()=>G.chart.goLive();
  $('watchList').onclick=e=>{const r=e.target.closest('[data-sym]');if(r)setSymbol(r.dataset.sym);};
  // order ticket
  $('oType').onchange=()=>{const pend=$('oType').value!=='market';$('rowEntry').hidden=!pend;$('mktBtns').hidden=pend;$('bPlace').hidden=!pend;
    if(pend&&!$('oPrice').value){const q=G.market.quote(G.ui.sym),t=$('oType').value,d=def(),off=q.bid*d.vol*20;
      $('oPrice').value=(t==='buy_limit'?q.ask-off:t==='sell_limit'?q.bid+off:t==='buy_stop'?q.ask+off:q.bid-off).toFixed(d.digits);}
    $('bPlace').textContent='Place '+$('oType').selectedOptions[0].textContent.toLowerCase();G.chart.requestDraw();G.panelsDirty=true;};
  for(const id of ['oLots','oSL','oTP','oPrice','oRisk'])$(id).oninput=()=>{G.chart.requestDraw();G.panelsDirty=true;};
  $('lotMinus').onclick=()=>{$('oLots').value=Math.max(0.01,+(num('oLots')-0.01).toFixed(2));G.panelsDirty=true;};
  $('lotPlus').onclick=()=>{$('oLots').value=+(num('oLots')+0.01).toFixed(2);G.panelsDirty=true;};
  $('bRisk').onclick=lotsFromRisk;
  $('bSell').onclick=()=>marketOrder('sell');$('bBuy').onclick=()=>marketOrder('buy');$('bPlace').onclick=placePending;
  $('tkStatus').onclick=e=>{const f=e.target.closest('#stFund');if(!f)return;$('xAmt').value=Math.min(+f.dataset.need,Math.floor(G.broker.main));$('acct').scrollIntoView({block:'nearest',behavior:'smooth'});$('xAmt').focus();toast('Amount filled in. Press "Main → Trading" to move the money.','');};
  // accounts
  $('xTo').onclick=()=>doTransfer('toTrading');$('xFrom').onclick=()=>doTransfer('toMain');
  $('xDep').onclick=()=>{const a=num('xAmt'),e=G.broker.deposit(a);if(e)toast(e,'bad');else{toast('Added '+money(a)+' to the Main account','good');$('xAmt').value='';G.panelsDirty=true;}};
  // bottom panel
  $('botTabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b){G.ui.tab=b.dataset.tab;G.panelsDirty=true;}};
  $('botBody').onclick=bottomClick;
  $('newsList').onclick=e=>{};
  let rs=null;$('resizer').onpointerdown=e=>{rs={y:e.clientY,h:$('bottom').offsetHeight};$('resizer').setPointerCapture(e.pointerId);};
  $('resizer').onpointermove=e=>{if(!rs)return;const h=Math.max(90,Math.min(window.innerHeight*0.7,rs.h+(rs.y-e.clientY)));document.documentElement.style.setProperty('--bh',h+'px');G.chart.resize();};
  $('resizer').onpointerup=()=>{rs=null;};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#ctxMenu'))$('ctxMenu').hidden=true;});
  $('modal').addEventListener('pointerdown',e=>{if(e.target===$('modal')&&G.modalDismissable)closeModal();});
  syncTicketUI();
}
function syncTicketUI(){$('oType').onchange();}

/* ---------- ticket ---------- */
function rejectOrder(err,sym,lots,price){
  let extra='';
  if(/free margin/i.test(err)){
    const b=G.broker,need=Math.max(100,Math.ceil((b.marginFor(sym,lots,price)-b.freeMargin)/100)*100);
    extra='<br><span class="mute">Your Trading account has '+money(b.balance)+' and your Main account has '+money(b.main)+'.</span><br><button class="mini" id="stFund" data-need="'+need+'">Transfer funds to Trading…</button>';
  }
  setStatus('<b>✖ Order NOT placed.</b> '+esc(err)+extra,'bad');toast('Order rejected: '+esc(err),'bad',8000);beep(330,0.2);
}
function marketOrder(type){
  const lots=Math.round(num('oLots')*100)/100,sl=num('oSL'),tp=num('oTP'),q=G.market.quote(G.ui.sym);
  const err=G.broker.marketOrder(G.ui.sym,type,lots,sl,tp);
  if(err){rejectOrder(err,G.ui.sym,lots,type==='buy'?q.ask:q.bid);return;}
  const p=G.broker.positions[G.broker.positions.length-1],dg=INST_BY_SYM[p.sym].digits;
  setStatus('<b>✔ '+type.toUpperCase()+' '+lots.toFixed(2)+' '+p.sym+'</b> opened @ '+p.open.toFixed(dg)+' (ticket #'+p.id+')<br>Stop loss: <b>'+(p.sl?p.sl.toFixed(dg):'none')+'</b> · Take profit: <b>'+(p.tp?p.tp.toFixed(dg):'none')+'</b><br><span class="mute">Both are active. See it in the Trade tab below.</span>','good');
  toast('<b>'+type.toUpperCase()+'</b> '+lots.toFixed(2)+' '+p.sym+' @ '+p.open.toFixed(dg)+(p.sl?' · SL '+p.sl.toFixed(dg):'')+(p.tp?' · TP '+p.tp.toFixed(dg):''),'good');
  $('oSL').value='';$('oTP').value='';G.ui.tab='pos';G.panelsDirty=true;
}
function placePending(){
  const t=$('oType').value,lots=Math.round(num('oLots')*100)/100,px=num('oPrice'),err=G.broker.pendingOrder(G.ui.sym,t,lots,px,num('oSL'),num('oTP'));
  if(err){rejectOrder(err,G.ui.sym,lots,px||G.market.quote(G.ui.sym).bid);return;}
  setStatus('<b>✔ '+t.replace('_',' ').toUpperCase()+' '+lots.toFixed(2)+' '+G.ui.sym+'</b> placed @ '+px+'.<br><span class="mute">It waits in the Pending tab and becomes a trade when price reaches it.</span>','good');
  toast('Pending order placed: '+t.replace('_',' ')+' '+G.ui.sym+' @ '+px,'good');
  $('oSL').value='';$('oTP').value='';$('oPrice').value='';$('oType').value='market';$('oType').onchange();G.ui.tab='pend';G.panelsDirty=true;
}
function lotsFromRisk(){
  const sl=num('oSL'),d=def(),q=G.market.quote(G.ui.sym),t=$('oType').value;
  if(!sl){toast('Set a stop loss first, then calculate lots from your risk %.','warn');return;}
  const entry=t==='market'?(sl<q.bid?q.ask:q.bid):num('oPrice')||q.bid;
  const per=Math.abs(G.broker.toUSD(G.ui.sym,(entry-sl)*d.contract));
  if(!per){toast('Stop loss is too close to the entry price.','warn');return;}
  const risk=G.broker.equity*num('oRisk')/100,lots=Math.max(0.01,Math.floor(risk/per*100)/100);
  $('oLots').value=lots.toFixed(2);G.panelsDirty=true;
  toast('Risking '+money(risk)+' ('+num('oRisk')+'% of equity) → '+lots.toFixed(2)+' lots','');
}
function doTransfer(dir){
  const a=num('xAmt'),e=G.broker.transfer(dir,a);
  if(e){toast(e,'bad');return;}
  toast((dir==='toTrading'?'Main → Trading: ':'Trading → Main: ')+money(a),'good');$('xAmt').value='';G.panelsDirty=true;
}
function updateTicket(){
  const q=G.market.quote(G.ui.sym),d=def(),dg=d.digits,pip=pipSize(d),b=G.broker;
  $('tkSym').textContent=G.ui.sym;$('pxSell').textContent=q.bid.toFixed(dg);$('pxBuy').textContent=q.ask.toFixed(dg);
  $('spr').textContent=(q.spread/pip).toFixed(1)+(d.cls==='Forex'?' pip':'');
  document.title=G.ui.sym+' '+q.bid.toFixed(dg)+' — TradingStrategist';
  const lots=num('oLots'),sl=num('oSL'),tp=num('oTP'),t=$('oType').value,unit=d.cls==='Forex'?' pips':' pts';
  const buy=t==='market'?(sl?sl<q.bid:tp?tp>q.ask:true):t.startsWith('buy');
  const entry=t==='market'?(buy?q.ask:q.bid):(num('oPrice')||q.bid);
  $('hintSL').textContent=sl?'Distance '+(Math.abs(entry-sl)/pip).toFixed(1)+unit:'';
  $('hintTP').textContent=tp?'Distance '+(Math.abs(tp-entry)/pip).toFixed(1)+unit:'';
  const margin=b.marginFor(G.ui.sym,lots,entry);
  const rl=sl?Math.abs(b.toUSD(G.ui.sym,(entry-sl)*lots*d.contract)):0,rw=tp?Math.abs(b.toUSD(G.ui.sym,(tp-entry)*lots*d.contract)):0;
  const short=margin>b.freeMargin;
  $('tkSummary').innerHTML=(short?'<div style="color:var(--down)"><b>Not enough free margin. Transfer funds to the Trading account first.</b></div>':'')+'<div><span>Margin required</span><b>'+money(margin)+'</b></div>'+
    '<div><span>Risk at stop loss</span><b class="dn">'+(sl?money(-rl)+(b.equity>0?' ('+(rl/b.equity*100).toFixed(2)+'%)':''):'—')+'</b></div>'+
    '<div><span>Reward at take profit</span><b class="up">'+(tp?money(rw):'—')+'</b></div>'+
    '<div><span>Reward : Risk</span><b>'+(sl&&tp&&rl?(rw/rl).toFixed(2)+' : 1':'—')+'</b></div>';
}

/* ---------- chart overlays ---------- */
function getLines(sym){
  const out=[],m=G.market,b=G.broker,dg=INST_BY_SYM[sym].digits;
  for(const p of b.positions){
    if(p.sym!==sym)continue;
    const pl=b.pnl(p,b.closePrice(p))-p.commission,buy=p.type==='buy';
    out.push({id:p.id,kind:'pos',price:p.open,color:buy?'#2f7cf6':'#e0443e',label:'#'+p.id+' '+p.type.toUpperCase()+' '+p.lots.toFixed(2)+'  '+signed(pl),drag:false});
    if(p.sl)out.push({id:p.id,kind:'sl',price:p.sl,color:'#ef5350',label:'SL #'+p.id+'  '+signed(b.pnl(p,p.sl)-p.commission),drag:true});
    if(p.tp)out.push({id:p.id,kind:'tp',price:p.tp,color:'#26a69a',label:'TP #'+p.id+'  '+signed(b.pnl(p,p.tp)-p.commission),drag:true});
  }
  for(const o of b.pending){
    if(o.sym!==sym)continue;
    out.push({id:o.id,kind:'pend',price:o.price,color:'#8a63d2',label:o.type.replace('_',' ').toUpperCase()+' '+o.lots.toFixed(2)+'  #'+o.id,drag:true});
    if(o.sl)out.push({id:o.id,kind:'psl',price:o.sl,color:'#ef5350',label:'SL #'+o.id+'  pending',drag:true});
    if(o.tp)out.push({id:o.id,kind:'ptp',price:o.tp,color:'#26a69a',label:'TP #'+o.id+'  pending',drag:true});
  }
  if(sym===G.ui.sym){ // live preview of the order being prepared
    const sl=num('oSL'),tp=num('oTP'),pr=num('oPrice');
    if($('oType').value!=='market'&&pr)out.push({id:'tk',kind:'tkE',price:pr,color:'#6c7a92',label:'PREVIEW  entry (not placed)',drag:false});
    if(sl)out.push({id:'tk',kind:'tkSL',price:sl,color:'#b34a48',label:'PREVIEW  SL (not placed yet)',drag:false});
    if(tp)out.push({id:'tk',kind:'tkTP',price:tp,color:'#2f8f84',label:'PREVIEW  TP (not placed yet)',drag:false});
  }
  return out;
}
function onLineDrag(line,price){
  const b=G.broker,dg=INST_BY_SYM[G.ui.sym].digits;price=+price.toFixed(dg);
  const p=b.positions.find(x=>x.id===line.id),o=b.pending.find(x=>x.id===line.id);let err=null;
  if(line.kind==='sl')err=b.modify(line.id,price,p.tp);
  else if(line.kind==='tp')err=b.modify(line.id,p.sl,price);
  else if(line.kind==='psl')err=b.modify(line.id,price,o.tp);
  else if(line.kind==='ptp')err=b.modify(line.id,o.sl,price);
  else if(line.kind==='pend'){
    const q=G.market.quote(o.sym),ok=(o.type==='buy_limit'&&price<q.ask)||(o.type==='sell_limit'&&price>q.bid)||(o.type==='buy_stop'&&price>q.ask)||(o.type==='sell_stop'&&price<q.bid);
    if(ok)b.movePending(line.id,price);else err='That price is on the wrong side of the market for a '+o.type.replace('_',' ')+'.';
  }
  if(err)toast(err,'bad');else toast('Order #'+line.id+' updated → '+price.toFixed(dg),'');
  G.chart.requestDraw();G.panelsDirty=true;
}
function getMarkers(sym,t0,t1){
  const d=INST_BY_SYM[sym],out=[];
  for(const ev of G.market.news){if(ev.t<t0)continue;if(ev.t>t1)break;if(ev.state>=1&&G.market.affects(d,ev))out.push({t:ev.t,label:ev.ccy+' '+ev.title,impact:ev.impact});}
  return out;
}
function onContext(c){
  const q=G.market.quote(G.ui.sym),dg=def().digits,p=+c.price.toFixed(dg),items=[];
  items.push('<div class="h">'+G.ui.sym+' @ '+p.toFixed(dg)+'</div>');
  if(p>q.ask)items.push(['sell_limit','Sell limit here'],['buy_stop','Buy stop here']);
  else if(p<q.bid)items.push(['buy_limit','Buy limit here'],['sell_stop','Sell stop here']);
  items.push(['sl','Use as stop loss'],['tp','Use as take profit'],['hline','Add horizontal line']);
  const m=$('ctxMenu');
  m.innerHTML=items.map(i=>typeof i==='string'?i:'<button data-a="'+i[0]+'">'+i[1]+'</button>').join('');
  m.style.left=Math.min(c.cx,window.innerWidth-240)+'px';m.style.top=Math.min(c.cy,window.innerHeight-230)+'px';m.hidden=false;
  m.onclick=e=>{
    const a=e.target.closest('[data-a]');if(!a)return;m.hidden=true;const k=a.dataset.a;
    if(k==='sl')$('oSL').value=p.toFixed(dg);else if(k==='tp')$('oTP').value=p.toFixed(dg);
    else if(k==='hline'){G.chart.addDrawing({type:'hline',pts:[{t:G.chart.c[G.chart.n-1].t,p}]});}
    else{$('oType').value=k;$('oType').onchange();$('oPrice').value=p.toFixed(dg);toast('Order ticket ready: '+k.replace('_',' ')+' @ '+p.toFixed(dg)+'. Set volume, SL/TP and press Place.','');}
    G.chart.requestDraw();G.panelsDirty=true;
  };
}
function stepCandle(){
  const m=G.market,sym=G.ui.sym,tf=G.ui.tf,n0=m.candles(sym,tf).length;
  if(G.ui.speed>0){G.prevSpeed=G.ui.speed;G.ui.speed=0;syncHeader();}
  G.hold=true;let g=0;
  while(m.candles(sym,tf).length===n0&&g<30000){m.tick();G.broker.onTick();g++;}
  G.hold=false;G.chart.requestDraw();G.panelsDirty=true;
}
function skipToNews(){
  const ev=G.market.upcoming(1)[0];if(!ev)return;
  G.hold=true;let g=0;
  while(ev.state<1&&g<90000){G.market.tick();G.broker.onTick();g++;}
  G.hold=false;G.chart.requestDraw();G.panelsDirty=true;
}
window.addEventListener('DOMContentLoaded',boot);
