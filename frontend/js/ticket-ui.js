/* =========================================================
   ticket-ui.js — o ticket do volume, igual em todas as telas
   - TicketUI.padrao(v, {...}): ticket 300×200 da mesa/bandeja/listas.
     A FAIXA DO TOPO tem a cor do CLIENTE.
   - TicketUI.grande(d): ticket grande (revisão, impressão, rever).
   - TicketUI.abrir(v): modal com o ticket grande.
   - Busca.volume(v, termo): busca tolerante (acento, caixa, erros).
   ========================================================= */

/* ---------- Busca tolerante: sem acento, sem caixa alta e com pequenos erros ---------- */
const Busca = {
  normalizar(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9#\s]/g, ' ').replace(/\s+/g, ' ').trim();
  },
  /** Distância de edição (Levenshtein), parando cedo quando passa do limite. */
  distancia(a, b, limite = 2) {
    if (Math.abs(a.length - b.length) > limite) return limite + 1;
    let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const atual = [i];
      let menor = i;
      for (let j = 1; j <= b.length; j++) {
        atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        menor = Math.min(menor, atual[j]);
      }
      if (menor > limite) return limite + 1;
      anterior = atual;
    }
    return anterior[b.length];
  },
  palavraCombina(q, palavras) {
    const limite = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
    return palavras.some((p) => p.includes(q)
      || (limite && (this.distancia(q, p, limite) <= limite || this.distancia(q, p.slice(0, q.length), limite) <= limite)));
  },
  /** O volume combina com TODAS as palavras da busca? (#ID, NF, AWB, DANFE, cliente, tipo, status, local…) */
  volume(v, consulta) {
    // DANFE / CNPJ digitados com espaço, ponto ou barra ("3526 1144 …", "11.222.333/0001-44") viram um número só
    const bruto = String(consulta ?? '').trim();
    const soNumero = /^[\d\s.\-/]+$/.test(bruto) && bruto.replace(/\D/g, '').length >= 10;
    const termos = soNumero ? [bruto.replace(/\D/g, '')] : this.normalizar(consulta).split(' ').filter(Boolean);
    if (!termos.length) return true;
    const palavras = this.normalizar([
      v.codigo, v.tipo_titulo, v.status_titulo, v.local_titulo, v.cliente_nome, v.nf, v.serie, v.cnpj,
      v.chave, v.pedido, v.awb, v.nota, v.criado_por, Catalogo.prazo(v) === 'vencido' ? 'vencido' : '',
    ].filter(Boolean).join(' ')).split(' ');
    return termos.every((q) => this.termoCombina(v, q, palavras));
  },

  /**
   * Cada termo é reconhecido pelo formato e procurado só no campo dele (busca certeira):
   *  #020                → #ID exato
   *  TXAQ123456789tx     → AWB (TXA + letra + 9 números + tx); "TXA…" incompleto = começo da AWB
   *  44 dígitos          → DANFE exata · 10 a 43 dígitos → pedaço da DANFE / CNPJ (bipando)
   *  até 9 dígitos       → NF exata (ou número do pedido)
   *  texto               → cliente, tipo, status, local, nota… (tolera acento e erro de digitação)
   */
  termoCombina(v, q, palavras) {
    const digitos = (t) => String(t ?? '').replace(/\D/g, '');
    const semZeros = (t) => digitos(t).replace(/^0+(?=\d)/, '');
    if (q.startsWith('#')) {
      const n = q.slice(1);
      return /^\d+$/.test(n) && Number(n) === (v.id_ciclo ?? v.numero);
    }
    if (/^txa/.test(q)) {
      const awb = String(v.awb || '').toLowerCase();
      return /^txa[a-z]\d{9}tx$/.test(q) ? awb === q : awb.startsWith(q);
    }
    if (/^\d+$/.test(q)) {
      if (q.length === 44) return digitos(v.chave) === q;
      if (q.length >= 10) return digitos(v.chave).includes(q) || digitos(v.cnpj) === q || digitos(v.pedido) === q;
      return (v.nf && semZeros(v.nf) === semZeros(q)) || String(v.pedido || '').toLowerCase() === q;
    }
    if (String(v.pedido || '').toLowerCase() === q) return true;
    return this.palavraCombina(q, palavras);
  },
};
window.Busca = Busca;

