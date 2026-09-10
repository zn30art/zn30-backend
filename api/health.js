const { applyCors } = require("../lib/cors");
const { getSheetsClient } = require("../lib/sheets");

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const result = {
    ok: true,
    service: "ZN30 Central do Cliente",
    mercadopago: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    googleSheets: false,
  };

  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
    });
    result.googleSheets = true;
  } catch (err) {
    result.googleSheets = false;
    result.googleSheetsError = err.message;
  }

  result.ok = result.mercadopago && result.googleSheets;
  res.status(200).json(result);
};
