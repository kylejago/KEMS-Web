import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(__dirname, ".env"));

const HOST = process.env.HOST || "0.0.0.0";
const PORT = integer(process.env.PORT, 4173);
const POLL_INTERVAL_MS = Math.max(3000, integer(process.env.POLL_INTERVAL_MS, 8000));
const TIME_ZONE = process.env.TZ || "Europe/London";
process.env.TZ = TIME_ZONE;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const CONNECTION_FILE = path.join(DATA_DIR, "connection.enc.json");
const SECRET_FILE = path.join(DATA_DIR, ".connection-key");
const DAILY_LEDGER_FILE = path.join(DATA_DIR, "energy-ledger.json");
const POWER_HISTORY_FILE = path.join(DATA_DIR, "power-history.json");
const MANAGER_URL = process.env.KEMS_MANAGER_URL || "http://127.0.0.1:4174";
const BACKUP_MAGIC = Buffer.from("KEMSBK01", "ascii");
const BACKUP_FILES = ["connection.enc.json", ".connection-key", "energy-ledger.json", "power-history.json"];
fs.mkdirSync(DATA_DIR, { recursive: true });
try { fs.chmodSync(DATA_DIR, 0o700); } catch {}

const environmentCandidate = normaliseConnection({
  url: process.env.HA_URL || "",
  token: process.env.HA_TOKEN || ""
}, { allowEmpty: true });
const environmentConnection = environmentCandidate ? { ...environmentCandidate, source: "environment" } : null;
let connection = loadStoredConnection() || environmentConnection || null;
const ALLOW_CONFIG_WRITE = !environmentConnection;

const project = readJson("config/project.json");
const defaultEntities = readJson("config/entities.json");
let entities = { ...defaultEntities };

const publicDir = path.join(__dirname, "public");
const sseClients = new Set();
const runtimeHistory = [];
const maxRuntimePoints = 25000;
const historyCache = new Map();
const analyticsCache = new Map();
let entityCatalog = [];
let kemsEntityCatalog = [];
let resolvedEntities = { ...entities };
let current = isConfigured() ? buildConnectingSnapshot(new Date()) : buildUnconfiguredSnapshot(new Date());
let previousEntityStates = new Map();
let pollTimer;
let historyDiagnostics = {
  currentDay: { source: "not-requested", points: 0, warning: null },
  statistics: { source: "not-requested", points: 0, ids: 0, warning: null },
  fallback: { source: "not-requested", points: 0, warning: null },
  energyDashboard: { source: "not-requested", points: 0, mapping: {}, warning: null }
};
let dailyLedger = readJsonIfExists(DAILY_LEDGER_FILE, { version: 1, days: {} });
if (!dailyLedger || typeof dailyLedger !== "object" || typeof dailyLedger.days !== "object") dailyLedger = { version: 1, days: {} };
let persistedPowerHistory = readJsonIfExists(POWER_HISTORY_FILE, []);
if (!Array.isArray(persistedPowerHistory)) persistedPowerHistory = [];
let lastLedgerWrite = 0;
let lastPowerHistoryWrite = 0;

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const split = line.indexOf("=");
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    const value = line.slice(split + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function integer(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relativePath), "utf8"));
}

function readJsonIfExists(filePath, fallback) {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
  } catch (error) {
    console.warn(`Unable to read ${filePath}:`, error.message);
    return fallback;
  }
}

function atomicWriteJson(filePath, value) {
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch {}
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null;
}

function mergeMaximum(target, source, keys) {
  for (const key of keys) {
    const incoming = source?.[key];
    if (!Number.isFinite(incoming)) continue;
    target[key] = Number.isFinite(target[key]) ? Math.max(target[key], incoming) : incoming;
  }
}

function snapshotHistoryPoint(snapshot) {
  return {
    at: snapshot.updatedAt || new Date().toISOString(),
    grid: snapshot.metrics?.gridPower ?? null,
    house: snapshot.metrics?.housePower ?? null,
    solarLive: snapshot.metrics?.solarPower ?? null,
    solarSimulated: snapshot.simulation?.solarPower ?? null,
    batteryLive: snapshot.metrics?.batteryPower ?? null,
    ev: snapshot.metrics?.evPower ?? null,
    rate: snapshot.metrics?.currentRate ?? null,
    socLive: snapshot.metrics?.batterySoc ?? null,
    socSimulated: snapshot.simulation?.batterySoc ?? null,
    simulatedHouse: firstFinite(currentNumberForKey("simulated_house_power"), snapshot.metrics?.housePower),
    simulatedGridImport: currentNumberForKey("simulated_grid_import_power"),
    simulatedGridExport: currentNumberForKey("simulated_grid_export_power"),
    simulatedBattery: currentNumberForKey("simulated_battery_power"),
    simulatedBatteryToHome: currentNumberForKey("simulated_battery_to_home_power"),
    simulatedBatteryExport: currentNumberForKey("simulated_battery_export_power"),
    simulatedSolarToBattery: currentNumberForKey("simulated_solar_to_battery_power"),
    simulatedBatteryCharging: currentNumberForKey("simulated_battery_charging_power"),
    simulatedGridBypass: currentNumberForKey("simulated_grid_bypass_power"),
    simulatedTotalSiteImport: currentNumberForKey("simulated_total_site_import"),
    simulatedTotalKh7Output: currentNumberForKey("simulated_total_kh7_ac_output"),
    desiredCharge: currentNumberForKey("desired_charge_power"),
    desiredBatteryToHome: currentNumberForKey("desired_battery_to_home_power"),
    desiredBatteryExport: currentNumberForKey("desired_battery_export_power"),
    epsUtilisation: currentNumberForKey("eps_utilisation"),
    learningConfidence: snapshot.metrics?.modelConfidence ?? null,
    dataQuality: snapshot.metrics?.dataQuality ?? null,
    simulationStrategy: snapshot.simulation?.strategy ?? null,
    exportTariffStatus: snapshot.simulation?.exportTariffStatus ?? snapshot.alpha5?.exportTariffStatus ?? null,
    noExportModeActive: snapshot.simulation?.noExportModeActive ?? snapshot.alpha5?.noExportModeActive ?? null
  };
}

function updateLocalLedger(snapshot) {
  if (!snapshot?.connected) return;
  const key = localDateKey(snapshot.updatedAt);
  if (!key) return;
  const existing = dailyLedger.days[key] || { date: key, actual: {}, simulated: {} };
  const actual = {
    home: currentNumberForKey("whole_home_energy_today"),
    gridImport: snapshot.observed?.gridImportToday,
    gridExport: snapshot.observed?.gridExportToday,
    importCost: Number.isFinite(snapshot.observed?.costToday) ? snapshot.observed.costToday + (snapshot.observed?.exportIncomeToday || 0) : null,
    exportIncome: snapshot.observed?.exportIncomeToday,
    netCost: snapshot.observed?.costToday,
    gasUsage: currentNumberForKey("gas_usage_today"),
    gasCost: currentMoneyForKey("gas_cost_today"),
    systemValue: currentMoneyForKey("actual_system_value_today"),
    wholeHomeEnergy: currentNumberForKey("whole_home_energy_today")
  };
  const simulated = {
    home: currentNumberForKey("whole_home_energy_today"),
    gridImport: snapshot.simulation?.gridImportToday,
    gridExport: snapshot.simulation?.gridExportToday,
    solar: snapshot.simulation?.solarToday,
    batteryCharge: currentNumberForKey("simulated_battery_charged_today"),
    batteryDischarge: currentNumberForKey("simulated_battery_to_home_today"),
    batteryExport: snapshot.simulation?.batteryExportToday,
    importCost: Number.isFinite(snapshot.simulation?.costToday) ? snapshot.simulation.costToday + (snapshot.simulation?.exportIncomeToday || 0) : null,
    exportIncome: snapshot.simulation?.exportIncomeToday,
    netCost: snapshot.simulation?.costToday,
    systemValue: snapshot.simulation?.savingToday
  };
  mergeMaximum(existing.actual, actual, Object.keys(actual));
  mergeMaximum(existing.simulated, simulated, Object.keys(simulated));
  existing.updatedAt = snapshot.updatedAt;
  dailyLedger.days[key] = existing;
  const keys = Object.keys(dailyLedger.days).sort();
  for (const oldKey of keys.slice(0, Math.max(0, keys.length - 2000))) delete dailyLedger.days[oldKey];
  if (Date.now() - lastLedgerWrite > 60_000) {
    atomicWriteJson(DAILY_LEDGER_FILE, dailyLedger);
    lastLedgerWrite = Date.now();
  }
}

function persistPowerPoint(point) {
  if (!point?.at) return;
  const at = new Date(point.at).getTime();
  if (!Number.isFinite(at)) return;
  const previous = persistedPowerHistory.at(-1);
  if (previous && Math.abs(new Date(previous.at).getTime() - at) < 30_000) persistedPowerHistory[persistedPowerHistory.length - 1] = point;
  else persistedPowerHistory.push(point);
  const cutoff = Date.now() - 35 * 86_400_000;
  persistedPowerHistory = persistedPowerHistory.filter((item) => new Date(item.at).getTime() >= cutoff).slice(-50000);
  if (Date.now() - lastPowerHistoryWrite > 60_000) {
    atomicWriteJson(POWER_HISTORY_FILE, persistedPowerHistory);
    lastPowerHistoryWrite = Date.now();
  }
}


function normaliseConnection(input, { allowEmpty = false } = {}) {
  const rawUrl = String(input?.url || "").trim();
  const token = String(input?.token || "").trim();
  if (!rawUrl && !token && allowEmpty) return null;
  if (!rawUrl) throw new Error("Enter your Home Assistant address.");
  if (!token) throw new Error("Enter a Home Assistant long-lived access token.");
  if (token.length < 20) throw new Error("The access token looks incomplete.");

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Use a full Home Assistant address, including http:// or https://.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Home Assistant must use an http:// or https:// address.");
  if (parsed.username || parsed.password) throw new Error("Do not include a username or password in the Home Assistant address.");
  if (parsed.hash) throw new Error("Remove the # fragment from the Home Assistant address.");
  parsed.search = "";
  const url = parsed.toString().replace(/\/$/, "");
  return { url, token };
}

function isConfigured() {
  return Boolean(connection?.url && connection?.token);
}

function getConnectionKey() {
  const supplied = String(process.env.KEMS_CONFIG_KEY || "").trim();
  if (supplied) return crypto.createHash("sha256").update(supplied).digest();
  if (fs.existsSync(SECRET_FILE)) {
    const value = fs.readFileSync(SECRET_FILE, "utf8").trim();
    const key = Buffer.from(value, "base64url");
    if (key.length === 32) return key;
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, key.toString("base64url"), { mode: 0o600 });
  try { fs.chmodSync(SECRET_FILE, 0o600); } catch {}
  return key;
}

function encryptConnection(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getConnectionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    data: encrypted.toString("base64url")
  };
}

function decryptConnection(payload) {
  if (!payload || payload.version !== 1) throw new Error("Unsupported connection settings format.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getConnectionKey(), Buffer.from(payload.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64url")),
    decipher.final()
  ]).toString("utf8"));
}

function loadStoredConnection() {
  if (!fs.existsSync(CONNECTION_FILE)) return null;
  try {
    const stored = decryptConnection(JSON.parse(fs.readFileSync(CONNECTION_FILE, "utf8")));
    const normalised = normaliseConnection(stored);
    return { ...normalised, source: "stored" };
  } catch (error) {
    console.warn("Unable to read saved Home Assistant connection:", error.message);
    return null;
  }
}

