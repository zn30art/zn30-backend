const { findOrderByCode, updateOrderFields, appendLog } = require("../lib/sheets");
const { getPayment } = require("../lib/mercadopago");

const EPSILON = 0.01;

/**
 * Extrai o ID do pagamento tanto do formato novo (body JSON)
 * quanto do formato antigo de IPN (query string).
 */
function extractPaymentId(req) {
  const body = req.body || {};
  if (body.data && body.data.id) return String(body.data.id);
  if (body.resource) {
    const match = String(body.resource).match(/(\d+)$/);
    if (match) return match[1];
  }
  if (req.query["data.id"]) return String(req.query["data.id"]);
  if (req.query.id) return String(req.query.id);
  return null;
}

// POST /api/webhook  (configurado como notification_url na preference)
//
// Regra de ouro do projeto: o navegador NUNCA declara pagamento.
// Só este endpoint, validando diretamente contra a API do Mercado Pago,
// pode marcar um pedido como PAGO/LIBERADO.
module.exports = async (req, res) => {
  // O Mercado Pago espera uma resposta 2xx rápida. Não aplicamos CORS
  // aqui pois quem chama é o servidor do Mercado Pago, não o navegador.
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).end();
  }

  const paymentId = extractPaymentId(req);
  if (!paymentId) {
    // Não é uma notificação de pagamento que reconhecemos - apenas confirma recebimento.
    return res.status(200).json({ ok: true, ignored: true });
  }

  try {
    const payment = await getPayment(paymentId);
    const code = payment.external_reference;

    if (!code) {
      await appendLog(null, "WEBHOOK_SEM_REFERENCIA", `paymentId=${paymentId}`);
      return res.status(200).json({ ok: true, ignored: true });
    }

    const order = await findOrderByCode(code);
    if (!order) {
      await appendLog(code, "WEBHOOK_PEDIDO_NAO_ENCONTRADO", `paymentId=${paymentId}`);
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Idempotência: se este mesmo paymentId já foi registrado, não reprocessa.
    if (String(order.paymentId) === String(paymentId)) {
      return res.status(200).json({ ok: true, alreadyProcessed: true });
    }

    if (payment.status !== "approved") {
      await appendLog(
        code,
        "WEBHOOK_PAGAMENTO_NAO_APROVADO",
        `paymentId=${paymentId} status=${payment.status}`
      );
      return res.status(200).json({ ok: true, status: payment.status });
    }

    const valorBate =
      Math.abs(Number(payment.transaction_amount) - Number(order.valor)) < EPSILON;

    if (!valorBate) {
      await appendLog(
        code,
        "WEBHOOK_VALOR_DIVERGENTE",
        `esperado=${order.valor} recebido=${payment.transaction_amount}`
      );
      // Não libera. Fica registrado para investigação manual.
      return res.status(200).json({ ok: true, valueMismatch: true });
    }

    await updateOrderFields(order.rowNumber, {
      status: "LIBERADO",
      formaPagamento: payment.payment_method_id,
      paymentId: payment.id,
    });
    await appendLog(code, "PAGAMENTO_APROVADO", `paymentId=${paymentId}`);

    return res.status(200).json({ ok: true, status: "LIBERADO" });
  } catch (err) {
    console.error("Erro em /api/webhook:", err);
    // Mesmo em erro, respondemos 200 para o MP não ficar reenviando
    // indefinidamente notificações que vão falhar do mesmo jeito;
    // o erro fica registrado no log da Vercel para investigação.
    return res.status(200).json({ ok: false, error: "Erro interno registrado" });
  }
};
