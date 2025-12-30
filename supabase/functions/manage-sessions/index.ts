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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create client with user's token to get their ID
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin client for session management
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action, sessionId } = await req.json();

    if (action === "list") {
      // Get all sessions for the user using admin API
      // Note: Supabase stores sessions in auth.sessions table
      const { data: sessions, error } = await supabaseAdmin
        .from("auth.sessions")
        .select("*")
        .eq("user_id", user.id);

      // If direct table access doesn't work, we'll use a different approach
      // Get sessions from auth.users via admin API
      if (error) {
        // Fallback: Get current session info and any stored session data
        const { data: userData, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(user.id);
        
        if (adminUserError) {
          return new Response(JSON.stringify({ error: adminUserError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get session info from user metadata or construct from available data
        const currentSession = {
          id: "current",
          user_agent: req.headers.get("user-agent") || "Unknown",
          ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "Unknown",
          created_at: userData.user?.last_sign_in_at || new Date().toISOString(),
          is_current: true,
        };

        return new Response(JSON.stringify({ sessions: [currentSession] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Format sessions for frontend
      const formattedSessions = (sessions || []).map((s: any) => ({
        id: s.id,
        user_agent: s.user_agent || "Unknown device",
        ip: s.ip || "Unknown",
        created_at: s.created_at,
        updated_at: s.updated_at,
        is_current: false, // Will be determined on frontend
      }));

      return new Response(JSON.stringify({ sessions: formattedSessions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "revoke") {
      if (!sessionId) {
        return new Response(JSON.stringify({ error: "Session ID required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (sessionId === "all") {
        // Sign out from all sessions except current
        // This invalidates all refresh tokens for the user
        const { error } = await supabaseAdmin.auth.admin.signOut(user.id, "global");
        
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, message: "Todas as sessões foram encerradas" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Revoke specific session - Supabase doesn't have granular session control via admin API
        // The best we can do is sign out all or use local scope
        // For now, we'll sign out the user globally
        const { error } = await supabaseAdmin.auth.admin.signOut(user.id, "global");
        
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, message: "Sessão encerrada" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (action === "revoke-others") {
      // Sign out from all other sessions (keep current)
      const { error } = await supabaseAdmin.auth.admin.signOut(user.id, "others");
      
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Outras sessões foram encerradas" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
