import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useParams } from "wouter";
import type { Proposal, PackageData, WaterTestResults } from "@shared/schema";
import { formatCurrency, applyDiscount, calcMonthlyInvestment, getRepPhone, DISCOUNTS } from "@/lib/pricing-data";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Droplets, Phone, Mail, MapPin, Download, FileText } from "lucide-react";

const BROCHURE_MAP: Record<string, string> = {
  "Twin Alternating": "https://acrobat.adobe.com/id/urn:aaid:sc:US:79762e60-034c-4e7d-a225-6a2837b781ab",
  "Water Conditioner": "https://acrobat.adobe.com/id/urn:aaid:sc:US:b85f25e9-cbdf-421a-8f9e-2dffa9936a91",
  "Acid Neutralizer": "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd",
  "Iron Odor Breaker": "https://acrobat.adobe.com/id/urn:aaid:sc:US:d04f7189-fc0e-4352-9cc0-7e3a70b70ca5",
  "Carbon Filtration": "https://acrobat.adobe.com/id/urn:aaid:sc:US:c1ea3954-e1f4-4691-892a-868a5f1dafbd",
  "Leak Shut Off": "https://acrobat.adobe.com/id/urn:aaid:sc:US:02daeba4-c657-41de-9318-29ba0899d91d",
};

