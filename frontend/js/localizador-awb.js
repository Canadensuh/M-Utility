/* =========================================================
   localizador-awb.js — Localizador de AWB (utilitário do M-Utility)
   1) Cliente   — por enquanto só o PET LOVE.
   2) Modo      — por LOTE (AWB + nº do lote) ou PARCIAL / INTEGRAL.
   3) Importar  — cola as colunas da planilha; as AWBs válidas vão
                  para a lista de "AWBs importadas".
   4) Scan      — bipa as peças. Por lote: ENCONTRADO (verde) com o lote.
                  Parcial/integral: INTEGRAL (azul) ou PARCIAL (laranja).
                  Também: JÁ BIPADO (exclamação vermelha), NÃO ENCONTRADO
                  (amarelo) e INVÁLIDO (vermelho), cada um com o seu som.
   A separação em andamento fica guardada neste navegador: recarregar
   a página não perde a lista.
   ========================================================= */

const usuario = Sessao.exigir(['usuario', 'admin']);
const esc = TicketUI.esc;
const elPalco = document.getElementById('awbPalco');
const elPassos = document.getElementById('awbPassos');
const elAcao = document.getElementById('awbAcao');

// Helpy BOT e o escritoriozinho dele (mesma lateral do Controle NC)
document.getElementById('helpyAvatar').outerHTML = Helpy.avatar('acenando');
const helpy = new Helpy(document.getElementById('helpyRaiz'), document.getElementById('helpyFeed'), { balao: true });
const escritorio = Escritorio.montar();
const apelido = () => esc(Helpy.apelido(usuario?.nome));

const CHAVE = 'mutility-awb-separacao';
const CHAVE_SOM = 'mutility-awb-som';

/* Clientes com separação disponível. A cor e o CNPJ vêm do cadastro de Clientes. */
const CLIENTES_AWB = [{ nome: 'PET LOVE', chave: 'petlove' }];

const MODOS = {
  lote: { titulo: 'Por lote', desc: 'Cada AWB vem com o número do lote dela, como 15-390', ic: 'etiqueta', selo: 'AWB + LOTE' },
  parcial: { titulo: 'Parcial e integral', desc: 'Duas listas de AWBs: as integrais e as parciais', ic: 'pacote', selo: 'INTEGRAL · PARCIAL' },
};
const PASSOS = [
  { id: 'cliente', rotulo: 'Cliente' },
  { id: 'modo', rotulo: 'Separação' },
  { id: 'importar', rotulo: 'Importar' },
  { id: 'scan', rotulo: 'Scan' },
];
const ORDEM = PASSOS.map((p) => p.id);

/* ---------- AWB ---------- */
/** TXA + 1 letra + 9 números + tx. Bipado em maiúsculas ou minúsculas, mostrado sempre como TXAQ123456789tx. */
const AWB = /^TXA[A-Z]\d{9}TX$/i;
const limparCodigo = (t) => String(t ?? '').trim().replace(/\s+/g, '');
const ehAwb = (t) => AWB.test(limparCodigo(t));
const formatar = (t) => Catalogo.formatarAwb(limparCodigo(t));
const chaveAwb = (t) => limparCodigo(t).toUpperCase();
const linhas = (texto) => String(texto ?? '').replace(/\r/g, '').split('\n');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- Estado (guardado no navegador) ---------- */
function novoEstado() {
  return { etapa: 'cliente', cliente: '', modo: '', itens: [], leituras: [], rascunho: { a: '', b: '' }, iniciado_em: '' };
}
let estado = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (s && Array.isArray(s.itens)) return { ...novoEstado(), ...s };
  } catch { /* começa do zero */ }
  return novoEstado();
})();
function guardar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* sem espaço: segue só na memória */ }
}
let somLigado = (() => { try { return localStorage.getItem(CHAVE_SOM) !== 'nao'; } catch { return true; } })();
let clientes = [];

const indice = () => new Map(estado.itens.map((it, i) => [chaveAwb(it.awb), i]));
const encontrados = () => estado.itens.filter((it) => it.achado).length;

/* ---------- Sons (arquivos em assets/sons) ---------- */
const SONS = {
  encontrado: 'assets/sons/encontrado.mp3',          // também INTEGRAL e PARCIAL
  'ja-bipado': 'assets/sons/ja-bipado.mp3',
  'nao-encontrado': 'assets/sons/nao-encontrado.mp3',
  invalido: 'assets/sons/invalido.mp3',
};
const audios = {};
function tocar(tipo) {
  if (!somLigado || !SONS[tipo]) return;
  try {
    audios[tipo] = audios[tipo] || Object.assign(new Audio(SONS[tipo]), { preload: 'auto' });
    // um clone por leitura: bipando rápido, um som não corta o outro
    const som = audios[tipo].cloneNode();
    som.play().catch(() => { /* navegador bloqueou o som: segue só com o aviso na tela */ });
  } catch { /* sem áudio */ }
}
// já deixa os sons carregados
Object.keys(SONS).forEach((t) => { try { audios[t] = Object.assign(new Audio(SONS[t]), { preload: 'auto' }); } catch { /* */ } });

const teclaSom = () => `<button type="button" class="btn key--icon ${somLigado ? '' : 'desligado'}" data-som aria-pressed="${somLigado}"
  title="${somLigado ? 'Som da leitura ligado (clique para desligar)' : 'Som da leitura desligado (clique para ligar)'}" aria-label="Som da leitura">${ic(somLigado ? 'som' : 'mudo')}</button>`;

/* ---------- Navegação entre as etapas ---------- */
function irPara(etapa, { falar = true } = {}) {
  const direcao = ORDEM.indexOf(etapa) < ORDEM.indexOf(estado.etapa) ? 'esq' : 'dir';
  estado.etapa = etapa;
  guardar();
  helpy.calar();
  renderizar(direcao);
  if (falar) falarSobre(etapa);
}

/** Botões da etapa, como no Inserir volume: Voltar no canto esquerdo, Cancelar no direito. */
function renderizarBarra() {
  const esq = [];
  const dir = [];
  const anterior = ORDEM[ORDEM.indexOf(estado.etapa) - 1];
  if (anterior) esq.push('<button type="button" class="btn btn-voltar" data-voltar>← Voltar</button>');
  if (estado.etapa === 'scan') esq.push(`<button type="button" class="btn" data-ir="importar">${ic('mais')} Importar mais</button>`);
  if (estado.etapa === 'importar' && estado.itens.length) {
    dir.push(`<button type="button" class="btn btn-primary" data-ir="scan">${ic('codigo-barras')} Ir para o SCAN <span aria-hidden="true">→</span></button>`);
  }
  if (estado.etapa === 'scan' || estado.etapa === 'importar') dir.push(teclaSom());
  if (estado.cliente) dir.push(`<button type="button" class="btn key--rosa" data-cancelar>${ic('x')} Cancelar</button>`);
  elAcao.innerHTML = `<div class="acao-lado">${esq.join('')}</div><div class="acao-lado acao-dir">${dir.join('')}</div>`;
}

/** Placar da lateral: importadas, encontradas e faltam. Também pinta a lista das importadas. */
function atualizarPlacar(ultima = null) {
  const total = estado.itens.length;
  const achadas = encontrados();
  document.getElementById('awbTotal').textContent = total;
  document.getElementById('awbAchadas').textContent = achadas;
  document.getElementById('awbFaltam').textContent = total - achadas;
  pintarListas(ultima);
}

