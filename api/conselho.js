// API: /api/conselho
// Backend do portal de conselho estratégico.
// Gerencia reuniões, decisões, parcelas e agenda.
// Dados armazenados no campo JSON da proposta no Supabase.

const SB = 'https://mooghvkrendiiwhxynkd.supabase.co';
const SK = 'sb_publishable_eRt9feUOHeFOSZjIbfDrJw_ieFaA6Dx';
const SENHA = 'isa2026';
const TG_BOT = '7607498857:AAE0jM_cFrU7qHlXrPAz9q5rQxI3ZOQNxpI';
const TG_CHAT = '-4580797688';

async function sb(path, method, body) {
  const h = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
  if (method === 'POST') h['Prefer'] = 'return=representation';
  if (method === 'PATCH') h['Prefer'] = 'return=representation';
  const opts = { method: method || 'GET', headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB}/rest/v1/${path}`, opts);
  return r.json();
}

async function telegram(texto) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: texto }),
    });
  } catch (e) {}
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-senha');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const acao = req.query.acao || '';
  const codigo = req.query.codigo || '';
  const senha = req.query.senha || req.headers['x-senha'];
  const isAdmin = senha === SENHA;

  // Buscar proposta
  async function getProposta() {
    if (!codigo) return null;
    const arr = await sb(`propostas?codigo=eq.${codigo}&limit=1`);
    return arr && arr[0] ? arr[0] : null;
  }

  async function salvarConselho(proposta, conselhoData) {
    await sb(`propostas?codigo=eq.${codigo}`, 'PATCH', { conselho_data: conselhoData });
  }

  // ===== ÁREA DO CLIENTE (sem senha) =====

  // Ver dados do conselho
  if (acao === 'ver') {
    const p = await getProposta();
    if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
    const c = p.conselho_data || {};
    return res.json({
      ok: true,
      cliente: p.cliente_nome,
      titulo: p.proposta_titulo,
      resumo: p.proposta_resumo,
      status: p.status,
      total: p.total_fixo,
      pagamento: p.pagamento_tipo,
      aceito_em: p.aceito_em,
      // Dados do conselho
      reunioes: (c.reunioes || []).map(r => ({
        data: r.data,
        hora: r.hora,
        status: r.status, // agendada, realizada, cancelada, remarcada
        pauta: r.pauta,
        resumo: r.resumo,
        decisoes: r.decisoes,
      })),
      decisoes: c.decisoes || [],
      parcelas: (c.parcelas || []).map(p => ({
        numero: p.numero,
        vencimento: p.vencimento,
        valor: p.valor,
        status: p.status, // pendente, paga, atrasada
        pago_em: p.pago_em,
      })),
      proxima_reuniao: c.proxima_reuniao || null,
      documentos: c.documentos || [],
      tarefas: (c.tarefas || []).map(t => ({
        id: t.id,
        titulo: t.titulo,
        descricao: t.descricao,
        status: t.status,
        prioridade: t.prioridade,
        responsavel: t.responsavel,
        prazo: t.prazo,
        criada_em: t.criada_em,
        concluida_em: t.concluida_em,
        checklist: t.checklist || [],
      })),
    });
  }

  // ===== ADMIN (com senha) =====
  if (!isAdmin) return res.status(401).json({ error: 'Senha necessária para esta ação' });

  const p = await getProposta();
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  let c = p.conselho_data || { reunioes: [], decisoes: [], parcelas: [], documentos: [], tarefas: [] };

  // Adicionar reunião
  if (acao === 'add_reuniao' && req.method === 'POST') {
    const r = req.body;
    c.reunioes = c.reunioes || [];
    c.reunioes.push({
      id: Date.now(),
      data: r.data,
      hora: r.hora || '10:00',
      status: 'agendada',
      pauta: r.pauta || '',
      resumo: '',
      decisoes: [],
      local: r.local || 'Vídeo',
    });
    c.proxima_reuniao = { data: r.data, hora: r.hora || '10:00' };
    await salvarConselho(p, c);
    await telegram(`REUNIÃO AGENDADA\nCliente: ${p.cliente_nome}\nData: ${r.data} às ${r.hora||'10:00'}\nPauta: ${r.pauta||'-'}\nCódigo: ${codigo}`);
    return res.json({ ok: true, reunioes: c.reunioes });
  }

  // Atualizar reunião (marcar como realizada, adicionar resumo/decisões)
  if (acao === 'update_reuniao' && req.method === 'POST') {
    const { id, status, resumo, decisoes, pauta } = req.body;
    const reuniao = (c.reunioes || []).find(r => r.id === id);
    if (!reuniao) return res.status(404).json({ error: 'Reunião não encontrada' });
    if (status) reuniao.status = status;
    if (resumo !== undefined) reuniao.resumo = resumo;
    if (pauta !== undefined) reuniao.pauta = pauta;
    if (decisoes) {
      reuniao.decisoes = decisoes;
      // Adicionar decisões ao registro geral
      decisoes.forEach(d => {
        if (d && d.trim()) {
          c.decisoes = c.decisoes || [];
          c.decisoes.push({ texto: d.trim(), data: reuniao.data, reuniao_id: id, created: new Date().toISOString() });
        }
      });
    }
    // Atualizar próxima reunião
    const proximas = (c.reunioes || []).filter(r => r.status === 'agendada').sort((a, b) => a.data > b.data ? 1 : -1);
    c.proxima_reuniao = proximas[0] ? { data: proximas[0].data, hora: proximas[0].hora } : null;
    await salvarConselho(p, c);
    return res.json({ ok: true });
  }

  // Registrar pagamento de parcela
  if (acao === 'registrar_pagamento' && req.method === 'POST') {
    const { numero, pago_em } = req.body;
    const parcela = (c.parcelas || []).find(p => p.numero === numero);
    if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada' });
    parcela.status = 'paga';
    parcela.pago_em = pago_em || new Date().toISOString().slice(0, 10);
    await salvarConselho(p, c);
    await telegram(`PAGAMENTO REGISTRADO\nCliente: ${p.cliente_nome}\nParcela: ${numero}\nValor: R$ ${parcela.valor}\nCódigo: ${codigo}`);
    return res.json({ ok: true });
  }

  // Gerar parcelas
  if (acao === 'gerar_parcelas' && req.method === 'POST') {
    const { meses, valor_mensal, dia_vencimento, inicio } = req.body;
    c.parcelas = [];
    const dataInicio = new Date(inicio || p.aceito_em || new Date().toISOString());
    for (let i = 0; i < meses; i++) {
      const venc = new Date(dataInicio);
      venc.setMonth(venc.getMonth() + i);
      venc.setDate(dia_vencimento || 10);
      c.parcelas.push({
        numero: i + 1,
        vencimento: venc.toISOString().slice(0, 10),
        valor: valor_mensal,
        status: 'pendente',
        pago_em: null,
      });
    }
    await salvarConselho(p, c);
    return res.json({ ok: true, parcelas: c.parcelas });
  }

  // Adicionar documento/diretriz
  if (acao === 'add_documento' && req.method === 'POST') {
    const { titulo, descricao, tipo } = req.body;
    c.documentos = c.documentos || [];
    c.documentos.push({ id: Date.now(), titulo, descricao, tipo: tipo || 'diretriz', data: new Date().toISOString().slice(0, 10) });
    await salvarConselho(p, c);
    return res.json({ ok: true });
  }

  // Adicionar tarefa
  if (acao === 'add_tarefa' && req.method === 'POST') {
    const { titulo, descricao, prioridade, responsavel, prazo, checklist } = req.body;
    c.tarefas = c.tarefas || [];
    c.tarefas.push({
      id: Date.now(),
      titulo,
      descricao: descricao || '',
      status: 'pendente',
      prioridade: prioridade || 'normal',
      responsavel: responsavel || 'isabella',
      prazo: prazo || '',
      criada_em: new Date().toISOString().slice(0, 10),
      concluida_em: null,
      checklist: (checklist || []).map(item => ({ item, feito: false })),
    });
    await salvarConselho(p, c);
    return res.json({ ok: true });
  }

  // Atualizar tarefa (status, checklist)
  if (acao === 'update_tarefa' && req.method === 'POST') {
    const { id, status, checklist } = req.body;
    const tarefa = (c.tarefas || []).find(t => t.id === id);
    if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada' });
    if (status) {
      tarefa.status = status;
      if (status === 'concluida') tarefa.concluida_em = new Date().toISOString().slice(0, 10);
    }
    if (checklist) tarefa.checklist = checklist;
    await salvarConselho(p, c);
    return res.json({ ok: true });
  }

  // Remover tarefa
  if (acao === 'remove_tarefa' && req.method === 'POST') {
    const { id } = req.body;
    c.tarefas = (c.tarefas || []).filter(t => t.id !== id);
    await salvarConselho(p, c);
    return res.json({ ok: true });
  }

  // Obter tudo (admin)
  if (acao === 'admin_ver') {
    return res.json({ ok: true, proposta: p, conselho: c });
  }

  return res.status(400).json({ error: 'ação inválida' });
};
