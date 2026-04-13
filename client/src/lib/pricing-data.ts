import type { EquipmentItem, PackageData, WaterTestResults } from "@shared/schema";
import { nanoid } from "nanoid";

// Representatives
export const REPS = [
  { name: "Gerald DiPietropolo", phone: "609-352-6908" },
  { name: "John DiPietropolo", phone: "609-352-6905" },
  { name: "Nicholas DiPietropolo", phone: "609-352-6909" },
  { name: "Eric Fusco", phone: "856-649-5467" },
];

export function getRepPhone(repName: string): string {
  return REPS.find(r => r.name === repName)?.phone || "";
}

// Discount options
export const DISCOUNTS = [
  { label: "No Discount", value: "none", percent: 0 },
  { label: "Retired Veteran (5%)", value: "veteran", percent: 5 },
  { label: "Fire/EMS (3%)", value: "fire_ems", percent: 3 },
  { label: "Custom Percent (%)", value: "custom_percent", percent: 0 },
  { label: "Custom Dollar ($)", value: "custom_dollar", percent: 0 },
];

// ---- Equipment Catalog ----

const CONDITIONERS_SINGLE = [
  { name: "ACA .75 24,000", size: "0.75", price: 2290, rentalPrice: 30, rentalInstallPrice: 500, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91" },
  { name: "ACA 1.0 32,000", size: "1.0", price: 2790, rentalPrice: 35, rentalInstallPrice: 550, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91" },
  { name: "ACA 1.5 48,000", size: "1.5", price: 3290, rentalPrice: 40, rentalInstallPrice: 600, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91" },
  { name: "ACA 2.0 64,000", size: "2.0", price: 3790, rentalPrice: 45, rentalInstallPrice: 650, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91" },
  { name: "ACA 2.5 80,000", size: "2.5", price: 4290, rentalPrice: 55, rentalInstallPrice: 700, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91" },
  { name: "ACA 3.5 110,000", size: "3.5", price: 4790, rentalPrice: 60, rentalInstallPrice: 750, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91" },
];

const CONDITIONERS_TWIN = [
  { name: "ACA .75 24,000 Twin Alternating", size: "0.75", price: 3890, rentalPrice: 50, rentalInstallPrice: 600, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab" },
  { name: "ACA 1.0 32,000 Twin Alternating", size: "1.0", price: 4740, rentalPrice: 55, rentalInstallPrice: 650, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab" },
  { name: "ACA 1.5 48,000 Twin Alternating", size: "1.5", price: 5590, rentalPrice: 60, rentalInstallPrice: 700, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab" },
  { name: "ACA 2.0 64,000 Twin Alternating", size: "2.0", price: 6440, rentalPrice: 65, rentalInstallPrice: 750, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab" },
  { name: "ACA 2.5 80,000 Twin Alternating", size: "2.5", price: 7290, rentalPrice: 75, rentalInstallPrice: 800, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab" },
  { name: "ACA 3.5 110,000 Twin Alternating", size: "3.5", price: 8140, rentalPrice: 80, rentalInstallPrice: 850, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab" },
];

const ACID_NEUTRALIZERS = [
  { name: "ACA Acid Neutralizer 1.5", size: "1.5", price: 1790, people: "1-3", phRange: "6.0-6.5", brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd" },
  { name: "ACA Acid Neutralizer 2.0", size: "2.0", price: 2290, people: "2-4", phRange: "5.5-6.0", brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd" },
  { name: "ACA Acid Neutralizer 2.5", size: "2.5", price: 2790, people: "3-6", phRange: "5.0-5.5", brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd" },
  { name: "ACA Acid Neutralizer 3.0", size: "3.0", price: 3290, people: "4-8", phRange: "4.5-5.0", brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd" },
];

const IRON_ODOR_BREAKERS = [
  { name: "ACA Iron Odor Breaker 1.5", size: "1.5", price: 2290, people: "1-3", brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:d04f7189-fc0e-4352-9cc0-7e3a70b70ca5" },
  { name: "ACA Iron Odor Breaker 2.0", size: "2.0", price: 2790, people: "2-4", brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:d04f7189-fc0e-4352-9cc0-7e3a70b70ca5" },
  { name: "ACA Iron Odor Breaker 2.5", size: "2.5", price: 3290, people: "3-6", brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:d04f7189-fc0e-4352-9cc0-7e3a70b70ca5" },
  { name: "ACA Iron Odor Breaker 3.0", size: "3.0", price: 3790, people: "4-8", brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:d04f7189-fc0e-4352-9cc0-7e3a70b70ca5" },
];

const CARBON_FILTRATION = [
  { name: "ACA Carbon Filtration 1.0", size: "1.0", price: 2290, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd" },
  { name: "ACA Carbon Filtration 1.5", size: "1.5", price: 2790, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd" },
  { name: "ACA Carbon Filtration 2.0", size: "2.0", price: 3290, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd" },
  { name: "ACA Carbon Filtration 2.5", size: "2.5", price: 3790, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd" },
];

const RO_SYSTEMS = [
  { name: "ACA Reverse Osmosis 25 GPD", size: "25 GPD", price: 1190, people: "1-2" },
  { name: "ACA Reverse Osmosis 50 GPD", size: "50 GPD", price: 1290, people: "3-4" },
  { name: "ACA Tankless 800 GPD", size: "800 GPD", price: 1790, people: "4+" },
];

const BLADDER_TANKS = [
  { name: "WR 120 Bladder Tank Complete", size: "WR120", price: 1590 },
  { name: "WR 140 Bladder Tank Complete", size: "WR140", price: 1890 },
  { name: "WR 240 Bladder Tank Complete", size: "WR240", price: 2190 },
  { name: "WR 260 Bladder Tank Complete", size: "WR260", price: 2490 },
  { name: "WR 360 Bladder Tank Complete", size: "WR360", price: 2790 },
];

const UV_LIGHTS = [
  { name: "ACA 8 GPM Ultra Violet Light", size: "8 GPM", price: 1550 },
  { name: "ACA 12 GPM Ultra Violet Light", size: "12 GPM", price: 1850 },
];

const CHEMICAL_INJECTION = { name: "Chemical Injection Package", size: "", price: 3890 };
const LEAK_VALVE = { name: '1" Emergency Leak Shut Off Valve', size: "", price: 1490, brochureUrl: "https://acrobat.adobe.com/id/urn:aaid:sc:US:02daeba4-c657-41de-9318-29ba0899d91d" };
const RUSCO_FILTER = { name: 'Rusco Sand/Sediment Filter 1"', size: "", price: 225 };
const OZONE_PURIFIER = { name: "ACA Whole House Ozone Air Purifier", size: "", price: 2290 };
const PRESSURE_BOOSTER = { name: '1" SS Pressure Boosting System up to 80 PSI', size: "", price: 2995 };

// Water heaters
const WATER_HEATERS = [
  { name: "40 Gallon GAS Bradford White Hot Water Heater", size: "40G Gas", price: 2500 },
  { name: "40 Gallon GAS POWER VENT Bradford White Hot Water Heater", size: "40G Gas PV", price: 3969 },
  { name: "40 Gallon ELECTRIC Bradford White Hot Water Heater", size: "40G Elec", price: 2072 },
  { name: "50 Gallon GAS Bradford White Hot Water Heater", size: "50G Gas", price: 2753 },
  { name: "50 Gallon GAS POWER VENT Bradford White Hot Water Heater", size: "50G Gas PV", price: 4220 },
  { name: "50 Gallon ELECTRIC Bradford White Hot Water Heater", size: "50G Elec", price: 2172 },
  { name: "199,000 Tankless Water Heater - Unlimited Supply", size: "Tankless", price: 5895 },
];

// All equipment available for the add dropdown
export function getAllEquipmentOptions(): { category: string; items: { name: string; size: string; price: number; rentalPrice?: number; rentalInstallPrice?: number; brochureUrl?: string }[] }[] {
  return [
    { category: "Water Conditioners (Single)", items: CONDITIONERS_SINGLE },
    { category: "Water Conditioners (Twin Alternating)", items: CONDITIONERS_TWIN },
    { category: "Acid Neutralizers", items: ACID_NEUTRALIZERS },
    { category: "Iron Odor Breakers", items: IRON_ODOR_BREAKERS },
    { category: "Carbon Filtration", items: CARBON_FILTRATION },
    { category: "Reverse Osmosis", items: RO_SYSTEMS },
    { category: "Bladder Tanks", items: BLADDER_TANKS },
    { category: "UV Lights", items: UV_LIGHTS },
    { category: "Chemical Injection", items: [CHEMICAL_INJECTION] },
    { category: "Leak Shut Off Valve", items: [LEAK_VALVE] },
    { category: "Rusco Filter", items: [RUSCO_FILTER] },
    { category: "Ozone Air Purifier", items: [OZONE_PURIFIER] },
    { category: "Pressure Boosting System", items: [PRESSURE_BOOSTER] },
    { category: "Water Heaters", items: WATER_HEATERS },
  ];
}

// Sizing helpers
function sizeConditioner(hardness: number, numPeople: number): number {
  // Pick conditioner size based on hardness & people
  const gpg = hardness;
  if (gpg <= 15 && numPeople <= 2) return 0; // .75
  if (gpg <= 15 && numPeople <= 4) return 1; // 1.0
  if (gpg <= 25 && numPeople <= 4) return 2; // 1.5
  if (gpg <= 25 && numPeople <= 6) return 3; // 2.0
  if (gpg <= 40) return 4; // 2.5
  return 5; // 3.5
}

function sizeAcidNeutralizer(pH: number, numPeople: number): number {
  if (pH >= 6.0) return 0; // 1.5
  if (pH >= 5.5 && numPeople <= 4) return 1; // 2.0
  if (pH >= 5.0 && numPeople <= 6) return 2; // 2.5
  return 3; // 3.0
}

function sizeIronOdorBreaker(numPeople: number): number {
  if (numPeople <= 3) return 0;
  if (numPeople <= 4) return 1;
  if (numPeople <= 6) return 2;
  return 3;
}

function sizeCarbonFiltration(numPeople: number): number {
  if (numPeople <= 2) return 0;
  if (numPeople <= 4) return 1;
  if (numPeople <= 6) return 2;
  return 3;
}

function sizeRO(numPeople: number): number {
  if (numPeople <= 2) return 0;
  if (numPeople <= 4) return 1;
  return 2;
}

function sizeUV(numBathrooms: number): number {
  return numBathrooms >= 3 ? 1 : 0;
}

function makeSizeOptions(items: { name: string; size: string; price: number; rentalPrice?: number; rentalInstallPrice?: number; brochureUrl?: string }[]) {
  return items.map(i => ({ name: i.name, size: i.size, price: i.price, rentalPrice: i.rentalPrice, rentalInstallPrice: i.rentalInstallPrice }));
}

function makeEquipment(
  category: string,
  items: { name: string; size: string; price: number; rentalPrice?: number; rentalInstallPrice?: number; brochureUrl?: string }[],
  sizeIndex: number
): EquipmentItem {
  const item = items[sizeIndex];
  return {
    id: nanoid(),
    category,
    name: item.name,
    size: item.size,
    price: item.price,
    brochureUrl: item.brochureUrl,
    rentalPrice: item.rentalPrice,
    rentalInstallPrice: item.rentalInstallPrice,
    sizeOptions: makeSizeOptions(items),
    currentSizeIndex: sizeIndex,
  };
}

function makeFixedEquipment(category: string, item: { name: string; size: string; price: number; brochureUrl?: string }): EquipmentItem {
  return {
    id: nanoid(),
    category,
    name: item.name,
    size: item.size,
    price: item.price,
    brochureUrl: item.brochureUrl,
  };
}

export function generatePackages(
  waterSource: "well" | "city",
  waterTest: WaterTestResults,
  numPeople: number,
  numBathrooms: number
): PackageData[] {
  const useTwin = waterTest.iron > 1.5;
  // Only trigger acid neutralizer if pH was actually entered AND is below threshold
  const needsAcidNeutralizer = !!waterTest.pH && waterTest.pH < 6.5;
  const hasH2S = waterTest.hydrogenSulfide;
  const h2sHigh = (waterTest.h2sCold && waterTest.h2sCold > 7) || (waterTest.h2sHot && waterTest.h2sHot > 7);

  const conditioners = useTwin ? CONDITIONERS_TWIN : CONDITIONERS_SINGLE;
  const conditionerIdx = sizeConditioner(waterTest.hardness, numPeople);
  const acidIdx = needsAcidNeutralizer ? sizeAcidNeutralizer(waterTest.pH, numPeople) : 0;
  const iobIdx = sizeIronOdorBreaker(numPeople);
  const carbonIdx = sizeCarbonFiltration(numPeople);
  const roIdx = sizeRO(numPeople);
  const uvIdx = sizeUV(numBathrooms);

  if (waterSource === "well") {
    // GOOD: Water conditioner + leak valve
    const goodEquip: EquipmentItem[] = [
      makeEquipment("Water Conditioner", conditioners, conditionerIdx),
      makeFixedEquipment("Leak Shut Off Valve", LEAK_VALVE),
    ];

    // BETTER: Water conditioner + acid neutralizer (if needed) + RO + leak valve
    const betterEquip: EquipmentItem[] = [
      makeEquipment("Water Conditioner", conditioners, conditionerIdx),
    ];
    if (needsAcidNeutralizer) {
      betterEquip.push(makeEquipment("Acid Neutralizer", ACID_NEUTRALIZERS, acidIdx));
    }
    betterEquip.push(makeEquipment("Reverse Osmosis", RO_SYSTEMS, roIdx));
    betterEquip.push(makeFixedEquipment("Leak Shut Off Valve", LEAK_VALVE));

    // BEST: conditioner + acid neutralizer (if needed) + iron odor breaker (if H2S) + RO + UV + bladder tank + Rusco + leak valve
    const bestEquip: EquipmentItem[] = [
      makeEquipment("Water Conditioner", conditioners, conditionerIdx),
    ];
    if (needsAcidNeutralizer) {
      bestEquip.push(makeEquipment("Acid Neutralizer", ACID_NEUTRALIZERS, acidIdx));
    }
    if (hasH2S) {
      if (h2sHigh) {
        bestEquip.push(makeFixedEquipment("Chemical Injection", CHEMICAL_INJECTION));
      }
      bestEquip.push(makeEquipment("Iron Odor Breaker", IRON_ODOR_BREAKERS, iobIdx));
    }
    bestEquip.push(makeEquipment("Reverse Osmosis", RO_SYSTEMS, roIdx));
    bestEquip.push(makeEquipment("UV Light", UV_LIGHTS, uvIdx));
    bestEquip.push(makeEquipment("Bladder Tank", BLADDER_TANKS, 0)); // Default WR120
    bestEquip.push(makeFixedEquipment("Rusco Filter", RUSCO_FILTER));
    bestEquip.push(makeFixedEquipment("Leak Shut Off Valve", LEAK_VALVE));

    return [
      { tier: "good", label: "Good", equipment: goodEquip, totalPrice: calcTotal(goodEquip), installationIncluded: true },
      { tier: "better", label: "Better", equipment: betterEquip, totalPrice: calcTotal(betterEquip), installationIncluded: true },
      { tier: "best", label: "Best", equipment: bestEquip, totalPrice: calcTotal(bestEquip), installationIncluded: true },
    ];
  } else {
    // CITY WATER
    // GOOD: Water conditioner + carbon filtration + leak valve
    const goodEquip: EquipmentItem[] = [
      makeEquipment("Water Conditioner", conditioners, conditionerIdx),
      makeEquipment("Carbon Filtration", CARBON_FILTRATION, carbonIdx),
      makeFixedEquipment("Leak Shut Off Valve", LEAK_VALVE),
    ];

    // BETTER: conditioner + carbon + RO + leak valve
    const betterEquip: EquipmentItem[] = [
      makeEquipment("Water Conditioner", conditioners, conditionerIdx),
      makeEquipment("Carbon Filtration", CARBON_FILTRATION, carbonIdx),
      makeEquipment("Reverse Osmosis", RO_SYSTEMS, roIdx),
      makeFixedEquipment("Leak Shut Off Valve", LEAK_VALVE),
    ];

    // BEST: conditioner + carbon + RO + UV + leak valve
    const bestEquip: EquipmentItem[] = [
      makeEquipment("Water Conditioner", conditioners, conditionerIdx),
      makeEquipment("Carbon Filtration", CARBON_FILTRATION, carbonIdx),
      makeEquipment("Reverse Osmosis", RO_SYSTEMS, roIdx),
      makeEquipment("UV Light", UV_LIGHTS, uvIdx),
      makeFixedEquipment("Leak Shut Off Valve", LEAK_VALVE),
    ];

    return [
      { tier: "good", label: "Good", equipment: goodEquip, totalPrice: calcTotal(goodEquip), installationIncluded: true },
      { tier: "better", label: "Better", equipment: betterEquip, totalPrice: calcTotal(betterEquip), installationIncluded: true },
      { tier: "best", label: "Best", equipment: bestEquip, totalPrice: calcTotal(bestEquip), installationIncluded: true },
    ];
  }
}

export function calcTotal(equipment: EquipmentItem[]): number {
  return equipment.reduce((sum, e) => sum + e.price, 0);
}

export function applyDiscount(
  total: number,
  discountType: string,
  alreadyAppliedRate: number = 0,  // multi-package discount already baked in (0.02 or 0.04)
  customValue: number = 0,  // custom % or $ amount entered by rep
  waterHeaterTotal: number = 0  // excluded from all discounts
): { discountedTotal: number; discountAmount: number; discountPercent: number } {
  const discountableBase = total - waterHeaterTotal; // never discount water heaters
  if (discountableBase <= 0 || discountType === "none") {
    return { discountedTotal: total, discountAmount: 0, discountPercent: 0 };
  }

  const MAX_TOTAL_DISCOUNT = 5;
  const alreadyAppliedPercent = Math.round(alreadyAppliedRate * 100);

  if (discountType === "custom_dollar") {
    // Custom $ — NO cap, rep decides. Still excludes water heaters.
    const amt = Math.min(customValue, discountableBase); // can't discount more than equipment total
    const pct = discountableBase > 0 ? Math.round((amt / discountableBase) * 100) : 0;
    return { discountedTotal: total - amt, discountAmount: amt, discountPercent: pct };
  }

  if (discountType === "custom_percent") {
    // Custom % — NO cap, rep decides. Still excludes water heaters.
    const amt = Math.round(discountableBase * customValue / 100);
    return { discountedTotal: total - amt, discountAmount: amt, discountPercent: customValue };
  }

  // Veteran / Fire-EMS — capped at 5% combined with multi-package
  const discount = DISCOUNTS.find(d => d.value === discountType);
  const rawPercent = discount?.percent || 0;
  const effectivePercent = Math.min(rawPercent, Math.max(0, MAX_TOTAL_DISCOUNT - alreadyAppliedPercent));
  const discountAmount = Math.round(discountableBase * effectivePercent / 100);
  return { discountedTotal: total - discountAmount, discountAmount, discountPercent: effectivePercent };
}

export function calcMonthlyInvestment(totalAfterDiscount: number, deposit: number): number {
  const balance = totalAfterDiscount - deposit;
  if (balance <= 0) return 0;
  // 1.49% of balance after discounts and deposit
  return Math.round(balance * 0.0149);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}
