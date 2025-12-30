import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BillingSettings {
  is_enabled: boolean;
  max_auto_charge_attempts: number;
  notification_days_before_block: number;
  evolution_api_url: string | null;
  evolution_instance: string | null;
  sender_email: string | null;
  sender_name: string | null;
  email_subject_template: string | null;
  email_message_template: string | null;
  whatsapp_message_template: string | null;
}

interface OverdueSubscription {
  id: string;
  asset_id: string;
  plan_name: string;
  due_date: string;
  monthly_value: number;
  failed_charge_count: number;
  notification_started_at: string | null;
  notification_days_count: number;
  last_charge_attempt: string | null;
  auto_charge_enabled: boolean;
  assets: {
    id: string;
    name: string;
    clients: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
    };
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("=== STARTING OVERDUE CHECK ===");
    const today = new Date().toISOString().split('T')[0];

    // Get billing settings
    const { data: billingSettings } = await supabase
      .from("billing_settings")
      .select("*")
      .maybeSingle();

    const settings: BillingSettings = {
      is_enabled: billingSettings?.is_enabled ?? false,
      max_auto_charge_attempts: billingSettings?.max_auto_charge_attempts ?? 4,
      notification_days_before_block: billingSettings?.notification_days_before_block ?? 2,
      evolution_api_url: billingSettings?.evolution_api_url,
      evolution_instance: billingSettings?.evolution_instance,
      sender_email: billingSettings?.sender_email,
      sender_name: billingSettings?.sender_name,
      email_subject_template: billingSettings?.email_subject_template,
      email_message_template: billingSettings?.email_message_template,
      whatsapp_message_template: billingSettings?.whatsapp_message_template,
    };

    console.log("Billing settings:", {
      is_enabled: settings.is_enabled,
      max_auto_charge_attempts: settings.max_auto_charge_attempts,
      notification_days_before_block: settings.notification_days_before_block,
    });

    // Find all active subscriptions that are past due date
    const { data: overdueSubscriptions, error: fetchError } = await supabase
      .from("subscriptions")
      .select(`
        id,
        asset_id,
        plan_name,
        due_date,
        monthly_value,
        failed_charge_count,
        notification_started_at,
        notification_days_count,
        last_charge_attempt,
        auto_charge_enabled,
        assets!inner (
          id,
          name,
          clients!inner (
            id,
            name,
            email,
            phone
          )
        )
      `)
      .eq("status", "active")
      .lt("due_date", today);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${overdueSubscriptions?.length || 0} overdue active subscriptions`);

    const results = {
      checked: 0,
      auto_charge_attempts: 0,
      notifications_sent: 0,
      blocked: 0,
      errors: [] as string[],
    };

    for (const sub of (overdueSubscriptions || []) as unknown as OverdueSubscription[]) {
      results.checked++;
      const client = sub.assets?.clients;
      const failedCount = sub.failed_charge_count || 0;
      const notificationDays = sub.notification_days_count || 0;

      console.log(`\n--- Processing subscription ${sub.id} ---`);
      console.log(`Plan: ${sub.plan_name}, Due: ${sub.due_date}`);
      console.log(`Failed charges: ${failedCount}, Notification days: ${notificationDays}`);

      // PHASE 1: Auto-charge attempts (if enabled)
      if (settings.is_enabled && sub.auto_charge_enabled && failedCount < settings.max_auto_charge_attempts) {
        console.log(`Attempting auto-charge (attempt ${failedCount + 1}/${settings.max_auto_charge_attempts})`);
        
        // TODO: Implement actual auto-charge via Stripe/MercadoPago
        // For now, we just log the attempt and increment the counter
        
        await supabase.from("billing_attempts").insert({
          subscription_id: sub.id,
          attempt_type: "auto_charge",
          attempt_number: failedCount + 1,
          status: "pending",
          sent_to: client?.email,
          metadata: {
            plan_name: sub.plan_name,
            amount: sub.monthly_value,
          }
        });

        // Increment failed charge count (simulating failed charge)
        await supabase
          .from("subscriptions")
          .update({
            failed_charge_count: failedCount + 1,
            last_charge_attempt: new Date().toISOString(),
          })
          .eq("id", sub.id);

        results.auto_charge_attempts++;
        continue; // Wait for next cycle
      }

      // PHASE 2: Notification period (after max auto-charge attempts)
      if (settings.is_enabled && notificationDays < settings.notification_days_before_block) {
        console.log(`Sending notifications (day ${notificationDays + 1}/${settings.notification_days_before_block})`);
        
        // Start notification period if not started
        if (!sub.notification_started_at) {
          await supabase
            .from("subscriptions")
            .update({ notification_started_at: new Date().toISOString() })
            .eq("id", sub.id);
        }

        // Get app settings for checkout URL
        const { data: appSettings } = await supabase
          .from("app_settings")
          .select("checkout_base_url")
          .maybeSingle();

        const checkoutUrl = appSettings?.checkout_base_url 
          ? `${appSettings.checkout_base_url}/checkout/${sub.asset_id}`
          : `https://siteguard.lovable.app/checkout/${sub.asset_id}`;

