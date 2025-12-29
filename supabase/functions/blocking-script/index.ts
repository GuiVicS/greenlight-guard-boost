import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/javascript",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const publicKey = url.searchParams.get("key");

    if (!publicKey) {
      return new Response(
        "// Missing public key",
        { headers: corsHeaders, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch asset by public key
    const { data: asset, error } = await supabase
      .from("assets")
      .select("id, name, status, block_reason, checkout_logo_url, checkout_message, checkout_primary_color, client_id")
      .eq("public_key", publicKey)
      .single();

    if (error || !asset) {
      return new Response(
        "// Asset not found",
        { headers: corsHeaders, status: 404 }
      );
    }

    // Log access
    const userAgent = req.headers.get("user-agent") || null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || null;

    await supabase.from("access_logs").insert({
      asset_id: asset.id,
      action: "script_loaded",
      user_agent: userAgent,
      ip_address: ip,
      details: { status: asset.status }
    });

    // If asset is active, return minimal script
    if (asset.status === "active") {
      return new Response(
        "(function(){console.log('Asset verified: " + asset.name + "');})();",
        { headers: corsHeaders }
      );
    }

    // Get app settings for checkout URL
    const { data: appSettings } = await supabase
      .from("app_settings")
      .select("checkout_base_url")
      .single();

    // Get subscription to find the country for translations
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id, country")
      .eq("asset_id", asset.id)
      .eq("status", "overdue")
      .single();

    // Build checkout URL from app settings
    const baseUrl = appSettings?.checkout_base_url?.replace(/\/$/, "") || "";
    const checkoutUrl = baseUrl ? `${baseUrl}/checkout/${asset.id}` : "#";

    const primaryColor = asset.checkout_primary_color || "#dc2626";
    const logoUrl = asset.checkout_logo_url || "";

    // Determine language based on subscription country
    const country = subscription?.country || "BR";
    const translations: Record<string, { title: string; buttonText: string; defaultMessage: string }> = {
      BR: {
        title: "Site Bloqueado",
        buttonText: "Regularizar Pagamento",
        defaultMessage: "Este site está temporariamente bloqueado devido a pendências financeiras."
      },
      PT: {
        title: "Site Bloqueado",
        buttonText: "Regularizar Pagamento",
        defaultMessage: "Este site está temporariamente bloqueado devido a pendências financeiras."
      },
      US: {
        title: "Site Blocked",
        buttonText: "Make Payment",
        defaultMessage: "This site is temporarily blocked due to pending payments."
      },
      ES: {
        title: "Sitio Bloqueado",
        buttonText: "Regularizar Pago",
        defaultMessage: "Este sitio está temporalmente bloqueado debido a pagos pendientes."
      },
      MX: {
        title: "Sitio Bloqueado",
        buttonText: "Regularizar Pago",
        defaultMessage: "Este sitio está temporalmente bloqueado debido a pagos pendientes."
      }
    };

    const t = translations[country] || translations.BR;
    
    // Only use checkout_message (custom message), NOT block_reason (internal use only)
    const displayMessage = asset.checkout_message || t.defaultMessage;

    const logoHtml = logoUrl ? '<img src="' + logoUrl + '" alt="Logo" style="max-height: 60px; margin-bottom: 24px;" />' : '';

    const overlayScript = `
(function() {
  if (document.getElementById('asset-block-overlay')) return;
  
  var overlay = document.createElement('div');
  overlay.id = 'asset-block-overlay';
  overlay.innerHTML = '<div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.95); z-index: 2147483647; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;"><div style="background: #1a1a1a; border-radius: 16px; padding: 48px; max-width: 480px; width: 90%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border: 1px solid #333;">${logoHtml}<div style="width: 64px; height: 64px; background: ${primaryColor}20; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${primaryColor}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 16px;">${t.title}</h1><p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 32px;">${displayMessage}</p><a href="${checkoutUrl}" style="display: inline-block; background: ${primaryColor}; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">${t.buttonText}</a></div></div>';
  
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
})();
`;

    return new Response(overlayScript, { headers: corsHeaders });
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      "// Error: " + errorMessage,
      { headers: corsHeaders, status: 500 }
    );
  }
});
