const app = document.querySelector("#agile-app");
const pill = document.querySelector("#connection-pill");
const refreshButton = document.querySelector("#refresh-button");
let stream;
let snapshot;

const IDS = Object.freeze({
  status: "sensor.kems_agile_smart_export_status",
  rate: "sensor.kems_agile_export_rate_now",
  plan: "sensor.kems_agile_smart_export_plan",
  horizon: "sensor.kems_agile_price_horizon_status",
  partial: "sensor.kems_agile_partial_horizon_dispatch",
  live: "sensor.kems_agile_live_scenario",
  shadowStatus: "sensor.kems_agile_shadow_status",
  shadowCommand: "sensor.kems_agile_shadow_command",
  shadowSafety: "sensor.kems_agile_shadow_safety",
  shadowTargetExport: "sensor.kems_agile_shadow_target_export",
  shadowTargetDischarge: "sensor.kems_agile_shadow_target_total_discharge"
});

function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);}
function number(value){const n=Number.parseFloat(value);return Number.isFinite(n)?n:null;}
function fmt(value,unit="",digits=3){const n=number(value);return n===null?"—":`${new Intl.NumberFormat("en-GB",{maximumFractionDigits:digits}).format(n)}${unit?` ${unit}`:""}`;}
function entity(id){return snapshot?.entities?.find((item)=>item.entityId===id)||null;}
function state(id,fallback="Unavailable"){const item=entity(id);return item?.available?String(item.state):fallback;}
function attr(id,key,fallback=null){return entity(id)?.attributes?.[key]??fallback;}
function tone(value){const text=String(value||"").toLowerCase();if(text.includes("pass")||text.includes("ready")||text.includes("active")||text==="13/13")return"good";if(text.includes("fail")||text.includes("blocked")||text.includes("error"))return"danger";return"attention";}
function badge(text){return `<span class="agile-badge ${tone(text)}">${escapeHtml(text)}</span>`;}
function metric(label,value,detail=""){return `<article class="agile-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong>${detail?`<p>${escapeHtml(detail)}</p>`:""}</article>`;}
function proof(){return attr(IDS.shadowStatus,"nonzero_export_proof",{})||{};}
function checks(){return proof().checks||{};}
function boolWord(value){return value===true?"PASS":value===false?"FAIL":"—";}
function timeLabel(slot){const raw=slot?.label||slot?.valid_from||"—";return String(raw).replace(/T/," ").replace(/:00(?:\+.*|Z)?$/g,"");}

function selectedSlots(){
  const attrs=entity(IDS.plan)?.attributes||{};
  const rows=attrs.today_slots||attrs.selected_slots||attrs.provisional_selected_slots||[];
  return Array.isArray(rows)?rows.filter((row)=>number(row.planned_battery_export_kwh??row.battery_export_kwh??row.provisional_planned_battery_export_kwh)>0):[];
}

