/* =========================================================
   contas.js — Crachás (administrador)
   Abas Geral / Usuários / Administradores. Cada crachá tem a
   cor do cargo e uma engrenagem com: editar, gerar senha nova,
   trocar de cargo e suspender/reativar (segurar para confirmar).
   Emitir crachá: o crachá é "impresso" na prévia e voa para a lista.
   Tudo fica no Registro de Auditoria.
   ========================================================= */

const usuario = Sessao.exigir(['admin']);

const elForm = document.getElementById('formConta');
const elNome = document.getElementById('nome');
const elEmail = document.getElementById('email');
const elSenha = document.getElementById('senha');
const elAviso = document.getElementById('aviso');
const elBotao = document.getElementById('botaoCriar');
const elDica = document.getElementById('perfilDica');
const elLista = document.getElementById('listaContas');
const elPrevia = document.getElementById('previaCracha');
const elOffline = document.getElementById('avisoOffline');
const elCredencial = document.getElementById('credencial');
const elMenu = document.getElementById('menuCracha');
const modalPoder = document.getElementById('modalPoder');
const modalEmissor = document.getElementById('modalEmissor');
const modalEditar = document.getElementById('modalEditar');

const esc = (texto) => escaparHtml(String(texto ?? ''));
const ROTULOS = { usuario: 'Usuário', admin: 'Administrador' };
const DICAS = {
  usuario: 'Insere volumes, troca status, registra AWB e saída no Controle NC.',
  admin: 'Tudo do usuário, mais estatísticas, crachás, clientes, console e auditoria.',
};
const ICONES_CARGO = { usuario: 'usuario', admin: 'coroa' };
const ORDEM_CARGO = { admin: 0, usuario: 1 };

let contas = [];
let filtro = 'geral';
let soSuspensos = false;
let idDestacado = null;
let menuDe = null;
let contaEmEdicao = null;
let assinatura = '';

const perfilEscolhido = () => document.querySelector('input[name="perfil"]:checked').value;

function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => letras[n % letras.length]).join('');
}

function mostrarAviso(texto) {
  elAviso.textContent = texto;
  elAviso.hidden = false;
}

// ---------- Crachá ----------
function crachaHtml(conta, { previa = false } = {}) {
  const suspenso = conta.ativo === false;
  const eu = conta.id === usuario.id;
  // o próprio crachá também tem engrenagem (sem trocar de cargo nem suspender), com o selo "você" ao lado
  const engrenagem = previa ? '' : `${eu ? '<span class="cracha-voce com-config"><i class="ic ic-coroa" aria-hidden="true"></i> você</span>' : ''}<button type="button" class="cracha-config" data-menu="${conta.id}" aria-haspopup="menu" aria-expanded="false"
         aria-label="Configurações do crachá de ${esc(conta.nome)}" title="Configurações">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
       </button>`;
  return `
    <li class="cracha-item" data-id="${conta.id ?? ''}">
      <span class="cordao" aria-hidden="true"></span>
      <article class="cracha p-${conta.perfil} ${suspenso ? 'suspenso' : ''} ${conta.id === idDestacado ? 'emitido' : ''}">
        <span class="cracha-faixa"></span>
        ${engrenagem}
        <span class="cracha-foto" aria-hidden="true">${Avatar.conteudo(conta)}</span>
        <span class="cracha-nome">${esc(conta.nome || 'Nome da pessoa')}</span>
        <span class="cracha-cargo">${ROTULOS[conta.perfil]}</span>
        <span class="cracha-email">${esc(conta.email || 'email@mutility.com.br')}</span>
        <span class="cracha-senha" aria-label="Senha oculta">Senha <b>••••••••</b></span>
        <span class="cracha-id">ID ${String(conta.id ?? 0).padStart(4, '0')} · Setor NC</span>
        <span class="codigo-barras" aria-hidden="true"></span>
        ${suspenso ? '<span class="cracha-suspenso">SUSPENSO</span>' : ''}
      </article>
    </li>`;
}

function renderizarPrevia() {
  elPrevia.innerHTML = `<ul class="crachas" style="grid-template-columns:1fr">${crachaHtml({
    id: null, nome: elNome.value.trim(), email: elEmail.value.trim(), perfil: perfilEscolhido(), ativo: true,
  }, { previa: true })}</ul>`;
}

