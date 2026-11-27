/* =========================================================
   escritorio.js — o escritoriozinho do Helpy (comum às mesas)
   - Helpy em foco: ao dar uma dica, a tela escurece e desfoca,
     com um círculo nítido em volta do balão e do Helpy (3 s).
   - Botões na mesinha: configurações, filtro (se a página passar filtrar) e cabide (skins);
     as opções aparecem no balão do Helpy. Dois cliques no Helpy: ICS com PIN.
   Precisa no HTML: #focoVeu, #helpyFeed, .escritorio,
   #botaoConfig, #painelConfig e #configFoco.
   Uso: const escritorio = Escritorio.montar({ filtrar });   // filtrar é opcional
        escritorio.focar(3000);
   ========================================================= */

const Escritorio = {
  montar({ filtrar = null } = {}) {
  const CHAVE_FOCO = 'mutility-foco-dica';
  const elVeu = document.getElementById('focoVeu');
  const elConfigFoco = document.getElementById('configFoco');
  let timerFoco = null;

  const focoLigado = () => lerPreferencia(CHAVE_FOCO, 'sim') !== 'nao';
  elConfigFoco.checked = focoLigado();
  elConfigFoco.addEventListener('change', () => salvarPreferencia(CHAVE_FOCO, elConfigFoco.checked ? 'sim' : 'nao'));

  /**
   * Escurece e desfoca a tela, deixando um CÍRCULO nítido em volta do balão
   * e do Helpy. O círculo "fecha" ao entrar e "abre" ao sair (íris).
   */
  let quadroFoco = null;

  /** Centro e raio do círculo: envolve o balão da fala e o escritório do Helpy. */
  function posicionarCirculo() {
    const caixas = [document.getElementById('helpyFeed').lastElementChild, document.querySelector('.escritorio')]
      .filter(Boolean).map((el) => el.getBoundingClientRect());
    if (!caixas.length) return;
    const esq = Math.min(...caixas.map((r) => r.left));
    const dir = Math.max(...caixas.map((r) => r.right));
    const topo = Math.min(...caixas.map((r) => r.top));
    const base = Math.max(...caixas.map((r) => r.bottom));
    elVeu.style.setProperty('--fx', `${(esq + dir) / 2}px`);
    elVeu.style.setProperty('--fy', `${(topo + base) / 2}px`);
    elVeu.style.setProperty('--alvo-r', `${Math.hypot(dir - esq, base - topo) / 2 + 6}px`);
  }

  function focarNoHelpy(duracao = 3000) {
    if (!focoLigado()) return;
    clearTimeout(timerFoco);
    cancelAnimationFrame(quadroFoco);
    // O balão ainda está entrando e a lateral pode se acomodar: o círculo acompanha a cada quadro
    const acompanhar = () => { posicionarCirculo(); quadroFoco = requestAnimationFrame(acompanhar); };
    acompanhar();
    document.body.classList.add('foco-helpy');
    elVeu.classList.add('ativo');
    timerFoco = setTimeout(soltarFoco, duracao);
  }
  function soltarFoco() {
    clearTimeout(timerFoco);
    document.body.classList.remove('foco-helpy');
    elVeu.classList.remove('ativo');
    // segue o Helpy até a íris abrir (sem parar um foco novo que já tenha começado)
    setTimeout(() => { if (!elVeu.classList.contains('ativo')) cancelAnimationFrame(quadroFoco); }, 900);
  }
  // Qualquer clique encerra o foco antes dos 3 s (o véu não bloqueia cliques)
  document.addEventListener('pointerdown', () => { if (elVeu.classList.contains('ativo')) soltarFoco(); });

  // ---------- Botões da mesinha: Configurações · Filtro · Cabide ----------
  // As opções aparecem no balão do Helpy (o painel antigo fica escondido, só guarda o "foco" e a impressora).
  const mesa = document.querySelector('.escritorio');
  const temHelpy = () => typeof helpy !== 'undefined';
  const falar = (html, opcoes) => { try { if (temHelpy()) return helpy.dizer(html, opcoes); } catch { /* página sem Helpy */ } return null; };
  const calar = () => { try { if (temHelpy()) helpy.calar(); } catch { /* página sem Helpy */ } };
  const icone = (nome) => (window.ic ? ic(nome) : '');
  const elBotaoConfig = document.getElementById('botaoConfig');
  const elPainelConfig = document.getElementById('painelConfig');
  if (elPainelConfig) elPainelConfig.hidden = true;
  if (elBotaoConfig) { elBotaoConfig.removeAttribute('aria-expanded'); elBotaoConfig.removeAttribute('aria-controls'); elBotaoConfig.classList.add('btn-mesinha'); }

  const SVG_FILTRO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/></svg>';
  const SVG_CABIDE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 11 2.8 17.2A1 1 0 0 0 3.4 19h17.2a1 1 0 0 0 .6-1.8z"/></svg>';
  if (elBotaoConfig && mesa && !mesa.querySelector('#botaoCabide')) {
    // o filtro só aparece onde a página tem o que filtrar (a Minha Mesa do Controle NC)
    const botoes = [
      ...(filtrar ? [`<button type="button" class="btn-config btn-mesinha btn-filtro" id="botaoFiltro" aria-label="Filtrar por tipo de NC" title="Filtrar por tipo de NC">${SVG_FILTRO}</button>`] : []),
      `<button type="button" class="btn-config btn-mesinha btn-cabide" id="botaoCabide" aria-label="Roupas do Helpy (skins)" title="Roupas do Helpy">${SVG_CABIDE}</button>`,
    ];
    elBotaoConfig.insertAdjacentHTML('afterend', botoes.join(''));
    mesa.querySelectorAll('.btn-mesinha').forEach((b, i) => { b.style.left = `${12 + i * 38}px`; });
  }

  /** Engrenagem: o Helpy oferece as configurações no balão. */
  function oferecerConfig() {
    calar();
    const foco = focoLigado();
    const temImpressora = !!document.getElementById('abrirImpressora');
    falar(`<p>Configurações ⚙️ O que você quer ajustar?</p>
      <p class="helpy-config-estado">${icone('olho')} Foco nas dicas: <strong>${foco ? 'ligado' : 'desligado'}</strong></p>`, {
      humor: 'piscando', atraso: 150, layout: 'coluna',
      acoes: [
        { rotulo: `${icone('olho')} ${foco ? 'Desligar' : 'Ligar'} o foco`, fn: () => {
          elConfigFoco.checked = !foco;
          salvarPreferencia(CHAVE_FOCO, foco ? 'nao' : 'sim');
          falar(foco ? 'Pronto, desliguei o foco 👍 Continuo dando as dicas, só sem desfocar a tela.' : 'Foco ligado! 🔦 Quando eu der uma dica, a tela desfoca rapidinho pra você me ver.', { humor: 'feliz', atraso: 200 });
        } },
        ...(temImpressora ? [{ rotulo: `${icone('impressora')} Impressora Zebra`, fn: () => {
          document.getElementById('abrirImpressora').click();
          falar('Abri as configurações da Zebra 🖨️ Ajusta aí e testa uma etiqueta!', { humor: 'feliz', atraso: 200 });
        } }] : []),
        { rotulo: `${icone('check')} Tá tudo certo`, fn: () => falar('Beleza! Qualquer coisa é só clicar na engrenagem 😉', { humor: 'feliz', atraso: 200 }) },
      ],
    });
  }

  /** Cabide: as roupas (skins) do Helpy, com a miniatura de cada uma. */
  function oferecerSkins() {
    if (!window.Helpy?.SKINS) return;
    calar();
    const atual = Helpy.skinAtual();
    const mini = (id) => `<span class="skin-mini">${Helpy.avatar().replace(/ skin-[a-z]+" aria-hidden/, ` skin-${id}" aria-hidden`)}</span>`;
    falar('<p>Bora trocar de roupa? 👕 Escolhe meu estilo:</p>', {
      humor: 'piscando', atraso: 150, layout: 'skins',
      acoes: Helpy.SKINS.map((s) => ({
        rotulo: `${mini(s.id)}<span class="skin-nome">${s.nome}${s.id === atual ? ' ✓' : ''}</span>`,
        destaque: s.id === atual,
        fn: () => trocarSkin(s.id),
      })),
    });
  }
  function trocarSkin(id) {
    const skin = Helpy.SKINS.find((s) => s.id === id);
    if (!skin) return;
    if (id === Helpy.skinAtual()) { falar(`Já tô de ${skin.nome} 😄 Gostou, né?`, { humor: 'piscando', atraso: 200 }); return; }
    const av = mesa?.querySelector('#helpyAvatar .helpy-avatar') || mesa?.querySelector('.helpy-avatar');
    // ele gira, troca de roupa no meio do giro e reage
    av?.classList.remove('trocando'); void av?.offsetWidth; av?.classList.add('trocando');
    setTimeout(() => Helpy.usarSkin(skin.id), 230);
    setTimeout(() => av?.classList.remove('trocando'), 750);
    if (skin.id !== 'padrao') setTimeout(() => window.Efeitos?.confete(av || mesa, 30), 400);
    falar(skin.reacao, { humor: skin.id === 'terno' ? 'piscando' : 'comemorando', atraso: 250 });
  }

  elBotaoConfig?.addEventListener('click', (e) => { e.stopPropagation(); oferecerConfig(); });
  mesa?.querySelector('#botaoFiltro')?.addEventListener('click', (e) => { e.stopPropagation(); filtrar(); });
  mesa?.querySelector('#botaoCabide')?.addEventListener('click', (e) => { e.stopPropagation(); oferecerSkins(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') soltarFoco(); });

  // ---------- Opção secreta: dois cliques no Helpy = usuário e senha do ICS (com PIN) ----------
  let errosPin = 0;
  let bloqueadoAte = 0;
  const copiarTexto = async (texto) => {
    try { await navigator.clipboard.writeText(texto); return true; } catch { /* sem permissão: tenta o jeito antigo */ }
    const t = document.createElement('textarea');
    t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    return ok;
  };
  const censurado = (texto) => '•'.repeat(Math.min(12, Math.max(6, String(texto).length)));

  function perguntarIcs() {
    if (!temHelpy() || !window.API?.verIcs) return;
    calar();
    if (Date.now() < bloqueadoAte) {
      falar(`Opa, foram 3 PINs errados 🙅 Espera ${Math.ceil((bloqueadoAte - Date.now()) / 1000)} segundinhos e tenta de novo.`, { humor: 'desconfiado', atraso: 150 });
      return;
    }
    let msg = null;
    falar(`<p>Psiu... 🤫 Quer ver sua senha do <strong>ICS</strong>?</p><p>Coloca o PIN aqui embaixo:</p>
      <label class="helpy-pin"><input type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="PIN" aria-label="PIN" /></label>`, {
      humor: 'desconfiado', atraso: 150, layout: 'lado',
      aoMostrar: (m) => {
        msg = m;
        const campo = m.querySelector('.helpy-pin input');
        if (!campo) return;
        campo.addEventListener('input', () => { campo.value = campo.value.replace(/\D/g, '').slice(0, 4); });
        campo.addEventListener('keydown', (e) => {
          e.stopPropagation();   // as teclas do PIN não vão para o leitor/atalhos da página
          if (e.key === 'Enter') { e.preventDefault(); m.querySelector('.helpy-acao-destaque:not(:disabled)')?.click(); }
        });
        setTimeout(() => campo.focus(), 50);
      },
      acoes: [
        { rotulo: 'Agora não', fn: () => {
          const campo = msg?.querySelector('.helpy-pin input');
          if (campo) { campo.value = ''; campo.disabled = true; }
          falar('Tranquilo! Fica guardadinha aqui comigo 🔒', { humor: 'feliz', atraso: 200 });
        } },
        { rotulo: `${icone('cadeado-aberto')} Ver senha`, destaque: true, fn: () => {
          const campo = msg?.querySelector('.helpy-pin input');
          if (campo) campo.disabled = true;
          conferirPin(campo?.value || '');
        } },
      ],
    });
  }

  async function conferirPin(pin) {
    const { ok, dados } = await API.verIcs(pin);
    if (!ok) {
      errosPin += 1;
      if (errosPin >= 3) {
        errosPin = 0;
        bloqueadoAte = Date.now() + 60000;
        falar('Hmm... 3 PINs errados 🤨 Por segurança vou esperar 1 minutinho antes de deixar tentar de novo.', { humor: 'desconfiado', atraso: 200 });
        return;
      }
      falar('Ih, esse PIN não tá certo 🙅', { humor: 'surpreso', atraso: 200, layout: 'lado', acoes: [
        { rotulo: 'Deixa pra lá', fn: () => falar('Beleza! Quando precisar, é só me clicar 2 vezes 😉', { humor: 'feliz', atraso: 200 }) },
        { rotulo: `${icone('atualizar')} Tentar de novo`, destaque: true, fn: perguntarIcs },
      ] });
      return;
    }
    errosPin = 0;
    if (!dados.usuario && !dados.senha) {
      falar('PIN certinho ✅ Mas você ainda não tem usuário do ICS cadastrado 🤔 O administrador coloca em <strong>Crachás</strong>: engrenagem › <strong>Editar usuário e senha do ICS</strong>.', { humor: 'pensando', atraso: 200 });
      return;
    }
    const linha = (rotulo, chave, valor) => `<div class="helpy-ics-linha"><span class="helpy-ics-rot">${rotulo}</span><code class="helpy-ics-valor">${censurado(valor)}</code><button type="button" class="btn btn-sm helpy-ics-copiar" data-copiar-ics="${chave}">${icone('copiar')} Copiar</button></div>`;
    falar(`<p>Prontinho 🔓 Seus dados do ICS:</p><div class="helpy-ics">${linha('Usuário', 'usuario', dados.usuario)}${linha('Senha', 'senha', dados.senha)}</div><p class="helpy-ics-dica" hidden></p>`, {
      humor: 'piscando', atraso: 200, layout: 'coluna',
      aoMostrar: (m) => {
        m.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-copiar-ics]');
          if (!b) return;
          const certo = await copiarTexto(dados[b.dataset.copiarIcs] || '');
          if (!certo) { window.Efeitos?.toast('Não consegui copiar 😕', { tipo: 'alerta' }); return; }
          b.innerHTML = `${icone('check')} Copiado`;
          b.classList.add('copiado');
          setTimeout(() => { if (b.isConnected) { b.innerHTML = `${icone('copiar')} Copiar`; b.classList.remove('copiado'); } }, 1600);
        });
        // depois de 1 minuto os botões somem (os dados não ficam dando bobeira na tela)
        setTimeout(() => {
          if (!m.isConnected) return;
          m.querySelectorAll('[data-copiar-ics]').forEach((b) => b.remove());
          const dica = m.querySelector('.helpy-ics-dica');
          if (dica) { dica.innerHTML = '<small>Escondi de novo 🔒 Me clica 2 vezes se precisar.</small>'; dica.hidden = false; }
        }, 60000);
      },
    });
  }
  if (temHelpy()) { try { helpy.aoDuploClique = perguntarIcs; } catch { /* página sem Helpy */ } }

  // ---------- Palavra do dia (no lugar do lembrete da parede) ----------
  const quadro = mesa?.querySelector('.quadro-aviso');
  if (quadro) {
    const inicio = new Date(new Date().getFullYear(), 0, 0);
    const diaDoAno = Math.floor((Date.now() - inicio) / 86400000);
    const [palavra, frase] = Escritorio.PALAVRAS[diaDoAno % Escritorio.PALAVRAS.length];
    quadro.classList.add('palavra-dia');
    quadro.innerHTML = `<small>Palavra do dia</small><strong>${palavra}</strong><span>${frase}</span>`;
    quadro.title = `Palavra do dia: ${palavra}. ${frase}`;
  }

  // ---------- Enfeites da sala (mudam junto com a skin do Helpy) ----------
  if (mesa && !mesa.querySelector('.sala-enfeites')) {
    mesa.insertAdjacentHTML('afterbegin', Escritorio.enfeitesSvg());
    mesa.classList.add(`sala-${window.Helpy?.skinAtual ? Helpy.skinAtual() : 'padrao'}`);
  }

  // ---------- Lixeira no chão, na frente da mesinha ----------
  if (mesa && !mesa.querySelector('.lixeira-helpy')) {
    mesa.insertAdjacentHTML('beforeend', '<div class="lixeira-helpy" aria-hidden="true"><span class="lix-tampa"></span><span class="lix-corpo"></span></div>');
  }
  /**
   * Ticket excluído: ele voa até o Helpy, que joga no lixo (a tampa abre e fecha).
   * elementos: os tickets na tela (até 3 voam; o resto só conta). rotulo: "#012" ou "3 tickets".
   */
  async function jogarNoLixo(elementos = [], rotulo = '') {
    const lixeira = mesa?.querySelector('.lixeira-helpy');
    const helpyEl = mesa?.querySelector('.helpy-avatar') || mesa;
    if (!lixeira || !helpyEl || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const voando = [...elementos].filter(Boolean).slice(0, 3);
    await Promise.all(voando.map((el, i) => esperar(i * 140).then(() => window.Efeitos?.voar(el, helpyEl, { duracao: 650, escalaFinal: .18 }))));
    mesa.classList.remove('pegou'); void mesa.offsetWidth; mesa.classList.add('pegou');
    lixeira.classList.add('aberta');
    const mini = document.createElement('span');
    mini.className = 'lixo-ticket';
    mini.innerHTML = `${window.ic ? ic('ticket') : ''} ${rotulo || ''}`;
    const de = helpyEl.getBoundingClientRect();
    mini.style.left = `${de.left + de.width * .62}px`;
    mini.style.top = `${de.top + de.height * .4}px`;
    document.body.appendChild(mini);
    await esperar(120);
    await window.Efeitos?.voar(mini, lixeira, { duracao: 480, escalaFinal: .35 });
    mini.remove();
    lixeira.classList.remove('recebeu'); void lixeira.offsetWidth; lixeira.classList.add('recebeu');
    await esperar(260);
    lixeira.classList.remove('aberta');
  }

    return { focar: focarNoHelpy, soltar: soltarFoco, jogarNoLixo };
  },

  /** Palavras do dia (motivacionais), uma por dia, em rodízio. [palavra, frase do Helpy] */
  PALAVRAS: [
    ['Foco', 'Um ticket de cada vez!'],
    ['Calma', 'Respira fundo, tá tudo sob controle.'],
    ['Equipe', 'Junto a gente vai mais longe.'],
    ['Capricho', 'Feito com carinho fica melhor.'],
    ['Coragem', 'Problema grande, a gente resolve aos pouquinhos.'],
    ['Gratidão', 'Valeu por cada peça salva hoje!'],
    ['Constância', 'Todo dia um pouco já é muito.'],
    ['Sorria', 'Um sorriso deixa o turno mais leve.'],
    ['Persistência', 'Não desiste: a AWB aparece!'],
    ['Atenção', 'Confere duas vezes, erra zero vezes.'],
    ['Energia', 'Bebe água e bora!'],
    ['Paciência', 'Tudo tem seu tempo.'],
    ['Orgulho', 'Olha o tanto que você já resolveu!'],
    ['Leveza', 'Faz o melhor e solta o resto.'],
    ['Respeito', 'Gentileza abre todas as portas.'],
    ['Evolução', 'Hoje melhor que ontem.'],
    ['Confiança', 'Você sabe o que tá fazendo!'],
    ['Organização', 'Mesa arrumada, cabeça tranquila.'],
    ['Alegria', 'Trabalho bom é trabalho com risada.'],
    ['Superação', 'O prazo apertou? A gente dá conta!'],
    ['Cuidado', 'Cada volume é de alguém.'],
    ['Disciplina', 'O simples bem feito todo dia.'],
    ['Parceria', 'Precisou, chama que eu tô aqui!'],
    ['Esperança', 'Amanhã é outro dia, e vai ser bom.'],
  ],

  /** SVG dos enfeites de cada skin (Natal, Terno, Verão, São João, Copa). Coordenadas da sala 340 × 226. */
  enfeitesSvg() {
    const fio = (y, cores, tri = false) => {
      // pisca-pisca (bolinhas) ou bandeirinhas (triângulos) num fio que cai um pouco entre os pregos
      const partes = [];
      for (let x = 10, i = 0; x < 340; x += 20, i += 1) {
        const t = (x % 85) / 85;
        const yy = y + 28 * t * (1 - t);
        const cor = cores[i % cores.length];
        partes.push(tri
          ? `<path d="M${x - 8} ${yy}h16l-8 17z" fill="${cor}" stroke="#23291B" stroke-width="1.2"/>`
          : `<circle class="enf-luz" cx="${x}" cy="${yy + 4}" r="4" fill="${cor}" stroke="#23291B" stroke-width="1"/>`);
      }
      return `<path d="M0 ${y}Q42.5 ${y + 14} 85 ${y}T170 ${y}T255 ${y}T340 ${y}" fill="none" stroke="#1D1E1A" stroke-width="1.6"/>${partes.join('')}`;
    };
    return `
      <svg class="sala-enfeites" viewBox="0 0 340 226" preserveAspectRatio="xMinYMin slice" aria-hidden="true">
        <g class="enf enf-natal">
          ${fio(6, ['#E8453C', '#F2C230', '#5FBF4E', '#4FA8E0'])}
          <circle cx="172" cy="104" r="22" fill="none" stroke="#2E7D32" stroke-width="10" stroke-dasharray="5 2"/>
          <circle cx="172" cy="104" r="22" fill="none" stroke="#1B5E20" stroke-width="2" stroke-dasharray="1 6"/>
          ${[[156, 92], [186, 90], [190, 116], [160, 120], [172, 82]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#E8453C" stroke="#23291B" stroke-width=".8"/>`).join('')}
          <path d="M172 124l-10 8 2-10zM172 124l10 8-2-10z" fill="#D23A2C" stroke="#23291B" stroke-width="1"/><circle cx="172" cy="124" r="3.4" fill="#D23A2C" stroke="#23291B"/>
        </g>
        <g class="enf enf-terno">
          <line x1="172" y1="0" x2="172" y2="22" stroke="#1D1E1A" stroke-width="2"/>
          <path d="M160 34h24l-4-12h-16z" fill="#C9A94A" stroke="#23291B" stroke-width="1.5"/>
          <rect x="146" y="52" width="52" height="44" rx="2" fill="#E3C567" stroke="#23291B" stroke-width="2"/>
          <rect x="151" y="57" width="42" height="34" fill="#9FD3E8"/>
          <path d="M151 91l12-14 9 9 7-6 14 11z" fill="#4C7F3A"/><circle cx="184" cy="64" r="4" fill="#F2C230"/>
        </g>
        <g class="enf enf-verao">
          <g class="enf-sol-raios">${Array.from({ length: 10 }, (_, i) => `<rect x="171" y="22" width="3" height="10" rx="1.5" fill="#F2A33A" transform="rotate(${i * 36} 172.5 48)"/>`).join('')}</g>
          <circle cx="172.5" cy="48" r="14" fill="#FFD447" stroke="#E89B24" stroke-width="2"/>
          <path d="M126 30q4-4 8 0q4-4 8 0M146 18q3-3 6 0q3-3 6 0" fill="none" stroke="#2B3446" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M0 160q15-8 30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0v12H0z" fill="#4FA8E0" opacity=".75"/>
        </g>
        <g class="enf enf-junino">
          ${fio(4, ['#E8453C', '#F2C230', '#3C93D6', '#5FBF4E', '#F28C28'], true)}
          <g class="enf-balao">
            <line x1="172" y1="22" x2="172" y2="40" stroke="#1D1E1A" stroke-width="1.5"/>
            <path d="M158 44h28l5 22-5 22h-28l-5-22z" fill="#F28C28" stroke="#23291B" stroke-width="1.5"/>
            <path d="M153 66h38M158 54h28M158 78h28" stroke="#F2C230" stroke-width="3"/>
            <rect x="166" y="88" width="12" height="6" fill="#8A5A2B" stroke="#23291B"/>
          </g>
        </g>
        <g class="enf enf-copa">
          ${fio(4, ['#2E8B3E', '#F2C230'], true)}
          <rect x="146" y="44" width="52" height="36" rx="2" fill="#2E8B3E" stroke="#23291B" stroke-width="1.5"/>
          <path d="M172 48l22 14-22 14-22-14z" fill="#F2C230"/><circle cx="172" cy="62" r="8" fill="#2F57B3"/>
          <path d="M165 61q7-3 14 2" stroke="#fff" stroke-width="1.2" fill="none"/>
          <circle cx="252" cy="148" r="25" fill="#FFFDF6" stroke="#23291B" stroke-width="1.6"/>
          <!-- desenho da bola (pentágono e riscos): acompanha o círculo acima.
               Para mover/aumentar a bola, mude o cx/cy/r do círculo E aqui: translate(cx cy) scale(r ÷ 13) -->
          <g transform="translate(252 148) scale(1.923) translate(-172 -112)">
            <path d="M172 105l5 3.5-2 6h-6l-2-6z" fill="#1D1E1A"/><path d="M160 108l4 1M184 108l-4 1M165 121l3-4M179 121l-3-4" stroke="#1D1E1A" stroke-width="2"/>
          </g>
        </g>
      </svg>`;
  },
};

window.Escritorio = Escritorio;
