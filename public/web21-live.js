const ids={house:"sensor.kems_house_load",solar:"sensor.kems_solar_power",batteryPower:"sensor.kems_battery_power",batterySoc:"sensor.kems_battery_state_of_charge",gridImport:"sensor.kems_grid_import_power",gridExport:"sensor.kems_grid_export_power",evPower:"sensor.kems_ev_power",evSoc:"sensor.kems_ev_state_of_charge",evStatus:"sensor.kems_ev_status"};
let latest=null;let rendering=false;
const app=document.querySelector("#app");

function item(snapshot,id){return (snapshot?.entities||[]).find((entry)=>entry.entityId===id)||null}
function number(snapshot,id){const entry=item(snapshot,id);if(!entry||entry.available===false)return null;const value=Number(entry.state);return Number.isFinite(value)?value:null}
function text(snapshot,id){const entry=item(snapshot,id);return entry&&entry.available!==false?String(entry.state||""):null}
function fmt(value,unit="kW",digits=2){return value==null?"—":`${value.toFixed(digits)} ${unit}`}
function soc(value){return value==null?"SoC —":`SoC ${value.toFixed(1)}%`}
function panel(snapshot){
 const house=number(snapshot,ids.house),solar=number(snapshot,ids.solar),battery=number(snapshot,ids.batteryPower),batterySoc=number(snapshot,ids.batterySoc),gi=number(snapshot,ids.gridImport),ge=number(snapshot,ids.gridExport),ev=number(snapshot,ids.evPower),evSoc=number(snapshot,ids.evSoc),evStatus=text(snapshot,ids.evStatus);
 return `<div class="panel-flow" aria-label="KEMS 16 by 16 panel energy flow layout">
  <div class="panel-node solar"><span class="panel-icon">☀</span><span class="panel-label">SOLAR</span><span class="panel-value">${fmt(solar)}</span><span class="panel-sub">Generation</span></div>
  <div class="panel-node grid"><span class="panel-icon">⌁</span><span class="panel-label">GRID</span><span class="panel-value">${fmt(gi)}</span><span class="panel-sub">Import · ${fmt(ge)}</span></div>
  <div class="panel-node home"><span class="panel-icon">⌂</span><span class="panel-label">HOME</span><span class="panel-value">${fmt(house)}</span><span class="panel-sub">Live load</span></div>
  <div class="panel-node battery"><span class="panel-icon">▰</span><span class="panel-label">BATTERY</span><span class="panel-value">${fmt(battery)}</span><span class="panel-sub">${soc(batterySoc)}</span></div>
  <div class="panel-node ev"><span class="panel-icon">▱</span><span class="panel-label">EV</span><span class="panel-value">${fmt(ev)}</span><span class="panel-sub">${evStatus||"Status —"}${evSoc==null?"":` · ${evSoc.toFixed(0)}%`}</span></div>
 </div><div class="panel-flow-legend">Same five-point layout as the KEMS 16×16 panel. Missing physical sources stay unavailable rather than being replaced with zero.</div>`;
}
function cards(snapshot){
 const values=[
  ["Solar generation",fmt(number(snapshot,ids.solar)),"Physical solar generation"],
  ["Battery SoC",number(snapshot,ids.batterySoc)==null?"—":`${number(snapshot,ids.batterySoc).toFixed(1)}%`,"Physical battery state of charge"],
  ["Battery power",fmt(number(snapshot,ids.batteryPower)),"Positive/negative direction follows KEMS normalisation"],
  ["EV power",fmt(number(snapshot,ids.evPower)),"Current EV charging load"]
 ];
 return values.map(([label,value,help])=>`<div class="web21-card"><span class="web21-kicker">${label}</span><strong>${value}</strong><small>${help}</small></div>`).join("");
}
function enhance(){
 if(rendering||!app||location.hash&&!location.hash.startsWith("#live"))return;rendering=true;
 try{
  let section=document.querySelector("#web21-live-system");
  if(!section){section=document.createElement("section");section.id="web21-live-system";section.className="web21-section";const flow=document.querySelector("#app .energy-flow");if(flow){flow.classList.add("web21-replaced-flow");flow.parentNode.insertBefore(section,flow)}else{app.prepend(section)}}
  section.innerHTML=`<div class="web21-kicker">Full-system ready</div><h2>Live energy now</h2><p class="web21-muted">Prepared for the commissioned solar, battery and EV system. Until a physical source exists, KEMS shows it as unavailable.</p><div class="web21-grid">${cards(latest)}</div>${panel(latest)}`;
  document.querySelectorAll("#app .energy-flow").forEach((flow)=>{if(flow!==section)flow.classList.add("web21-replaced-flow")});
 }finally{rendering=false}
}
async function refresh(){try{const response=await fetch("/api/live",{cache:"no-store"});if(response.ok){latest=await response.json();enhance()}}catch{enhance()}}
const observer=new MutationObserver(()=>queueMicrotask(enhance));if(app)observer.observe(app,{childList:true,subtree:true});
window.addEventListener("hashchange",()=>setTimeout(enhance,0));
document.addEventListener("click",(event)=>{const button=event.target.closest?.("#settings-button");if(!button)return;event.preventDefault();event.stopImmediatePropagation();location.href="/settings.html"},{capture:true});
refresh();setInterval(refresh,15000);
