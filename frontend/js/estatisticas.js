/* =========================================================
   estatisticas.js — Estatísticas do setor NC (administrador)
   Só visualização: indicadores, entradas x saídas nos últimos
   7 dias, volumes no setor por tipo, status, local e cliente,
   os mais antigos e as últimas ações (auditoria).
   Gráficos em SVG puro, com dica ao passar o mouse e a tabela
   de dados em cada um. Cores validadas sobre o papel #FFFCF2
   (herdadas do painel do HelpIA); toda barra tem nome e valor
   escritos, então nenhuma informação depende só da cor.
   ========================================================= */

const usuario = Sessao.exigir(['admin']);
const esc = TicketUI.esc;
const elPainel = document.getElementById('painel');
const elDica = document.getElementById('dicaGrafico');
const elOffline = document.getElementById('avisoOffline');

const COR = {
  entradas: '#2a78d6', saidas: '#eb6834',
  barra: '#2a78d6', grade: '#E8DFC6',
  'enviar-email': '#C99300', 'email-enviado': '#E07B24', 'aguardando-entrega': '#2a78d6', tratado: '#2E8B2E', devolucao: '#7A5CC0', gris: '#C4452C',
};

document.getElementById('helpyAvatar').outerHTML = Helpy.avatar('acenando');
const helpy = new Helpy(document.getElementById('helpyRaiz'), document.getElementById('helpyFeed'), { balao: true });
if (usuario) helpy.viver({ nome: esc(Helpy.apelido(usuario.nome)), id: usuario.id });
const escritorio = Escritorio.montar();

let volumes = [];
// Score do setor NC na lateral (js/placar.js)
const placar = Placar.montar({ volumes: () => volumes });
let auditoria = [];
let assinatura = '';
let falou = false;

/** Largura útil (px) de um cartão que ocupa `colunas` da grade (o SVG é desenhado no tamanho real). */
function larguraCartao(colunas = 1) {
  const estilo = getComputedStyle(elPainel);
  const total = estilo.gridTemplateColumns.split(' ').length;
  const gap = parseFloat(estilo.columnGap) || 19;
  const coluna = (elPainel.clientWidth - 10 - gap * (total - 1)) / total;
  const ocupa = Math.min(colunas, total);
  return Math.max(260, Math.floor(coluna * ocupa + gap * (ocupa - 1) - 36));
}
const corta = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);
const numero = (n) => n.toLocaleString('pt-BR');
const noSetor = () => volumes.filter((v) => !Catalogo.saiu(v));
const saidos = () => volumes.filter((v) => Catalogo.saiu(v));

