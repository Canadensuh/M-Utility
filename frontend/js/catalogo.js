/* =========================================================
   catalogo.js — tudo o que o Controle NC sabe de antemão
   - Tipos de não conformidade (os cartões animados da 1ª etapa)
   - Status da encomenda (2ª etapa)
   - Locais do setor: prateleira, pallet de dentro, pallet de fora
   - Leitura da chave DANFE (44 dígitos)
   - Prazo de 10 dias das encomendas SEM INTEGRAÇÃO
   - Cor do ticket por cliente
   ========================================================= */

/* Ícones animados (as animações ficam em css/icones.css) */
const ICONES_NC = {
  cep: `<svg viewBox="0 0 64 64" class="ico ico-cep" aria-hidden="true">
    <path class="ico-traco" d="M10 34 32 16l22 18"/>
    <path class="ico-traco" d="M16 30v24h32V30"/>
    <path class="ico-traco" d="M28 54V42h8v12"/>
    <g class="ico-pino"><path class="ico-traco ico-pino-corpo" d="M46 4a8 8 0 0 0-8 8c0 6 8 14 8 14s8-8 8-14a8 8 0 0 0-8-8z"/>
    <circle class="ico-ponto" cx="46" cy="12" r="2.6"/></g>
    <path class="ico-traco ico-x-cep" d="M40 32l12 12M52 32 40 44"/></svg>`,

  duplicidade: `<svg viewBox="0 0 64 64" class="ico ico-duplicidade" aria-hidden="true">
    <g class="ico-etq-tras"><rect class="ico-traco ico-etq-fundo" x="8" y="10" width="34" height="24" rx="3"/>
    <path class="ico-traco" d="M14 18h22M14 25h14"/></g>
    <g class="ico-etq-frente"><rect class="ico-traco ico-etq-fundo" x="22" y="30" width="34" height="24" rx="3"/>
    <path class="ico-traco" d="M28 38h22M28 45h14"/></g></svg>`,

  reimpressao: `<svg viewBox="0 0 64 64" class="ico ico-impressora" aria-hidden="true">
    <path class="ico-traco" d="M18 24V8h28v16"/>
    <rect class="ico-papel" x="19" y="34" width="26" height="22" rx="1.5"/>
    <rect class="ico-traco ico-corpo-imp" x="8" y="22" width="48" height="20" rx="4"/>
    <circle class="ico-led" cx="47" cy="30" r="2.4"/></svg>`,

  'sem-integracao': `<svg viewBox="0 0 64 64" class="ico ico-integracao" aria-hidden="true">
    <path class="ico-traco" d="M18 44h-2a10 10 0 0 1-1-20 14 14 0 0 1 27-3 9 9 0 0 1 6 17"/>
    <g class="ico-sinc"><path class="ico-traco" d="M24 46a8 8 0 0 1 14-5M40 50a8 8 0 0 1-14 5"/>
    <path class="ico-traco" d="M38 36v5h-5M26 60v-5h5"/></g>
    <circle class="ico-alerta-pt" cx="50" cy="48" r="4"/></svg>`,

  bloqueio: `<svg viewBox="0 0 64 64" class="ico ico-senha" aria-hidden="true">
    <path class="ico-traco ico-argola" d="M22 28v-8a10 10 0 0 1 20 0v8"/>
    <rect class="ico-traco ico-corpo" x="14" y="28" width="36" height="26" rx="5"/>
    <g class="ico-asteriscos"><circle cx="24" cy="41" r="2.8"/><circle cx="32" cy="41" r="2.8"/><circle cx="40" cy="41" r="2.8"/></g></svg>`,

  extravio: `<svg viewBox="0 0 64 64" class="ico ico-setor" aria-hidden="true">
    <path class="ico-traco" d="M14 58V28h36v30M8 58h48"/>
    <path class="ico-traco" d="M22 36h6M36 36h6M22 46h6M36 46h6M29 58v-7h6v7"/>
    <path class="ico-sirene" d="M25 28v-6a7 7 0 0 1 14 0v6z"/>
    <g class="ico-raios"><path class="ico-traco" d="M32 4v5M18 9l3.5 3.5M46 9l-3.5 3.5"/></g></svg>`,

  'sem-identificacao': `<svg viewBox="0 0 64 64" class="ico ico-semid" aria-hidden="true">
    <path class="ico-traco ico-semid-caixa" d="M8 22 32 10l24 12v26L32 60 8 48z"/>
    <path class="ico-traco" d="M8 22l24 12 24-12M32 34v26"/>
    <rect class="ico-traco ico-semid-etq" x="13" y="33" width="14" height="10" rx="1.5"/>
    <circle class="ico-ponto ico-semid-lupa" cx="45" cy="40" r="2.4"/></svg>`,

  operacional: `<svg viewBox="0 0 64 64" class="ico ico-pedido" aria-hidden="true">
    <rect class="ico-traco" x="12" y="30" width="40" height="26" rx="3"/>
    <g class="ico-tampa"><rect class="ico-traco ico-tampa-fundo" x="8" y="21" width="48" height="9" rx="2"/></g>
    <g class="ico-interrogacao"><path class="ico-traco" d="M28 38a4 4 0 1 1 5.6 3.6c-1.1.5-1.6 1.3-1.6 2.6"/>
    <circle class="ico-ponto" cx="32" cy="50" r="1.8"/></g></svg>`,
};

