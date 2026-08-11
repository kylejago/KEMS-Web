
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const port=4197;
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),"kems-alpha5-smoke-"));
const child=spawn(process.execPath,["server.mjs"],{
  cwd:new URL("..",import.meta.url),
  env:{...process.env,PORT:String(port),HOST:"127.0.0.1",DATA_DIR:dataDir,HA_URL:"",HA_TOKEN:""},
  stdio:["ignore","pipe","pipe"]
});
let output="";child.stdout.on("data",c=>output+=c);child.stderr.on("data",c=>output+=c);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let ready=false;
  for(let i=0;i<35;i+=1){await sleep(150);try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok){ready=true;break;}}catch{}}
  if(!ready)throw new Error(`Server did not start.\n${output}`);
  const [health,config,setup,site,manifest,live,history,html,js,css,system]=await Promise.all([
    fetch(`http://127.0.0.1:${port}/api/health`).then(r=>r.json()),
    fetch(`http://127.0.0.1:${port}/api/config`).then(r=>r.json()),
    fetch(`http://127.0.0.1:${port}/api/setup/status`).then(r=>r.json()),
    fetch(`http://127.0.0.1:${port}/api/site`).then(r=>r.json()),
    fetch(`http://127.0.0.1:${port}/site.webmanifest`).then(r=>r.json()),
    fetch(`http://127.0.0.1:${port}/api/live`).then(r=>r.json()),
    fetch(`http://127.0.0.1:${port}/api/history?hours=24`).then(r=>r.json()),
    fetch(`http://127.0.0.1:${port}/`).then(r=>r.text()),
    fetch(`http://127.0.0.1:${port}/app.js`).then(r=>r.text()),
    fetch(`http://127.0.0.1:${port}/styles.css`).then(r=>r.text()),
    fetch(`http://127.0.0.1:${port}/api/system/status`).then(r=>r.json())
  ]);
  const shellResponse=await fetch(`http://127.0.0.1:${port}/`);
  const csp=shellResponse.headers.get("content-security-policy")||"";
  if(!health.ok || health.version!=="0.7.0-alpha5-web.6")throw new Error("Health/version failed.");
  if(config.dataMode!=="unconfigured" || setup.configured)throw new Error("Fresh setup state failed.");
  if(site.homeAssistantMode!=="external" || site.siteId!=="home" || !manifest.name.includes(site.name))throw new Error("Site identity/manifest failed.");
  const changedSite=await fetch(`http://127.0.0.1:${port}/api/site`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Mike Home",siteId:"mike",homeAssistantMode:"built-in",remoteHostname:"home.kems.co"})}).then(r=>r.json());
  if(changedSite.siteId!=="mike" || changedSite.homeAssistantMode!=="built-in" || changedSite.remoteHostname!=="mike.kems.co")throw new Error("Site identity write failed.");
  if(live.source!=="unconfigured" || live.connected)throw new Error("Unconfigured snapshot failed.");
  if(history.length)throw new Error("Unconfigured history should be empty.");
  if(!html.includes("alpha5 energy dashboard"))throw new Error("HTML shell incomplete.");
  if(!js.includes("renderConnectionPage") || !js.includes("liveView") || !js.includes("simulationView") || !js.includes("compareView") || !js.includes("performanceView"))throw new Error("Frontend bundle incomplete.");
  if(!css.includes(".connection-layout") || !css.includes(".energy-flow") || !css.includes(".breakdown-grid") || !css.includes(".economics-layout") || !css.includes(".system-grid") || !css.includes(".chart-event-list"))throw new Error("Styles incomplete.");
  if(!js.includes("systemSectionContent") || !js.includes("showBackupModal") || !js.includes("runSystemAction"))throw new Error("Pi management frontend is missing.");
  if(system.available!==false)throw new Error("Non-Pi smoke environment should report the manager as unavailable rather than failing the site.");
  if(!csp.includes("style-src 'self' 'unsafe-inline'"))throw new Error("Dynamic SVG and chart styles are blocked by the CSP.");
  console.log(`Smoke test passed: setup ready, ${config.mappedEntityCount} alpha5 mappings.`);
}finally{child.kill("SIGTERM");fs.rmSync(dataDir,{recursive:true,force:true});}
