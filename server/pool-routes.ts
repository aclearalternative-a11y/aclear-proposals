// =============================================================================
// POOL WATER AI AGENT ROUTES — Ali (Bulk Water / Swimming Pool)
// =============================================================================
import type { Express, Request, Response } from "express";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Brochure attachment — bundled at server/assets/pool-water-brochure.pdf
// Attached to every customer quote email.
// ---------------------------------------------------------------------------
function getBrochureAttachment() {
  const candidates = [
    path.join(process.cwd(), "server/assets/pool-water-brochure.pdf"),
    path.join(process.cwd(), "dist/assets/pool-water-brochure.pdf"),
    path.join(__dirname, "assets/pool-water-brochure.pdf"),
    path.join(__dirname, "../server/assets/pool-water-brochure.pdf"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return {
          filename: "Pool-and-Hot-Tub-Water-Delivery-Brochure.pdf",
          content: fs.readFileSync(p),
          contentType: "application/pdf",
        };
      }
    } catch {}
  }
  console.warn("Brochure PDF not found — quote email will be sent without attachment.");
  return null;
}
import { POOL_ZIP_DATA } from "./pool_zip_data";

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------
const TANKER_GAL = 6200;           // standard tanker capacity
const SMALL_TANKER_GAL = 2000;     // small truck for hot tubs

function computeLoads(gallons?: number, poolType?: string): { loads: number; perLoadGal: number; tankerLabel: string } {
  const isHotTub = (poolType || "").toLowerCase().includes("hot");
  // NOTE: Round DOWN to nearest whole load (min 1). Ex: 19,000 gal ÷ 6,200 = 3.06 → 3 loads.
  if (isHotTub) {
    const g = gallons || SMALL_TANKER_GAL;
    const loads = Math.max(1, Math.floor(g / SMALL_TANKER_GAL));
    return { loads, perLoadGal: SMALL_TANKER_GAL, tankerLabel: "2,000 gallon small tanker" };
  }
  const g = gallons || TANKER_GAL;
  const loads = Math.max(1, Math.floor(g / TANKER_GAL));
  return { loads, perLoadGal: TANKER_GAL, tankerLabel: "6,200 gallon standard tanker" };
}

function computeQuoteTotal(basePrice?: string, gallons?: number, poolType?: string) {
  const per = basePrice ? parseFloat(basePrice) : 0;
  const { loads, perLoadGal, tankerLabel } = computeLoads(gallons, poolType);
  const total = per * loads;
  return { pricePerLoad: per, loads, perLoadGal, tankerLabel, total };
}

