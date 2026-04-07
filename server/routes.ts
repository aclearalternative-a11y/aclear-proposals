import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { nanoid } from "nanoid";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Email transport — nodemailer (Gmail SMTP) when env vars are set,
// falls back to external-tool CLI when running inside Perplexity sandbox
// ---------------------------------------------------------------------------
async function sendProposalEmail(opts: {
  to: string;
  subject: string;
  body: string;
  bcc: string[];
}): Promise<void> {
  const gmailUser = process.env.GMAIL_USER || "aclearalternative@gmail.com";
  const gmailPass = process.env.GMAIL_APP_PASSWORD || "kcjswmfawaaugwqo";

  if (gmailUser && gmailPass) {
    // Production path: Gmail SMTP with app password
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transporter.sendMail({
      from: `"A Clear Alternative" <${gmailUser}>`,
      to: opts.to,
      bcc: opts.bcc.join(","),
      subject: opts.subject,
      text: opts.body,
    });
  } else {
    // Dev/sandbox path: use Perplexity external-tool CLI
    const params = JSON.stringify({
      source_id: "gcal",
      tool_name: "send_email",
      arguments: {
        action: {
          action: "send",
          to: [opts.to],
          cc: [],
          bcc: opts.bcc,
          subject: opts.subject,
          body: opts.body,
        },
      },
    });
    execSync(`external-tool call '${params.replace(/'/g, "'\\''")}' `, { timeout: 30000 });
  }
}

function logToPipeline(row: Record<string, string>): void {
  try {
    const params = JSON.stringify({
      source_id: "google_sheets__pipedream",
      tool_name: "google_sheets-add-single-row",
      arguments: {
        spreadsheetId: "1_RR_SLe8miBRNeHA81ZSjhhGg7JKs7Nl9cezX7tFjFs",
        sheetName: "Pipeline",
        row,
      },
    });
    execSync(`external-tool call '${params.replace(/'/g, "'\\''")}' `, { timeout: 30000 });
  } catch (e: any) {
    console.error("Pipeline log failed (non-fatal):", e.message);
  }
}

const REPS: Record<string, string> = {
  "Gerald DiPietropolo": "609-352-6908",
  "John DiPietropolo": "609-352-6905",
  "Nicholas DiPietropolo": "609-352-6909",
  "Eric Fusco": "856-649-5467",
};

// Brochure URL map keyed by equipment category keyword
const BROCHURE_MAP: Record<string, string> = {
  "Twin Alternating": "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab",
  "Water Conditioner": "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91",
  "Acid Neutralizer": "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd",
  "Iron Odor Breaker": "https://acrobat.adobe.com/id/urn:aaid:sc:US:d04f7189-fc0e-4352-9cc0-7e3a70b70ca5",
  "Carbon Filtration": "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd",
  "Leak Shut Off Valve": "https://acrobat.adobe.com/id/urn:aaid:sc:US:02daeba4-c657-41de-9318-29ba0899d91d",
  "Bradford White 40 Gallon GAS POWER": "https://docs.bradfordwhite.com/Spec_Sheets/1117_Current.pdf",
  "Bradford White 40 Gallon ELECTRIC": "https://docs.bradfordwhite.com/Spec_Sheets/1201_Current.pdf",
  "Bradford White 50 Gallon GAS POWER": "https://docs.bradfordwhite.com/Spec_Sheets/1117_Current.pdf",
  "Bradford White 50 Gallon ELECTRIC": "https://docs.bradfordwhite.com/Spec_Sheets/1201_Current.pdf",
};

function getBrochureUrl(equipName: string): string {
  if (equipName.includes("Twin Alternating")) return BROCHURE_MAP["Twin Alternating"];
  if (equipName.includes("Water Conditioner")) return BROCHURE_MAP["Water Conditioner"];
  if (equipName.includes("Acid Neutralizer")) return BROCHURE_MAP["Acid Neutralizer"];
  if (equipName.includes("Iron Odor Breaker")) return BROCHURE_MAP["Iron Odor Breaker"];
  if (equipName.includes("Carbon Filtration")) return BROCHURE_MAP["Carbon Filtration"];
  if (equipName.includes("Leak Shut Off") || equipName.includes("Leak Valve")) return BROCHURE_MAP["Leak Shut Off Valve"];
  return "";
}

