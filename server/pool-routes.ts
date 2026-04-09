// =============================================================================
// POOL WATER AI AGENT ROUTES — Ali (Bulk Water / Swimming Pool)
// =============================================================================
import type { Express, Request, Response } from "express";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import nodemailer from "nodemailer";

const GHL_API_KEY = process.env.GHL_API_KEY || "pit-24e8e4ec-6172-44e0-b0d7-6a621b9b4bc7";
const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
const POOL_PIPELINE_ID = "xNaG2uwpPxq6BePj7zR8";
const POOL_STAGE_NEW_LEAD = "8c4c4efa-a7d9-4020-9c88-d181cd0ba6b3";
const POOL_SHEET_ID = "1yJEFzqwntC0DYlJRv9mHILctsFZSnt5Ij4yS-m3i8qY";

// ---------------------------------------------------------------------------
// Zip Code Data — loaded from pool_zip_data.json, refreshable on demand
// Format: { "08110": { price: "600.00", town: "Pennsauken", county: "Camden", state: "NJ" } }
// ---------------------------------------------------------------------------
interface ZipEntry { price: string; town: string; county: string; state: string; }
let zipData: Record<string, ZipEntry> = {};
let zipDataLoaded = false;

function loadZipData() {
  try {
    const dataPath = path.join(__dirname, "pool_zip_data.json");
    const raw = fs.readFileSync(dataPath, "utf8");
    zipData = JSON.parse(raw);
    zipDataLoaded = true;
    console.log(`Pool zip data loaded: ${Object.keys(zipData).length} deliverable zones`);
  } catch (e: any) {
    console.error("Failed to load pool_zip_data.json:", e.message);
  }
}
loadZipData();

// ---------------------------------------------------------------------------
// Gmail transporter (reuses same creds as water treatment app)
// ---------------------------------------------------------------------------
function getMailer() {
  const gmailUser = process.env.GMAIL_USER || "aclearalternative@gmail.com";
  const gmailPass = process.env.GMAIL_APP_PASSWORD || "kcjswmfawaaugwqo";
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true, family: 4,
    auth: { user: gmailUser, pass: gmailPass },
  });
}

