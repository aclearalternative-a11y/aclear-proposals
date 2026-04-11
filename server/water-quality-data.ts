// NJ PWTA (Private Well Testing Act) data by county and municipality
// Source: NJ DEP, September 2002 – December 2024
// Format: { wellsTested, iron%, pH%, manganese%, grossAlpha%, coliform%, nitrate%, pfas% }

export interface PWTAStats {
  wellsTested: number;
  iron: number;
  pH: number;
  manganese: number;
  grossAlpha: number;
  coliform: number;
  nitrate: number;
  pfas: number;
}

// County-level data — fallback when municipality data isn't available
// Real data from NJDEP PWTA Interactive Map, Sept 2002 – Dec 2024
export const COUNTY_PWTA: Record<string, PWTAStats> = {
  "Burlington": { wellsTested: 12189, iron: 42.2, pH: 44.5, manganese: 21.2, grossAlpha: 10.0, coliform: 0.7, nitrate: 1.1, pfas: 6.8 },
  "Camden": { wellsTested: 3759, iron: 23.3, pH: 88.9, manganese: 14.3, grossAlpha: 36.3, coliform: 0.5, nitrate: 1.5, pfas: 5.5 },
  "Gloucester": { wellsTested: 9220, iron: 35.8, pH: 61.6, manganese: 13.9, grossAlpha: 12.8, coliform: 0.6, nitrate: 2.7, pfas: 5.2 },
  "Atlantic": { wellsTested: 8102, iron: 24.2, pH: 95.6, manganese: 12.7, grossAlpha: 11.2, coliform: 0.5, nitrate: 3.1, pfas: 4.7 },
  "Ocean": { wellsTested: 9102, iron: 27.3, pH: 60.5, manganese: 16.7, grossAlpha: 5.3, coliform: 0.8, nitrate: 0.5, pfas: 4.3 },
  "Mercer": { wellsTested: 3471, iron: 21.2, pH: 25.0, manganese: 23.1, grossAlpha: 5.9, coliform: 3.0, nitrate: 1.5, pfas: 15.2 },
  "Salem": { wellsTested: 5094, iron: 45.4, pH: 54.3, manganese: 20.7, grossAlpha: 17.4, coliform: 0.8, nitrate: 8.8, pfas: 7.2 },
  "Cumberland": { wellsTested: 8423, iron: 26.5, pH: 92.3, manganese: 15.4, grossAlpha: 30.6, coliform: 0.6, nitrate: 12.9, pfas: 5.0 },
  "Monmouth": { wellsTested: 7586, iron: 73.7, pH: 29.9, manganese: 39.1, grossAlpha: 2.2, coliform: 0.8, nitrate: 0.5, pfas: 1.2 },
  "Morris": { wellsTested: 13112, iron: 25.1, pH: 50.4, manganese: 18.9, grossAlpha: 4.2, coliform: 1.9, nitrate: 1.8, pfas: 17.1 },
  "Hunterdon": { wellsTested: 13703, iron: 16.0, pH: 28.1, manganese: 10.9, grossAlpha: 5.8, coliform: 3.3, nitrate: 0.8, pfas: 4.4 },
};

// Municipality-level data — more precise when available
export const MUNICIPALITY_PWTA: Record<string, PWTAStats & { county: string }> = {
  "Southampton Township": { county: "Burlington", wellsTested: 1043, iron: 30.8, pH: 23.0, manganese: 10.5, grossAlpha: 9.6, coliform: 0.6, nitrate: 0.3, pfas: 0.6 },
  // More municipalities can be added over time
};

