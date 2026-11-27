/* =========================================================
   planilha.js — as colunas do Histórico de Tickets
   Mesma ordem e nomes do controle de NC. É daqui que sai o CSV
   e, no futuro, a integração com a planilha online: se uma
   coluna mudar, muda só aqui.
   ========================================================= */

const Planilha = {
  dataBr: (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : ''),

  /* As colunas B a L da planilha do controle de NC, nesta ordem. */
  COLUNAS: [
    { titulo: '#ID', valor: (v) => v.codigo },
    { titulo: 'DATA (E)', valor: (v) => Planilha.dataBr(v.data_entrada) },
    { titulo: 'NOTA FISCAL (NF)', valor: (v) => v.nf || '' },
    { titulo: 'SÉRIE', valor: (v) => v.serie || '' },
    { titulo: 'DANFE/PEDIDO', valor: (v) => v.chave || v.pedido || '' },
    { titulo: 'CLIENTE', valor: (v) => v.cliente_nome || '' },
    { titulo: 'CNPJ', valor: (v) => (v.cnpj ? Catalogo.formatarCnpj(v.cnpj) : '') },
    { titulo: 'TIPO DE NC', valor: (v) => v.tipo_titulo },
    { titulo: 'STATUS', valor: (v) => v.status_titulo },
    { titulo: 'AWB', valor: (v) => v.awb || '' },
    { titulo: 'DATA (S)', valor: (v) => Planilha.dataBr(v.data_saida) },
  ],

  linhas(volumes) {
    return volumes.map((v) => this.COLUNAS.map((c) => c.valor(v)));
  },

  /** CSV com ";" e BOM: abre certo no Excel/Google Planilhas em português. */
  csv(volumes) {
    const celula = (t) => {
      const s = String(t ?? '');
      // DANFE vira texto (senão a planilha transforma os 44 dígitos em notação científica)
      const texto = /^\d{15,}$/.test(s) ? `="${s}"` : s;
      return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const linhas = [this.COLUNAS.map((c) => c.titulo), ...this.linhas(volumes)];
    return '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n');
  },

  baixar(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  nomeArquivo(prefixo, extensao = 'csv') {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${prefixo}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${extensao}`;
  },
};

window.Planilha = Planilha;

/**
 * Copia as linhas para colar na planilha online (a partir da coluna B).
 * Vai em HTML (a DANFE marcada como texto, para não virar 3,5E+43) e em texto separado por TAB.
 */
Planilha.copiar = async function copiar(volumes, { cabecalho = false, email = false, colunas = this.COLUNAS } = {}) {
  const linhas = [...(cabecalho ? [colunas.map((c) => c.titulo)] : []), ...volumes.map((v) => colunas.map((c) => c.valor(v)))];
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // email: tabela com bordas e cabeçalho, para colar no corpo do e-mail (Outlook / Gmail)
  const cel = email ? 'border:1px solid #9A9A9A;padding:4px 8px;font-family:Calibri,Arial,sans-serif;font-size:11pt;' : '';
  const html = `<table${email ? ' style="border-collapse:collapse"' : ''}>${linhas.map((l, i) => `<tr>${l.map((c) => (email && cabecalho && i === 0
    ? `<th style="${cel}background:#E8E2CF;text-align:left">${esc(c)}</th>`
    : `<td style="${cel}mso-number-format:'@'">${esc(c)}</td>`)).join('')}</tr>`).join('')}</table>`;
  const tsv = linhas.map((l) => l.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n');
  if (window.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([tsv], { type: 'text/plain' }),
    })]);
  } else {
    await navigator.clipboard.writeText(tsv);
  }
  return linhas.length;
};

/* ---------- Relatório do mês (fechamento do ciclo) ----------
   As 11 colunas da planilha + o mês do #ID (um volume pode ter vindo do mês anterior),
   o local, a nota e quem inseriu. É esse CSV que o Localizar lê de volta. */
Planilha.EXTRAS = [
  { titulo: 'MÊS DO #ID', valor: (v) => v.ciclo_titulo || '' },
  { titulo: 'LOCAL', valor: (v) => v.local_titulo || '' },
  { titulo: 'NOTA', valor: (v) => v.nota || '' },
  { titulo: 'INSERIDO POR', valor: (v) => v.criado_por || '' },
];
Planilha.csvRelatorio = function csvRelatorio(volumes) {
  const colunas = [...this.COLUNAS, ...this.EXTRAS];
  const celula = (t) => {
    const s = String(t ?? '');
    const texto = /^\d{15,}$/.test(s) ? `="${s}"` : s;
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const linhas = [colunas.map((c) => c.titulo), ...volumes.map((v) => colunas.map((c) => c.valor(v)))];
  return '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n');
};

/** Lê um CSV (; ou ,) e devolve as linhas como objetos { 'TÍTULO DA COLUNA': valor }. */
Planilha.lerCsv = function lerCsv(texto) {
  const t = String(texto || '').replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] || '';
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let campo = ''; let linha = []; let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = ''; if (linha.some((x) => x !== '')) linhas.push(linha); linha = [];
    } else campo += c;
  }
  linha.push(campo); if (linha.some((x) => x !== '')) linhas.push(linha);
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  const titulos = cab.map((h) => h.trim().toUpperCase());
  const limpa = (v) => String(v ?? '').trim().replace(/^="(.*)"$/, '$1');
  return resto.map((l) => Object.fromEntries(titulos.map((h, i) => [h, limpa(l[i])])));
};

/** Uma linha do CSV vira um "volume" só para consulta (Localizar). */
Planilha.volumeDaLinha = function volumeDaLinha(l, cicloDoArquivo, indice) {
  const pega = (...nomes) => {
    for (const n of nomes) {
      const k = Object.keys(l).find((h) => h === n) || Object.keys(l).find((h) => h.startsWith(n));
      if (k && l[k]) return l[k];
    }
    return '';
  };
  const data = (txt) => {
    const m = /(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2}))?/.exec(txt || '');
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 12), Number(m[5] || 0)).toISOString() : null;
  };
  const porTitulo = (lista, txt) => lista.find((x) => Busca.normalizar(x.titulo) === Busca.normalizar(txt));
  const tipo = porTitulo(Catalogo.tipos, pega('TIPO DE NC'));
  const status = porTitulo(Catalogo.status, pega('STATUS'));
  const local = porTitulo(Catalogo.locais, pega('LOCAL'));
  const codigo = pega('#ID');
  const idCiclo = Number(String(codigo).replace(/\D/g, '')) || indice + 1;
  const ref = pega('DANFE');
  const ciclo = Catalogo.cicloDoTexto(pega('MÊS DO #ID', 'MES DO #ID')) || cicloDoArquivo;
  return {
    numero: -(indice + 1), id_ciclo: idCiclo, codigo: codigo || Catalogo.codigo(idCiclo),
    ciclo, ciclo_titulo: Catalogo.tituloCiclo(ciclo),
    data_entrada: data(pega('DATA (E)')) || new Date().toISOString(), data_saida: data(pega('DATA (S)')),
    nf: pega('NOTA FISCAL'), serie: pega('SÉRIE', 'SERIE'),
    chave: /^\d{44}$/.test(ref) ? ref : '', pedido: /^\d{44}$/.test(ref) ? '' : ref,
    cliente_nome: pega('CLIENTE'), cnpj: Catalogo.somenteDigitos(pega('CNPJ')),
    tipo: tipo?.id || '', tipo_titulo: tipo?.titulo || pega('TIPO DE NC'),
    status: status?.id || '', status_titulo: status?.titulo || pega('STATUS'),
    local: local?.id || '', local_titulo: local?.titulo || pega('LOCAL'),
    awb: pega('AWB'), nota: pega('NOTA'), criado_por: pega('INSERIDO POR'), cliente_cor: '',
    historico: [], anexos: [],
  };
};

/** Colunas do e-mail de "Enviar e-mail" por cliente: de #ID até STATUS (sem AWB e DATA (S)). */
Planilha.COLUNAS_EMAIL = Planilha.COLUNAS.slice(0, Planilha.COLUNAS.findIndex((c) => c.titulo === 'STATUS') + 1);