// ---------- Menu da engrenagem ----------
function abrirMenu(botao) {
  const conta = contas.find((c) => c.id === Number(botao.dataset.menu));
  if (!conta) return;
  if (menuDe === conta.id && !elMenu.hidden) { fecharMenu(); return; }
  fecharMenu();
  menuDe = conta.id;
  const suspenso = conta.ativo === false;
  const eu = conta.id === usuario.id;
  const outro = conta.perfil === 'admin' ? 'usuario' : 'admin';
  const item = (poder, icone, rotulo) =>
    `<button type="button" role="menuitem" class="menu-item" data-poder="${poder}" data-id="${conta.id}">${ic(icone)} ${rotulo}</button>`;
  elMenu.innerHTML = `
    <span class="menu-titulo">${esc(conta.nome)}</span>
    ${item('editar', 'caneta', 'Editar nome e e-mail')}
    ${item('senha', 'dado', 'Gerar senha nova')}
    ${item('ics', 'chave', 'Editar usuário e senha do ICS')}
    ${eu ? '' : `<span class="menu-separador" role="separator"></span>
    ${item(`cargo-${outro}`, ICONES_CARGO[outro], `Tornar ${ROTULOS[outro].toLowerCase()}`)}
    <span class="menu-separador" role="separator"></span>
    <button type="button" role="menuitem" class="menu-acesso ${suspenso ? 'reativar' : 'suspender'}" data-poder="${suspenso ? 'reativar' : 'suspender'}" data-id="${conta.id}">
      ${suspenso ? ic('cadeado-aberto') : ic('bloqueio')}
      <span><b>${suspenso ? 'Reativar acesso' : 'Suspender acesso'}</b>
      <small>${suspenso ? 'A pessoa volta a entrar no M-Utility' : 'A pessoa não consegue mais entrar'}</small></span>
    </button>`}`;
  const r = botao.getBoundingClientRect();
  elMenu.hidden = false;
  const largura = elMenu.offsetWidth;
  elMenu.style.left = `${Math.max(8, Math.min(innerWidth - largura - 8, r.right - largura))}px`;
  const cabeEmbaixo = r.bottom + elMenu.offsetHeight + 8 < innerHeight;
  elMenu.style.top = `${cabeEmbaixo ? r.bottom + 6 : r.top - elMenu.offsetHeight - 6}px`;
  botao.setAttribute('aria-expanded', 'true');
  elMenu.querySelector('.menu-item')?.focus();
}
function fecharMenu() {
  elMenu.hidden = true;
  document.querySelectorAll('[data-menu][aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  menuDe = null;
}
document.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-menu]');
  if (botao) { e.stopPropagation(); abrirMenu(botao); return; }
  const itemMenu = e.target.closest('#menuCracha [data-poder]');
  if (itemMenu) { fecharMenu(); aplicarPoder(itemMenu.dataset.poder, itemMenu.dataset.id); return; }
  if (!elMenu.hidden && !e.target.closest('#menuCracha')) fecharMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
addEventListener('resize', () => { if (!elMenu.hidden) fecharMenu(); });

// ---------- Lista ----------
function renderizarEquipe() {
  const termo = document.getElementById('busca').value.trim();
  const visiveis = contas
    .filter((c) => filtro === 'geral' || c.perfil === filtro)
    .filter((c) => !soSuspensos || c.ativo === false)
    .filter((c) => !termo || Busca.normalizar(`${c.nome} ${c.email} ${String(c.id).padStart(4, '0')} ${c.id} ${ROTULOS[c.perfil]}`).includes(Busca.normalizar(termo)))
    .sort((a, b) => ORDEM_CARGO[a.perfil] - ORDEM_CARGO[b.perfil] || a.nome.localeCompare(b.nome) || a.id - b.id);
  // (sem contador no título)
  document.querySelectorAll('[data-aba]').forEach((b) => {
    const qtd = b.dataset.aba === 'geral' ? contas.length : contas.filter((c) => c.perfil === b.dataset.aba).length;
    const el = b.querySelector('.aba-qtd');
    if (el) el.textContent = qtd;
  });
  elLista.innerHTML = visiveis.length
    ? visiveis.map((c) => crachaHtml(c)).join('')
    : `<li class="mesa-vazia mesa-vazia-centro"><span class="mesa-vazia-ico">${ic('cracha')}</span>
        <strong>${soSuspensos ? 'Ninguém suspenso aqui' : 'Ninguém nesta aba ainda'}</strong>
        <span>${soSuspensos ? 'Ótimo: todo mundo com acesso.' : 'Clique em “Emitir crachá” para criar o acesso.'}</span></li>`;
}

