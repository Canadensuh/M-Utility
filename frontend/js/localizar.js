/* =========================================================
   localizar.js — Localizar (administrador)
   1) O mês aberto: fechar o ciclo, a pasta dos arquivos, salvar e restaurar.
   2) Consulta: importar as planilhas (CSV) ou backups dos meses anteriores
      e procurar tickets nelas. Só consulta: nada volta para a mesa.
   ========================================================= */

const usuario = Sessao.exigir(['admin']);
const esc = TicketUI.esc;
const elPainel = document.getElementById('cicloPainel');
const elLista = document.getElementById('listaConsulta');
const elMeses = document.getElementById('mesesCarregados');
const elFiltros = document.getElementById('filtrosConsulta');
const elBusca = document.getElementById('buscaConsulta');
const elMes = document.getElementById('filtroMes');
const elStatus = document.getElementById('filtroStatusConsulta');

let ciclo = null;
const carregados = new Map();   // nome do arquivo → { ciclo, titulo, tipo: 'csv'|'backup', volumes }

// ---------- 1) O mês aberto ----------
async function painelCiclo() {
  const r = await API.ciclo();
  if (!r.ok) { if (r.status === 401) Sessao.sair('expirou'); return; }
  ciclo = r.dados;
  const estado = await Arquivos.estado();
  const nomePasta = await Arquivos.nomePasta();
  const ultimo = Arquivos.ultimo();
  const pasta = {
    'sem-suporte': `<p>Os arquivos vão para <b>Downloads</b>. Use Edge ou Chrome para gravar na pasta.</p>`,
    'sem-pasta': `<p>Nenhuma pasta escolhida.</p>
      <button type="button" class="btn btn-primary btn-sm" data-acao="escolher">${ic('pastas')} Escolher pasta</button>`,
    permitir: `<p>Pasta <b>${esc(nomePasta)}</b> · acesso pendente.</p>
      <button type="button" class="btn btn-primary btn-sm" data-acao="permitir">${ic('check')} Permitir acesso à pasta</button>
      <button type="button" class="btn btn-sm" data-acao="escolher">${ic('pastas')} Trocar pasta</button>`,
    ok: `<p>Gravando em <b>${esc(nomePasta)}</b>${ultimo?.ok ? ` · salvo às ${ultimo.em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}.</p>
      <button type="button" class="btn btn-sm" data-acao="salvar">${ic('download')} Salvar agora</button>
      <button type="button" class="btn btn-sm" data-acao="escolher">${ic('pastas')} Trocar pasta</button>`,
  }[estado];
  const fechados = ciclo.fechados.slice(-3).reverse();
  elPainel.innerHTML = `
    <section class="ciclo-cartao ciclo-aberto">
      <span class="ciclo-rotulo">Mês aberto</span>
      <strong class="ciclo-mes">${esc(ciclo.nome)} <small>${esc(ciclo.titulo.split('/')[1])}</small></strong>
      <p>${ciclo.volumes} volume${ciclo.volumes === 1 ? '' : 's'} deste mês · próximo <b>${Catalogo.codigo(ciclo.proximo)}</b>
        ${ciclo.anteriores ? `<br>${ic('relogio')} ${ciclo.anteriores} de meses anteriores` : ''}</p>
      ${ciclo.pendente ? `<p class="aviso">${ic('alerta')} Já estamos em <b>${esc(Catalogo.nomeMes(ciclo.mes_atual))}</b>: feche ${esc(ciclo.titulo)}.</p>` : ''}
    </section>
    <section class="ciclo-cartao">
      <span class="ciclo-rotulo">Pasta dos arquivos</span>
      <strong class="ciclo-arquivo">${esc(Catalogo.nomeArquivoCiclo(ciclo.id))}<small>.csv · .backup.json</small></strong>
      ${pasta}
      <button type="button" class="btn btn-ghost btn-sm" data-acao="restaurar" title="Volta o mês aberto a partir de um .backup.json (ex.: o navegador foi limpo)">${ic('atualizar')} Restaurar backup</button>
    </section>
    <section class="ciclo-cartao ciclo-fechar">
      <span class="ciclo-rotulo">Fechar o ciclo</span>
      <p>Arquiva <b>${esc(ciclo.titulo)}</b>. Volumes no setor seguem com o mesmo #ID; a numeração volta ao <b>#001</b>.</p>
      <button type="button" class="btn key--red btn-sm" data-acao="fechar">${ic('arquivo')} Fechar ${esc(ciclo.titulo)}</button>
      ${fechados.length ? `<small class="ciclo-historico">Fechados: ${fechados.map((f) => `${esc(Catalogo.tituloCiclo(f.id))} (${f.volumes})`).join(' · ')}</small>` : ''}
    </section>`;
  document.getElementById('carregarPasta').hidden = estado !== 'ok';
}

elPainel.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const acao = b.dataset.acao;
  try {
    if (acao === 'escolher') {
      const nome = await Arquivos.escolherPasta();
      Efeitos.toast(`Pasta <b>${esc(nome)}</b> escolhida. Os arquivos do mês já estão lá.`, { icone: ic('check'), tipo: 'sucesso' });
    }
    if (acao === 'permitir') {
      if (await Arquivos.permitir()) Efeitos.toast('Acesso liberado: voltei a gravar na pasta.', { icone: ic('check'), tipo: 'sucesso' });
    }
    if (acao === 'salvar') {
      if (await Arquivos.salvarAgora()) Efeitos.toast('Arquivos do mês salvos na pasta.', { icone: ic('download'), tipo: 'sucesso' });
    }
    if (acao === 'restaurar') document.getElementById('arquivoRestaurar').click();
    if (acao === 'fechar') await fechar();
  } catch (erro) {
    if (erro?.name !== 'AbortError') Efeitos.toast(esc(erro.message || 'Não deu certo.'), { icone: ic('alerta'), tipo: 'alerta' });
  }
  painelCiclo();
});

async function fechar() {
  const novo = Catalogo.cicloDe() > ciclo.id ? Catalogo.cicloDe() : Catalogo.proximoCiclo(ciclo.id);
  if (!confirm(`Fechar o ciclo de ${ciclo.titulo}?\n\n• A planilha e o backup de ${ciclo.titulo} serão salvos${(await Arquivos.estado()) === 'ok' ? ' na pasta' : ' (download)'}.\n• O que já saiu do NC sai do navegador (fica no arquivo e no Localizar).\n• O que está no setor passa para ${Catalogo.tituloCiclo(novo)} com o mesmo #ID.\n• O #ID recomeça do #001.`)) return;
  const r = await Arquivos.fecharCiclo();
  Efeitos.toast(`Ciclo <b>${esc(r.fechado.titulo)}</b> fechado${r.onde === 'download' ? ' (arquivos baixados: mova para a pasta do Controle NC)' : ' e salvo na pasta'}. Agora é <b>${esc(r.novo.titulo)}</b>, começando do #001.`, { icone: ic('check'), tipo: 'sucesso', duracao: 9000 });
}

document.getElementById('arquivoRestaurar').addEventListener('change', async (e) => {
  const arq = e.target.files[0];
  e.target.value = '';
  if (!arq) return;
  try {
    const backup = JSON.parse(await arq.text());
    if (!confirm(`Restaurar ${backup?.ciclo?.titulo || 'o mês'} a partir de "${arq.name}"?\n\nOs volumes que estão agora neste navegador serão TROCADOS pelos do arquivo (${backup?.volumes?.length ?? 0} volume(s)).`)) return;
    const r = await Arquivos.restaurar(backup);
    Efeitos.toast(`Mês <b>${esc(r.ciclo)}</b> restaurado: ${r.volumes} volume(s).`, { icone: ic('check'), tipo: 'sucesso' });
    painelCiclo();
  } catch (erro) {
    Efeitos.toast(esc(erro.message || 'Arquivo inválido.'), { icone: ic('alerta'), tipo: 'alerta' });
  }
});

// ---------- 2) Consulta dos meses anteriores ----------
async function lerArquivo(arq) {
  const texto = await arq.text();
  const cicloNome = Catalogo.cicloDoTexto(arq.name);
  if (/\.json$/i.test(arq.name)) {
    const b = JSON.parse(texto);
    if (b?.tipo !== 'controle-nc-ciclo') throw new Error(`"${arq.name}" não é um backup do Controle NC.`);
    return { ciclo: b.ciclo.id, titulo: b.ciclo.titulo, tipo: 'backup', volumes: b.volumes.map((v, i) => ({ ...v, numero: -(carregados.size * 10000 + i + 1) })) };
  }
  const linhas = Planilha.lerCsv(texto);
  if (!linhas.length || !Object.keys(linhas[0]).some((h) => h.startsWith('#ID'))) throw new Error(`"${arq.name}" não tem a coluna #ID.`);
  const c = cicloNome || Catalogo.cicloDe();
  return { ciclo: c, titulo: Catalogo.tituloCiclo(c), tipo: 'csv', volumes: linhas.map((l, i) => ({ ...Planilha.volumeDaLinha(l, c, i), numero: -(carregados.size * 10000 + i + 1) })) };
}

async function carregarArquivos(arquivos) {
  let n = 0;
  for (const arq of arquivos) {
    try {
      // backup e CSV do mesmo mês: o backup é mais completo, fica ele
      const lido = await lerArquivo(arq);
      const mesmo = [...carregados.entries()].find(([, x]) => x.ciclo === lido.ciclo);
      if (mesmo && mesmo[1].tipo === 'backup' && lido.tipo === 'csv') continue;
      if (mesmo) carregados.delete(mesmo[0]);
      carregados.set(arq.name, lido); n += 1;
    } catch (erro) {
      Efeitos.toast(esc(erro.message), { icone: ic('alerta'), tipo: 'alerta' });
    }
  }
  if (n) Efeitos.toast(`${n} mês${n > 1 ? 'es' : ''} carregado${n > 1 ? 's' : ''} para consulta.`, { icone: ic('check'), tipo: 'sucesso' });
  montarFiltros();
  renderizar();
}

function todosVolumes() { return [...carregados.values()].flatMap((m) => m.volumes); }

function montarFiltros() {
  const meses = [...carregados.values()].sort((a, b) => b.ciclo.localeCompare(a.ciclo));
  elMeses.innerHTML = meses.map((m) => {
    const nome = [...carregados.entries()].find(([, x]) => x === m)[0];
    return `<li class="mes-chip"><b>${esc(Catalogo.nomeMes(m.ciclo))} ${esc(m.ciclo.slice(0, 4))}</b> <small>${m.volumes.length} · ${m.tipo === 'backup' ? 'backup' : 'planilha'}</small>
      <button type="button" class="btn btn-ghost btn-sm" data-tirar="${esc(nome)}" aria-label="Tirar ${esc(m.titulo)} da consulta">${ic('x')}</button></li>`;
  }).join('');
  elFiltros.hidden = !meses.length;
  const atual = elMes.value;
  elMes.innerHTML = `<option value="">Todos os meses</option>${meses.map((m) => `<option value="${m.ciclo}">${esc(Catalogo.nomeMes(m.ciclo))} ${m.ciclo.slice(0, 4)}</option>`).join('')}`;
  elMes.value = meses.some((m) => m.ciclo === atual) ? atual : '';
  elStatus.innerHTML = `<option value="">Todos os status</option>${Catalogo.status.map((s) => `<option value="${s.id}">${esc(s.titulo)}</option>`).join('')}`;
}

function filtrados() {
  return todosVolumes().filter((v) => (!elMes.value || v.ciclo === elMes.value || (carregados.get([...carregados.keys()].find((k) => carregados.get(k).volumes.includes(v)))?.ciclo === elMes.value))
    && (!elStatus.value || v.status === elStatus.value) && Busca.volume(v, elBusca.value));
}

function renderizar() {
  if (!carregados.size) {
    elLista.classList.add('vazia');
    elLista.innerHTML = `<li class="mesa-vazia mesa-vazia-centro"><span class="mesa-vazia-ico">${ic('pastas')}</span>
      <strong>Nenhum mês carregado</strong>
      <span>Importe um <b>.csv</b> ou <b>.backup.json</b> de um mês fechado.</span></li>`;
    document.getElementById('contagemConsulta').textContent = '';
    return;
  }
  const lista = filtrados().sort((a, b) => (b.ciclo || '').localeCompare(a.ciclo || '') || (b.id_ciclo || 0) - (a.id_ciclo || 0));
  document.getElementById('contagemConsulta').textContent = `${lista.length} ticket${lista.length === 1 ? '' : 's'}`;
  elLista.classList.toggle('vazia', !lista.length);
  elLista.innerHTML = lista.length
    ? lista.slice(0, 300).map((v, i) => TicketUI.padrao({ ...v, anterior: false }, { i: Math.min(i, 12), classe: 'tkp-consulta', mes: true })).join('')
    : '<li class="vazio">Nenhum ticket com essa busca.</li>';
  TicketUI.alinharPicotes(elLista);
}

elLista.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ver]');
  const v = b && todosVolumes().find((x) => x.numero === Number(b.dataset.ver));
  if (v) TicketUI.abrir(v, { acoes: `<span class="cartao-sub">${ic('arquivo')} ${esc(v.ciclo_titulo)} · só consulta</span>` });
});
elMeses.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tirar]');
  if (!b) return;
  carregados.delete(b.dataset.tirar);
  montarFiltros(); renderizar();
});
[elBusca, elMes, elStatus].forEach((el) => el.addEventListener('input', renderizar));
document.getElementById('importarArquivos').addEventListener('click', () => document.getElementById('arquivosImportar').click());
document.getElementById('arquivosImportar').addEventListener('change', async (e) => {
  const lista = [...e.target.files];
  e.target.value = '';
  await carregarArquivos(lista);
});
document.getElementById('carregarPasta').addEventListener('click', async () => {
  const lista = await Arquivos.lerDaPasta();
  // o mês aberto já está na mesa: carrega só os fechados
  const fechados = lista.filter((f) => Catalogo.cicloDoTexto(f.name) !== ciclo?.id);
  if (!fechados.length) { Efeitos.toast('Não achei arquivos de meses fechados nessa pasta.', { icone: ic('alerta') }); return; }
  await carregarArquivos(fechados.sort((a, b) => (/\.json$/i.test(a.name) ? -1 : 1) - (/\.json$/i.test(b.name) ? -1 : 1)));
});
window.addEventListener('mutility:arquivos', () => painelCiclo());

if (usuario) {
  Sessao.montarMenu(usuario);
  painelCiclo();
  renderizar();
  if (new URLSearchParams(location.search).get('fechar') === '1') setTimeout(() => elPainel.querySelector('[data-acao="fechar"]')?.focus(), 300);
}
