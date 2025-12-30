import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch Mercado Pago settings
    const { data: mpSettings, error } = await supabase
      .from("mercadopago_settings")
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Error fetching MP settings:", error);
      throw new Error("Failed to fetch payment settings");
    }

    if (!mpSettings || !mpSettings.is_configured) {
      return new Response(
        JSON.stringify({ error: "Mercado Pago not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The access token contains the public key information
    // For Mercado Pago, the public key is typically stored separately or derived
    // In this implementation, we need to fetch it from the credentials
    
    // Get the access token based on sandbox mode
    const accessToken = mpSettings.is_sandbox 
      ? mpSettings.sandbox_access_token_encrypted 
      : mpSettings.access_token_encrypted;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Access token not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch public key from Mercado Pago API
    const credentialsResponse = await fetch(
      "https://api.mercadopago.com/users/me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!credentialsResponse.ok) {
      console.error("Failed to fetch MP credentials");
      throw new Error("Failed to fetch payment credentials");
    }

    const credentials = await credentialsResponse.json();
    
    // The public key can be obtained from the live_credentials or test_credentials
    // For sandbox mode, use test credentials
    let publicKey: string | null = null;

    // Try to get public key from credential endpoints
    const publicKeyResponse = await fetch(
      "https://api.mercadopago.com/plugins-credentials-wrapper/credentials",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (publicKeyResponse.ok) {
      const credData = await publicKeyResponse.json();
      publicKey = mpSettings.is_sandbox 
        ? credData.sandbox_public_key || credData.public_key
        : credData.public_key;
    }

    // If we couldn't get the public key, return error
    if (!publicKey) {
      console.error("Could not retrieve public key from Mercado Pago");
      return new Response(
        JSON.stringify({ 
          error: "Public key not available",
          hint: "Please ensure your Mercado Pago account has API credentials configured"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Successfully retrieved MP public key");

    return new Response(
      JSON.stringify({ publicKey, isSandbox: mpSettings.is_sandbox }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in get-mercadopago-public-key:", errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