// ---------------------------------------------------------------------------
// Quote persistence (file-backed, survives Render restart via /data volume)
// ---------------------------------------------------------------------------
// Try /data (Render persistent disk), fall back to app-local ./data if /data is unavailable.
function pickQuotesDir(): string {
  const candidates = ["/data/quotes", path.join(process.cwd(), "data", "quotes"), "/tmp/aclear-quotes"];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.probe-${Date.now()}`);
      fs.writeFileSync(probe, "ok", "utf8");
      fs.unlinkSync(probe);
      console.log(`[quotes] using dir: ${dir}`);
      return dir;
    } catch (e: any) {
      console.warn(`[quotes] ${dir} not writable: ${e.message}`);
    }
  }
  // Last resort — return /tmp path even if not verified
  return "/tmp/aclear-quotes";
}
const QUOTES_DIR = pickQuotesDir();

export interface StoredQuote {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  email?: string;
  town?: string;
  county?: string;
  pricePerLoad: number;
  loads: number;
  perLoadGal: number;
  tankerLabel: string;
  total: number;
  poolType?: string;
  poolSurface?: string;
  installType?: string;
  gallons?: number;
  deliveryDate?: string;
  deliveryTime?: string;
  contactId?: string | null;
  opportunityId?: string | null;
  signedBy?: string;
  signedAt?: string;
  signerIp?: string;
}

function saveQuote(q: StoredQuote): void {
  try { fs.mkdirSync(QUOTES_DIR, { recursive: true }); } catch {}
  const filePath = `${QUOTES_DIR}/${q.id}.json`;
  try {
    fs.writeFileSync(filePath, JSON.stringify(q, null, 2), "utf8");
    console.log(`[quotes] wrote ${filePath}`);
  } catch (e: any) {
    console.error(`[quotes] saveQuote FAILED ${filePath}:`, e.message);
  }
}

function loadQuote(id: string): StoredQuote | null {
  try {
    const p = `${QUOTES_DIR}/${id.replace(/[^a-zA-Z0-9_-]/g, "")}.json`;
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { return null; }
}

function generateQuoteId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `q${ts}${rand}`;
}

function getPublicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://proposals.aclear.com";
}

// Normalize a zip code from Jessica's speech-to-text.
// Handles: '08204', '8204', 'O8204', '0 8 2 0 4', '08204.', 'zero eight two oh four', etc.
function normalizeZip(raw: unknown): string {
  let s = (raw == null ? "" : String(raw)).toLowerCase().trim();
  // Map spoken digit words to digits
  const wordMap: Record<string, string> = {
    "zero": "0", "oh": "0", "o": "0",
    "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
  };
  // Replace whole words first, then fall back to digit-stripping
  s = s.replace(/\b[a-z]+\b/g, (w) => wordMap[w] ?? w);
  // Strip anything non-digit
  let digits = s.replace(/\D/g, "");
  // Trim to 5 digits — prefer last 5 if too long (e.g. '208204' → '08204'), pad if short
  if (digits.length > 5) digits = digits.slice(-5);
  if (digits.length > 0 && digits.length < 5) digits = digits.padStart(5, "0");
  return digits;
}

// Hardcoded until Render env var is updated (env has stale expired token)
const GHL_API_KEY = "pit-d7eddf87-065e-4031-a399-3b3fc4a8af97";
const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
const POOL_PIPELINE_ID = "xNaG2uwpPxq6BePj7zR8";
const POOL_STAGE_NEW_LEAD = "8c4c4efa-a7d9-4020-9c88-d181cd0ba6b3";
// Stage to move opportunity to when the customer signs the quote.
const POOL_STAGE_SCHEDULED = "6dbbf306-7b0e-4962-8aa6-4d098bbd7058"; // 'scheduled'
const POOL_SHEET_ID = "1yJEFzqwntC0DYlJRv9mHILctsFZSnt5Ij4yS-m3i8qY";
const DATA_PATH = "/data/pool_zip_data.json";

export type ZipEntry = import("./pool_zip_data").ZipEntry;
let zipData: Record<string, ZipEntry> = {};

function loadZipData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      zipData = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      console.log(`Pool zip data loaded from disk: ${Object.keys(zipData).length} zones`);
    } else {
      zipData = { ...POOL_ZIP_DATA };
      try { fs.mkdirSync("/data", { recursive: true }); fs.writeFileSync(DATA_PATH, JSON.stringify(zipData, null, 2), "utf8"); } catch {}
      console.log(`Pool zip data seeded: ${Object.keys(zipData).length} zones`);
    }
  } catch (e: any) {
    zipData = { ...POOL_ZIP_DATA };
    console.warn("Pool zip fallback:", e.message);
  }
}
loadZipData();

// ---------------------------------------------------------------------------
// Gmail transporter
// ---------------------------------------------------------------------------
function getMailer() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true, family: 4,
    auth: {
      user: process.env.GMAIL_USER || "aclearalternative@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD || "kcjswmfawaaugwqo",
    },
  });
}

// ---------------------------------------------------------------------------
// Gallon estimator — used when caller doesn't know gallons needed
// ---------------------------------------------------------------------------
export function estimateGallons(params: {
  poolType?: string;   // inground | above_ground | hot_tub
  shape?: string;      // rectangle | oval | round | kidney
  length?: number;     // feet
  width?: number;      // feet
  diameter?: number;   // feet (for round)
  avgDepth?: number;   // feet
}): { gallons: number | null; formula: string } {
  const { poolType, shape = "rectangle", length = 0, width = 0, diameter = 0, avgDepth = 5 } = params;
  // Hot tubs — typical sizes
  if (poolType === "hot_tub") return { gallons: 400, formula: "Standard hot tub estimate (~400 gal)" };
  const d = avgDepth || 5;
  const s = (shape || "rectangle").toLowerCase();
  // Rectangle / square: L × W × D × 7.48
  if (s.includes("rect") || s.includes("square")) {
    if (length > 0 && width > 0) {
      const g = Math.round(length * width * d * 7.48);
      return { gallons: g, formula: `${length}ft × ${width}ft × ${d}ft × 7.48` };
    }
  }
  // Round: π × r² × D × 7.48
  if (s.includes("round") || s.includes("circle")) {
    const diam = diameter || length;
    if (diam > 0) {
      const r = diam / 2;
      const g = Math.round(Math.PI * r * r * d * 7.48);
      return { gallons: g, formula: `π × (${diam}/2)² × ${d}ft × 7.48` };
    }
  }
  // Oval: L × W × D × 5.9
  if (s.includes("oval")) {
    if (length > 0 && width > 0) {
      const g = Math.round(length * width * d * 5.9);
      return { gallons: g, formula: `${length}ft × ${width}ft × ${d}ft × 5.9 (oval)` };
    }
  }
  // Kidney: L × W × D × 7.0
  if (s.includes("kidney")) {
    if (length > 0 && width > 0) {
      const g = Math.round(length * width * d * 7.0);
      return { gallons: g, formula: `${length}ft × ${width}ft × ${d}ft × 7.0 (kidney)` };
    }
  }
  return { gallons: null, formula: "Insufficient dimensions — please provide length, width, and approximate depth." };
}

// ---------------------------------------------------------------------------
// Professional pool water quote email — sent TO the customer
// ---------------------------------------------------------------------------
// Build the short teaser email that drives the customer to the one-page signable quote.
function buildPoolQuoteEmail(params: {
  firstName: string; lastName: string;
  town: string;
  total: number; loads: number; tankerLabel: string;
  quoteUrl: string;
}): string {
  const { firstName, town, total, loads, tankerLabel, quoteUrl } = params;
  const totalFmt = total.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08)">
      <tr><td style="background:#0f3e63;padding:26px 32px">
        <div style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:.2px">A Clear Alternative</div>
        <div style="color:#cbe3f2;font-size:14px;margin-top:4px">Pool &amp; Hot Tub Water Delivery — Since 1991</div>
      </td></tr>
      <tr><td style="padding:30px 32px 8px 32px">
        <p style="margin:0 0 16px 0;font-size:18px;line-height:1.6;color:#222">Dear ${firstName},</p>
        <p style="margin:0 0 16px 0;font-size:17px;line-height:1.6;color:#333">Thank you for calling us. Your personalized water delivery quote for <strong>${town}</strong> is ready.</p>
        <div style="background:#eaf5fb;border-left:5px solid #1d8fc4;padding:18px 22px;margin:20px 0;border-radius:0 4px 4px 0">
          <div style="font-size:14px;color:#1d8fc4;font-weight:700;letter-spacing:1px;text-transform:uppercase">Quote Total</div>
          <div style="font-size:34px;font-weight:800;color:#0f3e63;margin-top:6px">${totalFmt}</div>
          <div style="font-size:14px;color:#555;margin-top:6px">${loads} load${loads>1?"s":""} × ${tankerLabel}</div>
        </div>
        <p style="margin:22px 0 14px 0;font-size:16px;color:#333;line-height:1.6">Review your full quote, and sign online to schedule your delivery:</p>
        <div style="text-align:center;margin:22px 0 12px 0">
          <a href="${quoteUrl}" style="background:#d4a73b;color:#0f3e63;text-decoration:none;padding:16px 36px;border-radius:6px;font-weight:800;font-size:17px;display:inline-block;letter-spacing:.3px">View &amp; Sign My Quote</a>
        </div>
        <p style="margin:20px 0 8px 0;font-size:14px;color:#666;line-height:1.6;text-align:center">Or paste this link into your browser:<br><a href="${quoteUrl}" style="color:#1d8fc4;word-break:break-all">${quoteUrl}</a></p>
        <div style="text-align:center;margin:22px 0 4px 0">
          <a href="https://proposals.aclear.com/brochure/pool-water.pdf" style="display:inline-block;background:#d32f2f;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:800;font-size:15px;letter-spacing:.3px;box-shadow:0 2px 6px rgba(211,47,47,.35)">⬇ Download Pool &amp; Hot Tub Brochure (PDF)</a>
        </div>
        <p style="margin:26px 0 4px 0;font-size:15px;color:#555;line-height:1.6">Questions? Call us at <a href="tel:+18566638088" style="color:#1d8fc4;text-decoration:none">(856) 663-8088</a> or reply to this email.</p>
      </td></tr>
      <tr><td style="padding:20px 32px 28px 32px;font-size:13px;color:#666;line-height:1.6">Brochure also attached to this email.</td></tr>
      <tr><td style="background:#0f3e63;padding:22px 32px;color:#ffffff;font-size:14px;line-height:1.7">
        <div><strong style="font-size:15px">A Clear Alternative</strong> &middot; Since 1991</div>
        9230 Collins Ave, Pennsauken, NJ 08110<br>
        1-888-577-8088 &middot; (856) 663-8088 &middot; info@aclear.com &middot; www.aclear.com
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

// Build the one-page signable quote HTML hosted at /quote/:id
function buildSignablePoolQuotePage(q: StoredQuote): string {
  const fullName = `${q.firstName} ${q.lastName}`;
  const totalFmt = q.total.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
  const perFmt = q.pricePerLoad.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
  const today = new Date(q.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const isSigned = !!q.signedBy;
  const signedDate = q.signedAt ? new Date(q.signedAt).toLocaleString("en-US") : "";
  const poolTypeFmt = formatPoolType(q.poolType, q.poolSurface, q.installType);
  const gallonsFmt = q.gallons ? q.gallons.toLocaleString() + " gal" : "—";
  const scheduleFmt = q.deliveryDate ? `${q.deliveryDate}${q.deliveryTime ? " — " + q.deliveryTime : ""}` : "To be scheduled";

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pool Water Delivery Quote — A Clear Alternative</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { background:#eef2f6; color:#1a1a1a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
  body { padding:20px 12px 60px 12px; }
  .page { max-width:820px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 14px rgba(0,0,0,.08); }
  .hdr { background:linear-gradient(135deg,#0f3e63 0%,#1d8fc4 100%); color:#fff; padding:24px 32px; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:14px; }
  .hdr .brand h1 { font-size:24px; font-weight:800; letter-spacing:.2px; }
  .hdr .brand p { font-size:12px; opacity:.85; margin-top:3px; }
  .hdr .meta { font-size:11px; color:#cbe3f2; text-align:right; line-height:1.7; }
  .hdr .meta strong { color:#fff; }
  .body { padding:26px 32px 18px 32px; }
  .greet { font-size:14px; line-height:1.6; color:#333; margin-bottom:18px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px; }
  @media(max-width:640px){ .grid { grid-template-columns:1fr; } }
  .card { background:#f7fafc; border:1px solid #e1e7ef; border-radius:6px; padding:14px 16px; }
  .card h4 { font-size:10px; font-weight:700; color:#1d8fc4; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
  .card .k { font-size:13px; color:#555; margin:3px 0; line-height:1.55; }
  .card .k b { color:#222; font-weight:600; }
  .card .name { font-size:16px; font-weight:700; color:#0f3e63; margin-bottom:4px; }
  .quote-box { background:#fff; border:2px solid #1d8fc4; border-radius:8px; margin:18px 0; overflow:hidden; }
  .quote-box .qhdr { background:#1d8fc4; color:#fff; padding:11px 18px; font-size:13px; font-weight:700; letter-spacing:.3px; }
  .quote-box table { width:100%; border-collapse:collapse; }
  .quote-box td { padding:10px 18px; font-size:13px; border-top:1px solid #eef2f6; }
  .quote-box td:first-child { color:#555; }
  .quote-box td:last-child { text-align:right; font-weight:600; color:#222; }
  .quote-box tr.total td { font-size:16px; font-weight:800; color:#0f3e63; border-top:2px solid #1d8fc4; padding:14px 18px; background:#eaf5fb; }
  .quote-box tr.total td:last-child { font-size:22px; color:#0f3e63; }
  .incl { background:#f0f9ff; border:1px solid #cbe3f2; border-radius:6px; padding:12px 18px; margin:12px 0 20px 0; font-size:12px; color:#444; }
  .incl b { color:#0f3e63; display:block; margin-bottom:4px; font-size:11px; letter-spacing:.5px; text-transform:uppercase; }
  .incl ul { list-style:none; margin:0; padding:0; }
  .incl li { padding:2px 0; }
  .incl li:before { content:"✓ "; color:#1d8fc4; font-weight:700; }
  .terms { font-size:11px; color:#666; line-height:1.6; background:#fafbfc; border-top:1px solid #eef2f6; border-bottom:1px solid #eef2f6; padding:16px 32px; margin:0 -32px; }
  .sign-wrap { padding:24px 32px; background:#fff; border-top:2px solid #f0f4f8; }
  .sign-wrap h3 { font-size:14px; color:#0f3e63; margin-bottom:6px; font-weight:700; }
  .sign-wrap p.lead { font-size:12px; color:#555; margin-bottom:14px; line-height:1.55; }
  .sign-row { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  .sign-row label { display:block; font-size:11px; font-weight:700; color:#0f3e63; text-transform:uppercase; letter-spacing:.5px; margin-bottom:5px; }
  .sign-row input[type=text] { flex:1; min-width:220px; padding:12px 14px; font-size:18px; font-family:'Brush Script MT','Segoe Script','Lucida Handwriting',cursive; border:1.5px solid #cbd5e1; border-radius:5px; background:#fff; color:#0f3e63; }
  .sign-row input[type=text]:focus { outline:none; border-color:#1d8fc4; box-shadow:0 0 0 3px rgba(29,143,196,.15); }
  .sign-row button { padding:13px 24px; background:#d4a73b; color:#0f3e63; font-size:14px; font-weight:800; border:none; border-radius:5px; cursor:pointer; letter-spacing:.3px; }
  .sign-row button:hover { background:#c69a2d; }
  .sign-row button:disabled { opacity:.5; cursor:not-allowed; }
  .consent { font-size:11px; color:#666; margin-top:14px; line-height:1.5; display:flex; gap:6px; align-items:flex-start; }
  .consent input { margin-top:2px; }
  .signed-ok { padding:18px; background:#e8f7ee; border:1.5px solid #7fc49d; border-radius:6px; color:#0f3e63; text-align:center; }
  .signed-ok .chk { font-size:28px; color:#1e9c52; margin-bottom:6px; }
  .signed-ok h3 { color:#0f3e63; font-size:17px; margin-bottom:6px; }
  .signed-ok p { font-size:13px; color:#333; }
  .signed-line { display:flex; align-items:center; gap:10px; padding:12px 16px; background:#f7fafc; border-left:3px solid #1e9c52; margin-top:12px; }
  .signed-line .sigtxt { font-family:'Brush Script MT','Segoe Script','Lucida Handwriting',cursive; font-size:22px; color:#0f3e63; }
  .footer { background:#0f3e63; color:#cbe3f2; padding:18px 32px; font-size:11px; line-height:1.7; text-align:center; }
  .footer strong { color:#fff; }
  .err { color:#c0392b; font-size:12px; margin-top:8px; }
</style>
</head><body>
<div class="page">

  <div class="hdr">
    <div class="brand">
      <h1>A Clear Alternative</h1>
      <p>Pool &amp; Hot Tub Water Delivery — Since 1991</p>
    </div>
    <div class="meta">
      <strong>Quote #${q.id.toUpperCase().slice(1)}</strong><br>
      ${today}<br>
      Valid 30 days
    </div>
  </div>

  <div class="body">
    <p class="greet">Dear ${q.firstName}, thank you for choosing A Clear Alternative. Below is your personalized water delivery quote. Sign at the bottom to confirm and we'll reach out to schedule your delivery.</p>

    <div class="grid">
      <div class="card">
        <h4>Delivery Location</h4>
        <div class="name">${fullName}</div>
        <div class="k">${q.address || ""}</div>
        <div class="k">${q.city || q.town || ""}, ${q.state || "NJ"} ${q.zip}</div>
        ${q.county ? `<div class="k"><b>${q.county}</b> County</div>` : ""}
        ${q.phone ? `<div class="k">${q.phone}</div>` : ""}
        ${q.email ? `<div class="k">${q.email}</div>` : ""}
      </div>
      <div class="card">
        <h4>Job Details</h4>
        <div class="k"><b>Service:</b> Bulk Water Delivery</div>
        ${poolTypeFmt ? `<div class="k"><b>Type:</b> ${poolTypeFmt}</div>` : ""}
        <div class="k"><b>Gallons:</b> ${gallonsFmt}</div>
        <div class="k"><b>Tanker:</b> ${q.tankerLabel}</div>
        <div class="k"><b>Loads Needed:</b> ${q.loads}</div>
        <div class="k"><b>Requested:</b> ${scheduleFmt}</div>
      </div>
    </div>

    <div class="quote-box">
      <div class="qhdr">Your Quote</div>
      <table>
        <tr><td>Price per load (${q.perLoadGal.toLocaleString()} gal tanker)</td><td>${perFmt}</td></tr>
        <tr><td>Number of loads</td><td>× ${q.loads}</td></tr>
        ${q.loads > 1 ? `<tr><td>Subtotal</td><td>${totalFmt}</td></tr>` : ""}
        <tr class="total"><td>Total</td><td>${totalFmt}</td></tr>
      </table>
    </div>

    <div class="incl">
      <b>What's Included</b>
      <ul>
        <li>Full truckload of potable-grade bulk water</li>
        <li>Delivery to your address in ${q.town || q.city}</li>
        <li>Professional, on-time service</li>
        <li>Friendly, experienced delivery team</li>
      </ul>
    </div>

    <div style="text-align:center;margin:18px 0 6px 0">
      <a href="/brochure/pool-water.pdf" target="_blank" rel="noopener"
         style="display:inline-block;background:#d32f2f;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:800;font-size:15px;letter-spacing:.3px;box-shadow:0 2px 6px rgba(211,47,47,.35)">
        ⬇ Download Pool &amp; Hot Tub Water Delivery Brochure (PDF)
      </a>
    </div>
    <p style="text-align:center;font-size:11px;color:#777;margin:4px 0 6px 0">Learn why professional water hauling beats a hose or well — 5 quick reasons.</p>
  </div>

  <div class="terms">
    <strong>Terms:</strong> This quote is valid for 30 days from the date above. Pricing is based on the delivery zip code and the number of 6,200-gallon tanker loads required (hot tubs: 2,000-gallon tanker). Additional charges may apply for difficult access (gates, long distances from truck to pool, overhead obstructions). Final gallons may be verified on-site by the delivery team. By signing below you authorize A Clear Alternative to schedule your delivery and confirm acceptance of the pricing and terms. Payment is due at time of service unless otherwise arranged.
  </div>

  ${isSigned ? `
  <div class="sign-wrap">
    <div class="signed-ok">
      <div class="chk">✓</div>
      <h3>Quote Signed &amp; Accepted</h3>
      <p>Our team will reach out shortly to schedule your delivery.</p>
    </div>
    <div class="signed-line">
      <div>
        <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:2px">Signed by</div>
        <div class="sigtxt">${q.signedBy}</div>
        <div style="font-size:11px;color:#555;margin-top:3px">${signedDate}</div>
      </div>
    </div>
  </div>` : `
  <form id="signForm" class="sign-wrap" onsubmit="return submitSig(event)">
    <h3>Accept &amp; Sign Your Quote</h3>
    <p class="lead">Type your full legal name below. By signing you accept the pricing and terms above and authorize us to contact you to schedule delivery.</p>
    <div class="sign-row">
      <div style="flex:1;min-width:220px">
        <label for="sigName">Your Full Name (E-Signature)</label>
        <input id="sigName" type="text" placeholder="${fullName}" required autocomplete="name" autocapitalize="words">
      </div>
      <button id="sigBtn" type="submit">Sign &amp; Schedule</button>
    </div>
    <label class="consent">
      <input id="sigConsent" type="checkbox" required>
      <span>I agree that typing my name above serves as my legal electronic signature and I accept the quote and terms.</span>
    </label>
    <div id="sigErr" class="err" style="display:none"></div>
  </form>`}

  <div class="footer">
    <strong>A Clear Alternative</strong> &middot; 9230 Collins Ave, Pennsauken NJ 08110<br>
    1-888-577-8088 &middot; (856) 663-8088 &middot; info@aclear.com &middot; www.aclear.com
  </div>

</div>

<script>
async function submitSig(e) {
  e.preventDefault();
  var btn = document.getElementById('sigBtn');
  var err = document.getElementById('sigErr');
  var name = document.getElementById('sigName').value.trim();
  var consent = document.getElementById('sigConsent').checked;
  err.style.display = 'none';
  if (!name || name.length < 3) { err.textContent = 'Please enter your full name.'; err.style.display='block'; return false; }
  if (!consent) { err.textContent = 'Please check the consent box.'; err.style.display='block'; return false; }
  btn.disabled = true; btn.textContent = 'Signing…';
  try {
    var r = await fetch('/api/pool/sign-quote', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: '${q.id}', signedBy: name }) });
    var j = await r.json();
    if (j && j.success) { location.reload(); return false; }
    err.textContent = (j && j.error) || 'Could not record signature. Please call us to confirm.'; err.style.display='block';
  } catch(ex) { err.textContent = 'Network error. Please try again or call us.'; err.style.display='block'; }
  btn.disabled=false; btn.textContent='Sign & Schedule';
  return false;
}
</script>
</body></html>`;
}

