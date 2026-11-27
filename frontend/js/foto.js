/* =========================================================
   foto.js — "tira uma foto" de um pedaço da tela (PNG)
   Copia o elemento com os estilos calculados (inclusive
   ::before e ::after), monta um SVG com <foreignObject>,
   desenha num canvas e baixa como imagem. Tudo local:
   nada sai do navegador.
   Uso: await Foto.baixar(elemento, 'Ticket #045');
   ========================================================= */

const Foto = {
  /** Estilo calculado de um elemento (ou pseudo) como texto CSS. */
  estilo(cs) {
    let css = '';
    for (let i = 0; i < cs.length; i += 1) {
      const p = cs[i];
      if (p.startsWith('transition') || p.startsWith('animation')) continue;
      css += `${p}:${cs.getPropertyValue(p)};`;
    }
    return css;
  },

  /** Clona o elemento com os estilos embutidos. Devolve { no, css }. */
  clonar(original) {
    const regras = [];
    let n = 0;
    const copiar = (orig, copia) => {
      if (orig.nodeType !== 1) return;
      const cs = getComputedStyle(orig);
      copia.setAttribute('style', this.estilo(cs));
      ['::before', '::after'].forEach((pseudo) => {
        const pcs = getComputedStyle(orig, pseudo);
        if (!pcs.content || pcs.content === 'none' || pcs.content === 'normal') return;
        n += 1;
        const classe = `fx-${n}`;
        copia.classList.add(classe);
        regras.push(`.${classe}${pseudo}{${this.estilo(pcs)}}`);
      });
      if (orig.tagName === 'CANVAS') {
        try {
          const img = document.createElement('img');
          img.src = orig.toDataURL();
          img.setAttribute('style', copia.getAttribute('style'));
          copia.replaceWith(img);
          return;
        } catch { /* canvas protegido: fica em branco */ }
      }
      if (orig.tagName === 'INPUT' || orig.tagName === 'TEXTAREA') copia.setAttribute('value', orig.value);
      [...orig.childNodes].forEach((filho, i) => copiar(filho, copia.childNodes[i]));
    };
    const no = original.cloneNode(true);
    copiar(original, no);
    // a foto não leva botões; o código de barras aparece sempre (em tela baixa ele some da tela)
    no.querySelectorAll('button, .tk-ler-nota').forEach((b) => b.remove());
    no.querySelectorAll('.codigo-barras').forEach((c) => { c.style.display = 'block'; if (!parseFloat(c.style.height)) c.style.height = '18px'; c.style.marginTop = '.8rem'; });
    return { no, css: regras.join('') };
  },

  /**
   * Desenha o elemento num canvas (escala 2× para ficar nítido).
   * fundo: cor por trás de tudo; null (o padrão) = PNG com fundo TRANSPARENTE.
   * raiz: CSS extra só no elemento fotografado (ex.: o fundo e o border-radius do container).
   */
  async canvas(elemento, { escala = 2, margem = 24, fundo = null, raiz = '' } = {}) {
    const w = Math.ceil(elemento.getBoundingClientRect().width);
    const { no, css } = this.clonar(elemento);
    no.style.margin = '0';
    no.style.transform = 'none';
    no.style.height = 'auto';
    no.style.maxHeight = 'none';
    if (raiz) no.style.cssText += `;${raiz}`;
    // mede a cópia fora da tela (sem botões e com o código de barras, a altura muda)
    const medida = document.createElement('div');
    medida.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;visibility:hidden;pointer-events:none`;
    medida.innerHTML = `<style>${css}</style>`;
    medida.appendChild(no);
    document.body.appendChild(medida);
    const h = Math.ceil(no.getBoundingClientRect().height);
    medida.remove();
    // o contorno do ticket vem do filtro do "palco" (pai): leva junto
    const filtroPai = elemento.parentElement ? getComputedStyle(elemento.parentElement).filter : "none";
    const xhtml = `<div style="filter:${filtroPai && filtroPai !== "none" ? filtroPai.replace(/"/g, "'") : "none"}">${new XMLSerializer().serializeToString(no)}</div>`;
    const W = w + margem * 2;
    const H = h + margem * 2;
    // o foreignObject ocupa a imagem toda (com folga) para não cortar contorno e sombra do ticket
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:${W}px;height:${H}px;padding:${margem}px"><style>${css}</style>${xhtml}</div></foreignObject></svg>`;
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((ok, falha) => { img.onload = ok; img.onerror = () => falha(new Error('Não consegui montar a imagem.')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    const canvas = document.createElement('canvas');
    canvas.width = W * escala;
    canvas.height = H * escala;
    const ctx = canvas.getContext('2d');
    ctx.scale(escala, escala);
    if (fundo) { ctx.fillStyle = fundo; ctx.fillRect(0, 0, W, H); }   // sem fundo: o PNG fica transparente em volta
    ctx.drawImage(img, 0, 0, W, H);
    return canvas;
  },

  /** Baixa o elemento como PNG. */
  async baixar(elemento, nome, opcoes = {}) {
    const canvas = await this.canvas(elemento, opcoes);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('Não consegui gerar a imagem.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(nome).replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  },
};

window.Foto = Foto;
