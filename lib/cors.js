/**
 * Aplica cabeçalhos CORS e trata o preflight (OPTIONS).
 * Retorna true se a requisição já foi respondida (preflight) - nesse
 * caso, o handler que chamou deve simplesmente encerrar (return).
 */
function applyCors(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { applyCors };
