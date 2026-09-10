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
  stripe_customer_id: string | null;
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

    // Get checkout base URL from app settings
    const { data: appSettings } = await supabase
      .from("app_settings")
      .select("checkout_base_url")
      .maybeSingle();

    const checkoutBaseUrl = appSettings?.checkout_base_url || supabaseUrl.replace('.supabase.co', '.lovable.app');

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
        stripe_customer_id,
        stripe_subscription_id,
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
      auto_charge_success: 0,
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

      const checkoutUrl = `${checkoutBaseUrl}/checkout/${sub.asset_id}`;
      const daysRemaining = settings.notification_days_before_block - notificationDays;

      // PHASE 1: Auto-charge attempts (if enabled)
      // Skip local auto-charge when Stripe manages the subscription; webhooks update state.
      if (!sub.stripe_subscription_id && settings.is_enabled && sub.auto_charge_enabled && failedCount < settings.max_auto_charge_attempts) {
        console.log(`Attempting auto-charge (attempt ${failedCount + 1}/${settings.max_auto_charge_attempts})`);
        
        try {
          // Call the auto-charge function
          const { data: chargeResult, error: chargeError } = await supabase.functions.invoke("process-auto-charge", {
            body: {
              subscriptionId: sub.id,
              attemptNumber: failedCount + 1,
            },
          });

          if (chargeError) {
            console.error("Auto-charge invocation error:", chargeError);
            results.errors.push(`Sub ${sub.id}: ${chargeError.message}`);
          } else if (chargeResult?.success) {
            console.log(`Auto-charge successful for ${sub.id}`);
            results.auto_charge_success++;
            results.auto_charge_attempts++;
            continue; // Payment successful, move to next subscription
          } else {
            console.log(`Auto-charge failed for ${sub.id}: ${chargeResult?.error}`);
          }

          results.auto_charge_attempts++;
          continue; // Wait for next cycle after charge attempt
        } catch (chargeErr: any) {
          console.error("Auto-charge error:", chargeErr);
          results.errors.push(`Sub ${sub.id} auto-charge: ${chargeErr.message}`);
        }
      }

      // For Stripe-managed subscriptions, only notifications/blocking logic continues if past due.
      if (sub.stripe_subscription_id) {
        console.log(`Subscription ${sub.id} is managed by Stripe (${sub.stripe_subscription_id}); skipping local charge phase.`);
      }

      // PHASE 2: Notification period (after max auto-charge attempts or auto-charge disabled)
      if (settings.is_enabled && notificationDays < settings.notification_days_before_block) {
        console.log(`Sending notifications (day ${notificationDays + 1}/${settings.notification_days_before_block})`);
        
        // Start notification period if not started
        if (!sub.notification_started_at) {
          await supabase
            .from("subscriptions")
            .update({ notification_started_at: new Date().toISOString() })
            .eq("id", sub.id);
        }

        // Send Email notification
        if (settings.sender_email && client?.email) {
          const { data: emailAttempt } = await supabase.from("billing_attempts").insert({
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
          }).select().single();

          // Invoke email sending function
          try {
            await supabase.functions.invoke("send-billing-email", {
              body: {
                attemptId: emailAttempt?.id,
                to: client.email,
                clientName: client.name,
                planName: sub.plan_name,
                amount: sub.monthly_value,
                dueDate: sub.due_date,
                checkoutUrl,
                daysRemaining,
              },
            });
            console.log(`Email sent to ${client.email}`);
          } catch (emailErr: any) {
            console.error(`Failed to send email to ${client.email}:`, emailErr);
            if (emailAttempt?.id) {
              await supabase
                .from("billing_attempts")
                .update({ status: "failed", error_message: emailErr.message })
                .eq("id", emailAttempt.id);
            }
          }
        }

        // Send WhatsApp notification
        if (settings.evolution_api_url && settings.evolution_instance && client?.phone) {
          const { data: whatsappAttempt } = await supabase.from("billing_attempts").insert({
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
          }).select().single();

          // Invoke WhatsApp sending function
          try {
            await supabase.functions.invoke("send-billing-whatsapp", {
              body: {
                attemptId: whatsappAttempt?.id,
                phone: client.phone,
                clientName: client.name,
                planName: sub.plan_name,
                amount: sub.monthly_value,
                dueDate: sub.due_date,
                checkoutUrl,
                daysRemaining,
              },
            });
            console.log(`WhatsApp sent to ${client.phone}`);
          } catch (whatsappErr: any) {
            console.error(`Failed to send WhatsApp to ${client.phone}:`, whatsappErr);
            if (whatsappAttempt?.id) {
              await supabase
                .from("billing_attempts")
                .update({ status: "failed", error_message: whatsappErr.message })
                .eq("id", whatsappAttempt.id);
            }
          }
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
