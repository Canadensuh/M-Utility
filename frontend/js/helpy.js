/* =========================================================
   helpy.js — o mascote Helpy e efeitos compartilhados
   - Helpy: avatar animado + balões de fala com ações pré-prontas
     (não é um chat livre: só opções pensadas antes).
   - Efeitos: toast, confete e contador animado.
   ========================================================= */

class Helpy {
  /** Toda fala começa com o nome: "Helpy BOT: …" (dentro do primeiro parágrafo, para ficar na mesma linha). */
  static comNome(html) {
    const nome = '<b class="helpy-nome">Helpy BOT:</b> ';
    const t = String(html).trimStart();
    return t.startsWith('<p>') ? `<p>${nome}${t.slice(3)}` : nome + t;
  }

  /**
   * Tickets um embaixo do outro: "#019 (há 1 dia)".
   * itens: [{ codigo, extra }]; mostra até `max` e avisa quantos ficaram de fora.
   */
  static listaTickets(itens, { max = 6 } = {}) {
    const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const linhas = itens.slice(0, max).map((i) => `<li><strong>${e(i.codigo)}</strong>${i.extra ? ` <span>(${e(i.extra)})</span>` : ''}</li>`);
    if (itens.length > max) linhas.push(`<li class="helpy-lista-mais">e mais ${itens.length - max}…</li>`);
    return `<ul class="helpy-lista">${linhas.join('')}</ul>`;
  }

  /** Expressões do rosto (classe no .helpy-avatar). */
  static HUMORES = ['feliz', 'pensando', 'comemorando', 'acenando', 'alerta', 'surpreso', 'piscando', 'desconfiado', 'faminto', 'triste', 'sonolento', 'dormindo', 'apaixonado'];

  /**
   * SKINS (estilos) do Helpy, escolhidas nas configurações da mesinha.
   * Cada uma liga um grupo de acessórios do SVG (classe skin-<id> no avatar).
   * reacao: o que ele fala ao trocar.
   */
  static SKINS = [
    { id: 'padrao', nome: 'Clássico', reacao: 'De volta ao clássico 😎 Nada como o bom e velho Helpy!' },
    { id: 'natal', nome: 'Natal', reacao: 'Ho ho ho! 🎅 Gorro no lugar, já tô no clima de Natal!' },
    { id: 'terno', nome: 'Terno', reacao: 'Chique, né? 🤵 De terno e gravatinha pra reunião importante 😎' },
    { id: 'verao', nome: 'Verão', reacao: 'Óculos escuros no visor e bora pra praia! 🏖️☀️' },
    { id: 'junino', nome: 'São João', reacao: 'Arraiá! 🌽🤠 Bora dançar quadrilha no setor?' },
    { id: 'copa', nome: 'Copa', reacao: 'É hexa! ⚽💚💛 Vestido pra torcer!' },
  ];
  static CHAVE_SKIN = 'mutility-helpy-skin';
  static skinAtual() {
    let id = 'padrao';
    try { id = localStorage.getItem(Helpy.CHAVE_SKIN) || 'padrao'; } catch { /* sem storage */ }
    return Helpy.SKINS.some((s) => s.id === id) ? id : 'padrao';
  }
  /** Troca a skin de todos os Helpys da página (e guarda a escolha). */
  static usarSkin(id) {
    try { localStorage.setItem(Helpy.CHAVE_SKIN, id); } catch { /* */ }
    // a salinha do Helpy também se enfeita (sala-natal, sala-verao…)
    document.querySelectorAll('.escritorio').forEach((sala) => {
      sala.classList.remove(...Helpy.SKINS.map((s) => `sala-${s.id}`));
      sala.classList.add(`sala-${id}`);
    });
    // as miniaturas do painel de configurações ficam cada uma com a sua
    [...document.querySelectorAll('.helpy-avatar')].filter((av) => !av.closest('.config-skin, .skin-mini')).forEach((av) => {
      av.classList.remove(...Helpy.SKINS.map((s) => `skin-${s.id}`));
      av.classList.add(`skin-${id}`);
    });
  }