const TicketUI = {
  esc: (texto) => escaparHtml(String(texto ?? '')),
  dataBr: (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'),
  dataHoraBr(iso) { return iso ? `${this.dataBr(iso)} às ${formatarHora(iso)}` : '—'; },

  /** "entrou hoje", "há 1 dia", "há 5 dias" (ou "ficou 5 dias" se já saiu). */
  tempoNoSetor(v) {
    const d = Catalogo.dias(v);
    const dia = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (Catalogo.saiu(v)) return d === 0 ? `entrou e saiu ${dia(v.data_saida)}` : `ficou ${d} dia${d > 1 ? 's' : ''} no NC`;
    return d === 0 ? 'entrou hoje' : d === 1 ? 'entrou ontem' : `há ${d} dias`;
  },

  /** Selo do cliente no canto da faixa. */
  selo(v) {
    const nome = v.cliente_nome || 'Sem cliente';
    return `<span class="tkp-pri tkp-cliente" title="${this.esc(nome)}">${this.esc(nome)}</span>`;
  },

  /** Relógio dos Sem integração (passe o mouse: quanto falta para os 10 dias) e selo do Extravio. */
  aviso(v) {
    const prazo = Catalogo.prazo(v);
    if (prazo) {
      const resta = Catalogo.diasRestantes(v);
      const limite = new Date(new Date(v.data_entrada).getTime() + Catalogo.PRAZO_DIAS * 86400000).toLocaleDateString('pt-BR');
      const texto = prazo === 'vencido'
        ? `Passou de ${Catalogo.PRAZO_DIAS} dias (limite era ${limite}): precisa virar devolução`
        : resta <= 0 ? `Último dia: o prazo vence hoje (${limite})` : `Faltam ${resta} dia${resta > 1 ? 's' : ''} para os ${Catalogo.PRAZO_DIAS} dias (até ${limite})`;
      // "10 DIAS RESTANTES" … "1 DIA RESTANTE": com 1 dia (ou menos) o relógio fica vermelho e treme
      const rotulo = prazo === 'vencido' ? 'Prazo vencido'
        : resta <= 0 ? 'Último dia'
          : `${resta} ${resta === 1 ? 'dia restante' : 'dias restantes'}`;
      const urgente = prazo === 'vencido' || resta <= 1;
      return `<span class="nc-relogio ${urgente ? 'rel-urgente' : ''}" title="${texto}" aria-label="${texto}" tabindex="0">${ic('relogio')}<span class="rel-txt">${rotulo}</span></span>`;
    }
    if (Catalogo.tipo(v.tipo)?.critico && !Catalogo.saiu(v)) return `<span class="nc-prazo critico" title="Extravio: encaminhar ao setor GRIS">${ic('sirene')} GRIS</span>`;
    return '';
  },

  classesExtras(v) {
    const prazo = Catalogo.prazo(v);
    return [
      prazo && prazo !== 'ok' ? `prazo-${prazo}` : '',
      Catalogo.tipo(v.tipo)?.critico && !Catalogo.saiu(v) ? 'nc-critico' : '',
    ].join(' ');
  },

  /** Carimbo de saída: só o status e a data. */
  carimbo(v, grande = false) {
    if (!Catalogo.saiu(v)) return '';
    const st = Catalogo.statusDe(v.status);
    return `<div class="carimbo-resolvido carimbo-${v.status} ${grande ? 'grande' : ''}" role="img" aria-label="${st.titulo} em ${this.dataBr(v.data_saida)}">
      <b>${st.titulo}</b><small>${this.dataBr(v.data_saida)}</small></div>`;
  },

  /** Ícone de onde a caixa está (na faixa do ticket). */
  /** Marcador do mês: "Do mês anterior · Out/2026" (ficou do ciclo fechado) ou só o mês (consulta). */
  marcaMes(v, mostrar = false) {
    if (!v.ciclo_titulo || (!v.anterior && !mostrar)) return '';
    const texto = v.anterior ? `Do mês anterior · ${v.ciclo_titulo}` : v.ciclo_titulo;
    const dica = v.anterior ? `Este volume é de ${v.ciclo_titulo} e passou para o mês atual com o mesmo #ID` : `Mês: ${v.ciclo_titulo}`;
    return `<span class="tkp-mes ${v.anterior ? 'antigo' : ''}" title="${this.esc(dica)}">${ic('relogio')}${this.esc(texto)}</span>`;
  },

  seloLocal(v) {
    const l = Catalogo.local(v.local);
    if (!l) return '';
    return `<span class="tkp-local" title="${this.esc(l.titulo)}" aria-label="Está em: ${this.esc(l.titulo)}">${ic(this.iconeLocal(v.local))}</span>`;
  },

  /**
   * Ticket padrão.
   * caixa: 'mesa' | 'hist' | null (caixinha de seleção) · marcado · giro (graus) · clique (abre no centro/modal)
   * enxuto: só tipo, NF e destino (bandeja "Saíram hoje")
   */
  padrao(v, { i = 0, giro = 0, caixa = null, marcado = false, clique = true, classe = '', carimbo = null, enxuto = false, mes = false } = {}) {
    const esc = this.esc;
    const comCarimbo = carimbo ?? Catalogo.saiu(v);
    const rotulo = `Volume ${v.codigo}: ${v.tipo_titulo}, ${v.status_titulo}, ${v.local_titulo}, ${v.cliente_nome || 'sem cliente'}`;
    const caixinha = caixa ? `
      <label class="tkp-caixa" title="${caixa === 'hist' ? 'Marcar para tirar da bandeja' : 'Marcar para excluir'}">
        <input type="checkbox" data-marcar="${v.numero}" ${caixa === 'hist' ? 'data-lista="hist"' : ''} ${marcado ? 'checked' : ''} aria-label="Marcar ${esc(v.codigo)}" />
        <span aria-hidden="true">${ic('check')}</span>
      </label>` : '';
    const ref = v.nf ? `NF ${v.nf}` : v.pedido ? `Pedido ${v.pedido}` : '';
    const rodape = enxuto
      ? `<span class="tkp-destino">${ic(this.iconeLocal(v.local))} ${esc(v.local_titulo)}</span>`
      : comCarimbo
        // já saiu: o carimbo mostra o status e a data; aqui fica quanto tempo ficou no NC
        ? `<span class="tkp-tempo" title="${esc(this.tempoNoSetor(v))}">${ic('relogio')} ${this.tempoNoSetor(v)}</span>
         <span>${ic(this.iconeLocal(v.local))} ${esc(v.local_titulo)}</span>`
        : `<span><span class="tag ${classeStatus(v.status)}">${esc(v.status_titulo)}</span> ${this.tempoNoSetor(v)}</span>
         <span>${ic(this.iconeLocal(v.local))} ${esc(v.local_titulo)}${v.awb && !comCarimbo ? ` · AWB <b>${esc(v.awb)}</b>` : ''}</span>`;
    return `
      <li class="tkp-item ${comCarimbo ? 'tkp-hist' : ''} ${enxuto ? 'tkp-enxuto' : ''} ${marcado ? 'marcado' : ''} ${v.anterior ? 'tkp-antigo' : ''} ${this.classesExtras(v)} ${classe}" style="--i:${i}; --giro:${giro}deg" data-numero="${v.numero}">
        <div class="tkp-sombra">
          <article class="tkp ticket pri-cliente" style="${Catalogo.estiloCliente(v.cliente_cor)}">
            <header class="tkp-faixa"><span class="tkp-codigo">${esc(v.codigo)}</span>
              <span class="tkp-faixa-dir">${this.seloLocal(v)}${this.selo(v)}</span></header>
            ${this.marcaMes(v, mes)}
            <div class="tkp-corpo">
              <span class="mini-ico">${Catalogo.icone(v.tipo)}</span>
              <div class="tkp-tipo"><strong>${esc(v.tipo_titulo)}</strong><span>${esc(ref)}</span></div>
              ${enxuto ? '' : this.aviso(v)}
            </div>
            <span class="ticket-picote"></span>
            <footer class="tkp-rodape">${rodape}</footer>
            ${comCarimbo ? this.carimbo(v) : ''}
          </article>
          ${clique ? `<button type="button" class="tkp-abrir" data-ver="${v.numero}" aria-label="${esc(rotulo)}. Abrir"></button>` : ''}
          ${caixinha}
        </div>
      </li>`;
  },

  /* ---------- Pacote de tickets (Registro em sequência) ----------
     As peças registradas na mesma leva têm o mesmo "pacote". Na mesa e no
     Histórico elas aparecem como UM cartão; clicando, abre com todas dentro. */

  /**
   * Junta os volumes do mesmo pacote, na ordem da lista.
   * Devolve [{ volume }] ou [{ pacote, membros }]. Pacote com 1 peça só vira ticket normal.
   */
  agrupar(lista) {
    const grupos = new Map();
    lista.forEach((v) => { if (v.pacote) (grupos.get(v.pacote) || grupos.set(v.pacote, []).get(v.pacote)).push(v); });
    const feitos = new Set();
    const saida = [];
    for (const v of lista) {
      const g = v.pacote ? grupos.get(v.pacote) : null;
      if (g && g.length > 1) {
        if (feitos.has(v.pacote)) continue;
        feitos.add(v.pacote);
        saida.push({ pacote: v.pacote, membros: g.slice().sort((a, b) => (a.id_ciclo ?? a.numero) - (b.id_ciclo ?? b.numero)) });
      } else {
        saida.push({ volume: v });
      }
    }
    return saida;
  },

  /** "#013 a #016" (ou a lista, se os #IDs não forem seguidos). */
  faixaCodigos(membros) {
    const ids = membros.map((v) => v.id_ciclo ?? v.numero);
    const seguidos = ids.every((n, i) => i === 0 || n === ids[i - 1] + 1);
    return seguidos ? `${membros[0].codigo} a ${membros[membros.length - 1].codigo}` : membros.map((v) => v.codigo).join(', ');
  },

  /** "pct-007" → "PCT 007" (pacotes antigos, sem número, ficam só "Pacote"). */
  codigoPacote(id) {
    const m = /^pct-(\d+)$/.exec(String(id || ''));
    return m ? `PCT ${m[1]}` : 'Pacote';
  },

  /**
   * Cartão do pacote: tickets empilhados e amarrados com barbante. Mesmo tamanho de um ticket.
   * caixa: mostra a caixinha de seleção (marca todos os tickets do pacote de uma vez).
   */
  pacote(membros, { i = 0, giro = 0, classe = '', caixa = false, marcado = false } = {}) {
    const esc = this.esc;
    const v = membros[0];
    const n = membros.length;
    const saiu = membros.every((x) => Catalogo.saiu(x));
    const status = [...new Set(membros.map((x) => x.status_titulo))].join(' / ');
    const local = [...new Set(membros.map((x) => x.local_titulo))].join(' / ');
    const quando = this.dataBr(v.data_entrada);
    const rotulo = `Pacote de ${n} tickets ${this.faixaCodigos(membros)}: ${v.tipo_titulo}, ${status}`;
    return `
      <li class="tkp-item tkp-pacote-item ${saiu ? 'tkp-hist' : ''} ${caixa ? 'com-caixa' : ''} ${marcado ? 'marcado' : ''} ${classe}" style="--i:${i}; --giro:${giro}deg" data-numero="p:${esc(v.pacote)}" data-pacote="${esc(v.pacote)}" data-membros="${membros.map((x) => x.numero).join(',')}">
        <div class="tkp-sombra">
          <article class="tkp ticket tkp-pacote">
            <header class="tkp-faixa"><span class="tkp-codigo">${ic('pacote')} ${esc(this.codigoPacote(v.pacote))}</span>
              <span class="tkp-faixa-dir"><span class="pacote-qtd">${n} tickets</span></span></header>
            <div class="tkp-corpo">
              <span class="mini-ico">${Catalogo.icone(v.tipo)}</span>
              <div class="tkp-tipo"><strong>${esc(v.tipo_titulo)}</strong><span class="tk-mono">${esc(this.faixaCodigos(membros))}</span></div>
            </div>
            <span class="ticket-picote"></span>
            <footer class="tkp-rodape">
              <span><span class="tag ${classeStatus(v.status)}">${esc(status)}</span> ${esc(quando)}</span>
              <span>${ic(this.iconeLocal(v.local))} ${esc(local)}</span>
            </footer>
            <span class="pacote-barbante" aria-hidden="true"></span>
            <span class="pacote-etiqueta" aria-hidden="true">${n}</span>
          </article>
          <button type="button" class="tkp-abrir" data-abrir-pacote="${esc(v.pacote)}" aria-label="${esc(rotulo)}. Abrir o pacote"></button>
          ${caixa ? `<label class="tkp-caixa" title="Marcar o pacote inteiro (${n} tickets) para excluir">
            <input type="checkbox" data-marcar-pacote="${esc(v.pacote)}" ${marcado ? 'checked' : ''} aria-label="Marcar o pacote ${esc(this.codigoPacote(v.pacote))}" />
            <span aria-hidden="true">${ic('check')}</span>
          </label>` : ''}
        </div>
      </li>`;
  },

  /** Linhas [rótulo, valor já escapado] do ticket grande de um volume salvo. */
  dadosDe(v) {
    const esc = this.esc;
    return [
      ['DATA (E)', this.dataHoraBr(v.data_entrada)],
      ['DATA (S)', v.data_saida ? this.dataHoraBr(v.data_saida) : '—'],
      ['Cliente', esc(v.cliente_nome || '—')],
      ['CNPJ', esc(v.cnpj ? Catalogo.formatarCnpj(v.cnpj) : '—')],
      ['Nota fiscal', esc(v.nf || '—')],
      ['Série', esc(v.serie || '—')],
      ['AWB', esc(v.awb || '—')],
      ['Local', esc(v.local_titulo)],
      ['Inserido por', esc(v.criado_por || '—')],
    ];
  },

  /**
   * Ticket grande. d: { codigo, tipo, status, local?, clienteCor, clienteNome, dados, nota, carimbo, compacto, aviso }
   */
  grande(d) {
    const esc = this.esc;
    const st = Catalogo.statusDe(d.status);
    return `
      <div class="ticket-palco">
        <article class="card ticket tk ${d.compacto ? 'tk-compacto' : ''} pri-cliente ${d.extra || ''}" style="${Catalogo.estiloCliente(d.clienteCor)}">
          <header class="tk-faixa">
            <span class="tk-marca">M-<b>Utility</b> · Controle NC</span>
            <span class="tkp-pri tkp-cliente">${esc(d.clienteNome || 'Sem cliente')}</span>
          </header>
          <div class="tk-cabeca">
            <div class="tk-numero ${d.codigo ? '' : 'rascunho'}" data-numero>${d.codigo ? esc(d.codigo) : '#···'}</div>
            <div class="tk-tipo">
              <span class="mini-ico">${Catalogo.icone(d.tipo)}</span>
              <div><strong>${esc(Catalogo.tipo(d.tipo)?.titulo || '')}</strong><span><span class="tag ${st?.tag || ''}">${esc(st?.titulo || '')}</span></span></div>
            </div>
            ${d.aviso || ''}
          </div>
          <span class="ticket-picote"></span>
          <dl class="tk-dados">${d.dados.map(([r, v]) => `<div><dt>${r}</dt><dd>${v}</dd></div>`).join('')}</dl>
          ${this.codigoCaixa(d.codigoCaixa)}
          <div class="codigo-barras"></div>
          ${d.carimbo || ''}
        </article>
      </div>`;
  },

  /** Ticket grande de um volume salvo. */
  grandeDe(v, { compacto = true } = {}) {
    return this.grande({
      compacto, codigo: v.codigo, tipo: v.tipo, status: v.status,
      clienteCor: v.cliente_cor, clienteNome: v.cliente_nome,
      dados: this.dadosDe(v), nota: v.nota, carimbo: this.carimbo(v, true), codigoCaixa: this.codigoDe(v),
      aviso: this.aviso(v) + this.marcaMes(v), extra: `${this.classesExtras(v)} ${v.anterior ? 'tk-antigo' : ''}`,
    });
  },

  alinharPicotes(raiz = document) {
    raiz.querySelectorAll('.tk').forEach((t) => {
      const picote = t.querySelector('.ticket-picote');
      if (picote) t.style.setProperty('--corte', `${picote.offsetTop + 1}px`);
    });
  },

  /** Linha do tempo do volume (mudanças registradas). */
  linhaDoTempo(v) {
    const itens = (v.historico || []).slice().reverse();
    if (!itens.length) return '';
    return `<ol class="nc-tempo">${itens.map((h) => `
      <li><time>${this.dataHoraBr(h.em)}</time><span>${this.esc(h.texto)}</span><small>${this.esc(h.por || '')}</small></li>`).join('')}</ol>`;
  },

  _modal: null,
  /** Abre o volume num modal (histórico e estatísticas). */
  abrir(v, { acoes = '', barra = '' } = {}) {
    if (!this._modal) {
      this._modal = document.createElement('dialog');
      this._modal.className = 'modal modal-ticket';
      this._modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-nota-modal]')) { const x = this._modalVolume; if (x) this.lerNota(x.nota, x.codigo, x.anexos); return; }
        if (e.target === this._modal || e.target.closest('[data-fechar-modal]')) this._modal.close();
      });
      document.body.appendChild(this._modal);
    }
    this._modalVolume = v;
    // sem barra própria (estatísticas, localizar), a nota fica ao lado de Fechar
    const nota = this.botaoNota(v, 'data-nota-modal');
    this._modal.innerHTML = `
      <div class="modal-conteudo">
        <header class="modal-topo ${barra ? 'com-barra' : ''}">
          <h2>${ic('olho')} Volume ${this.esc(v.codigo)}</h2>
          ${barra ? `<div class="modal-barra">${barra}</div>` : '<button type="button" class="btn btn-ghost btn-sm" data-fechar-modal aria-label="Fechar"><i class="ic ic-x" aria-hidden="true"></i></button>'}
        </header>
        ${this.grandeDe(v)}
        ${v.historico?.length ? `<details class="nc-tempo-caixa"><summary>${ic('relogio')} Linha do tempo (${v.historico.length})</summary>${this.linhaDoTempo(v)}</details>` : ''}
        <div class="modal-acoes">${barra ? '' : nota}${acoes}<button type="button" class="btn" data-fechar-modal>Fechar</button></div>
      </div>`;
    this._modal.showModal();
    this.alinharPicotes(this._modal);
    return this._modal;
  },

  /** Filtros das telas de lista. */
  filtrar(lista, { termo = '', tipo = '', status = '', cliente = '', local = '', situacao = '' } = {}) {
    return lista.filter((v) => {
      if (tipo && v.tipo !== tipo) return false;
      if (status && v.status !== status) return false;
      if (local && v.local !== local) return false;
      if (cliente && (v.cliente_nome || '') !== cliente) return false;
      if (situacao === 'no-setor' && Catalogo.saiu(v)) return false;
      if (situacao === 'saiu' && !Catalogo.saiu(v)) return false;
      if (situacao === 'vencido' && Catalogo.prazo(v) !== 'vencido') return false;
      return Busca.volume(v, termo);
    });
  },

  /** Opções de <select> (sem repetir), já escapadas. */
  opcoes(valores, rotuloTodos) {
    const unicos = [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return `<option value="">${rotuloTodos}</option>${unicos.map((v) => `<option value="${this.esc(v)}">${this.esc(v)}</option>`).join('')}`;
  },
};

