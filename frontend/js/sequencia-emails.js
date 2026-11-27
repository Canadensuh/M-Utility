/* =========================================================
   sequencia-emails.js — duas telas da Minha Mesa
   1) Registro em sequência: várias peças de uma vez.
      Sem arquivo → Prateleira ou Pallet de dentro (Enviar e-mail): só DANFE.
      Reimpressão → Crossdocking (Tratado) ou Devolução: DANFE + AWB.
      Repetir DANFE ou AWB é permitido (acontece no dia a dia).
   2) Enviar e-mail dos tickets SELECIONADOS na mesa (caixinhas): a tabela
      com todas as colunas para copiar no e-mail e marcar "E-mail enviado".
      (Por cliente, só os em "Enviar e-mail": a página emails.html.)
   Usa o que o controle-nc.js já tem (irPara, volumes, clientes, helpy…).
   ========================================================= */

/* ---------- 1) Registro em sequência ---------- */
const MODOS_SEQUENCIA = [
  {
    id: 'sem-integracao', tipo: 'sem-integracao', awb: false,
    titulo: 'Sem arquivo', sub: 'Sem integração · Enviar e-mail',
    descricao: 'Bipa só a DANFE. As peças ficam na mesa em Enviar e-mail.',
    destinos: [{ local: 'prateleira', status: 'enviar-email' }, { local: 'pallet-dentro', status: 'enviar-email' }],
  },
  {
    id: 'reimpressao', tipo: 'reimpressao', awb: true,
    titulo: 'Reimpressão', sub: 'Reimpressão · Tratado ou Devolução',
    descricao: 'Bipa a DANFE e a AWB de cada peça. Saem do setor (vão para o Histórico).',
    destinos: [{ local: 'crossdocking', status: 'tratado' }, { local: 'setor-devolucao', status: 'devolucao' }],
  },
];
// Clientes do Registro em sequência. pedido: aceita o nº do pedido no lugar da DANFE.
// GERAL: serve para qualquer cliente; ao escolher, você diz se vale só DANFE ou DANFE e pedido.
const CLIENTES_SEQUENCIA = [
  { nome: 'MUNDIAL', pedido: false, regra: 'só DANFE' },
  { nome: 'NEWELL BRANDS', pedido: true, regra: 'DANFE ou nº do pedido' },
  { nome: 'FISIA STD', pedido: false, regra: 'só DANFE' },
  { nome: 'GERAL', geral: true, regra: 'qualquer cliente' },
];
let seq = { cliente: null, modo: null, local: null, geralPedido: false };
/** O cliente escolhido. No GERAL, a regra (só DANFE ou DANFE e pedido) é a que você escolheu no cartão. */
const clienteSeq = () => {
  const c = CLIENTES_SEQUENCIA.find((x) => x.nome === seq.cliente) || null;
  if (!c?.geral) return c;
  return { ...c, pedido: !!seq.geralPedido, regra: seq.geralPedido ? 'DANFE ou nº do pedido' : 'só DANFE' };
};
const dadosClienteSeq = (nome) => clientes.find((c) => String(c.nome).trim().toUpperCase() === nome) || null;
/** O cliente cadastrado dono de um CNPJ (no GERAL o cliente de cada peça vem da DANFE). */
const clientePorCnpjSeq = (cnpj) => (cnpj ? clientes.find((c) => Catalogo.somenteDigitos(c.cnpj) === cnpj) || null : null);
const modoSeq = () => MODOS_SEQUENCIA.find((m) => m.id === seq.modo) || null;
const destinoSeq = () => modoSeq()?.destinos.find((d) => d.local === seq.local) || null;

let seqExplicou = false;   // a explicação da bipagem já apareceu nesta leva?
/** Some com a fala do Helpy depois de um tempo (se ninguém tiver falado por cima). */
function sumirFalaSeq(ms) {
  const fala = document.querySelector("#helpyFeed .helpy-msg:last-child");
  if (!fala) return;
  setTimeout(() => {
    if (!fala.isConnected || fala !== document.querySelector("#helpyFeed .helpy-msg:last-child")) return;
    fala.classList.add("sumindo");
    setTimeout(() => fala.remove(), 400);
  }, ms);
}

function iniciarSequencia() {
  seqExplicou = false;
  seq = { cliente: null, modo: null, local: null, geralPedido: false };
  seqItens = [];
  irPara('seqcliente');
}

// Tela 0: o cliente (cartão igual ao da aba Clientes)
function telaSeqCliente() {
  return `
    <div class="etapa-cabeca">
      <h1>De qual <span class="acento">cliente</span> são as peças?</h1>
      <p>Escolha o cliente. Cada um aceita um jeito de bipar.</p>
    </div>
    <div class="seq-clientes">
      ${CLIENTES_SEQUENCIA.map((c, i) => {
        if (c.geral) {
          // GERAL: qualquer cliente. Os dois botões dizem como validar
          const escolhido = seq.cliente === c.nome;
          return `<div class="cli-card seq-cli-card seq-cli-geral ${escolhido ? 'selecionada' : ''}" style="--cor:#4F7FC0;--cor-tinta:#fff;--i:${i}">
            <span class="cli-faixa" aria-hidden="true"></span>
            <span class="cli-topo">
              <span class="cli-inicial" aria-hidden="true">${ic('equipe')}</span>
              <span class="cli-nome"><strong>GERAL</strong><span title="O cliente de cada peça vem do CNPJ da DANFE">Qualquer cliente</span></span>
            </span>
            <span class="seq-geral-opcoes" role="group" aria-label="Como validar no GERAL">
              <button type="button" class="btn ${escolhido && !seq.geralPedido ? 'btn-primary' : ''}" data-cliente-seq="GERAL" data-geral-pedido="nao">${ic('codigo-barras')} Apenas DANFE</button>
              <button type="button" class="btn ${escolhido && seq.geralPedido ? 'btn-primary' : ''}" data-cliente-seq="GERAL" data-geral-pedido="sim">${ic('documento')} DANFE e pedido</button>
            </span>
          </div>`;
        }
        const d = dadosClienteSeq(c.nome);
        const cor = d?.cor || '#7FB069';
        return `<button type="button" class="cli-card seq-cli-card ${seq.cliente === c.nome ? 'selecionada' : ''}" data-cliente-seq="${esc(c.nome)}" style="--cor:${esc(cor)};--cor-tinta:${Catalogo.tintaPara(cor)};--i:${i}">
          <span class="cli-faixa" aria-hidden="true"></span>
          <span class="cli-topo">
            <span class="cli-inicial" aria-hidden="true">${esc(c.nome.charAt(0))}</span>
            <span class="cli-nome"><strong>${esc(d?.nome || c.nome)}</strong><span class="tk-mono">${d?.cnpj ? esc(Catalogo.formatarCnpj(d.cnpj)) : 'Cliente'}</span></span>
          </span>
          <span class="seq-cli-regra">${ic('codigo-barras')} Aceita: ${esc(c.regra)}</span>
        </button>`;
      }).join('')}
    </div>`;
}
BARRAS_EXTRAS.seqcliente = ({ esq, dir, cancelar, tecla }) => {
  esq.push(tecla('btn-voltar', 'data-seq-ir="tipo"', '← Voltar'));
  dir.push(cancelar);
};
TITULOS_EXTRAS.seqcliente = () => `${ic('codigo-barras')} Registro em sequência`;
LIGAR_EXTRAS.seqcliente = () => {
  elPalco.querySelectorAll('[data-cliente-seq]').forEach((b) => b.addEventListener('click', () => {
    const geralPedido = b.dataset.geralPedido === 'sim';
    // trocou de cliente (ou de regra no GERAL): a lista recomeça
    if (seq.cliente !== b.dataset.clienteSeq || (b.dataset.geralPedido && seq.geralPedido !== geralPedido)) seqItens = [];
    seq.cliente = b.dataset.clienteSeq;
    seq.geralPedido = geralPedido;
    irPara('sequencia');
  }));
  helpy.dizer('Bora registrar em sequência! 📦 Me fala de qual <strong>cliente</strong> são as peças: <strong>MUNDIAL</strong> e <strong>FISIA STD</strong> só aceitam DANFE; o <strong>NEWELL BRANDS</strong> aceita DANFE ou pedido. Peças de outro cliente? Vai no <strong>GERAL</strong> 😉');
};