  /** SVG do robô. Humores via classe no wrapper: veja Helpy.HUMORES. */
  static avatar(classe = '') {
    return `
      <div class="helpy-avatar ${classe} skin-${Helpy.skinAtual()}" aria-hidden="true">
        <svg viewBox="0 0 120 120" class="helpy-svg">
          <defs>
            <linearGradient id="helpyCabeca" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#EAD27F"/><stop offset="1" stop-color="#C9A94A"/>
            </linearGradient>
          </defs>
          <ellipse class="helpy-sombra" cx="60" cy="116" rx="26" ry="4"/>
          <g class="helpy-corpo">
            <line class="helpy-antena" x1="60" y1="24" x2="60" y2="12"/>
            <circle class="helpy-luz" cx="60" cy="9" r="5"/>
            <rect class="helpy-orelha" x="13" y="45" width="9" height="18" rx="4"/>
            <rect class="helpy-orelha" x="98" y="45" width="9" height="18" rx="4"/>
            <rect class="helpy-cabeca" x="20" y="22" width="80" height="62" rx="24" fill="url(#helpyCabeca)"/>
            <rect class="helpy-visor" x="31" y="35" width="58" height="35" rx="15"/>
            <g class="helpy-olhos">
              <ellipse class="helpy-olho" cx="48" cy="51" rx="5.5" ry="6.5"/>
              <ellipse class="helpy-olho" cx="72" cy="51" rx="5.5" ry="6.5"/>
            </g>
            <path class="helpy-boca" d="M51 61q9 6.5 18 0"/>
            <ellipse class="helpy-lingua" cx="60" cy="66" rx="3.6" ry="2.6"/>
            <path class="helpy-gota" d="M95 30q-4 6 0 8.5q4-2.5 0-8.5z"/>
            <circle class="helpy-bochecha" cx="38" cy="63" r="3"/>
            <circle class="helpy-bochecha" cx="82" cy="63" r="3"/>
            <path class="helpy-tronco" d="M40 88h40a10 10 0 0 1 10 10v10H30v-10a10 10 0 0 1 10-10z"/>
            <circle class="helpy-botao" cx="60" cy="99" r="3.5"/>
            <path class="helpy-braco helpy-braco-esq" d="M32 96q-12 2-14 12"/>
            <path class="helpy-braco helpy-braco-dir" d="M88 96q12-2 16-14"/>
            <!-- skins: acessórios (só aparece o da skin escolhida) -->
            <g class="sk sk-terno"><path class="sk-paleto" d="M40 88h40a10 10 0 0 1 10 10v10H30v-10a10 10 0 0 1 10-10z"/><path class="sk-camisa" d="M51 88h18l-9 15z"/><path class="sk-lapela" d="M51 88l7 13-9-4zM69 88l-7 13 9-4z"/><path class="sk-gravata" d="M54 89.5l6 3.2 6-3.2v6.4l-6-3.2-6 3.2z"/><circle class="sk-botao-terno" cx="60" cy="104" r="1.6"/></g>
            <g class="sk sk-copa"><path class="sk-camisa-copa" d="M40 88h40a10 10 0 0 1 10 10v10H30v-10a10 10 0 0 1 10-10z"/><path class="sk-gola" d="M50 88q10 9 20 0"/><text class="sk-numero" x="60" y="106" text-anchor="middle">10</text></g>
            <g class="sk sk-verao"><rect class="sk-lente" x="36.5" y="43" width="21" height="15" rx="6.5"/><rect class="sk-lente" x="62.5" y="43" width="21" height="15" rx="6.5"/><path class="sk-armacao" d="M57.5 49h5M36.5 47l-6-2M83.5 47l6-2"/><path class="sk-reflexo" d="M41 47l6 0M67 47l6 0"/></g>
            <g class="sk sk-natal"><path class="sk-gorro" d="M24 33q2-24 34-26q26-1 40 14q5 6 7 15l-9-4q-34-12-72 1z"/><rect class="sk-gorro-aba" x="19" y="26" width="82" height="11" rx="5.5"/><circle class="sk-pompom" cx="106" cy="38" r="6.5"/></g>
            <g class="sk sk-junino"><path class="sk-palha" d="M37 29q0-23 23-23t23 23z"/><rect class="sk-fita" x="37.5" y="21" width="45" height="5"/><ellipse class="sk-palha-aba" cx="60" cy="30" rx="47" ry="7.5"/><path class="sk-remendo" d="M45 11h7v7h-7z"/><path class="sk-palha-fio" d="M28 33l-6 6M92 33l6 6"/></g>
            <g class="helpy-garrafa-mao"><rect class="hg-vidro" x="98" y="61" width="12" height="21" rx="3.5"/><rect class="hg-agua" x="99.5" y="68" width="9" height="12.5" rx="2.5"/><rect class="hg-tampa" x="100.5" y="56" width="7" height="6" rx="1.6"/></g>
          </g>
          <g class="helpy-zzz"><text x="92" y="30">z</text><text x="100" y="20">z</text><text x="108" y="8">Z</text></g>
        </svg>
        <span class="helpy-afk">AFK</span>
      </div>`;
  }

