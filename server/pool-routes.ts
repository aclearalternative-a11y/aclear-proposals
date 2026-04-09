// =============================================================================
// POOL WATER AI AGENT ROUTES — Ali (Bulk Water / Swimming Pool)
// =============================================================================
import type { Express, Request, Response } from "express";
import { execSync } from "child_process";
import * as fs from "fs";
import nodemailer from "nodemailer";

const GHL_API_KEY = process.env.GHL_API_KEY || "pit-24e8e4ec-6172-44e0-b0d7-6a621b9b4bc7";
const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
const POOL_PIPELINE_ID = "xNaG2uwpPxq6BePj7zR8";
const POOL_STAGE_NEW_LEAD = "8c4c4efa-a7d9-4020-9c88-d181cd0ba6b3";
const POOL_SHEET_ID = "1yJEFzqwntC0DYlJRv9mHILctsFZSnt5Ij4yS-m3i8qY";

// Persistent path on Render disk (survives deploys, doesn't reset)
const DATA_PATH = "/data/pool_zip_data.json";

// ---------------------------------------------------------------------------
// Zip data bundled at build time — esbuild includes JSON imports inline.
// Used to seed /data/pool_zip_data.json on first deploy.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bundledZipData: Record<string, ZipEntry> = require("./pool_zip_data.json");

interface ZipEntry { price: string; town: string; county: string; state: string; }
let zipData: Record<string, ZipEntry> = {};

