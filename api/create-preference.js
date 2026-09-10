const { applyCors } = require("../lib/cors");
const { findOrderByCode, appendLog } = require("../lib/sheets");
const { createPreference } = require("../lib/mercadopago");

// POST /api/create-preference   body: { "code": "ZN30-0001" }
//
// IMPORTANTE: serviço e valor NUNCA vêm do corpo da requisição.
// São sempre lidos da planilha (server-side), então o navegador não
// tem como manipular o preço que será cobrado.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método não permitido" });
  }

  const { code } = req.body || {};
  const trimmedCode = (code || "").toString().trim();

  if (!trimmedCode) {
    return res.status(400).json({ ok: false, error: "Código não informado" });
  }

  try {
    const order = await findOrderByCode(trimmedCode);

    if (!order) {
      return res.status(404).json({ ok: false, error: "Pedido não encontrado" });
    }

    if (order.status === "PAGO" || order.status === "LIBERADO") {
      return res.status(200).json({
        ok: true,
        alreadyPaid: true,
        status: order.status,
      });
    }

    const siteUrl = process.env.SITE_URL; // ex.: https://zn30-central-cliente.vercel.app
    const backendUrl = process.env.BACKEND_URL || siteUrl;

    const preference = await createPreference({
      code: order.codigo,
      servico: order.servico,
      valor: order.valor,
      backUrls: {
        success: `${siteUrl}/retorno?status=success&code=${order.codigo}`,
        pending: `${siteUrl}/retorno?status=pending&code=${order.codigo}`,
        failure: `${siteUrl}/retorno?status=failure&code=${order.codigo}`,
      },
      notificationUrl: `${backendUrl}/api/webhook`,
    });

    await appendLog(order.codigo, "PREFERENCE_CRIADA", preference.id);

    return res.status(200).json({
      ok: true,
      initPoint: preference.init_point,
      preferenceId: preference.id,
    });
  } catch (err) {
    console.error("Erro em /api/create-preference:", err);
    return res.status(500).json({ ok: false, error: "Erro ao criar pagamento" });
  }
};
