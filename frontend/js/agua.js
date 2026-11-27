/* =========================================================
   agua.js — Desafio da Água (mini jogo do Helpy BOT)
   - A garrafa tem 8 goles: cada GOTA é 1/8 da garrafa (100% ÷ 8).
     Bebeu as 8 gotas, a garrafa acabou: é só encher de novo.
   - Clicando numa gota cheia, você bebe até ela (pode ser mais de um
     gole de uma vez). Clicou sem querer? Clica de novo na mesma gota
     e ela volta.
   - De manhã o Helpy pede para encher a garrafa e, ao longo do turno,
     aparece com ela na mão: "Bora?" (BORA = um gole).
   - MEDALHAS: os pontos da semana sobem de medalha. Toda segunda a
     semana zera; a ideia é chegar na última até a sexta-feira.
   - A tela do jogo abre no lugar da mesa (título "Desafio da Água").
   Tudo fica neste navegador, separado por conta.
   Uso (feito pelo Helpy.viver): const agua = DesafioAgua.ligar(helpy, { nome, chave });
   ========================================================= */

const DesafioAgua = {
  GOLES: 8,                     // goles numa garrafa (e a meta do dia)
  META: 8,
  PONTOS: { gole: 10, garrafa: 40, meta: 50 },
  /** Medalhas da semana. 5 dias × (8 goles + garrafa + meta) = 850: a última sai na sexta. */
  MEDALHAS: [
    { de: 0, id: 'nenhuma', nome: 'Sem medalha' },
    { de: 100, id: 'bronze', nome: 'Bronze' },
    { de: 250, id: 'prata', nome: 'Prata' },
    { de: 450, id: 'ouro', nome: 'Ouro' },
    { de: 650, id: 'platina', nome: 'Platina' },
    { de: 850, id: 'diamante', nome: 'Diamante' },
  ],

  ligar(helpy, { nome = '', chave = 'anon' } = {}) {
    const MIN = 60000;
    const CHAVE = `mutility-agua-${chave}`;
    const eu = this;
    const txt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hojeTxt = () => txt(new Date());
    /** A semana começa na segunda-feira. */
    const segundaTxt = (d = new Date()) => { const s = new Date(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return txt(s); };

    // ---------- estado ----------
    const novo = () => ({
      pontos: 0, semana: segundaTxt(), pontosSemana: 0, dia: hojeTxt(),
      goles: 0, bebidas: 0, encheu: false, metaHoje: false, metaAntes: null,
      garrafasDia: 0, garrafasTotal: 0, metasBatidas: 0, sequencia: 0, ultimaMeta: '',
      historico: {}, proximo: 0, pediuEncher: false, ultimoGole: 0,
    });
    const ler = () => {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { s = null; }
      s = { ...novo(), ...(s || {}) };
      if (typeof s.bebidas !== 'number') s.bebidas = 0;
      if (s.dia !== hojeTxt()) {
        // virou o dia: guarda o de ontem no histórico e zera a meta (a garrafa continua como estava)
        if (s.goles) s.historico[s.dia] = s.goles;
        const dias = Object.keys(s.historico).sort();
        while (dias.length > 30) delete s.historico[dias.shift()];
        Object.assign(s, { dia: hojeTxt(), goles: 0, garrafasDia: 0, metaHoje: false, metaAntes: null, proximo: 0, pediuEncher: false });
      }
      if (s.semana !== segundaTxt()) Object.assign(s, { semana: segundaTxt(), pontosSemana: 0 });   // segunda-feira: a semana zera
      return s;
    };
    let e = ler();
    const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* sem storage: o jogo vale só nesta página */ } pintarGarrafa(); pintarTela(); };

    /** Medalha atual da semana, a próxima e quanto falta. */
    const medalha = (p = e.pontosSemana) => {
      let i = 0;
      eu.MEDALHAS.forEach((m, k) => { if (p >= m.de) i = k; });
      const atual = eu.MEDALHAS[i];
      const prox = eu.MEDALHAS[i + 1] || null;
      const pct = prox ? Math.round(((p - atual.de) / (prox.de - atual.de)) * 100) : 100;
      return { ...atual, numero: i, prox, pct, falta: prox ? prox.de - p : 0 };
    };
    const ico = (nome) => (window.ic ? ic(nome) : '');

    // ---------- pontos ----------
    function ganhar(pontos, motivo) {
      const antes = medalha().numero;
      e.pontos = Math.max(0, e.pontos + pontos);
      e.pontosSemana = Math.max(0, e.pontosSemana + pontos);
      if (pontos > 0) window.Efeitos?.toast(`+${pontos} pontos · ${motivo}`, { icone: ico('gota'), tipo: 'sucesso', duracao: 2200 });
      const depois = medalha();
      if (depois.numero > antes) {
        setTimeout(() => helpy.dizer(`<p>Medalha nova! 🏅 Você chegou no <strong>${depois.nome}</strong> desta semana!</p><p>${depois.prox ? `Faltam <strong>${depois.falta}</strong> pontos pro ${depois.prox.nome} 💪` : `É a última, ${nome}! Você é ${depois.nome} 💎🎉`}</p>`, { humor: 'comemorando', tipo: 'sucesso' }), 500);
        setTimeout(() => window.Efeitos?.confete(document.querySelector('.ag-medalha-atual') || document.querySelector('.garrafa-agua') || document.body, 50), 600);
      }
    }

    /**
     * Muda quantas gotas da garrafa já foram bebidas (0 a 8). Vale para mais
     * de um gole de uma vez e também para desfazer (as gotas voltam).
     */
    function mudarBebidas(novas) {
      e = ler();
      novas = Math.max(0, Math.min(eu.GOLES, novas));
      const delta = novas - e.bebidas;
      if (!delta) return 0;
      e.encheu = true;
      const fechouAntes = e.bebidas === eu.GOLES;
      e.bebidas = novas;
      e.goles = Math.max(0, e.goles + delta);
      if (delta > 0) e.ultimoGole = Date.now();
      ganhar(eu.PONTOS.gole * delta, delta > 1 ? `${delta} goles de água` : 'um gole de água');
      // garrafa inteira (as 8 gotas)
      if (!fechouAntes && novas === eu.GOLES) { e.garrafasDia += 1; e.garrafasTotal += 1; ganhar(eu.PONTOS.garrafa, 'garrafa inteira'); }
      if (fechouAntes && novas < eu.GOLES) { e.garrafasDia = Math.max(0, e.garrafasDia - 1); e.garrafasTotal = Math.max(0, e.garrafasTotal - 1); ganhar(-eu.PONTOS.garrafa); }
      // meta do dia (8 goles)
      if (!e.metaHoje && e.goles >= eu.META) {
        e.metaAntes = { sequencia: e.sequencia, ultimaMeta: e.ultimaMeta };
        e.metaHoje = true;
        e.metasBatidas += 1;
        const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
        e.sequencia = e.ultimaMeta === txt(ontem) ? e.sequencia + 1 : 1;
        e.ultimaMeta = e.dia;
        ganhar(eu.PONTOS.meta, 'meta do dia');
      } else if (e.metaHoje && e.goles < eu.META) {
        e.metaHoje = false;
        e.metasBatidas = Math.max(0, e.metasBatidas - 1);
        if (e.metaAntes) Object.assign(e, e.metaAntes);
        ganhar(-eu.PONTOS.meta);
      }
      if (delta > 0) e.proximo = Date.now() + (45 + Math.random() * 25) * MIN;
      salvar();
      animarGarrafa();
      return delta;
    }

    /** Um gole (o BORA do Helpy): bebe a próxima gota. Garrafa vazia: enche antes. */
    function gole({ falar = true } = {}) {
      e = ler();
      if (e.bebidas >= eu.GOLES) encher({ falar: false });
      const metaAntes = e.metaHoje;
      mudarBebidas(e.bebidas + 1);
      if (falar) comentar(metaAntes);
    }

    /** O que o Helpy fala depois de beber. */
    function comentar(metaAntes) {
      e = ler();
      if (!metaAntes && e.metaHoje) {
        helpy.dizer(`<p>META DO DIA BATIDA! 🏆💧 <strong>${eu.META}</strong> goles!</p><p>${e.sequencia > 1 ? `São <strong>${e.sequencia} dias seguidos</strong> 🔥 ` : ''}Seu corpo agradece, ${nome}! 🥳</p>`, { humor: 'comemorando', tipo: 'sucesso' });
        setTimeout(() => window.Efeitos?.confete(document.querySelector('.helpy-avatar:not(.skin-mini .helpy-avatar)'), 60), 400);
      } else if (e.bebidas === eu.GOLES) {
        helpy.dizer(`<p>Glub glub! A garrafa acabou! 🥤 <strong>+${eu.PONTOS.garrafa}</strong> pontos</p><p>Enche de novo pra continuar o desafio? 💧</p>`, {
          humor: 'comemorando', tipo: 'sucesso',
          acoes: [{ rotulo: `${ico('gota')} Enchi a garrafa!`, destaque: true, fn: () => encher() }, { rotulo: 'Daqui a pouco', fn: () => helpy.dizer(Helpy.sortear(['Beleza! Enche quando der que eu te lembro 😉💧', 'Tranquilo, daqui a pouco eu volto com a garrafa 😄']), { humor: 'piscando', atraso: 200 }) }],
        });
      } else {
        helpy.dizer(Helpy.sortear([
          `Isso aí! 💧 Faltam ${Math.max(0, eu.META - e.goles)} goles pra meta de hoje!`,
          `Glub glub 🥤 Mandou bem! ${e.goles} de ${eu.META} na meta de hoje.`,
          `Hidratado é outro nível 😎 ${e.goles}/${eu.META}, bora que tá chegando!`,
        ]), { humor: 'comemorando' });
      }
    }

    /** Garrafa cheia de novo: as 8 gotas voltam. */
    function encher({ falar = true } = {}) {
      e = ler();
      const primeiraVez = !e.encheu && !e.garrafasDia && !e.goles;
      e.encheu = true;
      e.bebidas = 0;
      if (!e.proximo || e.proximo < Date.now()) e.proximo = Date.now() + (25 + Math.random() * 15) * MIN;
      salvar();
      animarGarrafa();
      if (falar) helpy.dizer(primeiraVez ? 'Garrafa cheia! 💧 Agora é comigo: vou te chamar pro desafio ao longo do dia 😉' : 'Cheinha de novo! 💧 Bora pra próxima rodada 💪', { humor: 'feliz', atraso: 200 });
    }

    // ---------- convite (Helpy com a garrafa na mão) ----------
    const comGarrafa = (sim) => helpy.raiz?.querySelector('.helpy-avatar:not(.skin-mini .helpy-avatar)')?.classList.toggle('com-garrafa', sim);

    function convidar() {
      e = ler();
      comGarrafa(true);
      helpy.dizer(`<p>${Helpy.sortear(['Desafio da Água! 💧', 'Hora do desafio! 🥤', 'Psiu, desafio da água! 💧'])}</p><p>Bora dar uns goles, ${nome}? <small>(${e.goles}/${eu.META} hoje)</small></p>`, {
        humor: 'piscando',
        acoes: [
          { rotulo: `${ico('gota')} BORA!`, destaque: true, fn: () => { comGarrafa(false); gole(); } },
          { rotulo: 'Agora não', fn: () => {
            comGarrafa(false);
            e = ler(); e.proximo = Date.now() + (15 + Math.random() * 10) * MIN; salvar();
            helpy.dizer(Helpy.sortear(['Tá bom 😔 Mas eu volto, hein!', 'Beleza, daqui a pouco eu te chamo de novo 😉', 'Ok... mas não esquece de mim 🥺💧']), { humor: 'triste', atraso: 200 });
          } },
        ],
        segurar: true,
      }).then(() => comGarrafa(false));
    }

    function pedirEncher() {
      e = ler();
      e.pediuEncher = true;
      salvar();
      comGarrafa(true);
      helpy.dizer(`<p>${Helpy.saudacao()}! Começou o <strong>Desafio da Água</strong> de hoje 💧</p><p>Enche sua garrafa que eu vou te chamando ao longo do dia. A meta é <strong>${eu.META} goles</strong>!</p>`, {
        humor: 'acenando',
        acoes: [
          { rotulo: `${ico('gota')} Enchi a garrafa!`, destaque: true, fn: () => { comGarrafa(false); encher(); } },
          { rotulo: 'Daqui a pouco', fn: () => {
            comGarrafa(false); e = ler(); e.proximo = Date.now() + 20 * MIN; salvar();
            helpy.dizer(Helpy.sortear(['Tá bom! Daqui uns 20 minutinhos eu te lembro de encher a garrafa 😉💧', 'Sem pressa! Mas não esquece da água, hein 🥺💧']), { humor: 'piscando', atraso: 200 });
          } },
        ],
        segurar: true,
      }).then(() => comGarrafa(false));
    }

    /** Chamado pelo Helpy a cada 20 s no turno. */
    function vigiar() {
      e = ler();
      if (tela) return;                                   // com o jogo aberto, ele não interrompe
      if (!e.pediuEncher) { pedirEncher(); return; }
      if (!e.proximo) { e.proximo = Date.now() + 20 * MIN; salvar(); return; }
      if (Date.now() < e.proximo) return;
      if (!e.encheu && e.goles === 0 && !e.garrafasDia) { pedirEncher(); return; }
      e.proximo = Date.now() + 20 * MIN;   // se ele não responder, volta em 20 min
      salvar();
      convidar();
    }

    // ---------- a garrafa (na mesinha e na tela do jogo) ----------
    const garrafaSvg = (cls = '') => `
      <svg class="garrafa-svg ${cls}" viewBox="0 0 40 70" aria-hidden="true">
        <defs><clipPath id="garrafaCorpo${cls}"><path d="M13 14h14v4c4 3 6 7 6 12v30a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V30c0-5 2-9 6-12z"/></clipPath></defs>
        <rect class="garrafa-tampa" x="13" y="3" width="14" height="9" rx="2.5"/>
        <path class="garrafa-vidro" d="M13 14h14v4c4 3 6 7 6 12v30a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V30c0-5 2-9 6-12z"/>
        <g clip-path="url(#garrafaCorpo${cls})"><rect class="garrafa-agua-nivel" x="0" y="0" width="40" height="70"/>
          <path class="garrafa-onda" d="M0 0q5-3 10 0t10 0t10 0t10 0v4H0z"/></g>
        <path class="garrafa-brilho" d="M11 32v22"/>
      </svg>`;
    /** Quanto tem na garrafa (0 a 1): cada gota bebida tira 1/8. */
    const nivelGarrafa = () => (eu.GOLES - e.bebidas) / eu.GOLES;   // as gotas que sobraram = o que tem na garrafa
    let botao = null;
    function montarGarrafa() {
      const mesa = document.querySelector('.escritorio');
      if (!mesa || mesa.querySelector('.garrafa-agua')) return;
      mesa.querySelector('.caneca')?.remove();
      mesa.insertAdjacentHTML('beforeend', `
        <button type="button" class="garrafa-agua" title="Desafio da Água" aria-label="Abrir o Desafio da Água">
          ${garrafaSvg('m')}
        </button>`);
      botao = mesa.querySelector('.garrafa-agua');
      botao.addEventListener('click', (ev) => { ev.stopPropagation(); abrirTela(); });
      pintarGarrafa();
    }
    function pintarGarrafa() {
      if (!botao) return;
      const n = nivelGarrafa();
      botao.style.setProperty('--nivel', n.toFixed(3));
      botao.classList.toggle('vazia', !n);
      botao.title = `Desafio da Água · ${Math.min(e.goles, eu.META)}/${eu.META} goles hoje · garrafa ${Math.round(n * 100)}%`;
    }
    function animarGarrafa() {
      botao?.classList.remove('glub'); void botao?.offsetWidth; botao?.classList.add('glub');
    }

    // ---------- a tela do jogo (no lugar da mesa) ----------
    let tela = null;
    let titulo = null;
    let tituloAntes = '';
    let vigiaTitulo = null;
    const TITULO = () => `${ico('gota')} Desafio da Água`;

    function abrirTela() {
      e = ler();
      if (tela) { tela.querySelector('[data-agua-voltar]')?.focus(); return; }
      const tampo = document.querySelector('.tampo');
      tela = document.createElement('section');
      tela.className = 'agua-tela';
      tela.setAttribute('aria-label', 'Desafio da Água');
      if (tampo) { tampo.classList.add('com-agua'); tampo.appendChild(tela); }
      else { tela.classList.add('agua-tela-solta'); document.body.appendChild(tela); }
      // o título "Minha Mesa" (ou o da página) vira "Desafio da Água" enquanto o jogo está aberto
      titulo = document.querySelector('.centro-topo h2, .area-topo h2');
      if (titulo) {
        tituloAntes = titulo.innerHTML;
        titulo.innerHTML = TITULO();
        // a página às vezes redesenha o título: mantém o do jogo
        vigiaTitulo = new MutationObserver(() => { if (tela && !titulo.innerHTML.includes('Desafio da Água')) { tituloAntes = titulo.innerHTML; titulo.innerHTML = TITULO(); } });
        vigiaTitulo.observe(titulo, { childList: true, characterData: true, subtree: true });
      }
      tela.addEventListener('click', aoClicar);
      document.addEventListener('keydown', aoTeclar);
      pintarTela(true);
      tela.querySelector('[data-agua-voltar]')?.focus({ preventScroll: true });
    }
    function fecharTela() {
      if (!tela) return;
      vigiaTitulo?.disconnect();
      if (titulo) titulo.innerHTML = tituloAntes;
      document.querySelector('.tampo')?.classList.remove('com-agua');
      document.removeEventListener('keydown', aoTeclar);
      tela.remove();
      tela = null;
    }
    const aoTeclar = (ev) => { if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) fecharTela(); };

    function aoClicar(ev) {
      const alvo = (s) => ev.target.closest(s);
      if (alvo('[data-agua-voltar]')) { fecharTela(); return; }
      if (alvo('[data-agua-encher]')) { encher(); return; }
      if (alvo('[data-agua-resetar]')) { resetar(); return; }
      const slot = alvo('[data-agua-slot]');
      if (slot) {
        e = ler();
        const i = Number(slot.dataset.aguaSlot);
        const metaAntes = e.metaHoje;
        // gota cheia: bebe até ela (pode ser mais de um gole) · gota já bebida: ela (e as depois dela) voltam
        const delta = mudarBebidas(i < e.bebidas ? i : i + 1);
        const alvoSlot = tela?.querySelector(`[data-agua-slot="${i}"]`);
        alvoSlot?.classList.add(delta > 0 ? 'bebeu' : 'voltou');
        if (delta > 0 && (e.bebidas === eu.GOLES || (!metaAntes && e.metaHoje))) comentar(metaAntes);
      }
    }

    /** A gota (ícone em SVG). */
    const gotaSvg = () => '<svg class="ag-gota-svg" viewBox="0 0 24 30" aria-hidden="true"><path class="ag-gota-forma" d="M12 2C12 2 3 13 3 19a9 9 0 0 0 18 0C21 13 12 2 12 2z"/><path class="ag-gota-brilho" d="M8 18a4 4 0 0 0 3 4"/></svg>';
    /** A medalha (ícone em SVG), na cor da medalha. */
    const medalhaSvg = (id) => `<svg class="ag-medalha-svg md-${id}" viewBox="0 0 40 48" aria-hidden="true">
      <path class="md-fita" d="M11 2h8l4 14h-8zM29 2h-8l-4 14h8z"/>
      <circle class="md-disco" cx="20" cy="30" r="15"/><circle class="md-aro" cx="20" cy="30" r="10.5"/>
      <path class="md-estrela" d="M20 23.5l1.9 4 4.3.5-3.2 3 .9 4.3-3.9-2.2-3.9 2.2.9-4.3-3.2-3 4.3-.5z"/></svg>`;

    function pintarTela() {
      if (!tela) return;
      e = ler();
      const m = medalha();
      const n = nivelGarrafa();
      const goles = Math.min(e.goles, eu.META);
      const acabou = e.bebidas >= eu.GOLES;
      // segunda a sexta desta semana
      const segunda = new Date(`${e.semana}T00:00:00`);
      const semana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((rotulo, k) => {
        const d = new Date(segunda); d.setDate(d.getDate() + k);
        const t = txt(d);
        const g = t === e.dia ? e.goles : (e.historico[t] || 0);
        return { rotulo, g, hoje: t === e.dia, futuro: t > e.dia };
      });
      tela.innerHTML = `
        <div class="ag-barra-topo">
          <button type="button" class="btn btn-voltar" data-agua-voltar>← Voltar</button>
          <span class="ag-pontos" title="Pontos desta semana">${ico('gota')} <b>${e.pontosSemana}</b> pontos na semana</span>
        </div>
        <div class="ag-grade">
          <section class="ag-bloco ag-garrafa" aria-label="Sua garrafa">
            <div class="ag-garrafa-palco" style="--nivel:${n.toFixed(3)}">${garrafaSvg('g')}</div>
            <b class="ag-garrafa-pct">${Math.round(n * 100)}%</b>
            <button type="button" class="btn key--agua btn-lg ag-encher ${acabou ? 'pede' : ''}" data-agua-encher ${acabou ? '' : 'disabled'}>${ico('atualizar')} Encher a garrafa</button>
          </section>

          <section class="ag-bloco ag-goles ${e.metaHoje ? 'completa' : ''}" aria-label="Os 8 goles da garrafa">
            <header class="ag-bloco-cab"><h3>${ico('gota')} Goles</h3><span class="ag-selo">${e.metaHoje ? `${ico('trofeu')} Meta do dia` : `${goles}/${eu.META} hoje`}</span></header>
            <div class="ag-slots">
              ${Array.from({ length: eu.GOLES }, (_, i) => {
                const bebida = i < e.bebidas;
                return `<button type="button" class="ag-slot ${bebida ? 'vazio' : 'cheio'}" data-agua-slot="${i}" style="--i:${i}"
                  aria-label="${bebida ? `Gole ${i + 1} já bebido: clique para desfazer` : `Beber até o gole ${i + 1}`}" aria-pressed="${bebida}">${gotaSvg()}<small>${i + 1}</small></button>`;
              }).join('')}
            </div>
            <div class="ag-meta"><span style="width:${Math.round((goles / eu.META) * 100)}%"></span></div>
            <div class="ag-numeros">
              <span>${ico('gota')} <b>${e.garrafasDia}</b> garrafa${e.garrafasDia === 1 ? '' : 's'} hoje</span>
              <span class="${e.sequencia > 1 ? 'fogo' : ''}">${ico('chama')} <b>${e.sequencia}</b> dia${e.sequencia === 1 ? '' : 's'} seguidos</span>
            </div>
          </section>

          <section class="ag-bloco ag-medalhas" aria-label="Medalhas da semana">
            <header class="ag-bloco-cab"><h3>${ico('medalha')} Medalhas da semana</h3><span class="ag-selo">${ico('relogio')} zera segunda</span></header>
            <ol class="ag-trilha">
              ${eu.MEDALHAS.slice(1).map((md, k) => `<li class="ag-md ${m.numero >= k + 1 ? 'ganhou' : ''} ${m.numero === k + 1 ? 'ag-medalha-atual' : ''}" title="${md.nome}: ${md.de} pontos">${medalhaSvg(md.id)}<b>${md.nome}</b><small>${md.de}</small></li>`).join('')}
            </ol>
            <div class="ag-prox">
              <div class="ag-prox-barra"><span style="width:${m.pct}%"></span></div>
              <p>${m.prox ? `Faltam <b>${m.falta}</b> pontos para o <b>${m.prox.nome}</b>` : `<b>${m.nome}</b>! Chegou na última medalha da semana`}</p>
            </div>
            <div class="ag-semana" aria-label="Goles de segunda a sexta">
              ${semana.map((d) => `<div class="ag-dia ${d.g >= eu.META ? 'bateu' : ''} ${d.hoje ? 'hoje' : ''} ${d.futuro ? 'futuro' : ''}"><span class="ag-dia-barra" style="--h:${Math.min(1, d.g / eu.META).toFixed(2)}"></span><small>${d.rotulo}</small></div>`).join('')}
            </div>
          </section>
        </div>
        <footer class="ag-rodape">
          <button type="button" class="btn btn-sm key--red" data-agua-resetar>${ico('x')} Resetar pontos</button>
        </footer>`;
    }

    /** Zera o jogo (pontos, medalhas, garrafas, metas e histórico), depois de confirmar. */
    function resetar() {
      const d = document.createElement('dialog');
      d.className = 'modal modal-pergunta';
      d.innerHTML = `
        <div class="modal-conteudo">
          <span class="pergunta-ico">${ico('gota')}</span>
          <h2>Resetar o Desafio da Água?</h2>
          <p>Os <b>${e.pontos} pontos</b>, as medalhas, as garrafas, as metas batidas e o histórico voltam a zero. Não dá para desfazer.</p>
          <div class="modal-acoes">
            <button type="button" class="btn" data-resposta="nao">Cancelar</button>
            <button type="button" class="btn key--red" data-resposta="sim">Resetar pontos</button>
          </div>
        </div>`;
      const fim = () => { d.close(); d.remove(); };
      d.addEventListener('cancel', (ev) => { ev.preventDefault(); fim(); });
      d.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-resposta]');
        if (!b) return;
        fim();
        if (b.dataset.resposta !== 'sim') return;
        e = { ...novo(), pediuEncher: true };
        salvar();
        window.Efeitos?.toast('Desafio da Água zerado. Bora começar de novo!', { icone: ico('gota') });
        helpy.dizer('Zerei tudo! 🧹💧 Bora começar a semana do zero? 😄', { humor: 'piscando', atraso: 200 });
      });
      document.body.appendChild(d);
      d.showModal();
    }

    montarGarrafa();
    return { vigiar, abrirPainel: abrirTela, abrirTela, fecharTela, gole, encher, mudarBebidas, estado: () => ler() };
  },
};

window.DesafioAgua = DesafioAgua;
