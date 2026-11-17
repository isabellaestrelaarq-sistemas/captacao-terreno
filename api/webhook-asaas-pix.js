// API: /api/webhook-asaas-pix
// Webhook do Asaas: recebe confirmação de pagamento PIX → notifica Telegram
// Configurar no Asaas: Configurações → Integrações → Webhooks → URL: https://isaestrela.com.br/api/webhook-asaas-pix

const TG_BOT = '7607498857:AAE0jM_cFrU7qHlXrPAz9q5rQxI3ZOQNxpI';
const TG_CHAT = '-4580797688';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).end();

  try {
    const evento = req.body;
    const tipo = evento.event;
    const pagamento = evento.payment || {};

    // Eventos relevantes
    const mensagens = {
      'PAYMENT_CONFIRMED': 'PAGAMENTO CONFIRMADO',
      'PAYMENT_RECEIVED': 'PAGAMENTO RECEBIDO',
      'PAYMENT_OVERDUE': 'PAGAMENTO VENCIDO',
      'PAYMENT_REFUNDED': 'PAGAMENTO ESTORNADO',
      'PAYMENT_DELETED': 'COBRANÇA EXCLUÍDA',
    };

    const titulo = mensagens[tipo];
    if (!titulo) return res.status(200).json({ ok: true, ignored: tipo });

    const valor = pagamento.value ? `R$ ${Number(pagamento.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';
    const texto = [
      titulo,
      '',
      `Cliente: ${pagamento.customerName || '-'}`,
      `Valor: ${valor}`,
      `Forma: ${pagamento.billingType || '-'}`,
      `Descrição: ${pagamento.description || '-'}`,
      `Ref: ${pagamento.externalReference || '-'}`,
      `Asaas ID: ${pagamento.id || '-'}`,
      pagamento.confirmedDate ? `Confirmado em: ${pagamento.confirmedDate}` : '',
      pagamento.paymentDate ? `Pago em: ${pagamento.paymentDate}` : '',
    ].filter(x => x).join('\n');

    await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto }),
    });

    return res.status(200).json({ ok: true, event: tipo });
  } catch (e) {
    console.error('Webhook erro:', e);
    return res.status(200).json({ ok: false, error: e.message });
  }
};