function teto(max) {
  if (max <= 4) return Math.max(2, Math.ceil(max));
  const base = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map((k) => k * base).find((v) => v >= max);
}
function barraVertical(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function barraHorizontal(x, y, w, h) {
  if (w <= 0) return '';
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
function tabela(titulo, colunas, linhas) {
  return `<details class="dados-tabela"><summary>Ver dados em tabela</summary>
    <table><caption class="sr-only">${esc(titulo)}</caption>
      <thead><tr>${colunas.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map((l) => `<tr>${l.map((v, i) => (i ? `<td>${esc(v)}</td>` : `<th scope="row">${esc(v)}</th>`)).join('')}</tr>`).join('')}</tbody>
    </table></details>`;
}

// ---------- Indicadores ----------
function indicadores() {
  const setor = noSetor();
  const semInt = setor.filter((v) => v.tipo === 'sem-integracao');
  const atencao = setor.filter((v) => Catalogo.prazo(v) === 'atencao').length;
  const vencidos = setor.filter((v) => Catalogo.prazo(v) === 'vencido').length;
  const hoje = volumes.filter((v) => mesmoDia(v.data_saida)).length;
  const entraramHoje = volumes.filter((v) => mesmoDia(v.data_entrada)).length;
  const tempos = saidos().map((v) => (new Date(v.data_saida) - new Date(v.data_entrada)) / 86400000).filter((d) => d >= 0);
  const medio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
  const emails = setor.filter((v) => v.status === 'enviar-email').length;
  const item = (rotulo, valor, extra = '', classe = '') =>
    `<div class="stat ${classe}"><span class="stat-rotulo">${rotulo}</span><strong class="stat-valor">${valor}</strong>${extra ? `<span class="stat-extra">${extra}</span>` : ''}</div>`;
  return `<section class="cartao-painel cartao-stats" aria-label="Indicadores">
    ${item('No setor NC', numero(setor.length), `${entraramHoje} ${entraramHoje === 1 ? 'entrou' : 'entraram'} hoje`)}
    ${item('Saíram hoje', numero(hoje), 'Tratado + Devolução')}
    ${item('Sem integração', numero(semInt.length), atencao ? `${ic('relogio')} ${atencao} perto dos ${Catalogo.PRAZO_DIAS} dias` : 'dentro do prazo', atencao ? 'stat-alerta' : '')}
    ${item(`Passaram de ${Catalogo.PRAZO_DIAS} dias`, numero(vencidos), vencidos ? `${ic('alerta')} <a href="historico.html?situacao=vencido">virar devolução</a>` : `${ic('check')} nenhum vencido`, vencidos ? 'stat-alerta' : 'stat-ok')}
    ${item('E-mails a enviar', numero(emails), emails ? `${ic('envelope')} status Enviar e-mail` : `${ic('check')} em dia`, emails ? 'stat-alerta' : 'stat-ok')}
    ${item('Tempo médio no NC', medio == null ? '—' : `${medio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`, `${tempos.length} volume${tempos.length === 1 ? '' : 's'} já saíram`)}
  </section>`;
}

// ---------- Entradas x saídas nos últimos 7 dias ----------
function grafico7Dias() {
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const dados = dias.map((d) => ({
    rotulo: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    entradas: volumes.filter((v) => mesmoDia(v.data_entrada, d)).length,
    saidas: volumes.filter((v) => mesmoDia(v.data_saida, d)).length,
  }));
  const W = larguraCartao(2); const H = 240; const m = { t: 16, r: 8, b: 40, l: 30 };
  const max = teto(Math.max(1, ...dados.flatMap((d) => [d.entradas, d.saidas])));
  const ih = H - m.t - m.b;
  const banda = (W - m.l - m.r) / dados.length;
  const bw = Math.min(24, (banda - 18) / 2);
  const y = (v) => m.t + ih - (v / max) * ih;
  const emLinhas = tipoDe('t7d', TIPOS_7DIAS) === 'linhas';
  const cxDe = (i) => m.l + banda * i + banda / 2;
  const linha = (campo, cor) => `
    <polyline points="${dados.map((d, i) => `${cxDe(i)},${y(d[campo])}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
    ${dados.map((d, i) => `<circle cx="${cxDe(i)}" cy="${y(d[campo])}" r="4.5" fill="${cor}" stroke="#FFFCF2" stroke-width="2" />`).join('')}`;
  const marcas = dados.map((d, i) => {
    const cx = m.l + banda * i + banda / 2;
    const xa = cx - bw - 1; const xr = cx + 1;
    const hoje = i === dados.length - 1;
    return `
      <g class="grupo-dia">
        <rect class="alvo-hover" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${ih}" fill="transparent"
          data-dica="<b>${esc(d.rotulo)} ${esc(d.data)}</b><br>${d.entradas} entrada${d.entradas === 1 ? '' : 's'} · ${d.saidas} saída${d.saidas === 1 ? '' : 's'}" />
        ${emLinhas ? '' : `<path d="${barraVertical(xa, y(d.entradas), bw, y(0) - y(d.entradas))}" fill="${COR.entradas}" />
        <path d="${barraVertical(xr, y(d.saidas), bw, y(0) - y(d.saidas))}" fill="${COR.saidas}" />`}
        ${hoje && !emLinhas ? `<text class="rotulo-valor" x="${xa + bw / 2}" y="${y(d.entradas) - 5}" text-anchor="middle">${d.entradas}</text>
                  <text class="rotulo-valor" x="${xr + bw / 2}" y="${y(d.saidas) - 5}" text-anchor="middle">${d.saidas}</text>` : ''}
        ${hoje && emLinhas ? `<text class="rotulo-valor" x="${cx - 8}" y="${Math.min(y(d.entradas), y(d.saidas)) - 9}" text-anchor="end">${d.entradas}</text>
                  <text class="rotulo-valor" x="${cx + 8}" y="${Math.min(y(d.entradas), y(d.saidas)) - 9}">${d.saidas}</text>` : ''}
        <text class="rotulo-eixo ${hoje ? 'hoje' : ''}" x="${cx}" y="${H - m.b + 16}" text-anchor="middle">${hoje ? 'hoje' : esc(d.rotulo)}</text>
        <text class="rotulo-eixo fraco" x="${cx}" y="${H - m.b + 30}" text-anchor="middle">${esc(d.data)}</text>
      </g>`;
  }).join('');
  return `<section class="cartao-painel largo-2" aria-labelledby="t7d" data-cartao="t7d">
    <header class="cartao-topo"><h3 id="t7d">${ic('grafico')} Entradas e saídas nos últimos 7 dias</h3>
      <ul class="legenda"><li><i style="background:${COR.entradas}"></i>Entradas</li><li><i style="background:${COR.saidas}"></i>Saídas</li></ul>
      <span class="cartao-ferramentas">${seletorTipo('t7d', TIPOS_7DIAS)}</span></header>
    <svg class="grafico" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${emLinhas ? 'Linhas' : 'Colunas'} de volumes que entraram e saíram do NC por dia, nos últimos 7 dias">
      ${[0, max / 2, max].map((v) => `<line class="linha-grade" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" />
        <text class="rotulo-eixo" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${numero(v)}</text>`).join('')}
      ${emLinhas ? linha('entradas', COR.entradas) + linha('saidas', COR.saidas) : ''}
      ${marcas}
    </svg>
    ${tabela('Entradas e saídas por dia', ['Dia', 'Entradas', 'Saídas'], dados.map((d) => [`${d.rotulo} ${d.data}`, d.entradas, d.saidas]))}
  </section>`;
}

// ---------- Barras horizontais ----------
function barrasHorizontais(itens, { cor = () => COR.barra, sufixo = '' } = {}) {
  const W = larguraCartao(1); const linha = 34; const m = { l: Math.min(190, Math.round(W * .46)), r: 34 };
  const maxTexto = Math.floor((m.l - 12) / 7.2);
  const H = itens.length * linha + 6;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const largura = W - m.l - m.r;
  return `<svg class="grafico" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(itens.map((i) => `${i.rotulo}: ${i.valor}`).join(', '))}">
    ${itens.map((it, k) => {
      const y = k * linha + 7;
      const w = (it.valor / max) * largura;
      return `<g>
        <rect class="alvo-hover" x="0" y="${y - 4}" width="${W}" height="${linha}" fill="transparent" data-dica="<b>${esc(it.rotulo)}</b><br>${it.valor}${sufixo}" />
        <text class="rotulo-linha" x="${m.l - 10}" y="${y + 15}" text-anchor="end"><title>${esc(it.rotulo)}</title>${esc(corta(it.rotulo, maxTexto))}</text>
        <line class="linha-grade" x1="${m.l}" x2="${m.l}" y1="${y - 4}" y2="${y + linha - 4}" />
        <path d="${barraHorizontal(m.l, y + 2, Math.max(w, it.valor ? 3 : 0), 20)}" fill="${cor(it)}" stroke="#23291B" stroke-opacity=".25" />
        <text class="rotulo-valor" x="${m.l + w + 7}" y="${y + 16}">${it.valor}</text>
      </g>`;
    }).join('')}
  </svg>`;
}

// ---------- Tipo de gráfico (cada cartão lembra o seu) ----------
const TIPOS_GRAFICO = [
  { id: 'barras', rotulo: 'Barras' }, { id: 'colunas', rotulo: 'Colunas' },
  { id: 'pizza', rotulo: 'Pizza' }, { id: 'rosca', rotulo: 'Rosca' },
];
const TIPOS_7DIAS = [{ id: 'colunas', rotulo: 'Colunas' }, { id: 'linhas', rotulo: 'Linhas' }];
const CHAVE_GRAFICOS = 'mutility-graficos';
let tiposGrafico = (() => { try { return JSON.parse(localStorage.getItem(CHAVE_GRAFICOS)) || {}; } catch { return {}; } })();
const tipoDe = (id, opcoes = TIPOS_GRAFICO) => (opcoes.some((t) => t.id === tiposGrafico[id]) ? tiposGrafico[id] : opcoes[0].id);
function definirTipo(id, tipo) {
  if (id === '*') document.querySelectorAll('[data-tipo-grafico]').forEach((s) => { if (s.dataset.tipoGrafico !== 't7d') tiposGrafico[s.dataset.tipoGrafico] = tipo; });
  else tiposGrafico[id] = tipo;
  try { localStorage.setItem(CHAVE_GRAFICOS, JSON.stringify(tiposGrafico)); } catch { /* sem armazenamento: vale só agora */ }
  renderizar();
}
const seletorTipo = (id, opcoes = TIPOS_GRAFICO) => `
  <label class="tipo-grafico" title="Tipo de gráfico"><span class="sr-only">Tipo de gráfico</span>
    <select class="input" data-tipo-grafico="${id}">${opcoes.map((t) => `<option value="${t.id}" ${tipoDe(id, opcoes) === t.id ? 'selected' : ''}>${t.rotulo}</option>`).join('')}</select></label>
  <button type="button" class="btn btn-sm key--icon" data-imagem="${id}" title="Exportar este gráfico como imagem (PNG)" aria-label="Exportar este gráfico como imagem">${ic('download')}</button>`;

/** Cores para fatias/colunas quando o cartão não tem cor própria (todas com nome e valor escritos). */
const PALETA = ['#2a78d6', '#eb6834', '#2E8B2E', '#7A5CC0', '#C99300', '#C4452C', '#1E8F8F', '#9C5A2E'];

function colunas(itens, { cor, sufixo = '' } = {}) {
  const W = larguraCartao(1); const H = 250; const m = { t: 22, r: 8, b: 58, l: 30 };
  const max = teto(Math.max(1, ...itens.map((i) => i.valor)));
  const ih = H - m.t - m.b; const banda = (W - m.l - m.r) / itens.length;
  const bw = Math.min(46, banda * .62);
  const y = (v) => m.t + ih - (v / max) * ih;
  const maxTexto = Math.max(4, Math.floor(banda / 6.4));
  return `<svg class="grafico" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(itens.map((i) => `${i.rotulo}: ${i.valor}`).join(', '))}">
    ${[0, max / 2, max].map((v) => `<line class="linha-grade" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" />
      <text class="rotulo-eixo" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${numero(v)}</text>`).join('')}
    ${itens.map((it, k) => {
      const cx = m.l + banda * k + banda / 2;
      const partes = corta(it.rotulo, maxTexto * 2).split(' ');
      const l1 = []; const l2 = [];
      partes.forEach((p) => ((l1.join(' ') + ' ' + p).trim().length <= maxTexto && !l2.length ? l1 : l2).push(p));
      return `<g>
        <rect class="alvo-hover" x="${m.l + banda * k}" y="${m.t}" width="${banda}" height="${ih}" fill="transparent" data-dica="<b>${esc(it.rotulo)}</b><br>${it.valor}${sufixo}" />
        <path d="${barraVertical(cx - bw / 2, y(it.valor), bw, y(0) - y(it.valor))}" fill="${cor ? cor(it, k) : PALETA[k % PALETA.length]}" stroke="#23291B" stroke-opacity=".25" />
        <text class="rotulo-valor" x="${cx}" y="${y(it.valor) - 6}" text-anchor="middle">${it.valor}</text>
        <text class="rotulo-eixo" x="${cx}" y="${H - m.b + 16}" text-anchor="middle"><title>${esc(it.rotulo)}</title>${esc(corta(l1.join(' '), maxTexto + 1))}</text>
        ${l2.length ? `<text class="rotulo-eixo" x="${cx}" y="${H - m.b + 30}" text-anchor="middle">${esc(corta(l2.join(' '), maxTexto + 1))}</text>` : ''}
      </g>`;
    }).join('')}
  </svg>`;
}

function pizza(itens, { cor, sufixo = '', rosca = false } = {}) {
  const W = larguraCartao(1);
  const comValor = itens.filter((i) => i.valor > 0);
  const total = comValor.reduce((s, i) => s + i.valor, 0);
  const linhaLeg = 24;
  const H = Math.max(220, comValor.length * linhaLeg + 30);
  const r = Math.min(H / 2 - 14, W * .19);
  const cx = r + 14; const cy = H / 2;
  const corDe = (it) => (cor ? cor(it, itens.indexOf(it)) : PALETA[itens.indexOf(it) % PALETA.length]);
  let angulo = -Math.PI / 2;
  const ponto = (a, raio) => `${cx + raio * Math.cos(a)},${cy + raio * Math.sin(a)}`;
  const fatias = comValor.map((it) => {
    const a = (it.valor / total) * Math.PI * 2;
    const ini = angulo; const fim = angulo + a; angulo = fim;
    const grande = a > Math.PI ? 1 : 0;
    const pct = Math.round((it.valor / total) * 100);
    const dica = `data-dica="<b>${esc(it.rotulo)}</b><br>${it.valor}${sufixo} · ${pct}%"`;
    if (comValor.length === 1) {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${corDe(it)}" stroke="#23291B" stroke-opacity=".35" ${dica} />`;
    }
    const d = rosca
      ? `M${ponto(ini, r)} A${r},${r} 0 ${grande} 1 ${ponto(fim, r)} L${ponto(fim, r * .56)} A${r * .56},${r * .56} 0 ${grande} 0 ${ponto(ini, r * .56)}Z`
      : `M${cx},${cy} L${ponto(ini, r)} A${r},${r} 0 ${grande} 1 ${ponto(fim, r)}Z`;
    return `<path d="${d}" fill="${corDe(it)}" stroke="#FFFCF2" stroke-width="2" ${dica} />`;
  }).join('');
  const lx = cx + r + 22;
  const maxTexto = Math.max(6, Math.floor((W - lx - 66) / 6.4));
  const legenda = comValor.map((it, k) => {
    const y = (H - comValor.length * linhaLeg) / 2 + k * linhaLeg + 16;
    const pct = Math.round((it.valor / total) * 100);
    return `<g><rect x="${lx}" y="${y - 11}" width="13" height="13" rx="3" fill="${corDe(it)}" stroke="#23291B" stroke-opacity=".35" />
      <text class="rotulo-linha" x="${lx + 20}" y="${y}"><title>${esc(it.rotulo)}</title>${esc(corta(it.rotulo, maxTexto))}</text>
      <text class="rotulo-valor" x="${W - 6}" y="${y}" text-anchor="end">${it.valor} · ${pct}%</text></g>`;
  }).join('');
  return `<svg class="grafico" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(comValor.map((i) => `${i.rotulo}: ${i.valor}`).join(', '))}">
    ${fatias}
    ${rosca ? `<text class="rotulo-valor" x="${cx}" y="${cy + 2}" text-anchor="middle" style="font-size:20px">${total}</text>
      <text class="rotulo-eixo" x="${cx}" y="${cy + 18}" text-anchor="middle">total</text>` : ''}
    ${legenda}
  </svg>`;
}

