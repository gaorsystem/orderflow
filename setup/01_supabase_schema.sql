-- 01_supabase_schema.sql
-- Schema completo para el sistema de pedidos WhatsApp <-> Odoo

-- Tabla de productos (cache de Odoo)
CREATE TABLE IF NOT EXISTS odoo_products (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    list_price DECIMAL(12,2),
    default_code TEXT,
    qty_available DECIMAL(12,2),
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de clientes (cache de Odoo)
CREATE TABLE IF NOT EXISTS odoo_customers (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    vat TEXT,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de pedidos (cola para Odoo)
CREATE TABLE IF NOT EXISTS pedidos_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id BIGINT REFERENCES odoo_customers(id),
    items JSONB NOT NULL,
    total DECIMAL(12,2),
    status TEXT DEFAULT 'pending', -- pending, processing, completed, error
    odoo_order_id BIGINT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de sesiones de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    phone_number TEXT PRIMARY KEY,
    current_step TEXT,
    order_data JSONB DEFAULT '{}',
    last_interaction TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Log de sincronización
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    sync_type TEXT, -- products, customers, orders
    status TEXT,
    records_processed INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