async function carregar() {
  const { ok, status, dados } = await API.listarContas();
  if (status === 401) { Sessao.sair('expirou'); return; }
  if (!ok) { mostrarOffline(elOffline); return; }
  elOffline.hidden = true;
  contas = dados;
  const nova = JSON.stringify(contas);
  if (nova === assinatura) return;
  assinatura = nova;
  setTimeout(() => { idDestacado = null; }, 1500);
  renderizarEquipe();
}

// ---------- Autorização: segurar para confirmar ----------
function autorizar({ icone, titulo, texto, rotulo, perigo = false, acao, conta = null }) {
  const conteudo = document.getElementById('conteudoPoder');
  const DURACAO = 1200;
  const DICA = `Mantenha pressionado por ${(DURACAO / 1000).toLocaleString('pt-BR')} segundo · ou segure Enter`;
  conteudo.innerHTML = `
    <div class="poder-icone ${perigo ? 'perigo' : ''}">${icone}</div>
    <h2>${titulo}</h2>
    ${conta ? `<div class="poder-alvo">${Avatar.html(conta, 'poder-avatar')}
      <span><b>${esc(conta.nome)}</b><small>${ROTULOS[conta.perfil]} · ${esc(conta.email)}</small></span></div>` : ''}
    <p>${texto}</p>
    <button type="button" class="segurar ${perigo ? 'perigo' : ''}" id="botaoSegurar" aria-label="Segure para ${rotulo}">
      <span class="segurar-barra" aria-hidden="true"></span>
      <span class="segurar-texto">${icone}<span data-rotulo>Segure para ${rotulo}</span></span>
      <span class="segurar-pct" aria-hidden="true"></span>
    </button>
    <p class="dica-segurar" id="dicaSegurar" aria-live="polite">${DICA}</p>
    <p class="aviso aviso-erro" id="erroPoder" hidden></p>
    <div class="modal-acoes"><button type="button" class="btn" data-fechar>Cancelar</button></div>`;
  modalPoder.showModal();

  const botao = document.getElementById('botaoSegurar');
  const elRotulo = botao.querySelector('[data-rotulo]');
  const elPct = botao.querySelector('.segurar-pct');
  const elDicaSegurar = document.getElementById('dicaSegurar');
  let inicio = null;
  let quadro = null;
  let feito = false;
  let progresso = 0;

  const pintar = (p) => {
    progresso = p;
    botao.style.setProperty('--p', p.toFixed(3));
    botao.classList.toggle('meio', p > .5);
    elPct.textContent = p > 0 && p < 1 ? `${Math.round(p * 100)}%` : '';
  };
  const parar = () => {
    if (feito || inicio === null) return;
    cancelAnimationFrame(quadro);
    inicio = null;
    botao.classList.remove('segurando');
    if (progresso > .05) {
      elDicaSegurar.textContent = 'Quase! Segure até a barra encher por completo.';
      elDicaSegurar.classList.add('alerta');
      botao.classList.remove('tremeu'); void botao.offsetWidth; botao.classList.add('tremeu');
    }
    pintar(0);
  };
  const passo = (agora) => {
    const p = Math.min(1, (agora - inicio) / DURACAO);
    pintar(p);
    if (p < 1) { quadro = requestAnimationFrame(passo); return; }
    feito = true;
    executar();
  };
  const comecar = (e) => {
    if (feito || inicio !== null) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    inicio = performance.now();
    botao.classList.add('segurando');
    elDicaSegurar.textContent = 'Segurando… não solte';
    elDicaSegurar.classList.remove('alerta');
    navigator.vibrate?.(12);
    quadro = requestAnimationFrame(passo);
  };
  const executar = async () => {
    botao.classList.remove('segurando');
    botao.classList.add('processando');
    elRotulo.textContent = 'Aplicando…';
    const resultado = await acao();
    botao.classList.remove('processando');
    if (resultado?.erro) {
      feito = false;
      inicio = null;
      pintar(0);
      elRotulo.textContent = `Segure para ${rotulo}`;
      elDicaSegurar.textContent = DICA;
      const erro = document.getElementById('erroPoder');
      erro.textContent = resultado.erro;
      erro.hidden = false;
      return;
    }
    navigator.vibrate?.([20, 40, 20]);
    botao.classList.add('autorizado');
    botao.querySelector('.segurar-texto').innerHTML = '<i class="ic ic-check" aria-hidden="true"></i><span>Feito!</span>';
    if (resultado?.html) {
      elDicaSegurar.outerHTML = resultado.html;
      conteudo.querySelector('[data-fechar]').textContent = 'Concluir';
    } else {
      elDicaSegurar.textContent = 'Autorizado.';
      setTimeout(() => modalPoder.close(), 900);
    }
  };

  botao.addEventListener('pointerdown', comecar);
  botao.addEventListener('keydown', comecar);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => botao.addEventListener(ev, parar));
  botao.addEventListener('keyup', parar);
  botao.addEventListener('contextmenu', (e) => e.preventDefault());
  botao.focus();
}