/* ---------- Lista das importadas ----------
   No Importar ela fica na lateral (entre o placar e o Helpy).
   No Scan ela fica na mesa, embaixo do leitor; clicando, abre o pop-up maior. */
const elLateral = document.getElementById('awbLateral');
function listaHtml(ultima = null) {
  const n = estado.itens.length;
  const k = ultima ? chaveAwb(ultima) : '';
  return `
    <header class="awb-lat-cab">
      <span class="awb-lat-titulo">${ic('documento')} AWBs importadas</span>
      <span class="awb-qtd">${n}</span>
      ${n ? `<span class="btn key--icon awb-lat-abrir" title="Abrir a lista maior" aria-hidden="true">${ic('olho')}</span>` : ''}
    </header>
    <div class="awb-lat-corpo">
      ${n ? `<table class="awb-lat-tabela">
        <thead><tr><th>#</th><th>AWB</th><th>${estado.modo === 'lote' ? 'Lote' : 'Tipo'}</th><th aria-label="Situação"></th></tr></thead>
        <tbody>${estado.itens.map((it, i) => `<tr class="${it.achado ? 'achada' : ''} ${k && chaveAwb(it.awb) === k ? 'ultima' : ''}">
          <td>${i + 1}</td><td class="awb-mono">${esc(it.awb)}</td><td>${marcaDe(it)}</td>
          <td>${it.achado ? `<span class="awb-lat-ok" title="Encontrada">${ic('check')}</span>` : '<span class="awb-lat-falta" title="Falta"></span>'}</td></tr>`).join('')}
        </tbody></table>`
      : '<p class="awb-lat-vazia">As AWBs importadas aparecem aqui 📋</p>'}
    </div>`;
}
function pintarLista(el, ultima) {
  el.innerHTML = listaHtml(ultima);
  // a última bipada fica à vista na lista
  const linha = el.querySelector('tr.ultima');
  if (linha) {
    const caixa = el.querySelector('.awb-lat-corpo');
    caixa.scrollTop = linha.offsetTop - caixa.clientHeight / 2 + linha.offsetHeight / 2;
  }
}
function pintarListas(ultima = null) {
  const naLateral = estado.etapa === 'importar';
  elLateral.hidden = !naLateral;
  if (naLateral) pintarLista(elLateral, ultima);
  const naMesa = document.getElementById('awbListaMesa');
  if (naMesa) pintarLista(naMesa, ultima);
}
/** A lista inteira é um botão: clicando (ou Enter), abre o pop-up maior. */
function ligarCliqueLista(el) {
  el.addEventListener('click', () => { if (estado.itens.length) abrirLista(); });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && estado.itens.length) { e.preventDefault(); abrirLista(); } });
}
ligarCliqueLista(elLateral);

/* ---------- Placar: clicando, abre o detalhe no mesmo visual do SCORE ---------- */
function abrirPlacar() {
  const itens = estado.itens;
  const conta = (lista) => ({ total: lista.length, achadas: lista.filter((it) => it.achado).length });
  const leituras = estado.leituras;
  const lidas = (res) => leituras.filter((l) => l.resultado === res).length;
  const item = (valor, rotulo, classe = '') => `<div class="score-item ${classe}"><span class="score-valor">${valor}</span><span class="score-rotulo">${rotulo}</span></div>`;
  const painel = (titulo, c, classe = '') => `
    <div class="score awb-placar-painel ${classe}">
      <span class="score-titulo">${titulo}</span>
      ${item(c.total, 'importadas')}${item(c.achadas, 'encontradas', 'score-destaque')}${item(c.total - c.achadas, 'faltam')}
    </div>`;
  const d = document.createElement('dialog');
  d.className = 'modal awb-modal-placar';
  d.innerHTML = `
    <div class="modal-conteudo">
      <header class="awb-placar-topo">
        <span class="awb-placar-sub">${estado.cliente ? `${esc(estado.cliente)} · ${estado.modo ? MODOS[estado.modo].titulo : 'sem modo ainda'}` : 'Nenhuma separação começada'}</span>
        <button type="button" class="btn key--icon" data-fechar aria-label="Fechar" title="Fechar">${ic('x')}</button>
      </header>
      ${painel('Separação', conta(itens))}
      ${estado.modo === 'parcial' ? painel('Integral', conta(itens.filter((it) => it.tipo === 'integral')), 'integral') + painel('Parcial', conta(itens.filter((it) => it.tipo === 'parcial')), 'parcial') : ''}
      <div class="score awb-placar-painel leituras">
        <span class="score-titulo">Leituras</span>
        ${item(leituras.length, 'bipadas')}${item(leituras.filter((l) => l.jaBipado).length, 'já bipadas', 'cheio')}${item(lidas('nao-encontrado'), 'não encontradas', 'nao')}${item(lidas('invalido'), 'inválidas', 'cheio')}
      </div>
    </div>`;
  d.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]') || e.target === d) d.close(); });
  d.addEventListener('close', () => { d.remove(); document.getElementById('awbEntrada')?.focus(); });
  document.body.appendChild(d);
  d.showModal();
}
const elScore = document.getElementById('awbScore');
elScore.addEventListener('click', abrirPlacar);
elScore.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPlacar(); } });

function renderizarPassos() {
  const i = ORDEM.indexOf(estado.etapa);
  elPassos.innerHTML = PASSOS.map((p, n) => {
    const classe = n < i ? 'feito' : n === i ? 'atual' : '';
    return `<li class="passo-topo ${classe}"><button type="button" data-ir="${p.id}" ${n < i ? '' : 'disabled'}>
      <span class="passo-bolinha">${n < i ? ic('check') : n + 1}</span><span class="passo-rotulo">${p.rotulo}</span></button></li>`;
  }).join('');
}
elPassos.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]');
  if (b && !b.disabled) irPara(b.dataset.ir);
});

const RENDER = { cliente: telaCliente, modo: telaModo, importar: telaImportar, scan: telaScan };
const LIGAR = { importar: ligarImportar, scan: ligarScan };

function renderizar(direcao = 'dir') {
  renderizarPassos();
  renderizarBarra();
  atualizarPlacar();
  // Cliente e Separação usam a mesa padrão; Importar e Scan, a mesa escura
  document.body.classList.toggle('awb-escuro', estado.etapa === 'importar' || estado.etapa === 'scan');
  elPalco.className = `palco awb-palco awb-modo-${estado.modo || 'nenhum'}`;
  elPalco.innerHTML = `<section class="etapa-tela etapa-${estado.etapa} entra-${direcao}">${RENDER[estado.etapa]()}</section>`;
  elPalco.scrollTop = 0;
  LIGAR[estado.etapa]?.();
}

