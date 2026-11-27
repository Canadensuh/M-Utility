/* =========================================================
   controle-nc.js — a mesa do setor de Não Conformidades
   Mesmo layout da antiga "Minha Mesa" do HelpIA:
   - (os volumes que saem vão direto para o Histórico de Tickets)
   - centro: os volumes que estão no setor, jogados na mesa.
     Ao inserir um volume, o passo a passo acontece aqui dentro;
   - direita: Score e o Helpy com o café.
   Fluxo: Tipo de NC → Status → Dados (DANFE/Pedido, NF, série, CNPJ,
   cliente, AWB) → Local (prateleira / pallet de dentro / pallet de fora)
   → Nota (opcional) → Revisão → ticket impresso e entregue ao Helpy.
   ========================================================= */

const usuario = Sessao.exigir(['usuario', 'admin']);

const elPalco = document.getElementById('palco');
const elPassos = document.getElementById('passos');
const elOffline = document.getElementById('avisoOffline');
const elTitulo = document.getElementById('tituloTampo');
const elAcao = document.getElementById('desktopAcao');
const elListaSaidas = document.getElementById('listaSaidas');
const elContadorSaidas = document.getElementById('contadorSaidas');
// Score (quadrinho da lateral + placar completo): js/placar.js
const placar = Placar.montar({ volumes: () => volumes });

document.getElementById('helpyAvatar').outerHTML = Helpy.avatar('acenando');
const helpy = new Helpy(document.getElementById('helpyRaiz'), document.getElementById('helpyFeed'), { balao: true });

let volumes = [];          // todos os volumes (mais novo primeiro)
let clientes = [];
let assinatura = null;     // evita redesenhar a mesa se nada mudou
let destaque = null;       // número do volume que acabou de chegar na mesa
let visto = null;          // número do volume aberto no centro (etapa "ver")
const selecionados = new Set();   // volumes da mesa marcados (para excluir com o X)
const marcadosHist = new Set();   // volumes da bandeja marcados (para tirar da bandeja)
let excluindo = null;
let modoEdicao = false;     // a tela do volume só mostra o painel de edição depois do lápis

const PASSOS = [
  { id: 'tipo', rotulo: 'Tipo' },
  { id: 'status', rotulo: 'Status' },
  { id: 'dados', rotulo: 'Dados' },
  { id: 'local', rotulo: 'Local' },
  { id: 'nota', rotulo: 'Nota' },
  { id: 'revisao', rotulo: 'Revisão' },
];

let estado = novoEstado();
let etapaAtual = null;

function novoEstado() {
  return { tipo: null, status: null, local: null, codigo: '', nf: '', serie: '', cnpj: '', cliente_id: null, cliente_nome: '', awb: '', nota: '', anexos: [] };
}

const esc = (texto) => escaparHtml(String(texto ?? ''));
const primeiroNome = () => Helpy.apelido(usuario?.nome);
const ehAdmin = usuario?.perfil === 'admin';

const noSetor = () => volumes.filter((v) => !Catalogo.saiu(v));
const saidasHoje = () => volumes.filter((v) => Catalogo.saiu(v) && mesmoDia(v.data_saida));
const clienteDe = (id) => clientes.find((c) => c.id === Number(id)) || null;

// ---------- Cabeçalho do desktop (título, etapas e botões) ----------
const tecla = (classe, atributos, html) => `<button type="button" class="btn ${classe}" ${atributos}>${html}</button>`;

function botoesDaEtapa() {
  const esq = [];
  const dir = [];
  const voltar = (rotulo = '← Voltar') => tecla('btn-voltar', 'data-voltar', rotulo);
  const cancelar = tecla('key--rosa', 'data-cancelar', `${ic('x')} Cancelar`);
  if (BARRAS_EXTRAS[etapaAtual]) BARRAS_EXTRAS[etapaAtual]({ esq, dir, voltar, cancelar, tecla });
  switch (etapaAtual) {
    case 'locais':
      dir.push(tecla('btn-primary', 'data-abrir', `${ic('mais')} Inserir volume`));
      break;
    case 'mesa': {
      const n = selecionados.size;
      const tem = naMesa().length > 0;
      esq.push(tecla('key--icon', 'data-menu-locais title="Menu: Todos, Pallet de fora, Prateleira, Pallet de dentro" aria-label="Voltar para o menu da Minha Mesa"', ic('pastas')));
      if (tem) esq.push('<span data-vaga-busca></span>');
      if (tem) {
        dir.push(`<span class="nc-visao" role="radiogroup" aria-label="Forma de ver a mesa">
          ${tecla(`btn-sm ${visaoMesa === 'tickets' ? 'ativo' : ''}`, `data-visao-mesa="tickets" role="radio" aria-checked="${visaoMesa === 'tickets'}" title="Ver como tickets"`, `${ic('ticket')} Tickets`)}
          ${tecla(`btn-sm ${visaoMesa === 'tabela' ? 'ativo' : ''}`, `data-visao-mesa="tabela" role="radio" aria-checked="${visaoMesa === 'tabela'}" title="Ver como a planilha"`, `${ic('documento')} Tabela`)}
        </span>`);
      }
      dir.push(tecla('btn-primary', 'data-abrir', `${ic('mais')} Inserir volume`));
      if (tem) {
        // envelope: monta o e-mail com os tickets marcados (só o ícone)
        dir.push(tecla(`btn-email-marcados ${n ? 'com-marcados' : ''}`,
          `data-abrir-emails aria-label="${n ? `Enviar e-mail com ${n} ticket${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''}` : 'Enviar e-mail com os tickets marcados'}"
           title="${n ? 'Montar o e-mail com os tickets marcados' : 'Marque a caixinha dos tickets e clique aqui para montar o e-mail'}"`,
          `${ic('envelope')}${n ? `<span class="excluir-qtd">${n}</span>` : ''}`));
        dir.push(tecla(`key--red btn-excluir-marcados ${n ? 'com-marcados' : ''}`,
          `data-excluir-marcados aria-label="${n ? `Excluir ${n} volume${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''}` : 'Excluir volumes marcados'}"
           title="${n ? 'Excluir os volumes marcados' : 'Marque a caixinha de um volume para excluir'}"`,
          `${ic('x')}${n ? `<span class="excluir-qtd">${n}</span>` : ''}`));
      }
      break;
    }
    case 'ver': {
      esq.push(tecla('btn-voltar', 'data-fechar-ver', '← Voltar para a mesa'));
      const v = volumeVisto();
      if (v) {
        const nota = TicketUI.botaoNota(v, `data-ver-nota="${v.numero}"`);
        if (nota) dir.push(nota);
        dir.push(
          tecla('key--icon', `data-foto-ticket="${v.numero}" title="Baixar a imagem do ticket (PNG)" aria-label="Baixar a imagem do ticket"`, ic('download')),
          tecla('key--icon', `data-imprimir="${v.numero}" title="Imprimir a etiqueta de novo (status atual)" aria-label="Imprimir a etiqueta de novo"`, ic('impressora')),
          tecla(`key--icon ${modoEdicao ? 'ativo' : ''}`, `data-editar title="Editar as informações" aria-label="Editar as informações" aria-pressed="${modoEdicao}"`, ic('caneta')),
          tecla('key--red key--icon', `data-excluir="${v.numero}" title="Excluir volume" aria-label="Excluir volume"`, ic('x')),
        );
      }
      break;
    }
    case 'tipo':
      dir.push(cancelar);
      break;
    case 'status':
    case 'local':
      esq.push(voltar());
      dir.push(cancelar);
      break;
    case 'dados':
    case 'nota':
      esq.push(voltar());
      dir.push(cancelar);
      break;
    case 'revisao':
      esq.push(voltar('← Ajustar'));
      dir.push(cancelar, tecla('btn-primary', 'id="gerarTicket" data-gerar', `${ic('ticket')} Gerar ticket`));
      break;
    default:
      break;
  }
  if (!esq.length && !dir.length) return '';
  return `<div class="acao-lado">${esq.join('')}</div><div class="acao-lado acao-dir">${dir.join('')}</div>`;
}

// ---------- Bandeja retrátil ----------
function atualizarBandejaVisivel() {
  document.body.classList.toggle('abrindo-chamado', !['mesa', 'ver', 'locais', 'pacote'].includes(etapaAtual));
}
function alternarBandeja(abrir = !document.body.classList.contains('coluna-aberta')) {
  document.body.classList.toggle('coluna-aberta', abrir);
  document.querySelectorAll('.coluna-alca').forEach((b) => b.setAttribute('aria-expanded', String(abrir)));
  if (abrir) setTimeout(() => document.querySelector('.btn-recolher')?.focus({ preventScroll: true }), 50);
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-alternar-coluna]')) alternarBandeja(); });

function renderizarCabecalho() {
  atualizarBandejaVisivel();
  // Registro em sequência: só a tela de bipagem ("Bipe a DANFE…") fica com a mesa escura
  document.body.classList.toggle("seq-escuro", etapaAtual === "bipagem");
  if (etapaAtual === 'mesa') {
    elTitulo.innerHTML = `${ic('pacote')} Minha Mesa${filtroLocal === 'todos' ? '' : ` <span class="titulo-filtro">· ${esc(filtroAtual().titulo)}</span>`}${filtroTipo === 'todos' ? '' : ` <span class="titulo-filtro">· ${esc(Catalogo.tipo(filtroTipo)?.titulo || '')}</span>`}`;
  } else if (etapaAtual === 'locais') {
    elTitulo.innerHTML = `${ic('pacote')} Minha Mesa`;
  } else if (TITULOS_EXTRAS[etapaAtual]) {
    elTitulo.innerHTML = TITULOS_EXTRAS[etapaAtual]();
  } else if (etapaAtual === 'ver') {
    elTitulo.innerHTML = `${ic('olho')} Volume ${esc(volumeVisto()?.codigo || '')}`;
  } else {
    elTitulo.innerHTML = `${ic('ticket')} Novo volume`;
  }
  const digitando = document.activeElement === elInputBusca;
  const cursor = digitando ? elInputBusca.selectionStart : null;
  elAcao.innerHTML = botoesDaEtapa();
  const vaga = elAcao.querySelector('[data-vaga-busca]');
  if (vaga) {
    vaga.replaceWith(elBuscaMesa);
    if (digitando) { elInputBusca.focus(); elInputBusca.setSelectionRange(cursor, cursor); }
  }

  const visiveis = passosVisiveis();
  const indice = visiveis.findIndex((p) => p.id === etapaAtual);
  elPassos.hidden = indice < 0;
  elPassos.innerHTML = indice < 0 ? '' : visiveis.map((p, i) => {
    const classe = i < indice ? 'feito' : i === indice ? 'atual' : '';
    return `<li class="passo-topo ${classe}">
      <button type="button" data-ir="${p.id}" ${i < indice ? '' : 'disabled'}>
        <span class="passo-bolinha">${i < indice ? '<i class="ic ic-check" aria-hidden="true"></i>' : i + 1}</span><span class="passo-rotulo">${p.rotulo}</span>
      </button></li>`;
  }).join('');
}

elPassos.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-ir]');
  if (botao && !botao.disabled) irPara(botao.dataset.ir, 'esq');
});


// Botões que aparecem em vários lugares (barra da mesa, mesa vazia, tickets, bandeja, Helpy)
document.addEventListener('click', (e) => {
  const alvo = (seletor) => e.target.closest(seletor);
  if (alvo('.caixa-tabela')) return;   // caixinha da tabela: marca, não abre o volume
  if (alvo('[data-abrir]')) iniciarVolume();
  else if (alvo('[data-cancelar]')) cancelarVolume();
  else if (alvo('[data-voltar]')) irPara(anteriorA(etapaAtual), 'esq');
  else if (alvo('[data-avancar]')) avancarDe(etapaAtual);
  else if (alvo('[data-gerar]')) gerarTicket();
  else if (alvo('[data-excluir-marcados]')) pedirExclusao([...selecionados], 'mesa');
  else if (alvo('[data-excluir]')) pedirExclusao([Number(alvo('[data-excluir]').dataset.excluir)], 'mesa');
  else if (alvo('[data-excluir-hist]')) pedirExclusao([...marcadosHist], 'bandeja');
  else if (alvo('[data-fechar-ver]')) fecharVolume();
  else if (alvo('[data-abrir-pacote]')) abrirPacote(alvo('[data-abrir-pacote]').dataset.abrirPacote);
  else if (alvo('[data-fechar-pacote]')) fecharPacote();
  else if (alvo('[data-visao-pacote]')) alternarVisaoPacote(alvo('[data-visao-pacote]').dataset.visaoPacote);
  else if (alvo('[data-imprimir-pacote]')) reimprimirPacote(alvo('[data-imprimir-pacote]'));
  else if (alvo('[data-excluir-pacote]')) pedirExclusao(membrosDoPacote(pacoteAberto).map((v) => v.numero), 'mesa');
  else if (alvo('[data-excluir-no-pacote]')) pedirExclusao(membrosDoPacote(pacoteAberto).filter((v) => selecionados.has(v.numero)).map((v) => v.numero), 'mesa');
  else if (alvo('[data-editar]')) alternarEdicao();
  else if (alvo('[data-menu-locais]')) irPara('locais', 'esq', { falar: false });
  else if (alvo('[data-filtro]')) escolherFiltro(alvo('[data-filtro]').dataset.filtro);
  else if (alvo('[data-visao-mesa]')) alternarVisao(alvo('[data-visao-mesa]').dataset.visaoMesa);
  else if (alvo('[data-tipo-todos]')) escolherTipo('todos');
  else if (alvo('[data-tipo-filtro]')) escolherTipo(alvo('[data-tipo-filtro]').dataset.tipoFiltro);
  else if (alvo('[data-copiar-planilha]')) copiarMesa();
  else if (alvo('[data-abrir-emails]')) abrirEmailsSelecionados();
  else if (alvo('[data-ver-nota]')) {
    const v = volumes.find((x) => x.numero === Number(alvo('[data-ver-nota]').dataset.verNota));
    if (v) TicketUI.lerNota(v.nota, v.codigo, v.anexos);
  }

  else if (alvo('[data-foto-ticket]')) baixarFotoTicket(alvo('[data-foto-ticket]'));
  else if (alvo('[data-ampliar]')) Anexos.ampliar(alvo('[data-ampliar]').dataset.ampliar);
  else if (alvo('[data-imprimir]')) reimprimir(Number(alvo('[data-imprimir]').dataset.imprimir), alvo('[data-imprimir]'));
  else if (alvo('[data-ver]')) verVolume(Number(alvo('[data-ver]').dataset.ver));
});

// Caixinha de seleção no canto do ticket (mesa ou bandeja)
document.addEventListener('change', (e) => {
  const caixa = e.target.closest('[data-marcar]');
  if (!caixa) return;
  const numero = Number(caixa.dataset.marcar);
  const daBandeja = caixa.dataset.lista === 'hist';
  const conjunto = daBandeja ? marcadosHist : selecionados;
  if (caixa.checked) conjunto.add(numero); else conjunto.delete(numero);
  caixa.closest('.tkp-item, tr')?.classList.toggle('marcado', caixa.checked);
  const todos = document.querySelector('[data-marcar-todos-mesa]');
  if (todos) todos.checked = [...document.querySelectorAll('#tabelaSetor [data-marcar]')].every((c) => c.checked);
  if (daBandeja) atualizarBotaoBandeja(); else renderizarCabecalho();
});
// Caixinha do PACOTE: marca (ou desmarca) todos os tickets de dentro de uma vez
document.addEventListener('change', (e) => {
  const caixa = e.target.closest('[data-marcar-pacote]');
  if (!caixa) return;
  const li = caixa.closest('[data-membros]');
  (li?.dataset.membros || '').split(',').map(Number).filter(Boolean)
    .forEach((n) => (caixa.checked ? selecionados.add(n) : selecionados.delete(n)));
  li?.classList.toggle('marcado', caixa.checked);
  renderizarCabecalho();
});
// Tabela da mesa: marcar todos (os que aparecem com a busca)
document.addEventListener('change', (e) => {
  const todos = e.target.closest('[data-marcar-todos-mesa]');
  if (!todos) return;
  document.querySelectorAll('#tabelaSetor tr[data-numero]:not(.apagado) [data-marcar]').forEach((c) => {
    c.checked = todos.checked;
    if (todos.checked) selecionados.add(Number(c.dataset.marcar)); else selecionados.delete(Number(c.dataset.marcar));
    c.closest('tr').classList.toggle('marcado', todos.checked);
  });
  renderizarCabecalho();
});

function iniciarVolume() {
  estado = novoEstado();
  irPara('tipo');
}

// ---------- Rever um volume no centro ----------
const volumeVisto = () => volumes.find((v) => v.numero === visto) || null;

function verVolume(numero) {
  if (etapaAtual === 'envio') return;
  if (PASSOS.some((p) => p.id === etapaAtual)) {
    helpy.dizer('Você está no meio de um volume novo. Quer deixar o rascunho de lado para ver esse ticket?', {
      acoes: [
        { rotulo: 'Ver o ticket', fn: () => { estado = novoEstado(); abrirVolume(numero); } },
        { rotulo: 'Continuar o volume', destaque: true, fn: () => {} },
      ],
    });
    return;
  }
  abrirVolume(numero);
}

function abrirVolume(numero) {
  visto = numero;
  modoEdicao = false;
  irPara('ver', 'dir');
}

function fecharVolume() {
  // veio de dentro de um pacote: volta para o pacote (se ainda tiver ticket nele)
  if (pacoteAberto && membrosDoPacote(pacoteAberto).length) { irPara('pacote', 'esq', { falar: false }); return; }
  pacoteAberto = null;
  irPara('mesa', 'esq', { falar: false });
}

