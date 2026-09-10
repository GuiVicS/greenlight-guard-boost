import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { assetId, planName, monthlyValue, country = "BR" } = await req.json();

    if (!assetId || !planName || !monthlyValue) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: assetId, planName, monthlyValue" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get Stripe settings
    const { data: stripeSettings, error: settingsError } = await supabase
      .from("stripe_settings")
      .select("*")
      .eq("is_configured", true)
      .single();

    if (settingsError || !stripeSettings?.secret_key_encrypted) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const currency = country === "BR" ? "brl" : country === "US" ? "usd" : "eur";
    const amountInCents = Math.round(monthlyValue * 100);
    const secretKey = stripeSettings.secret_key_encrypted;

    // Create Stripe product
    const productResponse = await fetch("https://api.stripe.com/v1/products", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        name: planName,
        metadata: JSON.stringify({ asset_id: assetId }),
      }),
    });

    const product = await productResponse.json();

    if (product.error) {
      console.error("Stripe product error:", product.error);
      return new Response(
        JSON.stringify({ error: product.error.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create recurring price
    const priceResponse = await fetch("https://api.stripe.com/v1/prices", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "product": product.id,
        "unit_amount": String(amountInCents),
        "currency": currency,
        "recurring[interval]": "month",
        "metadata[asset_id]": assetId,
      }),
    });

    const price = await priceResponse.json();

    if (price.error) {
      console.error("Stripe price error:", price.error);
      return new Response(
        JSON.stringify({ error: price.error.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Save stripe_price_id to asset
    const { error: updateError } = await supabase
      .from("assets")
      .update({ stripe_price_id: price.id })
      .eq("id", assetId);

    if (updateError) {
      console.error("Error saving price_id to asset:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save price_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        priceId: price.id,
        productId: product.id,
        assetId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