/* ---------- Helpy BOT: o que ele fala em cada etapa ---------- */
function falarSobre(etapa) {
  const n = estado.itens.length;
  if (etapa === 'cliente') {
    helpy.dizer(`<p>${helpy.oi(apelido())}</p><p>Bora separar umas peças? 📦 Escolhe o cliente aí que eu te ajudo a achar cada AWB.</p>`, { humor: 'acenando' });
  } else if (etapa === 'modo') {
    helpy.dizer(`<p>Beleza, <strong>${esc(estado.cliente)}</strong>! 🐾</p><p>Vai separar <strong>por lote</strong> ou dividindo em <strong>parcial e integral</strong>?</p>`, { humor: 'pensando' });
  } else if (etapa === 'importar') {
    helpy.dizer(estado.modo === 'lote'
      ? '<p>Copia a coluna das <strong>AWBs</strong> da planilha e cola no primeiro campo, depois a coluna dos <strong>lotes</strong> no segundo 📋</p><p>A linha 1 de um casa com a linha 1 do outro, eu confiro tudo pra você 😉</p>'
      : '<p>Cola as AWBs <strong>integrais</strong> no primeiro campo e as <strong>parciais</strong> no segundo 📋</p><p>Se alguma estiver nas duas listas, eu te aviso 😉</p>', { humor: 'piscando' });
  } else if (etapa === 'scan') {
    const faltam = n - encontrados();
    helpy.dizer(faltam
      ? `<p>Pode bipar! 🔫 ${faltam === n ? `São <strong>${n}</strong> AWBs na lista.` : `Faltam <strong>${faltam}</strong> de ${n}.`}</p><p>${estado.modo === 'lote' ? 'Achou, eu mostro o lote em verde' : 'Achou, eu mostro se é <strong>INTEGRAL</strong> ou <strong>PARCIAL</strong>'}. Amarelo não tá na lista e vermelho nem é AWB 😄</p>`
      : `<p>Todas as <strong>${n}</strong> AWBs já foram encontradas! 🎉</p>`, { humor: faltam ? 'feliz' : 'comemorando' });
  }
}

/** Comentários do Helpy durante o Scan (só nos momentos que valem: metade, fim e leitor errando). */
let invalidosSeguidos = 0;
function comentarLeitura(r) {
  invalidosSeguidos = r.resultado === 'invalido' ? invalidosSeguidos + 1 : 0;
  const total = estado.itens.length;
  const achadas = encontrados();
  if (r.resultado === 'encontrado' && !r.jaBipado) {
    if (achadas === total) {
      helpy.dizer(`<p>Acabou! 🎉 Todas as <strong>${total}</strong> AWBs foram encontradas.</p><p>Mandou muito bem, ${apelido()}! 💪</p>`, {
        humor: 'comemorando', tipo: 'sucesso',
        acoes: [{ rotulo: `${ic('atualizar')} Nova separação`, destaque: true, fn: () => cancelarSeparacao({ perguntar: false }) }],
      });
      setTimeout(() => Efeitos.confete(document.querySelector('.helpy-avatar:not(.skin-mini .helpy-avatar)'), 50), 300);
    } else if (total >= 6 && achadas === Math.ceil(total / 2)) {
      helpy.dizer(`Metade já foi! 🙌 Faltam <strong>${total - achadas}</strong>.`, { humor: 'comemorando', atraso: 200 });
    }
  } else if (invalidosSeguidos === 3) {
    helpy.dizer('Ih, 3 inválidos seguidos 🤨 Será que o leitor tá pegando o código de barras errado da etiqueta?', { humor: 'desconfiado', atraso: 200 });
  }
}

/* ---------- 1) Cliente ---------- */
const chaveNome = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const dadosCliente = (c) => clientes.find((x) => chaveNome(x.nome) === c.chave) || null;

/** O cartão do cliente é o mesmo da aba Clientes (faixa e inicial na cor dele), só que maior. */
function telaCliente() {
  return `
    <div class="etapa-cabeca">
      <span class="saudacao"><span class="mao">${ic('aceno')}</span> Olá, ${apelido()}!</span>
      <h1>De qual <span class="acento">cliente</span> é a separação?</h1>
      <p>Escolha o cliente. Depois eu pergunto como as peças vão ser separadas.</p>
    </div>
    <div class="awb-clientes">
      ${CLIENTES_AWB.map((c, i) => {
        const d = dadosCliente(c);
        const cor = d?.cor || '#7FB069';
        const nome = d?.nome || c.nome;
        // Galpão: o cliente é uma caixa de papelão com fita e a etiqueta de envio
        return `<button type="button" class="awb-caixa" data-cliente="${esc(c.nome)}" title="Começar a separação do ${esc(nome)}" style="--cor:${esc(cor)};--cor-tinta:${Catalogo.tintaPara(cor)};--i:${i}">
          <span class="awb-caixa-fita" aria-hidden="true"></span>
          <span class="awb-caixa-carimbo" aria-hidden="true">↑↑ ESTE LADO PARA CIMA</span>
          <span class="awb-etiqueta">
            <span class="awb-etiqueta-topo"><small>DESTINATÁRIO</small><span class="awb-etiqueta-cor" aria-hidden="true">${esc(nome.trim().charAt(0).toUpperCase())}</span></span>
            <strong>${esc(nome)}</strong>
            <span class="tk-mono">${d?.cnpj ? `CNPJ ${esc(Catalogo.formatarCnpj(d.cnpj))}` : 'Cliente do Localizador de AWB'}</span>
            <span class="awb-barras" aria-hidden="true"></span>
          </span>
        </button>`;
      }).join('')}
    </div>`;
}

/* ---------- 2) Modo ---------- */
function telaModo() {
  return `
    <div class="etapa-cabeca">
      <span class="awb-chip">${ic('predio')} ${esc(estado.cliente)}</span>
      <h1>Separar <span class="acento">como</span>?</h1>
      <p>Por lote, ou dividindo as AWBs em parcial e integral.</p>
    </div>
    <div class="awb-cartoes">
      ${Object.entries(MODOS).map(([id, m], i) => `
        <button type="button" class="awb-placa awb-placa-${id} ${estado.modo === id ? 'selecionado' : ''}" data-modo="${id}" style="--i:${i}">
          <span class="awb-placa-corrente" aria-hidden="true"></span>
          <span class="awb-placa-corpo">
            <span class="awb-placa-doca">DOCA ${String.fromCharCode(65 + i)}</span>
            <span class="awb-placa-ico">${ic(m.ic)}</span>
            <strong>${m.titulo}</strong>
            <span class="awb-placa-desc">${m.desc}</span>
            <span class="awb-modo-selo">${id === 'parcial' ? '<b class="i">INTEGRAL</b><b class="p">PARCIAL</b>' : '<b>AWB</b><b>LOTE</b>'}</span>
          </span>
        </button>`).join('')}
    </div>`;
}

/* ---------- 3) Importar ---------- */
function rotulosColunas() {
  return estado.modo === 'lote'
    ? { a: 'AWB', b: 'LOTE', dicaA: 'Cole aqui a coluna das AWBs', dicaB: 'Cole aqui a coluna dos lotes' }
    : { a: 'INTEGRAL', b: 'PARCIAL', dicaA: 'Cole aqui as AWBs integrais', dicaB: 'Cole aqui as AWBs parciais' };
}

/**
 * Lê as colunas coladas. Por lote: a linha N da AWB casa com a linha N do lote
 * (se colar as duas colunas juntas no campo da AWB, eu separo pelo TAB).
 * Parcial/integral: cada campo é uma lista de AWBs.
 */
