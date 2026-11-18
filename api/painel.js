// API: /api/painel
// Backend centralizado do painel. Todas as consultas passam por aqui.
// Ações: listar propostas, buscar cliente, atualizar status, criar proposta manual

const SB = 'https://mooghvkrendiiwhxynkd.supabase.co';
const SK = 'sb_publishable_eRt9feUOHeFOSZjIbfDrJw_ieFaA6Dx';
const SENHA = 'isa2026';

async function sb(path, method, body) {
  const h = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' };
  if (method === 'POST') h['Prefer'] = 'return=representation';
  if (method === 'PATCH') h['Prefer'] = 'return=representation';
  const opts = { method: method || 'GET', headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB}/rest/v1/${path}`, opts);
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-senha');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const senha = req.query.senha || req.headers['x-senha'];
  const acao = req.query.acao || 'listar';

  // Área do cliente (sem senha)
  if (acao === 'cliente') {
    const codigo = req.query.codigo || '';
    const cpf = req.query.cpf || '';
    if (!codigo && !cpf) return res.status(400).json({ error: 'Informe codigo ou cpf' });

    let filtro = '';
    if (codigo) filtro = `codigo=eq.${codigo}`;
    else filtro = `cliente_doc=eq.${cpf.replace(/\D/g,'')}`;

    const propostas = await sb(`propostas?${filtro}&order=aceito_em.desc`);
    // Limpar dados sensíveis
    const limpo = (propostas || []).map(p => ({
      codigo: p.codigo,
      titulo: p.proposta_titulo,
      resumo: p.proposta_resumo,
      total: p.total_fixo,
      pagamento: p.pagamento_tipo,
      aceito_em: p.aceito_em,
      status: p.status || 'aceita',
      etapas: p.etapas,
      etapa_atual: p.etapa_atual,
      progresso: p.progresso,
    }));
    return res.json({ ok: true, propostas: limpo });
  }

  // Tudo abaixo requer senha (painel admin)
  if (senha !== SENHA) return res.status(401).json({ error: 'Senha incorreta' });

  if (acao === 'listar') {
    const propostas = await sb('propostas?order=aceito_em.desc&limit=100');
    return res.json({ ok: true, propostas: propostas || [] });
  }

  if (acao === 'rascunhos') {
    const rascunhos = await sb('rascunhos?order=created_at.desc&limit=50');
    return res.json({ ok: true, rascunhos: rascunhos || [] });
  }

  if (acao === 'criar' && req.method === 'POST') {
    const d = req.body;
    if (!d.cliente_nome || !d.proposta_titulo || !d.total_fixo) {
      return res.status(400).json({ error: 'nome, título e valor são obrigatórios' });
    }
    const r = await sb('propostas', 'POST', {
      codigo: d.codigo || 'MO-MANUAL',
      aceito_em: d.aceito_em || new Date().toISOString(),
      ip: d.ip || 'manual',
      cliente_nome: d.cliente_nome,
      cliente_doc: d.cliente_doc || '',
      cliente_email: d.cliente_email || '',
      cliente_whatsapp: d.cliente_whatsapp || '',
      cliente_endereco: d.cliente_endereco || '',
      proposta_titulo: d.proposta_titulo,
      proposta_resumo: d.proposta_resumo || '',
      total_fixo: d.total_fixo,
      pagamento_tipo: d.pagamento_tipo || '',
      status: d.status || 'aceita',
      notas: d.notas || '',
      etapas: d.etapas || null,
      docs_cliente: d.docs_cliente || null,
    });
    return res.json({ ok: true, criado: r });
  }

  if (acao === 'atualizar' && req.method === 'POST') {
    const d = req.body;
    if (!d.codigo) return res.status(400).json({ error: 'codigo obrigatório' });
    const campos = {};
    if (d.status) campos.status = d.status;
    if (d.etapa_atual) campos.etapa_atual = d.etapa_atual;
    if (d.progresso !== undefined) campos.progresso = d.progresso;
    if (d.notas !== undefined) campos.notas = d.notas;
    if (d.etapas !== undefined) campos.etapas = d.etapas;
    if (d.docs_cliente !== undefined) campos.docs_cliente = d.docs_cliente;
    const r = await sb(`propostas?codigo=eq.${d.codigo}`, 'PATCH', campos);
    return res.json({ ok: true, atualizado: r });
  }

  if (acao === 'stats') {
    const todas = await sb('propostas?select=total_fixo,aceito_em,status,pagamento_tipo');
    const agora = new Date();
    const mes = agora.getMonth();
    const ano = agora.getFullYear();
    const total = (todas || []).reduce((a, p) => a + (p.total_fixo || 0), 0);
    const esteMes = (todas || []).filter(p => {
      if (!p.aceito_em) return false;
      const d = new Date(p.aceito_em);
      return d.getMonth() === mes && d.getFullYear() === ano;
    });
    const totalMes = esteMes.reduce((a, p) => a + (p.total_fixo || 0), 0);
    return res.json({
      ok: true,
      total_propostas: (todas || []).length,
      valor_total: total,
      propostas_mes: esteMes.length,
      valor_mes: totalMes,
      por_status: contarPor(todas, 'status'),
      por_pagamento: contarPor(todas, 'pagamento_tipo'),
    });
  }

  return res.status(400).json({ error: 'acao inválida' });
};

function contarPor(arr, campo) {
  const c = {};
  (arr || []).forEach(p => { const v = p[campo] || 'sem status'; c[v] = (c[v] || 0) + 1; });
  return c;
}
