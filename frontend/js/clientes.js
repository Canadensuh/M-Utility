/* =========================================================
   clientes.js — cadastro de clientes (administrador)
   Nome, CNPJ (liga a DANFE bipada ao cliente) e a cor que pinta
   a faixa do ticket. A grade mostra um ticket de amostra por
   cliente; "Novo cliente" e o lápis abrem o MESMO pop-up
   (criar / editar).
   ========================================================= */

const usuario = Sessao.exigir(['admin']);
const esc = TicketUI.esc;
const elLista = document.getElementById('lista');
const elBusca = document.getElementById('busca');
const elOffline = document.getElementById('avisoOffline');
const elModal = document.getElementById('modalCliente');
const elForm = document.getElementById('formCliente');
const elErro = document.getElementById('erroCliente');

let clientes = [];
let volumes = [];
let editando = null;      // null = criando; senão o id do cliente

/** Volume de mentira para a amostra do ticket. */
function amostra(c) {
  return {
    numero: 0, codigo: '#000', tipo: 'duplicidade', tipo_titulo: 'Duplicidade', status: 'aguardando-entrega',
    status_titulo: 'Aguardando entrega realizada', local: 'pallet-fora', local_titulo: 'Pallet de fora', nf: '123456',
    cliente_nome: c.nome || 'Cliente', cliente_cor: c.cor, data_entrada: new Date().toISOString(), awb: '',
  };
}
const ticketAmostra = (c) => TicketUI.padrao(amostra(c), { clique: false });

const CHAVE_VISAO = 'mutility-clientes-visao';
let visao = (() => { try { return localStorage.getItem(CHAVE_VISAO) === 'tabela' ? 'tabela' : 'cards'; } catch { return 'cards'; } })();

const doCliente = (c) => volumes.filter((v) => v.cliente_id === c.id);
const noSetor = (c) => doCliente(c).filter((v) => !Catalogo.saiu(v)).length;
const cnpjDe = (c) => (c.cnpj ? esc(Catalogo.formatarCnpj(c.cnpj)) : '<span class="cli-sem">sem CNPJ</span>');
const lapis = (c) => `<button type="button" class="btn key--icon cli-lapis" data-editar="${c.id}" title="Editar ${esc(c.nome)}" aria-label="Editar ${esc(c.nome)}">${ic('caneta')}</button>`;

function cartao(c, i) {
  const total = doCliente(c).length;
  const setor = noSetor(c);
  return `
    <article class="cli-card" style="--cor:${c.cor || '#A39A7C'}; --cor-tinta:${Catalogo.tintaPara(c.cor || '#A39A7C')}; --i:${i}">
      <span class="cli-faixa" aria-hidden="true"></span>
      <header class="cli-topo">
        <span class="cli-inicial" aria-hidden="true">${esc((c.nome || '?').trim().charAt(0).toUpperCase())}</span>
        <div class="cli-nome"><strong title="${esc(c.nome)}">${esc(c.nome)}</strong><span class="tk-mono">${cnpjDe(c)}</span></div>
        ${lapis(c)}
      </header>
      <dl class="cli-numeros">
        <div><dt>No setor</dt><dd>${setor}</dd></div>
        <div><dt>Total</dt><dd>${total}</dd></div>
      </dl>
    </article>`;
}