function analisar(a, b) {
  const linhasA = linhas(a);
  const linhasB = linhas(b);
  const ja = indice();
  const vistas = new Map();
  const linhasOk = [];
  const problemas = [];
  const pegar = (codigo, extra, origem, n) => {
    const bruto = limparCodigo(codigo);
    if (!bruto) return;
    if (!ehAwb(bruto)) { problemas.push({ n, origem, codigo: bruto, motivo: 'não é uma AWB' }); return; }
    const k = chaveAwb(bruto);
    if (vistas.has(k)) {
      const antes = vistas.get(k);
      const onde = antes.origem === origem ? `linha ${antes.n}` : `${antes.origem} linha ${antes.n}`;
      problemas.push({ n, origem, codigo: formatar(bruto), motivo: `repetida (já está em ${onde})` });
      return;
    }
    vistas.set(k, { n, origem });
    linhasOk.push({ awb: formatar(bruto), ...extra, atualiza: ja.has(k) });
  };
  if (estado.modo === 'lote') {
    const total = Math.max(linhasA.length, linhasB.length);
    for (let i = 0; i < total; i += 1) {
      const [codigo, loteJunto] = String(linhasA[i] ?? '').split('\t');
      const lote = String(loteJunto ?? linhasB[i] ?? '').trim();
      if (!limparCodigo(codigo) && lote) { problemas.push({ n: i + 1, origem: 'LOTE', codigo: lote, motivo: 'lote sem AWB na mesma linha' }); continue; }
      pegar(codigo, { lote }, 'AWB', i + 1);
    }
  } else {
    linhasA.forEach((c, i) => pegar(c.split('\t')[0], { tipo: 'integral' }, 'INTEGRAL', i + 1));
    linhasB.forEach((c, i) => pegar(c.split('\t')[0], { tipo: 'parcial' }, 'PARCIAL', i + 1));
  }
  const qtdA = linhasA.filter((l) => l.trim()).length;
  const qtdB = linhasB.filter((l) => l.trim()).length;
  return { linhasOk, problemas, qtdA, qtdB };
}

/**
 * Importar: uma prancheta com a planilha (duas colunas lado a lado).
 * Importar e o X de limpar ficam no canto direito, em cima. As duas colunas
 * rolam juntas e têm sempre a mesma altura: a linha 1 de um lado fica
 * sempre na frente da linha 1 do outro. As importadas aparecem na lateral.
 */
function telaImportar() {
  const r = rotulosColunas();
  return `
    <div class="awb-importar">
      <section class="awb-folha awb-prancheta" aria-label="Colar da planilha">
        <span class="awb-prendedor" aria-hidden="true"></span>
        <div class="awb-prancheta-topo">
          <button type="button" class="btn btn-primary" id="importar" disabled>${ic('download')} Importar</button>
          <button type="button" class="btn key--icon" id="limparColar" title="Limpar os dois campos" aria-label="Limpar os dois campos" disabled>${ic('x')}</button>
        </div>
        <div class="awb-colunas">
          <div class="awb-colunas-cab">
            <label for="colA" class="awb-coluna-cab awb-col-a"><b>${r.a}</b><small id="qtdA"></small></label>
            <label for="colB" class="awb-coluna-cab awb-col-b"><b>${r.b}</b><small id="qtdB"></small></label>
          </div>
          <div class="awb-colunas-corpo" id="awbCorpo">
            <textarea id="colA" class="awb-texto awb-col-a" spellcheck="false" autocomplete="off" wrap="off" placeholder="${r.dicaA}">${esc(estado.rascunho?.a || '')}</textarea>
            <textarea id="colB" class="awb-texto awb-col-b" spellcheck="false" autocomplete="off" wrap="off" placeholder="${r.dicaB}">${esc(estado.rascunho?.b || '')}</textarea>
          </div>
        </div>
        <footer class="awb-folha-rodape">
          <div class="awb-analise" id="awbAnalise" aria-live="polite"></div>
        </footer>
      </section>
    </div>`;
}

const seloTipo = (tipo) => `<span class="awb-selo awb-selo-${tipo}">${tipo === 'parcial' ? 'PARCIAL' : 'INTEGRAL'}</span>`;
const marcaDe = (it) => (estado.modo === 'lote' ? `<span class="awb-lote">${esc(it.lote || '—')}</span>` : seloTipo(it.tipo));

function ligarImportar() {
  const colA = document.getElementById('colA');
  const colB = document.getElementById('colB');
  const elAnalise = document.getElementById('awbAnalise');
  const botao = document.getElementById('importar');
  const limpar = document.getElementById('limparColar');
  let analise = null;

  const atualizar = () => {
    estado.rascunho = { a: colA.value, b: colB.value };
    guardar();
    analise = analisar(colA.value, colB.value);
    const { linhasOk, problemas, qtdA, qtdB } = analise;
    document.getElementById('qtdA').textContent = qtdA ? plural(qtdA, 'linha', 'linhas') : '';
    document.getElementById('qtdB').textContent = qtdB ? plural(qtdB, 'linha', 'linhas') : '';
    limpar.disabled = !colA.value && !colB.value;
    botao.disabled = !linhasOk.length;
    botao.innerHTML = `${ic('download')} Importar${linhasOk.length ? ` ${linhasOk.length}` : ''}`;
    if (!qtdA && !qtdB) {
      elAnalise.innerHTML = `<span class="awb-dica">${ic('copiar')} ${estado.modo === 'lote' ? 'Cole a coluna das AWBs e a coluna dos lotes' : 'Cole as AWBs integrais e as parciais'}</span>`;
      return;
    }
    const aviso = estado.modo === 'lote' && qtdA && qtdB && qtdA !== qtdB
      ? `<span class="awb-pilula alerta">${ic('alerta')} ${qtdA} AWBs × ${qtdB} lotes</span>`
      : estado.modo === 'lote' && qtdA && !qtdB && !colA.value.includes('\t')
        ? `<span class="awb-pilula alerta">${ic('alerta')} Falta a coluna dos lotes</span>` : '';
    elAnalise.innerHTML = `
      <span class="awb-pilula ok">${ic('check')} ${plural(linhasOk.length, 'válida', 'válidas')}</span>
      ${aviso}
      ${problemas.length ? `<details class="awb-problemas"><summary class="awb-pilula erro">${ic('x')} ${problemas.length} com problema</summary>
        <ul>${problemas.slice(0, 12).map((p) => `<li><b>${p.origem} · linha ${p.n}</b> <code>${esc(p.codigo.slice(0, 30))}</code> ${esc(p.motivo)}</li>`).join('')}
        ${problemas.length > 12 ? `<li>e mais ${problemas.length - 12}…</li>` : ''}</ul></details>` : ''}`;
  };
  // Já no campo, toda AWB fica no formato TXAQ123456789tx (bipada como txaq123456789TX também).
  // O tamanho do texto não muda, então o cursor fica onde estava.
  const padronizar = (campo) => {
    const novo = campo.value.replace(/TXA[A-Z]\d{9}TX/gi, (m) => Catalogo.formatarAwb(m));
    if (novo === campo.value) return;
    const { selectionStart: ini, selectionEnd: fim } = campo;
    campo.value = novo;
    campo.setSelectionRange(ini, fim);
  };
  // As duas colunas têm sempre a mesma altura (a do lado com mais linhas) e
  // quem rola é a folha: assim as linhas dos dois lados nunca saem do lugar.
  const corpo = document.getElementById('awbCorpo');
  const igualar = (campo) => {
    const topo = corpo.scrollTop;
    colA.style.height = colB.style.height = '0px';
    const h = Math.max(colA.scrollHeight, colB.scrollHeight, corpo.clientHeight);
    colA.style.height = colB.style.height = `${h}px`;
    corpo.scrollTop = topo;
    if (!campo) return;
    // a linha onde está o cursor fica sempre à vista
    const estilo = getComputedStyle(campo);
    const altLinha = parseFloat(estilo.lineHeight) || 23;
    const linha = campo.value.slice(0, campo.selectionStart).split('\n').length - 1;
    const y = parseFloat(estilo.paddingTop) + linha * altLinha;
    if (y < corpo.scrollTop) corpo.scrollTop = y;
    else if (y + altLinha > corpo.scrollTop + corpo.clientHeight) corpo.scrollTop = y + altLinha * 2 - corpo.clientHeight;
  };
  colA.addEventListener('input', () => { padronizar(colA); atualizar(); igualar(colA); });
  colB.addEventListener('input', () => { if (estado.modo !== 'lote') padronizar(colB); atualizar(); igualar(colB); });
  ['keyup', 'click'].forEach((ev) => { colA.addEventListener(ev, () => igualar(colA)); colB.addEventListener(ev, () => igualar(colB)); });
  padronizar(colA);
  if (estado.modo !== 'lote') padronizar(colB);
  atualizar();
  igualar();
  new ResizeObserver(() => igualar()).observe(corpo);
  (colA.value ? colB : colA).focus({ preventScroll: true });

  limpar.addEventListener('click', () => {
    colA.value = ''; colB.value = '';
    atualizar();
    igualar();
    colA.focus();
  });

  botao.addEventListener('click', () => {
    if (!analise?.linhasOk.length) return;
    const mapa = indice();
    let novas = 0;
    let atualizadas = 0;
    for (const l of analise.linhasOk) {
      const k = chaveAwb(l.awb);
      const item = { awb: l.awb, ...(estado.modo === 'lote' ? { lote: l.lote } : { tipo: l.tipo }), achado: null, vezes: 0 };
      if (mapa.has(k)) { const atual = estado.itens[mapa.get(k)]; Object.assign(atual, { ...item, achado: atual.achado, vezes: atual.vezes }); atualizadas += 1; }
      else { estado.itens.push(item); mapa.set(k, estado.itens.length - 1); novas += 1; }
    }
    if (!estado.iniciado_em) estado.iniciado_em = new Date().toISOString();
    estado.rascunho = { a: '', b: '' };
    guardar();
    API.registrarAcao('Importou AWBs no Localizador', estado.cliente, `${novas} nova(s)${atualizadas ? `, ${atualizadas} atualizada(s)` : ''} · ${MODOS[estado.modo].titulo}`);
    Efeitos.toast(`${plural(novas, 'AWB importada', 'AWBs importadas')}${atualizadas ? ` · ${atualizadas} atualizada${atualizadas === 1 ? '' : 's'}` : ''}`, { icone: ic('check'), tipo: 'sucesso' });
    const ficaram = analise.problemas.length;
    renderizar();
    helpy.calar();
    helpy.dizer(`<p>Prontinho! Importei <strong>${novas}</strong> AWB${novas === 1 ? '' : 's'}${atualizadas ? ` e atualizei <strong>${atualizadas}</strong>` : ''} 📥</p>
      ${ficaram ? `<p>${ficaram} linha${ficaram === 1 ? '' : 's'} com problema ${ficaram === 1 ? 'ficou' : 'ficaram'} de fora, dá uma conferida 👀</p>` : ''}
      <p>Agora são <strong>${estado.itens.length}</strong> na lista. Quando terminar de colar, bora pro SCAN!</p>`, {
      humor: ficaram ? 'pensando' : 'comemorando',
      acoes: [{ rotulo: `${ic('codigo-barras')} Ir para o SCAN`, destaque: true, fn: () => irPara('scan') }],
    });
  });
}

