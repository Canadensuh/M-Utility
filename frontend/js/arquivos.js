/* =========================================================
   arquivos.js — os arquivos do mês na pasta do computador
   Sem servidor, os dados do Controle NC vivem em arquivos:
     "M-Utility - Controle NC (Nov-2026).csv"          → a planilha do mês
     "M-Utility - Controle NC (Nov-2026).backup.json"  → a cópia completa (restaura tudo)
   No Edge/Chrome o administrador escolhe UMA pasta e o sistema grava os dois
   arquivos sozinho a cada alteração. Ao reabrir o navegador, é só clicar em
   "Permitir". Sem esse recurso (outros navegadores), os arquivos são baixados.

   Fechar o ciclo: salva os arquivos do mês → só depois apaga do navegador o que
   já saiu do NC. O que está no setor passa para o mês novo com o mesmo #ID.
   ========================================================= */

const Arquivos = {
  BANCO: 'mutility-arquivos',
  _pasta: null,
  _timer: null,
  _ultimo: null,          // { em, ok, erro }
  suportado: typeof window.showDirectoryPicker === 'function',

  /* ---------- A pasta escolhida fica guardada no IndexedDB (o navegador permite) ---------- */
  async _idb(modo, fn) {
    const db = await new Promise((ok, falha) => {
      const p = indexedDB.open(this.BANCO, 1);
      p.onupgradeneeded = () => p.result.createObjectStore('config');
      p.onsuccess = () => ok(p.result);
      p.onerror = () => falha(p.error);
      setTimeout(() => falha(new Error('IndexedDB não respondeu')), 1500);
    });
    return new Promise((ok, falha) => {
      const tx = db.transaction('config', modo);
      const req = fn(tx.objectStore('config'));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => falha(tx.error);
    });
  },
  async pasta() {
    if (this._pasta) return this._pasta;
    try { this._pasta = (await this._idb('readonly', (s) => s.get('pasta'))) || null; } catch { this._pasta = null; }
    return this._pasta;
  },

  /** 'sem-suporte' | 'sem-pasta' | 'permitir' (precisa de um clique) | 'ok' */
  async estado() {
    if (!this.suportado) return 'sem-suporte';
    const p = await this.pasta();
    if (!p) return 'sem-pasta';
    try { return (await p.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'permitir'; } catch { return 'permitir'; }
  },
  async nomePasta() { return (await this.pasta())?.name || ''; },

  /** Precisa ser chamado num clique. */
  async escolherPasta() {
    const p = await window.showDirectoryPicker({ id: 'mutility-controle-nc', mode: 'readwrite', startIn: 'desktop' });
    this._pasta = p;
    try { await this._idb('readwrite', (s) => s.put(p, 'pasta')); } catch { /* fica só nesta sessão */ }
    await API.registrarAcao('Escolheu a pasta dos arquivos do mês', p.name);
    this.salvarAgora();
    return p.name;
  },
  /** Precisa ser chamado num clique. */
  async permitir() {
    const p = await this.pasta();
    if (!p) return false;
    const ok = (await p.requestPermission({ mode: 'readwrite' })) === 'granted';
    if (ok) this.salvarAgora();
    return ok;
  },

  async gravarNaPasta(nome, conteudo) {
    if ((await this.estado()) !== 'ok') return false;
    const arq = await (await this.pasta()).getFileHandle(nome, { create: true });
    const w = await arq.createWritable();
    await w.write(conteudo);
    await w.close();
    return true;
  },
  /** Grava na pasta; se não der, baixa o arquivo. Devolve 'pasta' ou 'download'. */
  async salvar(nome, conteudo, tipo) {
    try { if (await this.gravarNaPasta(nome, conteudo)) return 'pasta'; } catch (e) { console.warn('Não gravou na pasta:', e); }
    Planilha.baixar(nome, conteudo, tipo);
    return 'download';
  },

  /** Lê os arquivos do M-Utility que estão na pasta (para o Localizar). */
  async lerDaPasta() {
    if ((await this.estado()) !== 'ok') return [];
    const lista = [];
    for await (const [nome, h] of (await this.pasta()).entries()) {
      if (h.kind === 'file' && /^M-Utility - Controle NC .*\.(csv|backup\.json)$/i.test(nome)) lista.push(await h.getFile());
    }
    return lista;
  },

  /* ---------- Os dois arquivos do mês ---------- */
  async montar() {
    const r = await API.backupCiclo();
    if (!r.ok) throw new Error(r.dados.erro);
    const backup = r.dados;
    // as imagens das notas vão junto no backup (como texto)
    backup.anexos = {};
    if (window.Anexos) {
      for (const v of backup.volumes) {
        for (const a of v.anexos || []) {
          const dados = await Anexos.dados(a.id);
          if (dados) backup.anexos[a.id] = { nome: a.nome, dados };
        }
      }
    }
    const base = Catalogo.nomeArquivoCiclo(backup.ciclo.id);
    const ordem = backup.volumes.slice().sort((a, b) => (a.ciclo === b.ciclo ? a.id_ciclo - b.id_ciclo : a.ciclo.localeCompare(b.ciclo)));
    return {
      backup, base,
      csv: { nome: `${base}.csv`, conteudo: Planilha.csvRelatorio(ordem), tipo: 'text/csv;charset=utf-8' },
      json: { nome: `${base}.backup.json`, conteudo: JSON.stringify(backup, null, 1), tipo: 'application/json' },
    };
  },

  /** Salvamento automático: só grava se a pasta já estiver liberada (nunca baixa arquivo sozinho). */
  agendar() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.salvarAgora({ silencioso: true }), 2500);
  },
  async salvarAgora({ silencioso = false } = {}) {
    try {
      if ((await this.estado()) !== 'ok') return false;
      const m = await this.montar();
      await this.gravarNaPasta(m.csv.nome, m.csv.conteudo);
      await this.gravarNaPasta(m.json.nome, m.json.conteudo);
      this._ultimo = { em: new Date(), ok: true, base: m.base };
      window.dispatchEvent(new CustomEvent('mutility:arquivos', { detail: this._ultimo }));
      return true;
    } catch (erro) {
      this._ultimo = { em: new Date(), ok: false, erro: erro.message };
      window.dispatchEvent(new CustomEvent('mutility:arquivos', { detail: this._ultimo }));
      if (!silencioso && window.Efeitos) Efeitos.toast('Não consegui gravar na pasta. Confira a permissão.', { icone: ic('alerta'), tipo: 'alerta' });
      return false;
    }
  },
  ultimo() { return this._ultimo; },

  /**
   * Fecha o ciclo: 1) grava/baixa o CSV e o backup do mês; 2) só então tira do navegador
   * o que já saiu do NC (e as imagens deles). Devolve o resultado da API.
   */
  async fecharCiclo() {
    const rc = await API.ciclo();
    if (!rc.ok) throw new Error(rc.dados.erro);
    const m = await this.montar();
    const onde = [await this.salvar(m.csv.nome, m.csv.conteudo, m.csv.tipo), await this.salvar(m.json.nome, m.json.conteudo, m.json.tipo)];
    const r = await API.fecharCiclo(rc.dados.id);
    if (!r.ok) throw new Error(r.dados.erro);
    if (window.Anexos) await Anexos.apagar(r.dados.arquivados.flatMap((a) => a.anexos));
    // o arquivo do mês novo já nasce na pasta
    this.salvarAgora({ silencioso: true });
    return { ...r.dados, onde: onde.includes('download') ? 'download' : 'pasta', arquivos: [m.csv.nome, m.json.nome] };
  },

  /** Restaura o mês a partir de um .backup.json (o navegador foi limpo, troca de computador…). */
  async restaurar(backup) {
    const r = await API.restaurarCiclo(backup);
    if (!r.ok) throw new Error(r.dados.erro);
    if (window.Anexos && backup.anexos) {
      for (const [id, a] of Object.entries(backup.anexos)) await Anexos.restaurar(id, a.dados, a.nome);
    }
    return r.dados;
  },
};

window.Arquivos = Arquivos;

// Qualquer alteração nos dados → grava os arquivos do mês na pasta (se ela estiver liberada)
window.addEventListener('mutility:dados', () => Arquivos.agendar());