function saveStoredConnection(value) {
  const payload = encryptConnection({ url: value.url, token: value.token, savedAt: new Date().toISOString() });
  const temporary = `${CONNECTION_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, CONNECTION_FILE);
  try { fs.chmodSync(CONNECTION_FILE, 0o600); } catch {}
}

function deleteStoredConnection() {
  try { fs.rmSync(CONNECTION_FILE, { force: true }); } catch {}
}

function safeConnectionSummary() {
  return {
    configured: isConfigured(),
    writable: ALLOW_CONFIG_WRITE,
    homeAssistantUrl: connection?.url || "",
    source: connection?.source || "none",
    connected: Boolean(current?.connected),
    lastError: current?.error || null,
    discoveredKemsEntityCount: kemsEntityCatalog.length,
    updatedAt: current?.updatedAt || null
  };
}

async function testHomeAssistantConnection(input) {
  const candidate = normaliseConnection(input);
  const headers = { Authorization: `Bearer ${candidate.token}`, "Content-Type": "application/json" };
  const [statesResponse, configResponse] = await Promise.all([
    fetch(`${candidate.url}/api/states`, { headers, signal: AbortSignal.timeout(15000) }),
    fetch(`${candidate.url}/api/config`, { headers, signal: AbortSignal.timeout(15000) })
  ]);
  if (statesResponse.status === 401 || statesResponse.status === 403) throw new Error("Home Assistant rejected the access token.");
  if (!statesResponse.ok) throw new Error(`Home Assistant states API returned ${statesResponse.status}.`);
  if (!configResponse.ok) throw new Error(`Home Assistant config API returned ${configResponse.status}.`);
  const [states, config] = await Promise.all([statesResponse.json(), configResponse.json()]);
  const kemsCount = states.filter((entity) => /^(sensor|binary_sensor|select|switch)\.kems_/.test(entity.entity_id || "")).length;
  return {
    ok: true,
    url: candidate.url,
    locationName: config.location_name || "Home Assistant",
    homeAssistantVersion: config.version || "Unknown",
    totalEntityCount: states.length,
    kemsEntityCount: kemsCount,
    warning: kemsCount ? null : "Connected successfully, but no sensor.kems_* or binary_sensor.kems_* entities were found."
  };
}

function clearRuntimeData() {
  historyCache.clear();
  analyticsCache.clear();
  runtimeHistory.length = 0;
  entityCatalog = [];
  kemsEntityCatalog = [];
  resolvedEntities = { ...entities };
  previousEntityStates = new Map();
}

function buildUnconfiguredSnapshot(now = new Date()) {
  return {
    source: "unconfigured",
    connected: false,
    stale: true,
    updatedAt: now.toISOString(),
    mode: "Connection required",
    phase: "Setup",
    recommendation: "Connect this website to Home Assistant to display the existing KEMS data.",
    recommendationDetail: "Enter the Home Assistant address and a long-lived access token. Nothing needs to be installed or changed in Home Assistant.",
    metrics: {
      gridPower: null,
      gridImportPower: null,
      gridExportPower: null,
      gridFlowDirection: "unavailable",
      housePower: null,
      typicalHousePower: null,
      solarPower: null,
      solarEnergyToday: null,
      solarDataAvailable: false,
      batteryPower: null,
      batterySoc: null,
      batteryDataAvailable: false,
      evPower: null,
      evConnected: false,
      evCharging: false,
      evSoc: null,
      hotWaterPower: null,
      heatPumpPower: null,
      currentRate: null,
      nextRate: null,
      offPeak: false,
      cheapPeriodConfirmed: false,
      intelligentSlot: false,
      nextOffpeakStart: null,
      nextOffpeakEnd: null,
      importToday: null,
      exportToday: null,
      costToday: null,
      observedCostToday: null,
      observedExportIncomeToday: null,
      avoidedDayRateImportToday: null,
      temperature: null,
      weather: "Not connected",
      occupants: null,
      modelConfidence: null,
      dataQuality: null,
      dataPoints: null,
      historySamples: null,
      entityCoverage: null,
      actualRoi: null,
      actualSystemValueToday: null,
      actualSystemValueTotal: null
    },
    observed: {
      gridImportToday: null,
      gridExportToday: null,
      costToday: null,
      exportIncomeToday: null,
      wholeHomeCostToday: null
    },
    simulation: {
      ready: false,
      savingShown: false,
      solarModelActive: false,
      solarPower: null,
      solarToday: null,
      batterySoc: null,
      gridImportToday: null,
      gridExportToday: null,
      batteryExportToday: null,
      costToday: null,
      savingToday: null,
      exportIncomeToday: null,
      wholeHomeCostToday: null,
      wholeHomeSavingToday: null
    },
    forecast: {
      typicalHousePower: null,
      typicalSolarPower: null,
      predictedEnergyUntilOffPeak: null,
      annualSaving: null,
      paybackYears: null,
      paybackDate: null,
      netValue: null
    },
    availability: {
      liveGrid: false,
      liveHome: false,
      liveEvPower: false,
      liveSolar: false,
      liveBattery: false,
      liveEvSoc: false,
      liveTariff: false,
      simulation: false,
      forecast: false
    },
    readiness: { learning: false, simulation: false, roi: false, saving: false },
    devices: [],
    entities: [],
    mappedEntities: [],
    health: {
      kemsCore: "offline",
      homeAssistant: "offline",
      database: "offline",
      dataIngestion: "offline",
      octopus: "offline",
      ohme: "offline",
      foxess: "waiting",
      solar: "waiting",
      network: "offline"
    },
    safeguards: [{ name: "Website control", state: "None — display only", status: "safe" }],
    events: [],
    flows: { import: null, export: null },
    discovery: { totalKemsEntities: 0, availableKemsEntities: 0 }
  };
}

function buildConnectingSnapshot(now = new Date()) {
  return {
    ...buildUnconfiguredSnapshot(now),
    source: "home-assistant-kems",
    mode: "Connecting",
    recommendation: "Connecting to the existing KEMS integration in Home Assistant.",
    recommendationDetail: "The website is testing the saved address and token."
  };
}

function sameOriginWrite(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; } catch { return false; }
}

function privateIpv4(value) {
  const match = String(value || "").match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254);
}

function directLanManagementRequest(request) {
  if (!sameOriginWrite(request)) return false;
  if (request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"] || request.headers["x-forwarded-host"] || request.headers.forwarded) return false;
  try {
    const hostname = new URL(`http://${request.headers.host || ""}`).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local") || privateIpv4(hostname);
  } catch {
    return false;
  }
}