/* ---------- Lista (pop-up): AWBs importadas, filtro e leituras ---------- */
let filtroLista = 'todas';
function abrirLista() {
  const d = document.createElement('dialog');
  d.className = 'modal awb-modal-lista';
  const pintar = () => {
    const n = estado.itens.length;
    const achadas = encontrados();
    const itens = estado.itens.map((it, i) => ({ it, i })).filter(({ it }) => (filtroLista === 'faltam' ? !it.achado : filtroLista === 'achadas' ? it.achado : true));
    d.innerHTML = `
      <div class="modal-conteudo">
        <header class="modal-topo">
          <h2>${ic('documento')} AWBs importadas</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-fechar aria-label="Fechar">${ic('x')}</button>
        </header>
        <div class="awb-lista-barra">
          <div class="abas awb-filtro" role="tablist">
            ${[['todas', `Todas · ${n}`], ['faltam', `Faltam · ${n - achadas}`], ['achadas', `Encontradas · ${achadas}`]].map(([id, r]) => `<button type="button" class="btn btn-sm aba ${filtroLista === id ? 'ativo' : ''}" data-filtro="${id}" role="tab" aria-selected="${filtroLista === id}">${r}</button>`).join('')}
          </div>
          ${n ? `<button type="button" class="btn btn-sm key--red" data-esvaziar>${ic('x')} Esvaziar</button>` : ''}
        </div>
        <div class="awb-tabela-caixa">
          ${itens.length ? `<table class="awb-tabela">
            <thead><tr><th>#</th><th>AWB</th><th>${estado.modo === 'lote' ? 'Lote' : 'Tipo'}</th><th>Situação</th><th></th></tr></thead>
            <tbody>${itens.map(({ it, i }) => `<tr class="${it.achado ? 'achada' : ''}">
              <td>${i + 1}</td><td class="awb-mono">${esc(it.awb)}</td><td>${marcaDe(it)}</td>
              <td>${it.achado ? `<span class="awb-situacao ok">${ic('check')} Encontrada${it.vezes > 1 ? ` · ${it.vezes}×` : ''}</span>` : '<span class="awb-situacao">Falta</span>'}</td>
              <td><button type="button" class="awb-tirar" data-tirar="${i}" aria-label="Tirar ${esc(it.awb)} da lista">${ic('x')}</button></td></tr>`).join('')}
            </tbody></table>`
          : `<p class="awb-lista-vazia">${filtroLista === 'faltam' && n ? '🎉 Todas encontradas!' : 'Nada por aqui.'}</p>`}
        </div>
      </div>`;
  };
  d.addEventListener('click', async (e) => {
    const alvo = (s) => e.target.closest(s);
    if (alvo('[data-fechar]') || e.target === d) { d.close(); return; }
    if (alvo('[data-filtro]')) { filtroLista = alvo('[data-filtro]').dataset.filtro; pintar(); return; }
    if (alvo('[data-tirar]')) {
      estado.itens.splice(Number(alvo('[data-tirar]').dataset.tirar), 1);
      guardar(); pintar(); atualizarTudo();
      return;
    }
    if (alvo('[data-esvaziar]')) {
      if (!await perguntar({ titulo: 'Esvaziar a lista?', texto: `As <b>${estado.itens.length}</b> AWBs importadas e as leituras saem da lista.`, sim: 'Esvaziar', perigo: true })) return;
      estado.itens = []; estado.leituras = [];
      guardar(); pintar(); atualizarTudo();
    }
  });
  d.addEventListener('close', () => { d.remove(); document.getElementById('awbEntrada')?.focus(); });
  pintar();
  document.body.appendChild(d);
  d.showModal();
}
/** Depois de mexer na lista pelo pop-up: placar, barra e a etapa aberta. */
function atualizarTudo() {
  atualizarPlacar();
  renderizarBarra();
  if (estado.etapa === 'scan') atualizarScan(null);
}

