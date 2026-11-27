/* =========================================================
   auditoria.js — Registro de Auditoria (administrador)
   Histórico de ações: login, volumes inseridos/alterados/
   excluídos, crachás, clientes, exportações e console.
   ========================================================= */

const usuario = Sessao.exigir(['admin']);
const esc = TicketUI.esc;
const elArea = document.getElementById('area');
const elBusca = document.getElementById('busca');
const elUsuario = document.getElementById('filtroUsuario');
const elAcao = document.getElementById('filtroAcao');
const elPeriodo = document.getElementById('filtroPeriodo');
const elOffline = document.getElementById('avisoOffline');
const LIMITE_TELA = 500;

let registros = [];

function montarFiltros() {
  const manter = (el, html) => { const v = el.value; el.innerHTML = html; el.value = v; };
  const pessoas = [...new Map(registros.map((r) => [`${r.usuario_id}`, `${r.usuario}${r.perfil === 'admin' ? ' (admin)' : r.perfil ? ' (usuário)' : ''}`])).entries()];
  manter(elUsuario, `<option value="">Todos os usuários</option>${pessoas.map(([id, nome]) => `<option value="${esc(id)}">${esc(nome)}</option>`).join('')}`);
  manter(elAcao, TicketUI.opcoes(registros.map((r) => r.acao), 'Todas as ações'));
}

function filtrados() {
  const termo = Busca.normalizar(elBusca.value);
  const dias = Number(elPeriodo.value);
  const inicio = dias ? new Date(new Date().setHours(0, 0, 0, 0) - (dias - 1) * 86400000) : null;
  return registros.filter((r) => {
    if (elUsuario.value && String(r.usuario_id) !== elUsuario.value) return false;
    if (elAcao.value && r.acao !== elAcao.value) return false;
    if (inicio && new Date(r.em) < inicio) return false;
    return !termo || Busca.normalizar(`${r.acao} ${r.alvo} ${r.detalhe} ${r.usuario}`).includes(termo);
  });
}

function renderizar() {
  const lista = filtrados();
  if (!lista.length) {
    elArea.innerHTML = `<p class="cartao-vazio">${registros.length ? 'Nada encontrado com esses filtros.' : 'Nenhuma ação registrada ainda.'}</p>`;
    return;
  }
  const volumeLink = (alvo) => {
    const m = /^#(\d+)$/.exec(alvo || '');
    return m ? `<a href="controle-nc.html#volume-${Number(m[1])}"><b>${esc(alvo)}</b></a>` : esc(alvo || '');
  };
  elArea.innerHTML = `
    <div class="tabela-rolagem">
      <table class="tabela-papel">
        <thead><tr><th scope="col">Quando</th><th scope="col">Quem</th><th scope="col">Ação</th><th scope="col">Alvo</th><th scope="col">Detalhe</th></tr></thead>
        <tbody>${lista.slice(0, LIMITE_TELA).map((r) => `
          <tr>
            <td><time datetime="${esc(r.em)}">${esc(new Date(r.em).toLocaleString('pt-BR'))}</time></td>
            <td>${Avatar.html({ perfil: r.perfil || 'usuario' }, 'aud-avatar')} ${esc(r.usuario)}</td>
            <td>${esc(r.acao)}</td>
            <td>${volumeLink(r.alvo)}</td>
            <td>${esc(r.detalhe || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${lista.length > LIMITE_TELA ? `<p class="cartao-vazio">Mostrando as ${LIMITE_TELA} mais recentes de ${lista.length}. Exporte o CSV para ver tudo.</p>` : ''}
    </div>`;
}

[elBusca, elUsuario, elAcao, elPeriodo].forEach((el) => el.addEventListener('input', renderizar));

document.getElementById('exportar').addEventListener('click', () => {
  const lista = filtrados();
  const celula = (t) => { const s = String(t ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = [['QUANDO', 'USUÁRIO', 'CARGO', 'AÇÃO', 'ALVO', 'DETALHE'],
    ...lista.map((r) => [new Date(r.em).toLocaleString('pt-BR'), r.usuario, r.perfil === 'admin' ? 'Administrador' : 'Usuário', r.acao, r.alvo, r.detalhe])];
  Planilha.baixar(Planilha.nomeArquivo('mutility-auditoria'), '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n'));
  Efeitos.toast(`${lista.length} registro(s) exportado(s).`, { icone: ic('download'), tipo: 'sucesso' });
});

async function carregar() {
  const { ok, status, dados } = await API.auditoria();
  if (!ok) {
    if (status === 401) Sessao.sair('expirou');
    else mostrarOffline(elOffline);
    return;
  }
  registros = dados;
  montarFiltros();
  renderizar();
}

addEventListener('storage', (e) => { if (e.key === Banco.CHAVE) carregar(); });

if (usuario) {
  Sessao.montarMenu(usuario);
  carregar();
}