/* ---------- Pacote de tickets (Registro em sequência) ----------
   Na mesa, as peças da mesma leva viram um cartão só. Clicando, abre a tela
   do pacote com todos os tickets dentro (cada um abre normalmente). */
let pacoteAberto = null;
/** As "peças" da grade: tickets soltos e pacotes. chave = número do ticket ou "p:<pacote>". */
const pecasDaMesa = (lista) => TicketUI.agrupar(lista).map((g) => (g.membros
  ? { chave: `p:${g.pacote}`, membros: g.membros }
  : { chave: String(g.volume.numero), volume: g.volume }));
const membrosDoPacote = (id) => noSetor().filter((v) => v.pacote === id)
  .sort((a, b) => (a.id_ciclo ?? a.numero) - (b.id_ciclo ?? b.numero));

function abrirPacote(id) {
  if (id !== pacoteAberto) visaoPacote = 'tickets';
  pacoteAberto = id;
  irPara('pacote', 'dir');
}
function fecharPacote() {
  pacoteAberto = null;
  irPara('mesa', 'esq', { falar: false });
}
function telaPacote() {
  const membros = membrosDoPacote(pacoteAberto);
  if (!membros.length) {
    return `<div class="sucesso"><h1>Pacote vazio</h1><p>Os tickets deste pacote já saíram da mesa.</p>
      <div class="sucesso-acoes"><button type="button" class="btn btn-primary" data-fechar-pacote>Voltar para a mesa</button></div></div>`;
  }
  const v = membros[0];
  const quem = !v.criado_por || v.criado_por === usuario?.nome ? 'você' : esc(Helpy.apelido(v.criado_por));
  return `
    <div class="etapa-cabeca pacote-cabeca">
      <span class="pacote-cabeca-ico">${ic('pacote')}</span>
      <div>
        <h1><span class="acento">${esc(TicketUI.codigoPacote(v.pacote))}</span> · ${membros.length} tickets</h1>
        <p>${esc(v.tipo_titulo)} · ${esc(TicketUI.faixaCodigos(membros))} · registrado por ${quem} em ${esc(TicketUI.dataHoraBr(v.data_entrada))}</p>
      </div>
    </div>
    ${visaoPacote === 'tabela'
      ? `<div class="mesa-tabela pacote-tabela">${tabelaMesa(membros)}</div>`
      : `<ul class="lista-tickets desktop-tickets pacote-grade">
      ${membros.map((m, i) => TicketUI.padrao(m, { i, giro: ((m.numero * 37) % 5 - 2) * .6, caixa: 'mesa', marcado: selecionados.has(m.numero), classe: `com-caixa ${m.numero === visto ? 'selecionado' : ''}` })).join('')}
    </ul>`}`;
}
let visaoPacote = 'tickets';
function alternarVisaoPacote(visao) {
  visaoPacote = visao;
  irPara('pacote', 'dir', { falar: false });
}
/** Imprime de novo a etiqueta do PACOTE (o design próprio, com o #ID do pacote). */
async function reimprimirPacote(botao) {
  const membros = membrosDoPacote(pacoteAberto);
  if (!membros.length) return;
  botao?.classList.add('imprimindo');
  if (botao) botao.disabled = true;
  try {
    const r = await Impressao.imprimirPacote(membros).catch((e) => ({ ok: false, erro: e.message }));
    if (r?.ok && r.via !== 'nenhum') Efeitos.toast(`Etiqueta do pacote <b>${esc(TicketUI.codigoPacote(pacoteAberto))}</b> enviada para a impressora`, { icone: ic('impressora'), tipo: 'sucesso' });
    else if (!r?.ok) Efeitos.toast(`Não imprimiu o pacote: ${esc(r?.erro || 'impressora indisponível')}`, { icone: ic('alerta'), tipo: 'alerta', duracao: 8000 });
  } finally {
    botao?.classList.remove('imprimindo');
    if (botao) botao.disabled = false;
  }
}

function marcarVisto() {
  document.querySelectorAll('.tkp-item[data-numero]').forEach((li) => {
    li.classList.toggle('selecionado', Number(li.dataset.numero) === visto);
  });
}

// ---------- Excluir (mesa) e tirar da bandeja: caixinha + X ----------
const elModalExcluir = document.getElementById('modalExcluir');
const elErroExcluir = document.getElementById('erroExcluir');
const elConfirmarExcluir = document.getElementById('confirmarExcluir');
const elBotaoHist = document.getElementById('excluirHist');

const MODOS_EXCLUSAO = {
  mesa: {
    pode: () => true,
    titulo: (n) => (n > 1 ? `Excluir ${n} volumes?` : 'Excluir este volume?'),
    botao: (n) => (n > 1 ? `Excluir ${n} volumes` : 'Excluir volume'),
    aviso: 'O volume sai do Controle NC e do Histórico de Tickets. A exclusão fica no Registro de Auditoria. Essa ação não pode ser desfeita.',
    chamar: (numero) => API.excluirVolume(numero),
    lista: '#listaSetor',
    feito: (codigos, plural) => `${plural ? 'Volumes' : 'Volume'} ${codigos} excluído${plural ? 's' : ''}`,
    fala: (lista, plural) => plural ? `<p>Pronto, estes volumes saíram do controle:</p>${listaHelpy(lista, { comDias: false })}` : `Pronto, o volume <strong>${esc(lista[0].codigo)}</strong> saiu do controle.`,
    vazio: () => 'Marque a <strong>caixinha</strong> no canto do volume que você quer apagar e depois clique no <strong>X</strong>.',
  },
  bandeja: {
    pode: (v) => Catalogo.saiu(v),
    titulo: (n) => (n > 1 ? `Tirar ${n} volumes da bandeja?` : 'Tirar da bandeja?'),
    botao: (n) => (n > 1 ? `Tirar ${n} volumes` : 'Tirar da bandeja'),
    aviso: 'Eles saem só desta bandeja do dia. Continuam guardados no Histórico de Tickets, com o carimbo de saída.',
    chamar: (numero) => API.tirarDaBandeja(numero),
    lista: '#listaSaidas',
    feito: (codigos, plural) => `${plural ? 'Volumes' : 'Volume'} ${codigos} fora da bandeja. Continua${plural ? 'm' : ''} no Histórico`,
    fala: (lista, plural) => plural ? `<p>Tirei estes volumes da bandeja:</p>${listaHelpy(lista, { comDias: false })}<p>Eles continuam em <a href="historico.html">Histórico de Tickets</a>.</p>` : `Tirei o volume <strong>${esc(lista[0].codigo)}</strong> da bandeja. Ele continua em <a href="historico.html">Histórico de Tickets</a>.`,
    vazio: () => 'Marque a <strong>caixinha</strong> dos volumes da bandeja e clique no <strong>X</strong> ao lado de “Saíram hoje”.',
  },
};

function atualizarBotaoBandeja() {
  if (!elBotaoHist) return;
  const n = marcadosHist.size;
  elBotaoHist.classList.toggle('com-marcados', n > 0);
  elBotaoHist.innerHTML = `${ic('x')}${n ? `<span class="excluir-qtd">${n}</span>` : ''}`;
  elBotaoHist.setAttribute('aria-label', n ? `Tirar ${n} volume${n > 1 ? 's' : ''} da bandeja` : 'Tirar os volumes marcados da bandeja');
}

function pedirExclusao(numeros, modo) {
  const regra = MODOS_EXCLUSAO[modo];
  const lista = numeros.map((n) => volumes.find((v) => v.numero === n)).filter((v) => v && regra.pode(v));
  if (!lista.length) {
    helpy.dizer(regra.vazio(), { humor: 'pensando' });
    return;
  }
  excluindo = { lista, modo };
  elModalExcluir.querySelector('h2').textContent = regra.titulo(lista.length);
  document.getElementById('excluirAviso').textContent = regra.aviso;
  elConfirmarExcluir.innerHTML = `${ic('x')} ${regra.botao(lista.length)}`;
  document.getElementById('excluirTicket').innerHTML =
    `<ul class="lista-tickets excluir-previa">${lista.map((v) => TicketUI.padrao(v, { clique: false })).join('')}</ul>`;
  elErroExcluir.hidden = true;
  elConfirmarExcluir.disabled = false;
  elModalExcluir.showModal();
}

elModalExcluir.addEventListener('close', () => { excluindo = null; });

elConfirmarExcluir.addEventListener('click', async () => {
  if (!excluindo) return;
  const { lista, modo } = excluindo;
  const regra = MODOS_EXCLUSAO[modo];
  elConfirmarExcluir.disabled = true;
  const feitos = [];
  for (const v of lista) {
    const resposta = await regra.chamar(v.numero);
    if (!resposta.ok) {
      elErroExcluir.textContent = `${v.codigo}: ${resposta.dados.erro || 'não foi possível concluir.'}`;
      elErroExcluir.hidden = false;
      break;
    }
    feitos.push(v);
    if (modo === 'mesa' && v.anexos?.length) Anexos.apagar(v.anexos.map((a) => a.id));
  }
  if (!feitos.length) { elConfirmarExcluir.disabled = false; return; }
  if (feitos.length === lista.length) elModalExcluir.close();

  // excluiu de verdade: o Helpy pega os tickets e joga na lixeira ao lado da mesinha
  if (modo === 'mesa') {
    const naTela = feitos.map((v) => document.querySelector(`${regra.lista} .tkp-item[data-numero="${v.numero}"]`)
      || document.querySelector(`.tkp-item[data-pacote="${v.pacote}"]`)).filter((el, i, l) => el && l.indexOf(el) === i);
    escritorio.jogarNoLixo(naTela, feitos.length > 1 ? `${feitos.length} tickets` : feitos[0].codigo);
  }
  feitos.forEach((v) => document.querySelector(`${regra.lista} .tkp-item[data-numero="${v.numero}"]`)?.classList.add('saindo'));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise((r) => setTimeout(r, 420));
  feitos.forEach((v) => { selecionados.delete(v.numero); marcadosHist.delete(v.numero); });
  await atualizar();
  if (etapaAtual === 'ver' && feitos.some((v) => v.numero === visto)) fecharVolume();
  if (etapaAtual === 'pacote') { if (membrosDoPacote(pacoteAberto).length) irPara('pacote', 'dir', { falar: false }); else fecharPacote(); }
  renderizarCabecalho();
  atualizarBotaoBandeja();
  const codigos = feitos.map((v) => esc(v.codigo)).join(', ');
  const plural = feitos.length > 1;
  Efeitos.toast(regra.feito(codigos, plural), { icone: ic('x') });
  helpy.dizer(regra.fala(feitos, plural), { humor: 'feliz' });
});

// ---------- Escritório do Helpy ----------
const escritorio = Escritorio.montar({ filtrar: () => oferecerFiltroTipo() });   // botão de filtro na mesinha do Helpy

function cancelarVolume() {
  // Registro em sequência: confirma antes de largar (as peças bipadas ainda não registradas se perdem)
  if (['seqcliente', 'sequencia', 'seqdestino', 'bipagem'].includes(etapaAtual)) { confirmarCancelarSequencia(); return; }
  const estavaInserindo = PASSOS.some((p) => p.id === etapaAtual);
  if (estado.anexos?.length) Anexos.apagar(estado.anexos.map((a) => a.id));   // fotos do rascunho descartado
  estado = novoEstado();
  irPara('mesa', 'esq', { falar: !estavaInserindo });
  if (estavaInserindo) helpy.dizer('Tudo bem, deixei o rascunho de lado. Se precisar, é só inserir de novo.');
}

function confirmarCancelarSequencia() {
  const pendentes = (typeof seqItens !== 'undefined' ? seqItens : []).filter((x) => x.estado === 'ok' || x.estado === 'falha').length;
  const d = document.createElement('dialog');
  d.className = 'modal modal-pergunta';
  d.innerHTML = `
    <div class="modal-conteudo">
      <span class="pergunta-ico">${ic('alerta')}</span>
      <h2>Cancelar o registro em sequência?</h2>
      <p>${pendentes > 1 ? `As <b>${pendentes}</b> peças bipadas e ainda não registradas vão sair da lista.` : pendentes ? 'A peça bipada e ainda não registrada vai sair da lista.' : 'Você volta para a Minha Mesa.'}</p>
      <div class="modal-acoes">
        <button type="button" class="btn" data-resposta="nao">Continuar bipando</button>
        <button type="button" class="btn key--red" data-resposta="sim">${ic('x')} Cancelar sequência</button>
      </div>
    </div>`;
  const fim = () => { d.close(); d.remove(); };
  d.addEventListener('cancel', (e) => { e.preventDefault(); fim(); });
  d.addEventListener('click', (e) => {
    const b = e.target.closest('[data-resposta]');
    if (!b) return;
    fim();
    if (b.dataset.resposta !== 'sim') { document.getElementById('seqDanfe')?.focus(); return; }
    if (typeof seqItens !== 'undefined') seqItens = [];
    estado = novoEstado();
    irPara('mesa', 'esq', { falar: false });
    helpy.dizer('Tudo bem, cancelei o registro em sequência 👍 Quando quiser, é só começar de novo.', { humor: 'feliz' });
  });
  document.body.appendChild(d);
  d.showModal();
  d.querySelector('[data-resposta="nao"]').focus();
}

// ---------- Troca de etapa com animação ----------
/* Telas extras (js/sequencia-emails.js): cada uma registra a tela, a barra, o título e os eventos */
const BARRAS_EXTRAS = {};
const TITULOS_EXTRAS = {};
const LIGAR_EXTRAS = {};

const RENDER = {
  mesa: telaMesa, locais: telaLocais, tipo: telaTipo, status: telaStatus, dados: telaDados,
  local: telaLocal, nota: telaNota, revisao: telaRevisao, ver: telaVer, pacote: telaPacote,
};
TITULOS_EXTRAS.pacote = () => `${ic('pacote')} Pacote de tickets`;
BARRAS_EXTRAS.pacote = ({ esq, dir, tecla }) => {
  esq.push(tecla('btn-voltar', 'data-fechar-pacote', '← Voltar para a mesa'));
  dir.push(
    `<span class="nc-visao" role="radiogroup" aria-label="Forma de ver o pacote">
      ${tecla(`btn-sm ${visaoPacote === 'tickets' ? 'ativo' : ''}`, `data-visao-pacote="tickets" role="radio" aria-checked="${visaoPacote === 'tickets'}"`, `${ic('ticket')} Tickets`)}
      ${tecla(`btn-sm ${visaoPacote === 'tabela' ? 'ativo' : ''}`, `data-visao-pacote="tabela" role="radio" aria-checked="${visaoPacote === 'tabela'}"`, `${ic('documento')} Tabela`)}
    </span>`,
    tecla('key--icon', 'data-imprimir-pacote title="Imprimir de novo a etiqueta do pacote" aria-label="Imprimir de novo a etiqueta do pacote"', ic('impressora')),
  );
  // X: com tickets marcados, exclui só eles; sem marcação, o pacote inteiro
  const marcados = membrosDoPacote(pacoteAberto).filter((v) => selecionados.has(v.numero)).length;
  dir.push(marcados
    ? tecla('key--red btn-excluir-marcados com-marcados', `data-excluir-no-pacote title="Excluir os tickets marcados" aria-label="Excluir ${marcados} ticket${marcados > 1 ? 's' : ''} marcado${marcados > 1 ? 's' : ''}"`, `${ic('x')}<span class="excluir-qtd">${marcados}</span>`)
    : tecla('key--red key--icon', 'data-excluir-pacote title="Excluir o pacote (todos os tickets de dentro)" aria-label="Excluir o pacote"', ic('x')));
};

function irPara(etapa, direcao = 'dir', { falar = true } = {}) {
  helpy.calar();
  if (etapa !== 'ver') visto = null;
  if (etapa !== 'ver' && etapa !== 'pacote') pacoteAberto = null;   // saiu do pacote
  marcarVisto();
  const anterior = elPalco.querySelector('.etapa-tela');
  const mostrar = () => {
    etapaAtual = etapa;
    elPalco.innerHTML = `<section class="etapa-tela etapa-${etapa} entra-${direcao}">${RENDER[etapa]()}</section>`;
    elPalco.scrollTop = 0;
    TicketUI.alinharPicotes(elPalco);
    renderizarCabecalho();
    ligarEventos(etapa);
    if (falar) falarSobre(etapa);
  };
  if (anterior && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    anterior.classList.add('sai');
    setTimeout(mostrar, 180);
  } else {
    mostrar();
  }
}

/** Etapas que aparecem: Status e Local somem quando só há uma opção (ela já vem preenchida). */
function passosVisiveis() {
  return PASSOS.filter((p) => {
    if (p.id === 'status') return !estado.tipo || Catalogo.statusDaEntrada(estado.tipo).length > 1;
    if (p.id === 'local') return !estado.tipo || !estado.status || Catalogo.locaisPermitidos(estado.tipo, estado.status).length > 1;
    return true;
  });
}
const idsPassos = () => passosVisiveis().map((p) => p.id);
const proximaDepois = (etapa) => { const ids = idsPassos(); return ids[ids.indexOf(etapa) + 1]; };
const anteriorA = (etapa) => { const ids = idsPassos(); return ids[ids.indexOf(etapa) - 1]; };

// ---------- Mesa: volumes no setor ----------
/* ---------- Minha Mesa: filtro por local (o botão Menu volta para a escolha) ----------
   Além dos lugares do setor, cada mês fechado que ainda tem volume no setor vira
   uma opção ("Mês de Outubro"): os tickets que passaram do mês anterior. */