/* ---------- 4) Scan ---------- */
/**
 * Scan: a mesa dividida em duas.
 *  ESQUERDA: as esteiras, que vêm lá do topo da mesa e descem até embaixo.
 *    Cada AWB bipada vira uma caixinha que cai no começo da esteira dela:
 *    NÃO ENCONTRADO (em L, vira para a esquerda até a porta amarela),
 *    INTEGRAL e PARCIAL (retas, somem na porta lá embaixo) e
 *    INVÁLIDO (em L, vira para a direita e cai no lixo).
 *    Por lote: no lugar de INTEGRAL e PARCIAL, uma esteira ENCONTRADO.
 *  DIREITA: o leitor, o aviso da última leitura e a lista das importadas
 *    (clicando na lista, ela abre maior num pop-up).
 */
function telaScan() {
  return `
    <div class="awb-scan">
      <div class="awb-scan-esq">
        <div class="awb-cena" id="awbCena">${cenaHtml()}</div>
      </div>
      <div class="awb-scan-dir">
        <div class="nc-leitor awb-leitor" id="awbLeitor">
          <span class="nc-leitor-luz" aria-hidden="true"></span>
          <span class="visor-rotulo">Bipe a AWB · ${esc(estado.cliente)} · ${MODOS[estado.modo].titulo}</span>
          <input id="awbEntrada" class="nc-leitor-input" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Bipe ou digite aqui" aria-describedby="awbResultado" />
        </div>
        <div class="awb-resultado" id="awbResultado" role="status" aria-live="assertive">${resultadoHtml(estado.leituras[0] || null, false)}</div>
        <section class="awb-lateral awb-lista-mesa" id="awbListaMesa" role="button" tabindex="0" aria-label="AWBs importadas (clique para abrir a lista maior)"></section>
      </div>
    </div>`;
}

/* ---------- As esteiras (desenho visto de cima, em SVG 640 × 640) ---------- */
/** Altura do desenho: a largura é sempre 640 e a altura acompanha a da mesa (as esteiras vão do topo até embaixo). */
let cenaAlt = 640;
/** Caminho de cada caixinha: começa no topo da esteira e vai até sumir (porta ou lixo). */
function caminhos(d = cenaAlt - 640) {
  return {
    'nao-encontrado': [[110, 46], [110, 472 + d], [-40, 472 + d]],
    integral: [[250, 46], [250, 700 + d]],
    parcial: [[390, 46], [390, 700 + d]],
    encontrado: [[320, 46], [320, 700 + d]],
    invalido: [[530, 46], [530, 440 + d], [604, 440 + d]],
  };
}
/** Redesenha as esteiras na proporção da mesa (ao abrir o Scan e quando a tela muda de tamanho). */
function montarCena() {
  const el = document.getElementById('awbCena');
  if (!el || !el.clientWidth) return;
  const alt = Math.round(Math.min(1400, Math.max(600, (640 * el.clientHeight) / el.clientWidth)));
  if (Math.abs(alt - cenaAlt) < 8 && el.querySelector('svg')) return;
  cenaAlt = alt;
  el.innerHTML = cenaHtml(alt);
  atualizarPlacas();
}
/** Para onde a caixinha vai: no parcial/integral, o ENCONTRADO vira INTEGRAL ou PARCIAL. */
const destinoDe = (r) => (r.resultado === 'encontrado' && estado.modo === 'parcial' ? r.tipo : r.resultado);

function cenaHtml(H = cenaAlt) {
  const d = H - 640; // a mesa é mais alta que 640: tudo que fica embaixo desce junto
  const lote = estado.modo === 'lote';
  const L = 64; // largura da esteira
  // trecho de esteira: a lona com os roletes e os trilhos amarelos dos dois lados
  const vertical = (cx, y1, y2) => `
    <rect class="awb-est-lona" x="${cx - L / 2}" y="${y1}" width="${L}" height="${y2 - y1}" fill="url(#awbRolosV)" />
    <rect class="awb-est-trilho" x="${cx - L / 2 - 6}" y="${y1}" width="6" height="${y2 - y1}" />
    <rect class="awb-est-trilho" x="${cx + L / 2}" y="${y1}" width="6" height="${y2 - y1}" />`;
  const horizontal = (x1, x2, cy) => `
    <rect class="awb-est-lona" x="${x1}" y="${cy - L / 2}" width="${x2 - x1}" height="${L}" fill="url(#awbRolosH)" />
    <rect class="awb-est-trilho" x="${x1}" y="${cy - L / 2 - 6}" width="${x2 - x1}" height="6" />
    <rect class="awb-est-trilho" x="${x1}" y="${cy + L / 2}" width="${x2 - x1}" height="6" />`;
  // a curva do L: um quadrado de chapa no canto
  const curva = (cx, cy) => `<rect class="awb-est-curva" x="${cx - L / 2 - 6}" y="${cy - L / 2 - 6}" width="${L + 12}" height="${L + 12}" rx="6" />`;
  // porta lá embaixo: moldura colorida com o nome e o número, e a cortina de tiras
  const porta = (cx, classe, titulo, id) => `
    <g class="awb-porta awb-pt-${classe}">
      <rect class="awb-porta-moldura" x="${cx - 62}" y="${548 + d}" width="124" height="96" rx="6" />
      <text class="awb-porta-titulo" x="${cx}" y="${570 + d}" text-anchor="middle">${titulo}</text>
      <rect class="awb-pc-qtd-fundo" x="${cx - 30}" y="${577 + d}" width="60" height="22" rx="11" />
      <text class="awb-pc-qtd" id="${id}" x="${cx}" y="${593 + d}" text-anchor="middle">0</text>
      <rect class="awb-porta-boca" x="${cx - 50}" y="${606 + d}" width="100" height="40" />
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect class="awb-porta-tira" x="${cx - 48 + i * 12.5}" y="${606 + d}" width="9" height="40" />`).join('')}
    </g>`;
  const placa = (x, y, w, classe, titulo, id) => `
    <g class="awb-placa-cena awb-pc-${classe}">
      <rect x="${x}" y="${y}" width="${w}" height="40" rx="7" />
      <text class="awb-pc-titulo" x="${x + 10}" y="${y + 25}">${titulo}</text>
      <rect class="awb-pc-qtd-fundo" x="${x + w - 52}" y="${y + 8}" width="44" height="24" rx="12" />
      <text class="awb-pc-qtd" id="${id}" x="${x + w - 30}" y="${y + 25}" text-anchor="middle">0</text>
    </g>`;
  return `
  <svg class="awb-cena-svg" viewBox="0 0 640 ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Esteiras da separação vistas de cima">
    <defs>
      <pattern id="awbRolosH" width="14" height="10" patternUnits="userSpaceOnUse"><rect width="14" height="10" fill="#4C4E47" /><rect width="4" height="10" fill="#2C2D29" /></pattern>
      <pattern id="awbRolosV" width="10" height="14" patternUnits="userSpaceOnUse"><rect width="10" height="14" fill="#4C4E47" /><rect width="10" height="4" fill="#2C2D29" /></pattern>
    </defs>
    <!-- NÃO ENCONTRADO: desce e vira para a esquerda, até a porta amarela -->
    ${vertical(110, 0, 440 + d)}${horizontal(0, 78, 472 + d)}${curva(110, 472 + d)}
    <g class="awb-porta-lado">
      <rect class="awb-porta-moldura" x="-4" y="${424 + d}" width="30" height="96" rx="4" />
      <rect class="awb-porta-boca" x="-4" y="${434 + d}" width="20" height="76" />
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect class="awb-porta-tira" x="-4" y="${435 + d + i * 12.6}" width="20" height="9" />`).join('')}
    </g>
    ${placa(4, 532 + d, 176, 'nao', 'NÃO ENCONTRADO', 'awbQtdNao')}
    <!-- INTEGRAL e PARCIAL (por lote: ENCONTRADO): retas, de cima até a porta -->
    ${lote ? vertical(320, 0, 600 + d) : vertical(250, 0, 600 + d) + vertical(390, 0, 600 + d)}
    <!-- INVÁLIDO: desce e vira para a direita, até o lixo -->
    ${vertical(530, 0, 408 + d)}${horizontal(562, 600, 440 + d)}${curva(530, 440 + d)}
    <g class="awb-lixo">
      <circle cx="606" cy="${440 + d}" r="34" />
      <circle class="awb-lixo-boca" cx="606" cy="${440 + d}" r="25" />
    </g>
    ${placa(470, 486 + d, 166, 'lixo', 'INVÁLIDO', 'awbQtdLixo')}
    <!-- a calha lá em cima, de onde as caixinhas caem -->
    <rect class="awb-calha" x="0" y="0" width="640" height="14" />
    <g id="awbCaixas"></g>
    <!-- as portas ficam por cima das caixinhas: é ali que elas somem -->
    ${lote ? porta(320, 'enc', 'ENCONTRADO', 'awbQtdEnc') : porta(250, 'int', 'INTEGRAL', 'awbQtdInt') + porta(390, 'par', 'PARCIAL', 'awbQtdPar')}
  </svg>`;
}

