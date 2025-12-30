import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secret: string;
  headers: Record<string, string>;
  timeout_ms: number;
  is_enabled: boolean;
}

interface WebhookDeliveryWithEndpoint {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, any>;
  attempt_count: number;
  max_attempts: number;
  endpoint: WebhookEndpoint;
}

// Gera assinatura HMAC-SHA256
async function generateSignature(payload: string, secret: string, timestamp: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signaturePayload = `${timestamp}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signaturePayload));
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Calcula próximo retry com backoff exponencial
function calculateNextRetry(attemptCount: number): Date {
  const delays = [60, 300, 1800, 7200, 14400]; // 1min, 5min, 30min, 2h, 4h
  const delaySeconds = delays[Math.min(attemptCount - 1, delays.length - 1)];
  return new Date(Date.now() + delaySeconds * 1000);
}

// Envia webhook
async function sendWebhook(
  delivery: WebhookDeliveryWithEndpoint
): Promise<{ success: boolean; status?: number; body?: string; error?: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(delivery.payload);
  const endpoint = delivery.endpoint;
  
  try {
    const signature = await generateSignature(payloadString, endpoint.secret, timestamp);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `t=${timestamp},v1=${signature}`,
      'X-Webhook-Event': delivery.event_type,
      'X-Webhook-ID': delivery.event_id,
      'X-Webhook-Retry': delivery.attempt_count.toString(),
      ...(endpoint.headers || {})
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout_ms);
    
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const responseBody = await response.text();
    
    return {
      success: response.ok,
      status: response.status,
      body: responseBody.substring(0, 1000)
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, error: `Timeout after ${endpoint.timeout_ms}ms` };
    }
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[webhook-retry] Starting retry process...');

    // Buscar deliveries pendentes que precisam de retry
    const { data: rawDeliveries, error: deliveriesError } = await supabase
      .from('webhook_deliveries')
      .select(`
        *,
        endpoint:webhook_endpoints(id, name, url, secret, headers, timeout_ms, is_enabled)
      `)
      .eq('status', 'pending')
      .lt('next_retry_at', new Date().toISOString())
      .order('next_retry_at', { ascending: true })
      .limit(50);

    if (deliveriesError) {
      console.error('[webhook-retry] Error fetching deliveries:', deliveriesError);
      throw deliveriesError;
    }

    // Filter deliveries that have valid endpoints and retries available
    const deliveries: WebhookDeliveryWithEndpoint[] = (rawDeliveries || [])
      .filter((d: any) => d.endpoint && d.attempt_count < d.max_attempts)
      .map((d: any) => ({
        ...d,
        endpoint: d.endpoint as WebhookEndpoint
      }));

    if (deliveries.length === 0) {
      console.log('[webhook-retry] No pending deliveries to retry');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No pending deliveries',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[webhook-retry] Found ${deliveries.length} deliveries to retry`);

    let processed = 0;
    let successCount = 0;
    let failedCount = 0;
    let retryingCount = 0;

    for (const delivery of deliveries) {
      processed++;

      // Verificar se o endpoint ainda está ativo
      if (!delivery.endpoint.is_enabled) {
        console.log(`[webhook-retry] Endpoint disabled for delivery ${delivery.id}, marking as failed`);
        await supabase
          .from('webhook_deliveries')
          .update({
            status: 'failed',
            error_message: 'Endpoint disabled',
            last_attempt_at: new Date().toISOString()
          })
          .eq('id', delivery.id);
        failedCount++;
        continue;
      }

      const newAttemptCount = delivery.attempt_count + 1;
      console.log(`[webhook-retry] Retrying delivery ${delivery.id} (attempt ${newAttemptCount}/${delivery.max_attempts})`);

      // Tentar enviar
      const result = await sendWebhook(delivery);

      // Atualizar registro baseado no resultado
      if (result.success) {
        await supabase
          .from('webhook_deliveries')
          .update({
            attempt_count: newAttemptCount,
            last_attempt_at: new Date().toISOString(),
            response_status: result.status || null,
            response_body: result.body || null,
            status: 'success',
            delivered_at: new Date().toISOString(),
            next_retry_at: null
          })
          .eq('id', delivery.id);
        console.log(`[webhook-retry] ✓ Successfully delivered ${delivery.id}`);
        successCount++;
      } else if (newAttemptCount >= delivery.max_attempts) {
        await supabase
          .from('webhook_deliveries')
          .update({
            attempt_count: newAttemptCount,
            last_attempt_at: new Date().toISOString(),
            response_status: result.status || null,
            response_body: result.body || result.error || null,
            status: 'failed',
            error_message: result.error || `HTTP ${result.status}`,
            next_retry_at: null
          })
          .eq('id', delivery.id);
        console.log(`[webhook-retry] ✗ Max attempts reached for ${delivery.id}, marking as failed`);
        failedCount++;
      } else {
        const nextRetryAt = calculateNextRetry(newAttemptCount).toISOString();
        await supabase
          .from('webhook_deliveries')
          .update({
            attempt_count: newAttemptCount,
            last_attempt_at: new Date().toISOString(),
            response_status: result.status || null,
            response_body: result.body || result.error || null,
            status: 'pending',
            next_retry_at: nextRetryAt,
            error_message: result.error || `HTTP ${result.status}`
          })
          .eq('id', delivery.id);
        console.log(`[webhook-retry] ✗ Failed ${delivery.id}, will retry at ${nextRetryAt}`);
        retryingCount++;
      }
    }

    console.log('[webhook-retry] Retry process completed:', { processed, successCount, failedCount, retryingCount });

    return new Response(JSON.stringify({
      processed,
      success: successCount,
      failed: failedCount,
      retrying: retryingCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[webhook-retry] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});