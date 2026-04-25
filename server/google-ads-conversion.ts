// =============================================================================
// GOOGLE ADS OFFLINE CONVERSION TRACKING
// =============================================================================
// Fires conversions to Google Ads via API when leads are saved. Works for all
// channels (Base44 web form, Jessica Voice AI, manual GHL entry). Far more
// reliable than tag-based tracking because it captures every lead and ties
// back to the originating ad click via GCLID.
//
// Required ENV:
//   GOOGLE_ADS_DEVELOPER_TOKEN     - Your developer token from API Center
//   GOOGLE_ADS_CLIENT_ID           - OAuth client ID
//   GOOGLE_ADS_CLIENT_SECRET       - OAuth client secret
//   GOOGLE_ADS_REFRESH_TOKEN       - Long-lived refresh token (one-time setup)
//   GOOGLE_ADS_CUSTOMER_ID         - 3964373923 (no dashes)
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID   - Manager account ID, if applicable
//
// Conversion Action Resource Names (from Google Ads UI):
//   Pool Quote Form Submitted: customers/3964373923/conversionActions/7588845837
//   Website Phone Call:        customers/3964373923/conversionActions/7588848132
//   Pool Delivery Booked:      customers/3964373923/conversionActions/7588823188
// =============================================================================

const ADS_API_VERSION = "v17";
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID || "3964373923";
const LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || CUSTOMER_ID;

// Conversion action resource names — fill in once Google Ads UI shows IDs
export const CONVERSION_ACTIONS = {
  POOL_QUOTE_FORM: `customers/${CUSTOMER_ID}/conversionActions/7588845837`,
  WEBSITE_PHONE_CALL: `customers/${CUSTOMER_ID}/conversionActions/7588848132`,
  POOL_DELIVERY_BOOKED: `customers/${CUSTOMER_ID}/conversionActions/7588823188`,
};

// ----------------------------------------------------------------------------
// OAuth: refresh access token
// ----------------------------------------------------------------------------
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedAccessToken.token;
}

// ----------------------------------------------------------------------------
// Send offline conversion (click-based — requires GCLID)
// ----------------------------------------------------------------------------
export interface OfflineConversionInput {
  conversionActionResource: string;   // e.g. CONVERSION_ACTIONS.POOL_QUOTE_FORM
  gclid?: string;                     // Google Click ID, if captured
  conversionDateTime: string;         // ISO format with timezone, e.g. "2026-04-25 15:30:00-04:00"
  conversionValue: number;            // dollar value
  currencyCode?: string;              // default USD
  orderId?: string;                   // dedupe key (e.g. quote ID)
  // Enhanced conversions for leads (PII fallback when no GCLID)
  email?: string;
  phone?: string;
}

export async function sendOfflineConversion(input: OfflineConversionInput): Promise<{
  ok: boolean;
  reason?: string;
  raw?: any;
}> {
  // Skip in dev or when not configured — don't crash the lead save
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN || !process.env.GOOGLE_ADS_REFRESH_TOKEN) {
    console.log("[gads-conv] Skipped — Google Ads API not configured");
    return { ok: false, reason: "not_configured" };
  }

  // Without GCLID we can still send via "enhanced conversions for leads" using email/phone
  if (!input.gclid && !input.email && !input.phone) {
    console.log("[gads-conv] Skipped — no GCLID and no email/phone for enhanced match");
    return { ok: false, reason: "no_attribution_data" };
  }

  try {
    const token = await getAccessToken();

    const conversion: any = {
      conversionAction: input.conversionActionResource,
      conversionDateTime: input.conversionDateTime,
      conversionValue: input.conversionValue,
      currencyCode: input.currencyCode || "USD",
    };
    if (input.orderId) conversion.orderId = input.orderId;
    if (input.gclid) conversion.gclid = input.gclid;

    // Enhanced conversion data for leads (when no GCLID, hash email/phone)
    if (!input.gclid && (input.email || input.phone)) {
      conversion.userIdentifiers = [];
      if (input.email) {
        conversion.userIdentifiers.push({
          hashedEmail: await sha256Hex(input.email.trim().toLowerCase()),
        });
      }
      if (input.phone) {
        const e164 = normalizeToE164(input.phone);
        if (e164) {
          conversion.userIdentifiers.push({
            hashedPhoneNumber: await sha256Hex(e164),
          });
        }
      }
    }

    const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${CUSTOMER_ID}:uploadClickConversions`;
    const body = {
      conversions: [conversion],
      partialFailure: true,
      validateOnly: false,
    };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
      "Content-Type": "application/json",
    };
    if (LOGIN_CUSTOMER_ID && LOGIN_CUSTOMER_ID !== CUSTOMER_ID) {
      headers["login-customer-id"] = LOGIN_CUSTOMER_ID;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[gads-conv] API error:", res.status, JSON.stringify(data));
      return { ok: false, reason: `api_${res.status}`, raw: data };
    }

    if (data.partialFailureError) {
      console.warn("[gads-conv] Partial failure:", JSON.stringify(data.partialFailureError));
      return { ok: false, reason: "partial_failure", raw: data };
    }

    console.log("[gads-conv] ✅ Conversion fired:", input.conversionActionResource, "value=$" + input.conversionValue);
    return { ok: true, raw: data };
  } catch (e: any) {
    console.error("[gads-conv] Exception:", e.message);
    return { ok: false, reason: "exception", raw: e.message };
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
async function sha256Hex(input: string): Promise<string> {
  // Node 18+ has subtle crypto via globalThis.crypto, but for safety use node:crypto
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}

function normalizeToE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// ----------------------------------------------------------------------------
// Helper: get current ISO datetime in Google Ads format (with TZ offset)
// ----------------------------------------------------------------------------
export function nowForAdsApi(): string {
  // Format: "yyyy-MM-dd HH:mm:ss±HH:MM"
  const d = new Date();
  const tzOffsetMin = d.getTimezoneOffset();
  const sign = tzOffsetMin <= 0 ? "+" : "-";
  const absMin = Math.abs(tzOffsetMin);
  const tzH = String(Math.floor(absMin / 60)).padStart(2, "0");
  const tzM = String(absMin % 60).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${tzH}:${tzM}`
  );
}