// NJ ZIP code to municipality + county mapping (service area)
export const NJ_ZIP_MAP: Record<string, { municipality: string; county: string }> = {
  // Burlington County
  "08088": { municipality: "Southampton Township", county: "Burlington" },
  "08015": { municipality: "Browns Mills", county: "Burlington" },
  "08016": { municipality: "Burlington Township", county: "Burlington" },
  "08019": { municipality: "Chatsworth", county: "Burlington" },
  "08022": { municipality: "Columbus", county: "Burlington" },
  "08036": { municipality: "Hainesport", county: "Burlington" },
  "08041": { municipality: "Jobstown", county: "Burlington" },
  "08046": { municipality: "Willingboro", county: "Burlington" },
  "08048": { municipality: "Lumberton", county: "Burlington" },
  "08052": { municipality: "Maple Shade", county: "Burlington" },
  "08053": { municipality: "Marlton", county: "Burlington" },
  "08054": { municipality: "Mount Laurel", county: "Burlington" },
  "08055": { municipality: "Medford", county: "Burlington" },
  "08057": { municipality: "Moorestown", county: "Burlington" },
  "08060": { municipality: "Mount Holly", county: "Burlington" },
  "08064": { municipality: "New Lisbon", county: "Burlington" },
  "08065": { municipality: "Palmyra", county: "Burlington" },
  "08068": { municipality: "Pemberton", county: "Burlington" },
  "08073": { municipality: "Rancocas", county: "Burlington" },
  "08075": { municipality: "Riverside", county: "Burlington" },
  "08077": { municipality: "Riverton", county: "Burlington" },
  "08078": { municipality: "Runnemede", county: "Camden" },
  "08080": { municipality: "Sewell", county: "Gloucester" },
  // Camden County
  "08002": { municipality: "Cherry Hill", county: "Camden" },
  "08003": { municipality: "Cherry Hill", county: "Camden" },
  "08009": { municipality: "Berlin", county: "Camden" },
  "08012": { municipality: "Blackwood", county: "Camden" },
  "08021": { municipality: "Clementon", county: "Camden" },
  "08026": { municipality: "Gibbsboro", county: "Camden" },
  "08030": { municipality: "Gloucester City", county: "Camden" },
  "08031": { municipality: "Bellmawr", county: "Camden" },
  "08033": { municipality: "Haddonfield", county: "Camden" },
  "08034": { municipality: "Cherry Hill", county: "Camden" },
  "08035": { municipality: "Haddon Heights", county: "Camden" },
  "08043": { municipality: "Voorhees", county: "Camden" },
  "08049": { municipality: "Magnolia", county: "Camden" },
  "08059": { municipality: "Mount Ephraim", county: "Camden" },
  "08081": { municipality: "Sicklerville", county: "Camden" },
  "08083": { municipality: "Somerdale", county: "Camden" },
  "08084": { municipality: "Stratford", county: "Camden" },
  "08089": { municipality: "Waterford Works", county: "Camden" },
  "08091": { municipality: "West Berlin", county: "Camden" },
  "08104": { municipality: "Camden", county: "Camden" },
  "08105": { municipality: "Camden", county: "Camden" },
  "08107": { municipality: "Oaklyn", county: "Camden" },
  "08108": { municipality: "Collingswood", county: "Camden" },
  "08109": { municipality: "Merchantville", county: "Camden" },
  "08110": { municipality: "Pennsauken", county: "Camden" },
  // Gloucester County
  "08004": { municipality: "Atco", county: "Camden" },
  "08007": { municipality: "Barrington", county: "Camden" },
  "08020": { municipality: "Clarksboro", county: "Gloucester" },
  "08025": { municipality: "Franklinville", county: "Gloucester" },
  "08027": { municipality: "Gibbstown", county: "Gloucester" },
  "08028": { municipality: "Glassboro", county: "Gloucester" },
  "08032": { municipality: "Grenloch", county: "Gloucester" },
  "08039": { municipality: "Harrisonville", county: "Gloucester" },
  "08051": { municipality: "Mantua", county: "Gloucester" },
  "08056": { municipality: "Mickleton", county: "Gloucester" },
  "08061": { municipality: "Mount Royal", county: "Gloucester" },
  "08062": { municipality: "Mullica Hill", county: "Gloucester" },
  "08063": { municipality: "National Park", county: "Gloucester" },
  "08066": { municipality: "Paulsboro", county: "Gloucester" },
  "08071": { municipality: "Pitman", county: "Gloucester" },
  "08080": { municipality: "Sewell", county: "Gloucester" },
  "08085": { municipality: "Swedesboro", county: "Gloucester" },
  "08086": { municipality: "Thorofare", county: "Gloucester" },
  "08090": { municipality: "Wenonah", county: "Gloucester" },
  "08093": { municipality: "Westville", county: "Gloucester" },
  "08094": { municipality: "Williamstown", county: "Gloucester" },
  "08096": { municipality: "Woodbury", county: "Gloucester" },
  "08097": { municipality: "Woodbury Heights", county: "Gloucester" },
  // Atlantic County
  "08037": { municipality: "Hammonton", county: "Atlantic" },
  "08201": { municipality: "Absecon", county: "Atlantic" },
  "08205": { municipality: "Galloway", county: "Atlantic" },
  "08215": { municipality: "Egg Harbor City", county: "Atlantic" },
  "08221": { municipality: "Linwood", county: "Atlantic" },
  "08225": { municipality: "Northfield", county: "Atlantic" },
  "08232": { municipality: "Pleasantville", county: "Atlantic" },
  "08234": { municipality: "Egg Harbor Township", county: "Atlantic" },
  "08330": { municipality: "Mays Landing", county: "Atlantic" },
  "08401": { municipality: "Atlantic City", county: "Atlantic" },
  // Ocean County
  "08005": { municipality: "Barnegat", county: "Ocean" },
  "08006": { municipality: "Barnegat Light", county: "Ocean" },
  "08050": { municipality: "Manahawkin", county: "Ocean" },
  "08087": { municipality: "Tuckerton", county: "Ocean" },
  "08721": { municipality: "Bayville", county: "Ocean" },
  "08731": { municipality: "Forked River", county: "Ocean" },
  "08733": { municipality: "Lakehurst", county: "Ocean" },
  "08734": { municipality: "Lanoka Harbor", county: "Ocean" },
  "08753": { municipality: "Toms River", county: "Ocean" },
  "08757": { municipality: "Toms River", county: "Ocean" },
  "08758": { municipality: "Waretown", county: "Ocean" },
  "08759": { municipality: "Manchester", county: "Ocean" },
};

