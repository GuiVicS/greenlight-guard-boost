import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "get" | "save" | "connect" | "status" | "logout" | "delete";

interface Body {
  action: Action;
  serverUrl?: string;
  apiKey?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

async function evoFetch(
  serverUrl: string,
  path: string,
  apiKey: string,
  init: RequestInit = {},
) {
  const res = await fetch(`${normalizeUrl(serverUrl)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> | null };
}

function extractQr(data: Record<string, unknown> | null): { qrcode?: string; pairingCode?: string } {
  if (!data) return {};
  const qrNode = (data.qrcode ?? data.qrCode ?? data) as Record<string, unknown>;
  const base64 = (qrNode?.base64 ?? data.base64 ?? qrNode?.code ?? data.code) as string | undefined;
  const pairingCode = (qrNode?.pairingCode ?? data.pairingCode) as string | undefined;
  if (!base64) return { pairingCode };
  const qrcode = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  return { qrcode, pairingCode };
}

function extractState(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const instance = (data.instance ?? data) as Record<string, unknown>;
  const state = (instance?.state ?? instance?.status ?? data.state) as string | undefined;
  return state ?? null;
}

function friendlyError(status: number, data: Record<string, unknown> | null): string {
  const raw =
    (data?.message as string) ||
    (data?.error as string) ||
    (Array.isArray(data?.response) ? String(data?.response) : "") ||
    "";
  const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (status === 401 || status === 403 || /unauthorized|invalid.*key/i.test(msg)) {
    return "API Key inválida ou sem permissão no servidor Evolution.";
  }
  if (status === 404) return "Instância ou endpoint não encontrado no servidor Evolution.";
  if (/already in use|already exists/i.test(msg)) return "Já existe uma instância com esse nome.";
  return msg || `Erro na Evolution API (HTTP ${status}).`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // --- Auth: only admin/staff can manage the integration ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Não autenticado." }, 401);

    const { data: allowed } = await admin.rpc("is_admin_or_staff", { _user_id: userData.user.id });
    if (!allowed) return json({ error: "Sem permissão." }, 403);

    const body = (await req.json().catch(() => ({}))) as Body;
    const action = body.action;

    // Load (or lazily create) the single settings row
    const { data: existing } = await admin
      .from("evolution_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let settings = existing;
    if (!settings) {
      const { data: created, error } = await admin
        .from("evolution_settings")
        .insert({})
        .select("*")
        .single();
      if (error) throw error;
      settings = created;
    }

    const publicView = (s: Record<string, unknown>) => ({
      hasCredentials: Boolean(s.server_url && s.global_api_key),
      serverUrl: s.server_url ?? "",
      instanceName: s.instance_name ?? null,
      connectionState: s.connection_state ?? "close",
      connectedNumber: s.connected_number ?? null,
      profileName: s.profile_name ?? null,
      isConfigured: Boolean(s.is_configured),
      updatedAt: s.updated_at ?? null,
    });

    if (action === "get") {
      return json({ settings: publicView(settings) });
    }

    if (action === "save") {
      const serverUrl = body.serverUrl?.trim();
      if (!serverUrl || !/^https?:\/\//i.test(serverUrl)) {
        return json({ error: "Informe a URL do servidor Evolution (https://...)." }, 400);
      }
      const update: Record<string, unknown> = { server_url: normalizeUrl(serverUrl) };
      if (body.apiKey && body.apiKey.trim()) update.global_api_key = body.apiKey.trim();
      if (!settings.global_api_key && !update.global_api_key) {
        return json({ error: "Informe a API Key global da Evolution API." }, 400);
      }
      update.is_configured = true;

      const { data: saved, error } = await admin
        .from("evolution_settings")
        .update(update)
        .eq("id", settings.id)
        .select("*")
        .single();
      if (error) throw error;
      return json({ settings: publicView(saved) });
    }

    const serverUrl = settings.server_url as string | null;
    const apiKey = settings.global_api_key as string | null;
    if (!serverUrl || !apiKey) {
      return json({ error: "Credenciais da Evolution API não configuradas." }, 400);
    }

    if (action === "connect") {
      let instanceName = settings.instance_name as string | null;
      let instanceToken = (settings.instance_token as string | null) || apiKey;

      // 1) Create the instance on first connection
      if (!instanceName) {
        instanceName = `siteguard-${crypto.randomUUID().slice(0, 8)}`;
        const created = await evoFetch(serverUrl, "/instance/create", apiKey, {
          method: "POST",
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
          }),
        });

        if (!created.ok) {
          return json({ error: friendlyError(created.status, created.data) }, 200);
        }

        const d = created.data ?? {};
        const inst = (d.instance ?? {}) as Record<string, unknown>;
        const hashNode = d.hash as Record<string, unknown> | string | undefined;
        const instanceApiKey =
          typeof hashNode === "string"
            ? hashNode
            : ((hashNode?.apikey as string) ?? (d.apikey as string) ?? null);

        instanceToken = instanceApiKey || apiKey;

        await admin
          .from("evolution_settings")
          .update({
            instance_name: instanceName,
            instance_id: (inst.instanceId as string) ?? (d.instanceId as string) ?? null,
            instance_token: instanceToken,
            connection_state: "connecting",
          })
          .eq("id", settings.id);

        const qr = extractQr(d);
        if (qr.qrcode || qr.pairingCode) {
          return json({ instanceName, connectionState: "connecting", ...qr });
        }
      }

      // 2) Reuse existing instance: ask for a fresh QR code
      const connected = await evoFetch(
        serverUrl,
        `/instance/connect/${encodeURIComponent(instanceName!)}`,
        instanceToken,
      );
      if (!connected.ok) {
        return json({ error: friendlyError(connected.status, connected.data) }, 200);
      }
      const qr = extractQr(connected.data);
      await admin
        .from("evolution_settings")
        .update({ connection_state: "connecting" })
        .eq("id", settings.id);

      return json({ instanceName, connectionState: "connecting", ...qr });
    }

    if (action === "status") {
      const instanceName = settings.instance_name as string | null;
      if (!instanceName) return json({ connectionState: "close" });
      const instanceToken = (settings.instance_token as string | null) || apiKey;

      const res = await evoFetch(
        serverUrl,
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
        instanceToken,
      );
      if (!res.ok) {
        return json({ connectionState: settings.connection_state ?? "close", error: friendlyError(res.status, res.data) });
      }
      const state = extractState(res.data) ?? "close";

      let connectedNumber: string | null = settings.connected_number as string | null;
      let profileName: string | null = settings.profile_name as string | null;

      if (state === "open") {
        const info = await evoFetch(serverUrl, "/instance/fetchInstances", apiKey);
        if (info.ok && Array.isArray(info.data)) {
          const match = (info.data as Array<Record<string, unknown>>).find((row) => {
            const inst = (row.instance ?? row) as Record<string, unknown>;
            return inst?.instanceName === instanceName || inst?.name === instanceName;
          });
          if (match) {
            const inst = (match.instance ?? match) as Record<string, unknown>;
            connectedNumber =
              ((inst.owner as string) ?? (inst.ownerJid as string) ?? connectedNumber ?? null)?.toString()
                .replace(/@.*/, "") ?? null;
            profileName = (inst.profileName as string) ?? (inst.profileName as string) ?? profileName;
          }
        }
      }

      await admin
        .from("evolution_settings")
        .update({
          connection_state: state,
          connected_number: state === "open" ? connectedNumber : null,
          profile_name: state === "open" ? profileName : null,
        })
        .eq("id", settings.id);

      return json({ connectionState: state, connectedNumber, profileName, instanceName });
    }

    if (action === "logout") {
      const instanceName = settings.instance_name as string | null;
      if (!instanceName) return json({ connectionState: "close" });
      const instanceToken = (settings.instance_token as string | null) || apiKey;
      const res = await evoFetch(
        serverUrl,
        `/instance/logout/${encodeURIComponent(instanceName)}`,
        instanceToken,
        { method: "DELETE" },
      );
      await admin
        .from("evolution_settings")
        .update({ connection_state: "close", connected_number: null, profile_name: null })
        .eq("id", settings.id);
      if (!res.ok) return json({ connectionState: "close", error: friendlyError(res.status, res.data) });
      return json({ connectionState: "close" });
    }

    if (action === "delete") {
      const instanceName = settings.instance_name as string | null;
      if (instanceName) {
        const instanceToken = (settings.instance_token as string | null) || apiKey;
        await evoFetch(
          serverUrl,
          `/instance/delete/${encodeURIComponent(instanceName)}`,
          instanceToken,
          { method: "DELETE" },
        );
      }
      await admin
        .from("evolution_settings")
        .update({
          instance_name: null,
          instance_id: null,
          instance_token: null,
          connection_state: "close",
          connected_number: null,
          profile_name: null,
        })
        .eq("id", settings.id);
      return json({ connectionState: "close", removed: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    console.error("evolution-instance error:", message);
    return json({ error: message }, 500);
  }
});