modalPoder.addEventListener('click', (e) => {
  if (e.target === modalPoder || e.target.closest('[data-fechar]')) modalPoder.close();
});

async function aplicarPoder(tipo, id) {
  const conta = contas.find((c) => c.id === Number(id));
  if (!conta) return;
  const nome = `<span class="modal-alvo">${esc(conta.nome)}</span>`;
  const destacar = async () => {
    await carregar();
    elLista.querySelector(`[data-id="${conta.id}"] .cracha`)?.classList.add('recebeu-poder');
  };

  if (tipo === 'editar') { abrirEdicao(conta); return; }
  if (tipo === 'ics') { abrirIcs(conta); return; }

  if (tipo.startsWith('cargo-')) {
    const novo = tipo.slice(6);
    autorizar({
      conta,
      icone: ic(ICONES_CARGO[novo]),
      titulo: `Tornar ${ROTULOS[novo].toLowerCase()}`,
      texto: novo === 'admin'
        ? `${nome} passa a ver estatísticas, crachás, clientes, console e auditoria.`
        : `${nome} perde as telas de administração e fica só com o Controle NC e o Histórico.`,
      rotulo: 'confirmar',
      perigo: novo === 'admin',
      acao: async () => {
        const { ok, dados } = await API.atualizarConta(conta.id, { perfil: novo });
        if (!ok) return { erro: dados.erro || 'Não foi possível concluir.' };
        Efeitos.toast(`${esc(conta.nome)} agora é <strong>${ROTULOS[novo].toLowerCase()}</strong>`, { icone: ic(ICONES_CARGO[novo]), tipo: 'sucesso' });
        if (filtro !== 'geral') escolherAba(novo);
        destacar();
        return {};
      },
    });
    return;
  }

  if (tipo === 'suspender' || tipo === 'reativar') {
    const suspender = tipo === 'suspender';
    autorizar({
      conta,
      icone: ic(suspender ? 'bloqueio' : 'cadeado-aberto'),
      titulo: suspender ? 'Suspender acesso' : 'Reativar acesso',
      texto: suspender
        ? `${nome} não consegue mais entrar e, se estiver usando, é desconectado na próxima ação.`
        : `${nome} volta a entrar normalmente no M-Utility.`,
      rotulo: suspender ? 'suspender' : 'reativar',
      perigo: suspender,
      acao: async () => {
        const { ok, dados } = await API.atualizarConta(conta.id, { ativo: !suspender });
        if (!ok) return { erro: dados.erro || 'Não foi possível concluir.' };
        Efeitos.toast(`${esc(conta.nome)} ${suspender ? 'foi suspenso(a)' : 'foi reativado(a)'}`, { icone: ic(suspender ? 'bloqueio' : 'cadeado-aberto') });
        destacar();
        return {};
      },
    });
    return;
  }

  if (tipo === 'senha') {
    const nova = gerarSenha();
    autorizar({
      conta,
      icone: ic('chave'),
      titulo: 'Gerar senha nova',
      texto: `Uma nova senha será gerada para ${nome}. A senha atual deixa de funcionar.`,
      rotulo: 'gerar',
      acao: async () => {
        const { ok, dados } = await API.redefinirSenha(conta.id, nova);
        if (!ok) return { erro: dados.erro || 'Não foi possível gerar a senha.' };
        destacar();
        return { html: `<div><p>Nova senha de ${esc(conta.nome)}:</p><p class="senha-nova">${esc(nova)}</p></div>` };
      },
    });
  }
}

