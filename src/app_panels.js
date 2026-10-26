'use strict';
/* ===================== APP: panels, news UI, modals ===================== */
function safeSet(el,html){
  if(el._html===html||el._press)return;
  el.innerHTML=html;el._html=html;
}
['botBody','watchList'].forEach(id=>{
  window.addEventListener('DOMContentLoaded',()=>{const el=$(id);el.addEventListener('pointerdown',()=>{el._press=true;});});
});
window.addEventListener('pointerup',()=>{['botBody','watchList'].forEach(id=>{if($(id))$(id)._press=false;});});
window.addEventListener('pointercancel',()=>{['botBody','watchList'].forEach(id=>{if($(id))$(id)._press=false;});});

const fmtT=t=>fmtTime(t,true);
const nv=(ev,v)=>v.toFixed(ev.dec)+ev.unit;
function countdown(ms){
  if(ms<=0)return 'now';const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;
  return h>0?h+'h '+String(m).padStart(2,'0')+'m':String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0');
}
function refreshAll(){
  updateWatch();updateAccounts();updateTicket();updateClock();updateBottom();updateNews();updateBanners();
  $('nLive').style.display=G.chart.isLive()?'none':'inline-block';
}
function updateClock(){
  const m=G.market;$('simClock').textContent=fmtT(m.simTime)+' UTC';$('simSession').textContent=sessionName(m.hour,m.dow);
}

/* ---------- market watch ---------- */
function updateWatch(){
  let h='',last='';
  for(const d of INSTRUMENTS){
    if(d.cls!==last){h+='<div class="wgrp">'+d.cls+'</div>';last=d.cls;}
    const q=G.market.quote(d.sym),day=G.market.candles(d.sym,'D1'),open=day[day.length-1].o,ch=(q.bid-open)/open*100;
    h+='<div class="wrow'+(d.sym===G.ui.sym?' on':'')+'" data-sym="'+d.sym+'"><div><div class="s">'+d.sym+'</div><div class="c">'+d.name+'</div></div>'+
       '<div class="p"><b>'+q.bid.toFixed(d.digits)+'</b><small class="'+cls(ch)+'">'+signed(ch)+'%</small></div></div>';
  }
  safeSet($('watchList'),h);
}

/* ---------- accounts ---------- */
function updateAccounts(){
  const b=G.broker,fl=b.floating(),lvl=b.marginLevel;
  $('aMain').textContent=money(b.main);$('aBal').textContent=money(b.balance);$('aEq').textContent=money(b.equity);
  $('aFl').textContent=signed(fl);$('aFl').className=cls(fl);$('aMg').textContent=money(b.usedMargin());
  $('aFree').textContent=money(b.freeMargin);$('aLvl').textContent=b.positions.length?lvl.toFixed(0)+'%':'—';
  $('aLvl').className=b.positions.length&&lvl<100?'dn':'';
  $('botSummary').innerHTML='Balance <b>'+money(b.balance)+'</b> · Equity <b>'+money(b.equity)+'</b> · Margin <b>'+money(b.usedMargin())+
    '</b> · Free <b>'+money(b.freeMargin)+'</b> · P/L <b class="'+cls(fl)+'">'+signed(fl)+'</b>';
  $('cPos').textContent=b.positions.length;$('cPend').textContent=b.pending.length;
}