function desenharCategorias(id, itens, opcoes) {
  const tipo = tipoDe(id);
  if (tipo === 'colunas') return colunas(itens, opcoes);
  if (tipo === 'pizza' || tipo === 'rosca') return pizza(itens, { ...opcoes, rosca: tipo === 'rosca' });
  return barrasHorizontais(itens, opcoes);
}

function cartaoBarras({ id, icone, titulo, sub, itens, cor, rotuloTabela }) {
  return `<section class="cartao-painel" aria-labelledby="${id}" data-cartao="${id}">
    <header class="cartao-topo"><h3 id="${id}">${ic(icone)} ${titulo}</h3><span class="cartao-sub">${sub}</span>
      <span class="cartao-ferramentas">${seletorTipo(id)}</span></header>
    ${itens.some((i) => i.valor) ? desenharCategorias(id, itens, { cor, sufixo: ' volume(s)' }) : '<p class="cartao-vazio">Nenhum volume ainda.</p>'}
    ${tabela(titulo, [rotuloTabela, 'Volumes'], itens.map((i) => [i.rotulo, i.valor]))}
  </section>`;
}

function porTipo() {
  const setor = noSetor();
  return cartaoBarras({
    id: 'tTipo', icone: 'pacote', titulo: 'No setor por tipo de NC', sub: `${setor.length} volume${setor.length === 1 ? '' : 's'}`, rotuloTabela: 'Tipo',
    itens: Catalogo.tipos.map((t) => ({ rotulo: t.titulo, valor: setor.filter((v) => v.tipo === t.id).length })).sort((a, b) => b.valor - a.valor),
  });
}
function porStatus() {
  return cartaoBarras({
    id: 'tStatus', icone: 'etiqueta', titulo: 'Todos os volumes por status', sub: 'desde o início', rotuloTabela: 'Status',
    itens: Catalogo.status.map((s) => ({ id: s.id, rotulo: s.titulo, valor: volumes.filter((v) => v.status === s.id).length })),
    cor: (it) => COR[it.id],
  });
}
function porLocal() {
  const setor = noSetor();
  return cartaoBarras({
    id: 'tLocal', icone: 'pastas', titulo: 'Onde estão os volumes', sub: 'no setor agora', rotuloTabela: 'Local',
    itens: Catalogo.locais.map((l) => ({ rotulo: l.titulo, valor: setor.filter((v) => v.local === l.id).length })),
  });
}
function porCliente() {
  const contagem = {};
  volumes.forEach((v) => {
    const nome = v.cliente_nome || 'Sem cliente';
    contagem[nome] = contagem[nome] || { rotulo: nome, valor: 0, cor: v.cliente_cor || '#A39A7C' };
    contagem[nome].valor += 1;
  });
  const itens = Object.values(contagem).sort((a, b) => b.valor - a.valor).slice(0, 8);
  return cartaoBarras({ id: 'tCli', icone: 'predio', titulo: 'Volumes por cliente', sub: 'cor do ticket', rotuloTabela: 'Cliente', itens, cor: (it) => it.cor });
}

