// =============================================================================
// POOL WATER AI AGENT ROUTES — Ali (Bulk Water / Swimming Pool)
// =============================================================================
import type { Express, Request, Response } from "express";
import { execSync } from "child_process";

const GHL_API_KEY = process.env.GHL_API_KEY || "pit-24e8e4ec-6172-44e0-b0d7-6a621b9b4bc7";
const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
const POOL_PIPELINE_ID = "xNaG2uwpPxq6BePj7zR8";       // Swimming Pool Water
const POOL_STAGE_NEW_LEAD = "8c4c4efa-a7d9-4020-9c88-d181cd0ba6b3";

// Google Sheet ID for Pool Delivery Zones
// John: Open your "Pool Database and Zip Codes 2026 copy.xlsx" in Google Drive
//       → File → Save as Google Sheet → copy the Sheet ID from the URL and set as env var
const POOL_ZIPCODE_SHEET_ID = process.env.POOL_ZIPCODE_SHEET_ID || "1kEl_9hNRFaz413XJYd7gR1rw9KVKX5ah";

// Cache zip codes in memory so we don't hit Sheets on every call (refreshes every 10 min)
let zipCache: Set<string> = new Set();
let zipCacheTime = 0;

async function getDeliveryZips(): Promise<Set<string>> {
  const now = Date.now();
  if (zipCache.size > 0 && now - zipCacheTime < 10 * 60 * 1000) return zipCache;

  try {
    const res = execSync(
      `curl -s "https://sheets.googleapis.com/v4/spreadsheets/${POOL_ZIPCODE_SHEET_ID}/values/A:A" \
        -H "Authorization: Bearer $(gcloud auth print-access-token 2>/dev/null || echo '')"`,
      { timeout: 8000 }
    ).toString();
    // If that fails, fall back to a hardcoded list from env
    const data = JSON.parse(res);
    if (data.values) {
      zipCache = new Set(data.values.flat().map((z: string) => z.toString().trim()));
      zipCacheTime = now;
    }
  } catch {
    // Fallback: read zip codes from environment variable (comma-separated)
    const envZips = process.env.POOL_DELIVERY_ZIPS || "";
    zipCache = new Set(envZips.split(",").map((z) => z.trim()).filter(Boolean));
    zipCacheTime = now;
  }
  return zipCache;
}

