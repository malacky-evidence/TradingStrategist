'use strict';
/* ===================== TRADING + ACCOUNTS =====================
 * Two wallets: Main (normal) account and Trading account. Transfers between them.
 * Trading account: balance, equity, margin, free margin, margin level, stop-out.
 * Orders: market, limit, stop. Positions: SL/TP, modify, partial close, close all.
 */
const LEVERAGE = 100;
const STOP_OUT = 20;       // % margin level
const STORE_KEY = 'TradingStrategist_sim_v1';

class Broker{
  constructor(market){
    this.m=market;
    this.main=10000;           // normal account (cash)
    this.balance=0;            // trading account balance
    this.positions=[];         // open
    this.pending=[];           // pending orders
    this.history=[];           // closed trades
    this.transfers=[];         // wallet log
    this.nextId=1001;
    this.handlers={};
  }
  on(ev,fn){(this.handlers[ev]=this.handlers[ev]||[]).push(fn);}
  emit(ev,x){(this.handlers[ev]||[]).forEach(f=>f(x));}

  /* ---------- math ---------- */
  toUSD(sym,amountInQuote){
    const d=INST_BY_SYM[sym];
    if(d.quote==='JPY')return amountInQuote/this.m.st[sym].price;
    return amountInQuote;
  }
  pnl(pos,price){
    const d=INST_BY_SYM[pos.sym];
    const raw=(pos.type==='buy'?price-pos.open:pos.open-price)*pos.lots*d.contract;
    return this.toUSD(pos.sym,raw);
  }
  marginFor(sym,lots,price){
    const d=INST_BY_SYM[sym];
    return this.toUSD(sym,lots*d.contract*price)/LEVERAGE;
  }
  closePrice(pos){const q=this.m.quote(pos.sym);return pos.type==='buy'?q.bid:q.ask;}
  floating(){let s=0;for(const p of this.positions)s+=this.pnl(p,this.closePrice(p))-p.commission;return s;}
  usedMargin(){let s=0;for(const p of this.positions)s+=p.margin;return s;}
  get equity(){return this.balance+this.floating();}
  get freeMargin(){return this.equity-this.usedMargin();}
  get marginLevel(){const u=this.usedMargin();return u>0?this.equity/u*100:0;}

  /* ---------- wallets ---------- */
  deposit(amount){ // add cash to the normal account
    if(!(amount>0))return 'Enter an amount greater than 0';
    this.main+=amount;this.transfers.unshift({t:this.m.simTime,type:'Deposit to Main',amount});this.save();return null;
  }
  setMain(amount){
    if(!(amount>=0))return 'Invalid amount';
    this.main=amount;this.transfers.unshift({t:this.m.simTime,type:'Main balance set',amount});this.save();return null;
  }
  transfer(dir,amount){ // dir: 'toTrading' | 'toMain'
    if(!(amount>0))return 'Enter an amount greater than 0';
    if(dir==='toTrading'){
      if(amount>this.main+1e-9)return 'Not enough funds in the Main account';
      this.main-=amount;this.balance+=amount;
      this.transfers.unshift({t:this.m.simTime,type:'Main → Trading',amount});
    }else{
      if(amount>this.freeMargin+1e-9)return 'Amount exceeds free margin of the Trading account';
      if(amount>this.balance+1e-9)return 'Amount exceeds Trading balance';
      this.balance-=amount;this.main+=amount;
      this.transfers.unshift({t:this.m.simTime,type:'Trading → Main',amount});
    }
    this.save();this.emit('change');return null;
  }

