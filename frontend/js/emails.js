/* =========================================================
   emails.js — página Enviar E-mail
   Esquerda: os clientes com tickets em "Enviar e-mail".
   Centro: o cliente escolhido, com a tabela de #ID até STATUS,
   Copiar tabela e Marcar como E-mail enviado.
   Direita: o Helpy guiando cada passo.
   ========================================================= */

const usuario = Sessao.exigir(['usuario', 'admin']);
const esc = TicketUI.esc;
const elLista = document.getElementById('listaClientes');
const elPainel = document.getElementById('painelEmail');
const elOffline = document.getElementById('avisoOffline');

document.getElementById('helpyAvatar').outerHTML = Helpy.avatar('acenando');
const helpy = new Helpy(document.getElementById('helpyRaiz'), document.getElementById('helpyFeed'), { balao: true });
if (usuario) helpy.viver({ nome: esc(Helpy.apelido(usuario.nome)), id: usuario.id });
const escritorio = Escritorio.montar();

let volumes = [];
// Score do setor NC na lateral (js/placar.js)
const placar = Placar.montar({ volumes: () => volumes });
let cliente = new URLSearchParams(location.search).get('cliente');   // nome aberto
const marcados = new Set();
let copiou = false;
let falou = false;

const paraEmail = () => volumes.filter((v) => v.status === 'enviar-email' && !Catalogo.saiu(v));
const nomeCliente = (v) => v.cliente_nome || 'Sem cliente';
const doCliente = () => paraEmail().filter((v) => nomeCliente(v) === cliente).sort((a, b) => (a.ciclo || '').localeCompare(b.ciclo || '') || (a.id_ciclo ?? a.numero) - (b.id_ciclo ?? b.numero));
const selecionados = () => doCliente().filter((v) => marcados.has(v.numero));
const diasTexto = (d) => (d ? `há ${d} dia${d > 1 ? 's' : ''}` : 'hoje');

function grupos() {
  const g = new Map();
  paraEmail().forEach((v) => {
    const k = nomeCliente(v);
    if (!g.has(k)) g.set(k, { nome: k, cor: v.cliente_cor || '#A39A7C', cnpj: v.cnpj || '', lista: [] });
    g.get(k).lista.push(v);
  });
  return [...g.values()].map((x) => ({ ...x, antigo: Math.max(...x.lista.map((v) => Catalogo.dias(v))) }))
    .sort((a, b) => b.antigo - a.antigo || b.lista.length - a.lista.length || a.nome.localeCompare(b.nome));
}

function abrir(nome, { falar = true } = {}) {
  const mudou = nome !== cliente;
  cliente = nome;
  if (mudou || !marcados.size) { marcados.clear(); copiou = false; if (nome) doCliente().forEach((v) => marcados.add(v.numero)); }
  try { history.replaceState(null, '', location.pathname + (nome ? `?cliente=${encodeURIComponent(nome)}` : '')); } catch { /* só lembra o cliente no endereço */ }
  renderizar();
  if (falar && mudou && nome) {
    const n = doCliente().length;
    helpy.limpar();
    helpy.dizer(`<p><strong>${esc(nome)}</strong>: ${n} ticket${n > 1 ? 's' : ''} para avisar.</p><p>Copie a tabela e cole no corpo do e-mail.</p>`, { humor: 'feliz', atraso: 200 });
  }
}

function lista(gs) {
  elLista.innerHTML = `
    <span class="email-lista-rotulo">Clientes</span>
    ${gs.map((x, i) => `
      <button type="button" class="email-item ${x.nome === cliente ? 'ativo' : ''}" data-cliente="${encodeURIComponent(x.nome)}" style="--cor:${x.cor}; --cor-tinta:${Catalogo.tintaPara(x.cor)}; --i:${i}" ${x.nome === cliente ? 'aria-current="true"' : ''}>
        <span class="email-item-cor" aria-hidden="true"></span>
        <span class="email-item-txt"><strong title="${esc(x.nome)}">${esc(x.nome)}</strong><small>${ic('relogio')} ${diasTexto(x.antigo)}</small></span>
        <span class="email-item-qtd">${x.lista.length}</span>
      </button>`).join('')}`;
}

function painel(g) {
  const n = selecionados().length;
  const total = g.lista.length;
  elPainel.innerHTML = `
    <header class="email-cab" style="--cor:${g.cor}">
      <span class="email-cab-cor" aria-hidden="true"></span>
      <div class="email-cab-txt">
        <h3>${esc(g.nome)}</h3>
        <span>${g.cnpj ? `<span class="tk-mono">${esc(Catalogo.formatarCnpj(g.cnpj))}</span> · ` : ''}${total} ticket${total > 1 ? 's' : ''} · mais antigo ${diasTexto(g.antigo)}</span>
      </div>
      <ol class="email-passos" aria-label="Passos">
        <li class="${copiou ? 'feito' : 'atual'}"><b>1</b> Copiar</li>
        <li class="${copiou ? 'atual' : ''}"><b>2</b> Enviar</li>
        <li><b>3</b> Marcar</li>
      </ol>
    </header>
    <div class="email-acoes">
      <span class="email-sel">${n} de ${total} selecionado${total > 1 ? 's' : ''}</span>
      <button type="button" class="btn ${copiou ? '' : 'btn-primary'}" data-copiar ${n ? '' : 'disabled'} title="Copia a tabela (com cabeçalho) para colar no e-mail">${ic('copiar')} Copiar tabela</button>
      <button type="button" class="btn ${copiou ? 'btn-primary' : ''}" data-enviado ${n ? '' : 'disabled'}>${ic('enviar')} Marcar como enviado</button>
    </div>
    <div class="email-tabela-caixa">${Email.tabela(doCliente(), { colunas: Planilha.COLUNAS_EMAIL, marcados })}</div>`;
}

