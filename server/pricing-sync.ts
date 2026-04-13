// Live pricing sync from Google Sheets
// Reads the Sales Pricing spreadsheet and parses into equipment categories
// Refreshes every 15 minutes, falls back to last known data if fetch fails

import https from "https";

const SHEET_ID = "1_RR_SLe8miBRNeHA81ZSjhhGg7JKs7Nl9cezX7tFjFs";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=Sheet1`;

export interface EquipmentItem {
  name: string;
  size: string;
  price: number;
  rentalPrice?: number;
  rentalInstallPrice?: number;
  brochureUrl?: string;
  people?: string;
  phRange?: string;
}

export interface PricingData {
  conditionersSingle: EquipmentItem[];
  conditionersTwin: EquipmentItem[];
  acidNeutralizers: EquipmentItem[];
  ironOdorBreakers: EquipmentItem[];
  carbonFiltration: EquipmentItem[];
  roSystems: EquipmentItem[];
  bladderTanks: EquipmentItem[];
  uvLights: EquipmentItem[];
  waterHeaters: EquipmentItem[];
  chemicalInjection: EquipmentItem;
  leakValve: EquipmentItem;
  ruscoFilter: EquipmentItem;
  ozonePurifier: EquipmentItem;
  pressureBooster: EquipmentItem;
  lastUpdated: string;
}

let cachedPricing: PricingData | null = null;

const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const get = (u: string, depth = 0) => {
      if (depth > 5) return reject(new Error("Too many redirects"));
      https.get(u, { headers: { "User-Agent": "AClear-Proposals/1.0" } }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          return get(res.headers.location, depth + 1);
        }
        let data = "";
        res.on("data", (chunk: string) => data += chunk);
        res.on("end", () => {
          if (data.includes("<!DOCTYPE html>") || data.includes("accounts.google.com")) {
            reject(new Error("Sheet not publicly shared — got HTML login page instead of CSV"));
          } else {
            resolve(data);
          }
        });
      }).on("error", reject);
    };
    get(url);
  });
}

function parseCsv(raw: string): any[] {
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  // Parse header
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    const obj: any = {};
    headers.forEach((h, i) => obj[h] = vals[i] || "");
    return obj;
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parsePrice(val: any): number {
  if (typeof val === "number") return val;
  const str = String(val || "").replace(/[,$]/g, "").trim();
  return parseInt(str) || 0;
}

function extractSize(name: string): string {
  // Extract size like "1.0", "2.5", "0.75", "WR120", "25 GPD", etc.
  if (name.includes("WR ")) return name.match(/WR \d+/)?.[0]?.replace(" ", "") || "";
  if (name.includes("GPD") || name.includes("Gallons Per Day")) {
    const m = name.match(/(\d+)\s*(GPD|Gallons Per Day)/);
    return m ? `${m[1]} GPD` : "";
  }
  if (name.includes("GPM") || name.includes("Gallons Per Minute")) {
    const m = name.match(/(\d+)\s*(GPM|Gallons Per Minute)/);
    return m ? `${m[1]} GPM` : "";
  }
  if (name.includes("Gallon")) {
    const m = name.match(/(\d+)\s*Gallon/);
    return m ? `${m[1]}G` : "";
  }
  // Size from grain capacity like "24,000" or from model number like "1.0"
  const grainMatch = name.match(/(\d+\.\d+|\d+\/\d+|\.\d+)\s/);
  return grainMatch ? grainMatch[1] : "";
}

export function parseSheetsData(rows: any[]): PricingData {
  const condSingle: EquipmentItem[] = [];
  const condTwin: EquipmentItem[] = [];
  const acidNeut: EquipmentItem[] = [];
  const ironOdor: EquipmentItem[] = [];
  const carbon: EquipmentItem[] = [];
  const ro: EquipmentItem[] = [];
  const bladder: EquipmentItem[] = [];
  const uv: EquipmentItem[] = [];
  const heaters: EquipmentItem[] = [];
  let chemInj: EquipmentItem = { name: "Chemical Injection Package", size: "", price: 3890 };
  let leak: EquipmentItem = { name: '1" Emergency Leak Shut Off Valve', size: "", price: 1590, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:02daeba4-c657-41de-9318-29ba0899d91d" };
  let rusco: EquipmentItem = { name: 'Rusco Sand/Sediment Filter 1"', size: "", price: 225 };
  let ozone: EquipmentItem = { name: "ACA Whole House Ozone Air Purifier", size: "", price: 2290 };
  let booster: EquipmentItem = { name: '1" SS Pressure Boosting System up to 80 PSI', size: "", price: 2995 };

  // Column mapping: "Water Conditioners" = name, "Cost" = price, "Brochures" = brochure,
  // "Reccomend if " = people/recommendation, "Water parameters" = phRange,
  // "Rental Price" = rentalPrice, "Rental Install Price" = rentalInstallPrice
  for (const row of rows) {
    const name = String(row["Water Conditioners"] || "").trim();
    const cost = parsePrice(row["Cost"]);
    const brochure = String(row["Brochures"] || "").trim();
    const recommend = String(row["Reccomend if "] || "").trim();
    const waterParams = String(row["Water parameters"] || "").trim();
    const rental = parsePrice(row["Rental Price"]);
    const rentalInstall = parsePrice(row["Rental Install Price"]);

    if (!name || !cost) continue;

    const brochureUrl = brochure.startsWith("http") ? brochure : undefined;
    const size = extractSize(name);
    const item: EquipmentItem = { name, size, price: cost };
    if (brochureUrl) item.brochureUrl = brochureUrl;
    if (rental) item.rentalPrice = rental;
    if (rentalInstall) item.rentalInstallPrice = rentalInstall;
    if (recommend) item.people = recommend;
    if (waterParams) item.phRange = waterParams;

    // Categorize by name pattern
    if (name.includes("Twin Alternating")) {
      condTwin.push(item);
    } else if (name.startsWith("ACA") && /\d+,\d{3}/.test(name)) {
      // Single conditioners: "ACA .75 24,000", "ACA 1.0 32,000", etc.
      condSingle.push(item);
    } else if (name.includes("Acid Neutralizer")) {
      acidNeut.push(item);
    } else if (name.includes("Iron Odor Breaker")) {
      ironOdor.push(item);
    } else if (name.includes("Carbon Filtration")) {
      carbon.push(item);
    } else if (name.includes("Reverse Osmosis") || (name.includes("Tankless") && name.includes("Gallons Per Day"))) {
      ro.push(item);
    } else if (name.includes("Bladder Tank")) {
      bladder.push(item);
    } else if (name.includes("Ultra Violet Light") || name.includes("Gallons Per Minute Ultra")) {
      uv.push(item);
    } else if (name.includes("Chemical Injection") && cost > 0) {
      chemInj = item;
    } else if (name.includes("Leak Shut") || name.includes("Leak shut")) {
      leak = { ...item, brochureUrl: brochureUrl || leak.brochureUrl };
    } else if (name.includes("Rusco")) {
      rusco = item;
    } else if (name.includes("Ozone")) {
      ozone = item;
    } else if (name.includes("Pressure") && name.includes("boosting")) {
      booster = item;
    } else if (name.includes("Bradford White") || name.includes("Tankless Water Heater")) {
      heaters.push(item);
    }
  }

  return {
    conditionersSingle: condSingle,
    conditionersTwin: condTwin,
    acidNeutralizers: acidNeut,
    ironOdorBreakers: ironOdor,
    carbonFiltration: carbon,
    roSystems: ro,
    bladderTanks: bladder,
    uvLights: uv,
    waterHeaters: heaters,
    chemicalInjection: chemInj,
    leakValve: leak,
    ruscoFilter: rusco,
    ozonePurifier: ozone,
    pressureBooster: booster,
    lastUpdated: new Date().toISOString(),
  };
}

export async function refreshPricing(): Promise<PricingData> {
  try {
    console.log("[Pricing Sync] Fetching Google Sheets data...");
    const raw = await fetchUrl(CSV_URL);
    const rows = parseCsv(raw);
    const pricing = parseSheetsData(rows);
    cachedPricing = pricing;
    const itemCount = pricing.conditionersSingle.length + pricing.conditionersTwin.length +
      pricing.acidNeutralizers.length + pricing.ironOdorBreakers.length +
      pricing.carbonFiltration.length + pricing.roSystems.length +
      pricing.bladderTanks.length + pricing.uvLights.length + pricing.waterHeaters.length + 5;
    console.log(`[Pricing Sync] Loaded ${itemCount} equipment items from Google Sheets`);
    return pricing;
  } catch (err: any) {
    console.error("[Pricing Sync] Failed to fetch:", err.message);
    if (cachedPricing) {
      console.log("[Pricing Sync] Using cached data from", cachedPricing.lastUpdated);
      return cachedPricing;
    }
    throw err;
  }
}

export function getCachedPricing(): PricingData | null {
  return cachedPricing;
}

// Start auto-refresh every 15 minutes
export function startPricingSync() {
  refreshPricing().catch(err => console.error("[Pricing Sync] Initial fetch failed:", err.message));
  setInterval(() => {
    refreshPricing().catch(err => console.error("[Pricing Sync] Refresh failed:", err.message));
  }, 15 * 60 * 1000);
}
