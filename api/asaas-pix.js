// API: /api/asaas-pix
// Cria cliente + cobrança PIX no Asaas e retorna QR Code
// Deploy: Vercel serverless function (repo captacao-terreno)

const ASAAS_KEY = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjBmNTE5MWE3LWVhNzUtNGY4ZS04ZDkwLWE3ZTNmZmJjMGIwYzo6JGFhY2hfZWVkZGMyZTQtNDAzOC00MDI4LWJhZmYtZDE4YWY5NzM5NWFk';
const ASAAS_URL = 'https://api.asaas.com/v3';

// Telegram para notificações
const TG_BOT = '7607498857:AAE0jM_cFrU7qHlXrPAz9q5rQxI3ZOQNxpI';
const TG_CHAT = '-4580797688';

async function asaas(endpoint, body) {
  const r = await fetch(`${ASAAS_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': ASAAS_KEY,
    },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function asaasGet(endpoint) {
  const r = await fetch(`${ASAAS_URL}${endpoint}`, {
    headers: { 'access_token': ASAAS_KEY },
  });
  return r.json();
}

async function notificarTelegram(texto) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto }),
    });
  } catch (e) {}
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { nome, cpfCnpj, email, telefone, valor, descricao, codigo, parcelas } = req.body;

    if (!nome || !cpfCnpj || !valor) {
      return res.status(400).json({ error: 'nome, cpfCnpj e valor são obrigatórios' });
    }

    // 1. Buscar ou criar cliente
    const cpfLimpo = cpfCnpj.replace(/\D/g, '');
    let customerId = null;

    // Tentar encontrar cliente existente
    const busca = await asaasGet(`/customers?cpfCnpj=${cpfLimpo}`);
    if (busca.data && busca.data.length > 0) {
      customerId = busca.data[0].id;
    } else {
      // Criar novo cliente
      const cliente = await asaas('/customers', {
        name: nome,
        cpfCnpj: cpfLimpo,
        email: email || undefined,
        phone: telefone ? telefone.replace(/\D/g, '') : undefined,
      });
      if (cliente.errors) {
        return res.status(400).json({ error: 'Erro ao criar cliente', detalhe: cliente.errors });
      }
      customerId = cliente.id;
    }

    // 2. Criar cobrança PIX
    const hoje = new Date();
    const vencimento = new Date(hoje.getTime() + 24 * 60 * 60 * 1000); // +1 dia
    const vencStr = vencimento.toISOString().slice(0, 10);

    const cobrancaBody = {
      customer: customerId,
      billingType: 'PIX',
      value: valor,
      dueDate: vencStr,
      description: descricao || `Proposta ${codigo || ''}`,
      externalReference: codigo || undefined,
    };

    // Se for parcelado (recorrente), criar assinatura
    if (parcelas && parcelas > 1) {
      // Para recorrência mensal, usar payments com installmentCount
      // Mas PIX não suporta parcelamento direto no Asaas
      // Então criamos apenas a primeira cobrança
      cobrancaBody.description = `${descricao || 'Proposta'} - Parcela 1/${parcelas}`;
    }

    const cobranca = await asaas('/payments', cobrancaBody);
    if (cobranca.errors) {
      return res.status(400).json({ error: 'Erro ao criar cobrança', detalhe: cobranca.errors });
    }

    // 3. Buscar QR Code PIX
    let pixData = null;
    // Aguardar um momento para o PIX ser gerado
    await new Promise(r => setTimeout(r, 1500));

    const qr = await asaasGet(`/payments/${cobranca.id}/pixQrCode`);
    if (qr.encodedImage) {
      pixData = {
        qrCode: qr.encodedImage,       // base64 da imagem
        payload: qr.payload,            // código copia-e-cola
        expirationDate: qr.expirationDate,
      };
    }

    // 4. Notificar Telegram
    await notificarTelegram(
      `PIX GERADO\n` +
      `Cliente: ${nome}\n` +
      `CPF/CNPJ: ${cpfCnpj}\n` +
      `Valor: R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
      `Descrição: ${descricao || '-'}\n` +
      `Código: ${codigo || '-'}\n` +
      `Asaas ID: ${cobranca.id}\n` +
      `Status: ${cobranca.status}`
    );

    // 5. Retornar dados
    return res.status(200).json({
      ok: true,
      paymentId: cobranca.id,
      status: cobranca.status,
      invoiceUrl: cobranca.invoiceUrl,    // link de pagamento do Asaas
      bankSlipUrl: cobranca.bankSlipUrl,
      pixData,
      valor,
    });

  } catch (e) {
    console.error('Erro asaas-pix:', e);
    return res.status(500).json({ error: 'Erro interno', mensagem: e.message });
  }
};