  /**
   * @param {HTMLElement} raiz  elemento que contém .helpy-avatar
   * @param {HTMLElement} feed  onde os balões aparecem
   * @param {object} opcoes     { maxMensagens, balao }
   *   balao: mostra UMA fala por vez, como balão sobre a cabeça do Helpy.
   */
  constructor(raiz, feed, opcoes = {}) {
    this.raiz = raiz;
    this.feed = feed;
    this.maxMensagens = opcoes.maxMensagens || 30;
    this.balao = !!opcoes.balao;
    this.geracao = 0;          // muda em calar(): falas antigas da fila são descartadas
    this._soltar = null;
    this.fila = Promise.resolve();
    this._ligarCarinho();
    // clique simples no Helpy: cada página pode trocar (no Controle NC ele oferece o filtro por tipo)
    this.aoClicar = () => this.dizer(Helpy.sortear(['Oi! 😄 Tô aqui se precisar!', 'Hehe, me chamou? 👀', 'Psiu: segura o clique e passa o mouse em mim que eu ganho carinho 🥰']), { humor: 'acenando', atraso: 150 });
  }

  /** Descarta as falas que ainda estão na fila (ex.: o usuário mudou de tela). */
  calar() {
    this.geracao++;
    if (this._soltar) this._soltar();
  }

  humor(nome, duracao = 0) {
    const avatar = this.raiz.querySelector('.helpy-avatar:not(.skin-mini .helpy-avatar)');
    if (!avatar) return;
    avatar.classList.remove(...Helpy.HUMORES);
    if (nome) avatar.classList.add(nome);
    if (duracao) setTimeout(() => avatar.classList.remove(nome), duracao);
  }

  /**
   * Fala em fila (uma mensagem depois da outra), com indicador de digitação.
   * segurar: no modo balão, a fala fica na tela até o usuário escolher uma ação
   * (usado nas dicas), e só então a próxima fala aparece.
   * aoMostrar: chamado quando o balão aparece na tela (ex.: pôr o Helpy em foco).
   * layout: balão centralizado com botões do mesmo tamanho —
   *   'coluna' (um embaixo do outro), 'lado' (um do lado do outro) ou 'skins' (cardzinhos).
   */
  dizer(html, { acoes = [], tipo = '', humor = 'feliz', atraso = 550, segurar = false, aoMostrar = null, layout = '' } = {}) {
    const geracao = this.geracao;
    this.fila = this.fila.then(() => (geracao === this.geracao
      ? this._falar(html, acoes, tipo, humor, atraso, segurar, geracao, aoMostrar, layout)
      : null));
    return this.fila;
  }

