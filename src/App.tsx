/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, 
  RefreshCw, 
  Activity, 
  Database, 
  MessageSquare, 
  Package, 
  Users, 
  ShoppingCart, 
  Rocket,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  Plus,
  ChevronRight,
  Search,
  Save,
  CheckCircle,
  Terminal,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface Config {
  url: string;
  key: string;
  company: number;
}

interface SyncLog {
  tipo: string;
  registros_sync: number;
  estado: 'ok' | 'error' | 'pending';
  company_id: number;
  created_at: string;
}

interface Session {
  phone: string;
  estado: string;
  partner_nombre: string | null;
  updated_at: string;
}

interface Order {
  id: string;
  odoo_order_ref: string | null;
  partner_nombre: string;
  total: number;
  estado: 'confirmed' | 'pending' | 'error' | 'processing' | 'cancelled';
  created_at: string;
}

interface Seller {
  nombre: string;
  whatsapp_phone: string;
  activo: boolean;
}

interface DashboardData {
  products: number;
  partners: number;
  employees: number;
  pending: number;
  confirmed: number;
  sessions: Session[];
  queue: Order[];
  syncLog: SyncLog[];
  vendedores: Seller[];
  spark: number[];
  is_odoo_connected?: boolean;
  active_sessions_count?: number;
  sync_status?: string;
  odoo_server_config?: {
    url: string;
    db: string;
    username: string;
    companyId: number;
  };
}

// --- Helpers ---