function maisAntigos() {
  const lista = noSetor().sort((a, b) => a.data_entrada.localeCompare(b.data_entrada)).slice(0, 6);
  return `<section class="cartao-painel" aria-labelledby="tAnt">
    <header class="cartao-topo"><h3 id="tAnt">${ic('relogio')} Há mais tempo no setor</h3><a class="cartao-link" href="historico.html?situacao=no-setor">ver todos →</a></header>
    ${lista.length ? `<ul class="lista-simples">${lista.map((v) => `
      <li><button type="button" class="linha-ticket" data-ver="${v.numero}">
        <b>${esc(v.codigo)}</b><span>${esc(v.tipo_titulo)} · ${esc(v.cliente_nome || 'sem cliente')}</span>
        <small>${Catalogo.prazo(v) === 'vencido' ? `${ic('alerta')} vencido · ` : ''}${esc(TicketUI.tempoNoSetor(v))} · ${esc(v.status_titulo)}</small></button></li>`).join('')}</ul>`
      : '<p class="cartao-vazio">Nenhum volume no setor.</p>'}
  </section>`;
}

function ultimasAcoes() {
  const lista = auditoria.slice(0, 7);
  return `<section class="cartao-painel" aria-labelledby="tAtv">
    <header class="cartao-topo"><h3 id="tAtv">${ic('atividade')} Últimas ações</h3><a class="cartao-link" href="auditoria.html">auditoria completa →</a></header>
    ${lista.length ? `<ol class="lista-simples atividades">${lista.map((a) => `
      <li><span class="atv-ico">${ic('olho')}</span><span><b>${esc(a.usuario)}</b> ${esc(a.acao.toLowerCase())}${a.alvo ? ` <b>${esc(a.alvo)}</b>` : ''}</span><time>${Efeitos.tempoDesde(a.em)}</time></li>`).join('')}</ol>`
      : '<p class="cartao-vazio">Nenhuma ação registrada.</p>'}
  </section>`;
}