// Legacy inline quote HTML removed — replaced by buildSignablePoolQuotePage @ /quote/:id


// ---------------------------------------------------------------------------
// GHL contact + opportunity creator
// ---------------------------------------------------------------------------
async function createPoolLead(params: {
  firstName: string; lastName: string;
  address?: string; city?: string; state?: string; zip?: string;
  phone?: string; email?: string; price?: string; town?: string;
  poolType?: string; poolSurface?: string; installType?: string;
  gallons?: number; deliveryDate?: string; deliveryTime?: string;
}): Promise<{ contactId: string | null; opportunityId: string | null }> {
  const { firstName, lastName, address, city, state, zip, phone, email, price, town,
          poolType, poolSurface, installType, gallons, deliveryDate, deliveryTime } = params;
  const priceNum = price ? parseFloat(price) : 0;

  // Build pool-detail note that gets saved as contact note + opportunity description
  const poolNote = [
    poolType ? `Pool Type: ${formatPoolType(poolType, poolSurface, installType)}` : null,
    gallons ? `Gallons Needed: ${gallons.toLocaleString()}` : null,
    deliveryDate ? `Requested Delivery: ${deliveryDate}${deliveryTime ? ` @ ${deliveryTime}` : ""}` : null,
  ].filter(Boolean).join("\n");

  const tags = ["Pool Water Lead", "Ali AI Call"];
  if (poolType) tags.push(`Pool: ${formatPoolType(poolType, poolSurface, installType)}`);

  const contactPayload = {
    locationId: GHL_LOCATION_ID,
    firstName, lastName,
    phone: phone || "",
    email: email || "",
    address1: address || "",
    city: city || town || "",
    state: state || "NJ",
    postalCode: zip || "",
    tags,
    source: "AI Phone — Jessica",
    customFields: [
      poolType      ? { key: "pool_type",       field_value: formatPoolType(poolType, poolSurface, installType) } : null,
      poolSurface   ? { key: "pool_surface",    field_value: poolSurface } : null,
      installType   ? { key: "pool_install",    field_value: installType } : null,
      gallons       ? { key: "gallons_needed",  field_value: String(gallons) } : null,
      deliveryDate  ? { key: "delivery_date",   field_value: deliveryDate } : null,
      deliveryTime  ? { key: "delivery_time",   field_value: deliveryTime } : null,
    ].filter(Boolean),
  };

  let contactRes: string;
  try {
    contactRes = execSync(
      `curl -s -X POST "https://services.leadconnectorhq.com/contacts/upsert" \
        -H "Authorization: Bearer ${GHL_API_KEY}" \
        -H "Version: 2021-07-28" \
        -H "Content-Type: application/json" \
        -d '${JSON.stringify(contactPayload).replace(/'/g, "'\\''")}'`,
      { timeout: 10000 }
    ).toString();
  } catch (curlErr: any) {
    console.error("GHL upsert curl error:", curlErr.message);
    contactRes = '{}';
  }

  console.log("GHL upsert raw response:", contactRes.substring(0, 500));
  const contactData = JSON.parse(contactRes);
  const contactId = contactData?.contact?.id || contactData?.id || null;
  console.log("GHL parsed contactId:", contactId, "token starts with:", GHL_API_KEY.substring(0, 12));
  let opportunityId: string | null = null;

  if (contactId) {
    const oppName = poolType
      ? `${firstName} ${lastName} — ${formatPoolType(poolType, poolSurface, installType)} (${zip || ""})`
      : `${firstName} ${lastName} — Pool Water (${zip || ""})`;
    const oppPayload = {
      pipelineId: POOL_PIPELINE_ID,
      locationId: GHL_LOCATION_ID,
      name: oppName,
      pipelineStageId: POOL_STAGE_NEW_LEAD,
      contactId,
      status: "open",
      monetaryValue: priceNum,
      source: "Jessica AI Phone Agent",
      // NOTE: GHL opportunities API does NOT accept a `notes` field.
      // Pool detail notes are written separately via the contact /notes endpoint below.
    };

    const oppRes = execSync(
      `curl -s -X POST "https://services.leadconnectorhq.com/opportunities/" \
        -H "Authorization: Bearer ${GHL_API_KEY}" \
        -H "Version: 2021-07-28" \
        -H "Content-Type: application/json" \
        -d '${JSON.stringify(oppPayload).replace(/'/g, "'\\''")}'`,
      { timeout: 10000 }
    ).toString();

    opportunityId = JSON.parse(oppRes)?.opportunity?.id || null;

    // Also write pool-detail note on contact itself (easier for reps to see)
    if (poolNote) {
      try {
        execSync(
          `curl -s -X POST "https://services.leadconnectorhq.com/contacts/${contactId}/notes" \
            -H "Authorization: Bearer ${GHL_API_KEY}" \
            -H "Version: 2021-07-28" \
            -H "Content-Type: application/json" \
            -d '${JSON.stringify({ body: `Pool Water Lead — Details from Jessica call:\n\n${poolNote}` }).replace(/'/g, "'\\''")}'`,
          { timeout: 8000 }
        );
      } catch (noteErr: any) {
        console.warn("Contact note write failed:", noteErr.message);
      }
    }
  }

  return { contactId, opportunityId };
}

