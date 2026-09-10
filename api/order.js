const { applyCors } = require("../lib/cors");
const { findOrderByCode } = require("../lib/sheets");

// GET /api/order?code=ZN30-0001
// Retorna SOMENTE o que o cliente final precisa ver. Nunca expõe
// Payment ID, e-mail/whatsapp ou o link do Drive por aqui.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Método não permitido" });
  }

  const code = (req.query.code || "").toString().trim();
  if (!code) {
    return res.status(400).json({ ok: false, error: "Código não informado" });
  }

  try {
    const order = await findOrderByCode(code);

    if (!order) {
      // Mensagem genérica - não revela se o formato do código é válido ou não.
      return res.status(404).json({ ok: false, error: "Pedido não encontrado" });
    }

    return res.status(200).json({
      ok: true,
      codigo: order.codigo,
      cliente: order.cliente,
      servico: order.servico,
      valor: order.valor,
      status: order.status,
    });
  } catch (err) {
    console.error("Erro em /api/order:", err);
    return res.status(500).json({ ok: false, error: "Erro interno" });
  }
};
