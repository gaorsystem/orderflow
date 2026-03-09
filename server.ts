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
    companyId: parseInt(process.env.ODOO_COMPANY_ID || "1")
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

app.post("/api/odoo/discover", async (req, res) => {
  const { url, db, username, password } = req.body;
  try {
    const conn = await getConnection({
      url, db, username, password,
      companyId: 1,
      debug: true
    });
    const companies = await conn.searchRead('res.company', [], ['name', 'id']);
    res.json({ status: "ok", companies });
  } catch (err: any) {
    res.status(401).json({ error: "Error de autenticación: " + err.message });
  }
});

app.post("/api/odoo/config", async (req, res) => {
  const { url, db, username, password, companyId } = req.body;
  process.env.ODOO_URL = url;
  process.env.ODOO_DB = db;
  process.env.ODOO_USERNAME = username;
  process.env.ODOO_PASSWORD = password;
  process.env.ODOO_COMPANY_ID = companyId.toString();
  res.json({ status: "ok", message: "Configuración guardada correctamente" });
});

app.get("/api/odoo/test", async (req, res) => {
  try {
    const conn = await getOdooConn();
    if (!conn) return res.status(400).json({ error: "Odoo credentials not configured" });
    res.json({ status: "ok", stats: conn.stats() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/odoo/stats", async (req, res) => {
  try {
    const conn = await getOdooConn();
    if (!conn) {
      console.log("Odoo not configured, returning demo data");
      return res.json({ products: 247, partners: 89, pending: 2, confirmed: 14, is_demo: true });
    }
    console.log("Fetching real Odoo stats...");
    const [products, partners] = await Promise.all([
      conn.searchCount('product.product', [['sale_ok', '=', true]]),
      conn.searchCount('res.partner', [['customer_rank', '>', 0]])
    ]);
    const supabase = getSupabase();
    let pending = 0, confirmed = 0;
    if (supabase) {
      const { count: p } = await supabase.from('pedidos_queue').select('*', { count: 'exact', head: true }).eq('estado', 'pending');
      const { count: c } = await supabase.from('pedidos_queue').select('*', { count: 'exact', head: true }).eq('estado', 'confirmed');
      pending = p || 0; confirmed = c || 0;
    }
    res.json({ products, partners, pending, confirmed, is_demo: false });
  } catch (err: any) {
    console.error("Error in /api/odoo/stats:", err);
    res.status(500).json({ error: err.message, products: 0, partners: 0, is_demo: true });
  }
});

app.get("/api/stats", async (req, res) => {
  const supabase = getSupabase();
  if (!supabase) {
    return res.json({ active_sessions: 12, pending_orders: 5, sync_status: "OK", last_sync: new Date().toISOString() });
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