  _falar(html, acoes, tipo, humor, atraso, segurar, geracao, aoMostrar, layout = '') {
    return new Promise((resolver) => {
      this.desativarAcoes();
      if (this.estado && this.estado !== 'acordado') { this.estado = 'acordado'; this.raiz.querySelector('.helpy-avatar:not(.skin-mini .helpy-avatar)')?.classList.remove('afk'); }
      if (this.balao) this.feed.replaceChildren();
      this.humor('pensando');
      const digitando = document.createElement('div');
      digitando.className = 'helpy-msg helpy-digitando';
      digitando.innerHTML = '<span></span><span></span><span></span>';
      this.feed.appendChild(digitando);
      this._rolar();

      setTimeout(() => {
        digitando.remove();
        if (geracao !== this.geracao) { resolver(null); return; }   // foi calado enquanto "digitava"
        const msg = document.createElement('div');
        msg.className = `helpy-msg ${tipo ? `helpy-msg-${tipo}` : ''} ${layout ? 'helpy-msg-centro' : ''}`;
        msg.innerHTML = Helpy.comNome(html);
        if (acoes.length) {
          const linha = document.createElement('div');
          linha.className = `helpy-acoes ${layout ? `helpy-acoes-${layout}` : ''}`;
          if (layout === 'lado') linha.style.setProperty('--colunas', acoes.length);
          acoes.forEach((acao) => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = `helpy-acao ${acao.destaque ? 'helpy-acao-destaque' : ''}`;
            botao.innerHTML = acao.rotulo;
            botao.addEventListener('click', () => {
              this.desativarAcoes();
              botao.classList.add('escolhida');
              if (this._soltar) this._soltar();
              acao.fn();
            });
            linha.appendChild(botao);
          });
          msg.appendChild(linha);
        }
        this.feed.appendChild(msg);
        while (this.feed.children.length > this.maxMensagens) this.feed.firstElementChild.remove();
        this._rolar();
        this.humor(humor);
        aoMostrar?.(msg);
        if (this.balao && segurar && acoes.length) {
          this._soltar = () => { this._soltar = null; resolver(msg); };
        } else {
          resolver(msg);
        }
      }, atraso);
    });
  }

  /* ---------- Jeito de amigo: horários, água e cochilo ----------
     Turno: 8:00 às 17:48, almoço às 12:00. O que já foi dito hoje fica
     guardado (o M-Utility troca de página e o Helpy não pode repetir). */

  /** Como o Helpy chama a pessoa: só o primeiro nome ("MURILO N.B" → "Murilo"); o Total Guest fica inteiro. */
  static apelido(nome) {
    const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
    if (/^total guest$/i.test(limpo)) return 'Total Guest';
    const primeiro = limpo.split(' ')[0] || '';
    return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR');
  }

  /** "Bom dia" / "Boa tarde" / "Boa noite" conforme a hora. */
  static saudacao(agora = new Date()) {
    const h = agora.getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  /** Um item qualquer da lista. */
  static sortear(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

  /** Memória do dia (o que o Helpy já falou hoje). */
  static _dia() {
    const hoje = new Date().toDateString();
    let d = null;
    try { d = JSON.parse(localStorage.getItem('mutility-helpy-dia') || 'null'); } catch { d = null; }
    if (!d || d.dia !== hoje) d = { dia: hoje, feitos: [] };
    return d;
  }
  static _jaFez(chave) { return Helpy._dia().feitos.includes(chave); }
  static _fez(chave) {
    const d = Helpy._dia();
    if (!d.feitos.includes(chave)) d.feitos.push(chave);
    try { localStorage.setItem('mutility-helpy-dia', JSON.stringify(d)); } catch { /* sem storage: pode repetir */ }
  }

  /**
   * Oi do começo: na primeira vez do dia é "Bom dia, Fulano! ☀️ …";
   * depois disso, um "E aí" curtinho (para não dar bom dia a cada página).
   */
  oi(nome) {
    const primeira = !Helpy._jaFez('oi');
    Helpy._fez('oi');
    const h = new Date().getHours();
    if (primeira) {
      if (h < 8) return `${Helpy.saudacao()}, <strong>${nome}</strong>! Chegou cedo, hein ☕ Bora começar com calma.`;
      if (h < 12) {
        return Helpy.sortear([
          `Bom dia, <strong>${nome}</strong>! ☀️ Dormiu bem? Bora pra mais um dia!`,
          `Bom diaaa, <strong>${nome}</strong>! ☀️ Já tomou seu café? ☕`,
          `Opa, bom dia, <strong>${nome}</strong>! 😄 Que bom te ver por aqui.`,
        ]);
      }
      return `${Helpy.saudacao()}, <strong>${nome}</strong>! 😄 Bora lá?`;
    }
    return Helpy.sortear([`E aí, <strong>${nome}</strong>! 😄`, `Opa, <strong>${nome}</strong>! 👋`, `Voltou, <strong>${nome}</strong>! 😁`]);
  }

  /**
   * Liga o "jeito de amigo": avisos de almoço e saída, hora extra, água e cochilo.
   * podeFalar(): a página diz se é uma boa hora (ex.: não no meio de um cadastro).
   */
  viver({ nome = '', id: usuarioId = 'anon', podeFalar = () => true } = {}) {
    if (this._vivo) return;
    this._vivo = true;
    this.estado = 'acordado';
    const MIN = 60000;
    const SONOLENTO = 4 * MIN;
    const DORME = 8 * MIN;
    let ultimaAcao = Date.now();
    const avatar = () => this.raiz.querySelector('.helpy-avatar:not(.skin-mini .helpy-avatar)');
    const temDialogo = () => !!document.querySelector('dialog[open]');
    const livre = () => !document.hidden && !temDialogo() && !this._soltar && this.estado === 'acordado' && podeFalar();

    // ---- Cochilo: parado muito tempo, ele fica com sono e depois dorme (AFK)
    const acordar = () => {
      ultimaAcao = Date.now();
      if (this.estado === 'acordado') return;
      const dormia = this.estado === 'dormindo';
      this.estado = 'acordado';
      avatar()?.classList.remove('afk');
      this.humor(dormia ? 'surpreso' : 'feliz');
      if (dormia && !temDialogo()) {
        this.dizer(Helpy.sortear([
          'Opa! 😳 Cochilei aqui... Voltei, voltei! Bora 💪',
          'Ahn?! 😳 Eu tava só descansando os olhos, juro 😅',
          `Eita, peguei no sono 😴 Já tô de pé, ${nome}!`,
        ]), { humor: 'surpreso', atraso: 300 });
      }
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, acordar, { passive: true, capture: true }));
    let ultimoMovimento = 0;
    document.addEventListener('pointermove', () => {
      const t = Date.now();
      if (t - ultimoMovimento > 1000) { ultimoMovimento = t; acordar(); }
    }, { passive: true });

    const vigiarSono = () => {
      if (document.hidden) return;
      const parado = Date.now() - ultimaAcao;
      if (this.estado === 'acordado' && parado > SONOLENTO && !this._soltar && !temDialogo()) {
        this.estado = 'sonolento';
        this.humor('sonolento');
      }
      if (this.estado === 'sonolento' && parado > DORME) {
        this.estado = 'dormindo';
        this.humor('dormindo');
        avatar()?.classList.add('afk');
      }
    };

    // ---- Horários do turno
    const H = (h, m = 0) => h * 60 + m;
    const agoraMin = () => { const d = new Date(); return H(d.getHours(), d.getMinutes()); };
    const ALMOCO = H(12);
    const SAIDA = H(17, 48);
    const diaUtil = () => [1, 2, 3, 4, 5].includes(new Date().getDay());
    const responder = (texto, humor = 'comemorando') => () => this.dizer(texto, { humor, atraso: 300 });

    const momentos = [
      { chave: 'almoco', de: ALMOCO - 15, ate: ALMOCO, falar: () => {
        const pratos = Helpy.sortear(['🍔🍟', '🍝🍕', '🍛🥗', '🍗🍚', '🌮🥪', '🍜🥟']);
        if (Math.random() < .5) {
          this.dizer(`<p>Psiu, ${nome}! Tá quase na hora do almoço ${pratos}</p><p>Minha barriga de robô já tá roncando 🤖</p>`, { humor: 'faminto' });
          return;
        }
        this.dizer(`<p>Ei, ${nome}! Já é quase meio-dia ${pratos}</p><p>O que você vai comer hoje?</p>`, {
          humor: 'faminto',
          acoes: [
            { rotulo: '🍱 Marmita', fn: responder('Marmitinha caseira é outro nível 😋 Bom apetite!') },
            { rotulo: '🍔 Lanche', fn: responder('Hmm, lanche! 🍔 Me traz uma batatinha? Brincadeira, eu sou um robô 😅') },
            { rotulo: '🥗 Algo leve', fn: responder('Saudável, hein! 🥗 Tô orgulhoso 😄') },
            { rotulo: '🤷 Não sei ainda', fn: responder('Clássico 😂 Na hora a fome decide! 🍽️') },
          ],
        });
      } },
      { chave: 'almoco-ainda', de: ALMOCO + 10, ate: ALMOCO + 50, falar: () =>
        this.dizer(`Ué, ${nome}, não foi almoçar? 👀 Vai lá comer alguma coisa, eu seguro as pontas aqui! 🍽️`, { humor: 'desconfiado' }) },
      { chave: 'volta-almoco', de: ALMOCO + 60, ate: ALMOCO + 120, falar: () =>
        this.dizer(Helpy.sortear([`E aí, ${nome}, o almoço tava bom? 😋`, 'Voltou! 😄 Bateu aquela preguicinha pós-almoço? 😴☕']), { humor: 'feliz' }) },
      { chave: 'saida', de: SAIDA - 18, ate: SAIDA, falar: () =>
        this.dizer(Helpy.sortear([
          `<p>Falta pouquinho pra ir embora, ${nome}! 🏃💨</p><p>Às 17:48 tá liberado. Já deixa tudo organizado 😉</p>`,
          `<p>Olha a hora! ⏰ Quase 17:48, ${nome}.</p><p>Bora fechar os últimos tickets e partir pra casa 🏠</p>`,
        ]), { humor: 'comemorando' }) },
      { chave: 'extra-1', de: SAIDA + 20, ate: SAIDA + 70, falar: () =>
        this.dizer(`<p>Ué... 🤨 Já passou das 17:48 faz um tempinho.</p><p>Tá fazendo hora extra, ${nome}?</p>`, {
          humor: 'desconfiado',
          acoes: [
            { rotulo: '😩 Tô sim', fn: responder('Eita 😬 Então bora acabar logo isso, que casa é lugar de descanso! 💪', 'triste') },
            { rotulo: '🏃 Já tô indo!', fn: responder('Aí sim! 😄 Bom descanso, até amanhã! 👋', 'acenando') },
          ],
        }) },
      { chave: 'extra-2', de: SAIDA + 72, ate: H(23, 59), falar: () =>
        this.dizer(`Ainda aqui, ${nome}?! 😳 Isso tá estranho... Vai descansar, amigo! 🛌`, { humor: 'surpreso' }) },
    ];

    // Desafio da Água (js/agua.js): a garrafa na mesinha e os convites ao longo do dia
    const agua = window.DesafioAgua ? DesafioAgua.ligar(this, { nome, chave: usuarioId }) : null;
    this.agua = agua;

    const vigiarHora = () => {
      if (!diaUtil() || !livre()) return;
      const m = agoraMin();
      const momento = momentos.find((x) => m >= x.de && m < x.ate && !Helpy._jaFez(x.chave));
      if (momento) { Helpy._fez(momento.chave); momento.falar(); return; }
      // Água: no turno (fora do almoço) o Helpy chama para o desafio
      const noTurno = m >= H(8) && m < SAIDA && !(m >= ALMOCO && m < ALMOCO + 60);
      if (noTurno) agua?.vigiar();
    };

    setInterval(() => { vigiarSono(); vigiarHora(); }, 20000);
    setTimeout(vigiarHora, 8000);
    this._acordar = acordar;
  }


  /**
   * Carinho: segurando o botão esquerdo e passando o mouse em cima do Helpy,
   * ele fecha os olhinhos, cora, solta coraçõezinhos e agradece.
   */
  _ligarCarinho() {
    const avatar = () => this.raiz?.querySelector('.helpy-avatar:not(.skin-mini .helpy-avatar)');
    let segurando = false;
    let ativo = false;
    let andou = 0;
    let ultimo = null;
    let desdeCoracao = 0;
    let comecou = 0;
    let falouEm = 0;
    let timerFim = null;
    let timerClique = null;

    // Os corações nascem ATRÁS do Helpy (na camada de baixo) e sobem por cima da cabeça,
    // sem tampar o rostinho dele
    const coracao = () => {
      const av = avatar();
      const pai = av?.parentElement;
      if (!av || !pai) return;
      const ra = av.getBoundingClientRect();
      const rp = pai.getBoundingClientRect();
      const c = document.createElement('span');
      c.className = 'helpy-coracao';
      c.textContent = Helpy.sortear(['💗', '💖', '💕', '❤️']);
      const lado = Math.random() < .5 ? -1 : 1;
      c.style.left = `${ra.left - rp.left + ra.width / 2 + lado * (ra.width * (.18 + Math.random() * .22))}px`;
      c.style.top = `${ra.top - rp.top + ra.height * .32}px`;
      c.style.setProperty('--desvio', `${Math.round(lado * (10 + Math.random() * 22))}px`);
      pai.insertBefore(c, av);   // antes do avatar = atrás dele
      setTimeout(() => c.remove(), 1400);
    };

    const iniciar = () => {
      if (ativo) return;
      ativo = true;
      comecou = Date.now();
      clearTimeout(timerFim);
      if (this.estado && this.estado !== 'acordado') this._acordar?.();
      const av = avatar();
      av?.classList.add('carinho');
      this.humor('apaixonado');
    };

    const parar = (ev) => {
      if (!segurando && !ativo) return;
      segurando = false;
      if (!ativo) {
        // não virou carinho: foi um clique simples no Helpy (a página decide o que ele faz)
        // dois cliques seguidos = this.aoDuploClique (o clique simples espera um tiquinho para saber)
        if (andou < 30 && ev?.type === 'pointerup' && ev.target?.closest?.('.helpy-avatar')) {
          if (!this.aoDuploClique) { this.aoClicar?.(); return; }
          if (timerClique) { clearTimeout(timerClique); timerClique = null; this.aoDuploClique(); return; }
          timerClique = setTimeout(() => { timerClique = null; this.aoClicar?.(); }, 280);
        }
        return;
      }
      ativo = false;
      const durou = Date.now() - comecou;
      timerFim = setTimeout(() => {
        avatar()?.classList.remove('carinho');
        this.humor('feliz');
      }, 900);
      // agradece (no máximo a cada 20 s, e sem atropelar uma dica que espera resposta)
      if (durou > 600 && Date.now() - falouEm > 20000 && !this._soltar) {
        falouEm = Date.now();
        this.dizer(Helpy.sortear([
          'Hehe 🥰 que carinho bom! Obrigado!',
          'Awn 😊 adoro quando você faz isso!',
          'Hihi, faz cócegas 🤭💕',
          'Ai que delícia 🥰 tava precisando!',
          'Eba, carinho! 💖 Agora eu trabalho até mais feliz 🤖',
        ]), { humor: 'apaixonado', atraso: 250 });
      }
    };

    this.raiz?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.target.closest('.helpy-avatar')) return;
      e.preventDefault();   // não seleciona texto enquanto arrasta
      segurando = true;
      andou = 0;
      desdeCoracao = 0;
      ultimo = { x: e.clientX, y: e.clientY };
    });
    document.addEventListener('pointermove', (e) => {
      if (!segurando) return;
      if (!(e.buttons & 1)) { parar(); return; }
      const sobre = e.target.closest?.('.helpy-avatar');
      const passo = Math.hypot(e.clientX - ultimo.x, e.clientY - ultimo.y);
      ultimo = { x: e.clientX, y: e.clientY };
      if (!sobre) return;
      andou += passo;
      desdeCoracao += passo;
      if (andou > 30) iniciar();
      if (ativo && desdeCoracao > 45) { desdeCoracao = 0; coracao(); }
    });
    document.addEventListener('pointerup', parar);
    document.addEventListener('pointercancel', parar);
  }
  desativarAcoes() {
    this.feed.querySelectorAll('.helpy-acao:not(:disabled)').forEach((b) => { b.disabled = true; });
  }

  limpar() {
    this.feed.innerHTML = '';
  }

  _rolar() {
    this.feed.scrollTo({ top: this.feed.scrollHeight, behavior: 'smooth' });
  }
}

