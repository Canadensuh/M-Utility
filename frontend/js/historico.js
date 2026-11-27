/* =========================================================
   historico.js — Histórico de Tickets (tela inteira)
   Todos os volumes que passaram pelo setor NC, dentro e fora.
   Nada é apagado daqui (a bandeja "Saíram hoje" só esconde da
   mesa). Duas visões: tickets ou tabela (as colunas da planilha),
   e exportação em CSV.
   ========================================================= */

const usuario = Sessao.exigir(['usuario', 'admin']);
const esc = TicketUI.esc;

const elLista = document.getElementById('lista');
const elArea = document.getElementById('areaLista');
const elBusca = document.getElementById('busca');
const elSituacao = document.getElementById('filtroSituacao');
const elTipo = document.getElementById('filtroTipo');
const elStatus = document.getElementById('filtroStatus');
const elCliente = document.getElementById('filtroCliente');
const elOffline = document.getElementById('avisoOffline');

const CHAVE_VISAO = 'mutility-historico-visao';
let visao = lerPreferencia(CHAVE_VISAO, 'tickets') === 'tabela' ? 'tabela' : 'tickets';
let todos = [];
const marcados = new Set();     // volumes marcados (caixinha) para excluir

// Filtro vindo de outra tela (ex.: estatisticas.html?situacao=vencido)
const params = new URLSearchParams(location.search);
if (params.get('situacao')) elSituacao.value = params.get('situacao');

async function carregar() {
  const { ok, status, dados } = await API.volumes();
  if (!ok) {
    if (status === 401) Sessao.sair('expirou');
    else mostrarOffline(elOffline);
    return;
  }
  elOffline.hidden = true;
  todos = dados.slice().sort((a, b) => (b.data_saida || b.data_entrada).localeCompare(a.data_saida || a.data_entrada));
  montarFiltros();
  renderizar();
}

function montarFiltros() {
  const manter = (el, html) => { const v = el.value; el.innerHTML = html; el.value = v; };
  manter(elTipo, `<option value="">Todos os tipos</option>${Catalogo.tipos.map((t) => `<option value="${t.id}">${t.titulo}</option>`).join('')}`);
  manter(elStatus, `<option value="">Todos os status</option>${Catalogo.status.map((s) => `<option value="${s.id}">${s.titulo}</option>`).join('')}`);
  manter(elCliente, TicketUI.opcoes(todos.map((v) => v.cliente_nome), 'Todos os clientes'));
}

const filtrados = () => TicketUI.filtrar(todos, {
  termo: elBusca.value, situacao: elSituacao.value, tipo: elTipo.value, status: elStatus.value, cliente: elCliente.value,
});

function vazio() {
  return `<li class="mesa-vazia mesa-vazia-centro"><span class="mesa-vazia-ico">${ic('arquivo')}</span>
    <strong>${todos.length ? 'Nada encontrado' : 'O histórico está vazio'}</strong>
    <span>${todos.length ? 'Tente outra busca ou limpe os filtros.' : 'Cada volume inserido no Controle NC aparece aqui.'}</span></li>`;
}

