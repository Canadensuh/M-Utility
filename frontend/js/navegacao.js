/* =========================================================
   navegacao.js — trilho lateral com as abas do M-Utility
   Fica no canto esquerdo (de cima a baixo) e muda conforme
   o perfil. Passando o mouse, ele abre e mostra os nomes.
   Montado por Sessao.montarMenu() em todas as telas logadas.
   ========================================================= */

const Navegacao = {
  COMUNS: [
    { href: 'controle-nc.html', ic: 'pacote', rotulo: 'Controle NC', desc: 'Volumes no setor NC' },
    { href: 'historico.html', ic: 'arquivo', rotulo: 'Histórico de Tickets', desc: 'Entradas e saídas' },
    { href: 'emails.html', ic: 'envelope', rotulo: 'Enviar E-mail', desc: 'Tickets por cliente' },
  ],
  // Outros utilitários do M-Utility (fora do setor NC), para todos os perfis
  UTILITARIOS: [
    { href: 'localizador-awb.html', ic: 'localizador', rotulo: 'Localizador de AWB', desc: 'Separação por lista' },
  ],
  ADMIN: [
    { href: 'estatisticas.html', ic: 'grafico', rotulo: 'Estatísticas', desc: 'Números do setor' },
    { href: 'clientes.html', ic: 'predio', rotulo: 'Clientes', desc: 'Nome, CNPJ e cor' },
    { href: 'criar-conta.html', ic: 'cracha', rotulo: 'Crachás', desc: 'Contas e perfis' },
    { href: 'localizar.html', ic: 'pastas', rotulo: 'Localizar', desc: 'Meses e arquivos' },
    { href: 'console.html', ic: 'terminal', rotulo: 'Console', desc: 'Comandos de texto' },
    { href: 'auditoria.html', ic: 'olho', rotulo: 'Registro de Auditoria', desc: 'Quem fez o quê' },
  ],

  itens(usuario) {
    return usuario.perfil === 'admin' ? [...this.COMUNS, ...this.ADMIN] : this.COMUNS;
  },

  /** Um item do trilho. */
  _item(i, atual) {
    const ativo = i.href === atual;
    return `<li><a href="${i.href}" class="trilho-item ${ativo ? 'ativo' : ''}" ${ativo ? 'aria-current="page"' : ''} title="${i.rotulo}">
      <span class="trilho-ico"><i class="ic ic-${i.ic}" aria-hidden="true"></i></span>
      <span class="trilho-rotulo"><strong>${i.rotulo}</strong><small>${i.desc}</small></span>
    </a></li>`;
  },

  montar(usuario) {
    if (document.querySelector('.trilho')) return;
    const itens = this.itens(usuario);
    const atual = location.pathname.split('/').pop() || 'index.html';
    const nav = document.createElement('nav');
    nav.className = 'trilho';
    nav.setAttribute('aria-label', 'Navegação do M-Utility');
    nav.innerHTML = `
      <a href="${Sessao.destino(usuario)}" class="trilho-marca" title="M-Utility — início"><img src="assets/logo.png" alt="" /><span class="trilho-rotulo">M-<b>Utility</b></span></a>
      <ul>
        ${itens.map((i) => this._item(i, atual)).join('')}
        <li class="trilho-sep" role="separator"><span class="trilho-rotulo">Utilitários</span></li>
        ${this.UTILITARIOS.map((i) => this._item(i, atual)).join('')}
      </ul>
      <button type="button" class="trilho-item trilho-sair" data-trilho-sair title="Sair da conta">
        <span class="trilho-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg></span>
        <span class="trilho-rotulo"><strong>Sair</strong><small>Deslogar desta conta</small></span>
      </button>`;
    nav.querySelector('[data-trilho-sair]').addEventListener('click', () => Sessao.sair());
    document.body.prepend(nav);
    document.body.classList.add('com-trilho');
  },
};

window.Navegacao = Navegacao;

/* Fade no topo da rolagem: quando a área desce, o conteúdo some aos
   poucos embaixo dos títulos (em vez de um corte seco). */
(() => {
  const AREAS = '.tampo .palco, .tampo .grade-rolagem, .email-tabela-caixa, .email-lista, .console-saida, .placar-corpo, .seq-lista';
  const marcar = (el) => el.classList.toggle('rolado', el.scrollTop > 2);
  document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (el instanceof Element && el.matches(AREAS)) marcar(el);
  }, true);
})();