const FILTROS_BASE = [
  { id: 'todos', titulo: 'Todos', descricao: 'Todos os volumes que estão no setor NC' },
  { id: 'pallet-fora', titulo: 'Pallet de fora', descricao: 'Aguardando entrega realizada' },
  { id: 'prateleira', titulo: 'Prateleira', descricao: 'Caixas menores' },
  { id: 'pallet-dentro', titulo: 'Pallet de dentro', descricao: 'Caixas maiores' },
];
const filtroDoMes = (ciclo) => ({
  id: `mes:${ciclo}`, ciclo, titulo: `Mês de ${Catalogo.nomeMes(ciclo)}`,
  descricao: `Ficaram de ${Catalogo.tituloCiclo(ciclo)}: mesmo #ID, ticket antigo`,
});
/** Os filtros de agora: os lugares + um por mês anterior que ainda tem volume no setor. */
function filtrosMesa() {
  const meses = [...new Set(noSetor().filter((v) => v.anterior).map((v) => v.ciclo))].sort();
  return [...FILTROS_BASE, ...meses.map(filtroDoMes)];
}
const CHAVE_FILTRO = 'mutility-mesa-local';
const CHAVE_VISAO = 'mutility-mesa-visao';
const filtroSalvo = lerPreferencia(CHAVE_FILTRO);
let filtroLocal = FILTROS_BASE.some((f) => f.id === filtroSalvo) || /^mes:\d{4}-\d{2}$/.test(filtroSalvo) ? filtroSalvo : 'todos';
let visaoMesa = lerPreferencia(CHAVE_VISAO, 'tickets') === 'tabela' ? 'tabela' : 'tickets';
const combinaFiltro = (v, id) => (id === 'todos' || (id.startsWith('mes:') ? v.anterior && v.ciclo === id.slice(4) : v.local === id));
// Filtro por tipo de NC (Sem integração, Duplicidade, Reimpressão…), junto com o filtro de local
const CHAVE_TIPO = 'mutility-mesa-tipo';
let filtroTipo = (() => { const t = lerPreferencia(CHAVE_TIPO, 'todos'); return t === 'todos' || Catalogo.tipos.some((x) => x.id === t) ? t : 'todos'; })();
const noLocal = () => noSetor().filter((v) => combinaFiltro(v, filtroLocal));
const naMesa = () => noLocal().filter((v) => filtroTipo === 'todos' || v.tipo === filtroTipo);
function escolherTipo(id) {
  filtroTipo = id;
  salvarPreferencia(CHAVE_TIPO, id);
  irPara('mesa', 'dir', { falar: false });
  if (id !== 'todos') helpy.dizer(`Pronto! Só <strong>${esc(Catalogo.tipo(id)?.titulo || '')}</strong> na mesa agora 🔍 Clica no filtro da minha mesinha de novo pra tirar.`, { humor: 'piscando', atraso: 250 });
}

/**
 * Botão de filtro na mesinha do Helpy BOT: ele oferece, no balão, o filtro pelo tipo de NC.
 */
function oferecerFiltroTipo() {
  const aqui = noLocal();
  const opcoes = Catalogo.tipos.map((t) => ({ t, n: aqui.filter((v) => v.tipo === t.id).length })).filter((x) => x.n);
  helpy.calar();
  if (!aqui.length) {
    helpy.dizer('Ainda não tem volume nesse lugar pra filtrar 📭', { humor: 'pensando', atraso: 150 });
    return;
  }
  helpy.dizer(`<p>Quer ver só um <strong>tipo de NC</strong>? 🔍</p><p>${filtroTipo === 'todos' ? 'Escolhe aí:' : `Agora tá filtrado em <strong>${esc(Catalogo.tipo(filtroTipo)?.titulo || '')}</strong>.`}</p>`, {
    humor: 'piscando', atraso: 150, layout: 'coluna',
    acoes: [
      ...(filtroTipo !== 'todos' ? [{ rotulo: `${ic('x')} Todos os tipos (${aqui.length})`, destaque: true, fn: () => escolherTipo('todos') }] : []),
      ...opcoes.filter((x) => x.t.id !== filtroTipo).map((x) => ({ rotulo: `${esc(x.t.titulo)} (${x.n})`, fn: () => escolherTipo(x.t.id) })),
    ],
  });
}
const filtroAtual = () => FILTROS_BASE.find((f) => f.id === filtroLocal) || (filtroLocal.startsWith('mes:') ? filtroDoMes(filtroLocal.slice(4)) : FILTROS_BASE[0]);

function escolherFiltro(id) {
  filtroLocal = id;
  salvarPreferencia(CHAVE_FILTRO, id);
  irPara('mesa', 'dir', { falar: false });
}
function alternarVisao(visao) {
  visaoMesa = visao;
  salvarPreferencia(CHAVE_VISAO, visao);
  irPara('mesa', 'dir', { falar: false });
}

/** Desenho do cartão "Mês de Outubro": folhinha de calendário amarelada e caixas empoeiradas. */
const desenhoMes = (ciclo) => `
  <span class="lc-antigo" aria-hidden="true">
    <i class="lc-folhinha"><b>${Catalogo.nomeMes(ciclo).slice(0, 3)}</b><em>${ciclo.slice(0, 4)}</em></i>
    <i class="lc-cx a1"></i><i class="lc-cx a2"></i><i class="lc-teia"></i>
  </span>`;

/** A tela "anterior" da Minha Mesa: Todos, Pallet de fora, Prateleira, Pallet de dentro (e os meses anteriores). */
function telaLocais() {
  const desenho = (f) => (f.id === 'todos'
    ? `<span class="lc-todos" aria-hidden="true">${DESENHO_LOCAL['pallet-fora']}${DESENHO_LOCAL.prateleira}${DESENHO_LOCAL['pallet-dentro']}</span>`
    : f.ciclo ? desenhoMes(f.ciclo) : DESENHO_LOCAL[f.id]);
  return `
    <div class="etapa-cabeca">
      <span class="saudacao"><span class="mao"><i class="ic ic-aceno" aria-hidden="true"></i></span> Olá, ${esc(primeiroNome())}!</span>
      <h1>O que você quer ver na <span class="acento">Minha Mesa</span>?</h1>
      <p>Escolha um lugar do setor. Para filtrar pelo tipo de NC, é só clicar no Helpy BOT 😉</p>
    </div>
    <div class="nc-locais nc-filtros">
      ${filtrosMesa().map((f, i) => {
        const n = noSetor().filter((v) => combinaFiltro(v, f.id) && (filtroTipo === 'todos' || v.tipo === filtroTipo)).length;
        return `
        <button type="button" class="nc-local ${f.ciclo ? 'nc-local-antigo' : ''} ${filtroLocal === f.id ? 'selecionada' : ''}" data-filtro="${f.id}" style="--i:${i}">
          <span class="nc-local-cena">${desenho(f)}</span>
          <strong>${f.titulo} <span class="contador">${n}</span></strong>
          <small>${f.descricao}</small>
        </button>`;
      }).join('')}
    </div>`;
}

function telaMesa() {
  return visaoMesa === 'tabela'
    ? '<div class="mesa-tabela" id="tabelaSetor"></div>'
    : '<ul class="lista-tickets desktop-tickets mesa-grade" id="listaSetor"></ul>';
}

// Grade da mesa: cada ticket fica preso a uma casa, e dá para trocar de lugar.
// Cada visão (Todos, Pallet de fora, Prateleira, Pallet de dentro) guarda as SUAS posições:
// mexer um ticket na Prateleira não muda onde ele está em Todos.
const CHAVE_POSICOES = `mutility-mesa-posicoes-v2-${usuario?.id}`;
let posicoesPorVisao = (() => {
  try {
    const v2 = JSON.parse(lerPreferencia(CHAVE_POSICOES, 'null'));
    if (v2 && typeof v2 === 'object') return v2;
    const antigas = JSON.parse(lerPreferencia(`mutility-mesa-posicoes-${usuario?.id}`, '{}')) || {};
    return { todos: antigas };   // posições de antes: ficam na visão Todos
  } catch { return {}; }
})();
const casasDaVisao = () => (posicoesPorVisao[filtroLocal] ||= {});
let mesaPendente = false;
const salvarPosicoes = () => salvarPreferencia(CHAVE_POSICOES, JSON.stringify(posicoesPorVisao));

const COLUNAS_MESA = 4;
const LINHAS_MESA = 3;
/** Largura do conteúdo (sem o padding: o palco tem um padding grande à direita para a barra de rolagem ficar fora da mesa). */
function larguraUtil(el) {
  const cs = getComputedStyle(el);
  return el.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
}

/** 4 colunas × 3 linhas cabem sem rolagem: os tickets encolhem (zoom) até caber. Só rola com mais de 12. */
function medirGrade(lista, quantidade) {
  const estilo = getComputedStyle(document.body);
  const w = parseFloat(estilo.getPropertyValue('--tkp-w')) || 300;
  const h = parseFloat(estilo.getPropertyValue('--tkp-h')) || 200;
  const gx = 24; const gy = 27;
  lista.style.zoom = '';
  const largura = lista.clientWidth - 24;
  const altura = elPalco.getBoundingClientRect().bottom - lista.getBoundingClientRect().top - 30;
  const zoom = Math.min(1, largura / (COLUNAS_MESA * w + (COLUNAS_MESA - 1) * gx), altura / (LINHAS_MESA * h + (LINHAS_MESA - 1) * gy));
  const linhas = Math.max(LINHAS_MESA, Math.ceil(quantidade / COLUNAS_MESA));
  return { colunas: COLUNAS_MESA, total: COLUNAS_MESA * linhas, linhas, zoom: Math.max(.3, zoom) };
}

/**
 * Depois de desenhar: se o palco ainda rola (padding, sombras, fonte que carregou depois…),
 * encolhe o zoom só o necessário. Com até 12 tickets a mesa nunca mostra barra de rolagem.
 */
function encaixarMesa(lista) {
  // 1) sobrou espaço embaixo? cresce (até o tamanho normal e sem passar da largura)
  const estilo = getComputedStyle(document.body);
  const w = parseFloat(estilo.getPropertyValue('--tkp-w')) || 300;
  const limiteLargura = (larguraUtil(elPalco) - 21) / (COLUNAS_MESA * w + (COLUNAS_MESA - 1) * 24);
  const fundo = elPalco.getBoundingClientRect().bottom - parseFloat(getComputedStyle(elPalco).paddingBottom || 0);
  const caixa = lista.getBoundingClientRect();
  const sobra = fundo - caixa.bottom;
  const atual = parseFloat(lista.style.zoom) || 1;
  if (sobra > 8 && caixa.height > 0) {
    lista.style.zoom = Math.min(1, limiteLargura, atual * (caixa.height + sobra - 4) / caixa.height).toFixed(3);
  }
  // 2) passou? encolhe só o necessário
  for (let i = 0; i < 4; i++) {
    const sobra = elPalco.scrollHeight - elPalco.clientHeight;
    if (sobra <= 0) return;
    const zoom = parseFloat(lista.style.zoom) || 1;
    const altura = lista.getBoundingClientRect().height;
    if (altura <= 0 || zoom <= .3) return;
    lista.style.zoom = Math.max(.3, zoom * (altura - sobra - 2) / altura).toFixed(3);
  }
}

function tabelaMesa(lista) {
  if (!lista.length) return '';
  return `
    <div class="tabela-rolagem">
      <table class="tabela-papel tabela-mesa">
        <thead><tr><th scope="col" class="col-caixa"><label class="email-caixa caixa-tabela" title="Marcar todos"><input type="checkbox" data-marcar-todos-mesa ${lista.length && lista.every((v) => selecionados.has(v.numero)) ? 'checked' : ''} aria-label="Marcar todos" /></label></th>${Planilha.COLUNAS.map((c) => `<th scope="col">${c.titulo}</th>`).join('')}</tr></thead>
        <tbody>${lista.map((v) => `
          <tr data-ver="${v.numero}" data-numero="${v.numero}" class="${selecionados.has(v.numero) ? 'marcado' : ''} ${Catalogo.prazo(v) === 'vencido' ? 'linha-vencida' : ''} ${v.anterior ? 'linha-antiga' : ''}" tabindex="0">
            <td class="col-caixa"><label class="email-caixa caixa-tabela" title="Marcar"><input type="checkbox" data-marcar="${v.numero}" ${selecionados.has(v.numero) ? 'checked' : ''} aria-label="Marcar ${esc(v.codigo)}" /></label></td>
            ${Planilha.COLUNAS.map((c) => {
              const valor = esc(c.valor(v));
              if (c.titulo === 'STATUS') return `<td class="quebra"><span class="tag ${classeStatus(v.status)}">${valor}</span></td>`;
              if (c.titulo === '#ID') return `<td><b class="cliente-ponto" style="--cor:${v.cliente_cor || '#A39A7C'}"></b> <b>${valor}</b> ${TicketUI.aviso(v)}${TicketUI.marcaMes(v)}</td>`;
              if (c.titulo === 'CNPJ') return `<td>${valor.replace('/', '/<wbr>') || '—'}</td>`;
              const classe = c.titulo.startsWith('DANFE') ? 'mono' : ['CLIENTE', 'TIPO DE NC'].includes(c.titulo) ? 'quebra' : '';
              return `<td class="${classe}">${valor || '—'}</td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function copiarMesa() {
  const visiveis = new Set([...document.querySelectorAll('#tabelaSetor tr[data-numero]:not(.apagado)')].map((tr) => Number(tr.dataset.numero)));
  const lista = naMesa().filter((v) => visiveis.has(v.numero)).sort((a, b) => a.numero - b.numero);
  if (!lista.length) { Efeitos.toast('Nada para copiar.', { icone: ic('alerta') }); return; }
  try {
    await Planilha.copiar(lista);
    API.registrarAcao('Copiou para a planilha', '', `${lista.length} volume(s) da Minha Mesa`);
    Efeitos.toast(`${lista.length} linha${lista.length > 1 ? 's' : ''} copiada${lista.length > 1 ? 's' : ''}. Na planilha, clique na coluna <b>B</b> da primeira linha vazia e cole (Ctrl+V).`, { icone: ic('copiar'), tipo: 'sucesso', duracao: 7000 });
  } catch {
    Efeitos.toast('O navegador não deixou copiar. Tente de novo.', { icone: ic('alerta'), tipo: 'alerta' });
  }
}

/** A tabela nunca rola para o lado: se as 11 colunas não cabem, ela encolhe inteira até caber. */
function encaixarTabela(caixa) {
  const rolagem = caixa.querySelector('.tabela-rolagem');
  const tabela = caixa.querySelector('table');
  if (!rolagem || !tabela) return;
  rolagem.style.zoom = '';
  const disponivel = larguraUtil(caixa) - 12;
  const precisa = tabela.getBoundingClientRect().width;
  if (precisa > disponivel) rolagem.style.zoom = Math.max(.55, disponivel / precisa).toFixed(3);
}

function mesaVazia() {
  const f = filtroAtual();
  if (filtroTipo !== 'todos' && noLocal().length) {
    return `
    <div class="mesa-vazia mesa-vazia-centro">
      <span class="mesa-vazia-ico">${ic('etiqueta')}</span>
      <strong>Nenhum ${esc(Catalogo.tipo(filtroTipo)?.titulo || '')} ${filtroLocal === 'todos' ? 'no setor' : `em ${esc(f.titulo)}`}</strong>
      <span>O filtro de tipo está ligado. Volte para "Todos os tipos" para ver o resto da mesa.</span>
      <button type="button" class="btn" data-tipo-todos>${ic('x')} Tirar o filtro de tipo</button>
    </div>`;
  }
  return `
    <div class="mesa-vazia mesa-vazia-centro">
      <span class="mesa-vazia-ico">${ic('pacote')}</span>
      <strong>${filtroLocal === 'todos' ? 'Nenhum volume no setor NC' : `Nada em ${esc(f.titulo)}`}</strong>
      <span>Chegou uma caixa com problema? Insira o volume e eu imprimo o ticket.</span>
      <button type="button" class="btn btn-primary btn-lg" data-abrir>${ic('mais')} Inserir volume</button>
    </div>`;
}

function preencherMesa() {
  const abertos = naMesa();
  for (const n of [...selecionados]) if (!abertos.some((v) => v.numero === n)) selecionados.delete(n);

  const tabela = document.getElementById('tabelaSetor');
  if (tabela) {
    tabela.innerHTML = abertos.length ? tabelaMesa(abertos) : mesaVazia();
    renderizarCabecalho();
    filtrarMesa();
    encaixarTabela(tabela);
    return;
  }

  const lista = document.getElementById('listaSetor');
  if (!lista) return;
  if (Arrastar.ativo) { mesaPendente = true; return; }
  lista.classList.toggle('vazia', !abertos.length);
  let grade = '';
  let cabe = false;
  if (abertos.length) {
    // Peças do mesmo Registro em sequência viram um só cartão: o pacote de tickets
    const pecas = pecasDaMesa(abertos);
    const { colunas, total, zoom, linhas } = medirGrade(lista, pecas.length);
    cabe = linhas === LINHAS_MESA;
    const usadas = new Set();
    const casa = {};
    const posicoes = casasDaVisao();
    pecas.forEach((pc) => {
      const p = posicoes[pc.chave];
      if (Number.isInteger(p) && p < total && !usadas.has(p)) { casa[pc.chave] = p; usadas.add(p); }
    });
    pecas.forEach((pc) => {
      if (casa[pc.chave] != null) return;
      let i = 0;
      while (usadas.has(i)) i++;
      casa[pc.chave] = i; usadas.add(i);
    });
    Object.assign(posicoes, casa);
    salvarPosicoes();
    const porCasa = Object.fromEntries(pecas.map((pc) => [casa[pc.chave], pc]));
    lista.style.gridTemplateColumns = `repeat(${colunas}, var(--tkp-w))`;
    lista.style.zoom = zoom.toFixed(3);
    grade = Array.from({ length: total }, (_, i) => {
      const pc = porCasa[i];
      if (!pc) return `<li class="casa-vazia" data-casa="${i}" aria-hidden="true"></li>`;
      if (pc.membros) {
        const giro = ((pc.membros[0].numero * 37) % 5 - 2) * .6;
        const chegando = pc.membros.some((v) => v.numero === destaque);
        return TicketUI.pacote(pc.membros, { i, giro, caixa: true, marcado: pc.membros.every((m) => selecionados.has(m.numero)), classe: `com-caixa ${chegando ? 'chegando' : ''}` }).replace('<li class="', `<li data-casa="${i}" class="`);
      }
      const v = pc.volume;
      const giro = ((v.numero * 37) % 5 - 2) * .6;   // "jogado" na mesa
      return TicketUI.padrao(v, {
        i, giro, caixa: 'mesa', marcado: selecionados.has(v.numero),
        classe: `com-caixa ${v.numero === destaque ? 'chegando' : ''} ${v.numero === visto ? 'selecionado' : ''}`,
      }).replace('<li class="', `<li data-casa="${i}" class="`);
    }).join('');
  } else {
    lista.style.gridTemplateColumns = '';
    lista.style.zoom = '';
  }
  lista.innerHTML = abertos.length ? grade : `<li class="mesa-vazia-li">${mesaVazia()}</li>`;
  destaque = null;
  renderizarCabecalho();
  filtrarMesa();
  if (cabe) encaixarMesa(lista);
}