function getBrochureUrl(name: string): string {
  for (const [key, url] of Object.entries(BROCHURE_MAP)) {
    if (name.includes(key)) return url;
  }
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
  const selectedPkg = packages.find(p => p.tier === proposal.selectedPackage);
  const { discountedTotal, discountAmount, discountPercent } = selectedPkg
    ? applyDiscount(selectedPkg.totalPrice, proposal.discountType || "none")
    : { discountedTotal: 0, discountAmount: 0, discountPercent: 0 };
  const monthly = selectedPkg ? calcMonthlyInvestment(discountedTotal, proposal.deposit || 0) : 0;
  const repPhone = getRepPhone(proposal.repName);
  const customerName = `${proposal.customerFirstName1} ${proposal.customerLastName1}`;
  const hasSecond = proposal.customerFirstName2 && proposal.customerLastName2;

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
        <div className="flex items-center justify-between bg-[#eaf5fb] border border-[#a8d8f0] rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-[#1d8fc4]">
            <FileText className="h-4 w-4" />
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <ResultBadge label="pH" value={waterTest.pH.toString()} alert={waterTest.pH < 6.5} />
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
              if (waterTest.pH < 6.5) findings.push({ label: `pH ${waterTest.pH} — Acidic Water`, detail: "Your water is acidic. Acidic water slowly corrodes copper pipes and fixtures, can leach metals into your drinking water, and gives water a slightly sour taste. An acid neutralizer raises pH to a safe, balanced level." });
              if (waterTest.pH > 8.5) findings.push({ label: `pH ${waterTest.pH} — Alkaline Water`, detail: "Your water is alkaline. High pH can cause scale buildup in pipes, water heaters, and appliances and may give water a bitter taste." });
              if (waterTest.iron > 0.3) findings.push({ label: `Iron ${waterTest.iron} ppm — Elevated`, detail: "Your iron level is above the recommended limit of 0.3 ppm. High iron causes orange and reddish-brown staining on fixtures, sinks, laundry, and toilets. It also gives water a metallic taste and clogs pipes over time." });
              if (waterTest.hardness > 7) findings.push({ label: `Hardness ${waterTest.hardness} gpg — Hard Water`, detail: "Your water is hard. Hard water leaves white crusty scale deposits on faucets, showerheads, and inside pipes and water heaters. It reduces the efficiency and lifespan of appliances and makes soap and detergent less effective." });
              if (waterTest.copper !== undefined && waterTest.copper > 0.3) findings.push({ label: `Copper ${waterTest.copper} ppm — Elevated`, detail: "Copper above 0.3 ppm can give water a metallic taste and cause blue-green staining on fixtures. High copper levels may indicate corrosion of copper pipes in your home." });
              if (waterTest.chlorine !== undefined && waterTest.chlorine > 0) findings.push({ label: `Chlorine ${waterTest.chlorine} ppm — Present`, detail: "Chlorine is added by municipal water systems to disinfect water. While safe at regulated levels, it can give water an unpleasant taste and odor, and may react with organic matter to form byproducts." });
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
          <h2 className="font-semibold text-sm text-muted-foreground">RECOMMENDED TREATMENT PACKAGES</h2>
          {packages.map(pkg => {
            const isSelected = pkg.tier === proposal.selectedPackage;
            return (
              <Card key={pkg.tier} className={isSelected ? "ring-2 ring-primary border-primary/30" : "opacity-75"} data-testid={`proposal-package-${pkg.tier}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{pkg.label} Package — {proposal.waterSource === "well" ? "Well Water" : "City Water"}</h3>
                    {isSelected && (
                      <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-medium">Recommended</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {pkg.equipment.map((item: any) => {
                      const brochureUrl = getBrochureUrl(item.name);
                      return (
                        <div key={item.id} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            {item.name}
                            {brochureUrl && (
                              <a
                                href={brochureUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#1d8fc4] border border-[#1d8fc4] rounded-full px-2 py-0.5 hover:bg-[#eaf5fb] transition-colors whitespace-nowrap"
                              >
                                View Brochure
                              </a>
                            )}
                          </span>
                          <span className="font-medium shrink-0 ml-2">{formatCurrency(item.price)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between text-sm py-1 text-primary">
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Full Professional Installation</span>
                      <span>Included</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t flex justify-between font-semibold">
                    <span>Total:</span>
                    <span>{formatCurrency(pkg.totalPrice)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Selected package summary */}
        {selectedPkg && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 space-y-2">
              <h2 className="font-semibold">Selected: {selectedPkg.label} Package</h2>
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span>Package Total:</span><span>{formatCurrency(selectedPkg.totalPrice)}</span></div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600"><span>Discount ({discountPercent}%):</span><span>-{formatCurrency(discountAmount)}</span></div>
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
                <canvas
                  ref={sigRef1}
                  width={500}
                  height={150}
                  className="sig-canvas w-full mt-1"
                  style={{ maxHeight: "150px" }}
                  onMouseDown={(e) => startDraw(sigRef1.current!, e)}
                  onMouseMove={(e) => draw(sigRef1.current!, e)}
                  onMouseUp={() => endDraw(sigRef1.current!, setSigData1)}
                  onMouseLeave={() => endDraw(sigRef1.current!, setSigData1)}
                  onTouchStart={(e) => { e.preventDefault(); startDraw(sigRef1.current!, e); }}
                  onTouchMove={(e) => { e.preventDefault(); draw(sigRef1.current!, e); }}
                  onTouchEnd={() => endDraw(sigRef1.current!, setSigData1)}
                  data-testid="canvas-signature-1"
                />
                <div className="flex items-center gap-2 mt-2">
                  <Input value={printedName1} onChange={e => setPrintedName1(e.target.value)} placeholder="Printed Name" className="flex-1" data-testid="input-printed-name-1" />
                  <Button variant="outline" size="sm" onClick={() => clearCanvas(sigRef1.current, setSigData1)} data-testid="button-clear-sig-1">Clear</Button>
                </div>
              </div>

              {hasSecond && (
                <div>
                  <Label>Customer 2 Signature — {proposal.customerFirstName2} {proposal.customerLastName2}</Label>
                  <canvas
                    ref={sigRef2}
                    width={500}
                    height={150}
                    className="sig-canvas w-full mt-1"
                    style={{ maxHeight: "150px" }}
                    onMouseDown={(e) => startDraw(sigRef2.current!, e)}
                    onMouseMove={(e) => draw(sigRef2.current!, e)}
                    onMouseUp={() => endDraw(sigRef2.current!, setSigData2)}
                    onMouseLeave={() => endDraw(sigRef2.current!, setSigData2)}
                    onTouchStart={(e) => { e.preventDefault(); startDraw(sigRef2.current!, e); }}
                    onTouchMove={(e) => { e.preventDefault(); draw(sigRef2.current!, e); }}
                    onTouchEnd={() => endDraw(sigRef2.current!, setSigData2)}
                    data-testid="canvas-signature-2"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <Input value={printedName2} onChange={e => setPrintedName2(e.target.value)} placeholder="Printed Name" className="flex-1" data-testid="input-printed-name-2" />
                    <Button variant="outline" size="sm" onClick={() => clearCanvas(sigRef2.current, setSigData2)} data-testid="button-clear-sig-2">Clear</Button>
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
    <div className={`rounded-lg p-2.5 text-center ${alert ? "bg-amber-50 border border-amber-200" : "bg-muted/50"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold ${alert ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  );
}