/** Desenho de uma caixinha de papelão com a etiqueta na cor do resultado. */
function caixaSvg(r, classe) {
  const lote = r.resultado === 'encontrado' && estado.modo === 'lote' && r.lote ? `<text class="awb-cx-lote" x="0" y="15" text-anchor="middle">${esc(String(r.lote).slice(0, 7))}</text>` : '';
  return `<g class="awb-cx-corpo">
    <rect class="awb-cx-papelao" x="-23" y="-23" width="46" height="46" rx="3" />
    <rect class="awb-cx-fita" x="-6" y="-23" width="12" height="46" />
    <rect class="awb-cx-etq awb-cx-${classe}" x="-18" y="4" width="36" height="15" rx="2" />
    ${lote}
    ${r.jaBipado ? '<g class="awb-cx-ja"><circle cx="19" cy="-19" r="10" /><text x="19" y="-14" text-anchor="middle">!</text></g>' : ''}
  </g>`;
}

const semMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A caixinha cai no começo da esteira dela, desce e some na porta (ou cai no lixo). */
function soltarCaixa(r) {
  const grupo = document.getElementById('awbCaixas');
  if (!grupo) return;
  const destino = destinoDe(r);
  const rotas = caminhos();
  const pontos = rotas[destino] || rotas.invalido;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', `awb-cx awb-cx-vai-${destino}`);
  g.dataset.destino = destino;
  g.innerHTML = caixaSvg(r, destino);
  if (semMovimento()) {
    // sem animação: a caixinha aparece um instante no começo da esteira
    g.setAttribute('transform', `translate(${pontos[0].join(' ')})`);
    grupo.appendChild(g);
    setTimeout(() => g.remove(), 900);
    return;
  }
  // a velocidade é a mesma em todo caminho: o tempo depende da distância
  let dist = 0;
  for (let i = 1; i < pontos.length; i += 1) dist += Math.hypot(pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1]);
  const dur = Math.max(0.9, dist / 520);
  const cai = 0.28; // a queda na esteira, antes de começar a andar
  g.setAttribute('transform', `translate(${pontos[0].join(' ')})`);
  g.classList.add('caindo-na-esteira');
  const anda = document.createElementNS(SVG_NS, 'animateMotion');
  anda.setAttribute('path', `M${pontos.map((p) => `${p[0] - pontos[0][0]} ${p[1] - pontos[0][1]}`).join(' L')}`);
  anda.setAttribute('dur', `${dur}s`);
  anda.setAttribute('begin', 'indefinite');
  anda.setAttribute('fill', 'freeze');
  g.appendChild(anda);
  grupo.appendChild(g);
  setTimeout(() => { try { anda.beginElement(); } catch { g.remove(); } }, cai * 1000);
  setTimeout(() => {
    if (destino === 'invalido') {
      // inválido: cai dentro do lixo e some
      g.classList.add('caindo');
      setTimeout(() => g.remove(), 450);
    } else g.remove(); // já passou pela porta
  }, (cai + dur) * 1000);
}

/** Números das placas: encontradas / importadas de cada tipo, não encontradas e inválidas. */
function atualizarPlacas() {
  const pinta = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const de = (tipo) => { const l = estado.itens.filter((it) => !tipo || it.tipo === tipo); return `${l.filter((it) => it.achado).length}/${l.length}`; };
  pinta('awbQtdNao', estado.leituras.filter((l) => l.resultado === 'nao-encontrado').length);
  pinta('awbQtdLixo', estado.leituras.filter((l) => l.resultado === 'invalido').length);
  pinta('awbQtdEnc', de());
  pinta('awbQtdInt', de('integral'));
  pinta('awbQtdPar', de('parcial'));
}

function resultadoHtml(r, pulso = true) {
  if (!r) return '';
  // Parcial/integral: no lugar de ENCONTRADO aparece INTEGRAL (azul) ou PARCIAL (laranja)
  const classe = r.resultado === 'encontrado' && estado.modo === 'parcial' ? r.tipo : r.resultado;
  const titulo = {
    encontrado: 'ENCONTRADO', integral: 'INTEGRAL', parcial: 'PARCIAL', 'nao-encontrado': 'NÃO ENCONTRADO', invalido: 'INVÁLIDO',
  }[classe];
  const icone = { encontrado: 'check-circulo', integral: 'check-circulo', parcial: 'check-circulo', 'nao-encontrado': 'alerta', invalido: 'x' }[classe];
  const sub = {
    encontrado: 'Está na lista importada',
    integral: 'Está na lista · AWB integral',
    parcial: 'Está na lista · AWB parcial',
    'nao-encontrado': 'É uma AWB, mas não está na lista importada',
    invalido: 'Não segue o padrão TXA + letra + 9 números + tx',
  }[classe];
  const lote = r.resultado === 'encontrado' && estado.modo === 'lote'
    ? `<span class="awb-res-lote"><small>LOTE</small><b>${esc(r.lote || '—')}</b></span>` : '';
  const jaBipado = r.jaBipado
    ? `<span class="awb-res-ja" title="Essa AWB já tinha sido bipada"><span class="awb-res-ja-ico">!</span><b>JÁ BIPADO</b><small>${r.vezes}ª leitura</small></span>` : '';
  return `<div class="awb-res awb-res-${classe} ${r.jaBipado ? 'com-ja' : ''}" ${pulso ? `data-pulso="${Date.now()}"` : ''}>
    <span class="awb-res-ico">${ic(icone)}</span>
    <div class="awb-res-texto">
      <strong>${titulo}</strong>
      <code>${esc(r.codigo)}</code>
      <small>${sub}</small>
    </div>
    ${lote}${jaBipado}
  </div>`;
}

/** Números das placas e, numa leitura nova, a caixinha andando na esteira. */
function atualizarScan(r) {
  atualizarPlacas();
  if (r) {
    soltarCaixa(r);
    // o laser do leitor pisca a cada leitura
    const cena = document.getElementById('awbCena');
    cena.classList.remove('lendo'); void cena.offsetWidth; cena.classList.add('lendo');
    document.getElementById('awbResultado').innerHTML = resultadoHtml(r);
    const leitor = document.getElementById('awbLeitor');
    leitor.classList.remove('ok', 'erro', 'pedido');
    leitor.classList.add({ encontrado: 'ok', 'nao-encontrado': 'pedido', invalido: 'erro' }[r.resultado]);
  }
}

