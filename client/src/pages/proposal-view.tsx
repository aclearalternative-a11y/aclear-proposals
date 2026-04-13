import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useParams } from "wouter";
import type { Proposal, PackageData, WaterTestResults } from "@shared/schema";
import { formatCurrency, applyDiscount, calcMonthlyInvestment, getRepPhone, DISCOUNTS } from "@/lib/pricing-data";
import { WellWaterQualityReport, CityWaterQualityReport } from "@/components/WaterQualityReport";

function getWaterHeaterTotal(pkg: any): number {
  return (pkg.equipment || []).filter((e: any) =>
    e.name?.includes("Water Heater") || e.name?.includes("Bradford White") || e.name?.includes("Tankless Water Heater")
  ).reduce((sum: number, e: any) => sum + (e.price || 0), 0);
}
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Droplets, Phone, Mail, MapPin, Download, FileText } from "lucide-react";

function getBrochureUrl(name: string): string {
  // Water heaters — most specific first
  if (name.includes("POWER VENT")) return "https://docs.bradfordwhite.com/Spec_Sheets/1117_Current.pdf";
  if (name.includes("ELECTRIC")) return "https://docs.bradfordwhite.com/Spec_Sheets/1201_Current.pdf";
  if (name.includes("Tankless Water Heater")) return "https://whitehvac.com/media/Navien-NPE-2-Brochure-2203-LO.pdf";
  if (name.includes("Bradford White")) return "https://docs.bradfordwhite.com/Spec_Sheets/1101_Current.pdf";
  // Water treatment — check Twin Alternating before generic ACA pattern
  if (name.includes("Twin Alternating")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab";
  if (name.includes("Acid Neutralizer")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd";
  if (name.includes("Iron Odor Breaker")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:d04f7189-fc0e-4352-9cc0-7e3a70b70ca5";
  if (name.includes("Carbon Filtration")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd";
  if (name.includes("Reverse Osmosis") && name.includes("25")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:2c36639f-f003-444f-b8ad-e75123c60ee5";
  if (name.includes("Reverse Osmosis")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:b1fe4fc4-e725-4ccb-8cdd-a7cdb66ce816";
  // Single water conditioners: "ACA .75 24,000", "ACA 1.0 32,000", "ACA 1.5 48,000", etc.
  // These names start with "ACA" and contain a grain-size pattern like "24,000"
  if (name.startsWith("ACA") && /\d+,\d{3}/.test(name)) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91";
  // Accessories
  if (name.includes("Leak Shut Off") || name.includes("Leak Valve")) return "https://acrobat.adobe.com/id/urn:aaid:sc:US:02daeba4-c657-41de-9318-29ba0899d91d";
  if (name.includes("Rusco")) return "https://ruscowater.com/products/spin-down-filters/";
  return "";
}
import { useRef, useState, useCallback } from "react";

export default function ProposalView() {
  const { shareId } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const sigRef1 = useRef<HTMLCanvasElement>(null);
  const sigRef2 = useRef<HTMLCanvasElement>(null);
  const [sigData1, setSigData1] = useState("");
  const [sigData2, setSigData2] = useState("");
  const [printedName1, setPrintedName1] = useState("");
  const [printedName2, setPrintedName2] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentCanvas, setCurrentCanvas] = useState<HTMLCanvasElement | null>(null);

  const { data: proposal, isLoading } = useQuery<Proposal>({
    queryKey: ["/api/proposals/share", shareId],
  });

  // Must be declared before early returns (React rules of hooks)
  const [localSelectedTier, setLocalSelectedTier] = useState<string | null>(null);

  const selectPackageMutation = useMutation({
    mutationFn: (tier: string) =>
      apiRequest(`/api/proposals/${proposal?.id}/select-package`, { method: "PATCH", body: { selectedPackage: tier } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/proposals/share", shareId] }),
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/proposals/${proposal!.id}/sign`, {
        customerSignature1: sigData1,
        customerSignature2: sigData2 || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals/share", shareId] });
      toast({ title: "Proposal signed successfully!" });
    },
    onError: (err: any) => {
      toast({ title: "Error signing", description: err.message, variant: "destructive" });
    },
  });

  // Canvas drawing logic
  const startDraw = useCallback((canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    setCurrentCanvas(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
  }, []);

  const draw = useCallback((canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || currentCanvas !== canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
    ctx.stroke();
  }, [isDrawing, currentCanvas]);

  const endDraw = useCallback((canvas: HTMLCanvasElement, setter: (val: string) => void) => {
    setIsDrawing(false);
    setCurrentCanvas(null);
    setter(canvas.toDataURL());
  }, []);

  const clearCanvas = useCallback((canvas: HTMLCanvasElement | null, setter: (val: string) => void) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setter("");
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Proposal not found.</p>
      </div>
    );
  }

  const packages: PackageData[] = JSON.parse(proposal.packages);
  const waterTest: WaterTestResults = JSON.parse(proposal.waterTestResults);
  const effectiveTier = proposal.selectedPackage || localSelectedTier;
  const selectedPkg = packages.find(p => p.tier === effectiveTier);
  const customVal = proposal.customDiscountValue || 0;
  const { discountedTotal, discountAmount, discountPercent } = selectedPkg
    ? applyDiscount(selectedPkg.totalPrice, proposal.discountType || "none", (selectedPkg as any).discountRate || 0, customVal, getWaterHeaterTotal(selectedPkg))
    : { discountedTotal: 0, discountAmount: 0, discountPercent: 0 };
  const monthly = selectedPkg ? calcMonthlyInvestment(discountedTotal, proposal.deposit || 0) : 0;
  const repPhone = getRepPhone(proposal.repName);
  const customerName = `${proposal.customerFirstName1} ${proposal.customerLastName1}`;
  const hasSecond = proposal.customerFirstName2 && proposal.customerLastName2;
  const customerMustChoose = !proposal.selectedPackage && packages.length > 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1d8fc4] to-[#2a9fd4] text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-3">
            <svg width="48" height="48" viewBox="0 0 44 44" fill="none" aria-label="A Clear Alternative logo">
              <circle cx="22" cy="22" r="20" stroke="white" strokeWidth="2" fill="none" />
              <path d="M22 8 C18 18, 14 22, 14 28 C14 32.4 17.6 36 22 36 C26.4 36 30 32.4 30 28 C30 22, 26 18, 22 8Z" fill="white" fillOpacity="0.9" />
              <path d="M18 28 Q20 24, 22 28 Q24 32, 26 28" stroke="rgba(0,128,128,0.7)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            <div>
              <h1 className="text-xl font-bold">A Clear Alternative</h1>
              <p className="text-[#d0eaf7] text-sm">Water Treatment Proposal</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-[#d0eaf7]">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> 9230 Collins Ave, Pennsauken, NJ 08110</span>
            <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> (856) 663-8088</span>
            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> info@aclear.com</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* PDF Download Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-[#eaf5fb] border border-[#a8d8f0] rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-[#1d8fc4]">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Your personalized proposal is ready to download</span>
          </div>
          <button
            onClick={() => {
              const printUrl = `/api/proposals/print/${shareId}`;
              const win = window.open(printUrl, "_blank");
              if (win) {
                win.onload = () => {
                  setTimeout(() => win.print(), 500);
                };
              }
            }}
            className="inline-flex items-center gap-1.5 bg-[#1d8fc4] hover:bg-[#1778a8] text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
            data-testid="button-download-pdf"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        </div>

        {/* Customer Info */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold text-sm text-muted-foreground mb-2">PREPARED FOR</h2>
            {proposal.numPeople && (
              <p className="text-xs text-muted-foreground mb-2">{proposal.numPeople} people &bull; {proposal.numBathrooms} bathroom{proposal.numBathrooms !== 1 ? 's' : ''}</p>
            )}
            <p className="font-semibold">{customerName}{hasSecond ? ` & ${proposal.customerFirstName2} ${proposal.customerLastName2}` : ""}</p>
            <p className="text-sm text-muted-foreground">{proposal.street}, {proposal.city}, {proposal.state} {proposal.zip}</p>
            <p className="text-sm text-muted-foreground mt-1">Representative: {proposal.repName} — {repPhone}</p>
          </CardContent>
        </Card>

        {/* Water Test Results */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold text-sm text-muted-foreground mb-3">WATER ANALYSIS RESULTS — {proposal.waterSource === "well" ? "WELL WATER" : "CITY WATER"}</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {waterTest.pH !== undefined && <ResultBadge label="pH" value={waterTest.pH.toString()} alert={waterTest.pH < 6.5} />}
              <ResultBadge label="Iron" value={`${waterTest.iron} ppm`} alert={waterTest.iron > 0.3} />
              <ResultBadge label="Hardness" value={`${waterTest.hardness} gpg`} alert={waterTest.hardness > 7} />
              <ResultBadge label="TDS" value={waterTest.tds.toString()} />
              {waterTest.copper !== undefined && <ResultBadge label="Copper" value={`${waterTest.copper} ppm`} />}
              {waterTest.chlorine !== undefined && <ResultBadge label="Chlorine" value={`${waterTest.chlorine} ppm`} alert={waterTest.chlorine > 0} />}
              {waterTest.hydrogenSulfide && (
                <>
                  <ResultBadge label="H₂S Cold" value={`${waterTest.h2sCold || 0}/10`} alert={(waterTest.h2sCold || 0) > 3} />
                  <ResultBadge label="H₂S Hot" value={`${waterTest.h2sHot || 0}/10`} alert={(waterTest.h2sHot || 0) > 3} />
                </>
              )}
            </div>

            {/* What Your Results Mean */}
            {(() => {
              const findings: {label: string; detail: string}[] = [];
              if (waterTest.pH !== undefined && waterTest.pH < 6.5) findings.push({ label: `pH ${waterTest.pH} — Acidic Water`, detail: "Your water is acidic. Acidic water slowly corrodes copper pipes and fixtures, can leach metals into your drinking water, and gives water a slightly sour taste. An acid neutralizer raises pH to a safe, balanced level." });
              if (waterTest.pH !== undefined && waterTest.pH > 8.5) findings.push({ label: `pH ${waterTest.pH} — Alkaline Water`, detail: "Your water is alkaline. High pH can cause scale buildup in pipes, water heaters, and appliances and may give water a bitter taste." });
              if (waterTest.iron > 0.3) findings.push({ label: `Iron ${waterTest.iron} ppm — Elevated`, detail: "Your iron level is above the recommended limit of 0.3 ppm. High iron causes orange and reddish-brown staining on fixtures, sinks, laundry, and toilets. It also gives water a metallic taste and clogs pipes over time." });
              if (waterTest.hardness > 7) findings.push({ label: `Hardness ${waterTest.hardness} gpg — Hard Water`, detail: "Your water is hard. Hard water leaves white crusty scale deposits on faucets, showerheads, and inside pipes and water heaters. It reduces the efficiency and lifespan of appliances and makes soap and detergent less effective." });
              if (waterTest.copper !== undefined && waterTest.copper > 0.3) findings.push({ label: `Copper ${waterTest.copper} ppm — Elevated`, detail: "Copper above 0.3 ppm can give water a metallic taste and cause blue-green staining on fixtures. High copper levels may indicate corrosion of copper pipes in your home." });
              if (waterTest.chlorine !== undefined && waterTest.chlorine > 0) findings.push({ label: `Chlorine ${waterTest.chlorine} ppm — Present`, detail: "Chlorine is added by municipal water systems to disinfect water. While safe at regulated levels, it can give water an unpleasant taste and odor, and may react with organic matter to form byproducts." });
              if (parseFloat(waterTest.tds.toString()) > 500) findings.push({ label: `TDS ${waterTest.tds} ppm — Elevated Dissolved Solids`, detail: "TDS (Total Dissolved Solids) measures the concentration of dissolved minerals, salts, and metals in your water. Elevated TDS can give water a bitter or salty taste and may indicate the presence of contaminants. A reverse osmosis system effectively removes dissolved solids." });
              if (waterTest.hydrogenSulfide && ((waterTest.h2sCold || 0) > 3 || (waterTest.h2sHot || 0) > 3)) findings.push({ label: `Hydrogen Sulfide — Detected`, detail: "Hydrogen sulfide produces the characteristic \"rotten egg\" smell in your water. It is corrosive to pipes and fixtures, affects the taste of beverages and food prepared with the water, and indicates the presence of sulfur bacteria." });
              if (findings.length === 0) return null;
              return (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">What Your Results Mean</h3>
                  {findings.map((f, i) => (
                    <div key={i} className="bg-orange-50 border-l-4 border-orange-400 px-3 py-2 rounded-r">
                      <div className="text-sm font-semibold text-orange-800 mb-0.5">{f.label}</div>
                      <div className="text-sm text-orange-900 leading-snug">{f.detail}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Packages */}
        <div className="space-y-4">
          {/* Water Quality Report — auto-generated based on customer ZIP */}
          {proposal.waterSource === "well" ? (
            <WellWaterQualityReport
              zip={proposal.zip}
              address={`${proposal.street}, ${proposal.city}, ${proposal.state} ${proposal.zip}`}
              municipality={undefined}
              county={undefined}
            />
          ) : (
            <CityWaterQualityReport
              zip={proposal.zip}
              address={`${proposal.street}, ${proposal.city}, ${proposal.state} ${proposal.zip}`}
              municipality={undefined}
              county={undefined}
            />
          )}

          <h2 className="font-semibold text-sm text-muted-foreground">RECOMMENDED TREATMENT PACKAGES</h2>
          {/* Customer choice prompt when rep sent multiple packages */}
          {customerMustChoose && !localSelectedTier && (
            <div className="bg-[#1d8fc4] text-white rounded-lg p-4 text-center">
              <p className="font-semibold text-lg mb-1">Please review the packages below and select the one that works best for you.</p>
              <p className="text-sm opacity-90">Once you choose a package you can sign your proposal digitally.</p>
            </div>
          )}

          {packages.map(pkg => {
            const isSelected = pkg.tier === effectiveTier;
            return (
              <Card key={pkg.tier} className={isSelected ? "ring-2 ring-primary border-primary/30" : "opacity-75"} data-testid={`proposal-package-${pkg.tier}`}>
                <CardContent className="p-4">
                  {/* Customer package selection button */}
                  {customerMustChoose && !isSelected && (
                    <button
                      onClick={() => {
                        setLocalSelectedTier(pkg.tier);
                        selectPackageMutation.mutate(pkg.tier);
                      }}
                      className="w-full mb-3 bg-[#1d8fc4] hover:bg-[#1778a8] text-white font-semibold py-2 rounded-md transition-colors text-sm"
                    >
                      ✓ Choose This Package
                    </button>
                  )}
                  {customerMustChoose && isSelected && (
                    <div className="w-full mb-3 bg-green-50 border border-green-300 text-green-800 font-semibold py-2 rounded-md text-center text-sm">
                      ✓ You selected this package
                    </div>
                  )}

                  <div className="flex items-start sm:items-center justify-between mb-3 gap-2">
                    <h3 className="font-semibold text-sm sm:text-base">{pkg.label} Package<span className="hidden sm:inline"> — {proposal.waterSource === "well" ? "Well Water" : "City Water"}</span><span className="block sm:hidden text-xs font-normal text-muted-foreground">{proposal.waterSource === "well" ? "Well Water" : "City Water"}</span></h3>
                    {isSelected && (
                      <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-medium">Recommended</span>
                    )}
                  </div>
                  {/* Multi-package discount badge */}
                  {(pkg as any).originalPrice && (pkg as any).originalPrice > pkg.totalPrice && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 bg-green-50 border border-green-200 rounded px-3 py-1.5 text-sm gap-0.5">
                      <span className="text-green-700 font-medium">
                        Multi-package savings applied
                      </span>
                      <span className="text-green-700 font-semibold">
                        <span className="line-through text-gray-400 mr-2">{formatCurrency((pkg as any).originalPrice)}</span>
                        {formatCurrency(pkg.totalPrice)}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {pkg.equipment.map((item: any) => {
                      const brochureUrl = getBrochureUrl(item.name);
                      return (
                        <div key={item.id} className="flex flex-col sm:flex-row sm:justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="break-words">{item.name}</span>
                            {brochureUrl && (
                              <a
                                href={brochureUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#1d8fc4] border border-[#1d8fc4] rounded-full px-3 py-1 sm:px-2 sm:py-0.5 hover:bg-[#eaf5fb] transition-colors whitespace-nowrap"
                              >
                                View Brochure
                              </a>
                            )}
                          </span>
                          <span className="font-medium shrink-0 sm:ml-2 text-right">{formatCurrency(item.price)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between text-sm py-1 text-primary">
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Full Professional Installation</span>
                      <span>Included</span>
                    </div>
                  </div>
                  {/* Pricing breakdown: original total → discounts → after discount → monthly */}
                  {(() => {
                    const originalTotal = (pkg as any).originalPrice || pkg.totalPrice;
                    const multiAmt = (pkg as any).originalPrice ? (pkg as any).originalPrice - pkg.totalPrice : 0;
                    const pkgDiscount = applyDiscount(pkg.totalPrice, proposal.discountType || "none", (pkg as any).discountRate || 0, customVal, getWaterHeaterTotal(pkg));
                    const pkgMonthly = calcMonthlyInvestment(pkgDiscount.discountedTotal, proposal.deposit || 0);
                    const hasAnyDiscount = multiAmt > 0 || pkgDiscount.discountAmount > 0;
                    return (
                      <div className="mt-3 pt-3 border-t text-sm space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span>Total:</span>
                          <span>{formatCurrency(originalTotal)}</span>
                        </div>
                        {multiAmt > 0 && (
                          <div className="flex justify-between text-xs text-muted-foreground"><span>Multi-package savings</span><span className="text-green-600">-{formatCurrency(multiAmt)}</span></div>
                        )}
                        {pkgDiscount.discountAmount > 0 && (
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{proposal.discountType === 'veteran' ? 'Veteran Discount' : proposal.discountType === 'fire_ems' ? 'Fire/EMS Discount' : 'Discount'} ({pkgDiscount.discountPercent}%)</span>
                            <span className="text-green-600">-{formatCurrency(pkgDiscount.discountAmount)}</span>
                          </div>
                        )}
                        {hasAnyDiscount && (
                          <div className="flex justify-between font-semibold pt-1 border-t border-dotted">
                            <span>After Discount:</span>
                            <span>{formatCurrency(pkgDiscount.discountedTotal)}</span>
                          </div>
                        )}
                        {(proposal.deposit || 0) > 0 && (
                          <div className="flex justify-between text-xs text-muted-foreground"><span>Deposit</span><span>-{formatCurrency(proposal.deposit)}</span></div>
                        )}
                        <div className="flex justify-between font-semibold text-foreground pt-1">
                          <span>Monthly Investment:</span>
                          <span className="text-primary">{formatCurrency(pkgMonthly)}/mo</span>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Selected package summary */}
        {selectedPkg && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-1 gap-1">
                <h2 className="font-semibold">{selectedPkg.label} Package Selected</h2>
                <span className="text-xl sm:text-2xl font-bold text-primary">{formatCurrency(discountedTotal)}</span>
              </div>
              <div className="text-sm space-y-1">
                {/* Show multi-package original if applicable */}
                {(selectedPkg as any).originalPrice && (selectedPkg as any).originalPrice > selectedPkg.totalPrice && (
                  <div className="flex justify-between text-green-600 text-xs">
                    <span>Multi-package discount ({Math.round(((selectedPkg as any).discountRate || 0) * 100)}% off equipment)</span>
                    <span>-{formatCurrency((selectedPkg as any).originalPrice - selectedPkg.totalPrice)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground"><span>Package Total:</span><span>{formatCurrency(selectedPkg.totalPrice)}</span></div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{proposal.discountType === 'veteran' ? 'Veteran Discount (5%)' : proposal.discountType === 'fire_ems' ? 'Fire/EMS Discount (3%)' : `Discount (${discountPercent}%)`}:</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                {(proposal.deposit || 0) > 0 && (
                  <div className="flex justify-between"><span>Deposit:</span><span>-{formatCurrency(proposal.deposit || 0)}</span></div>
                )}
                <div className="flex justify-between font-semibold text-base pt-1 border-t">
                  <span>Monthly Investment:</span>
                  <span className="text-primary">{formatCurrency(monthly)}/mo</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* NJ Cancellation Notice */}
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold text-sm mb-2">NJ CANCELLATION NOTICE</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              YOU MAY CANCEL THIS CONTRACT AT ANY TIME BEFORE MIDNIGHT OF THE THIRD BUSINESS DAY AFTER
              RECEIVING A COPY OF THIS CONTRACT. IF YOU WISH TO CANCEL THIS CONTRACT, YOU MUST DO ONE OF
              THE FOLLOWING: 1. SEND A SIGNED AND DATED WRITTEN NOTICE OF CANCELLATION BY REGISTERED OR
              CERTIFIED MAIL, RETURN RECEIPT REQUESTED; OR 2. PERSONALLY DELIVER A SIGNED AND DATED WRITTEN
              NOTICE OF CANCELLATION TO: A CLEAR ALTERNATIVE, 9230 COLLINS AVE, PENNSAUKEN, NJ 08110 - 856-663-8088
            </p>
          </CardContent>
        </Card>

        {/* Signature Section */}
        {!proposal.customerSignature1 && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <h2 className="font-semibold">Acceptance & Authorization</h2>
              
              <div>
                <Label>Customer 1 Signature — {proposal.customerFirstName1} {proposal.customerLastName1}</Label>
                <div className="mt-1 border rounded-lg bg-white px-4 py-2" style={{ minHeight: "80px", borderBottom: "2px solid #ccc" }}>
                  {printedName1 ? (
                    <div style={{ fontFamily: "'Alex Brush', cursive", fontSize: "42px", color: "#1a237e", lineHeight: 1.3, padding: "6px 0" }}>
                      {printedName1}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm italic py-5 text-center">Type your name below to sign</div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={printedName1}
                    onChange={e => {
                      setPrintedName1(e.target.value);
                      if (e.target.value.trim()) {
                        setSigData1(`typed:${e.target.value.trim()}`);
                      } else {
                        setSigData1("");
                      }
                    }}
                    placeholder="Type your full name to sign"
                    className="flex-1"
                    data-testid="input-printed-name-1"
                  />
                </div>
              </div>

              {hasSecond && (
                <div>
                  <Label>Customer 2 Signature — {proposal.customerFirstName2} {proposal.customerLastName2}</Label>
                  <div className="mt-1 border rounded-lg bg-white px-4 py-2" style={{ minHeight: "80px", borderBottom: "2px solid #ccc" }}>
                    {printedName2 ? (
                      <div style={{ fontFamily: "'Alex Brush', cursive", fontSize: "42px", color: "#1a237e", lineHeight: 1.3, padding: "6px 0" }}>
                        {printedName2}
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-sm italic py-5 text-center">Type your name below to sign</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      value={printedName2}
                      onChange={e => {
                        setPrintedName2(e.target.value);
                        if (e.target.value.trim()) {
                          setSigData2(`typed:${e.target.value.trim()}`);
                        } else {
                          setSigData2("");
                        }
                      }}
                      placeholder="Type your full name to sign"
                      className="flex-1"
                      data-testid="input-printed-name-2"
                    />
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => signMutation.mutate()}
                disabled={!sigData1 || signMutation.isPending}
                data-testid="button-sign-proposal"
              >
                {signMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : "Sign & Accept Proposal"}
              </Button>
            </CardContent>
          </Card>
        )}

        {proposal.customerSignature1 && (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-800">Proposal Accepted</p>
              <p className="text-sm text-green-600">Thank you for choosing A Clear Alternative!</p>
            </CardContent>
          </Card>
        )}

        {/* Rep sign-off */}
        <div className="text-center py-6 text-sm text-muted-foreground">
          <p>Thank you for allowing A Clear Alternative to provide you and your family the highest quality water.</p>
          <p className="mt-1">
            Please contact me anytime — call or text{" "}
            <a href={`tel:${repPhone}`} className="text-primary font-medium">{repPhone}</a>
          </p>
          <p className="font-medium mt-2 text-foreground">{proposal.repName}</p>
          <p className="text-xs mt-4">A Clear Alternative · 9230 Collins Ave, Pennsauken, NJ 08110 · (856) 663-8088 · www.aclear.com</p>
        </div>
      </main>
    </div>
  );
}

function ResultBadge({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg p-2 sm:p-2.5 text-center ${alert ? "bg-amber-50 border border-amber-200" : "bg-muted/50 border border-border/30"}`}>
      <div className="text-[10px] sm:text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold text-sm sm:text-base ${alert ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}
