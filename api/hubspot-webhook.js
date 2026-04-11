/**
 * HubSpot Webhook Handler — deal health score tracker
 *
 * Recibe eventos de HubSpot cuando cambia `hs_predictive_deal_score`
 * y guarda un snapshot en la tabla `deal_health_scores` de Supabase.
 *
 * Env vars requeridas en Vercel:
 *   SUPABASE_URL             – URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypassa RLS, solo en servidor)
 *   HUBSPOT_CLIENT_SECRET    – Client secret de la HubSpot App (para verificar firma)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Supabase con service role (bypass RLS para escrituras server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Verifica la firma HubSpot v3:
 * HMAC-SHA256(clientSecret, METHOD+URI+BODY+TIMESTAMP)
 */
function verifySignature(req, rawBody) {
  const secret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!secret) return true; // sin secret configurado, se acepta (dev)

  const sig   = req.headers['x-hubspot-signature-v3'];
  const ts    = req.headers['x-hubspot-request-timestamp'];

  // Rechazar requests con más de 5 minutos de antigüedad
  if (ts && Date.now() - parseInt(ts) > 300_000) return false;

  if (sig && ts) {
    const toSign = `POST${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''}${req.url}${rawBody}${ts}`;
    const expected = crypto.createHmac('sha256', secret).update(toSign).digest('base64');
    return sig === expected;
  }

  // Fallback: v1 signature (HMAC-SHA256 of clientSecret + body)
  const sigV1 = req.headers['x-hubspot-signature'];
  if (sigV1) {
    const expected = crypto.createHmac('sha256', secret).update(secret + rawBody).digest('hex');
    return sigV1 === expected;
  }

  return true; // sin header de firma (dev/testing)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Leer body raw para verificación de firma
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  if (!verifySignature(req, rawBody)) {
    console.error('[webhook] Invalid HubSpot signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];
  const results = { processed: 0, skipped: 0, errors: 0 };

  for (const event of events) {
    try {
      // Solo nos interesan cambios del deal health score
      if (event.propertyName !== 'hs_predictive_deal_score') {
        results.skipped++;
        continue;
      }

      const score = Math.round(parseFloat(event.propertyValue));
      if (isNaN(score) || !event.objectId || !event.portalId) {
        results.skipped++;
        continue;
      }

      const dealId  = String(event.objectId);
      const portalId = String(event.portalId);

      // Buscar tenant por portal ID
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('hubspot_portal_id', portalId)
        .maybeSingle();

      if (!tenant) {
        console.warn(`[webhook] No tenant found for portalId=${portalId}`);
        results.skipped++;
        continue;
      }

      // Evitar duplicados consecutivos del mismo valor
      const { data: lastRecord } = await supabase
        .from('deal_health_scores')
        .select('score, deal_name')
        .eq('tenant_id', tenant.id)
        .eq('hubspot_deal_id', dealId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastRecord?.score === score) {
        results.skipped++;
        continue;
      }

      await supabase.from('deal_health_scores').insert({
        tenant_id:       tenant.id,
        hubspot_deal_id: dealId,
        deal_name:       lastRecord?.deal_name ?? null,
        score,
        source:          'webhook',
        recorded_at:     event.occurredAt
          ? new Date(event.occurredAt).toISOString()
          : new Date().toISOString(),
      });

      results.processed++;
    } catch (err) {
      console.error('[webhook] Error processing event:', err.message, event);
      results.errors++;
    }
  }

  console.log(`[webhook] Done — processed=${results.processed} skipped=${results.skipped} errors=${results.errors}`);
  return res.status(200).json({ ok: true, ...results });
}