export function registerPoolRoutes(app: Express) {

  // ---------------------------------------------------------------------------
  // GET /api/pool/check-zip?zip=08110
  // Called by GHL Conversation AI during a live call to verify service area
  // ---------------------------------------------------------------------------
  app.get("/api/pool/check-zip", async (req: Request, res: Response) => {
    const zip = (req.query.zip as string || "").trim().replace(/\D/g, "");
    if (!zip || zip.length !== 5) {
      return res.status(400).json({ delivers: false, message: "Invalid zip code." });
    }

    const zips = await getDeliveryZips();
    const delivers = zips.has(zip);

    res.json({
      delivers,
      zip,
      message: delivers
        ? `Great news! We do deliver to ${zip}.`
        : `I'm sorry, we don't currently deliver to ${zip}. We serve parts of New Jersey, Pennsylvania, and Delaware.`,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/pool/leads
  // Called by GHL workflow when Ali finishes collecting customer info.
  // Creates/updates GHL contact and adds to Swimming Pool Water pipeline.
  // ---------------------------------------------------------------------------
  app.post("/api/pool/leads", async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, address, city, state, zip, phone, email, notes } = req.body;

      if (!firstName || !lastName) {
        return res.status(400).json({ error: "First and last name are required." });
      }

      const fullName = `${firstName} ${lastName}`;

      // 1. Upsert GHL contact
      const contactPayload: Record<string, any> = {
        locationId: GHL_LOCATION_ID,
        firstName,
        lastName,
        phone: phone || "",
        email: email || "",
        address1: address || "",
        city: city || "",
        state: state || "NJ",
        postalCode: zip || "",
        tags: ["Pool Water Lead", "Ali AI Call"],
        source: "AI Phone — Ali",
        customFields: [
          { key: "water_type", field_value: "Swimming Pool" },
        ],
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
      const contactId = contactData?.contact?.id || contactData?.id;
      console.log("Pool lead GHL contact:", contactId, fullName);

      // 2. Create opportunity in Swimming Pool Water pipeline
      if (contactId) {
        const oppPayload = {
          pipelineId: POOL_PIPELINE_ID,
          locationId: GHL_LOCATION_ID,
          name: `${fullName} — Pool Water`,
          pipelineStageId: POOL_STAGE_NEW_LEAD,
          contactId,
          status: "open",
          source: "Ali AI Phone Agent",
          notes: notes || `Pool water delivery inquiry. Zip: ${zip}. Captured via AI phone agent (Ali).`,
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
        console.log("Pool opportunity created:", oppData?.opportunity?.id);
      }

      // 3. Send internal notification email
      const gmailUser = "aclearalternative@gmail.com";
      const gmailPass = process.env.GMAIL_APP_PASSWORD || "kcjswmfawaaugwqo";
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true, family: 4,
        auth: { user: gmailUser, pass: gmailPass },
      });

      await transporter.sendMail({
        from: `"A Clear Alternative — Ali" <${gmailUser}>`,
        to: gmailUser,
        bcc: ["asmith@aclear.com", "water325@aol.com"],
        subject: `🏊 New Pool Water Lead — ${fullName} (${zip})`,
        text: `New pool water inquiry captured by Ali (AI Phone Agent):\n\nName: ${fullName}\nAddress: ${address}, ${city}, ${state} ${zip}\nPhone: ${phone || "not provided"}\nEmail: ${email || "not provided"}\n\nNotes: ${notes || "None"}\n\nContact added to GHL Swimming Pool Water pipeline at "New Lead" stage.\n\n— Ali, A Clear Alternative AI`,
      });

      res.json({ success: true, contactId, message: `Lead created for ${fullName}` });
    } catch (err: any) {
      console.error("Pool lead error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/pool/ali-webhook
  // GHL Conversation AI webhook — Ali sends caller data here during/after call
  // Handles mid-call zip checks AND end-of-call lead saves in one endpoint
  // ---------------------------------------------------------------------------
  app.post("/api/pool/ali-webhook", async (req: Request, res: Response) => {
    const { action, zip, firstName, lastName, address, city, state, phone, email } = req.body;

    if (action === "check_zip") {
      const zips = await getDeliveryZips();
      const delivers = zips.has((zip || "").trim());
      return res.json({
        delivers,
        message: delivers
          ? "We deliver to that area!"
          : "We don't currently deliver to that zip code.",
      });
    }

    if (action === "save_lead") {
      // Proxy to the leads endpoint logic
      req.body = { firstName, lastName, address, city, state, zip, phone, email };
      // Re-call leads handler inline
      try {
        const fullName = `${firstName} ${lastName}`;
        const contactPayload = {
          locationId: GHL_LOCATION_ID,
          firstName, lastName,
          phone: phone || "",
          email: email || "",
          address1: address || "",
          city: city || "",
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
        const contactId = contactData?.contact?.id || contactData?.id;
        if (contactId) {
          const oppPayload = {
            pipelineId: POOL_PIPELINE_ID,
            locationId: GHL_LOCATION_ID,
            name: `${fullName} — Pool Water`,
            pipelineStageId: POOL_STAGE_NEW_LEAD,
            contactId,
            status: "open",
            source: "Ali AI Phone Agent",
          };
          execSync(
            `curl -s -X POST "https://services.leadconnectorhq.com/opportunities/" \
              -H "Authorization: Bearer ${GHL_API_KEY}" \
              -H "Version: 2021-07-28" \
              -H "Content-Type: application/json" \
              -d '${JSON.stringify(oppPayload).replace(/'/g, "'\\''")}'`,
            { timeout: 10000 }
          );
        }
        return res.json({ success: true, contactId, name: fullName });
      } catch (e: any) {
        return res.status(500).json({ error: e.message });
      }
    }

    res.status(400).json({ error: "Unknown action. Use check_zip or save_lead." });
  });

}
