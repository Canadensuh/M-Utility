/* =========================================================
   console.js — Console do administrador
   O console que existia no M-Utility original, agora para
   consultar e mexer no setor NC por texto. Tudo o que muda
   dados passa pela mesma API (e entra na auditoria).
   ========================================================= */

const usuario = Sessao.exigir(['admin']);
const elSaida = document.getElementById('saida');
const elForm = document.getElementById('formConsole');
const elComando = document.getElementById('comando');
const elArquivo = document.getElementById('arquivoImportar');

const historico = [];
let posHistorico = 0;

// ---------- DROP: confirmação com código de 6 dígitos ----------
const CODIGO_DROP = '010918';
const elDrop = document.getElementById('modalDrop');
const digitosDrop = [...document.querySelectorAll('#digitosDrop input')];
const elConfirmarDrop = document.getElementById('confirmarDrop');
const elErroDrop = document.getElementById('erroDrop');
const codigoDigitado = () => digitosDrop.map((i) => i.value).join('');

function pedirCodigoDrop(total) {
  return new Promise((resolver) => {
    document.getElementById('textoDrop').innerHTML = `Apaga <b>${total}</b> ticket${total === 1 ? '' : 's'} sem volta. Digite o código de segurança.`;
    digitosDrop.forEach((i) => { i.value = ''; i.classList.remove('preenchido'); });
    elErroDrop.hidden = true;
    elConfirmarDrop.disabled = true;
    const fim = (ok) => {
      elDrop.removeEventListener('close', aoFechar);
      elConfirmarDrop.removeEventListener('click', aoConfirmar);
      if (elDrop.open) elDrop.close();
      elComando.focus();
      resolver(ok);
    };
    const aoFechar = () => fim(false);
    const aoConfirmar = () => {
      if (codigoDigitado() !== CODIGO_DROP) {
        elErroDrop.hidden = false;
        elDrop.querySelector('.drop-digitos').classList.remove('tremer');
        void elDrop.offsetWidth;
        elDrop.querySelector('.drop-digitos').classList.add('tremer');
        digitosDrop.forEach((i) => { i.value = ''; i.classList.remove('preenchido'); });
        elConfirmarDrop.disabled = true;
        digitosDrop[0].focus();
        return;
      }
      fim(true);
    };
    elDrop.addEventListener('close', aoFechar);
    elConfirmarDrop.addEventListener('click', aoConfirmar);
    elDrop.showModal();
    setTimeout(() => digitosDrop[0].focus(), 30);
  });
}

digitosDrop.forEach((input, i) => {
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '');
    if (d.length > 1) {   // colou o código inteiro
      [...d.slice(0, 6 - i)].forEach((c, j) => { digitosDrop[i + j].value = c; digitosDrop[i + j].classList.add('preenchido'); });
      digitosDrop[Math.min(5, i + d.length - 1)].focus();
    } else {
      input.value = d;
      input.classList.toggle('preenchido', !!d);
      if (d && i < 5) digitosDrop[i + 1].focus();
    }
    elErroDrop.hidden = true;
    elConfirmarDrop.disabled = codigoDigitado().length !== 6;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && i > 0) { digitosDrop[i - 1].value = ''; digitosDrop[i - 1].classList.remove('preenchido'); digitosDrop[i - 1].focus(); elConfirmarDrop.disabled = true; e.preventDefault(); }
    if (e.key === 'ArrowLeft' && i > 0) { digitosDrop[i - 1].focus(); e.preventDefault(); }
    if (e.key === 'ArrowRight' && i < 5) { digitosDrop[i + 1].focus(); e.preventDefault(); }
    if (e.key === 'Enter') { e.preventDefault(); if (!elConfirmarDrop.disabled) elConfirmarDrop.click(); }
  });
});
document.getElementById('cancelarDrop').addEventListener('click', () => elDrop.close());

const esc = (t) => escaparHtml(String(t ?? ''));
function escrever(texto, classe = '') {
  const linha = document.createElement('div');
  if (classe) linha.className = classe;
  linha.innerHTML = texto;
  elSaida.appendChild(linha);
  elSaida.scrollTop = elSaida.scrollHeight;
}
const erro = (t) => escrever(esc(t), 'c-erro');
const fraco = (t) => escrever(esc(t), 'c-fraco');

