import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { nanoid } from "nanoid";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import nodemailer from "nodemailer";
import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Email transport — nodemailer (Gmail SMTP) when env vars are set,
// falls back to external-tool CLI when running inside Perplexity sandbox
// ---------------------------------------------------------------------------
// Convert plain text email body to HTML with clickable links
function textToHtml(text: string): string {
  // Escape HTML entities
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Convert URLs to clickable links (including hash routes)
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1d8fc4;text-decoration:underline;">$1</a>');
  // Convert newlines to <br>
  html = html.replace(/\n/g, '<br>');
  // Wrap in basic HTML
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;">${html}</div>`;
}

async function sendProposalEmail(opts: {
  to: string;
  subject: string;
  body: string;
  bcc: string[];
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  const gmailUser = process.env.GMAIL_USER || "aclearalternative@gmail.com";
  const gmailPass = process.env.GMAIL_APP_PASSWORD || "kcjswmfawaaugwqo";
  const htmlBody = textToHtml(opts.body);

  if (resendKey) {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: "A Clear Alternative <proposals@aclear.com>",
      to: [opts.to],
      bcc: opts.bcc,
      subject: opts.subject,
      text: opts.body,
      html: htmlBody,
    });
  } else if (process.env.NODE_ENV === "production") {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      family: 4,
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transporter.sendMail({
      from: `"A Clear Alternative" <${gmailUser}>`,
      to: opts.to,
      bcc: opts.bcc.join(","),
      subject: opts.subject,
      text: opts.body,
      html: htmlBody,
    });
  } else {
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
          body: htmlBody,
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

const REP_EMAILS: Record<string, string> = {
  "Gerald DiPietropolo": "water325@aol.com",
  "John DiPietropolo": "aclearalternative@gmail.com",
  "Nicholas DiPietropolo": "DiPietropolonicholas@gmail.com",
  "Eric Fusco": "Fusco003@gmail.com",
};

function getBrochureUrl(equipName: string): string {
  // Water heaters — most specific first (POWER VENT before Bradford White catch-all)
  if (equipName.includes("POWER VENT")) return "https://docs.bradfordwhite.com/Spec_Sheets/1117_Current.pdf";
  if (equipName.includes("ELECTRIC")) return "https://docs.bradfordwhite.com/Spec_Sheets/1201_Current.pdf";
  if (equipName.includes("Tankless Water Heater")) return "https://whitehvac.com/media/Navien-NPE-2-Brochure-2203-LO.pdf";
  if (equipName.includes("Bradford White")) return "https://docs.bradfordwhite.com/Spec_Sheets/1101_Current.pdf";
  // Water treatment — Twin Alternating must be checked before ACA grain-size pattern
  if (equipName.includes("Twin Alternating")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab";
  if (equipName.includes("Acid Neutralizer")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd";
  if (equipName.includes("Iron Odor Breaker")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:d04f7189-fc0e-4352-9cc0-7e3a70b70ca5";
  if (equipName.includes("Carbon Filtration")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd";
  if (equipName.includes("Reverse Osmosis") && equipName.includes("25")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:2c36639f-f003-444f-b8ad-e75123c60ee5";
  if (equipName.includes("Reverse Osmosis")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:b1fe4fc4-e725-4ccb-8cdd-a7cdb66ce816";
  // Single water conditioners: "ACA .75 24,000", "ACA 1.0 32,000", "ACA 1.5 48,000", etc.
  // The grain-size pattern (e.g. "24,000") uniquely identifies single conditioners
  if (equipName.startsWith("ACA") && /\d+,\d{3}/.test(equipName)) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91";
  // Accessories
  if (equipName.includes("Leak Shut Off") || equipName.includes("Leak Valve")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:02daeba4-c657-41de-9318-29ba0899d91d";
  if (equipName.includes("Rusco")) return "https://ruscowater.com/products/spin-down-filters/";
  return "";
}

function calcPkgDiscount(proposal: any, pkg: any) {
  const discountType = proposal.discountType || "none";
  const customVal = proposal.customDiscountValue || 0;
  const multiPkgRate = (pkg as any).discountRate || 0;
  const multiPkgPct = Math.round(multiPkgRate * 100);
  const MAX = 6;

  // Water heaters are NEVER discounted
  const waterHeaterTotal = (pkg.equipment || []).filter((e: any) =>
    e.name?.includes("Water Heater") || e.name?.includes("Bradford White") || e.name?.includes("Tankless Water Heater")
  ).reduce((sum: number, e: any) => sum + (e.price || 0), 0);
  const discountableBase = pkg.totalPrice - waterHeaterTotal;

  let discountPercent = 0;
  let discountAmt = 0;
  let discountLabel = "";

  if (discountType === "none" || discountableBase <= 0) {
    // No discount
  } else if (discountType === "custom_percent") {
    // Custom % — NO cap, rep decides
    discountPercent = customVal;
    discountAmt = Math.round(discountableBase * customVal / 100);
    discountLabel = `Discount (${discountPercent}%)`;
  } else if (discountType === "custom_dollar") {
    // Custom $ — NO cap, rep decides
    discountAmt = Math.min(customVal, discountableBase);
    discountPercent = discountableBase > 0 ? Math.round((discountAmt / discountableBase) * 100) : 0;
    discountLabel = `Discount (-$${discountAmt})`;
  } else if (discountType === "veteran") {
    // Veteran 5% — capped at 6% combined with multi-package
    discountPercent = Math.min(5, Math.max(0, MAX - multiPkgPct));
    discountAmt = Math.round(discountableBase * discountPercent / 100);
    discountLabel = `Veteran Discount (${discountPercent}%)`;
  } else if (discountType === "fire_ems") {
    // Fire/EMS 3% — capped at 6% combined with multi-package
    discountPercent = Math.min(3, Math.max(0, MAX - multiPkgPct));
    discountAmt = Math.round(discountableBase * discountPercent / 100);
    discountLabel = `Fire/EMS Discount (${discountPercent}%)`;
  }

  const finalPrice = pkg.totalPrice - discountAmt;
  const deposit = proposal.deposit || 0;
  const monthlyAmt = deposit >= finalPrice ? 0 : Math.round((finalPrice - deposit) * 0.0149);
  return { discountPercent, discountAmt, finalPrice, deposit, monthlyAmt, discountLabel };
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
    return calcPkgDiscount(proposal, pkg);
  }

  function buildPackageBlock(pkg: any): string {
    const isSelected = pkg.tier === proposal.selectedPackage;
    const pricing = calcPackagePricing(pkg);
    const headerClass = isSelected ? "pkg-header-teal" 
      : pkg.tier === "best" ? "pkg-header-best" 
      : "pkg-header-good";
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
  if (waterTest.pH !== undefined && waterTest.pH !== null) {
    addTest("pH", `${waterTest.pH}`, waterTest.pH < 6.5);
  }
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
  .teal-header { background-color: #1d8fc4 !important; padding: 18px 20px; }
  .teal-header h1 { margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: 0.3px; text-shadow: 0 1px 2px rgba(0,0,0,0.2); }
  .teal-header .subtitle { color: #ffffff; font-size: 12px; margin-top: 3px; font-weight: 600; opacity: 0.9; }
  .teal-header .contact { color: #ffffff; font-size: 11px; line-height: 1.8; text-align: right; font-weight: 500; opacity: 0.92; }
  .prepared-box { background-color: #eaf5fb; border-left: 4px solid #1d8fc4; padding: 12px 14px; margin-bottom: 14px; }
  .prepared-box .label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
  .prepared-box .name { font-size: 16px; font-weight: 700; color: #111; }
  .prepared-box .addr { font-size: 12px; color: #444; margin-top: 2px; }
  .prepared-box .meta { font-size: 11px; color: #555; margin-top: 4px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #1d8fc4; margin-bottom: 8px; }
  .water-table { width: 100%; border-collapse: collapse; border: 1px solid #ddd; margin-bottom: 14px; }
  .water-table th { background-color: #f5f5f5; padding: 5px 10px; font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase; text-align: left; }
  .water-table td { padding: 5px 10px; font-size: 12px; border-bottom: 1px solid #f0f0f0; background-color: #ffffff; }
  .water-table td.val-normal { color: #222; font-weight: 600; }
  .water-table td.val-flagged { color: #c0392b; font-weight: 700; }
  .pkg-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #ddd; }
  .pkg-table .pkg-header-teal { background-color: #1d8fc4 !important; padding: 9px 12px; }
  .pkg-table .pkg-header-good { background-color: #5d7a8a !important; padding: 9px 12px; }
  .pkg-table .pkg-header-best { background-color: #1a3a5c !important; padding: 9px 12px; }
  .pkg-table .pkg-title { color: #ffffff; font-size: 13px; font-weight: 700; }
  .pkg-table .pkg-badge { background-color: #ffffff; color: #1d8fc4; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 8px; margin-left: 8px; }
  .pkg-table td.equip-name { padding: 6px 10px; font-size: 12px; color: #333; border-bottom: 1px solid #f0f0f0; background-color: #ffffff; }
  .pkg-table td.equip-price { padding: 6px 10px; font-size: 12px; color: #333; border-bottom: 1px solid #f0f0f0; text-align: right; white-space: nowrap; background-color: #ffffff; }
  .pkg-table td.install-row { padding: 4px 10px; font-size: 11px; color: #1d8fc4; background-color: #ffffff; }
  .pkg-table td.total-label { padding: 7px 10px; font-size: 13px; font-weight: 700; border-top: 2px solid #ddd; background-color: #ffffff; color: #111; }
  .pkg-table td.total-val { padding: 7px 10px; font-size: 13px; font-weight: 700; border-top: 2px solid #ddd; text-align: right; background-color: #ffffff; color: #111; }
  .pkg-table td.monthly-label { padding: 7px 10px; font-size: 13px; font-weight: 700; background-color: #e8f4fb; color: #1d8fc4; }
  .pkg-table td.monthly-val { padding: 7px 10px; font-size: 13px; font-weight: 700; text-align: right; background-color: #e8f4fb; color: #1d8fc4; }
  .pkg-table td.discount-label { padding: 4px 10px; font-size: 11px; color: #888; background-color: #ffffff; }
  .pkg-table td.discount-val { padding: 4px 10px; font-size: 11px; color: #888; text-align: right; background-color: #ffffff; }
  a.brochure-link { font-size: 10px; color: #1d8fc4; text-decoration: none; border: 1px solid #1d8fc4; padding: 1px 6px; border-radius: 8px; white-space: nowrap; }
  .acceptance-box { border: 2px solid #1d8fc4; }
  .acceptance-header { background-color: #1d8fc4 !important; padding: 9px 14px; }
  .acceptance-header span { color: #ffffff; font-size: 13px; font-weight: 700; }
  .acceptance-body { padding: 14px; background-color: #ffffff; }
  .pricing-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .pricing-table td { padding: 4px 6px; font-size: 12px; background-color: #ffffff; color: #444; }
  .pricing-table td.p-val { text-align: right; }
  .pricing-table tr.final-row td { border-top: 2px solid #1d8fc4; padding-top: 6px; font-size: 14px; font-weight: 700; color: #1d8fc4; }
  .pricing-table tr.monthly-row td { font-size: 12px; color: #1d8fc4; }
  .nj-notice { font-size: 9px; color: #444; line-height: 1.5; margin-bottom: 14px; padding: 9px; background-color: #fff8f0; border-left: 3px solid #e67e22; }
  .sig-table { width: 100%; border-collapse: collapse; }
  .sig-table td { padding: 0; background-color: #ffffff; vertical-align: bottom; }
  .sig-label { font-size: 10px; color: #555; margin-bottom: 3px; }
  .sig-line { border-bottom: 1px solid #999; height: 36px; }
  .sig-name { font-size: 9px; color: #aaa; margin-top: 2px; }
  .footer-bar { background-color: #1d8fc4 !important; padding: 14px 20px; margin-top: 14px; }
  .footer-bar p { margin: 0; color: #ffffff; font-size: 12px; line-height: 1.8; font-weight: 500; opacity: 0.92; }
  .footer-bar .rep-name { color: #ffffff; font-size: 14px; font-weight: 800; margin-top: 6px; }
  .accept-note { margin-top: 12px; font-size: 11px; color: #444; font-style: italic; }
  .findings-box { margin-bottom: 14px; }
  .finding-item { background-color: #fff8f0; border-left: 4px solid #e67e22; padding: 8px 12px; margin-bottom: 7px; border-radius: 0 4px 4px 0; }
  .finding-label { font-size: 12px; font-weight: 700; color: #c0392b; margin-bottom: 3px; }
  .finding-detail { font-size: 11px; color: #444; line-height: 1.5; }
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
  <div class="addr" style="margin-top:2px;">${proposal.numPeople || 3} people &bull; ${proposal.numBathrooms || 2} bathroom${(proposal.numBathrooms || 2) !== 1 ? 's' : ''}</div>
  <div class="meta">Date: ${today} &nbsp;&nbsp;|&nbsp;&nbsp; Representative: ${proposal.repName} &mdash; ${repPhone}</div>
</div>

<!-- WATER ANALYSIS -->
<div class="section-title">Water Analysis Results &mdash; ${isWell ? "Well Water" : "City Water"}</div>
<table class="water-table">
  <tr><th>Parameter</th><th>Result</th></tr>
  ${testRows.join("\n")}
</table>

<!-- WHAT YOUR RESULTS MEAN -->
${(() => {
  const findings: string[] = [];
  if (waterTest.pH !== undefined && waterTest.pH !== null && waterTest.pH < 6.5) findings.push(`<div class="finding-item"><div class="finding-label">pH ${waterTest.pH} &mdash; Acidic Water</div><div class="finding-detail">Your water is acidic. Acidic water slowly corrodes copper pipes and fixtures, can leach metals into your drinking water, and gives water a slightly sour taste. An acid neutralizer raises pH to a safe, balanced level.</div></div>`);
  if (waterTest.pH !== undefined && waterTest.pH !== null && waterTest.pH > 8.5) findings.push(`<div class="finding-item"><div class="finding-label">pH ${waterTest.pH} &mdash; Alkaline Water</div><div class="finding-detail">Your water is alkaline. High pH can cause scale buildup in pipes, water heaters, and appliances and may give water a bitter taste.</div></div>`);
  if (parseFloat(waterTest.iron) > 0.3) findings.push(`<div class="finding-item"><div class="finding-label">Iron ${waterTest.iron} ppm &mdash; Elevated</div><div class="finding-detail">Your iron level is above the recommended limit of 0.3 ppm. High iron causes orange and reddish-brown staining on fixtures, sinks, laundry, and toilets. It also gives water a metallic taste and clogs pipes over time.</div></div>`);
  if (parseFloat(waterTest.hardness) > 7) findings.push(`<div class="finding-item"><div class="finding-label">Hardness ${waterTest.hardness} gpg &mdash; Hard Water</div><div class="finding-detail">Your water is hard. Hard water leaves white crusty scale deposits on faucets, showerheads, and inside pipes and water heaters. It reduces the efficiency and lifespan of appliances and makes soap and detergent less effective.</div></div>`);
  if (waterTest.copper && parseFloat(waterTest.copper) > 0.3) findings.push(`<div class="finding-item"><div class="finding-label">Copper ${waterTest.copper} ppm &mdash; Elevated</div><div class="finding-detail">Copper above 0.3 ppm can give water a metallic taste and cause blue-green staining on fixtures. High levels may indicate corrosion of copper pipes in your home.</div></div>`);
  if (waterTest.chlorine && parseFloat(waterTest.chlorine) > 0) findings.push(`<div class="finding-item"><div class="finding-label">Chlorine ${waterTest.chlorine} ppm &mdash; Present</div><div class="finding-detail">Chlorine is added by municipal systems to disinfect water. While regulated, it can give water an unpleasant taste and odor and may react with organic matter to form byproducts.</div></div>`);
  if (parseInt(waterTest.tds) > 500) findings.push(`<div class="finding-item"><div class="finding-label">TDS ${waterTest.tds} ppm &mdash; Elevated Dissolved Solids</div><div class="finding-detail">TDS measures the concentration of dissolved minerals, salts, and metals in your water. Elevated TDS can give water a bitter or salty taste and may indicate the presence of contaminants. A reverse osmosis system effectively removes dissolved solids.</div></div>`);
  if (waterTest.hydrogenSulfide && ((parseInt(waterTest.h2sCold)||0) > 3 || (parseInt(waterTest.h2sHot)||0) > 3)) findings.push(`<div class="finding-item"><div class="finding-label">Hydrogen Sulfide &mdash; Detected</div><div class="finding-detail">Hydrogen sulfide produces the characteristic &ldquo;rotten egg&rdquo; smell in your water. It is corrosive to pipes and fixtures and affects the taste of beverages and food prepared with the water.</div></div>`);
  if (findings.length === 0) return '';
  return `<div class="findings-box"><div class="section-title" style="margin-bottom:8px;">What Your Results Mean</div>${findings.join('')}</div>`;
})()}

<!-- NEIGHBORHOOD WATER QUALITY REPORT -->
${(() => {
  const { lookupWellWaterData, NJ_CITY_WATER_CONCERNS, NJ_ZIP_MAP, COUNTY_PWTA } = require("./water-quality-data");
  const location = NJ_ZIP_MAP[proposal.zip];
  if (!location) return '';
  
  if (isWell) {
    const wellData = lookupWellWaterData(proposal.zip);
    if (!wellData) return '';
    const w = wellData.stats;
    const c = COUNTY_PWTA[wellData.county];
    const areaName = wellData.level === 'municipality' ? wellData.municipality : `${wellData.county} County`;
    const ironRatio = w.iron >= 30 ? '1 in 3' : w.iron >= 20 ? '1 in 5' : w.iron >= 10 ? '1 in 10' : `${w.iron}%`;
    const phRatio = w.pH >= 40 ? 'Nearly half' : w.pH >= 25 ? '1 in 4' : w.pH >= 15 ? '1 in 6' : `${w.pH}%`;
    return `
    <div style="border:1px solid #c5dff0;border-radius:6px;overflow:hidden;margin-bottom:14px;">
      <div style="background:linear-gradient(135deg,#1d6fa4,#145a87);padding:10px 16px;color:#fff;">
        <div style="font-weight:700;font-size:13px;">Neighborhood Water Quality Report</div>
        <div style="font-size:9px;color:#b8daf0;">NJ DEP Private Well Testing Data &mdash; ${w.wellsTested.toLocaleString()} wells tested in ${areaName}</div>
      </div>
      <div style="padding:12px 16px;">
        <p style="font-size:10px;color:#666;margin-bottom:10px;">Under NJ's Private Well Testing Act, every private well is tested when a property is sold or leased. Here's what ${w.wellsTested.toLocaleString()} tests near <strong>${fullAddress}</strong> revealed:</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
          <tr>
            <td style="width:25%;text-align:center;padding:8px;background:#fff5f4;border:1px solid #f0c4c0;border-radius:4px;"><div style="font-size:20px;font-weight:800;color:#c0392b;">${ironRatio}</div><div style="font-size:8px;color:#666;text-transform:uppercase;">Exceed Iron Limits</div><div style="font-size:7px;color:#999;">${w.iron}% of wells</div></td>
            <td style="width:4%;"></td>
            <td style="width:25%;text-align:center;padding:8px;background:#fff5f4;border:1px solid #f0c4c0;border-radius:4px;"><div style="font-size:20px;font-weight:800;color:#c0392b;">${phRatio}</div><div style="font-size:8px;color:#666;text-transform:uppercase;">Acidic Water</div><div style="font-size:7px;color:#999;">${w.pH}% outside range</div></td>
            <td style="width:4%;"></td>
            <td style="width:21%;text-align:center;padding:8px;background:#fffaf0;border:1px solid #f0deb0;border-radius:4px;"><div style="font-size:20px;font-weight:800;color:#c07b2b;">${w.manganese}%</div><div style="font-size:8px;color:#666;text-transform:uppercase;">Manganese High</div></td>
            <td style="width:4%;"></td>
            <td style="width:21%;text-align:center;padding:8px;background:#fffaf0;border:1px solid #f0deb0;border-radius:4px;"><div style="font-size:20px;font-weight:800;color:#c07b2b;">${w.grossAlpha}%</div><div style="font-size:8px;color:#666;text-transform:uppercase;">Radioactivity</div></td>
          </tr>
        </table>
        ${w.iron > 10 ? `<div style="background:#fff5f4;border-left:3px solid #c0392b;padding:6px 10px;margin-bottom:4px;font-size:9px;"><strong style="color:#8b1a1a;">Iron at ${w.iron}%</strong> <span style="color:#666;">— Causes rust staining, metallic taste, and pipe buildup.</span></div>` : ''}
        ${w.pH > 10 ? `<div style="background:#fff5f4;border-left:3px solid #c0392b;padding:6px 10px;margin-bottom:4px;font-size:9px;"><strong style="color:#8b1a1a;">Low pH at ${w.pH}%</strong> <span style="color:#666;">— Acidic water corrodes pipes and leaches metals into drinking water.</span></div>` : ''}
        <div style="font-size:7px;color:#bbb;margin-top:6px;">Source: NJ DEP PWTA, Sept 2002 &ndash; Dec 2024 | ${areaName}</div>
      </div>
    </div>`;
  } else {
    // City water
    const concerns = NJ_CITY_WATER_CONCERNS;
    return `
    <div style="border:1px solid #c5dff0;border-radius:6px;overflow:hidden;margin-bottom:14px;">
      <div style="background:linear-gradient(135deg,#1d6fa4,#145a87);padding:10px 16px;color:#fff;">
        <div style="font-weight:700;font-size:13px;">Your Municipal Water Quality Report</div>
        <div style="font-size:9px;color:#b8daf0;">Common contaminants in NJ municipal water &mdash; ${location.municipality}, ${location.county} County</div>
      </div>
      <div style="padding:12px 16px;">
        <p style="font-size:10px;color:#666;margin-bottom:10px;">Even treated municipal water contains contaminants that affect taste, health, and your home. Common concerns near <strong>${fullAddress}</strong>:</p>
        ${concerns.map((c: any) => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:6px 0;border-bottom:1px solid #f0f4f8;">
          <div style="width:36px;height:36px;border-radius:50%;background:${c.pct >= 70 ? '#fff0ef' : c.pct >= 40 ? '#fffaf0' : '#f0f7ff'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:700;color:${c.pct >= 70 ? '#c0392b' : c.pct >= 40 ? '#c07b2b' : '#1d6fa4'};">${c.pct}%</div>
          <div><div style="font-size:10px;font-weight:600;">${c.name}</div><div style="font-size:8.5px;color:#666;">${c.detail}</div></div>
        </div>`).join('')}
        <div style="font-size:7px;color:#bbb;margin-top:6px;">Source: EPA ECHO, NJ DEP, Environmental Working Group</div>
      </div>
    </div>`;
  }
})()}

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
    const GHL_API_KEY = process.env.GHL_API_KEY || "pit-d7eddf87-065e-4031-a399-3b3fc4a8af97";
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
            bcc: ["aclearalternative@gmail.com", REP_EMAILS[proposal.repName]].filter(Boolean),
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

  // Live pricing from Google Sheets
  const { startPricingSync, getCachedPricing, refreshPricing } = require("./pricing-sync");
  startPricingSync();

  app.get("/api/pricing", async (_req: Request, res: Response) => {
    let data = getCachedPricing();
    if (!data) {
      try { data = await refreshPricing(); } catch { return res.status(503).json({ error: "Pricing data not yet available" }); }
    }
    res.json(data);
  });

  app.post("/api/pricing/refresh", async (_req: Request, res: Response) => {
    try {
      const data = await refreshPricing();
      res.json({ success: true, lastUpdated: data.lastUpdated, items: Object.keys(data).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Water quality data lookup by ZIP
  app.get("/api/water-quality/:zip", (req: Request, res: Response) => {
    const { lookupWellWaterData, NJ_CITY_WATER_CONCERNS, NJ_ZIP_MAP, COUNTY_PWTA } = require("./water-quality-data");
    const zip = req.params.zip;
    const location = NJ_ZIP_MAP[zip];
    if (!location) {
      return res.json({ found: false, zip });
    }
    const wellData = lookupWellWaterData(zip);
    return res.json({
      found: true,
      zip,
      municipality: location.municipality,
      county: location.county,
      wellData: wellData ? { ...wellData.stats, level: wellData.level } : null,
      countyData: COUNTY_PWTA[location.county] || null,
      cityWaterConcerns: NJ_CITY_WATER_CONCERNS,
    });
  });

  // Health check — confirms server is running and env vars are loaded
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      emailMode: process.env.RESEND_API_KEY ? "resend" : process.env.GMAIL_USER ? "smtp" : "gmail-embedded",
      database: "turso-cloud",
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

  // Get proposal by share ID — also fires "viewed" tracking on first open
  app.get("/api/proposals/share/:shareId", async (req, res) => {
    try {
      const proposal = await storage.getProposalByShareId(req.params.shareId);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      res.json(proposal);

      // Fire viewed tracking async (don't block the response)
      if (proposal.status === "sent") {
        setImmediate(async () => {
          try {
            const GHL_API_KEY = process.env.GHL_API_KEY || "pit-d7eddf87-065e-4031-a399-3b3fc4a8af97";
            const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
            const customerName = `${proposal.customerFirstName1} ${proposal.customerLastName1}`;
            const repPhone = REPS[proposal.repName];
            const proposalLink = `https://proposals.aclear.com/#/proposal/${proposal.shareId}`;

            // Mark as viewed
            await storage.updateProposal(proposal.id, { status: "viewed" } as any);

            // SMS the rep via GHL
            if (repPhone) {
              try {
                // Format phone for GHL: +1XXXXXXXXXX
                const ghlPhone = "+1" + repPhone.replace(/\D/g, "");

                // Find or create the rep as a GHL contact to get contactId
                const repContactRes = execSync(
                  `curl -s "https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${GHL_LOCATION_ID}&number=${encodeURIComponent(ghlPhone)}" \
                    -H "Authorization: Bearer ${GHL_API_KEY}" \
                    -H "Version: 2021-07-28"`,
                  { timeout: 10000 }
                ).toString();
                let repContactId = JSON.parse(repContactRes)?.contact?.id;

                // If rep not found, create them
                if (!repContactId) {
                  const createRepTmp = require("os").tmpdir() + "/rep_contact_" + Date.now() + ".json";
                  require("fs").writeFileSync(createRepTmp, JSON.stringify({
                    locationId: GHL_LOCATION_ID,
                    firstName: proposal.repName.split(" ")[0],
                    lastName: proposal.repName.split(" ").slice(1).join(" "),
                    phone: ghlPhone,
                    tags: ["Rep", "A Clear Alternative Staff"],
                  }));
                  const createRes = execSync(
                    `curl -s -X POST "https://services.leadconnectorhq.com/contacts/" \
                      -H "Authorization: Bearer ${GHL_API_KEY}" \
                      -H "Version: 2021-07-28" \
                      -H "Content-Type: application/json" \
                      -d @${createRepTmp}`,
                    { timeout: 10000 }
                  ).toString();
                  require("fs").unlinkSync(createRepTmp);
                  repContactId = JSON.parse(createRes)?.contact?.id;
                }

                if (repContactId) {
                  const smsTmp = require("os").tmpdir() + "/ghl_sms_" + Date.now() + ".json";
                  require("fs").writeFileSync(smsTmp, JSON.stringify({
                    type: "SMS",
                    contactId: repContactId,
                    message: `A Clear Alt: ${customerName} just viewed their proposal! Call or text them now.\n${proposalLink}`,
                  }));
                  execSync(
                    `curl -s -X POST "https://services.leadconnectorhq.com/conversations/messages" \
                      -H "Authorization: Bearer ${GHL_API_KEY}" \
                      -H "Version: 2021-07-28" \
                      -H "Content-Type: application/json" \
                      -d @${smsTmp}`,
                    { timeout: 10000 }
                  );
                  require("fs").unlinkSync(smsTmp);
                  console.log(`SMS sent to ${proposal.repName} (${repPhone}) — ${customerName} viewed proposal`);
                }
              } catch (smsErr: any) {
                console.error("SMS send error:", smsErr.message);
              }
            }

            // Move GHL opportunity to Viewed stage
            try {
              const searchRes = execSync(
                `curl -s "https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=gyFJalG38xXKkAlmUHBo" \
                  -H "Authorization: Bearer ${GHL_API_KEY}" \
                  -H "Version: 2021-07-28"`,
                { timeout: 10000 }
              ).toString();
              const opps = JSON.parse(searchRes)?.opportunities || [];
              const opp = opps.find((o: any) => o.contact?.email === proposal.customerEmail);
              if (opp?.id) {
                execSync(
                  `curl -s -X PUT "https://services.leadconnectorhq.com/opportunities/${opp.id}" \
                    -H "Authorization: Bearer ${GHL_API_KEY}" \
                    -H "Version: 2021-07-28" \
                    -H "Content-Type: application/json" \
                    -d '{"pipelineStageId": "4291a04f-0ea0-4823-bca3-d99e21e2b1f2"}'`,
                  { timeout: 10000 }
                );
                console.log(`GHL opportunity moved to Viewed for ${customerName}`);
              }
            } catch (e: any) {
              console.error("GHL viewed stage update failed:", e.message);
            }
          } catch (e: any) {
            console.error("Viewed tracking error:", e.message);
          }
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------
  // PRINT VIEW — returns print-ready HTML for browser print-to-PDF
  // Opens in new tab, browser print dialog fires automatically
  // Works on all devices with zero server dependencies
  // ---------------------------------------------------------------
  app.get("/api/proposals/print/:shareId", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposalByShareId(req.params.shareId);
      if (!proposal) return res.status(404).send("Proposal not found.");
      const html = buildProposalHtml(proposal);
      // Inject print auto-trigger and print-specific styles
      const printHtml = html.replace(
        "</head>",
        `<style>
          @media screen { body { background: #f4f4f4; padding: 20px; } }
          @media print { body { background: #fff; padding: 0; } .no-print { display: none !important; } }
        </style>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 600);
          };
        </script>
        </head>`
      );
      res.setHeader("Content-Type", "text/html");
      res.send(printHtml);
    } catch (err: any) {
      console.error("Print endpoint error:", err.message);
      res.status(500).send("Error loading proposal. Please try again.");
    }
  });

  // ---------------------------------------------------------------
  // PDF DOWNLOAD — WeasyPrint fallback (works locally, may fail on Render free tier)
  // ---------------------------------------------------------------
  app.get("/api/proposals/pdf/:shareId", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposalByShareId(req.params.shareId);
      if (!proposal) return res.status(404).send("Proposal not found.");
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

  // Customer selects a package (when rep sent multiple and customer chooses)
  app.patch("/api/proposals/:id/select-package", async (req: Request, res: Response) => {
    try {
      const { selectedPackage } = req.body;
      const updated = await storage.updateProposal(parseInt(req.params.id), { selectedPackage });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sign proposal
  app.patch("/api/proposals/:id/sign", async (req: Request, res: Response) => {
    try {
      const { customerSignature1, customerSignature2 } = req.body;
      const proposal = await storage.getProposal(parseInt(req.params.id));
      if (!proposal) return res.status(404).json({ error: "Proposal not found" });

      const updated = await storage.updateProposal(parseInt(req.params.id), {
        customerSignature1,
        customerSignature2,
        status: "signed",
      });
      res.json(updated);

      // Fire all post-sign actions async (don’t block the response)
      setImmediate(async () => {
        try {
          const GHL_API_KEY = process.env.GHL_API_KEY || "pit-d7eddf87-065e-4031-a399-3b3fc4a8af97";
          const GHL_LOCATION_ID = "3iegkvSPwHli58Bn2vZE";
          const customerName = `${proposal.customerFirstName1} ${proposal.customerLastName1}`;
          const repPhone = REPS[proposal.repName] || "(856) 663-8088";
          const repPhoneFormatted = "+1" + repPhone.replace(/\D/g, "");
          const packages = JSON.parse(proposal.packages || "[]");
          const selectedPkg = packages.find((p: any) => p.tier === proposal.selectedPackage);
          const selectedLabel = selectedPkg ? selectedPkg.label : "Selected";
          const sigPricing = selectedPkg ? calcPkgDiscount(proposal, selectedPkg) : { discountAmt: 0, finalPrice: 0, deposit: 0, monthlyAmt: 0, discountPercent: 0 };
          const { discountAmt, finalPrice, deposit, monthlyAmt } = sigPricing;
          const proposalLink = `https://proposals.aclear.com/#/proposal/${proposal.shareId}`;

          // 1. WELCOME EMAIL to customer
          const welcomeBody = `Dear ${customerName},

Welcome to the A Clear Alternative family!

Thank you for choosing us to provide you and your family with the highest quality water. We are thrilled to have you as a customer and look forward to serving you for many years to come.

Your signed proposal is on file. Here’s a summary of what you’ve selected:

  Package: ${selectedLabel}
  Final Price: $${finalPrice.toLocaleString()}
  Monthly Investment: $${monthlyAmt}/mo

What happens next:
  • Your representative ${proposal.repName} will contact you within 24 hours to schedule your installation
  • Installation typically takes 2-4 hours
  • You can view your signed proposal anytime at: ${proposalLink}

If you have any questions in the meantime, please call or text your representative directly:
  ${repPhone}

Thank you again for trusting A Clear Alternative.

${proposal.repName}
A Clear Alternative
(856) 663-8088  |  info@aclear.com  |  www.aclear.com`;

          await sendProposalEmail({
            to: proposal.customerEmail,
            subject: `Welcome to A Clear Alternative! — ${customerName}`,
            body: welcomeBody,
            bcc: ["aclearalternative@gmail.com", "asmith@aclear.com", "liz@aclear.com"],
          });
          console.log(`Welcome email sent to ${customerName}`);

          // 1b. INTERNAL INSTALL SCHEDULING EMAIL to office
          const equipmentList = selectedPkg
            ? selectedPkg.equipment.map((e: any) => `  - ${e.name}: $${e.price.toLocaleString()}`).join("\n")
            : "  - See proposal";

          const installBody = `NEW SIGNED PROPOSAL — SCHEDULE INSTALLATION

Customer: ${customerName}
Address: ${proposal.street}, ${proposal.city}, ${proposal.state} ${proposal.zip}
Email: ${proposal.customerEmail}
Phone: ${proposal.customerPhone || '(not provided)'}

Rep: ${proposal.repName} — ${repPhone}
Signed: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

Package: ${selectedLabel}
Equipment:
${equipmentList}

Total: $${finalPrice.toLocaleString()}
Monthly Investment: $${monthlyAmt}/mo
Deposit: $${deposit.toLocaleString()}

Proposal Link: ${proposalLink}
View Proposal: https://proposals.aclear.com/#/proposal/${proposal.shareId}

Please contact ${customerName} within 24 hours to schedule installation.`;

          await sendProposalEmail({
            to: "aclearalternative@gmail.com",
            subject: `✅ Install Needed — ${customerName} — ${selectedLabel} Package`,
            body: installBody,
            bcc: ["asmith@aclear.com", "liz@aclear.com"],
          });
          console.log(`Install scheduling email sent for ${customerName}`);

          // 2. SMS TO REP — customer signed
          try {
            const repContactRes = execSync(
              `curl -s "https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${GHL_LOCATION_ID}&number=${encodeURIComponent(repPhoneFormatted)}" \
                -H "Authorization: Bearer ${GHL_API_KEY}" -H "Version: 2021-07-28"`,
              { timeout: 10000 }
            ).toString();
            let repContactId = JSON.parse(repContactRes)?.contact?.id;

            if (!repContactId) {
              const tmp = require("os").tmpdir() + "/rep_" + Date.now() + ".json";
              require("fs").writeFileSync(tmp, JSON.stringify({
                locationId: GHL_LOCATION_ID,
                firstName: proposal.repName.split(" ")[0],
                lastName: proposal.repName.split(" ").slice(1).join(" "),
                phone: repPhoneFormatted,
                tags: ["Rep", "A Clear Alternative Staff"],
              }));
              const r = execSync(`curl -s -X POST "https://services.leadconnectorhq.com/contacts/" \
                -H "Authorization: Bearer ${GHL_API_KEY}" -H "Version: 2021-07-28" \
                -H "Content-Type: application/json" -d @${tmp}`, { timeout: 10000 }).toString();
              require("fs").unlinkSync(tmp);
              repContactId = JSON.parse(r)?.contact?.id;
            }

            if (repContactId) {
              const smsTmp = require("os").tmpdir() + "/sms_sign_" + Date.now() + ".json";
              require("fs").writeFileSync(smsTmp, JSON.stringify({
                type: "SMS",
                contactId: repContactId,
                message: `🎉 ${customerName} just SIGNED their proposal!\n\nPackage: ${selectedLabel}\nTotal: $${finalPrice.toLocaleString()}\nMonthly: $${monthlyAmt}/mo\n\nSchedule their install ASAP.`,
              }));
              execSync(`curl -s -X POST "https://services.leadconnectorhq.com/conversations/messages" \
                -H "Authorization: Bearer ${GHL_API_KEY}" -H "Version: 2021-07-28" \
                -H "Content-Type: application/json" -d @${smsTmp}`, { timeout: 10000 });
              require("fs").unlinkSync(smsTmp);
              console.log(`Rep SMS sent — ${customerName} signed`);
            }
          } catch (smsErr: any) {
            console.error("Rep SMS (signed) error:", smsErr.message);
          }

          // 3. GHL PIPELINE — move to Closed Won + update monetary value
          try {
            const searchRes = execSync(
              `curl -s "https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=gyFJalG38xXKkAlmUHBo" \
                -H "Authorization: Bearer ${GHL_API_KEY}" -H "Version: 2021-07-28"`,
              { timeout: 10000 }
            ).toString();
            const opps = JSON.parse(searchRes)?.opportunities || [];
            const opp = opps.find((o: any) =>
              o.contact?.email === proposal.customerEmail ||
              o.name?.includes(customerName)
            );
            if (opp?.id) {
              const wonTmp = require("os").tmpdir() + "/ghl_won_" + Date.now() + ".json";
              require("fs").writeFileSync(wonTmp, JSON.stringify({
                pipelineStageId: "ce89b632-21d2-47a2-850d-cca976fcedec", // Signed stage
                status: "won",
                monetaryValue: finalPrice,
              }));
              execSync(`curl -s -X PUT "https://services.leadconnectorhq.com/opportunities/${opp.id}" \
                -H "Authorization: Bearer ${GHL_API_KEY}" -H "Version: 2021-07-28" \
                -H "Content-Type: application/json" -d @${wonTmp}`, { timeout: 10000 });
              require("fs").unlinkSync(wonTmp);
              console.log(`GHL opportunity marked Signed/Won for ${customerName}`);
            }
          } catch (ghlErr: any) {
            console.error("GHL won update error:", ghlErr.message);
          }

          // 4. Tag the customer contact as signed in GHL
          try {
            const tagTmp = require("os").tmpdir() + "/ghl_tag_" + Date.now() + ".json";
            require("fs").writeFileSync(tagTmp, JSON.stringify({
              locationId: GHL_LOCATION_ID,
              name: customerName,
              email: proposal.customerEmail,
              tags: ["Signed", `${selectedLabel} Package`, "Customer"],
            }));
            execSync(`curl -s -X POST "https://services.leadconnectorhq.com/contacts/upsert" \
              -H "Authorization: Bearer ${GHL_API_KEY}" -H "Version: 2021-07-28" \
              -H "Content-Type: application/json" -d @${tagTmp}`, { timeout: 10000 });
            require("fs").unlinkSync(tagTmp);
          } catch (tagErr: any) {
            console.error("GHL tag error:", tagErr.message);
          }

        } catch (err: any) {
          console.error("Post-sign actions error:", err.message);
        }
      });

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
      const followPricing = selectedPkg ? calcPkgDiscount(proposal, selectedPkg) : { discountAmt: 0, finalPrice: 0, deposit: 0, monthlyAmt: 0 };
      const { discountAmt, finalPrice, monthlyAmt, deposit } = followPricing;

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
        bcc: ["aclearalternative@gmail.com", REP_EMAILS[proposal.repName]].filter(Boolean),
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
        const GHL_API_KEY = process.env.GHL_API_KEY || "pit-d7eddf87-065e-4031-a399-3b3fc4a8af97";
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
            // Opportunity already exists for this contact — find it and update
            try {
              const searchRes2 = execSync(
                `curl -s "https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=gyFJalG38xXKkAlmUHBo&contact_id=${ghlContactId}" \
                  -H "Authorization: Bearer ${GHL_API_KEY}" -H "Version: 2021-07-28"`,
                { timeout: 10000 }
              ).toString();
              const existingOpp = JSON.parse(searchRes2)?.opportunities?.[0];
              if (existingOpp?.id) {
                const updateTmp = require("os").tmpdir() + "/ghl_opp_upd_" + Date.now() + ".json";
                require("fs").writeFileSync(updateTmp, JSON.stringify({
                  name: `${customerName} \u2014 ${selectedLabel} Package`,
                  monetaryValue: finalPrice,
                  status: "open",
                  pipelineStageId: "1d1267dd-811c-4f81-b7ff-abe98135f387",
                }));
                execSync(
                  `curl -s -X PUT "https://services.leadconnectorhq.com/opportunities/${existingOpp.id}" \
                    -H "Authorization: Bearer ${GHL_API_KEY}" -H "Version: 2021-07-28" \
                    -H "Content-Type: application/json" -d @${updateTmp}`,
                  { timeout: 10000 }
                );
                require("fs").unlinkSync(updateTmp);
                console.log("GHL opportunity updated (was duplicate):", existingOpp.id);
              }
            } catch (dupErr: any) {
              console.error("GHL duplicate update error:", dupErr.message);
            }
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