function formatPoolType(poolType?: string, poolSurface?: string, installType?: string): string {
  if (!poolType) return "";
  const t = poolType.toLowerCase();
  if (t.includes("hot")) return "Hot Tub";
  if (t.includes("above")) return `Above Ground${installType ? ` (${installType})` : ""}`;
  if (t.includes("in")) {
    const parts: string[] = ["Inground"];
    if (poolSurface) parts.push(poolSurface);
    if (installType) parts.push(installType);
    return parts.join(" — ");
  }
  return poolType;
}

// ---------------------------------------------------------------------------
// Send all emails for a new pool lead
// ---------------------------------------------------------------------------
async function sendPoolLeadEmails(params: {
  firstName: string; lastName: string;
  address: string; city: string; state: string; zip: string;
  phone?: string; email?: string;
  entry?: ZipEntry;
  contactId?: string | null; opportunityId?: string | null;
  poolType?: string; poolSurface?: string; installType?: string;
  gallons?: number; deliveryDate?: string; deliveryTime?: string;
}): Promise<{ quoteId: string | null; quoteUrl: string | null; total: number; loads: number }> {
  const { firstName, lastName, address, city, state, zip, phone, email, entry, contactId, opportunityId,
          poolType, poolSurface, installType, gallons, deliveryDate, deliveryTime } = params;
  const fullName = `${firstName} ${lastName}`;
  const mailer = getMailer();

  // Build StoredQuote: multiply price-per-load by loads needed.
  const { pricePerLoad, loads, perLoadGal, tankerLabel, total } =
    computeQuoteTotal(entry?.price, gallons, poolType);

  let quoteId: string | null = null;
  let quoteUrl: string | null = null;

  if (entry && pricePerLoad > 0) {
    quoteId = generateQuoteId();
    const stored: StoredQuote = {
      id: quoteId,
      createdAt: new Date().toISOString(),
      firstName, lastName,
      address: address || "",
      city: city || entry.town || "",
      state: state || "NJ",
      zip: zip || "",
      phone, email,
      town: entry.town,
      county: entry.county,
      pricePerLoad, loads, perLoadGal, tankerLabel, total,
      poolType, poolSurface, installType,
      gallons, deliveryDate, deliveryTime,
      contactId: contactId || null,
      opportunityId: opportunityId || null,
    };
    saveQuote(stored);
    quoteUrl = `${getPublicBaseUrl()}/quote/${quoteId}`;
    console.log(`[quote] saved id=${quoteId} total=$${total} loads=${loads}`);
  }

  // 1. Short teaser email TO CUSTOMER (only if email + valid quote)
  if (email && quoteUrl) {
    const quoteHtml = buildPoolQuoteEmail({
      firstName, lastName,
      town: entry?.town || city,
      total, loads, tankerLabel,
      quoteUrl,
    });
    const totalFmt = total.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

    const brochure = getBrochureAttachment();
    await mailer.sendMail({
      from: `"A Clear Alternative" <aclearalternative@gmail.com>`,
      to: email,
      // bcc removed per John's request — only aclearalternative@gmail.com for now
      subject: `Your Pool Water Delivery Quote — A Clear Alternative`,
      html: quoteHtml,
      text: `Dear ${firstName},\n\nThank you for calling A Clear Alternative. Your personalized water delivery quote for ${entry?.town || city} is ready.\n\nQuote Total: ${totalFmt}\n${loads} load${loads > 1 ? "s" : ""} × ${tankerLabel}\n\nView & sign your quote online to schedule delivery:\n${quoteUrl}\n\nAttached: Pool and Hot Tub Water Delivery brochure.\n\nQuestions? Call (856) 663-8088 or reply to this email.\n\nA Clear Alternative\n9230 Collins Ave, Pennsauken, NJ 08110\n1-888-577-8088 | info@aclear.com`,
      attachments: brochure ? [brochure] : [],
    });
  }

  // 2. Internal notification email (always sent)
  const priceNote = entry
    ? `\nQuote Total: $${total.toLocaleString()} (${loads} × $${pricePerLoad} per load, ${tankerLabel})\nZone: ${entry.town}, ${entry.county} County`
    : "\n(zip not in delivery zone — needs manual review)";
  const poolDetails = [
    poolType ? `Pool Type: ${formatPoolType(poolType, poolSurface, installType)}` : null,
    gallons ? `Gallons Needed: ${gallons.toLocaleString()}` : null,
    deliveryDate ? `Requested Delivery: ${deliveryDate}${deliveryTime ? ` @ ${deliveryTime}` : ""}` : null,
  ].filter(Boolean).join("\n");

  await mailer.sendMail({
    from: `"A Clear Alternative — Jessica" <aclearalternative@gmail.com>`,
    to: "aclearalternative@gmail.com",
    subject: `🏊 New Pool Water Lead — ${fullName} (${zip || "??"})`,
    text: `New pool water inquiry via Jessica (AI Phone Agent):\n\nName: ${fullName}\nAddress: ${address}, ${city}, ${state} ${zip}\nPhone: ${phone || "not provided"}\nEmail: ${email || "not provided"}${priceNote}${poolDetails ? "\n\n— Pool Details —\n" + poolDetails : ""}\n\nSignable Quote: ${quoteUrl || "(no quote — out-of-zone)"}\n\nAdded to GHL → Swimming Pool Water → New Lead\nContact ID: ${contactId || "n/a"}\nOpportunity ID: ${opportunityId || "n/a"}\n\n${email && quoteUrl ? "✅ Quote email sent to customer." : "⚠️  Quote NOT emailed — follow up by phone."}\n\n— Jessica, A Clear Alternative AI`,
  });

  return { quoteId, quoteUrl, total, loads };
}