// ---------- Montagem ----------
function renderizar() {
  elPainel.innerHTML = indicadores() + grafico7Dias() + porTipo() + porStatus() + porLocal() + porCliente() + maisAntigos() + ultimasAcoes();
}

async function carregar() {
  const [rv, ra] = await Promise.all([API.volumes(), API.auditoria()]);
  if (!rv.ok) {
    if (rv.status === 401) Sessao.sair('expirou');
    else mostrarOffline(elOffline);
    return;
  }
  elOffline.hidden = true;
  volumes = rv.dados;
  placar.atualizar();
  auditoria = ra.ok ? ra.dados : [];
  const nova = JSON.stringify([volumes.map((v) => [v.numero, v.status, v.atualizado_em, v.cliente_cor]), auditoria[0]?.id, new Date().toDateString()]);
  if (nova !== assinatura) { assinatura = nova; renderizar(); }
  falar();
}

function falar() {
  if (falou) return;
  falou = true;
  const setor = noSetor();
  const vencidos = setor.filter((v) => Catalogo.prazo(v) === 'vencido');
  helpy.dizer(`<p>${helpy.oi(esc(Helpy.apelido(usuario.nome)))}</p><p>Olha os números do setor NC aí 📊</p>
    <p>${setor.length ? `São <strong>${setor.length}</strong> volumes no setor agora.` : 'O setor está vazio. Tudo tranquilo!'}</p>`, { humor: 'acenando' });
  if (vencidos.length) {
    helpy.dizer(`<p>Ihh 😬 ${vencidos.length} volume${vencidos.length > 1 ? 's passaram' : ' passou'} de ${Catalogo.PRAZO_DIAS} dias sem integração:</p>${Helpy.listaTickets(vencidos.slice().sort((a, b) => Catalogo.dias(b) - Catalogo.dias(a)).map((v) => ({ codigo: v.codigo, extra: `há ${Catalogo.dias(v)} dia${Catalogo.dias(v) > 1 ? 's' : ''}` })))}`, {
      tipo: 'alerta', humor: 'alerta', segurar: true,
      aoMostrar: () => escritorio.focar(3000),
      acoes: [{ rotulo: `${ic('olho')} Ver vencidos`, destaque: true, fn: () => { location.href = 'historico.html?situacao=vencido'; } }, { rotulo: 'Depois', fn: () => {} }],
    });
  }
}

