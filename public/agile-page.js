const app = document.querySelector("#agile-app");
const pill = document.querySelector("#connection-pill");
const refreshButton = document.querySelector("#refresh-button");
let stream;
let snapshot;

const IDS = Object.freeze({
  status: "sensor.kems_agile_smart_export_status",
  rate: "sensor.kems_agile_export_rate_now",
  plan: "sensor.kems_agile_smart_export_plan",
  rolling: "sensor.kems_agile_rolling_export_plan",
  dispatchMode: "sensor.kems_agile_dispatch_mode",
  dischargeTarget: "sensor.kems_agile_battery_discharge_target_now",
  exportTarget: "sensor.kems_agile_battery_export_target_now",
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
function moneyFromPence(value){const n=number(value);return n===null?"—":new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:2}).format(n/100);}
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

function rollingAttrs(){return entity(IDS.rolling)?.attributes||{};}
function economicGuard(){return rollingAttrs().economic_opportunity_guard||{};}
function deadlineGuard(){return rollingAttrs().deadline_guard||{};}

function selectedSlots(){
  const rolling=rollingAttrs();
  const planAttrs=entity(IDS.plan)?.attributes||{};
  const rows=rolling.selected_slots||planAttrs.today_slots||planAttrs.selected_slots||planAttrs.provisional_selected_slots||[];
  return Array.isArray(rows)?rows.filter((row)=>number(row.planned_battery_export_kwh??row.rolling_planned_battery_export_kwh??row.battery_export_kwh??row.provisional_planned_battery_export_kwh)>0):[];
}

function routingRows(live, today){
  const rows=[
    ["Solar → home",live.current_solar_to_home_kw,today.solar_to_home_kwh],
    ["Solar → battery",live.current_solar_to_battery_kw,today.solar_to_battery_kwh],
    ["Solar → export",live.current_solar_export_kw,today.solar_export_kwh],
    ["Grid → battery",live.current_grid_to_battery_kw,today.grid_to_battery_kwh],
    ["Battery → home",live.current_battery_to_home_kw,today.battery_to_home_kwh],
    ["Battery → export",live.current_battery_export_kw,today.battery_export_kwh],
    ["Grid import",live.current_grid_import_kw,today.grid_import_kwh],
    ["Grid export",live.current_grid_export_kw,today.grid_export_kwh]
  ];
  return `<div style="overflow:auto"><table class="agile-table"><thead><tr><th>Route</th><th>Now</th><th>Today</th></tr></thead><tbody>${rows.map(([label,nowValue,todayValue])=>`<tr><td>${escapeHtml(label)}</td><td>${fmt(nowValue,"kW")}</td><td>${fmt(todayValue,"kWh")}</td></tr>`).join("")}</tbody></table></div>`;
}

