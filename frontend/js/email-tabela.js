/* =========================================================
   email-tabela.js — a tabela que vai no corpo do e-mail
   Usada na Minha Mesa (tickets selecionados, todas as colunas)
   e na página Enviar E-mail (por cliente, de #ID até STATUS).
   ========================================================= */

const Email = {
  /** Tabela com caixinhas (todas marcadas no começo). colunas = Planilha.COLUNAS ou Planilha.COLUNAS_EMAIL */
  tabela(lista, { colunas, marcados }) {
    const esc = TicketUI.esc;
    const todos = lista.length && lista.every((v) => marcados.has(v.numero));
    return `
      <div class="tabela-rolagem">
        <table class="tabela-papel tabela-mesa tabela-email">
          <thead><tr>
            <th scope="col" class="col-caixa"><label class="email-caixa" title="Selecionar todos"><input type="checkbox" data-email-todos ${todos ? 'checked' : ''} aria-label="Selecionar todos" /></label></th>
            ${colunas.map((c) => `<th scope="col">${c.titulo}</th>`).join('')}
          </tr></thead>
          <tbody>${lista.map((v) => `
            <tr class="${marcados.has(v.numero) ? '' : 'desmarcada'}">
              <td class="col-caixa"><label class="email-caixa"><input type="checkbox" data-email-marcar="${v.numero}" ${marcados.has(v.numero) ? 'checked' : ''} aria-label="Selecionar ${esc(v.codigo)}" /></label></td>
              ${colunas.map((c) => {
                const valor = esc(c.valor(v));
                if (c.titulo === 'STATUS') return `<td class="quebra"><span class="tag ${classeStatus(v.status)}">${valor}</span></td>`;
                if (c.titulo === '#ID') return `<td><b>${valor}</b>${TicketUI.marcaMes(v)}</td>`;
                if (c.titulo === 'CNPJ') return `<td>${valor.replace('/', '/<wbr>') || '—'}</td>`;
                return `<td class="${c.titulo.startsWith('DANFE') ? 'mono' : ['CLIENTE', 'TIPO DE NC'].includes(c.titulo) ? 'quebra' : ''}">${valor || '—'}</td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  /** Caixinha mudou: atualiza o conjunto e a tela. Devolve true se era uma caixinha da tabela. */
  aoMarcar(e, marcados, lista) {
    const um = e.target.closest('[data-email-marcar]');
    const todos = e.target.closest('[data-email-todos]');
    if (!um && !todos) return false;
    if (um) { if (um.checked) marcados.add(Number(um.dataset.emailMarcar)); else marcados.delete(Number(um.dataset.emailMarcar)); }
    if (todos) {
      lista.forEach((v) => (todos.checked ? marcados.add(v.numero) : marcados.delete(v.numero)));
      document.querySelectorAll('[data-email-marcar]').forEach((c) => { c.checked = todos.checked; });
    }
    document.querySelectorAll('[data-email-marcar]').forEach((c) => c.closest('tr').classList.toggle('desmarcada', !c.checked));
    const caixaTodos = document.querySelector('[data-email-todos]');
    if (caixaTodos) caixaTodos.checked = lista.length > 0 && lista.every((v) => marcados.has(v.numero));
    return true;
  },

  /** Copia com cabeçalho e bordas, para colar no corpo do e-mail. */
  async copiar(lista, colunas, rotulo) {
    const esc = TicketUI.esc;
    if (!lista.length) return false;
    try {
      await Planilha.copiar(lista, { cabecalho: true, email: true, colunas });
      API.registrarAcao('Copiou a tabela do e-mail', rotulo, `${lista.length} ticket(s)`);
      Efeitos.toast(`Tabela copiada (${lista.length} ticket${lista.length > 1 ? 's' : ''}). Cole no corpo do e-mail com Ctrl+V.`, { icone: ic('copiar'), tipo: 'sucesso', duracao: 6000 });
      return true;
    } catch {
      Efeitos.toast('O navegador não deixou copiar. Tente de novo.', { icone: ic('alerta'), tipo: 'alerta' });
      return false;
    }
  },
};

window.Email = Email;
