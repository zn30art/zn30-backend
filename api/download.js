const { applyCors } = require("../lib/cors");
const { findOrderByCode, getDriveClient, appendLog } = require("../lib/sheets");

/** Aceita tanto um ID puro do Drive quanto uma URL completa e extrai o ID. */
function extractDriveId(value) {
  if (!value) return null;
  const match = value.match(/[-\w]{25,}/); // IDs do Drive têm 25+ caracteres
  return match ? match[0] : value.trim();
}

// GET /api/download?code=ZN30-0001
//
// Só entrega bytes se o pedido estiver LIBERADO. O link real do Drive
// nunca é exposto ao cliente - o backend baixa o arquivo com a conta de
// serviço e faz streaming direto na resposta (proxy seguro).
//
// Pré-requisito: a pasta/arquivo no Drive precisa estar compartilhada
// com o e-mail da conta de serviço (GOOGLE_SERVICE_ACCOUNT_EMAIL).
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

    if (order.status !== "LIBERADO") {
      await appendLog(code, "DOWNLOAD_NEGADO", `status atual=${order.status}`);
      return res.status(403).json({ ok: false, error: "Arquivo ainda não liberado" });
    }

    const fileId = extractDriveId(order.arquivoDrive);
    if (!fileId) {
      return res.status(500).json({ ok: false, error: "Arquivo não configurado para este pedido" });
    }

    const drive = getDriveClient();
    const meta = await drive.files.get({
      fileId,
      fields: "name,mimeType",
    });

    const fileResp = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", meta.data.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(meta.data.name || "arquivo")}"`
    );

    await appendLog(code, "DOWNLOAD_REALIZADO", meta.data.name || fileId);

    fileResp.data
      .on("end", () => res.end())
      .on("error", (err) => {
        console.error("Erro no streaming do arquivo:", err);
        if (!res.headersSent) res.status(500);
        res.end();
      })
      .pipe(res);
  } catch (err) {
    console.error("Erro em /api/download:", err);
    return res.status(500).json({ ok: false, error: "Erro ao entregar arquivo" });
  }
};
