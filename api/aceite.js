// API: /api/aceite
// Endpoint central: recebe o aceite do cliente, salva no Supabase,
// notifica Telegram, gera cobrança PIX no Asaas.
// Tudo server-side = sem falha de CORS ou bloqueio do navegador.

const SUPABASE_URL = 'https://mooghvkrendiiwhxynkd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eRt9feUOHeFOSZjIbfDrJw_ieFaA6Dx';
const TG_BOT = '7607498857:AAE0jM_cFrU7qHlXrPAz9q5rQxI3ZOQNxpI';
const TG_CHAT = '-4580797688';
const ASAAS_KEY = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjBmNTE5MWE3LWVhNzUtNGY4ZS04ZDkwLWE3ZTNmZmJjMGIwYzo6JGFhY2hfZWVkZGMyZTQtNDAzOC00MDI4LWJhZmYtZDE4YWY5NzM5NWFk';
const ASAAS_URL = 'https://api.asaas.com/v3';

// ---- Helpers ----
async function telegram(texto) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto }),
    });
    const j = await r.json();
    return j.ok === true;
  } catch (e) {
    console.error('Telegram erro:', e.message);
    return false;
  }
}

async function supabasePost(tabela, dados) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(dados),
    });
    return await r.json();
  } catch (e) {
    console.error('Supabase erro:', e.message);
    return null;
  }
}

async function asaasPost(endpoint, body) {
  const r = await fetch(`${ASAAS_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', access_token: ASAAS_KEY },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function asaasGet(endpoint) {
  const r = await fetch(`${ASAAS_URL}${endpoint}`, {
    headers: { access_token: ASAAS_KEY },
  });
  return r.json();
}

// ---- Handler ----
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const d = req.body;
  const resultado = { tgOk: false, dbOk: false, pixData: null, invoiceUrl: null };

  // 1. SALVAR NO SUPABASE (propostas)
  try {
    const dbRes = await supabasePost('propostas', {
      codigo: d.codigo,
      aceito_em: d.aceito_em,
      ip: d.ip,
      user_agent: d.user_agent,
      cliente_nome: d.cliente_nome,
      cliente_doc: d.cliente_doc,
      cliente_email: d.cliente_email,
      cliente_whatsapp: d.cliente_whatsapp,
      cliente_endereco: d.cliente_endereco,
      terreno: d.terreno_endereco,
      proposta_titulo: d.proposta_titulo,
      proposta_resumo: d.proposta_resumo,
      proposta_modo: d.proposta_modo,
      terreno_m2: d.terreno_m2,
      unidades: d.unidades,
      etapas: d.etapas,
      total_fixo: d.total_fixo,
      variavel: d.variavel,
      variavel_detalhe: d.variavel_detalhe,
      pagamento_tipo: d.pagamento_tipo,
      pagamento_valor: d.pagamento_valor,
      pagamento_texto: d.pagamento_texto,
      origem: d.origem || null,
    });
    resultado.dbOk = Array.isArray(dbRes) ? dbRes.length > 0 : !!dbRes?.id;
  } catch (e) {
    console.error('DB erro:', e.message);
  }

  // 2. NOTIFICAR TELEGRAM
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 });
  const txt = [
    'CONTRATO ACEITO',
    'Código: ' + (d.codigo || '-'),
    'Data: ' + (d.aceito_em ? new Date(d.aceito_em).toLocaleString('pt-BR') : '-'),
    d.vigencia || '',
    '',
    'CLIENTE:',
    'Nome: ' + (d.cliente_nome || '-'),
    'CPF/CNPJ: ' + (d.cliente_doc || '-'),
    'E-mail: ' + (d.cliente_email || '-'),
    'WhatsApp: ' + (d.cliente_whatsapp || '-'),
    'Endereço: ' + (d.cliente_endereco || '-'),
    d.terreno_endereco ? 'Terreno: ' + d.terreno_endereco : '',
    '',
    'PROPOSTA: ' + (d.proposta_titulo || '') + ' — ' + (d.proposta_resumo || ''),
    ...(d.etapas_texto || []),
    d.conselho_texto || '',
    d.consultoria_texto || '',
    'Total fixo: ' + brl(d.total_fixo),
    d.variavel || '',
    '',
    'PAGAMENTO: ' + (d.pagamento_tipo || '-'),
    d.pagamento_texto || '',
    '',
    'IP: ' + (d.ip || '-'),
    resultado.dbOk ? 'Banco: gravado' : 'Banco: FALHOU',
  ].filter(x => x).join('\n');

  resultado.tgOk = await telegram(txt);

  // Retry Telegram se falhou
  if (!resultado.tgOk) {
    resultado.tgOk = await telegram(txt);
  }

  // 3. GERAR COBRANÇA PIX NO ASAAS (se tiver valor e CPF)
  if (d.pagamento_valor && d.pagamento_valor > 0 && d.cliente_doc) {
    try {
      const cpfLimpo = (d.cliente_doc || '').replace(/\D/g, '');

      // Buscar ou criar cliente
      let customerId = null;
      const busca = await asaasGet(`/customers?cpfCnpj=${cpfLimpo}`);
      if (busca.data && busca.data.length > 0) {
        customerId = busca.data[0].id;
      } else {
        const cli = await asaasPost('/customers', {
          name: d.cliente_nome,
          cpfCnpj: cpfLimpo,
          email: d.cliente_email || undefined,
          phone: d.cliente_whatsapp ? d.cliente_whatsapp.replace(/\D/g, '') : undefined,
        });
        if (cli.id) customerId = cli.id;
      }

      if (customerId) {
        // Criar cobrança PIX
        const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const cobranca = await asaasPost('/payments', {
          customer: customerId,
          billingType: 'PIX',
          value: d.pagamento_valor,
          dueDate: amanha,
          description: `${d.proposta_titulo || 'Proposta'} - ${d.pagamento_tipo || ''}`.slice(0, 500),
          externalReference: d.codigo || undefined,
        });

        if (cobranca.id) {
          resultado.invoiceUrl = cobranca.invoiceUrl;

          // Buscar QR Code (com delay pro Asaas gerar)
          await new Promise(r => setTimeout(r, 2000));
          const qr = await asaasGet(`/payments/${cobranca.id}/pixQrCode`);
          if (qr.encodedImage) {
            resultado.pixData = {
              qrCode: qr.encodedImage,
              payload: qr.payload,
              expirationDate: qr.expirationDate,
            };
          }

          // Notificar Telegram sobre PIX gerado
          await telegram(
            'PIX GERADO\n' +
            'Cliente: ' + d.cliente_nome + '\n' +
            'Valor: ' + brl(d.pagamento_valor) + '\n' +
            'Link: ' + (cobranca.invoiceUrl || '-') + '\n' +
            'ID Asaas: ' + cobranca.id
          );
        }
      }
    } catch (e) {
      console.error('Asaas erro:', e.message);
    }
  }

  return res.status(200).json({
    ok: true,
    tgOk: resultado.tgOk,
    dbOk: resultado.dbOk,
    pixData: resultado.pixData,
    invoiceUrl: resultado.invoiceUrl,
  });
};