async function volumes() {
  const { ok, dados } = await API.volumes();
  return ok ? dados : [];
}
function linhaVolume(v) {
  const prazo = Catalogo.prazo(v);
  return `${v.codigo.padEnd(6)} ${v.tipo_titulo.padEnd(22)} ${v.status_titulo.padEnd(30)} ${v.local_titulo.padEnd(16)} ${String(Catalogo.dias(v)).padStart(3)}d${prazo === 'vencido' ? '  VENCIDO' : prazo === 'atencao' ? '  atenção' : ''}${v.cliente_nome ? `  · ${v.cliente_nome}` : ''}`;
}
/** "#045" é o #ID do mês: acha a chave interna (o do mês atual tem preferência sobre um que veio do mês anterior). */
async function numeroDe(arg) {
  const n = Number(String(arg || "").replace(/^#/, ""));
  const lista = (await volumes()).filter((v) => (v.id_ciclo ?? v.numero) === n).sort((a, b) => Number(a.anterior) - Number(b.anterior));
  return lista[0]?.numero ?? -1;
}
const opcoes = (lista) => lista.map((x) => x.id).join(' | ');

const COMANDOS = {
  help: {
    desc: 'lista os comandos',
    fn() {
      Object.entries(COMANDOS).forEach(([nome, c]) => escrever(`<span class="c-prompt">${nome.padEnd(10)}</span> ${esc(c.uso ? `${c.uso} — ` : '')}${esc(c.desc)}`));
    },
  },
  nextid: {
    uso: 'nextid [n]', desc: 'mostra ou define o próximo #ID',
    async fn([n]) {
      if (!n) {
        const { ok, dados } = await API.proximoId();
        if (!ok) { erro(dados.erro); return; }
        escrever(`o próximo volume será o <b>${esc(Catalogo.codigo(dados.proximo))}</b>.`);
        return;
      }
      const numero = Number(String(n).replace(/\D/g, ''));
      const { ok, dados } = await API.definirProximoId(numero);
      if (!ok) { erro(dados.erro); return; }
      escrever(`ok: o próximo volume será o <b>${esc(Catalogo.codigo(numero))}</b>.`);
    },
  },
  list: {
    uso: 'list [busca]', desc: 'volumes no setor (com busca: todo o histórico)',
    async fn(args) {
      const termo = args.join(' ');
      const lista = (await volumes()).filter((v) => (termo ? Busca.volume(v, termo) : !Catalogo.saiu(v)));
      if (!lista.length) { fraco('nenhum volume.'); return; }
      lista.forEach((v) => escrever(esc(linhaVolume(v))));
      fraco(`${lista.length} volume(s).`);
    },
  },
  show: {
    uso: 'show <id>', desc: 'dados de um volume',
    async fn([id]) {
      const { ok, dados } = await API.volume(await numeroDe(id));
      if (!ok) { erro(dados.erro); return; }
      Planilha.COLUNAS.forEach((c) => escrever(`${esc(c.titulo.padEnd(16))} ${esc(c.valor(dados) || '—')}`));
      (dados.historico || []).forEach((h) => fraco(`  ${new Date(h.em).toLocaleString('pt-BR')} · ${h.por} · ${h.texto}`));
    },
  },
  status: {
    uso: 'status <id> <status> [awb]', desc: `muda o status (${opcoes(Catalogo.status)})`,
    async fn([id, status, awb]) {
      const campos = { status };
      if (awb) campos.awb = awb;
      const { ok, dados } = await API.atualizarVolume(await numeroDe(id), campos);
      if (!ok) { erro(dados.erro); return; }
      escrever(`ok: ${esc(dados.codigo)} agora está como <b>${esc(dados.status_titulo)}</b>${dados.data_saida ? ` (saiu ${new Date(dados.data_saida).toLocaleString('pt-BR')})` : ''}.`);
    },
  },
  awb: {
    uso: 'awb <id> <código>', desc: 'registra a AWB',
    async fn([id, codigo]) {
      const { ok, dados } = await API.atualizarVolume(await numeroDe(id), { awb: codigo || '' });
      if (!ok) { erro(dados.erro); return; }
      escrever(`ok: AWB de ${esc(dados.codigo)} = <b>${esc(dados.awb || '—')}</b>.`);
    },
  },
  move: {
    uso: 'move <id> <local>', desc: `muda o local (${opcoes(Catalogo.locais)})`,
    async fn([id, local]) {
      const { ok, dados } = await API.atualizarVolume(await numeroDe(id), { local });
      if (!ok) { erro(dados.erro); return; }
      escrever(`ok: ${esc(dados.codigo)} está em <b>${esc(dados.local_titulo)}</b>.`);
    },
  },
  overdue: {
    desc: `prazo de ${Catalogo.PRAZO_DIAS} dias vencido`,
    async fn() {
      const lista = (await volumes()).filter((v) => Catalogo.prazo(v) === 'vencido');
      if (!lista.length) { escrever('nenhum vencido. 👍'); return; }
      lista.forEach((v) => escrever(esc(linhaVolume(v)), 'c-erro'));
    },
  },
  emails: {
    desc: 'volumes em Enviar e-mail',
    async fn() {
      const lista = (await volumes()).filter((v) => !Catalogo.saiu(v) && v.status === 'enviar-email');
      if (!lista.length) { escrever('nenhum e-mail pendente.'); return; }
      lista.forEach((v) => escrever(esc(linhaVolume(v))));
    },
  },
  clients: {
    desc: 'clientes cadastrados',
    async fn() {
      const { dados } = await API.clientes();
      (dados || []).forEach((c) => escrever(`${esc(String(c.id).padStart(3))}  <span style="color:${esc(c.cor)}">■</span> ${esc(c.nome.padEnd(26))} ${esc(c.cnpj ? Catalogo.formatarCnpj(c.cnpj) : 'sem CNPJ')}`));
    },
  },
  audit: {
    uso: 'audit [n]', desc: 'últimas ações (padrão 15)',
    async fn([n]) {
      const { ok, dados } = await API.auditoria();
      if (!ok) { erro(dados.erro); return; }
      dados.slice(0, Number(n) || 15).forEach((a) => escrever(`${esc(new Date(a.em).toLocaleString('pt-BR'))}  <b>${esc(a.usuario)}</b> ${esc(a.acao)} ${esc(a.alvo || '')} <span class="c-fraco">${esc(a.detalhe || '')}</span>`));
    },
  },
  demo: {
    desc: 'insere 12 volumes de exemplo',
    async fn() {
      const { dados: clientes } = await API.clientes();
      const { ok, dados } = await API.importarVolumes(Demo.volumes(clientes || []));
      if (!ok) { erro(dados.erro); return; }
      escrever(`ok: ${dados.importados} volumes de exemplo inseridos. Veja no <a href="controle-nc.html" style="color:#E3C567">Controle NC</a>.`);
    },
  },
  export: {
    uso: 'export [csv|json]', desc: 'baixa o histórico (csv) ou o banco (json)',
    async fn([formato = 'csv']) {
      if (formato === 'json') {
        const { ok, dados } = await API.exportar();
        if (!ok) { erro(dados.erro); return; }
        Planilha.baixar(Planilha.nomeArquivo('mutility-banco', 'json'), JSON.stringify(dados, null, 2), 'application/json');
        escrever('ok: banco exportado em JSON.');
        return;
      }
      const lista = await volumes();
      Planilha.baixar(Planilha.nomeArquivo('mutility-historico-nc'), Planilha.csv(lista));
      await API.registrarAcao('Exportou o histórico (CSV) pelo console', '', `${lista.length} volume(s)`);
      escrever(`ok: ${lista.length} volume(s) em CSV.`);
    },
  },
  import: {
    desc: 'importa volumes de um JSON (acrescenta)',
    fn() {
      elArquivo.value = '';
      elArquivo.click();
      fraco('escolha o arquivo .json…');
    },
  },
  drop: {
    desc: 'apaga TODOS os tickets (código de 6 dígitos)',
    async fn() {
      const total = (await volumes()).length;
      if (!total) { fraco('nenhum ticket para apagar.'); return; }
      if (!(await pedirCodigoDrop(total))) { fraco('drop cancelado.'); return; }
      const { ok, dados } = await API.limparVolumes();
      if (!ok) { erro(dados.erro); return; }
      escrever(`ok: ${dados.removidos} ticket(s) apagado(s).`, 'c-erro');
    },
  },
  clear: { desc: 'limpa a tela', fn() { elSaida.innerHTML = ''; } },
  about: {
    desc: 'versão e créditos',
    fn() {
      escrever('M-Utility · Controle NC — utilitário logístico');
      escrever('Desenvolvido por <b>MPS</b> · MapleProjectSeries');
      fraco('Dados guardados neste navegador (localStorage).');
    },
  },
};

elArquivo.addEventListener('change', async () => {
  const arquivo = elArquivo.files[0];
  if (!arquivo) return;
  try {
    const json = JSON.parse(await arquivo.text());
    const lista = Array.isArray(json) ? json : json.volumes;
    const { ok, dados } = await API.importarVolumes(lista);
    if (!ok) { erro(dados.erro); return; }
    escrever(`ok: ${dados.importados} volume(s) importado(s) de ${esc(arquivo.name)}.`);
  } catch {
    erro('não consegui ler esse arquivo como JSON.');
  }
});

elForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const linha = elComando.value.trim();
  if (!linha) return;
  historico.push(linha);
  posHistorico = historico.length;
  elComando.value = '';
  escrever(`<span class="c-prompt">$</span> ${esc(linha)}`);
  const [nome, ...args] = linha.split(/\s+/);
  const comando = COMANDOS[nome.toLowerCase()];
  if (!comando) { erro(`comando não reconhecido: ${nome}. Digite "help".`); return; }
  try { await comando.fn(args); } catch (falha) { console.error(falha); erro('falhou: veja o console do navegador.'); }
});

elComando.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' && posHistorico > 0) { posHistorico -= 1; elComando.value = historico[posHistorico]; e.preventDefault(); }
  if (e.key === 'ArrowDown') { posHistorico = Math.min(historico.length, posHistorico + 1); elComando.value = historico[posHistorico] || ''; e.preventDefault(); }
});

if (usuario) {
  Sessao.montarMenu(usuario);
  escrever('M-Utility Console v6.0');
  escrever(`Olá, ${esc(usuario.nome)}. Digite <span class="c-prompt">help</span> para ver os comandos.`);
  elComando.focus();
}
