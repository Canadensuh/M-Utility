/* =========================================================
   login.js — entrada por perfil (Usuário | Administrador)
   As contas ficam no banco local (js/api.js).
   O formulário é um crachá (a cor muda com o cargo) e, ao lado,
   a salinha do Helpy: ele só muda de cara, sem mensagens.
   ========================================================= */

const elForm = document.getElementById('formLogin');
const elEmail = document.getElementById('email');
const elSenha = document.getElementById('senha');
const elLembrar = document.getElementById('lembrar');
const elAviso = document.getElementById('aviso');
const elBotao = document.getElementById('botaoEntrar');
const elCracha = document.getElementById('loginCracha');
const elCargo = document.getElementById('faixaCargo');

const CARGOS = { usuario: 'Usuário', admin: 'Administrador' };
const params = new URLSearchParams(location.search);
const perfilEscolhido = () => document.querySelector('input[name="perfil"]:checked').value;

// ---------- Salinha do Helpy (carinho sem mensagem; o cabide troca a roupa) ----------
if (window.Vitrine) {
  document.querySelectorAll('[data-salinha]').forEach((el) => Vitrine.salinha(el, { humor: el.dataset.salinha, filtro: false }));
  Vitrine.ligarCarinho();
  Vitrine.ligarEscalas();
}
const HUMORES = window.Helpy?.HUMORES || [];
/** O Helpy só muda a expressão. */
function helpyCara(humor) {
  const av = document.querySelector('.login-lado .helpy-avatar');
  if (!av || av.classList.contains('carinho')) return;
  av.classList.remove(...HUMORES);
  av.classList.add(humor);
}

function escolherPerfil(perfil) {
  const radio = document.querySelector(`input[name="perfil"][value="${perfil}"]`);
  if (radio) radio.checked = true;
  const p = perfilEscolhido();
  elCargo.textContent = CARGOS[p];
  elCracha.classList.toggle('p-admin', p === 'admin');
  elCracha.classList.toggle('p-usuario', p !== 'admin');
}

function mostrarAviso(texto) {
  elAviso.textContent = texto;
  elAviso.className = 'aviso aviso-erro';
  elAviso.hidden = false;
}

/** Só aceita voltar para páginas internas conhecidas (evita redirecionamento aberto). */
function destinoDepoisDoLogin(usuario) {
  const comuns = ['controle-nc.html', 'historico.html', 'emails.html', 'localizador-awb.html'];
  const permitidas = usuario.perfil === 'admin'
    ? [...comuns, 'estatisticas.html', 'clientes.html', 'criar-conta.html', 'localizar.html', 'console.html', 'auditoria.html']
    : comuns;
  const volta = params.get('volta');
  return volta && permitidas.includes(volta) ? volta : Sessao.destino(usuario);
}

// Já logado (no app e no banco online)? Vai direto para a mesa.
const atual = Sessao.usuario();
(async () => {
  if (!atual) return;
  if (window.Nuvem?.configurado) {
    await Nuvem.pronto;   // o Nuvem lê o login guardado
    if (!Nuvem.ligado()) { Sessao.limpar(); return; }
  }
  location.replace(Sessao.destino(atual));
})();

document.querySelectorAll('input[name="perfil"]').forEach((radio) => {
  radio.addEventListener('change', () => { escolherPerfil(radio.value); helpyCara(radio.value === 'admin' ? 'piscando' : 'feliz'); });
});
escolherPerfil(params.get('perfil') === 'admin' ? 'admin' : 'usuario');

if (params.get('motivo') === 'expirou') mostrarAviso('Sua sessão terminou. Entre novamente para continuar.');
if (params.get('motivo') === 'conectar') mostrarAviso('O M-Utility agora usa o banco online. Entre de novo (com o seu e-mail) para conectar este computador.');

/**
 * Banco online: o Supabase confere o e-mail e a senha; depois o app sincroniza e abre a sessão.
 * Sem internet, entra com a senha guardada neste computador (a do último login online).
 */
async function entrarComNuvem(entrada, senha) {
  let email = entrada;
  if (!entrada.includes('@')) {
    const r = await API.emailDoUsuario(entrada);
    email = r.dados?.email || '';
    if (!email) return { ok: false, dados: { erro: 'Use o seu e-mail para entrar (o nome de usuário só funciona depois do primeiro login neste computador).' } };
  }
  const n = await Nuvem.entrar(email, senha);
  if (n.erro === 'senha') return { ok: false, dados: { erro: 'Usuário ou senha incorretos.' } };
  if (n.erro === 'offline') return API.login(email, senha);   // sem internet: a senha deste computador
  if (n.erro) return { ok: false, dados: { erro: `O banco online recusou: ${n.erro}` } };
  elBotao.textContent = 'Sincronizando…';
  await Nuvem.sincronizar();
  return API.loginConfiado(email, senha);
}

// O Helpy fecha um olho enquanto a senha é digitada
elEmail.addEventListener('focus', () => helpyCara('pensando'));
elSenha.addEventListener('focus', () => helpyCara('piscando'));
elSenha.addEventListener('blur', () => helpyCara('feliz'));

document.querySelectorAll('.ver-senha').forEach((botao) => {
  botao.addEventListener('click', () => {
    const campo = document.getElementById(botao.dataset.alvo);
    const mostrando = campo.type === 'text';
    campo.type = mostrando ? 'password' : 'text';
    botao.textContent = mostrando ? 'Mostrar' : 'Ocultar';
    botao.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
  });
});

elForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  elAviso.hidden = true;
  const email = elEmail.value.trim();
  const senha = elSenha.value;
  if (!email || !senha) {
    mostrarAviso('Informe o usuário (ou e-mail) e a senha.');
    helpyCara('pensando');
    return;
  }

  elBotao.disabled = true;
  elBotao.textContent = 'Entrando…';
  try {
    const { ok, dados } = window.Nuvem?.configurado ? await entrarComNuvem(email, senha) : await API.login(email, senha);
    if (!ok) {
      mostrarAviso(dados.erro || 'Não foi possível entrar.');
      helpyCara('triste');
      return;
    }
    if (dados.usuario.perfil !== perfilEscolhido()) {
      mostrarAviso(dados.usuario.perfil === 'admin'
        ? 'Esta é uma conta de administrador. Selecione “Administrador” para entrar.'
        : 'Esta conta não é de administrador. Selecione “Usuário” para entrar.');
      helpyCara('desconfiado');
      return;
    }
    helpyCara('comemorando');
    Sessao.salvar(dados, elLembrar.checked);
    location.href = destinoDepoisDoLogin(dados.usuario);
  } finally {
    elBotao.disabled = false;
    elBotao.textContent = 'Entrar';
  }
});
