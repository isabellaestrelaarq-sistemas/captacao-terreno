// Recebe o formulário da página e envia pro seu Telegram.
// O token e o chat id ficam nas variáveis de ambiente da Vercel, nunca no código.

module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, erro: "Use POST" });

  var token = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(500).json({ ok: false, erro: "Faltam TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID na Vercel" });
  }

  var body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  function limpa(v) { return String(v || "").trim().slice(0, 1500); }

  var nome = limpa(body.nome), whatsapp = limpa(body.whatsapp), cidade = limpa(body.cidade),
      tamanho = limpa(body.tamanho), situacao = limpa(body.situacao);

  if (!nome || !whatsapp || !cidade) {
    return res.status(400).json({ ok: false, erro: "Campos obrigatórios faltando" });
  }

  var texto =
    "Novo terreno (Raio-X)\n\n" +
    "Nome: " + nome + "\n" +
    "WhatsApp: " + whatsapp + "\n" +
    "Cidade: " + cidade + "\n" +
    "Tamanho: " + tamanho + "\n" +
    "Situação: " + situacao;

  try {
    var r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto })
    });
    var data = await r.json();
    if (!data.ok) return res.status(502).json({ ok: false, erro: data.description || "Telegram recusou" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, erro: "Não consegui falar com o Telegram" });
  }
};
