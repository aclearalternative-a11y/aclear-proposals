// =============================================================================
// POOL WATER AI AGENT ROUTES — Ali (Bulk Water / Swimming Pool)
// =============================================================================
import type { Express, Request, Response } from "express";
import { execSync } from "child_process";
import * as fs from "fs";
import nodemailer from "nodemailer";
import { POOL_ZIP_DATA } from "./pool_zip_data";

const GHL_API_KEY = process.env.GHL_API_KEY || "pit-d7eddf87-065e-4031-a399-3b3fc4a8af97";
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
// Professional pool water quote email — sent TO the customer
// ---------------------------------------------------------------------------
function buildPoolQuoteEmail(params: {
  firstName: string; lastName: string;
  address: string; city: string; state: string; zip: string;
  phone?: string; email: string;
  price: string; town: string; county: string;
}): string {
  const { firstName, lastName, address, city, state, zip, price, town, county } = params;
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
}): Promise<{ contactId: string | null; opportunityId: string | null }> {
  const { firstName, lastName, address, city, state, zip, phone, email, price, town } = params;
  const priceNum = price ? parseFloat(price) : 0;

  const contactPayload = {
    locationId: GHL_LOCATION_ID,
    firstName, lastName,
    phone: phone || "",
    email: email || "",
    address1: address || "",
    city: city || town || "",
    state: state || "NJ",
    postalCode: zip || "",
    tags: ["Pool Water Lead", "Ali AI Call"],
    source: "AI Phone — Ali",
  };

  const contactRes = execSync(
    `curl -s -X POST "https://services.leadconnectorhq.com/contacts/upsert" \
      -H "Authorization: Bearer ${GHL_API_KEY}" \
      -H "Version: 2021-07-28" \
      -H "Content-Type: application/json" \
      -d '${JSON.stringify(contactPayload).replace(/'/g, "'\\''")}'`,
    { timeout: 10000 }
  ).toString();

  const contactData = JSON.parse(contactRes);
  const contactId = contactData?.contact?.id || contactData?.id || null;
  let opportunityId: string | null = null;

  if (contactId) {
    const oppPayload = {
      pipelineId: POOL_PIPELINE_ID,
      locationId: GHL_LOCATION_ID,
      name: `${firstName} ${lastName} — Pool Water (${zip || ""})`,
      pipelineStageId: POOL_STAGE_NEW_LEAD,
      contactId,
      status: "open",
      monetaryValue: priceNum,
      source: "Ali AI Phone Agent",
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
  }

  return { contactId, opportunityId };
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
}): Promise<void> {
  const { firstName, lastName, address, city, state, zip, phone, email, entry, contactId, opportunityId } = params;
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
    });

    await mailer.sendMail({
      from: `"A Clear Alternative" <aclearalternative@gmail.com>`,
      to: email,
      // bcc removed per John's request — only aclearalternative@gmail.com for now
      subject: `Your Pool Water Delivery Quote — A Clear Alternative`,
      html: quoteHtml,
      text: `Dear ${firstName},\n\nThank you for contacting A Clear Alternative!\n\nWe're pleased to provide your pool water delivery quote for ${entry?.town || city}, NJ.\n\nYour Price: ${entry ? `$${entry.price}` : "See attached"}\n\nTo schedule your delivery, call us at (856) 663-8088 or reply to this email.\n\nA Clear Alternative\n9230 Collins Ave, Pennsauken, NJ 08110\n(856) 663-8088 | info@aclear.com`,
    });
  }

  // 2. Internal notification email (always sent)
  const priceNote = entry ? `\nQuoted: $${entry.price} (${entry.town}, ${entry.county} County)` : "\n(zip not in delivery zone — needs manual review)";
  await mailer.sendMail({
    from: `"A Clear Alternative — Ali" <aclearalternative@gmail.com>`,
    to: "aclearalternative@gmail.com",
    // bcc removed per John's request — only aclearalternative@gmail.com for now
    subject: `🏊 New Pool Water Lead — ${fullName} (${zip || "??"})`,
    text: `New pool water inquiry via Ali (AI Phone Agent):\n\nName: ${fullName}\nAddress: ${address}, ${city}, ${state} ${zip}\nPhone: ${phone || "not provided"}\nEmail: ${email || "not provided"}${priceNote}\n\nAdded to GHL → Swimming Pool Water → New Lead\nContact ID: ${contactId || "n/a"}\nOpportunity ID: ${opportunityId || "n/a"}\n\n${email ? "✅ Quote email sent to customer." : "⚠️  No email address — quote NOT sent. Follow up by phone."}\n\n— Ali, A Clear Alternative AI`,
  });
}

export function registerPoolRoutes(app: Express) {

  // -----------------------------------------------------------------------
  // GET /api/pool/check-zip?zip=08110
  // Ali calls mid-call. Returns delivers (bool) and a spoken confirmation.
  // Price is NOT included in the spoken message — quote is sent via email.
  // -----------------------------------------------------------------------
  app.get("/api/pool/check-zip", (req: Request, res: Response) => {
    const zip = (req.query.zip as string || "").trim().replace(/\D/g, "");
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
  // action = "check_zip" → delivery confirmation, no price spoken
  // action = "save_lead" → GHL contact/opportunity + quote email to customer
  // -----------------------------------------------------------------------
  app.post("/api/pool/ali-webhook", async (req: Request, res: Response) => {
    const { action, zip, phone, email, address, city, state } = req.body;
    // Voice AI sends snake_case params; accept both formats
    const firstName = req.body.firstName || req.body.first_name;
    const lastName  = req.body.lastName  || req.body.last_name;

    // — Zip check (mid-call) —
    if (action === "check_zip") {
      const cleanZip = (zip || "").toString().trim().replace(/\D/g, "");
      const entry = zipData[cleanZip];
      if (entry) {
        return res.json({
          delivers: true, zip: cleanZip, town: entry.town,
          message: `Great news! We deliver to ${entry.town}. We'll send a professional quote to your email right after this call.`,
        });
      }
      return res.json({
        delivers: false, zip: cleanZip,
        message: `We don't currently deliver to zip code ${cleanZip}.`,
      });
    }

    // — Save lead (end of call) —
    if (action === "save_lead") {
      try {
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
          zip: cleanZip,
          phone, email, entry,
          contactId, opportunityId,
        });

        return res.json({ success: true, contactId, opportunityId });
      } catch (e: any) {
        console.error("Pool save_lead error:", e.message);
        return res.status(500).json({ error: e.message });
      }
    }

    res.status(400).json({ error: "Unknown action. Use check_zip or save_lead." });
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
