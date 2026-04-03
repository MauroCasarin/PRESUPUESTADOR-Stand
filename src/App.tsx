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
  Copy,
  Share2
} from 'lucide-react';
import { db } from './firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';

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
  "4": 3062914,
  "6": 3313623,
  "8": 3564957,
  "10": 3813860
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
  { id: 'grafica', name: 'Gráfica en MDF', price: 62476, unit: 'm²', icon: ImageIcon },
  { id: 'corporeo', name: 'Corpóreo', price: 124509, unit: 'm lineal', icon: Layers },
  { id: 'piso', name: 'Piso melamina', price: 65990, unit: 'm²', icon: Layers },
  { id: 'alfombra', name: 'Alfombra', price: 26034, unit: 'm²', icon: Layers },
  { id: 'tv42', name: 'TV 42"', price: 129654, unit: 'días', icon: MonitorPlay },
  { id: 'tv50', name: 'TV 50"', price: 187278, unit: 'días', icon: MonitorPlay },
  { id: 'tv70', name: 'TV 70"', price: 249018, unit: 'días', icon: MonitorPlay }
];

// --- UTILS ---
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
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
  const [lote, setLote] = useState<string>('');
  const [standAncho, setStandAncho] = useState<string>('2');
  const [standProfundo, setStandProfundo] = useState<string>('2');
  const [extrasQty, setExtrasQty] = useState<Record<string, number>>({});
  const [graficasList, setGraficasList] = useState<{ id: string, ancho: number, alto: number }[]>([]);
  const [newGraficaAncho, setNewGraficaAncho] = useState('');
  const [newGraficaAlto, setNewGraficaAlto] = useState('');
  const [ipcData, setIpcData] = useState<{ month: string, value: number, multiplier: number, loading: boolean }>({ month: '', value: 0, multiplier: 1, loading: true });
  
  const [savedQuotes, setSavedQuotes] = useState<any[]>([]);
  const [clientsList, setClientsList] = useState<any[]>([]);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCuit, setNewClientCuit] = useState('');
  const [newClientPaymentDays, setNewClientPaymentDays] = useState('0');
  const [editingClientData, setEditingClientData] = useState<any>(null);
  const [clientPaymentDays, setClientPaymentDays] = useState<number>(0);
  
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sueValue, setSueValue] = useState<number>(2137242.96);
  const [showSueModal, setShowSueModal] = useState(false);
  const [suePassword, setSuePassword] = useState('');
  const [isSueUnlocked, setIsSueUnlocked] = useState(false);
  const [selectedQuoteDetails, setSelectedQuoteDetails] = useState<any | null>(null);
  const [showDetailedBreakdown, setShowDetailedBreakdown] = useState(false);
  const [showSummaryDropdown, setShowSummaryDropdown] = useState(false);
  
  const [showTerminarModal, setShowTerminarModal] = useState(false);

  const generateDocument = async (quoteDetails: any) => {
    try {
      // Fetch the template from the public folder
      const response = await fetch('/presupuesto molde.docx');
      if (!response.ok) {
        throw new Error('No se pudo cargar el archivo de plantilla (presupuesto molde.docx). Asegúrate de que el archivo exista.');
      }
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Load the zip
      const zip = new PizZip(arrayBuffer);

      // Create docxtemplater instance
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      // Format dates
      const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleDateString('es-AR');
      };

      const roundUpToNearest5000 = (value: number) => {
        if (!value) return 0;
        return Math.ceil(value / 5000) * 5000;
      };

      function numeroALetras(num: number): string {
        if (num === 0) return 'cero';

        const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
        const decenas = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
        const decenas2 = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
        const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

        function getUnidades(n: number): string {
          return unidades[n];
        }

        function getDecenas(n: number): string {
          if (n < 10) return getUnidades(n);
          if (n < 20) return decenas[n - 10];
          if (n === 20) return 'veinte';
          if (n < 30) return 'veinti' + getUnidades(n - 20);
          const d = Math.floor(n / 10);
          const u = n % 10;
          return decenas2[d] + (u > 0 ? ' y ' + getUnidades(u) : '');
        }

        function getCentenas(n: number): string {
          if (n === 100) return 'cien';
          const c = Math.floor(n / 100);
          const d = n % 100;
          return centenas[c] + (d > 0 ? ' ' + getDecenas(d) : '');
        }

        function getMiles(n: number): string {
          const m = Math.floor(n / 1000);
          const c = n % 1000;
          let res = '';
          if (m === 1) res = 'mil';
          else if (m > 1) res = getCentenas(m) + ' mil';
          
          return res + (c > 0 ? ' ' + getCentenas(c) : '');
        }

        function getMillones(n: number): string {
          const m = Math.floor(n / 1000000);
          const c = n % 1000000;
          let res = '';
          if (m === 1) res = 'un millón';
          else if (m > 1) res = getMiles(m) + ' millones';
          
          return res + (c > 0 ? ' ' + getMiles(c) : '');
        }

        return getMillones(num).trim();
      }

      const formatRoundedCurrency = (value: number) => {
        return formatCurrency(roundUpToNearest5000(value));
      };

      const formatRoundedText = (value: number) => {
        return numeroALetras(roundUpToNearest5000(value)) + ' pesos';
      };

      // Prepare data
      const tvDetails = [];
      if (quoteDetails.extrasQty) {
        if (quoteDetails.extrasQty['tv42'] > 0) tvDetails.push({ tamano: '42"', dias: quoteDetails.extrasQty['tv42'] });
        if (quoteDetails.extrasQty['tv50'] > 0) tvDetails.push({ tamano: '50"', dias: quoteDetails.extrasQty['tv50'] });
        if (quoteDetails.extrasQty['tv70'] > 0) tvDetails.push({ tamano: '70"', dias: quoteDetails.extrasQty['tv70'] });
      }

      const data = {
        fechaPresupuesto: quoteDetails.createdAt?.toDate ? quoteDetails.createdAt.toDate().toLocaleDateString('es-AR') : new Date().toLocaleDateString('es-AR'),
        cliente: quoteDetails.cliente || '',
        cuit: quoteDetails.cuit || '',
        evento: quoteDetails.evento || '',
        fechaInicio: formatDate(quoteDetails.fechaInicio),
        fechaFin: formatDate(quoteDetails.fechaFin),
        ciudad: quoteDetails.selectedCity || '',
        lugarArmado: quoteDetails.lugarArmado || '',
        lote: quoteDetails.lote || '',
        tamano: quoteDetails.selectedSize || '',
        ancho: quoteDetails.standAncho || '',
        profundo: quoteDetails.standProfundo || '',
        
        precioBase: formatRoundedCurrency(quoteDetails.basePrice || 0),
        precioBaseTexto: formatRoundedText(quoteDetails.basePrice || 0),
        
        precioFlete: formatRoundedCurrency(quoteDetails.freightPrice || 0),
        precioFleteTexto: formatRoundedText(quoteDetails.freightPrice || 0),
        
        totalExtras: formatRoundedCurrency(quoteDetails.extrasTotal || 0),
        totalExtrasTexto: formatRoundedText(quoteDetails.extrasTotal || 0),
        
        subtotal: formatRoundedCurrency(quoteDetails.subtotal || 0),
        subtotalTexto: formatRoundedText(quoteDetails.subtotal || 0),
        
        recargoFinanciero: formatRoundedCurrency(quoteDetails.financialSurchargeAmount || 0),
        recargoFinancieroTexto: formatRoundedText(quoteDetails.financialSurchargeAmount || 0),
        
        total: formatRoundedCurrency(quoteDetails.grandTotal || 0),
        totalTexto: formatRoundedText(quoteDetails.grandTotal || 0),
        
        diasPago: quoteDetails.clientPaymentDays || 0,
        
        // Conditional Extras
        hasGraficas: quoteDetails.graficasList && quoteDetails.graficasList.length > 0,
        graficasM2: quoteDetails.graficasList ? quoteDetails.graficasList.reduce((sum: number, g: any) => sum + (g.ancho * g.alto), 0).toFixed(2) : '0',
        
        hasCorporeo: !!(quoteDetails.extrasQty && quoteDetails.extrasQty['corporeo'] > 0),
        corporeoM: quoteDetails.extrasQty ? quoteDetails.extrasQty['corporeo'] : 0,
        
        hasPiso: !!(quoteDetails.extrasQty && quoteDetails.extrasQty['piso'] > 0),
        pisoM2: quoteDetails.extrasQty ? quoteDetails.extrasQty['piso'] : 0,
        
        hasAlfombra: !!(quoteDetails.extrasQty && quoteDetails.extrasQty['alfombra'] > 0),
        alfombraM2: quoteDetails.extrasQty ? quoteDetails.extrasQty['alfombra'] : 0,
        
        hasTv: tvDetails.length > 0,
        tvDetails: tvDetails,
      };

      // Set the template variables
      doc.render(data);

      // Generate the document
      const out = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      // Save the file
      saveAs(out, `Presupuesto_${quoteDetails.cliente}_${quoteDetails.evento}.docx`);
    } catch (error) {
      console.error('Error generating document:', error);
      alert('Hubo un error al generar el documento. Asegúrate de que el archivo "presupuesto_molde.doc" sea un archivo .docx válido (Word moderno).');
    }
  };

  useEffect(() => {
    if (!selectedQuoteDetails) {
      setShowDetailedBreakdown(false);
      setShowSummaryDropdown(false);
    }
  }, [selectedQuoteDetails]);

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
          
          // Calculate accumulated inflation since March 2026
          // The base prices are updated to March 2026.
          let multiplier = 1;
          for (let i = 0; i < data.length; i++) {
            if (data[i].fecha > '2026-03-31') {
              multiplier *= (1 + data[i].valor / 100);
            }
          }
          
          setIpcData({ month: capitalizedMonth, value: latest.valor, multiplier, loading: false });
          
          // The user provided a fixed value for today: $1.068.621,48 (quincena) -> $2.137.242,96 (mensual)
          // This value will update when a NEW IPC datum is available (newer than the current latest)
          const latestDate = data[data.length - 1].fecha;
          let accumulatedSue = 1;
          for (let i = 0; i < data.length; i++) {
            if (data[i].fecha > latestDate) {
              accumulatedSue *= (1 + data[i].valor / 100);
            }
          }
          setSueValue(2137242.96 * accumulatedSue);
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
      if (found) {
        if (!cuit) setCuit(found.cuit || '');
        setClientPaymentDays(found.paymentDays || 0);
      } else {
        setClientPaymentDays(0);
      }
    } else {
      setClientPaymentDays(0);
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
  const selectedSize = useMemo(() => {
    const ancho = parseFloat(standAncho) || 0;
    const profundo = parseFloat(standProfundo) || 0;
    return (ancho * profundo).toString();
  }, [standAncho, standProfundo]);

  const ipcMultiplier = ipcData.multiplier;

  const cityData = useMemo(() => CITIES.find(c => c.name === selectedCity) || CITIES[0], [selectedCity]);
  
  const basePrice = useMemo(() => {
    const m2 = parseFloat(selectedSize) || 0;
    let price = 0;
    if (m2 <= 4) {
      price = BASE_PRICES["4"];
    } else if (m2 <= 6) {
      price = BASE_PRICES["4"] + (m2 - 4) * ((BASE_PRICES["6"] - BASE_PRICES["4"]) / 2);
    } else if (m2 <= 8) {
      price = BASE_PRICES["6"] + (m2 - 6) * ((BASE_PRICES["8"] - BASE_PRICES["6"]) / 2);
    } else if (m2 <= 10) {
      price = BASE_PRICES["8"] + (m2 - 8) * ((BASE_PRICES["10"] - BASE_PRICES["8"]) / 2);
    } else {
      price = BASE_PRICES["10"] + (m2 - 10) * ((BASE_PRICES["10"] - BASE_PRICES["8"]) / 2);
    }
    return price * ipcMultiplier;
  }, [selectedSize, ipcMultiplier]);

  const freightPrice = (cityData.name === "Cap.Fed" ? 0 : cityData.distance * 5000) * ipcMultiplier;
  
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

  const subtotal = basePrice + freightPrice + extrasTotal;
  const financialSurchargePercent = (clientPaymentDays / 30) * ipcData.value;
  const financialSurchargeAmount = subtotal * (financialSurchargePercent / 100);
  const grandTotal = subtotal + financialSurchargeAmount;

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
        lote,
        standAncho,
        standProfundo,
        selectedSize,
        extrasQty,
        graficasList,
        customExtras,
        ipcMonth: ipcData.month || capitalizedCurrentMonth,
        ipcValue: ipcData.value,
        basePrice,
        freightPrice,
        extrasTotal,
        clientPaymentDays,
        financialSurchargePercent,
        subtotal,
        financialSurchargeAmount,
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
      setLote('');
      setStandAncho('2');
      setStandProfundo('2');
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
    setLote(quote.lote || '');
    setStandAncho(quote.standAncho || '2');
    setStandProfundo(quote.standProfundo || '2');
    setClientPaymentDays(quote.clientPaymentDays || 0);
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
    setLote('');
    setStandAncho('2');
    setStandProfundo('2');
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
                    <div className="flex gap-2">
                      {clientsList.find(c => c.name.toLowerCase() === cliente.toLowerCase()) && (
                        <button 
                          onClick={() => {
                            const found = clientsList.find(c => c.name.toLowerCase() === cliente.toLowerCase());
                            if (found) {
                              setEditingClientData(found);
                              setNewClientName(found.name);
                              setNewClientCuit(found.cuit || '');
                              setNewClientPaymentDays((found.paymentDays || 0).toString());
                              setShowAddClientModal(true);
                            }
                          }}
                          className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                        >
                          Editar
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          setEditingClientData(null);
                          setNewClientName('');
                          setNewClientCuit('');
                          setNewClientPaymentDays('0');
                          setShowAddClientModal(true);
                        }}
                        className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" /> Nuevo
                      </button>
                    </div>
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

                {/* Lote */}
                <div className="space-y-1">
                  <label htmlFor="lote" className="block text-[10px] sm:text-xs font-medium text-gray-700">
                    N° de lote
                  </label>
                  <input
                    type="text"
                    id="lote"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    placeholder="Ej. 12A"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                  />
                </div>

                {/* Size Selection */}
                <div className="space-y-1">
                  <label className="block text-[10px] sm:text-xs font-medium text-gray-700">
                    Tamaño (m²) - Total: {selectedSize} m²
                  </label>
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <label htmlFor="standAncho" className="block text-[10px] text-gray-500 mb-1">Ancho (m)</label>
                      <input
                        type="number"
                        id="standAncho"
                        min="0"
                        step="0.1"
                        value={standAncho}
                        onChange={(e) => setStandAncho(e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="standProfundo" className="block text-[10px] text-gray-500 mb-1">Profundo (m)</label>
                      <input
                        type="number"
                        id="standProfundo"
                        min="0"
                        step="0.1"
                        value={standProfundo}
                        onChange={(e) => setStandProfundo(e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-1.5 px-2 text-xs border"
                      />
                    </div>
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
                  <button 
                    onClick={() => {
                      const quoteDetails = {
                        cliente,
                        cuit,
                        evento,
                        fechaInicio: startDate ? startDate.toISOString() : null,
                        fechaFin: endDate ? endDate.toISOString() : null,
                        selectedCity,
                        lugarArmado,
                        lote,
                        selectedSize: standAncho && standProfundo ? (parseFloat(standAncho) * parseFloat(standProfundo)).toString() : '0',
                        standAncho,
                        standProfundo,
                        basePrice: calculateBasePrice(),
                        freightPrice: calculateFreight(),
                        extrasTotal: calculateExtrasTotal(),
                        subtotal: calculateSubtotal(),
                        financialSurchargeAmount: calculateFinancialSurcharge(),
                        grandTotal: calculateGrandTotal(),
                        clientPaymentDays,
                        extrasQty,
                        customExtras,
                        graficasList
                      };
                      generateDocument(quoteDetails);
                    }}
                    className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-medium transition-colors focus:ring-2 focus:ring-purple-500/20 outline-none flex items-center justify-center gap-1.5"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Descargar Word
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
            className="text-xs text-gray-300 hover:text-gray-400 font-medium bg-transparent hover:bg-gray-100/30 px-1 py-0.5 rounded cursor-pointer transition-colors opacity-50 hover:opacity-100"
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
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editingClientData ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Forma de pago (días)</label>
                <input 
                  type="number"
                  min="0"
                  value={newClientPaymentDays}
                  onChange={(e) => setNewClientPaymentDays(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 py-2 px-3 text-sm border"
                  placeholder="Ej. 0, 30, 60"
                />
              </div>
              <button 
                onClick={async () => {
                  if (!newClientName) return;
                  try {
                    const paymentDaysNum = parseInt(newClientPaymentDays) || 0;
                    if (editingClientData) {
                      await updateDoc(doc(db, 'clients', editingClientData.id), {
                        name: newClientName,
                        cuit: newClientCuit,
                        paymentDays: paymentDaysNum
                      });
                    } else {
                      await addDoc(collection(db, 'clients'), {
                        name: newClientName,
                        cuit: newClientCuit,
                        paymentDays: paymentDaysNum,
                        createdAt: serverTimestamp()
                      });
                    }
                    setCliente(newClientName);
                    setCuit(newClientCuit);
                    setClientPaymentDays(paymentDaysNum);
                    setShowAddClientModal(false);
                    setNewClientName('');
                    setNewClientCuit('');
                    setNewClientPaymentDays('0');
                    setEditingClientData(null);
                  } catch (error) {
                    console.error("Error saving client", error);
                    handleFirestoreError(error, editingClientData ? OperationType.UPDATE : OperationType.CREATE, 'clients');
                  }
                }}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors mt-2"
              >
                {editingClientData ? 'Actualizar Cliente' : 'Guardar Cliente'}
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
                  
                  {selectedQuoteDetails.clientPaymentDays > 0 && (
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600">
                          Recargo Financiero ({selectedQuoteDetails.clientPaymentDays} días - {selectedQuoteDetails.financialSurchargePercent?.toFixed(2)}%)
                        </span>
                        <span className="text-xs font-medium text-gray-900">{formatCurrency(selectedQuoteDetails.financialSurchargeAmount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex justify-between items-center">
                <span className="text-sm font-bold text-blue-900">Total Estimado</span>
                <span className="text-lg font-bold text-blue-700">{formatCurrency(selectedQuoteDetails.grandTotal)}</span>
              </div>

              <div className="pt-2">
                <button 
                  onClick={() => setShowSummaryDropdown(!showSummaryDropdown)}
                  className="flex items-center justify-between w-full text-left text-xs font-bold text-gray-900 mb-2 uppercase tracking-wider focus:outline-none"
                >
                  <span>Producto / Servicio (Resumen)</span>
                  {showSummaryDropdown ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                
                {showSummaryDropdown && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 relative group mb-4">
                    <p className="text-xs text-gray-800 font-mono leading-relaxed select-all pr-8">
                      {selectedQuoteDetails.cliente} / STAND: {selectedQuoteDetails.evento} / {selectedQuoteDetails.fechaInicio ? new Date(selectedQuoteDetails.fechaInicio).toLocaleDateString('es-AR') : '-'} al {selectedQuoteDetails.fechaFin ? new Date(selectedQuoteDetails.fechaFin).toLocaleDateString('es-AR') : '-'} / {selectedQuoteDetails.selectedCity}{selectedQuoteDetails.lugarArmado ? ` - ${selectedQuoteDetails.lugarArmado}` : ''} / {selectedQuoteDetails.clientPaymentDays > 0 ? `Pago a ${selectedQuoteDetails.clientPaymentDays} días / ` : ''}{formatCurrency(selectedQuoteDetails.grandTotal)}
                    </p>
                    <button 
                      onClick={() => {
                        const text = `${selectedQuoteDetails.cliente} / STAND: ${selectedQuoteDetails.evento} / ${selectedQuoteDetails.fechaInicio ? new Date(selectedQuoteDetails.fechaInicio).toLocaleDateString('es-AR') : '-'} al ${selectedQuoteDetails.fechaFin ? new Date(selectedQuoteDetails.fechaFin).toLocaleDateString('es-AR') : '-'} / ${selectedQuoteDetails.selectedCity}${selectedQuoteDetails.lugarArmado ? ` - ${selectedQuoteDetails.lugarArmado}` : ''} / ${selectedQuoteDetails.clientPaymentDays > 0 ? `Pago a ${selectedQuoteDetails.clientPaymentDays} días / ` : ''}${formatCurrency(selectedQuoteDetails.grandTotal)}`;
                        navigator.clipboard.writeText(text);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-blue-600"
                      title="Copiar texto"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <button 
                  onClick={() => setShowDetailedBreakdown(!showDetailedBreakdown)}
                  className="flex items-center justify-between w-full text-left text-xs font-bold text-gray-900 mb-2 uppercase tracking-wider focus:outline-none"
                >
                  <span>Detalle Técnico</span>
                  {showDetailedBreakdown ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                
                {showDetailedBreakdown && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 relative group mb-4">
                    <div className="text-xs text-gray-800 font-mono leading-relaxed select-all pr-8 space-y-1">
                      <p>1. Lote N° {selectedQuoteDetails.lote || '-'} - Medida: {selectedQuoteDetails.standAncho || '-'}x{selectedQuoteDetails.standProfundo || '-'}m ({selectedQuoteDetails.selectedSize}m²)</p>
                      <p>2. Estructuras de madera pintada.</p>
                      <p>3. Piso {selectedQuoteDetails.extrasQty?.['piso'] ? 'melamina' : 'alfombra'}.</p>
                      
                      {selectedQuoteDetails.graficasList && selectedQuoteDetails.graficasList.length > 0 && (
                        <div>
                          <p>4. Gráficas:</p>
                          <ul className="pl-4">
                            {selectedQuoteDetails.graficasList.map((g: any, idx: number) => (
                              <li key={idx}>- {g.ancho}x{g.alto}m</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {((selectedQuoteDetails.extrasQty && Object.keys(selectedQuoteDetails.extrasQty).filter(k => k !== 'piso' && k !== 'alfombra' && k !== 'corporeo' && !k.startsWith('tv')).length > 0) || (selectedQuoteDetails.customExtras && selectedQuoteDetails.customExtras.length > 0)) && (
                        <div>
                          <p>5. Adicionales:</p>
                          <ul className="pl-4">
                            {Object.entries(selectedQuoteDetails.extrasQty || {}).map(([key, qty]) => {
                              if (key === 'piso' || key === 'alfombra' || key === 'corporeo' || key.startsWith('tv') || !qty) return null;
                              const extra = EXTRAS.find(e => e.id === key);
                              return extra ? <li key={key}>- {extra.name} (x{qty as number})</li> : null;
                            })}
                            {selectedQuoteDetails.customExtras?.map((extra: any, idx: number) => (
                              <li key={`custom-${idx}`}>- {extra.name}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {selectedQuoteDetails.extrasQty?.['corporeo'] > 0 && (
                        <p>6. Corpóreo: {selectedQuoteDetails.extrasQty['corporeo'] as number}m ancho</p>
                      )}
                      
                      {Object.entries(selectedQuoteDetails.extrasQty || {}).filter(([k, v]) => k.startsWith('tv') && (v as number) > 0).map(([k, v]) => {
                        const tv = EXTRAS.find(e => e.id === k);
                        return tv ? <p key={k}>7. TV: {tv.name.replace('TV ', '')} (x{v as number})</p> : null;
                      })}
                      
                      <p>8. Luminaria Led.</p>
                      <p>9. Instalación eléctrica: caja con tablero y disyuntor.</p>
                    </div>
                    
                    <button 
                      onClick={() => {
                        const lines = [
                          `1. Lote N° ${selectedQuoteDetails.lote || '-'} - Medida: ${selectedQuoteDetails.standAncho || '-'}x${selectedQuoteDetails.standProfundo || '-'}m (${selectedQuoteDetails.selectedSize}m²)`,
                          `2. Estructuras de madera pintada.`,
                          `3. Piso ${selectedQuoteDetails.extrasQty?.['piso'] ? 'melamina' : 'alfombra'}.`
                        ];
                        
                        if (selectedQuoteDetails.graficasList && selectedQuoteDetails.graficasList.length > 0) {
                          lines.push(`4. Gráficas:`);
                          selectedQuoteDetails.graficasList.forEach((g: any) => {
                            lines.push(`   - ${g.ancho}x${g.alto}m`);
                          });
                        }
                        
                        const hasOtherExtras = (selectedQuoteDetails.extrasQty && Object.keys(selectedQuoteDetails.extrasQty).filter(k => k !== 'piso' && k !== 'alfombra' && k !== 'corporeo' && !k.startsWith('tv')).length > 0) || (selectedQuoteDetails.customExtras && selectedQuoteDetails.customExtras.length > 0);
                        if (hasOtherExtras) {
                          lines.push(`5. Adicionales:`);
                          Object.entries(selectedQuoteDetails.extrasQty || {}).forEach(([key, qty]) => {
                            if (key === 'piso' || key === 'alfombra' || key === 'corporeo' || key.startsWith('tv') || !qty) return;
                            const extra = EXTRAS.find(e => e.id === key);
                            if (extra) lines.push(`   - ${extra.name} (x{qty})`);
                          });
                          selectedQuoteDetails.customExtras?.forEach((extra: any) => {
                            lines.push(`   - ${extra.name}`);
                          });
                        }
                        
                        if (selectedQuoteDetails.extrasQty?.['corporeo'] > 0) {
                          lines.push(`6. Corpóreo: ${selectedQuoteDetails.extrasQty['corporeo']}m ancho`);
                        }
                        
                        Object.entries(selectedQuoteDetails.extrasQty || {}).forEach(([k, v]) => {
                          if (k.startsWith('tv') && (v as number) > 0) {
                            const tv = EXTRAS.find(e => e.id === k);
                            if (tv) lines.push(`7. TV: ${tv.name.replace('TV ', '')} (x{v})`);
                          }
                        });
                        
                        lines.push(`8. Luminaria Led.`);
                        lines.push(`9. Instalación eléctrica: caja con tablero y disyuntor.`);
                        
                        navigator.clipboard.writeText(lines.join('\n'));
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-blue-600"
                      title="Copiar texto"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => {
                  const details = selectedQuoteDetails;
                  const formatDate = (date: any) => date ? new Date(date).toLocaleDateString('es-AR') : '-';
                  
                  let message = `*PRESUPUESTO ESTIMADO*\n\n`;
                  message += `*Cliente:* ${details.cliente}${details.cuit ? ` (CUIT: ${details.cuit})` : ''}\n`;
                  message += `*Evento:* ${details.evento}\n`;
                  message += `*Fechas:* ${formatDate(details.fechaInicio)} al ${formatDate(details.fechaFin)}\n`;
                  message += `*Ubicación:* ${details.selectedCity}${details.lugarArmado ? ` - ${details.lugarArmado}` : ''}\n`;
                  message += `*Tamaño:* ${details.selectedSize} m²\n\n`;
                  
                  message += `*DESGLOSE:*\n`;
                  message += `- Stand Base: ${formatCurrency(details.basePrice)}\n`;
                  if (details.selectedCity !== 'Cap.Fed') {
                    message += `- Flete: ${formatCurrency(details.freightPrice)}\n`;
                  }
                  
                  // Adicionales
                  const hasExtras = (details.extrasQty && Object.values(details.extrasQty).some(v => (v as number) > 0)) || 
                                   (details.customExtras && details.customExtras.length > 0) || 
                                   (details.graficasList && details.graficasList.length > 0);
                  
                  if (hasExtras) {
                    message += `\n*Adicionales:*\n`;
                    
                    // Gráficas
                    if (details.graficasList && details.graficasList.length > 0) {
                      const totalArea = details.graficasList.reduce((acc: number, g: any) => acc + (g.ancho * g.alto), 0);
                      const extraDef = EXTRAS.find(e => e.id === 'grafica');
                      if (extraDef) {
                        const extraPrice = extraDef.price * (1 + (details.ipcValue || 0) / 100) * totalArea;
                        message += `• ${extraDef.name} (${totalArea.toFixed(2)} m²): ${formatCurrency(extraPrice)}\n`;
                      }
                    }
                    
                    // Extras predefinidos
                    Object.entries(details.extrasQty || {}).forEach(([extraId, qty]) => {
                      if ((qty as number) <= 0) return;
                      const extraDef = EXTRAS.find(e => e.id === extraId);
                      if (!extraDef) return;
                      
                      let extraPrice = extraDef.price * (1 + (details.ipcValue || 0) / 100) * (qty as number);
                      if (extraId.startsWith('tv')) {
                         let eventDays = 1;
                         if (details.fechaInicio && details.fechaFin) {
                           const start = new Date(details.fechaInicio);
                           const end = new Date(details.fechaFin);
                           const diffTime = Math.abs(end.getTime() - start.getTime());
                           const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                           eventDays = diffDays + 1;
                         }
                         extraPrice *= eventDays;
                      }
                      message += `• ${extraDef.name} (x${qty}): ${formatCurrency(extraPrice)}\n`;
                    });
                    
                    // Extras personalizados
                    details.customExtras?.forEach((extra: any) => {
                      message += `• ${extra.name}: ${formatCurrency(extra.price)}\n`;
                    });
                  }
                  
                  if (details.clientPaymentDays > 0) {
                    message += `\n*Recargo Financiero:* ${formatCurrency(details.financialSurchargeAmount)} (${details.clientPaymentDays} días)\n`;
                  }
                  
                  message += `\n*TOTAL ESTIMADO: ${formatCurrency(details.grandTotal)}*`;
                  
                  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                  window.open(whatsappUrl, '_blank');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md transition-colors"
              >
                <Share2 className="w-4 h-4" /> COMPARTIR
              </button>
              <button 
                onClick={() => generateDocument(selectedQuoteDetails)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
              >
                <Receipt className="w-4 h-4" /> Descargar Word
              </button>
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
