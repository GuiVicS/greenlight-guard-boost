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

    // Get the public key based on sandbox mode
    const publicKey = mpSettings.is_sandbox 
      ? mpSettings.sandbox_public_key 
      : mpSettings.public_key;

    if (!publicKey) {
      console.error("Public key not configured in mercadopago_settings");
      return new Response(
        JSON.stringify({ 
          error: "Public key not configured",
          hint: "Please add your Mercado Pago public key in the payment gateway settings"
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