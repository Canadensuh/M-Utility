/* =========================================================
   impressao.js — ticket físico na Zebra ZT410
   A ZT410 é uma impressora térmica industrial de 4": largura de
   impressão de até 104 mm, 203 dpi (8 pontos/mm) no modelo padrão
   (300 e 600 dpi são opcionais). A etiqueta padrão de AWB é a
   100 × 150 mm (4" × 6").

   Duas formas de imprimir:
   1) ZEBRA BROWSER PRINT (recomendado): aplicativo gratuito da Zebra
      que roda no computador. O M-Utility monta a etiqueta em ZPL
      (a linguagem da impressora) e manda direto, sem janela.
   2) JANELA DE IMPRESSÃO do navegador: sem instalar nada. A página
      sai no tamanho exato da etiqueta; escolha a Zebra (driver
      ZDesigner) na janela.
   O ticket mostra: #ID, ENTRADA/SAÍDA DA NC, CLIENTE, TIPO DE NC e o STATUS.
   ========================================================= */

const Impressao = {
  CHAVE: 'mutility-impressora',
  BROWSER_PRINT: 'http://127.0.0.1:9100',

  TAMANHOS: {
    '100x150': { w: 100, h: 150, nome: '100 × 150 mm · 4" × 6" (AWB padrão)' },
    '100x100': { w: 100, h: 100, nome: '100 × 100 mm · 4" × 4"' },
    '100x75': { w: 100, h: 75, nome: '100 × 75 mm · 4" × 3"' },
    '100x50': { w: 100, h: 50, nome: '100 × 50 mm · 4" × 2"' },
  },
  METODOS: {
    auto: 'Automático: Browser Print → rede (se tiver IP) → janela de impressão',
    browserprint: 'Só Zebra Browser Print (direto, sem janela)',
    rede: 'Pela rede: direto no IP da ZT410 (sem janela, sem instalar nada)',
    janela: 'Janela de impressão do navegador (silenciosa no atalho Abrir M-Utility)',
    nenhum: 'Não imprimir (só a animação)',
  },
  PADRAO: { tamanho: '100x150', dpi: 203, metodo: 'auto', copias: 1, ip: '' },

  config() {
    try { return { ...this.PADRAO, ...JSON.parse(localStorage.getItem(this.CHAVE) || '{}') }; }
    catch { return { ...this.PADRAO }; }
  },
  salvar(cfg) {
    try { localStorage.setItem(this.CHAVE, JSON.stringify({ ...this.config(), ...cfg })); } catch {}
  },

  /** O que vai na etiqueta (sempre com o status ATUAL do volume). */
  dados(v) {
    const saiu = Catalogo.saiu(v);
    // Já saiu (Tratado/Devolução/GRIS): a etiqueta mostra a SAÍDA; no setor, a ENTRADA
    const d = new Date(saiu && v.data_saida ? v.data_saida : v.data_entrada);
    const p = (n) => String(n).padStart(2, '0');
    // "Enviar e-mail" já sai impresso como "E-mail enviado": assim não precisa reimprimir depois de mandar o e-mail
    const statusId = v.status === 'enviar-email' ? 'email-enviado' : v.status;
    return {
      codigo: v.codigo || Catalogo.codigo(v.numero),
      numero: v.numero,
      rotuloData: saiu ? 'SAÍDA DA NC' : 'ENTRADA NA NC',
      data: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`,
      cliente: v.cliente_nome || 'SEM CLIENTE',
      tipo: v.tipo_titulo || Catalogo.tipo(v.tipo)?.titulo || '',
      status: Catalogo.statusDe(statusId)?.titulo || v.status_titulo || '',
      critico: !!Catalogo.tipo(v.tipo)?.critico,
      local: v.local_titulo || Catalogo.local(v.local)?.titulo || '',
    };
  },

  /* ---------- ZPL ---------- */
  /** Texto seguro para ZPL (^ e ~ são comandos) e cortado para caber na linha. */
  textoZpl(t, max) {
    const s = String(t ?? '').replace(/[\^~\\]/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 3)}...` : s;
  },

  /**
   * Logo PRETA em ZPL (^GFA): reduz o bitmap de js/logo-zebra.js para a altura pedida (em pontos)
   * pelo vizinho mais próximo e escreve em hexadecimal. Retorna { zpl, w }.
   */
  logoZpl(x, y, altura) {
    const L = window.LOGO_ZEBRA;
    if (!L) return { zpl: '', w: 0 };
    const bin = atob(L.b64);
    const origemBpr = Math.ceil(L.w / 8);
    const h = Math.max(8, Math.round(altura));
    const w = Math.round(L.w * h / L.h);
    const bpr = Math.ceil(w / 8);
    let hex = '';
    for (let yy = 0; yy < h; yy++) {
      const sy = Math.min(L.h - 1, Math.floor(yy * L.h / h));
      for (let bx = 0; bx < bpr; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const xx = bx * 8 + bit;
          if (xx >= w) continue;
          const sx = Math.min(L.w - 1, Math.floor(xx * L.w / w));
          if (bin.charCodeAt(sy * origemBpr + (sx >> 3)) & (0x80 >> (sx & 7))) byte |= 0x80 >> bit;
        }
        hex += byte.toString(16).padStart(2, '0').toUpperCase();
      }
    }
    const total = bpr * h;
    return { zpl: `^FO${x},${y}^GFA,${total},${total},${bpr},${hex}^FS`, w };
  },

  zpl(v, cfg = this.config()) {
    const t = this.TAMANHOS[cfg.tamanho] || this.TAMANHOS['100x150'];
    const k = Number(cfg.dpi) / 25.4;                       // pontos por mm
    const mm = (x) => Math.round(x * k);
    const W = mm(t.w); const H = mm(t.h); const m = mm(4);
    const d = this.dados(v);
    const cabe = (alturaMm, larguraMm) => Math.max(4, Math.floor(larguraMm / (alturaMm * 0.52)));   // ~caracteres por linha
    const campo = (y, rotulo, valor, alt, larg = t.w - 8, x = 4) => [
      `^FO${mm(x)},${mm(y)}^A0N,${mm(3.2)},${mm(3.2)}^FD${rotulo}^FS`,
      `^FO${mm(x)},${mm(y + 4)}^A0N,${mm(alt)},${mm(alt)}^FD${this.textoZpl(valor, cabe(alt, larg))}^FS`,
    ].join('\n');
    const z = ['^XA', '^CI28', `^PW${W}`, `^LL${H}`, '^LH0,0', `^PQ${Math.max(1, Number(cfg.copias) || 1)}`];
    const codigoBarras = `NC${String(d.numero).padStart(6, '0')}`;

    if (t.h >= 90) {
      // Etiqueta alta (100×150, 100×100): faixa preta, #ID gigante, campos, status em destaque e código de barras
      const e = t.h / 150;                                  // escala vertical
      const y = (v150) => v150 * e;
      z.push(
        this.logoZpl(m, mm(y(2)), mm(y(11))).zpl,
        `^FO${m + mm(y(11) * 360 / 281 + 3)},${mm(y(2.6))}^A0N,${mm(y(6.5))},${mm(y(6.5))}^FDM-UTILITY^FS`,
        `^FO${m + mm(y(11) * 360 / 281 + 3)},${mm(y(9.6))}^A0N,${mm(y(3.4))},${mm(y(3.4))}^FDCONTROLE NC^FS`,
        `^FO0,${mm(y(14.6))}^GB${W},${Math.max(3, mm(.6))},${Math.max(3, mm(.6))}^FS`,
        `^FO${m},${mm(y(17))}^A0N,${mm(y(30))},${mm(y(26))}^FD${d.codigo}^FS`,
        `^FO${m},${mm(y(50))}^GB${W - 2 * m},3,3^FS`,
        campo(y(54), d.rotuloData, d.data, y(8)),
        campo(y(68), 'CLIENTE', d.cliente, y(8)),
        campo(y(82), 'TIPO DE NC', d.tipo + (d.critico ? '  - SETOR GRIS' : ''), y(8)),
        `^FO${m},${mm(y(96))}^GB${W - 2 * m},${mm(y(20))},${mm(y(20))}^FS`,
        `^FO${m + mm(3)},${mm(y(97.6))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FR^FDSTATUS^FS`,
        `^FO${m + mm(3)},${mm(y(102))}^A0N,${mm(y(6.2))},${mm(y(6.2))}^FB${W - 2 * m - mm(6)},2,${mm(y(.4))},L^FR^FD${this.textoZpl(d.status, 48)}^FS`,
        `^FO${mm(14)},${mm(y(119))}^BY${Math.max(2, Math.round(k * .375))},3,${mm(y(16))}^BCN,${mm(y(16))},N,N,N^FD${codigoBarras}^FS`,
        `^FO${m},${mm(y(139))}^A0N,${mm(y(3.6))},${mm(y(3.6))}^FD${codigoBarras}   ${this.textoZpl(d.local, 20)}   impresso ${new Date().toLocaleString('pt-BR').slice(0, 17)}^FS`,
      );
    } else {
      // Etiqueta baixa (100×75, 100×50): #ID à esquerda, campos à direita, status embaixo
      const e = t.h / 50;
      const y = (v50) => v50 * e;
      z.push(
        this.logoZpl(m, mm(y(.6)), mm(y(6))).zpl,
        `^FO${m + mm(y(6) * 360 / 281 + 2)},${mm(y(1.6))}^A0N,${mm(y(4.2))},${mm(y(4.2))}^FDM-UTILITY  CONTROLE NC^FS`,
        `^FO0,${mm(y(7.2))}^GB${W},${Math.max(3, mm(.4))},${Math.max(3, mm(.4))}^FS`,
        `^FO${m},${mm(y(10))}^A0N,${mm(y(15))},${mm(y(12))}^FD${d.codigo}^FS`,
        `^FO${m},${mm(y(27))}^A0N,${mm(y(3))},${mm(y(3))}^FD${d.rotuloData}^FS`,
        `^FO${m},${mm(y(30.5))}^A0N,${mm(y(4.2))},${mm(y(4.2))}^FD${d.data}^FS`,
        `^FO${mm(44)},${mm(y(10))}^A0N,${mm(y(3))},${mm(y(3))}^FDCLIENTE^FS`,
        `^FO${mm(44)},${mm(y(13.5))}^A0N,${mm(y(5))},${mm(y(5))}^FD${this.textoZpl(d.cliente, cabe(y(5), 52))}^FS`,
        `^FO${mm(44)},${mm(y(20))}^A0N,${mm(y(3))},${mm(y(3))}^FDTIPO DE NC^FS`,
        `^FO${mm(44)},${mm(y(23.5))}^A0N,${mm(y(5))},${mm(y(5))}^FD${this.textoZpl(d.tipo, cabe(y(5), 52))}^FS`,
        `^FO${m},${mm(y(37))}^GB${W - 2 * m},${mm(y(10))},${mm(y(10))}^FS`,
        `^FO${m + mm(2)},${mm(y(40.4))}^A0N,${mm(y(3))},${mm(y(3))}^FR^FDSTATUS^FS`,
        `^FO${mm(21)},${mm(y(39.4))}^A0N,${mm(y(4.6))},${mm(y(4.6))}^FR^FD${this.textoZpl(d.status, cabe(y(4.6), t.w - 27))}^FS`,
      );
    }
    z.push('^XZ');
    return z.join('\n');
  },

  /* ---------- Zebra Browser Print ---------- */
  async pedir(caminho, opcoes = {}, tempo = 2500) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), tempo);
    try {
      return await fetch(`${this.BROWSER_PRINT}${caminho}`, { ...opcoes, signal: ctl.signal });
    } finally { clearTimeout(timer); }
  },

  /** A impressora padrão do Zebra Browser Print, ou null se o aplicativo não respondeu. */
  async impressoraZebra() {
    try {
      const r = await this.pedir('/default?type=printer', {}, 1500);
      if (!r.ok) return null;
      const texto = await r.text();
      if (!texto) return null;
      const dispositivo = JSON.parse(texto);
      return dispositivo?.uid ? dispositivo : null;
    } catch { return null; }
  },

  async enviarZpl(zpl) {
    const dispositivo = await this.impressoraZebra();
    if (!dispositivo) throw new Error('Zebra Browser Print não respondeu (está instalado e aberto? a ZT410 está como impressora padrão nele?).');
    const r = await this.pedir('/write', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ device: dispositivo, data: zpl }),
    }, 6000);
    if (!r.ok) throw new Error(`A impressora recusou a etiqueta (HTTP ${r.status}).`);
    return dispositivo;
  },

  /* ---------- Pela rede: a ZT410 recebe ZPL no próprio servidor web (POST /pstprnt) ---------- */
  ipValido(ip) { return /^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?$/.test(String(ip || '').trim()); },

  async enviarRede(zpl, ip) {
    if (!this.ipValido(ip)) throw new Error('Informe o IP da ZT410 (ex.: 192.168.0.50) na configuração da impressora.');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      // no-cors: a impressora não devolve permissão de leitura, então a resposta vem "opaca".
      // Se o IP não responder, o fetch falha (e aí avisamos).
      await fetch(`http://${String(ip).trim()}/pstprnt`, { method: 'POST', mode: 'no-cors', body: zpl, signal: ctl.signal });
    } catch {
      throw new Error(`A ZT410 não respondeu em ${ip}. Confira o IP (no visor da impressora) e se o computador está na mesma rede.`);
    } finally { clearTimeout(timer); }
  },

  /* ---------- Etiqueta em HTML (janela de impressão e prévia) ---------- */
  html(v, cfg = this.config()) {
    const t = this.TAMANHOS[cfg.tamanho] || this.TAMANHOS['100x150'];
    const d = this.dados(v);
    const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const baixa = t.h < 90;
    return `
      <div class="etq-zebra ${baixa ? 'etq-baixa' : ''}" style="--etq-w:${t.w}mm; --etq-h:${t.h}mm; --e:${baixa ? t.h / 50 : t.h / 150}">
        <div class="etq-faixa"><img class="etq-logo" src="assets/logo.png" alt="" /><span class="etq-marca"><b>M-UTILITY</b><small>CONTROLE NC</small></span></div>
        ${baixa ? `
        <div class="etq-esq">
          <div class="etq-id">${e(d.codigo)}</div>
          <div class="etq-campo"><small>${e(d.rotuloData)}</small><b>${e(d.data)}</b></div>
        </div>
        <div class="etq-campos">
          <div><small>CLIENTE</small><b>${e(d.cliente)}</b></div>
          <div><small>TIPO DE NC</small><b>${e(d.tipo)}${d.critico ? ' · GRIS' : ''}</b></div>
        </div>` : `
        <div class="etq-id">${e(d.codigo)}</div>
        <div class="etq-campos">
          <div><small>${e(d.rotuloData)}</small><b>${e(d.data)}</b></div>
          <div><small>CLIENTE</small><b>${e(d.cliente)}</b></div>
          <div><small>TIPO DE NC</small><b>${e(d.tipo)}${d.critico ? ' · SETOR GRIS' : ''}</b></div>
        </div>`}
        <div class="etq-status"><small>STATUS</small><b>${e(d.status)}</b></div>
        ${baixa ? '' : `<div class="etq-rodape">NC${String(d.numero).padStart(6, '0')} · ${e(d.local)}</div>`}
      </div>`;
  },

  /** Espera as imagens (a logo) da etiqueta carregarem, no máximo 2 s. */
  esperarImagens(raiz) {
    const imgs = [...raiz.querySelectorAll('img')].filter((i) => !i.complete || !i.naturalWidth);
    if (!imgs.length) return Promise.resolve();
    const carregou = Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : new Promise((ok) => { i.onload = ok; i.onerror = ok; }))));
    return Promise.race([carregou, new Promise((ok) => setTimeout(ok, 2000))]);
  },

  /** Imprime pela janela do navegador, com a página no tamanho da etiqueta. */
  async janela(v, cfg = this.config()) {
    const t = this.TAMANHOS[cfg.tamanho] || this.TAMANHOS['100x150'];
    let area = document.getElementById('areaImpressao');
    if (!area) {
      area = document.createElement('div');
      area.id = 'areaImpressao';
      document.body.appendChild(area);
    }
    let pagina = document.getElementById('paginaEtiqueta');
    if (!pagina) {
      pagina = document.createElement('style');
      pagina.id = 'paginaEtiqueta';
      document.head.appendChild(pagina);
    }
    pagina.textContent = `@page { size: ${t.w}mm ${t.h}mm; margin: 0; }`;
    const copias = Math.max(1, Number(cfg.copias) || 1);
    area.innerHTML = Array.from({ length: copias }, () => this.html(v, cfg)).join('');
    await this.esperarImagens(area);   // a logo precisa estar carregada antes de abrir a impressão
    document.body.classList.add('imprimindo-etiqueta');
    window.print();          // bloqueia até a janela fechar
    document.body.classList.remove('imprimindo-etiqueta');
  },

  /**
   * Imprime o ticket do volume conforme a configuração.
   * Retorna { ok, via: 'zebra' | 'janela' | 'nenhum', impressora?, erro? }.
   */
  async imprimir(v) {
    const cfg = this.config();
    if (cfg.metodo === 'nenhum') return { ok: true, via: 'nenhum' };
    const zpl = this.zpl(v, cfg);
    if (cfg.metodo === 'auto' || cfg.metodo === 'browserprint') {
      try {
        const dispositivo = await this.enviarZpl(zpl);
        API.registrarAcao('Imprimiu ticket na Zebra', v.codigo, `${dispositivo.name || 'Zebra'} · ${v.status_titulo || ''}`);
        return { ok: true, via: 'zebra', impressora: dispositivo.name || 'Zebra' };
      } catch (erro) {
        if (cfg.metodo === 'browserprint') return { ok: false, via: 'zebra', erro: erro.message };
      }
    }
    if (cfg.metodo === 'rede' || (cfg.metodo === 'auto' && cfg.ip)) {
      try {
        await this.enviarRede(zpl, cfg.ip);
        API.registrarAcao('Imprimiu ticket na Zebra (rede)', v.codigo, `${cfg.ip} · ${v.status_titulo || ''}`);
        return { ok: true, via: 'zebra', impressora: `ZT410 (${cfg.ip})` };
      } catch (erro) {
        if (cfg.metodo === 'rede') return { ok: false, via: 'rede', erro: erro.message };
      }
    }
    await this.janela(v, cfg);
    API.registrarAcao('Imprimiu ticket (janela de impressão)', v.codigo, v.status_titulo || '');
    return { ok: true, via: 'janela' };
  },

  /* ---------- Etiqueta do PACOTE de tickets (Registro em sequência) ----------
     Design diferente da etiqueta do ticket: moldura dupla, faixa preta
     "PACOTE DE TICKETS", o #ID do pacote gigante e a quantidade num quadro. */

  /** "pct-007" → "PCT 007" (pacotes antigos, sem número, ficam só "PACOTE"). */
  codigoPacote(id) {
    const m = /^pct-(\d+)$/.exec(String(id || ''));
    return m ? `PCT ${m[1]}` : 'PACOTE';
  },

  dadosPacote(membros) {
    const v = membros[0];
    const d = new Date(v.data_entrada);
    const p = (n) => String(n).padStart(2, '0');
    const unicos = (lista) => [...new Set(lista.filter(Boolean))].join(' / ');
    const statusDe = (x) => Catalogo.statusDe(x.status === 'enviar-email' ? 'email-enviado' : x.status)?.titulo || x.status_titulo || '';
    const ids = membros.map((x) => x.id_ciclo ?? x.numero);
    const seguidos = ids.every((n, i) => i === 0 || n === ids[i - 1] + 1);
    const codigos = seguidos ? `${membros[0].codigo} A ${membros[membros.length - 1].codigo}` : membros.map((x) => x.codigo).join(' ');
    return {
      codigo: this.codigoPacote(v.pacote),
      barras: String(v.pacote || 'PACOTE').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      qtd: membros.length,
      data: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`,
      tipo: unicos(membros.map((x) => x.tipo_titulo || Catalogo.tipo(x.tipo)?.titulo)),
      status: unicos(membros.map(statusDe)),
      local: unicos(membros.map((x) => x.local_titulo || Catalogo.local(x.local)?.titulo)),
      codigos,
    };
  },

  zplPacote(membros, cfg = this.config()) {
    const t = this.TAMANHOS[cfg.tamanho] || this.TAMANHOS['100x150'];
    const k = Number(cfg.dpi) / 25.4;
    const mm = (x) => Math.round(x * k);
    const W = mm(t.w); const H = mm(t.h); const m = mm(3);
    const d = this.dadosPacote(membros);
    const z = ['^XA', '^CI28', `^PW${W}`, `^LL${H}`, '^LH0,0', `^PQ${Math.max(1, Number(cfg.copias) || 1)}`];
    const linha = (y, esp = .5) => `^FO${m},${mm(y)}^GB${W - 2 * m},${Math.max(2, mm(esp))},${Math.max(2, mm(esp))}^FS`;
    // moldura dupla
    z.push(`^FO${mm(1)},${mm(1)}^GB${W - mm(2)},${H - mm(2)},${Math.max(4, mm(.8))}^FS`, `^FO${mm(2.4)},${mm(2.4)}^GB${W - mm(4.8)},${H - mm(4.8)},${Math.max(2, mm(.3))}^FS`);
    if (t.h >= 90) {
      const e = t.h / 150;
      const y = (v150) => v150 * e;
      const xMarca = m + mm(y(10) * 360 / 281 + 3);
      z.push(
        // logo do M-Utility no alto, igual à etiqueta do ticket
        this.logoZpl(m + mm(1), mm(y(3)), mm(y(10))).zpl,
        `^FO${xMarca},${mm(y(3.6))}^A0N,${mm(y(6))},${mm(y(6))}^FDM-UTILITY^FS`,
        `^FO${xMarca},${mm(y(10))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FDCONTROLE NC^FS`,
        `^FO${m},${mm(y(14.6))}^GB${W - 2 * m},${Math.max(3, mm(.5))},${Math.max(3, mm(.5))}^FS`,
        // faixa preta com o título invertido
        `^FO${m},${mm(y(16.6))}^GB${W - 2 * m},${mm(y(9.5))},${mm(y(9.5))}^FS`,
        `^FO${m + mm(4)},${mm(y(18.4))}^A0N,${mm(y(6.2))},${mm(y(6.2))}^FR^FDPACOTE DE TICKETS^FS`,
        `^FO${m},${mm(y(28.5))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FD#ID DO PACOTE^FS`,
        `^FO${m},${mm(y(33))}^A0N,${mm(y(16))},${mm(y(11))}^FD${d.codigo}^FS`,
        // quadro da quantidade (à direita)
        `^FO${W - m - mm(30)},${mm(y(28))}^GB${mm(30)},${mm(y(24))},${Math.max(3, mm(.6))}^FS`,
        `^FO${W - m - mm(27)},${mm(y(30))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FDQUANTIDADE^FS`,
        `^FO${W - m - mm(27)},${mm(y(34))}^A0N,${mm(y(13))},${mm(y(12))}^FD${d.qtd}^FS`,
        `^FO${W - m - mm(27)},${mm(y(47.5))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FDTICKETS^FS`,
        linha(y(55)),
        `^FO${m},${mm(y(57.5))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FDTIPO DE NC^FS`,
        `^FO${m},${mm(y(61.5))}^A0N,${mm(y(6.5))},${mm(y(6.5))}^FD${this.textoZpl(d.tipo, 28)}^FS`,
        `^FO${m},${mm(y(70.5))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FDDATA^FS`,
        `^FO${m},${mm(y(74.5))}^A0N,${mm(y(5.5))},${mm(y(5.5))}^FD${d.data}^FS`,
        `^FO${m},${mm(y(82.5))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FDTICKETS DENTRO^FS`,
        `^FO${m},${mm(y(86.5))}^A0N,${mm(y(4.6))},${mm(y(4.6))}^FB${W - 2 * m},2,0,L^FD${this.textoZpl(d.codigos, 70)}^FS`,
        // status com borda grossa (diferente do ticket, que é uma faixa preta)
        `^FO${m},${mm(y(97))}^GB${W - 2 * m},${mm(y(16))},${Math.max(5, mm(1.2))}^FS`,
        `^FO${m + mm(3)},${mm(y(99))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FDSTATUS^FS`,
        `^FO${m + mm(3)},${mm(y(103))}^A0N,${mm(y(6.5))},${mm(y(6.5))}^FD${this.textoZpl(d.status, 30)}^FS`,
        `^FO${mm(12)},${mm(y(117))}^BY${Math.max(2, Math.round(k * .375))},3,${mm(y(14))}^BCN,${mm(y(14))},N,N,N^FD${d.barras}^FS`,
        `^FO${m},${mm(y(138))}^A0N,${mm(y(3.4))},${mm(y(3.4))}^FD${d.barras}   ${this.textoZpl(d.local, 22)}   impresso ${new Date().toLocaleString('pt-BR').slice(0, 17)}^FS`,
      );
    } else {
      const e = t.h / 50;
      const y = (v50) => v50 * e;
      z.push(
        this.logoZpl(m + mm(1), mm(y(3)), mm(y(4.6))).zpl,
        `^FO${m + mm(y(4.6) * 360 / 281 + 3)},${mm(y(3.4))}^A0N,${mm(y(3.6))},${mm(y(3.6))}^FDM-UTILITY  CONTROLE NC^FS`,
        `^FO${m},${mm(y(8.4))}^GB${W - 2 * m},${mm(y(5))},${mm(y(5))}^FS`,
        `^FO${m + mm(3)},${mm(y(9.2))}^A0N,${mm(y(3.6))},${mm(y(3.6))}^FR^FDPACOTE DE TICKETS^FS`,
        `^FO${m + mm(1)},${mm(y(15))}^A0N,${mm(y(9))},${mm(y(8))}^FD${d.codigo}^FS`,
        `^FO${W - m - mm(24)},${mm(y(14.5))}^GB${mm(24)},${mm(y(11))},${Math.max(3, mm(.6))}^FS`,
        `^FO${W - m - mm(21)},${mm(y(15.3))}^A0N,${mm(y(7))},${mm(y(6))}^FD${d.qtd}^FS`,
        `^FO${W - m - mm(13)},${mm(y(21.5))}^A0N,${mm(y(2.6))},${mm(y(2.6))}^FDTICKETS^FS`,
        `^FO${m + mm(1)},${mm(y(28))}^A0N,${mm(y(3.8))},${mm(y(3.8))}^FD${this.textoZpl(`${d.tipo} · ${d.data}`, 46)}^FS`,
        `^FO${m + mm(1)},${mm(y(32.6))}^A0N,${mm(y(3.2))},${mm(y(3.2))}^FD${this.textoZpl(d.codigos, 56)}^FS`,
        `^FO${m},${mm(y(37.5))}^GB${W - 2 * m},${mm(y(8.5))},${Math.max(4, mm(1))}^FS`,
        `^FO${m + mm(2.5)},${mm(y(39.6))}^A0N,${mm(y(4.2))},${mm(y(4.2))}^FD${this.textoZpl(`STATUS: ${d.status}`, 44)}^FS`,
      );
    }
    z.push('^XZ');
    return z.join('\n');
  },

  htmlPacote(membros, cfg = this.config()) {
    const t = this.TAMANHOS[cfg.tamanho] || this.TAMANHOS['100x150'];
    const d = this.dadosPacote(membros);
    const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const baixa = t.h < 90;
    return `
      <div class="etq-zebra etq-pacote ${baixa ? 'etq-baixa' : ''}" style="--etq-w:${t.w}mm; --etq-h:${t.h}mm; --e:${baixa ? t.h / 50 : t.h / 150}">
        <div class="etq-faixa etqp-marca"><img class="etq-logo" src="assets/logo.png" alt="" /><span class="etq-marca"><b>M-UTILITY</b><small>CONTROLE NC</small></span></div>
        <div class="etqp-faixa">PACOTE DE TICKETS</div>
        <div class="etqp-topo">
          <div class="etqp-id"><small>#ID DO PACOTE</small><b>${e(d.codigo)}</b></div>
          <div class="etqp-qtd"><small>QUANTIDADE</small><b>${d.qtd}</b><small>TICKETS</small></div>
        </div>
        <div class="etqp-campos">
          <div><small>TIPO DE NC</small><b>${e(d.tipo)}</b></div>
          <div><small>DATA</small><b>${e(d.data)}</b></div>
          ${baixa ? '' : `<div><small>TICKETS DENTRO</small><b class="etqp-codigos">${e(d.codigos)}</b></div>`}
        </div>
        <div class="etqp-status"><small>STATUS</small><b>${e(d.status)}</b></div>
        ${baixa ? '' : `<div class="etq-rodape">${e(d.barras)} · ${e(d.local)} · M-UTILITY CONTROLE NC</div>`}
      </div>`;
  },

  /** Imprime a etiqueta do pacote (mesmos caminhos do ticket: Browser Print → rede → janela). */
  async imprimirPacote(membros) {
    if (!membros?.length) return { ok: false, erro: 'Pacote vazio.' };
    const cfg = this.config();
    const codigo = this.codigoPacote(membros[0].pacote);
    if (cfg.metodo === 'nenhum') return { ok: true, via: 'nenhum' };
    const zpl = this.zplPacote(membros, cfg);
    if (cfg.metodo === 'auto' || cfg.metodo === 'browserprint') {
      try {
        const dispositivo = await this.enviarZpl(zpl);
        API.registrarAcao('Imprimiu a etiqueta do pacote na Zebra', codigo, `${membros.length} tickets`);
        return { ok: true, via: 'zebra', impressora: dispositivo.name || 'Zebra' };
      } catch (erro) {
        if (cfg.metodo === 'browserprint') return { ok: false, via: 'zebra', erro: erro.message };
      }
    }
    if (cfg.metodo === 'rede' || (cfg.metodo === 'auto' && cfg.ip)) {
      try {
        await this.enviarRede(zpl, cfg.ip);
        API.registrarAcao('Imprimiu a etiqueta do pacote na Zebra (rede)', codigo, `${membros.length} tickets`);
        return { ok: true, via: 'zebra', impressora: `ZT410 (${cfg.ip})` };
      } catch (erro) {
        if (cfg.metodo === 'rede') return { ok: false, via: 'rede', erro: erro.message };
      }
    }
    await this.janelaHtml(this.htmlPacote(membros, cfg), cfg);
    API.registrarAcao('Imprimiu a etiqueta do pacote (janela de impressão)', codigo, `${membros.length} tickets`);
    return { ok: true, via: 'janela' };
  },

  /** Janela de impressão com um HTML de etiqueta pronto (usado pelo pacote). */
  async janelaHtml(html, cfg = this.config()) {
    const t = this.TAMANHOS[cfg.tamanho] || this.TAMANHOS['100x150'];
    let area = document.getElementById('areaImpressao');
    if (!area) { area = document.createElement('div'); area.id = 'areaImpressao'; document.body.appendChild(area); }
    let pagina = document.getElementById('paginaEtiqueta');
    if (!pagina) { pagina = document.createElement('style'); pagina.id = 'paginaEtiqueta'; document.head.appendChild(pagina); }
    pagina.textContent = `@page { size: ${t.w}mm ${t.h}mm; margin: 0; }`;
    area.innerHTML = Array.from({ length: Math.max(1, Number(cfg.copias) || 1) }, () => html).join('');
    await this.esperarImagens(area);   // sem isso a logo do pacote saía em branco (ainda não tinha carregado)
    document.body.classList.add('imprimindo-etiqueta');
    window.print();
    document.body.classList.remove('imprimindo-etiqueta');
  },

  /* ---------- Modal de configuração (controle-nc.html) ---------- */
  montarConfiguracao() {
    const modal = document.getElementById('modalImpressora');
    if (!modal) return;
    const $ = (id) => document.getElementById(id);
    const el = { tamanho: $('impTamanho'), dpi: $('impDpi'), metodo: $('impMetodo'), copias: $('impCopias'), ip: $('impIp'), status: $('impStatus'), previa: $('impPrevia'), legenda: $('impLegenda') };
    el.tamanho.innerHTML = Object.entries(this.TAMANHOS).map(([id, t]) => `<option value="${id}">${t.nome}</option>`).join('');
    el.metodo.innerHTML = Object.entries(this.METODOS).map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('');

    const ler = () => ({ tamanho: el.tamanho.value, dpi: Number(el.dpi.value), metodo: el.metodo.value, copias: Math.min(5, Math.max(1, Number(el.copias.value) || 1)), ip: el.ip.value.trim() });
    const previa = () => {
      const cfg = ler();
      const t = this.TAMANHOS[cfg.tamanho];
      const px = 96 / 25.4;                       // 1 mm na tela
      const escala = Math.min(320 / (t.h * px), 260 / (t.w * px));
      el.previa.innerHTML = this.html(this.teste(), cfg);
      el.previa.style.transform = `scale(${escala.toFixed(3)})`;
      el.previa.style.width = `${t.w * px}px`;
      el.previa.style.height = `${t.h * px}px`;
      el.previa.parentElement.style.height = `${t.h * px * escala + 32}px`;
      el.previa.parentElement.style.width = `${t.w * px * escala + 32}px`;
      el.legenda.textContent = `${t.w} × ${t.h} mm · ${Math.round(t.w * cfg.dpi / 25.4)} × ${Math.round(t.h * cfg.dpi / 25.4)} pontos a ${cfg.dpi} dpi`;
    };
    const verificar = async () => {
      el.status.className = 'impressora-status';
      el.status.innerHTML = `${ic('relogio')} Procurando a Zebra pelo Browser Print…`;
      const z = await this.impressoraZebra();
      el.status.className = `impressora-status ${z ? 'ok' : 'erro'}`;
      el.status.innerHTML = z
        ? `${ic('check-circulo')} Zebra encontrada: <b>${escaparHtml(z.name || 'impressora')}</b> (${escaparHtml(z.connection || '')})`
        : `${ic('alerta')} Zebra Browser Print não respondeu. ${ler().metodo === 'auto' ? 'Os tickets vão abrir a janela de impressão.' : ''}`;
    };
    const salvar = () => { this.salvar(ler()); previa(); };

    [el.tamanho, el.dpi, el.metodo, el.copias, el.ip].forEach((c) => c.addEventListener('change', salvar));
    $('abrirImpressora')?.addEventListener('click', () => {
      const cfg = this.config();
      el.tamanho.value = cfg.tamanho; el.dpi.value = String(cfg.dpi); el.metodo.value = cfg.metodo; el.copias.value = cfg.copias; el.ip.value = cfg.ip || '';
      previa();
      modal.showModal();
      verificar();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-fechar-impressora]')) modal.close(); });
    $('impTeste').addEventListener('click', async () => {
      salvar();
      modal.close();
      const r = await this.imprimir(this.teste());
      Efeitos.toast(r.ok ? (r.via === 'zebra' ? `Etiqueta de teste enviada para <b>${escaparHtml(r.impressora)}</b>` : 'Etiqueta de teste enviada para a janela de impressão')
        : escaparHtml(r.erro), { icone: ic(r.ok ? 'impressora' : 'alerta'), tipo: r.ok ? 'sucesso' : 'alerta' });
    });
    $('impCopiarZpl').addEventListener('click', async (e) => {
      const botao = e.currentTarget;
      try { await navigator.clipboard.writeText(this.zpl(this.teste(), ler())); botao.innerHTML = `${ic('check')} ZPL copiado`; }
      catch { botao.textContent = 'Não foi possível copiar'; }
      setTimeout(() => { botao.innerHTML = `${ic('copiar')} Copiar ZPL`; }, 2000);
    });
  },

  /** Volume de teste para a etiqueta de exemplo. */
  teste() {
    return {
      numero: 0, codigo: '#000', data_entrada: new Date().toISOString(),
      cliente_nome: 'Teste de impressão', tipo: 'sem-integracao', tipo_titulo: 'Sem integração',
      status: 'enviar-email', status_titulo: 'Enviar e-mail', local: 'prateleira', local_titulo: 'Prateleira',
    };
  },
};

window.Impressao = Impressao;
// já deixa a logo da etiqueta carregada (a primeira impressão não sai sem ela)
try { new Image().src = "assets/logo.png"; } catch { /* */ }
