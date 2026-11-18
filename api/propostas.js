// API: /api/propostas
// Consulta propostas aceitas no Supabase.
// Acesso: https://isaestrela.com.br/api/propostas?senha=isa2026
// Retorna JSON com todas as propostas aceitas.

const SUPABASE_URL = 'https://mooghvkrendiiwhxynkd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eRt9feUOHeFOSZjIbfDrJw_ieFaA6Dx';
const SENHA = 'isa2026'; // troque por uma senha sua

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Verificar senha
  const s = req.query.senha || req.headers['x-senha'];
  if (s !== SENHA) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/propostas?select=*&order=aceito_em.desc&limit=50`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const dados = await r.json();

    // Se pedir HTML (navegador)
    if (req.query.formato === 'html' || (!req.query.formato && req.headers.accept && req.headers.accept.includes('text/html'))) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(gerarHTML(dados));
    }

    return res.status(200).json({ ok: true, total: dados.length, propostas: dados });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

function gerarHTML(dados) {
  const brl = v => v ? 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:0}) : '-';
  const dataHora = d => d ? new Date(d).toLocaleString('pt-BR') : '-';

  const linhas = dados.map(p => `
    <tr>
      <td><b>${esc(p.cliente_nome||'-')}</b><br><small>${esc(p.cliente_doc||'')}</small></td>
      <td>${esc(p.proposta_titulo||'-')}<br><small>${esc(p.proposta_resumo||'')}</small></td>
      <td style="font-family:monospace;font-size:18px;color:#6A2326"><b>${brl(p.total_fixo)}</b></td>
      <td>${esc(p.pagamento_tipo||'-')}</td>
      <td>${dataHora(p.aceito_em)}</td>
      <td><small>${esc(p.codigo||'-')}</small></td>
      <td><small>${esc(p.cliente_email||'')}<br>${esc(p.cliente_whatsapp||'')}</small></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Propostas Aceitas</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:"IBM Plex Sans",sans-serif;background:#FAF9F6;color:#1A0F10;font-size:14px}
  .header{background:linear-gradient(135deg,#6A2326,#7B2D30);color:#fff;padding:28px 32px}
  .header h1{font-family:"Fraunces",serif;font-weight:300;font-size:24px;color:#F0D6AA;margin:0}
  .header p{color:rgba(240,214,170,.6);font-size:13px;margin:6px 0 0}
  .wrap{padding:24px;max-width:1200px;margin:0 auto}
  .stats{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
  .stat{background:#fff;border:1px solid rgba(209,176,160,.25);border-radius:10px;padding:16px 20px;flex:1;min-width:140px}
  .stat .n{font-family:"Fraunces",serif;font-size:28px;color:#6A2326}
  .stat .l{font-size:12px;color:#73504F;margin-top:4px}
  table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border-radius:10px;overflow:hidden;border:1px solid rgba(209,176,160,.25)}
  th{background:#6A2326;color:#F0D6AA;padding:12px 14px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;font-weight:500}
  td{padding:12px 14px;border-bottom:1px solid rgba(209,176,160,.15);vertical-align:top}
  tr:last-child td{border-bottom:0}
  tr:hover td{background:rgba(106,35,38,.02)}
  small{color:#73504F}
  .empty{text-align:center;padding:60px;color:#73504F}
  @media(max-width:768px){table{display:block;overflow-x:auto}th,td{white-space:nowrap;font-size:13px;padding:10px}}
</style>
</head>
<body>
<div class="header">
  <h1>Propostas Aceitas</h1>
  <p>${dados.length} proposta${dados.length!==1?'s':''} registrada${dados.length!==1?'s':''}</p>
</div>
<div class="wrap">
  <div class="stats">
    <div class="stat"><div class="n">${dados.length}</div><div class="l">Propostas aceitas</div></div>
    <div class="stat"><div class="n">${brl(dados.reduce((a,p)=>a+(p.total_fixo||0),0))}</div><div class="l">Valor total</div></div>
    <div class="stat"><div class="n">${dados.filter(p=>p.aceito_em && new Date(p.aceito_em).getMonth()===new Date().getMonth()).length}</div><div class="l">Este mês</div></div>
  </div>
  ${dados.length === 0 ? '<div class="empty">Nenhuma proposta aceita ainda.</div>' : `
  <table>
    <thead><tr><th>Cliente</th><th>Proposta</th><th>Valor</th><th>Pagamento</th><th>Aceito em</th><th>Código</th><th>Contato</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>`}
</div>
</body>
</html>`;
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
