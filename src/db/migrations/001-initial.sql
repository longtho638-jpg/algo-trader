-- AlgoTrader D1 Database Schema (SQLite)
-- Migration: PostgreSQL → D1 (Cloudflare Workers)
-- Generated: 2026-03-11

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  tier TEXT DEFAULT 'FREE' CHECK(tier IN ('FREE', 'PRO', 'ENTERPRISE')),
  max_strategies INTEGER DEFAULT 1,
  max_daily_loss_usd REAL DEFAULT 100.0,
  max_position_usd REAL DEFAULT 1000.0,
  allowed_exchanges TEXT DEFAULT '[]', -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes TEXT DEFAULT '[]', -- JSON array
  is_active INTEGER DEFAULT 1,
  last_used DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  config TEXT DEFAULT '{}', -- JSON
  status TEXT DEFAULT 'PAUSED' CHECK(status IN ('ACTIVE', 'PAUSED', 'STOPPED')),
  pnl REAL DEFAULT 0.0,
  trades_count INTEGER DEFAULT 0,
  started_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  strategy_id TEXT NOT NULL REFERENCES strategies(id),
  pair TEXT NOT NULL,
  side TEXT CHECK(side IN ('BUY', 'SELL')),
  price REAL NOT NULL,
  amount REAL NOT NULL,
  fee REAL DEFAULT 0.0,
  pnl REAL,
  exchange TEXT NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trades_tenant_executed ON trades(tenant_id, executed_at DESC);

-- Backtest Results table
CREATE TABLE IF NOT EXISTS backtest_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  strategy_id TEXT NOT NULL,
  pair TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  days INTEGER NOT NULL,
  result TEXT NOT NULL, -- JSON
  sharpe REAL,
  max_dd REAL,
  total_return REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Candles table (OHLCV data)
CREATE TABLE IF NOT EXISTS candles (
  time DATETIME NOT NULL,
  pair TEXT NOT NULL,
  exchange TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  PRIMARY KEY (time, pair, exchange)
);

CREATE INDEX IF NOT EXISTS idx_candles_pair_exchange_time ON candles(pair, exchange, time DESC);

-- PnL Snapshots table
CREATE TABLE IF NOT EXISTS pnl_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  total_pnl REAL NOT NULL,
  realized_pnl REAL NOT NULL,
  unrealized_pnl REAL NOT NULL,
  open_positions INTEGER DEFAULT 0,
  equity REAL NOT NULL,
  snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_tenant_time ON pnl_snapshots(tenant_id, snapshot_at DESC);

-- Licenses table (RaaS)
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  tier TEXT CHECK(tier IN ('FREE', 'PRO', 'ENTERPRISE')),
  tenant_id TEXT,
  status TEXT DEFAULT 'active',
  expires_at DATETIME,
  metadata TEXT DEFAULT '{}', -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  revoked_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
CREATE INDEX IF NOT EXISTS idx_licenses_tenant ON licenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- License Audit Logs
CREATE TABLE IF NOT EXISTS license_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL,
  event TEXT NOT NULL,
  tier TEXT,
  ip TEXT,
  metadata TEXT DEFAULT '{}', -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_license_audit_logs_license_time ON license_audit_logs(license_id, created_at DESC);

-- Usage Events
CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL,
  tenant_id TEXT,
  event_type TEXT NOT NULL,
  units INTEGER NOT NULL,
  metadata TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_events_license_time ON usage_events(license_key, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_time ON usage_events(tenant_id, created_at);

-- Dunning States
CREATE TABLE IF NOT EXISTS dunning_states (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'GRACE_PERIOD', 'SUSPENDED', 'REVOKED')),
  failed_payments INTEGER DEFAULT 0,
  current_period_end DATETIME,
  grace_period_days INTEGER DEFAULT 7,
  suspended_at DATETIME,
  revoked_at DATETIME,
  last_payment_failed_at DATETIME,
  last_payment_recovered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dunning_states_status ON dunning_states(status);
CREATE INDEX IF NOT EXISTS idx_dunning_states_tenant_status ON dunning_states(tenant_id, status);

-- Dunning Events
CREATE TABLE IF NOT EXISTS dunning_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT,
  metadata TEXT DEFAULT '{}', -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dunning_events_tenant_time ON dunning_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dunning_events_type ON dunning_events(event_type);

-- Audit Logs (SEC/FINRA Compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  order_id TEXT,
  user_id TEXT NOT NULL,
  severity TEXT,
  payload TEXT NOT NULL, -- JSON
  ip_address TEXT,
  user_agent TEXT,
  cat_order_ref TEXT,
  cat_event_category TEXT,
  symbol TEXT,
  side TEXT,
  amount REAL,
  price REAL,
  prev_hash TEXT,
  hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_order ON audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);

-- Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  enabled INTEGER DEFAULT 1,
  rollout_percentage INTEGER DEFAULT 100,
  user_whitelist TEXT DEFAULT '[]', -- JSON
  metadata TEXT DEFAULT '{}', -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);

-- License Feature Flags (junction table)
CREATE TABLE IF NOT EXISTS license_feature_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  feature_flag_id INTEGER NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  enabled INTEGER DEFAULT 1,
  override_value TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(license_id, feature_flag_id)
);

CREATE INDEX IF NOT EXISTS idx_license_feature_flags_license ON license_feature_flags(license_id);
CREATE INDEX IF NOT EXISTS idx_license_feature_flags_flag ON license_feature_flags(feature_flag_id);

-- Extension Eligibility
CREATE TABLE IF NOT EXISTS extension_eligibility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  extension_name TEXT NOT NULL,
  eligible INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  usage_count INTEGER DEFAULT 0,
  usage_limit INTEGER DEFAULT 1000,
  reset_at DATETIME,
  approved_at DATETIME,
  denied_at DATETIME,
  metadata TEXT DEFAULT '{}', -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(license_id, extension_name)
);

CREATE INDEX IF NOT EXISTS idx_extension_eligibility_license ON extension_eligibility(license_id);
CREATE INDEX IF NOT EXISTS idx_extension_eligibility_status ON extension_eligibility(status);

-- Usage Analytics
CREATE TABLE IF NOT EXISTS usage_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  feature_flag TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_count INTEGER DEFAULT 0,
  payload_size INTEGER DEFAULT 0,
  hour_bucket DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(license_id, feature_flag, endpoint, method, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_usage_analytics_license ON usage_analytics(license_id);
CREATE INDEX IF NOT EXISTS idx_usage_analytics_hour ON usage_analytics(hour_bucket);

-- Tier Extension Requests
CREATE TABLE IF NOT EXISTS tier_extensions (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  requested_tier TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_at DATETIME,
  denied_at DATETIME,
  metadata TEXT DEFAULT '{}', -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tier_extensions_license ON tier_extensions(license_id);
CREATE INDEX IF NOT EXISTS idx_tier_extensions_status ON tier_extensions(status);

-- Triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_tenants_updated_at
  AFTER UPDATE ON tenants
  BEGIN
    UPDATE tenants SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_licenses_updated_at
  AFTER UPDATE ON licenses
  BEGIN
    UPDATE licenses SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_dunning_states_updated_at
  AFTER UPDATE ON dunning_states
  BEGIN
    UPDATE dunning_states SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_extension_eligibility_updated_at
  AFTER UPDATE ON extension_eligibility
  BEGIN
    UPDATE extension_eligibility SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

CREATE TRIGGER IF NOT EXISTS update_tier_extensions_updated_at
  AFTER UPDATE ON tier_extensions
  BEGIN
    UPDATE tier_extensions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
