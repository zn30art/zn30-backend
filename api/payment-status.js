const { applyCors } = require("../lib/cors");
const { findOrderByCode, updateOrderFields, appendLog } = require("../lib/sheets");
const { searchPaymentsByExternalReference } = require("../lib/mercadopago");

const EPSILON = 0.01; // tolerância de centavos na comparação de valores

// GET /api/payment-status?code=ZN30-0001
//
// Usado pela tela "ANALISANDO PAGAMENTO..." depois que o cliente volta
// do Mercado Pago. Normalmente o webhook já vai ter atualizado o status,
// mas como fallback (webhook atrasado), também consulta o MP diretamente.
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
      return res.status(404).json({ ok: false, error: "Pedido não encontrado" });
    }

    // Já processado (pelo webhook ou por uma chamada anterior a este endpoint).
    if (order.status === "PAGO" || order.status === "LIBERADO") {
      return res.status(200).json({ ok: true, status: order.status });
    }

    // Fallback: pergunta direto ao Mercado Pago se já existe pagamento aprovado.
    const payments = await searchPaymentsByExternalReference(order.codigo);
    const approved = payments.find(
      (p) =>
        p.status === "approved" &&
        Math.abs(Number(p.transaction_amount) - Number(order.valor)) < EPSILON
    );

    if (approved) {
      await updateOrderFields(order.rowNumber, {
        status: "LIBERADO",
        formaPagamento: approved.payment_method_id,
        paymentId: approved.id,
      });
      await appendLog(order.codigo, "PAGAMENTO_CONFIRMADO_FALLBACK", String(approved.id));
      return res.status(200).json({ ok: true, status: "LIBERADO" });
    }

    return res.status(200).json({ ok: true, status: order.status || "PENDENTE" });
  } catch (err) {
    console.error("Erro em /api/payment-status:", err);
    return res.status(500).json({ ok: false, error: "Erro interno" });
  }
};
