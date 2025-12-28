import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting overdue check...");

    // Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Find all active subscriptions that are past due date
    const { data: overdueSubscriptions, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, asset_id, plan_name, due_date")
      .eq("status", "active")
      .lt("due_date", today);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${overdueSubscriptions?.length || 0} overdue subscriptions`);

    let updatedCount = 0;
    let blockedCount = 0;

    for (const subscription of overdueSubscriptions || []) {
      // Update subscription status to overdue
      const { error: updateSubError } = await supabase
        .from("subscriptions")
        .update({ status: "overdue" })
        .eq("id", subscription.id);

      if (updateSubError) {
        console.error(`Error updating subscription ${subscription.id}:`, updateSubError);
        continue;
      }

      updatedCount++;

      // Block the associated asset
      const { error: updateAssetError } = await supabase
        .from("assets")
        .update({ 
          status: "blocked",
          block_reason: `Assinatura vencida desde ${new Date(subscription.due_date).toLocaleDateString('pt-BR')}`
        })
        .eq("id", subscription.asset_id);

      if (updateAssetError) {
        console.error(`Error blocking asset ${subscription.asset_id}:`, updateAssetError);
        continue;
      }

      blockedCount++;

      // Log the blocking action
      await supabase
        .from("access_logs")
        .insert({
          asset_id: subscription.asset_id,
          action: "auto_block",
          details: {
            reason: "overdue_subscription",
            subscription_id: subscription.id,
            due_date: subscription.due_date,
          },
        });

      console.log(`Blocked asset ${subscription.asset_id} due to overdue subscription ${subscription.id}`);
    }

    const result = {
      success: true,
      checked_at: new Date().toISOString(),
      overdue_found: overdueSubscriptions?.length || 0,
      subscriptions_updated: updatedCount,
      assets_blocked: blockedCount,
    };

    console.log("Overdue check completed:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in check-overdue function:", errorMessage);

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
