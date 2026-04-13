import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

interface PricingData {
  conditionersSingle: any[];
  conditionersTwin: any[];
  acidNeutralizers: any[];
  ironOdorBreakers: any[];
  carbonFiltration: any[];
  roSystems: any[];
  bladderTanks: any[];
  uvLights: any[];
  waterHeaters: any[];
  chemicalInjection: any;
  leakValve: any;
  ruscoFilter: any;
  ozonePurifier: any;
  pressureBooster: any;
  lastUpdated: string;
}

const PricingContext = createContext<{ pricing: PricingData | null; loading: boolean }>({ pricing: null, loading: true });

export function PricingProvider({ children }: { children: ReactNode }) {
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("GET", "/api/pricing")
      .then(r => r.json())
      .then(data => { setPricing(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <PricingContext.Provider value={{ pricing, loading }}>
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing() {
  return useContext(PricingContext);
}