function renderizar() {
  const gs = grupos();
  if (cliente && !gs.some((g) => g.nome === cliente)) cliente = null;
  if (!cliente && gs.length) { cliente = gs[0].nome; marcados.clear(); copiou = false; doCliente().forEach((v) => marcados.add(v.numero)); }
  document.getElementById('areaEmail').classList.toggle('vazio', !gs.length);
  if (!gs.length) {
    elLista.innerHTML = '';
    elPainel.innerHTML = `<div class="mesa-vazia mesa-vazia-centro"><span class="mesa-vazia-ico">${ic('envelope')}</span>
      <strong>Nenhum e-mail pendente</strong>
      <a class="btn btn-primary" href="controle-nc.html">${ic('pacote')} Ir para o Controle NC</a></div>`;
    return;
  }
  lista(gs);
  painel(gs.find((x) => x.nome === cliente));
}

function atualizarAcoes() {
  const n = selecionados().length;
  const total = doCliente().length;
  const sel = elPainel.querySelector('.email-sel');
  if (sel) sel.textContent = `${n} de ${total} selecionado${total > 1 ? 's' : ''}`;
  elPainel.querySelectorAll('[data-copiar], [data-enviado]').forEach((b) => { b.disabled = !n; });
}

elLista.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cliente]');
  if (b) abrir(decodeURIComponent(b.dataset.cliente));
});
elPainel.addEventListener('change', (e) => { if (Email.aoMarcar(e, marcados, doCliente())) atualizarAcoes(); });
elPainel.addEventListener('click', async (e) => {
  if (e.target.closest('[data-copiar]')) {
    if (await Email.copiar(selecionados(), Planilha.COLUNAS_EMAIL, cliente)) {
      copiou = true;
      renderizar();
      helpy.limpar();
      helpy.dizer('<p>Tabela copiada! Cole no e-mail com <strong>Ctrl+V</strong>.</p><p>Depois de enviar, clique em <strong>Marcar como enviado</strong>.</p>', { humor: 'feliz', atraso: 150 });
    }
    return;
  }
  if (e.target.closest('[data-enviado]')) {
    const lista = selecionados();
    const nome = cliente;
    let n = 0;
    for (const v of lista) { const { ok } = await API.atualizarVolume(v.numero, { status: 'email-enviado' }); if (ok) n += 1; }
    API.registrarAcao('Marcou e-mail enviado', nome, lista.map((v) => v.codigo).join(', '));
    Efeitos.toast(`${n} ticket${n > 1 ? 's' : ''} de <b>${esc(nome)}</b> em E-mail enviado.`, { icone: ic('enviar'), tipo: 'sucesso' });
    await carregar();
    cliente = null;
    marcados.clear();
    renderizar();
    const restam = grupos().length;
    helpy.limpar();
    helpy.dizer(restam
      ? `<p>Pronto, <strong>${esc(nome)}</strong> foi avisado.</p><p>Faltam <strong>${restam}</strong> cliente${restam > 1 ? 's' : ''}.</p>`
      : '<p>Todos os e-mails foram enviados. Bom trabalho!</p>', { humor: 'comemorando', atraso: 150 });
  }
});

async function carregar() {
  const r = await API.volumes();
  if (!r.ok) { if (r.status === 401) Sessao.sair('expirou'); else elOffline.hidden = false; return; }
  elOffline.hidden = true;
  volumes = r.dados;
  placar.atualizar();
}

function boasVindas() {
  if (falou) return;
  falou = true;
  const gs = grupos();
  const total = paraEmail().length;
  if (!gs.length) {
    helpy.dizer(`<p>${helpy.oi(esc(Helpy.apelido(usuario.nome)))}</p><p>Nenhum e-mail pendente agora, tá tudo em dia! 🙌</p>`, { humor: 'acenando' });
    return;
  }
  helpy.dizer(`<p>${helpy.oi(esc(Helpy.apelido(usuario.nome)))}</p><p>Tem <strong>${total}</strong> ticket${total > 1 ? 's' : ''} de <strong>${gs.length}</strong> cliente${gs.length > 1 ? 's' : ''} para avisar.</p>
    <p>Comecei por <strong>${esc(cliente)}</strong>, o mais antigo. Escolha outro na lista quando quiser.</p>`, { humor: 'acenando' });
}

if (usuario) {
  Sessao.montarMenu(usuario);
  carregar().then(() => { renderizar(); boasVindas(); });
  addEventListener('storage', (e) => { if (e.key === Banco.CHAVE) carregar().then(renderizar); });
}