const timeAgo = (dateStr: string | null) => {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const getEmptyData = (): DashboardData => ({
  products: 0,
  partners: 0,
  employees: 0,
  pending: 0,
  confirmed: 0,
  sessions: [],
  queue: [],
  syncLog: [],
  vendedores: [],
  spark: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
});

// --- Components ---

const StatusPill = ({ status, text }: { status: 'ok' | 'error' | 'pending' | 'dim', text: string }) => {
  const colors = {
    ok: 'text-odoo-green bg-odoo-green/10 border-odoo-green/20',
    error: 'text-odoo-red bg-odoo-red/10 border-odoo-red/20',
    pending: 'text-odoo-amber bg-odoo-amber/10 border-odoo-amber/20',
    dim: 'text-text-muted bg-gray-100 border-border-light'
  };
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'ok' ? 'bg-odoo-green' : status === 'error' ? 'bg-odoo-red' : status === 'pending' ? 'bg-odoo-amber animate-pulse-dot' : 'bg-text-muted'}`} />
      {text}
    </span>
  );
};

export default function App() {
  const [config, setConfig] = useState<Config>(() => ({
    url: localStorage.getItem('of_url') || '',
    key: localStorage.getItem('of_key') || '',
    company: parseInt(localStorage.getItem('of_company') || '1')
  }));
  
  const [data, setData] = useState<DashboardData>(getEmptyData());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isEditPartnerModalOpen, setIsEditPartnerModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isUpdatingPartner, setIsUpdatingPartner] = useState(false);
  const [newOrder, setNewOrder] = useState<{partner_id: number, lines: {product_id: number, qty: number}[]}>({
    partner_id: 0,
    lines: []
  });

  const createOdooOrder = async () => {
    if (!newOrder.partner_id || newOrder.lines.length === 0) {
      alert('Selecciona un cliente y al menos un producto');
      return;
    }
    setIsCreatingOrder(true);
    try {
      const res = await fetch('/api/odoo/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: newOrder.partner_id,
          order_line: newOrder.lines.map(l => [0, 0, { product_id: l.product_id, product_uom_qty: l.qty }]),
          company_id: activeExplorerCompanyId
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        alert('Pedido creado exitosamente: ' + data.order_id);
        setIsOrderModalOpen(false);
        setNewOrder({ partner_id: 0, lines: [] });
        loadAll();
      } else {
        alert('Error al crear pedido: ' + data.error);
      }
    } catch (e: any) {
      alert('Error de red: ' + e.message);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const updatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner) return;
    setIsUpdatingPartner(true);
    try {
      const res = await fetch(`/api/odoo/partners/${editingPartner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values: {
            name: editingPartner.name,
            vat: editingPartner.vat,
            phone: editingPartner.phone,
            mobile: editingPartner.mobile,
            email: editingPartner.email,
            street: editingPartner.street,
            city: editingPartner.city
          },
          company_id: activeExplorerCompanyId
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        alert('Cliente actualizado correctamente');
        setIsEditPartnerModalOpen(false);
        loadExplorerData();
      } else {
        alert('Error al actualizar: ' + data.error);
      }
    } catch (e: any) {
      alert('Error de red: ' + e.message);
    } finally {
      setIsUpdatingPartner(false);
    }
  };

  const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
  const [odooConfig, setOdooConfig] = useState({
    url: 'https://marketperu.facturaclic.pe/',
    db: 'marketperu_master',
    username: 'luis@gaorsystem.com',
    password: '06880ebb335d35f79967ee7b5abd13b08a94108f',
    companyIds: [] as number[]
  });
  const [availableCompanies, setAvailableCompanies] = useState<{id: number, name: string}[]>([]);
  const [accessResults, setAccessResults] = useState<any>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'monitor' | 'setup' | 'flujo' | 'explorer' | 'conexion'>('conexion');
  const [explorerData, setExplorerData] = useState<Record<number, {products: any[], partners: any[]}>>({});
  const [explorerCompanies, setExplorerCompanies] = useState<{id: number, name: string}[]>([]);
  const [activeExplorerCompanyId, setActiveExplorerCompanyId] = useState<number | null>(null);
  const [isExplorerLoading, setIsExplorerLoading] = useState(false);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const user = formData.get('user') as string;
    const pass = formData.get('pass') as string;

    if (user === 'admin' && pass === 'admin123') {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Credenciales incorrectas');
    }
  };

  const handleConfigChange = (field: string, value: string) => {
    setOdooConfig(prev => ({ ...prev, [field]: value }));
    setConfigSuccess(null);
    setConfigError(null);
    setAvailableCompanies([]);
  };

  const sbFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    if (!config.url || !config.key) return null;
    const url = config.url + path;
    try {
      const res = await fetch(url, {
        ...opts,
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          ...(opts.headers || {})
        }
      });
      if (!res.ok) return null;
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return null;
      }

      return res.json();
    } catch (e) {
      return null;
    }
  }, [config]);

  const checkAccess = async () => {
    setIsCheckingAccess(true);
    setAccessResults(null);
    try {
      const res = await fetch('/api/odoo/check-access');
      const data = await res.json();
      if (data.status === 'ok') {
        setAccessResults(data.results);
      } else {
        setConfigError(data.error || 'Error al verificar acceso');
      }
    } catch (e: any) {
      setConfigError('Error de red al verificar acceso: ' + e.message);
    } finally {
      setIsCheckingAccess(false);
    }
  };

  const diagnoseConnection = async () => {
    setIsDiagnosing(true);
    setConfigError(null);
    setConfigSuccess(null);
    setDiagnosticLogs([]);
    
    try {
      const res = await fetch('/api/odoo/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: odooConfig.url,
          db: odooConfig.db,
          username: odooConfig.username,
          password: odooConfig.password
        })
      });
      
      const data = await res.json();
      
      if (data.logs) {
        setDiagnosticLogs(data.logs);
      }
      
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `Error ${res.status}: Falló el diagnóstico`);
      }
      
      setConfigSuccess('Diagnóstico completado con éxito. Revisa los logs para más detalles.');
    } catch (err: any) {
      setConfigError(err?.message || 'Error desconocido durante el diagnóstico');
    } finally {
      setIsDiagnosing(false);
    }
  };

  const discoverCompanies = async () => {
    setIsDiscovering(true);
    setConfigError(null);
    setConfigSuccess(null);
    setAvailableCompanies([]);
    
    try {
      console.log('Iniciando descubrimiento de compañías...');
      const res = await fetch('/api/odoo/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: odooConfig.url,
          db: odooConfig.db,
          username: odooConfig.username,
          password: odooConfig.password
        })
      });
      
      const contentType = res.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Respuesta no válida del servidor: ${text.substring(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status}: Falló la conexión con Odoo`);
      }
      
      const companies = Array.isArray(data?.companies) ? data.companies.filter((c: any) => c && typeof c === 'object' && c.id) : [];
      console.log('Compañías encontradas:', companies);
      
      setAvailableCompanies(companies);
      
      if (companies.length === 0) {
        setConfigError('Conexión exitosa, pero no se encontraron compañías accesibles para este usuario.');
      } else {
        setConfigSuccess(`¡Conexión exitosa! Se encontraron ${companies.length} compañías.`);
        // Si solo hay una, seleccionarla automáticamente
        if (companies.length === 1) {
          setOdooConfig(prev => ({ ...prev, companyIds: [companies[0].id] }));
        }
      }
    } catch (err: any) {
      console.error('Error en discoverCompanies:', err);
      setConfigError(err?.message || 'Error desconocido al conectar con Odoo');
    } finally {
      setIsDiscovering(false);
    }
  };

  const saveOdooConfig = async () => {
    if (odooConfig.companyIds.length === 0) {
      setConfigError('Por favor, selecciona al menos una compañía antes de guardar.');
      return;
    }
    
    setConfigError(null);
    setConfigSuccess(null);
    try {
      const res = await fetch('/api/odoo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(odooConfig)
      });
      
      const contentType = res.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Respuesta no válida del servidor: ${text.substring(0, 100)}`);
      }

      if (!res.ok) throw new Error(data?.error || 'Error al guardar la configuración');
      
      setConfigSuccess('¡Configuración guardada! Reiniciando conexión...');
      
      // Guardar localmente también para persistencia en el navegador
      localStorage.setItem('odoo_config', JSON.stringify(odooConfig));
      
      setTimeout(() => {
        setIsModalOpen(false);
        loadAll();
      }, 1500);
    } catch (err: any) {
      console.error('Error en saveOdooConfig:', err);
      setConfigError(err?.message || 'Error al guardar la configuración');
    }
  };
  const loadAll = useCallback(async () => {
    setIsRefreshing(true);
    
    // Check if we should use server-side proxy or direct Supabase
    const useProxy = !config.url || !config.key;
    
    try {
      // Always try to fetch from our server first as it has the service role key
      const [statsRes, ordersRes, odooRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/recent-orders'),
        fetch('/api/odoo/stats')
      ]);
      
      const stats = await statsRes.json();
      const orders = await ordersRes.json();
      const odoo = await odooRes.json();
      
      if (stats && !stats.error) {
        setData(prev => ({
          ...prev,
          products: odoo?.products || prev.products,
          partners: odoo?.partners || prev.partners,
          employees: odoo?.employees || prev.employees,
          pending: stats?.pending_orders || 0,
          confirmed: odoo?.confirmed || 0,
          queue: Array.isArray(orders) ? orders : prev.queue,
          is_odoo_connected: !!odoo && !odoo.is_demo,
          active_sessions_count: stats?.active_sessions || 0,
          sync_status: stats?.sync_status || "OK",
          odoo_server_config: odoo?.config || prev.odoo_server_config
        }));
      }
    } catch (e) {
      console.error('Error loading proxy data:', e);
    }

    // If user provided direct Supabase credentials, we can also fetch additional details directly
    if (!useProxy) {
      try {
        const [syncLog, sessions, vendedores] = await Promise.all([
          sbFetch(`/rest/v1/sync_log?company_id=eq.${config.company}&order=created_at.desc&limit=10`),
          sbFetch(`/rest/v1/whatsapp_sessions?estado=neq.idle&estado=neq.completado&estado=neq.cancelado&order=updated_at.desc&limit=10`),
          sbFetch(`/rest/v1/vendedores?company_id=eq.${config.company}&select=*`),
        ]);

        setData(prev => ({
          ...prev,
          sessions: Array.isArray(sessions) ? sessions : prev.sessions,
          syncLog: Array.isArray(syncLog) ? syncLog : prev.syncLog,
          vendedores: Array.isArray(vendedores) ? vendedores : prev.vendedores
        }));
      } catch (err) {
        console.error('Error loading direct data:', err);
      }
    }

    setIsRefreshing(false);
    setLastUpdate(new Date().toLocaleTimeString());
  }, [config, sbFetch]);

  const loadExplorerData = async () => {
    setIsExplorerLoading(true);
    try {
      // First, get companies if we don't have them
      let companies = explorerCompanies;
      if (companies.length === 0) {
        const cRes = await fetch('/api/odoo/companies');
        const cData = await cRes.json();
        if (cData.status === 'ok') {
          companies = cData.companies;
          setExplorerCompanies(companies);
          if (companies.length > 0 && !activeExplorerCompanyId) {
            setActiveExplorerCompanyId(companies[0].id);
          }
        }
      }

      if (companies.length > 0) {
        const targetCompanyId = activeExplorerCompanyId || companies[0].id;
        
        const [pRes, ptRes] = await Promise.all([
          fetch(`/api/odoo/products?companyId=${targetCompanyId}`),
          fetch(`/api/odoo/partners?companyId=${targetCompanyId}`)
        ]);
        
        const pData = await pRes.json();
        const ptData = await ptRes.json();
        
        if (pData.status === 'ok' && ptData.status === 'ok') {
          setExplorerData(prev => ({
            ...prev,
            [targetCompanyId]: {
              products: pData.products || [],
              partners: ptData.partners || []
            }
          }));
        }
      }
    } catch (e) {
      console.error('Error loading explorer data:', e);
    } finally {
      setIsExplorerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'explorer') {
      loadExplorerData();
    }
  }, [activeTab, activeExplorerCompanyId]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const saveConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newConfig = {
      url: (formData.get('url') as string).trim().replace(/\/$/, ''),
      key: (formData.get('key') as string).trim(),
      company: parseInt(formData.get('company') as string) || 1
    };
    
    setConfig(newConfig);
    localStorage.setItem('of_url', newConfig.url);
    localStorage.setItem('of_key', newConfig.key);
    localStorage.setItem('of_company', newConfig.company.toString());
    setIsModalOpen(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-6 relative overflow-hidden">
        {/* Atmospheric Background Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-odoo-purple/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-odoo-green/10 rounded-full blur-[120px] animate-pulse" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white overflow-hidden z-10"
        >
          <div className="p-8">
            <div className="flex flex-col items-center mb-8 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-odoo-purple to-odoo-green rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-odoo-purple/30 transform -rotate-6">
                <Rocket className="w-12 h-12 text-white fill-current" />
              </div>
              <h1 className="text-3xl font-black text-text-main tracking-tight mb-2 font-display">OrderFlow</h1>
              <p className="text-text-muted text-sm leading-relaxed max-w-[280px]">
                La solución definitiva de <strong>GaorSystem Perú</strong> para transformar tus chats de WhatsApp en órdenes de venta reales en Odoo, impulsando la productividad de tu equipo al máximo.
              </p>
            </div>

            <div className="mb-8 p-4 bg-gray-50 rounded-2xl border border-border-light/50">
              <p className="text-[11px] text-text-muted font-medium text-center italic">
                "Transforma conversaciones en pedidos reales en segundos, eliminando la carga administrativa y acelerando el cierre de ventas."
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5 ml-1">Usuario</label>
                <input 
                  name="user"
                  type="text" 
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-border-light rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple transition-all"
                  placeholder="admin"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text-muted uppercase mb-1.5 ml-1">Contraseña</label>
                <input 
                  name="pass"
                  type="password" 
                  required
                  className="w-full px-4 py-3 bg-gray-50 border border-border-light rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple transition-all"
                  placeholder="••••••••"
                />
              </div>

              {loginError && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-odoo-red/10 border border-odoo-red/20 rounded-lg text-odoo-red text-xs font-medium text-center"
                >
                  {loginError}
                </motion.div>
              )}

              <button 
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-odoo-purple to-odoo-purple-dark hover:from-odoo-purple-dark hover:to-odoo-purple text-white rounded-xl font-bold text-sm shadow-lg shadow-odoo-purple/20 transition-all active:scale-[0.98]"
              >
                Iniciar Sesión
              </button>
            </form>
          </div>
          <div className="bg-gray-50 p-4 border-t border-border-light text-center">
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-widest">
              © 2024 OrderFlow · Desarrollado por <a href="https://gaorsystem.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-odoo-purple hover:underline">GaorSystem Perú</a>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-2 bg-odoo-purple text-white shadow-md">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white fill-current" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-display text-lg font-bold tracking-tight leading-none">
                OrderFlow <span className="font-normal opacity-80">Monitor</span>
                <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-[9px] font-black uppercase tracking-tighter">ADMIN</span>
              </h1>
              {data.is_odoo_connected && (
                <span className="text-[9px] font-medium opacity-70 flex items-center gap-1">
                  <Database className="w-2.5 h-2.5" /> Conectado a Odoo
                </span>
              )}
            </div>
          </div>
          
          <nav className="flex items-center h-10 ml-4">
            <button 
              onClick={() => setActiveTab('conexion')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeTab === 'conexion' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Conexión Odoo
            </button>
            <button 
              onClick={() => setActiveTab('monitor')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeTab === 'monitor' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Monitor
            </button>
            <button 
              onClick={() => setActiveTab('setup')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeTab === 'setup' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Guía de Instalación
            </button>
            <button 
              onClick={() => setActiveTab('flujo')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeTab === 'flujo' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Flujo de Venta
            </button>
            <button 
              onClick={() => setActiveTab('explorer')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeTab === 'explorer' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Explorador Odoo
            </button>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          {activeTab === 'monitor' && (
            <>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                <div className="w-2 h-2 rounded-full bg-odoo-green animate-pulse-dot" />
                LIVE
              </div>
              <div className="text-[11px] opacity-70 font-medium">
                {lastUpdate ? `Actualizado: ${lastUpdate}` : '—'}
              </div>
              <div className="h-6 w-px bg-white/20 mx-1" />
              <button 
                onClick={loadAll}
                className={`p-1.5 hover:bg-white/10 rounded-md transition-all ${isRefreshing ? 'opacity-50' : ''}`}
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
          <button 
            onClick={() => setIsModalOpen(true)}
            className="p-1.5 hover:bg-white/10 rounded-md transition-all"
            title="Configuración"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setIsAuthenticated(false)}
            className="p-1.5 hover:bg-white/10 rounded-md transition-all text-white/70 hover:text-white"
            title="Cerrar Sesión"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-7 overflow-y-auto">
        {activeTab === 'conexion' ? (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white border border-border-light rounded-xl p-6 shadow-sm">
              <h2 className="text-xl font-bold text-text-main mb-2">Configuración de Conexión a Odoo</h2>
              <p className="text-sm text-text-muted mb-6">
                Ingresa las credenciales de tu instancia de Odoo para establecer la conexión.
                Asegúrate de que la URL sea accesible y las credenciales tengan permisos suficientes (idealmente administrador).
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">URL de Odoo</label>
                    <input 
                      type="url" 
                      value={odooConfig.url} 
                      onChange={e => setOdooConfig({...odooConfig, url: e.target.value})}
                      className="w-full bg-gray-50 border border-border-light rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple transition-all"
                      placeholder="https://tu-odoo.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Base de Datos</label>
                    <input 
                      type="text" 
                      value={odooConfig.db} 
                      onChange={e => setOdooConfig({...odooConfig, db: e.target.value})}
                      className="w-full bg-gray-50 border border-border-light rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple transition-all"
                      placeholder="nombre_bd"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Usuario / Email</label>
                    <input 
                      type="text" 
                      value={odooConfig.username} 
                      onChange={e => setOdooConfig({...odooConfig, username: e.target.value})}
                      className="w-full bg-gray-50 border border-border-light rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple transition-all"
                      placeholder="admin@ejemplo.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Contraseña / API Key</label>
                    <input 
                      type="password" 
                      value={odooConfig.password} 
                      onChange={e => setOdooConfig({...odooConfig, password: e.target.value})}
                      className="w-full bg-gray-50 border border-border-light rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple transition-all"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      onClick={discoverCompanies}
                      disabled={isDiscovering || isDiagnosing}
                      className="flex-1 bg-odoo-purple text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-odoo-purple/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isDiscovering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Buscar Compañías
                    </button>
                    <button 
                      onClick={diagnoseConnection}
                      disabled={isDiscovering || isDiagnosing}
                      className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isDiagnosing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                      Diagnóstico Profundo
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {availableCompanies.length > 0 && (
                    <div className="bg-odoo-green/5 border border-odoo-green/20 rounded-lg p-4">
                      <label className="block text-xs font-bold text-odoo-green uppercase tracking-wider mb-2">Compañías Seleccionadas</label>
                      <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                        {availableCompanies.map(company => {
                          if (!company || !company.id) return null;
                          const isSelected = odooConfig.companyIds.includes(company.id);
                          return (
                            <button
                              key={company.id}
                              onClick={() => {
                                setOdooConfig(prev => {
                                  const newIds = isSelected 
                                    ? prev.companyIds.filter(id => id !== company.id)
                                    : [...prev.companyIds, company.id];
                                  return { ...prev, companyIds: newIds };
                                });
                              }}
                              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                isSelected 
                                  ? 'bg-white border-odoo-green ring-1 ring-odoo-green' 
                                  : 'bg-white border-border-light hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                  isSelected ? 'bg-odoo-green text-white' : 'bg-gray-100 text-text-muted'
                                }`}>
                                  {company.name ? company.name.charAt(0) : '?'}
                                </div>
                                <span className="text-sm font-semibold text-text-main text-left">{company.name || 'Sin nombre'}</span>
                              </div>
                              {isSelected && (
                                <CheckCircle2 className="w-5 h-5 text-odoo-green flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      
                      <button 
                        onClick={saveOdooConfig}
                        disabled={odooConfig.companyIds.length === 0}
                        className="w-full mt-4 bg-odoo-green text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-odoo-green/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        Guardar Configuración
                      </button>
                    </div>
                  )}

                  {configError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div className="break-words flex-1">{configError}</div>
                    </div>
                  )}
                  
                  {configSuccess && (
                    <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg text-sm flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div className="break-words flex-1">{configSuccess}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {diagnosticLogs.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-4 shadow-sm border border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    Logs de Diagnóstico
                  </h3>
                  <button 
                    onClick={() => setDiagnosticLogs([])}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Limpiar
                  </button>
                </div>
                <div className="bg-black rounded-lg p-4 font-mono text-[11px] text-green-400 h-64 overflow-y-auto space-y-1.5 border border-gray-800">
                  {diagnosticLogs.map((log, i) => (
                    <div key={i} className={`${log.includes('Fallido') || log.includes('ERROR') ? 'text-red-400' : log.includes('Exitoso') ? 'text-green-400' : 'text-gray-400'}`}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'monitor' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-auto">
            {/* Architecture Diagram */}
            <section className="col-span-full bg-white border border-border-light rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Arquitectura del Sistema</h2>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-text-muted">Estado de conexión</span>
                  <StatusPill status="ok" text="OPERATIVO" />
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-0 py-4 overflow-x-auto">
                {/* Node: Vendedores */}
                <div className="flex flex-col items-center gap-3 min-w-[130px]">
                  <div className="w-14 h-14 rounded-xl bg-odoo-cyan/10 border border-odoo-cyan/20 flex items-center justify-center text-2xl relative group transition-transform hover:scale-105">
                    <div className="absolute -inset-1 rounded-[14px] border-2 border-odoo-green/40" />
                    📱
                  </div>
                  <div className="text-xs font-bold text-text-main">Vendedores</div>
                  <StatusPill status="ok" text={`${data.vendedores.filter(v => v.activo).length} activos`} />
                </div>

                {/* Connector */}
                <div className="flex flex-col items-center gap-1 w-20 mb-8">
                  <div className="w-full h-[2px] bg-border-light relative overflow-hidden rounded-full">
                    <div className="absolute top-0 left-[-30%] w-[30%] h-full bg-odoo-purple animate-flow" />
                  </div>
                </div>

                {/* Node: Evolution API */}
                <div className="flex flex-col items-center gap-3 min-w-[130px]">
                  <div className="w-14 h-14 rounded-xl bg-odoo-amber/10 border border-odoo-amber/20 flex items-center justify-center text-2xl relative group transition-transform hover:scale-105">
                    <div className="absolute -inset-1 rounded-[14px] border-2 border-odoo-green/40" />
                    🔗
                  </div>
                  <div className="text-xs font-bold text-text-main">Evolution API</div>
                  <StatusPill status="ok" text="Online" />
                </div>

                {/* Connector */}
                <div className="flex flex-col items-center gap-1 w-20 mb-8">
                  <div className="w-full h-[2px] bg-border-light relative overflow-hidden rounded-full">
                    <div className="absolute top-0 left-[-30%] w-[30%] h-full bg-odoo-purple animate-flow" />
                  </div>
                </div>

                {/* Node: n8n */}
                <div className="flex flex-col items-center gap-3 min-w-[130px]">
                  <div className="w-14 h-14 rounded-xl bg-odoo-red/10 border border-odoo-red/20 flex items-center justify-center text-2xl relative group transition-transform hover:scale-105">
                    <div className="absolute -inset-1 rounded-[14px] border-2 border-odoo-green/40" />
                    ⚙
                  </div>
                  <div className="text-xs font-bold text-text-main">n8n</div>
                  <StatusPill status={data.sync_status === 'OK' ? 'ok' : 'error'} text={data.sync_status || 'Offline'} />
                </div>

                {/* Connector */}
                <div className="flex flex-col items-center gap-1 w-20 mb-8">
                  <div className="w-full h-[2px] bg-border-light relative overflow-hidden rounded-full">
                    <div className="absolute top-0 left-[-30%] w-[30%] h-full bg-odoo-purple animate-flow" />
                  </div>
                </div>

                {/* Node: Supabase */}
                <div className="flex flex-col items-center gap-3 min-w-[130px]">
                  <div className="w-14 h-14 rounded-xl bg-odoo-green/10 border border-odoo-green/20 flex items-center justify-center text-2xl relative group transition-transform hover:scale-105">
                    <div className="absolute -inset-1 rounded-[14px] border-2 border-odoo-green" />
                    🗄
                  </div>
                  <div className="text-xs font-bold text-text-main">Supabase</div>
                  <StatusPill status="ok" text="Conectado" />
                </div>

                {/* Connector */}
                <div className="flex flex-col items-center gap-1 w-20 mb-8">
                  <div className="w-full h-[2px] bg-border-light relative overflow-hidden rounded-full">
                    <div className="absolute top-0 left-[-30%] w-[30%] h-full bg-odoo-purple animate-flow-rev" />
                  </div>
                </div>

                {/* Node: Odoo */}
                <div className="flex flex-col items-center gap-3 min-w-[130px]">
                  <div className="w-14 h-14 rounded-xl bg-odoo-purple/10 border border-odoo-purple/20 flex items-center justify-center text-2xl relative group transition-transform hover:scale-105">
                    <div className={`absolute -inset-1 rounded-[14px] border-2 ${data.is_odoo_connected ? 'border-odoo-green' : 'border-odoo-green/40'}`} />
                    🏭
                  </div>
                  <div className="text-xs font-bold text-text-main">Odoo 17</div>
                  <StatusPill status={data.is_odoo_connected ? 'ok' : 'pending'} text={data.is_odoo_connected ? 'CONECTADO' : 'DEMO / SIN CONEXIÓN'} />
                </div>
              </div>
            </section>

            {/* KPIs + Sparkline */}
            <section className="bg-white border border-border-light rounded-lg p-5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Resumen General</h2>
                <div className="flex items-center gap-2">
                  {data.is_odoo_connected && (
                    <span className="text-[9px] font-bold text-odoo-green bg-odoo-green/10 px-1.5 py-0.5 rounded border border-odoo-green/20">ODOO LIVE</span>
                  )}
                  <Activity className="w-4 h-4 text-odoo-purple" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-border-light rounded-lg p-3">
                  <div className="text-2xl font-extrabold text-odoo-green leading-none mb-1">{data.products.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">Productos sync</div>
                </div>
                <div className="bg-gray-50 border border-border-light rounded-lg p-3">
                  <div className="text-2xl font-extrabold text-odoo-blue leading-none mb-1">{data.partners.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">Clientes sync</div>
                </div>
                <div className="bg-gray-50 border border-border-light rounded-lg p-3">
                  <div className="text-2xl font-extrabold text-odoo-purple leading-none mb-1">{data.employees.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">Empleados Odoo</div>
                </div>
                <div className="bg-gray-50 border border-border-light rounded-lg p-3">
                  <div className={`text-2xl font-extrabold leading-none mb-1 ${data.pending > 0 ? 'text-odoo-amber' : 'text-odoo-green'}`}>{data.pending}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">Pendientes</div>
                </div>
                <div className="bg-gray-50 border border-border-light rounded-lg p-3">
                  <div className="text-2xl font-extrabold text-text-main leading-none mb-1">{data.confirmed}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">Confirmados</div>
                </div>
              </div>

              <div className="mt-2">
                <div className="text-[10px] text-text-muted mb-2 uppercase tracking-widest font-bold">Pedidos últimas 12h</div>
                <div className="flex items-end gap-[3px] h-10">
                  {data.spark.map((v, i) => {
                    const max = Math.max(...data.spark, 1);
                    const h = Math.max(4, Math.round((v / max) * 40));
                    const isLast = i === data.spark.length - 1;
                    return (
                      <motion.div 
                        key={i}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className={`flex-1 rounded-t-[2px] border ${isLast ? 'bg-odoo-purple/40 border-odoo-purple/60' : 'bg-odoo-purple/10 border-odoo-purple/20'}`}
                        style={{ height: `${h}px`, transformOrigin: 'bottom' }}
                        title={`${v} pedidos`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 text-[9px] text-text-muted font-medium">
                  <span>12h atrás</span><span>6h</span><span>ahora</span>
                </div>
              </div>
            </section>

            {/* Odoo Connection Details */}
            <section className="bg-white border border-border-light rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Conexión Odoo</h2>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${data.is_odoo_connected ? 'bg-odoo-green/10 text-odoo-green border border-odoo-green/20' : 'bg-odoo-amber/10 text-odoo-amber border border-odoo-amber/20'}`}>
                  {data.is_odoo_connected ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {data.is_odoo_connected ? 'ACTIVA' : 'MODO DEMO'}
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex justify-between items-center py-2 border-b border-border-light/50">
                    <span className="text-[10px] font-bold text-text-muted uppercase">Servidor</span>
                    <span className="text-xs font-mono text-text-main truncate max-w-[150px]">
                      {data.odoo_server_config?.url || odooConfig.url || 'No configurado'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border-light/50">
                    <span className="text-[10px] font-bold text-text-muted uppercase">Base de Datos</span>
                    <span className="text-xs font-medium text-text-main">
                      {data.odoo_server_config?.db || odooConfig.db || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border-light/50">
                    <span className="text-[10px] font-bold text-text-muted uppercase">Usuario</span>
                    <span className="text-xs font-medium text-text-main">
                      {data.odoo_server_config?.username || odooConfig.username || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-[10px] font-bold text-text-muted uppercase">Compañías ID</span>
                    <span className="text-xs font-bold text-odoo-purple">
                      {data.odoo_server_config?.companyIds?.join(', ') || odooConfig.companyIds.join(', ') || '1'}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={loadAll}
                    className="w-full py-2 bg-gray-50 hover:bg-gray-100 border border-border-light rounded-lg text-[10px] font-bold text-text-muted uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Verificar ahora
                  </button>
                </div>
              </div>
            </section>

            {/* Sync Log */}
            <section className="md:col-span-2 bg-white border border-border-light rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Log de Sincronización</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-odoo-purple/10 text-odoo-purple border border-odoo-purple/20">
                  {data.syncLog.length} REGISTROS
                </span>
              </div>
              
              <div className="overflow-y-auto max-h-[220px] custom-scrollbar">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border-light bg-gray-50">
                      <th className="text-left py-2 px-3 text-[9px] text-text-muted uppercase tracking-widest font-bold">Tipo</th>
                      <th className="text-left py-2 px-3 text-[9px] text-text-muted uppercase tracking-widest font-bold">Registros</th>
                      <th className="text-left py-2 px-3 text-[9px] text-text-muted uppercase tracking-widest font-bold">Estado</th>
                      <th className="text-left py-2 px-3 text-[9px] text-text-muted uppercase tracking-widest font-bold">Compañía</th>
                      <th className="text-left py-2 px-3 text-[9px] text-text-muted uppercase tracking-widest font-bold">Hace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.syncLog.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-text-muted">
                          <div className="text-2xl opacity-40 mb-2">📋</div>
                          Sin logs de sync
                        </td>
                      </tr>
                    ) : (
                      data.syncLog.map((r, i) => {
                        const tipoLabel = { products: '📦 Productos', partners: '👥 Clientes', prices: '💰 Precios' }[r.tipo] || r.tipo;
                        return (
                          <tr key={i} className="border-b border-border-light/60 hover:bg-gray-50 transition-colors">
                            <td className="py-2.5 px-3 text-xs text-text-main font-medium">{tipoLabel}</td>
                            <td className="py-2.5 px-3 text-xs text-odoo-purple font-bold">{(r.registros_sync || 0).toLocaleString()}</td>
                            <td className="py-2.5 px-3">
                              <StatusPill status={r.estado} text={r.estado} />
                            </td>
                            <td className="py-2.5 px-3 text-xs text-text-muted font-medium">Cía {r.company_id}</td>
                            <td className="py-2.5 px-3 text-[10px] text-text-muted font-semibold">{timeAgo(r.created_at)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* WhatsApp Sessions */}
            <section className="bg-white border border-border-light rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Sesiones Activas</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-odoo-green/10 text-odoo-green border border-odoo-green/20">
                  {data.active_sessions_count || data.sessions.length}
                </span>
              </div>
              
              <div className="space-y-3">
                {data.sessions.length === 0 ? (
                  <div className="py-8 text-center text-text-muted">
                    <div className="text-2xl opacity-40 mb-2">💬</div>
                    Sin sesiones activas
                  </div>
                ) : (
                  data.sessions.map((s, i) => {
                    const stateLabels: Record<string, [string, string]> = {
                      idle: ['dim', '💤 Esperando'],
                      seleccionando_cliente: ['blue', '🔍 Buscando cliente'],
                      confirmando_cliente: ['amber', '✋ Confirmando cliente'],
                      agregando_productos: ['green', '🛒 Agregando productos'],
                      confirmando_pedido: ['amber', '⏳ Confirmando pedido'],
                      procesando: ['amber', '⚙ Procesando'],
                      completado: ['green', '✅ Completado'],
                      cancelado: ['dim', '❌ Cancelado'],
                    };
                    const [cls, label] = stateLabels[s.estado] || ['dim', s.estado];
                    const phone = (s.phone || '').replace('+51', '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
                    
                    return (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 py-2.5 border-b border-border-light/40 last:border-0"
                      >
                        <div className="w-9 h-9 rounded-full bg-gray-100 border border-border-light flex items-center justify-center text-sm flex-shrink-0">
                          👤
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-text-main truncate">{s.partner_nombre || 'Buscando cliente...'}</div>
                          <div className="text-[10px] text-text-muted font-medium">📱 {phone} · {timeAgo(s.updated_at)}</div>
                        </div>
                        <span className={`text-[9px] px-2 py-1 rounded-md uppercase tracking-wider font-bold border ${
                          cls === 'green' ? 'bg-odoo-green/10 text-odoo-green border-odoo-green/20' :
                          cls === 'amber' ? 'bg-odoo-amber/10 text-odoo-amber border-odoo-amber/20' :
                          cls === 'blue' ? 'bg-odoo-blue/10 text-odoo-blue border-odoo-blue/20' :
                          'bg-gray-100 text-text-muted border-border-light'
                        }`}>
                          {label}
                        </span>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Order Queue */}
            <section className="md:col-span-2 bg-white border border-border-light rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Cola de Pedidos</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  data.queue.filter(q => ['pending', 'error'].includes(q.estado)).length > 0
                    ? 'bg-odoo-amber/10 text-odoo-amber border-odoo-amber/20'
                    : 'bg-odoo-green/10 text-odoo-green border-odoo-green/20'
                }`}>
                  {data.queue.filter(q => ['pending', 'error'].includes(q.estado)).length} PENDIENTES
                </span>
              </div>
              
              <div className="space-y-1">
                {data.queue.length === 0 ? (
                  <div className="py-8 text-center text-text-muted">
                    <div className="text-2xl opacity-40 mb-2">📦</div>
                    No hay pedidos en cola
                  </div>
                ) : (
                  data.queue.map((p, i) => {
                    const stateMap: Record<string, 'ok' | 'pending' | 'error' | 'dim'> = { 
                      confirmed: 'ok', 
                      pending: 'pending', 
                      error: 'error', 
                      processing: 'pending', 
                      cancelled: 'dim' 
                    };
                    return (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 py-2.5 border-b border-border-light/40 last:border-0"
                      >
                        <span className="text-odoo-purple font-bold text-[11px] w-16 flex-shrink-0">{p.odoo_order_ref || '#—'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-text-main truncate">{p.partner_nombre}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <StatusPill status={stateMap[p.estado] || 'dim'} text={p.estado} />
                            <span className="text-[10px] text-text-muted font-semibold">· {timeAgo(p.created_at)} atrás</span>
                          </div>
                        </div>
                        <span className="text-odoo-green font-bold text-xs whitespace-nowrap">S/ {parseFloat(p.total as any || 0).toFixed(2)}</span>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Sellers */}
            <section className="bg-white border border-border-light rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Vendedores</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-text-muted border border-border-light">
                  {data.vendedores.length}
                </span>
              </div>
              
              <div className="space-y-3">
                {data.vendedores.length === 0 ? (
                  <div className="py-8 text-center text-text-muted">
                    <div className="text-2xl opacity-40 mb-2">👤</div>
                    Sin vendedores
                  </div>
                ) : (
                  data.vendedores.map((v, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-center gap-3 py-2.5 border-b border-border-light/40 last:border-0"
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-100 border border-border-light flex items-center justify-center text-sm flex-shrink-0">
                        {v.activo ? '🟢' : '⚫'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-text-main truncate">{v.nombre}</div>
                        <div className="text-[10px] text-text-muted font-medium truncate">📱 {(v.whatsapp_phone || '').replace('+51', '+51 ')}</div>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold border ${v.activo ? 'bg-odoo-green/10 text-odoo-green border-odoo-green/20' : 'bg-gray-100 text-text-muted border-border-light'}`}>
                        {v.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </motion.div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : activeTab === 'flujo' ? (
          <div className="max-w-5xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-text-main font-display">Experiencia del Vendedor en Campo</h2>
              <p className="text-text-muted">Flujo conversacional WhatsApp ↔ Odoo</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Steps List */}
              <div className="space-y-8">
                {[
                  {
                    step: 1,
                    title: "Inicio y Autenticación",
                    desc: "El vendedor inicia la conversación. El sistema valida su número contra la base de datos de Odoo/Supabase.",
                    msg: "Hola Juan, bienvenido al sistema de pedidos. ¿A qué cliente visitaremos hoy?"
                  },
                  {
                    step: 2,
                    title: "Selección de Cliente",
                    desc: "Búsqueda difusa de clientes. El vendedor puede escribir parte del nombre o RUC.",
                    msg: "He encontrado: *Bodega Los Andes*. ¿Es correcto?"
                  },
                  {
                    step: 3,
                    title: "Carga de Productos",
                    desc: "El vendedor agrega productos por nombre y cantidad. El sistema valida stock en tiempo real.",
                    msg: "✅ Agregado: 5x Arroz Extra (S/ 12.50 c/u). Stock actual: 450 unidades."
                  },
                  {
                    step: 4,
                    title: "Revisión de Carrito",
                    desc: "Resumen detallado antes de confirmar. Incluye impuestos y descuentos aplicados.",
                    msg: "📝 *Resumen de Pedido*\n- 5x Arroz Extra\n- 2x Aceite Primor\nTotal: *S/ 85.00*"
                  },
                  {
                    step: 5,
                    title: "Confirmación y Odoo",
                    desc: "Se crea el pedido oficial en Odoo. Se libera el stock y se genera la orden de venta.",
                    msg: "🚀 *¡Pedido Confirmado!*\nOrden Odoo: *S00042*\nSe ha enviado el resumen al cliente."
                  }
                ].map((s) => (
                  <div key={s.step} className="flex gap-4 group">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-odoo-purple/10 border border-odoo-purple/20 flex items-center justify-center text-odoo-purple font-bold text-sm transition-colors group-hover:bg-odoo-purple group-hover:text-white">
                      {s.step}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-text-main mb-1">{s.title}</h4>
                      <p className="text-xs text-text-muted leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* WhatsApp Mockup */}
              <div className="relative">
                <div className="sticky top-24 bg-white rounded-[40px] border-[8px] border-gray-900 shadow-2xl overflow-hidden w-[320px] mx-auto aspect-[9/19]">
                  {/* Phone Header */}
                  <div className="bg-[#075e54] p-4 pt-8 text-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs">🤖</div>
                    <div>
                      <div className="text-[11px] font-bold">GaorSystem Bot</div>
                      <div className="text-[9px] opacity-70">En línea</div>
                    </div>
                  </div>
                  {/* Chat Area */}
                  <div className="p-4 space-y-4 bg-[#e5ddd5] h-full overflow-y-auto custom-scrollbar pb-20">
                    <div className="bg-white p-2 rounded-lg rounded-tl-none shadow-sm max-w-[80%] text-[10px]">
                      Hola Juan, bienvenido. ¿A qué cliente visitaremos hoy?
                    </div>
                    <div className="bg-[#dcf8c6] p-2 rounded-lg rounded-tr-none shadow-sm max-w-[80%] ml-auto text-[10px]">
                      Bodega Los Andes
                    </div>
                    <div className="bg-white p-2 rounded-lg rounded-tl-none shadow-sm max-w-[80%] text-[10px]">
                      He encontrado: *Bodega Los Andes*. ¿Es correcto?
                    </div>
                    <div className="bg-[#dcf8c6] p-2 rounded-lg rounded-tr-none shadow-sm max-w-[80%] ml-auto text-[10px]">
                      si, agrega arroz 5
                    </div>
                    <div className="bg-white p-2 rounded-lg rounded-tl-none shadow-sm max-w-[80%] text-[10px]">
                      ✅ Agregado: 5x Arroz Extra (S/ 12.50 c/u).
                    </div>
                    <div className="bg-[#dcf8c6] p-2 rounded-lg rounded-tr-none shadow-sm max-w-[80%] ml-auto text-[10px]">
                      confirmar
                    </div>
                    <div className="bg-white p-2 rounded-lg rounded-tl-none shadow-sm max-w-[80%] text-[10px]">
                      🚀 *¡Pedido Confirmado!*\nOrden Odoo: *S00042*
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'explorer' ? (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-text-main font-display">Explorador de Datos Odoo</h2>
                <p className="text-sm text-text-muted">Visualización en tiempo real de los datos sincronizados</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsOrderModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-odoo-green text-white rounded-lg text-sm font-bold hover:bg-odoo-green-dark transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Crear Pedido
                </button>
                <button 
                  onClick={loadExplorerData}
                  disabled={isExplorerLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-odoo-purple text-white rounded-lg text-sm font-bold hover:bg-odoo-purple-dark transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isExplorerLoading ? 'animate-spin' : ''}`} />
                  Sincronizar Ahora
                </button>
              </div>
            </div>

            {/* Company Tabs */}
            {explorerCompanies.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {explorerCompanies.map(company => (
                  <button
                    key={company.id}
                    onClick={() => setActiveExplorerCompanyId(company.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                      activeExplorerCompanyId === company.id
                        ? 'bg-odoo-purple text-white border-odoo-purple shadow-lg shadow-odoo-purple/20'
                        : 'bg-white text-text-muted border-border-light hover:border-odoo-purple/30'
                    }`}
                  >
                    {company.name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Products List */}
              <div className="bg-white border border-border-light rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border-light bg-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                    <Package className="w-4 h-4 text-odoo-purple" />
                    Productos ({activeExplorerCompanyId ? (explorerData[activeExplorerCompanyId]?.products.length || 0) : 0})
                  </h3>
                </div>
                <div className="overflow-y-auto max-h-[500px] custom-scrollbar">
                  {isExplorerLoading && (!activeExplorerCompanyId || !explorerData[activeExplorerCompanyId]) ? (
                    <div className="p-12 text-center text-text-muted">Cargando productos...</div>
                  ) : !activeExplorerCompanyId || !explorerData[activeExplorerCompanyId] || explorerData[activeExplorerCompanyId].products.length === 0 ? (
                    <div className="p-12 text-center text-text-muted">No se encontraron productos</div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-white border-b border-border-light shadow-sm">
                        <tr>
                          <th className="px-4 py-3 font-bold text-text-muted uppercase tracking-wider">Código</th>
                          <th className="px-4 py-3 font-bold text-text-muted uppercase tracking-wider">Nombre</th>
                          <th className="px-4 py-3 font-bold text-text-muted uppercase tracking-wider text-right">Precio</th>
                          <th className="px-4 py-3 font-bold text-text-muted uppercase tracking-wider text-right">Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light/40">
                        {explorerData[activeExplorerCompanyId].products.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-odoo-purple">{p.default_code || '—'}</td>
                            <td className="px-4 py-3 font-bold text-text-main">{p.name}</td>
                            <td className="px-4 py-3 text-right font-semibold">S/ {p.list_price?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`px-2 py-0.5 rounded-full font-bold ${p.qty_available > 0 ? 'bg-odoo-green/10 text-odoo-green' : 'bg-odoo-red/10 text-odoo-red'}`}>
                                {p.qty_available || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Partners List */}
              <div className="bg-white border border-border-light rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border-light bg-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                    <Users className="w-4 h-4 text-odoo-purple" />
                    Clientes ({activeExplorerCompanyId ? (explorerData[activeExplorerCompanyId]?.partners.length || 0) : 0})
                  </h3>
                </div>
                <div className="overflow-y-auto max-h-[500px] custom-scrollbar">
                  {isExplorerLoading && (!activeExplorerCompanyId || !explorerData[activeExplorerCompanyId]) ? (
                    <div className="p-12 text-center text-text-muted">Cargando clientes...</div>
                  ) : !activeExplorerCompanyId || !explorerData[activeExplorerCompanyId] || explorerData[activeExplorerCompanyId].partners.length === 0 ? (
                    <div className="p-12 text-center text-text-muted">No se encontraron clientes</div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-white border-b border-border-light shadow-sm">
                        <tr>
                          <th className="px-4 py-3 font-bold text-text-muted uppercase tracking-wider">Nombre</th>
                          <th className="px-4 py-3 font-bold text-text-muted uppercase tracking-wider">Contacto</th>
                          <th className="px-4 py-3 font-bold text-text-muted uppercase tracking-wider">Ciudad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-light/40">
                        {explorerData[activeExplorerCompanyId].partners.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-bold text-text-main">{p.name}</div>
                              <div className="text-[10px] text-text-muted flex items-center gap-2">
                                {p.email && <span>{p.email}</span>}
                                {p.vat && <span className="bg-gray-100 px-1 rounded font-mono text-[9px]">DNI: {p.vat}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-text-muted font-medium">
                              <div className="flex flex-col">
                                <span>{p.phone || '—'}</span>
                                {p.mobile && <span className="text-[10px] opacity-70">{p.mobile}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-text-muted uppercase font-bold">
                              <div className="flex flex-col">
                                <span>{p.city || '—'}</span>
                                {p.street && <span className="text-[9px] normal-case opacity-70 truncate max-w-[150px]">{p.street}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button 
                                onClick={() => {
                                  setEditingPartner(p);
                                  setIsEditPartnerModalOpen(true);
                                }}
                                className="p-2 text-odoo-purple hover:bg-odoo-purple/10 rounded-lg transition-all"
                                title="Editar Cliente"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto bg-white border border-border-light rounded-lg shadow-sm overflow-hidden">
            <div className="bg-gray-50 border-b border-border-light p-6">
              <h2 className="text-xl font-bold text-odoo-purple mb-2 font-display">Guía de Instalación: Pedidos WhatsApp ↔ Odoo 17</h2>
              <p className="text-sm text-text-muted">Sigue estos pasos para desplegar la solución completa utilizando n8n, Evolution API y Supabase.</p>
            </div>
            
            <div className="p-8 space-y-8">
              {/* Step 1 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2 font-display">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">1</span>
                  Configuración de Supabase
                </h3>
                <div className="space-y-4 ml-8">
                  <p className="text-sm text-text-muted">Ejecuta el siguiente SQL en el Editor de Supabase para crear las tablas y funciones necesarias:</p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-[11px] text-gray-300 font-mono">
{`-- ============================================================
-- SCHEMA: Sistema de Pedidos WhatsApp ↔ Odoo 17
-- Hub de datos en Supabase
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- búsqueda fuzzy de productos

-- 1. CONFIGURACIÓN DE COMPAÑÍAS ODOO
CREATE TABLE odoo_companies (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    odoo_url        TEXT NOT NULL,
    odoo_db         TEXT NOT NULL,
    odoo_user       TEXT NOT NULL,
    odoo_password   TEXT NOT NULL,
    odoo_uid        INTEGER,
    active          BOOLEAN DEFAULT TRUE,
    last_auth_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. VENDEDORES (mapping Odoo ↔ WhatsApp)
CREATE TABLE vendedores (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      INTEGER REFERENCES odoo_companies(company_id),
    odoo_user_id    INTEGER NOT NULL,
    nombre          TEXT NOT NULL,
    whatsapp_phone  TEXT NOT NULL UNIQUE,
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRODUCTOS (cache sincronizado desde Odoo)
CREATE TABLE odoo_products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      INTEGER REFERENCES odoo_companies(company_id),
    odoo_product_id INTEGER NOT NULL,
    odoo_tmpl_id    INTEGER,
    codigo          TEXT,
    nombre          TEXT NOT NULL,
    nombre_search   TSVECTOR,
    descripcion     TEXT,
    uom             TEXT DEFAULT 'unid',
    precio_base     NUMERIC(12,2) DEFAULT 0,
    activo          BOOLEAN DEFAULT TRUE,
    stock           NUMERIC(10,2) DEFAULT 0,
    categoria       TEXT,
    last_sync_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, odoo_product_id)
);

CREATE INDEX idx_products_nombre_trgm ON odoo_products USING gin(nombre gin_trgm_ops);

-- Trigger para búsqueda full-text
CREATE OR REPLACE FUNCTION update_product_search() RETURNS TRIGGER AS $$
BEGIN
    NEW.nombre_search := to_tsvector('spanish', COALESCE(NEW.nombre, '') || ' ' || COALESCE(NEW.codigo, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_search BEFORE INSERT OR UPDATE ON odoo_products
    FOR EACH ROW EXECUTE FUNCTION update_product_search();

-- 4. LISTAS DE PRECIOS
CREATE TABLE odoo_pricelists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      INTEGER REFERENCES odoo_companies(company_id),
    pricelist_id    INTEGER NOT NULL,
    nombre          TEXT NOT NULL,
    currency        TEXT DEFAULT 'PEN',
    UNIQUE(company_id, pricelist_id)
);

-- 5. CLIENTES
CREATE TABLE odoo_partners (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      INTEGER REFERENCES odoo_companies(company_id),
    odoo_partner_id INTEGER NOT NULL,
    nombre          TEXT NOT NULL,
    ruc_dni         TEXT,
    telefono        TEXT,
    pricelist_id    INTEGER,
    vendedor_id     UUID REFERENCES vendedores(id),
    activo          BOOLEAN DEFAULT TRUE,
    last_sync_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, odoo_partner_id)
);

CREATE INDEX idx_partners_nombre ON odoo_partners USING gin(nombre gin_trgm_ops);

-- 6. SESIONES WHATSAPP
CREATE TYPE session_estado AS ENUM ('idle', 'seleccionando_cliente', 'confirmando_cliente', 'agregando_productos', 'confirmando_pedido', 'completado');
CREATE TABLE whatsapp_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone           TEXT NOT NULL UNIQUE,
    vendedor_id     UUID REFERENCES vendedores(id),
    company_id      INTEGER REFERENCES odoo_companies(company_id),
    estado          session_estado DEFAULT 'idle',
    partner_id      INTEGER,
    partner_nombre  TEXT,
    pricelist_id    INTEGER,
    search_results  JSONB DEFAULT '[]',
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 hours'
);

-- 7. ITEMS DE SESIÓN
CREATE TABLE session_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
    odoo_product_id INTEGER NOT NULL,
    nombre          TEXT NOT NULL,
    cantidad        NUMERIC(10,2) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12,2) NOT NULL,
    subtotal        NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- 8. COLA DE PEDIDOS
CREATE TYPE pedido_estado AS ENUM ('pending', 'processing', 'confirmed', 'error');
CREATE TABLE pedidos_queue (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      INTEGER REFERENCES odoo_companies(company_id),
    vendedor_id     UUID REFERENCES vendedores(id),
    partner_id      INTEGER NOT NULL,
    partner_nombre  TEXT NOT NULL,
    items           JSONB NOT NULL DEFAULT '[]',
    total           NUMERIC(12,2),
    estado          pedido_estado DEFAULT 'pending',
    odoo_order_id   INTEGER,
    error_log       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 9. FUNCIONES DE BÚSQUEDA
CREATE OR REPLACE FUNCTION buscar_productos(p_company_id INTEGER, p_query TEXT)
RETURNS TABLE (odoo_product_id INTEGER, codigo TEXT, nombre TEXT, precio_base NUMERIC, rank REAL) AS $$
BEGIN
    RETURN QUERY
    SELECT p.odoo_product_id, p.codigo, p.nombre, p.precio_base, similarity(p.nombre, p_query) AS rank
    FROM odoo_products p
    WHERE p.company_id = p_company_id AND p.activo = TRUE
      AND (p.nombre ILIKE '%'||p_query||'%' OR p.codigo ILIKE '%'||p_query||'%' OR similarity(p.nombre, p_query) > 0.2)
    ORDER BY rank DESC LIMIT 10;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION buscar_partners(p_company_id INTEGER, p_query TEXT)
RETURNS TABLE (odoo_partner_id INTEGER, nombre TEXT, ruc_dni TEXT, pricelist_id INTEGER, rank REAL) AS $$
BEGIN
    RETURN QUERY
    SELECT p.odoo_partner_id, p.nombre, p.ruc_dni, p.pricelist_id, similarity(p.nombre, p_query) AS rank
    FROM odoo_partners p
    WHERE p.company_id = p_company_id AND p.activo = TRUE
      AND (p.nombre ILIKE '%'||p_query||'%' OR p.ruc_dni ILIKE '%'||p_query||'%' OR similarity(p.nombre, p_query) > 0.2)
    ORDER BY rank DESC LIMIT 8;
END;
$$ LANGUAGE plpgsql;`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Step 2 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2 font-display">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">2</span>
                  Variables de Entorno en n8n
                </h3>
                <div className="ml-8">
                  <p className="text-sm text-text-muted mb-4">Agrega las siguientes variables en <strong>Settings → Environment Variables</strong>:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      ['SUPABASE_URL', 'https://xxxxx.supabase.co'],
                      ['SUPABASE_SERVICE_KEY', 'eyJ... (service_role key)'],
                      ['EVOLUTION_API_URL', 'https://tu-evolution.com'],
                      ['EVOLUTION_API_KEY', 'tu_api_key'],
                      ['EVOLUTION_INSTANCE_NAME', 'nombre_instancia'],
                      ['SUBWORKFLOW_ODOO_CONNECTOR_ID', '(ID del subworkflow)']
                    ].map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-border-light">
                        <code className="text-[11px] font-bold text-odoo-purple">{key}</code>
                        <code className="text-[11px] text-text-muted">{val}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Step 3 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2 font-display">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">3</span>
                  Odoo XML-RPC Connector (Node.js)
                </h3>
                <div className="ml-8 space-y-4">
                  <p className="text-sm text-text-muted">Este módulo robusto maneja la comunicación XML-RPC con Odoo, incluyendo pool de conexiones y heartbeat:</p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[400px] custom-scrollbar">
                    <pre className="text-[11px] text-gray-300 font-mono">
{`// odoo_connector.js
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';

// Características:
// - Pool de conexiones por compañía
// - Heartbeat activo cada 60s
// - Retry con backoff exponencial
// - Filtro automático por compañía

export class OdooConnection extends EventEmitter {
  constructor(cfg) {
    super();
    this.cfg = { heartbeatMs: 60000, timeoutMs: 30000, ...cfg };
    this.authenticated = false;
    // ... (ver archivo completo en la raíz)
  }

  async authenticate() { /* ... */ }
  async execute(model, method, args = [], kwargs = {}) { /* ... */ }
  
  // Shortcuts
  searchRead(model, domain = [], fields = []) { /* ... */ }
  create(model, values) { /* ... */ }
  write(model, ids, values) { /* ... */ }
}`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Step 4 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2 font-display">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">4</span>
                  Conexión Directa Odoo 17 (Backend)
                </h3>
                <div className="ml-8 space-y-4">
                  <p className="text-sm text-text-muted">Puedes configurar la conexión directa con Odoo usando el botón de <strong>Configuración</strong> (icono de engranaje) en la barra superior. El sistema te permitirá:</p>
                  <ul className="list-disc list-inside text-sm text-text-muted space-y-1 ml-2">
                    <li>Validar tus credenciales en tiempo real.</li>
                    <li>Listar y seleccionar la compañía específica de tu base de datos.</li>
                    <li>Activar el monitoreo en vivo de tus ventas reales.</li>
                  </ul>
                  <div className="p-4 bg-odoo-purple/5 border border-odoo-purple/10 rounded-lg">
                    <p className="text-[11px] text-text-muted">También puedes pre-configurar estas variables en tu servidor:</p>
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {[
                        ['ODOO_URL', 'https://tu-odoo.com'],
                        ['ODOO_DB', 'nombre_base_datos'],
                        ['ODOO_USERNAME', 'usuario@empresa.com'],
                        ['ODOO_PASSWORD', 'tu_api_key_o_password'],
                        ['ODOO_COMPANY_ID', '1']
                      ].map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between p-2 bg-white rounded border border-border-light">
                          <code className="text-[11px] font-bold text-odoo-purple">{key}</code>
                          <code className="text-[11px] text-text-muted">{val}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Step 5 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">5</span>
                  Ejemplos de Uso (odoo_connector.js)
                </h3>
                <div className="ml-8 space-y-4">
                  <p className="text-sm text-text-muted">Ejemplos prácticos para integrar el conector en tus scripts o nodos de n8n:</p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[400px] custom-scrollbar">
                    <pre className="text-[11px] text-gray-300 font-mono">
{`// 1. Uso Básico
const odoo = await getConnection(config);
const productos = await odoo.searchRead('product.product', [['active','=',true]], ['name','list_price']);

// 2. Crear Pedido
const orderId = await odoo.create('sale.order', {
  partner_id: 42,
  order_line: [[0, 0, { product_id: 10, product_uom_qty: 1 }]]
});

// 3. Eventos
odoo.on('heartbeat', ({ ok }) => console.log(ok ? '💓 OK' : '💔 Error'));`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Step 6 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">6</span>
                  Subworkflow de n8n (Odoo Connector)
                </h3>
                <div className="ml-8 space-y-4">
                  <p className="text-sm text-text-muted">
                    Copia este JSON e impórtalo en n8n como un nuevo workflow. Este subworkflow maneja la autenticación XML-RPC y las llamadas a Odoo de forma centralizada con reintentos y caché.
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[400px] custom-scrollbar">
                    <pre className="text-[11px] text-gray-300 font-mono">
{`{
  "name": "SUB - Odoo XML-RPC Connector",
  "nodes": [
    {
      "parameters": {},
      "id": "start",
      "name": "Start",
      "type": "n8n-nodes-base.executeWorkflowTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "jsCode": "// ============================================================\\n// ODOO XML-RPC CONNECTOR - Subworkflow Reutilizable\\n// Input esperado desde el workflow padre:\\n//   - company_id    : integer (ID de la compañía en Odoo)\\n//   - model         : string  ej: 'product.product'\\n//   - method        : string  ej: 'search_read'\\n//   - args          : array   ej: [[[['active','=',true]]]]\\n//   - kwargs        : object  ej: {fields: ['id','name'], limit: 100}\\n// ============================================================\\n\\nconst input = $input.first().json;\\n\\n// Validar inputs requeridos\\nif (!input.company_id) throw new Error('company_id requerido');\\nif (!input.model)      throw new Error('model requerido');\\nif (!input.method)     throw new Error('method requerido');\\n\\nconst company_id = input.company_id;\\nconst model      = input.model;\\nconst method     = input.method;\\nconst args       = input.args   || [];\\nconst kwargs     = input.kwargs || {};\\n\\n// Siempre inyectar allowed_company_ids en el contexto\\nif (!kwargs.context) kwargs.context = {};\\nkwargs.context.allowed_company_ids = [company_id];\\nkwargs.context.company_id          = company_id;\\n\\nreturn [{\\n  json: {\\n    company_id,\\n    model,\\n    method,\\n    args,\\n    kwargs,\\n    _step: 'prepared'\\n  }\\n}];"
      },
      "id": "prepare_input",
      "name": "Preparar Input",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [440, 300]
    },
    {
      "parameters": {
        "jsCode": "// Obtener credenciales de la compañía desde Supabase\\n// Usa las variables de entorno de n8n para la conexión a Supabase\\n\\nconst SUPABASE_URL = $env.SUPABASE_URL;\\nconst SUPABASE_KEY = $env.SUPABASE_SERVICE_KEY;\\n\\nconst data = $input.first().json;\\nconst company_id = data.company_id;\\n\\nconst response = await fetch(\\n  \`\${SUPABASE_URL}/rest/v1/odoo_companies?company_id=eq.\${company_id}&select=*\`,\\n  {\\n    headers: {\\n      'apikey': SUPABASE_KEY,\\n      'Authorization': \`Bearer \${SUPABASE_KEY}\`,\\n      'Content-Type': 'application/json'\\n    }\\n  }\\n);\\n\\nif (!response.ok) {\\n  throw new Error(\`Error fetching company: \${response.status}\`);\\n}\\n\\nconst companies = await response.json();\\nif (!companies.length) {\\n  throw new Error(\`Compañía \${company_id} no encontrada en Supabase\`);\\n}\\n\\nconst company = companies[0];\\n\\nreturn [{\\n  json: {\\n    ...data,\\n    company: company,\\n    odoo_url:      company.odoo_url,\\n    odoo_db:       company.odoo_db,\\n    odoo_user:     company.odoo_user,\\n    odoo_password: company.odoo_password,\\n    odoo_uid:      company.odoo_uid,\\n    _step: 'credentials_loaded'\\n  }\\n}];"
      },
      "id": "get_credentials",
      "name": "Obtener Credenciales",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [640, 300]
    },
    {
      "parameters": {
        "jsCode": "// ============================================================\\n// AUTENTICACIÓN ODOO XML-RPC\\n// Reutiliza uid cacheado o autentica si es la primera vez\\n// ============================================================\\n\\nconst data = $input.first().json;\\n\\n// Si ya tenemos uid cacheado, saltamos la auth\\nif (data.odoo_uid && data.odoo_uid > 0) {\\n  return [{\\n    json: {\\n      ...data,\\n      uid: data.odoo_uid,\\n      _step: 'auth_skipped_cached'\\n    }\\n  }];\\n}\\n\\n// Construir XML-RPC para autenticar\\nconst xmlBody = \`<?xml version=\\\"1.0\\\"?>\\n<methodCall>\\n  <methodName>authenticate</methodName>\\n  <params>\\n    <param><value><string>\${data.odoo_db}</string></value></param>\\n    <param><value><string>\${data.odoo_user}</string></value></param>\\n    <param><value><string>\${data.odoo_password}</string></value></param>\\n    <param><value><struct></struct></value></param>\\n  </params>\\n</methodCall>\`;\\n\\nconst SUPABASE_URL = $env.SUPABASE_URL;\\nconst SUPABASE_KEY = $env.SUPABASE_SERVICE_KEY;\\n\\n// Intentar autenticación con retry\\nlet uid = null;\\nlet lastError = null;\\n\\nfor (let attempt = 1; attempt <= 3; attempt++) {\\n  try {\\n    const res = await fetch(\`\${data.odoo_url}/xmlrpc/2/common\`, {\\n      method: 'POST',\\n      headers: { 'Content-Type': 'text/xml; charset=utf-8' },\\n      body: xmlBody,\\n      signal: AbortSignal.timeout(15000) // 15s timeout\\n    });\\n\\n    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);\\n\\n    const xmlText = await res.text();\\n    \\n    // Extraer UID del XML response\\n    const match = xmlText.match(/<value><int>(\\\\d+)<\\\\/int><\\\\/value>/);\\n    if (!match) throw new Error('Auth fallida: respuesta XML inválida o credenciales incorrectas');\\n    \\n    uid = parseInt(match[1]);\\n    if (uid === 0) throw new Error('Auth fallida: usuario/contraseña incorrectos');\\n    \\n    break; // éxito, salir del loop\\n    \\n  } catch (err) {\\n    lastError = err.message;\\n    if (attempt < 3) {\\n      // Backoff exponencial: 1s, 2s\\n      await new Promise(r => setTimeout(r, attempt * 1000));\\n    }\\n  }\\n}\\n\\nif (!uid) throw new Error(\`Auth Odoo fallida después de 3 intentos: \${lastError}\`);\\n\\n// Cachear uid en Supabase para próximas llamadas\\nawait fetch(\\n  \`\${SUPABASE_URL}/rest/v1/odoo_companies?company_id=eq.\${data.company_id}\`,\\n  {\\n    method: 'PATCH',\\n    headers: {\\n      'apikey': SUPABASE_KEY,\\n      'Authorization': \`Bearer \${SUPABASE_KEY}\`,\\n      'Content-Type': 'application/json',\\n      'Prefer': 'return=minimal'\\n    },\\n    body: JSON.stringify({\\n      odoo_uid: uid,\\n      last_auth_at: new Date().toISOString()\\n    })\\n  }\\n);\\n\\nreturn [{\\n  json: {\\n    ...data,\\n    uid,\\n    _step: 'auth_fresh'\\n  }\\n}];"
      },
      "id": "authenticate",
      "name": "Autenticar en Odoo",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [840, 300]
    },
    {
      "parameters": {
        "jsCode": "// ============================================================\\n// EJECUTAR LLAMADA XML-RPC A ODOO\\n// Con retry + backoff exponencial\\n// ============================================================\\n\\nconst data = $input.first().json;\\n\\n// Función para serializar un valor JavaScript a XML-RPC\\nfunction toXmlRpc(value) {\\n  if (value === null || value === undefined) {\\n    return '<value><boolean>0</boolean></value>';\\n  }\\n  if (typeof value === 'boolean') {\\n    return \`<value><boolean>\${value ? 1 : 0}</boolean></value>\`;\\n  }\\n  if (typeof value === 'number') {\\n    if (Number.isInteger(value)) {\\n      return \`<value><int>\${value}</int></value>\`;\\n    }\\n    return \`<value><double>\${value}</double></value>\`;\\n  }\\n  if (typeof value === 'string') {\\n    const escaped = value\\n      .replace(/&/g, '&amp;')\\n      .replace(/</g, '&lt;')\\n      .replace(/>/g, '&gt;')\\n      .replace(/\\\"/g, '&quot;');\\n    return \`<value><string>\${escaped}</string></value>\`;\\n  }\\n  if (Array.isArray(value)) {\\n    const items = value.map(v => \`<data>\${toXmlRpc(v)}</data>\`).join('');\\n    return \`<value><array><data>\${value.map(toXmlRpc).join('')}</data></array></value>\`;\\n  }\\n  if (typeof value === 'object') {\\n    const members = Object.entries(value)\\n      .map(([k, v]) => \`<member><name>\${k}</name>\${toXmlRpc(v)}</member>\`)\\n      .join('');\\n    return \`<value><struct>\${members}</struct></value>\`;\\n  }\\n  return \`<value><string>\${String(value)}</string></value>\`;\\n}\\n\\n// Construir el XML-RPC body para execute_kw\\nconst argsXml = data.args.map(toXmlRpc).join('');\\nconst kwargsXml = toXmlRpc(data.kwargs);\\n\\nconst xmlBody = \`<?xml version=\\\"1.0\\\"?>\\n<methodCall>\\n  <methodName>execute_kw</methodName>\\n  <params>\\n    <param>\${toXmlRpc(data.odoo_db)}</param>\\n    <param>\${toXmlRpc(data.uid)}</param>\\n    <param>\${toXmlRpc(data.odoo_password)}</param>\\n    <param>\${toXmlRpc(data.model)}</param>\\n    <param>\${toXmlRpc(data.method)}</param>\\n    <param><value><array><data>\${argsXml}</data></array></value></param>\\n    <param>\${kwargsXml}</param>\\n  </params>\\n</methodCall>\`;\\n\\n// Ejecutar con retry + backoff exponencial\\nconst MAX_RETRIES = 4;\\nconst TIMEOUT_MS  = 30000;\\nlet lastError = null;\\n\\nfor (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {\\n  try {\\n    const res = await fetch(\`\${data.odoo_url}/xmlrpc/2/object\`, {\\n      method: 'POST',\\n      headers: { \\n        'Content-Type': 'text/xml; charset=utf-8',\\n        'Connection': 'keep-alive'\\n      },\\n      body: xmlBody,\\n      signal: AbortSignal.timeout(TIMEOUT_MS)\\n    });\\n\\n    if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`);\\n    \\n    const xmlText = await res.text();\\n    \\n    // Detectar fault de Odoo\\n    if (xmlText.includes('<fault>')) {\\n      const faultMatch = xmlText.match(/<name>faultString<\\\\/name>\\\\s*<value>(?:<string>)?([^<]+)/);\\n      const faultMsg = faultMatch ? faultMatch[1] : 'Fault desconocido';\\n      throw new Error(\`Odoo fault: \${faultMsg}\`);\\n    }\\n    \\n    return [{\\n      json: {\\n        success: true,\\n        company_id: data.company_id,\\n        model: data.model,\\n        method: data.method,\\n        xml_response: xmlText,\\n        attempt,\\n        _step: 'executed'\\n      }\\n    }];\\n    \\n  } catch (err) {\\n    lastError = err.message;\\n    if (attempt < MAX_RETRIES) {\\n      const delay = Math.pow(2, attempt - 1) * 1000;\\n      await new Promise(r => setTimeout(r, delay));\\n    }\\n  }\\n}\\n\\nthrow new Error(\`Odoo XML-RPC falló después de \${MAX_RETRIES} intentos. Último error: \${lastError}\`);"
      },
      "id": "execute_rpc",
      "name": "Ejecutar XML-RPC",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1040, 300]
    },
    {
      "parameters": {
        "jsCode": "// Parser XML-RPC robusto\\nfunction parseXmlRpcValue(xmlStr) {\\n  xmlStr = xmlStr.trim();\\n  function extractBetween(str, open, close, startIdx = 0) {\\n    const start = str.indexOf(open, startIdx);\\n    if (start === -1) return null;\\n    let depth = 1, i = start + open.length;\\n    while (i < str.length && depth > 0) {\\n      const nextOpen  = str.indexOf(open, i);\\n      const nextClose = str.indexOf(close, i);\\n      if (nextClose === -1) break;\\n      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; i = nextOpen + open.length; }\\n      else { depth--; i = nextClose + close.length; }\\n    }\\n    return depth === 0 ? str.substring(start + open.length, i - close.length) : null;\\n  }\\n\\n  function parseValue(content) {\\n    content = content.trim();\\n    if (!content) return null;\\n    if (!content.startsWith('<')) return content;\\n    let m = content.match(/^<(?:int|i4)>(.*?)<\\\\/(?:int|i4)>$/s);\\n    if (m) return parseInt(m[1]);\\n    m = content.match(/^<double>(.*?)<\\\\/double>$/s);\\n    if (m) return parseFloat(m[1]);\\n    m = content.match(/^<boolean>(.*?)<\\\\/boolean>$/s);\\n    if (m) return m[1].trim() === '1';\\n    m = content.match(/^<string>(.*)<\\\\/string>$/s);\\n    if (m) return m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'\\\"').replace(/&apos;/g,\\\"'\\\");\\n    if (content === '<nil/>' || content === '<nil></nil>') return null;\\n    if (content.startsWith('<array>')) {\\n      const dataContent = extractBetween(content, '<data>', '</data>');\\n      if (!dataContent) return [];\\n      const items = [];\\n      let pos = 0;\\n      while (pos < dataContent.length) {\\n        const valStart = dataContent.indexOf('<value>', pos);\\n        if (valStart === -1) break;\\n        const valContent = extractBetween(dataContent, '<value>', '</value>', valStart);\\n        if (valContent === null) break;\\n        items.push(parseValue(valContent.trim()));\\n        pos = dataContent.indexOf('</value>', valStart) + 8;\\n      }\\n      return items;\\n    }\\n    if (content.startsWith('<struct>')) {\\n      const obj = {};\\n      let pos = 0;\\n      while (pos < content.length) {\\n        const memberStart = content.indexOf('<member>', pos);\\n        if (memberStart === -1) break;\\n        const memberContent = extractBetween(content, '<member>', '</member>', memberStart);\\n        if (!memberContent) break;\\n        const nameMatch  = memberContent.match(/<name>(.*?)<\\\\/name>/);\\n        const valContent = extractBetween(memberContent, '<value>', '</value>');\\n        if (nameMatch && valContent !== null) {\\n          obj[nameMatch[1]] = parseValue(valContent.trim());\\n        }\\n        pos = content.indexOf('</member>', memberStart) + 9;\\n      }\\n      return obj;\\n    }\\n    if (content.startsWith('<value>')) {\\n      const inner = extractBetween(content, '<value>', '</value>');\\n      return inner ? parseValue(inner.trim()) : null;\\n    }\\n    return content;\\n  }\\n\\n  function extractBetweenSimple(str, open, close) {\\n    const start = str.indexOf(open);\\n    if (start === -1) return null;\\n    const end = str.lastIndexOf(close);\\n    if (end === -1) return null;\\n    return str.substring(start + open.length, end);\\n  }\\n  const paramContent = extractBetweenSimple(xmlStr, '<params>', '</params>');\\n  if (!paramContent) return null;\\n  const valueContent = extractBetween(paramContent, '<value>', '</value>');\\n  if (!valueContent) return null;\\n  return parseValue(valueContent.trim());\\n}\\n\\ntry {\\n  const result = parseXmlRpcValue(data.xml_response);\\n  return [{\\n    json: {\\n      success: true,\\n      company_id: data.company_id,\\n      model: data.model,\\n      method: data.method,\\n      result: result,\\n      count: Array.isArray(result) ? result.length : 1,\\n      attempt: data.attempt\\n    }\\n  }];\\n} catch (err) {\\n  throw new Error(\`Error parseando respuesta Odoo: \${err.message}\`);\\n}"
      },
      "id": "parse_response",
      "name": "Parsear Respuesta",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1240, 300]
    }
  ],
  "connections": {
    "Start": { "main": [[ { "node": "Preparar Input", "type": "main", "index": 0 } ]] },
    "Preparar Input": { "main": [[ { "node": "Obtener Credenciales", "type": "main", "index": 0 } ]] },
    "Obtener Credenciales": { "main": [[ { "node": "Autenticar en Odoo", "type": "main", "index": 0 } ]] },
    "Autenticar en Odoo": { "main": [[ { "node": "Ejecutar XML-RPC", "type": "main", "index": 0 } ]] },
    "Ejecutar XML-RPC": { "main": [[ { "node": "Parsear Respuesta", "type": "main", "index": 0 } ]] }
  },
  "settings": { "callerPolicy": "any", "timezone": "America/Lima" }
}`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Step 7 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">7</span>
                  Workflow de Sincronización (Odoo → Supabase)
                </h3>
                <div className="ml-8 space-y-4">
                  <p className="text-sm text-text-muted">
                    Este workflow se ejecuta cada 15 minutos para mantener actualizados los productos, clientes y listas de precios en Supabase.
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[400px] custom-scrollbar">
                    <pre className="text-[11px] text-gray-300 font-mono">
{`{
  "name": "SYNC - Odoo → Supabase (Productos + Clientes)",
  "nodes": [
    {
      "parameters": {
        "rule": { "interval": [{ "field": "minutes", "minutesInterval": 15 }] }
      },
      "id": "schedule",
      "name": "Cada 15 min",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [240, 400]
    },
    {
      "parameters": {
        "jsCode": "const SUPABASE_URL = $env.SUPABASE_URL;\\nconst SUPABASE_KEY = $env.SUPABASE_SERVICE_KEY;\\nconst res = await fetch(\`\${SUPABASE_URL}/rest/v1/odoo_companies?active=eq.true&select=*\`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': \`Bearer \${SUPABASE_KEY}\` } });\\nconst companies = await res.json();\\nreturn companies.map(c => ({ json: c }));"
      },
      "id": "get_companies",
      "name": "Obtener Compañías",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [440, 400]
    },
    {
      "parameters": {
        "workflowId": { "__rl": true, "value": "={{ $env.SUBWORKFLOW_ODOO_CONNECTOR_ID }}", "mode": "id" },
        "workflowInputs": {
          "mappingMode": "defineBelow",
          "value": {
            "company_id": "={{ $json.company_id }}",
            "model": "product.product",
            "method": "search_read",
            "args": "={{ [ [ ['active','=',true], ['sale_ok','=',true] ] ] }}",
            "kwargs": "={{ { fields: ['id','name','default_code','list_price','uom_id','categ_id','description_sale','qty_available','active'], limit: 2000, context: { lang: 'es_PE' } } }}"
          }
        }
      },
      "id": "sync_products_call",
      "name": "RPC: Leer Productos",
      "type": "n8n-nodes-base.executeWorkflow",
      "typeVersion": 1.1,
      "position": [640, 200]
    },
    {
      "parameters": {
        "jsCode": "const SUPABASE_URL = $env.SUPABASE_URL;\\nconst SUPABASE_KEY = $env.SUPABASE_SERVICE_KEY;\\nconst rpcResult = $input.first().json;\\nconst products = rpcResult.result || [];\\nif (!products.length) return [{ json: { synced: 0 } }];\\nconst records = products.map(p => ({ company_id: rpcResult.company_id, odoo_product_id: p.id, nombre: p.name, precio_base: p.list_price, stock: p.qty_available, last_sync_at: new Date().toISOString() }));\\nawait fetch(\`\${SUPABASE_URL}/rest/v1/odoo_products\`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': \`Bearer \${SUPABASE_KEY}\`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify(records) });\\nreturn [{ json: { synced: records.length } }];"
      },
      "id": "upsert_products",
      "name": "Upsert Productos",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [840, 200]
    }
  ],
  "connections": {
    "Cada 15 min": { "main": [[ { "node": "Obtener Compañías", "type": "main", "index": 0 } ]] },
    "Obtener Compañías": { "main": [[ { "node": "RPC: Leer Productos", "type": "main", "index": 0 } ]] },
    "RPC: Leer Productos": { "main": [[ { "node": "Upsert Productos", "type": "main", "index": 0 } ]] }
  }
}`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Step 8 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">8</span>
                  Workflow de WhatsApp (Pedidos)
                </h3>
                <div className="ml-8 space-y-4">
                  <p className="text-sm text-text-muted">
                    Este flujo maneja la lógica conversacional de WhatsApp, permitiendo a los vendedores buscar clientes, agregar productos y confirmar pedidos directamente en Odoo.
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[400px] custom-scrollbar">
                    <pre className="text-[11px] text-gray-300 font-mono">
{`{
  "name": "WHATSAPP - Flujo Pedidos Vendedores",
  "nodes": [
    {
      "parameters": { "httpMethod": "POST", "path": "whatsapp-pedidos", "responseMode": "responseNode" },
      "id": "webhook",
      "name": "Webhook Evolution API",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 400]
    },
    {
      "parameters": {
        "jsCode": "const body = $input.first().json.body || $input.first().json;\\nconst msg = body.data || body;\\nconst from = (msg.key?.remoteJid || msg.from || '').replace('@s.whatsapp.net', '');\\nconst text = (msg.message?.conversation || msg.body || '').trim();\\nreturn [{ json: { phone: from, text } }];"
      },
      "id": "normalize_msg",
      "name": "Normalizar Mensaje",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [440, 400]
    }
  ],
  "connections": {
    "Webhook Evolution API": { "main": [[ { "node": "Normalizar Mensaje", "type": "main", "index": 0 } ]] }
  }
}`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Step 9 */}
              <section>
                <h3 className="text-base font-bold text-text-main mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-odoo-purple text-white flex items-center justify-center text-xs">9</span>
                  Importar Workflows
                </h3>
                <div className="ml-8 space-y-3">
                  <p className="text-sm text-text-muted">Importa los archivos JSON en este orden:</p>
                  <ol className="list-decimal list-inside text-sm text-text-main space-y-2">
                    <li><strong>02_n8n_odoo_connector_subworkflow.json</strong>: El conector base XML-RPC.</li>
                    <li><strong>03_n8n_sync_workflow.json</strong>: Sincronización programada cada 15 min.</li>
                    <li><strong>04_n8n_whatsapp_flow.json</strong>: Lógica conversacional y creación de pedidos.</li>
                  </ol>
                </div>
              </section>

              {/* Step 10 */}
              <section className="bg-odoo-purple/5 p-6 rounded-lg border border-odoo-purple/10">
                <h3 className="text-sm font-bold text-odoo-purple uppercase tracking-wider mb-2">Comandos Disponibles (WhatsApp)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-bold text-text-main">hola</div>
                    <div className="text-[11px] text-text-muted">Inicia un nuevo pedido</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-main">ver pedido</div>
                    <div className="text-[11px] text-text-muted">Resumen del carrito actual</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-main">confirmar</div>
                    <div className="text-[11px] text-text-muted">Crea el pedido en Odoo</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-main">[nombre] [cantidad]</div>
                    <div className="text-[11px] text-text-muted">Busca y agrega productos</div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Config Modal */}
      <AnimatePresence mode="wait">
        {isModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              key="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-content"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white border border-border-light rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border-light flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-odoo-purple/10 flex items-center justify-center text-odoo-purple">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-text-main font-display">Configuración de Odoo</h2>
                    <p className="text-[11px] text-text-muted">Conecta OrderFlow con tu base de datos real</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <XCircle className="w-5 h-5 text-text-muted" />
                </button>
              </div>

              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">URL de Odoo</label>
                      <input 
                        type="text" 
                        placeholder="https://tu-empresa.odoo.com"
                        value={odooConfig.url}
                        onChange={e => handleConfigChange('url', e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Base de Datos</label>
                      <input 
                        type="text" 
                        placeholder="mi_base_de_datos"
                        value={odooConfig.db}
                        onChange={e => handleConfigChange('db', e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple outline-none transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Usuario / Email</label>
                        <input 
                          type="text" 
                          placeholder="admin@empresa.com"
                          value={odooConfig.username}
                          onChange={e => handleConfigChange('username', e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Password / API Key</label>
                        <input 
                          type="password" 
                          placeholder="••••••••"
                          value={odooConfig.password}
                          onChange={e => handleConfigChange('password', e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 focus:border-odoo-purple outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={discoverCompanies}
                    disabled={isDiscovering || !odooConfig.url || !odooConfig.db || !odooConfig.username || !odooConfig.password}
                    className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isDiscovering ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                    {isDiscovering ? 'Conectando...' : 'Verificar Conexión y Listar Compañías'}
                  </button>
                </div>

                {availableCompanies.length > 0 && (
                  <div className="mt-4 space-y-4">
                    <motion.div 
                      key="company-list"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-3 pt-4 border-t border-border-light"
                    >
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Seleccionar Compañías</label>
                      <div className="grid grid-cols-1 gap-2">
                        {availableCompanies.map(company => {
                          if (!company || !company.id) return null;
                          const isSelected = odooConfig.companyIds.includes(company.id);
                          return (
                            <button
                              key={company.id}
                              onClick={() => {
                                setOdooConfig(prev => {
                                  const newIds = isSelected 
                                    ? prev.companyIds.filter(id => id !== company.id)
                                    : [...prev.companyIds, company.id];
                                  return { ...prev, companyIds: newIds };
                                });
                              }}
                              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                                isSelected 
                                  ? 'bg-odoo-purple/5 border-odoo-purple ring-1 ring-odoo-purple' 
                                  : 'bg-white border-border-light hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                  isSelected ? 'bg-odoo-purple text-white' : 'bg-gray-100 text-text-muted'
                                }`}>
                                  {company.name ? company.name.charAt(0) : '?'}
                                </div>
                                <span className="text-sm font-semibold text-text-main text-left">{company.name || 'Sin nombre'}</span>
                              </div>
                              {isSelected && (
                                <CheckCircle2 className="w-5 h-5 text-odoo-purple flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>

                    <button 
                      onClick={checkAccess}
                      disabled={isCheckingAccess || odooConfig.companyIds.length === 0}
                      className="w-full py-2.5 bg-white border border-border-light text-text-main rounded-xl text-xs font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isCheckingAccess ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                      Verificar Permisos de Modelos
                    </button>

                    {accessResults && (
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(accessResults).map(([model, res]: [string, any]) => (
                          <div key={model} className={`p-2 rounded-lg border text-[10px] flex flex-col gap-1 ${res.access ? 'bg-odoo-green/5 border-odoo-green/20' : 'bg-odoo-red/5 border-odoo-red/20'}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-bold truncate">{model}</span>
                              {res.access ? <CheckCircle2 className="w-3 h-3 text-odoo-green" /> : <AlertTriangle className="w-3 h-3 text-odoo-red" />}
                            </div>
                            <span className="text-text-muted">
                              {res.access ? `${res.count} registros` : 'Sin acceso'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {configError && (
                  <div className="p-4 bg-odoo-red/10 border border-odoo-red/20 rounded-xl flex items-center gap-3 text-odoo-red text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{configError}</span>
                  </div>
                )}

                {configSuccess && (
                  <div className="p-4 bg-odoo-green/10 border border-odoo-green/20 rounded-xl flex items-center gap-3 text-odoo-green text-xs">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{configSuccess}</span>
                  </div>
                )}
              </div>

              <div className="p-6 bg-gray-50 border-t border-border-light flex gap-3">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-white border border-border-light text-text-main rounded-xl text-sm font-bold hover:bg-gray-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={saveOdooConfig}
                  disabled={odooConfig.companyIds.length === 0}
                  className="flex-1 py-3 bg-odoo-purple text-white rounded-xl text-sm font-bold hover:bg-odoo-purple-dark transition-all disabled:opacity-50 shadow-lg shadow-odoo-purple/20"
                >
                  Guardar y Conectar
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {isEditPartnerModalOpen && editingPartner && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border-light flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-odoo-purple/10 flex items-center justify-center text-odoo-purple">
                    <Edit2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-text-main font-display">Editar Cliente</h3>
                    <p className="text-xs text-text-muted">Actualiza la información en Odoo</p>
                  </div>
                </div>
                <button onClick={() => setIsEditPartnerModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <XCircle className="w-6 h-6 text-text-muted" />
                </button>
              </div>

              <form onSubmit={updatePartner} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Nombre / Razón Social</label>
                    <input 
                      type="text"
                      required
                      value={editingPartner.name}
                      onChange={(e) => setEditingPartner({...editingPartner, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">DNI / RUC</label>
                    <input 
                      type="text"
                      value={editingPartner.vat || ''}
                      onChange={(e) => setEditingPartner({...editingPartner, vat: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Email</label>
                    <input 
                      type="email"
                      value={editingPartner.email || ''}
                      onChange={(e) => setEditingPartner({...editingPartner, email: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Teléfono</label>
                    <input 
                      type="text"
                      value={editingPartner.phone || ''}
                      onChange={(e) => setEditingPartner({...editingPartner, phone: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Móvil</label>
                    <input 
                      type="text"
                      value={editingPartner.mobile || ''}
                      onChange={(e) => setEditingPartner({...editingPartner, mobile: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Dirección (Calle)</label>
                    <input 
                      type="text"
                      value={editingPartner.street || ''}
                      onChange={(e) => setEditingPartner({...editingPartner, street: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Ciudad / Distrito</label>
                    <input 
                      type="text"
                      value={editingPartner.city || ''}
                      onChange={(e) => setEditingPartner({...editingPartner, city: e.target.value})}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditPartnerModalOpen(false)}
                    className="flex-1 py-3 bg-white border border-border-light text-text-main rounded-xl text-sm font-bold hover:bg-gray-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isUpdatingPartner}
                    className="flex-1 py-3 bg-odoo-purple text-white rounded-xl text-sm font-bold hover:bg-odoo-purple-dark transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isUpdatingPartner ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isOrderModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-border-light flex items-center justify-between bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-odoo-green/10 flex items-center justify-center text-odoo-green">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-text-main font-display">Crear Nuevo Pedido</h3>
                    <p className="text-xs text-text-muted">Busca productos, verifica stock y precio</p>
                  </div>
                </div>
                <button onClick={() => setIsOrderModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <XCircle className="w-6 h-6 text-text-muted" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Partner Selection */}
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Cliente (Partner)</label>
                  
                  {newOrder.partner_id === 0 ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                        <input 
                          type="text"
                          placeholder="Buscar por DNI, Teléfono o Nombre..."
                          value={partnerSearchQuery}
                          onChange={(e) => setPartnerSearchQuery(e.target.value)}
                          className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                        />
                      </div>
                      
                      {partnerSearchQuery.length >= 2 && (
                        <div className="border border-border-light rounded-xl overflow-hidden bg-white shadow-sm max-h-48 overflow-y-auto custom-scrollbar">
                          {activeExplorerCompanyId && explorerData[activeExplorerCompanyId]?.partners
                            .filter(p => {
                              const query = partnerSearchQuery.toLowerCase();
                              const normalizedQuery = normalizePhone(query);
                              
                              const nameMatch = (p.name || '').toLowerCase().includes(query);
                              const vatMatch = (p.vat || '').toLowerCase().includes(query);
                              
                              // Búsqueda por teléfono normalizada (solo dígitos)
                              const phoneMatch = normalizedQuery && normalizePhone(p.phone || '').includes(normalizedQuery);
                              const mobileMatch = normalizedQuery && normalizePhone(p.mobile || '').includes(normalizedQuery);
                              
                              return nameMatch || vatMatch || phoneMatch || mobileMatch;
                            })
                            .slice(0, 10)
                            .map(p => (
                              <button
                                key={p.id}
                                onClick={() => {
                                  setNewOrder(prev => ({ ...prev, partner_id: p.id }));
                                  setPartnerSearchQuery('');
                                }}
                                className="w-full text-left p-3 hover:bg-gray-50 border-b border-border-light last:border-0 flex flex-col gap-0.5"
                              >
                                <div className="text-sm font-bold text-text-main">{p.name}</div>
                                <div className="flex items-center gap-3 text-[10px] text-text-muted">
                                  {p.vat && <span className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">DNI/RUC: {p.vat}</span>}
                                  {(p.phone || p.mobile) && <span>📞 {p.phone || p.mobile}</span>}
                                </div>
                              </button>
                            ))
                          }
                          {activeExplorerCompanyId && explorerData[activeExplorerCompanyId]?.partners
                            .filter(p => 
                              (p.name || '').toLowerCase().includes(partnerSearchQuery.toLowerCase()) || 
                              (p.vat || '').toLowerCase().includes(partnerSearchQuery.toLowerCase()) || 
                              (p.phone || '').toLowerCase().includes(partnerSearchQuery.toLowerCase()) ||
                              (p.mobile || '').toLowerCase().includes(partnerSearchQuery.toLowerCase())
                            ).length === 0 && (
                              <div className="p-4 text-center text-xs text-text-muted">No se encontraron clientes</div>
                            )
                          }
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-4 bg-odoo-purple/5 border border-odoo-purple/20 rounded-xl">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-text-main">
                          {activeExplorerCompanyId && explorerData[activeExplorerCompanyId]?.partners.find(p => p.id === newOrder.partner_id)?.name}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          {(() => {
                            const p = activeExplorerCompanyId ? explorerData[activeExplorerCompanyId]?.partners.find(p => p.id === newOrder.partner_id) : null;
                            return p ? `${p.vat ? `DNI: ${p.vat} | ` : ''}${p.phone || p.mobile || 'Sin teléfono'}` : '';
                          })()}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button 
                          onClick={() => {
                            const p = activeExplorerCompanyId ? explorerData[activeExplorerCompanyId]?.partners.find(p => p.id === newOrder.partner_id) : null;
                            if (p) {
                              setEditingPartner(p);
                              setIsEditPartnerModalOpen(true);
                            }
                          }}
                          className="text-xs font-bold text-odoo-purple hover:underline flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          Editar Cliente
                        </button>
                        <button 
                          onClick={() => setNewOrder(prev => ({ ...prev, partner_id: 0 }))}
                          className="text-[10px] font-medium text-text-muted hover:text-text-main hover:underline"
                        >
                          Cambiar Cliente
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Search Input */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input 
                      type="text"
                      placeholder="Buscar por nombre o código..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                  </div>
                </div>

                {/* Product Results */}
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Resultados de Búsqueda</label>
                  <div className="grid grid-cols-1 gap-3">
                    {activeExplorerCompanyId && explorerData[activeExplorerCompanyId]?.products
                      .filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.default_code || '').toLowerCase().includes(searchQuery.toLowerCase()))
                      .slice(0, 10)
                      .map(p => (
                      <div key={p.id} className="flex items-center justify-between p-4 border border-border-light rounded-xl hover:bg-gray-50 transition-all">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-bold text-text-main">{p.name}</span>
                          {p.default_code && <span className="text-[10px] text-text-muted font-mono bg-gray-100 px-2 py-0.5 rounded w-fit">{p.default_code}</span>}
                        </div>
                        <div className="flex items-center gap-6 text-right">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Stock</span>
                            <span className={`text-sm font-bold ${p.qty_available > 0 ? 'text-odoo-green' : 'text-odoo-red'}`}>
                              {p.qty_available}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Precio</span>
                            <span className="text-sm font-bold text-odoo-purple">
                              S/ {p.list_price?.toFixed(2)}
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              const existing = newOrder.lines.find(l => l.product_id === p.id);
                              if (existing) {
                                setNewOrder(prev => ({
                                  ...prev,
                                  lines: prev.lines.map(l => l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l)
                                }));
                              } else {
                                setNewOrder(prev => ({
                                  ...prev,
                                  lines: [...prev.lines, { product_id: p.id, qty: 1 }]
                                }));
                              }
                            }}
                            className="p-2 bg-odoo-purple/10 text-odoo-purple rounded-lg hover:bg-odoo-purple hover:text-white transition-all"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {activeExplorerCompanyId && explorerData[activeExplorerCompanyId]?.products.length > 0 && explorerData[activeExplorerCompanyId].products.filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.default_code || '').toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                      <div className="text-center py-8 text-text-muted text-sm">
                        No se encontraron productos que coincidan con "{searchQuery}"
                      </div>
                    )}
                    {(!activeExplorerCompanyId || !explorerData[activeExplorerCompanyId] || explorerData[activeExplorerCompanyId].products.length === 0) && (
                      <div className="text-center py-8 text-text-muted text-sm">
                        No hay productos cargados para esta compañía. Sincroniza los datos.
                      </div>
                    )}
                  </div>
                </div>

                {/* Order Lines */}
                {newOrder.lines.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-border-light">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Resumen del Pedido</label>
                    <div className="space-y-2">
                      {newOrder.lines.map((l, i) => {
                        const product = activeExplorerCompanyId ? explorerData[activeExplorerCompanyId]?.products.find(p => p.id === l.product_id) : null;
                        return (
                          <div key={i} className="flex items-center justify-between p-3 bg-odoo-purple/5 rounded-xl border border-odoo-purple/10">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 bg-white border border-border-light rounded-lg px-2 py-1">
                                <button 
                                  onClick={() => setNewOrder(prev => ({
                                    ...prev,
                                    lines: prev.lines.map((line, idx) => idx === i ? { ...line, qty: Math.max(1, line.qty - 1) } : line)
                                  }))}
                                  className="text-text-muted hover:text-odoo-purple"
                                >
                                  -
                                </button>
                                <span className="text-xs font-bold w-6 text-center">{l.qty}</span>
                                <button 
                                  onClick={() => setNewOrder(prev => ({
                                    ...prev,
                                    lines: prev.lines.map((line, idx) => idx === i ? { ...line, qty: line.qty + 1 } : line)
                                  }))}
                                  className="text-text-muted hover:text-odoo-purple"
                                >
                                  +
                                </button>
                              </div>
                              <span className="text-xs font-bold text-text-main">{product?.name}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-bold text-odoo-purple">
                                S/ {((product?.list_price || 0) * l.qty).toFixed(2)}
                              </span>
                              <button 
                                onClick={() => setNewOrder(prev => ({ ...prev, lines: prev.lines.filter((_, idx) => idx !== i) }))}
                                className="text-odoo-red hover:underline text-[10px] font-bold"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex justify-between items-center p-3 mt-2 bg-gray-50 rounded-xl border border-border-light">
                        <span className="text-xs font-bold text-text-muted uppercase">Total Estimado</span>
                        <span className="text-sm font-bold text-text-main">
                          S/ {newOrder.lines.reduce((total, l) => {
                            const product = activeExplorerCompanyId ? explorerData[activeExplorerCompanyId]?.products.find(p => p.id === l.product_id) : null;
                            return total + ((product?.list_price || 0) * l.qty);
                          }, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-gray-50 border-t border-border-light flex gap-3">
                <button 
                  onClick={() => setIsOrderModalOpen(false)}
                  className="flex-1 py-3 bg-white border border-border-light text-text-main rounded-xl text-sm font-bold hover:bg-gray-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={createOdooOrder}
                  disabled={isCreatingOrder || !newOrder.partner_id || newOrder.lines.length === 0}
                  className="flex-1 py-3 bg-odoo-green text-white rounded-xl text-sm font-bold hover:bg-odoo-green-dark transition-all disabled:opacity-50 shadow-lg shadow-odoo-green/20 flex items-center justify-center gap-2"
                >
                  {isCreatingOrder ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
                  Confirmar y Enviar a Odoo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Styles for Scrollbar */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f8f9fa; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ced4da; }
      `}} />
    </div>
  );
}
