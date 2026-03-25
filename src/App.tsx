import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  MapPin, 
  Maximize, 
  MonitorPlay, 
  Image as ImageIcon, 
  Layers, 
  Truck,
  Plus,
  Minus,
  Receipt,
  TrendingUp
} from 'lucide-react';

// --- DATA EXTRACTED FROM EXCEL ---
const BASE_PRICES = {
  "4": 2950000,
  "6": 3191500,
  "8": 3430000,
  "10": 3673500
};

const CITIES = [
  { name: "Cap.Fed", distance: 0 },
  { name: "La Plata", distance: 102 },
  { name: "Rosario", distance: 300 },
  { name: "Partido de la Costa", distance: 300 },
  { name: "Mar del Plata", distance: 400 },
  { name: "Santa Fe", distance: 500 },
  { name: "Parana", distance: 500 },
  { name: "Cordoba", distance: 750 },
  { name: "San Luis", distance: 800 },
  { name: "Corrientes", distance: 1000 },
  { name: "Posadas", distance: 1000 },
  { name: "Mendoza", distance: 1100 },
  { name: "Tucuman", distance: 1200 },
  { name: "Neuquen", distance: 1200 },
  { name: "Iguazu", distance: 1300 },
  { name: "Salta", distance: 1700 },
  { name: "Bariloche", distance: 1700 },
  { name: "Jujuy", distance: 1800 }
];

const SIZES = ["4", "6", "8", "10"];

type ExtraItem = {
  id: string;
  name: string;
  price: number;
  unit: string;
  icon: React.ElementType;
};

const EXTRAS: ExtraItem[] = [
  { id: 'grafica', name: 'Gráfica en MDF', price: 54000, unit: 'm²', icon: ImageIcon },
  { id: 'corporeo', name: 'Corpóreo', price: 121000, unit: 'm lineal', icon: Layers },
  { id: 'piso', name: 'Piso melamina', price: 64130, unit: 'm²', icon: Layers },
  { id: 'alfombra', name: 'Alfombra', price: 25300, unit: 'm²', icon: Layers },
  { id: 'tv42', name: 'TV 42"', price: 126000, unit: 'días', icon: MonitorPlay },
  { id: 'tv50', name: 'TV 50"', price: 182000, unit: 'días', icon: MonitorPlay },
  { id: 'tv70', name: 'TV 70"', price: 242000, unit: 'días', icon: MonitorPlay },
  { id: 'bannerDoble', name: 'Banner Doble tensor (90x190)', price: 110000, unit: 'unidades', icon: ImageIcon },
  { id: 'bannerRollup', name: 'Banner Roll UP (85x200)', price: 120000, unit: 'unidades', icon: ImageIcon }
];

// --- UTILS ---
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(amount);
};

