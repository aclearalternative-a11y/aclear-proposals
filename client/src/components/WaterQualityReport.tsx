import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

interface WaterQualityData {
  found: boolean;
  zip: string;
  municipality?: string;
  county?: string;
  wellData?: {
    wellsTested: number;
    iron: number;
    pH: number;
    manganese: number;
    grossAlpha: number;
    coliform: number;
    nitrate: number;
    pfas: number;
    level: "municipality" | "county";
  };
  countyData?: {
    wellsTested: number;
    iron: number;
    pH: number;
    manganese: number;
    grossAlpha: number;
    coliform: number;
    nitrate: number;
    pfas: number;
  };
  cityWaterConcerns?: {
    name: string;
    pct: number;
    detail: string;
  }[];
}

function StatCard({ value, label, sub, alert }: { value: string; label: string; sub: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg p-2 sm:p-3 text-center border ${alert ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
      <div className={`text-xl sm:text-2xl font-extrabold ${alert ? "text-red-600" : "text-amber-600"}`}>{value}</div>
      <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
      <div className="text-[8px] sm:text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function BarRow({ label, local, county, pct }: { label: string; local: string; county: string; pct: number }) {
  const color = pct > 25 ? "bg-red-500" : pct > 10 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="grid grid-cols-4 gap-2 text-xs py-1.5 border-b border-border/30 items-center">
      <span className="font-medium">{label}</span>
      <span className="font-semibold">{local}</span>
      <span className="text-muted-foreground">{county}</span>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct * 2, 100)}%` }} />
      </div>
    </div>
  );
}

export function WellWaterQualityReport({ zip, address, municipality, county }: { zip: string; address: string; municipality?: string; county?: string }) {
  const [data, setData] = useState<WaterQualityData | null>(null);

  useEffect(() => {
    if (!zip) return;
    apiRequest("GET", `/api/water-quality/${zip}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, [zip]);

  if (!data?.found || !data.wellData) return null;

  const w = data.wellData;
  const c = data.countyData;
  const areaName = w.level === "municipality" ? data.municipality : `${data.county} County`;
  const ironRatio = w.iron >= 30 ? "1 in 3" : w.iron >= 20 ? "1 in 5" : w.iron >= 10 ? "1 in 10" : `${w.iron}%`;
  const phRatio = w.pH >= 40 ? "Nearly half" : w.pH >= 25 ? "1 in 4" : w.pH >= 15 ? "1 in 6" : `${w.pH}%`;

  return (
    <Card className="border-[#1d8fc4]/30 overflow-hidden">
      <div className="bg-gradient-to-r from-[#1d6fa4] to-[#145a87] px-4 py-2.5 text-white">
        <h2 className="font-bold text-sm">Neighborhood Water Quality Report</h2>
        <p className="text-[10px] text-[#b8daf0]">NJ DEP Private Well Testing Data — {w.wellsTested.toLocaleString()} wells tested in {areaName}</p>
      </div>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Under NJ's Private Well Testing Act, every private well is tested when a property is sold or leased.
          Here's what {w.wellsTested.toLocaleString()} tests near <strong>{address}</strong> revealed:
        </p>

        <div className="grid grid-cols-4 gap-2">
          <StatCard value={ironRatio} label="Exceed Iron Limits" sub={`${w.iron}% of wells`} alert={w.iron > 25} />
          <StatCard value={phRatio} label="Acidic Water" sub={`${w.pH}% outside range`} alert={w.pH > 30} />
          <StatCard value={`${w.manganese}%`} label="Manganese High" sub="above safe level" />
          <StatCard value={`${w.grossAlpha}%`} label="Radioactivity" sub="gross alpha above MCL" />
        </div>

        {c && (
          <div>
            <div className="grid grid-cols-4 gap-2 text-[9px] text-muted-foreground uppercase tracking-wide pb-1 border-b">
              <span>Contaminant</span>
              <span>Your Area</span>
              <span>{data.county} County</span>
              <span>Exceedance</span>
            </div>
            <BarRow label="Iron" local={`${w.iron}%`} county={`${c.iron}%`} pct={w.iron} />
            <BarRow label="pH" local={`${w.pH}%`} county={`${c.pH}%`} pct={w.pH} />
            <BarRow label="Manganese" local={`${w.manganese}%`} county={`${c.manganese}%`} pct={w.manganese} />
            <BarRow label="Gross Alpha" local={`${w.grossAlpha}%`} county={`${c.grossAlpha}%`} pct={w.grossAlpha} />
            {w.pfas > 0 && <BarRow label="PFAS" local={`${w.pfas}%`} county={`${c.pfas}%`} pct={w.pfas} />}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {w.iron > 10 && (
            <div className="bg-red-50 border-l-2 border-red-400 p-2 rounded-r">
              <div className="font-semibold text-red-800">Iron at {w.iron}%</div>
              <div className="text-red-700 text-[10px]">Causes rust staining on fixtures, metallic taste, and pipe buildup. A water conditioner eliminates this.</div>
            </div>
          )}
          {w.pH > 10 && (
            <div className="bg-red-50 border-l-2 border-red-400 p-2 rounded-r">
              <div className="font-semibold text-red-800">Low pH at {w.pH}%</div>
              <div className="text-red-700 text-[10px]">Acidic water corrodes pipes, leaches metals into drinking water, and causes blue-green staining.</div>
            </div>
          )}
          {w.manganese > 5 && (
            <div className="bg-amber-50 border-l-2 border-amber-400 p-2 rounded-r">
              <div className="font-semibold text-amber-800">Manganese at {w.manganese}%</div>
              <div className="text-amber-700 text-[10px]">Causes black/brown staining. Elevated levels linked to neurological concerns in children.</div>
            </div>
          )}
          {w.grossAlpha > 5 && (
            <div className="bg-amber-50 border-l-2 border-amber-400 p-2 rounded-r">
              <div className="font-semibold text-amber-800">Radioactivity at {w.grossAlpha}%</div>
              <div className="text-amber-700 text-[10px]">Naturally occurring in NJ geology. Nearly 1 in 10 wells tested above the safe limit.</div>
            </div>
          )}
        </div>

        <p className="text-[8px] text-muted-foreground">Source: NJ DEP Private Well Testing Act, Sept 2002 – Dec 2024 | {areaName}</p>
      </CardContent>
    </Card>
  );
}

export function CityWaterQualityReport({ zip, address, municipality, county }: { zip: string; address: string; municipality?: string; county?: string }) {
  const [data, setData] = useState<WaterQualityData | null>(null);

  useEffect(() => {
    if (!zip) return;
    apiRequest("GET", `/api/water-quality/${zip}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, [zip]);

  if (!data?.found || !data.cityWaterConcerns) return null;

  return (
    <Card className="border-[#1d8fc4]/30 overflow-hidden">
      <div className="bg-gradient-to-r from-[#1d6fa4] to-[#145a87] px-4 py-2.5 text-white">
        <h2 className="font-bold text-sm">Your Municipal Water Quality Report</h2>
        <p className="text-[10px] text-[#b8daf0]">Common contaminants in NJ municipal water systems — {data.municipality}, {data.county} County</p>
      </div>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Even though municipal water is treated and regulated, it often still contains contaminants that affect taste, health, and your home's plumbing.
          Here are the most common concerns in NJ public water systems near <strong>{address}</strong>:
        </p>

        <div className="space-y-2">
          {data.cityWaterConcerns.map((concern, i) => (
            <div key={i} className="flex items-start gap-3 border-b border-border/30 pb-2 last:border-0">
              <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                concern.pct >= 70 ? "bg-red-100 text-red-700" : concern.pct >= 40 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
              }`}>
                {concern.pct}%
              </div>
              <div>
                <div className="text-xs font-semibold">{concern.name}</div>
                <div className="text-[10px] text-muted-foreground leading-snug">{concern.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[#f0f7ff] border border-[#c5dff0] rounded p-2.5 text-xs text-center">
          <div className="font-semibold text-[#1d6fa4]">Even "safe" municipal water can damage your home</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Hard water causes $800+/year in appliance damage. Chlorine dries skin and hair. A whole-home filtration system solves all of these.</div>
        </div>

        <p className="text-[8px] text-muted-foreground">Source: EPA ECHO, NJ DEP, Environmental Working Group | {data.municipality}, NJ</p>
      </CardContent>
    </Card>
  );
}
