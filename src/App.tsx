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
  Edit2,
  LayoutDashboard,
  Store,
  History,
  UserCircle,
  Menu,
  Bell,
  ArrowRight,
  Filter,
  ChevronDown,
  MoreVertical,
  LogOut,
  User,
  X
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
  odooOrders: any[];
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
  odooOrders: [],
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
  const [newOrder, setNewOrder] = useState<{partner_id: number, lines: {product_id: number, qty: number, comment?: string}[], note?: string}>({
    partner_id: 0,
    lines: [],
    note: ''
  });
  const [selectedProductForCart, setSelectedProductForCart] = useState<{product: any, qty: number, comment: string} | null>(null);
  const [showConfirmOrder, setShowConfirmOrder] = useState(false);

  useEffect(() => {
    const draft = localStorage.getItem('salesme_draft_order');
    if (draft) {
      try {
        setNewOrder(JSON.parse(draft));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (newOrder.partner_id || newOrder.lines.length > 0) {
      localStorage.setItem('salesme_draft_order', JSON.stringify(newOrder));
    } else {
      localStorage.removeItem('salesme_draft_order');
    }
  }, [newOrder]);

  const saveAsDraft = () => {
    setIsOrderModalOpen(false);
    alert('Pedido guardado como borrador localmente. Puedes continuar luego.');
  };

  const createOdooOrder = async (confirm: boolean = true) => {
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
          company_id: activeExplorerCompanyId,
          confirm: confirm,
          note: newOrder.note,
          order_line: newOrder.lines.map(l => {
            const product = explorerData[activeExplorerCompanyId || 0]?.products.find(p => p.id === l.product_id);
            let name = product?.name || '';
            if (l.comment) {
              name += `\nNota: ${l.comment}`;
            }
            return [0, 0, {
              product_id: l.product_id,
              product_uom_qty: l.qty,
              price_unit: product?.list_price || 0,
              name: name
            }];
          })
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        alert(confirm ? 'Pedido enviado y confirmado con éxito en Odoo' : 'Pedido borrador creado con éxito en Odoo');
        setNewOrder({ partner_id: 0, lines: [], note: '' });
        localStorage.removeItem('salesme_draft_order');
        setIsOrderModalOpen(false);
        setShowConfirmOrder(false);
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
  const [activeView, setActiveView] = useState<'dashboard' | 'catalog' | 'orders' | 'partners' | 'settings'>('dashboard');
  const [orderTab, setOrderTab] = useState<'all' | 'draft' | 'sent'>('all');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [vendedorLogueado, setVendedorLogueado] = useState<Seller | null>(null);
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
      const [statsRes, ordersRes, odooRes, odooOrdersRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/recent-orders'),
        fetch('/api/odoo/stats'),
        fetch(`/api/odoo/orders${activeExplorerCompanyId ? `?companyId=${activeExplorerCompanyId}` : ''}`)
      ]);
      
      const stats = await statsRes.json();
      const orders = await ordersRes.json();
      const odoo = await odooRes.json();
      const odooOrders = await odooOrdersRes.json();
      
      if (stats && !stats.error) {
        setData(prev => ({
          ...prev,
          products: odoo?.products || prev.products,
          partners: odoo?.partners || prev.partners,
          employees: odoo?.employees || prev.employees,
          pending: stats?.pending_orders || 0,
          confirmed: odoo?.confirmed || 0,
          queue: Array.isArray(orders) ? orders : prev.queue,
          odooOrders: odooOrders?.orders || prev.odooOrders,
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
    if (activeTab === 'explorer' || activeView === 'catalog' || activeView === 'partners') {
      loadExplorerData();
    }
  }, [activeTab, activeView, activeExplorerCompanyId]);

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
              <h1 className="text-3xl font-black text-text-main tracking-tight mb-2 font-display">SalesMe</h1>
              <p className="text-text-muted text-sm leading-relaxed max-w-[280px]">
                La solución definitiva de <strong>GaorSystem Perú</strong> para generar órdenes de venta reales en Odoo de manera segura y confiable, impulsando la productividad de tu equipo al máximo.
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
              © 2024 SalesMe · Desarrollado por <a href="https://gaorsystem.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-odoo-purple hover:underline">GaorSystem Perú</a>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Desktop Header - Hidden on Mobile */}
      <header className="hidden md:flex sticky top-0 z-50 items-center justify-between px-6 py-2 bg-odoo-purple text-white shadow-md">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white fill-current" />
            </div>
            <div className="flex flex-col">
              <h1 className="font-display text-lg font-bold tracking-tight leading-none">
                SalesMe <span className="font-normal opacity-80">Monitor</span>
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
              onClick={() => setActiveView('dashboard')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeView === 'dashboard' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Monitor
            </button>
            <button 
              onClick={() => setActiveView('catalog')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeView === 'catalog' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Catálogo
            </button>
            <button 
              onClick={() => setActiveView('orders')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeView === 'orders' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Pedidos
            </button>
            <button 
              onClick={() => setActiveView('partners')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeView === 'partners' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Clientes
            </button>
            <button 
              onClick={() => setActiveView('settings')}
              className={`px-4 h-full text-sm font-medium transition-colors border-b-2 ${activeView === 'settings' ? 'border-white bg-white/10' : 'border-transparent hover:bg-white/5'}`}
            >
              Configuración
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Vendedor</span>
            <span className="text-xs font-bold">{vendedorLogueado?.nombre || 'Administrador'}</span>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-white border-b border-border-light shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-odoo-purple rounded-lg flex items-center justify-center">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-display text-base font-bold text-text-main">SalesMe</h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 text-text-muted relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-odoo-red rounded-full border-2 border-white" />
          </button>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-text-main"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 overflow-x-hidden pb-24 md:pb-8">
        {activeView === 'dashboard' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-auto max-w-7xl mx-auto">
            {/* KPIs */}
            <section className="bg-white border border-border-light rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Resumen General</h2>
                <Activity className="w-4 h-4 text-odoo-purple" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 border border-border-light rounded-xl p-4">
                  <div className="text-2xl font-extrabold text-odoo-green leading-none mb-1">{data.products.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">Productos</div>
                </div>
                <div className="bg-gray-50 border border-border-light rounded-xl p-4">
                  <div className="text-2xl font-extrabold text-odoo-blue leading-none mb-1">{data.partners.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">Clientes</div>
                </div>
                <div className="bg-gray-50 border border-border-light rounded-xl p-4">
                  <div className={`text-2xl font-extrabold leading-none mb-1 ${data.pending > 0 ? 'text-odoo-amber' : 'text-odoo-green'}`}>{data.pending}</div>
                  <div className="text-[10px] text-text-muted font-bold uppercase">Pendientes</div>
                </div>
                <div className="bg-gray-50 border border-border-light rounded-xl p-4">
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
                    return (
                      <div 
                        key={i}
                        className="flex-1 rounded-t-[2px] bg-odoo-purple/20 border border-odoo-purple/10"
                        style={{ height: `${h}px` }}
                      />
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Order Queue */}
            <section className="md:col-span-2 bg-white border border-border-light rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Pedidos Recientes (Odoo)</h2>
                <button onClick={loadAll} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <RefreshCw className={`w-4 h-4 text-text-muted ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              <div className="space-y-1">
                {data.odooOrders.length === 0 ? (
                  <div className="py-12 text-center text-text-muted">
                    <div className="text-3xl opacity-40 mb-3">📦</div>
                    <p className="text-sm">No hay pedidos registrados</p>
                  </div>
                ) : (
                  data.odooOrders.slice(0, 5).map((p, i) => {
                    const stateMap: Record<string, 'ok' | 'pending' | 'error' | 'dim'> = { 
                      sale: 'ok', 
                      done: 'ok',
                      sent: 'ok',
                      draft: 'pending', 
                      cancel: 'dim' 
                    };
                    return (
                      <div 
                        key={i}
                        className="flex items-center gap-4 py-3 border-b border-border-light/40 last:border-0"
                      >
                        <div className="w-10 h-10 rounded-xl bg-odoo-purple/10 flex items-center justify-center text-odoo-purple font-bold text-[10px]">
                          SO
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-text-main truncate">{p.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <StatusPill status={stateMap[p.state] || 'dim'} text={p.state === 'draft' ? 'Borrador' : p.state === 'sale' ? 'Confirmado' : p.state === 'sent' ? 'Enviado' : p.state} />
                            <span className="text-[10px] text-text-muted font-semibold">· {p.partner_id?.[1] || 'Cliente'}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-odoo-green">S/ {parseFloat(p.amount_total || 0).toFixed(2)}</div>
                          <div className="text-[9px] text-text-muted font-bold">{new Date(p.date_order).toLocaleDateString()}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {data.odooOrders.length > 5 && (
                <button 
                  onClick={() => setActiveView('orders')}
                  className="w-full mt-4 py-2 text-xs font-bold text-odoo-purple hover:bg-odoo-purple/5 rounded-lg transition-colors"
                >
                  Ver todos los pedidos
                </button>
              )}
            </section>

            {/* Active Sessions */}
            <section className="bg-white border border-border-light rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Sesiones WhatsApp</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-odoo-green/10 text-odoo-green border border-odoo-green/20">
                  {data.sessions.length}
                </span>
              </div>
              
              <div className="space-y-4">
                {data.sessions.length === 0 ? (
                  <div className="py-8 text-center text-text-muted">
                    <div className="text-2xl opacity-40 mb-2">💬</div>
                    <p className="text-xs">Sin actividad reciente</p>
                  </div>
                ) : (
                  data.sessions.slice(0, 4).map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs">👤</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-text-main truncate">{s.partner_nombre || 'Buscando...'}</div>
                        <div className="text-[10px] text-text-muted truncate">{s.phone}</div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-odoo-green animate-pulse" />
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Sellers */}
            <section className="md:col-span-2 bg-white border border-border-light rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider font-display">Vendedores en Campo</h2>
                <Users className="w-4 h-4 text-text-muted" />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.vendedores.map((v, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-border-light/60">
                    <div className="w-10 h-10 rounded-full bg-white border border-border-light flex items-center justify-center text-lg">
                      {v.activo ? '🟢' : '⚫'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-text-main truncate">{v.nombre}</div>
                      <div className="text-[10px] text-text-muted truncate">{v.whatsapp_phone}</div>
                    </div>
                    <StatusPill status={v.activo ? 'ok' : 'dim'} text={v.activo ? 'Activo' : 'Off'} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : activeView === 'catalog' ? (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-main font-display">Catálogo de Productos</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsOrderModalOpen(true)}
                  className="px-4 py-2 bg-odoo-purple text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-odoo-purple-dark transition-all"
                >
                  {newOrder.lines.length > 0 ? (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Ver Pedido ({newOrder.lines.reduce((acc, l) => acc + l.qty, 0)})
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Crear Pedido
                    </>
                  )}
                </button>
                <button 
                  onClick={loadExplorerData} 
                  className="p-2 bg-white border border-border-light rounded-lg text-text-muted hover:bg-gray-50 transition-colors"
                  title="Sincronizar Catálogo"
                >
                  <RefreshCw className={`w-4 h-4 ${isExplorerLoading ? 'animate-spin' : ''}`} />
                </button>
                <button className="p-2 bg-white border border-border-light rounded-lg text-text-muted">
                  <Filter className="w-4 h-4" />
                </button>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input 
                    type="text" 
                    placeholder="Buscar..."
                    className="pl-9 pr-4 py-2 bg-white border border-border-light rounded-lg text-sm outline-none focus:ring-2 focus:ring-odoo-purple/20"
                  />
                </div>
              </div>
            </div>

            {explorerCompanies.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {explorerCompanies.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setActiveExplorerCompanyId(c.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeExplorerCompanyId === c.id ? 'bg-odoo-purple text-white shadow-md' : 'bg-white border border-border-light text-text-muted hover:bg-gray-50'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {activeExplorerCompanyId && explorerData[activeExplorerCompanyId]?.products.map((p, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-border-light rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform">
                    📦
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-odoo-purple uppercase tracking-wider">{p.default_code || 'SIN CÓDIGO'}</div>
                    <h3 className="text-sm font-bold text-text-main line-clamp-2 leading-tight h-10">{p.name}</h3>
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-sm font-black text-text-main">S/ {p.list_price?.toFixed(2)}</div>
                      <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.qty_available > 0 ? 'bg-odoo-green/10 text-odoo-green' : 'bg-odoo-red/10 text-odoo-red'}`}>
                        {p.qty_available || 0} stock
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedProductForCart({ product: p, qty: 1, comment: '' });
                    }}
                    className="w-full mt-3 py-2 bg-gray-50 hover:bg-odoo-purple hover:text-white border border-border-light rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3 h-3" />
                    Agregar
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        ) : activeView === 'orders' ? (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-text-main font-display">Mis Pedidos</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsOrderModalOpen(true)}
                  className="px-4 py-2 bg-odoo-purple text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-odoo-purple-dark transition-all"
                >
                  {newOrder.lines.length > 0 ? (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Ver Pedido ({newOrder.lines.reduce((acc, l) => acc + l.qty, 0)})
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Crear Pedido
                    </>
                  )}
                </button>
                <button 
                  onClick={loadAll} 
                  className="p-2 bg-white border border-border-light rounded-lg text-text-muted hover:bg-gray-50 transition-colors"
                  title="Sincronizar Pedidos"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {explorerCompanies.length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2 custom-scrollbar">
                {explorerCompanies.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setActiveExplorerCompanyId(c.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeExplorerCompanyId === c.id ? 'bg-odoo-purple text-white shadow-md' : 'bg-white border border-border-light text-text-muted hover:bg-gray-50'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mb-4 border-b border-border-light pb-2">
              <button 
                onClick={() => setOrderTab('all')}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${orderTab === 'all' ? 'bg-odoo-purple/10 text-odoo-purple' : 'text-text-muted hover:bg-gray-50'}`}
              >
                Todos
              </button>
              <button 
                onClick={() => setOrderTab('sent')}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${orderTab === 'sent' ? 'bg-odoo-purple/10 text-odoo-purple' : 'text-text-muted hover:bg-gray-50'}`}
              >
                Enviados
              </button>
              <button 
                onClick={() => setOrderTab('draft')}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${orderTab === 'draft' ? 'bg-odoo-purple/10 text-odoo-purple' : 'text-text-muted hover:bg-gray-50'}`}
              >
                Borradores
              </button>
            </div>

            <div className="space-y-4">
              {(orderTab === 'all' || orderTab === 'draft') && (newOrder.lines.length > 0 || newOrder.partner_id > 0) && (
                <div className="bg-odoo-amber/5 border border-odoo-amber/20 rounded-2xl p-4 shadow-sm flex items-center justify-between cursor-pointer hover:bg-odoo-amber/10 transition-colors" onClick={() => setIsOrderModalOpen(true)}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-odoo-amber/10 flex items-center justify-center text-odoo-amber">
                      <Edit2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-text-main">Borrador Local (Sin enviar)</div>
                      <div className="text-[10px] text-text-muted font-medium">
                        {newOrder.lines.reduce((acc, l) => acc + l.qty, 0)} productos en el carrito
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-text-main">S/ {newOrder.lines.reduce((total, l) => {
                      const product = activeExplorerCompanyId ? explorerData[activeExplorerCompanyId]?.products.find(p => p.id === l.product_id) : null;
                      return total + ((product?.list_price || 0) * l.qty);
                    }, 0).toFixed(2)}</div>
                    <div className="text-[9px] font-bold uppercase tracking-widest text-odoo-amber">
                      Continuar Editando
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                const filteredOrders = data.odooOrders.filter(p => {
                  if (orderTab === 'sent') return p.state === 'sale' || p.state === 'done' || p.state === 'sent';
                  if (orderTab === 'draft') return p.state === 'draft';
                  return true;
                });
                
                const hasLocalDraft = (orderTab === 'all' || orderTab === 'draft') && (newOrder.lines.length > 0 || newOrder.partner_id > 0);

                if (filteredOrders.length === 0 && !hasLocalDraft) {
                  return (
                    <div className="py-12 text-center text-text-muted bg-white rounded-2xl border border-border-light">
                      <div className="text-3xl opacity-40 mb-3">📦</div>
                      <p className="text-sm">No hay pedidos para mostrar en esta vista</p>
                    </div>
                  );
                }

                return filteredOrders.map((p, i) => (
                  <div key={i} className="bg-white border border-border-light rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-odoo-purple/10 flex items-center justify-center text-odoo-purple">
                        <History className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-text-main">{p.name}</div>
                        <div className="text-[10px] text-text-muted font-medium">{p.partner_id?.[1] || 'Cliente Desconocido'} · {new Date(p.date_order).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-text-main">S/ {parseFloat(p.amount_total || 0).toFixed(2)}</div>
                      <div className={`text-[9px] font-bold uppercase tracking-widest ${p.state === 'sale' || p.state === 'done' ? 'text-odoo-green' : p.state === 'draft' ? 'text-odoo-amber' : 'text-text-muted'}`}>
                        {p.state === 'draft' ? 'Borrador' : p.state === 'sale' ? 'Confirmado' : p.state === 'sent' ? 'Enviado' : p.state}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        ) : activeView === 'partners' ? (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-text-main font-display">Mis Clientes</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsOrderModalOpen(true)}
                  className="px-4 py-2 bg-odoo-purple text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-odoo-purple-dark transition-all"
                >
                  {newOrder.lines.length > 0 ? (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Ver Pedido ({newOrder.lines.reduce((acc, l) => acc + l.qty, 0)})
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Crear Pedido
                    </>
                  )}
                </button>
                <button 
                  onClick={loadExplorerData} 
                  className="p-2 bg-white border border-border-light rounded-lg text-text-muted hover:bg-gray-50 transition-colors"
                  title="Sincronizar Clientes"
                >
                  <RefreshCw className={`w-4 h-4 ${isExplorerLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {explorerCompanies.length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2 custom-scrollbar">
                {explorerCompanies.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setActiveExplorerCompanyId(c.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeExplorerCompanyId === c.id ? 'bg-odoo-purple text-white shadow-md' : 'bg-white border border-border-light text-text-muted hover:bg-gray-50'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input 
                type="text" 
                placeholder="Buscar cliente..."
                className="w-full pl-12 pr-4 py-3 bg-white border border-border-light rounded-2xl text-sm outline-none focus:ring-2 focus:ring-odoo-purple/20"
              />
            </div>
            <div className="space-y-3">
              {activeExplorerCompanyId && explorerData[activeExplorerCompanyId]?.partners.map((p, i) => (
                <div key={i} className="bg-white border border-border-light rounded-2xl p-4 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-lg">
                      👤
                    </div>
                    <div>
                      <div className="text-sm font-bold text-text-main">{p.name}</div>
                      <div className="text-[10px] text-text-muted font-medium">{p.city || 'Sin ciudad'} · {p.phone || p.mobile || 'Sin teléfono'}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingPartner(p);
                      setIsEditPartnerModalOpen(true);
                    }}
                    className="p-2 text-text-muted hover:text-odoo-purple"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : activeView === 'settings' ? (
          <div className="max-w-2xl mx-auto space-y-6 pb-12">
            <h2 className="text-xl font-bold text-text-main font-display">Configuración</h2>
            
            <div className="bg-white border border-border-light rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 bg-gray-50 border-b border-border-light font-bold text-xs text-text-muted uppercase tracking-wider">Perfil del Vendedor</div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-odoo-purple/10 flex items-center justify-center text-3xl text-odoo-purple">
                    👤
                  </div>
                  <div>
                    <div className="text-lg font-bold text-text-main">{vendedorLogueado?.nombre || 'Administrador'}</div>
                    <div className="text-sm text-text-muted">{vendedorLogueado?.whatsapp_phone || 'admin@gaorsystem.com'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="p-4 bg-gray-50 rounded-xl border border-border-light">
                    <div className="text-[10px] font-bold text-text-muted uppercase mb-1">Compañía Activa</div>
                    <div className="text-sm font-bold text-text-main">Cía {activeExplorerCompanyId || 1}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl border border-border-light">
                    <div className="text-[10px] font-bold text-text-muted uppercase mb-1">Estado Sync</div>
                    <div className="text-sm font-bold text-odoo-green">Online</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-border-light rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 bg-gray-50 border-b border-border-light font-bold text-xs text-text-muted uppercase tracking-wider">Conexión Odoo</div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">URL de Odoo</label>
                    <input 
                      type="url" 
                      value={odooConfig.url} 
                      onChange={e => setOdooConfig({...odooConfig, url: e.target.value})}
                      className="w-full bg-gray-50 border border-border-light rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Base de Datos</label>
                    <input 
                      type="text" 
                      value={odooConfig.db} 
                      onChange={e => setOdooConfig({...odooConfig, db: e.target.value})}
                      className="w-full bg-gray-50 border border-border-light rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Usuario</label>
                    <input 
                      type="text" 
                      value={odooConfig.username} 
                      onChange={e => setOdooConfig({...odooConfig, username: e.target.value})}
                      className="w-full bg-gray-50 border border-border-light rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">Contraseña</label>
                    <input 
                      type="password" 
                      value={odooConfig.password} 
                      onChange={e => setOdooConfig({...odooConfig, password: e.target.value})}
                      className="w-full bg-gray-50 border border-border-light rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-odoo-purple/20 transition-all"
                    />
                  </div>
                </div>
                
                <button 
                  onClick={saveOdooConfig}
                  className="w-full py-3 bg-odoo-purple text-white rounded-xl text-sm font-bold hover:bg-odoo-purple/90 transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Guardar Cambios
                </button>
              </div>
            </div>

            <button 
              onClick={() => setIsAuthenticated(false)}
              className="w-full py-4 bg-odoo-red/10 text-odoo-red border border-odoo-red/20 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted">
            Vista no implementada
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
                    <p className="text-[11px] text-text-muted">Conecta SalesMe con tu base de datos real</p>
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
                    <p className="text-xs text-text-muted">
                      {activeExplorerCompanyId ? `Para: ${explorerCompanies.find(c => c.id === activeExplorerCompanyId)?.name || 'Compañía'}` : 'Busca productos, verifica stock y precio'}
                    </p>
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
                              setSelectedProductForCart({ product: p, qty: 1, comment: '' });
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
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-text-main">{product?.name}</span>
                                {l.comment && <span className="text-[10px] text-text-muted italic">Nota: {l.comment}</span>}
                              </div>
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
                      
                      <div className="mt-4 space-y-2">
                        <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Nota General del Pedido (Opcional)</label>
                        <textarea 
                          value={newOrder.note || ''}
                          onChange={(e) => setNewOrder(prev => ({ ...prev, note: e.target.value }))}
                          placeholder="Instrucciones de entrega, referencias..."
                          className="w-full p-3 bg-gray-50 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none resize-none h-20"
                        />
                      </div>

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
                  onClick={saveAsDraft}
                  className="flex-1 py-3 bg-white border border-border-light text-text-main rounded-xl text-sm font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Guardar Borrador
                </button>
                <button 
                  onClick={() => setShowConfirmOrder(true)}
                  disabled={isCreatingOrder || !newOrder.partner_id || newOrder.lines.length === 0}
                  className="flex-1 py-3 bg-odoo-green text-white rounded-xl text-sm font-bold hover:bg-odoo-green-dark transition-all disabled:opacity-50 shadow-lg shadow-odoo-green/20 flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Enviar a Odoo
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal for Product Quantity and Comment */}
        {selectedProductForCart && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border-light flex items-center justify-between bg-gray-50">
                <h3 className="text-lg font-bold text-text-main font-display">Agregar al Pedido</h3>
                <button onClick={() => setSelectedProductForCart(null)} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                  <XCircle className="w-6 h-6 text-text-muted" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <div className="text-sm font-bold text-text-main">{selectedProductForCart.product.name}</div>
                  <div className="text-xs text-text-muted mt-1">Precio: S/ {selectedProductForCart.product.list_price?.toFixed(2)}</div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Cantidad</label>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setSelectedProductForCart(prev => prev ? { ...prev, qty: Math.max(1, prev.qty - 1) } : null)}
                      className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-text-main hover:bg-gray-200 font-bold text-lg"
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      min="1"
                      value={selectedProductForCart.qty}
                      onChange={(e) => setSelectedProductForCart(prev => prev ? { ...prev, qty: parseInt(e.target.value) || 1 } : null)}
                      className="flex-1 h-10 text-center border border-border-light rounded-xl font-bold text-text-main focus:ring-2 focus:ring-odoo-purple/20 outline-none"
                    />
                    <button 
                      onClick={() => setSelectedProductForCart(prev => prev ? { ...prev, qty: prev.qty + 1 } : null)}
                      className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-text-main hover:bg-gray-200 font-bold text-lg"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Comentario (Opcional)</label>
                  <textarea 
                    value={selectedProductForCart.comment}
                    onChange={(e) => setSelectedProductForCart(prev => prev ? { ...prev, comment: e.target.value } : null)}
                    placeholder="Ej. Color rojo, talla M..."
                    className="w-full p-3 border border-border-light rounded-xl text-sm focus:ring-2 focus:ring-odoo-purple/20 outline-none resize-none h-24"
                  />
                </div>
              </div>
              <div className="p-6 bg-gray-50 border-t border-border-light flex gap-3">
                <button 
                  onClick={() => {
                    setNewOrder(prev => {
                      const existingIndex = prev.lines.findIndex(l => l.product_id === selectedProductForCart.product.id && l.comment === selectedProductForCart.comment);
                      if (existingIndex >= 0) {
                        const newLines = [...prev.lines];
                        newLines[existingIndex].qty += selectedProductForCart.qty;
                        return { ...prev, lines: newLines };
                      } else {
                        return {
                          ...prev,
                          lines: [...prev.lines, { product_id: selectedProductForCart.product.id, qty: selectedProductForCart.qty, comment: selectedProductForCart.comment }]
                        };
                      }
                    });
                    setSelectedProductForCart(null);
                  }}
                  className="w-full py-3 bg-odoo-purple text-white rounded-xl text-sm font-bold hover:bg-odoo-purple-dark transition-all shadow-lg shadow-odoo-purple/20"
                >
                  Agregar al Carrito
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal for Order Confirmation */}
        {showConfirmOrder && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col text-center p-8"
            >
              <div className="w-16 h-16 bg-odoo-amber/10 text-odoo-amber rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-text-main font-display mb-2">¿Enviar pedido a Odoo?</h3>
              <p className="text-sm text-text-muted mb-6">
                Estás a punto de enviar este pedido a Odoo Ventas. Asegúrate de que los productos y cantidades sean correctos.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirmOrder(false)}
                  className="flex-1 py-3 bg-gray-100 text-text-main rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
                >
                  Revisar
                </button>
                <button 
                  onClick={() => createOdooOrder(true)}
                  disabled={isCreatingOrder}
                  className="flex-1 py-3 bg-odoo-green text-white rounded-xl text-sm font-bold hover:bg-odoo-green-dark transition-all flex items-center justify-center gap-2"
                >
                  {isCreatingOrder ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Sí, Enviar'}
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