/* ---------- Tipos de não conformidade ----------
   status: com quais status o volume pode ENTRAR (na edição dá para trocar depois).
   locais(status): para onde o volume pode ir. Uma opção só = a etapa é preenchida e pulada. */
const TIPOS_NC = [
  { id: 'cep', titulo: 'CEP', descricao: 'O cliente errou o CEP do endereço',
    status: ['tratado', 'devolucao'], locais: () => ['crossdocking'] },
  { id: 'duplicidade', titulo: 'Duplicidade', descricao: 'Etiqueta saiu duas vezes ou foi colada na caixa errada',
    status: ['aguardando-entrega', 'devolucao'], locais: (st) => (st === 'devolucao' ? ['setor-devolucao'] : ['pallet-fora']) },
  { id: 'reimpressao', titulo: 'Reimpressão', descricao: 'Etiqueta rasgada, apagada ou ilegível',
    status: ['tratado', 'devolucao'], locais: () => ['crossdocking', 'setor-devolucao'] },
  { id: 'sem-integracao', titulo: 'Sem integração', descricao: 'Pendente de integração de arquivos', prazo: true,
    // E-mail (enviar/enviado): fica no setor, na prateleira ou no pallet de dentro.
    // Tratado vai direto para o Crossdocking e Devolução para o setor de Devolução (já saem do NC).
    status: ['enviar-email', 'email-enviado', 'tratado', 'devolucao'],
    locais: (st) => (st === 'tratado' ? ['crossdocking'] : st === 'devolucao' ? ['setor-devolucao'] : ['prateleira', 'pallet-dentro']) },
  { id: 'bloqueio', titulo: 'Ticket de bloqueio', descricao: 'Pediram para bloquear a encomenda',
    status: ['devolucao'], locais: () => ['setor-devolucao'] },
  { id: 'operacional', titulo: 'Problemas operacionais', descricao: 'A peça está com algum problema fora do comum',
    status: ['tratado', 'devolucao'], locais: () => ['prateleira', 'pallet-dentro', 'crossdocking', 'setor-devolucao'] },
  // sem DANFE (vai um número de referência), mas COM AWB: a etiqueta AWB é gerada no sistema da empresa a partir da referência
  { id: 'sem-identificacao', titulo: 'Sem identificação', descricao: 'Só a caixa, sem nenhuma etiqueta', semDanfe: true,
    status: ['devolucao'], locais: () => ['setor-devolucao'] },
  { id: 'extravio', titulo: 'Extravio', descricao: 'Caso crítico: segue para o setor GRIS', critico: true,   // sempre por último: é o único diferente
    status: ['gris'], locais: () => ['gris'] },
];

/* ---------- Status da encomenda ----------
   saida: o volume deixa o setor NC e ganha DATA (S) · awb: exige a AWB para sair. */
const STATUS_NC = [
  { id: 'enviar-email', titulo: 'Enviar e-mail', ic: 'envelope', tag: 'tag-st-email',
    descricao: 'Precisa pedir a integração por e-mail' },
  { id: 'email-enviado', titulo: 'E-mail enviado', ic: 'enviar', tag: 'tag-st-enviado',
    descricao: 'O e-mail já foi enviado, aguardando retorno' },
  { id: 'aguardando-entrega', titulo: 'Aguardando entrega realizada', ic: 'relogio', tag: 'tag-st-aguardando',
    descricao: 'Esperando o status de entrega para virar devolução' },
  { id: 'tratado', titulo: 'Tratado', ic: 'check-circulo', tag: 'tag-st-tratado', saida: true, awb: true,
    descricao: 'Tratado e enviado para o Crossdocking' },
  { id: 'devolucao', titulo: 'Devolução', ic: 'atualizar', tag: 'tag-st-devolucao', saida: true, awb: true,
    descricao: 'Virou devolução e foi para o setor Devolução' },
  { id: 'gris', titulo: 'GRIS', ic: 'escudo', tag: 'tag-st-gris', saida: true, soTipo: 'extravio',
    descricao: 'Extravio encaminhado ao setor GRIS (segurança)' },
];