function loadZipData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      zipData = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      console.log(`Pool zip data loaded from disk: ${Object.keys(zipData).length} zones`);
    } else {
      // First deploy — seed from bundled data, save to disk
      zipData = bundledZipData;
      fs.mkdirSync("/data", { recursive: true });
      fs.writeFileSync(DATA_PATH, JSON.stringify(zipData, null, 2), "utf8");
      console.log(`Pool zip data seeded from bundle: ${Object.keys(zipData).length} zones`);
    }
  } catch (e: any) {
    // Fallback to bundled data (dev or disk unavailable)
    zipData = bundledZipData;
    console.warn("Pool zip data: using bundled fallback. Error:", e.message);
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
// Helper — format price string
// ---------------------------------------------------------------------------
function fmtPrice(price: string): string {
  return parseFloat(price).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

export function registerPoolRoutes(app: Express) {

  // -----------------------------------------------------------------------
  // GET /api/pool/check-zip?zip=08110
  // Ali calls mid-call after getting the customer's zip code.
  // Returns delivers (bool), price, town, and a spoken message.
  // -----------------------------------------------------------------------
  app.get("/api/pool/check-zip", (req: Request, res: Response) => {
    const zip = (req.query.zip as string || "").trim().replace(/\D/g, "");
    if (!zip || zip.length !== 5) {
      return res.status(400).json({ delivers: false, message: "Please provide a valid 5-digit zip code." });
    }

    const entry = zipData[zip];
    if (entry) {
      return res.json({
        delivers: true, zip, town: entry.town, county: entry.county,
        state: entry.state, price: entry.price, priceFormatted: fmtPrice(entry.price),
        message: `Great news! We do deliver to ${entry.town}. The price for a standard pool fill in your area is ${fmtPrice(entry.price)}. Let me get a few more details from you.`,
      });
    }

    return res.json({
      delivers: false, zip,
      message: `I'm sorry, we don't currently deliver to zip code ${zip}. We serve parts of New Jersey, Pennsylvania, and Delaware. If you have another address or zip code I can check that for you.`,
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/leads  — direct lead creation (GHL workflow or manual)
  // -----------------------------------------------------------------------
  app.post("/api/pool/leads", async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, address, city, state, zip, phone, email } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: "First and last name are required." });

      const entry = zip ? zipData[zip.trim()] : undefined;
      const { contactId, opportunityId } = await createPoolLead({
        firstName, lastName, address, city, state, zip, phone, email,
        price: entry?.price, town: entry?.town,
      });

      const fullName = `${firstName} ${lastName}`;
      const priceNote = entry ? `\nQuoted price: ${fmtPrice(entry.price)} (${entry.town}, ${entry.county} County)` : "";

      await getMailer().sendMail({
        from: `"A Clear Alternative — Ali" <aclearalternative@gmail.com>`,
        to: "aclearalternative@gmail.com",
        bcc: ["asmith@aclear.com", "water325@aol.com"],
        subject: `🏊 New Pool Water Lead — ${fullName} (${zip || "zip unknown"})`,
        text: `New pool water inquiry captured by Ali (AI Phone Agent):\n\nName: ${fullName}\nAddress: ${address || ""}, ${city || ""}, ${state || "NJ"} ${zip || ""}\nPhone: ${phone || "not provided"}\nEmail: ${email || "not provided"}${priceNote}\n\nAdded to GHL → Swimming Pool Water → New Lead\nContact ID: ${contactId}\nOpportunity ID: ${opportunityId}\n\n— Ali, A Clear Alternative AI`,
      });

      res.json({ success: true, contactId, opportunityId });
    } catch (err: any) {
      console.error("Pool lead error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/ali-webhook
  // action = "check_zip" → delivery check + price
  // action = "save_lead" → GHL contact/opportunity + notification email
  // -----------------------------------------------------------------------
  app.post("/api/pool/ali-webhook", async (req: Request, res: Response) => {
    const { action, zip, firstName, lastName, address, city, state, phone, email } = req.body;

    if (action === "check_zip") {
      const cleanZip = (zip || "").toString().trim().replace(/\D/g, "");
      const entry = zipData[cleanZip];
      if (entry) {
        return res.json({
          delivers: true, zip: cleanZip, town: entry.town,
          price: entry.price, priceFormatted: fmtPrice(entry.price),
          message: `Great news! We deliver to ${entry.town}. The price for your area is ${fmtPrice(entry.price)}.`,
        });
      }
      return res.json({
        delivers: false, zip: cleanZip,
        message: `We don't currently deliver to zip code ${cleanZip}.`,
      });
    }

    if (action === "save_lead") {
      try {
        const cleanZip = (zip || "").toString().trim();
        const entry = cleanZip ? zipData[cleanZip] : undefined;
        const { contactId, opportunityId } = await createPoolLead({
          firstName, lastName, address, city, state, zip: cleanZip, phone, email,
          price: entry?.price, town: entry?.town,
        });

        const fullName = `${firstName || ""} ${lastName || ""}`.trim();
        const priceNote = entry ? `\nQuoted: ${fmtPrice(entry.price)} (${entry.town})` : "";

        await getMailer().sendMail({
          from: `"A Clear Alternative — Ali" <aclearalternative@gmail.com>`,
          to: "aclearalternative@gmail.com",
          bcc: ["asmith@aclear.com", "water325@aol.com"],
          subject: `🏊 New Pool Water Lead — ${fullName} (${cleanZip || "??"})`,
          text: `New pool water inquiry captured by Ali:\n\nName: ${fullName}\nAddress: ${address || ""}, ${city || ""}, ${state || "NJ"} ${cleanZip || ""}\nPhone: ${phone || "not provided"}\nEmail: ${email || "not provided"}${priceNote}\n\nAdded to GHL Swimming Pool Water pipeline → New Lead\n\n— Ali, A Clear Alternative AI`,
        });

        return res.json({ success: true, contactId, opportunityId });
      } catch (e: any) {
        return res.status(500).json({ error: e.message });
      }
    }

    res.status(400).json({ error: "Unknown action. Use check_zip or save_lead." });
  });

  // -----------------------------------------------------------------------
  // POST /api/pool/refresh-zips  (protected)
  // Fetches the live Google Sheet and updates /data/pool_zip_data.json.
  // Call this any time you update pricing in the sheet.
  // -----------------------------------------------------------------------
  app.post("/api/pool/refresh-zips", async (req: Request, res: Response) => {
    const secret = req.headers["x-refresh-secret"];
    if (secret !== (process.env.REFRESH_SECRET || "aclear2026")) {
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
