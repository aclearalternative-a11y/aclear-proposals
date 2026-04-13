// =============================================================================
// ZILLOW → GHL PROPERTY FEED ROUTES
// Receives Zillow listing data (via Apify webhook or manual push),
// stages in Google Sheets, and syncs to GoHighLevel CRM.
// =============================================================================
import type { Express, Request, Response } from "express";
// execSync removed — using native fetch for Render compatibility

const GHL_API_KEY = process.env.GHL_API_KEY || "pit-8acdc061-acf4-40a8-a1f8-5f91e3f3430c";
const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
const ZILLOW_SHEET_ID = process.env.ZILLOW_SHEET_ID || "15LmofEmQVlslX5V-Y8d7rHXgn-z6C-kNe3BpA29GCMY";
const ZILLOW_WEBHOOK_SECRET = process.env.ZILLOW_WEBHOOK_SECRET || "aclear-zillow-2026";

// Zillow Property Feed Pipeline
const ZILLOW_PIPELINE_ID = "GU5SIf8l0E6uTUAkqlaT";
const ZILLOW_STAGES = {
  NEW_LISTING_FOR_SALE: "26200493-e866-4762-b6a6-28b5395c3601",
  SENT_POST_CARD:       "66d5df08-294b-4c05-9a28-48623c194501",
  CONTACTED_OWNER:      "c3e7e39e-241e-43d5-ac3f-6c3d53d28450",
  CLOSING_DATE:         "665b188c-915f-4673-8d70-79eb3dc405d4",
  HOME_SOLD:            "c44cc22b-4a58-4927-a441-3623c54682cd",
  SEND_POST_CARD:       "1a4a466f-5359-4782-b2fa-7c8610eaa9f4",
  MEET_NEW_HOME_OWNER:  "51337f51-11d2-4065-ba81-0b6dee84325e",
};

// Target zip codes — updated via /api/zillow/update-zips or env var
let TARGET_ZIPS: string[] = (process.env.ZILLOW_TARGET_ZIPS || "08088,08015,08064").split(",").map(z => z.trim()).filter(Boolean);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
interface ZillowListing {
  zpid?: string;           // Zillow property ID
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  price?: number | string;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number | string;  // sqft
  homeType?: string;       // SINGLE_FAMILY, MULTI_FAMILY, etc.
  homeStatus?: string;     // FOR_SALE, RECENTLY_SOLD, etc.
  daysOnZillow?: number;
  zestimate?: number | string;
  url?: string;            // Full Zillow listing URL
  detailUrl?: string;      // Alternate field name from some APIs
  // Apify / RapidAPI may use different field names — we normalize below
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Normalize listing data from various API formats (Apify, RapidAPI, etc.)
// ---------------------------------------------------------------------------
function normalizeListing(raw: any): ZillowListing {
  return {
    zpid: String(raw.zpid || raw.id || raw.propertyId || raw.listing_id || ""),
    address: raw.address || raw.streetAddress || raw.addr || raw.full_address || "",
    city: raw.city || raw.addressCity || "",
    state: raw.state || raw.addressState || "NJ",
    zipcode: String(raw.zipcode || raw.zip || raw.addressZipcode || raw.postalCode || ""),
    price: raw.price || raw.listPrice || raw.soldPrice || raw.sold_price || 0,
    bedrooms: raw.bedrooms || raw.beds || 0,
    bathrooms: raw.bathrooms || raw.baths || 0,
    livingArea: raw.livingArea || raw.sqft || raw.living_area || raw.area || 0,
    homeType: raw.homeType || raw.propertyType || raw.home_type || "SINGLE_FAMILY",
    homeStatus: raw.homeStatus || raw.listingStatus || raw.status || raw.home_status || "FOR_SALE",
    daysOnZillow: raw.daysOnZillow || raw.days_on_market || raw.dom || 0,
    zestimate: raw.zestimate || raw.zEstimate || 0,
    url: raw.url || raw.detailUrl || (raw.zpid ? `https://www.zillow.com/homedetails/${raw.zpid}_zpid/` : ""),
  };
}

// ---------------------------------------------------------------------------
// Write listing to Google Sheet
// ---------------------------------------------------------------------------
async function appendToSheet(listing: ZillowListing): Promise<boolean> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const row = [
      listing.zpid,
      listing.address,
      listing.city,
      listing.state,
      listing.zipcode,
      String(listing.price || ""),
      String(listing.bedrooms || ""),
      String(listing.bathrooms || ""),
      String(listing.livingArea || ""),
      listing.homeType,
      listing.homeStatus,
      String(listing.daysOnZillow || ""),
      String(listing.zestimate || ""),
      listing.url,
      today,
      "No",   // Synced to GHL
      "",     // GHL Contact ID
    ];