/* ---------- Para onde o volume vai ---------- */
const LOCAIS_NC = [
  { id: 'pallet-fora', titulo: 'Pallet de fora', descricao: 'Encomendas aguardando entrega realizada' },
  { id: 'prateleira', titulo: 'Prateleira', descricao: 'Caixas menores, sem integração ou com algum problema' },
  { id: 'pallet-dentro', titulo: 'Pallet de dentro', descricao: 'Caixas maiores que estão sem integração' },
  { id: 'crossdocking', titulo: 'Crossdocking', descricao: 'Tratado: segue para o Crossdocking' },
  { id: 'setor-devolucao', titulo: 'Devolução', descricao: 'Segue para o setor de Devolução' },
  { id: 'gris', titulo: 'Setor GRIS', descricao: 'Segurança: casos de extravio' },
];

/* Paleta para os clientes (cor da faixa do ticket) */
const CORES_CLIENTE = ['#6E9BC4', '#C98B3A', '#9C7FD6', '#6DB85A', '#D9668A', '#3FA6A0', '#E3C567', '#8C6F5A', '#5D7FD1', '#B5654A'];

/* Prazo das encomendas sem integração */
const PRAZO_DIAS = 10;
const AVISO_DIAS = 8;            // a partir daqui o Helpy e o ticket começam a avisar

const DIA_MS = 86400000;

