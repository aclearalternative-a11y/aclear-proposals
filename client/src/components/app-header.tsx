import { Droplets, Phone, Mail } from "lucide-react";

export default function AppHeader() {
  return (
    <header className="bg-gradient-to-r from-teal-700 to-teal-600 text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="flex-shrink-0">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-label="A Clear Alternative logo">
                <circle cx="22" cy="22" r="20" stroke="white" strokeWidth="2" fill="none" />
                <path d="M22 8 C18 18, 14 22, 14 28 C14 32.4 17.6 36 22 36 C26.4 36 30 32.4 30 28 C30 22, 26 18, 22 8Z" fill="white" fillOpacity="0.9" />
                <path d="M18 28 Q20 24, 22 28 Q24 32, 26 28" stroke="rgba(0,128,128,0.7)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">A Clear Alternative</h1>
              <p className="text-teal-100 text-xs">Serving NJ, PA, NY & DE since 1991</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs text-teal-100">
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> (856) 663-8088</span>
            <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> info@aclear.com</span>
          </div>
        </div>
      </div>
    </header>
  );
}