/* ---------- bottom tabs ---------- */
function updateBottom(){
  document.querySelectorAll('#botTabs [data-tab]').forEach(x=>x.classList.toggle('on',x.dataset.tab===G.ui.tab));
  const t=G.ui.tab;
  safeSet($('botBody'),t==='pos'?tabPositions():t==='pend'?tabPending():t==='hist'?tabHistory():t==='log'?tabJournal():tabWallet());
}
function typeTag(t){const b=t.startsWith('buy');return '<span class="tag '+(b?'buy':'sell')+'">'+t.replace('_',' ').toUpperCase()+'</span>';}
function tabPositions(){
  const b=G.broker;if(!b.positions.length)return '<div class="empty">No open trades. Use the order ticket on the right, or right-click the chart to set up a pending order.</div>';
  let tot=0;
  const rows=b.positions.map(p=>{
    const d=INST_BY_SYM[p.sym],px=b.closePrice(p),pl=b.pnl(p,px)-p.commission;tot+=pl;
    return '<tr class="clk" data-sym="'+p.sym+'"><td>#'+p.id+'</td><td class="l">'+fmtT(p.openTime)+'</td><td class="l">'+typeTag(p.type)+'</td><td class="l"><b>'+p.sym+'</b></td>'+
      '<td>'+p.lots.toFixed(2)+'</td><td>'+p.open.toFixed(d.digits)+'</td><td>'+(p.sl?p.sl.toFixed(d.digits):'—')+'</td><td>'+(p.tp?p.tp.toFixed(d.digits):'—')+'</td>'+
      '<td>'+px.toFixed(d.digits)+'</td><td class="'+cls(pl)+'"><b>'+signed(pl)+'</b></td>'+
      '<td><button class="mini" data-act="mod" data-id="'+p.id+'">Modify</button> <button class="mini red" data-act="close" data-id="'+p.id+'">Close</button></td></tr>';
  }).join('');
  return '<table><thead><tr><th>Ticket</th><th class="l">Opened (sim UTC)</th><th class="l">Type</th><th class="l">Symbol</th><th>Lots</th><th>Open</th><th>S/L</th><th>T/P</th><th>Price</th><th>Profit</th>'+
    '<th><button class="mini" data-act="closeall">Close all</button> <button class="mini" data-act="closewin">Winners</button> <button class="mini" data-act="closelose">Losers</button></th></tr></thead><tbody>'+rows+
    '<tr><td colspan="9" class="l mute">Floating total (after commission)</td><td class="'+cls(tot)+'"><b>'+signed(tot)+'</b></td><td></td></tr></tbody></table>';
}
function tabPending(){
  const b=G.broker;if(!b.pending.length)return '<div class="empty">No pending orders. Right-click the chart above or below the price to place limit / stop orders. Drag their lines to adjust.</div>';
  const rows=b.pending.map(o=>{
    const d=INST_BY_SYM[o.sym],q=G.market.quote(o.sym);
    return '<tr class="clk" data-sym="'+o.sym+'"><td>#'+o.id+'</td><td class="l">'+fmtT(o.time)+'</td><td class="l">'+typeTag(o.type)+'</td><td class="l"><b>'+o.sym+'</b></td><td>'+o.lots.toFixed(2)+'</td>'+
      '<td>'+o.price.toFixed(d.digits)+'</td><td>'+(o.sl?o.sl.toFixed(d.digits):'—')+'</td><td>'+(o.tp?o.tp.toFixed(d.digits):'—')+'</td><td>'+q.bid.toFixed(d.digits)+'</td>'+
      '<td><button class="mini" data-act="mod" data-id="'+o.id+'">Modify</button> <button class="mini red" data-act="cancel" data-id="'+o.id+'">Cancel</button></td></tr>';
  }).join('');
  return '<table><thead><tr><th>Ticket</th><th class="l">Placed</th><th class="l">Type</th><th class="l">Symbol</th><th>Lots</th><th>Entry</th><th>S/L</th><th>T/P</th><th>Market</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function tabHistory(){
  const b=G.broker,s=b.stats();
  const head='<div class="stats"><span>Trades <b>'+s.trades+'</b></span><span>Win rate <b>'+s.winRate.toFixed(1)+'%</b></span><span>Net <b class="'+cls(s.net)+'">'+signed(s.net)+'</b></span>'+
    '<span>Profit factor <b>'+(s.pf===Infinity?'∞':s.pf.toFixed(2))+'</b></span><span>Avg win <b class="up">'+money(s.avgWin)+'</b></span><span>Avg loss <b class="dn">'+money(-s.avgLoss)+'</b></span>'+
    '<span class="spacer"></span><button class="mini" data-act="csv">Export CSV</button></div>';
  if(!b.history.length)return head+'<div class="empty">Your closed trades will appear here.</div>';
  const why={tp:'T/P',sl:'S/L',manual:'Manual',so:'Stop out'};
  const rows=b.history.slice(0,300).map(h=>{
    const dg=INST_BY_SYM[h.sym].digits;
    return '<tr class="clk" data-sym="'+h.sym+'"><td>#'+h.id+'</td><td class="l">'+fmtT(h.openTime)+'</td><td class="l">'+fmtT(h.closeTime)+'</td><td class="l">'+typeTag(h.type)+'</td><td class="l"><b>'+h.sym+'</b></td>'+
      '<td>'+h.lots.toFixed(2)+'</td><td>'+h.open.toFixed(dg)+'</td><td>'+h.close.toFixed(dg)+'</td><td>'+(h.sl?h.sl.toFixed(dg):'—')+'</td><td>'+(h.tp?h.tp.toFixed(dg):'—')+'</td>'+
      '<td class="mute">'+(why[h.reason]||h.reason)+'</td><td class="'+cls(h.profit)+'"><b>'+signed(h.profit)+'</b></td></tr>';
  }).join('');
  return head+'<table><thead><tr><th>Ticket</th><th class="l">Opened</th><th class="l">Closed</th><th class="l">Type</th><th class="l">Symbol</th><th>Lots</th><th>Open</th><th>Close</th><th>S/L</th><th>T/P</th><th>Exit</th><th>Profit</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function tabJournal(){
  if(!G.journal.length)return '<div class="empty">Every order, rejection, stop-loss / take-profit hit, news alert and transfer is recorded here.</div>';
  return '<table><thead><tr><th class="l">Time (sim UTC)</th><th class="l">Event</th></tr></thead><tbody>'+
    G.journal.slice(0,200).map(x=>'<tr><td class="l mute">'+fmtT(x.t)+'</td><td class="l '+(x.kind==='bad'?'dn':x.kind==='good'?'up':'')+'" style="white-space:normal">'+esc(x.msg)+'</td></tr>').join('')+'</tbody></table>';
}
function tabWallet(){
  const b=G.broker;
  if(!b.transfers.length)return '<div class="empty">Deposits and transfers between your Main and Trading accounts are logged here.</div>';
  return '<table><thead><tr><th class="l">Time (sim UTC)</th><th class="l">Action</th><th>Amount</th></tr></thead><tbody>'+
    b.transfers.map(x=>'<tr><td class="l">'+fmtT(x.t)+'</td><td class="l">'+esc(x.type)+'</td><td>'+money(x.amount)+'</td></tr>').join('')+'</tbody></table>';
}
function bottomClick(e){
  const btn=e.target.closest('[data-act]'),b=G.broker;
  if(btn){
    const id=+btn.dataset.id,a=btn.dataset.act;
    if(a==='close')b.close(id);
    else if(a==='mod')modifyModal(id);
    else if(a==='cancel'){b.cancelPending(id);toast('Pending order #'+id+' cancelled','');}
    else if(a==='closeall'){if(b.positions.length&&confirm('Close all open trades?'))b.closeAll();}
    else if(a==='closewin')b.closeAll('profit');
    else if(a==='closelose')b.closeAll('loss');
    else if(a==='csv')exportCSV();
    G.panelsDirty=true;return;
  }
  const r=e.target.closest('tr[data-sym]');if(r)setSymbol(r.dataset.sym);
}
function exportCSV(){
  const h=G.broker.history;
  const lines=['ticket,symbol,type,lots,open_time,close_time,open,close,sl,tp,commission,profit,exit'];
  for(const x of h)lines.push([x.id,x.sym,x.type,x.lots,new Date(x.openTime).toISOString(),new Date(x.closeTime).toISOString(),x.open,x.close,x.sl,x.tp,x.commission.toFixed(2),x.profit.toFixed(2),x.reason].join(','));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));a.download='TradingStrategist-history.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

