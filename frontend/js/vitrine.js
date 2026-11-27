/* =========================================================
   vitrine.js — peças comuns do site público (index e login)
   - Salinha do Helpy igual à do app (quadro com a palavra do dia,
     garrafa d'água, lixeira e os botões da mesinha). O cabide troca
     a roupa dele só aqui na página (easter egg, não salva nada).
   - Carinho: segurar o clique e passar o mouse no Helpy. Ele fica
     apaixonado e solta coraçõezinhos, sem mandar mensagem.
   - [data-escala="L A"]: desenha o conteúdo em L × A px e escala
     para caber na largura (e na altura livre da tela, se data-alto).
   - .inclina: o card mexe acompanhando o mouse.
   Precisa de js/helpy.js e js/escritorio.js antes.
   ========================================================= */

const Vitrine = {
  SVG_CONFIG: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  SVG_FILTRO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/></svg>',
  SVG_CABIDE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 11 2.8 17.2A1 1 0 0 0 3.4 19h17.2a1 1 0 0 0 .6-1.8z"/></svg>',
  SVG_GARRAFA: `<svg class="garrafa-svg" viewBox="0 0 40 70" aria-hidden="true">
      <defs><clipPath id="vitGarrafa"><path d="M13 14h14v4c4 3 6 7 6 12v30a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V30c0-5 2-9 6-12z"/></clipPath></defs>
      <rect class="garrafa-tampa" x="13" y="3" width="14" height="9" rx="2.5"/>
      <path class="garrafa-vidro" d="M13 14h14v4c4 3 6 7 6 12v30a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V30c0-5 2-9 6-12z"/>
      <g clip-path="url(#vitGarrafa)"><rect class="garrafa-agua-nivel" x="0" y="0" width="40" height="70"/><path class="garrafa-onda" d="M0 0q5-3 10 0t10 0t10 0t10 0v4H0z"/></g>
      <path class="garrafa-brilho" d="M11 32v22"/>
    </svg>`,

  skinDaPagina: null,
  temHelpy: () => typeof window.Helpy !== 'undefined',
  comSkin(html, id) { return html.replace(/ skin-[a-z]+" aria-hidden/, ` skin-${id}" aria-hidden`); },

  /** Palavra do dia (a mesma do app). */
  palavraDoDia() {
    const lista = window.Escritorio?.PALAVRAS || [['Foco', 'Um ticket de cada vez!']];
    const dia = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return lista[dia % lista.length];
  },

  /** Monta a salinha do Helpy dentro de el (igual à lateral do app). */
  salinha(el, { humor = 'feliz', filtro = true } = {}) {
    const skin = this.skinDaPagina || (this.temHelpy() ? Helpy.skinAtual() : 'padrao');
    const [palavra, frase] = this.palavraDoDia();
    const botoes = [['btn-config', 'Configurações', this.SVG_CONFIG], ...(filtro ? [['btn-filtro', 'Filtro', this.SVG_FILTRO]] : []), ['btn-cabide', 'Trocar a roupa do Helpy', this.SVG_CABIDE]];
    el.innerHTML = `
      <div class="escritorio sala-${skin}" data-carinho>
        ${window.Escritorio?.enfeitesSvg ? Escritorio.enfeitesSvg() : ''}
        <div class="quadro-aviso"><small>Palavra do dia</small><strong>${palavra}</strong><span>${frase}</span></div>
        ${this.temHelpy() ? this.comSkin(Helpy.avatar(humor), skin) : ''}
        <span class="garrafa-agua" aria-hidden="true">${this.SVG_GARRAFA}</span>
        <div class="escritorio-mesinha" aria-hidden="true"></div>
        ${botoes.map(([cls, rotulo, svg], i) => `<button type="button" class="btn-mesa ${cls}" style="left:${12 + i * 38}px" ${cls === 'btn-cabide' ? `aria-label="${rotulo}" title="${rotulo}"` : 'tabindex="-1" aria-hidden="true"'}>${svg}</button>`).join('')}
        <div class="lixeira-helpy" aria-hidden="true"><span class="lix-tampa"></span><span class="lix-corpo"></span></div>
      </div>`;
    el.querySelector('.btn-cabide')?.addEventListener('click', () => this.proximaRoupa());
  },

  /** Troca a roupa de todos os Helpys da página (só aqui, sem salvar). */
  vestir(id, { animar = true } = {}) {
    if (!this.temHelpy()) return;
    this.skinDaPagina = id;
    const ids = Helpy.SKINS.map((s) => s.id);
    document.querySelectorAll('.escritorio').forEach((sala) => {
      sala.classList.remove(...ids.map((x) => `sala-${x}`));
      sala.classList.add(`sala-${id}`);
    });
    document.querySelectorAll('.helpy-avatar').forEach((av) => {
      if (av.closest('.roupa')) return;
      av.classList.remove(...ids.map((x) => `skin-${x}`));
      av.classList.add(`skin-${id}`);
      if (animar && av.closest('.escritorio') && document.documentElement.classList.contains('anima')) {
        av.classList.remove('trocando'); void av.offsetWidth; av.classList.add('trocando');
        setTimeout(() => av.classList.remove('trocando'), 750);
      }
    });
    document.querySelectorAll('.roupa').forEach((b) => b.classList.toggle('ativa', b.dataset.roupa === id));
  },
  proximaRoupa() {
    if (!this.temHelpy()) return;
    const ids = Helpy.SKINS.map((s) => s.id);
    const atual = this.skinDaPagina || Helpy.skinAtual();
    this.vestir(ids[(ids.indexOf(atual) + 1) % ids.length]);
  },

  /** Carinho no Helpy: segura o clique e passa o mouse. Sem mensagem, só carinha e corações. */
  ligarCarinho() {
    let segurando = false, ativo = false, andou = 0, desdeCoracao = 0, ultimo = null, alvo = null, timerFim = 0, humorAntes = '';
    const coracao = () => {
      const av = alvo; const pai = av?.parentElement;
      if (!av || !pai) return;
      const ra = av.getBoundingClientRect(); const rp = pai.getBoundingClientRect();
      const escala = rp.width / (pai.offsetWidth || rp.width);   // a salinha pode estar escalada
      const c = document.createElement('span');
      c.className = 'helpy-coracao';
      c.textContent = ['💗', '💖', '💕', '❤️'][Math.floor(Math.random() * 4)];
      const lado = Math.random() < .5 ? -1 : 1;
      c.style.left = `${(ra.left - rp.left + ra.width / 2 + lado * ra.width * (.18 + Math.random() * .22)) / escala}px`;
      c.style.top = `${(ra.top - rp.top + ra.height * .32) / escala}px`;
      c.style.setProperty('--desvio', `${Math.round(lado * (10 + Math.random() * 22))}px`);
      pai.insertBefore(c, av);
      setTimeout(() => c.remove(), 1400);
    };
    const HUMORES = window.Helpy?.HUMORES || [];
    const parar = () => {
      if (!segurando) return;
      segurando = false;
      if (!ativo) return;
      ativo = false;
      const av = alvo;
      timerFim = setTimeout(() => {
        av?.classList.remove('carinho', 'apaixonado');
        if (humorAntes) av?.classList.add(humorAntes);
      }, 900);
    };
    document.addEventListener('pointerdown', (e) => {
      const av = e.target.closest?.('[data-carinho] .helpy-avatar');
      if (e.button !== 0 || !av) return;
      e.preventDefault();
      segurando = true; andou = 0; desdeCoracao = 0; alvo = av;
      ultimo = { x: e.clientX, y: e.clientY };
    });
    document.addEventListener('pointermove', (e) => {
      if (!segurando) return;
      if (!(e.buttons & 1)) { parar(); return; }
      const passo = Math.hypot(e.clientX - ultimo.x, e.clientY - ultimo.y);
      ultimo = { x: e.clientX, y: e.clientY };
      if (e.target.closest?.('.helpy-avatar') !== alvo) return;
      andou += passo; desdeCoracao += passo;
      if (andou > 30 && !ativo) {
        ativo = true;
        clearTimeout(timerFim);
        humorAntes = HUMORES.find((h) => h !== 'apaixonado' && alvo.classList.contains(h)) || humorAntes;
        alvo.classList.remove(...HUMORES);
        alvo.classList.add('carinho', 'apaixonado');
      }
      if (ativo && desdeCoracao > 45) { desdeCoracao = 0; coracao(); }
    });
    document.addEventListener('pointerup', parar);
    document.addEventListener('pointercancel', parar);
  },

  /** Desenha em L × A e escala para caber. data-alto="0.7" = no máximo 70% da altura da janela. */
  ligarEscalas() {
    const caixas = [...document.querySelectorAll('[data-escala]')];
    const ajustar = () => caixas.forEach((caixa) => {
      const [L, A] = caixa.dataset.escala.split(' ').map(Number);
      const dentro = caixa.querySelector('.escala-dentro');
      const largura = caixa.clientWidth || L;
      let s = largura / L;
      const alto = Number(caixa.dataset.alto || 0);
      if (alto && document.documentElement.classList.contains('deck')) s = Math.min(s, (innerHeight * alto) / A);
      s = Math.min(s, Number(caixa.dataset.max || 9));
      caixa.style.height = `${Math.round(A * s)}px`;
      dentro.style.setProperty('--s', s.toFixed(4));
      dentro.style.setProperty('--x', `${Math.max(0, (largura - L * s) / 2)}px`);
    });
    this.ajustarEscalas = ajustar;
    ajustar();
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(ajustar); caixas.forEach((c) => ro.observe(c)); }
    addEventListener('resize', ajustar);
    document.fonts?.ready.then(ajustar);
  },
  ajustarEscalas() {},

  /** O card acompanha o mouse (inclina um pouquinho). */
  ligarInclinacao() {
    if (!document.documentElement.classList.contains('anima') || !matchMedia('(hover: hover)').matches) return;
    document.querySelectorAll('.inclina').forEach((caixa) => {
      const alvo = caixa.querySelector('.inclina-alvo');
      if (!alvo) return;
      caixa.addEventListener('pointermove', (e) => {
        const r = caixa.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        alvo.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`);
        alvo.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
      });
      caixa.addEventListener('pointerleave', () => { alvo.style.setProperty('--ry', '0deg'); alvo.style.setProperty('--rx', '0deg'); });
    });
  },
};

window.Vitrine = Vitrine;