// Tela 1: o modo
function telaSequencia() {
  const c = clienteSeq();
  return `
    <div class="etapa-cabeca">
      ${c ? `<span class="seq-chip">${chipClienteSeq()}</span>` : ''}
      <h1>Registro em <span class="acento">sequência</span></h1>
      <p>Escolha o tipo das peças. Depois é só bipar uma atrás da outra.</p>
    </div>
    <div class="opcoes seq-modos">
      ${MODOS_SEQUENCIA.map((x, i) => `
        <button type="button" class="opcao seq-modo ${seq.modo === x.id ? 'selecionada' : ''}" data-modo-seq="${x.id}" style="--i:${i}">
          <span class="mini-ico">${Catalogo.icone(x.tipo)}</span>
          <span><strong>${x.titulo}</strong><small>${x.sub}</small><em>${x.descricao}</em></span>
        </button>`).join('')}
    </div>`;
}
BARRAS_EXTRAS.sequencia = ({ esq, dir, cancelar, tecla }) => {
  esq.push(tecla('btn-voltar', 'data-seq-ir="seqcliente"', '← Trocar o cliente'));
  dir.push(cancelar);
};
/** O cliente escolhido (ponto na cor dele + nome), para os chips das telas. */
function chipClienteSeq() {
  const c = clienteSeq();
  if (!c) return '';
  if (c.geral) return `<b class="cliente-ponto" style="--cor:#4F7FC0"></b> <b>GERAL</b> (${esc(c.regra)})`;
  const d = dadosClienteSeq(c.nome);
  return `<b class="cliente-ponto" style="--cor:${esc(d?.cor || '#7FB069')}"></b> <b>${esc(d?.nome || c.nome)}</b>`;
}
TITULOS_EXTRAS.sequencia = () => `${ic('codigo-barras')} Registro em sequência`;
LIGAR_EXTRAS.sequencia = () => {
  elPalco.querySelectorAll('[data-modo-seq]').forEach((b) => b.addEventListener('click', () => {
    seq.modo = b.dataset.modoSeq;
    if (!modoSeq().destinos.some((d) => d.local === seq.local)) seq.local = null;
    irPara('seqdestino');
  }));
  helpy.dizer('Várias peças de uma vez? Escolha: <strong>Sem arquivo</strong> (só DANFE, para mandar e-mail) ou <strong>Reimpressão</strong> (DANFE + AWB).');
};

// Tela 2: para onde vão (cartões com desenho, como na etapa Local)
function telaSeqDestino() {
  const m = modoSeq();
  return `
    <div class="etapa-cabeca">
      <h1>Para onde vão as <span class="acento">peças</span>?</h1>
      <p>${esc(m.titulo)}: toque no lugar. Todas as peças bipadas vão para lá.</p>
    </div>
    <div class="nc-locais seq-destinos">
      ${m.destinos.map((d, i) => {
        const l = Catalogo.local(d.local);
        return `
        <button type="button" class="nc-local ${seq.local === d.local ? 'selecionada' : ''}" data-destino-seq="${d.local}" style="--i:${i}">
          <span class="nc-local-cena">${DESENHO_LOCAL[d.local] || ''}</span>
          <strong>${esc(l.titulo)}</strong>
          <small>${esc(Catalogo.statusDe(d.status).titulo)} · ${esc(l.descricao)}</small>
        </button>`;
      }).join('')}
    </div>`;
}
BARRAS_EXTRAS.seqdestino = ({ esq, dir, cancelar, tecla }) => {
  esq.push(tecla('btn-voltar', 'data-seq-ir="sequencia"', '← Voltar'));
  dir.push(cancelar);
};
TITULOS_EXTRAS.seqdestino = () => `${ic('codigo-barras')} Registro em sequência`;
LIGAR_EXTRAS.seqdestino = () => {
  elPalco.querySelectorAll('[data-destino-seq]').forEach((b) => b.addEventListener('click', () => {
    seq.local = b.dataset.destinoSeq;
    irPara('bipagem');
  }));
};

// Tela 3: bipagem — o mesmo leitor das outras telas ("Bipe ou digite aqui").
// Cada peça bipada desce para a lista; no fim, "Registrar" vira tudo ticket.
// Reimpressão: o visor tem um corte no meio — DANFE à esquerda, AWB à direita.
let seqItens = [];   // { danfe, awb, nf, cnpj, estado: 'ok' | 'feito' | 'falha', codigo?, erro? }