function tabela(lista, { conjunto = marcados, attr = "data-marcar", attrTodos = "data-marcar-todos" } = {}) {
  return `
    <div class="tabela-rolagem">
      <table class="tabela-papel">
        <thead><tr><th scope="col" class="col-caixa"><label class="email-caixa caixa-tabela" title="Marcar todos"><input type="checkbox" ${attrTodos} ${lista.length && lista.every((v) => conjunto.has(v.numero)) ? "checked" : ""} aria-label="Marcar todos" /></label></th>${Planilha.COLUNAS.map((c) => `<th scope="col">${c.titulo}</th>`).join('')}</tr></thead>
        <tbody>${lista.map((v) => `
          <tr data-ver="${v.numero}" class="${conjunto.has(v.numero) ? "marcado" : ""} ${Catalogo.prazo(v) === 'vencido' ? 'linha-vencida' : ''}" tabindex="0">
            <td class="col-caixa"><label class="email-caixa caixa-tabela" title="Marcar"><input type="checkbox" ${attr}="${v.numero}" ${conjunto.has(v.numero) ? "checked" : ""} aria-label="Marcar ${esc(v.codigo)}" /></label></td>
            ${Planilha.COLUNAS.map((c, i) => {
              const valor = esc(c.valor(v));
              if (c.titulo === 'STATUS') return `<td><span class="tag ${classeStatus(v.status)}">${valor}</span></td>`;
              if (c.titulo === '#ID') return `<td><b class="cliente-ponto" style="--cor:${v.cliente_cor || '#A39A7C'}"></b> <b>${valor}</b></td>`;
              return `<td class="${i === 4 || c.titulo === 'AWB' ? 'mono' : ''}">${valor || '—'}</td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderizar() {
  // ticket ou pacote aberto: a tela dele no lugar da lista (os filtros somem, como na Minha Mesa)
  if (aberto) {
    const html = telaAberta();
    if (html) {
      elFiltros.style.display = 'none';
      elArea.classList.add('h-aberto');
      elArea.innerHTML = html;
      TicketUI.alinharPicotes(elArea);
      if (window.Anexos) Anexos.preencher(elArea);
      return;
    }
    aberto = null;   // não existe mais (excluído): volta para a lista
  }
  elFiltros.style.display = '';
  elArea.classList.remove('h-aberto');
  const lista = filtrados();
  const contador = document.getElementById('contador');
  if (contador) contador.textContent = lista.length;
  document.querySelectorAll('[data-visao]').forEach((b) => {
    const ativo = b.dataset.visao === visao;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-checked', String(ativo));
  });
  if (visao === 'tabela') {
    elArea.innerHTML = lista.length ? tabela(lista) : `<ul class="lista-tickets desktop-tickets vazia" id="lista">${vazio()}</ul>`;
    atualizarBotaoExcluir();
    return;
  }
  // as peças do mesmo Registro em sequência aparecem juntas, num pacote de tickets
  elArea.innerHTML = `<ul class="lista-tickets desktop-tickets ${lista.length ? '' : 'vazia'}" id="lista">${
    lista.length ? TicketUI.agrupar(lista).map((g, i) => (g.membros
      ? TicketUI.pacote(g.membros, { i, caixa: true, marcado: g.membros.every((m) => marcados.has(m.numero)) })
      : TicketUI.padrao(g.volume, { i, caixa: 'mesa', marcado: marcados.has(g.volume.numero), classe: 'com-caixa' }))).join('') : vazio()}</ul>`;
  atualizarBotaoExcluir();
}

[elBusca, elSituacao, elTipo, elStatus, elCliente].forEach((el) => el.addEventListener('input', renderizar));

document.querySelectorAll('[data-visao]').forEach((b) => b.addEventListener('click', () => {
  visao = b.dataset.visao;
  salvarPreferencia(CHAVE_VISAO, visao);
  renderizar();
}));

/* ---------- Ticket ou pacote aberto NA TELA ----------
   O mesmo layout da Minha Mesa (Controle NC): barra com "← Voltar" à esquerda e
   as teclas à direita; o ticket grande com a linha do tempo, ou o pacote com
   Tickets | Tabela, caixinhas, imprimir e excluir. O que for criado na mesa
   deve aparecer igual aqui. */
let aberto = null;          // { tipo: 'ticket', numero, doPacote } | { tipo: 'pacote', id }
let visaoPacote = 'tickets';
const marcadosPac = new Set();
const elFiltros = document.querySelector('.filtros-barra');
const teclaH = (classe, atributos, html) => `<button type="button" class="btn ${classe}" ${atributos}>${html}</button>`;
const membrosDe = (id) => todos.filter((v) => v.pacote === id).sort((a, b) => (a.id_ciclo ?? a.numero) - (b.id_ciclo ?? b.numero));

function abrir(numero) {
  const doPacote = aberto?.tipo === 'pacote' ? aberto.id : null;
  aberto = { tipo: 'ticket', numero: Number(numero), doPacote };
  renderizar();
  elArea.scrollTop = 0;
}
function abrirPacote(id) {
  if (aberto?.id !== id) { visaoPacote = 'tickets'; marcadosPac.clear(); }
  aberto = { tipo: 'pacote', id };
  renderizar();
  elArea.scrollTop = 0;
}
function voltarH() {
  aberto = aberto?.tipo === 'ticket' && aberto.doPacote && membrosDe(aberto.doPacote).length
    ? { tipo: 'pacote', id: aberto.doPacote } : null;
  renderizar();
}

/** HTML do ticket/pacote aberto (ou null, se ele não existe mais). */
function telaAberta() {
  const barra = (esq, dir) => `<div class="desktop-acao h-acao"><div class="acao-lado">${esq}</div><div class="acao-lado acao-dir">${dir}</div></div>`;
  if (aberto.tipo === 'ticket') {
    const v = todos.find((x) => x.numero === aberto.numero);
    if (!v) return null;
    const dir = [
      TicketUI.botaoNota(v, 'data-h-nota'),
      teclaH('key--icon', 'data-h-foto title="Baixar a imagem do ticket (PNG)" aria-label="Baixar a imagem do ticket"', ic('download')),
      teclaH('key--icon', 'data-h-imprimir title="Imprimir a etiqueta de novo (status atual)" aria-label="Imprimir a etiqueta de novo"', ic('impressora')),
      `<a class="btn key--icon" href="controle-nc.html#editar-${v.numero}" title="Editar as informações" aria-label="Editar as informações">${ic('caneta')}</a>`,
      teclaH('key--red key--icon', 'data-h-excluir title="Excluir volume" aria-label="Excluir volume"', ic('x')),
    ].join('');
    return `${barra(teclaH('btn-voltar', 'data-h-voltar', `← Voltar para ${aberto.doPacote ? 'o pacote' : 'o histórico'}`), dir)}
      <div class="nc-ver">${TicketUI.grandeDe(v)}
        ${v.historico?.length ? `<details class="nc-tempo-caixa"><summary>${ic('relogio')} Linha do tempo (${v.historico.length})</summary>${TicketUI.linhaDoTempo(v)}</details>` : ''}
      </div>`;
  }
  const membros = membrosDe(aberto.id);
  if (!membros.length) return null;
  for (const n of [...marcadosPac]) if (!membros.some((m) => m.numero === n)) marcadosPac.delete(n);
  const v = membros[0];
  const n = marcadosPac.size;
  const dir = `
    <span class="nc-visao" role="radiogroup" aria-label="Forma de ver o pacote">
      ${teclaH(`btn-sm ${visaoPacote === 'tickets' ? 'ativo' : ''}`, `data-pac-visao="tickets" role="radio" aria-checked="${visaoPacote === 'tickets'}"`, `${ic('ticket')} Tickets`)}
      ${teclaH(`btn-sm ${visaoPacote === 'tabela' ? 'ativo' : ''}`, `data-pac-visao="tabela" role="radio" aria-checked="${visaoPacote === 'tabela'}"`, `${ic('documento')} Tabela`)}
    </span>
    ${teclaH('key--icon', 'data-pac-imprimir title="Imprimir de novo a etiqueta do pacote" aria-label="Imprimir de novo a etiqueta do pacote"', ic('impressora'))}
    ${n
      ? teclaH('key--red btn-excluir-marcados com-marcados', `data-pac-excluir-marcados title="Excluir os tickets marcados" aria-label="Excluir ${n} ticket${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''}"`, `${ic('x')}<span class="excluir-qtd">${n}</span>`)
      : teclaH('key--red key--icon', 'data-pac-excluir title="Excluir o pacote (todos os tickets de dentro)" aria-label="Excluir o pacote"', ic('x'))}`;
  const quem = !v.criado_por || v.criado_por === usuario?.nome ? 'você' : esc(Helpy?.apelido ? Helpy.apelido(v.criado_por) : v.criado_por);
  return `${barra(teclaH('btn-voltar', 'data-h-voltar', '← Voltar para o histórico'), dir)}
    <div class="etapa-cabeca pacote-cabeca">
      <span class="pacote-cabeca-ico">${ic('pacote')}</span>
      <div>
        <h1><span class="acento">${esc(TicketUI.codigoPacote(aberto.id))}</span> · ${membros.length} tickets</h1>
        <p>${esc(v.tipo_titulo)} · ${esc(TicketUI.faixaCodigos(membros))} · registrado por ${quem} em ${esc(TicketUI.dataHoraBr(v.data_entrada))}</p>
      </div>
    </div>
    ${visaoPacote === 'tabela'
      ? `<div class="mesa-tabela pacote-tabela">${tabela(membros, { conjunto: marcadosPac, attr: 'data-pac-marcar', attrTodos: 'data-pac-marcar-todos' })}</div>`
      : `<ul class="lista-tickets desktop-tickets pacote-grade">${membros.map((m, i) => TicketUI.padrao(m, { i, giro: ((m.numero * 37) % 5 - 2) * .6, caixa: 'mesa', marcado: marcadosPac.has(m.numero), classe: 'com-caixa' }).replace(/data-marcar="/g, 'data-pac-marcar="')).join('')}</ul>`}`;
}

// Teclas da tela aberta (ticket ou pacote)
elArea.addEventListener('click', async (e) => {
  if (!aberto) return;
  const alvo = (s) => e.target.closest(s);
  if (alvo('[data-h-voltar]')) { voltarH(); return; }
  if (aberto.tipo === 'ticket') {
    const v = todos.find((x) => x.numero === aberto.numero);
    if (!v) return;
    if (alvo('[data-h-nota]')) TicketUI.lerNota(v.nota, v.codigo, v.anexos);
    else if (alvo('[data-h-foto]')) await baixarFoto(v.numero, alvo('[data-h-foto]'), elArea);
    else if (alvo('[data-h-imprimir]')) await imprimirDeNovo(v.numero, alvo('[data-h-imprimir]'));
    else if (alvo('[data-h-excluir]')) confirmarExclusao([v], () => voltarH());
    return;
  }
  const membros = membrosDe(aberto.id);
  if (alvo('[data-pac-visao]')) { visaoPacote = alvo('[data-pac-visao]').dataset.pacVisao; renderizar(); }
  else if (alvo('[data-pac-imprimir]')) {
    const b = alvo('[data-pac-imprimir]');
    b.disabled = true;
    const r = await Impressao.imprimirPacote(membros).catch((erro) => ({ ok: false, erro: erro.message }));
    b.disabled = false;
    if (r?.ok && r.via !== 'nenhum') Efeitos.toast(`Etiqueta do pacote <b>${esc(TicketUI.codigoPacote(aberto.id))}</b> enviada para a impressora`, { icone: ic('impressora'), tipo: 'sucesso' });
    else if (!r?.ok) Efeitos.toast(`Não imprimiu o pacote: ${esc(r?.erro || 'impressora indisponível')}`, { icone: ic('alerta'), tipo: 'alerta', duracao: 8000 });
  } else if (alvo('[data-pac-excluir]')) confirmarExclusao(membros, () => renderizar());
  else if (alvo('[data-pac-excluir-marcados]')) confirmarExclusao(membros.filter((m) => marcadosPac.has(m.numero)), () => renderizar());
});
elArea.addEventListener('change', (e) => {
  if (aberto?.tipo !== 'pacote') return;
  const um = e.target.closest('[data-pac-marcar]');
  const todosCx = e.target.closest('[data-pac-marcar-todos]');
  if (um) { if (um.checked) marcadosPac.add(Number(um.dataset.pacMarcar)); else marcadosPac.delete(Number(um.dataset.pacMarcar)); }
  if (todosCx) membrosDe(aberto.id).forEach((m) => (todosCx.checked ? marcadosPac.add(m.numero) : marcadosPac.delete(m.numero)));
  if (um || todosCx) renderizar();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && aberto && !document.querySelector('dialog[open]')) voltarH();
});

/** Baixa o ticket aberto como imagem PNG (igual à mesa). */
async function baixarFoto(numero, botao, modal) {
  const v = todos.find((x) => x.numero === numero);
  const ticket = modal.querySelector('.ticket-palco .tk');
  if (!v || !ticket) return;
  botao.disabled = true;
  try {
    await Foto.baixar(ticket, `Ticket ${v.codigo}${v.ciclo_titulo ? ` (${v.ciclo_titulo})` : ''}`);
    API.registrarAcao('Baixou a imagem do ticket', v.codigo, '');
    Efeitos.toast(`Imagem do ticket <b>${esc(v.codigo)}</b> baixada.`, { icone: ic('download'), tipo: 'sucesso' });
  } catch (erro) {
    Efeitos.toast(esc(erro.message || 'Não consegui gerar a imagem.'), { icone: ic('alerta'), tipo: 'alerta' });
  } finally {
    botao.disabled = false;
  }
}
elArea.addEventListener('click', async (e) => {
  const botaoImprimir = e.target.closest('[data-imprimir]');
  if (botaoImprimir) { await imprimirDeNovo(Number(botaoImprimir.dataset.imprimir), botaoImprimir); return; }
  if (e.target.closest('.caixa-tabela, .tkp-caixa')) return;   // caixinha: só marca
  const pacote = e.target.closest('[data-abrir-pacote]');
  if (pacote) { abrirPacote(pacote.dataset.abrirPacote); return; }
  const alvo = e.target.closest('[data-ver]');
  if (alvo) abrir(alvo.dataset.ver);
});

elArea.addEventListener('keydown', (e) => {
  const linha = e.target.closest('tr[data-ver]');
  if (linha && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(linha.dataset.ver); }
});

document.getElementById('exportar').addEventListener('click', async () => {
  const lista = filtrados();
  if (!lista.length) { Efeitos.toast('Nada para exportar com esses filtros.', { icone: ic('alerta') }); return; }
  Planilha.baixar(Planilha.nomeArquivo('mutility-historico-nc'), Planilha.csv(lista));
  await API.registrarAcao('Exportou o histórico (CSV)', '', `${lista.length} volume(s)`);
  Efeitos.toast(`${lista.length} volume${lista.length > 1 ? 's' : ''} exportado${lista.length > 1 ? 's' : ''}`, { icone: ic('download'), tipo: 'sucesso' });
});

addEventListener('storage', (e) => { if (e.key === Banco.CHAVE) carregar(); });

if (usuario) {
  Sessao.montarMenu(usuario);
  carregar();
}

/** Imprime de novo o ticket com o status atual (botão de impressora na faixa do ticket). */
async function imprimirDeNovo(numero, botao) {
  const { ok, dados: v } = await API.volume(numero);
  if (!ok) return;
  botao.classList.add('imprimindo');
  const r = await Impressao.imprimir(v);
  botao.classList.remove('imprimindo');
  Efeitos.toast(r.ok ? `Ticket ${esc(v.codigo)} enviado para a impressora` : esc(r.erro || 'Não foi possível imprimir.'),
    { icone: ic(r.ok ? 'impressora' : 'alerta'), tipo: r.ok ? 'sucesso' : 'alerta' });
}

// Copiar para a planilha online: as linhas filtradas, nas colunas B a L
document.getElementById('copiarPlanilha').addEventListener('click', async (e) => {
  const lista = filtrados().slice().sort((a, b) => a.numero - b.numero);
  if (!lista.length) { Efeitos.toast('Nada para copiar com esses filtros.', { icone: ic('alerta') }); return; }
  try {
    await Planilha.copiar(lista);
    await API.registrarAcao('Copiou para a planilha', '', `${lista.length} volume(s)`);
    Efeitos.toast(`${lista.length} linha${lista.length > 1 ? 's' : ''} copiada${lista.length > 1 ? 's' : ''}. Na planilha, clique na coluna <b>B</b> da primeira linha vazia e cole (Ctrl+V).`, { icone: ic('copiar'), tipo: 'sucesso', duracao: 7000 });
  } catch {
    Efeitos.toast('O navegador não deixou copiar. Tente de novo clicando no botão.', { icone: ic('alerta'), tipo: 'alerta' });
  }
});

// ---------- Marcar (caixinha) e excluir os marcados ----------
const elExcluir = document.getElementById('excluirMarcados');
function atualizarBotaoExcluir() {
  // quem saiu da lista (filtro/exclusão) deixa de estar marcado
  for (const n of [...marcados]) if (!todos.some((v) => v.numero === n)) marcados.delete(n);
  const n = marcados.size;
  elExcluir.classList.toggle('com-marcados', n > 0);
  elExcluir.innerHTML = `${ic('x')}${n ? `<span class="excluir-qtd">${n}</span>` : ''}`;
  elExcluir.title = n ? `Excluir ${n} volume${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''}` : 'Marque a caixinha dos volumes para excluir';
  elExcluir.setAttribute('aria-label', elExcluir.title);
}
elArea.addEventListener('change', (e) => {
  const um = e.target.closest('[data-marcar]');
  const todosCx = e.target.closest('[data-marcar-todos]');
  const pacote = e.target.closest('[data-marcar-pacote]');
  if (pacote) {   // pacote: marca todos os tickets de dentro
    const li = pacote.closest('[data-membros]');
    (li?.dataset.membros || '').split(',').map(Number).filter(Boolean).forEach((n) => (pacote.checked ? marcados.add(n) : marcados.delete(n)));
    li?.classList.toggle('marcado', pacote.checked);
    atualizarBotaoExcluir();
    return;
  }
  if (um) {
    if (um.checked) marcados.add(Number(um.dataset.marcar)); else marcados.delete(Number(um.dataset.marcar));
    um.closest('.tkp-item, tr')?.classList.toggle('marcado', um.checked);
  }
  if (todosCx) {
    filtrados().forEach((v) => (todosCx.checked ? marcados.add(v.numero) : marcados.delete(v.numero)));
    elArea.querySelectorAll('[data-marcar]').forEach((c) => { c.checked = todosCx.checked; c.closest('tr')?.classList.toggle('marcado', todosCx.checked); });
  }
  if (um || todosCx) atualizarBotaoExcluir();
});

elExcluir.addEventListener('click', () => {
  const lista = todos.filter((v) => marcados.has(v.numero));
  if (!lista.length) { Efeitos.toast('Marque a caixinha dos volumes que você quer excluir e clique no X.', { icone: ic('x') }); return; }
  confirmarExclusao(lista);
});

/** Pergunta antes de excluir (marcados ou o ticket aberto). */
function confirmarExclusao(lista, depois = () => {}) {
  const d = document.createElement('dialog');
  d.className = 'modal modal-pergunta';
  d.innerHTML = `
    <div class="modal-conteudo">
      <span class="pergunta-ico">${ic('x')}</span>
      <h2>Excluir ${lista.length > 1 ? `${lista.length} volumes` : 'este volume'}?</h2>
      <p>${lista.slice(0, 8).map((v) => `<b>${esc(v.codigo)}</b>`).join(', ')}${lista.length > 8 ? '…' : ''}</p>
      <p>Eles saem do Controle NC e do Histórico de Tickets. A exclusão fica no Registro de Auditoria e não pode ser desfeita.</p>
      <div class="modal-acoes">
        <button type="button" class="btn" data-resposta="nao">Manter</button>
        <button type="button" class="btn key--red" data-resposta="sim">${ic('x')} Excluir ${lista.length > 1 ? `${lista.length} volumes` : 'volume'}</button>
      </div>
    </div>`;
  const fim = () => { d.close(); d.remove(); };
  d.addEventListener('cancel', (e) => { e.preventDefault(); fim(); });
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-resposta]');
    if (!b) return;
    if (b.dataset.resposta !== 'sim') { fim(); return; }
    let n = 0;
    for (const v of lista) {
      const { ok } = await API.excluirVolume(v.numero);
      if (ok) { n += 1; marcados.delete(v.numero); if (v.anexos?.length) Anexos.apagar(v.anexos.map((a) => a.id)); }
    }
    fim();
    await carregar();   // primeiro atualiza a lista (o pop-up do pacote se redesenha com ela)
    depois();
    Efeitos.toast(`${n} volume${n > 1 ? 's' : ''} excluído${n > 1 ? 's' : ''}.`, { icone: ic('x') });

  });
  document.body.appendChild(d);
  d.showModal();
}
