import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  MapPin, 
  MonitorPlay, 
  Image as ImageIcon, 
  Layers, 
  Truck,
  Plus,
  Minus,
  Receipt,
  TrendingUp,
  Save,
  List
} from 'lucide-react';
import { db } from './firebase';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

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
  
  const [savedQuotes, setSavedQuotes] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'quotes'), (snapshot) => {
      const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      quotes.sort((a, b) => {
        const cA = (a.cliente || '').toLowerCase();
        const cB = (b.cliente || '').toLowerCase();
        if (cA < cB) return -1;
        if (cA > cB) return 1;
        const eA = (a.evento || '').toLowerCase();
        const eB = (b.evento || '').toLowerCase();
        if (eA < eB) return -1;
        if (eA > eB) return 1;
        return 0;
      });
      setSavedQuotes(quotes);
    }, (error) => {
      console.error("Error fetching quotes:", error);
    });
    return () => unsubscribe();
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

  const handleSaveQuote = async () => {
    if (!cliente || !evento) {
      alert("Por favor ingresa Cliente y Evento para guardar el presupuesto.");
      return;
    }
    
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'quotes'), {
        cliente,
        evento,
        selectedCity,
        selectedSize,
        extrasQty,
        ipcMonth: ipcData.month || capitalizedCurrentMonth,
        ipcValue: ipcData.value,
        basePrice,
        freightPrice,
        extrasTotal,
        grandTotal,
        createdAt: serverTimestamp()
      });
      alert("Presupuesto guardado exitosamente.");
    } catch (error) {
      console.error("Error saving quote", error);
      alert("Hubo un error al guardar el presupuesto.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-200 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="bg-blue-600 p-1.5 rounded-md">
              <Calculator className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-gray-900">Cotizador</h1>
          </div>
          <div className="flex items-center gap-2">
            {!ipcData.loading && ipcData.month && (
              <div className="flex items-center gap-1 text-[10px] sm:text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 shadow-sm">
                <TrendingUp className="w-3 h-3" />
                <span>IPC {ipcData.month}: {ipcData.value}%</span>
              </div>
            )}
            <div className="text-[10px] sm:text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              Tarifas {capitalizedCurrentMonth} 2026
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-4 py-3 flex flex-col gap-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          
          {/* Left Column: Configuration */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            
            {/* Datos del Presupuesto */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-2 sm:p-3 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="cliente" className="block text-[10px] sm:text-xs font-medium text-gray-700">Cliente</label>
                  <input
                    type="text"
                    id="cliente"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    placeholder="Nombre"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="evento" className="block text-[10px] sm:text-xs font-medium text-gray-700">Evento</label>
                  <input
                    type="text"
                    id="evento"
                    value={evento}
                    onChange={(e) => setEvento(e.target.value)}
                    placeholder="Evento"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                  />
                </div>
              </div>
            </section>

            {/* Section 1: Base Configuration */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50">
                <h2 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  Ubicación y Tamaño
                </h2>
              </div>
              <div className="p-2 sm:p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {/* City Selection */}
                <div className="space-y-1">
                  <label htmlFor="city" className="block text-[10px] sm:text-xs font-medium text-gray-700">
                    Ciudad de Armado
                  </label>
                  <select
                    id="city"
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border appearance-none"
                  >
                    {CITIES.map(city => (
                      <option key={city.name} value={city.name}>
                        {city.name} {city.distance > 0 ? `(${city.distance} km)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Size Selection */}
                <div className="space-y-1">
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700">
                    Tamaño (m²)
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {SIZES.map(size => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`py-1.5 px-1 rounded-md border text-xs font-medium transition-all ${
                          selectedSize === size
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Extras */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h2 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  Adicionales
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {EXTRAS.map(extra => {
                  const Icon = extra.icon;
                  const qty = extrasQty[extra.id] || 0;
                  return (
                    <div key={extra.id} className="p-1.5 sm:p-2 flex items-center justify-between gap-2 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="bg-blue-100 p-1.5 rounded-md text-blue-700 shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <h3 className="text-[11px] sm:text-xs font-medium text-gray-900 truncate">{extra.name}</h3>
                          <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">
                            {formatCurrency(extra.price * ipcMultiplier)}/{extra.unit}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center bg-gray-100 rounded-md border border-gray-200 p-0.5">
                          <button 
                            onClick={() => handleExtraChange(extra.id, -1)}
                            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-colors disabled:opacity-50"
                            disabled={qty === 0}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input 
                            type="number" 
                            min="0"
                            value={qty || ''}
                            onChange={(e) => handleExtraInputChange(extra.id, e.target.value)}
                            placeholder="0"
                            className="w-6 sm:w-8 text-center bg-transparent border-none focus:ring-0 text-xs font-medium p-0"
                          />
                          <button 
                            onClick={() => handleExtraChange(extra.id, 1)}
                            className="p-1 text-gray-600 hover:text-gray-900 hover:bg-white rounded transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="w-16 sm:w-20 text-right">
                          <span className="text-[11px] sm:text-xs font-medium text-gray-900">
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
            <div className="bg-gray-900 rounded-lg shadow-xl border border-gray-800 text-white sticky top-14 overflow-hidden">
              <div className="p-3 border-b border-gray-800">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-blue-400" />
                  Resumen
                </h2>
              </div>
              
              <div className="p-3 space-y-3">
                {/* Breakdown */}
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-gray-400">Stand ({selectedSize} m²)</p>
                    </div>
                    <p className="text-xs font-medium">{formatCurrency(basePrice)}</p>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Truck className="w-3 h-3" /> Flete
                      </p>
                    </div>
                    <p className="text-xs font-medium">{formatCurrency(freightPrice)}</p>
                  </div>

                  {extrasTotal > 0 && (
                    <div className="flex justify-between items-start pt-2 border-t border-gray-800">
                      <div>
                        <p className="text-xs text-gray-400">Adicionales</p>
                      </div>
                      <p className="text-xs font-medium">{formatCurrency(extrasTotal)}</p>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="pt-3 border-t border-gray-800">
                  <p className="text-[10px] text-gray-400 mb-0.5">Total Estimado</p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    {formatCurrency(grandTotal)}
                  </p>
                </div>

                {/* Action */}
                <button 
                  onClick={handleSaveQuote}
                  disabled={isSaving}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium transition-colors focus:ring-2 focus:ring-blue-500/20 outline-none flex items-center justify-center gap-1.5 disabled:opacity-70 mt-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Container: Saved Quotes */}
        <section className="mt-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center gap-1.5">
            <List className="w-3.5 h-3.5 text-blue-600" />
            <h2 className="text-xs sm:text-sm font-semibold text-gray-900">
              Presupuestos Guardados
            </h2>
          </div>
          <div className="overflow-y-auto max-h-48 sm:max-h-64 p-0">
            {savedQuotes.length === 0 ? (
              <div className="p-4 text-center text-[10px] sm:text-xs text-gray-500">No hay presupuestos guardados.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {savedQuotes.map(quote => (
                  <li key={quote.id} className="p-2 sm:p-3 hover:bg-gray-50 transition-colors flex justify-between items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-semibold text-gray-900 truncate">{quote.cliente} - {quote.evento}</h3>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">
                        {quote.selectedCity} • {quote.selectedSize}m² • IPC {quote.ipcMonth}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-xs text-gray-900">{formatCurrency(quote.grandTotal)}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">
                        {quote.createdAt?.toDate ? quote.createdAt.toDate().toLocaleDateString('es-AR') : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