export default function App() {
  const [cliente, setCliente] = useState<string>('');
  const [evento, setEvento] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>(CITIES[0].name);
  const [selectedSize, setSelectedSize] = useState<string>("4");
  const [extrasQty, setExtrasQty] = useState<Record<string, number>>({});
  const [ipcData, setIpcData] = useState<{ month: string, value: number, loading: boolean }>({ month: '', value: 0, loading: true });

  const currentMonthName = new Date().toLocaleString('es-AR', { month: 'long' });
  const capitalizedCurrentMonth = currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  useEffect(() => {
    fetch('https://api.argentinadatos.com/v1/finanzas/indices/inflacion')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          const latest = data[data.length - 1];
          const date = new Date(latest.fecha + 'T00:00:00');
          const monthName = date.toLocaleString('es-AR', { month: 'long', timeZone: 'UTC' });
          const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
          setIpcData({ month: capitalizedMonth, value: latest.valor, loading: false });
        } else {
          setIpcData(prev => ({ ...prev, loading: false }));
        }
      })
      .catch(err => {
        console.error("Error fetching IPC:", err);
        setIpcData(prev => ({ ...prev, loading: false }));
      });
  }, []);

  const handleExtraChange = (id: string, delta: number) => {
    setExtrasQty(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  const handleExtraInputChange = (id: string, value: string) => {
    const num = parseInt(value, 10);
    setExtrasQty(prev => ({
      ...prev,
      [id]: isNaN(num) ? 0 : Math.max(0, num)
    }));
  };

  // --- CALCULATIONS ---
  const ipcMultiplier = 1 + (ipcData.value / 100);

  const cityData = useMemo(() => CITIES.find(c => c.name === selectedCity) || CITIES[0], [selectedCity]);
  
  const basePrice = (BASE_PRICES[selectedSize as keyof typeof BASE_PRICES] || 0) * ipcMultiplier;
  const freightPrice = (cityData.distance * 5500) * ipcMultiplier;
  
  const extrasTotal = useMemo(() => {
    return EXTRAS.reduce((total, extra) => {
      const qty = extrasQty[extra.id] || 0;
      return total + (extra.price * ipcMultiplier * qty);
    }, 0);
  }, [extrasQty, ipcMultiplier]);

  const grandTotal = basePrice + freightPrice + extrasTotal;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-200">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Cotizador de Stands</h1>
          </div>
          <div className="flex items-center gap-3">
            {!ipcData.loading && ipcData.month && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 shadow-sm">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>IPC {ipcData.month}: {ipcData.value}%</span>
              </div>
            )}
            <div className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              Tarifas {capitalizedCurrentMonth} 2026
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Left Column: Configuration */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* Datos del Presupuesto */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="cliente" className="block text-xs font-medium text-gray-700">Cliente</label>
                  <input
                    type="text"
                    id="cliente"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    placeholder="Nombre del cliente"
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-2 px-3 text-sm border"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="evento" className="block text-xs font-medium text-gray-700">Evento</label>
                  <input
                    type="text"
                    id="evento"
                    value={evento}
                    onChange={(e) => setEvento(e.target.value)}
                    placeholder="Nombre del evento"
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-2 px-3 text-sm border"
                  />
                </div>
              </div>
            </section>

            {/* Section 1: Base Configuration */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  Ubicación y Tamaño
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* City Selection */}
                <div className="space-y-2">
                  <label htmlFor="city" className="block text-xs font-medium text-gray-700">
                    Ciudad de Armado
                  </label>
                  <select
                    id="city"
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-2 px-3 text-sm border appearance-none"
                  >
                    {CITIES.map(city => (
                      <option key={city.name} value={city.name}>
                        {city.name} {city.distance > 0 ? `(${city.distance} km)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Size Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-700">
                    Tamaño del Stand (m²)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {SIZES.map(size => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`py-2 px-2 rounded-lg border text-sm font-medium transition-all ${
                          selectedSize === size
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        {size} m²
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Extras */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" />
                  Adicionales y Equipamiento
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {EXTRAS.map(extra => {
                  const Icon = extra.icon;
                  const qty = extrasQty[extra.id] || 0;
                  return (
                    <div key={extra.id} className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">{extra.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatCurrency(extra.price * ipcMultiplier)} / {extra.unit}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-1">
                          <button 
                            onClick={() => handleExtraChange(extra.id, -1)}
                            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-md transition-colors disabled:opacity-50"
                            disabled={qty === 0}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input 
                            type="number" 
                            min="0"
                            value={qty || ''}
                            onChange={(e) => handleExtraInputChange(extra.id, e.target.value)}
                            placeholder="0"
                            className="w-12 text-center bg-transparent border-none focus:ring-0 text-sm font-medium p-0"
                          />
                          <button 
                            onClick={() => handleExtraChange(extra.id, 1)}
                            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-md transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="w-24 text-right">
                          <span className="text-sm font-medium text-gray-900">
                            {qty > 0 ? formatCurrency(qty * extra.price * ipcMultiplier) : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

          </div>

          {/* Right Column: Summary (Sticky) */}
          <div className="lg:col-span-4">
            <div className="bg-gray-900 rounded-xl shadow-xl border border-gray-800 text-white sticky top-20 overflow-hidden">
              <div className="p-4 border-b border-gray-800">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-400" />
                  Resumen de Presupuesto
                </h2>
              </div>
              
              <div className="p-4 space-y-4">
                {/* Breakdown */}
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-400">Stand Base ({selectedSize} m²)</p>
                      <p className="text-xs text-gray-500 mt-0.5">Precio Capital Federal</p>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(basePrice)}</p>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-400 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5" /> Flete y Montaje
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {cityData.name} {cityData.distance > 0 ? `(${cityData.distance} km x ${formatCurrency(5500 * ipcMultiplier)})` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(freightPrice)}</p>
                  </div>

                  {extrasTotal > 0 && (
                    <div className="flex justify-between items-start pt-4 border-t border-gray-800">
                      <div>
                        <p className="text-sm text-gray-400">Adicionales</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {Object.values(extrasQty).filter((v: number) => v > 0).reduce((a: number, b: number) => a + b, 0)} items
                        </p>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(extrasTotal)}</p>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="pt-6 border-t border-gray-800">
                  <p className="text-sm text-gray-400 mb-1">Costo Total Estimado</p>
                  <p className="text-4xl font-bold tracking-tight text-white">
                    {formatCurrency(grandTotal)}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    * Los valores no incluyen IVA. Precios sujetos a modificación.
                  </p>
                </div>

                {/* Action */}
                <button 
                  onClick={() => console.log("Ver Presupuesto")}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors focus:ring-4 focus:ring-blue-500/20 outline-none"
                >
                  Ver Presupuesto
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
