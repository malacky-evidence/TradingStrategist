'use strict';
/* ===================== Installable web app (PWA) ===================== */
let deferredInstall=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;const b=document.getElementById('bInstall');if(b)b.hidden=false;});
window.addEventListener('appinstalled',()=>{deferredInstall=null;const b=document.getElementById('bInstall');if(b)b.hidden=true;if(window.toast)toast('TradingStrategist installed. Open it from your home screen or app list.','good');});
window.addEventListener('DOMContentLoaded',()=>{
  const b=document.getElementById('bInstall');
  if(b)b.onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();try{await deferredInstall.userChoice;}catch(e){}deferredInstall=null;b.hidden=true;};
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
});
function isInstalledApp(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;}