function tabela(lista) {
  return `
    <div class="tabela-rolagem">
      <table class="tabela-papel cli-tabela">
        <thead><tr><th scope="col">Cliente</th><th scope="col">CNPJ</th><th scope="col">Cor</th><th scope="col">No setor</th><th scope="col">Total</th><th scope="col"><span class="sr-only">Editar</span></th></tr></thead>
        <tbody>${lista.map((c) => `
          <tr>
            <td><b class="cliente-ponto" style="--cor:${c.cor || '#A39A7C'}"></b> <b>${esc(c.nome)}</b></td>
            <td class="mono">${cnpjDe(c)}</td>
            <td><span class="cli-cor" style="--cor:${c.cor || '#A39A7C'}"></span> <span class="mono">${esc((c.cor || '').toUpperCase())}</span></td>
            <td>${noSetor(c)}</td>
            <td>${doCliente(c).length}</td>
            <td class="cli-acao">${lapis(c)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderizar() {
  document.querySelectorAll('[data-visao]').forEach((b) => {
    const ativo = b.dataset.visao === visao;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-checked', String(ativo));
  });
  const termo = Busca.normalizar(elBusca.value);
  const lista = clientes.filter((c) => !termo || Busca.normalizar(`${c.nome} ${c.cnpj}`).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  if (!lista.length) {
    elLista.innerHTML = `<p class="cartao-vazio">${clientes.length ? 'Nenhum cliente com esse nome.' : 'Nenhum cliente cadastrado ainda.'}</p>`;
    return;
  }
  elLista.innerHTML = visao === 'tabela' ? tabela(lista) : `<div class="cli-grade">${lista.map(cartao).join('')}</div>`;
}

document.querySelectorAll('[data-visao]').forEach((b) => b.addEventListener('click', () => {
  visao = b.dataset.visao;
  try { localStorage.setItem(CHAVE_VISAO, visao); } catch { /* só lembra a escolha */ }
  renderizar();
}));

// ---------- Pop-up: criar e editar ----------
function abrirModal(c = null) {
  editando = c ? c.id : null;
  const dados = c || { nome: '', cnpj: '', cor: Catalogo.cores[clientes.length % Catalogo.cores.length] };
  document.getElementById('tituloModalCliente').innerHTML = c ? `${ic('caneta')} Editar cliente` : `${ic('mais')} Novo cliente`;
  elForm.elements.nome.value = dados.nome;
  elForm.elements.cnpj.value = dados.cnpj ? Catalogo.formatarCnpj(dados.cnpj) : '';
  elForm.elements.cor.value = dados.cor || '#6E9BC4';
  document.getElementById('coresCliente').innerHTML = Catalogo.cores.map((cor) =>
    `<button type="button" data-cor="${cor}" style="background:${cor}" class="${cor.toLowerCase() === (dados.cor || '').toLowerCase() ? 'ativo' : ''}" aria-label="Cor ${cor}"></button>`).join('');
  const qtd = c ? volumes.filter((v) => v.cliente_id === c.id).length : 0;
  document.getElementById('infoCliente').textContent = c ? `${qtd} volume${qtd === 1 ? '' : 's'} com este cliente` : '';
  document.getElementById('removerCliente').hidden = !c;
  document.getElementById('salvarCliente').innerHTML = `${ic('check')} ${c ? 'Salvar alterações' : 'Cadastrar'}`;
  elErro.hidden = true;
  atualizarAmostra();
  elModal.showModal();
  setTimeout(() => elForm.elements.nome.focus(), 30);
}

function atualizarAmostra() {
  const ul = document.getElementById('amostraCliente');
  ul.innerHTML = ticketAmostra({ nome: elForm.elements.nome.value.trim(), cor: elForm.elements.cor.value });
  TicketUI.alinharPicotes(ul);
}

elForm.addEventListener('input', (e) => {
  if (e.target.name === 'cor') document.querySelectorAll('#coresCliente [data-cor]').forEach((b) => b.classList.remove('ativo'));
  if (e.target.name === 'cnpj') {
    const d = Catalogo.somenteDigitos(e.target.value).slice(0, 14);
    if (d.length === 14) e.target.value = Catalogo.formatarCnpj(d);
  }
  atualizarAmostra();
});
elForm.addEventListener('click', (e) => {
  const botaoCor = e.target.closest('[data-cor]');
  if (!botaoCor) return;
  elForm.elements.cor.value = botaoCor.dataset.cor;
  document.querySelectorAll('#coresCliente [data-cor]').forEach((b) => b.classList.toggle('ativo', b === botaoCor));
  atualizarAmostra();
});

elForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.submitter?.value === 'cancelar') { elModal.close(); return; }
  const dados = Object.fromEntries(new FormData(elForm));
  const { ok, dados: resposta } = await API.salvarCliente({ ...(editando ? { id: editando } : {}), ...dados });
  if (!ok) { elErro.textContent = resposta.erro; elErro.hidden = false; return; }
  elModal.close();
  Efeitos.toast(`Cliente <strong>${esc(resposta.nome)}</strong> ${editando ? 'salvo' : 'cadastrado'}.`, { icone: ic('check'), tipo: 'sucesso' });
  carregar();
});

document.getElementById('removerCliente').addEventListener('click', async () => {
  const c = clientes.find((x) => x.id === editando);
  if (!c || !confirm(`Remover o cliente "${c.nome}"? Os volumes dele continuam com o nome no histórico, mas perdem a cor.`)) return;
  const { ok, dados } = await API.removerCliente(c.id);
  if (!ok) { elErro.textContent = dados.erro; elErro.hidden = false; return; }
  elModal.close();
  Efeitos.toast(`Cliente <strong>${esc(c.nome)}</strong> removido.`, { icone: ic('x') });
  carregar();
});

elLista.addEventListener('click', (e) => {
  const b = e.target.closest('[data-editar]');
  if (b) abrirModal(clientes.find((c) => c.id === Number(b.dataset.editar)));
});
document.getElementById('novoCliente').addEventListener('click', () => abrirModal());
elBusca.addEventListener('input', renderizar);

async function carregar() {
  const [rc, rv] = await Promise.all([API.clientes(), API.volumes()]);
  if (!rc.ok) {
    if (rc.status === 401) Sessao.sair('expirou');
    else mostrarOffline(elOffline);
    return;
  }
  clientes = rc.dados;
  volumes = rv.ok ? rv.dados : [];
  renderizar();
}

if (usuario) {
  Sessao.montarMenu(usuario);
  carregar();
}
