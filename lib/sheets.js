const { google } = require("googleapis");

// ---- Configuração das abas/colunas ----------------------------------
// Mantém a MESMA estrutura da planilha Canva original, só que agora
// dentro de uma Google Sheet real, acessível pelo backend.
//
// Aba "1 - PEDIDOS" (colunas A..J):
// A: Codigo | B: Cliente | C: E-mail | D: WhatsApp | E: Servico
// F: Valor  | G: Arquivo Drive (ID ou URL) | H: Status
// I: Forma de Pagamento | J: Payment ID
//
// Aba "3 - LOG" (colunas A..D):
// A: Timestamp | B: Codigo | C: Evento | D: Detalhes

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const PEDIDOS_RANGE = "'1 - PEDIDOS'!A2:J";
const LOG_SHEET = "'3 - LOG'";

const COL = {
  codigo: 0,
  cliente: 1,
  email: 2,
  whatsapp: 3,
  servico: 4,
  valor: 5,
  arquivoDrive: 6,
  status: 7,
  formaPagamento: 8,
  paymentId: 9,
};

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL ou GOOGLE_PRIVATE_KEY não configurados."
    );
  }

  // Na Vercel, quebras de linha da chave privada costumam vir escapadas
  // como "\n" literal. Precisamos converter de volta para quebra real.
  key = key.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: "v3", auth });
}

function rowToOrder(row, rowNumber) {
  return {
    rowNumber, // número da linha real na planilha (para updates)
    codigo: (row[COL.codigo] || "").trim(),
    cliente: row[COL.cliente] || "",
    email: row[COL.email] || "",
    whatsapp: row[COL.whatsapp] || "",
    servico: row[COL.servico] || "",
    valor: parseFloat(String(row[COL.valor] || "0").replace(",", ".")) || 0,
    arquivoDrive: row[COL.arquivoDrive] || "",
    status: (row[COL.status] || "").trim().toUpperCase(),
    formaPagamento: row[COL.formaPagamento] || "",
    paymentId: row[COL.paymentId] || "",
  };
}

async function findOrderByCode(code) {
  if (!code) return null;
  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: PEDIDOS_RANGE,
  });

  const rows = resp.data.values || [];
  const normalized = String(code).trim().toUpperCase();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if ((row[COL.codigo] || "").trim().toUpperCase() === normalized) {
      // Linha 1 é cabeçalho, dados começam na linha 2 da planilha.
      return rowToOrder(row, i + 2);
    }
  }
  return null;
}

async function updateOrderFields(rowNumber, fields) {
  const sheets = getSheetsClient();
  const data = [];

  if (fields.status !== undefined) {
    data.push({
      range: `'1 - PEDIDOS'!H${rowNumber}`,
      values: [[fields.status]],
    });
  }
  if (fields.formaPagamento !== undefined) {
    data.push({
      range: `'1 - PEDIDOS'!I${rowNumber}`,
      values: [[fields.formaPagamento]],
    });
  }
  if (fields.paymentId !== undefined) {
    data.push({
      range: `'1 - PEDIDOS'!J${rowNumber}`,
      values: [[fields.paymentId]],
    });
  }

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  });
}

async function appendLog(codigo, evento, detalhes) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${LOG_SHEET}!A:D`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[new Date().toISOString(), codigo || "", evento, detalhes || ""]],
    },
  });
}

module.exports = {
  getSheetsClient,
  getDriveClient,
  findOrderByCode,
  updateOrderFields,
  appendLog,
};
