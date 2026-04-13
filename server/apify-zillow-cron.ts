// =============================================================================
// APIFY ZILLOW CRON — Fetches Zillow listings and pushes to local webhook
// Run this on a schedule (daily) via Apify Scheduler or external cron
// =============================================================================

// This script is called by Apify after a scraper run completes.
// It fetches the dataset results and POSTs them to your Render webhook.

const RENDER_WEBHOOK_URL = process.env.RENDER_WEBHOOK_URL || "https://proposals.aclear.com/api/zillow/webhook";
const ZILLOW_WEBHOOK_SECRET = process.env.ZILLOW_WEBHOOK_SECRET || "aclear-zillow-2026";

interface ApifyDatasetItem {
  [key: string]: any;
}

/**
 * Fetch results from an Apify dataset and POST them to the Render webhook.
 * Called after an Apify actor run finishes (via Apify webhook or manually).
 */
export async function pushApifyResultsToWebhook(datasetId: string, apifyToken: string): Promise<void> {
  // Fetch dataset items from Apify
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Apify dataset fetch failed: ${response.status} ${response.statusText}`);
  }

  const items: ApifyDatasetItem[] = await response.json();
  console.log(`[Apify→Zillow] Fetched ${items.length} listings from dataset ${datasetId}`);

  if (items.length === 0) {
    console.log("[Apify→Zillow] No new listings found.");
    return;
  }

  // Normalize Apify output to match our webhook format
  const listings = items.map(item => {
    // The clearpath/zillow-zip-code-search-scraper returns nested rawData.property
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

  // POST to Render webhook
  const webhookResponse = await fetch(RENDER_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-zillow-secret": ZILLOW_WEBHOOK_SECRET,
    },
    body: JSON.stringify(listings),
  });

  const result = await webhookResponse.json();
  console.log(`[Apify→Zillow] Webhook response:`, result);
}
