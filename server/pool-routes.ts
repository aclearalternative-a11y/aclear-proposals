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
function buildPoolQuoteEmail(params: {
  firstName: string; lastName: string;
  address: string; city: string; state: string; zip: string;
  phone?: string; email: string;
  price: string; town: string; county: string;
  poolType?: string; poolSurface?: string; installType?: string;
  gallons?: number; deliveryDate?: string; deliveryTime?: string;
}): string {
  const { firstName, lastName, address, city, state, zip, price, town, county,
          poolType, poolSurface, installType, gallons, deliveryDate, deliveryTime } = params;
  const fullName = `${firstName} ${lastName}`;
  const priceNum = parseFloat(price);
  const priceFormatted = priceNum.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Pool Water Delivery Quote — A Clear Alternative</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; background: #f4f4f4; color: #333; }
  .wrapper { max-width: 620px; margin: 30px auto; background: #ffffff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { background-color: #1d8fc4; padding: 24px 28px; }
  .header h1 { color: #fff; font-size: 26px; font-weight: 800; letter-spacing: 0.2px; }
  .header p { color: rgba(255,255,255,0.88); font-size: 13px; margin-top: 3px; }
  .header .contact-info { color: rgba(255,255,255,0.85); font-size: 11px; margin-top: 10px; line-height: 1.7; }
  .body { padding: 28px; }
  .greeting { font-size: 16px; color: #222; margin-bottom: 16px; line-height: 1.6; }
  .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #1d8fc4; margin-bottom: 8px; margin-top: 22px; }
  .info-box { background: #eaf5fb; border-left: 4px solid #1d8fc4; padding: 14px 16px; border-radius: 0 4px 4px 0; margin-bottom: 6px; }
  .info-box .name { font-size: 17px; font-weight: 700; color: #111; }
  .info-box .detail { font-size: 13px; color: #555; margin-top: 3px; line-height: 1.6; }
  .quote-box { border: 2px solid #1d8fc4; border-radius: 6px; overflow: hidden; margin: 20px 0; }
  .quote-header { background-color: #1d8fc4; padding: 12px 18px; }
  .quote-header span { color: #fff; font-size: 14px; font-weight: 700; }
  .quote-body { padding: 18px; }
  .quote-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .quote-row:last-child { border-bottom: none; }
  .quote-row .label { color: #555; }
  .quote-row .value { font-weight: 600; color: #222; }
  .quote-row.total-row .label { font-size: 16px; font-weight: 700; color: #1d8fc4; }
  .quote-row.total-row .value { font-size: 20px; font-weight: 800; color: #1d8fc4; }
  .includes { background: #f8fffe; border: 1px solid #d0eef9; border-radius: 4px; padding: 14px 16px; margin: 16px 0; }
  .includes ul { list-style: none; }
  .includes ul li { font-size: 13px; color: #444; padding: 3px 0; }
  .includes ul li::before { content: "✓ "; color: #1d8fc4; font-weight: 700; }
  .cta { background: #1d8fc4; color: #fff; padding: 14px 22px; border-radius: 5px; text-align: center; text-decoration: none; font-size: 15px; font-weight: 700; display: inline-block; margin: 8px 0; }
  .note { font-size: 12px; color: #777; margin-top: 18px; line-height: 1.7; font-style: italic; }
  .footer { background: #1d8fc4; padding: 20px 28px; }
  .footer p { color: rgba(255,255,255,0.9); font-size: 12px; line-height: 1.8; }
  .footer .rep { color: #fff; font-size: 14px; font-weight: 700; margin-top: 6px; }
</style>
</head>
<body>
<div class="wrapper">

  <!-- HEADER -->
  <div class="header">
    <h1>A Clear Alternative</h1>
    <p>Pool Water Delivery Quote</p>
    <div class="contact-info">
      9230 Collins Ave, Pennsauken, NJ 08110 &nbsp;|&nbsp; (856) 663-8088<br>
      info@aclear.com &nbsp;|&nbsp; www.aclear.com
    </div>
  </div>

  <!-- BODY -->
  <div class="body">

    <p class="greeting">
      Dear ${firstName},<br><br>
      Thank you for contacting A Clear Alternative! We're pleased to provide you with a
      quote for bulk swimming pool water delivery to your location in <strong>${town}</strong>.
      Below you'll find your personalized pricing and everything that's included.
    </p>

    <!-- DELIVERY DETAILS -->
    <div class="section-label">Delivery Details</div>
    <div class="info-box">
      <div class="name">${fullName}</div>
      <div class="detail">
        ${address}<br>
        ${city}, ${state} ${zip}<br>
        ${county} County
      </div>
    </div>
    <div class="detail" style="font-size:12px;color:#888;margin-top:4px;">Quote Date: ${today}</div>

    <!-- QUOTE -->
    <div class="quote-box">
      <div class="quote-header"><span>Pool Water Delivery — Your Quote</span></div>
      <div class="quote-body">
        <div class="quote-row">
          <span class="label">Service</span>
          <span class="value">Swimming Pool Fill — Bulk Water Delivery</span>
        </div>
        <div class="quote-row">
          <span class="label">Delivery Location</span>
          <span class="value">${town}, NJ ${zip}</span>
        </div>
        ${poolType ? `<div class="quote-row"><span class="label">Pool Type</span><span class="value">${formatPoolType(poolType, poolSurface, installType)}</span></div>` : ""}
        ${gallons ? `<div class="quote-row"><span class="label">Estimated Gallons</span><span class="value">${gallons.toLocaleString()} gal</span></div>` : ""}
        ${deliveryDate ? `<div class="quote-row"><span class="label">Requested Delivery</span><span class="value">${deliveryDate}${deliveryTime ? ` — ${deliveryTime}` : ""}</span></div>` : ""}
        <div class="quote-row total-row">
          <span class="label">Your Price</span>
          <span class="value">${priceFormatted}</span>
        </div>
      </div>
    </div>

    <!-- WHAT'S INCLUDED -->
    <div class="section-label">What's Included</div>
    <div class="includes">
      <ul>
        <li>Full truckload of potable-grade bulk water</li>
        <li>Delivery to your address in ${town}</li>
        <li>Professional, on-time service</li>
        <li>Friendly, experienced delivery team</li>
      </ul>
    </div>

    <!-- CTA -->
    <p style="font-size:14px;color:#333;margin-bottom:12px;">
      Ready to schedule your delivery or have questions? Give us a call or reply to this email
      and we'll get you on the calendar right away.
    </p>

    <a href="tel:+18566638088" class="cta">Call to Schedule: (856) 663-8088</a>

    <p class="note">
      This quote is valid for 30 days from the date above. Pricing is based on your delivery zip code
      and may be subject to change if location details differ. Additional loads may be available —
      contact us for multi-load pricing.
    </p>

  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p>Thank you for choosing A Clear Alternative.<br>
    We look forward to serving you!</p>
    <div class="rep">A Clear Alternative &mdash; (856) 663-8088 &nbsp;|&nbsp; info@aclear.com</div>
  </div>

</div>
</body>
</html>`;
}

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
}): Promise<void> {
  const { firstName, lastName, address, city, state, zip, phone, email, entry, contactId, opportunityId,
          poolType, poolSurface, installType, gallons, deliveryDate, deliveryTime } = params;
  const fullName = `${firstName} ${lastName}`;
  const mailer = getMailer();

  // 1. Professional quote email TO CUSTOMER (only if email provided)
  if (email) {
    const quoteHtml = buildPoolQuoteEmail({
      firstName, lastName, address, city, state, zip,
      phone, email,
      price: entry?.price || "0",
      town: entry?.town || city,
      county: entry?.county || "",
      poolType, poolSurface, installType, gallons, deliveryDate, deliveryTime,
    });

    const brochure = getBrochureAttachment();
    await mailer.sendMail({
      from: `"A Clear Alternative" <aclearalternative@gmail.com>`,
      to: email,
      // bcc removed per John's request — only aclearalternative@gmail.com for now
      subject: `Your Pool Water Delivery Quote — A Clear Alternative`,
      html: quoteHtml,
      text: `Dear ${firstName},\n\nThank you for contacting A Clear Alternative!\n\nWe're pleased to provide your pool water delivery quote for ${entry?.town || city}, NJ.\n\nYour Price: ${entry ? `$${entry.price}` : "See attached"}\n\nAttached: Pool and Hot Tub Water Delivery brochure — why professional water hauling is faster, safer, and better than filling with a hose or well.\n\nTo schedule your delivery, call us at (856) 663-8088 or reply to this email.\n\nA Clear Alternative\n9230 Collins Ave, Pennsauken, NJ 08110\n1-888-577-8088 | info@aclear.com`,
      attachments: brochure ? [brochure] : [],
    });
  }

  // 2. Internal notification email (always sent)
  const priceNote = entry ? `\nQuoted: $${entry.price} (${entry.town}, ${entry.county} County)` : "\n(zip not in delivery zone — needs manual review)";
  const poolDetails = [
    poolType ? `Pool Type: ${formatPoolType(poolType, poolSurface, installType)}` : null,
    gallons ? `Gallons Needed: ${gallons.toLocaleString()}` : null,
    deliveryDate ? `Requested Delivery: ${deliveryDate}${deliveryTime ? ` @ ${deliveryTime}` : ""}` : null,
  ].filter(Boolean).join("\n");

  await mailer.sendMail({
    from: `"A Clear Alternative — Jessica" <aclearalternative@gmail.com>`,
    to: "aclearalternative@gmail.com",
    subject: `🏊 New Pool Water Lead — ${fullName} (${zip || "??"})`,
    text: `New pool water inquiry via Jessica (AI Phone Agent):\n\nName: ${fullName}\nAddress: ${address}, ${city}, ${state} ${zip}\nPhone: ${phone || "not provided"}\nEmail: ${email || "not provided"}${priceNote}${poolDetails ? "\n\n— Pool Details —\n" + poolDetails : ""}\n\nAdded to GHL → Swimming Pool Water → New Lead\nContact ID: ${contactId || "n/a"}\nOpportunity ID: ${opportunityId || "n/a"}\n\n${email ? "✅ Quote email sent to customer." : "⚠️  No email address — quote NOT sent. Follow up by phone."}\n\n— Jessica, A Clear Alternative AI`,
  });
}

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
  app.post("/api/pool/ali-webhook", async (req: Request, res: Response) => {
    const { action, zip, phone, email, address, city, state } = req.body;
    // Voice AI sends snake_case params; accept both formats
    const firstName = req.body.firstName || req.body.first_name;
    const lastName  = req.body.lastName  || req.body.last_name;
    const poolType    = req.body.poolType    || req.body.pool_type;    // inground | above_ground | hot_tub
    const poolSurface = req.body.poolSurface || req.body.pool_surface; // plaster | liner
    const installType = req.body.installType || req.body.install_type; // new | existing | diy | professional
    const gallons     = req.body.gallons ? parseInt(String(req.body.gallons).replace(/\D/g, "")) || undefined : undefined;
    const deliveryDate = req.body.deliveryDate || req.body.delivery_date;
    const deliveryTime = req.body.deliveryTime || req.body.delivery_time;
    const shape     = req.body.shape;
    const length    = req.body.length    ? parseFloat(req.body.length)    : undefined;
    const width     = req.body.width     ? parseFloat(req.body.width)     : undefined;
    const diameter  = req.body.diameter  ? parseFloat(req.body.diameter)  : undefined;
    const avgDepth  = req.body.avg_depth || req.body.avgDepth || req.body.depth
                        ? parseFloat(req.body.avg_depth || req.body.avgDepth || req.body.depth)
                        : undefined;

    // — Zip check (mid-call) —
    if (action === "check_zip") {
      const cleanZip = normalizeZip(zip);
      console.log(`[check_zip] raw=${JSON.stringify(zip)} normalized=${cleanZip}`);
      const entry = zipData[cleanZip];
      if (entry) {
        return res.json({
          delivers: true, zip: cleanZip, town: entry.town,
          message: `Great news! We deliver to ${entry.town}. After you supply me with all of your information I can get you an accurate quote.`,
        });
      }
      return res.json({
        delivers: false, zip: cleanZip,
        message: `Unfortunately we do not cover that area.`,
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
    if (action === "save_lead") {
      try {
        const cleanZip = normalizeZip(zip);
        console.log(`[save_lead] zip raw=${JSON.stringify(zip)} normalized=${cleanZip}`);
        const entry = cleanZip ? zipData[cleanZip] : undefined;

        // Auto-estimate if caller gave dimensions but no gallons
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

        return res.json({ success: true, contactId, opportunityId });
      } catch (e: any) {
        console.error("Pool save_lead error:", e.message);
        return res.status(500).json({ error: e.message });
      }
    }

    res.status(400).json({ error: "Unknown action. Use check_zip, check_pool_type, estimate_gallons, or save_lead." });
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/leads  — direct lead creation (GHL workflow / manual)
  // -----------------------------------------------------------------------
  app.post("/api/pool/leads", async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, address, city, state, zip, phone, email } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: "First and last name are required." });

      const cleanZip = (zip || "").toString().trim();
      const entry = cleanZip ? zipData[cleanZip] : undefined;

      const { contactId, opportunityId } = await createPoolLead({
        firstName, lastName, address, city, state, zip: cleanZip, phone, email,
        price: entry?.price, town: entry?.town,
      });

      await sendPoolLeadEmails({
        firstName, lastName,
        address: address || "",
        city: city || entry?.town || "",
        state: state || "NJ",
        zip: cleanZip, phone, email, entry,
        contactId, opportunityId,
      });

      res.json({ success: true, contactId, opportunityId });
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


}