Arrastar.ligar(elPalco, {
  item: '#listaSetor .tkp-item',
  ignorar: 'input, label, a, .tkp-caixa, button:not(.tkp-abrir)',
  aoMover({ alvo }) {
    const casa = alvo?.closest('#listaSetor [data-casa]');
    document.querySelectorAll('#listaSetor .casa-alvo').forEach((el) => { if (el !== casa) el.classList.remove('casa-alvo'); });
    casa?.classList.add('casa-alvo');
  },
  aoSoltar({ el, alvo }) {
    const casa = alvo?.closest('#listaSetor [data-casa]');
    if (!casa) return null;
    const numero = el.dataset.numero;   // "12" (ticket) ou "p:…" (pacote)
    const posicoes = casasDaVisao();   // só a visão que está aberta
    const de = posicoes[numero];
    const para = Number(casa.dataset.casa);
    if (de === para) return casa;
    const naGrade = new Set(pecasDaMesa(naMesa()).map((pc) => pc.chave));
    const vizinho = Object.keys(posicoes).find((n) => n !== numero && posicoes[n] === para && naGrade.has(n));
    posicoes[numero] = para;
    if (vizinho) posicoes[vizinho] = de;
    salvarPosicoes();
    Arrastar.ativo = false;
    preencherMesa();
    const novo = document.querySelector(`#listaSetor .tkp-item[data-numero="${numero}"]`);
    novo?.classList.add('arrasto-origem');
    if (vizinho) document.querySelector(`#listaSetor .tkp-item[data-numero="${vizinho}"]`)?.classList.add('trocou');
    return novo;
  },
  aoTerminar() {
    document.querySelectorAll('#listaSetor .arrasto-origem, #listaSetor .casa-alvo').forEach((el) => el.classList.remove('arrasto-origem', 'casa-alvo'));
    if (mesaPendente) { mesaPendente = false; preencherMesa(); }
  },
});

let timerGrade = null;
const refazerGrade = () => {
  clearTimeout(timerGrade);
  timerGrade = setTimeout(() => { if (etapaAtual === 'mesa') preencherMesa(); }, 150);
};
addEventListener('resize', refazerGrade);
if ('ResizeObserver' in window) {
  let larguraMesa = 0; let alturaMesa = 0;
  new ResizeObserver(([e]) => {
    const w = Math.round(e.contentRect.width); const h = Math.round(e.contentRect.height);
    if (Math.abs(w - larguraMesa) > 4 || Math.abs(h - alturaMesa) > 4) { larguraMesa = w; alturaMesa = h; refazerGrade(); }
  }).observe(elPalco);
}
// as fontes chegam depois do primeiro desenho e mudam a altura dos tickets
document.fonts?.ready.then(refazerGrade);

// ---------- Busca na mesa ----------
const elBuscaMesa = document.createElement('label');
elBuscaMesa.className = 'busca-campo busca-mesa';
elBuscaMesa.innerHTML = `${ic('olho')}<input class="input" id="buscaMesa" type="search" autocomplete="off"
  placeholder="Buscar por #ID, NF, AWB, cliente, tipo…" aria-label="Buscar volume na mesa" />
  <span class="busca-resultado" id="buscaResultado" hidden></span>`;
const elInputBusca = elBuscaMesa.querySelector('input');
elInputBusca.addEventListener('input', filtrarMesa);
elInputBusca.addEventListener('keydown', (e) => { if (e.key === 'Escape') { elInputBusca.value = ''; filtrarMesa(); } });

function filtrarMesa() {
  const termo = elInputBusca.value;
  const itens = [...document.querySelectorAll('#listaSetor .tkp-item, #tabelaSetor tr[data-numero]')];
  let achados = 0;
  itens.forEach((li) => {
    // pacote: aparece se qualquer ticket de dentro combinar com a busca
    const membros = li.dataset.membros ? li.dataset.membros.split(',').map(Number) : [Number(li.dataset.numero)];
    const combina = !termo.trim() || membros.some((n) => { const v = volumes.find((x) => x.numero === n); return v && Busca.volume(v, termo); });
    li.classList.toggle('apagado', !combina);
    li.classList.toggle('achado', !!termo.trim() && combina);
    if (combina) achados += 1;
  });
  const resultado = elBuscaMesa.querySelector('.busca-resultado');
  resultado.hidden = !termo.trim();
  resultado.textContent = achados ? `${achados} encontrado${achados > 1 ? 's' : ''}` : 'nada encontrado';
  resultado.classList.toggle('nada', !achados);
}

// ---------- Bandeja: saíram hoje ----------
function preencherSaidas() {
  if (!elListaSaidas) return;   // a bandeja "Saíram hoje" saiu da tela: quem fica pronto vai direto para o Histórico
  const lista = saidasHoje().filter((v) => !v.oculto_bandeja);
  for (const n of [...marcadosHist]) if (!lista.some((v) => v.numero === n)) marcadosHist.delete(n);
  atualizarBotaoBandeja();
  elBotaoHist.hidden = !lista.length;
  elContadorSaidas.textContent = lista.length;
  document.getElementById('contadorAlca').textContent = lista.length;
  elListaSaidas.innerHTML = lista.length
    ? lista.map((v, i) => TicketUI.padrao(v, { i, caixa: 'hist', marcado: marcadosHist.has(v.numero), classe: 'com-caixa', enxuto: true })).join('')
    : '<li class="vazio">Os volumes que saírem hoje (Tratado ou Devolução) ficam aqui com o carimbo.</li>';
}

function atualizarPlacar() { placar.atualizar(); }

// ---------- Rever um volume (e editar só depois do lápis) ----------
function alternarEdicao(abrir = !modoEdicao) {
  modoEdicao = abrir;
  irPara('ver', 'dir', { falar: false });
  if (abrir) setTimeout(() => elPalco.querySelector('.nc-editar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 260);
}

/** Miniaturas das imagens anexadas (preenchidas depois por Anexos.preencher). */
function anexosHtml(lista = [], { remover = false } = {}) {
  if (!lista.length) return '';
  return `<ul class="nc-anexos">${lista.map((a) => `
    <li class="anexo"><button type="button" class="anexo-ver" data-ampliar="${esc(a.id)}" title="Ampliar ${esc(a.nome)}">
      <img alt="${esc(a.nome)}" ${a.url ? `src="${a.url}"` : `data-anexo="${esc(a.id)}"`} /></button>
      ${remover ? `<button type="button" class="anexo-tirar" data-tirar-anexo="${esc(a.id)}" aria-label="Tirar ${esc(a.nome)}">${ic('x')}</button>` : ''}
    </li>`).join('')}</ul>`;
}

function telaVer() {
  const v = volumeVisto();
  if (!v) {
    return `<div class="sucesso"><h1>Volume não encontrado</h1><p>Ele pode ter sido excluído.</p>
      <div class="sucesso-acoes"><button type="button" class="btn btn-primary" data-fechar-ver>Voltar para a mesa</button></div></div>`;
  }
  const saiu = Catalogo.saiu(v);
  // as imagens da nota abrem pela tecla "Ver nota", junto com a mensagem
  const extras = `
    ${v.historico?.length ? `<details class="nc-tempo-caixa"><summary>${ic('relogio')} Linha do tempo (${v.historico.length})</summary>${TicketUI.linhaDoTempo(v)}</details>` : ''}`;
  if (!modoEdicao) {
    return `<div class="nc-ver">${TicketUI.grandeDe(v)}${extras}</div>`;
  }
  const statusAtual = v.status;
  const locais = Catalogo.locaisPermitidos(v.tipo, statusAtual);
  const caixa = v.chave || v.pedido || '';
  return `
    <div class="nc-ver">
      ${TicketUI.grandeDe(v)}
      <section class="bloco nc-editar" aria-labelledby="tituloEditar">
        <div class="bloco-titulo"><h2 id="tituloEditar">${ic('caneta')} Editar ticket</h2><span>${esc(TicketUI.tempoNoSetor(v))}</span>
          <button type="button" class="btn btn-sm btn-ghost nc-editar-fechar" data-editar aria-label="Fechar a edição">${ic('x')}</button></div>
        <h3 class="nc-editar-sub">Status</h3>
        <div class="opcoes nc-status-cartoes" id="editStatus" role="radiogroup" aria-label="Status">${cartoesStatus(v.tipo, statusAtual)}</div>
        <h3 class="nc-editar-sub">Dados do volume</h3>
        <div class="nc-editar-grade">
          <label class="campo">#ID
            <input class="input tk-mono" id="editId" inputmode="numeric" maxlength="5" value="${esc(Catalogo.codigo(v.id_ciclo ?? v.numero))}" autocomplete="off" /></label>
          <label class="campo">Tipo de NC
            <select class="input" id="editTipo">${Catalogo.tipos.map((t) => `<option value="${t.id}" ${t.id === v.tipo ? 'selected' : ''}>${esc(t.titulo)}</option>`).join('')}</select></label>
          <label class="campo">Local
            <select class="input" id="editLocal">${locais.map((l) => `<option value="${l.id}" ${l.id === v.local ? 'selected' : ''}>${l.titulo}</option>`).join('')}</select></label>
          <label class="campo nc-awb-campo"><span>AWB <span class="campo-ajuda" id="ajudaAwb">${Catalogo.exigeAwb(statusAtual, v.tipo) ? 'obrigatória' : 'opcional'}</span></span>
            <input class="input tk-mono" id="editAwb" maxlength="60" value="${esc(v.awb)}" placeholder="TXAQ123456789tx" autocomplete="off" /></label>
          <label class="campo dois">DANFE / Pedido
            <input class="input tk-mono" id="editCaixa" maxlength="60" value="${esc(caixa)}" placeholder="Chave de 44 dígitos ou nº do pedido" autocomplete="off" /></label>
          <label class="campo">Nota fiscal
            <input class="input tk-mono" id="editNf" inputmode="numeric" maxlength="12" value="${esc(v.nf)}" autocomplete="off" /></label>
          <label class="campo">Série
            <input class="input tk-mono" id="editSerie" inputmode="numeric" maxlength="5" value="${esc(v.serie)}" autocomplete="off" /></label>
          <label class="campo">CNPJ
            <input class="input tk-mono" id="editCnpj" inputmode="numeric" maxlength="18" value="${esc(v.cnpj ? Catalogo.formatarCnpj(v.cnpj) : '')}" placeholder="00.000.000/0000-00" autocomplete="off" /></label>
          ${campoClienteHtml('editCliente', v.cliente_nome).replace('campo nc-cliente', 'campo nc-cliente dois')}
          <div class="campo inteiro nc-editar-nota">
            <label for="editNota">Nota</label>
            <textarea class="input" id="editNota" rows="2" maxlength="1000" placeholder="Opcional">${esc(v.nota)}</textarea>
            <!-- imagens da nota: no canto inferior esquerdo, no mesmo container da nota -->
            <div class="nc-anexar nc-editar-anexar">
              <label class="btn btn-sm nc-anexar-botao" id="editAnexarBotao">
                ${ic('mais')} Anexar imagem
                <input type="file" id="editArquivoAnexo" accept="image/*" multiple hidden />
              </label>
              <span class="nc-anexar-dica" id="editAnexarDica"></span>
              <p class="aviso aviso-erro" id="editErroAnexo" hidden></p>
              <div id="editListaAnexos"></div>
            </div>
          </div>
        </div>
        <p class="aviso aviso-erro" id="erroEditar" hidden></p>
        ${saiu ? `<p class="nc-saiu-nota">${ic('check-circulo')} Saiu do NC em ${TicketUI.dataHoraBr(v.data_saida)}. Um status que não é de saída devolve o volume para a mesa.</p>` : ''}
        <div class="nc-editar-rodape">
          <button type="button" class="btn" data-editar>${ic('x')} Cancelar</button>
          <button type="button" class="btn btn-primary" id="salvarVolume">${ic('check')} Salvar alterações</button>
        </div>
      </section>
      ${extras}
    </div>`;
}

/** Cartões de status válidos para o tipo (a lista muda quando o tipo muda na edição). */
function cartoesStatus(tipo, atual) {
  return Catalogo.statusDaEdicao(tipo).map((s) => `
    <button type="button" class="opcao nc-st st-${s.id} ${s.id === atual ? 'selecionada' : ''}" role="radio" aria-checked="${s.id === atual}" data-novo-status="${s.id}">
      <span class="opcao-emoji">${ic(s.ic)}</span><span><strong>${s.titulo}</strong></span>
    </button>`).join('');
}

function ligarVer() {
  Anexos.preencher(elPalco);
  if (modoEdicao) ligarEditar();
}

function ligarEditar() {
  const v = volumeVisto();
  if (!v) return;
  let statusEscolhido = v.status;
  const elAwb = document.getElementById('editAwb');
  const elLocal = document.getElementById('editLocal');
  const elTipo = document.getElementById('editTipo');
  const elStatus = document.getElementById('editStatus');
  const elCnpj = document.getElementById('editCnpj');
  const tipoEscolhido = () => elTipo.value;
  const clienteEdit = { nome: v.cliente_nome || '', id: v.cliente_id ?? null };
  ligarCampoCliente(document.getElementById('editCliente'), (nome, cli) => { clienteEdit.nome = nome; clienteEdit.id = cli?.id ?? null; });

  /** Status, AWB e locais acompanham o tipo e o status escolhidos. */
  function atualizarDependentes({ avisar = false } = {}) {
    const pede = Catalogo.exigeAwb(statusEscolhido, tipoEscolhido());
    document.getElementById('ajudaAwb').textContent = pede ? 'obrigatória' : 'opcional';
    elAwb.closest('.nc-awb-campo').classList.toggle('obrigatorio', pede);
    const locais = Catalogo.locaisPermitidos(tipoEscolhido(), statusEscolhido);
    const atual = elLocal.value;
    elLocal.innerHTML = locais.map((l) => `<option value="${l.id}" ${l.id === atual ? 'selected' : ''}>${l.titulo}</option>`).join('');
    if (avisar && pede && !elAwb.value.trim()) {
      elAwb.focus();
      helpy.dizer(`Para <strong>${Catalogo.statusDe(statusEscolhido).titulo}</strong> eu preciso da <strong>AWB</strong>: sem ela o volume não sai do NC.`, { humor: 'pensando' });
    }
  }

  elStatus.addEventListener('click', (e) => {
    const b = e.target.closest('[data-novo-status]');
    if (!b) return;
    statusEscolhido = b.dataset.novoStatus;
    elStatus.querySelectorAll('[data-novo-status]').forEach((o) => {
      o.classList.toggle('selecionada', o === b);
      o.setAttribute('aria-checked', String(o === b));
    });
    atualizarDependentes({ avisar: true });
  });

  elTipo.addEventListener('change', () => {
    const validos = Catalogo.statusDaEdicao(tipoEscolhido()).map((s) => s.id);
    if (!validos.includes(statusEscolhido)) statusEscolhido = validos[0];
    elStatus.innerHTML = cartoesStatus(tipoEscolhido(), statusEscolhido);
    atualizarDependentes();
  });

  elCnpj.addEventListener('input', () => {
    const d = Catalogo.somenteDigitos(elCnpj.value).slice(0, 14);
    if (d.length === 14) elCnpj.value = Catalogo.formatarCnpj(d);
  });

  // ---------- Imagens da nota (anexar / tirar), salvas junto com "Salvar alterações" ----------
  let anexosEdit = (v.anexos || []).map((a) => ({ ...a }));
  const novosAnexos = new Set();       // enviados nesta edição (se cancelar, são apagados)
  const tirados = new Set();           // já salvos que você tirou (apagados só depois de salvar)
  const elListaAnexos = document.getElementById('editListaAnexos');
  const elErroAnexo = document.getElementById('editErroAnexo');
  const elArquivo = document.getElementById('editArquivoAnexo');
  const pintarAnexos = () => {
    const cheio = anexosEdit.length >= Anexos.MAX_POR_VOLUME;
    document.getElementById('editAnexarBotao').classList.toggle('desligado', cheio);
    elArquivo.disabled = cheio;
    document.getElementById('editAnexarDica').textContent = `${anexosEdit.length}/${Anexos.MAX_POR_VOLUME} imagens · também dá para colar (Ctrl+V)`;
    elListaAnexos.innerHTML = anexosHtml(anexosEdit, { remover: true });
    Anexos.preencher(elListaAnexos);
  };
  async function anexarNaEdicao(arquivos) {
    elErroAnexo.hidden = true;
    const imagens = [...arquivos].filter((a) => /^image\//.test(a.type));
    for (const arquivo of imagens) {
      if (anexosEdit.length >= Anexos.MAX_POR_VOLUME) {
        elErroAnexo.textContent = `No máximo ${Anexos.MAX_POR_VOLUME} imagens por volume.`;
        elErroAnexo.hidden = false;
        break;
      }
      try {
        const ref = await Anexos.salvar(arquivo);
        novosAnexos.add(ref.id);
        anexosEdit.push({ ...ref, url: await Anexos.url(ref.id) });
      } catch (falha) {
        elErroAnexo.textContent = falha.message || 'Não foi possível anexar a imagem.';
        elErroAnexo.hidden = false;
      }
    }
    pintarAnexos();
  }
  elArquivo.addEventListener('change', (e) => { anexarNaEdicao(e.target.files); e.target.value = ''; });
  elPalco.querySelector('.nc-editar-nota').addEventListener('paste', (e) => {
    const imagens = [...(e.clipboardData?.files || [])];
    if (imagens.length) { e.preventDefault(); anexarNaEdicao(imagens); }
  });
  elListaAnexos.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tirar-anexo]');
    if (!b) return;
    e.stopPropagation();
    const id = b.dataset.tirarAnexo;
    anexosEdit = anexosEdit.filter((a) => a.id !== id);
    if (novosAnexos.has(id)) { novosAnexos.delete(id); Anexos.apagar([id]); } else tirados.add(id);
    pintarAnexos();
  });
  // Cancelou a edição: as imagens que você acabou de mandar saem; as que já estavam ficam
  elPalco.querySelectorAll('.nc-editar [data-editar]').forEach((b) => b.addEventListener('click', () => {
    if (novosAnexos.size) Anexos.apagar([...novosAnexos]);
  }));
  pintarAnexos();

  document.getElementById('salvarVolume').addEventListener('click', async (e) => {
    const botao = e.currentTarget;
    const erro = document.getElementById('erroEditar');
    if (Catalogo.exigeAwb(statusEscolhido, tipoEscolhido()) && !elAwb.value.trim()) {
      erro.textContent = `Para ${Catalogo.statusDe(statusEscolhido).titulo}, informe a AWB.`;
      erro.hidden = false;
      elAwb.focus();
      return;
    }
    botao.disabled = true;
    const antes = v.status;
    const caixaNova = document.getElementById('editCaixa').value.trim();
    const campos = {
      id_ciclo: document.getElementById('editId').value.trim(),
      tipo: tipoEscolhido(),
      status: statusEscolhido,
      awb: elAwb.value,
      local: elLocal.value,
      nf: document.getElementById('editNf').value,
      serie: document.getElementById('editSerie').value,
      cnpj: elCnpj.value,
      cliente_id: clienteEdit.id,
      cliente_nome: clienteEdit.nome,
      nota: document.getElementById('editNota').value,
      anexos: anexosEdit.map(({ url, ...ref }) => ref),
    };
    // DANFE/pedido só vai se mudou (uma DANFE nova também atualiza NF, série e CNPJ)
    if (caixaNova !== (v.chave || v.pedido || '')) campos.codigo_caixa = caixaNova;
    const { ok, dados } = await API.atualizarVolume(v.numero, campos);
    botao.disabled = false;
    if (!ok) {
      erro.textContent = dados.erro;
      erro.hidden = false;
      helpy.dizer(esc(dados.erro), { tipo: 'alerta', humor: 'alerta' });
      return;
    }
    erro.hidden = true;
    // salvou: as imagens que você tirou somem de vez (as novas já ficaram no ticket)
    if (tirados.size) Anexos.apagar([...tirados]);
    novosAnexos.clear();
    modoEdicao = false;
    await atualizar(true);
    const trocouStatus = dados.status !== antes;
    const saiuAgora = Catalogo.saiu(dados) && !Catalogo.statusDe(antes).saida;
    if (saiuAgora) {
      // Mostra o ticket sendo CARIMBADO (Tratado verde, Devolução roxo, GRIS vermelho) e volta para a mesa
      irPara('ver', 'dir', { falar: false });
      Efeitos.toast(`${esc(dados.codigo)} carimbado como <b>${esc(dados.status_titulo)}</b>`, { icone: ic('carimbo'), tipo: 'sucesso' });
      setTimeout(() => Efeitos.confete(elPalco.querySelector('.carimbo-resolvido'), 40), 450);
      helpy.dizer(`<p>Carimbado! <strong>${esc(dados.codigo)}</strong> saiu como <strong>${esc(dados.status_titulo)}</strong>${dados.awb ? ` com a AWB <strong>${esc(dados.awb)}</strong>` : ''}.</p>
        <p>Ele saiu da mesa e está no <a href="historico.html">Histórico de Tickets</a>.</p>`, { humor: 'comemorando', tipo: 'sucesso' });
      // depois do carimbo, pergunta se imprime a etiqueta com o status novo; só então volta para a mesa
      await new Promise((ok) => setTimeout(ok, 1100));
      await oferecerEtiqueta(dados);
      setTimeout(() => { if (etapaAtual === 'ver' && visto === dados.numero) irPara('mesa', 'esq', { falar: false }); }, 900);
    } else {
      Efeitos.toast(`${esc(dados.codigo)} atualizado`, { icone: ic('check') });
      irPara('ver', 'dir', { falar: false });
      if (trocouStatus) {
        await new Promise((ok) => setTimeout(ok, 500));
        await oferecerEtiqueta(dados);
      }
    }
  });
}