/* ---------- news ---------- */
function impHTML(n){return '<span class="imp i'+n+'"><i></i><i></i><i></i></span>';}
function pairEffects(ev){
  const out=[],imp=ev.lean*ev.dir;
  if(!imp)return out;
  for(const d of INSTRUMENTS){const f=d.fx[ev.ccy];if(f===undefined)continue;const e=imp*f;out.push({sym:d.sym,up:e>0});}
  return out;
}
function predictionHTML(ev,compact,noNote){
  const where=ev.lean===0?'close to the forecast':ev.lean>0?'<b>above</b> the forecast':'<b>below</b> the forecast';
  const imp=ev.lean*ev.dir;
  const bias=ev.lean===0?'No clear edge — expect a choppy, two-way reaction.':(imp>0?'Bullish':'Bearish')+' for <b>'+ev.ccy+'</b> if it prints as expected.';
  let h='<b>Prediction:</b> '+ev.title+' likely '+where+' ('+ev.conf+'% model confidence). '+bias;
  if(!compact){const pe=pairEffects(ev);if(pe.length)h+='<div class="pairs">'+pe.map(p=>'<span class="chip '+(p.up?'up':'dn')+'">'+p.sym+(p.up?' ▲':' ▼')+'</span>').join('')+'</div>';}
  return noNote?h:h+'<div class="mute" style="margin-top:3px;font-size:11px">Forecasts can be wrong — manage your risk.</div>';
}
function updateNews(){
  const m=G.market,now=m.simTime;let h='<div class="nsub">Upcoming</div>';
  for(const ev of m.upcoming(5)){
    h+='<div class="nrow"><div class="t"><span>'+impHTML(ev.impact)+esc(ev.title)+'</span><span class="'+(ev.state>=1?'dn':'mute')+'">'+(ev.state>=1?'⏱ ':'')+countdown(ev.t-now)+'</span></div>'+
      '<div class="m">'+ev.ccy+' · '+fmtTime(ev.t)+' UTC · Forecast '+nv(ev,ev.forecast)+' · Prev '+nv(ev,ev.previous)+'</div>'+
      (ev.state>=1?'<div class="pred">'+predictionHTML(ev,true)+'</div>':'<div class="pred lock">Prediction is published 10 minutes before release.</div>')+'</div>';
  }
  const rel=m.released(8);
  if(rel.length){
    h+='<div class="nsub">Released</div>';
    for(const ev of rel){
      const imp=ev.steps*ev.dir,v=ev.steps===0?'In line':ev.steps>0?'Higher':'Lower';
      h+='<div class="nrow"><div class="t"><span>'+impHTML(ev.impact)+esc(ev.title)+'</span><span class="'+(imp>0?'up':imp<0?'dn':'mute')+'">'+(imp>0?'Bullish '+ev.ccy:imp<0?'Bearish '+ev.ccy:'Neutral')+'</span></div>'+
        '<div class="m">'+fmtTime(ev.t)+' UTC · Actual <b>'+nv(ev,ev.actual)+'</b> vs Forecast '+nv(ev,ev.forecast)+' ('+v+')</div></div>';
    }
  }
  safeSet($('newsList'),h);
}
function relevant(ev){
  const d=def();if(G.market.affects(d,ev))return true;
  return G.broker.positions.some(p=>G.market.affects(INST_BY_SYM[p.sym],ev));
}
G.results=[];G.dismissed=new Set();
function updateBanners(){
  const now=G.market.simTime,rt=performance.now();let h='';
  G.results=G.results.filter(r=>r.until>rt);
  for(const ev of G.market.news){
    if(ev.state!==1&&ev.state!==2)continue;
    if(!relevant(ev)||G.dismissed.has(ev.id))continue;
    h+='<div class="banner'+(ev.impact===3?' hi':'')+'" data-ev="'+ev.id+'" title="Click to dismiss"><div class="bt"><span>'+impHTML(ev.impact)+'⚠ '+esc(ev.ccy+' '+ev.title)+'</span><span class="cd">'+countdown(ev.t-now)+'</span></div>'+
      '<div class="bm">Forecast <b>'+nv(ev,ev.forecast)+'</b> · Previous <b>'+nv(ev,ev.previous)+'</b></div><div class="bm">'+predictionHTML(ev,false,true)+'</div></div>';
  }
  for(const r of G.results){
    const ev=r.ev,imp=ev.steps*ev.dir,v=ev.steps===0?'in line with':ev.steps>0?'higher than':'lower than';
    h+='<div class="banner done" data-res="'+ev.id+'" title="Click to dismiss"><div class="bt"><span>'+impHTML(ev.impact)+'📢 '+esc(ev.ccy+' '+ev.title)+' released</span><span class="'+(imp>0?'up':imp<0?'dn':'')+'">'+(imp>0?'Bullish':imp<0?'Bearish':'Neutral')+' '+ev.ccy+'</span></div>'+
      '<div class="bm">Actual <b>'+nv(ev,ev.actual)+'</b> — '+v+' forecast <b>'+nv(ev,ev.forecast)+'</b>. Prediction was '+(ev.lean===Math.sign(ev.steps)?'<b class="up">correct</b>':'<b class="dn">wrong</b>')+'.</div></div>';
  }
  safeSet($('banners'),h);
}
function onNewsPre(ev){
  if(!relevant(ev))return;
  toast('<b>News in 10 min:</b> '+esc(ev.ccy+' '+ev.title)+'<br><span class="mute">Prediction: '+(ev.lean===0?'near forecast':ev.lean>0?'above forecast':'below forecast')+' ('+ev.conf+'%)</span>','warn',8000);
  beep(740,0.18);
}
function onNewsSoon(ev){if(!relevant(ev))return;toast('<b>2 minutes</b> to '+esc(ev.ccy+' '+ev.title)+'. Spreads will widen — check your stops.','warn',7000);beep(880,0.25);}
function onNewsRelease(ev){
  G.results.push({ev,until:performance.now()+30000});
  if(relevant(ev)){toast('<b>'+esc(ev.title)+'</b>: actual '+nv(ev,ev.actual)+' vs forecast '+nv(ev,ev.forecast),'warn',8000);beep(1100,0.3);}
  G.panelsDirty=true;
}