function buildProposalHtml(proposal: any): string {
  const repPhone = REPS[proposal.repName] || "";
  const customerName = `${proposal.customerFirstName1} ${proposal.customerLastName1}`;
  const fullAddress = `${proposal.street}, ${proposal.city}, ${proposal.state} ${proposal.zip}`;
  const packages = JSON.parse(proposal.packages);
  const selectedPkg = packages.find((p: any) => p.tier === proposal.selectedPackage);
  const waterTest = JSON.parse(proposal.waterTestResults);
  const isWell = proposal.waterSource === "well";
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function calcPackagePricing(pkg: any) {
    const discountType = proposal.discountType || "none";
    let discountPercent = 0;
    if (discountType === "veteran") discountPercent = 5;
    if (discountType === "fire_ems") discountPercent = 3;
    const discountAmt = Math.round(pkg.totalPrice * discountPercent / 100);
    const finalPrice = pkg.totalPrice - discountAmt;
    const deposit = proposal.deposit || 0;
    const monthlyAmt = deposit >= finalPrice ? 0 : Math.round((finalPrice - deposit) / 120);
    return { discountPercent, discountAmt, finalPrice, deposit, monthlyAmt };
  }

  function buildPackageBlock(pkg: any): string {
    const isSelected = pkg.tier === proposal.selectedPackage;
    const pricing = calcPackagePricing(pkg);
    const headerClass = isSelected ? "pkg-header-teal" : "pkg-header-gray";
    const badge = isSelected
      ? `<span class="pkg-badge">&#9733; RECOMMENDED</span>`
      : "";

    let equipRows = "";
    for (const eq of pkg.equipment) {
      const brochureUrl = getBrochureUrl(eq.name);
      const brochureLink = brochureUrl
        ? ` &nbsp;<a href="${brochureUrl}" class="brochure-link">View Brochure</a>`
        : "";
      equipRows += `
        <tr>
          <td class="equip-name">${eq.name}${brochureLink}</td>
          <td class="equip-price">$${eq.price.toLocaleString()}</td>
        </tr>`;
    }

    let discountRow = "";
    if (pricing.discountAmt > 0) {
      discountRow = `<tr>
        <td class="discount-label">Discount (${pricing.discountPercent}%)</td>
        <td class="discount-val">-$${pricing.discountAmt.toLocaleString()}</td>
      </tr>`;
    }
    let depositRow = "";
    if (pricing.deposit > 0) {
      depositRow = `<tr>
        <td class="discount-label">Deposit Applied</td>
        <td class="discount-val">-$${pricing.deposit.toLocaleString()}</td>
      </tr>`;
    }

    return `
    <table class="pkg-table">
      <tr>
        <td colspan="2" class="${headerClass}">
          <span class="pkg-title">${pkg.label} Package &mdash; ${isWell ? "Well Water" : "City Water"}</span>${badge}
        </td>
      </tr>
      ${equipRows}
      <tr>
        <td colspan="2" class="install-row">&#10003; Full Professional Installation Included</td>
      </tr>
      <tr>
        <td class="total-label">Package Total</td>
        <td class="total-val">$${pkg.totalPrice.toLocaleString()}</td>
      </tr>
      ${discountRow}${depositRow}
      <tr>
        <td class="monthly-label">Monthly Investment</td>
        <td class="monthly-val">$${pricing.monthlyAmt}/mo</td>
      </tr>
    </table>`;
  }

  // Water test rows
  const testRows: string[] = [];
  const addTest = (label: string, val: string, flagged = false) => {
    testRows.push(`<tr>
      <td style="padding:5px 10px;font-size:12px;color:#444;border-bottom:1px solid #f0f0f0;background-color:#ffffff;">${label}</td>
      <td class="${flagged ? "val-flagged" : "val-normal"}" style="padding:5px 10px;border-bottom:1px solid #f0f0f0;">${val}${flagged ? " &#9888;" : ""}</td>
    </tr>`);
  };
  addTest("pH", `${waterTest.pH}`, parseFloat(waterTest.pH) < 6.5);
  addTest("Iron", `${waterTest.iron} ppm`, parseFloat(waterTest.iron) > 0.3);
  addTest("Hardness", `${waterTest.hardness} gpg`, parseFloat(waterTest.hardness) > 7);
  addTest("TDS", `${waterTest.tds}`);
  if (isWell) {
    addTest("Copper", `${waterTest.copper} ppm`, parseFloat(waterTest.copper) > 0.3);
    if (waterTest.hydrogenSulfide) {
      addTest("Hydrogen Sulfide (Cold)", `${waterTest.h2sCold}/10`, parseFloat(waterTest.h2sCold) > 5);
      addTest("Hydrogen Sulfide (Hot)", `${waterTest.h2sHot}/10`, parseFloat(waterTest.h2sHot) > 5);
    }
  } else {
    if (waterTest.chlorine) addTest("Chlorine", `${waterTest.chlorine} ppm`, parseFloat(waterTest.chlorine) > 0.5);
  }

  const allPackagesHtml = packages.map(buildPackageBlock).join("\n");
  const selectedPricing = selectedPkg ? calcPackagePricing(selectedPkg) : null;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Water Treatment Proposal — A Clear Alternative</title>
<style>
  @page { size: letter; margin: 0.55in 0.65in; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .section { background-color: #ffffff; margin-bottom: 14px; }
  .teal-header { background-color: #0d7a6e !important; padding: 18px 20px; }
  .teal-header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; }
  .teal-header .subtitle { color: #a8e6df; font-size: 11px; margin-top: 2px; }
  .teal-header .contact { color: #a8e6df; font-size: 10px; line-height: 1.7; text-align: right; }
  .prepared-box { background-color: #f0fcfb; border-left: 4px solid #0d7a6e; padding: 12px 14px; margin-bottom: 14px; }
  .prepared-box .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
  .prepared-box .name { font-size: 16px; font-weight: 700; color: #111; }
  .prepared-box .addr { font-size: 12px; color: #444; margin-top: 2px; }
  .prepared-box .meta { font-size: 11px; color: #555; margin-top: 4px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #0d7a6e; margin-bottom: 8px; }
  .water-table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; margin-bottom: 14px; }
  .water-table th { background-color: #f5f5f5; padding: 5px 10px; font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase; text-align: left; }
  .water-table td { padding: 5px 10px; font-size: 12px; border-bottom: 1px solid #f0f0f0; background-color: #ffffff; }
  .water-table td.val-normal { color: #222; font-weight: 600; }
  .water-table td.val-flagged { color: #c0392b; font-weight: 700; }
  .pkg-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #ddd; }
  .pkg-table .pkg-header-teal { background-color: #0d7a6e !important; padding: 9px 12px; }
  .pkg-table .pkg-header-gray { background-color: #4a4a4a !important; padding: 9px 12px; }
  .pkg-table .pkg-title { color: #ffffff; font-size: 13px; font-weight: 700; }
  .pkg-table .pkg-badge { background-color: #ffffff; color: #0d7a6e; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 8px; margin-left: 8px; }
  .pkg-table td.equip-name { padding: 6px 10px; font-size: 12px; color: #333; border-bottom: 1px solid #f0f0f0; background-color: #ffffff; }
  .pkg-table td.equip-price { padding: 6px 10px; font-size: 12px; color: #333; border-bottom: 1px solid #f0f0f0; text-align: right; white-space: nowrap; background-color: #ffffff; }
  .pkg-table td.install-row { padding: 4px 10px; font-size: 11px; color: #0d7a6e; background-color: #ffffff; }
  .pkg-table td.total-label { padding: 7px 10px; font-size: 13px; font-weight: 700; border-top: 2px solid #ddd; background-color: #ffffff; color: #111; }
  .pkg-table td.total-val { padding: 7px 10px; font-size: 13px; font-weight: 700; border-top: 2px solid #ddd; text-align: right; background-color: #ffffff; color: #111; }
  .pkg-table td.monthly-label { padding: 7px 10px; font-size: 13px; font-weight: 700; background-color: #e8f8f6; color: #0d7a6e; }
  .pkg-table td.monthly-val { padding: 7px 10px; font-size: 13px; font-weight: 700; text-align: right; background-color: #e8f8f6; color: #0d7a6e; }
  .pkg-table td.discount-label { padding: 4px 10px; font-size: 11px; color: #888; background-color: #ffffff; }
  .pkg-table td.discount-val { padding: 4px 10px; font-size: 11px; color: #888; text-align: right; background-color: #ffffff; }
  a.brochure-link { font-size: 10px; color: #0d7a6e; text-decoration: none; border: 1px solid #0d7a6e; padding: 1px 6px; border-radius: 8px; white-space: nowrap; }
  .acceptance-box { border: 2px solid #0d7a6e; }
  .acceptance-header { background-color: #0d7a6e !important; padding: 9px 14px; }
  .acceptance-header span { color: #ffffff; font-size: 13px; font-weight: 700; }
  .acceptance-body { padding: 14px; background-color: #ffffff; }
  .pricing-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .pricing-table td { padding: 4px 6px; font-size: 12px; background-color: #ffffff; color: #444; }
  .pricing-table td.p-val { text-align: right; }
  .pricing-table tr.final-row td { border-top: 2px solid #0d7a6e; padding-top: 6px; font-size: 14px; font-weight: 700; color: #0d7a6e; }
  .pricing-table tr.monthly-row td { font-size: 12px; color: #0d7a6e; }
  .nj-notice { font-size: 9px; color: #444; line-height: 1.5; margin-bottom: 14px; padding: 9px; background-color: #fff8f0; border-left: 3px solid #e67e22; }
  .sig-table { width: 100%; border-collapse: collapse; }
  .sig-table td { padding: 0; background-color: #ffffff; vertical-align: bottom; }
  .sig-label { font-size: 10px; color: #555; margin-bottom: 3px; }
  .sig-line { border-bottom: 1px solid #999; height: 36px; }
  .sig-name { font-size: 9px; color: #aaa; margin-top: 2px; }
  .footer-bar { background-color: #0d7a6e !important; padding: 14px 20px; margin-top: 14px; }
  .footer-bar p { margin: 0; color: #a8e6df; font-size: 11px; line-height: 1.7; }
  .footer-bar .rep-name { color: #ffffff; font-size: 12px; font-weight: 700; margin-top: 5px; }
  .accept-note { margin-top: 12px; font-size: 11px; color: #444; font-style: italic; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="teal-header">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td>
        <h1>A Clear Alternative</h1>
        <div class="subtitle">Water Treatment Proposal</div>
      </td>
      <td class="contact">
        9230 Collins Ave, Pennsauken, NJ 08110<br>
        (856) 663-8088 &nbsp;|&nbsp; info@aclear.com<br>
        www.aclear.com &nbsp;|&nbsp; Serving NJ, PA, NY &amp; DE since 1991
      </td>
    </tr>
  </table>
</div>

<!-- PREPARED FOR -->
<div class="prepared-box">
  <div class="label">Prepared For</div>
  <div class="name">${customerName}${proposal.customerFirstName2 ? " &amp; " + proposal.customerFirstName2 + " " + proposal.customerLastName2 : ""}</div>
  <div class="addr">${fullAddress}</div>
  <div class="meta">Date: ${today} &nbsp;&nbsp;|&nbsp;&nbsp; Representative: ${proposal.repName} &mdash; ${repPhone}</div>
</div>

<!-- WATER ANALYSIS -->
<div class="section-title">Water Analysis Results &mdash; ${isWell ? "Well Water" : "City Water"}</div>
<table class="water-table">
  <tr><th>Parameter</th><th>Result</th></tr>
  ${testRows.join("\n")}
</table>

<!-- PACKAGES -->
<div class="section-title">Recommended Treatment Packages</div>
${allPackagesHtml}

<!-- ACCEPTANCE SECTION -->
<div class="acceptance-box">
  <div class="acceptance-header"><span>Acceptance &amp; Authorization</span></div>
  <div class="acceptance-body">
    ${selectedPkg ? `
    <table class="pricing-table">
      <tr><td>Selected Package</td><td class="p-val" style="font-weight:700;color:#111;">${selectedPkg.label}</td></tr>
      <tr><td>Package Total</td><td class="p-val">$${selectedPkg.totalPrice.toLocaleString()}</td></tr>
      ${selectedPricing && selectedPricing.discountAmt > 0 ? `<tr><td style="color:#888;">Discount (${selectedPricing.discountPercent}%)</td><td class="p-val" style="color:#c0392b;">-$${selectedPricing.discountAmt.toLocaleString()}</td></tr>` : ""}
      ${selectedPricing && selectedPricing.deposit > 0 ? `<tr><td>Deposit</td><td class="p-val">-$${selectedPricing.deposit.toLocaleString()}</td></tr>` : ""}
      <tr class="final-row"><td>Final Price</td><td class="p-val">$${selectedPricing ? selectedPricing.finalPrice.toLocaleString() : selectedPkg.totalPrice.toLocaleString()}</td></tr>
      <tr class="monthly-row"><td>Monthly Investment</td><td class="p-val">$${selectedPricing ? selectedPricing.monthlyAmt : 0}/mo</td></tr>
    </table>` : ""}

    <div class="nj-notice">
      <strong>NJ CANCELLATION NOTICE:</strong> YOU MAY CANCEL THIS CONTRACT AT ANY TIME BEFORE MIDNIGHT OF THE THIRD BUSINESS DAY AFTER RECEIVING A COPY OF THIS CONTRACT. IF YOU WISH TO CANCEL THIS CONTRACT, YOU MUST DO ONE OF THE FOLLOWING: (1) SEND A SIGNED AND DATED WRITTEN NOTICE OF CANCELLATION BY REGISTERED OR CERTIFIED MAIL, RETURN RECEIPT REQUESTED; OR (2) PERSONALLY DELIVER A SIGNED AND DATED WRITTEN NOTICE OF CANCELLATION TO: A CLEAR ALTERNATIVE, 9230 COLLINS AVE, PENNSAUKEN, NJ 08110 &mdash; 856-663-8088
    </div>

    <table class="sig-table">
      <tr>
        <td width="47%">
          <div class="sig-label">Customer Signature</div>
          <div class="sig-line"></div>
          <div class="sig-name">${customerName}</div>
        </td>
        <td width="6%"></td>
        <td width="47%">
          <div class="sig-label">Date</div>
          <div class="sig-line"></div>
          <div class="sig-name">Date Signed</div>
        </td>
      </tr>
      ${proposal.customerFirstName2 ? `
      <tr><td colspan="3" style="padding-top:12px;">
        <div class="sig-label">Customer 2 Signature</div>
        <div class="sig-line"></div>
        <div class="sig-name">${proposal.customerFirstName2} ${proposal.customerLastName2}</div>
      </td></tr>` : ""}
      <tr><td colspan="3" style="padding-top:12px;">
        <div class="sig-label">A Clear Alternative Representative</div>
        <div class="sig-line"></div>
        <div class="sig-name">${proposal.repName}</div>
      </td></tr>
    </table>

    <div class="accept-note">
      To accept, sign and return this proposal or call/text <strong>${repPhone}</strong>
    </div>
  </div>
</div>

<!-- FOOTER -->
<div class="footer-bar">
  <p>Thank you for allowing A Clear Alternative to provide you and your family the highest quality water.<br>
  Please contact me anytime &mdash; call or text <strong style="color:#ffffff;">${repPhone}</strong></p>
  <div class="rep-name">${proposal.repName} &mdash; A Clear Alternative</div>
</div>

</body></html>`;
}

function generatePdfFromHtml(html: string): Buffer {
  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const htmlFile = path.join(tmpDir, `proposal_${ts}.html`);
  const pdfFile = path.join(tmpDir, `proposal_${ts}.pdf`);
  fs.writeFileSync(htmlFile, html, "utf8");
  try {
    execSync(
      `python3 -c "from weasyprint import HTML; HTML(filename='${htmlFile}').write_pdf('${pdfFile}')"`,
      { timeout: 60000 }
    );
    const buf = fs.readFileSync(pdfFile);
    return buf;
  } finally {
    try { fs.unlinkSync(htmlFile); } catch {}
    try { fs.unlinkSync(pdfFile); } catch {}
  }
}

function callExternalTool(sourceId: string, toolName: string, args: any): any {
  const params = JSON.stringify({
    source_id: sourceId,
    tool_name: toolName,
    arguments: args,
  });
  try {
    const result = execSync(`external-tool call '${params.replace(/'/g, "'\\''")}'`, {
      timeout: 30000,
    });
    return JSON.parse(result.toString());
  } catch (err: any) {
    console.error("External tool error:", err.message);
    throw err;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ---------------------------------------------------------------
  // FOLLOW-UP CRON — called daily by Perplexity scheduler
  // Sends reminder emails to unsigned proposals older than 3 days
  // ---------------------------------------------------------------
  app.post("/api/followup/run", async (req: Request, res: Response) => {
    const GHL_API_KEY = process.env.GHL_API_KEY || "pit-24e8e4ec-6172-44e0-b0d7-6a621b9b4bc7";
    const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
    const results: any[] = [];

    try {
      const overdue = await storage.getProposalsNeedingFollowUp(3);
      console.log(`Follow-up run: found ${overdue.length} proposals needing follow-up`);

      for (const proposal of overdue) {
        try {
          const customerName = `${proposal.customerFirstName1} ${proposal.customerLastName1}`;
          const repPhone = REPS[proposal.repName] || "(856) 663-8088";
          const packages = JSON.parse(proposal.packages);
          const selectedPkg = packages.find((p: any) => p.tier === proposal.selectedPackage);
          const selectedLabel = selectedPkg ? selectedPkg.label : "Selected";
          const APP_URL = process.env.APP_URL || "https://proposals.aclear.com";
          const proposalLink = `${APP_URL}/#/proposal/${proposal.shareId}`;

          const followUpBody = `Dear ${customerName},

I wanted to follow up on the water treatment proposal I sent you a few days ago.

Your proposal is still available to view at the link below — it includes your water analysis results, all three treatment packages, and pricing:

  ${proposalLink}

If you have any questions or would like to discuss your options, please don't hesitate to call or text me directly:

  ${repPhone}

I look forward to helping you and your family enjoy the highest quality water.

${proposal.repName}
A Clear Alternative
(856) 663-8088  |  info@aclear.com  |  www.aclear.com`;

          // Send follow-up email
          await sendProposalEmail({
            to: proposal.customerEmail,
            subject: `Following Up — Your Water Treatment Proposal (${customerName})`,
            body: followUpBody,
            bcc: ["aclearalternative@gmail.com", "asmith@aclear.com", "water325@aol.com"],
          });

          // Move GHL opportunity to "Contacted" stage (follow-up)
          try {
            // Find the opportunity for this contact
            const searchRes = execSync(
              `curl -s "https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=gyFJalG38xXKkAlmUHBo&contact_id_or_email=${encodeURIComponent(proposal.customerEmail)}" \
                -H "Authorization: Bearer ${GHL_API_KEY}" \
                -H "Version: 2021-07-28"`,
              { timeout: 10000 }
            ).toString();
            const searchData = JSON.parse(searchRes);
            const opp = searchData?.opportunities?.[0];
            if (opp?.id) {
              execSync(
                `curl -s -X PUT "https://services.leadconnectorhq.com/opportunities/${opp.id}" \
                  -H "Authorization: Bearer ${GHL_API_KEY}" \
                  -H "Version: 2021-07-28" \
                  -H "Content-Type: application/json" \
                  -d '{"pipelineStageId": "652fede7-697a-4592-bd81-080e524727b7"}'`,
                { timeout: 10000 }
              );
              console.log(`GHL opportunity moved to Contacted for ${customerName}`);
            }
          } catch (ghlErr: any) {
            console.error(`GHL stage update failed for ${customerName}:`, ghlErr.message);
          }

          // Mark proposal as follow_up_sent so it doesn't fire again
          await storage.updateProposal(proposal.id, { status: "follow_up_sent" } as any);

          results.push({ customer: customerName, email: proposal.customerEmail, status: "sent" });
          console.log(`Follow-up sent to ${customerName} (${proposal.customerEmail})`);

        } catch (err: any) {
          results.push({ customer: `${proposal.customerFirstName1} ${proposal.customerLastName1}`, error: err.message });
          console.error(`Follow-up failed:`, err.message);
        }
      }

      res.json({ ran: true, processed: overdue.length, results });
    } catch (err: any) {
      console.error("Follow-up run error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Health check — confirms server is running and env vars are loaded
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      emailMode: process.env.GMAIL_USER ? "smtp" : "gmail-embedded",
      database: process.env.TURSO_DATABASE_URL ? "turso-cloud" : "local-sqlite",
      gmailUser: "aclearalternative@gmail.com",
    });
  });

  // Create proposal
  app.post("/api/proposals", async (req, res) => {
    try {
      const shareId = nanoid(12);
      const proposal = await storage.createProposal({
        ...req.body,
        shareId,
        status: "draft",
      });
      res.json(proposal);
    } catch (err: any) {
      console.error("Error creating proposal:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get proposal by share ID
  app.get("/api/proposals/share/:shareId", async (req, res) => {
    try {
      const proposal = await storage.getProposalByShareId(req.params.shareId);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      res.json(proposal);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------
  // PDF DOWNLOAD — serves the proposal as a downloadable PDF
  // URL pattern: /api/proposals/pdf/:shareId
  // MUST be registered BEFORE /:id to avoid the catch-all swallowing it
  // ---------------------------------------------------------------
  app.get("/api/proposals/pdf/:shareId", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposalByShareId(req.params.shareId);
      if (!proposal) {
        return res.status(404).send("Proposal not found.");
      }

      const html = buildProposalHtml(proposal);
      const pdfBuffer = generatePdfFromHtml(html);

      const customerName = `${proposal.customerFirstName1} ${proposal.customerLastName1}`;
      const safeFilename = `ACA_Proposal_${customerName.replace(/[^a-z0-9]/gi, "_")}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
      res.setHeader("Cache-Control", "no-cache");
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("PDF endpoint error:", err.message);
      res.status(500).send("Error generating proposal PDF. Please try again.");
    }
  });

  // Get proposal by ID (registered AFTER specific routes to avoid catching /pdf/:shareId)
  app.get("/api/proposals/:id", async (req, res) => {
    try {
      const proposal = await storage.getProposal(parseInt(req.params.id));
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      res.json(proposal);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sign proposal
  app.patch("/api/proposals/:id/sign", async (req, res) => {
    try {
      const { customerSignature1, customerSignature2 } = req.body;
      const updated = await storage.updateProposal(parseInt(req.params.id), {
        customerSignature1,
        customerSignature2,
        status: "signed",
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Send email for proposal
  app.post("/api/proposals/:id/send-email", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(parseInt(req.params.id));
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      const repPhone = REPS[proposal.repName] || "";
      const customerName = `${proposal.customerFirstName1} ${proposal.customerLastName1}`;
      const packages = JSON.parse(proposal.packages);
      const selectedPkg = packages.find((p: any) => p.tier === proposal.selectedPackage);
      const selectedLabel = selectedPkg ? selectedPkg.label : "Selected";

      const discountType = proposal.discountType || "none";
      let discountPercent = 0;
      if (discountType === "veteran") discountPercent = 5;
      if (discountType === "fire_ems") discountPercent = 3;
      const discountAmt = selectedPkg ? Math.round(selectedPkg.totalPrice * discountPercent / 100) : 0;
      const finalPrice = selectedPkg ? selectedPkg.totalPrice - discountAmt : 0;
      const deposit = proposal.deposit || 0;
      const monthlyAmt = deposit >= finalPrice ? 0 : Math.round((finalPrice - deposit) / 120);

      // Build the proposal view link — points to the React frontend page
      // The customer opens this, sees the full proposal, and can download the PDF from there
      // Using the hardcoded deployed app URL so it works from any email client
      const APP_URL = process.env.APP_URL || "https://proposals.aclear.com";
      const proposalViewLink = `${APP_URL}/#/proposal/${proposal.shareId}`;
      const pdfLink = proposalViewLink; // alias for response JSON

      const emailBody = `Dear ${customerName},

Thank you for allowing A Clear Alternative to analyze your water and prepare a personalized treatment proposal.

Your complete proposal is ready — click the link below to view, sign, and download it as a PDF:

  ${proposalViewLink}

The proposal includes:
  • Your water analysis results
  • All three recommended treatment packages with pricing
  • Equipment brochure links for each item
  • Download PDF button to save or print your proposal
  • Acceptance & Authorization with digital signature

Selected Package: ${selectedLabel} — $${finalPrice.toLocaleString()}
Monthly Investment: $${monthlyAmt}/mo

To accept, sign and return the proposal, or simply call or text me directly:
  ${repPhone}

Thank you for choosing A Clear Alternative. We have been providing the highest quality water treatment solutions to families in NJ, PA, NY and DE since 1991.

${proposal.repName}
A Clear Alternative
(856) 663-8088  |  info@aclear.com  |  www.aclear.com`;

      // Send email
      await sendProposalEmail({
        to: proposal.customerEmail,
        subject: `Your Water Treatment Proposal — A Clear Alternative (${customerName})`,
        body: emailBody,
        bcc: ["aclearalternative@gmail.com", "asmith@aclear.com", "water325@aol.com"],
      });

      // Log to pipeline Google Sheet (non-fatal)
      const equipmentList = selectedPkg
        ? selectedPkg.equipment.map((e: any) => e.name).join(", ")
        : "";
      logToPipeline({
        "Customer Name": customerName,
        "Address": `${proposal.street}, ${proposal.city}, ${proposal.state} ${proposal.zip}`,
        "Email": proposal.customerEmail,
        "Package": selectedLabel,
        "Final Price": finalPrice.toString(),
        "Monthly Investment": monthlyAmt.toString(),
        "Deposit": deposit.toString(),
        "Water Source": proposal.waterSource === "well" ? "Well Water" : "City Water",
        "Rep": proposal.repName,
        "Sent Date": new Date().toLocaleDateString(),
        "Equipment": equipmentList,
      });

      // Create/update contact in GoHighLevel CRM via direct API (non-fatal)
      try {
        const GHL_API_KEY = process.env.GHL_API_KEY || "pit-24e8e4ec-6172-44e0-b0d7-6a621b9b4bc7";
        const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
        const ghlContact = {
          locationId: GHL_LOCATION_ID,
          firstName: proposal.customerFirstName1,
          lastName: proposal.customerLastName1,
          email: proposal.customerEmail,
          address1: proposal.street,
          city: proposal.city,
          state: proposal.state,
          postalCode: proposal.zip,
          source: "Proposal App",
          tags: [
            proposal.waterSource === "well" ? "Well Water" : "City Water",
            `Package: ${selectedLabel}`,
            `Rep: ${proposal.repName}`,
            "Proposal Sent",
          ],
        };
        const ghlRes = execSync(
          `curl -s -X POST "https://services.leadconnectorhq.com/contacts/upsert" \
            -H "Authorization: Bearer ${GHL_API_KEY}" \
            -H "Version: 2021-07-28" \
            -H "Content-Type: application/json" \
            -d '${JSON.stringify(ghlContact).replace(/'/g, "'\\''")}' `,
          { timeout: 15000 }
        ).toString();
        const ghlData = JSON.parse(ghlRes);
        const ghlContactId = ghlData?.contact?.id;
        console.log("GHL contact upserted:", customerName, "id:", ghlContactId);

        // Add opportunity to Water Treatment Proposals pipeline
        if (ghlContactId) {
          const oppPayload = JSON.stringify({
            locationId: GHL_LOCATION_ID,
            name: `${customerName} \u2014 ${selectedLabel} Package`,
            contactId: ghlContactId,
            monetaryValue: finalPrice,
            status: "open",
            pipelineId: "gyFJalG38xXKkAlmUHBo",
            pipelineStageId: "1d1267dd-811c-4f81-b7ff-abe98135f387",
          });
          // Write payload to temp file to avoid shell escaping issues
          const oppTmp = require("os").tmpdir() + "/ghl_opp_" + Date.now() + ".json";
          require("fs").writeFileSync(oppTmp, oppPayload);
          const oppRes = execSync(
            `curl -s -X POST "https://services.leadconnectorhq.com/opportunities/" \
              -H "Authorization: Bearer ${GHL_API_KEY}" \
              -H "Version: 2021-07-28" \
              -H "Content-Type: application/json" \
              -d @${oppTmp}`,
            { timeout: 15000 }
          ).toString();
          try { require("fs").unlinkSync(oppTmp); } catch {}
          const oppData = JSON.parse(oppRes);
          if (oppData?.opportunity?.id) {
            console.log("GHL opportunity created:", oppData.opportunity.id);
          } else if (oppData?.message?.includes("duplicate")) {
            console.log("GHL opportunity already exists for this contact — skipping");
          } else {
            console.log("GHL opportunity response:", JSON.stringify(oppData).slice(0, 100));
          }
        }
      } catch (ghlErr: any) {
        console.error("GHL sync failed (non-fatal):", ghlErr.message);
      }

      // Update proposal status
      await storage.updateProposal(proposal.id, {
        status: "sent",
        sentDate: new Date().toISOString(),
      });

      res.json({ success: true, pdfLink });
    } catch (err: any) {
      console.error("Error sending email:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