/** Depois de trocar o status na edição: "Deseja imprimir a etiqueta?" com o status novo. */
async function oferecerEtiqueta(volume) {
  const sim = await perguntarImpressao(volume, { naoRotulo: 'Não, só salvar' });
  if (!sim) {
    API.registrarAcao(`Trocou o status para ${volume.status_titulo} sem imprimir a etiqueta`, volume.codigo);
    return;
  }
  const r = await Impressao.imprimir(volume).catch((erro) => ({ ok: false, erro: erro.message }));
  avisarImpressao(r, volume);
}

// ---------- Inserir volume: telas ----------
function migalha() {
  const partes = [];
  if (estado.tipo) partes.push(`<span class="mini-ico">${Catalogo.icone(estado.tipo)}</span>${esc(Catalogo.tipo(estado.tipo).titulo)}`);
  if (estado.status) partes.push(`<span class="tag ${Catalogo.statusDe(estado.status).tag}">${esc(Catalogo.statusDe(estado.status).titulo)}</span>`);
  return `<div class="migalha">${partes.join(' <span class="migalha-sep">›</span> ')}</div>`;
}

function telaTipo() {
  return `
    <div class="etapa-cabeca">
      <span class="saudacao"><span class="mao"><i class="ic ic-aceno" aria-hidden="true"></i></span> Olá, ${esc(primeiroNome())}!</span>
      <h1>Qual é a <span class="acento">não conformidade</span>?</h1>
      <p>Escolha o tipo de NC do volume. Depois eu pergunto o status e os dados da caixa.</p>
    </div>
    <div class="generos">
      ${Catalogo.tipos.map((t, i) => `
        <button type="button" class="cartao ${t.critico ? 'cartao-urgente' : ''} ${estado.tipo === t.id ? 'selecionado' : ''}" data-tipo="${t.id}" style="--i:${i}">
          <span class="cartao-ico">${Catalogo.icone(t.id)}</span>
          <strong>${t.titulo}</strong>
          <span class="cartao-desc">${t.descricao}</span>
        </button>`).join('')}
      <button type="button" class="cartao cartao-sequencia" data-sequencia="1" style="--i:${Catalogo.tipos.length}">
        <span class="cartao-ico">${ic('codigo-barras')}</span>
        <strong>Registro em sequência</strong>
        <span class="cartao-desc">Várias peças de uma vez, bipando uma atrás da outra</span>
      </button>
    </div>`;
}

function telaStatus() {
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>Qual o status atual da <span class="acento">encomenda</span>?</h1>
      <p>${esc(Catalogo.tipo(estado.tipo)?.titulo || '')} entra como ${Catalogo.statusDaEntrada(estado.tipo).map((s) => s.titulo).join(', ').replace(/, ([^,]*)$/, ' ou $1')}. Tratado e Devolução pedem a AWB.</p>
    </div>
    <div class="opcoes">
      ${Catalogo.statusDaEntrada(estado.tipo).map((s, i) => `
        <button type="button" class="opcao nc-st st-${s.id} ${estado.status === s.id ? 'selecionada' : ''}" data-status="${s.id}" style="--i:${i}">
          <span class="opcao-emoji">${ic(s.ic)}</span>
          <span><strong>${s.titulo}</strong><small>${s.descricao}</small></span>
        </button>`).join('')}
    </div>`;
}

/** Botão de avançar no canto inferior direito do card. */
function botaoDoCard(etapa, extra = '') {
  const rotulo = proximaDepois(etapa) === 'revisao' ? 'Revisar ticket' : 'Continuar';
  return `<div class="bloco-rodape">${extra}
    <button type="button" class="btn btn-primary btn-lg" data-avancar>${rotulo} <span class="seta-avancar" aria-hidden="true">→</span></button>
  </div>`;
}

/** AWB: obrigatória em Tratado/Devolução; Sem integração e GRIS não têm; nos demais é opcional. */
const pedeAwb = () => !Catalogo.tipo(estado.tipo)?.semAwb && (Catalogo.exigeAwb(estado.status, estado.tipo) || (!Catalogo.statusDe(estado.status)?.saida && estado.tipo !== 'sem-integracao'));

/* ---------- Campo Cliente: texto livre com sugestões dos clientes cadastrados ---------- */
function campoClienteHtml(id, valor) {
  return `
    <div class="campo nc-cliente">
      <label for="${id}">Cliente</label>
      <input class="input" id="${id}" value="${esc(valor || '')}" maxlength="60" autocomplete="off" spellcheck="false"
        placeholder="Escreva o nome do cliente" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}Lista" />
      <span class="nc-cliente-cor" aria-hidden="true"></span>
      <ul class="nc-sugestoes" id="${id}Lista" role="listbox" hidden></ul>
    </div>`;
}

/** Liga o campo: filtra os cadastrados enquanto digita; clicar numa sugestão preenche. aoMudar(nome, cliente|null). */
function ligarCampoCliente(input, aoMudar) {
  const lista = document.getElementById(`${input.id}Lista`);
  const cor = input.parentElement.querySelector('.nc-cliente-cor');
  let marcado = -1;
  const achar = (nome) => clientes.find((c) => Busca.normalizar(c.nome) === Busca.normalizar(nome)) || null;
  const pintar = () => {
    const cli = achar(input.value);
    cor.style.background = cli?.cor || 'transparent';
    cor.classList.toggle('ativa', !!cli);
    aoMudar(input.value.trim(), cli);
  };
  const fechar = () => { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); marcado = -1; };
  const mostrar = () => {
    const termo = Busca.normalizar(input.value);
    const achados = clientes.filter((c) => !termo || Busca.normalizar(`${c.nome} ${c.cnpj}`).includes(termo)).slice(0, 8);
    if (!achados.length) { fechar(); return; }
    lista.innerHTML = achados.map((c, i) => `
      <li role="option" id="${input.id}Op${i}" data-cliente-id="${c.id}" class="${i === marcado ? 'marcado' : ''}">
        <span class="cliente-ponto" style="--cor:${esc(c.cor)}"></span><b>${esc(c.nome)}</b>${c.cnpj ? `<small>${esc(Catalogo.formatarCnpj(c.cnpj))}</small>` : ''}
      </li>`).join('');
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    // sem espaço embaixo (fim da mesa)? abre para cima, sem criar rolagem
    lista.classList.remove('pra-cima');
    const limite = (input.closest('.palco') || document.body).getBoundingClientRect().bottom;
    if (lista.getBoundingClientRect().bottom > limite - 4 && input.getBoundingClientRect().top - lista.offsetHeight > 80) lista.classList.add('pra-cima');
  };
  const escolher = (id) => {
    const cli = clientes.find((c) => c.id === Number(id));
    if (!cli) return;
    input.value = cli.nome;
    fechar();
    pintar();
  };
  input.addEventListener('input', () => { marcado = -1; mostrar(); pintar(); });
  input.addEventListener('focus', mostrar);
  input.addEventListener('blur', () => setTimeout(fechar, 120));
  input.addEventListener('keydown', (e) => {
    const itens = [...lista.querySelectorAll('li')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (lista.hidden) mostrar();
      if (!itens.length) return;
      e.preventDefault();
      marcado = (marcado + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
      itens.forEach((li, i) => li.classList.toggle('marcado', i === marcado));
      input.setAttribute('aria-activedescendant', itens[marcado].id);
    } else if (e.key === 'Enter' && !lista.hidden && marcado >= 0) {
      e.preventDefault();
      e.stopPropagation();
      escolher(itens[marcado].dataset.clienteId);
    } else if (e.key === 'Escape') fechar();
  });
  lista.addEventListener('mousedown', (e) => {          // mousedown: antes do blur fechar a lista
    const li = e.target.closest('[data-cliente-id]');
    if (li) { e.preventDefault(); escolher(li.dataset.clienteId); }
  });
  pintar();
  return { definir(nome) { input.value = nome; pintar(); } };
}

function telaDados() {
  if (Catalogo.tipo(estado.tipo)?.semDanfe) return telaDadosSemId();
  const saida = Catalogo.exigeAwb(estado.status, estado.tipo);
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>Bipe a <span class="acento">DANFE</span> da caixa</h1>
      <p>A chave de 44 dígitos já traz a nota fiscal, a série e o CNPJ. Sem DANFE? Digite o número do pedido.</p>
    </div>
    <div class="bloco nc-bipagem">
      <label class="nc-leitor">
        <span class="nc-leitor-luz" aria-hidden="true"></span>
        <span class="visor-rotulo">DANFE / Pedido</span>
        <input id="codigoCaixa" class="nc-leitor-input" type="text" inputmode="numeric" maxlength="60" autocomplete="off" spellcheck="false"
          value="${esc(estado.codigo)}" placeholder="Bipe ou digite aqui" aria-describedby="leituraCaixa" />
        <span class="nc-leitura" id="leituraCaixa" aria-live="polite"></span>
      </label>
      <div class="form-grade nc-campos">
        <label class="campo">Nota fiscal (NF)<input class="input" id="campoNf" inputmode="numeric" maxlength="12" value="${esc(estado.nf)}" autocomplete="off" /></label>
        <label class="campo">Série<input class="input" id="campoSerie" inputmode="numeric" maxlength="5" value="${esc(estado.serie)}" autocomplete="off" /></label>
        <label class="campo">CNPJ<input class="input" id="campoCnpj" inputmode="numeric" maxlength="18" value="${esc(estado.cnpj ? Catalogo.formatarCnpj(estado.cnpj) : '')}" placeholder="00.000.000/0000-00" autocomplete="off" /></label>
        ${campoClienteHtml('campoCliente', estado.cliente_nome)}
        ${pedeAwb() ? `<label class="campo inteiro">AWB ${saida ? '<span class="campo-ajuda" title="O volume já sai do NC">obrigatória</span>' : '<span class="campo-ajuda">opcional</span>'}
          <input class="input tk-mono" id="campoAwb" maxlength="60" value="${esc(estado.awb)}" placeholder="Código da transportadora" autocomplete="off" /></label>`
          : `<p class="nc-sem-awb inteiro">${ic('relogio')} ${estado.status === 'gris' ? 'Extravio vai direto para o setor GRIS: não precisa de AWB.' : 'Sem integração ainda não tem AWB. Ela entra quando o arquivo integrar, na hora de dar saída.'}</p>`}
      </div>
      <p class="aviso aviso-erro erro-etapa" id="erroDados" hidden></p>
      ${botaoDoCard('dados')}
    </div>`;
}

/* ---------- Sem identificação: só a caixa, sem etiqueta ----------
   Um número de referência qualquer (pode ser a data do dia), o cliente (se souber)
   e a AWB: a etiqueta AWB é gerada no sistema da empresa com base no número de
   referência. Sai como DEVOLUÇÃO. */
const referenciaDeHoje = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `SI-${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}-${p(d.getHours())}${p(d.getMinutes())}`;
};

