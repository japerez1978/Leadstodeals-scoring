-- ─────────────────────────────────────────────────────────────────────────────
-- deal_health_scores
-- Guarda snapshots del hs_predictive_deal_score de HubSpot cada vez que cambia.
-- Fuentes: 'poll' (carga del detalle) | 'webhook' (HubSpot webhook futuro)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deal_health_scores (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        INTEGER       NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hubspot_deal_id  TEXT          NOT NULL,
  deal_name        TEXT,
  score            NUMERIC       NOT NULL,
  source           TEXT          NOT NULL DEFAULT 'poll',  -- 'poll' | 'webhook'
  recorded_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índice principal para consultas por deal
CREATE INDEX IF NOT EXISTS idx_deal_health_scores_lookup
  ON deal_health_scores (tenant_id, hubspot_deal_id, recorded_at DESC);

-- RLS
ALTER TABLE deal_health_scores ENABLE ROW LEVEL SECURITY;

-- SELECT / UPDATE / DELETE: sólo el tenant del usuario autenticado
CREATE POLICY "tenant_read" ON deal_health_scores
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE auth_user_id = auth.uid()
    )
  );

-- INSERT desde el cliente (poll): el tenant_id debe pertenecer al usuario
CREATE POLICY "tenant_insert" ON deal_health_scores
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users WHERE auth_user_id = auth.uid()
    )
  );