const Catalogo = {
  tipos: TIPOS_NC,
  status: STATUS_NC,
  locais: LOCAIS_NC,
  cores: CORES_CLIENTE,
  PRAZO_DIAS,
  AVISO_DIAS,

  icone(id) { return ICONES_NC[id] || ICONES_NC.operacional; },
  tipo(id) { return TIPOS_NC.find((t) => t.id === id) || null; },
  statusDe(id) { return STATUS_NC.find((s) => s.id === id) || null; },
  local(id) { return LOCAIS_NC.find((l) => l.id === id) || null; },
  saiu(v) { return !!this.statusDe(v?.status)?.saida; },

  /** Status com que o volume pode ENTRAR, conforme o tipo de NC. */
  statusDaEntrada(tipoId) {
    const t = this.tipo(tipoId);
    return (t?.status || []).map((id) => this.statusDe(id)).filter(Boolean);
  },
  /** Status para TROCAR na edição: os normais para todos; GRIS só para extravio. */
  statusDaEdicao(tipoId) {
    return STATUS_NC.filter((s) => !s.soTipo || s.soTipo === tipoId);
  },
  /** Para onde o volume pode ir, conforme tipo e status. */
  locaisPermitidos(tipoId, statusId) {
    const ids = this.tipo(tipoId)?.locais?.(statusId) || [];
    return ids.map((id) => this.local(id)).filter(Boolean);
  },
  /** O status de saída exige AWB? (Tratado e Devolução sim; GRIS não.) */
  exigeAwb(statusId, tipoId) { return !!this.statusDe(statusId)?.awb && !this.tipo(tipoId)?.semAwb; },

  /** #001, #002… */
  codigo(numero) { return `#${String(numero).padStart(3, '0')}`; },

  /** AWB da transportadora: TXA + letra + 9 números + tx. */
  AWB: /^TXA[A-Z]\d{9}TX$/i,
  /**
   * Sempre no mesmo formato: 4 letras maiúsculas, os 9 números e "tx" minúsculo.
   * "txaq123456789TX" (Caps Lock trocado no leitor) → "TXAQ123456789tx". Outros códigos: só em maiúsculas.
   */
  formatarAwb(texto) {
    const s = String(texto ?? '').replace(/\s+/g, '');
    return this.AWB.test(s) ? `${s.slice(0, 4).toUpperCase()}${s.slice(4, 13)}tx` : s.toUpperCase();
  },

  /* ---------- Ciclos mensais ----------
     Todo mês é um ciclo: o #ID recomeça do #001 e, no fechamento, o mês vira
     "M-Utility - Controle NC (Out-2026).csv" + ".backup.json". Id do ciclo: "2026-10". */
  MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  cicloDe(data = new Date()) {
    const d = new Date(data);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },
  proximoCiclo(id) {
    const [a, m] = id.split('-').map(Number);
    return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  },
  /** "Outubro" */
  nomeMes(id) { return this.MESES[Number(String(id).split('-')[1]) - 1] || id; },
  /** "Out/2026" */
  tituloCiclo(id) { const [a] = String(id).split('-'); return `${this.nomeMes(id).slice(0, 3)}/${a}`; },
  /** "Out-2026" (o Windows não aceita "/" em nome de arquivo) */
  arquivoCiclo(id) { return this.tituloCiclo(id).replace('/', '-'); },
  /** "M-Utility - Controle NC (Out-2026)" */
  nomeArquivoCiclo(id) { return `M-Utility - Controle NC (${this.arquivoCiclo(id)})`; },
  /** "Out/2026" / "out-2026" / "outubro 2026" → "2026-10" (para ler nomes de arquivo e colunas). */
  cicloDoTexto(texto) {
    const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const iso = /(\d{4})-(\d{2})/.exec(t);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const i = this.MESES.findIndex((m) => t.includes(m.slice(0, 3).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')));
    const ano = /(20\d{2})/.exec(t);
    return i >= 0 && ano ? `${ano[1]}-${String(i + 1).padStart(2, '0')}` : null;
  },

  /* ---------- Chave DANFE (NF-e) ----------
     44 dígitos: UF(2) AAMM(4) CNPJ(14) Modelo(2) Série(3) Número(9) tpEmis(1) Código(8) DV(1).
     Outro tamanho = número de PEDIDO (não traz NF, série nem CNPJ). */
  somenteDigitos(texto) { return String(texto ?? '').replace(/\D/g, ''); },

  danfe(texto) {
    const d = this.somenteDigitos(texto);
    if (d.length !== 44) return null;
    const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    for (let i = 42, p = 0; i >= 0; i--, p++) soma += Number(d[i]) * pesos[p % 8];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    return {
      chave: d,
      valida: dv === Number(d[43]),
      uf: d.slice(0, 2),
      emissao: `${d.slice(4, 6)}/20${d.slice(2, 4)}`,
      cnpj: d.slice(6, 20),
      modelo: d.slice(20, 22),
      serie: String(Number(d.slice(22, 25))),
      nf: String(Number(d.slice(25, 34))),
    };
  },

  formatarCnpj(cnpj) {
    const d = this.somenteDigitos(cnpj);
    if (d.length !== 14) return cnpj || '';
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  },

  /** Chave em blocos de 4 (mais fácil de conferir com a etiqueta). */
  formatarChave(chave) {
    const d = this.somenteDigitos(chave);
    return d.length === 44 ? d.replace(/(\d{4})(?=\d)/g, '$1 ') : (chave || '');
  },

  /* ---------- Tempo no setor ---------- */
  /**
   * Dias no setor pelo CALENDÁRIO (não por períodos de 24 h): entrou ontem às 11:54 → hoje já é 1 dia,
   * a qualquer hora. É essa conta que vale para o prazo de 10 dias (24/11 + 10 = 04/12).
   */
  dias(v, agora = Date.now()) {
    const meiaNoite = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const fim = v.data_saida ? new Date(v.data_saida).getTime() : agora;
    // round: o horário de verão pode deixar um dia com 23 ou 25 horas
    return Math.max(0, Math.round((meiaNoite(fim) - meiaNoite(v.data_entrada)) / DIA_MS));
  },

  /**
   * Prazo dos SEM INTEGRAÇÃO ainda no setor:
   * null (não se aplica) · 'ok' · 'atencao' (8 a 10 dias) · 'vencido' (passou de 10 dias: virar devolução).
   */
  prazo(v, agora = Date.now()) {
    if (!this.tipo(v.tipo)?.prazo || this.saiu(v)) return null;
    const d = this.dias(v, agora);
    if (d > PRAZO_DIAS) return 'vencido';
    if (d >= AVISO_DIAS) return 'atencao';
    return 'ok';
  },

  /** Faltam quantos dias para estourar os 10 dias (negativo = já passou). */
  diasRestantes(v, agora = Date.now()) { return PRAZO_DIAS - this.dias(v, agora); },

  /* ---------- Cores do ticket por cliente ---------- */
  /** Texto legível sobre a cor (escuro em cor clara, claro em cor escura). */
  tintaPara(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#0F2235';
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.28 ? '#1A1F14' : '#FFF8EE';
  },

  /** style="" da faixa do ticket (cor do cliente, ou cinza sem cliente). */
  estiloCliente(cor) {
    const c = /^#[0-9a-f]{6}$/i.test(cor || '') ? cor : '#A39A7C';
    return `--pri:${c};--pri-2:${c};--pri-tinta:${this.tintaPara(c)};`;
  },
};

window.Catalogo = Catalogo;

/* Ícone de interface (css/simbolos.css). Ex.: ic('ticket'), ic('chama', 'ic-perigo') */
window.ic = (nome, extra = '') =>
  `<i class="ic ic-${nome}${extra ? ' ' + extra : ''}" aria-hidden="true"></i>`;