// City water quality data by water system / municipality
// Source: EPA ECHO, EWG, NJ American Water annual reports
export interface CityWaterStats {
  systemName: string;
  population: number;
  violations: number;
  contaminants: {
    name: string;
    detected: string;
    limit: string;
    healthGuideline: string;
    exceedsGuideline: boolean;
  }[];
}

// Common NJ city water concerns (statewide patterns)
export const NJ_CITY_WATER_CONCERNS = [
  { name: "Chlorine & Disinfection Byproducts", pct: 85, detail: "Present in virtually all municipal water. Chlorine is added to kill bacteria but creates byproducts (THMs, HAAs) linked to increased cancer risk with long-term exposure." },
  { name: "Lead (from aging pipes)", pct: 40, detail: "NJ has identified over 143,000 lead service lines statewide. Even treated water can pick up lead from old pipes between the main and your faucet." },
  { name: "PFAS (Forever Chemicals)", pct: 30, detail: "NJ has some of the strictest PFAS limits in the nation. Multiple water systems have detected PFOA, PFOS, or PFNA above state limits." },
  { name: "Hardness (Scale Buildup)", pct: 60, detail: "Municipal water in South Jersey typically ranges from moderately hard to hard (7-15 gpg), causing scale deposits on fixtures and reducing appliance efficiency." },
  { name: "Chromium-6 (Hexavalent Chromium)", pct: 70, detail: "Detected in most NJ public water systems. No federal MCL exists, but the Environmental Working Group recommends a health guideline of 0.02 ppb." },
];

// Lookup function: given a ZIP code, return the best available PWTA data
export function lookupWellWaterData(zip: string): { municipality: string; county: string; stats: PWTAStats; level: "municipality" | "county" } | null {
  const location = NJ_ZIP_MAP[zip];
  if (!location) return null;
  
  // Try municipality-level first
  const muniData = MUNICIPALITY_PWTA[location.municipality];
  if (muniData) {
    return { municipality: location.municipality, county: location.county, stats: muniData, level: "municipality" };
  }
  
  // Fall back to county-level
  const countyData = COUNTY_PWTA[location.county];
  if (countyData) {
    return { municipality: location.municipality, county: location.county, stats: countyData, level: "county" };
  }
  
  return null;
}
