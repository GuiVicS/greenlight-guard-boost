// Helpers to turn backend (Lovable Cloud function) errors into user-friendly PT-BR messages

export function translateMercadoPagoStatusDetail(statusDetail?: string | null): string | null {
  if (!statusDetail) return null;

  const map: Record<string, string> = {
    rejected_by_bank: "Pagamento recusado pelo banco. Tente outro cartão ou método.",
    cc_rejected_high_risk: "Pagamento recusado por segurança. Tente outro cartão ou método.",
    cc_rejected_bad_filled_security_code: "CVV inválido. Confira o código de segurança.",
    cc_rejected_bad_filled_date: "Validade do cartão inválida. Confira e tente novamente.",
    cc_rejected_bad_filled_card_number: "Número do cartão inválido. Confira e tente novamente.",
    cc_rejected_insufficient_amount: "Saldo/limite insuficiente no cartão.",
    cc_rejected_call_for_authorize: "Pagamento não autorizado. Entre em contato com o banco.",
    cc_rejected_other_reason: "Pagamento recusado. Tente outro cartão ou método.",
  };

  return map[statusDetail] || null;
}

export function translateMercadoPagoMessage(message: string): string {
  const msg = String(message || "").trim();
  const lower = msg.toLowerCase();

  if (!msg) return "Não foi possível concluir a operação.";

  // Mercado Pago API common messages
  if (lower.includes("invalid user identification number")) {
    return "CPF/CNPJ inválido. Confira o número e tente novamente.";
  }
  if (lower.includes("invalid transaction_amount") || lower.includes("4037")) {
    return "Valor mínimo para boleto é R$ 5,00.";
  }

  // Keep already-PT messages
  return msg;
}

export async function getEdgeFunctionErrorMessage(
  error: unknown,
  fallback: string = "Não foi possível concluir a operação."
): Promise<string> {
  const anyErr = error as any;

  // Default to message
  let message = anyErr?.message ? String(anyErr.message) : fallback;

  // supabase-js FunctionsHttpError usually contains context.response
  const response: Response | undefined = anyErr?.context?.response;
  if (response) {
    try {
      const cloned = response.clone();
      const json = await cloned.json().catch(() => null);
      if (json && typeof json === "object") {
        if (json.error) message = String(json.error);
        else if (json.message) message = String(json.message);
      } else {
        const text = await response.clone().text().catch(() => "");
        if (text) message = text;
      }
    } catch {
      // ignore
    }
  }

  // If it's the generic supabase message, keep fallback unless we extracted something
  if (message === "Edge Function returned a non-2xx status code") {
    message = fallback;
  }

  return translateMercadoPagoMessage(message);
}