function render(){
  if(!snapshot?.connected){app.innerHTML=`<section class="agile-card empty"><h1>Agile data unavailable</h1><p>The property dashboard is not currently connected to Home Assistant/KEMS.</p></section>`;return;}
  const live=entity(IDS.live)?.attributes||{};
  const command=entity(IDS.shadowCommand)?.attributes||{};
  const horizon=entity(IDS.horizon)?.attributes||{};
  const rolling=rollingAttrs();
  const guard=economicGuard();
  const deadline=deadlineGuard();
  const planPeriods=attr(IDS.plan,"periods",{})||{};
  const today=planPeriods?.today?.agile_smart_export||{};
  const p=proof();
  const strict=p.replay?.tracking||{};
  const rows=selectedSlots();
  const exportTarget=number(state(IDS.exportTarget))??number(command.battery_export_kw)??number(entity(IDS.shadowTargetExport)?.state);
  const totalDischarge=number(state(IDS.dischargeTarget))??number(command.total_discharge_kw)??number(entity(IDS.shadowTargetDischarge)?.state);
  const ac=number(command.total_kh7_ac_output_kw);
  const safety=state(IDS.shadowSafety);
  const missing=horizon.missing_labels||horizon.missing_relevant_labels||[];
  const decision=rolling.dispatch_action||live.routing_action||state(IDS.dispatchMode);
  const guardDetail=guard.active
    ? `Early export active: current slot is ${fmt(guard.price_advantage_pence,"p/kWh",2)} better than the marginal future slot.`
    : guard.reason||"No early economic pre-emption required.";
  const deadlineDetail=deadline.latest_safe_export_start
    ? `Latest safe start ${new Date(deadline.latest_safe_export_start).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}`
    : "Latest-safe evidence still building";

  app.innerHTML=`
    <section class="agile-hero"><div><p class="eyebrow">KEMS · flagship strategy · read-only evidence</p><h1>Full KEMS Agile</h1><p>KEMS' primary optimisation view: live property demand, current routing, Region L Agile prices, rolling export plan, latest-safe protection, economic early-export guard and independent shadow proof.</p></div>${badge(state(IDS.status))}</section>
    <section class="agile-card agile-section"><h2>Decision now</h2><strong>${escapeHtml(decision||"Building plan")}</strong><p>${escapeHtml(guardDetail)} ${escapeHtml(deadlineDetail)}.</p></section>
    <section class="agile-grid">
      ${metric("Agile export rate",fmt(state(IDS.rate),"p/kWh",2),"Current Region L settlement rate")}
      ${metric("Dispatch mode",state(IDS.dispatchMode,rolling.dispatch_mode||"—"),"Rolling optimiser → shadow path")}
      ${metric("Battery export target",fmt(exportTarget,"kW"),`Total discharge ${fmt(totalDischarge,"kW")}`)}
      ${metric("Exportable battery",fmt(rolling.exportable_battery_energy_kwh,"kWh"),`Planned ${fmt(rolling.planned_battery_export_kwh,"kWh")}`)}
      ${metric("Target SOC",fmt(rolling.target_soc_percent??10,"%",1),deadlineDetail)}
      ${metric("Price horizon",state(IDS.horizon),missing.length?`Missing: ${missing.join(", ")}`:"Current relevant prices known")}
      ${metric("Economic guard",guard.active?"ACTIVE":"Standby",guardDetail)}
      ${metric("Independent safety",safety,`${attr(IDS.shadowSafety,"passed_checks","—")}/${attr(IDS.shadowSafety,"total_checks","—")} checks`)}
    </section>
    <section class="agile-section"><h2>Current routing</h2><p>Live house demand is kept separate from digital-twin routing so measured and simulated values are never blurred together.</p><div class="agile-grid">
      ${metric("House demand — live",fmt(live.live_house_load_kw??live.current_house_load_kw,"kW"),live.live_house_load_source||"sensor.kems_house_load")}
      ${metric("Digital-twin demand",fmt(live.simulated_house_load_kw,"kW"),live.simulated_house_load_basis||live.routing_basis||"slot replay")}
      ${metric("Solar AC",fmt(live.current_solar_power_kw,"kW"),"Current routed solar")}
      ${metric("Battery → home",fmt(live.current_battery_to_home_kw,"kW"),"Digital-twin route")}
      ${metric("Battery → export",fmt(live.current_battery_export_kw??exportTarget,"kW"),"Current Agile target route")}
      ${metric("Grid export",fmt(live.current_grid_export_kw,"kW"),"Current simulated export flow")}
    </div></section>
    <section class="agile-card agile-section"><h2>Routing now vs today</h2>${routingRows(live,today)}<p class="safety-note">Solar curtailed/capped today: <b>${fmt(today.solar_curtailed_kwh,"kWh")}</b> where KEMS has enough evidence to calculate it.</p></section>
    <section class="agile-card agile-section"><h2>Remaining export plan</h2><p>KEMS replans on every coordinator scan. Stronger current prices can now trigger proactive export before the hard latest-safe-start cliff when waiting risks pushing energy into a cheaper slot.</p>${rows.length?`<div style="overflow:auto"><table class="agile-table"><thead><tr><th>Slot</th><th>Rate</th><th>Battery export</th><th>Target</th><th>Why</th></tr></thead><tbody>${rows.slice(0,20).map((row)=>`<tr><td>${escapeHtml(timeLabel(row))}</td><td>${fmt(row.rate_pence,"p/kWh",2)}</td><td>${fmt(row.planned_battery_export_kwh??row.rolling_planned_battery_export_kwh??row.provisional_planned_battery_export_kwh??row.battery_export_kwh,"kWh")}</td><td>${fmt(row.rolling_target_battery_export_kw??row.provisional_target_battery_export_kw,"kW")}</td><td>${escapeHtml(row.rolling_action||row.actions?.[0]||"price-ranked rolling plan")}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No battery-export slots are selected in the currently exposed plan.</div>`}</section>
    <section class="proof-grid">
      <article class="agile-card"><small>Economic opportunity guard</small><strong>${guard.active?"ACTIVE":"Standby"}</strong><div class="proof-list">
        <div><span>Current price</span><b>${fmt(guard.current_rate_pence,"p/kWh",2)}</b></div>
        <div><span>Marginal future price</span><b>${fmt(guard.marginal_future_rate_pence,"p/kWh",2)}</b></div>
        <div><span>Price advantage</span><b>${fmt(guard.price_advantage_pence,"p/kWh",2)}</b></div>
        <div><span>Uncertainty margin</span><b>${fmt(guard.uncertainty_margin_kwh,"kWh")}</b></div>
        <div><span>Minimum early export</span><b>${fmt(guard.minimum_current_export_kwh,"kWh")}</b></div>
        <div><span>Future capacity</span><b>${fmt(guard.future_capacity_kwh,"kWh")}</b></div>
      </div></article>
      <article class="agile-card"><small>Latest-safe protection</small><strong>${escapeHtml(deadline.mode||rolling.dispatch_mode||"Building")}</strong><div class="proof-list">
        <div><span>Target reachable</span><b>${boolWord(deadline.target_physically_reachable_now)}</b></div>
        <div><span>Capacity margin</span><b>${fmt(deadline.solar_aware_deadline_margin_kwh??rolling.deadline_capacity_margin_kwh,"kWh")}</b></div>
        <div><span>Latest safe start</span><b>${escapeHtml(deadline.latest_safe_export_start||"—")}</b></div>
        <div><span>Guarded start</span><b>${escapeHtml(deadline.guarded_latest_safe_export_start||"—")}</b></div>
        <div><span>Forecast solar used</span><b>${boolWord(deadline.forecast_solar_used)}</b></div>
        <div><span>Skippable half-hours</span><b>${escapeHtml(deadline.skippable_half_hours??"—")}</b></div>
      </div></article>
    </section>
    <section class="proof-grid">
      <article class="agile-card"><small>Non-zero export proof</small><strong>${escapeHtml(p.state||state(IDS.shadowStatus))}</strong><p class="safety-note">Hardware writes remain <b>blocked</b>. This page reports the proven digital-twin shadow chain; it cannot issue a FoxESS command.</p><div class="proof-list">
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
    <section class="agile-card agile-section"><h2>Today economics</h2><div class="agile-grid">
      ${metric("Import cost",moneyFromPence(today.import_cost_pence),`${fmt(today.grid_import_kwh,"kWh")} imported`)}
      ${metric("Export income",moneyFromPence(today.export_income_pence),`${fmt(today.grid_export_kwh,"kWh")} exported`)}
      ${metric("Economic net cost",moneyFromPence(today.economic_net_cost_pence??((number(today.import_cost_pence)||0)-(number(today.export_income_pence)||0))),"Common comparison basis")}
      ${metric("Ending SOC",fmt(today.ending_soc_percent,"%",1),"Current simulated end-of-period SOC")}
    </div></section>`;
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