function telaDadosSemId() {
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>Caixa <span class="acento">sem identificação</span></h1>
      <p>Dê um número de referência para a caixa (pode ser a data de hoje), o cliente se souber e a AWB gerada para essa referência.</p>
    </div>
    <div class="bloco nc-bipagem">
      <label class="nc-leitor pedido">
        <span class="visor-rotulo">Número de referência</span>
        <input id="codigoCaixa" class="nc-leitor-input" type="text" maxlength="40" autocomplete="off" spellcheck="false"
          value="${esc(estado.codigo)}" placeholder="Ex.: a data de hoje" />
        <span class="nc-leitura">${ic('etiqueta')} Esse número vai no lugar da DANFE / Pedido</span>
      </label>
      <div class="nc-semid-acoes"><button type="button" class="btn btn-sm" id="usarDataHoje">${ic('relogio')} Usar a data de hoje</button></div>
      <div class="form-grade nc-campos nc-campos-semid">
        ${campoClienteHtml('campoCliente', estado.cliente_nome)}
        <label class="campo inteiro">AWB <span class="campo-ajuda" title="Gerada no sistema da empresa a partir do número de referência">obrigatória</span>
          <input class="input tk-mono" id="campoAwb" maxlength="60" value="${esc(estado.awb)}" placeholder="AWB gerada para esse número de referência" autocomplete="off" /></label>
      </div>
      <p class="aviso aviso-erro erro-etapa" id="erroDados" hidden></p>
      ${botaoDoCard('dados')}
    </div>`;
}

function ligarDadosSemId() {
  const elCodigo = document.getElementById('codigoCaixa');
  const elAwb = document.getElementById('campoAwb');
  const ler = () => { estado.codigo = elCodigo.value.trim(); estado.nf = ''; estado.serie = ''; estado.cnpj = ''; };
  elCodigo.addEventListener('input', ler);
  elCodigo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('campoCliente').focus(); } });
  // a AWB (gerada no sistema da empresa com base no número de referência); fica no formato TXAQ123456789tx
  elAwb.addEventListener('input', () => { estado.awb = elAwb.value.trim(); });
  elAwb.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); avancarDe('dados'); } });
  document.getElementById('usarDataHoje').addEventListener('click', () => { elCodigo.value = referenciaDeHoje(); ler(); elCodigo.focus(); });
  ligarCampoCliente(document.getElementById('campoCliente'), (nome, cli) => { estado.cliente_nome = nome; estado.cliente_id = cli?.id ?? null; });
  setTimeout(() => elCodigo.focus(), 350);
}

function ligarDados() {
  if (Catalogo.tipo(estado.tipo)?.semDanfe) { ligarDadosSemId(); return; }
  const elCodigo = document.getElementById('codigoCaixa');
  const elLeitura = document.getElementById('leituraCaixa');
  const campos = {
    nf: document.getElementById('campoNf'),
    serie: document.getElementById('campoSerie'),
    cnpj: document.getElementById('campoCnpj'),
  };
  const cliente = ligarCampoCliente(document.getElementById('campoCliente'), (nome, cli) => {
    const trocou = (cli?.id ?? null) !== estado.cliente_id;
    estado.cliente_nome = nome; estado.cliente_id = cli?.id ?? null;
    // cliente cadastrado com CNPJ: o CNPJ vem junto (a não ser que a DANFE já tenha preenchido
    // ou que alguém tenha digitado outro CNPJ para este mesmo cliente)
    if (cli?.cnpj && !campos.cnpj.readOnly && (trocou || !estado.cnpj)) {
      estado.cnpj = Catalogo.somenteDigitos(cli.cnpj);
      campos.cnpj.value = Catalogo.formatarCnpj(estado.cnpj);
      campos.cnpj.classList.add('nc-preenchido');
      setTimeout(() => campos.cnpj.classList.remove('nc-preenchido'), 900);
    }
  });
  campos.awb = document.getElementById('campoAwb');   // não existe em Sem integração
  const travar = (sim) => ['nf', 'serie', 'cnpj'].forEach((k) => { campos[k].readOnly = sim; campos[k].classList.toggle('nc-auto', sim); });

  function ler() {
    estado.codigo = elCodigo.value.trim();
    const d = Catalogo.danfe(estado.codigo);
    const leitor = elCodigo.closest('.nc-leitor');
    leitor.classList.remove('ok', 'erro', 'pedido');
    if (d) {
      if (!d.valida) {
        leitor.classList.add('erro');
        elLeitura.innerHTML = `${ic('alerta')} Chave com 44 dígitos, mas o dígito verificador não confere`;
        travar(false);
        return;
      }
      leitor.classList.add('ok');
      estado.nf = d.nf; estado.serie = d.serie; estado.cnpj = d.cnpj;
      campos.nf.value = d.nf; campos.serie.value = d.serie; campos.cnpj.value = Catalogo.formatarCnpj(d.cnpj);
      const cli = clientes.find((c) => c.cnpj && Catalogo.somenteDigitos(c.cnpj) === d.cnpj);
      if (cli) cliente.definir(cli.nome);
      travar(true);
      elLeitura.innerHTML = `${ic('check')} DANFE lida · NF <b>${d.nf}</b> · Série <b>${d.serie}</b> · emitida em ${d.emissao}${cli ? ` · <b>${esc(cli.nome)}</b>` : ''}`;
      return;
    }
    travar(false);
    const digitos = Catalogo.somenteDigitos(estado.codigo);
    if (!estado.codigo) { elLeitura.textContent = ''; return; }
    if (/^\d+$/.test(estado.codigo.replace(/\s/g, '')) && digitos.length > 30) {
      leitor.classList.add('erro');
      elLeitura.innerHTML = `${ic('alerta')} ${digitos.length} de 44 dígitos: parece uma DANFE incompleta`;
      return;
    }
    leitor.classList.add('pedido');
    elLeitura.innerHTML = `${ic('etiqueta')} Número de pedido: preencha NF, série e CNPJ se tiver`;
  }

  elCodigo.addEventListener('input', ler);
  elCodigo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (campos.awb || document.getElementById('campoCliente')).focus(); } });
  campos.nf.addEventListener('input', () => { estado.nf = campos.nf.value.trim(); });
  campos.serie.addEventListener('input', () => { estado.serie = campos.serie.value.trim(); });
  campos.cnpj.addEventListener('input', () => {
    estado.cnpj = Catalogo.somenteDigitos(campos.cnpj.value);
    const cli = clientes.find((c) => c.cnpj && Catalogo.somenteDigitos(c.cnpj) === estado.cnpj);
    if (cli) cliente.definir(cli.nome);
  });
  campos.awb?.addEventListener('input', () => { estado.awb = campos.awb.value.trim(); });
  campos.awb?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); avancarDe('dados'); } });
  if (estado.codigo) ler();
  setTimeout(() => elCodigo.focus(), 350);
}

/** Local: prateleira e pallets desenhados (como o computador da antiga etapa "Equipamento"). */
const DESENHO_LOCAL = {
  prateleira: `
    <span class="lc-prateleira" aria-hidden="true">
      <i class="lc-tabua t1"></i><i class="lc-tabua t2"></i><i class="lc-tabua t3"></i>
      <i class="lc-cx c1"></i><i class="lc-cx c2"></i><i class="lc-cx c3"></i><i class="lc-cx c4"></i><i class="lc-cx c5"></i>
      <i class="lc-perna e"></i><i class="lc-perna d"></i>
    </span>`,
  'pallet-dentro': `
    <span class="lc-pallet" aria-hidden="true">
      <i class="lc-cx grande g1"></i><i class="lc-cx grande g2"></i><i class="lc-cx grande g3"></i>
      <i class="lc-base"></i><i class="lc-pe p1"></i><i class="lc-pe p2"></i><i class="lc-pe p3"></i>
      <i class="lc-teto"></i>
    </span>`,
  'pallet-fora': `
    <span class="lc-pallet lc-fora" aria-hidden="true">
      <i class="lc-cx g1"></i><i class="lc-cx g2"></i><i class="lc-cx g4"></i><i class="lc-cx g5"></i>
      <i class="lc-base"></i><i class="lc-pe p1"></i><i class="lc-pe p2"></i><i class="lc-pe p3"></i>
      <i class="lc-sol"></i>
    </span>`,
  crossdocking: `
    <span class="lc-dock" aria-hidden="true">
      <i class="lc-porta"></i><i class="lc-esteira"></i><i class="lc-rolo r1"></i><i class="lc-rolo r2"></i><i class="lc-rolo r3"></i><i class="lc-rolo r4"></i>
      <i class="lc-cx d1"></i><i class="lc-cx d2"></i><i class="lc-seta"></i>
    </span>`,
  'setor-devolucao': `
    <span class="lc-devolucao" aria-hidden="true">
      <i class="lc-cx dv"></i><i class="lc-volta"></i><i class="lc-placa">DEVOLUÇÃO</i>
    </span>`,
  gris: `
    <span class="lc-gris" aria-hidden="true">
      <i class="lc-escudo"></i><i class="lc-cx gr"></i><i class="lc-placa">GRIS</i><i class="lc-luz"></i>
    </span>`,
};
function telaLocal() {
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>Para onde vai o <span class="acento">volume</span>?</h1>
      <p>${esc(Catalogo.tipo(estado.tipo)?.titulo || '')}${estado.status ? ` · ${esc(Catalogo.statusDe(estado.status).titulo)}` : ''}: toque no lugar para onde a caixa vai.</p>
    </div>
    <div class="nc-locais">
      ${Catalogo.locaisPermitidos(estado.tipo, estado.status).map((l, i) => `
        <button type="button" class="nc-local ${estado.local === l.id ? 'selecionada' : ''}" data-local="${l.id}" style="--i:${i}">
          <span class="nc-local-cena">${DESENHO_LOCAL[l.id]}</span>
          <strong>${l.titulo}</strong>
          <small>${l.descricao}</small>
        </button>`).join('')}
    </div>`;
}

