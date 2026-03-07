import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { getConnection } from "./odoo_connector.js";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log(`Starting server setup... (NODE_ENV: ${process.env.NODE_ENV || 'not set'})`);
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Supabase Client (Server-side with Service Role)
  const getSupabase = () => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "OrderFlow API is running" });
  });

  // Odoo Connection Helper
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

  // Odoo API Endpoints
  app.post("/api/odoo/discover", async (req, res) => {
    const { url, db, username, password } = req.body;
    try {
      // Intentar conectar sin companyId primero para listar compañías
      // res.company es el modelo de compañías en Odoo
      const conn = await getConnection({
        url, db, username, password,
        companyId: 1, // Dummy ID para la auth inicial
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
    // En una app real, esto se guardaría en una base de datos por usuario/tenant.
    // Para este demo, actualizamos las variables de entorno en memoria.
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
      if (!conn) {
        return res.status(400).json({ error: "Odoo credentials not configured in environment" });
      }
      const stats = conn.stats();
      res.json({ status: "ok", stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/odoo/stats", async (req, res) => {
    try {
      const conn = await getOdooConn();
      if (!conn) {
        return res.json({
          products: 247,
          partners: 89,
          pending: 2,
          confirmed: 14,
          is_demo: true
        });
      }

      const [products, partners] = await Promise.all([
        conn.searchCount('product.product', [['sale_ok', '=', true]]),
        conn.searchCount('res.partner', [['customer_rank', '>', 0]])
      ]);

      // Try to get real counts from Supabase if available
      const supabase = getSupabase();
      let pending = 0;
      let confirmed = 0;

      if (supabase) {
        const { count: pendingCount } = await supabase
          .from('pedidos_queue')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'pending');
        
        const { count: confirmedCount } = await supabase
          .from('pedidos_queue')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'confirmed');
        
        pending = pendingCount || 0;
        confirmed = confirmedCount || 0;
      }

      res.json({
        products,
        partners,
        pending,
        confirmed,
        is_demo: false
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dashboard API Endpoints
  app.get("/api/stats", async (req, res) => {
    const supabase = getSupabase();
    if (!supabase) {
      return res.json({
        active_sessions: Math.floor(Math.random() * 20) + 5,
        pending_orders: Math.floor(Math.random() * 10),
        sync_status: "OK",
        last_sync: new Date().toISOString()
      });
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

    const { data } = await supabase
      .from('pedidos_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    res.json(data || []);
  });

  console.log(`Attempting to listen on 0.0.0.0:${PORT}...`);
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully running on port ${PORT}`);
  });

  // Vite middleware for development
  const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  if (isDev) {
    console.log("Initializing Vite middleware (Development Mode)...");
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: false 
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware initialized.");
    } catch (err) {
      console.error("Vite initialization failed:", err);
    }
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. This is expected if the platform is restarting.`);
    } else {
      console.error('Server error:', err);
    }
  });
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