const Efeitos = {
  _toasts: null,

  toast(html, { tipo = '', icone = '<i class="ic ic-sino" aria-hidden="true"></i>', duracao = 4200 } = {}) {
    if (!this._toasts) {
      this._toasts = document.createElement('div');
      this._toasts.className = 'toasts';
      this._toasts.setAttribute('aria-live', 'polite');
      document.body.appendChild(this._toasts);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${tipo ? `toast-${tipo}` : ''}`;
    toast.innerHTML = `<span class="toast-icone">${icone}</span><div>${html}</div>`;
    this._toasts.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('saindo');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duracao);
  },

  /** Confete saindo de um elemento (ou do centro da tela). */
  confete(origem, quantidade = 70) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const caixa = origem?.getBoundingClientRect?.();
    const x = caixa ? caixa.left + caixa.width / 2 : innerWidth / 2;
    const y = caixa ? caixa.top + caixa.height / 2 : innerHeight / 2;
    const cores = ['#8FA858', '#E3C567', '#C98B3A', '#A6F08A', '#4C6B3C', '#F7F2E2'];
    for (let i = 0; i < quantidade; i++) {
      const peca = document.createElement('span');
      peca.className = 'confete';
      const angulo = Math.random() * Math.PI * 2;
      const forca = 120 + Math.random() * 260;
      peca.style.cssText = `
        left:${x}px; top:${y}px;
        background:${cores[i % cores.length]};
        --dx:${Math.cos(angulo) * forca}px;
        --dy:${Math.sin(angulo) * forca - 160}px;
        --giro:${(Math.random() - .5) * 1080}deg;
        width:${6 + Math.random() * 6}px; height:${8 + Math.random() * 8}px;
        animation-duration:${900 + Math.random() * 700}ms;`;
      document.body.appendChild(peca);
      peca.addEventListener('animationend', () => peca.remove(), { once: true });
    }
  },

  /** Anima um número de onde está até o valor final. */
  contarAte(el, valor, duracao = 900) {
    const inicio = Number(el.dataset.valor || 0);
    el.dataset.valor = valor;
    if (inicio === valor || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = valor;
      return;
    }
    // cada contagem nova cancela a anterior do mesmo número (senão as duas brigam)
    const vez = (el._contagem = (el._contagem || 0) + 1);
    let t0 = null;
    const passo = (agora) => {
      if (el._contagem !== vez) return;
      t0 ??= agora;   // começa no primeiro quadro: o tempo nunca fica negativo
      const p = Math.max(0, Math.min(1, (agora - t0) / duracao));
      const suave = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(inicio + (valor - inicio) * suave);
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  },

  /** "há 5 min", "há 2 h", "ontem"… */
  tempoDesde(iso) {
    const minutos = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `há ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `há ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? 'ontem' : `há ${dias} dias`;
  },

  dataCurta(iso) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  },

  /** Clona um elemento e o "voa" até o destino (ticket indo para a mesa, arquivo…). */
  voar(elemento, destino, { duracao = 800, escalaFinal = .2 } = {}) {
    return new Promise((resolver) => {
      if (!elemento || !destino || matchMedia('(prefers-reduced-motion: reduce)').matches) { resolver(); return; }
      const de = elemento.getBoundingClientRect();
      const para = destino.getBoundingClientRect();
      const clone = elemento.cloneNode(true);
      clone.classList.add('voando');
      clone.style.cssText = `position:fixed; left:${de.left}px; top:${de.top}px; width:${de.width}px; height:${de.height}px; margin:0; z-index:950; pointer-events:none;`;
      document.body.appendChild(clone);
      const dx = para.left + para.width / 2 - (de.left + de.width / 2);
      const dy = para.top + para.height / 2 - (de.top + de.height / 2);
      const animacao = clone.animate([
        { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * .5}px, ${dy * .5 - 80}px) scale(${(1 + escalaFinal) / 2}) rotate(-8deg)`, opacity: 1, offset: .55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${escalaFinal}) rotate(6deg)`, opacity: .1 },
      ], { duration: duracao, easing: 'cubic-bezier(.5,0,.3,1)' });
      // garantia: se o navegador não avisar o fim da animação, termina mesmo assim
      let pronto = false;
      const fim = () => { if (pronto) return; pronto = true; clone.remove(); resolver(); };
      animacao.onfinish = fim;
      setTimeout(fim, duracao + 400);
    });
  },
};

window.Helpy = Helpy;
window.Efeitos = Efeitos;