function render(){
  if(!snapshot?.connected){app.innerHTML=`<section class="agile-card empty"><h1>Agile data unavailable</h1><p>The property dashboard is not currently connected to Home Assistant/KEMS.</p></section>`;return;}
  const live=entity(IDS.live)?.attributes||{};
  const command=entity(IDS.shadowCommand)?.attributes||{};
  const horizon=entity(IDS.horizon)?.attributes||{};
  const p=proof();
  const strict=p.replay?.tracking||{};
  const rows=selectedSlots();
  const exportTarget=number(command.battery_export_kw)??number(entity(IDS.shadowTargetExport)?.state);
  const totalDischarge=number(command.total_discharge_kw)??number(entity(IDS.shadowTargetDischarge)?.state);
  const ac=number(command.total_kh7_ac_output_kw);
  const safety=state(IDS.shadowSafety);
  const missing=horizon.missing_labels||horizon.missing_relevant_labels||[];
  app.innerHTML=`
    <section class="agile-hero"><div><p class="eyebrow">KEMS Alpha7 · read-only shadow evidence</p><h1>Agile Smart Export</h1><p>One live view of the current Region L price, optimiser decision, real house demand, digital-twin routing, price-horizon qualification and the independent non-zero shadow proof.</p></div>${badge(state(IDS.status))}</section>
    <section class="agile-grid">
      ${metric("Agile export rate",fmt(state(IDS.rate),"p/kWh",2),"Current Region L settlement rate")}
      ${metric("Dispatch mode",attr(IDS.shadowStatus,"dispatch_mode",attr(IDS.partial,"dispatch_mode","—")),"Current optimiser → shadow path")}
      ${metric("Battery export target",fmt(exportTarget,"kW"),`Total discharge ${fmt(totalDischarge,"kW")}`)}
      ${metric("KH7 AC output",fmt(ac,"kW"),"Solar + battery combined; 7 kW ceiling")}
      ${metric("Price horizon",state(IDS.horizon),missing.length?`Missing: ${missing.join(", ")}`:"Current relevant prices known")}
      ${metric("Independent safety",safety,`${attr(IDS.shadowSafety,"passed_checks","—")}/${attr(IDS.shadowSafety,"total_checks","—")} checks`)}
    </section>
    <section class="agile-section"><h2>Current routing</h2><p>House demand uses the same live KEMS source as the Live tab; digital-twin slot-average demand remains available separately for parity/debugging.</p><div class="agile-grid">
      ${metric("House demand — live",fmt(live.live_house_load_kw??live.current_house_load_kw,"kW"),live.live_house_load_source||"sensor.kems_house_load")}
      ${metric("Digital-twin demand",fmt(live.simulated_house_load_kw,"kW"),live.simulated_house_load_basis||live.routing_basis||"slot replay")}
      ${metric("Solar AC",fmt(live.current_solar_power_kw,"kW"),"Current routed solar")}
      ${metric("Battery → home",fmt(live.current_battery_to_home_kw,"kW"),"Digital-twin route")}
      ${metric("Battery → export",fmt(live.current_battery_export_kw??exportTarget,"kW"),"Shadow export route")}
      ${metric("Grid export",fmt(live.current_grid_export_kw,"kW"),"Current simulated export flow")}
    </div></section>
    <section class="proof-grid">
      <article class="agile-card"><small>Non-zero export proof</small><strong>${escapeHtml(p.state||state(IDS.shadowStatus))}</strong><p class="safety-note">Hardware writes remain <b>blocked</b>. This page reports the proven Alpha7 shadow chain; it cannot issue a FoxESS command.</p><div class="proof-list">
        <div><span>Candidate export</span><b>${fmt(p.candidate_export_kw,"kW")}</b></div>
        <div><span>Replay export</span><b>${fmt(strict.outcome?.battery_export_kw,"kW")}</b></div>
        <div><span>Strict tracking</span><b>${fmt(strict.tracking_score_percent,"%",1)}</b></div>
        <div><span>Strict tolerance</span><b>${fmt(p.strict_tolerance_kw??0.01,"kW",2)}</b></div>
        <div><span>Feed-in First</span><b>${boolWord(checks().feed_in_first_mode)}</b></div>
        <div><span>Grid export allowed</span><b>${boolWord(checks().grid_export_allowed)}</b></div>
        <div><span>13/13 safety</span><b>${boolWord(checks().independent_safety_13_of_13)}</b></div>
        <div><span>Hardware blocked</span><b>${boolWord(checks().hardware_writes_blocked)}</b></div>
      </div></article>
      <article class="agile-card"><small>Horizon qualification</small><strong>${escapeHtml(state(IDS.partial,"Full horizon / inactive"))}</strong><div class="proof-list">
        <div><span>Current slot known</span><b>${boolWord(attr(IDS.partial,"current_slot_known",horizon.current_slot_known))}</b></div>
        <div><span>Upstream gap verified</span><b>${boolWord(attr(IDS.partial,"upstream_gap_verified"))}</b></div>
        <div><span>Unknown capacity reserved</span><b>${fmt(attr(IDS.partial,"unknown_price_reserved_capacity_kwh"),"kWh")}</b></div>
        <div><span>Unknown dispatch blocked</span><b>${boolWord(attr(IDS.partial,"unknown_price_dispatch_blocked"))}</b></div>
      </div></article>
    </section>
    <section class="agile-card agile-section"><h2>Selected export slots</h2><p>Known-price slots currently selected by KEMS. Unknown-price periods are never assigned an export command.</p>${rows.length?`<div style="overflow:auto"><table class="agile-table"><thead><tr><th>Slot</th><th>Rate</th><th>Battery export</th><th>Target</th></tr></thead><tbody>${rows.slice(0,16).map((row)=>`<tr><td>${escapeHtml(timeLabel(row))}</td><td>${fmt(row.rate_pence,"p/kWh",2)}</td><td>${fmt(row.planned_battery_export_kwh??row.provisional_planned_battery_export_kwh??row.battery_export_kwh,"kWh")}</td><td>${fmt(row.rolling_target_battery_export_kw??row.provisional_target_battery_export_kw,"kW")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No battery-export slots are selected in the currently exposed plan.</div>`}</section>`;
}

async function refresh(){
  refreshButton?.classList.add("spinning");
  try{const response=await fetch("/api/live",{cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);snapshot=await response.json();pill?.classList.toggle("connected",Boolean(snapshot.connected));pill?.querySelector("span")&&(pill.querySelector("span").textContent=snapshot.connected?"Live":"Connection issue");render();}
  catch(error){app.innerHTML=`<section class="agile-card empty"><h1>Unable to load Agile</h1><p>${escapeHtml(error.message)}</p></section>`;pill?.classList.add("error");}
  finally{refreshButton?.classList.remove("spinning");}
}

function connectStream(){try{stream?.close();stream=new EventSource("/api/stream");stream.addEventListener("snapshot",(event)=>{try{snapshot=JSON.parse(event.data);render();}catch{}});}catch{}}
refreshButton?.addEventListener("click",refresh);
await refresh();
connectStream();
