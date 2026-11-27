/* =========================================================
   nuvem.js — o banco online do M-Utility (Supabase)
   O app continua trabalhando com a cópia do navegador (js/api.js),
   e este módulo mantém essa cópia igual ao banco online:
   - Cada volume, crachá, cliente e registro de auditoria é uma linha
     na tabela mutility_registros (colecao + id). Só o que mudou trafega.
   - Antes de gravar, puxa o que os outros computadores mudaram; depois
     de gravar, envia o que mudou aqui. Se a internet cair, o app segue
     com a cópia local e envia o que ficou pendente quando voltar.
   - Ao vivo (Realtime): o que outro computador grava chega em segundos
     e a tela se atualiza sozinha.
   - Login: cada crachá entra com o próprio e-mail e senha do Supabase
     (Authentication › Users). Sem esse login, o banco não abre.
   - #IDs sem repetir: a numeração é reservada no banco (mutility_proximo).
   - Fotos dos anexos: ficam no Storage (bucket "anexos").
   Precisa, antes: supabase-js (CDN), js/sessao.js e js/api.js.
   ========================================================= */

const Nuvem = (() => {
  const URL_PROJETO = 'https://suuheydnwgyjszmtsjuz.supabase.co';
  const CHAVE_PUBLICA = 'sb_publishable_1grigVg8YeHfbHyAUV81_Q_tSCRgu_Y';
  const TABELA = 'mutility_registros';
  const BALDE = 'anexos';
  const K_ESPELHO = 'mutility-nuvem-espelho';   // hash de cada registro como está no banco online
  const K_CURSOR = 'mutility-nuvem-cursor';     // até quando já puxamos
  const K_ANEXOS = 'mutility-nuvem-anexos';     // fotos já enviadas
  const ESPERA_MAX = 4000;                      // não trava a tela se a internet estiver lenta

  /* Rotas que criam #ID: o número é reservado no banco antes */
  const CRIA_VOLUME = new Set(['inserirVolume']);
  const CRIA_VARIOS = new Set(['importarVolumes', 'restaurarCiclo']);

  const cliente = window.supabase?.createClient
    ? window.supabase.createClient(URL_PROJETO, CHAVE_PUBLICA, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mutility-nuvem-login' },
    })
    : null;
  let sessao = null;
  let canal = null;
  let fila = Promise.resolve();
  let avisouOffline = false;

  // ---------- utilidades ----------
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço */ } };
  /** JSON com as chaves em ordem (o banco devolve em outra ordem; o hash tem que bater). */
  const estavel = (v) => (v === null || typeof v !== 'object') ? JSON.stringify(v)
    : Array.isArray(v) ? `[${v.map(estavel).join(',')}]`
      : `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`).join(',')}}`;
  const hash = (texto) => {   // cyrb53: curto e rápido
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < texto.length; i++) { const c = texto.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const comLimite = (p, ms = ESPERA_MAX) => Promise.race([p, new Promise((_, nao) => setTimeout(() => nao(new Error('tempo esgotado')), ms))]);
  /** Uma coisa de cada vez (puxar, enviar, aplicar o que chegou). */
  const emFila = (fn) => { const p = fila.then(fn, fn); fila = p.catch(() => {}); return p; };
  const ligado = () => !!(cliente && sessao);

  function avisarOffline(erro) {
    console.warn('[M-Utility] banco online indisponível:', erro?.message || erro);
    if (avisouOffline) return;
    avisouOffline = true;
    window.Efeitos?.toast?.('Sem conexão com o banco online. Seguindo com a cópia deste computador.', { tipo: 'alerta' });
  }

  // ---------- o banco local em registros (coleção + id) ----------
  function garantirUids(db) {   // auditoria com id único em todos os computadores
    let mudou = false;
    for (const r of db.auditoria || []) if (!r.uid) { r.uid = uid(); mudou = true; }
    return mudou;
  }
  function registros(db) {
    const m = new Map();
    const por = (colecao, id, dados) => m.set(`${colecao}|${id}`, { colecao, id: String(id), dados });
    (db.volumes || []).forEach((v) => por('volumes', v.numero, v));
    (db.contas || []).forEach(({ senha, ...resto }) => por('contas', resto.id, resto));   // a senha fica só no Supabase
    (db.clientes || []).forEach((c) => por('clientes', c.id, c));
    (db.auditoria || []).forEach((r) => por('auditoria', r.uid, r));
    por('meta', 'geral', {
      seq: db.seq || {}, ciclo: db.ciclo || null, migracoes: db.migracoes || [],
      ciclos_fechados: db.ciclos_fechados || [], clientes_removidos: db.clientes_removidos || [],
    });
    return m;
  }

  function mesclarMeta(db, r) {
    const l = { seq: db.seq || {}, ciclo: db.ciclo || null };
    const seq = {};
    new Set([...Object.keys(l.seq), ...Object.keys(r.seq || {})]).forEach((k) => { seq[k] = Math.max(Number(l.seq[k]) || 0, Number(r.seq?.[k]) || 0); });
    const cr = r.ciclo?.id || '', cl = l.ciclo?.id || '';
    // o ciclo mais novo vence inteiro (fechar o mês zera a numeração do #ID)
    if (cr > cl) { db.ciclo = r.ciclo; seq.ciclo = Number(r.seq?.ciclo) || 0; }
    else if (cl > cr) { seq.ciclo = Number(l.seq.ciclo) || 0; }
    db.seq = seq;
    db.migracoes = [...new Set([...(db.migracoes || []), ...(r.migracoes || [])])];
    db.clientes_removidos = [...new Set([...(db.clientes_removidos || []), ...(r.clientes_removidos || [])])];
    const fechados = new Map((db.ciclos_fechados || []).map((c) => [c.id, c]));
    (r.ciclos_fechados || []).forEach((c) => { if (!fechados.has(c.id)) fechados.set(c.id, c); });
    db.ciclos_fechados = [...fechados.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  /** Aplica no banco local as linhas que vieram do banco online. Devolve se algo mudou. */
  function aplicar(db, linhas) {
    const espelho = ler(K_ESPELHO, {});
    const locais = registros(db);
    let mudou = false;
    const colecoes = { volumes: 'volumes', contas: 'contas', clientes: 'clientes', auditoria: 'auditoria' };
    const chaveDe = { volumes: (x) => String(x.numero), contas: (x) => String(x.id), clientes: (x) => String(x.id), auditoria: (x) => String(x.uid) };
    for (const linha of linhas) {
      const k = `${linha.colecao}|${linha.id}`;
      const hRemoto = linha.apagado ? null : hash(estavel(linha.dados));
      if (linha.colecao === 'meta') {
        const antes = estavel(locais.get(k)?.dados);
        mesclarMeta(db, linha.dados || {});
        espelho[k] = hRemoto;
        if (estavel(registros(db).get(k)?.dados) !== antes) mudou = true;
        continue;
      }
      const col = colecoes[linha.colecao];
      if (!col) continue;
      const local = locais.get(k);
      const hLocal = local ? hash(estavel(local.dados)) : null;
      // mudança daqui que ainda não subiu: fica a daqui (ela vai ser enviada)
      if (espelho[k] !== undefined && hLocal !== espelho[k] && hLocal !== hRemoto) continue;
      if (linha.apagado) delete espelho[k]; else espelho[k] = hRemoto;
      if (hLocal === hRemoto) continue;
      const lista = db[col] || (db[col] = []);
      const i = lista.findIndex((x) => chaveDe[col](x) === String(linha.id));
      if (linha.apagado) { if (i >= 0) { lista.splice(i, 1); mudou = true; } continue; }
      const novo = { ...linha.dados };
      if (col === 'contas' && i >= 0 && lista[i].senha !== undefined) novo.senha = lista[i].senha;   // a senha local (para entrar sem internet)
      if (i >= 0) lista[i] = novo; else lista.push(novo);
      mudou = true;
    }
    if (mudou) {
      db.volumes?.sort((a, b) => a.numero - b.numero);
      db.contas?.sort((a, b) => a.id - b.id);
      db.clientes?.sort((a, b) => a.id - b.id);
      db.auditoria?.sort((a, b) => String(a.em).localeCompare(String(b.em)));
    }
    gravar(K_ESPELHO, espelho);
    return mudou;
  }

  // ---------- puxar e enviar ----------
  /** Antes da primeira conexão deste navegador: cópia de tudo (arquivo baixado + cópia guardada). */
  function backupAntesDaNuvem() {
    try {
      const texto = JSON.stringify(Banco.ler());
      try { localStorage.setItem('mutility-backup-antes-da-nuvem', texto); } catch { /* sem espaço: fica só o arquivo */ }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
      a.download = `M-Utility - backup antes do banco online (${new Date().toISOString().slice(0, 10)}).json`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (erro) { console.warn('[M-Utility] backup antes da nuvem falhou:', erro); }
  }

  async function puxarAgora() {
    const cursor = ler(K_CURSOR, null);
    if (!cursor && !localStorage.getItem('mutility-backup-antes-da-nuvem')) backupAntesDaNuvem();
    const linhas = [];
    for (let de = 0; ; de += 1000) {
      let q = cliente.from(TABELA).select('colecao,id,dados,apagado,atualizado_em').order('atualizado_em', { ascending: true }).range(de, de + 999);
      if (cursor) q = q.gt('atualizado_em', cursor);
      const { data, error } = await q;
      if (error) throw error;
      linhas.push(...data);
      if (data.length < 1000) break;
    }
    if (!linhas.length) { if (!cursor) gravar(K_CURSOR, new Date(0).toISOString()); return false; }
    const db = Banco.ler();
    garantirUids(db);
    const mudou = aplicar(db, linhas);
    Banco.salvar(db);
    // volta 5 s: uma gravação que terminou junto com a leitura não fica para trás
    const maior = new Date(linhas[linhas.length - 1].atualizado_em).getTime() - 5000;
    gravar(K_CURSOR, new Date(Math.max(maior, cursor ? new Date(cursor).getTime() : 0)).toISOString());
    return mudou;
  }

  async function enviarAgora() {
    const db = Banco.ler();
    if (garantirUids(db)) Banco.salvar(db);
    const espelho = ler(K_ESPELHO, {});
    const atuais = registros(db);
    const subir = [];
    const novos = {};
    for (const [k, r] of atuais) {
      const h = hash(estavel(r.dados));
      if (espelho[k] !== h) { subir.push({ colecao: r.colecao, id: r.id, dados: r.dados, apagado: false }); novos[k] = h; }
    }
    const apagar = Object.keys(espelho).filter((k) => !atuais.has(k) && espelho[k] !== null);
    // TRAVA: um navegador que perdeu os dados não pode apagar tudo do banco online.
    // Apagar muitos volumes de uma vez só acontece no fechamento do mês (pelo administrador).
    const volumesApagados = apagar.filter((k) => k.startsWith('volumes|')).length;
    const volumesConhecidos = Object.keys(espelho).filter((k) => k.startsWith('volumes|')).length;
    const fechandoMes = window.__mutilityFechandoMes === true;
    if (!fechandoMes && volumesApagados > 10 && volumesApagados > volumesConhecidos * .3) {
      console.error(`[M-Utility] envio bloqueado: este computador tentou apagar ${volumesApagados} volumes do banco online.`);
      window.Efeitos?.toast?.('⚠️ Este computador está sem parte dos volumes. Não apaguei nada do banco online: entre de novo para receber os dados.', { tipo: 'alerta', duracao: 15000 });
      gravar(K_CURSOR, null); gravar(K_ESPELHO, {});   // na próxima vez, recebe tudo do banco online de novo
      return 0;
    }
    for (const k of apagar) {
      const [colecao, ...resto] = k.split('|');
      subir.push({ colecao, id: resto.join('|'), dados: {}, apagado: true });
      novos[k] = null;
    }
    for (let i = 0; i < subir.length; i += 300) {
      const { error } = await cliente.from(TABELA).upsert(subir.slice(i, i + 300), { onConflict: 'colecao,id' });
      if (error) throw error;
    }
    if (subir.length) {
      const esp = ler(K_ESPELHO, {});
      for (const [k, h] of Object.entries(novos)) { if (h === null) delete esp[k]; else esp[k] = h; }
      gravar(K_ESPELHO, esp);
    }
    return subir.length;
  }

  const puxar = () => emFila(() => puxarAgora());
  const enviar = () => emFila(() => enviarAgora());

  /** Reserva o próximo número no banco (dois computadores não pegam o mesmo #ID). */
  async function reservar(nome, minimo) {
    const { data, error } = await cliente.rpc('mutility_proximo', { p_nome: nome, p_minimo: Number(minimo) || 0 });
    if (error) throw error;
    return Number(data);
  }

  // ---------- ganchos do Banco (js/api.js) ----------
  async function antesDeGravar(rota) {
    if (!ligado()) return;
    try {
      await comLimite(puxar());
      if (CRIA_VOLUME.has(rota) || rota === 'novoPacote') {
        await comLimite(emFila(async () => {
          const db = Banco.ler();
          if (rota === 'novoPacote') {
            db.seq.pacote = (await reservar('pacote', db.seq.pacote)) - 1;
          } else {
            const [v, c] = await Promise.all([reservar('volume', db.seq.volume), reservar(`ciclo:${db.ciclo?.id}`, db.seq.ciclo)]);
            db.seq.volume = v - 1; db.seq.ciclo = c - 1;
          }
          Banco.salvar(db);
        }));
      }
      avisouOffline = false;
    } catch (erro) { avisarOffline(erro); }
  }

  function depoisDeGravar(rota) {
    if (!ligado()) return;
    if (rota === 'fecharCiclo') window.__mutilityFechandoMes = true;   // o único caso em que muitos volumes saem de uma vez
    emFila(async () => {
      const db = Banco.ler();
      if (CRIA_VARIOS.has(rota)) {
        await reservar('volume', Math.max(0, db.seq.volume - 1));
        await reservar(`ciclo:${db.ciclo?.id}`, Math.max(0, db.seq.ciclo - 1));
      }
      if (rota === 'definirProximoId' || rota === 'fecharCiclo') {   // o administrador mudou a numeração de propósito
        await cliente.from('mutility_contadores').upsert({ nome: `ciclo:${db.ciclo?.id}`, valor: Number(db.seq.ciclo) || 0 });
      }
      return enviarAgora();
    }).catch(avisarOffline).finally(() => { window.__mutilityFechandoMes = false; });
  }

  // ---------- ao vivo ----------
  let esperaTela = 0;
  function atualizarTela() {
    clearTimeout(esperaTela);
    esperaTela = setTimeout(() => {
      const ativo = document.activeElement;
      if (ativo?.matches?.('input, textarea, select') && !ativo.closest('[data-livre]')) { atualizarTela(); return; }   // não atrapalha quem está digitando
      window.dispatchEvent(new CustomEvent('mutility:nuvem'));
      if (typeof window.atualizar === 'function') window.atualizar();
      else if (typeof window.carregar === 'function') window.carregar();
    }, 600);
  }
  function aoVivo() {
    if (canal || !ligado()) return;
    canal = cliente.channel('mutility-registros')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABELA }, (p) => {
        if (!p.new?.colecao) return;
        emFila(async () => {
          const db = Banco.ler();
          if (aplicar(db, [p.new])) { Banco.salvar(db); atualizarTela(); }
        });
      })
      .subscribe((estado) => { if (estado === 'SUBSCRIBED') puxar().then((m) => { if (m) atualizarTela(); }).catch(() => {}); });
  }

  // ---------- login ----------
  async function entrar(email, senha) {
    if (!cliente) return { erro: 'offline' };
    try {
      const { data, error } = await comLimite(cliente.auth.signInWithPassword({ email, password: senha }), 8000);
      if (error) return { erro: /invalid|credentials/i.test(error.message) ? 'senha' : error.message };
      sessao = data.session;
      return { ok: true };
    } catch (erro) { return { erro: 'offline', detalhe: erro }; }
  }
  /** Primeira sincronização depois do login (puxa tudo o que mudou e envia o que só existe aqui). */
  async function sincronizar() {
    if (!ligado()) return false;
    try { await comLimite(puxar(), 15000); await comLimite(enviar(), 15000); aoVivo(); return true; } catch (erro) { avisarOffline(erro); return false; }
  }
  async function trocarSenha(email, atual, nova) {
    if (!ligado()) return { erro: 'Sem conexão com o banco online para trocar a senha.' };
    const conf = await cliente.auth.signInWithPassword({ email, password: atual });
    if (conf.error) return { erro: 'A senha atual não confere.' };
    const { error } = await cliente.auth.updateUser({ password: nova });
    return error ? { erro: error.message } : { ok: true };
  }

  // ---------- fotos dos anexos (Storage) ----------
  async function enviarAnexo(id, blob) {
    if (!ligado() || !blob) return false;
    const { error } = await cliente.storage.from(BALDE).upload(`${id}.jpg`, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) { console.warn('[M-Utility] foto não subiu:', error.message); return false; }
    const ja = new Set(ler(K_ANEXOS, [])); ja.add(id); gravar(K_ANEXOS, [...ja]);
    return true;
  }
  async function baixarAnexo(id) {
    if (!ligado()) return null;
    const { data, error } = await cliente.storage.from(BALDE).download(`${id}.jpg`);
    return error ? null : data;
  }
  async function apagarAnexos(ids) {
    if (!ligado() || !ids?.length) return;
    await cliente.storage.from(BALDE).remove(ids.map((id) => `${id}.jpg`));
  }
  /** As fotos que já estavam neste computador sobem uma vez (em segundo plano). */
  async function subirAnexosAntigos() {
    if (!ligado() || !window.Anexos) return;
    const ja = new Set(ler(K_ANEXOS, []));
    const ids = (Banco.ler().volumes || []).flatMap((v) => (v.anexos || []).map((a) => a.id)).filter((id) => id && !ja.has(id));
    for (const id of ids) {
      const dataUrl = await Anexos.dados(id);
      if (!dataUrl) continue;
      try { await enviarAnexo(id, await (await fetch(dataUrl)).blob()); } catch { break; }
    }
  }

  // ---------- início em cada tela ----------
  async function iniciar() {
    if (!cliente) return;
    try { sessao = (await cliente.auth.getSession()).data.session; } catch { sessao = null; }
    cliente.auth.onAuthStateChange((_, s) => { sessao = s; });
    const naTelaDeLogin = /login\.html$/.test(location.pathname);
    // logado no app mas sem o login do banco online: entra de novo para conectar este computador
    if (!sessao && window.Sessao?.usuario() && !naTelaDeLogin) { Sessao.sair('conectar'); return; }
    if (!sessao || naTelaDeLogin) return;
    try {
      const mudou = await comLimite(puxar(), 12000);
      await comLimite(enviar(), 12000);
      if (mudou) atualizarTela();
    } catch (erro) { avisarOffline(erro); }
    aoVivo();
    setTimeout(() => subirAnexosAntigos().catch(() => {}), 3000);
    // voltou a internet: manda o que ficou pendente
    addEventListener('online', () => { avisouOffline = false; puxar().then(() => enviar()).then(() => atualizarTela()).catch(avisarOffline); });
  }

  // sair do app também desconecta o login do banco neste navegador
  if (window.Sessao && cliente) {
    const sairOriginal = Sessao.sair.bind(Sessao);
    Sessao.sair = (motivo = '') => {
      Promise.race([cliente.auth.signOut({ scope: 'local' }), new Promise((ok) => setTimeout(ok, 800))]).finally(() => sairOriginal(motivo));
    };
  }

  const api = {
    configurado: !!cliente, ligado, iniciar, entrar, sincronizar, trocarSenha,
    antesDeGravar, depoisDeGravar, enviarAnexo, baixarAnexo, apagarAnexos,
  };
  window.Nuvem = api;
  api.pronto = iniciar().catch(() => {});   // quem precisa saber se já está conectado espera por isto
  return api;
})();
