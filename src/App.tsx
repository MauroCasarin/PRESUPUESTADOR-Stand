import React, { useState, useMemo, useEffect } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { es } from 'date-fns/locale';
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
  List,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  LogOut,
  LogIn,
  Copy
} from 'lucide-react';
import { db } from './firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import * as XLSX from 'xlsx';

registerLocale('es', es);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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
  { id: 'tv70', name: 'TV 70"', price: 242000, unit: 'días', icon: MonitorPlay }
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
  const [cuit, setCuit] = useState<string>('');
  const [evento, setEvento] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [customExtras, setCustomExtras] = useState<{ id: string, name: string, price: number }[]>([]);
  const [newCustomExtraName, setNewCustomExtraName] = useState('');
  const [newCustomExtraPrice, setNewCustomExtraPrice] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>(CITIES[0].name);
  const [lugarArmado, setLugarArmado] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>("4");
  const [extrasQty, setExtrasQty] = useState<Record<string, number>>({});
  const [graficasList, setGraficasList] = useState<{ id: string, ancho: number, alto: number }[]>([]);
  const [newGraficaAncho, setNewGraficaAncho] = useState('');
  const [newGraficaAlto, setNewGraficaAlto] = useState('');
  const [ipcData, setIpcData] = useState<{ month: string, value: number, loading: boolean }>({ month: '', value: 0, loading: true });
  
  const [savedQuotes, setSavedQuotes] = useState<any[]>([]);
  const [clientsList, setClientsList] = useState<any[]>([]);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCuit, setNewClientCuit] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sueValue, setSueValue] = useState<number>(1800000);
  const [showSueModal, setShowSueModal] = useState(false);
  const [suePassword, setSuePassword] = useState('');
  const [isSueUnlocked, setIsSueUnlocked] = useState(false);
  const [selectedQuoteDetails, setSelectedQuoteDetails] = useState<any | null>(null);
  
  const [showTerminarModal, setShowTerminarModal] = useState(false);

  const currentMonthName = new Date().toLocaleString('es-AR', { month: 'long' });
  const capitalizedCurrentMonth = currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

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
          
          // Calculate accumulated inflation since last August
          let lastAugustIndex = -1;
          for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].fecha.includes('-08-')) {
              lastAugustIndex = i;
              break;
            }
          }
          
          let accumulated = 1;
          if (lastAugustIndex !== -1) {
            for (let i = lastAugustIndex + 1; i < data.length; i++) {
              accumulated *= (1 + data[i].valor / 100);
            }
          }
          setSueValue(1800000 * accumulated);
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
      handleFirestoreError(error, OperationType.LIST, 'quotes');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const clients = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setClientsList(clients);
    }, (error) => {
      console.error("Error fetching clients:", error);
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (cliente) {
      const found = clientsList.find(c => c.name.toLowerCase() === cliente.toLowerCase());
      if (found && !cuit) {
        setCuit(found.cuit || '');
      }
    }
  }, [cliente, clientsList]);

  const handleExtraChange = (id: string, delta: number) => {
    setExtrasQty(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [id]: next };
    });
  };

  const handleExtraInputChange = (id: string, value: string) => {
    const num = parseFloat(value);
    setExtrasQty(prev => ({
      ...prev,
      [id]: isNaN(num) ? 0 : Math.max(0, num)
    }));
  };

  const handleAddCustomExtra = () => {
    if (newCustomExtraName && newCustomExtraPrice) {
      setCustomExtras(prev => [...prev, { 
        id: `custom-${Date.now()}`, 
        name: newCustomExtraName, 
        price: parseFloat(newCustomExtraPrice) 
      }]);
      setNewCustomExtraName('');
      setNewCustomExtraPrice('');
    }
  };

  const handleAddGrafica = () => {
    const ancho = parseFloat(newGraficaAncho);
    const alto = parseFloat(newGraficaAlto);
    if (!isNaN(ancho) && !isNaN(alto) && ancho > 0 && alto > 0) {
      setGraficasList(prev => [...prev, { id: `g-${Date.now()}`, ancho, alto }]);
      setNewGraficaAncho('');
      setNewGraficaAlto('');
    }
  };

  const handleRemoveGrafica = (id: string) => {
    setGraficasList(prev => prev.filter(g => g.id !== id));
  };

  // --- CALCULATIONS ---
  const ipcMultiplier = 1 + (ipcData.value / 100);

  const cityData = useMemo(() => CITIES.find(c => c.name === selectedCity) || CITIES[0], [selectedCity]);
  
  const basePrice = (BASE_PRICES[selectedSize as keyof typeof BASE_PRICES] || 0) * ipcMultiplier;
  const freightPrice = (cityData.name === "Cap.Fed" ? 0 : cityData.distance * 5500) * ipcMultiplier;
  
  const eventDays = useMemo(() => {
    if (!startDate || !endDate) return 1;
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
  }, [startDate, endDate]);

  const extrasTotal = useMemo(() => {
    const standardExtras = EXTRAS.reduce((total, extra) => {
      let qty = 0;
      if (extra.id === 'grafica') {
        qty = graficasList.reduce((sum, g) => sum + (g.ancho * g.alto), 0);
      } else {
        qty = extrasQty[extra.id] || 0;
      }
      let extraPrice = extra.price * ipcMultiplier * qty;
      if (extra.id.startsWith('tv')) {
        extraPrice *= eventDays;
      }
      return total + extraPrice;
    }, 0);
    
    const customExtrasTotal = customExtras.reduce((total, extra) => total + extra.price, 0);
    
    return standardExtras + customExtrasTotal;
  }, [extrasQty, customExtras, graficasList, ipcMultiplier, eventDays]);

  const grandTotal = basePrice + freightPrice + extrasTotal;

  const handleSaveQuote = async () => {
    if (!cliente || !evento) {
      alert("Por favor ingresa Cliente y Evento para guardar el presupuesto.");
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      alert("La fecha de fin no puede ser anterior a la fecha de inicio.");
      return;
    }
    
    setIsSaving(true);
    try {
      const quoteData = {
        cliente,
        cuit,
        evento,
        fechaInicio: startDate ? startDate.toISOString() : '',
        fechaFin: endDate ? endDate.toISOString() : '',
        selectedCity,
        lugarArmado,
        selectedSize,
        extrasQty,
        graficasList,
        customExtras,
        ipcMonth: ipcData.month || capitalizedCurrentMonth,
        ipcValue: ipcData.value,
        basePrice,
        freightPrice,
        extrasTotal,
        grandTotal,
      };

      if (editingId) {
        try {
          await updateDoc(doc(db, 'quotes', editingId), quoteData);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `quotes/${editingId}`);
        }
        alert("Presupuesto actualizado exitosamente.");
        setEditingId(null);
      } else {
        try {
          await addDoc(collection(db, 'quotes'), {
            ...quoteData,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'quotes');
        }
        alert("Presupuesto guardado exitosamente.");
      }
      
      // Reset form
      setCliente('');
      setCuit('');
      setEvento('');
      setStartDate(null);
      setEndDate(null);
      setSelectedCity(CITIES[0].name);
      setLugarArmado('');
      setSelectedSize("4");
      setExtrasQty({});
      setGraficasList([]);
      setCustomExtras([]);
    } catch (error) {
      console.error("Error saving quote", error);
      alert("Hubo un error al guardar el presupuesto.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (quote: any) => {
    setEditingId(quote.id);
    setCliente(quote.cliente || '');
    setCuit(quote.cuit || '');
    setEvento(quote.evento || '');
    setStartDate(quote.fechaInicio ? new Date(quote.fechaInicio) : null);
    setEndDate(quote.fechaFin ? new Date(quote.fechaFin) : null);
    setSelectedCity(quote.selectedCity || CITIES[0].name);
    setLugarArmado(quote.lugarArmado || '');
    setSelectedSize(quote.selectedSize || "4");
    setExtrasQty(quote.extrasQty || {});
    setGraficasList(quote.graficasList || []);
    setCustomExtras(quote.customExtras || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, 'quotes', deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (error) {
      console.error("Error deleting quote", error);
      handleFirestoreError(error, OperationType.DELETE, `quotes/${deleteConfirmId}`);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCliente('');
    setCuit('');
    setEvento('');
    setStartDate(null);
    setEndDate(null);
    setSelectedCity(CITIES[0].name);
    setLugarArmado('');
    setSelectedSize("4");
    setExtrasQty({});
    setGraficasList([]);
    setCustomExtras([]);
  };

  const groupedQuotes = useMemo(() => {
    const groups: Record<string, any[]> = {};
    savedQuotes
      .filter(q => 
        (q.cliente || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.evento || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
      .forEach(q => {
        const c = q.cliente || 'Sin Cliente';
        if (!groups[c]) groups[c] = [];
        groups[c].push(q);
      });
    return groups;
  }, [savedQuotes, searchTerm]);

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
            <button
              onClick={() => setShowTerminarModal(true)}
              className="text-[10px] sm:text-xs font-medium text-white bg-green-600 hover:bg-green-700 px-3 py-1 rounded-md shadow-sm transition-colors"
            >
              TERMINAR
            </button>
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
              <div className="p-2 sm:p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label htmlFor="cliente" className="block text-[10px] sm:text-xs font-medium text-gray-700">Cliente</label>
                    <button 
                      onClick={() => setShowAddClientModal(true)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Nuevo Cliente
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      id="cliente"
                      value={cliente}
                      onChange={(e) => setCliente(e.target.value)}
                      placeholder="Nombre del cliente"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                      list="clients-list"
                    />
                    <datalist id="clients-list">
                      {clientsList.map(c => (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="cuit" className="block text-[10px] sm:text-xs font-medium text-gray-700">CUIT</label>
                  <input
                    type="text"
                    id="cuit"
                    value={cuit}
                    onChange={(e) => setCuit(e.target.value)}
                    placeholder="CUIT del cliente"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
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
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700">
                    Fechas del Evento {eventDays > 1 ? `(${eventDays} días)` : '(1 día)'}
                  </label>
                  <DatePicker
                    selectsRange={true}
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(update) => {
                      setStartDate(update[0]);
                      setEndDate(update[1]);
                    }}
                    locale="es"
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Seleccionar rango de fechas"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                    popperClassName="centered-popper"
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
              <div className="p-2 sm:p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
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

                {/* Lugar de Armado */}
                <div className="space-y-1">
                  <label htmlFor="lugarArmado" className="block text-[10px] sm:text-xs font-medium text-gray-700">
                    Lugar de Armado
                  </label>
                  <input
                    type="text"
                    id="lugarArmado"
                    value={lugarArmado}
                    onChange={(e) => setLugarArmado(e.target.value)}
                    placeholder="Ej. Predio Ferial, Salón..."
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                  />
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
                  
                  if (extra.id === 'grafica') {
                    const totalM2 = graficasList.reduce((sum, g) => sum + (g.ancho * g.alto), 0);
                    return (
                      <div key={extra.id} className="p-1.5 sm:p-2 flex flex-col gap-2 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="bg-blue-100 p-1.5 rounded-md text-blue-700 shrink-0">
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="truncate">
                              <h3 className="text-[11px] sm:text-xs font-medium text-gray-900 truncate">{extra.name}</h3>
                              <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">
                                {formatCurrency(extra.price * ipcMultiplier)}/{extra.unit} {totalM2 > 0 && `(Total: ${totalM2.toFixed(2)} m²)`}
                              </p>
                            </div>
                          </div>
                          <div className="w-16 sm:w-20 text-right shrink-0">
                            <span className="text-[11px] sm:text-xs font-medium text-gray-900">
                              {totalM2 > 0 ? formatCurrency(totalM2 * extra.price * ipcMultiplier) : '-'}
                            </span>
                          </div>
                        </div>
                        
                        {/* List of graficas */}
                        {graficasList.length > 0 && (
                          <div className="pl-9 pr-2 space-y-1">
                            {graficasList.map(g => (
                              <div key={g.id} className="flex justify-between items-center text-[10px] sm:text-xs bg-white border border-gray-100 p-1 rounded">
                                <span className="text-gray-600">{g.ancho}m x {g.alto}m = {(g.ancho * g.alto).toFixed(2)} m²</span>
                                <button onClick={() => handleRemoveGrafica(g.id)} className="text-red-500 hover:text-red-700 p-0.5">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Add new grafica */}
                        <div className="pl-9 pr-2 flex items-center gap-1.5">
                          <input 
                            type="number" 
                            step="0.01"
                            placeholder="Ancho" 
                            value={newGraficaAncho}
                            onChange={e => setNewGraficaAncho(e.target.value)}
                            className="w-16 sm:w-20 rounded border-gray-300 text-[10px] sm:text-xs p-1"
                          />
                          <span className="text-gray-400 text-xs">x</span>
                          <input 
                            type="number" 
                            step="0.01"
                            placeholder="Alto" 
                            value={newGraficaAlto}
                            onChange={e => setNewGraficaAlto(e.target.value)}
                            className="w-16 sm:w-20 rounded border-gray-300 text-[10px] sm:text-xs p-1"
                          />
                          <span className="text-gray-400 text-xs">m</span>
                          <button 
                            onClick={handleAddGrafica}
                            disabled={!newGraficaAncho || !newGraficaAlto}
                            className="ml-auto bg-blue-100 text-blue-700 hover:bg-blue-200 p-1 rounded disabled:opacity-50 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  }

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
                            step="0.1"
                            value={qty || ''}
                            onChange={(e) => handleExtraInputChange(extra.id, e.target.value)}
                            placeholder="0"
                            className="w-12 sm:w-16 text-center bg-transparent border-none focus:ring-0 text-xs font-medium p-0"
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
                            {qty > 0 ? formatCurrency(qty * extra.price * ipcMultiplier * (extra.id.startsWith('tv') ? eventDays : 1)) : '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {customExtras.map(extra => (
                  <div key={extra.id} className="p-2 flex justify-between items-center text-xs border-t border-gray-100">
                    <span>{extra.name}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatCurrency(extra.price)}</span>
                      <button onClick={() => setCustomExtras(prev => prev.filter(e => e.id !== extra.id))} className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="p-2 border-t border-gray-100 bg-gray-50 flex gap-2">
                  <input 
                    type="text"
                    value={newCustomExtraName}
                    onChange={(e) => setNewCustomExtraName(e.target.value)}
                    placeholder="ADICIONAL"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white py-1.5 px-2 text-xs border"
                  />
                  <input 
                    type="number"
                    step="0.1"
                    value={newCustomExtraPrice}
                    onChange={(e) => setNewCustomExtraPrice(e.target.value)}
                    placeholder="Precio"
                    className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white py-1.5 px-2 text-xs border"
                  />
                  <button onClick={handleAddCustomExtra} className="bg-blue-600 text-white rounded-md px-2 py-1.5 text-xs font-medium hover:bg-blue-700">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
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

                  {selectedCity !== "Cap.Fed" && (
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Truck className="w-3 h-3" /> Flete
                        </p>
                      </div>
                      <p className="text-xs font-medium">{formatCurrency(freightPrice)}</p>
                    </div>
                  )}

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
                <div className="flex flex-col gap-2 mt-2">
                  <button 
                    onClick={handleSaveQuote}
                    disabled={isSaving}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium transition-colors focus:ring-2 focus:ring-blue-500/20 outline-none flex items-center justify-center gap-1.5 disabled:opacity-70"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? 'Guardando...' : (editingId ? 'Actualizar Presupuesto' : 'Guardar Presupuesto')}
                  </button>
                  {editingId && (
                    <button 
                      onClick={cancelEdit}
                      className="w-full py-2 px-3 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-xs font-medium transition-colors focus:ring-2 focus:ring-gray-500/20 outline-none flex items-center justify-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancelar Edición
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Container: Saved Quotes */}
        <section className="mt-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <List className="w-3.5 h-3.5 text-blue-600" />
              <h2 className="text-xs sm:text-sm font-semibold text-gray-900">
                Presupuestos Guardados por Cliente
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white py-1 px-2 text-xs border flex-1 sm:w-48"
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-48 sm:max-h-64 p-0">
            {Object.keys(groupedQuotes).length === 0 ? (
              <div className="p-4 text-center text-[10px] sm:text-xs text-gray-500">No hay presupuestos guardados.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {Object.entries(groupedQuotes).map(([clientName, quotes]) => (
                  <div key={clientName} className="flex flex-col">
                    <button 
                      onClick={() => setExpandedClient(expandedClient === clientName ? null : clientName)}
                      className="flex items-center justify-between p-2 sm:p-3 hover:bg-gray-50 transition-colors text-left w-full"
                    >
                      <span className="text-xs font-semibold text-gray-900">{clientName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{(quotes as any[]).length}</span>
                        {expandedClient === clientName ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    
                    {expandedClient === clientName && (
                      <ul className="bg-gray-50/50 divide-y divide-gray-100 border-t border-gray-100">
                        {(quotes as any[]).map(quote => (
                          <li key={quote.id} className="p-2 sm:p-3 pl-4 sm:pl-6 flex flex-col gap-2 transition-colors hover:bg-gray-100/50">
                            <div 
                              className="flex justify-between items-start gap-2 cursor-pointer"
                              onClick={() => setSelectedQuoteDetails(quote)}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-[11px] sm:text-xs font-medium text-gray-900 truncate">{quote.evento}</h3>
                                </div>
                                <p className="text-[9px] sm:text-[10px] text-gray-500 truncate mt-0.5">
                                  {quote.selectedCity} {quote.lugarArmado ? `(${quote.lugarArmado})` : ''} • {quote.selectedSize}m²
                                </p>
                                {(quote.fechaInicio || quote.fechaFin) && (
                                  <p className="text-[9px] sm:text-[10px] text-gray-500 truncate mt-0.5">
                                    {`${quote.fechaInicio ? new Date(quote.fechaInicio).toLocaleDateString('es-AR') : '?'} al ${quote.fechaFin ? new Date(quote.fechaFin).toLocaleDateString('es-AR') : '?'}`}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold text-xs text-gray-900">{formatCurrency(quote.grandTotal)}</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">
                                  {quote.createdAt?.toDate ? quote.createdAt.toDate().toLocaleDateString('es-AR') : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleEdit(quote); }}
                                className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded transition-colors"
                              >
                                <Edit2 className="w-3 h-3" /> Editar
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(quote.id); }}
                                className="flex items-center gap-1 text-[10px] text-red-600 hover:text-red-800 bg-red-50 px-2 py-1 rounded transition-colors"
                              >
                                <Trash2 className="w-3 h-3" /> Eliminar
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Sue Container */}
        <div className="mt-1 flex justify-end px-1">
          <button 
            onClick={() => {
              setShowSueModal(true);
              setIsSueUnlocked(false);
              setSuePassword('');
            }}
            className="text-[6px] text-gray-300 hover:text-gray-400 font-medium bg-transparent hover:bg-gray-100/30 px-1 py-0.5 rounded cursor-pointer transition-colors opacity-50 hover:opacity-100"
          >
            Sue: {formatCurrency(sueValue / 2)}
          </button>
        </div>

      </main>

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirmId(null); }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4 sm:p-5 overflow-hidden animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar presupuesto?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Esta acción no se puede deshacer. El presupuesto se borrará permanentemente.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminar Modal */}
      {showTerminarModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTerminarModal(false); }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 relative">
            <div className="flex justify-between items-center p-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-bold text-gray-900">TERMINAR</h3>
              <button 
                onClick={() => setShowTerminarModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 w-full h-full bg-gray-100">
              <iframe 
                src="https://www.marcelomagni.com.ar/Terminar-2026.htm" 
                className="w-full h-full border-none"
                title="Terminar 2026"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sue Modal */}
      {showSueModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSueModal(false); }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-xs w-full p-4 sm:p-5 overflow-hidden animate-in fade-in zoom-in duration-200 relative">
            <button 
              onClick={() => setShowSueModal(false)}
              className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            {!isSueUnlocked ? (
              <div className="flex flex-col items-center pt-2">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Acceso Restringido</h3>
                <input 
                  type="password" 
                  value={suePassword}
                  onChange={(e) => {
                    setSuePassword(e.target.value);
                    if (e.target.value === '214') {
                      setIsSueUnlocked(true);
                    }
                  }}
                  placeholder="Contraseña"
                  className="w-full text-center rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-2 px-3 text-sm border"
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex flex-col pt-2">
                <h3 className="text-sm font-bold text-gray-900 mb-3 border-b border-gray-100 pb-2">Detalle de Actualización</h3>
                <div className="space-y-3 mb-4">
                  <div className="flex justify-between items-center bg-gray-50 p-2 rounded-md">
                    <span className="text-xs text-gray-500 font-medium">QUINCENA</span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(sueValue / 2)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 p-2 rounded-md">
                    <span className="text-xs text-gray-500 font-medium">MES</span>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(sueValue)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 text-center bg-gray-50 p-2 rounded border border-gray-100">
                  Sueldo actualizado a la fecha del IPC ultimo{ipcData.month ? ` (${ipcData.month})` : ''}.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddClientModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddClientModal(false); }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4 sm:p-5 overflow-hidden animate-in fade-in zoom-in duration-200 relative">
            <button 
              onClick={() => setShowAddClientModal(false)}
              className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Nuevo Cliente</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                <input 
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-2 px-3 text-sm border"
                  placeholder="Nombre del cliente"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">CUIT</label>
                <input 
                  type="text"
                  value={newClientCuit}
                  onChange={(e) => setNewClientCuit(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-2 px-3 text-sm border"
                  placeholder="CUIT (opcional)"
                />
              </div>
              <button 
                onClick={async () => {
                  if (!newClientName) return;
                  try {
                    await addDoc(collection(db, 'clients'), {
                      name: newClientName,
                      cuit: newClientCuit,
                      createdAt: serverTimestamp()
                    });
                    setCliente(newClientName);
                    setCuit(newClientCuit);
                    setShowAddClientModal(false);
                    setNewClientName('');
                    setNewClientCuit('');
                  } catch (error) {
                    console.error("Error adding client", error);
                    handleFirestoreError(error, OperationType.CREATE, 'clients');
                  }
                }}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors mt-2"
              >
                Guardar Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quote Details Modal */}
      {selectedQuoteDetails && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedQuoteDetails(null); }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 sm:p-5 overflow-hidden animate-in fade-in zoom-in duration-200 relative max-h-[90vh] flex flex-col">
            <button 
              onClick={() => setSelectedQuoteDetails(null)}
              className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
              <div className="bg-blue-100 p-2 rounded-md">
                <Receipt className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Detalle de Presupuesto</h3>
                <p className="text-xs text-gray-500">
                  Emitido el {selectedQuoteDetails.createdAt?.toDate ? selectedQuoteDetails.createdAt.toDate().toLocaleDateString('es-AR') : '-'}
                </p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-2 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Cliente</p>
                  <p className="text-xs font-medium text-gray-900 mt-0.5">
                    {selectedQuoteDetails.cliente}
                    {selectedQuoteDetails.cuit ? ` (CUIT: ${selectedQuoteDetails.cuit})` : ''}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Evento</p>
                  <p className="text-xs font-medium text-gray-900 mt-0.5">{selectedQuoteDetails.evento}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Fechas</p>
                  <p className="text-xs font-medium text-gray-900 mt-0.5">
                    {`${selectedQuoteDetails.fechaInicio ? new Date(selectedQuoteDetails.fechaInicio).toLocaleDateString('es-AR') : '-'} al ${selectedQuoteDetails.fechaFin ? new Date(selectedQuoteDetails.fechaFin).toLocaleDateString('es-AR') : '-'}`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Ubicación</p>
                  <p className="text-xs font-medium text-gray-900 mt-0.5">
                    {selectedQuoteDetails.selectedCity}
                    {selectedQuoteDetails.lugarArmado ? ` - ${selectedQuoteDetails.lugarArmado}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Tamaño</p>
                  <p className="text-xs font-medium text-gray-900 mt-0.5">{selectedQuoteDetails.selectedSize} m²</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Fecha Presupuesto</p>
                  <p className="text-xs font-medium text-gray-900 mt-0.5">
                    {selectedQuoteDetails.createdAt?.toDate ? selectedQuoteDetails.createdAt.toDate().toLocaleDateString('es-AR') : '-'}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-wider">Producto / Servicio (Resumen)</h4>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 relative group">
                  <p className="text-xs text-gray-800 font-mono leading-relaxed select-all pr-8">
                    {selectedQuoteDetails.cliente} / STAND: {selectedQuoteDetails.evento} / {selectedQuoteDetails.fechaInicio ? new Date(selectedQuoteDetails.fechaInicio).toLocaleDateString('es-AR') : '-'} al {selectedQuoteDetails.fechaFin ? new Date(selectedQuoteDetails.fechaFin).toLocaleDateString('es-AR') : '-'} / {selectedQuoteDetails.selectedCity}{selectedQuoteDetails.lugarArmado ? ` - ${selectedQuoteDetails.lugarArmado}` : ''} / {formatCurrency(selectedQuoteDetails.grandTotal)}
                  </p>
                  <button 
                    onClick={() => {
                      const text = `${selectedQuoteDetails.cliente} / STAND: ${selectedQuoteDetails.evento} / ${selectedQuoteDetails.fechaInicio ? new Date(selectedQuoteDetails.fechaInicio).toLocaleDateString('es-AR') : '-'} al ${selectedQuoteDetails.fechaFin ? new Date(selectedQuoteDetails.fechaFin).toLocaleDateString('es-AR') : '-'} / ${selectedQuoteDetails.selectedCity}${selectedQuoteDetails.lugarArmado ? ` - ${selectedQuoteDetails.lugarArmado}` : ''} / ${formatCurrency(selectedQuoteDetails.grandTotal)}`;
                      navigator.clipboard.writeText(text);
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-blue-600"
                    title="Copiar texto"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-wider">Desglose</h4>
                <div className="space-y-2 bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Stand Base</span>
                    <span className="text-xs font-medium text-gray-900">{formatCurrency(selectedQuoteDetails.basePrice)}</span>
                  </div>
                  {selectedQuoteDetails.selectedCity !== 'Cap.Fed' && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600">Flete</span>
                      <span className="text-xs font-medium text-gray-900">{formatCurrency(selectedQuoteDetails.freightPrice)}</span>
                    </div>
                  )}
                  
                  {((selectedQuoteDetails.extrasQty && Object.keys(selectedQuoteDetails.extrasQty).length > 0) || (selectedQuoteDetails.customExtras && selectedQuoteDetails.customExtras.length > 0) || (selectedQuoteDetails.graficasList && selectedQuoteDetails.graficasList.length > 0)) && (
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <p className="text-[10px] text-gray-500 font-semibold mb-1">Adicionales:</p>
                      
                      {selectedQuoteDetails.graficasList && selectedQuoteDetails.graficasList.length > 0 && (() => {
                        const totalArea = selectedQuoteDetails.graficasList.reduce((acc: number, g: any) => acc + (g.ancho * g.alto), 0);
                        const extraDef = EXTRAS.find(e => e.id === 'grafica');
                        if (!extraDef) return null;
                        const extraPrice = extraDef.price * (1 + (selectedQuoteDetails.ipcValue || 0) / 100) * totalArea;
                        return (
                          <div className="flex justify-between items-center pl-2 mt-1">
                            <span className="text-[11px] text-gray-600">• {extraDef.name} ({totalArea.toFixed(2)} m²)</span>
                            <span className="text-[11px] font-medium text-gray-900">{formatCurrency(extraPrice)}</span>
                          </div>
                        );
                      })()}

                      {selectedQuoteDetails.extrasQty && Object.entries(selectedQuoteDetails.extrasQty).map(([extraId, qty]) => {
                        if ((qty as number) <= 0) return null;
                        const extraDef = EXTRAS.find(e => e.id === extraId);
                        if (!extraDef) return null;
                        
                        let extraPrice = extraDef.price * (1 + (selectedQuoteDetails.ipcValue || 0) / 100) * (qty as number);
                        if (extraId.startsWith('tv')) {
                           let eventDays = 1;
                           if (selectedQuoteDetails.fechaInicio && selectedQuoteDetails.fechaFin) {
                             const start = new Date(selectedQuoteDetails.fechaInicio);
                             const end = new Date(selectedQuoteDetails.fechaFin);
                             const diffTime = Math.abs(end.getTime() - start.getTime());
                             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                             eventDays = diffDays + 1;
                           }
                           extraPrice *= eventDays;
                        }

                        return (
                          <div key={extraId} className="flex justify-between items-center pl-2 mt-1">
                            <span className="text-[11px] text-gray-600">• {extraDef.name} (x{qty as number})</span>
                            <span className="text-[11px] font-medium text-gray-900">{formatCurrency(extraPrice)}</span>
                          </div>
                        );
                      })}
                      {selectedQuoteDetails.customExtras && selectedQuoteDetails.customExtras.map((extra: any) => (
                        <div key={extra.id} className="flex justify-between items-center pl-2 mt-1">
                          <span className="text-[11px] text-gray-600">• {extra.name}</span>
                          <span className="text-[11px] font-medium text-gray-900">{formatCurrency(extra.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex justify-between items-center">
                <span className="text-sm font-bold text-blue-900">Total Estimado</span>
                <span className="text-lg font-bold text-blue-700">{formatCurrency(selectedQuoteDetails.grandTotal)}</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => {
                  handleEdit(selectedQuoteDetails);
                  setSelectedQuoteDetails(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
              >
                <Edit2 className="w-4 h-4" /> Editar
              </button>
              <button 
                onClick={() => {
                  setDeleteConfirmId(selectedQuoteDetails.id);
                  setSelectedQuoteDetails(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