/** Confere uma leitura com a lista. */
function conferir(bruto) {
  const codigo = limparCodigo(bruto);
  if (!codigo) return null;
  let r;
  if (!ehAwb(codigo)) r = { resultado: 'invalido', codigo: codigo.toUpperCase() };
  else {
    const k = chaveAwb(codigo);
    const it = estado.itens.find((x) => chaveAwb(x.awb) === k);
    if (!it) r = { resultado: 'nao-encontrado', codigo: formatar(codigo) };
    else {
      it.vezes = (it.vezes || 0) + 1;
      const jaBipado = !!it.achado;
      if (!it.achado) it.achado = new Date().toISOString();
      r = { resultado: 'encontrado', codigo: it.awb, lote: it.lote, tipo: it.tipo, vezes: it.vezes, jaBipado };
    }
  }
  estado.leituras.unshift({ ...r, em: new Date().toISOString() });
  estado.leituras = estado.leituras.slice(0, 500);
  guardar();
  tocar(r.jaBipado ? 'ja-bipado' : r.resultado);
  return r;
}

function ligarScan() {
  const entrada = document.getElementById('awbEntrada');
  const listaMesa = document.getElementById('awbListaMesa');
  ligarCliqueLista(listaMesa);
  pintarLista(listaMesa, estado.leituras[0]?.resultado === 'encontrado' ? estado.leituras[0].codigo : null);
  cenaAlt = 0;
  montarCena();
  new ResizeObserver(() => montarCena()).observe(document.getElementById('awbCena'));
  atualizarScan(null);
  const ler = () => {
    const r = conferir(entrada.value);
    entrada.value = '';
    if (!r) return;
    atualizarScan(r);
    atualizarPlacar(r.resultado === 'encontrado' ? r.codigo : null);
    if (r.resultado === 'encontrado' && !r.jaBipado && encontrados() === estado.itens.length) {
      API.registrarAcao('Concluiu a separação no Localizador de AWB', estado.cliente, `${estado.itens.length} AWBs · ${MODOS[estado.modo].titulo}`);
    }
    comentarLeitura(r);
  };
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ler(); }
  });
  // Leitor que não manda Enter: com 15 caracteres no padrão, confere sozinho
  entrada.addEventListener('input', () => {
    if (ehAwb(entrada.value)) ler();
  });
  entrada.focus();
}

/**
 * Pergunta com os botões padrão do M-Utility (Cancelar | ação). Resolve true/false.
 * perigo: a ação vira a tecla vermelha.
 */
function perguntar({ titulo, texto, sim, perigo = false }) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = 'modal modal-pergunta';
    d.innerHTML = `
      <div class="modal-conteudo">
        <span class="pergunta-ico">${ic(perigo ? 'alerta' : 'duvida')}</span>
        <h2>${titulo}</h2>
        <p>${texto}</p>
        <div class="modal-acoes">
          <button type="button" class="btn" data-resposta="nao">Cancelar</button>
          <button type="button" class="btn ${perigo ? 'key--red' : 'btn-primary'}" data-resposta="sim">${sim}</button>
        </div>
      </div>`;
    let feito = false;
    const responder = (v) => { if (feito) return; feito = true; d.close(); d.remove(); resolver(v); };
    d.addEventListener('click', (e) => { const b = e.target.closest('[data-resposta]'); if (b) responder(b.dataset.resposta === 'sim'); });
    d.addEventListener('cancel', (e) => { e.preventDefault(); responder(false); });
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('[data-resposta="nao"]').focus();
  });
}

/** Cancelar: descarta a separação e volta para a escolha do cliente. */
async function cancelarSeparacao({ perguntar: confirmar = true } = {}) {
  const n = estado.itens.length;
  if (confirmar && n && !await perguntar({
    titulo: 'Cancelar a separação?',
    texto: `A lista atual (<b>${n}</b> AWBs, <b>${encontrados()}</b> encontradas) será apagada.`,
    sim: 'Cancelar separação', perigo: true,
  })) return;
  estado = novoEstado();
  guardar();
  irPara('cliente', { falar: false });
  helpy.dizer(n ? 'Separação cancelada! 🧹 Quando quiser começar outra, é só escolher o cliente.' : 'Tudo bem! Quando quiser separar, é só escolher o cliente 😉', { humor: 'feliz' });
}

/* ---------- Cliques ---------- */
elPalco.addEventListener('click', async (e) => {
  const alvo = (s) => e.target.closest(s);
  // No Scan o foco volta sempre para o leitor (a pistola "digita" onde o cursor estiver)
  if (estado.etapa === 'scan' && !alvo('button, a, input, textarea, select')) document.getElementById('awbEntrada')?.focus();
  if (alvo('[data-cliente]')) {
    estado.cliente = alvo('[data-cliente]').dataset.cliente;
    irPara('modo');
  } else if (alvo('[data-modo]')) {
    const modo = alvo('[data-modo]').dataset.modo;
    if (estado.itens.length && estado.modo && estado.modo !== modo) {
      const ok = await perguntar({ titulo: 'Trocar o modo?', texto: `A lista tem <b>${estado.itens.length}</b> AWBs importadas como <b>${MODOS[estado.modo].titulo}</b>. Trocando o modo, ela é esvaziada.`, sim: 'Trocar e esvaziar', perigo: true });
      if (!ok) return;
      estado.itens = []; estado.leituras = [];
    }
    estado.modo = modo;
    irPara('importar');
  } else if (alvo('[data-ver-lista]')) {
    abrirLista();
  } else if (alvo('[data-ir]')) {
    irPara(alvo('[data-ir]').dataset.ir);
  }
});

// Botões da barra: Voltar, Cancelar, som, "Importar mais" e "Ver lista"
elAcao.addEventListener('click', (e) => {
  const alvo = (s) => e.target.closest(s);
  if (alvo('[data-voltar]')) {
    const anterior = ORDEM[ORDEM.indexOf(estado.etapa) - 1];
    if (anterior) irPara(anterior);
  } else if (alvo('[data-cancelar]')) {
    cancelarSeparacao();
  } else if (alvo('[data-ver-lista]')) {
    abrirLista();
  } else if (alvo('[data-ir]')) {
    irPara(alvo('[data-ir]').dataset.ir);
  } else if (alvo('[data-som]')) {
    somLigado = !somLigado;
    try { localStorage.setItem(CHAVE_SOM, somLigado ? 'sim' : 'nao'); } catch { /* */ }
    renderizarBarra();
    if (somLigado) tocar('encontrado');
    document.getElementById('awbEntrada')?.focus();
  }
});

/* ---------- Início ---------- */
(async () => {
  if (!usuario) return;
  Sessao.montarMenu(usuario);
  const r = await API.clientes();
  if (r.ok) clientes = r.dados;
  // Etapa guardada sem os dados que ela precisa: volta para a primeira que falta
  if (!estado.cliente) estado.etapa = 'cliente';
  else if (!estado.modo) estado.etapa = 'modo';
  else if (estado.etapa === 'scan' && !estado.itens.length) estado.etapa = 'importar';
  renderizar();
  falarSobre(estado.etapa);
  helpy.viver({ nome: apelido(), id: usuario?.id, podeFalar: () => !document.activeElement?.matches?.('textarea') });
})();