async function managerRequest(pathname, options = {}) {
  const response = await fetch(`${MANAGER_URL}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeout || 12_000)
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body.error || `Pi manager returned ${response.status}.`);
  return body;
}

function createEncryptedBackup(password) {
  const secret = String(password || "");
  if (secret.length < 8) throw new Error("Use a backup password of at least 8 characters.");
  const files = {};
  for (const name of BACKUP_FILES) {
    const file = path.join(DATA_DIR, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const data = fs.readFileSync(file);
    if (data.length > 20_000_000) throw new Error(`${name} is too large to include in a browser backup.`);
    files[name] = data.toString("base64");
  }
  const payload = Buffer.from(JSON.stringify({
    format: "kems-web-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    kemsWebVersion: project.version,
    files
  }), "utf8");
  const compressed = zlib.gzipSync(payload, { level: 9 });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, salt, iv, tag, encrypted]);
}

function restoreEncryptedBackup(buffer, password) {
  const secret = String(password || "");
  if (secret.length < 8) throw new Error("Enter the password used when the backup was created.");
  if (!Buffer.isBuffer(buffer) || buffer.length < BACKUP_MAGIC.length + 16 + 12 + 16 + 1) throw new Error("This does not look like a KEMS Web backup.");
  if (!buffer.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) throw new Error("Unsupported KEMS Web backup format.");
  let offset = BACKUP_MAGIC.length;
  const salt = buffer.subarray(offset, offset += 16);
  const iv = buffer.subarray(offset, offset += 12);
  const tag = buffer.subarray(offset, offset += 16);
  const encrypted = buffer.subarray(offset);
  let decoded;
  try {
    const key = crypto.scryptSync(secret, salt, 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    decoded = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted), decipher.final()]));
  } catch {
    throw new Error("The backup password is incorrect or the backup file is damaged.");
  }
  let payload;
  try { payload = JSON.parse(decoded.toString("utf8")); } catch { throw new Error("The backup contents are invalid."); }
  if (payload?.format !== "kems-web-backup" || payload.version !== 1 || !payload.files || typeof payload.files !== "object") throw new Error("Unsupported KEMS Web backup contents.");
  for (const name of Object.keys(payload.files)) if (!BACKUP_FILES.includes(name)) throw new Error(`Backup contains an unexpected file: ${name}`);
  if (payload.files["connection.enc.json"] && !payload.files[".connection-key"]) throw new Error("Backup connection data is missing its encryption key.");
  const decodedFiles = {};
  for (const name of BACKUP_FILES) {
    if (!(name in payload.files)) continue;
    const data = Buffer.from(String(payload.files[name]), "base64");
    if (data.length > 20_000_000) throw new Error(`${name} is too large to restore.`);
    if (name.endsWith(".json")) { try { JSON.parse(data.toString("utf8")); } catch { throw new Error(`${name} is not valid JSON.`); } }
    if (name === ".connection-key") {
      const key = Buffer.from(data.toString("utf8").trim(), "base64url");
      if (key.length !== 32) throw new Error("Backup connection key is invalid.");
    }
    decodedFiles[name] = data;
  }
  for (const name of BACKUP_FILES) {
    const file = path.join(DATA_DIR, name);
    if (!(name in decodedFiles)) { try { fs.rmSync(file, { force: true }); } catch {} continue; }
    const temporary = `${file}.restore-${process.pid}`;
    fs.writeFileSync(temporary, decodedFiles[name], { mode: 0o600 });
    fs.renameSync(temporary, file);
    try { fs.chmodSync(file, 0o600); } catch {}
  }
  return { restored: Object.keys(decodedFiles), createdAt: payload.createdAt || null, kemsWebVersion: payload.kemsWebVersion || null };
}

async function readRawBody(request, limit = 25_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limit) throw new Error("Backup file is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round((Number(value || 0) + Number.EPSILON) * scale) / scale;
}

function isOn(state) {
  return ["on", "true", "yes", "active", "charging", "home", "connected"].includes(String(state).toLowerCase());
}

function numeric(state, fallback = null) {
  const parsed = Number.parseFloat(state);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function titleCase(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveEntityId(map, key) {
  const configured = entities[key];
  if (configured && map.has(configured)) return configured;

  const aliases = {
    recommendation: ["sensor.kems_advice"],
    house_power: ["sensor.kems_house_load", "sensor.kems_house_power"],
    grid_import_power: ["sensor.kems_grid_import_power"],
    grid_export_power: ["sensor.kems_grid_export_power"],
    grid_net_power: ["sensor.kems_grid_net_power", "sensor.kems_grid_power"],
    battery_soc: ["sensor.kems_battery_state_of_charge", "sensor.kems_battery_soc"],
    solar_power: ["sensor.kems_solar_power", "sensor.kems_pv_power", "sensor.kems_solar_generation_power"],
    solar_energy_today: ["sensor.kems_solar_generation_today", "sensor.kems_solar_energy_today"],
    solar_data_available: ["binary_sensor.kems_solar_data_available"],
    typical_solar_power: ["sensor.kems_typical_solar_power_now"],
    ev_power: ["sensor.kems_ev_charging_power", "sensor.kems_ev_power"],
    ev_soc: ["sensor.kems_ev_state_of_charge", "sensor.kems_ev_soc"],
    current_rate: ["sensor.kems_current_import_rate"],
    next_rate: ["sensor.kems_next_import_rate"],
    model_confidence: ["sensor.kems_learning_confidence", "sensor.kems_model_confidence"],
    history_samples: ["sensor.kems_history_samples", "sensor.kems_data_points"]
  };
  const candidate = (aliases[key] || []).find((entityId) => map.has(entityId));
  return candidate || configured || null;
}

function resolveMappings(map) {
  resolvedEntities = Object.fromEntries(Object.keys(entities).map((key) => [key, resolveEntityId(map, key)]));
}

function entityValue(map, key, fallback = null) {
  const entityId = resolvedEntities[key] || entities[key];
  return entityId ? (map.get(entityId)?.state ?? fallback) : fallback;
}

function entityAttribute(map, key, names, fallback = null) {
  const entityId = resolvedEntities[key] || entities[key];
  const attributes = entityId ? map.get(entityId)?.attributes || {} : {};
  for (const name of names) if (attributes[name] !== undefined && attributes[name] !== null) return attributes[name];
  return fallback;
}

function convertNumeric(entity, fallback = 0) {
  if (!entity) return fallback;
  const raw = numeric(entity.state, fallback);
  const unit = String(entity.attributes?.unit_of_measurement || "").toLowerCase();
  if (unit === "w") return raw / 1000;
  if (unit === "mw") return raw / 1_000_000;
  if (["gbp/kwh", "£/kwh"].includes(unit)) return raw * 100;
  return raw;
}

function entityNumber(map, key, fallback = 0) {
  const entityId = resolvedEntities[key] || entities[key];
  return convertNumeric(entityId ? map.get(entityId) : null, fallback);
}

function entityMoney(map, key, fallback = null) {
  const entityId = resolvedEntities[key] || entities[key];
  const item = entityId ? map.get(entityId) : null;
  if (!item || ["unknown", "unavailable"].includes(String(item.state).toLowerCase())) return fallback;
  const value = numeric(item.state, fallback);
  if (!Number.isFinite(value)) return fallback;
  const unit = String(item.attributes?.unit_of_measurement || "").toLowerCase();
  return ["p", "pence"].includes(unit) ? value / 100 : value;
}

function mappedEntity(map, key) {
  const entityId = resolvedEntities[key] || entities[key];
  const entity = entityId ? map.get(entityId) : null;
  return {
    key,
    entityId,
    state: entity?.state ?? "not_found",
    attributes: entity?.attributes ?? {},
    available: Boolean(entity && !["unavailable", "unknown"].includes(entity.state)),
    changedAt: entity?.last_changed ?? null
  };
}

function optionalNumber(map, key, fallback = null) {
  return mappedEntity(map, key).available ? entityNumber(map, key, fallback) : fallback;
}

async function fetchHomeAssistantSnapshot() {
  const endpoint = `${connection.url}/api/states`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Home Assistant returned ${response.status}`);
  const allStates = await response.json();
  const map = new Map(allStates.map((entity) => [entity.entity_id, entity]));
  resolveMappings(map);
  entityCatalog = allStates
    .filter((entity) => ["sensor", "binary_sensor", "input_boolean", "select", "person", "weather"].includes(entity.entity_id.split(".")[0]))
    .map((entity) => ({
      entityId: entity.entity_id,
      name: entity.attributes?.friendly_name || entity.entity_id,
      state: entity.state,
      unit: entity.attributes?.unit_of_measurement || "",
      deviceClass: entity.attributes?.device_class || "",
      icon: entity.attributes?.icon || ""
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  kemsEntityCatalog = allStates
    .filter((entity) => /^(sensor|binary_sensor|select|switch)\.kems_/.test(entity.entity_id))
    .map((entity) => ({
      key: entity.entity_id.replace(/^(sensor|binary_sensor|select|switch)\.kems_/, ""),
      entityId: entity.entity_id,
      state: entity.state,
      attributes: entity.attributes || {},
      available: !["unavailable", "unknown"].includes(entity.state),
      changedAt: entity.last_changed || entity.last_updated || null
    }))
    .sort((a, b) => a.entityId.localeCompare(b.entityId));

  const now = new Date();
  const mappedEntities = Object.keys(entities).map((key) => mappedEntity(map, key));
  const currentRate = optionalNumber(map, "current_rate");
  const offPeak = isOn(entityValue(map, "off_peak", false));
  const cheapConfirmed = isOn(entityValue(map, "cheap_period_confirmed", false));
  const kemsStatus = String(entityValue(map, "status", "KEMS online"));
  const phase = String(entityValue(map, "phase", "Observe"));
  const advice = String(entityValue(map, "recommendation", "KEMS is observing live Home Assistant data."));
  const adviceDetail = String(entityAttribute(map, "recommendation", ["description", "detail", "reason", "evidence"], "This website only displays the decisions and evidence produced by the existing KEMS Home Assistant integration."));
  const changed = kemsEntityCatalog
    .filter((entity) => previousEntityStates.get(entity.entityId) !== entity.state)
    .slice(0, 8)
    .map((entity) => ({ at: now.toISOString(), type: "state", text: `${entity.entityId} changed to ${entity.state}.` }));
  previousEntityStates = new Map(kemsEntityCatalog.map((entity) => [entity.entityId, entity.state]));

  const importRaw = optionalNumber(map, "grid_import_power");
  const exportRaw = optionalNumber(map, "grid_export_power");
  const importPower = Number.isFinite(importRaw) ? Math.max(0, round(importRaw)) : null;
  const exportPower = Number.isFinite(exportRaw) ? Math.max(0, round(exportRaw)) : null;
  const explicitNet = optionalNumber(map, "grid_net_power");
  const flowDirection = String(entityValue(map, "grid_flow_direction", "")).toLowerCase();
  let gridPower = Number.isFinite(explicitNet)
    ? round(explicitNet)
    : Number.isFinite(importPower) || Number.isFinite(exportPower)
      ? round((importPower || 0) - (exportPower || 0))
      : null;
  if (Number.isFinite(gridPower) && flowDirection.includes("export") && gridPower > 0) gridPower = -gridPower;
  if (Number.isFinite(gridPower) && flowDirection.includes("import") && gridPower < 0) gridPower = Math.abs(gridPower);

  const houseRaw = optionalNumber(map, "house_power");
  const housePower = Number.isFinite(houseRaw) ? round(houseRaw) : null;
  const batteryDataAvailable = isOn(entityValue(map, "battery_data_available", false)) && mappedEntity(map, "battery_soc").available;
  const batteryPower = batteryDataAvailable && mappedEntity(map, "battery_power").available ? round(entityNumber(map, "battery_power")) : null;
  const batterySoc = batteryDataAvailable ? round(entityNumber(map, "battery_soc"), 0) : null;
  const solarSensorAvailable = mappedEntity(map, "solar_power").available;
  const solarDataAvailableFlag = mappedEntity(map, "solar_data_available").available ? isOn(entityValue(map, "solar_data_available", false)) : solarSensorAvailable;
  const solarDataAvailable = solarSensorAvailable && solarDataAvailableFlag;
  const solarPower = solarDataAvailable ? round(entityNumber(map, "solar_power")) : null;
  const solarEnergyToday = solarDataAvailable && mappedEntity(map, "solar_energy_today").available ? round(entityNumber(map, "solar_energy_today")) : null;
  const typicalSolarPower = mappedEntity(map, "typical_solar_power").available ? round(entityNumber(map, "typical_solar_power")) : null;
  const solarModelActive = isOn(entityValue(map, "proposal_solar_model_active", false));
  const simulatedSolarPower = mappedEntity(map, "simulated_solar_power").available ? round(entityNumber(map, "simulated_solar_power")) : null;
  const simulatedSolarToday = mappedEntity(map, "simulated_solar_today").available ? round(entityNumber(map, "simulated_solar_today")) : null;
  const simulatedBatterySoc = mappedEntity(map, "simulated_battery_soc").available ? round(entityNumber(map, "simulated_battery_soc"), 1) : null;
  const evRaw = optionalNumber(map, "ev_power");
  const evPower = Number.isFinite(evRaw) ? round(evRaw) : null;
  const importToday = mappedEntity(map, "observed_import_today").available ? round(entityNumber(map, "observed_import_today")) : null;
  const exportToday = mappedEntity(map, "observed_export_today").available ? round(entityNumber(map, "observed_export_today")) : null;
  const observedCostToday = mappedEntity(map, "observed_cost_today").available ? round(entityMoney(map, "observed_cost_today"), 2) : null;
  const simulatedCostToday = mappedEntity(map, "simulated_cost_today").available ? round(entityMoney(map, "simulated_cost_today"), 2) : null;
  const simulatedSavingToday = mappedEntity(map, "simulated_saving_today").available ? round(entityMoney(map, "simulated_saving_today"), 2) : null;
  const historySamplesRaw = optionalNumber(map, "history_samples");
  const dataQualityRaw = optionalNumber(map, "data_quality");
  const learningConfidenceRaw = optionalNumber(map, "model_confidence");
  const historySamples = Number.isFinite(historySamplesRaw) ? round(historySamplesRaw, 0) : null;
  const dataQuality = Number.isFinite(dataQualityRaw) ? round(dataQualityRaw, 0) : null;
  const learningConfidence = Number.isFinite(learningConfidenceRaw) ? round(learningConfidenceRaw, 0) : null;

  const readiness = {
    learning: isOn(entityValue(map, "learning_ready", false)),
    simulation: isOn(entityValue(map, "simulation_ready", false)),
    roi: isOn(entityValue(map, "roi_prediction_ready", false)),
    saving: isOn(entityValue(map, "simulation_shows_saving", false))
  };

  return {
    source: "home-assistant-kems",
    connected: true,
    updatedAt: now.toISOString(),
    stale: false,
    mode: kemsStatus,
    phase,
    recommendation: advice,
    recommendationDetail: adviceDetail,
    metrics: {
      gridPower,
      gridImportPower: importPower,
      gridExportPower: exportPower,
      gridFlowDirection: flowDirection || (Number.isFinite(gridPower) ? (gridPower > 0.01 ? "importing" : gridPower < -0.01 ? "exporting" : "balanced") : "unavailable"),
      housePower,
      typicalHousePower: mappedEntity(map, "typical_house_power").available ? round(entityNumber(map, "typical_house_power")) : null,
      solarPower,
      solarEnergyToday,
      solarDataAvailable,
      batteryPower,
      batterySoc,
      batteryDataAvailable,
      evPower,
      evConnected: isOn(entityValue(map, "ev_connected", false)),
      evCharging: isOn(entityValue(map, "ev_charging", false)),
      evSoc: mappedEntity(map, "ev_soc").available ? round(entityNumber(map, "ev_soc"), 0) : null,
      hotWaterPower: null,
      heatPumpPower: null,
      currentRate: Number.isFinite(currentRate) ? round(currentRate, 3) : null,
      nextRate: mappedEntity(map, "next_rate").available ? round(entityNumber(map, "next_rate"), 3) : null,
      offPeak,
      cheapPeriodConfirmed: cheapConfirmed,
      intelligentSlot: isOn(entityValue(map, "intelligent_slot", false)),
      nextOffpeakStart: entityValue(map, "next_offpeak_start", null),
      nextOffpeakEnd: entityValue(map, "next_offpeak_end", null),
      importToday,
      exportToday,
      costToday: observedCostToday,
      observedCostToday,
      observedExportIncomeToday: mappedEntity(map, "observed_export_income_today").available ? round(entityMoney(map, "observed_export_income_today"), 2) : null,
      avoidedDayRateImportToday: mappedEntity(map, "avoided_day_rate_import_today").available ? round(entityNumber(map, "avoided_day_rate_import_today")) : null,
      temperature: null,
      weather: "Home Assistant",
      occupants: null,
      modelConfidence: learningConfidence,
      dataQuality,
      dataPoints: historySamples,
      historySamples,
      entityCoverage: kemsEntityCatalog.length ? round(kemsEntityCatalog.filter((entity) => entity.available).length / kemsEntityCatalog.length * 100, 0) : null,
      actualRoi: mappedEntity(map, "actual_roi").available ? round(entityNumber(map, "actual_roi"), 1) : null,
      actualSystemValueToday: mappedEntity(map, "actual_system_value_today").available ? round(entityMoney(map, "actual_system_value_today"), 2) : null,
      actualSystemValueTotal: mappedEntity(map, "actual_system_value_total").available ? round(entityMoney(map, "actual_system_value_total"), 2) : null
    },
    observed: {
      gridImportToday: importToday,
      gridExportToday: exportToday,
      costToday: observedCostToday,
      exportIncomeToday: mappedEntity(map, "observed_export_income_today").available ? round(entityMoney(map, "observed_export_income_today"), 2) : null,
      wholeHomeCostToday: mappedEntity(map, "whole_home_observed_cost_today").available ? round(entityMoney(map, "whole_home_observed_cost_today"), 2) : null
    },
    simulation: {
      ready: readiness.simulation,
      savingShown: readiness.saving,
      solarModelActive,
      solarPower: simulatedSolarPower,
      solarToday: simulatedSolarToday,
      batterySoc: simulatedBatterySoc,
      gridImportToday: mappedEntity(map, "simulated_import_today").available ? round(entityNumber(map, "simulated_import_today")) : null,
      gridExportToday: mappedEntity(map, "simulated_export_today").available ? round(entityNumber(map, "simulated_export_today")) : null,
      batteryExportToday: mappedEntity(map, "simulated_battery_export_today").available ? round(entityNumber(map, "simulated_battery_export_today")) : null,
      costToday: simulatedCostToday,
      savingToday: simulatedSavingToday,
      exportIncomeToday: mappedEntity(map, "simulated_export_income_today").available ? round(entityMoney(map, "simulated_export_income_today"), 2) : null,
      wholeHomeCostToday: mappedEntity(map, "whole_home_simulated_cost_today").available ? round(entityMoney(map, "whole_home_simulated_cost_today"), 2) : null,
      wholeHomeSavingToday: mappedEntity(map, "whole_home_simulated_saving_today").available ? round(entityMoney(map, "whole_home_simulated_saving_today"), 2) : null,
      strategy: String(entityValue(map, "simulation_strategy", "unknown")),
      exportTariffStatus: String(entityValue(map, "export_tariff_status", "unknown")),
      exportTariffActive: isOn(entityValue(map, "export_tariff_active", false)),
      noExportModeActive: isOn(entityValue(map, "no_export_mode_active", false)),
      solarToBatteryPower: mappedEntity(map, "simulated_solar_to_battery_power").available ? round(entityNumber(map, "simulated_solar_to_battery_power")) : null,
      batteryChargingPower: mappedEntity(map, "simulated_battery_charging_power").available ? round(entityNumber(map, "simulated_battery_charging_power")) : null,
      gridBypassPower: mappedEntity(map, "simulated_grid_bypass_power").available ? round(entityNumber(map, "simulated_grid_bypass_power")) : null,
      totalSiteImportPower: mappedEntity(map, "simulated_total_site_import").available ? round(entityNumber(map, "simulated_total_site_import")) : null,
      totalKh7OutputPower: mappedEntity(map, "simulated_total_kh7_ac_output").available ? round(entityNumber(map, "simulated_total_kh7_ac_output")) : null,
      overnightChargeTargetSoc: mappedEntity(map, "overnight_charge_target_soc").available ? round(entityNumber(map, "overnight_charge_target_soc"), 0) : null,
      overnightChargeTargetEnergy: mappedEntity(map, "overnight_charge_target_energy").available ? round(entityNumber(map, "overnight_charge_target_energy"), 2) : null,
      forecastSolarUntilNextCheap: mappedEntity(map, "forecast_solar_until_next_cheap").available ? round(entityNumber(map, "forecast_solar_until_next_cheap"), 2) : null
    },
    alpha5: {
      exportTariffStatus: String(entityValue(map, "export_tariff_status", "unknown")),
      exportTariffActive: isOn(entityValue(map, "export_tariff_active", false)),
      noExportModeActive: isOn(entityValue(map, "no_export_mode_active", false)),
      accumulatorHealthy: isOn(entityValue(map, "accumulator_healthy", false)),
      historicalRepairRequired: isOn(entityValue(map, "historical_repair_required", false)),
      accumulatorStatus: String(entityValue(map, "accumulator_status", "unknown")),
      lastDailyRollover: entityValue(map, "last_daily_rollover", null),
      lastSuccessfulAccumulation: entityValue(map, "last_successful_accumulation", null),
      accumulationDaysComplete: mappedEntity(map, "accumulation_days_complete").available ? round(entityNumber(map, "accumulation_days_complete"), 0) : null,
      siteImportLimit: mappedEntity(map, "configured_site_import_limit").available ? round(entityNumber(map, "configured_site_import_limit"), 2) : null,
      siteImportHeadroom: mappedEntity(map, "site_import_headroom").available ? round(entityNumber(map, "site_import_headroom"), 2) : null,
      siteImportLimitExceeded: isOn(entityValue(map, "site_import_limit_exceeded", false)),
      kh7OutputHeadroom: mappedEntity(map, "kh7_output_headroom").available ? round(entityNumber(map, "kh7_output_headroom"), 2) : null,
      kh7AcOutputLimit: mappedEntity(map, "kh7_combined_ac_output_limit").available ? round(entityNumber(map, "kh7_combined_ac_output_limit"), 2) : null
    },
    forecast: {
      typicalHousePower: mappedEntity(map, "typical_house_power").available ? round(entityNumber(map, "typical_house_power")) : null,
      typicalSolarPower,
      predictedEnergyUntilOffPeak: mappedEntity(map, "predicted_energy_until_off_peak").available ? round(entityNumber(map, "predicted_energy_until_off_peak")) : null,
      annualSaving: mappedEntity(map, "predicted_annual_saving").available ? round(entityMoney(map, "predicted_annual_saving"), 2) : null,
      paybackYears: mappedEntity(map, "predicted_payback").available ? round(entityNumber(map, "predicted_payback"), 1) : null,
      paybackDate: entityValue(map, "predicted_payback_date", null),
      netValue: mappedEntity(map, "predicted_net_value").available ? round(entityMoney(map, "predicted_net_value"), 2) : null
    },
    availability: {
      liveGrid: Number.isFinite(gridPower),
      liveHome: Number.isFinite(housePower),
      liveEvPower: Number.isFinite(evPower),
      liveSolar: solarDataAvailable,
      liveBattery: batteryDataAvailable,
      liveEvSoc: mappedEntity(map, "ev_soc").available,
      liveTariff: Number.isFinite(currentRate),
      simulation: readiness.simulation,
      forecast: readiness.roi || typicalSolarPower !== null || mappedEntity(map, "predicted_energy_until_off_peak").available
    },
    readiness,
    devices: deviceRows(map, { evPower, hotWaterPower: null, heatPumpPower: null }),
    entities: kemsEntityCatalog,
    mappedEntities,
    health: {
      kemsCore: statusFor(mappedEntities, ["status", "phase"]),
      homeAssistant: "healthy",
      database: Number.isFinite(historySamples) && historySamples > 0 ? "healthy" : "attention",
      dataIngestion: Number.isFinite(dataQuality) && dataQuality > 0 ? "healthy" : "attention",
      octopus: statusFor(mappedEntities, ["current_rate", "off_peak"]),
      ohme: statusFor(mappedEntities, ["ev_connected", "ev_power"]),
      foxess: batteryDataAvailable ? "healthy" : "waiting",
      solar: solarDataAvailable ? "healthy" : solarModelActive ? "modelled" : "waiting",
      network: "healthy"
    },
    safeguards: [
      { name: "Website control", state: "None — display only", status: "safe" },
      { name: "KEMS physical control", state: phase.toLowerCase() === "control" ? "Managed by Home Assistant KEMS" : "Not active", status: "safe" },
      { name: "Cheap-period confirmation", state: cheapConfirmed ? "Confirmed" : "Not confirmed", status: cheapConfirmed ? "healthy" : "safe" },
      { name: "Grid import outside cheap period", state: isOn(entityValue(map, "grid_import_outside_cheap", false)) ? "Detected" : "Clear", status: isOn(entityValue(map, "grid_import_outside_cheap", false)) ? "attention" : "healthy" }
    ],
    events: changed.length ? changed : current.events || [],
    flows: { import: importPower, export: exportPower },
    discovery: { totalKemsEntities: kemsEntityCatalog.length, availableKemsEntities: kemsEntityCatalog.filter((entity) => entity.available).length }
  };

}

function deviceRows(map, values) {
  const definitions = [
    ["ev", "EV charger", "ev_power", values.evPower, "car"],
    ["hot_water", "Hot water", "hot_water_power", values.hotWaterPower, "droplet"],
    ["heat_pump", "Heat pump", "heat_pump_power", values.heatPumpPower, "fan"],
    ["dishwasher", "Dishwasher", "dishwasher_power", null, "appliance"],
    ["washing_machine", "Washing machine", "washing_machine_power", null, "appliance"],
    ["lighting", "Lighting", "lighting_power", null, "bulb"]
  ];
  return definitions.flatMap(([key, name, entityKey, suppliedPower, icon]) => {
    const entity = mappedEntity(map, entityKey);
    if (!entity.available && key !== "ev") return [];
    const power = suppliedPower ?? (entity.available ? entityNumber(map, entityKey) : null);
    return [{
      key,
      name,
      power: Number.isFinite(power) ? round(power) : null,
      state: entity.available ? String(entityValue(map, entityKey, Number(power) > 0.05 ? "Running" : "Idle")) : "Unavailable",
      available: entity.available,
      icon
    }];
  });
}

function statusFor(mapped, keys, missingStatus = "attention") {
  const selected = keys.filter((key) => entities[key]).map((key) => mapped.find((entity) => entity.key === key));
  if (!selected.length) return missingStatus;
  if (selected.every((entity) => entity?.available)) return "healthy";
  if (selected.every((entity) => entity?.state === "not_found")) return missingStatus;
  return "attention";
}

async function fetchHomeAssistantHistory(hours, startOverride = null, endOverride = null) {
  const keys = ["grid_import_power", "grid_export_power", "house_power", "solar_power", "simulated_solar_power", "battery_power", "battery_soc", "simulated_battery_soc", "ev_power", "current_rate", "simulated_house_power", "simulated_grid_import_power", "simulated_grid_export_power", "simulated_battery_power", "simulated_battery_to_home_power", "simulated_battery_export_power", "desired_charge_power", "desired_battery_to_home_power", "desired_battery_export_power", "eps_utilisation", "model_confidence", "data_quality"];
  const selected = keys.filter((key) => resolvedEntities[key] || entities[key]);
  if (!selected.length) return [];
  const idToKey = new Map(selected.map((key) => [resolvedEntities[key] || entities[key], key]));
  const ids = [...idToKey.keys()].filter(Boolean);
  const endDate = endOverride ? new Date(endOverride) : new Date();
  const startDate = startOverride ? new Date(startOverride) : new Date(endDate.getTime() - hours * 3_600_000);
  const series = new Map();
  const warnings = [];

  for (let offset = 0; offset < ids.length; offset += 8) {
    const batchIds = ids.slice(offset, offset + 8);
    const start = startDate.toISOString();
    const url = new URL(`${connection.url}/api/history/period/${encodeURIComponent(start)}`);
    url.searchParams.set("end_time", endDate.toISOString());
    url.searchParams.set("filter_entity_id", batchIds.join(","));
    url.searchParams.set("minimal_response", "");
    url.searchParams.set("no_attributes", "");
    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      if (!Array.isArray(raw)) throw new Error("History response was not an array");
      raw.forEach((list, listIndex) => {
        if (!Array.isArray(list) || !list.length) return;
        const entityId = list.find((item) => item?.entity_id)?.entity_id || batchIds[listIndex];
        const key = idToKey.get(entityId);
        if (!key) return;
        const attributes = current.entities?.find((entity) => entity.key === key)?.attributes || {};
        const entries = list.map((item) => ({
          at: new Date(item.last_changed || item.last_updated || start).getTime(),
          value: convertNumeric({ state: item.state, attributes }, null)
        })).filter((item) => Number.isFinite(item.at) && Number.isFinite(item.value)).sort((a, b) => a.at - b.at);
        if (entries.length) series.set(key, [...(series.get(key) || []), ...entries].sort((a, b) => a.at - b.at));
      });
    } catch (error) {
      warnings.push(`${batchIds.length} entities: ${error.message}`);
    }
  }

  const intervalMinutes = hours <= 24 ? 5 : hours <= 72 ? 10 : 15;
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const cursors = Object.fromEntries(selected.map((key) => [key, 0]));
  const values = Object.fromEntries(selected.map((key) => [key, null]));
  const points = [];
  for (let at = startMs; at <= endMs; at += intervalMinutes * 60_000) {
    for (const key of selected) {
      const entries = series.get(key) || [];
      while (cursors[key] < entries.length && entries[cursors[key]].at <= at) {
        values[key] = entries[cursors[key]].value;
        cursors[key] += 1;
      }
    }
    const importValue = Number.isFinite(values.grid_import_power) ? values.grid_import_power : null;
    const exportValue = Number.isFinite(values.grid_export_power) ? values.grid_export_power : null;
    const gridValue = Number.isFinite(importValue) || Number.isFinite(exportValue) ? (importValue || 0) - (exportValue || 0) : null;
    points.push({
      at: new Date(at).toISOString(),
      grid: Number.isFinite(gridValue) ? round(gridValue) : null,
      house: Number.isFinite(values.house_power) ? round(values.house_power) : null,
      solarLive: Number.isFinite(values.solar_power) ? round(values.solar_power) : null,
      solarSimulated: Number.isFinite(values.simulated_solar_power) ? round(values.simulated_solar_power) : null,
      batteryLive: Number.isFinite(values.battery_power) ? round(values.battery_power) : null,
      ev: Number.isFinite(values.ev_power) ? round(values.ev_power) : null,
      rate: Number.isFinite(values.current_rate) ? round(values.current_rate, 3) : null,
      socLive: Number.isFinite(values.battery_soc) ? round(values.battery_soc, 1) : null,
      socSimulated: Number.isFinite(values.simulated_battery_soc) ? round(values.simulated_battery_soc, 1) : null,
      simulatedHouse: Number.isFinite(values.simulated_house_power) ? round(values.simulated_house_power) : null,
      simulatedGridImport: Number.isFinite(values.simulated_grid_import_power) ? round(values.simulated_grid_import_power) : null,
      simulatedGridExport: Number.isFinite(values.simulated_grid_export_power) ? round(values.simulated_grid_export_power) : null,
      simulatedBattery: Number.isFinite(values.simulated_battery_power) ? round(values.simulated_battery_power) : null,
      simulatedBatteryToHome: Number.isFinite(values.simulated_battery_to_home_power) ? round(values.simulated_battery_to_home_power) : null,
      simulatedBatteryExport: Number.isFinite(values.simulated_battery_export_power) ? round(values.simulated_battery_export_power) : null,
      desiredCharge: Number.isFinite(values.desired_charge_power) ? round(values.desired_charge_power) : null,
      desiredBatteryToHome: Number.isFinite(values.desired_battery_to_home_power) ? round(values.desired_battery_to_home_power) : null,
      desiredBatteryExport: Number.isFinite(values.desired_battery_export_power) ? round(values.desired_battery_export_power) : null,
      epsUtilisation: Number.isFinite(values.eps_utilisation) ? round(values.eps_utilisation, 1) : null,
      learningConfidence: Number.isFinite(values.model_confidence) ? round(values.model_confidence, 1) : null,
      dataQuality: Number.isFinite(values.data_quality) ? round(values.data_quality, 1) : null
    });
  }

  const localPoints = persistedPowerHistory.filter((point) => {
    const at = new Date(point.at).getTime();
    return Number.isFinite(at) && at >= startMs && at <= endMs;
  });
  const combined = [...points, ...localPoints, snapshotHistoryPoint(current)]
    .filter((point) => {
      const at = new Date(point.at).getTime();
      return Number.isFinite(at) && at >= startMs - 1000 && at <= endMs + 60_000;
    })
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const deduplicated = [];
  for (const point of combined) {
    const previous = deduplicated.at(-1);
    if (previous && Math.abs(new Date(previous.at) - new Date(point.at)) < 30_000) deduplicated[deduplicated.length - 1] = { ...previous, ...point };
    else deduplicated.push(point);
  }
  historyDiagnostics.currentDay = {
    source: series.size ? "Home Assistant recorder plus local snapshots" : localPoints.length ? "Local snapshots" : "Current snapshot",
    points: deduplicated.length,
    entitySeries: series.size,
    warning: warnings.length ? warnings.join("; ") : null
  };
  return deduplicated;
}

function localDayStart(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

async function policyEventsForToday() {
  if (!isConfigured()) return [];
  const cacheKey = "policy-events:today";
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.events || [];
  const start = localDayStart();
  const end = new Date();
  const definitions = [
    ["simulation_strategy", "Simulation strategy", (state) => titleCase(String(state).replace(/_/g, " "))],
    ["export_tariff_status", "Export tariff", (state) => titleCase(String(state).replace(/_/g, " "))],
    ["no_export_mode_active", "No-export policy", (state) => isOn(state) ? "On" : "Off"]
  ];
  const idToDefinition = new Map();
  for (const [key, label, formatter] of definitions) {
    const entityId = resolvedEntities[key] || entities[key];
    if (entityId) idToDefinition.set(entityId, { key, label, formatter });
  }
  const ids = [...idToDefinition.keys()];
  if (!ids.length) return [];
  const url = new URL(`${connection.url}/api/history/period/${encodeURIComponent(start.toISOString())}`);
  url.searchParams.set("end_time", end.toISOString());
  url.searchParams.set("filter_entity_id", ids.join(","));
  url.searchParams.set("minimal_response", "");
  url.searchParams.set("no_attributes", "");
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    if (!Array.isArray(raw)) throw new Error("History response was not an array");
    const events = [];
    raw.forEach((list, listIndex) => {
      if (!Array.isArray(list) || !list.length) return;
      const entityId = list.find((item) => item?.entity_id)?.entity_id || ids[listIndex];
      const definition = idToDefinition.get(entityId);
      if (!definition) return;
      const entries = list.map((item) => ({
        at: new Date(item.last_changed || item.last_updated || start).getTime(),
        state: String(item.state ?? "unknown")
      })).filter((item) => Number.isFinite(item.at)).sort((a, b) => a.at - b.at);
      let previous = null;
      for (const entry of entries) {
        if (previous === null) { previous = entry.state; continue; }
        if (entry.state === previous) continue;
        if (entry.at >= start.getTime() && entry.at <= end.getTime()) {
          events.push({
            at: new Date(entry.at).toISOString(),
            key: definition.key,
            label: `${definition.label} → ${definition.formatter(entry.state)}`,
            state: entry.state
          });
        }
        previous = entry.state;
      }
    });
    events.sort((a, b) => new Date(a.at) - new Date(b.at));
    const grouped = [];
    for (const event of events) {
      const prior = grouped.at(-1);
      if (prior && Math.abs(new Date(event.at) - new Date(prior.at)) <= 90_000) {
        prior.labels.push(event.label);
        prior.keys.push(event.key);
      } else {
        grouped.push({ at: event.at, labels: [event.label], keys: [event.key] });
      }
    }
    const result = grouped.map((event) => ({ at: event.at, label: event.labels.join(" · "), keys: event.keys }));
    historyCache.set(cacheKey, { at: Date.now(), events: result });
    return result;
  } catch (error) {
    console.warn("Home Assistant policy history unavailable:", error.message);
    return [];
  }
}

function filterSeriesToNativePeriod(series, native) {
  if (!native?.startDate || !native?.endDate) return series || [];
  return (series || []).filter((row) => {
    const date = row.date || localDateKey(row.at);
    return Boolean(date && date >= native.startDate && date <= native.endDate);
  });
}

async function historyForToday() {
  if (!isConfigured()) return [];
  const key = "today";
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.points;
  try {
    const start = localDayStart();
    const points = await fetchHomeAssistantHistory(Math.max(1, (Date.now() - start.getTime()) / 3_600_000), start, new Date());
    if (points.length) {
      historyCache.set(key, { at: Date.now(), points });
      return points;
    }
  } catch (error) {
    console.warn("Home Assistant current-day history unavailable:", error.message);
  }
  const cutoff = localDayStart().getTime();
  return runtimeHistory.filter((point) => new Date(point.at).getTime() >= cutoff);
}

async function historyFor(hours) {
  if (!isConfigured()) return [];
  const key = String(hours);
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.points;
  try {
    const points = await fetchHomeAssistantHistory(hours);
    if (points.length) {
      historyCache.set(key, { at: Date.now(), points });
      return points;
    }
  } catch (error) {
    console.warn("Home Assistant recorder history unavailable:", error.message);
  }
  const cutoff = Date.now() - hours * 3_600_000;
  return runtimeHistory.filter((point) => new Date(point.at).getTime() >= cutoff);
}

function catalogEntityForKey(key) {
  const entityId = resolvedEntities[key] || entities[key];
  return entityId ? kemsEntityCatalog.find((item) => item.entityId === entityId) || null : null;
}

function currentNumberForKey(key) {
  const item = catalogEntityForKey(key);
  if (!item?.available) return null;
  return convertNumeric({ state: item.state, attributes: item.attributes }, null);
}

function currentMoneyForKey(key) {
  const item = catalogEntityForKey(key);
  if (!item?.available) return null;
  const value = numeric(item.state, null);
  if (!Number.isFinite(value)) return null;
  const unit = String(item.attributes?.unit_of_measurement || "").toLowerCase();
  return ["p", "pence"].includes(unit) ? value / 100 : value;
}

function averageValue(first, second, field) {
  const values = [first?.[field], second?.[field]].filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function addEnergy(target, key, power, hours) {
  if (!Number.isFinite(power) || !Number.isFinite(hours) || hours <= 0) return;
  target[key] = (target[key] || 0) + Math.max(0, power) * hours;
}

function allocateImport(importEnergy, homeEnergy, evEnergy, batteryChargeEnergy) {
  const baseHome = Math.max(0, (homeEnergy || 0) - (evEnergy || 0));
  const loads = {
    home: baseHome,
    ev: Math.max(0, evEnergy || 0),
    battery: Math.max(0, batteryChargeEnergy || 0)
  };
  const totalLoad = Object.values(loads).reduce((sum, value) => sum + value, 0);
  if (!(importEnergy > 0) || !(totalLoad > 0)) {
    return { home: 0, ev: 0, battery: 0, unallocated: Math.max(0, importEnergy || 0), method: "estimated" };
  }
  const allocated = Math.min(importEnergy, totalLoad);
  const factor = allocated / totalLoad;
  return {
    home: round(loads.home * factor, 3),
    ev: round(loads.ev * factor, 3),
    battery: round(loads.battery * factor, 3),
    unallocated: round(Math.max(0, importEnergy - allocated), 3),
    method: "estimated"
  };
}

function allocateExport(exportEnergy, solarEnergy, batteryDischargeEnergy, directBatteryExport = null) {
  const totalExport = Math.max(0, exportEnergy || 0);
  if (Number.isFinite(directBatteryExport)) {
    const battery = Math.min(totalExport, Math.max(0, directBatteryExport));
    return {
      solar: round(Math.max(0, totalExport - battery), 3),
      battery: round(battery, 3),
      unallocated: 0,
      method: "direct-plus-residual"
    };
  }
  const sources = Math.max(0, solarEnergy || 0) + Math.max(0, batteryDischargeEnergy || 0);
  if (!(totalExport > 0) || !(sources > 0)) {
    return { solar: 0, battery: 0, unallocated: round(totalExport, 3), method: "estimated" };
  }
  return {
    solar: round(totalExport * Math.max(0, solarEnergy || 0) / sources, 3),
    battery: round(totalExport * Math.max(0, batteryDischargeEnergy || 0) / sources, 3),
    unallocated: 0,
    method: "estimated"
  };
}

function integrateEnergyWindow(points, mode = "live") {
  const totals = {
    home: 0, ev: 0, gridImport: 0, gridExport: 0, solar: 0,
    batteryCharge: 0, batteryDischarge: 0, batteryToHome: 0, batteryExport: 0,
    importCost: 0
  };
  const importBreakdown = { home: 0, ev: 0, battery: 0, unallocated: 0, method: "interval-estimate" };
  const exportBreakdown = { solar: 0, battery: 0, unallocated: 0, method: "interval-estimate" };
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    const hours = Math.min(0.5, Math.max(0, (new Date(second.at) - new Date(first.at)) / 3_600_000));
    if (!hours) continue;
    const house = Math.max(0, averageValue(first, second, mode === "simulated" ? "simulatedHouse" : "house") || 0);
    const ev = Math.max(0, averageValue(first, second, "ev") || 0);
    const rate = Math.max(0, averageValue(first, second, "rate") || 0);
    let importPower;
    let exportPower;
    let solar;
    let batteryCharge;
    let batteryDischarge;
    let batteryToHome = 0;
    let batteryExport = 0;
    if (mode === "simulated") {
      importPower = Math.max(0, averageValue(first, second, "simulatedGridImport") || 0);
      exportPower = Math.max(0, averageValue(first, second, "simulatedGridExport") || 0);
      solar = Math.max(0, averageValue(first, second, "solarSimulated") || 0);
      const battery = averageValue(first, second, "simulatedBattery") || 0;
      batteryCharge = Math.max(0, -battery);
      batteryDischarge = Math.max(0, battery);
      batteryToHome = Math.max(0, averageValue(first, second, "simulatedBatteryToHome") || 0);
      batteryExport = Math.max(0, averageValue(first, second, "simulatedBatteryExport") || 0);
    } else {
      const netGrid = averageValue(first, second, "grid") || 0;
      importPower = Math.max(0, netGrid);
      exportPower = Math.max(0, -netGrid);
      solar = Math.max(0, averageValue(first, second, "solarLive") || 0);
      const battery = averageValue(first, second, "batteryLive") || 0;
      batteryCharge = Math.max(0, -battery);
      batteryDischarge = Math.max(0, battery);
    }
    addEnergy(totals, "home", house, hours);
    addEnergy(totals, "ev", ev, hours);
    addEnergy(totals, "gridImport", importPower, hours);
    addEnergy(totals, "gridExport", exportPower, hours);
    addEnergy(totals, "solar", solar, hours);
    addEnergy(totals, "batteryCharge", batteryCharge, hours);
    addEnergy(totals, "batteryDischarge", batteryDischarge, hours);
    addEnergy(totals, "batteryToHome", batteryToHome, hours);
    addEnergy(totals, "batteryExport", batteryExport, hours);
    totals.importCost += importPower * rate / 100 * hours;

    const loads = Math.max(0, house - ev) + ev + batteryCharge;
    if (importPower > 0 && loads > 0) {
      const allocated = Math.min(importPower, loads);
      const factor = allocated / loads;
      importBreakdown.home += Math.max(0, house - ev) * factor * hours;
      importBreakdown.ev += ev * factor * hours;
      importBreakdown.battery += batteryCharge * factor * hours;
      importBreakdown.unallocated += Math.max(0, importPower - allocated) * hours;
    } else {
      importBreakdown.unallocated += importPower * hours;
    }
    if (exportPower > 0) {
      if (mode === "simulated" && batteryExport > 0) {
        const batteryShare = Math.min(exportPower, batteryExport);
        exportBreakdown.battery += batteryShare * hours;
        exportBreakdown.solar += Math.max(0, exportPower - batteryShare) * hours;
      } else {
        const sources = solar + batteryDischarge;
        if (sources > 0) {
          exportBreakdown.solar += exportPower * solar / sources * hours;
          exportBreakdown.battery += exportPower * batteryDischarge / sources * hours;
        } else {
          exportBreakdown.unallocated += exportPower * hours;
        }
      }
    }
  }
  for (const key of Object.keys(totals)) totals[key] = round(totals[key], key.includes("Cost") ? 2 : 3);
  for (const key of ["home", "ev", "battery", "unallocated"]) importBreakdown[key] = round(importBreakdown[key], 3);
  for (const key of ["solar", "battery", "unallocated"]) exportBreakdown[key] = round(exportBreakdown[key], 3);
  return { totals, importBreakdown, exportBreakdown };
}

function webSocketUrl() {
  const url = new URL(connection.url);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/api/websocket`.replace(/\/+/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function homeAssistantWebSocket(command) {
  if (typeof WebSocket !== "function") throw new Error("Node.js WebSocket support is unavailable.");
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl());
    const timeout = setTimeout(() => {
      try { socket.close(); } catch {}
      reject(new Error("Home Assistant statistics request timed out."));
    }, 30_000);
    let sent = false;
    const finish = (error, result) => {
      clearTimeout(timeout);
      try { socket.close(); } catch {}
      if (error) reject(error); else resolve(result);
    };
    socket.addEventListener("error", () => finish(new Error("Unable to open the Home Assistant WebSocket API.")));
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.type === "auth_required") {
        socket.send(JSON.stringify({ type: "auth", access_token: connection.token }));
      } else if (message.type === "auth_invalid") {
        finish(new Error("Home Assistant rejected WebSocket authentication."));
      } else if (message.type === "auth_ok" && !sent) {
        sent = true;
        socket.send(JSON.stringify({ id: 1, ...command }));
      } else if (message.type === "result" && message.id === 1) {
        if (!message.success) finish(new Error(message.error?.message || "Home Assistant statistics request failed."));
        else finish(null, message.result || {});
      }
    });
  });
}

const STATISTIC_KEYS = {
  home: "lifetime_house_electricity",
  gridImport: "lifetime_grid_import",
  gridExport: "lifetime_grid_export",
  ev: "lifetime_ev_charging",
  batteryCharge: "lifetime_battery_charge",
  batteryDischarge: "lifetime_battery_discharge",
  solar: "lifetime_solar_generation",
  importCost: "lifetime_import_cost",
  exportIncome: "lifetime_export_income",
  systemValue: "lifetime_system_value",
  avoidedImportValue: "lifetime_avoided_import_value",
  gasUsage: "lifetime_gas_consumption",
  gasCost: "lifetime_gas_cost",
  wholeHomeEnergy: "lifetime_whole_home_energy"
};

function rangeWindow(range) {
  const end = new Date();
  let start;
  let period;
  let label;
  if (range === "week") {
    start = localDayStart(new Date(end.getTime() - 6 * 86_400_000)); period = "day"; label = "Last 7 days";
  } else if (range === "month") {
    start = localDayStart(new Date(end.getTime() - 29 * 86_400_000)); period = "day"; label = "Last 30 days";
  } else if (range === "year") {
    start = localDayStart(new Date(end.getTime() - 364 * 86_400_000)); period = "month"; label = "Last 12 months";
  } else if (range === "all") {
    // Query the complete Home Assistant long-term-statistics era. KEMS observed
    // days describe model evidence, not the age of the home's energy records.
    start = new Date("2000-01-01T00:00:00.000Z");
    period = "month"; label = "All recorded time";
  } else {
    start = localDayStart(end); period = "hour"; label = "Today";
  }
  return { start, end, period, label };
}

function lifetimeTotals() {
  return Object.fromEntries(Object.entries(STATISTIC_KEYS).map(([name, key]) => {
    const value = name.toLowerCase().includes("cost") || name.toLowerCase().includes("income") || name.toLowerCase().includes("value")
      ? currentMoneyForKey(key)
      : currentNumberForKey(key);
    return [name, Number.isFinite(value) ? round(value, 3) : null];
  }));
}

function statisticQueryStart(start, period) {
  const shifted = new Date(start);
  if (period === "month") shifted.setMonth(shifted.getMonth() - 1);
  else if (period === "day") shifted.setDate(shifted.getDate() - 1);
  else shifted.setHours(shifted.getHours() - 1);
  return shifted;
}

function statisticTimestamp(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function statisticCumulativeValue(item) {
  const sum = numeric(item?.sum, null);
  if (Number.isFinite(sum)) return sum;
  const state = numeric(item?.state, null);
  return Number.isFinite(state) ? state : null;
}

const DAILY_COUNTER_KEYS = {
  home: "whole_home_energy_today",
  gridImport: "observed_import_today",
  gridExport: "observed_export_today",
  importCost: "observed_cost_today",
  exportIncome: "observed_export_income_today",
  systemValue: "actual_system_value_today",
  gasUsage: "gas_usage_today",
  gasCost: "gas_cost_today"
};

function valueForHistoryKey(key, item) {
  const value = numeric(item?.state, null);
  if (!Number.isFinite(value)) return null;
  const entity = catalogEntityForKey(key);
  const unit = String(entity?.attributes?.unit_of_measurement || "").toLowerCase();
  if (["p", "pence"].includes(unit)) return value / 100;
  if (unit === "w") return value / 1000;
  if (unit === "mw") return value / 1_000_000;
  return value;
}

async function fetchDailyCounterHistory(start, end) {
  const idToName = new Map();
  const idToKey = new Map();
  for (const [name, key] of Object.entries(DAILY_COUNTER_KEYS)) {
    const entityId = resolvedEntities[key] || entities[key];
    if (entityId) {
      idToName.set(entityId, name);
      idToKey.set(entityId, key);
    }
  }
  const ids = [...idToName.keys()];
  if (!ids.length) return { series: [], warning: "No KEMS daily counter entities were discovered." };
  const buckets = new Map();
  const warnings = [];
  for (let offset = 0; offset < ids.length; offset += 6) {
    const batchIds = ids.slice(offset, offset + 6);
    const url = new URL(`${connection.url}/api/history/period/${encodeURIComponent(start.toISOString())}`);
    url.searchParams.set("end_time", end.toISOString());
    url.searchParams.set("filter_entity_id", batchIds.join(","));
    url.searchParams.set("minimal_response", "");
    url.searchParams.set("no_attributes", "");
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      if (!Array.isArray(raw)) throw new Error("History response was not an array");
      raw.forEach((list, listIndex) => {
        if (!Array.isArray(list) || !list.length) return;
        const entityId = list.find((item) => item?.entity_id)?.entity_id || batchIds[listIndex];
        const name = idToName.get(entityId);
        const key = idToKey.get(entityId);
        if (!name || !key) return;
        for (const item of list) {
          const at = new Date(item.last_changed || item.last_updated || start);
          const date = localDateKey(at);
          const value = valueForHistoryKey(key, item);
          if (!date || !Number.isFinite(value)) continue;
          if (!buckets.has(date)) buckets.set(date, { date, at: new Date(`${date}T12:00:00`).toISOString() });
          const bucket = buckets.get(date);
          bucket[name] = Number.isFinite(bucket[name]) ? Math.max(bucket[name], value) : value;
        }
      });
    } catch (error) {
      warnings.push(error.message);
    }
  }
  const series = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({
    ...row,
    importCost: Number.isFinite(row.importCost) ? row.importCost + (row.exportIncome || 0) : null
  }));
  return {
    series,
    warning: warnings.length ? warnings.join("; ") : null
  };
}

function localLedgerSeries(start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return Object.values(dailyLedger.days || {})
    .filter((day) => {
      const at = new Date(`${day.date}T12:00:00`).getTime();
      return Number.isFinite(at) && at >= startMs && at <= endMs;
    })
    .map((day) => ({ at: new Date(`${day.date}T12:00:00`).toISOString(), date: day.date, ...(day.actual || {}) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeDailySeries(...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const row of group || []) {
      const date = row.date || localDateKey(row.at);
      if (!date) continue;
      const existing = merged.get(date) || { date, at: new Date(`${date}T12:00:00`).toISOString() };
      for (const [key, value] of Object.entries(row)) {
        if (["date", "at"].includes(key) || !Number.isFinite(value)) continue;
        existing[key] = Number.isFinite(existing[key]) ? Math.max(existing[key], value) : value;
      }
      merged.set(date, existing);
    }
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateSeries(rows, period) {
  if (period !== "month") return rows;
  const months = new Map();
  for (const row of rows) {
    const date = row.date || localDateKey(row.at);
    if (!date) continue;
    const month = date.slice(0, 7);
    const existing = months.get(month) || { date: `${month}-01`, at: new Date(`${month}-01T12:00:00`).toISOString() };
    for (const [key, value] of Object.entries(row)) {
      if (["date", "at"].includes(key) || !Number.isFinite(value)) continue;
      existing[key] = (existing[key] || 0) + value;
    }
    months.set(month, existing);
  }
  return [...months.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function totalsFromSeries(series) {
  const totals = Object.fromEntries(Object.keys(STATISTIC_KEYS).map((key) => [key, null]));
  const seen = new Set();
  for (const row of series || []) {
    for (const key of Object.keys(totals)) {
      if (!Number.isFinite(row[key])) continue;
      totals[key] = (totals[key] || 0) + row[key];
      seen.add(key);
    }
  }
  for (const key of Object.keys(totals)) if (!seen.has(key)) totals[key] = null;
  return totals;
}

async function listAvailableStatistics() {
  try {
    const result = await homeAssistantWebSocket({ type: "recorder/list_statistic_ids" });
    return Array.isArray(result) ? result.filter((item) => item?.statistic_id) : [];
  } catch {
    return [];
  }
}

async function listAvailableStatisticIds() {
  const result = await listAvailableStatistics();
  return result.length ? new Set(result.map((item) => item.statistic_id)) : null;
}

async function energyPreferences() {
  try {
    const [prefs, info] = await Promise.all([
      homeAssistantWebSocket({ type: "energy/get_prefs" }),
      homeAssistantWebSocket({ type: "energy/info" }).catch(() => ({ cost_sensors: {} }))
    ]);
    return {
      prefs: prefs && typeof prefs === "object" ? prefs : { energy_sources: [], device_consumption: [] },
      info: info && typeof info === "object" ? info : { cost_sensors: {} },
      warning: null
    };
  } catch (error) {
    return { prefs: { energy_sources: [], device_consumption: [] }, info: { cost_sensors: {} }, warning: error.message };
  }
}

function statisticText(meta) {
  const entity = entityCatalog.find((item) => item.entityId === meta?.statistic_id);
  return `${meta?.statistic_id || ""} ${meta?.name || ""} ${entity?.name || ""}`.toLowerCase();
}

function statisticUnit(meta) {
  return String(meta?.statistics_unit_of_measurement || meta?.display_unit_of_measurement || "").toLowerCase();
}

function scoreStatistic(meta, metric) {
  if (!meta?.statistic_id || meta.has_sum === false) return -Infinity;
  const text = statisticText(meta);
  const unit = statisticUnit(meta);
  const isEnergy = meta.unit_class === "energy" || /(?:^|\b)(kwh|wh|mwh)(?:\b|$)/.test(unit);
  const isMoney = /(?:gbp|£|pence|\bp\b|cost|compensation|income)/.test(`${unit} ${text}`);
  let score = meta.statistic_id.startsWith("sensor.kems_lifetime_") ? -12 : 0;
  const has = (...tokens) => tokens.every((token) => text.includes(token));
  const any = (...tokens) => tokens.some((token) => text.includes(token));
  if (["gridImport", "gridExport", "solar", "batteryCharge", "batteryDischarge", "ev", "gasUsage"].includes(metric) && !isEnergy) return -Infinity;
  if (["importCost", "exportIncome", "gasCost"].includes(metric) && !isMoney) return -Infinity;
  if (metric === "gridImport") {
    if (has("grid", "import")) score += 30;
    if (has("electricity", "consumption")) score += 22;
    if (any("import", "consumption", "gridbuy")) score += 8;
    if (any("export", "return", "solar", "battery", "gas", "ohme", "charger")) score -= 35;
  } else if (metric === "gridExport") {
    if (has("grid", "export")) score += 30;
    if (any("export", "return", "gridsell", "feed_in", "feed in")) score += 18;
    if (any("import", "consumption", "gas")) score -= 30;
  } else if (metric === "solar") {
    if (any("solar", "pv")) score += 24;
    if (any("generation", "production")) score += 10;
    if (any("forecast", "power")) score -= 20;
  } else if (metric === "batteryCharge") {
    if (text.includes("battery")) score += 20;
    if (any("charge", "charged", "energy_to")) score += 14;
    if (any("discharge", "soc")) score -= 25;
  } else if (metric === "batteryDischarge") {
    if (text.includes("battery")) score += 20;
    if (any("discharge", "energy_from")) score += 14;
    if (any("charge", "soc")) score -= 25;
  } else if (metric === "ev") {
    if (any("ohme", "ev", "charger", "vehicle")) score += 28;
    if (any("energy", "consumption", "charged")) score += 8;
    if (any("power", "soc", "battery level")) score -= 20;
  } else if (metric === "gasUsage") {
    if (text.includes("gas")) score += 25;
    if (any("consumption", "energy", "meter")) score += 10;
    if (text.includes("cost")) score -= 30;
  } else if (metric === "importCost") {
    if (any("electricity", "grid", "import")) score += 16;
    if (text.includes("cost")) score += 22;
    if (any("gas", "export", "compensation")) score -= 30;
  } else if (metric === "exportIncome") {
    if (any("export", "compensation", "income", "sell")) score += 22;
    if (any("import", "gas")) score -= 25;
  } else if (metric === "gasCost") {
    if (text.includes("gas")) score += 22;
    if (text.includes("cost")) score += 20;
  }
  return score;
}

function addSource(mapping, metric, statisticId) {
  if (!statisticId) return;
  if (!mapping[metric]) mapping[metric] = [];
  if (!mapping[metric].includes(statisticId)) mapping[metric].push(statisticId);
}

function buildEnergySourceMapping(prefs, info, metadata) {
  const mapping = {};
  for (const source of prefs?.energy_sources || []) {
    if (source?.type === "grid") {
      addSource(mapping, "gridImport", source.stat_energy_from);
      addSource(mapping, "gridExport", source.stat_energy_to);
      addSource(mapping, "importCost", source.stat_cost || info?.cost_sensors?.[source.stat_energy_from]);
      addSource(mapping, "exportIncome", source.stat_compensation || info?.cost_sensors?.[source.stat_energy_to]);
    } else if (source?.type === "solar") {
      addSource(mapping, "solar", source.stat_energy_from);
    } else if (source?.type === "battery") {
      addSource(mapping, "batteryDischarge", source.stat_energy_from);
      addSource(mapping, "batteryCharge", source.stat_energy_to);
    } else if (source?.type === "gas") {
      addSource(mapping, "gasUsage", source.stat_energy_from);
      addSource(mapping, "gasCost", source.stat_cost || info?.cost_sensors?.[source.stat_energy_from]);
    }
  }
  for (const device of prefs?.device_consumption || []) {
    const text = `${device?.name || ""} ${device?.stat_consumption || ""}`.toLowerCase();
    if (/(?:^|[^a-z])(ev|ohme|charger|vehicle)(?:[^a-z]|$)/.test(text)) addSource(mapping, "ev", device.stat_consumption);
  }

  const metrics = ["gridImport", "gridExport", "solar", "batteryCharge", "batteryDischarge", "ev", "gasUsage", "importCost", "exportIncome", "gasCost"];
  for (const metric of metrics) {
    if (mapping[metric]?.length) continue;
    const ranked = metadata
      .map((item) => ({ item, score: scoreStatistic(item, metric) }))
      .filter((entry) => Number.isFinite(entry.score) && entry.score >= 18)
      .sort((a, b) => b.score - a.score);
    if (ranked[0]) addSource(mapping, metric, ranked[0].item.statistic_id);
  }
  return mapping;
}

function convertStatisticChange(value, meta) {
  if (!Number.isFinite(value)) return null;
  const unit = statisticUnit(meta);
  if (unit === "wh") return value / 1000;
  if (unit === "mwh") return value * 1000;
  if (["p", "pence"].includes(unit)) return value / 100;
  return value;
}

function bucketKeyForPeriod(at, period) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  if (period === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return localDateKey(date);
}

async function energyDashboardAnalytics(window) {
  const metadata = await listAvailableStatistics();
  const preferences = await energyPreferences();
  const mapping = buildEnergySourceMapping(preferences.prefs, preferences.info, metadata);
  const idToMetrics = new Map();
  for (const [metric, ids] of Object.entries(mapping)) {
    for (const id of ids || []) {
      if (!idToMetrics.has(id)) idToMetrics.set(id, []);
      idToMetrics.get(id).push(metric);
    }
  }
  const statisticIds = [...idToMetrics.keys()].filter(Boolean);
  if (!statisticIds.length) {
    return { series: [], totals: {}, points: 0, mapping, warning: preferences.warning || "No Home Assistant Energy Dashboard or compatible long-term statistics sources were found." };
  }
  let raw = {};
  try {
    raw = await homeAssistantWebSocket({
      type: "recorder/statistics_during_period",
      start_time: window.start.toISOString(),
      end_time: window.end.toISOString(),
      statistic_ids: statisticIds,
      period: window.period,
      units: { energy: "kWh" },
      types: ["change"]
    });
  } catch (error) {
    return { series: [], totals: {}, points: 0, mapping, warning: `Energy statistics: ${error.message}` };
  }
  const metaById = new Map(metadata.map((item) => [item.statistic_id, item]));
  const buckets = new Map();
  let points = 0;
  for (const [id, rows] of Object.entries(raw || {})) {
    if (!Array.isArray(rows)) continue;
    const metrics = idToMetrics.get(id) || [];
    const meta = metaById.get(id);
    let previous = null;
    for (const row of rows) {
      const atMs = statisticTimestamp(row.start);
      if (!Number.isFinite(atMs)) continue;
      let change = numeric(row.change, null);
      if (!Number.isFinite(change)) {
        const cumulative = statisticCumulativeValue(row);
        if (Number.isFinite(cumulative) && Number.isFinite(previous)) change = cumulative - previous;
        if (Number.isFinite(cumulative)) previous = cumulative;
      }
      change = convertStatisticChange(change, meta);
      if (!Number.isFinite(change)) continue;
      if (change < 0 && !metrics.some((metric) => metric === "systemValue")) continue;
      const key = bucketKeyForPeriod(atMs, window.period);
      if (!key) continue;
      const at = window.period === "month" ? new Date(`${key}-01T12:00:00`).toISOString() : new Date(`${key}T12:00:00`).toISOString();
      if (!buckets.has(key)) buckets.set(key, { date: window.period === "month" ? `${key}-01` : key, at });
      const bucket = buckets.get(key);
      for (const metric of metrics) bucket[metric] = (bucket[metric] || 0) + change;
      points += 1;
    }
  }
  const series = [...buckets.values()].sort((a, b) => new Date(a.at) - new Date(b.at)).map((row) => {
    const homeParts = [row.gridImport, row.solar, row.batteryDischarge, row.gridExport, row.batteryCharge];
    if (homeParts.some(Number.isFinite)) {
      row.home = Math.max(0, (row.gridImport || 0) + (row.solar || 0) + (row.batteryDischarge || 0) - (row.gridExport || 0) - (row.batteryCharge || 0));
    }
    for (const [key, value] of Object.entries(row)) if (Number.isFinite(value)) row[key] = round(value, key.toLowerCase().includes("cost") || key.toLowerCase().includes("income") ? 2 : 3);
    return row;
  });
  const totals = totalsFromSeries(series);
  return {
    series,
    totals,
    points,
    mapping,
    warning: preferences.warning,
    source: (preferences.prefs?.energy_sources || []).length ? "Home Assistant Energy Dashboard statistics" : "Automatically discovered Home Assistant statistics"
  };
}

function mergePeriodSeries(primary, secondary, period) {
  const rows = new Map();
  for (const group of [secondary || [], primary || []]) {
    for (const row of group) {
      const key = bucketKeyForPeriod(row.at || row.date, period);
      if (!key) continue;
      const existing = rows.get(key) || { date: period === "month" ? `${key}-01` : key, at: row.at || new Date(`${period === "month" ? `${key}-01` : key}T12:00:00`).toISOString() };
      for (const [name, value] of Object.entries(row)) if (!["date", "at"].includes(name) && Number.isFinite(value)) existing[name] = value;
      rows.set(key, existing);
    }
  }
  return [...rows.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
}

async function statisticAnalytics(range) {
  const window = rangeWindow(range);
  const energyDashboard = await energyDashboardAnalytics(window);
  const idToName = new Map();
  const nameToKey = new Map();
  for (const [name, key] of Object.entries(STATISTIC_KEYS)) {
    const entityId = resolvedEntities[key] || entities[key];
    if (entityId) {
      idToName.set(entityId, name);
      nameToKey.set(name, key);
    }
  }

  const knownIds = await listAvailableStatisticIds();
  const statisticIds = [...idToName.keys()].filter((id) => !knownIds || knownIds.has(id));
  let raw = {};
  const warnings = [];
  if (knownIds && !statisticIds.length) warnings.push("Home Assistant has not created long-term statistics for the KEMS lifetime sensors yet.");
  if (statisticIds.length) {
    try {
      raw = await homeAssistantWebSocket({
        type: "recorder/statistics_during_period",
        start_time: statisticQueryStart(window.start, window.period).toISOString(),
        end_time: window.end.toISOString(),
        statistic_ids: statisticIds,
        period: window.period,
        units: { energy: "kWh" },
        types: ["change", "sum", "state"]
      });
    } catch (error) {
      warnings.push(error.message);
    }
  }

  const buckets = new Map();
  const sums = Object.fromEntries(Object.keys(STATISTIC_KEYS).map((key) => [key, 0]));
  const seen = new Set();
  let statisticPoints = 0;
  const windowStartMs = window.start.getTime();

  for (const [entityId, list] of Object.entries(raw || {})) {
    const name = idToName.get(entityId);
    if (!name || !Array.isArray(list)) continue;
    const key = nameToKey.get(name);
    const entity = key ? catalogEntityForKey(key) : null;
    const moneyInPence = ["p", "pence"].includes(String(entity?.attributes?.unit_of_measurement || "").toLowerCase());
    const ordered = [...list].sort((first, second) => (statisticTimestamp(first.start) || 0) - (statisticTimestamp(second.start) || 0));
    let previousCumulative = null;
    for (const item of ordered) {
      const atMs = statisticTimestamp(item.start);
      if (!Number.isFinite(atMs)) continue;
      const cumulativeRaw = statisticCumulativeValue(item);
      const cumulative = moneyInPence && Number.isFinite(cumulativeRaw) ? cumulativeRaw / 100 : cumulativeRaw;
      const suppliedChangeRaw = numeric(item.change, null);
      const suppliedChange = moneyInPence && Number.isFinite(suppliedChangeRaw) ? suppliedChangeRaw / 100 : suppliedChangeRaw;
      if (atMs < windowStartMs) {
        if (Number.isFinite(cumulative)) previousCumulative = cumulative;
        continue;
      }
      let change = Number.isFinite(suppliedChange) ? suppliedChange : null;
      if (!Number.isFinite(change) && Number.isFinite(cumulative) && Number.isFinite(previousCumulative)) {
        change = cumulative - previousCumulative;
        if (change < 0 && name !== "systemValue" && cumulative >= 0) change = cumulative;
      }
      if (Number.isFinite(cumulative)) previousCumulative = cumulative;
      if (!Number.isFinite(change)) continue;
      statisticPoints += 1;
      const at = new Date(atMs).toISOString();
      if (!buckets.has(at)) buckets.set(at, { at });
      buckets.get(at)[name] = round(change, 3);
      sums[name] += change;
      seen.add(name);
    }
  }

  let series = [...buckets.values()]
    .filter((bucket) => Object.keys(bucket).some((key) => key !== "at" && Number.isFinite(bucket[key])))
    .sort((first, second) => new Date(first.at) - new Date(second.at));
  let totals = Object.fromEntries(Object.keys(STATISTIC_KEYS).map((key) => [key, seen.has(key) ? round(sums[key], 3) : null]));
  let source = statisticPoints ? "KEMS lifetime statistics" : null;

  if (energyDashboard.series.length) {
    series = mergePeriodSeries(energyDashboard.series, series, window.period);
    for (const [key, value] of Object.entries(energyDashboard.totals || {})) {
      if (Number.isFinite(value)) totals[key] = round(value, 3);
    }
    source = statisticPoints
      ? `${energyDashboard.source} plus KEMS lifetime evidence`
      : energyDashboard.source;
  }

  const maxFallbackDays = range === "week" ? 8 : range === "month" ? 35 : 45;
  const fallbackStart = new Date(Math.max(window.start.getTime(), window.end.getTime() - maxFallbackDays * 86_400_000));
  let recorderFallback = { series: [], warning: null };
  try {
    recorderFallback = await fetchDailyCounterHistory(fallbackStart, window.end);
  } catch (error) {
    recorderFallback = { series: [], warning: error.message };
  }
  const localRows = localLedgerSeries(window.start, window.end);
  const fallbackDaily = mergeDailySeries(recorderFallback.series, localRows);
  const fallbackSeries = aggregateSeries(fallbackDaily, window.period);
  const fallbackTotals = totalsFromSeries(fallbackDaily);

  if (!series.length && fallbackSeries.length) {
    series = fallbackSeries;
    source = recorderFallback.series.length && localRows.length
      ? "Home Assistant recorder daily counters plus website ledger"
      : recorderFallback.series.length ? "Home Assistant recorder daily counters" : "Website local daily ledger";
  }
  for (const key of Object.keys(totals)) {
    if (!Number.isFinite(totals[key]) && Number.isFinite(fallbackTotals[key])) totals[key] = round(fallbackTotals[key], 3);
  }

  const lifetime = lifetimeTotals();
  if (range === "all") {
    for (const [key, value] of Object.entries(lifetime)) {
      if (!Number.isFinite(value)) continue;
      totals[key] = Number.isFinite(totals[key]) ? Math.max(totals[key], value) : value;
    }
  }
  if (!series.length) {
    const lifetimeRow = { at: window.end.toISOString() };
    for (const [key, value] of Object.entries(range === "all" ? lifetime : totals)) if (Number.isFinite(value)) lifetimeRow[key] = value;
    if (Object.keys(lifetimeRow).length > 1) {
      series = [lifetimeRow];
      source = range === "all" ? "KEMS lifetime totals" : "Available KEMS period totals";
    }
  }

  if (energyDashboard.warning) warnings.push(energyDashboard.warning);
  if (recorderFallback.warning) warnings.push(`Recorder fallback: ${recorderFallback.warning}`);
  if (!statisticPoints && fallbackSeries.length) warnings.push("Long-term statistics were unavailable, so the website used real KEMS daily counter history instead.");
  if (!statisticPoints && !fallbackSeries.length && series.length === 1) warnings.push("Only aggregate KEMS totals are currently available; the chart cannot reconstruct earlier bucket detail.");
  if (!series.length) warnings.push("No retained historical values were returned by Home Assistant or the local website ledger.");

  historyDiagnostics.energyDashboard = {
    source: energyDashboard.source || "unavailable",
    points: energyDashboard.points || 0,
    mapping: energyDashboard.mapping || {},
    warning: energyDashboard.warning || null
  };
  historyDiagnostics.statistics = {
    source: statisticPoints ? "long-term-statistics" : "unavailable",
    points: statisticPoints,
    requestedIds: idToName.size,
    availableIds: statisticIds.length,
    warning: warnings.join(" ") || null
  };
  historyDiagnostics.fallback = {
    source: source || "unavailable",
    points: fallbackSeries.length,
    recorderDays: recorderFallback.series.length,
    localDays: localRows.length,
    warning: recorderFallback.warning || null
  };

  return {
    window,
    totals,
    series,
    statisticPoints: energyDashboard.points || statisticPoints || fallbackSeries.length,
    warning: warnings.join(" ") || null,
    source: source || "Unavailable"
  };
}


function nativePeriodSummary(range) {
  const keyMap = {
    day: "today_summary",
    week: "week_summary",
    month: "month_summary",
    year: "year_summary",
    all: "all_time_summary"
  };
  const key = keyMap[range];
  const item = key ? catalogEntityForKey(key) : null;
  if (!item?.available || !item.attributes || typeof item.attributes !== "object") return null;
  const a = item.attributes;
  const number = (name) => {
    const value = Number.parseFloat(a[name]);
    return Number.isFinite(value) ? value : null;
  };
  const pounds = (name) => {
    const value = number(name);
    return Number.isFinite(value) ? value / 100 : null;
  };
  const actual = {
    home: number("house_consumption_kwh"),
    ev: number("ev_energy_kwh"),
    gridImport: number("grid_import_kwh"),
    gridExport: number("grid_export_kwh"),
    solar: number("solar_generation_kwh"),
    batteryCharge: number("battery_charge_kwh"),
    batteryDischarge: number("battery_discharge_kwh"),
    gasUsage: number("gas_consumption_kwh"),
    importCost: pounds("import_cost_pence"),
    exportIncome: pounds("export_income_pence"),
    gasCost: pounds("gas_cost_pence"),
    systemValue: pounds("actual_system_value_pence"),
    avoidedImportValue: pounds("actual_avoided_import_value_pence"),
    netCost: null
  };
  actual.netCost = Number.isFinite(actual.importCost) ? actual.importCost - (actual.exportIncome || 0) : null;
  actual.wholeHomeCost = Number.isFinite(pounds("actual_net_cost_pence")) ? pounds("actual_net_cost_pence") : (
    Number.isFinite(actual.netCost) ? actual.netCost + (actual.gasCost || 0) : null
  );
  const simulated = {
    home: number("house_consumption_kwh"),
    ev: number("ev_energy_kwh"),
    gridImport: number("simulated_grid_import_kwh"),
    gridExport: number("simulated_grid_export_kwh"),
    solar: number("simulated_solar_generation_kwh"),
    batteryCharge: number("simulated_battery_charge_kwh"),
    batteryToHome: number("simulated_battery_to_home_kwh"),
    batteryDischarge: number("simulated_battery_to_home_kwh"),
    batteryExport: number("simulated_battery_export_kwh"),
    avoidedDayRateImport: number("simulated_avoided_day_rate_import_kwh"),
    importCost: pounds("simulated_import_cost_pence"),
    exportIncome: pounds("simulated_export_income_pence"),
    netCost: pounds("simulated_net_cost_pence"),
    avoidedImportValue: pounds("simulated_avoided_import_value_pence"),
    systemValue: pounds("simulated_system_value_pence"),
    gasUsage: number("gas_consumption_kwh"),
    gasCost: pounds("gas_cost_pence")
  };
  simulated.wholeHomeCost = Number.isFinite(simulated.netCost) ? simulated.netCost + (simulated.gasCost || 0) : null;
  simulated.saving = Number.isFinite(actual.netCost) && Number.isFinite(simulated.netCost) ? actual.netCost - simulated.netCost : null;
  simulated.wholeHomeSaving = Number.isFinite(actual.wholeHomeCost) && Number.isFinite(simulated.wholeHomeCost) ? actual.wholeHomeCost - simulated.wholeHomeCost : null;
  return {
    range,
    source: "KEMS 0.7.0-alpha5 native period ledger",
    startDate: a.start_date || null,
    endDate: a.end_date || null,
    daysIncluded: number("days_included"),
    completeDays: number("complete_days"),
    incompleteDays: number("incomplete_days"),
    dataComplete: Boolean(a.data_complete),
    actual,
    simulated
  };
}

function economicsSnapshot() {
  const investment = currentMoneyForKey("system_investment");
  const operatingCosts = currentMoneyForKey("system_operating_costs") || 0;
  const systemCost = Number.isFinite(investment) ? investment + operatingCosts : null;
  const actualValue = currentMoneyForKey("actual_system_value_total") ?? currentMoneyForKey("lifetime_system_value");
  const simulatedValue = currentMoneyForKey("lifetime_simulated_system_value");
  const configuredOperatingDays = currentNumberForKey("system_operating_days");
  const observedDays = currentNumberForKey("lifetime_observed_days");
  const operatingDays = Number.isFinite(configuredOperatingDays) && configuredOperatingDays > 0 ? configuredOperatingDays : observedDays;
  const predictedAnnualSaving = currentMoneyForKey("predicted_annual_saving");
  const proposalAnnualSavingBenchmark = currentMoneyForKey("proposal_annual_saving_benchmark");
  const actualAnnualisedValue = Number.isFinite(actualValue) && Number.isFinite(operatingDays) && operatingDays > 0
    ? actualValue / operatingDays * 365 : null;
  const simulatorEvidenceAnnualValue = Number.isFinite(simulatedValue) && Number.isFinite(operatingDays) && operatingDays > 0
    ? simulatedValue / operatingDays * 365 : null;
  const actualRoiEntity = currentNumberForKey("actual_roi");
  const actualRoi = Number.isFinite(actualRoiEntity) ? actualRoiEntity
    : Number.isFinite(actualValue) && Number.isFinite(systemCost) && systemCost > 0 ? actualValue / systemCost * 100 : null;
  return {
    investment: Number.isFinite(investment) ? round(investment, 2) : null,
    operatingCosts: round(operatingCosts, 2),
    systemCost: Number.isFinite(systemCost) ? round(systemCost, 2) : null,
    actualValue: Number.isFinite(actualValue) ? round(actualValue, 2) : null,
    simulatedValue: Number.isFinite(simulatedValue) ? round(simulatedValue, 2) : null,
    operatingDays: Number.isFinite(operatingDays) ? round(operatingDays, 0) : null,
    actualAnnualisedValue: Number.isFinite(actualAnnualisedValue) ? round(actualAnnualisedValue, 2) : null,
    actualRoi: Number.isFinite(actualRoi) ? round(actualRoi, 2) : null,
    actualPaybackYears: Number.isFinite(systemCost) && Number.isFinite(actualAnnualisedValue) && actualAnnualisedValue > 0 ? round(systemCost / actualAnnualisedValue, 1) : null,
    actualPaybackDate: catalogEntityForKey("actual_payback_date")?.available ? catalogEntityForKey("actual_payback_date").state : null,
    actualPaybackRemaining: currentMoneyForKey("actual_payback_remaining") ?? (Number.isFinite(systemCost) && Number.isFinite(actualValue) ? Math.max(0, systemCost - actualValue) : null),
    predictedAnnualSaving: Number.isFinite(predictedAnnualSaving) ? round(predictedAnnualSaving, 2) : null,
    proposalAnnualSavingBenchmark: Number.isFinite(proposalAnnualSavingBenchmark) ? round(proposalAnnualSavingBenchmark, 2) : null,
    simulatorEvidenceAnnualValue: Number.isFinite(simulatorEvidenceAnnualValue) ? round(simulatorEvidenceAnnualValue, 2) : null,
    simulatorEvidenceAnnualRoi: Number.isFinite(simulatorEvidenceAnnualValue) && Number.isFinite(systemCost) && systemCost > 0 ? round(simulatorEvidenceAnnualValue / systemCost * 100, 2) : null,
    simulatorEvidencePaybackYears: Number.isFinite(simulatorEvidenceAnnualValue) && Number.isFinite(systemCost) && simulatorEvidenceAnnualValue > 0 ? round(systemCost / simulatorEvidenceAnnualValue, 1) : null,
    simulatorAnnualRoi: Number.isFinite(predictedAnnualSaving) && Number.isFinite(systemCost) && systemCost > 0 ? round(predictedAnnualSaving / systemCost * 100, 2) : null,
    predictedPaybackYears: currentNumberForKey("predicted_payback"),
    predictedPaybackDate: catalogEntityForKey("predicted_payback_date")?.available ? catalogEntityForKey("predicted_payback_date").state : null,
    predictedNetValue: currentMoneyForKey("predicted_net_value"),
    roiConfidence: currentNumberForKey("roi_confidence"),
    roiStatus: catalogEntityForKey("roi_status")?.available ? catalogEntityForKey("roi_status").state : null,
    profitAfterPayback: currentMoneyForKey("profit_after_payback")
  };
}

function reconcileBreakdown(breakdown, total, keys) {
  const copy = { ...breakdown };
  const target = Math.max(0, total || 0);
  const sum = keys.reduce((value, key) => value + Math.max(0, copy[key] || 0), 0);
  if (sum < target) copy.unallocated = round(Math.max(0, (copy.unallocated || 0) + target - sum), 3);
  else if (sum > target && sum > 0) {
    const factor = target / sum;
    for (const key of keys) copy[key] = round(Math.max(0, copy[key] || 0) * factor, 3);
  }
  return copy;
}

function buildBreakdowns(totals, directBatteryExport = null) {
  return {
    gridImport: Number.isFinite(totals.gridImport)
      ? allocateImport(totals.gridImport, totals.home, totals.ev, totals.batteryCharge)
      : { home: null, ev: null, battery: null, unallocated: null },
    gridExport: Number.isFinite(totals.gridExport)
      ? allocateExport(totals.gridExport, totals.solar, totals.batteryDischarge, directBatteryExport)
      : { solar: null, battery: null, unallocated: null }
  };
}

async function analyticsFor(range = "day") {
  const validRange = ["day", "week", "month", "year", "all"].includes(range) ? range : "day";
  if (!isConfigured()) return { range: validRange, available: false, error: "Connect Home Assistant first." };
  const cacheKey = `analytics:${validRange}`;
  const cached = analyticsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;

  const economics = economicsSnapshot();
  let payload;
  if (validRange === "day") {
    const [history, policyEvents] = await Promise.all([historyForToday(), policyEventsForToday()]);
    const live = integrateEnergyWindow(history, "live");
    const simulated = integrateEnergyWindow(history, "simulated");
    const actualTotals = {
      ...live.totals,
      home: currentNumberForKey("whole_home_energy_today") ?? live.totals.home,
      gridImport: current.observed?.gridImportToday ?? live.totals.gridImport,
      gridExport: current.observed?.gridExportToday ?? live.totals.gridExport,
      netCost: current.observed?.costToday ?? live.totals.importCost,
      exportIncome: current.observed?.exportIncomeToday ?? 0,
      gasUsage: currentNumberForKey("gas_usage_today"),
      gasCost: currentMoneyForKey("gas_cost_today"),
      wholeHomeCost: current.observed?.wholeHomeCostToday
    };
    actualTotals.importCost = Number.isFinite(actualTotals.netCost) ? actualTotals.netCost + (actualTotals.exportIncome || 0) : live.totals.importCost;
    const actualBreakdowns = {
      gridImport: reconcileBreakdown(live.importBreakdown, actualTotals.gridImport, ["home", "ev", "battery", "unallocated"]),
      gridExport: reconcileBreakdown(live.exportBreakdown, actualTotals.gridExport, ["solar", "battery", "unallocated"])
    };
    const simulatedTotals = {
      ...simulated.totals,
      home: currentNumberForKey("whole_home_energy_today") ?? simulated.totals.home,
      gridImport: current.simulation?.gridImportToday ?? simulated.totals.gridImport,
      gridExport: current.simulation?.gridExportToday ?? simulated.totals.gridExport,
      solar: current.simulation?.solarToday ?? simulated.totals.solar,
      batteryCharge: currentNumberForKey("simulated_battery_charged_today") ?? simulated.totals.batteryCharge,
      batteryToHome: currentNumberForKey("simulated_battery_to_home_today") ?? simulated.totals.batteryToHome,
      batteryExport: current.simulation?.batteryExportToday ?? simulated.totals.batteryExport,
      netCost: current.simulation?.costToday,
      saving: current.simulation?.savingToday,
      exportIncome: current.simulation?.exportIncomeToday ?? 0,
      wholeHomeCost: current.simulation?.wholeHomeCostToday,
      wholeHomeSaving: current.simulation?.wholeHomeSavingToday,
      gasUsage: currentNumberForKey("gas_usage_today"),
      gasCost: currentMoneyForKey("gas_cost_today"),
      solarCurtailed: currentNumberForKey("simulated_solar_curtailed_today")
    };
    simulatedTotals.importCost = Number.isFinite(simulatedTotals.netCost) ? simulatedTotals.netCost + (simulatedTotals.exportIncome || 0) : simulated.totals.importCost;
    const native = nativePeriodSummary("day");
    if (native) {
      for (const [key, value] of Object.entries(native.actual)) if (Number.isFinite(value)) actualTotals[key] = round(value, 3);
      for (const [key, value] of Object.entries(native.simulated)) if (Number.isFinite(value)) simulatedTotals[key] = round(value, 3);
    }
    const simulatedBreakdowns = buildBreakdowns(simulatedTotals, simulatedTotals.batteryExport);
    payload = {
      range: validRange,
      label: "Today",
      available: true,
      source: native ? `${native.source} plus recorder power history` : "KEMS current-day entities plus recorder power history",
      coverage: history.length,
      history,
      policyEvents,
      nativePeriod: native,
      actual: { totals: actualTotals, breakdowns: buildBreakdowns(actualTotals) },
      simulated: { totals: simulatedTotals, breakdowns: simulatedBreakdowns },
      economics
    };
  } else {
    const statistics = await statisticAnalytics(validRange);
    const native = nativePeriodSummary(validRange);
    const totals = {
      ...statistics.totals,
      netCost: Number.isFinite(statistics.totals.importCost) ? statistics.totals.importCost - (statistics.totals.exportIncome || 0) : null
    };
    if (native) {
      for (const [key, value] of Object.entries(native.actual)) if (Number.isFinite(value)) totals[key] = round(value, 3);
    }
    let series = filterSeriesToNativePeriod(statistics.series || [], native);
    if (!series.length && native) {
      series = [{
        at: new Date().toISOString(),
        date: native.endDate || new Date().toISOString().slice(0, 10),
        ...native.actual
      }];
    }
    const source = native
      ? (statistics.series?.length ? `${native.source}; chart: ${statistics.source}` : native.source)
      : statistics.source;
    payload = {
      range: validRange,
      label: native ? `${native.startDate || ""}${native.startDate ? " → " : ""}${native.endDate || statistics.window.label}` : statistics.window.label,
      available: true,
      source,
      coverage: statistics.statisticPoints || native?.daysIncluded || 0,
      warning: statistics.warning,
      series,
      nativePeriod: native,
      actual: { totals, breakdowns: buildBreakdowns(totals) },
      simulated: {
        totals: native?.simulated || {
          systemValue: currentMoneyForKey("lifetime_simulated_system_value"),
          predictedAnnualSaving: economics.predictedAnnualSaving,
          predictedPaybackYears: economics.predictedPaybackYears
        },
        breakdowns: native ? buildBreakdowns(native.simulated, native.simulated.batteryExport) : {}
      },
      economics
    };
  }
  analyticsCache.set(cacheKey, { at: Date.now(), value: payload });
  return payload;
}


async function poll() {
  try {
    current = isConfigured() ? await fetchHomeAssistantSnapshot() : buildUnconfiguredSnapshot(new Date());
  } catch (error) {
    current = {
      ...current,
      connected: false,
      stale: true,
      updatedAt: new Date().toISOString(),
      error: error.message,
      health: { ...current.health, homeAssistant: "offline" }
    };
  }

  const point = snapshotHistoryPoint(current);
  runtimeHistory.push(point);
  if (runtimeHistory.length > maxRuntimePoints) runtimeHistory.splice(0, runtimeHistory.length - maxRuntimePoints);
  persistPowerPoint(point);
  updateLocalLedger(current);
  broadcast(current);
}

function broadcast(payload) {
  const message = `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) client.write(message);
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function readBody(request, limit = 1_000_000) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > limit) throw new Error("Request body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

function validateEntityMapping(mapping) {
  const result = {};
  for (const key of Object.keys(defaultEntities)) {
    const value = mapping[key];
    if (typeof value === "string" && /^[a-z_]+\.[a-z0-9_]+$/i.test(value)) result[key] = value;
  }
  return result;
}

function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return sendJson(response, 403, { error: "Forbidden" });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(publicDir, "index.html");
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json"
  };
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self' http://homeassistant.local:* https://homeassistant.local:*"
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true, source: current.source, connected: current.connected, updatedAt: current.updatedAt, version: project.version });
  }

  if (url.pathname === "/api/setup/status" && request.method === "GET") {
    return sendJson(response, 200, safeConnectionSummary());
  }

  if (url.pathname === "/api/setup/test" && request.method === "POST") {
    if (!sameOriginWrite(request)) return sendJson(response, 403, { error: "Cross-origin setup requests are not allowed." });
    try {
      const body = await readBody(request);
      return sendJson(response, 200, await testHomeAssistantConnection(body));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/setup/connection" && request.method === "PUT") {
    if (!ALLOW_CONFIG_WRITE) return sendJson(response, 409, { error: "This connection is managed by environment variables." });
    if (!sameOriginWrite(request)) return sendJson(response, 403, { error: "Cross-origin setup requests are not allowed." });
    try {
      const body = await readBody(request);
      const candidate = normaliseConnection(body);
      const test = await testHomeAssistantConnection(candidate);
      connection = { ...candidate, source: body.remember === false ? "session" : "stored" };
      if (body.remember === false) deleteStoredConnection();
      else saveStoredConnection(connection);
      clearRuntimeData();
      current = buildConnectingSnapshot(new Date());
      await poll();
      return sendJson(response, 200, { ...safeConnectionSummary(), test });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/setup/connection" && request.method === "DELETE") {
    if (!ALLOW_CONFIG_WRITE) return sendJson(response, 409, { error: "This connection is managed by environment variables." });
    if (!sameOriginWrite(request)) return sendJson(response, 403, { error: "Cross-origin setup requests are not allowed." });
    connection = null;
    deleteStoredConnection();
    clearRuntimeData();
    current = buildUnconfiguredSnapshot(new Date());
    broadcast(current);
    return sendJson(response, 200, safeConnectionSummary());
  }

  if (url.pathname === "/api/system/status" && request.method === "GET") {
    if (!directLanManagementRequest(request)) return sendJson(response, 403, { error: "Pi management is available only over a direct local-network KEMS address." });
    try {
      return sendJson(response, 200, await managerRequest(`/status${url.searchParams.get("refresh") === "1" ? "?refresh=1" : ""}`));
    } catch (error) {
      return sendJson(response, 200, { available: false, error: error.message, installedVersion: project.version });
    }
  }

  if (url.pathname === "/api/system/logs" && request.method === "GET") {
    if (!directLanManagementRequest(request)) return sendJson(response, 403, { error: "Pi management logs are available only on the local network." });
    try { return sendJson(response, 200, await managerRequest("/logs")); }
    catch (error) { return sendJson(response, 503, { error: error.message }); }
  }

  if (url.pathname === "/api/system/action" && request.method === "POST") {
    if (!directLanManagementRequest(request)) return sendJson(response, 403, { error: "Pi maintenance actions are available only over a direct local-network KEMS address." });
    try {
      const body = await readBody(request);
      const action = String(body.action || "");
      if (!["update", "rollback", "restart", "reboot"].includes(action)) return sendJson(response, 400, { error: "Unsupported maintenance action." });
      const result = await managerRequest("/action", { method: "POST", body: JSON.stringify({ action }), timeout: 5000 });
      return sendJson(response, 202, result);
    } catch (error) {
      return sendJson(response, 503, { error: error.message });
    }
  }

  if (url.pathname === "/api/system/backup" && request.method === "POST") {
    if (!directLanManagementRequest(request)) return sendJson(response, 403, { error: "Backups can be created only over a direct local-network KEMS address." });
    try {
      const body = await readBody(request);
      const backup = createEncryptedBackup(body.password);
      const date = localDateKey() || "backup";
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename=\"KEMS-Web-backup-${date}.kemsbackup\"`,
        "Content-Length": String(backup.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(backup);
      return;
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/system/restore" && request.method === "POST") {
    if (!directLanManagementRequest(request)) return sendJson(response, 403, { error: "Backups can be restored only over a direct local-network KEMS address." });
    try {
      const password = decodeURIComponent(String(request.headers["x-kems-backup-password"] || ""));
      const backup = await readRawBody(request);
      const restored = restoreEncryptedBackup(backup, password);
      return sendJson(response, 200, { ok: true, ...restored, restartRequired: true });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (url.pathname === "/api/config") {
    return sendJson(response, 200, {
      project,
      dataMode: isConfigured() ? "home-assistant" : "unconfigured",
      pollIntervalMs: POLL_INTERVAL_MS,
      controlsEnabled: false,
      configurationWritable: ALLOW_CONFIG_WRITE,
      homeAssistantUrl: connection?.url || "",
      mappedEntityCount: Object.keys(entities).length,
      discoveredKemsEntityCount: kemsEntityCatalog.length,
      timeZone: TIME_ZONE
    });
  }

  if (url.pathname === "/api/live") return sendJson(response, 200, current);

  if (url.pathname === "/api/history") {
    if (url.searchParams.get("range") === "today") return sendJson(response, 200, await historyForToday());
    const requestedHours = clamp(integer(url.searchParams.get("hours"), 24), 1, 168);
    return sendJson(response, 200, await historyFor(requestedHours));
  }

  if (url.pathname === "/api/history-diagnostics") {
    return sendJson(response, 200, {
      version: project.version,
      connected: current.connected,
      currentDay: historyDiagnostics.currentDay,
      statistics: historyDiagnostics.statistics,
      energyDashboard: historyDiagnostics.energyDashboard,
      fallback: historyDiagnostics.fallback,
      localLedgerDays: Object.keys(dailyLedger.days || {}).length,
      localPowerPoints: persistedPowerHistory.length,
      recorderEntities: {
        house: resolvedEntities.house_power || entities.house_power,
        gridImport: resolvedEntities.grid_import_power || entities.grid_import_power,
        gridExport: resolvedEntities.grid_export_power || entities.grid_export_power,
        observedImportToday: resolvedEntities.observed_import_today || entities.observed_import_today,
        observedExportToday: resolvedEntities.observed_export_today || entities.observed_export_today
      }
    });
  }

  if (url.pathname === "/api/analytics") {
    const range = String(url.searchParams.get("range") || "day").toLowerCase();
    return sendJson(response, 200, await analyticsFor(range));
  }

  if (url.pathname === "/api/entity-map" && request.method === "GET") {
    return sendJson(response, 200, { mapping: entities, defaults: defaultEntities, writable: ALLOW_CONFIG_WRITE });
  }

  if (url.pathname === "/api/entity-catalog" && request.method === "GET") {
    return sendJson(response, 200, { entities: kemsEntityCatalog, available: isConfigured() && kemsEntityCatalog.length > 0, source: "auto-discovered-kems" });
  }

  if (url.pathname === "/api/entity-map" && request.method === "PUT") {
    return sendJson(response, 405, { error: "KEMS entity discovery is automatic and read-only." });
  }

  if (url.pathname === "/api/stream") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.write(`event: snapshot\ndata: ${JSON.stringify(current)}\n\n`);
    sseClients.add(response);
    request.on("close", () => sseClients.delete(response));
    return;
  }

  return serveStatic(request, response, url.pathname);
});

await poll();
pollTimer = setInterval(poll, POLL_INTERVAL_MS);
server.listen(PORT, HOST, () => {
  console.log(`KEMS website running at http://${HOST}:${PORT}`);
  console.log(`Data mode: ${isConfigured() ? "Home Assistant" : "Setup required"}`);
  console.log("KEMS entity discovery: automatic and read-only");
});

function shutdown() {
  clearInterval(pollTimer);
  for (const client of sseClients) client.end();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
