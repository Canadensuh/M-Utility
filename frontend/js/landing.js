/* =========================================================
   landing.js — a página inicial em "deck" (index.html)
   - As 7 telas ficam lado a lado, como slides. Um giro do mouse leva,
     numa animação suave, para a tela da DIREITA; dentro de algumas telas
     cada giro mostra mais um pedaço da animação (os tickets chegando,
     os 4 atos do volume #008, as AWBs sendo bipadas, os crachás…).
   - Depois da última tela, a página desce para a chamada final.
   - A rolagem continua sendo a do navegador (barra, teclado, links do
     menu): o deck só traduz a posição vertical em "telas".
   - Celular, tela baixa ou "menos movimento" no sistema: as telas ficam
     uma embaixo da outra, completas (html sem a classe .deck).
   Variáveis que o CSS usa:
     --e  (0 a 1) progresso de cada elemento com data-faixa="início fim"
     --m / --ma  posição da tela em relação à vista (-1 a 1) e o módulo
     --a --b --c --d  os 4 atos do Controle NC
   Precisa de js/helpy.js, js/escritorio.js e js/vitrine.js antes.
   ========================================================= */

(() => {
  const html = document.documentElement;
  const deck = document.querySelector('[data-deck]');
  if (!deck) return;
  const vista = deck.querySelector('.lp-deck-vista');
  const trilho = deck.querySelector('.lp-deck-trilho');
  const telas = [...deck.querySelectorAll('.lp-tela')];
  const final = document.getElementById('comecar');
  const N = telas.length;

  const limitar = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const suave = (t) => t * t * (3 - 2 * t);
  const vaiEVolta = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* Quantos "giros" do mouse cada tela tem por dentro (0 = só passa) */
  const GIROS = { inicio: 0, utilidades: 6, 'controle-nc': 12, localizador: 10, helpy: 0, perfis: 5, sobre: 0 };
  /* Onde o menu leva em cada tela (0 = começo da animação, 1 = completa) */
  const ANCORA = { inicio: 0, utilidades: 1, 'controle-nc': .25, localizador: 0, helpy: 0, perfis: 1, sobre: 1 };
  const PASSO = 120;   // px de rolagem por giro

  // =========================================================
  // Réplicas do app
  // =========================================================
  const temHelpy = typeof window.Helpy !== 'undefined';
  const ic = (n) => `<i class="ic ic-${n}"></i>`;

  // ---------- Minha Mesa: os tickets ----------
  const TICKETS = [
    ['#006', 'servidor-off', 'Sem integração', 'NF 665544', 'email', 'Enviar e-mail', 'entrou hoje', 'Prateleira', -1.2, '10 dias'],
    ['#005', 'servidor-off', 'Sem integração', 'NF 112233', 'email', 'Enviar e-mail', 'entrou hoje', 'Prateleira', .8, '10 dias'],
    ['#004', 'copiar', 'Duplicidade', 'NF 778899', 'aguardando', 'Aguardando entrega', 'há 2 dias', 'Pallet de fora', -.4, ''],
    ['#003', 'servidor-off', 'Sem integração', 'NF 554433', 'enviado', 'E-mail enviado', 'há 8 dias', 'Prateleira', .5, '2 dias'],
    ['#002', 'servidor-off', 'Sem integração', 'NF 223344', 'enviado', 'E-mail enviado', 'há 3 dias', 'Pallet de dentro', -.9, '7 dias'],
    ['#001', 'servidor-off', 'Sem integração', 'NF 123456', 'email', 'Enviar e-mail', 'há 1 dia', 'Prateleira', 1, '9 dias'],
  ];
  const elMesa = deck.querySelector('[data-mesa-tickets]');
  if (elMesa) {
    elMesa.innerHTML = TICKETS.map(([n, ico, tipo, nf, st, stTxt, quando, local, rot, prazo]) => `
      <article class="tkm-r" style="--rot:${rot}deg">
        <header class="tkm-r-cab"><span class="check"></span><b>${n}</b><span class="cod">${ic('codigo-barras')}</span><span class="cli">Cliente Exemplo</span></header>
        <div class="tkm-r-corpo"><span class="ico">${ic(ico)}</span><div><strong>${tipo}</strong><small>${nf}</small></div>
          ${prazo ? `<span class="prazo ${prazo === '2 dias' ? 'alerta' : ''}">${ic('relogio')}<span>${prazo}<br>restantes</span></span>` : '<span></span>'}</div>
        <div class="tkm-r-picote"></div>
        <div class="tkm-r-pe"><div class="linha"><span class="st-pill ${st}">${stTxt}</span> ${quando}</div><div class="linha">${ic('pastas')} ${local}</div></div>
      </article>`).join('');
  }

  // ---------- Salinhas, Helpy ao lado da impressora e as roupas ----------
  if (window.Vitrine) {
    document.querySelectorAll('[data-salinha]').forEach((el) => Vitrine.salinha(el, { humor: el.dataset.salinha || 'feliz' }));
    if (temHelpy) document.querySelectorAll('[data-helpy]').forEach((el) => { el.innerHTML = Helpy.avatar(el.dataset.helpy || 'feliz'); });
    const elRoupas = deck.querySelector('[data-roupas]');
    if (elRoupas && temHelpy) {
      const atual = Helpy.skinAtual();
      elRoupas.innerHTML = Helpy.SKINS.map((s) => `
        <button type="button" class="roupa ${s.id === atual ? 'ativa' : ''}" data-roupa="${s.id}" aria-label="Roupa ${s.nome}">
          ${Vitrine.comSkin(Helpy.avatar(), s.id)}<span>${s.nome}</span>
        </button>`).join('');
      elRoupas.addEventListener('click', (e) => { const b = e.target.closest('[data-roupa]'); if (b) Vitrine.vestir(b.dataset.roupa); });
    }
    Vitrine.ligarCarinho();
    Vitrine.ligarEscalas();
    Vitrine.ligarInclinacao();
  }

  // ---------- Localizador de AWB: as leituras conduzidas pela rolagem ----------
  const AWBS = [
    ['TXAQ102938475TX', 'integral'], ['TXAQ564738291TX', 'parcial'], ['TXAQ918273645TX', 'integral'],
    ['TXAQ111222333TX', 'parcial'], ['TXAQ444555666TX', 'integral'],
  ];
  const LEITURAS = [
    { codigo: 'TXAQ102938475TX', r: 'integral', item: 0 },
    { codigo: 'TXAQ564738291TX', r: 'parcial', item: 1 },
    { codigo: 'TXAQ000111222TX', r: 'nao' },
    { codigo: 'TXAQ102938475TX', r: 'bipado', item: 0 },
    { codigo: 'TXAQ918273645TX', r: 'integral', item: 2 },
    { codigo: 'ABC-123', r: 'invalido' },
  ];
  const RESULTADOS = {
    integral: ['✓', 'Integral', 'Está na lista · AWB integral'],
    parcial: ['✓', 'Parcial', 'Está na lista · AWB parcial'],
    nao: ['?', 'Não encontrado', 'Fora da lista importada'],
    bipado: ['!', 'Já bipado', 'Essa peça já passou por aqui'],
    invalido: ['✕', 'Inválido', 'Isso não é uma AWB'],
  };
  const elLoc = deck.querySelector('[data-loc]');
  let lidas = -1;
  function bipar(k) {
    if (!elLoc || k === lidas) return;
    const antes = lidas;
    lidas = k;
    const feitas = LEITURAS.slice(0, k);
    const achados = new Set(feitas.filter((l) => l.item !== undefined).map((l) => l.item));
    const conta = (r) => feitas.filter((l) => l.r === r).length;
    const ultima = feitas[feitas.length - 1];
    elLoc.querySelector('[data-loc-linhas]').innerHTML = AWBS.map(([awb, tipo], i) => `
      <tr class="${achados.has(i) ? 'achou' : ''} ${ultima?.item === i ? 'agora' : ''}"><td>${i + 1}</td><td>${awb}</td>
      <td><span class="loc-tipo ${tipo}">${tipo.toUpperCase()}</span></td><td><span class="loc-ok ${achados.has(i) ? 'sim' : 'nao'}">${achados.has(i) ? '✓' : ''}</span></td></tr>`).join('');
    const cestos = { nao: conta('nao'), integral: `${conta('integral')}/3`, parcial: `${conta('parcial')}/2`, invalido: conta('invalido') };
    Object.entries(cestos).forEach(([id, v]) => { elLoc.querySelector(`[data-cesto="${id}"] b`).textContent = v; });
    elLoc.querySelector('[data-loc-codigo]').textContent = ultima ? ultima.codigo : 'Bipe ou digite aqui';
    const res = elLoc.querySelector('[data-loc-resultado]');
    const [icone, titulo, texto] = ultima ? RESULTADOS[ultima.r] : ['…', 'Pronto', 'Bipe a primeira peça'];
    res.className = `loc-resultado ${ultima ? `r-${ultima.r}` : 'r-vazio'}`;
    res.innerHTML = `<span class="rico">${icone}</span><strong>${titulo}</strong><code>${ultima ? ultima.codigo : 'aguardando leitura'}</code><span>${texto}</span>`;
    // a peça nova cai na esteira certa (só quando a rolagem anda para frente)
    if (k > antes && antes >= 0 && ultima && comAnimacao) {
      void res.offsetWidth; res.classList.add('mudou');
      const faixa = elLoc.querySelector(`[data-cesto="${ultima.r}"]`);
      if (faixa) {
        faixa.classList.remove('cai', 'pulou'); void faixa.offsetWidth; faixa.classList.add('cai');
        setTimeout(() => faixa.classList.add('pulou'), 800);
      }
    }
  }

  // =========================================================
  // O deck
  // =========================================================
  const porTela = telas.map((tela) => [...tela.querySelectorAll('[data-faixa]')].map((el) => {
    const [a, b] = el.dataset.faixa.split(' ').map(Number);
    return { el, a, b, ultimo: -1 };
  }));
  const palco = deck.querySelector('[data-palco]');
  const atos = [...deck.querySelectorAll('.ato')];
  const navLinks = [...document.querySelectorAll('[data-nav]')];

  const podeDeck = matchMedia('(min-width: 1000px) and (min-height: 600px) and (hover: hover) and (pointer: fine)');
  const comAnimacao = html.classList.contains('anima');
  let ehDeck = false;

  // Posições (px, relativas ao topo do deck): começo e fim da parte "por dentro" de cada tela
  let ini = [], fim = [], MOVE = 0, L = 0, topoDeck = 0;

  function medir() {
    const H = innerHeight;
    MOVE = Math.round(H * .9);           // rolagem que leva de uma tela para a outra
    ini = []; fim = [];
    let y = 0;
    telas.forEach((tela, i) => {
      ini[i] = y;
      y += (GIROS[tela.dataset.tela] || 0) * PASSO;
      fim[i] = y;
      if (i < N - 1) y += MOVE;
    });
    L = y;
    deck.style.height = ehDeck ? `${L + H}px` : '';
    topoDeck = deck.offsetTop;
  }

  /** Em que ponto do deck estamos: x = tela (com fração no meio da passagem) e t de cada tela. */
  function situacao(y) {
    const rel = limitar(y - topoDeck, 0, L);
    for (let i = 0; i < N; i++) {
      if (rel <= fim[i] + .5) {
        if (rel >= ini[i] - .5) {
          const dentro = fim[i] - ini[i];
          return { i, x: i, t: dentro ? limitar((rel - ini[i]) / dentro) : 1, dentro: true };
        }
        const f = limitar((rel - fim[i - 1]) / MOVE);   // passagem da tela i-1 para a i
        return { i: i - 1, x: i - 1 + f, t: 1, dentro: false };
      }
    }
    return { i: N - 1, x: N - 1, t: 1, dentro: true };
  }

  let ultimoX = -1, ultimoT = [], atoAtual = -1;

  function desenhar() {
    if (!ehDeck) return;
    const s = situacao(scrollY);
    const x = s.x;
    if (vista.scrollLeft) vista.scrollLeft = 0;
    if (x !== ultimoX) {
      trilho.style.transform = `translate3d(${(-x * 100).toFixed(3)}%, 0, 0)`;
      telas.forEach((tela, i) => {
        const m = limitar(i - x, -1, 1);
        tela.style.setProperty('--m', m.toFixed(4));
        tela.style.setProperty('--ma', Math.abs(m).toFixed(4));
      });
      ultimoX = x;
    }
    telas.forEach((tela, i) => {
      const t = i < s.i ? 1 : i > s.i ? 0 : s.dentro ? s.t : 1;
      if (t === ultimoT[i]) return;
      ultimoT[i] = t;
      animarTela(i, t);
    });
    const id = telas[Math.round(x)].id;
    const abaixo = scrollY > topoDeck + L + innerHeight * .5;
    navLinks.forEach((a) => a.classList.toggle('ativo', !abaixo && a.dataset.nav === id));
  }

  function animarTela(i, t) {
    porTela[i].forEach((item) => {
      const e = item.b > item.a ? suave(limitar((t - item.a) / (item.b - item.a))) : Number(t >= item.a);
      const r = Math.round(e * 1000) / 1000;
      if (r === item.ultimo) return;
      item.ultimo = r;
      item.el.style.setProperty('--e', r);
      item.el.classList.toggle('cheio', r >= 1);
    });
    const nome = telas[i].dataset.tela;
    if (nome === 'controle-nc') animarAtos(t);
    if (nome === 'localizador') bipar(Math.min(LEITURAS.length, Math.floor(t * LEITURAS.length + .0001)));
  }

  /** Os 4 atos: cada um anima em 80% do seu trecho e "descansa" nos 20% finais. */
  function animarAtos(t) {
    if (!palco) return;
    const p = t * 4;
    ['a', 'b', 'c', 'd'].forEach((v, k) => palco.style.setProperty(`--${v}`, suave(limitar((p - k) / .8)).toFixed(4)));
    const idx = limitar(Math.ceil(p) - 1, 0, 3);
    if (idx !== atoAtual) {
      atoAtual = idx;
      atos.forEach((el, k) => { el.classList.toggle('atual', k === idx); el.classList.toggle('passou', k < idx); });
    }
  }

  // ---------- Rolagem suave (o deck "anda" para a próxima tela) ----------
  let alvo = scrollY, atual = scrollY, salto = null, rodando = false, esperado = null;
  let travaAte = 0, travaMax = 0;

  function rolar(y) { esperado = Math.round(y); scrollTo(0, y); }
  function laco(agora) {
    if (salto) {
      const k = limitar((agora - salto.t0) / salto.dur);
      atual = salto.de + (salto.para - salto.de) * vaiEVolta(k);
      rolar(atual);
      if (k >= 1) { salto = null; atual = alvo; travaAte = agora + 160; travaMax = agora + 1300; }
    } else {
      atual += (alvo - atual) * .16;
      if (Math.abs(alvo - atual) < .6) atual = alvo;
      rolar(atual);
    }
    if (salto || atual !== alvo) requestAnimationFrame(laco);
    else rodando = false;
  }
  function andar() { if (!rodando) { rodando = true; requestAnimationFrame(laco); } }
  function saltar(y, telasPassadas = 1) {
    alvo = y;
    salto = { de: scrollY, para: y, t0: performance.now(), dur: Math.min(1700, 820 + 220 * (telasPassadas - 1)) };
    andar();
  }
  const yDe = (i, frac) => topoDeck + ini[i] + (fim[i] - ini[i]) * frac;
  const yFinal = () => final.offsetTop;

  /** Um "giro" para frente (dir = 1) ou para trás (dir = -1). forte = pula direto de tela. */
  function girar(dir, quanto = PASSO, forte = false) {
    const base = salto ? salto.para : alvo;
    const s = situacao(base);
    const rel = base - topoDeck;
    if (dir > 0) {
      if (base > topoDeck + L + 2) return false;
      if (!s.dentro) { saltar(yDe(s.i + 1, 0)); return true; }
      if (forte || rel >= fim[s.i] - 1) {
        if (s.i < N - 1) saltar(yDe(s.i + 1, 0));
        else saltar(yFinal());
        return true;
      }
      alvo = Math.min(topoDeck + fim[s.i], base + quanto);
    } else {
      if (base > topoDeck + L + 2) return false;
      if (!s.dentro) { saltar(yDe(s.i, 1)); return true; }
      if (forte || rel <= ini[s.i] + 1) {
        if (s.i > 0) saltar(yDe(s.i - 1, 1));
        else return false;
        return true;
      }
      alvo = Math.max(topoDeck + ini[s.i], base - quanto);
    }
    salto = null;
    andar();
    return true;
  }

  function aoGirar(e) {
    if (!ehDeck || e.ctrlKey) return;
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 40;
    if (e.deltaMode === 2) d *= innerHeight;
    if (!d) return;
    if (scrollY > topoDeck + L + 2 && !salto) return;   // abaixo do deck a página rola normal
    const agora = performance.now();
    if (salto) { e.preventDefault(); return; }
    if (agora < travaAte) {   // logo depois de um salto, o "embalo" do touchpad não conta
      e.preventDefault();
      if (Math.abs(d) < 60 && agora < travaMax) travaAte = agora + 90;
      return;
    }
    if (girar(Math.sign(d), Math.abs(d) >= 50 ? PASSO : Math.abs(d))) e.preventDefault();
  }
  addEventListener('wheel', aoGirar, { passive: false });

  addEventListener('keydown', (e) => {
    if (!ehDeck || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, textarea, select, button, [contenteditable]')) return;
    const frente = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
    const tras = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
    if (!frente && !tras) return;
    const forte = e.key.startsWith('Page') || e.key === ' ';
    if (girar(frente ? 1 : -1, PASSO, forte)) e.preventDefault();
  });

  addEventListener('scroll', () => {
    if (rodando) {
      if (esperado !== null && Math.abs(scrollY - esperado) > 3) { salto = null; alvo = atual = scrollY; }
    } else alvo = atual = scrollY;
    pedirQuadro();
  }, { passive: true });

  // ---------- Links do menu e dos botões ----------
  function irParaTela(id, instantaneo = false) {
    const i = telas.findIndex((t) => t.id === id);
    if (i < 0) return false;
    const y = yDe(i, ANCORA[telas[i].dataset.tela] ?? 1);
    if (instantaneo) { alvo = atual = y; rolar(y); pedirQuadro(); return true; }
    saltar(y, Math.abs(i - Math.round(situacao(scrollY).x)) || 1);
    return true;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || !ehDeck) return;
    const id = a.getAttribute('href').slice(1);
    if (id === 'comecar') { e.preventDefault(); saltar(yFinal()); return; }
    if (irParaTela(id)) { e.preventDefault(); history.replaceState(null, '', `#${id}`); }
  });

  // ---------- Liga / desliga o deck ----------
  let pedido = 0;
  function pedirQuadro() { if (!pedido) pedido = requestAnimationFrame(() => { pedido = 0; desenhar(); }); }

  function aplicarModo() {
    const antes = ehDeck ? situacao(scrollY) : null;
    ehDeck = comAnimacao && podeDeck.matches;
    html.classList.toggle('deck', ehDeck);
    window.Vitrine?.ajustarEscalas();
    medir();
    if (!ehDeck) {   // lista: tudo completo
      trilho.style.transform = '';
      telas.forEach((tela, i) => { tela.style.removeProperty('--m'); tela.style.removeProperty('--ma'); animarTela(i, 1); });
      porTela.flat().forEach((item) => { item.el.style.removeProperty('--e'); item.el.classList.add('cheio'); item.ultimo = -1; });
      ['--a', '--b', '--c', '--d'].forEach((v) => palco?.style.removeProperty(v));
      atos.forEach((el) => el.classList.add('atual'));
      ultimoX = -1; ultimoT = [];
      return;
    }
    atos.forEach((el) => el.classList.remove('atual'));
    atoAtual = -1; ultimoX = -1; ultimoT = [];
    if (antes) {
      const y = antes.dentro ? yDe(antes.i, antes.t) : yDe(Math.round(antes.x), 0);
      alvo = atual = y; rolar(y);
    }
    desenhar();
  }
  let esperaResize = 0;
  addEventListener('resize', () => { clearTimeout(esperaResize); esperaResize = setTimeout(aplicarModo, 120); });
  podeDeck.addEventListener?.('change', aplicarModo);

  // Chamada final: o ticket grande entra quando aparece
  const caixaFinal = final?.querySelector('.final-ticket');
  if (caixaFinal && 'IntersectionObserver' in window) {
    new IntersectionObserver((entradas, obs) => {
      entradas.forEach((en) => { if (en.isIntersecting) { caixaFinal.classList.add('visto'); obs.disconnect(); } });
    }, { threshold: .25 }).observe(caixaFinal);
  } else caixaFinal?.classList.add('visto');

  bipar(0);
  aplicarModo();
  if (ehDeck && location.hash) {
    const id = location.hash.slice(1);
    if (id === 'comecar') rolar(yFinal()); else irParaTela(id, true);
  }
  document.fonts?.ready.then(() => { medir(); pedirQuadro(); });
})();