function telaBipagem() {
  const m = modoSeq();
  const d = destinoSeq();
  const local = Catalogo.local(d.local);
  // Reimpressão: duas telinhas, uma para a DANFE e outra para a AWB.
  // Sem arquivo: uma telinha só, a da DANFE. A mensagem da leitura fica embaixo.
  const telinha = (id, rotulo, max) => `
    <label class="nc-leitor seq-visor seq-visor-${id === 'seqAwb' ? 'awb' : 'danfe'}">
      <span class="nc-leitor-luz" aria-hidden="true"></span>
      <span class="visor-rotulo">${rotulo}</span>
      <input id="${id}" class="nc-leitor-input" type="text" maxlength="${max}" autocomplete="off" spellcheck="false" placeholder="${id === 'seqAwb' ? 'Bipe aqui' : 'Bipe ou digite aqui'}" aria-describedby="seqLeitura" />
    </label>`;
  const visor = `
    <div class="seq-visores ${m.awb ? 'duplo' : ''}" id="seqVisor">
      ${telinha('seqDanfe', 'DANFE', 60)}
      ${m.awb ? telinha('seqAwb', 'AWB', 20) : ''}
      <span class="nc-leitura seq-leitura" id="seqLeitura" aria-live="polite"></span>
    </div>`;
  // A bancada dividida em duas.
  // Esquerda: a lista das peças já bipadas.
  // Direita: a área de bipar (DANFE e AWB) e, embaixo dela, a impressora. A cada
  // peça ela imprime o ticket e joga na mão do Helpy, que guarda no PACOTE da
  // mesinha dele (clicando no pacote, ele abre na tela, como um pacote da mesa).
  return `
    <div class="seq-galpao">
      <div class="seq-galpao-esq">
        <section class="seq-bipadas" aria-labelledby="seqTituloLista">
          <header class="seq-bipadas-cab">
            <h3 id="seqTituloLista">${ic('codigo-barras')} Peças bipadas</h3>
            <span class="seq-contagem" id="seqContagem"></span>
          </header>
          <ol class="seq-itens" id="seqLista"></ol>
        </section>
      </div>
      <div class="seq-galpao-dir nc-bipagem seq-bipagem">
        <span class="seq-chip">${chipClienteSeq()} · ${Catalogo.icone(m.tipo)} <b>${esc(m.titulo)}</b> · ${esc(Catalogo.statusDe(d.status).titulo)} · ${ic(TicketUI.iconeLocal(local.id))} ${esc(local.titulo)}</span>
        ${visor}
        <div class="seq-imprime envio-impressao" id="seqImprime">
          <div class="impressora"><span class="impressora-luz"></span></div>
          <div class="saida-papel" id="seqSaida"></div>
          <p class="envio-status" id="seqImprimeStatus" hidden></p>
        </div>
      </div>
    </div>`;
}

/* ---------- Impressora → Helpy → PACOTE da mesinha ----------
   Cada peça bipada vira um ticket (ainda sem o #ID: ele sai no Registrar).
   A impressora imprime, joga na mão do Helpy e ele guarda no pacote. */

/** A peça como um "volume" para desenhar o ticket igual ao da mesa (código provisório: PEÇA 01). */
function volumeSeq(x, i) {
  const m = modoSeq();
  const d = destinoSeq();
  const cli = clienteSeq();
  // no GERAL, o cliente do ticket é o dono do CNPJ da DANFE (pedido: sem cliente)
  const dados = cli?.geral ? clientePorCnpjSeq(x.cnpj) : cli ? dadosClienteSeq(cli.nome) : null;
  return {
    numero: -(i + 1), codigo: `PEÇA ${String(i + 1).padStart(2, '0')}`,
    tipo: m.tipo, tipo_titulo: Catalogo.tipo(m.tipo)?.titulo || m.titulo,
    status: d.status, status_titulo: Catalogo.statusDe(d.status)?.titulo || '',
    local: d.local, local_titulo: Catalogo.local(d.local)?.titulo || '',
    cliente_nome: dados?.nome || (cli?.geral ? '' : cli?.nome) || '', cliente_cor: dados?.cor,
    nf: x.pedido ? '' : x.nf, pedido: x.pedido ? x.danfe : '', awb: x.awb || '',
    chave: x.pedido ? '' : x.danfe, codigo_caixa: x.danfe, cnpj: x.cnpj || '', criado_por: usuario?.nome || '',
    data_entrada: new Date().toISOString(), data_saida: Catalogo.statusDe(d.status)?.saida ? new Date().toISOString() : null,
  };
}
const ticketSeqHtml = (x, i, extra = {}) => TicketUI.padrao(volumeSeq(x, i), { clique: false, carimbo: false, ...extra });

/** O pacote na mesinha do Helpy (só aparece na bipagem do Registro em sequência). */
function caixaHelpySeq() {
  const escritorio = document.querySelector('.escritorio');
  if (!escritorio) return null;
  let caixa = escritorio.querySelector('.seq-pacote-helpy');
  if (!caixa) {
    caixa = document.createElement('button');
    caixa.type = 'button';
    caixa.className = 'seq-pacote-helpy';
    caixa.innerHTML = `
      <span class="seq-pacote-abas" aria-hidden="true"><i></i><i></i></span>
      <span class="seq-pacote-frente"><b>PACOTE</b><span class="seq-pacote-qtd" id="seqPacoteQtd">0</span></span>`;
    caixa.addEventListener('click', abrirPacoteSeq);
    escritorio.appendChild(caixa);
  }
  return caixa;
}
/** Número no pacote: as peças que o Helpy já guardou (prontas para registrar). */
function atualizarPacoteSeq() {
  const caixa = caixaHelpySeq();
  if (!caixa) return;
  const n = seqItens.filter((x) => x.estado !== 'feito').length;
  const guardadas = Math.min(n, seqGuardadas);
  seqGuardadas = guardadas;
  caixa.querySelector('#seqPacoteQtd').textContent = guardadas;
  caixa.classList.toggle('vazio', !guardadas);
  caixa.title = guardadas ? `Pacote com ${guardadas} ticket${guardadas > 1 ? 's' : ''}: clique para ver` : 'O pacote ainda está vazio';
  caixa.setAttribute('aria-label', caixa.title);
}

/**
 * Clicando no pacote do Helpy: ele abre na tela inteira, do mesmo jeito que um
 * pacote aberto na Minha Mesa ou no Histórico (cabeçalho, Tickets | Tabela).
 * As peças ainda não têm #ID: o #ID sai quando clicar em Registrar peças.
 */