// ---------- Dica ao passar o mouse e cliques ----------
elPainel.addEventListener('pointermove', (e) => {
  const alvo = e.target.closest('[data-dica]');
  if (!alvo) { elDica.hidden = true; return; }
  elDica.innerHTML = alvo.dataset.dica;
  elDica.hidden = false;
  const x = Math.min(innerWidth - elDica.offsetWidth - 12, e.clientX + 14);
  elDica.style.left = `${x}px`;
  elDica.style.top = `${e.clientY - elDica.offsetHeight - 12}px`;
});
elPainel.addEventListener('pointerleave', () => { elDica.hidden = true; });
elPainel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ver]');
  const v = b && volumes.find((x) => x.numero === Number(b.dataset.ver));
  if (v) TicketUI.abrir(v, { acoes: `<a class="btn btn-primary" href="controle-nc.html#volume-${v.numero}">${ic('caneta')} Atualizar no Controle NC</a>` });
});

document.getElementById('botaoExportar').addEventListener('click', async () => {
  if (!volumes.length) { Efeitos.toast('Ainda não há volumes para exportar.', { icone: ic('alerta') }); return; }
  Planilha.baixar(Planilha.nomeArquivo('mutility-nc-completo'), Planilha.csv(volumes));
  await API.registrarAcao('Exportou todos os volumes (CSV)', '', `${volumes.length} volume(s)`);
  Efeitos.toast('CSV baixado.', { icone: ic('download'), tipo: 'sucesso' });
});