function telaNota() {
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>Quer deixar uma <span class="acento">nota</span>?</h1>
      <p>Opcional. Dá para anexar fotos da caixa. Sem nada para anotar, é só clicar em Revisar ticket.</p>
    </div>
    <div class="bloco bloco-nota">
      <div class="bloco-titulo"><h2>Nota do volume</h2><span>opcional</span></div>
      <div class="nota-caixa campo">
        <textarea id="nota" maxlength="1000" placeholder="Ex.: Caixa amassada na lateral, etiqueta antiga por baixo da nova.">${esc(estado.nota)}</textarea>
      </div>
      <div class="nc-anexar">
        <label class="btn nc-anexar-botao ${estado.anexos.length >= Anexos.MAX_POR_VOLUME ? 'desligado' : ''}">
          ${ic('mais')} Anexar imagem
          <input type="file" id="arquivoAnexo" accept="image/*" multiple hidden ${estado.anexos.length >= Anexos.MAX_POR_VOLUME ? 'disabled' : ''} />
        </label>
        <span class="nc-anexar-dica">Até ${Anexos.MAX_POR_VOLUME} imagens · também dá para colar (Ctrl+V)</span>
        <p class="aviso aviso-erro" id="erroAnexo" hidden></p>
        <div id="listaAnexos">${anexosHtml(estado.anexos, { remover: true })}</div>
      </div>
      ${botaoDoCard('nota')}
    </div>`;
}

/** Anexa imagens à nota do rascunho (ficam guardadas já no IndexedDB). */
async function anexarImagens(arquivos) {
  const erro = document.getElementById('erroAnexo');
  erro.hidden = true;
  const imagens = [...arquivos].filter((a) => /^image\//.test(a.type));
  if (!imagens.length) return;
  for (const arquivo of imagens) {
    if (estado.anexos.length >= Anexos.MAX_POR_VOLUME) {
      erro.textContent = `No máximo ${Anexos.MAX_POR_VOLUME} imagens por volume.`;
      erro.hidden = false;
      break;
    }
    try {
      const ref = await Anexos.salvar(arquivo);
      estado.anexos.push({ ...ref, url: await Anexos.url(ref.id) });
    } catch (falha) {
      erro.textContent = falha.message || 'Não foi possível anexar a imagem.';
      erro.hidden = false;
    }
  }
  irPara('nota', 'dir', { falar: false });
}

function ligarNota() {
  const elNota = document.getElementById('nota');
  elNota.addEventListener('input', () => { estado.nota = elNota.value; });
  document.getElementById('arquivoAnexo').addEventListener('change', (e) => anexarImagens(e.target.files));
  elPalco.querySelector('.bloco-nota').addEventListener('paste', (e) => {
    const imagens = [...(e.clipboardData?.files || [])];
    if (imagens.length) { e.preventDefault(); anexarImagens(imagens); }
  });
  elPalco.querySelectorAll('[data-tirar-anexo]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.tirarAnexo;
    estado.anexos = estado.anexos.filter((a) => a.id !== id);
    await Anexos.apagar([id]);
    irPara('nota', 'dir', { falar: false });
  }));
  setTimeout(() => elNota.focus(), 350);
}

/** Ticket do rascunho (revisão e impressão). */
function ticketHtml(codigo = null, dataEntrada = null) {
  const cli = clienteDe(estado.cliente_id);
  const danfe = Catalogo.danfe(estado.codigo);
  const ehDanfe = !!danfe?.valida;
  const st = Catalogo.statusDe(estado.status);
  const quando = dataEntrada ? TicketUI.dataHoraBr(dataEntrada) : 'agora';
  const fotos = estado.anexos.length;
  return TicketUI.grande({
    compacto: true,
    codigo,
    tipo: estado.tipo,
    status: estado.status,
    clienteCor: cli?.cor,
    clienteNome: cli?.nome || estado.cliente_nome,
    dados: [
      ['DATA (E)', quando],
      ['DATA (S)', st.saida ? quando : '—'],
      ['Cliente', esc(cli?.nome || estado.cliente_nome || '—')],
      ['CNPJ', esc(estado.cnpj ? Catalogo.formatarCnpj(estado.cnpj) : '—')],
      ['Nota fiscal', esc(estado.nf || '—')],
      ['Série', esc(estado.serie || '—')],
      ['AWB', esc((pedeAwb() && Catalogo.formatarAwb(estado.awb)) || '—')],
      ['Local', esc(Catalogo.local(estado.local)?.titulo || '—')],
      ['Inserido por', esc(usuario.nome)],
      fotos ? ['Imagens', `${ic('documento')} ${fotos} anexada${fotos > 1 ? 's' : ''}`] : null,
    ].filter(Boolean),
    nota: estado.nota.trim(),
    codigoCaixa: ehDanfe
      ? { rotulo: 'DANFE', texto: Catalogo.formatarChave(danfe.chave), copiar: danfe.chave }
      : (estado.codigo ? { rotulo: 'Pedido', texto: estado.codigo.toUpperCase(), copiar: estado.codigo.toUpperCase() } : null),
    carimbo: `<span class="tk-carimbo carimbo-${estado.status}">${st.saida ? esc(st.titulo.toUpperCase()) : 'NO NC'}</span>`,
  });
}

function telaRevisao() {
  return `
    <div class="nc-revisao">
      <div class="etapa-cabeca">
        <h1>Seu ticket está <span class="acento">pronto</span></h1>
        <p>Confira os dados. Ao gerar, ele é impresso e vai para a mesa do Controle NC.</p>
      </div>
      ${ticketHtml()}
      <p class="aviso aviso-erro erro-etapa" id="erroEnvio" hidden></p>
    </div>`;
}


// ---------- Eventos de cada tela ----------
function ligarEventos(etapa) {
  if (etapa === 'mesa') { preencherMesa(); return; }
  if (etapa === 'ver') { ligarVer(); return; }
  if (LIGAR_EXTRAS[etapa]) { LIGAR_EXTRAS[etapa](); return; }

  elPalco.querySelectorAll('.cartao').forEach((cartao) => {
    cartao.addEventListener('pointerenter', () => cartao.classList.add('ativo-ico'));
    cartao.addEventListener('pointerleave', () => cartao.classList.remove('ativo-ico'));
    cartao.addEventListener('click', () => (cartao.dataset.sequencia ? iniciarSequencia() : escolher('tipo', cartao.dataset.tipo, cartao)));
  });
  elPalco.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => escolher('status', b.dataset.status, b)));
  elPalco.querySelectorAll('[data-local]').forEach((b) => b.addEventListener('click', () => escolher('local', b.dataset.local, b)));

  if (etapa === 'dados') ligarDados();
  if (etapa === 'nota') ligarNota();
}

/** Escolher um cartão/opção já leva para a próxima etapa. */
/** Preenche sozinho o que só tem uma opção (status e local) e limpa escolhas que deixaram de valer. */
function aplicarRegras() {
  const sts = Catalogo.statusDaEntrada(estado.tipo).map((s) => s.id);
  if (sts.length === 1) estado.status = sts[0];
  else if (!sts.includes(estado.status)) estado.status = null;
  const ls = Catalogo.locaisPermitidos(estado.tipo, estado.status).map((l) => l.id);
  if (ls.length === 1) estado.local = ls[0];
  else if (!ls.includes(estado.local)) estado.local = null;
}

function escolher(campo, valor, botao) {
  if (elPalco.querySelector('.escolheu')) return;
  estado[campo] = valor;
  aplicarRegras();
  elPalco.querySelectorAll(`[data-${campo}]`).forEach((o) => o.classList.toggle(campo === 'tipo' ? 'escolhido' : 'selecionada', o === botao));
  elPalco.querySelector('.etapa-tela')?.classList.add('escolheu');
  setTimeout(() => irPara(proximaDepois(etapaAtual)), campo === 'tipo' ? 260 : 220);
}

function avancarDe(etapa) {
  if (etapa === 'dados') {
    const erro = document.getElementById('erroDados');
    const d = Catalogo.danfe(estado.codigo);
    let problema = '';
    if (!estado.codigo) problema = Catalogo.tipo(estado.tipo)?.semDanfe ? 'Dê um número de referência para a caixa (pode ser a data de hoje).' : 'Bipe a DANFE ou digite o número do pedido.';
    else if (d && !d.valida) problema = 'Essa chave DANFE não confere (dígito verificador). Bipe de novo.';
    else if (estado.cnpj && estado.cnpj.length !== 14) problema = 'O CNPJ precisa ter 14 dígitos.';
    else if (Catalogo.exigeAwb(estado.status, estado.tipo) && !estado.awb) problema = `Para ${Catalogo.statusDe(estado.status).titulo} a AWB é obrigatória: sem ela o volume não sai do NC.`;
    if (problema) {
      erro.textContent = problema;
      erro.hidden = false;
      helpy.dizer(problema, { tipo: 'alerta', humor: 'alerta', atraso: 300 });
      return;
    }
  }
  irPara(proximaDepois(etapa));
}

// ---------- Helpy: falas pré-prontas ----------
function falarSobre(etapa) {
  if (etapa === 'mesa') { falarDaMesa(); return; }
  if (etapa === 'tipo') {
    helpy.dizer('<p>Escolha o tipo de não conformidade da caixa. Eu cuido da numeração e da impressão do ticket.</p>', {
      acoes: [{ rotulo: `${ic('duvida')} Qual tipo escolher?`, fn: () => atalho('tipos') }],
    });
  }
  if (etapa === 'status') {
    const frases = {
      cep: 'CEP errado: depois de corrigir com o cliente, a peça segue como tratada.',
      duplicidade: 'Duplicidade costuma ficar <strong>aguardando entrega realizada</strong> no pallet de fora até virar devolução.',
      reimpressao: 'Reimpressão é rápida: etiqueta nova e a peça volta para o fluxo.',
      'sem-integracao': `Sem integração tem prazo: <strong>${Catalogo.PRAZO_DIAS} dias</strong> no setor. Depois disso vira devolução. Não esquece o e-mail!`,
      bloqueio: 'Bloqueio: a peça fica parada até liberarem ou virar devolução.',
      extravio: 'Extravio é caso crítico: a peça vai para o <strong>setor GRIS</strong> (segurança). <i class="ic ic-sirene" aria-hidden="true"></i>',
      operacional: 'Problema operacional: conte o que tem de estranho na nota.',
    };
    helpy.dizer(`<p>${frases[estado.tipo] || ''}</p><p><strong>Qual o status atual da encomenda?</strong></p>`, {
      humor: estado.tipo === 'extravio' ? 'alerta' : 'feliz',
    });
  }
  if (etapa === 'dados') {
    helpy.dizer(Catalogo.tipo(estado.tipo)?.semDanfe
      ? 'Caixa sem etiqueta: dê um <strong>número de referência</strong> (o botão usa a data de hoje), o <strong>cliente</strong> se souber e a <strong>AWB</strong> que o sistema gerou pra essa referência 📦'
      : 'Bipe o código de barras da <strong>DANFE</strong> (44 dígitos) e eu preencho NF, série e CNPJ sozinho. Se for <strong>pedido</strong>, digite e complete o que tiver.');
  }
  if (etapa === 'local') {
    helpy.dizer(`<p>${Catalogo.locaisPermitidos(estado.tipo, estado.status).map((l) => `<strong>${l.titulo}</strong>: ${l.descricao.toLowerCase()}`).join('<br>')}</p>`);
  }
  if (etapa === 'nota') helpy.dizer('Se tiver algo que valha lembrar sobre a caixa, escreva aqui. Se não, é só clicar em <strong>Revisar ticket</strong>.');
  if (etapa === 'revisao') {
    helpy.dizer('Tudo certo? Quando clicar em <strong>Gerar ticket</strong>, ele sai da impressora direto para a mesa. <i class="ic ic-ticket" aria-hidden="true"></i>', { humor: 'comemorando' });
  }
  if (etapa === 'ver') falarDoTicket(volumeVisto());
}

/**
 * Ao abrir um ticket, o Helpy comenta como um amigo:
 * "Você abriu esse ticket ontem, ele é uma duplicidade e está ali no Pallet de fora, só te lembrando 😉"
 */
function falarDoTicket(v) {
  if (!v) return;
  const dias = Catalogo.dias({ data_entrada: v.data_entrada });
  const hora = new Date(v.data_entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const quando = dias === 0 ? `hoje, às ${hora}` : dias === 1 ? 'ontem' : dias <= 6 ? `há ${dias} dias` : `lá no dia ${TicketUI.dataBr(v.data_entrada)}`;
  const meu = !v.criado_por || v.criado_por === usuario?.nome;
  const quem = meu
    ? `Você abriu esse ticket ${quando}`
    : `Esse ticket foi aberto por <strong>${esc(Helpy.apelido(v.criado_por))}</strong>, do seu time, ${quando}`;
  const oQue = {
    cep: 'é um problema de CEP',
    duplicidade: 'é uma duplicidade',
    reimpressao: 'é uma reimpressão',
    'sem-integracao': 'está sem integração',
    bloqueio: 'é um ticket de bloqueio',
    operacional: 'é um problema operacional',
    'sem-identificacao': 'é uma caixa sem identificação',
    extravio: 'é um extravio 🚨',
  }[v.tipo] || `é ${esc(v.tipo_titulo)}`;
  const naLocal = { prateleira: 'ali na <strong>Prateleira</strong>', 'setor-devolucao': 'lá no setor de <strong>Devolução</strong>' }[v.local]
    || `ali no <strong>${esc(v.local_titulo)}</strong>`;

  const partes = [];
  let humor = 'piscando';
  if (Catalogo.statusDe(v.status).saida) {
    partes.push(`${quem}, ${oQue.replace(/^é /, 'era ').replace(/^está /, 'estava ')} e já saiu como <strong>${esc(v.status_titulo)}</strong>${v.awb ? ` (AWB ${esc(v.awb)})` : ''}. Missão cumprida! 🎉`);
    humor = 'comemorando';
  } else {
    partes.push(`${quem}, ${oQue} e ${v.tipo === 'sem-integracao' ? 'tá guardado' : 'está'} ${naLocal}, ${Helpy.sortear(['só te lembrando 😉', 'só pra você saber 👀', 'fica a dica 😄'])}`);
    const prazo = Catalogo.prazo(v);
    if (prazo === 'vencido') {
      partes.push(`Ihh, e já passou dos ${Catalogo.PRAZO_DIAS} dias sem integração 😬 Tá na hora de virar <strong>devolução</strong>.`);
      humor = 'triste';
    } else if (prazo === 'atencao') {
      const n = Math.max(0, Catalogo.diasRestantes(v));
      partes.push(`Corre que falta${n === 1 ? '' : 'm'} só <strong>${n} dia${n === 1 ? '' : 's'}</strong> pro prazo estourar! ⏳`);
      humor = 'desconfiado';
    }
    if (v.status === 'enviar-email') partes.push('Ah, e o e-mail ainda não foi enviado, hein! 📧 Mandou? É só trocar para <strong>E-mail enviado</strong>.');
    if (v.status === 'aguardando-entrega') partes.push('Quando sair a entrega realizada, ele vira devolução 📦');
    if (v.tipo === 'extravio') humor = 'alerta';
  }
  helpy.dizer(partes.map((p) => `<p>${p}</p>`).join(''), { humor });
}

/** Na mesa o Helpy dá o resumo e cobra os pendentes (prazo e e-mail). */
function falarDaMesa() {
  const setor = noSetor();
  const vencidos = setor.filter((v) => Catalogo.prazo(v) === 'vencido');
  const atencao = setor.filter((v) => Catalogo.prazo(v) === 'atencao');
  const emails = setor.filter((v) => v.status === 'enviar-email');

  if (!setor.length) {
    helpy.dizer(`<p>${helpy.oi(esc(primeiroNome()))}</p>
      <p>O setor NC tá vazio, que paz 😌 Chegou caixa com problema? É só inserir o volume que eu te ajudo.</p>`, {
      humor: 'acenando',
      acoes: [{ rotulo: `${ic('mais')} Inserir volume`, destaque: true, fn: iniciarVolume }],
    });
    return;
  }
  const saidas = saidasHoje().length;
  helpy.dizer(`<p>${helpy.oi(esc(primeiroNome()))}</p>
    <p>Tem <strong>${setor.length} volume${setor.length > 1 ? 's' : ''}</strong> no setor NC hoje.
    ${saidas ? `E já ${saidas === 1 ? 'saiu <strong>1</strong>' : `saíram <strong>${saidas}</strong>`}, mandou bem! 💪` : 'Ainda não saiu nenhum hoje, bora? 🚀'}</p>`, {
    humor: 'acenando',
    acoes: [
      { rotulo: `${ic('mais')} Inserir volume`, destaque: true, fn: iniciarVolume },
      { rotulo: `${ic('duvida')} Resumo do setor`, fn: () => atalho('resumo') },
    ],
  });
  if (vencidos.length) {
    helpy.dizer(`<p>Ihh 😬 ${vencidos.length > 1 ? 'Esses aqui passaram' : 'Esse aqui passou'} dos <strong>${Catalogo.PRAZO_DIAS} dias</strong> sem integração:</p>${listaHelpy(maisAntigos(vencidos))}
      <p>${vencidos.length > 1 ? 'Eles precisam' : 'Ele precisa'} virar <strong>devolução</strong>, tá?</p>`, {
      tipo: 'alerta', humor: 'triste',
      acoes: [{ rotulo: `${ic('olho')} Ver ${vencidos[0].codigo}`, destaque: true, fn: () => abrirVolume(vencidos[0].numero) }],
    });
  } else if (atencao.length) {
    helpy.dizer(`<p>Ó, ${atencao.length > 1 ? 'esses tão quase' : 'esse tá quase'} batendo os ${Catalogo.PRAZO_DIAS} dias ⏳</p>${listaHelpy(maisAntigos(atencao))}`, {
      tipo: 'alerta', humor: 'desconfiado',
      acoes: [{ rotulo: `${ic('olho')} Ver ${atencao[0].codigo}`, fn: () => abrirVolume(atencao[0].numero) }],
    });
  }
  if (emails.length) lembrarEmails(emails);
  else if (!lembrarIntegracao()) lembrarAguardando();   // um lembrete por vez: e-mail > integração > entrega
}

/** Há quantos dias o volume está no setor, para as listas do Helpy. */
function haDias(v) { const d = Catalogo.dias(v); return d < 1 ? 'hoje' : `há ${d} dia${d > 1 ? 's' : ''}`; }
/** Tickets um embaixo do outro, os mais antigos primeiro. */
function listaHelpy(lista, { comDias = true } = {}) {
  return Helpy.listaTickets(lista.map((v) => ({ codigo: v.codigo, extra: comDias ? haDias(v) : '' })));
}
const maisAntigos = (lista) => lista.slice().sort((a, b) => Catalogo.dias(b) - Catalogo.dias(a));

function lembrarEmails(emails = noSetor().filter((v) => v.status === 'enviar-email')) {
  if (!emails.length) return false;
  const ordem = maisAntigos(emails);
  helpy.dizer(`<p>Ei, não esquece o e-mail! 📧</p>
    <p>${ordem.length > 1 ? `${ordem.length} volumes estão` : 'Um volume está'} esperando em <strong>Enviar e-mail</strong>:</p>${listaHelpy(ordem)}`, {
    tipo: 'alerta', humor: 'pensando',
    acoes: [
      { rotulo: `${ic('check')} Já enviei, marcar ${emails.length > 1 ? 'todos ' : ''}como E-mail enviado`, destaque: true, fn: () => marcarEmailsEnviados(emails) },
      { rotulo: `${ic('envelope')} Montar o e-mail por cliente`, fn: () => { location.href = 'emails.html'; } },
      { rotulo: `${ic('olho')} Ver ${ordem[0].codigo}`, fn: () => abrirVolume(ordem[0].numero) },
    ],
  });
  return true;
}

/**
 * Sem integração com o e-mail já enviado: o Helpy lembra de conferir se já integrou.
 * Entra a partir de 1 dia no setor (os vencidos já têm o aviso de prazo).
 */
function lembrarIntegracao(lista = noSetor().filter((v) => v.tipo === 'sem-integracao' && v.status === 'email-enviado'
  && Catalogo.dias(v) >= 1 && Catalogo.prazo(v) !== 'vencido')) {
  if (!lista.length) return false;
  const ordem = maisAntigos(lista);
  helpy.dizer(`<p>Dá uma olhada se já integrou! 🔄</p>
    <p>${ordem.length > 1 ? `${ordem.length} volumes estão` : 'Um volume está'} sem integração:</p>${listaHelpy(ordem)}`, {
    tipo: 'alerta', humor: 'pensando',
    acoes: [{ rotulo: `${ic('olho')} Ver ${ordem[0].codigo}`, destaque: true, fn: () => abrirVolume(ordem[0].numero) }],
  });
  return true;
}

/**
 * Aguardando entrega realizada: não tem relógio, mas o Helpy lembra de conferir se já foi entregue
 * (com a entrega realizada, o volume vira devolução). Entra a partir de 1 dia no setor.
 */
function lembrarAguardando(lista = noSetor().filter((v) => v.status === 'aguardando-entrega' && Catalogo.dias(v) >= 1)) {
  if (!lista.length) return false;
  const ordem = maisAntigos(lista);
  helpy.dizer(`<p>Dá uma olhada para ver se já foi entregue! 🚚</p>
    <p>${ordem.length > 1 ? `${ordem.length} volumes estão` : 'Um volume está'} em <strong>Aguardando entrega realizada</strong>:</p>${listaHelpy(ordem)}`, {
    tipo: 'alerta', humor: 'pensando',
    acoes: [{ rotulo: `${ic('olho')} Ver ${ordem[0].codigo}`, destaque: true, fn: () => abrirVolume(ordem[0].numero) }],
  });
  return true;
}
async function marcarEmailsEnviados(lista) {
  let n = 0;
  for (const v of lista) {
    const { ok } = await API.atualizarVolume(v.numero, { status: 'email-enviado' });
    if (ok) n += 1;
  }
  await atualizar(true);
  Efeitos.toast(`${n} volume${n > 1 ? 's' : ''} em E-mail enviado`, { icone: ic('enviar'), tipo: 'sucesso' });
  helpy.dizer(`Anotado! Marquei <strong>${n}</strong> volume${n > 1 ? 's' : ''} como <strong>E-mail enviado</strong>.`, { humor: 'comemorando' });
}

function atalho(tipo) {
  if (tipo === 'tipos') {
    helpy.dizer(`<ul class="helpy-passos">
      <li><strong>CEP</strong>: cliente errou o CEP.</li>
      <li><strong>Duplicidade</strong>: etiqueta saiu duas vezes ou foi colada na caixa errada.</li>
      <li><strong>Reimpressão</strong>: etiqueta rasgada ou ilegível.</li>
      <li><strong>Sem integração</strong>: arquivo pendente (prazo de ${Catalogo.PRAZO_DIAS} dias).</li>
      <li><strong>Ticket de bloqueio</strong>: pediram para bloquear.</li>
      <li><strong>Extravio</strong>: crítico, vai para o setor GRIS.</li>
      <li><strong>Problemas operacionais</strong>: qualquer coisa estranha com a peça.</li></ul>`, { humor: 'pensando', atraso: 250 });
  }
  if (tipo === 'resumo') {
    const setor = noSetor();
    const porLocal = Catalogo.locais.map((l) => `${l.titulo}: <strong>${setor.filter((v) => v.local === l.id).length}</strong>`).join(' · ');
    const maisAntigo = setor.slice().sort((a, b) => new Date(a.data_entrada) - new Date(b.data_entrada))[0];
    helpy.dizer(`<p>${porLocal}</p>
      ${maisAntigo ? `<p>O mais antigo é o <strong>${esc(maisAntigo.codigo)}</strong> (${esc(maisAntigo.tipo_titulo)}), ${esc(TicketUI.tempoNoSetor(maisAntigo))}.</p>` : ''}`, {
      atraso: 250,
      acoes: maisAntigo ? [{ rotulo: `${ic('olho')} Ver ${maisAntigo.codigo}`, fn: () => abrirVolume(maisAntigo.numero) }] : [],
    });
  }
}

// ---------- Geração e impressão do ticket ----------
async function gerarTicket() {
  const botao = document.getElementById('gerarTicket');
  botao.disabled = true;
  botao.textContent = 'Gerando…';

  const { ok, dados } = await API.inserirVolume({
    tipo: estado.tipo,
    status: estado.status,
    local: estado.local,
    codigo_caixa: estado.codigo,
    nf: estado.nf,
    serie: estado.serie,
    cnpj: estado.cnpj,
    cliente_id: estado.cliente_id,
    cliente_nome: estado.cliente_nome,
    awb: pedeAwb() ? estado.awb : '',
    nota: estado.nota.trim(),
    anexos: estado.anexos.map(({ url, ...ref }) => ref),
  });

  if (!ok) {
    const erro = document.getElementById('erroEnvio');
    erro.textContent = dados.erro || 'Não foi possível gerar o ticket.';
    erro.hidden = false;
    botao.disabled = false;
    botao.innerHTML = `${ic('ticket')} Gerar ticket`;
    helpy.dizer(esc(erro.textContent), { tipo: 'alerta', humor: 'alerta' });
    return;
  }
  animarEnvio(dados);
}

/**
 * Registro em sequência terminado: a mesma telinha da impressora, só que saindo a
 * ETIQUETA DO PACOTE. Imprime a etiqueta e volta para a mesa com o pacote chegando.
 */
async function animarPacote(membros) {
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const codigo = TicketUI.codigoPacote(membros[0].pacote);
  helpy.calar();
  etapaAtual = 'envio';
  renderizarCabecalho();
  elPalco.innerHTML = `
    <section class="etapa-tela entra-dir">
      <div class="envio-cena envio-pacote" id="cena">
        <div class="envio-impressao">
          <div class="impressora"><span class="impressora-luz"></span></div>
          <div class="saida-papel"><div class="ticket-palco pacote-palco"><ul class="pacote-palco-ticket">${TicketUI.pacote(membros).replace(/<button type="button" class="tkp-abrir"[^>]*><\/button>/, '')}</ul></div></div>
          <p class="envio-status" id="envioStatus">Imprimindo o ticket do pacote…</p>
        </div>
        <div class="envio-dica" aria-hidden="true">${ic('pacote')} ${esc(codigo)} · ${membros.length} tickets</div>
      </div>
    </section>`;
  const cena = document.getElementById('cena');
  const status = document.getElementById('envioStatus');
  helpy.dizer(`Empacotando os <strong>${membros.length}</strong> tickets e imprimindo o ticket do pacote… 📦`, { humor: 'pensando', atraso: 200 });
  requestAnimationFrame(() => cena.classList.add('imprimindo'));
  await espera(1800);
  status.textContent = 'Mandando a etiqueta para a impressora…';
  // trava o ticket já impresso ANTES de imprimir: a janela de impressão esconde a página e, ao voltar, o navegador reiniciaria a animação
  cena.classList.add('impresso');
  const r = await Impressao.imprimirPacote(membros).catch((erro) => ({ ok: false, erro: erro.message }));
  status.innerHTML = r?.ok ? `${ic('check-circulo')} Pacote ${esc(codigo)} pronto!` : `${ic('alerta')} A etiqueta não saiu`;
  if (r && !r.ok) Efeitos.toast(`Não imprimiu o pacote: ${esc(r.erro || 'impressora indisponível')}`, { icone: ic('alerta'), tipo: 'alerta', duracao: 8000 });
  else if (r?.via && r.via !== 'nenhum') Efeitos.toast(`Etiqueta do pacote <b>${esc(codigo)}</b> enviada para a impressora`, { icone: ic('impressora'), tipo: 'sucesso' });
  await espera(500);
  // igual aos outros tickets: o ticket do pacote é jogado na mão do Helpy
  status.textContent = 'Jogando o ticket do pacote para o Helpy…';
  const ticket = cena.querySelector('.pacote-palco-ticket');
  const escritorioEl = document.querySelector('.escritorio');
  const helpyEl = escritorioEl?.querySelector('.helpy-avatar') || escritorioEl;
  helpy.humor('acenando');
  if (ticket && helpyEl) {
    ticket.style.visibility = 'hidden';
    await Efeitos.voar(ticket, helpyEl, { duracao: 1050, escalaFinal: .18 });
  }
  if (escritorioEl) {
    const mao = document.createElement('span');
    mao.className = 'ticket-na-mao';
    mao.innerHTML = `${ic('pacote')} ${esc(codigo)}`;
    escritorioEl.appendChild(mao);
    escritorioEl.classList.remove('pegou');
    void escritorioEl.offsetWidth;
    escritorioEl.classList.add('pegou');
    setTimeout(() => mao.remove(), 2200);
  }
  helpy.humor('comemorando', 1600);
  Efeitos.confete(helpyEl, 50);
  status.innerHTML = `${ic('check-circulo')} O Helpy pegou o pacote ${esc(codigo)}!`;
  await espera(1200);
  // de volta para a mesa (sem repetir animação de "chegando": o ticket já foi impresso uma vez)
  const saiu = Catalogo.saiu(membros[0]);
  destaque = null;
  estado = novoEstado();
  await atualizar(true);
  irPara('mesa', 'dir', { falar: false });
  const st = Catalogo.statusDe(membros[0].status);
  const local = Catalogo.local(membros[0].local)?.titulo || '';
  const onde = saiu
    ? `O pacote foi pro <strong>${esc(local)}</strong> e já tá no <a href="historico.html">Histórico de Tickets</a> 🚚`
    : 'O ticket do pacote foi parar na <strong>Minha Mesa</strong>: clica nele pra ver os tickets de dentro 😉';
  helpy.dizer(`<p>Peguei! 🙌 Registrei <strong>${membros.length}</strong> peças como <strong>${esc(st.titulo)}</strong> no pacote <strong>${esc(codigo)}</strong> 📦</p>${Helpy.listaTickets(membros.map((v) => ({ codigo: v.codigo, extra: v.nf ? `NF ${v.nf}` : '' })))}
    <p>${onde}</p>`, {
    humor: 'comemorando', tipo: 'sucesso',
    acoes: [{ rotulo: `${ic('codigo-barras')} Bipar mais`, fn: () => iniciarSequencia() }],
  });
}

function animarEnvio(volume) {
  helpy.calar();
  etapaAtual = 'envio';
  renderizarCabecalho();
  elPalco.innerHTML = `
    <section class="etapa-tela entra-dir">
      <div class="envio-cena" id="cena">
        <div class="envio-impressao">
          <div class="impressora"><span class="impressora-luz"></span></div>
          <div class="saida-papel">${ticketHtml(volume.codigo, volume.data_entrada)}</div>
          <p class="envio-status" id="envioStatus">Imprimindo o ticket…</p>
        </div>
        <div class="envio-dica" aria-hidden="true">${ic('robo')} Jogando para o Helpy <span class="envio-seta">→</span></div>
      </div>
    </section>`;

  TicketUI.alinharPicotes(elPalco);
  const cena = document.getElementById('cena');
  const status = document.getElementById('envioStatus');
  const ticket = cena.querySelector('.tk');
  helpy.dizer('Imprimindo… <i class="ic ic-impressora" aria-hidden="true"></i>', { humor: 'pensando', atraso: 200 });

  // 1) a animação da impressão; 2) a pergunta "imprimir a etiqueta?"; 3) o ticket vai para o Helpy
  requestAnimationFrame(() => cena.classList.add('imprimindo'));
  setTimeout(() => {
    ticket.classList.add('carimbado');
    status.textContent = `Ticket ${volume.codigo} carimbado!`;
  }, 1700);
  setTimeout(async () => {
    const querImprimir = await perguntarImpressao(volume);
    let resultado = null;
    if (querImprimir) {
      status.textContent = 'Mandando a etiqueta para a impressora…';
      cena.classList.add('impresso');   // a janela de impressão não pode reiniciar a animação
      resultado = await Impressao.imprimir(volume).catch((erro) => ({ ok: false, erro: erro.message }));
    } else {
      API.registrarAcao('Registrou sem imprimir a etiqueta', volume.codigo);
    }
    status.textContent = 'Jogando o ticket para o Helpy…';
    const escritorioEl = document.querySelector('.escritorio');
    const helpyEl = escritorioEl?.querySelector('.helpy-avatar') || escritorioEl;
    helpy.humor('acenando');
    ticket.style.visibility = 'hidden';
    await Efeitos.voar(ticket, helpyEl, { duracao: 1050, escalaFinal: .18 });
    if (escritorioEl) {
      const mao = document.createElement('span');
      mao.className = 'ticket-na-mao';
      mao.innerHTML = `${ic('ticket')} ${esc(volume.codigo)}`;
      escritorioEl.appendChild(mao);
      escritorioEl.classList.remove('pegou');
      void escritorioEl.offsetWidth;
      escritorioEl.classList.add('pegou');
      setTimeout(() => mao.remove(), 2200);
    }
    helpy.humor('comemorando', 1600);
    Efeitos.confete(helpyEl, 50);
    status.innerHTML = `${ic('check-circulo')} O Helpy pegou o ticket ${esc(volume.codigo)}!`;
    setTimeout(() => voltarComTicket(volume, resultado), 1200);
  }, 2300);
}

/** Caixa de pergunta depois da animação: imprimir a etiqueta na Zebra? (Enter = Sim, Esc = Não) */
function perguntarImpressao(volume, { naoRotulo = 'Não, só registrar' } = {}) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = 'modal modal-pergunta';
    d.innerHTML = `
      <div class="modal-conteudo">
        <span class="pergunta-ico">${ic('impressora')}</span>
        <h2>Deseja imprimir a etiqueta?</h2>
        <p>Ticket <b>${esc(volume.codigo)}</b> · ${esc(volume.tipo_titulo)} · <b>${esc(volume.status_titulo)}</b></p>
        <div class="modal-acoes">
          <button type="button" class="btn" data-resposta="nao">${esc(naoRotulo)}</button>
          <button type="button" class="btn btn-primary btn-lg" data-resposta="sim">${ic('impressora')} Sim, imprimir</button>
        </div>
      </div>`;
    let respondeu = false;
    const responder = (sim) => { if (respondeu) return; respondeu = true; d.close(); d.remove(); resolver(sim); };
    d.addEventListener('click', (e) => { const b = e.target.closest('[data-resposta]'); if (b) responder(b.dataset.resposta === 'sim'); });
    d.addEventListener('cancel', (e) => { e.preventDefault(); responder(false); });
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('[data-resposta="sim"]').focus();
  });
}

/** Imprime de novo um ticket que já existe, com o status ATUAL salvo (ex.: depois de trocar o status). */
async function reimprimir(numero, botao = null) {
  const { ok, dados: v } = await API.volume(numero);
  if (!ok) return;
  botao?.classList.add('imprimindo');
  if (botao) botao.disabled = true;
  helpy.dizer(`Imprimindo o ticket <strong>${esc(v.codigo)}</strong> com o status <strong>${esc(v.status_titulo)}</strong>… ${ic('impressora')}`, { humor: 'pensando', atraso: 0 });
  try {
    avisarImpressao(await Impressao.imprimir(v), v);
  } finally {
    botao?.classList.remove('imprimindo');
    if (botao) botao.disabled = false;
  }
}

/** Conta como foi a impressão física (Zebra, janela do navegador ou erro). */
function avisarImpressao(r, volume) {
  if (!r || r.via === 'nenhum') return;
  if (r.ok && r.via === 'zebra') {
    Efeitos.toast(`Ticket ${esc(volume.codigo)} impresso na <b>${esc(r.impressora)}</b>`, { icone: ic('impressora'), tipo: 'sucesso' });
    return;
  }
  if (r.ok) {   // janela de impressão (ou silenciosa, pelo atalho Abrir M-Utility)
    Efeitos.toast(`Ticket ${esc(volume.codigo)} enviado para a impressora`, { icone: ic('impressora'), tipo: 'sucesso' });
    return;
  }
  Efeitos.toast(`Não imprimiu o ${esc(volume.codigo)}: ${esc(r.erro || 'impressora indisponível')}`, { icone: ic('alerta'), tipo: 'alerta', duracao: 8000 });
  helpy.dizer(`<p>${ic('alerta')} O ticket <strong>${esc(volume.codigo)}</strong> foi salvo, mas <strong>não saiu na Zebra</strong>.</p><p>${esc(r.erro || '')}</p>`, {
    tipo: 'alerta', humor: 'alerta',
    acoes: [
      { rotulo: `${ic('impressora')} Tentar de novo`, destaque: true, fn: async () => avisarImpressao(await Impressao.imprimir(volume), volume) },
      { rotulo: `${ic('ferramenta')} Configurar impressora`, fn: () => document.getElementById('abrirImpressora')?.click() },
    ],
  });
}

async function voltarComTicket(volume, impressao = null) {
  destaque = Catalogo.saiu(volume) ? null : volume.numero;
  estado = novoEstado();
  await atualizar(true);
  irPara('mesa', 'dir', { falar: false });
  const onde = Catalogo.saiu(volume)
    // diz para ONDE a peça foi (Crossdocking, Devolução, GRIS…), com o artigo certo
    ? `Ele já saiu como <strong>${esc(volume.status_titulo)}</strong> e foi direto para ${/ção$|^devolu/i.test(volume.local_titulo || '') ? 'a' : 'o'} <strong>${esc(volume.local_titulo)}</strong>.`
    : `Ele está na mesa, no <strong>${esc(volume.local_titulo)}</strong>, com status <strong>${esc(volume.status_titulo)}</strong>.`;
  const lembrete = volume.tipo === 'sem-integracao' && !Catalogo.saiu(volume)
    ? `<p>${ic('relogio')} Prazo: até <strong>${new Date(new Date(volume.data_entrada).getTime() + Catalogo.PRAZO_DIAS * 86400000).toLocaleDateString('pt-BR')}</strong> para integrar, senão vira devolução.</p>` : '';
  helpy.dizer(`<p><strong>Peguei o ticket ${esc(volume.codigo)}!</strong> <i class="ic ic-check-circulo" aria-hidden="true"></i></p><p>${onde}</p>${lembrete}`, {
    humor: 'comemorando', tipo: 'sucesso',
  });
  if (volume.status === 'enviar-email') setTimeout(() => lembrarEmails([volume]), 400);
  avisarImpressao(impressao, volume);
}

// ---------- Dados: mesa, bandeja, placar ----------
async function atualizar(forcar = false) {
  const [rv, rc] = await Promise.all([API.volumes(), API.clientes()]);
  if (!rv.ok) {
    if (rv.status === 401) { Sessao.sair('expirou'); return; }
    mostrarOffline(elOffline);
    return;
  }
  elOffline.hidden = true;
  volumes = rv.dados.slice().reverse();
  clientes = rc.ok ? rc.dados : [];
  const nova = JSON.stringify(volumes.map((v) => [v.numero, v.status, v.atualizado_em, v.oculto_bandeja, v.cliente_cor]))
    + new Date().toDateString();
  if (!forcar && nova === assinatura) return;
  assinatura = nova;
  atualizarPlacar();
  preencherSaidas();
  if (etapaAtual === 'mesa') preencherMesa();
}

// Outra aba mexeu nos dados: atualiza na hora
addEventListener('storage', (e) => { if (e.key === Banco.CHAVE) atualizar(); });

// ---------- Ciclo do mês e a pasta dos arquivos ----------
/**
 * O mês virou? O administrador fecha o ciclo (gera a planilha e o backup do mês e o #ID volta ao #001).
 * Último dia do mês: lembrete. A pasta dos arquivos pede um clique depois que o navegador reabre.
 */
async function avisarCicloEPasta() {
  const r = await API.ciclo();
  if (!r.ok) return;
  const c = r.dados;
  const admin = usuario.perfil === 'admin';
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  if (c.pendente) {
    helpy.dizer(`<p>${ic('arquivo')} O mês virou! O ciclo de <strong>${esc(c.titulo)}</strong> ainda está aberto.</p>
      <p>${admin ? 'Feche o ciclo para salvar a planilha do mês e o #ID recomeçar do <strong>#001</strong>.' : 'Peça ao <strong>administrador</strong> para fechar o ciclo. Até lá, os volumes continuam na numeração do mês anterior.'}</p>`, {
      tipo: 'alerta', humor: 'alerta', segurar: true,
      acoes: admin ? [{ rotulo: `${ic('arquivo')} Fechar o ciclo de ${esc(c.titulo)}`, destaque: true, fn: () => { location.href = 'localizar.html?fechar=1'; } }, { rotulo: 'Depois', fn: () => {} }] : [],
    });
  } else if (admin && Catalogo.cicloDe(amanha) !== c.id) {
    helpy.dizer(`<p>${ic('calendario')} Hoje é o último dia de <strong>${esc(c.nome)}</strong>. No fim do expediente, feche o ciclo em <a href="localizar.html">Localizar</a>.</p>`, { humor: 'pensando' });
  }
  if (!window.Arquivos) return;
  const estado = await Arquivos.estado();
  if (estado === 'permitir') {
    helpy.dizer(`<p>${ic('pastas')} Para eu continuar salvando os arquivos do mês na pasta <strong>${esc(await Arquivos.nomePasta())}</strong>, o navegador pede uma permissão.</p>`, {
      humor: 'pensando',
      acoes: [{ rotulo: `${ic('check')} Permitir acesso à pasta`, destaque: true, fn: async () => {
        if (await Arquivos.permitir()) Efeitos.toast('Pronto: os arquivos do mês voltaram a ser salvos na pasta.', { icone: ic('check'), tipo: 'sucesso' });
      } }],
    });
  } else if (estado === 'sem-pasta' && admin) {
    helpy.dizer(`<p>${ic('pastas')} Ei, ainda não tem uma pasta pros arquivos do mês 📁 Escolhe uma lá em <a href="localizar.html">Localizar</a> que eu salvo a planilha e o backup sozinho a cada alteração 😉</p>`, { humor: 'pensando' });
  }
}

// ---------- Início ----------
(async () => {
  if (!usuario) return;
  Sessao.montarMenu(usuario);
  Impressao.montarConfiguracao();
  await atualizar(true);
  // Link direto para um volume (vindo do Histórico ou das Estatísticas): controle-nc.html#volume-12
  // #editar-12 já abre o ticket com a edição aberta
  const pedido = /^#(volume|editar)-(\d+)$/.exec(location.hash);
  if (pedido && volumes.some((v) => v.numero === Number(pedido[2]))) {
    history.replaceState(null, '', location.pathname);
    abrirVolume(Number(pedido[2]));
    if (pedido[1] === 'editar') alternarEdicao(true);
  } else {
    irPara('mesa');
  }
  setTimeout(avisarCicloEPasta, 2500);
  // Jeito de amigo: bom dia, almoço, saída, água e cochilo (nunca no meio de um cadastro)
  helpy.viver({ nome: esc(primeiroNome()), id: usuario?.id, podeFalar: () => etapaAtual === 'mesa' || etapaAtual === 'ver' || etapaAtual === 'bipagem' });
  setInterval(() => { if (!document.hidden) atualizar(); }, 5000);
  // A cada 30 minutos o Helpy volta a cobrar os e-mails pendentes
  setInterval(() => { if (etapaAtual === 'mesa' && !document.hidden && helpy.estado !== 'dormindo') lembrarEmails(); }, 30 * 60000);
  // 15 min depois do e-mail, e a cada 30 min: conferir os Aguardando entrega realizada
  setTimeout(() => setInterval(() => { if (etapaAtual === 'mesa' && !document.hidden && helpy.estado !== 'dormindo' && !lembrarIntegracao()) lembrarAguardando(); }, 30 * 60000), 15 * 60000);
})();

// AWB digitada ou bipada: assim que fica completa, vira o formato do M-Utility (TXAQ123456789tx)
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches?.('#campoAwb, #editAwb, .seq-awb')) return;
  if (!Catalogo.AWB.test(el.value.trim())) return;
  const certo = Catalogo.formatarAwb(el.value);
  if (el.value !== certo) { el.value = certo; if (el.id === 'campoAwb') estado.awb = certo; }
});

// ---------- Baixar a imagem (PNG) do ticket aberto ----------
async function baixarFotoTicket(botao) {
  const v = volumes.find((x) => x.numero === Number(botao.dataset.fotoTicket));
  const ticket = elPalco.querySelector('.nc-ver .ticket-palco .tk');
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
