import 'dotenv/config';
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getConnection } from "./odoo_connector.js";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = parseInt(process.env.PORT || "3000");

// --- Middlewares ---
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- Supabase Client ---
const getSupabase = () => {
  try {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch (e) {
    console.error("Error initializing Supabase client:", e);
    return null;
  }
};

// --- Odoo Connection Helper ---
const getOdooConn = async (customCfg?: any) => {
  const cfg = customCfg || {
    url: process.env.ODOO_URL,
    db: process.env.ODOO_DB,
    username: process.env.ODOO_USERNAME,
    password: process.env.ODOO_PASSWORD,
    companyIds: process.env.ODOO_COMPANY_IDS ? process.env.ODOO_COMPANY_IDS.split(',').map(Number) : [parseInt(process.env.ODOO_COMPANY_ID || "1")]
  };

  if (!cfg.url || !cfg.db || !cfg.username || !cfg.password) {
    return null;
  }

  let url = cfg.url.trim();
  if (url.endsWith('.')) url = url.slice(0, -1);
  if (url.endsWith('/')) url = url.slice(0, -1);

  return await getConnection({
    ...cfg,
    url: url,
    debug: true
  });
};

// --- API Routes ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "OrderFlow API is running" });
});

app.post("/api/odoo/diagnose", async (req, res) => {
  const { url, db, username, password } = req.body;
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[Diagnóstico] ${msg}`);
    logs.push(`[${new Date().toISOString()}] ${msg}`);
  };

  try {
    log(`Iniciando diagnóstico para URL: ${url}`);
    log(`Base de datos: ${db}`);
    log(`Usuario: ${username}`);
    
    log("Paso 1: Intentando establecer conexión XML-RPC...");
    const conn = await getConnection({
      url, db, username, password,
      companyIds: [1], // Default for testing
      debug: true
    });
    
    log(`Paso 1 Exitoso: Conectado y autenticado. UID del usuario: ${conn.uid}`);
    
    log("Paso 2: Verificando acceso a res.users...");
    let userData = null;
    try {
      userData = await conn.read('res.users', [conn.uid!], ['name', 'login', 'company_id', 'company_ids']);
      log(`Paso 2 Exitoso: Datos del usuario obtenidos: ${JSON.stringify(userData)}`);
    } catch (e: any) {
      log(`Paso 2 Fallido: Error al leer res.users: ${e.message}`);
    }

    log("Paso 3: Verificando acceso a res.company...");
    let companies = [];
    try {
      companies = await conn.searchRead('res.company', [], ['name']);
      log(`Paso 3 Exitoso: Se encontraron ${companies.length} compañías en res.company: ${JSON.stringify(companies)}`);
    } catch (e: any) {
      log(`Paso 3 Fallido: Error al buscar en res.company: ${e.message}`);
    }

    log("Paso 4: Verificando acceso a product.product (Inventario)...");
    try {
      const products = await conn.searchRead('product.product', [], ['name'], { limit: 1 });
      log(`Paso 4 Exitoso: Acceso a productos confirmado. Ejemplo: ${JSON.stringify(products)}`);
    } catch (e: any) {
      log(`Paso 4 Fallido: Error al buscar productos: ${e.message}`);
    }

    log("Paso 5: Verificando acceso a res.partner (Clientes)...");
    try {
      const partners = await conn.searchRead('res.partner', [], ['name'], { limit: 1 });
      log(`Paso 5 Exitoso: Acceso a clientes confirmado. Ejemplo: ${JSON.stringify(partners)}`);
    } catch (e: any) {
      log(`Paso 5 Fallido: Error al buscar clientes: ${e.message}`);
    }

    log("Diagnóstico completado.");
    res.json({ status: "ok", logs, success: true });
  } catch (err: any) {
    log(`ERROR FATAL: ${err.message}`);
    if (err.faultCode) {
      log(`Código de falla Odoo: ${err.faultCode}`);
    }
    log("Diagnóstico abortado debido a error crítico.");
    res.status(401).json({ error: err.message, logs, success: false });
  }
});

app.post("/api/odoo/discover", async (req, res) => {
  const { url, db, username, password } = req.body;
  console.log(`Attempting to discover companies for Odoo at ${url}, DB: ${db}, User: ${username}`);
  try {
    const conn = await getConnection({
      url, db, username, password,
      companyIds: [1], // Default to 1 just for discovery
      debug: true
    });
    console.log("Connection established, searching for companies...");
    let companies = [];
    try {
      const rawCompanies = await conn.searchRead('res.company', [], ['name']);
      console.log("Raw companies from Odoo:", JSON.stringify(rawCompanies));
      
      if (Array.isArray(rawCompanies)) {
        companies = rawCompanies.map((c: any) => {
          if (Array.isArray(c)) {
            return { id: c[0], name: c[1] || `Compañía ${c[0]}` };
          } else if (typeof c === 'object' && c !== null) {
            const id = c.id;
            const name = Array.isArray(c.name) ? c.name[1] : c.name;
            if (id) return { id, name: name || `Compañía ${id}` };
          }
          return null;
        }).filter(Boolean);
      }
    } catch (e) {
      console.warn("Could not search res.company, trying to get user's company...");
    }

    if (!companies || companies.length === 0) {
      // Try to get the company of the current user
      try {
        const userData = await conn.read('res.users', [conn.uid!], ['company_id']);
        if (userData && userData[0] && userData[0].company_id) {
          const companyData = userData[0].company_id;
          let compId, compName;
          
          if (Array.isArray(companyData)) {
            compId = companyData[0];
            compName = companyData[1];
          } else {
            compId = companyData;
            compName = `Compañía ${compId}`;
          }
          
          companies = [{ id: compId, name: compName }];
          console.log("Found user's company:", companies);
        }
      } catch (e) {
        console.error("Failed to get user's company:", e);
      }
    }

    console.log(`Found ${companies.length} companies:`, companies);
    res.json({ status: "ok", companies });
  } catch (err: any) {
    console.error("Discovery failed:", err);
    res.status(401).json({ error: "Error de autenticación o conexión: " + err.message });
  }
});

app.post("/api/odoo/config", async (req, res) => {
  const { url, db, username, password, companyIds } = req.body;
  process.env.ODOO_URL = url;
  process.env.ODOO_DB = db;
  process.env.ODOO_USERNAME = username;
  process.env.ODOO_PASSWORD = password;
  if (companyIds && Array.isArray(companyIds)) {
    process.env.ODOO_COMPANY_IDS = companyIds.join(',');
  }
  res.json({ status: "ok", message: "Configuración guardada correctamente" });
});

app.get("/api/odoo/products", async (req, res) => {
  try {
    const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : null;
    const conn = await getOdooConn();
    if (!conn) return res.status(400).json({ error: "Odoo no configurado" });
    
    const domain: any[] = [['sale_ok', '=', true]];
    const kwargs: any = { limit: 1000 }; // Aumentar límite para sincronizar más productos
    
    if (companyId) {
      domain.push(['company_id', 'in', [companyId, false]]);
      kwargs.context = { company_id: companyId, allowed_company_ids: [companyId] };
    }

    const products = await conn.searchRead('product.product', domain, ['name', 'list_price', 'default_code', 'qty_available', 'company_id'], kwargs);
    res.json({ status: "ok", products });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/odoo/partners", async (req, res) => {
  try {
    const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : null;
    const conn = await getOdooConn();
    if (!conn) return res.status(400).json({ error: "Odoo no configurado" });

    const domain: any[] = [];
    const kwargs: any = { limit: 1000 };
    
    if (companyId) {
      domain.push(['company_id', 'in', [companyId, false]]);
      kwargs.context = { company_id: companyId, allowed_company_ids: [companyId] };
    }

    const partners = await conn.searchRead('res.partner', domain, ['name', 'email', 'phone', 'mobile', 'vat', 'city', 'company_id'], kwargs);
    res.json({ status: "ok", partners });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/odoo/companies", async (req, res) => {
  try {
    const conn = await getOdooConn();
    if (!conn) return res.status(400).json({ error: "Odoo no configurado" });
    const companies = await conn.searchRead('res.company', [], ['name', 'id']);
    res.json({ status: "ok", companies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/odoo/check-access", async (req, res) => {
  try {
    const conn = await getOdooConn();
    if (!conn) return res.status(400).json({ error: "Odoo no configurado" });

    const models = ['res.partner', 'product.product', 'hr.employee', 'sale.order'];
    const results: any = {};

    for (const model of models) {
      try {
        const count = await conn.searchCount(model, []);
        results[model] = { access: true, count };
      } catch (e: any) {
        results[model] = { access: false, error: e.message };
      }
    }

    res.json({ status: "ok", results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/odoo/orders", async (req, res) => {
  const { partner_id, order_line, company_id } = req.body;
  try {
    const conn = await getOdooConn();
    if (!conn) return res.status(400).json({ error: "Odoo no configurado" });

    const kwargs: any = {};
    if (company_id) {
      kwargs.context = { 
        company_id: parseInt(company_id), 
        allowed_company_ids: [parseInt(company_id)] 
      };
    }

    // order_line should be an array of [0, 0, { product_id, product_uom_qty, price_unit }]
    const orderId = await conn.create('sale.order', {
      partner_id,
      order_line,
      company_id: company_id ? parseInt(company_id) : undefined
    }, kwargs);

    res.json({ status: "ok", order_id: orderId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/odoo/stats", async (req, res) => {
  try {
    const conn = await getOdooConn();
    if (!conn) {
      console.log("Odoo not configured, returning empty data");
      return res.json({ 
        products: 0, 
        partners: 0, 
        employees: 0,
        pending: 0, 
        confirmed: 0, 
        is_demo: false,
        config: {
          url: process.env.ODOO_URL,
          db: process.env.ODOO_DB,
          username: process.env.ODOO_USERNAME,
          companyIds: process.env.ODOO_COMPANY_IDS ? process.env.ODOO_COMPANY_IDS.split(',').map(Number) : [parseInt(process.env.ODOO_COMPANY_ID || "1")]
        }
      });
    }
    console.log(`Fetching real Odoo stats for company ${process.env.ODOO_COMPANY_IDS || process.env.ODOO_COMPANY_ID}...`);
    
    // Use individual try-catch for each count to avoid failing the whole request if one model doesn't exist
    const getCount = async (model: string, domain: any[] = []) => {
      try {
        return await conn.searchCount(model, domain);
      } catch (e: any) {
        if (e.message && (e.message.includes('no existe') || e.message.includes('does not exist'))) {
          console.log(`Model ${model} does not exist, skipping count.`);
        } else {
          console.warn(`Could not get count for ${model}:`, e.message || e);
        }
        return 0;
      }
    };

    const [products, partners, employees] = await Promise.all([
      getCount('product.product', [['sale_ok', '=', true]]),
      getCount('res.partner', []),
      getCount('hr.employee', [])
    ]);
    
    console.log(`Odoo stats: ${products} products, ${partners} partners, ${employees} employees`);
    const supabase = getSupabase();
    let pending = 0, confirmed = 0;
    if (supabase) {
      const { count: p } = await supabase.from('pedidos_queue').select('*', { count: 'exact', head: true }).eq('estado', 'pending');
      const { count: c } = await supabase.from('pedidos_queue').select('*', { count: 'exact', head: true }).eq('estado', 'confirmed');
      pending = p || 0; confirmed = c || 0;
    }
    res.json({ 
      products, 
      partners, 
      employees,
      pending, 
      confirmed, 
      is_demo: false,
      config: {
        url: process.env.ODOO_URL,
        db: process.env.ODOO_DB,
        username: process.env.ODOO_USERNAME,
        companyIds: process.env.ODOO_COMPANY_IDS ? process.env.ODOO_COMPANY_IDS.split(',').map(Number) : [parseInt(process.env.ODOO_COMPANY_ID || "1")]
      }
    });
  } catch (err: any) {
    console.error("Error in /api/odoo/stats:", err);
    res.status(500).json({ 
      error: err.message, 
      products: 0, 
      partners: 0, 
      employees: 0,
      is_demo: false,
      config: {
        url: process.env.ODOO_URL,
        db: process.env.ODOO_DB,
        username: process.env.ODOO_USERNAME,
        companyIds: process.env.ODOO_COMPANY_IDS ? process.env.ODOO_COMPANY_IDS.split(',').map(Number) : [parseInt(process.env.ODOO_COMPANY_ID || "1")]
      }
    });
  }
});

app.get("/api/stats", async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) {
    return res.json({ active_sessions: 0, pending_orders: 0, sync_status: "ERROR", last_sync: null });
  }
  try {
    const [sessions, pending, logs] = await Promise.all([
      supabase.from('whatsapp_sessions').select('*', { count: 'exact', head: true }).neq('estado', 'idle'),
      supabase.from('pedidos_queue').select('*', { count: 'exact', head: true }).eq('estado', 'pending'),
      supabase.from('sync_log').select('*').order('created_at', { ascending: false }).limit(1)
    ]);
    res.json({
      active_sessions: sessions.count || 0,
      pending_orders: pending.count || 0,
      sync_status: logs.data?.[0]?.estado === 'ok' ? "OK" : "WARNING",
      last_sync: logs.data?.[0]?.created_at || new Date().toISOString()
    });
  } catch (err) {
    res.json({ active_sessions: 0, pending_orders: 0, sync_status: "ERROR", last_sync: null });
  }
});

app.get("/api/recent-orders", async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) return res.json([]);
  const { data } = await supabase.from('pedidos_queue').select('*').order('created_at', { ascending: false }).limit(5);
  res.json(data || []);
});

// --- Server Startup ---
let isInitialized = false;
export async function initializeServer() {
  if (isInitialized) return;

  const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  const isVercel = !!process.env.VERCEL;
  
  if (isDev && !isVercel) {
    console.log("Initializing Vite middleware...");
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // En Vercel o Producción, servimos estáticos
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (!req.url.startsWith('/api')) {
        res.sendFile(path.join(distPath, "index.html"));
      } else {
        res.status(404).json({ error: "API route not found" });
      }
    });
  }

  isInitialized = true;
}

// Start listener only if not in Vercel
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  initializeServer().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  }).catch(console.error);
}

export default app;