// ---------- Emissão de crachá ----------
elForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  elAviso.hidden = true;
  const dados = { nome: elNome.value.trim(), email: elEmail.value.trim(), perfil: perfilEscolhido(), senha: elSenha.value };
  if (!dados.nome || !dados.email) { mostrarAviso('Preencha nome e e-mail.'); return; }
  if (dados.senha.length < 4) { mostrarAviso('A senha deve ter pelo menos 4 caracteres.'); return; }

  elBotao.disabled = true;
  elBotao.textContent = 'Emitindo…';
  try {
    const { ok, status, dados: resposta } = await API.criarConta(dados);
    if (status === 401) { Sessao.sair('expirou'); return; }
    if (!ok) { mostrarAviso(resposta.erro || 'Não foi possível criar a conta.'); return; }

    // Imprime o crachá na prévia e voa para a lista
    elPrevia.innerHTML = `<ul class="crachas" style="grid-template-columns:1fr">${crachaHtml(resposta, { previa: true })}</ul>`;
    elPrevia.classList.remove('imprimindo');
    void elPrevia.offsetWidth;
    elPrevia.classList.add('imprimindo');
    await new Promise((r) => setTimeout(r, 1050));
    await Efeitos.voar(elPrevia.querySelector('.cracha-item'), elLista, { duracao: 750, escalaFinal: .6 });

    idDestacado = resposta.id;
    if (filtro !== 'geral') escolherAba(resposta.perfil);
    await carregar();
    elLista.querySelector(`[data-id="${resposta.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    Efeitos.confete(elLista.querySelector(`[data-id="${resposta.id}"]`), 50);
    Efeitos.toast(`Crachá de <strong>${esc(resposta.nome)}</strong> emitido!`, { icone: ic('cracha'), tipo: 'sucesso' });

    document.getElementById('credNome').textContent = resposta.nome;
    document.getElementById('credArea').textContent = ROTULOS[resposta.perfil];
    document.getElementById('credEmail').textContent = resposta.email;
    document.getElementById('credSenha').textContent = dados.senha;
    elCredencial.hidden = false;

    elForm.reset();
    elSenha.value = gerarSenha();
    elDica.textContent = DICAS[perfilEscolhido()];
    renderizarPrevia();
  } finally {
    elBotao.disabled = false;
    elBotao.textContent = 'Emitir crachá';
  }
});

[elNome, elEmail].forEach((campo) => campo.addEventListener('input', renderizarPrevia));
document.querySelectorAll('input[name="perfil"]').forEach((radio) => radio.addEventListener('change', () => {
  elDica.textContent = DICAS[perfilEscolhido()];
  renderizarPrevia();
}));
document.getElementById('gerarSenha').addEventListener('click', () => { elSenha.value = gerarSenha(); });

document.getElementById('copiarCredencial').addEventListener('click', async (evento) => {
  const dd = elCredencial.querySelectorAll('dd');
  const texto = `Acesso ao M-Utility\nEntrar como: ${dd[0].textContent}\nE-mail: ${dd[1].textContent}\nSenha: ${dd[2].textContent}`;
  const botao = evento.currentTarget;
  try {
    await navigator.clipboard.writeText(texto);
    botao.innerHTML = `${ic('check')} Copiado`;
  } catch {
    botao.textContent = 'Não foi possível copiar';
  }
  setTimeout(() => { botao.innerHTML = `${ic('copiar')} Copiar dados`; }, 2000);
});

// ---------- Abas e "só suspensos" ----------
function escolherAba(aba) {
  filtro = aba;
  document.querySelectorAll('[data-aba]').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.aba === aba);
    b.setAttribute('aria-selected', String(b.dataset.aba === aba));
  });
  renderizarEquipe();
}
document.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => escolherAba(b.dataset.aba)));
document.getElementById('soSuspensos').addEventListener('click', (e) => {
  soSuspensos = !soSuspensos;
  e.currentTarget.classList.toggle('ativo', soSuspensos);
  e.currentTarget.setAttribute('aria-pressed', String(soSuspensos));
  renderizarEquipe();
});

// ---------- Emitir crachá (modal) ----------
document.getElementById('abrirEmissor').addEventListener('click', () => {
  elCredencial.hidden = true;
  elAviso.hidden = true;
  elNome.value = '';
  elEmail.value = '';
  elSenha.value = gerarSenha();
  document.getElementById(filtro === 'admin' ? 'novoAdmin' : 'novoUsuario').checked = true;
  elDica.textContent = DICAS[perfilEscolhido()];
  renderizarPrevia();
  modalEmissor.showModal();
  setTimeout(() => elNome.focus(), 50);
});
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
  if ((e.target === d || e.target.closest('[data-fechar]')) && d !== modalPoder) d.close();
}));

// ---------- Editar crachá ----------
function abrirEdicao(conta) {
  contaEmEdicao = conta;
  document.getElementById('editarNome').value = conta.nome;
  document.getElementById('editarEmail').value = conta.email;
  document.getElementById('erroEditar').hidden = true;
  document.getElementById('editarSenha').innerHTML = `
    <strong>${ic('chave')} Senha</strong>
    <p>Esqueceu a senha? Gere uma senha nova e passe para a pessoa.</p>
    <div class="editar-senha-acoes"><button type="button" class="btn btn-sm" data-nova-senha>${ic('dado')} Gerar senha nova</button></div>`;
  modalEditar.showModal();
}
document.getElementById('editarSenha').addEventListener('click', (e) => {
  if (!e.target.closest('[data-nova-senha]') || !contaEmEdicao) return;
  modalEditar.close();
  aplicarPoder('senha', contaEmEdicao.id);
});
document.getElementById('formEditar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const conta = contaEmEdicao;
  const erro = document.getElementById('erroEditar');
  const nome = document.getElementById('editarNome').value.trim();
  const email = document.getElementById('editarEmail').value.trim();
  const { ok, dados } = await API.atualizarConta(conta.id, { nome, email });
  if (!ok) { erro.textContent = dados.erro || 'Não foi possível salvar.'; erro.hidden = false; return; }
  modalEditar.close();
  Efeitos.toast(`Crachá de <strong>${esc(dados.nome)}</strong> atualizado.`, { icone: ic('caneta'), tipo: 'sucesso' });
  await carregar();
  elLista.querySelector(`[data-id="${conta.id}"] .cracha`)?.classList.add('recebeu-poder');
});

// ---------- Usuário e senha do ICS (o aplicativo de trabalho) ----------
// A pessoa vê com dois cliques no Helpy BOT + PIN; aqui o administrador cadastra e edita.
const modalIcs = document.getElementById('modalIcs');
let contaIcs = null;
async function abrirIcs(conta) {
  const { ok, dados } = await API.icsDaConta(conta.id);
  if (!ok) { Efeitos.toast(esc(dados.erro || 'Não consegui abrir o ICS.'), { tipo: 'alerta' }); return; }
  contaIcs = conta;
  document.getElementById('icsAlvo').textContent = conta.nome;
  document.getElementById('icsUsuario').value = dados.usuario;
  const senha = document.getElementById('icsSenha');
  senha.value = dados.senha;
  senha.type = 'password';
  document.getElementById('icsVerSenha').setAttribute('aria-pressed', 'false');
  document.getElementById('erroIcs').hidden = true;
  modalIcs.showModal();
  document.getElementById('icsUsuario').focus();
}
document.getElementById('icsVerSenha').addEventListener('click', (e) => {
  const senha = document.getElementById('icsSenha');
  const ver = senha.type === 'password';
  senha.type = ver ? 'text' : 'password';
  e.currentTarget.setAttribute('aria-pressed', String(ver));
  e.currentTarget.setAttribute('aria-label', ver ? 'Esconder a senha' : 'Mostrar a senha');
});
document.getElementById('formIcs').addEventListener('submit', async (e) => {
  e.preventDefault();
  const conta = contaIcs;
  if (!conta) return;
  const erro = document.getElementById('erroIcs');
  const usuarioIcs = document.getElementById('icsUsuario').value.trim();
  const senhaIcs = document.getElementById('icsSenha').value;
  if (!usuarioIcs && senhaIcs) { erro.textContent = 'Informe o usuário do ICS.'; erro.hidden = false; return; }
  const { ok, dados } = await API.salvarIcs(conta.id, usuarioIcs, senhaIcs);
  if (!ok) { erro.textContent = dados.erro || 'Não foi possível salvar.'; erro.hidden = false; return; }
  modalIcs.close();
  document.getElementById('icsSenha').value = '';
  Efeitos.toast(`ICS de <strong>${esc(conta.nome)}</strong> ${usuarioIcs ? 'salvo' : 'apagado'}.`, { icone: ic('chave'), tipo: 'sucesso' });
  elLista.querySelector(`[data-id="${conta.id}"] .cracha`)?.classList.add('recebeu-poder');
});
modalIcs.addEventListener('close', () => { document.getElementById('icsSenha').value = ''; contaIcs = null; });

document.getElementById('busca').addEventListener('input', renderizarEquipe);

// ---------- Início ----------
if (usuario) {
  Sessao.montarMenu(usuario);
  elDica.textContent = DICAS[perfilEscolhido()];
  elSenha.value = gerarSenha();
  renderizarPrevia();
  carregar();
}
