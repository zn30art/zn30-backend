const MP_API = "https://api.mercadopago.com";

function getToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  }
  return token;
}

/**
 * Cria uma preference (Checkout Pro) específica para UM pedido.
 * O valor e a descrição vêm sempre do servidor (planilha), nunca do
 * que o navegador mandar - isso é o que impede alguém de manipular o preço.
 */
async function createPreference({ code, servico, valor, backUrls, notificationUrl }) {
  const token = getToken();

  const body = {
    items: [
      {
        title: `ZN30 - ${servico}`,
        quantity: 1,
        unit_price: Number(valor),
        currency_id: "BRL",
      },
    ],
    external_reference: code,
    notification_url: notificationUrl,
    back_urls: backUrls,
    auto_return: "approved",
  };

  const resp = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.message || "Erro ao criar preference no Mercado Pago");
    err.details = data;
    throw err;
  }
  return data;
}

/** Busca um pagamento específico pelo ID (usado pelo webhook). */
async function getPayment(paymentId) {
  const token = getToken();
  const resp = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.message || "Erro ao consultar pagamento no Mercado Pago");
    err.details = data;
    throw err;
  }
  return data;
}

/** Busca pagamentos por external_reference (código do pedido) - usado como fallback. */
async function searchPaymentsByExternalReference(code) {
  const token = getToken();
  const url = `${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(
    code
  )}&sort=date_created&criteria=desc`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error(data.message || "Erro ao buscar pagamentos no Mercado Pago");
    err.details = data;
    throw err;
  }
  return data.results || [];
}

module.exports = { createPreference, getPayment, searchPaymentsByExternalReference };