/* ---------- modals ---------- */
function openModal(html,dismiss){$('mbox').innerHTML=html;$('modal').hidden=false;G.modalDismissable=!!dismiss;}
function closeModal(){$('modal').hidden=true;}
function welcomeModal(){
  G.hold=true;
  openModal('<h3>Welcome to TradingStrategist</h3><p>Practise price action, ICT and smart-money concepts on a simulated market that needs no internet or data. Set up your two accounts to begin.</p>'+
    '<label class="row"><span>Main account ($)</span><input id="wMain" type="number" min="0" value="10000"></label>'+
    '<label class="row"><span>Fund trading account ($)</span><input id="wFund" type="number" min="0" value="5000"></label>'+
    '<p style="margin-top:10px;font-size:12px">You can move money between the accounts and add more to Main at any time. Scroll wheel zooms the chart, drag pans back through history, right-click places orders.</p>'+
    '<p style="font-size:11px">Educational simulator with artificial prices and play money. Not financial advice and not a prediction of real markets.</p><div class="btns"><button class="tb accent" id="wGo">Start trading</button></div>',false);
  $('wGo').onclick=()=>{
    const main=parseFloat($('wMain').value),fund=parseFloat($('wFund').value)||0;
    if(!(main>=0)||fund<0||fund>main){toast('Funding amount cannot be more than the Main account.','bad');return;}
    const b=G.broker;b.main=main;b.transfers.unshift({t:G.market.simTime,type:'Starting balance (Main)',amount:main});
    if(fund>0)b.transfer('toTrading',fund);
    b.save();closeModal();G.hold=false;G.panelsDirty=true;
  };
}
function menuModal(){
  openModal('<h3>Settings</h3>'+
    '<label class="row"><span>Alert sounds</span><input type="checkbox" id="mSound" '+(G.ui.sound?'checked':'')+' style="width:auto"></label>'+
    '<p style="margin:10px 0 4px"><b>Install as an app</b></p><p style="font-size:12px;line-height:1.6">'+(isInstalledApp()?'You are running the installed app.':'Open the hosted https link, then: <b>PC (Chrome / Edge)</b> install icon in the address bar or ⋮ menu → Install TradingStrategist · <b>Android (Chrome)</b> ⋮ → Install app · <b>iPhone / iPad (Safari)</b> Share → Add to Home Screen. Once installed it opens like any app and works offline.')+'</p>'+
    '<p style="margin:10px 0 4px"><b>Shortcuts</b></p><p style="font-size:12px;line-height:1.7">Wheel = zoom · Drag = pan back/forward · Shift+wheel or ←/→ = scroll · +/− = zoom · Home / End = oldest / latest · Drag price axis = stretch scale (double-click resets) · Right-click = order menu · Del = delete selected drawing · Esc = cancel tool · <b>Space</b> = pause / resume · <b>N</b> = next candle</p><p style="font-size:11px;margin-top:8px">Educational simulator with artificial prices and play money. Not financial advice.</p>'+
    '<div class="btns"><button class="tb" id="mCsv">Export history CSV</button><button class="tb" id="mReset" style="color:var(--down)">New session (reset everything)</button><button class="tb accent" id="mClose">Done</button></div>',true);
  $('mSound').onchange=e=>{G.ui.sound=e.target.checked;G.broker.save();};
  $('mCsv').onclick=exportCSV;$('mClose').onclick=closeModal;
  $('mReset').onclick=()=>{if(confirm('This deletes your accounts, trade history and drawings and generates a brand-new market. Continue?')){window.NO_SAVE=true;try{localStorage.removeItem(STORE_KEY);}catch(e){}location.reload();}};
}
function modifyModal(id){
  const b=G.broker,p=b.positions.find(x=>x.id===id),o=b.pending.find(x=>x.id===id),it=p||o;if(!it)return;
  const dg=INST_BY_SYM[it.sym].digits,step=Math.pow(10,-dg+1);
  G.hold=true;
  openModal('<h3>Modify #'+id+' · '+it.sym+'</h3><p>'+typeTag(it.type)+' '+it.lots.toFixed(2)+' lots @ '+(p?p.open:o.price).toFixed(dg)+'</p>'+
    (o?'<label class="row"><span>Entry price</span><input id="mPx" type="number" step="'+step+'" value="'+o.price.toFixed(dg)+'"></label>':'')+
    '<label class="row"><span>Stop loss</span><input id="mSL" type="number" step="'+step+'" value="'+(it.sl?it.sl.toFixed(dg):'')+'" placeholder="none"></label>'+
    '<label class="row"><span>Take profit</span><input id="mTP" type="number" step="'+step+'" value="'+(it.tp?it.tp.toFixed(dg):'')+'" placeholder="none"></label>'+
    (p?'<label class="row"><span>Close volume (lots)</span><input id="mVol" type="number" step="0.01" min="0.01" max="'+p.lots+'" value="'+p.lots.toFixed(2)+'"></label>':'')+
    '<div class="btns"><button class="tb" id="mCancel">Cancel</button>'+(p?'<button class="tb" id="mBE" title="Set the stop loss at your entry price">SL → break-even</button><button class="tb" id="mPart" style="color:var(--down)">Close volume</button>':'')+'<button class="tb accent" id="mApply">Apply</button></div>',false);
  const done=()=>{closeModal();G.hold=false;G.panelsDirty=true;};
  $('mCancel').onclick=done;
  $('mApply').onclick=()=>{
    const sl=parseFloat($('mSL').value)||0,tp=parseFloat($('mTP').value)||0;
    if(o&&$('mPx')){
      const px=parseFloat($('mPx').value),q=G.market.quote(o.sym);
      const ok=(o.type==='buy_limit'&&px<q.ask)||(o.type==='sell_limit'&&px>q.bid)||(o.type==='buy_stop'&&px>q.ask)||(o.type==='sell_stop'&&px<q.bid);
      if(!ok){toast('Entry price is on the wrong side of the market for a '+o.type.replace('_',' '),'bad');return;}
      b.movePending(id,px);
    }
    const e=b.modify(id,sl,tp);if(e){toast(e,'bad');return;}toast('Order #'+id+' modified','good');done();
  };
  if(p)$('mBE').onclick=()=>{const e=b.modify(id,p.open,p.tp);if(e){toast(e,'bad');return;}toast('Stop loss moved to break-even ('+p.open.toFixed(dg)+')','good');done();};
  if(p)$('mPart').onclick=()=>{const v=parseFloat($('mVol').value);if(!(v>0)){toast('Enter a volume','bad');return;}b.close(id,Math.min(v,p.lots));done();};
}

window.addEventListener('DOMContentLoaded',()=>{
  $('banners').addEventListener('click',e=>{
    const b=e.target.closest('.banner');if(!b)return;
    if(b.dataset.ev)G.dismissed.add(+b.dataset.ev);
    if(b.dataset.res)G.results=G.results.filter(r=>r.ev.id!==+b.dataset.res);
    $('banners')._html=null;updateBanners();
  });
});