  /* ---------- orders ---------- */
  validate(sym,type,lots,price,sl,tp){
    const d=INST_BY_SYM[sym];
    if(!(lots>=0.01))return 'Minimum volume is 0.01 lot';
    if(lots>100)return 'Maximum volume is 100 lots';
    const buy=type==='buy'||type==='buy_limit'||type==='buy_stop';
    if(sl&&(buy?sl>=price:sl<=price))return 'Stop loss is on the wrong side of the price';
    if(tp&&(buy?tp<=price:tp>=price))return 'Take profit is on the wrong side of the price';
    const need=this.marginFor(sym,lots,price);
    if(need>this.freeMargin)return 'Not enough free margin (need '+need.toFixed(2)+', have '+this.freeMargin.toFixed(2)+'). Transfer funds to the Trading account.';
    return null;
  }
  marketOrder(sym,type,lots,sl,tp,comment){
    lots=Math.round(lots*100)/100;
    const q=this.m.quote(sym),price=type==='buy'?q.ask:q.bid;
    const err=this.validate(sym,type,lots,price,sl,tp);if(err)return err;
    const d=INST_BY_SYM[sym];
    const pos={id:this.nextId++,sym,type,lots,open:price,sl:sl||0,tp:tp||0,openTime:this.m.simTime,
      margin:this.marginFor(sym,lots,price),commission:lots*(d.cls==='Forex'||d.cls==='Metals'?3.5:d.cls==='Crypto'?2:d.cls==='Stocks'?1:0),comment:comment||''};
    this.positions.push(pos);this.save();this.emit('change');this.emit('open',pos);return null;
  }
  pendingOrder(sym,type,lots,price,sl,tp){
    lots=Math.round(lots*100)/100;
    const q=this.m.quote(sym);
    if(!(price>0))return 'Enter an entry price';
    if(type==='buy_limit'&&price>=q.ask)return 'Buy limit must be below the current ask';
    if(type==='sell_limit'&&price<=q.bid)return 'Sell limit must be above the current bid';
    if(type==='buy_stop'&&price<=q.ask)return 'Buy stop must be above the current ask';
    if(type==='sell_stop'&&price>=q.bid)return 'Sell stop must be below the current bid';
    const err=this.validate(sym,type,lots,price,sl,tp);if(err)return err;
    this.pending.push({id:this.nextId++,sym,type,lots,price,sl:sl||0,tp:tp||0,time:this.m.simTime});
    this.save();this.emit('change');return null;
  }
  cancelPending(id){this.pending=this.pending.filter(o=>o.id!==id);this.save();this.emit('change');}
  modify(id,sl,tp){
    const p=this.positions.find(x=>x.id===id);
    if(p){
      const q=this.m.quote(p.sym),buy=p.type==='buy',ref=buy?q.bid:q.ask;
      if(sl&&(buy?sl>=ref:sl<=ref))return 'Stop loss must be '+(buy?'below the bid':'above the ask');
      if(tp&&(buy?tp<=ref:tp>=ref))return 'Take profit must be '+(buy?'above the bid':'below the ask');
      p.sl=sl||0;p.tp=tp||0;this.save();this.emit('change');return null;
    }
    const o=this.pending.find(x=>x.id===id);
    if(o){o.sl=sl||0;o.tp=tp||0;this.save();this.emit('change');return null;}
    return 'Trade not found';
  }
  movePending(id,price){const o=this.pending.find(x=>x.id===id);if(o){o.price=price;this.save();this.emit('change');}}
  close(id,lots,reason){
    const i=this.positions.findIndex(x=>x.id===id);if(i<0)return 'Position not found';
    const p=this.positions[i];
    return this.closeAt(p,this.closePrice(p),lots,reason||'manual');
  }
  closeAt(p,price,lots,reason){
    const i=this.positions.indexOf(p);if(i<0)return 'Position not found';
    lots=lots&&lots<p.lots-1e-9?lots:p.lots;
    const frac=lots/p.lots,gross=this.pnl({...p,lots},price),comm=p.commission*frac;
    const net=gross-comm;
    this.balance+=net;
    this.history.unshift({id:p.id,sym:p.sym,type:p.type,lots,open:p.open,close:price,sl:p.sl,tp:p.tp,
      openTime:p.openTime,closeTime:this.m.simTime,commission:comm,profit:net,reason});
    if(lots<p.lots-1e-9){p.lots-=lots;p.margin*=1-frac;p.commission-=comm;}
    else this.positions.splice(i,1);
    if(this.history.length>2000)this.history.length=2000;
    this.save();this.emit('change');this.emit('closed',{p,price,net,reason});return null;
  }
  closeAll(filter,reason){
    for(const p of [...this.positions]){
      if(filter==='profit'&&this.pnl(p,this.closePrice(p))<=0)continue;
      if(filter==='loss'&&this.pnl(p,this.closePrice(p))>=0)continue;
      this.close(p.id,0,reason);
    }
  }