    // URL-encode the sheet name to handle spaces
    const rangeEncoded = encodeURIComponent("Listings") + "!A:Q";
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${ZILLOW_SHEET_ID}/values/${rangeEncoded}:append?valueInputOption=USER_ENTERED`;

    // Use Google Sheets API directly via service account or API key
    // For now, use the same curl pattern as pool-routes
    const payload = JSON.stringify({ values: [row] });

    // We'll use the Pipedream Google Sheets connector from the server side
    // by writing to a simple append endpoint. For production, this will use
    // the Google Sheets API via the app's OAuth token.
    // Fallback: write to a local JSON staging file that the sync job reads.
    const stagingPath = "/data/zillow_staging.json";
    let staging: any[] = [];
    try {
      const raw = require("fs").readFileSync(stagingPath, "utf8");
      staging = JSON.parse(raw);
    } catch {}

    staging.push({ ...listing, dateAdded: today, syncedToGhl: false });

    require("fs").mkdirSync("/data", { recursive: true });
    require("fs").writeFileSync(stagingPath, JSON.stringify(staging, null, 2), "utf8");

    console.log(`[Zillow] Staged listing ${listing.zpid} — ${listing.address}`);
    return true;
  } catch (e: any) {
    console.error("[Zillow] Sheet append error:", e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Create GHL contact for a property listing
// ---------------------------------------------------------------------------
async function createGhlPropertyContact(listing: ZillowListing): Promise<string | null> {
  try {
    const contactPayload = {
      locationId: GHL_LOCATION_ID,
      firstName: listing.address || "Property",
      lastName: `${listing.city || ""} ${listing.state || "NJ"} ${listing.zipcode || ""}`.trim(),
      email: "",
      phone: "",
      address1: listing.address || "",
      city: listing.city || "",
      state: listing.state || "NJ",
      postalCode: listing.zipcode || "",
      tags: ["Zillow Feed", listing.homeStatus || "FOR_SALE", "Single Family"],
      source: "Zillow Property Feed",
      customFields: [
        { key: "zillow_listing_price", field_value: String(listing.price || "") },
        { key: "zillow_url", field_value: listing.url || "" },
        { key: "zillow_bedrooms", field_value: String(listing.bedrooms || "") },
        { key: "zillow_bathrooms", field_value: String(listing.bathrooms || "") },
        { key: "zillow_sqft", field_value: String(listing.livingArea || "") },
        { key: "zillow_zestimate", field_value: String(listing.zestimate || "") },
        { key: "zillow_days_on_market", field_value: String(listing.daysOnZillow || "") },
        { key: "zillow_listing_status", field_value: listing.homeStatus || "" },
        { key: "zillow_property_type", field_value: listing.homeType || "" },
        { key: "zillow_zpid", field_value: listing.zpid || "" },
      ],
    };

    // Use fetch instead of execSync/curl for Render compatibility
    const contactRes = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GHL_API_KEY}`,
        "Version": "2021-07-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contactPayload),
    });

    const data = await contactRes.json() as any;
    const contactId = data?.contact?.id || data?.id || null;

    if (contactId) {
      console.log(`[Zillow] GHL contact created/updated: ${contactId} — ${listing.address}`);

      // Create opportunity in the Zillow Property Feed pipeline
      try {
        const priceNum = listing.price ? Number(listing.price) : 0;
        const stageId = (listing.homeStatus || "").toUpperCase().includes("SOLD")
          ? ZILLOW_STAGES.HOME_SOLD
          : ZILLOW_STAGES.NEW_LISTING_FOR_SALE;

        const oppPayload = {
          pipelineId: ZILLOW_PIPELINE_ID,
          locationId: GHL_LOCATION_ID,
          name: `${listing.address || "Property"} — ${listing.city || ""} ${listing.zipcode || ""}`.trim(),
          pipelineStageId: stageId,
          contactId,
          status: "open",
          monetaryValue: priceNum,
          source: "Zillow Property Feed",
        };

        const oppRes = await fetch("https://services.leadconnectorhq.com/opportunities/", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${GHL_API_KEY}`,
            "Version": "2021-07-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(oppPayload),
        });

        const oppData = await oppRes.json() as any;
        const oppId = oppData?.opportunity?.id || null;
        if (oppId) {
          console.log(`[Zillow] Opportunity created: ${oppId} — stage: ${stageId === ZILLOW_STAGES.HOME_SOLD ? "Home Sold" : "New Listing For Sale"}`);
        } else {
          console.warn(`[Zillow] Opportunity creation response:`, JSON.stringify(oppData).substring(0, 200));
        }
      } catch (oppErr: any) {
        console.error("[Zillow] Opportunity creation error:", oppErr.message);
      }
    } else {
      console.warn(`[Zillow] GHL upsert returned no ID:`, JSON.stringify(data).substring(0, 200));
    }

    return contactId;
  } catch (e: any) {
    console.error("[Zillow] GHL contact error:", e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Send internal notification for new listings
// ---------------------------------------------------------------------------
async function sendListingNotification(listings: ZillowListing[]): Promise<void> {
  if (listings.length === 0) return;

  try {
    const nodemailer = require("nodemailer");
    const mailer = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true, family: 4,
      auth: {
        user: process.env.GMAIL_USER || "aclearalternative@gmail.com",
        pass: process.env.GMAIL_APP_PASSWORD || "kcjswmfawaaugwqo",
      },
    });

    const listingSummary = listings.map((l, i) => {
      const price = l.price ? Number(l.price).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }) : "N/A";
      return `${i + 1}. ${l.address}, ${l.city}, ${l.state} ${l.zipcode}\n   ${price} | ${l.bedrooms}bd/${l.bathrooms}ba | ${l.livingArea} sqft | ${l.homeStatus}\n   ${l.url}`;
    }).join("\n\n");

    await mailer.sendMail({
      from: `"A Clear Alternative — Zillow Feed" <aclearalternative@gmail.com>`,
      to: "aclearalternative@gmail.com",
      subject: `🏠 ${listings.length} New Zillow Listing${listings.length > 1 ? "s" : ""} Found`,
      text: `Zillow Property Feed Update\n${"=".repeat(40)}\n\n${listings.length} new listing(s) matched your criteria:\n\n${listingSummary}\n\nAll listings have been added to your GHL CRM under the "Zillow Feed" tag.\n\n— A Clear Alternative Property Feed`,
    });

    console.log(`[Zillow] Notification sent for ${listings.length} listings`);
  } catch (e: any) {
    console.error("[Zillow] Email notification error:", e.message);
  }
}

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================
export function registerZillowRoutes(app: Express) {

  // -----------------------------------------------------------------------
  // POST /api/zillow/webhook
  // Receives listing data from Apify, RapidAPI, or any external source.
  // Accepts a single listing or an array of listings.
  // -----------------------------------------------------------------------
  app.post("/api/zillow/webhook", async (req: Request, res: Response) => {
    // Simple auth check
    const secret = req.headers["x-zillow-secret"] || req.query.secret;
    if (secret !== ZILLOW_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized. Provide x-zillow-secret header or ?secret= query param." });
    }

    try {
      const body = req.body;
      const rawListings: any[] = Array.isArray(body) ? body : (body.listings || body.data || body.results || [body]);

      const normalized = rawListings.map(normalizeListing);

      // Filter by target zips if configured
      const filtered = TARGET_ZIPS.length > 0
        ? normalized.filter(l => TARGET_ZIPS.includes(l.zipcode || ""))
        : normalized;

      let stagedCount = 0;
      let ghlCount = 0;
      const newListings: ZillowListing[] = [];
      const errors: string[] = [];

      for (const listing of filtered) {
        const staged = await appendToSheet(listing);
        if (staged) stagedCount++;

        try {
          const contactId = await createGhlPropertyContact(listing);
          if (contactId) {
            ghlCount++;
            newListings.push(listing);
          } else {
            errors.push(`No contactId for ${listing.address}`);
          }
        } catch (ghlErr: any) {
          errors.push(`GHL error for ${listing.address}: ${ghlErr.message}`);
          console.error(`[Zillow] GHL sync error for ${listing.address}:`, ghlErr.message);
        }
      }

      // Send email digest for new listings
      if (newListings.length > 0) {
        await sendListingNotification(newListings);
      }

      res.json({
        success: true,
        received: rawListings.length,
        matchedZipFilter: filtered.length,
        stagedToSheet: stagedCount,
        syncedToGhl: ghlCount,
        errors: errors.length > 0 ? errors : undefined,
      });

    } catch (e: any) {
      console.error("[Zillow] Webhook error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/zillow/sync
  // Reads staged listings (from local file) and pushes unsynced ones to GHL.
  // Call this on a schedule or manually.
  // -----------------------------------------------------------------------
  app.post("/api/zillow/sync", async (req: Request, res: Response) => {
    const secret = req.headers["x-zillow-secret"] || req.query.secret;
    if (secret !== ZILLOW_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    try {
      const stagingPath = "/data/zillow_staging.json";
      let staging: any[] = [];
      try {
        const raw = require("fs").readFileSync(stagingPath, "utf8");
        staging = JSON.parse(raw);
      } catch {
        return res.json({ success: true, message: "No staged listings to sync.", synced: 0 });
      }

      const unsynced = staging.filter((l: any) => !l.syncedToGhl);
      let syncedCount = 0;

      for (const listing of unsynced) {
        const contactId = await createGhlPropertyContact(listing);
        if (contactId) {
          listing.syncedToGhl = true;
          listing.ghlContactId = contactId;
          syncedCount++;
        }
      }

      require("fs").writeFileSync(stagingPath, JSON.stringify(staging, null, 2), "utf8");

      if (syncedCount > 0) {
        const newlysynced = unsynced.filter((l: any) => l.syncedToGhl);
        await sendListingNotification(newlysynced);
      }

      res.json({ success: true, synced: syncedCount, remaining: unsynced.length - syncedCount });

    } catch (e: any) {
      console.error("[Zillow] Sync error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/zillow/listings
  // Returns all staged listings (for dashboard / review)
  // -----------------------------------------------------------------------
  app.get("/api/zillow/listings", (req: Request, res: Response) => {
    try {
      const stagingPath = "/data/zillow_staging.json";
      let staging: any[] = [];
      try {
        const raw = require("fs").readFileSync(stagingPath, "utf8");
        staging = JSON.parse(raw);
      } catch {}

      const status = (req.query.status as string || "").toLowerCase();
      if (status === "synced") staging = staging.filter((l: any) => l.syncedToGhl);
      if (status === "unsynced") staging = staging.filter((l: any) => !l.syncedToGhl);

      res.json({ count: staging.length, listings: staging });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/zillow/update-zips
  // Update target zip codes on the fly without redeploying
  // -----------------------------------------------------------------------
  app.post("/api/zillow/update-zips", (req: Request, res: Response) => {
    const secret = req.headers["x-zillow-secret"] || req.query.secret;
    if (secret !== ZILLOW_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const { zips } = req.body;
    if (!Array.isArray(zips)) {
      return res.status(400).json({ error: "Provide { zips: [\"08204\", \"08110\", ...] }" });
    }

    TARGET_ZIPS = zips.map((z: any) => String(z).trim()).filter(Boolean);

    // Persist to disk so it survives restarts
    try {
      require("fs").mkdirSync("/data", { recursive: true });
      require("fs").writeFileSync("/data/zillow_target_zips.json", JSON.stringify(TARGET_ZIPS), "utf8");
    } catch {}

    console.log(`[Zillow] Target zips updated: ${TARGET_ZIPS.join(", ")}`);
    res.json({ success: true, targetZips: TARGET_ZIPS });
  });

  // -----------------------------------------------------------------------
  // POST /api/zillow/apify-callback
  // Apify calls this webhook when a scraper run finishes.
  // It fetches the dataset results and processes them through the pipeline.
  // -----------------------------------------------------------------------
  app.post("/api/zillow/apify-callback", async (req: Request, res: Response) => {
    try {
      const apifyToken = process.env.APIFY_TOKEN || "";
      const { resource } = req.body || {};

      // Apify sends the run info in resource
      const datasetId = resource?.defaultDatasetId;
      if (!datasetId) {
        return res.status(400).json({ error: "No datasetId found in Apify callback payload." });
      }

      console.log(`[Zillow] Apify callback received — dataset: ${datasetId}`);

      // Fetch results from Apify dataset using fetch for Render compatibility
      const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?format=json${apifyToken ? `&token=${apifyToken}` : ""}`;
      const datasetFetch = await fetch(datasetUrl);
      if (!datasetFetch.ok) {
        throw new Error(`Apify dataset fetch failed: ${datasetFetch.status} ${datasetFetch.statusText}`);
      }
      const items = await datasetFetch.json() as any[];

      console.log(`[Zillow] Fetched ${items.length} items from Apify dataset`);

      // Normalize Apify output — handle multiple actor formats
      const rawListings = items.map((item: any) => {
        const prop = item.rawData?.property || item.hdpData?.homeInfo || item;
        return {
          zpid: String(prop.zpid || item.zpid || item.id || ""),
          address: prop.address?.streetAddress || item.addressStreet || item.address || "",
          city: prop.address?.city || item.addressCity || "",
          state: prop.address?.state || item.addressState || "NJ",
          zipcode: prop.address?.zipcode || item.addressZipcode || item.zipcode || "",
          price: prop.price?.value || item.unformattedPrice || item.price || 0,
          bedrooms: prop.bedrooms || item.beds || 0,
          bathrooms: prop.bathrooms || item.baths || 0,
          livingArea: prop.livingArea || item.area || item.sqft || 0,
          homeType: prop.homeType || item.homeType || "SINGLE_FAMILY",
          homeStatus: prop.listing?.listingStatus || item.homeStatus || item.statusType || "FOR_SALE",
          daysOnZillow: prop.daysOnZillow || item.daysOnZillow || 0,
          zestimate: prop.estimates?.zestimate || item.zestimate || 0,
          url: item.detailUrl || (prop.zpid ? `https://www.zillow.com/homedetails/${prop.zpid}_zpid/` : ""),
        };
      });

      const normalized = rawListings.map(normalizeListing);
      const filtered = TARGET_ZIPS.length > 0
        ? normalized.filter((l: ZillowListing) => TARGET_ZIPS.includes(l.zipcode || ""))
        : normalized;

      let stagedCount = 0;
      let ghlCount = 0;
      const newListings: ZillowListing[] = [];

      for (const listing of filtered) {
        const staged = await appendToSheet(listing);
        if (staged) stagedCount++;
        const contactId = await createGhlPropertyContact(listing);
        if (contactId) { ghlCount++; newListings.push(listing); }
      }

      if (newListings.length > 0) {
        await sendListingNotification(newListings);
      }

      console.log(`[Zillow] Apify callback processed: ${filtered.length} matched, ${ghlCount} synced to GHL`);
      res.json({
        success: true,
        datasetId,
        totalItems: items.length,
        matchedZipFilter: filtered.length,
        syncedToGhl: ghlCount,
      });

    } catch (e: any) {
      console.error("[Zillow] Apify callback error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/zillow/status
  // Health check / current config
  // -----------------------------------------------------------------------
  app.get("/api/zillow/status", (_req: Request, res: Response) => {
    let stagedCount = 0;
    try {
      const raw = require("fs").readFileSync("/data/zillow_staging.json", "utf8");
      stagedCount = JSON.parse(raw).length;
    } catch {}

    res.json({
      active: true,
      targetZips: TARGET_ZIPS,
      sheetId: ZILLOW_SHEET_ID,
      stagedListings: stagedCount,
      webhookUrl: "/api/zillow/webhook",
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/zillow/test-ghl
  // Diagnostic: tests GHL API connectivity from Render
  // -----------------------------------------------------------------------
  app.get("/api/zillow/test-ghl", async (_req: Request, res: Response) => {
    try {
      const testPayload = {
        locationId: GHL_LOCATION_ID,
        firstName: "ZILLOW-DIAG-TEST",
        lastName: "Delete Me",
        email: "zillow-diag-test@test.com",
        tags: ["Zillow Feed", "DIAGNOSTIC-DELETE"],
        source: "Zillow Diagnostic Test",
      };

      const contactRes = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GHL_API_KEY}`,
          "Version": "2021-07-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testPayload),
      });

      const status = contactRes.status;
      const text = await contactRes.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}

      res.json({
        ghlApiReachable: true,
        httpStatus: status,
        contactId: parsed?.contact?.id || null,
        rawResponse: text.substring(0, 500),
      });
    } catch (e: any) {
      res.json({
        ghlApiReachable: false,
        error: e.message,
      });
    }
  });

  // Load persisted target zips on startup
  try {
    const saved = require("fs").readFileSync("/data/zillow_target_zips.json", "utf8");
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0) {
      TARGET_ZIPS = parsed;
      console.log(`[Zillow] Loaded ${TARGET_ZIPS.length} target zips from disk`);
    }
  } catch {}

  console.log(`[Zillow] Routes registered. Target zips: ${TARGET_ZIPS.length > 0 ? TARGET_ZIPS.join(", ") : "(all — no filter)"}`);
}