        const daysRemaining = settings.notification_days_before_block - notificationDays;

        // Send Email notification
        if (settings.sender_email && client?.email) {
          await supabase.from("billing_attempts").insert({
            subscription_id: sub.id,
            attempt_type: "email",
            attempt_number: notificationDays + 1,
            status: "pending",
            sent_to: client.email,
            metadata: {
              plan_name: sub.plan_name,
              amount: sub.monthly_value,
              checkout_url: checkoutUrl,
              days_remaining: daysRemaining,
            }
          });
          console.log(`Email notification queued for ${client.email}`);
        }

        // Send WhatsApp notification
        if (settings.evolution_api_url && settings.evolution_instance && client?.phone) {
          await supabase.from("billing_attempts").insert({
            subscription_id: sub.id,
            attempt_type: "whatsapp",
            attempt_number: notificationDays + 1,
            status: "pending",
            sent_to: client.phone,
            metadata: {
              plan_name: sub.plan_name,
              amount: sub.monthly_value,
              checkout_url: checkoutUrl,
              days_remaining: daysRemaining,
            }
          });
          console.log(`WhatsApp notification queued for ${client.phone}`);
        }

        // Increment notification days count
        await supabase
          .from("subscriptions")
          .update({ notification_days_count: notificationDays + 1 })
          .eq("id", sub.id);

        results.notifications_sent++;
        continue; // Wait for next cycle
      }

      // PHASE 3: Block asset (after notification period expires)
      console.log("Notification period expired, blocking asset...");

      // Update subscription status to overdue
      const { error: updateSubError } = await supabase
        .from("subscriptions")
        .update({ status: "overdue" })
        .eq("id", sub.id);

      if (updateSubError) {
        console.error(`Error updating subscription ${sub.id}:`, updateSubError);
        results.errors.push(`Sub ${sub.id}: ${updateSubError.message}`);
        continue;
      }

      // Block the associated asset
      const { error: updateAssetError } = await supabase
        .from("assets")
        .update({
          status: "blocked",
          block_reason: `Assinatura vencida desde ${new Date(sub.due_date).toLocaleDateString('pt-BR')}. Após ${settings.max_auto_charge_attempts} tentativas de cobrança e ${settings.notification_days_before_block} dias de notificação.`
        })
        .eq("id", sub.asset_id);

      if (updateAssetError) {
        console.error(`Error blocking asset ${sub.asset_id}:`, updateAssetError);
        results.errors.push(`Asset ${sub.asset_id}: ${updateAssetError.message}`);
        continue;
      }

      // Log the blocking action
      await supabase.from("access_logs").insert({
        asset_id: sub.asset_id,
        action: "auto_block",
        details: {
          reason: "overdue_subscription",
          subscription_id: sub.id,
          due_date: sub.due_date,
          failed_charge_attempts: failedCount,
          notification_days: notificationDays,
        },
      });

      // Log billing attempt for block
      await supabase.from("billing_attempts").insert({
        subscription_id: sub.id,
        attempt_type: "block",
        attempt_number: 1,
        status: "success",
        metadata: {
          plan_name: sub.plan_name,
          due_date: sub.due_date,
          failed_charges: failedCount,
          notification_days: notificationDays,
        }
      });

      results.blocked++;
      console.log(`Blocked asset ${sub.asset_id} due to overdue subscription ${sub.id}`);
    }

    const summary = {
      success: true,
      checked_at: new Date().toISOString(),
      billing_enabled: settings.is_enabled,
      ...results,
    };

    console.log("\n=== OVERDUE CHECK COMPLETED ===");
    console.log(JSON.stringify(summary, null, 2));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in check-overdue function:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