window.TicketUI = TicketUI;

/** Mesmo dia (horário local)? */
window.mesmoDia = (iso, ref = new Date()) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
};

/* ---------- DANFE / pedido em cima do código de barras, com botão de copiar ---------- */
Object.assign(TicketUI, {
  iconeLocal(id) {
    return { prateleira: 'prateleira', 'pallet-dentro': 'pallet-dentro', 'pallet-fora': 'pallet-fora', crossdocking: 'caminhao', 'setor-devolucao': 'atualizar', gris: 'escudo' }[id] || 'pacote';
  },
  /** { rotulo, texto (formatado), copiar (o que vai para o Ctrl+C) } */
  codigoDe(v) {
    if (v.chave) return { rotulo: 'DANFE', texto: Catalogo.formatarChave(v.chave), copiar: v.chave };
    if (v.pedido) return { rotulo: 'Pedido', texto: v.pedido, copiar: v.pedido };
    return null;
  },
  codigoCaixa(c) {
    if (!c) return '';
    return `
      <div class="tk-codigo-caixa">
        <div class="tk-codigo-texto"><small>${this.esc(c.rotulo)}</small><b class="tk-mono">${this.esc(c.texto)}</b></div>
        <button type="button" class="btn btn-sm tk-copiar" data-copiar="${this.esc(c.copiar)}" title="Copiar ${this.esc(c.rotulo)} (Ctrl+C)">${ic('copiar')} Copiar</button>
      </div>`;
  },
});

