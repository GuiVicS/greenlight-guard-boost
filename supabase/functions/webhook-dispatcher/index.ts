import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookEvent {
  event: string;
  data: Record<string, any>;
}

interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secret: string;
  is_enabled: boolean;
  events: string[];
  headers: Record<string, string>;
  retry_count: number;
  timeout_ms: number;
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
  const delaySeconds = delays[Math.min(attemptCount, delays.length - 1)];
  return new Date(Date.now() + delaySeconds * 1000);
}

// Envia webhook para um endpoint
async function sendWebhook(
  endpoint: WebhookEndpoint,
  eventType: string,
  payload: Record<string, any>,
  eventId: string
): Promise<{ success: boolean; status?: number; body?: string; error?: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadString = JSON.stringify(payload);
  
  try {
    const signature = await generateSignature(payloadString, endpoint.secret, timestamp);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `t=${timestamp},v1=${signature}`,
      'X-Webhook-Event': eventType,
      'X-Webhook-ID': eventId,
      ...endpoint.headers
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
      body: responseBody.substring(0, 1000) // Limita tamanho do log
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

    const { event, data }: WebhookEvent = await req.json();
    
    console.log(`[webhook-dispatcher] Received event: ${event}`);
    console.log(`[webhook-dispatcher] Data:`, JSON.stringify(data));

    // Buscar endpoints que assinam este evento
    const { data: endpoints, error: endpointsError } = await supabase
      .from('webhook_endpoints')
      .select('*')
      .eq('is_enabled', true)
      .contains('events', [event]);

    if (endpointsError) {
      console.error('[webhook-dispatcher] Error fetching endpoints:', endpointsError);
      throw endpointsError;
    }

    if (!endpoints || endpoints.length === 0) {
      console.log(`[webhook-dispatcher] No endpoints subscribed to event: ${event}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No endpoints subscribed to this event',
        event,
        endpoints_count: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[webhook-dispatcher] Found ${endpoints.length} endpoint(s) for event: ${event}`);

    const results = [];

    for (const endpoint of endpoints as WebhookEndpoint[]) {
      // Gerar ID único para este evento
      const eventId = `evt_${crypto.randomUUID().replace(/-/g, '').substring(0, 24)}`;
      
      // Criar payload padrão
      const webhookPayload = {
        id: eventId,
        type: event,
        created_at: new Date().toISOString(),
        data
      };

      // Criar registro de delivery
      const { data: delivery, error: deliveryError } = await supabase
        .from('webhook_deliveries')
        .insert({
          endpoint_id: endpoint.id,
          event_id: eventId,
          event_type: event,
          payload: webhookPayload,
          status: 'pending',
          max_attempts: endpoint.retry_count
        })
        .select()
        .single();

      if (deliveryError) {
        console.error(`[webhook-dispatcher] Error creating delivery for ${endpoint.name}:`, deliveryError);
        results.push({ endpoint: endpoint.name, success: false, error: 'Failed to create delivery record' });
        continue;
      }

      // Tentar enviar webhook
      console.log(`[webhook-dispatcher] Sending to ${endpoint.name} (${endpoint.url})`);
      const result = await sendWebhook(endpoint, event, webhookPayload, eventId);

      // Atualizar registro de delivery
      const updateData: Record<string, any> = {
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        response_status: result.status,
        response_body: result.body || result.error
      };

      if (result.success) {
        updateData.status = 'success';
        updateData.delivered_at = new Date().toISOString();
        console.log(`[webhook-dispatcher] ✓ Successfully delivered to ${endpoint.name}`);
      } else {
        if (endpoint.retry_count > 1) {
          updateData.status = 'pending';
          updateData.next_retry_at = calculateNextRetry(1).toISOString();
          updateData.error_message = result.error || `HTTP ${result.status}`;
          console.log(`[webhook-dispatcher] ✗ Failed to deliver to ${endpoint.name}, will retry at ${updateData.next_retry_at}`);
        } else {
          updateData.status = 'failed';
          updateData.error_message = result.error || `HTTP ${result.status}`;
          console.log(`[webhook-dispatcher] ✗ Failed to deliver to ${endpoint.name}, no retries configured`);
        }
      }

      await supabase
        .from('webhook_deliveries')
        .update(updateData)
        .eq('id', delivery.id);

      results.push({
        endpoint: endpoint.name,
        delivery_id: delivery.id,
        success: result.success,
        status: result.status,
        will_retry: !result.success && endpoint.retry_count > 1
      });
    }

    console.log(`[webhook-dispatcher] Completed dispatching event: ${event}`);
    console.log(`[webhook-dispatcher] Results:`, JSON.stringify(results));

    return new Response(JSON.stringify({
      success: true,
      event,
      endpoints_count: endpoints.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[webhook-dispatcher] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});