let visaoSeqPacote = 'tickets';
function abrirPacoteSeq() {
  if (etapaAtual !== 'bipagem') return;
  irPara('seqpacote', 'dir', { falar: false });
}
function telaSeqPacote() {
  const membros = seqItens.map((x, i) => ({ x, i })).filter(({ x }) => x.estado !== 'feito').map(({ x, i }) => volumeSeq(x, i));
  if (!membros.length) {
    return `<div class="sucesso"><h1>Pacote vazio</h1><p>O Helpy ainda não guardou nenhum ticket. Bipe uma peça 😉</p>
      <div class="sucesso-acoes"><button type="button" class="btn btn-primary" data-seq-ir="bipagem">Voltar para a bipagem</button></div></div>`;
  }
  const v = membros[0];
  return `
    <div class="etapa-cabeca pacote-cabeca">
      <span class="pacote-cabeca-ico">${ic('pacote')}</span>
      <div>
        <h1><span class="acento">Pacote</span> · ${membros.length} ticket${membros.length === 1 ? '' : 's'}</h1>
        <p>${esc(v.tipo_titulo)} · ${esc(v.cliente_nome)} · ${esc(v.status_titulo)} · ${esc(v.local_titulo)} · o #ID sai quando você clicar em <b>Registrar peças</b></p>
      </div>
    </div>
    ${visaoSeqPacote === 'tabela'
      // a tabela é a mesma da mesa; as peças ainda não existem, então sem abrir/marcar
      ? `<div class="mesa-tabela pacote-tabela">${tabelaMesa(membros).replace(/\sdata-ver="[^"]*"/g, '').replace(/<label class="email-caixa caixa-tabela"[^>]*>.*?<\/label>/g, '')}</div>`
      : `<ul class="lista-tickets desktop-tickets pacote-grade">
      ${membros.map((m, i) => TicketUI.padrao(m, { i, giro: ((i * 37) % 5 - 2) * .6, clique: false, carimbo: false })).join('')}
    </ul>`}`;
}
TITULOS_EXTRAS.seqpacote = () => `${ic('pacote')} Pacote de tickets`;
BARRAS_EXTRAS.seqpacote = ({ esq, dir, tecla }) => {
  esq.push(tecla('btn-voltar', 'data-seq-ir="bipagem"', '← Voltar para a bipagem'));
  dir.push(`<span class="nc-visao" role="radiogroup" aria-label="Forma de ver o pacote">
      ${tecla(`btn-sm ${visaoSeqPacote === 'tickets' ? 'ativo' : ''}`, `data-visao-seq="tickets" role="radio" aria-checked="${visaoSeqPacote === 'tickets'}"`, `${ic('ticket')} Tickets`)}
      ${tecla(`btn-sm ${visaoSeqPacote === 'tabela' ? 'ativo' : ''}`, `data-visao-seq="tabela" role="radio" aria-checked="${visaoSeqPacote === 'tabela'}"`, `${ic('documento')} Tabela`)}
    </span>`);
};
LIGAR_EXTRAS.seqpacote = () => {
  document.querySelectorAll('[data-visao-seq]').forEach((b) => b.addEventListener('click', () => {
    visaoSeqPacote = b.dataset.visaoSeq;
    irPara('seqpacote', 'dir', { falar: false });
  }));
};

/* Fila da impressora: bipando rápido, os tickets saem um atrás do outro */
let seqFila = Promise.resolve();
let seqNaFila = 0;
let seqGuardadas = 0;       // quantas o Helpy já colocou no pacote
const esperaSeq = (ms) => new Promise((ok) => setTimeout(ok, ms));

function imprimirTicketSeq(x, i) {
  seqNaFila += 1;
  seqFila = seqFila.then(async () => {
    try {
      // bipando muito rápido: os de trás vão direto para o pacote (sem esperar a animação)
      const rapido = seqNaFila > 1 || matchMedia('(prefers-reduced-motion: reduce)').matches;
      const imprime = elSeq('seqImprime');
      const saida = elSeq('seqSaida');
      const status = elSeq('seqImprimeStatus');
      if (!imprime || !seqItens.includes(x)) return;
      if (!rapido) {
        saida.innerHTML = `<div class="ticket-palco"><ul class="seq-tk-unico">${ticketSeqHtml(x, i)}</ul></div>`;
        TicketUI.alinharPicotes(saida);
        status.innerHTML = `${ic('impressora')} Imprimindo o ticket da peça ${i + 1}…`;
        status.hidden = false;
        imprime.classList.remove('imprimindo'); void imprime.offsetWidth; imprime.classList.add('imprimindo');
        await esperaSeq(1050);
        // a impressora joga o ticket na mão do Helpy…
        const ticket = saida.querySelector('.tkp-item');
        const escritorio = document.querySelector('.escritorio');
        const helpyEl = escritorio?.querySelector('.helpy-avatar') || escritorio;
        status.innerHTML = `${ic('robo')} Jogando para o Helpy…`;
        if (ticket && helpyEl) { ticket.style.visibility = 'hidden'; await Efeitos.voar(ticket, helpyEl, { duracao: 700, escalaFinal: .22 }); }
        if (escritorio) { escritorio.classList.remove('pegou'); void escritorio.offsetWidth; escritorio.classList.add('pegou'); }
        // …e ele guarda no pacote
        const caixa = caixaHelpySeq();
        if (helpyEl && caixa) {
          const mini = document.createElement('span');
          mini.className = 'seq-mini-ticket';
          mini.innerHTML = `${ic('ticket')} ${String(i + 1).padStart(2, '0')}`;
          const de = helpyEl.getBoundingClientRect();
          mini.style.cssText = `position:fixed; left:${de.left + de.width * .6}px; top:${de.top + de.height * .45}px;`;
          document.body.appendChild(mini);
          await esperaSeq(120);
          await Efeitos.voar(mini, caixa, { duracao: 450, escalaFinal: .5 });
          mini.remove();
        }
        saida.innerHTML = '';
        imprime.classList.remove('imprimindo');
        status.hidden = true;     // sem aviso parado: ele só aparece enquanto imprime
      }
      seqGuardadas += 1;
      atualizarPacoteSeq();
      const caixa = caixaHelpySeq();
      if (caixa) { caixa.classList.remove('recebeu'); void caixa.offsetWidth; caixa.classList.add('recebeu'); }
    } finally {
      seqNaFila -= 1;
    }
  });
  return seqFila;
}
BARRAS_EXTRAS.bipagem = ({ esq, dir, cancelar, tecla }) => {
  esq.push(tecla('btn-voltar', 'data-seq-ir="seqdestino"', '← Trocar o destino'));
  dir.push(cancelar, tecla('btn-primary', 'id="seqRegistrar" data-seq-registrar disabled', `${ic('check')} Registrar peças`));
};
TITULOS_EXTRAS.bipagem = () => `${ic('codigo-barras')} Registro em sequência`;

const digitos = (t) => String(t || '').replace(/\D/g, '');
const elSeq = (id) => document.getElementById(id);

/** Nome do cliente pela DANFE (CNPJ), ou o CNPJ formatado. */
function quemSeq(item) {
  const cli = clientes.find((c) => Catalogo.somenteDigitos(c.cnpj) === item.cnpj);
  return cli ? `<b class="cliente-ponto" style="--cor:${cli.cor}"></b> ${esc(cli.nome)}` : `CNPJ ${esc(Catalogo.formatarCnpj(item.cnpj))}`;
}

/** Visor: mensagem embaixo do campo e a cor da borda (ok / erro). */
function leituraSeq(estado, html = '') {
  const visor = elSeq('seqVisor');
  if (!visor) return;
  visor.classList.toggle('ok', estado === 'ok');
  visor.classList.toggle('erro', estado === 'erro');
  // as telinhas acendem verde (ok) ou vermelho (erro) juntas
  visor.querySelectorAll('.nc-leitor').forEach((t) => { t.classList.toggle('ok', estado === 'ok'); t.classList.toggle('erro', estado === 'erro'); });
  elSeq('seqLeitura').innerHTML = html;
  // os mesmos sons do Localizador de AWB: leitura certa, repetida ou errada
  if (window.Sons) {
    // só toca o "deu certo" quando a peça cai na lista (na Reimpressão: depois da DANFE/pedido E da AWB)
    if (estado === 'ok' && html.includes('Peça ')) Sons.tocar(html.includes('seq-repete') ? 'ja-bipado' : 'encontrado');
    else if (estado === 'erro') Sons.tocar('invalido');
  }
}

/** Confere a DANFE do visor. Devolve o resultado do Catalogo.danfe ou null (e mostra o erro). */
function conferirDanfeSeq() {
  const texto = elSeq('seqDanfe').value.trim();
  const bruto = digitos(texto);
  const cli = clienteSeq();
  const aceitaPedido = !!cli?.pedido;   // MUNDIAL: só DANFE · NEWELL BRANDS: DANFE ou pedido
  const oQue = aceitaPedido ? 'a <b>DANFE</b> ou o nº do <b>pedido</b>' : 'a <b>DANFE</b>';
  if (!texto) { leituraSeq('', ''); return null; }
  if (Catalogo.AWB.test(texto)) { leituraSeq('erro', `${ic('alerta')} Isso é uma AWB. Aqui vai ${oQue}.`); return null; }
  // Número de PEDIDO (mais curto que a DANFE): vale como está, sem NF/CNPJ.
  // Perto de 44 dígitos é DANFE bipada pela metade: aí é erro, não pedido.
  const pareceDanfe = bruto.length === 44 || (bruto.length >= 40 && bruto.length <= 48);
  if (!pareceDanfe && bruto.length >= 4 && /^[A-Z0-9][A-Z0-9_/.-]{2,29}$/i.test(texto)) {
    if (aceitaPedido) return { chave: texto.toUpperCase(), nf: '', cnpj: '', pedido: true };
    leituraSeq('erro', cli?.geral
      ? `${ic('alerta')} No <b>GERAL</b> você escolheu <b>apenas DANFE</b> (44 dígitos), não o nº do pedido.`
      : `${ic('alerta')} O <b>${esc(cli?.nome || 'cliente')}</b> só aceita <b>DANFE</b> (44 dígitos), não o nº do pedido.`);
    return null;
  }
  const d = Catalogo.danfe(bruto);
  if (!d) { leituraSeq('erro', `${ic('alerta')} Código inválido: bipe ${oQue}${aceitaPedido ? '' : ' (44 dígitos)'}.`); return null; }
  if (!d.valida) { leituraSeq('erro', `${ic('alerta')} Essa DANFE não confere (dígito verificador). Bipe de novo.`); return null; }
  // DANFE de OUTRO cliente cadastrado (pelo CNPJ): não entra na lista deste cliente
  const dono = clientes.find((c) => Catalogo.somenteDigitos(c.cnpj) === d.cnpj);
  if (cli && !cli.geral && dono && String(dono.nome).trim().toUpperCase() !== cli.nome) {   // GERAL: qualquer cliente vale
    leituraSeq('erro', `${ic('alerta')} Essa DANFE é do <b>${esc(dono.nome)}</b>, não do <b>${esc(cli.nome)}</b>.`);
    return null;
  }
  return d;
}

function vezesSeq(chave, ate = seqItens.length) {
  return seqItens.slice(0, ate).filter((x) => x.danfe === chave).length;
}

/** Joga a peça do visor para a lista e limpa o visor para a próxima. */
function adicionarSeq(d, awb = '') {
  seqItens.push({ danfe: d.chave, awb, nf: d.pedido ? '' : String(Number(d.nf)), cnpj: d.cnpj, pedido: !!d.pedido, estado: 'ok' });
  const item = seqItens[seqItens.length - 1];
  const vezes = vezesSeq(d.chave);
  elSeq('seqDanfe').value = '';
  if (elSeq('seqAwb')) elSeq('seqAwb').value = '';
  const ref = item.pedido ? `Pedido <b>${esc(item.danfe)}</b>` : `NF <b>${esc(item.nf)}</b> · ${quemSeq(item)}`;
  leituraSeq('ok', `${ic('check')} Peça ${seqItens.length}: ${ref}${vezes > 1 ? ` <span class="seq-repete">${vezes}ª vez</span>` : ''}`);
  imprimirTicketSeq(item, seqItens.length - 1);
  renderizarSeq(true);
  elSeq('seqDanfe').focus();
}

/** Enter (ou leitura completa) no campo da DANFE. */
function lerDanfeSeq() {
  const inDanfe = elSeq('seqDanfe');
  const inAwb = elSeq('seqAwb');
  const texto = inDanfe.value.trim();
  if (!texto) return;
  // bipou a AWB no lado da DANFE: passa para o lado certo
  if (inAwb && Catalogo.AWB.test(texto)) {
    inAwb.value = Catalogo.formatarAwb(texto);
    inDanfe.value = '';
    leituraSeq('', `${ic('relogio')} AWB guardada. Agora bipe a <b>DANFE</b>.`);
    inDanfe.focus();
    return;
  }
  const d = conferirDanfeSeq();
  if (!d) { inDanfe.select(); return; }
  if (!inAwb) { adicionarSeq(d); return; }
  // Reimpressão: com a AWB já no visor, a peça vai direto; senão, pula para a AWB
  if (Catalogo.AWB.test(inAwb.value.trim())) { adicionarSeq(d, Catalogo.formatarAwb(inAwb.value.trim())); return; }
  leituraSeq('ok', `${ic('check')} ${d.pedido ? `Pedido <b>${esc(d.chave)}</b>` : `NF <b>${esc(String(Number(d.nf)))}</b> · ${quemSeq({ cnpj: d.cnpj })}`} · agora a <b>AWB</b>`);
  inAwb.focus();
}

/** Enter (ou leitura completa) no campo da AWB. */
function lerAwbSeq() {
  const inDanfe = elSeq('seqDanfe');
  const inAwb = elSeq('seqAwb');
  const awb = inAwb.value.trim();
  if (!awb) return;
  if (!Catalogo.AWB.test(awb)) { leituraSeq('erro', `${ic('alerta')} AWB: TXA + letra + 9 números + tx.`); inAwb.select(); return; }
  inAwb.value = Catalogo.formatarAwb(awb);
  if (!inDanfe.value.trim()) { leituraSeq('', `${ic('relogio')} AWB guardada. Agora bipe a <b>DANFE</b>.`); inDanfe.focus(); return; }
  const d = conferirDanfeSeq();
  if (!d) { inDanfe.focus(); inDanfe.select(); return; }
  adicionarSeq(d, inAwb.value);
}

/** A lista embaixo do visor (a mais nova em cima). */
function renderizarSeq(novo = false) {
  const lista = elSeq('seqLista');
  if (!lista) return;
  const m = modoSeq();
  lista.innerHTML = seqItens.length ? seqItens.map((x, i) => {
    const vezes = vezesSeq(x.danfe, i + 1);
    const info = x.estado === 'feito' ? `${ic('check')} <b>${esc(x.codigo)}</b> registrado`
      : x.estado === 'falha' ? `${ic('alerta')} ${esc(x.erro || 'Não registrou')}`
        : `${x.pedido ? 'Pedido' : `NF <b>${esc(x.nf)}</b> · ${quemSeq(x)}`}${m.awb && x.awb ? ` · AWB <b>${esc(x.awb)}</b>` : ''}${vezes > 1 ? ` <span class="seq-repete">${vezes}ª vez</span>` : ''}`;
    return `
      <li class="seq-item ${x.estado} ${novo && i === seqItens.length - 1 ? 'chegou' : ''}" style="order:${seqItens.length - i}">
        <span class="seq-n">${String(i + 1).padStart(2, '0')}</span>
        <span class="seq-item-danfe"><b class="tk-mono">${esc(x.pedido ? x.danfe : Catalogo.formatarChave(x.danfe))}</b><small>${info}</small></span>
        ${x.estado === 'feito' ? '<span></span>' : `<button type="button" class="btn key--red key--icon seq-tirar" data-tirar-item="${i}" title="Tirar da lista" aria-label="Tirar a peça ${i + 1} da lista">${ic('x')}</button>`}
      </li>`;
  }).join('') : `<li class="seq-vazia">${ic('codigo-barras')} As peças bipadas aparecem aqui.</li>`;
  atualizarContagem();
}

function atualizarContagem() {
  const prontas = seqItens.filter((x) => x.estado === 'ok').length;
  const feitas = seqItens.filter((x) => x.estado === 'feito').length;
  const falhas = seqItens.filter((x) => x.estado === 'falha').length;
  const cont = elSeq('seqContagem');
  atualizarPacoteSeq();
  if (cont) cont.innerHTML = `<b>${prontas}</b> para registrar${feitas ? ` · ${feitas} registrada${feitas > 1 ? 's' : ''}` : ''}${falhas ? ` · <span class="seq-erro">${falhas} com erro</span>` : ''}`;
  const botao = elSeq('seqRegistrar');
  if (botao) {
    botao.disabled = !prontas;
    botao.innerHTML = `${ic('check')} Registrar ${prontas || ''} peça${prontas === 1 ? '' : 's'}`;
  }
}

LIGAR_EXTRAS.bipagem = () => {
  seqItens = seqItens.filter((x) => x.estado !== 'feito');   // as já registradas não voltam para a lista
  // o pacote na mesinha do Helpy: as peças que já estavam na lista já estão guardadas
  seqGuardadas = seqItens.length;
  caixaHelpySeq();
  const inDanfe = elSeq('seqDanfe');
  const inAwb = elSeq('seqAwb');
  renderizarSeq();
  inDanfe.focus();
  [inDanfe, inAwb].filter(Boolean).forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (inp === inDanfe) lerDanfeSeq(); else lerAwbSeq();
    });
  });
  inDanfe.addEventListener('input', () => {
    const n = digitos(inDanfe.value);
    if (!inDanfe.value.trim()) { leituraSeq('', ''); return; }
    // leitor sem "Enter": a DANFE completa (44 dígitos válidos) já segue sozinha
    if (n.length === 44 && Catalogo.danfe(n)?.valida) setTimeout(lerDanfeSeq, 40);
    else if (inAwb && Catalogo.AWB.test(inDanfe.value.trim())) setTimeout(lerDanfeSeq, 40);
    else leituraSeq('', `${ic('relogio')} ${n.length >= 30 ? `${n.length} de 44 dígitos` : clienteSeq()?.pedido ? 'DANFE (44 dígitos) ou nº do pedido + Enter' : 'DANFE (44 dígitos)'}`);
  });
  inAwb?.addEventListener('input', () => {
    if (Catalogo.AWB.test(inAwb.value.trim())) setTimeout(lerAwbSeq, 40);
  });
  // colar uma lista (do Excel): cada linha vira uma peça; "DANFE<TAB>AWB" preenche as duas
  inDanfe.addEventListener('paste', (e) => {
    const texto = e.clipboardData?.getData('text') || '';
    if (!/\n/.test(texto.trim())) return;
    e.preventDefault();
    let ok = 0; let erro = 0;
    texto.trim().split(/\r?\n/).forEach((l) => {
      const [danfe = '', awb = ''] = l.split(/\t|;/).map((x) => x.trim());
      const d = Catalogo.danfe(digitos(danfe));
      const dono = d?.valida ? clientes.find((c) => Catalogo.somenteDigitos(c.cnpj) === d.cnpj) : null;
      const outro = dono && clienteSeq() && !clienteSeq().geral && String(dono.nome).trim().toUpperCase() !== clienteSeq().nome;
      if (!d?.valida || outro || (inAwb && !Catalogo.AWB.test(awb))) { erro += 1; return; }
      seqItens.push({ danfe: d.chave, awb: inAwb ? Catalogo.formatarAwb(awb) : '', nf: String(Number(d.nf)), cnpj: d.cnpj, estado: 'ok' });
      imprimirTicketSeq(seqItens[seqItens.length - 1], seqItens.length - 1);
      ok += 1;
    });
    renderizarSeq(true);
    leituraSeq(erro ? 'erro' : 'ok', `${ic(erro ? 'alerta' : 'check')} ${ok} peça${ok === 1 ? '' : 's'} da lista colada${erro ? ` · ${erro} linha${erro > 1 ? 's' : ''} com erro ficaram de fora` : ''}`);
  });
  elSeq('seqLista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tirar-item]');
    if (!b) return;
    seqItens.splice(Number(b.dataset.tirarItem), 1);
    renderizarSeq();
    inDanfe.focus();
  });
  const cli = clienteSeq();
  const oQue = cli?.pedido ? 'a DANFE (ou o nº do pedido)' : 'a DANFE';
  // a explicação aparece UMA vez por registro em sequência e depois some (aí ele volta às falas normais)
  if (seqExplicou) return;
  seqExplicou = true;
  const de = cli?.geral ? `de <strong>qualquer cliente</strong> (${esc(cli.regra)})` : `do <strong>${esc(cli?.nome || '')}</strong>`;
  helpy.dizer(`Pode bipar as peças ${de}! 🔫 ${modoSeq().awb ? `${oQue[0].toUpperCase() + oQue.slice(1)} e a AWB de cada peça.` : `Uma atrás da outra: ${oQue}.`} A impressora imprime o ticket de cada peça e joga pra mim, que eu guardo no <strong>pacote</strong> aqui da mesinha 📦 Clica nele pra ver. No fim, é só clicar em <strong>Registrar</strong>!`).then(() => sumirFalaSeq(12000));
};

async function registrarSequencia() {
  const m = modoSeq();
  const d = destinoSeq();
  const pendentes = seqItens.filter((x) => x.estado === 'ok' || x.estado === 'falha');
  if (!pendentes.length) return;
  // Uma peça só: pergunta da etiqueta ANTES de registrar; o X cancela (a peça continua na lista)
  let imprimirUma = null;
  if (pendentes.length === 1) {
    imprimirUma = await perguntarImpressaoLote([volumeSeq(pendentes[0], seqItens.indexOf(pendentes[0]))], { antes: true });
    if (imprimirUma === null) { elSeq('seqDanfe')?.focus(); return; }
  } else if (!await confirmarRegistroSeq(pendentes)) {
    // mais de uma peça: confirma antes de registrar (Cancelar ou o X: nada muda)
    elSeq("seqDanfe")?.focus();
    return;
  }
  const botao = elSeq('seqRegistrar');
  botao.disabled = true;
  const feitos = []; const falhas = [];
  // Toda a leva vai num "pacote de tickets": na mesa (e no Histórico) aparece como um cartão só
  const np = await API.novoPacote();
  const pacote = np.ok ? np.dados.id : `pac-${Date.now().toString(36)}`;
  for (const [i, x] of pendentes.entries()) {
    botao.innerHTML = `${ic('relogio')} Registrando ${i + 1} de ${pendentes.length}…`;
    const r = await API.inserirVolume({
      tipo: m.tipo, status: d.status, local: d.local, codigo_caixa: x.danfe, pacote,
      // GERAL: sem cliente fixo (o sistema acha o cliente pelo CNPJ da DANFE)
      ...(clienteSeq() && !clienteSeq().geral ? { cliente_nome: dadosClienteSeq(clienteSeq().nome)?.nome || clienteSeq().nome } : {}),
      ...(m.awb ? { awb: x.awb } : {}),
    });
    if (r.ok) { feitos.push(r.dados); x.estado = 'feito'; x.codigo = r.dados.codigo; }
    else { falhas.push(r.dados.erro); x.estado = 'falha'; x.erro = r.dados.erro; }
  }
  await atualizar(true);
  renderizarSeq();
  if (!feitos.length) { helpy.dizer(`Não consegui registrar: ${esc(falhas[0] || 'erro')}`, { tipo: 'alerta', humor: 'alerta' }); return; }
  const codigos = `${feitos[0].codigo}${feitos.length > 1 ? ` a ${feitos[feitos.length - 1].codigo}` : ''}`;
  Efeitos.toast(`${feitos.length} peça${feitos.length > 1 ? 's' : ''} registrada${feitos.length > 1 ? 's' : ''}: <b>${esc(codigos)}</b>`, { icone: ic('check'), tipo: 'sucesso', duracao: 6000 });
  // Tudo certo e mais de uma peça: a telinha da impressora imprime a etiqueta do PACOTE e volta para a mesa
  if (feitos.length > 1 && !falhas.length) {
    await animarPacote(feitos);
    return;
  }
  // Uma peça só: já respondeu antes de registrar. Com erro na lista (fica nesta tela
  // para corrigir): pergunta agora; o X aqui é só "não imprimir".
  const imprimir = pendentes.length === 1 ? imprimirUma : await perguntarImpressaoLote(feitos);
  if (imprimir) {
    const r = feitos.length > 1 ? await Impressao.imprimirPacote(feitos).catch((e) => ({ ok: false, erro: e.message })) : await Impressao.imprimir(feitos[0]).catch((e) => ({ ok: false, erro: e.message }));
    if (r?.ok) Efeitos.toast(feitos.length > 1 ? `Etiqueta do pacote <b>${esc(Impressao.codigoPacote(pacote))}</b> mandada para a impressora.` : 'Etiqueta mandada para a impressora.', { icone: ic('impressora'), tipo: 'sucesso' });
    else Efeitos.toast(`Não imprimiu: ${esc(r?.erro || 'impressora indisponível')}`, { icone: ic('alerta'), tipo: 'alerta', duracao: 8000 });
  }
  const resto = falhas.length;
  const st = Catalogo.statusDe(d.status);
  helpy.dizer(`<p>Pronto! Registrei <strong>${feitos.length}</strong> peça${feitos.length > 1 ? 's' : ''} como <strong>${esc(st.titulo)}</strong>:</p>${Helpy.listaTickets(feitos.map((v) => ({ codigo: v.codigo, extra: v.nf ? 'NF ' + v.nf : '' })))}
    ${feitos.length > 1 ? `<p>${ic('pacote')} Juntei tudo num <strong>pacote de tickets</strong> 📦 ${st.saida ? 'no <a href="historico.html">Histórico de Tickets</a>' : 'na mesa'}: clica nele pra ver todos.</p>` : (st.saida ? `<p>Como já saiu como ${esc(st.titulo)}, está no <a href="historico.html">Histórico de Tickets</a>.</p>` : '')}
    ${resto ? `<p>${resto} peça${resto > 1 ? 's ficaram' : ' ficou'} na lista com erro.</p>` : ''}`, {
    humor: 'comemorando', tipo: 'sucesso',
    acoes: resto ? [] : [{ rotulo: `${ic('pacote')} Voltar para a mesa`, destaque: true, fn: () => irPara('mesa', 'esq', { falar: false }) }, { rotulo: `${ic('codigo-barras')} Bipar mais`, fn: () => irPara('bipagem', 'dir', { falar: false }) }],
  });
}

/**
 * "Deseja imprimir a etiqueta?" com Não, só registrar | Sim, imprimir e o X no canto.
 * Resolve true (imprimir), false (só registrar) ou null (X / Esc: cancelar).
 * antes: perguntado ANTES de registrar (uma peça só): o X cancela o registro.
 */
function perguntarImpressaoLote(lista, { antes = false } = {}) {
  return new Promise((resolver) => {
    const d = document.createElement('dialog');
    d.className = 'modal modal-pergunta seq-pergunta';
    const v = lista[0];
    const ref = antes ? `<b>${esc(v.codigo)}</b>${v.nf ? ` · NF ${esc(v.nf)}` : v.pedido ? ` · Pedido ${esc(v.pedido)}` : ''}` : `<b>${esc(v.codigo)}</b>`;
    d.innerHTML = `
      <div class="modal-conteudo">
        <button type="button" class="btn key--icon modal-x" data-resposta="cancelar" title="Cancelar${antes ? ' (a peça continua na lista)' : ''}" aria-label="Cancelar">${ic('x')}</button>
        <span class="pergunta-ico">${ic('impressora')}</span>
        <h2>${lista.length > 1 ? 'Imprimir a etiqueta do pacote?' : 'Deseja imprimir a etiqueta?'}</h2>
        <p>${lista.length > 1 ? `Pacote <b>${esc(Impressao.codigoPacote(v.pacote))}</b> · <b>${lista.length} tickets</b> (${esc(v.codigo)} a ${esc(lista[lista.length - 1].codigo)})` : ref} · ${esc(v.tipo_titulo)} · ${esc(v.status_titulo)}</p>
        <div class="modal-acoes">
          <button type="button" class="btn" data-resposta="nao">Não, só registrar</button>
          <button type="button" class="btn btn-primary btn-lg" data-resposta="sim">${ic('impressora')} Sim, imprimir${lista.length > 1 ? ' o pacote' : ''}</button>
        </div>
      </div>`;
    const fim = (valor) => { d.close(); d.remove(); resolver(valor); };
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-resposta]');
      if (b) fim({ sim: true, nao: false, cancelar: null }[b.dataset.resposta]);
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); fim(null); });
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('[data-resposta="sim"]').focus();
  });
}

/* ---------- 2) Enviar e-mail dos tickets selecionados na mesa ---------- */
let emailSelecao = [];          // números (chave interna) selecionados quando o botão foi clicado
const marcadosEmail = new Set();
const volumesEmail = () => emailSelecao.map((n) => volumes.find((v) => v.numero === n)).filter(Boolean);

function abrirEmailsSelecionados() {
  emailSelecao = [...selecionados];
  if (!emailSelecao.length) {
    Efeitos.toast('Marque a caixinha dos tickets que vão no e-mail e clique de novo no envelope.', { icone: ic('envelope') });
    return;
  }
  marcadosEmail.clear();
  emailSelecao.forEach((n) => marcadosEmail.add(n));
  irPara('emails', 'dir', { falar: false });
}

function telaEmails() {
  const lista = volumesEmail().sort((a, b) => (a.ciclo || '').localeCompare(b.ciclo || '') || (a.id_ciclo ?? a.numero) - (b.id_ciclo ?? b.numero));
  return `
    <div class="email-topo">
      <h2>${ic('envelope')} Tickets selecionados <span class="contador">${lista.length}</span></h2>
      <p>1) <b>Copiar a tabela</b> e colar no e-mail · 2) Depois de enviar, <b>marcar como E-mail enviado</b> (se for o caso).</p>
    </div>
    ${Email.tabela(lista, { colunas: Planilha.COLUNAS, marcados: marcadosEmail })}`;
}

const selecionadosEmail = () => volumesEmail().filter((v) => marcadosEmail.has(v.numero));

BARRAS_EXTRAS.emails = ({ esq, dir, tecla }) => {
  esq.push(tecla('btn-voltar', 'data-emails-voltar', '← Voltar para a mesa'));
  const n = selecionadosEmail().length;
  const paraMarcar = selecionadosEmail().filter((v) => !Catalogo.saiu(v) && v.status !== 'email-enviado').length;
  dir.push(
    tecla('', `data-email-copiar ${n ? '' : 'disabled'} title="Copia a tabela (com cabeçalho) para colar no corpo do e-mail"`, `${ic('copiar')} Copiar tabela`),
    tecla('btn-primary', `data-email-enviado ${paraMarcar ? '' : 'disabled'}`, `${ic('enviar')} Marcar ${paraMarcar} como E-mail enviado`),
  );
};
TITULOS_EXTRAS.emails = () => `${ic('envelope')} Enviar e-mail`;
LIGAR_EXTRAS.emails = () => {
  encaixarTabela(elPalco.querySelector('.etapa-tela'));
  helpy.dizer('Copie a tabela e cole no e-mail. Depois de enviar, marque como <strong>E-mail enviado</strong>.');
};

document.addEventListener('change', (e) => {
  if (etapaAtual !== 'emails') return;
  if (Email.aoMarcar(e, marcadosEmail, volumesEmail())) renderizarCabecalho();
});

document.addEventListener('click', async (e) => {
  const alvo = (s) => e.target.closest(s);
  if (alvo('[data-seq-ir]') && !alvo('[data-seq-ir]').disabled) irPara(alvo('[data-seq-ir]').dataset.seqIr, alvo('[data-seq-ir]').dataset.seqIr === 'bipagem' ? 'dir' : 'esq');
  else if (alvo('[data-seq-registrar]') && !alvo('[data-seq-registrar]').disabled) registrarSequencia();
  else if (alvo('[data-emails-voltar]')) irPara('mesa', 'esq', { falar: false });
  else if (alvo('[data-email-copiar]') && etapaAtual === 'emails') {
    await Email.copiar(selecionadosEmail(), Planilha.COLUNAS, 'tickets selecionados');
  } else if (alvo('[data-email-enviado]') && etapaAtual === 'emails') {
    const lista = selecionadosEmail().filter((v) => !Catalogo.saiu(v) && v.status !== 'email-enviado');
    if (!lista.length) return;
    await marcarEmailsEnviados(lista);
    selecionados.clear();
    irPara('mesa', 'esq', { falar: false });
  }
});

RENDER.seqcliente = telaSeqCliente;
RENDER.sequencia = telaSequencia;
RENDER.seqdestino = telaSeqDestino;
RENDER.bipagem = telaBipagem;
RENDER.emails = telaEmails;
RENDER.seqpacote = telaSeqPacote;

/** Confirmação antes de registrar várias peças: X e Cancelar não mudam nada. Resolve true para registrar. */
function confirmarRegistroSeq(pendentes) {
  return new Promise((resolver) => {
    const n = pendentes.length;
    const st = Catalogo.statusDe(destinoSeq().status);
    const local = Catalogo.local(destinoSeq().local);
    const d = document.createElement('dialog');
    d.className = 'modal modal-pergunta seq-pergunta';
    d.innerHTML = `
      <div class="modal-conteudo">
        <button type="button" class="btn key--icon modal-x" data-resposta="nao" title="Cancelar" aria-label="Cancelar">${ic('x')}</button>
        <span class="pergunta-ico">${ic('pacote')}</span>
        <h2>Registrar ${n} peças?</h2>
        <p><b>${esc(clienteSeq()?.nome || '')}</b> · ${esc(modoSeq().titulo)} · ${esc(st?.titulo || '')} · ${esc(local?.titulo || '')}.<br>Elas viram ${n} tickets num <b>pacote</b> e o ticket do pacote é impresso.</p>
        <div class="modal-acoes">
          <button type="button" class="btn" data-resposta="nao">Cancelar</button>
          <button type="button" class="btn btn-primary btn-lg" data-resposta="sim">${ic('check')} Registrar ${n} peças</button>
        </div>
      </div>`;
    const fim = (sim) => { d.close(); d.remove(); resolver(sim); };
    d.addEventListener('click', (e) => { const b = e.target.closest('[data-resposta]'); if (b) fim(b.dataset.resposta === 'sim'); });
    d.addEventListener('cancel', (e) => { e.preventDefault(); fim(false); });
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('[data-resposta="sim"]').focus();
  });
}