document.addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-copiar]');
  if (!botao) return;
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(botao.dataset.copiar);
    botao.innerHTML = `${ic('check')} Copiado`;
    botao.classList.add('copiado');
  } catch {
    botao.textContent = 'Não copiou';
  }
  setTimeout(() => { botao.innerHTML = `${ic('copiar')} Copiar`; botao.classList.remove('copiado'); }, 1800);
});

/* ---------- "Ler nota": a nota aparece num papelzinho (como a nota do colaborador no HelpIA) ---------- */
TicketUI.lerNota = function lerNota(texto, de = '', anexos = []) {
  let d = document.getElementById('modalNotaPapel');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'modalNotaPapel';
    d.className = 'modal modal-nota-papel';
    d.addEventListener('click', (e) => {
      const foto = e.target.closest('[data-nota-foto]');
      if (foto) { e.stopPropagation(); if (window.Anexos) Anexos.ampliar(foto.dataset.notaFoto); return; }
      if (e.target === d || e.target.closest('[data-fechar-nota]')) d.close();
    });
    document.body.appendChild(d);
  }
  const fotos = (anexos || []).filter((a) => a && a.id);
  // imagem(ns) em cima, mensagem embaixo, no mesmo papelzinho
  d.innerHTML = `
    <div class="nota-papel">
      <span class="nota-fita" aria-hidden="true"></span>
      <header><strong>${ic('documento')} Nota${de ? ` do volume ${this.esc(de)}` : ''}</strong>
        <button type="button" class="btn btn-ghost btn-sm" data-fechar-nota aria-label="Fechar">${ic('x')}</button></header>
      ${fotos.length ? `<div class="nota-fotos ${fotos.length > 1 ? 'varias' : ''}">${fotos.map((a) => `
        <button type="button" class="nota-foto anexo" data-nota-foto="${this.esc(a.id)}" title="Ampliar a imagem">
          <img alt="${this.esc(a.nome || 'Imagem anexada')}" data-anexo="${this.esc(a.id)}" /></button>`).join('')}</div>` : ''}
      ${texto ? `<p class="nota-papel-texto">${this.esc(texto)}</p>` : ''}
    </div>`;
  if (fotos.length && window.Anexos) Anexos.preencher(d);
  d.showModal();
};

/** Tecla "Ver nota" (texto e/ou imagens) de um volume; vazio se ele não tiver nenhum dos dois. */
TicketUI.botaoNota = function botaoNota(v, atributos = '') {
  const fotos = v.anexos?.length || 0;
  if (!v.nota && !fotos) return '';
  const dica = fotos ? `Ver a nota e ${fotos > 1 ? `as ${fotos} imagens` : 'a imagem'}` : 'Ler a nota deste volume';
  return `<button type="button" class="btn btn-ver-nota" ${atributos} title="${dica}">${ic('documento')} Ver nota${fotos ? ` <span class="nota-qtd" aria-label="${fotos} imagem(ns)">${fotos}</span>` : ''}</button>`;
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ler-nota]');
  if (!b) return;
  e.stopPropagation();
  TicketUI.lerNota(b.dataset.lerNota, b.dataset.lerNotaDe);
});