// ---------------------------------------------------------------------------
// GHL contact upsert + Swimming Pool Water opportunity creator
// ---------------------------------------------------------------------------
async function createPoolLead(params: {
  firstName: string; lastName: string;
  address?: string; city?: string; state?: string; zip?: string;
  phone?: string; email?: string;
  price?: string; town?: string;
}): Promise<{ contactId: string | null; opportunityId: string | null }> {
  const { firstName, lastName, address, city, state, zip, phone, email, price, town } = params;
  const fullName = `${firstName} ${lastName}`;
  const priceNum = price ? parseFloat(price) : 0;

  // 1. Upsert GHL contact
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

  // 2. Create opportunity in Swimming Pool Water pipeline
  if (contactId) {
    const oppPayload = {
      pipelineId: POOL_PIPELINE_ID,
      locationId: GHL_LOCATION_ID,
      name: `${fullName} — Pool Water (${zip || ""})`,
      pipelineStageId: POOL_STAGE_NEW_LEAD,
      contactId,
      status: "open",
      monetaryValue: priceNum || 0,
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

    const oppData = JSON.parse(oppRes);
    opportunityId = oppData?.opportunity?.id || null;
  }

  return { contactId, opportunityId };
}

export function registerPoolRoutes(app: Express) {

  // -----------------------------------------------------------------------
  // GET /api/pool/check-zip?zip=08110
  // Ali calls this mid-call after getting the customer's zip code.
  // Returns: delivers (bool), price, town, and a message Ali can speak aloud.
  // -----------------------------------------------------------------------
  app.get("/api/pool/check-zip", async (req: Request, res: Response) => {
    if (!zipDataLoaded) loadZipData();

    const zip = (req.query.zip as string || "").trim().replace(/\D/g, "");
    if (!zip || zip.length !== 5) {
      return res.status(400).json({ delivers: false, message: "Please provide a valid 5-digit zip code." });
    }

    const entry = zipData[zip];
    if (entry) {
      const priceFormatted = parseFloat(entry.price).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
      return res.json({
        delivers: true,
        zip,
        town: entry.town,
        county: entry.county,
        state: entry.state,
        price: entry.price,
        priceFormatted,
        message: `Great news! We do deliver to ${entry.town}. The price for a standard pool fill in your area is ${priceFormatted}. Let me get a few more details from you.`,
      });
    } else {
      return res.json({
        delivers: false,
        zip,
        message: `I'm sorry, we don't currently deliver to zip code ${zip}. We serve parts of New Jersey, Pennsylvania, and Delaware. If you have another address or zip code I can check that for you.`,
      });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/leads
  // Direct API endpoint to create a pool water lead in GHL.
  // Can be called from a GHL workflow, Zapier, or manually.
  // -----------------------------------------------------------------------
  app.post("/api/pool/leads", async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, address, city, state, zip, phone, email } = req.body;
      if (!firstName || !lastName) {
        return res.status(400).json({ error: "First and last name are required." });
      }

      const entry = zip ? zipData[zip.trim()] : undefined;
      const { contactId, opportunityId } = await createPoolLead({
        firstName, lastName, address, city, state, zip, phone, email,
        price: entry?.price, town: entry?.town,
      });

      // Notification email
      const fullName = `${firstName} ${lastName}`;
      const priceNote = entry ? ` — Quoted price: $${entry.price} (${entry.town}, ${entry.county} County)` : "";
      await getMailer().sendMail({
        from: `"A Clear Alternative — Ali" <aclearalternative@gmail.com>`,
        to: "aclearalternative@gmail.com",
        bcc: ["asmith@aclear.com", "water325@aol.com"],
        subject: `🏊 New Pool Water Lead — ${fullName} (${zip || "zip unknown"})`,
        text: `New pool water inquiry captured by Ali (AI Phone Agent):\n\nName: ${fullName}\nAddress: ${address || ""}, ${city || ""}, ${state || "NJ"} ${zip || ""}\nPhone: ${phone || "not provided"}\nEmail: ${email || "not provided"}\n${priceNote}\n\nContact added to GHL → Swimming Pool Water → New Lead.\nGHL Contact ID: ${contactId}\nGHL Opportunity ID: ${opportunityId}\n\n— Ali, A Clear Alternative AI Phone Agent`,
      });

      res.json({ success: true, contactId, opportunityId, message: `Lead created for ${fullName}` });
    } catch (err: any) {
      console.error("Pool lead error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/ali-webhook
  // Single webhook Ali calls during and after the call.
  // action = "check_zip"  → verify delivery area + return price
  // action = "save_lead"  → create GHL contact/opportunity + send email
  // -----------------------------------------------------------------------
  app.post("/api/pool/ali-webhook", async (req: Request, res: Response) => {
    const { action, zip, firstName, lastName, address, city, state, phone, email } = req.body;

    if (action === "check_zip") {
      if (!zipDataLoaded) loadZipData();
      const cleanZip = (zip || "").toString().trim().replace(/\D/g, "");
      const entry = zipData[cleanZip];
      if (entry) {
        const priceFormatted = parseFloat(entry.price).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
        return res.json({
          delivers: true, zip: cleanZip, town: entry.town, price: entry.price, priceFormatted,
          message: `Great news! We deliver to ${entry.town}. The price for your area is ${priceFormatted}.`,
        });
      } else {
        return res.json({
          delivers: false, zip: cleanZip,
          message: `We don't currently deliver to zip code ${cleanZip}.`,
        });
      }
    }

    if (action === "save_lead") {
      try {
        const entry = zip ? zipData[(zip || "").toString().trim()] : undefined;
        const { contactId, opportunityId } = await createPoolLead({
          firstName, lastName, address, city, state, zip, phone, email,
          price: entry?.price, town: entry?.town,
        });

        const fullName = `${firstName || ""} ${lastName || ""}`.trim();
        const priceNote = entry ? ` — Quoted: $${entry.price} (${entry.town})` : "";
        await getMailer().sendMail({
          from: `"A Clear Alternative — Ali" <aclearalternative@gmail.com>`,
          to: "aclearalternative@gmail.com",
          bcc: ["asmith@aclear.com", "water325@aol.com"],
          subject: `🏊 New Pool Water Lead — ${fullName} (${zip || "??"})`,
          text: `New pool water inquiry captured by Ali:\n\nName: ${fullName}\nAddress: ${address || ""}, ${city || ""}, ${state || "NJ"} ${zip || ""}\nPhone: ${phone || "not provided"}\nEmail: ${email || "not provided"}\n${priceNote}\n\nAdded to GHL Swimming Pool Water pipeline → New Lead.\n\n— Ali, A Clear Alternative AI`,
        });

        return res.json({ success: true, contactId, opportunityId });
      } catch (e: any) {
        return res.status(500).json({ error: e.message });
      }
    }

    res.status(400).json({ error: "Unknown action. Use check_zip or save_lead." });
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/refresh-zips  (protected — internal use only)
  // Regenerates pool_zip_data.json from the live Google Sheet.
  // Call this after updating prices in the sheet.
  // -----------------------------------------------------------------------
  app.post("/api/pool/refresh-zips", async (req: Request, res: Response) => {
    const secret = req.headers["x-refresh-secret"];
    if (secret !== (process.env.REFRESH_SECRET || "aclear2026")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      // Fetch the sheet via Google Sheets export (CSV)
      const csvUrl = `https://docs.google.com/spreadsheets/d/${POOL_SHEET_ID}/export?format=csv&gid=1587801827`;
      const csvRaw = execSync(`curl -sL "${csvUrl}"`, { timeout: 15000 }).toString();
      const lines = csvRaw.split("\n").filter(Boolean);
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

      const newMap: Record<string, ZipEntry> = {};
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const zip = (cols[0] || "").trim();
        const county = (cols[1] || "").trim();
        const state = (cols[2] || "").trim();
        const town = (cols[3] || "").trim();
        const pool = (cols[4] || "").trim().toLowerCase();
        const priceRaw = (cols[5] || "").replace(/[$, ]/g, "").trim();
        if (zip && pool === "yes" && priceRaw) {
          newMap[zip] = { price: priceRaw, town, county, state };
        }
      }

      const dataPath = path.join(__dirname, "pool_zip_data.json");
      fs.writeFileSync(dataPath, JSON.stringify(newMap, null, 2), "utf8");
      zipData = newMap;
      zipDataLoaded = true;

      res.json({ success: true, zones: Object.keys(newMap).length, message: "Zip data refreshed from Google Sheet" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

}