// Rolling in-memory log of recent webhook requests (for debugging Voice AI)
const recentWebhookRequests: any[] = [];

export function registerPoolRoutes(app: Express) {

  // -----------------------------------------------------------------------
  // GET /api/pool/check-zip?zip=08110
  // Ali calls mid-call. Returns delivers (bool) and a spoken confirmation.
  // Price is NOT included in the spoken message — quote is sent via email.
  // -----------------------------------------------------------------------
  app.get("/api/pool/check-zip", (req: Request, res: Response) => {
    const zip = normalizeZip(req.query.zip);
    if (!zip || zip.length !== 5) {
      return res.status(400).json({ delivers: false, message: "Please provide a valid 5-digit zip code." });
    }

    const entry = zipData[zip];
    if (entry) {
      return res.json({
        delivers: true, zip, town: entry.town, county: entry.county, state: entry.state,
        // Price intentionally omitted from spoken message — sent via professional quote email
        message: `Great news! We do deliver to ${entry.town}. I'll get your information set up and we will send you a professional quote by email. Let me get a few more details from you.`,
      });
    }

    return res.json({
      delivers: false, zip,
      message: `I'm sorry, we don't currently deliver to zip code ${zip}. We serve parts of New Jersey, Pennsylvania, and Delaware. If you have another address or zip code, I can check that for you.`,
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/ali-webhook
  // action = "check_zip"        → delivery confirmation, no price spoken
  // action = "check_pool_type"  → validates pool type (rejects DIY pools)
  // action = "estimate_gallons" → computes gallons from dimensions
  // action = "save_lead"        → GHL contact/opportunity + quote email
  // -----------------------------------------------------------------------
  // Debug: see the last ~30 webhook requests
  app.get("/api/pool/_debug-webhook", (req: Request, res: Response) => {
    if (req.query.s !== (process.env.REFRESH_SECRET || "aclear2026")) {
      return res.status(401).json({ error: "unauthorized" });
    }
    res.json({ count: recentWebhookRequests.length, requests: recentWebhookRequests });
  });

  app.post("/api/pool/ali-webhook", async (req: Request, res: Response) => {
    const logEntry = {
      at: new Date().toISOString(),
      headers: req.headers,
      body: req.body,
      query: req.query,
      contentType: req.headers['content-type'],
    };
    recentWebhookRequests.push(logEntry);
    if (recentWebhookRequests.length > 30) recentWebhookRequests.shift();
    console.log(`[ali-webhook] body=${JSON.stringify(req.body)} query=${JSON.stringify(req.query)} ct=${req.headers['content-type']}`);
    // GHL Voice AI sends all params via query string. Also accept JSON body for curl/testing.
    const src: any = { ...(req.query || {}), ...(req.body || {}) };
    const { action, zip, phone, email, address, city, state } = src;
    // Voice AI sends snake_case params; accept both formats
    const firstName = src.firstName || src.first_name;
    const lastName  = src.lastName  || src.last_name;
    const poolType    = src.poolType    || src.pool_type;    // inground | above_ground | hot_tub
    const poolSurface = src.poolSurface || src.pool_surface; // plaster | liner
    const installType = src.installType || src.install_type; // new | existing | diy | professional
    const gallons     = src.gallons ? parseInt(String(src.gallons).replace(/\D/g, "")) || undefined : undefined;
    const deliveryDate = src.deliveryDate || src.delivery_date;
    const deliveryTime = src.deliveryTime || src.delivery_time;
    const shape     = src.shape;
    const length    = src.length    ? parseFloat(String(src.length))    : undefined;
    const width     = src.width     ? parseFloat(String(src.width))     : undefined;
    const diameter  = src.diameter  ? parseFloat(String(src.diameter))  : undefined;
    const avgDepth  = src.avg_depth || src.avgDepth || src.depth
                        ? parseFloat(String(src.avg_depth || src.avgDepth || src.depth))
                        : undefined;

    // — Zip check (mid-call) —
    if (action === "check_zip") {
      const cleanZip = normalizeZip(zip);
      console.log(`[check_zip] raw=${JSON.stringify(zip)} normalized=${cleanZip}`);
      const entry = zipData[cleanZip];
      if (entry) {
        const msg = `Great news! We deliver to ${entry.town}. After you supply me with all of your information I can get you an accurate quote.`;
        return res.json({
          delivers: true,
          zip: cleanZip,
          town: entry.town,
          message: msg,
          result: msg,
          status: "success",
        });
      }
      const msg = `Unfortunately we do not cover zip code ${cleanZip}.`;
      return res.json({
        delivers: false,
        zip: cleanZip,
        message: msg,
        result: msg,
        status: "success",
      });
    }

    // — Pool-type / install validation —
    if (action === "check_pool_type") {
      const t = (poolType || "").toLowerCase();
      const inst = (installType || "").toLowerCase();
      // DIY above-ground pools (Intex, Coleman, etc.) are NOT fillable
      if (t.includes("above") && (inst.includes("diy") || inst.includes("self") || inst.includes("intex") || inst.includes("coleman"))) {
        return res.json({
          eligible: false,
          reason: "diy_above_ground",
          message: "I'm sorry — we cannot fill do-it-yourself above ground pools such as Intex or Coleman. Thank you for calling A Clear Alternative.",
        });
      }
      return res.json({
        eligible: true,
        poolType: formatPoolType(poolType, poolSurface, installType),
        message: "Got it, that type of pool we can fill.",
      });
    }

    // — Gallon estimator —
    if (action === "estimate_gallons") {
      const est = estimateGallons({ poolType, shape, length, width, diameter, avgDepth });
      if (est.gallons) {
        return res.json({
          gallons: est.gallons,
          formula: est.formula,
          message: `Based on those dimensions, I estimate approximately ${est.gallons.toLocaleString()} gallons.`,
        });
      }
      return res.json({
        gallons: null,
        message: "I need a length, width, and approximate depth to estimate gallons. Could you provide those?",
      });
    }

    // — Save lead (end of call) —
    // IMPORTANT: Voice AI has a ~2s timeout. Respond immediately, do heavy work in background.
    if (action === "save_lead") {
      const cleanZip = normalizeZip(zip);
      console.log(`[save_lead] zip raw=${JSON.stringify(zip)} normalized=${cleanZip} email=${email}`);

      // Respond IMMEDIATELY so Jessica can continue naturally
      res.json({ success: true, message: "Lead saved. Quote being emailed." });

      // Do the real work in background — do not await
      (async () => {
        try {
          const entry = cleanZip ? zipData[cleanZip] : undefined;
          let finalGallons = gallons;
          if (!finalGallons && (length || width || diameter)) {
            const est = estimateGallons({ poolType, shape, length, width, diameter, avgDepth });
            if (est.gallons) finalGallons = est.gallons;
          }

          const { contactId, opportunityId } = await createPoolLead({
            firstName, lastName, address, city, state, zip: cleanZip, phone, email,
            price: entry?.price, town: entry?.town,
            poolType, poolSurface, installType,
            gallons: finalGallons, deliveryDate, deliveryTime,
          });
          console.log(`[save_lead] GHL contact=${contactId} opp=${opportunityId}`);

          await sendPoolLeadEmails({
            firstName, lastName,
            address: address || "",
            city: city || entry?.town || "",
            state: state || "NJ",
            zip: cleanZip,
            phone, email, entry,
            contactId, opportunityId,
            poolType, poolSurface, installType,
            gallons: finalGallons, deliveryDate, deliveryTime,
          });
          console.log(`[save_lead] emails sent to ${email}`);
        } catch (e: any) {
          console.error("[save_lead] background error:", e.message, e.stack);
        }
      })();
      return;
    }

    res.status(400).json({ error: "Unknown action. Use check_zip, check_pool_type, estimate_gallons, or save_lead." });
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/leads  — direct lead creation (GHL workflow / manual)
  // -----------------------------------------------------------------------
  app.post("/api/pool/leads", async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, address, city, state, zip, phone, email,
              poolType, poolSurface, installType, deliveryDate, deliveryTime } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: "First and last name are required." });

      const cleanZip = normalizeZip(zip);
      const entry = cleanZip ? zipData[cleanZip] : undefined;
      const gallons = req.body.gallons
        ? parseInt(String(req.body.gallons).replace(/\D/g, "")) || undefined
        : undefined;

      const { contactId, opportunityId } = await createPoolLead({
        firstName, lastName, address, city, state, zip: cleanZip, phone, email,
        price: entry?.price, town: entry?.town,
        poolType, poolSurface, installType, gallons, deliveryDate, deliveryTime,
      });

      const result = await sendPoolLeadEmails({
        firstName, lastName,
        address: address || "",
        city: city || entry?.town || "",
        state: state || "NJ",
        zip: cleanZip, phone, email, entry,
        contactId, opportunityId,
        poolType, poolSurface, installType, gallons, deliveryDate, deliveryTime,
      });

      res.json({ success: true, contactId, opportunityId, ...result });
    } catch (err: any) {
      console.error("Pool lead error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/refresh-zips  (protected — use after updating Sheet prices)
  // -----------------------------------------------------------------------
  app.post("/api/pool/refresh-zips", async (req: Request, res: Response) => {
    if (req.headers["x-refresh-secret"] !== (process.env.REFRESH_SECRET || "aclear2026")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${POOL_SHEET_ID}/export?format=csv&gid=1587801827`;
      const csvRaw = execSync(`curl -sL "${csvUrl}"`, { timeout: 15000 }).toString();
      const lines = csvRaw.split("\n").filter(Boolean);

      const newMap: Record<string, ZipEntry> = {};
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c: string) => c.trim().replace(/^"|"$/g, ""));
        const z = (cols[0] || "").trim();
        const pool = (cols[4] || "").trim().toLowerCase();
        const priceRaw = (cols[5] || "").replace(/[$, ]/g, "").trim();
        if (z && pool === "yes" && priceRaw) {
          newMap[z] = { price: priceRaw, town: cols[3] || "", county: cols[1] || "", state: cols[2] || "NJ" };
        }
      }

      fs.mkdirSync("/data", { recursive: true });
      fs.writeFileSync(DATA_PATH, JSON.stringify(newMap, null, 2), "utf8");
      zipData = newMap;

      res.json({ success: true, zones: Object.keys(newMap).length, message: "Zip data refreshed from Google Sheet" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // GET /quote/:id  — signable one-page quote (public URL)
  // -----------------------------------------------------------------------
  // Diagnostic: list quote files (secured via same refresh secret)
  app.get("/api/pool/_debug-quotes", (req: Request, res: Response) => {
    if (req.query.s !== (process.env.REFRESH_SECRET || "aclear2026")) {
      return res.status(401).json({ error: "unauthorized" });
    }
    try {
      const dirExists = fs.existsSync(QUOTES_DIR);
      let files: string[] = [];
      if (dirExists) files = fs.readdirSync(QUOTES_DIR).sort().slice(-20);
      // Also probe write
      let writeOk = false; let writeErr = "";
      try {
        const testPath = `${QUOTES_DIR}/.probe-${Date.now()}`;
        fs.writeFileSync(testPath, "ok", "utf8");
        writeOk = fs.existsSync(testPath);
        if (writeOk) fs.unlinkSync(testPath);
      } catch (e: any) { writeErr = e.message; }
      res.json({ dir: QUOTES_DIR, dirExists, writeOk, writeErr, files, count: files.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // GET /brochure/pool-water  — public brochure PDF (inline viewable)
  // -----------------------------------------------------------------------
  app.get(["/brochure/pool-water", "/brochure/pool-water.pdf"], (_req: Request, res: Response) => {
    const candidates = [
      path.join(process.cwd(), "server/assets/pool-water-brochure.pdf"),
      path.join(process.cwd(), "dist/assets/pool-water-brochure.pdf"),
      path.join(__dirname, "assets/pool-water-brochure.pdf"),
      path.join(__dirname, "../server/assets/pool-water-brochure.pdf"),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `inline; filename="Pool-and-Hot-Tub-Water-Delivery-Brochure.pdf"`);
          fs.createReadStream(p).pipe(res);
          return;
        }
      } catch {}
    }
    res.status(404).send("Brochure not found.");
  });

  app.get("/quote/:id", (req: Request, res: Response) => {
    const id = String(req.params.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const q = loadQuote(id);
    if (!q) {
      res.status(404).type("text/html; charset=utf-8").send(`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;color:#333"><h1 style="color:#0f3e63">Quote Not Found</h1><p>We couldn't find that quote. Please call us at <a href="tel:+18566638088" style="color:#1d8fc4">(856) 663-8088</a> and we'll help you out.</p></body></html>`);
      return;
    }
    res.type("text/html; charset=utf-8").send(buildSignablePoolQuotePage(q));
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/sign-quote  — record signature on a stored quote
  // -----------------------------------------------------------------------
  app.post("/api/pool/sign-quote", async (req: Request, res: Response) => {
    try {
      const { id, signedBy } = req.body || {};
      const cleanId = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
      const name = String(signedBy || "").trim();
      if (!cleanId) return res.status(400).json({ success: false, error: "Missing quote id." });
      if (!name || name.length < 3) return res.status(400).json({ success: false, error: "Please provide your full name." });

      const q = loadQuote(cleanId);
      if (!q) return res.status(404).json({ success: false, error: "Quote not found." });
      if (q.signedBy) return res.json({ success: true, alreadySigned: true });

      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
      q.signedBy = name;
      q.signedAt = new Date().toISOString();
      q.signerIp = ip;
      saveQuote(q);

      // Notify internal team
      try {
        const mailer = getMailer();
        const totalFmt = q.total.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
        await mailer.sendMail({
          from: `"A Clear Alternative — Quote Signed" <aclearalternative@gmail.com>`,
          to: "aclearalternative@gmail.com",
          subject: `✅ Quote SIGNED — ${q.firstName} ${q.lastName} (${totalFmt})`,
          text: `Good news! A customer just signed their pool water delivery quote.\n\nSigned by: ${name}\nSigned at: ${new Date(q.signedAt).toLocaleString("en-US")} (IP ${ip || "n/a"})\n\nCustomer: ${q.firstName} ${q.lastName}\nAddress: ${q.address}, ${q.city}, ${q.state} ${q.zip}\nPhone: ${q.phone || "—"}\nEmail: ${q.email || "—"}\n\nQuote Total: ${totalFmt}\n${q.loads} load${q.loads > 1 ? "s" : ""} × $${q.pricePerLoad} (${q.tankerLabel})\n\nGHL Contact: ${q.contactId || "n/a"}\nGHL Opportunity: ${q.opportunityId || "n/a"}\nQuote URL: ${getPublicBaseUrl()}/quote/${q.id}\n\n→ Please reach out to the customer to schedule delivery.`,
        });
      } catch (mailErr: any) {
        console.warn("sign-quote internal email failed:", mailErr.message);
      }

      // Move opportunity to 'Scheduled' (Proposal Sent) stage
      if (q.opportunityId) {
        try {
          execSync(
            `curl -s -X PUT "https://services.leadconnectorhq.com/opportunities/${q.opportunityId}" \
              -H "Authorization: Bearer ${GHL_API_KEY}" \
              -H "Version: 2021-07-28" \
              -H "Content-Type: application/json" \
              -d '${JSON.stringify({ pipelineId: POOL_PIPELINE_ID, pipelineStageId: POOL_STAGE_SCHEDULED, status: "open" }).replace(/'/g, "'\\''")}'`,
            { timeout: 8000 }
          );
          console.log(`[sign-quote] moved opp ${q.opportunityId} → Scheduled stage`);
        } catch (stageErr: any) {
          console.warn("Opp stage move failed:", stageErr.message);
        }
      }

      // Tag contact in GHL as "Quote Signed"
      if (q.contactId) {
        try {
          execSync(
            `curl -s -X POST "https://services.leadconnectorhq.com/contacts/${q.contactId}/tags" \
              -H "Authorization: Bearer ${GHL_API_KEY}" \
              -H "Version: 2021-07-28" \
              -H "Content-Type: application/json" \
              -d '${JSON.stringify({ tags: ["Quote Signed"] }).replace(/'/g, "'\\''")}'`,
            { timeout: 8000 }
          );
          execSync(
            `curl -s -X POST "https://services.leadconnectorhq.com/contacts/${q.contactId}/notes" \
              -H "Authorization: Bearer ${GHL_API_KEY}" \
              -H "Version: 2021-07-28" \
              -H "Content-Type: application/json" \
              -d '${JSON.stringify({ body: `Quote signed online by ${name} on ${new Date(q.signedAt!).toLocaleString("en-US")} (IP ${ip || "n/a"}). Total: ${q.total.toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0})} — ${q.loads} load${q.loads>1?"s":""} × $${q.pricePerLoad}.` }).replace(/'/g, "'\\''")}'`,
            { timeout: 8000 }
          );
        } catch (ghlErr: any) {
          console.warn("GHL tag/note on sign failed:", ghlErr.message);
        }
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("sign-quote error:", e.message);
      res.status(500).json({ success: false, error: "Server error. Please call us to confirm." });
    }
  });

}
