/* =========================================================
   placar.js — o SCORE do setor NC (comum a várias telas)
   - O quadrinho na lateral (sem integração · aguardando · resolvidos hoje).
   - Clicando nele, o placar completo em lista, com "Baixar imagem".
   Uso: const placar = Placar.montar({ volumes: () => volumes });
        placar.atualizar();   // depois de carregar ou mudar os volumes
   Se a página já tiver #scoreMesa / #modalPlacar, usa os dela;
   senão, coloca o quadrinho no alto da .lateral e cria o pop-up.
   ========================================================= */

const Placar = {
  montar({ volumes = () => [] } = {}) {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const mesmoDia = (iso) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
    const noSetor = () => volumes().filter((v) => !Catalogo.saiu(v));
    const saidasHoje = () => volumes().filter((v) => Catalogo.saiu(v) && mesmoDia(v.data_saida));

    // ---- quadrinho da lateral
    let elScore = document.getElementById('scoreMesa');
    if (!elScore) {
      const lateral = document.querySelector('.lateral');
      if (!lateral) return { atualizar() {} };
      lateral.insertAdjacentHTML('afterbegin', `
        <div class="score" id="scoreMesa" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Score do setor NC — abrir o placar completo" title="Abrir o placar completo">
          <span class="score-titulo">Score</span>
          <div class="score-item"><span class="score-valor" id="placarSemIntegracao">0</span><span class="score-rotulo">sem integração</span></div>
          <div class="score-item"><span class="score-valor" id="placarAguardando">0</span><span class="score-rotulo">aguardando entrega</span></div>
          <div class="score-item score-destaque"><span class="score-valor" id="placarHoje">0</span><span class="score-rotulo">resolvidos hoje</span></div>
        </div>`);
      document.querySelector('.lateral')?.classList.add('com-score');
      elScore = document.getElementById('scoreMesa');
    }

    // ---- pop-up do placar completo
    let modal = document.getElementById('modalPlacar');
    if (!modal) {
      document.body.insertAdjacentHTML('beforeend', `
        <dialog class="modal modal-placar" id="modalPlacar" aria-labelledby="tituloPlacar">
          <div class="placar-conteudo">
            <header class="placar-topo"><h2 id="tituloPlacar">Score</h2></header>
            <div class="placar-corpo" id="placarCorpo"></div>
          </div>
        </dialog>`);
      modal = document.getElementById('modalPlacar');
    }
    // título só "Score", sem data; botões de baixar e fechar no topo
    const topo = modal.querySelector('.placar-topo');
    topo.querySelector('#tituloPlacar').textContent = 'Score';
    topo.querySelector('.placar-hora')?.remove();
    if (!topo.querySelector('[data-baixar-placar]')) {
      topo.querySelector('.placar-fechar')?.remove();
      topo.insertAdjacentHTML('beforeend', `
        <div class="placar-botoes">
          <button type="button" class="placar-fechar placar-baixar" data-baixar-placar aria-label="Baixar o Score como imagem" title="Baixar o Score como imagem (PNG)"><i class="ic ic-download" aria-hidden="true"></i></button>
          <button type="button" class="placar-fechar" data-fechar-placar aria-label="Fechar">✕</button>
        </div>`);
    }

    const el = {
      semIntegracao: document.getElementById('placarSemIntegracao'),
      aguardando: document.getElementById('placarAguardando'),
      hoje: document.getElementById('placarHoje'),
    };

    function montarCorpo() {
      const setor = noSetor();
      const hoje = saidasHoje();
      const valor = (n) => (n ? String(n) : '-');
      const celula = (rotulo, n, classe = '') => `<div class="placar-cel ${classe} ${n ? '' : 'zero'}"><span class="placar-num">${valor(n)}</span><span class="placar-rot">${esc(rotulo)}</span></div>`;
      const grupo = (titulo, itens) => `<section class="placar-grupo"><h3>${esc(titulo)}</h3><div class="placar-grade">${itens.join('')}</div></section>`;
      const entraramHoje = volumes().filter((v) => mesmoDia(v.data_entrada)).length;
      const vencidos = setor.filter((v) => Catalogo.prazo(v) === 'vencido').length;
      const atencao = setor.filter((v) => Catalogo.prazo(v) === 'atencao').length;
      const comStatus = [...setor, ...hoje];
      document.getElementById('placarCorpo').innerHTML = `
        ${grupo('Resumo de hoje', [
          celula('no setor', setor.length, 'grande'),
          celula('entraram hoje', entraramHoje, 'grande'),
          celula('resolvidos hoje', hoje.length, 'grande ouro'),
          celula('prazo vencido', vencidos, 'grande perigo'),
          celula('perto do prazo', atencao, 'grande alerta'),
        ])}
        ${grupo('Tipo de NC · no setor', Catalogo.tipos.map((t) => celula(t.titulo, setor.filter((v) => v.tipo === t.id).length)))}
        ${grupo('Status · no setor e saídas de hoje', Catalogo.status.map((s) => celula(s.titulo, comStatus.filter((v) => v.status === s.id).length)))}
        ${grupo('Local · no setor e saídas de hoje', Catalogo.locais.map((l) => celula(l.titulo, comStatus.filter((v) => v.local === l.id).length)))}`;
    }

    function atualizar() {
      const setor = noSetor();
      const pintar = (alvo, n) => { if (!alvo) return; if (window.Efeitos) Efeitos.contarAte(alvo, n); else alvo.textContent = n; };
      pintar(el.semIntegracao, setor.filter((v) => v.tipo === 'sem-integracao').length);
      pintar(el.aguardando, setor.filter((v) => v.status === 'aguardando-entrega').length);
      pintar(el.hoje, saidasHoje().length);
      if (modal.open) montarCorpo();
    }

    function abrir() {
      montarCorpo();
      modal.showModal();
    }

    async function baixar(botao) {
      if (!window.Foto) return;
      botao.disabled = true;
      try {
        const d = new Date();
        const data = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        // PNG transparente: só o "container" do Score (fundo escuro, borda e cantos arredondados) aparece
        await Foto.baixar(modal.querySelector('.placar-conteudo'), `Score (${data})`, {
          margem: 2,
          raiz: 'background:linear-gradient(180deg,#161B10,#0B0E08);border:2px solid #23291B;border-radius:18px;box-shadow:inset 0 0 0 4px #2A3220;overflow:hidden',
        });
        window.Efeitos?.toast('Imagem do Score baixada', { icone: '<i class="ic ic-download" aria-hidden="true"></i>', tipo: 'sucesso' });
        if (window.API?.registrarAcao) API.registrarAcao('Baixou a imagem do Score');
      } catch (erro) {
        window.Efeitos?.toast(`Não consegui gerar a imagem: ${esc(erro.message)}`, { tipo: 'alerta' });
      } finally {
        botao.disabled = false;
      }
    }

    elScore.addEventListener('click', abrir);
    elScore.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    modal.addEventListener('click', (e) => {
      const b = e.target.closest('[data-baixar-placar]');
      if (b) { baixar(b); return; }
      if (e.target.closest('[data-fechar-placar]') || e.target === e.currentTarget) modal.close();
    });

    return { atualizar, abrir, montarCorpo };
  },
};

window.Placar = Placar;
