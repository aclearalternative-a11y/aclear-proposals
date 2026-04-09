import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { REPS, DISCOUNTS, generatePackages, calcTotal, applyDiscount, calcMonthlyInvestment, formatCurrency, getAllEquipmentOptions, getRepPhone } from "@/lib/pricing-data";
import type { EquipmentItem, PackageData, WaterTestResults } from "@shared/schema";
import { Droplets, ChevronUp, ChevronDown, X, Plus, Send, Loader2, CheckCircle2 } from "lucide-react";
import { nanoid } from "nanoid";
import AppHeader from "@/components/app-header";

type Step = "info" | "water" | "packages";

export default function ProposalForm() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("info");
  const [sending, setSending] = useState(false);

  // Customer info
  const [firstName1, setFirstName1] = useState("");
  const [lastName1, setLastName1] = useState("");
  const [firstName2, setFirstName2] = useState("");
  const [lastName2, setLastName2] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("NJ");
  const [zip, setZip] = useState("");

  // Auto-populate city from zip code
  const handleZipChange = async (val: string) => {
    setZip(val);
    if (val.length === 5 && /^\d{5}$/.test(val)) {
      try {
        const res = await fetch(`https://api.zippopotam.us/us/${val}`);
        if (res.ok) {
          const data = await res.json();
          const place = data.places?.[0];
          if (place) {
            setCity(place["place name"]);
            setState(place["state abbreviation"]);
          }
        }
      } catch {}
    }
  };
  const [customerEmail, setCustomerEmail] = useState("");
  const [repName, setRepName] = useState("");
  const [numPeople, setNumPeople] = useState<number | "">("");
  const [numBathrooms, setNumBathrooms] = useState<number | "">("");

  // Water source & test
  const [waterSource, setWaterSource] = useState<"well" | "city">("well");
  const [pH, setPH] = useState("");
  const [iron, setIron] = useState("");
  const [hardness, setHardness] = useState("");
  const [tds, setTDS] = useState("");
  const [copper, setCopper] = useState("");
  const [chlorine, setChlorine] = useState("");
  const [h2s, setH2S] = useState(false);
  const [h2sCold, setH2SCold] = useState("");
  const [h2sHot, setH2SHot] = useState("");

  // Packages
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState("none");
  const [deposit, setDeposit] = useState("");
  const [rentalMode, setRentalMode] = useState(false);
  const [includedTiers, setIncludedTiers] = useState({ good: true, better: true, best: true });

  // Multi-package discount: 2% on Better, 4% on Best when all 3 are included (water heaters excluded)
  const allThreeIncluded = includedTiers.good && includedTiers.better && includedTiers.best;

  function applyMultiPackageDiscount(pkgs: PackageData[]): PackageData[] {
    return pkgs.map(pkg => {
      if (!allThreeIncluded) return pkg;
      const rate = pkg.tier === 'better' ? 0.02 : pkg.tier === 'best' ? 0.04 : 0;
      if (rate === 0) return pkg;
      // Exclude water heaters from discount
      const waterHeaterTotal = pkg.equipment
        .filter(e => e.category === 'Water Heaters')
        .reduce((s, e) => s + e.price, 0);
      const base = pkg.totalPrice - waterHeaterTotal;
      const discountedTotal = Math.round(base * (1 - rate)) + waterHeaterTotal;
      return { ...pkg, totalPrice: discountedTotal };
    });
  }

  const packagesWithDiscount = applyMultiPackageDiscount(packages);
  const filteredPackages = packagesWithDiscount.filter(p => includedTiers[p.tier as keyof typeof includedTiers]);

  const handleGeneratePackages = useCallback(() => {
    const waterTest: WaterTestResults = {
      pH: parseFloat(pH) || 0,
      iron: parseFloat(iron) || 0,
      hardness: parseFloat(hardness) || 0,
      tds: parseFloat(tds) || 0,
      copper: waterSource === "well" ? parseFloat(copper) || 0 : undefined,
      chlorine: waterSource === "city" ? parseFloat(chlorine) || 0 : undefined,
      hydrogenSulfide: h2s,
      h2sCold: h2s ? parseInt(h2sCold) || 0 : undefined,
      h2sHot: h2s ? parseInt(h2sHot) || 0 : undefined,
    };
    const pkgs = generatePackages(waterSource, waterTest, numPeople || 3, numBathrooms || 2);
    setPackages(pkgs);
    setStep("packages");
  }, [pH, iron, hardness, tds, copper, chlorine, h2s, h2sCold, h2sHot, waterSource, numPeople, numBathrooms]);

  // Equipment manipulation for a package
  const updatePackageEquipment = (tierIdx: number, newEquipment: EquipmentItem[]) => {
    setPackages(prev => prev.map((pkg, i) =>
      i === tierIdx ? { ...pkg, equipment: newEquipment, totalPrice: calcTotal(newEquipment) } : pkg
    ));
  };

  const handleSizeChange = (tierIdx: number, equipIdx: number, direction: "up" | "down") => {
    const pkg = packages[tierIdx];
    const item = pkg.equipment[equipIdx];
    if (!item.sizeOptions || item.currentSizeIndex === undefined) return;
    const newIdx = direction === "up"
      ? Math.min(item.currentSizeIndex + 1, item.sizeOptions.length - 1)
      : Math.max(item.currentSizeIndex - 1, 0);
    if (newIdx === item.currentSizeIndex) return;
    const opt = item.sizeOptions[newIdx];
    const newEquip = [...pkg.equipment];
    newEquip[equipIdx] = {
      ...item,
      name: opt.name,
      size: opt.size,
      price: opt.price,
      rentalPrice: opt.rentalPrice,
      rentalInstallPrice: opt.rentalInstallPrice,
      currentSizeIndex: newIdx,
    };
    updatePackageEquipment(tierIdx, newEquip);
  };

  const handleRemoveEquipment = (tierIdx: number, equipIdx: number) => {
    const newEquip = packages[tierIdx].equipment.filter((_, i) => i !== equipIdx);
    updatePackageEquipment(tierIdx, newEquip);
  };

  const handleAddEquipment = (tierIdx: number, categoryName: string, itemIdx: number) => {
    const allOpts = getAllEquipmentOptions();
    const cat = allOpts.find(c => c.category === categoryName);
    if (!cat) return;
    const item = cat.items[itemIdx];
    const newItem: EquipmentItem = {
      id: nanoid(),
      category: categoryName,
      name: item.name,
      size: item.size,
      price: item.price,
      brochureUrl: item.brochureUrl,
      rentalPrice: item.rentalPrice,
      rentalInstallPrice: item.rentalInstallPrice,
      sizeOptions: cat.items.length > 1 ? cat.items.map(i => ({ name: i.name, size: i.size, price: i.price, rentalPrice: i.rentalPrice, rentalInstallPrice: i.rentalInstallPrice })) : undefined,
      currentSizeIndex: cat.items.length > 1 ? itemIdx : undefined,
    };
    const newEquip = [...packages[tierIdx].equipment, newItem];
    updatePackageEquipment(tierIdx, newEquip);
  };

  const handleSendProposal = async () => {
    // No longer require a pre-selected tier — customer can choose if multiple packages sent
    if (!customerEmail) {
      toast({ title: "Please enter customer email", variant: "destructive" });
      return;
    }
    if (!repName) {
      toast({ title: "Please select a representative", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const waterTest: WaterTestResults = {
        pH: parseFloat(pH) || 0,
        iron: parseFloat(iron) || 0,
        hardness: parseFloat(hardness) || 0,
        tds: parseFloat(tds) || 0,
        copper: waterSource === "well" ? parseFloat(copper) || 0 : undefined,
        chlorine: waterSource === "city" ? parseFloat(chlorine) || 0 : undefined,
        hydrogenSulfide: h2s,
        h2sCold: h2s ? parseInt(h2sCold) || 0 : undefined,
        h2sHot: h2s ? parseInt(h2sHot) || 0 : undefined,
      };

      const res = await apiRequest("POST", "/api/proposals", {
        customerFirstName1: firstName1,
        customerLastName1: lastName1,
        customerFirstName2: firstName2 || undefined,
        customerLastName2: lastName2 || undefined,
        street,
        city,
        state,
        zip,
        customerEmail,
        repName,
        waterSource,
        waterTestResults: JSON.stringify(waterTest),
        numPeople: numPeople || 3,
        numBathrooms: numBathrooms || 2,
        packages: JSON.stringify(filteredPackages),
        selectedPackage: selectedTier,
        discountType,
        deposit: parseInt(deposit) || 0,
        rentalMode,
      });

      const proposal = await res.json();

      // Send email
      await apiRequest("POST", `/api/proposals/${proposal.id}/send-email`);

      toast({
        title: "Proposal Sent!",
        description: `Email sent to ${customerEmail}`,
      });
    } catch (err: any) {
      toast({
        title: "Error sending proposal",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const selectedPkg = packagesWithDiscount.find(p => p.tier === selectedTier);
  const depositNum = parseInt(deposit) || 0;
  const { discountedTotal, discountAmount, discountPercent } = selectedPkg
    ? applyDiscount(selectedPkg.totalPrice, discountType)
    : { discountedTotal: 0, discountAmount: 0, discountPercent: 0 };
  const monthly = selectedPkg ? calcMonthlyInvestment(discountedTotal, depositNum) : 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { key: "info" as Step, label: "Customer Info" },
            { key: "water" as Step, label: "Water Test" },
            { key: "packages" as Step, label: "Packages" },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (s.key === "packages" && packages.length === 0) return;
                  setStep(s.key);
                }}
                data-testid={`step-${s.key}`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  step === s.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">{i + 1}</span>
                {s.label}
              </button>
              {i < 2 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* STEP 1: Customer Info */}
        {step === "info" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Homeowner 1 First Name *</Label>
                  <Input data-testid="input-first-name-1" value={firstName1} onChange={e => setFirstName1(e.target.value)} placeholder="First name" />
                </div>
                <div>
                  <Label>Homeowner 1 Last Name *</Label>
                  <Input data-testid="input-last-name-1" value={lastName1} onChange={e => setLastName1(e.target.value)} placeholder="Last name" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Homeowner 2 First Name</Label>
                  <Input data-testid="input-first-name-2" value={firstName2} onChange={e => setFirstName2(e.target.value)} placeholder="First name (optional)" />
                </div>
                <div>
                  <Label>Homeowner 2 Last Name</Label>
                  <Input data-testid="input-last-name-2" value={lastName2} onChange={e => setLastName2(e.target.value)} placeholder="Last name (optional)" />
                </div>
              </div>
              <div>
                <Label>Street Address *</Label>
                <Input data-testid="input-street" value={street} onChange={e => setStreet(e.target.value)} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <Label>City *</Label>
                  <Input data-testid="input-city" value={city} onChange={e => setCity(e.target.value)} placeholder="Cherry Hill" />
                </div>
                <div>
                  <Label>State</Label>
                  <Input data-testid="input-state" value={state} onChange={e => setState(e.target.value)} placeholder="NJ" />
                </div>
                <div>
                  <Label>Zip *</Label>
                  <Input data-testid="input-zip" value={zip} onChange={e => handleZipChange(e.target.value)} placeholder="08002" maxLength={5} />
                </div>
              </div>
              <div>
                <Label>Customer Email *</Label>
                <Input data-testid="input-email" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>A Clear Representative *</Label>
                  <Select value={repName} onValueChange={setRepName}>
                    <SelectTrigger data-testid="select-rep">
                      <SelectValue placeholder="Select representative" />
                    </SelectTrigger>
                    <SelectContent>
                      {REPS.map(r => (
                        <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Number of People in Household</Label>
                  <Input data-testid="input-num-people" type="number" min={1} max={12} placeholder="e.g. 3" value={numPeople} onChange={e => setNumPeople(e.target.value === "" ? "" : parseInt(e.target.value) || 1)} />
                </div>
                <div>
                  <Label>Number of Bathrooms</Label>
                  <Input data-testid="input-num-bathrooms" type="number" min={1} max={10} placeholder="e.g. 2" value={numBathrooms} onChange={e => setNumBathrooms(e.target.value === "" ? "" : parseInt(e.target.value) || 1)} />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button data-testid="button-next-water" onClick={() => setStep("water")} disabled={!firstName1 || !lastName1 || !street || !city || !zip}>
                  Next: Water Test
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: Water Test */}
        {step === "water" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Droplets className="h-5 w-5 text-primary" />
                Water Test Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>What is your water source? *</Label>
                <Select value={waterSource} onValueChange={(v) => setWaterSource(v as "well" | "city")}>
                  <SelectTrigger data-testid="select-water-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="well">Well Water</SelectItem>
                    <SelectItem value="city">City / Municipal Water</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>pH</Label>
                  <Input data-testid="input-ph" type="number" step="0.1" value={pH} onChange={e => setPH(e.target.value)} placeholder="e.g. 6.5" />
                </div>
                <div>
                  <Label>Iron (ppm)</Label>
                  <Input data-testid="input-iron" type="number" step="0.1" value={iron} onChange={e => setIron(e.target.value)} placeholder="0.0" />
                </div>
                <div>
                  <Label>Hardness (gpg)</Label>
                  <Input data-testid="input-hardness" type="number" step="0.1" value={hardness} onChange={e => setHardness(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>TDS</Label>
                  <Input data-testid="input-tds" type="number" value={tds} onChange={e => setTDS(e.target.value)} placeholder="0" />
                </div>
                {waterSource === "well" ? (
                  <div>
                    <Label>Copper (ppm)</Label>
                    <Input data-testid="input-copper" type="number" step="0.01" value={copper} onChange={e => setCopper(e.target.value)} placeholder="0.0" />
                  </div>
                ) : (
                  <div>
                    <Label>Chlorine (ppm)</Label>
                    <Input data-testid="input-chlorine" type="number" step="0.1" value={chlorine} onChange={e => setChlorine(e.target.value)} placeholder="0.0" />
                  </div>
                )}
              </div>

              {waterSource === "well" && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Label>Hydrogen Sulfide Present?</Label>
                    <Switch data-testid="switch-h2s" checked={h2s} onCheckedChange={setH2S} />
                    <span className="text-sm text-muted-foreground">{h2s ? "Yes" : "No"}</span>
                  </div>
                  {h2s && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <Label>Cold Water Severity (1-10)</Label>
                        <Input data-testid="input-h2s-cold" type="number" min={1} max={10} value={h2sCold} onChange={e => setH2SCold(e.target.value)} placeholder="1" />
                      </div>
                      <div>
                        <Label>Hot Water Severity (1-10)</Label>
                        <Input data-testid="input-h2s-hot" type="number" min={1} max={10} value={h2sHot} onChange={e => setH2SHot(e.target.value)} placeholder="1" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep("info")} data-testid="button-back-info">Back</Button>
                <Button onClick={handleGeneratePackages} data-testid="button-generate-packages">
                  Generate Packages
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3: Packages */}
        {step === "packages" && packages.length > 0 && (
          <div className="space-y-6">

            {/* Water Analysis Summary */}
            <Card className="border-[#1d8fc4] border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-[#1d8fc4] flex items-center gap-2">
                  <Droplets className="h-4 w-4" />
                  Water Analysis Results — {waterSource === "well" ? "Well Water" : "City Water"}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className={`p-2 rounded text-center ${parseFloat(pH) < 6.5 ? "bg-orange-50 border border-orange-200" : "bg-gray-50"}`}>
                    <div className="text-xs text-muted-foreground">pH</div>
                    <div className={`font-semibold ${parseFloat(pH) < 6.5 ? "text-orange-600" : ""}`}>{pH}</div>
                  </div>
                  <div className={`p-2 rounded text-center ${parseFloat(iron) > 0.3 ? "bg-orange-50 border border-orange-200" : "bg-gray-50"}`}>
                    <div className="text-xs text-muted-foreground">Iron</div>
                    <div className={`font-semibold ${parseFloat(iron) > 0.3 ? "text-orange-600" : ""}`}>{iron} ppm</div>
                  </div>
                  <div className={`p-2 rounded text-center ${parseFloat(hardness) > 7 ? "bg-orange-50 border border-orange-200" : "bg-gray-50"}`}>
                    <div className="text-xs text-muted-foreground">Hardness</div>
                    <div className={`font-semibold ${parseFloat(hardness) > 7 ? "text-orange-600" : ""}`}>{hardness} gpg</div>
                  </div>
                  <div className="p-2 rounded text-center bg-gray-50">
                    <div className="text-xs text-muted-foreground">TDS</div>
                    <div className="font-semibold">{tds}</div>
                  </div>
                  {waterSource === "well" && copper && (
                    <div className="p-2 rounded text-center bg-gray-50">
                      <div className="text-xs text-muted-foreground">Copper</div>
                      <div className="font-semibold">{copper} ppm</div>
                    </div>
                  )}
                  {waterSource === "city" && chlorine && (
                    <div className={`p-2 rounded text-center ${parseFloat(chlorine) > 0 ? "bg-orange-50 border border-orange-200" : "bg-gray-50"}`}>
                      <div className="text-xs text-muted-foreground">Chlorine</div>
                      <div className={`font-semibold ${parseFloat(chlorine) > 0 ? "text-orange-600" : ""}`}>{chlorine} ppm</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Package Presentation Selection */}
            <Card className="border border-dashed">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Packages to Include in Proposal</h3>
                  {allThreeIncluded && (
                    <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                      Multi-package: Better −2% &bull; Best −4% (excl. water heaters)
                    </span>
                  )}
                </div>
                <div className="flex gap-6">
                  {(['good', 'better', 'best'] as const).map(tier => (
                    <label key={tier} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includedTiers[tier]}
                        onChange={e => {
                          setIncludedTiers(prev => ({ ...prev, [tier]: e.target.checked }));
                          // If deselecting the currently selected tier, clear it
                          if (!e.target.checked && selectedTier === tier) setSelectedTier(null);
                        }}
                        className="w-4 h-4 rounded accent-[#1d8fc4]"
                      />
                      <span className="text-sm font-medium capitalize">{tier === 'good' ? 'Good' : tier === 'better' ? 'Better' : 'Best'}</span>
                      {allThreeIncluded && tier === 'better' && <span className="text-xs text-green-600 font-medium">-2%</span>}
                      {allThreeIncluded && tier === 'best' && <span className="text-xs text-green-600 font-medium">-4%</span>}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Treatment Packages — {waterSource === "well" ? "Well Water" : "City Water"}
              </h2>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Rental</Label>
                <Switch data-testid="switch-rental" checked={rentalMode} onCheckedChange={setRentalMode} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {packagesWithDiscount.map((pkg, tierIdx) => (
                <div key={pkg.tier} className={!includedTiers[pkg.tier as keyof typeof includedTiers] ? 'opacity-30 pointer-events-none' : ''}>
                <PackageCard
                  key={pkg.tier}
                  pkg={pkg}
                  tierIdx={tierIdx}
                  waterSource={waterSource}
                  isSelected={selectedTier === pkg.tier}
                  rentalMode={rentalMode}
                  onSelect={() => includedTiers[pkg.tier as keyof typeof includedTiers] && setSelectedTier(pkg.tier)}
                  onSizeChange={(ei, dir) => handleSizeChange(tierIdx, ei, dir)}
                  onRemove={(ei) => handleRemoveEquipment(tierIdx, ei)}
                  onAdd={(cat, itemIdx) => handleAddEquipment(tierIdx, cat, itemIdx)}
                />
                </div>
              ))}
            </div>

            {/* Summary bar — always visible once packages are generated */}
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <Label>Discount</Label>
                    <Select value={discountType} onValueChange={setDiscountType}>
                      <SelectTrigger data-testid="select-discount">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DISCOUNTS.map(d => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Deposit</Label>
                    <Input
                      data-testid="input-deposit"
                      type="number"
                      value={deposit}
                      onChange={e => setDeposit(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="text-sm space-y-1">
                    {selectedTier && selectedPkg ? (
                      <>
                        <div className="flex justify-between">
                          <span>Selected: {selectedPkg.label}</span>
                          <span className="font-medium">{formatCurrency(selectedPkg.totalPrice)}</span>
                        </div>
                        {discountAmount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Discount ({discountPercent}%):</span>
                            <span>-{formatCurrency(discountAmount)}</span>
                          </div>
                        )}
                        {depositNum > 0 && (
                          <div className="flex justify-between">
                            <span>Deposit:</span>
                            <span>-{formatCurrency(depositNum)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold border-t pt-1">
                          <span>Monthly Investment:</span>
                          <span className="text-primary">{formatCurrency(monthly)}/mo</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        {filteredPackages.length === 1
                          ? 'Click “Select Package” above to confirm'
                          : 'Customer will choose their package'}
                      </p>
                    )}
                  </div>
                  <div>
                    <Button
                      className="w-full"
                      onClick={handleSendProposal}
                      disabled={sending}
                      data-testid="button-send-proposal"
                    >
                      {sending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending...</>
                      ) : (
                        <><Send className="h-4 w-4 mr-2" /> Email to Customer</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button variant="outline" onClick={() => setStep("water")} data-testid="button-back-water">
              Back to Water Test
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

// Package Card component
function PackageCard({
  pkg,
  tierIdx,
  waterSource,
  isSelected,
  rentalMode,
  onSelect,
  onSizeChange,
  onRemove,
  onAdd,
}: {
  pkg: PackageData;
  tierIdx: number;
  waterSource: string;
  isSelected: boolean;
  rentalMode: boolean;
  onSelect: () => void;
  onSizeChange: (equipIdx: number, direction: "up" | "down") => void;
  onRemove: (equipIdx: number) => void;
  onAdd: (category: string, itemIdx: number) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const tierColors: Record<string, string> = {
    good: "border-yellow-500/40 bg-yellow-50/30",
    better: "border-blue-500/40 bg-blue-50/30",
    best: "border-emerald-500/40 bg-emerald-50/30",
  };
  const tierHeaderColors: Record<string, string> = {
    good: "bg-yellow-500 text-white",
    better: "bg-blue-500 text-white",
    best: "bg-emerald-600 text-white",
  };

  return (
    <Card className={`${isSelected ? "ring-2 ring-primary" : ""} ${tierColors[pkg.tier] || ""}`} data-testid={`card-package-${pkg.tier}`}>
      <div className={`px-4 py-2 rounded-t-lg ${tierHeaderColors[pkg.tier]}`}>
        <h3 className="font-semibold text-center">
          {pkg.label} — {waterSource === "well" ? "Well Water" : "City Water"}
        </h3>
      </div>
      <CardContent className="p-3 space-y-2">
        {pkg.equipment.map((item, ei) => (
          <div key={item.id} className="flex items-center gap-1 p-2 bg-background rounded border text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.name}</div>
              {rentalMode && item.rentalPrice ? (
                <div className="text-xs text-muted-foreground">{formatCurrency(item.rentalPrice)}/mo + {formatCurrency(item.rentalInstallPrice || 0)} install</div>
              ) : (
                <div className="text-xs text-muted-foreground">{formatCurrency(item.price)}</div>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {item.sizeOptions && item.sizeOptions.length > 1 && (
                <>
                  <button
                    onClick={() => onSizeChange(ei, "down")}
                    className="p-0.5 rounded hover:bg-muted"
                    data-testid={`button-size-down-${pkg.tier}-${ei}`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onSizeChange(ei, "up")}
                    className="p-0.5 rounded hover:bg-muted"
                    data-testid={`button-size-up-${pkg.tier}-${ei}`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                onClick={() => onRemove(ei)}
                className="p-0.5 rounded hover:bg-destructive/10 text-destructive"
                data-testid={`button-remove-${pkg.tier}-${ei}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {/* Installation line */}
        <div className="flex items-center justify-between p-2 bg-primary/5 rounded text-sm">
          <span className="font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Full Professional Installation
          </span>
          <span className="text-xs text-muted-foreground">Included</span>
        </div>

        {/* Add equipment */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setAddOpen(!addOpen)}
            data-testid={`button-add-equipment-${pkg.tier}`}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Equipment
          </Button>
          {addOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {getAllEquipmentOptions().map(cat => (
                <div key={cat.category}>
                  <div className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">{cat.category}</div>
                  {cat.items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => { onAdd(cat.category, idx); setAddOpen(false); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-accent text-sm flex justify-between"
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="text-muted-foreground ml-2">{formatCurrency(item.price)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total + Select */}
        <div className="pt-2 border-t space-y-2">
          <div className="flex justify-between font-semibold text-sm">
            <span>Total:</span>
            <span>{formatCurrency(pkg.totalPrice)}</span>
          </div>
          <Button
            onClick={onSelect}
            variant={isSelected ? "default" : "outline"}
            className="w-full"
            data-testid={`button-select-${pkg.tier}`}
          >
            {isSelected ? "Selected" : "Select Package"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