// ---------- Tipo de gráfico e exportar imagem ----------
elPainel.addEventListener('change', (e) => {
  const s = e.target.closest('[data-tipo-grafico]');
  if (s) definirTipo(s.dataset.tipoGrafico, s.value);
});
document.getElementById('tipoTodos').addEventListener('change', (e) => {
  if (e.target.value) definirTipo('*', e.target.value);
  e.target.value = '';
});
elPainel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-imagem]');
  if (b) exportarImagem([elPainel.querySelector(`[data-cartao="${b.dataset.imagem}"]`)], b.closest('.cartao-painel').querySelector('h3').textContent.trim());
});
document.getElementById('botaoImagem').addEventListener('click', () =>
  exportarImagem([...elPainel.querySelectorAll('[data-cartao]')], 'Estatísticas do setor NC', { indicadores: true }));

/** O SVG desenhado com as cores e fontes que o CSS aplica (fora da página o CSS não vai junto). */
function svgParaImagem(svg) {
  const copia = svg.cloneNode(true);
  const originais = [svg, ...svg.querySelectorAll('*')];
  const copias = [copia, ...copia.querySelectorAll('*')];
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing'];
  originais.forEach((el, i) => {
    const cs = getComputedStyle(el);
    copias[i].setAttribute('style', props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  });
  copia.querySelectorAll('.alvo-hover, title').forEach((el) => el.remove());
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

/** Junta os cartões (título + gráfico) numa imagem PNG, no papel do M-Utility. */
async function exportarImagem(cartoes, titulo, { indicadores: comIndicadores = false } = {}) {
  cartoes = cartoes.filter(Boolean);
  if (!cartoes.length) return;
  const escala = 2; const pad = 28; const gap = 22;
  const pecas = await Promise.all(cartoes.map(async (c) => {
    const svg = c.querySelector('svg.grafico');
    return { titulo: c.querySelector('h3').textContent.trim(), sub: c.querySelector('.cartao-sub')?.textContent.trim() || '', img: svg ? await svgParaImagem(svg) : null, w: svg ? svg.width.baseVal.value : 320, h: svg ? svg.height.baseVal.value : 40, legenda: [...c.querySelectorAll('.legenda li')].map((li) => ({ cor: li.querySelector('i').style.background, texto: li.textContent.trim() })) };
  }));
  const stats = comIndicadores ? [...elPainel.querySelectorAll('.cartao-stats .stat')].map((s) => ({ rotulo: s.querySelector('.stat-rotulo').textContent, valor: s.querySelector('.stat-valor').textContent })) : [];
  // até 2 cartões por linha; os largos ocupam a linha toda
  const largura = Math.max(...pecas.map((p) => p.w)) * (pecas.length > 1 ? 2 : 1) + (pecas.length > 1 ? gap : 0) + pad * 2;
  const linhas = []; let atual = [];
  pecas.forEach((p) => {
    const larga = p.w > (largura - pad * 2) / 2 + 1;
    if (larga) { if (atual.length) linhas.push(atual); linhas.push([p]); atual = []; return; }
    atual.push(p); if (atual.length === 2) { linhas.push(atual); atual = []; }
  });
  if (atual.length) linhas.push(atual);
  const topo = 74 + (stats.length ? 92 : 0);
  const altLinha = (l) => Math.max(...l.map((p) => p.h)) + 58;
  const altura = topo + linhas.reduce((s, l) => s + altLinha(l) + gap, 0) + pad;
  const canvas = document.createElement('canvas');
  canvas.width = largura * escala; canvas.height = altura * escala;
  const ctx = canvas.getContext('2d');
  ctx.scale(escala, escala);
  ctx.fillStyle = '#F3ECD8'; ctx.fillRect(0, 0, largura, altura);
  const fonte = (peso, px, disp = false) => `${peso} ${px}px ${disp ? '"Bricolage Grotesque"' : 'Nunito'}, "Segoe UI", sans-serif`;
  ctx.fillStyle = '#23291B'; ctx.font = fonte(800, 24, true); ctx.fillText(`M-Utility · ${titulo}`, pad, 44);
  ctx.font = fonte(600, 13); ctx.fillStyle = '#6B6458';
  ctx.fillText(`Controle NC · gerado em ${new Date().toLocaleString('pt-BR')} por ${usuario.nome}`, pad, 64);
  const caixa = (x, y, w, h) => {
    ctx.fillStyle = 'rgba(35,41,27,.22)'; ctx.beginPath(); ctx.roundRect(x + 4, y + 4, w, h, 12); ctx.fill();
    ctx.fillStyle = '#FFFCF2'; ctx.strokeStyle = '#23291B'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
  };
  if (stats.length) {
    const sw = (largura - pad * 2 - gap * (stats.length - 1)) / stats.length;
    stats.forEach((s, i) => {
      const x = pad + i * (sw + gap); caixa(x, 82, sw, 72);
      ctx.fillStyle = '#6B6458'; ctx.font = fonte(800, 11); ctx.fillText(s.rotulo.toUpperCase(), x + 12, 104, sw - 24);
      ctx.fillStyle = '#23291B'; ctx.font = fonte(800, 26, true); ctx.fillText(s.valor, x + 12, 138, sw - 24);
    });
  }
  let y = topo;
  linhas.forEach((l) => {
    const h = altLinha(l);
    const w = l.length === 1 && l[0].w > (largura - pad * 2) / 2 + 1 ? largura - pad * 2 : (largura - pad * 2 - gap) / (pecas.length > 1 ? 2 : 1);
    l.forEach((p, i) => {
      const x = pad + i * (w + gap);
      caixa(x, y, w, h);
      ctx.fillStyle = '#23291B'; ctx.font = fonte(800, 16, true); ctx.fillText(p.titulo, x + 16, y + 28, w - 32);
      let lx = x + w - 16; ctx.font = fonte(700, 12); ctx.textAlign = 'right';
      [...p.legenda].reverse().forEach((lg) => { ctx.fillStyle = '#23291B'; ctx.fillText(lg.texto, lx, y + 28); lx -= ctx.measureText(lg.texto).width + 6; ctx.fillStyle = lg.cor; ctx.fillRect(lx - 11, y + 18, 11, 11); lx -= 24; });
      if (!p.legenda.length && p.sub) { ctx.fillStyle = '#6B6458'; ctx.fillText(p.sub, lx, y + 28); }
      ctx.textAlign = 'left';
      if (p.img) ctx.drawImage(p.img, x + (w - p.w) / 2, y + 44, p.w, p.h);
    });
    y += h + gap;
  });
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const nome = Planilha.nomeArquivo(`mutility-${Busca.normalizar(titulo).replace(/\s+/g, '-')}`, 'png');
  Planilha.baixar(nome, blob, 'image/png');
  API.registrarAcao('Exportou imagem das estatísticas', '', titulo);
  Efeitos.toast(`Imagem <b>${esc(nome)}</b> baixada.`, { icone: ic('download'), tipo: 'sucesso' });
}

let timerTamanho = null;
addEventListener('resize', () => { clearTimeout(timerTamanho); timerTamanho = setTimeout(renderizar, 150); });
addEventListener('storage', (e) => { if (e.key === Banco.CHAVE) carregar(); });

if (usuario) {
  Sessao.montarMenu(usuario);
  carregar();
  setInterval(() => { if (!document.hidden) carregar(); }, 8000);
}