  /* ---------- per-tick engine: fills, SL/TP, stop-out ---------- */
  onTick(){
    let changed=false;
    for(const o of [...this.pending]){
      const q=this.m.quote(o.sym);
      const trig=(o.type==='buy_limit'&&q.ask<=o.price)||(o.type==='sell_limit'&&q.bid>=o.price)||
                 (o.type==='buy_stop'&&q.ask>=o.price)||(o.type==='sell_stop'&&q.bid<=o.price);
      if(!trig)continue;
      this.pending=this.pending.filter(x=>x!==o);
      const buy=o.type.startsWith('buy'),d=INST_BY_SYM[o.sym];
      const margin=this.marginFor(o.sym,o.lots,o.price);
      if(margin>this.freeMargin){this.emit('toast',{kind:'bad',msg:'Pending #'+o.id+' cancelled: not enough margin'});changed=true;continue;}
      const isStop=o.type.endsWith('stop'),fill=isStop?(buy?Math.max(o.price,q.ask):Math.min(o.price,q.bid)):(buy?Math.min(o.price,q.ask):Math.max(o.price,q.bid));
      this.positions.push({id:o.id,sym:o.sym,type:buy?'buy':'sell',lots:o.lots,open:fill,sl:o.sl,tp:o.tp,openTime:this.m.simTime,
        margin,commission:o.lots*(d.cls==='Forex'||d.cls==='Metals'?3.5:d.cls==='Crypto'?2:d.cls==='Stocks'?1:0),comment:o.type.replace('_',' ')});
      this.emit('toast',{kind:'info',msg:'Pending order #'+o.id+' triggered ('+o.type.replace('_',' ')+' '+o.sym+')'});
      changed=true;
    }
    for(const p of [...this.positions]){
      const q=this.m.quote(p.sym),buy=p.type==='buy',px=buy?q.bid:q.ask;
      if(p.sl&&(buy?px<=p.sl:px>=p.sl)){this.closeAt(p,px,0,'sl');changed=true;continue;}   // fills at the real price (slippage when price gaps through the stop)
      if(p.tp&&(buy?px>=p.tp:px<=p.tp)){this.closeAt(p,p.tp,0,'tp');changed=true;}
    }
    if(this.positions.length&&this.marginLevel<100&&this.marginLevel>=STOP_OUT){
      if(!this._mcWarned){this._mcWarned=true;this.emit('toast',{kind:'bad',msg:'MARGIN CALL: margin level is below 100%. Reduce risk or transfer funds.'});}
    }else if(this.marginLevel>=150)this._mcWarned=false;
    if(this.positions.length&&this.marginLevel<STOP_OUT){
      this.emit('toast',{kind:'bad',msg:'STOP OUT: margin level fell below '+STOP_OUT+'%. Positions closed.'});
      this.closeAll(null,'so');changed=true;
    }
    if(changed){this.save();this.emit('change');}
  }

  /* ---------- stats ---------- */
  stats(){
    const h=this.history,w=h.filter(x=>x.profit>0),l=h.filter(x=>x.profit<=0);
    const gp=w.reduce((a,x)=>a+x.profit,0),gl=-l.reduce((a,x)=>a+x.profit,0);
    return {trades:h.length,wins:w.length,winRate:h.length?w.length/h.length*100:0,net:gp-gl,
      pf:gl>0?gp/gl:(gp>0?Infinity:0),avgWin:w.length?gp/w.length:0,avgLoss:l.length?-gl/l.length:0};
  }

  /* ---------- persistence ---------- */
  save(){
    if(window.NO_SAVE)return;
    try{
      localStorage.setItem(STORE_KEY,JSON.stringify({
        v:ENGINE_VER,seed:this.m.seed,t0:this.m.t0,minutes:this.m.minutes,sub:this.m.sub,
        main:this.main,balance:this.balance,positions:this.positions,pending:this.pending,
        history:this.history,transfers:this.transfers.slice(0,100),nextId:this.nextId,
        ui:window.UI_STATE||{}
      }));
    }catch(e){}
  }
  restore(s){
    this.main=s.main;this.balance=s.balance;this.positions=s.positions||[];this.pending=s.pending||[];
    this.history=s.history||[];this.transfers=s.transfers||[];this.nextId=s.nextId||1001;
  }
}
