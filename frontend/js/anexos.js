/* =========================================================
   anexos.js — imagens anexadas à nota do volume
   O localStorage é pequeno (~5 MB), então as imagens ficam no
   IndexedDB do navegador. Antes de guardar, a foto é reduzida
   (no máximo 1600 px, JPEG) para caber muitas.
   O volume guarda só a referência: { id, nome, tipo, tamanho }.
   ========================================================= */

const Anexos = {
  BANCO: 'mutility-anexos',
  LOJA: 'imagens',
  MAX_LADO: 1600,
  MAX_POR_VOLUME: 4,
  _db: null,
  _urls: new Map(),

  /* Plano B: se o IndexedDB não abrir (alguns navegadores bloqueiam em arquivos locais),
     as imagens vão para o localStorage, como texto (data URL), um pouco menores. */
  CHAVE_RESERVA: 'mutility-anexos',
  _semIdb: false,

  abrir() {
    if (this._db) return Promise.resolve(this._db);
    if (this._semIdb) return Promise.reject(new Error('sem IndexedDB'));
    return new Promise((resolver, rejeitar) => {
      const desistir = setTimeout(() => { this._semIdb = true; rejeitar(new Error('IndexedDB não respondeu')); }, 1500);
      try {
        const pedido = indexedDB.open(this.BANCO, 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore(this.LOJA, { keyPath: 'id' });
        pedido.onsuccess = () => { clearTimeout(desistir); this._db = pedido.result; resolver(this._db); };
        pedido.onerror = () => { clearTimeout(desistir); this._semIdb = true; rejeitar(pedido.error); };
      } catch (erro) { clearTimeout(desistir); this._semIdb = true; rejeitar(erro); }
    });
  },

  reserva() { try { return JSON.parse(localStorage.getItem(this.CHAVE_RESERVA) || '{}'); } catch { return {}; } },
  gravarReserva(dados) {
    try { localStorage.setItem(this.CHAVE_RESERVA, JSON.stringify(dados)); }
    catch { throw new Error('Sem espaço no navegador para guardar mais imagens.'); }
  },
  paraTexto(blob) {
    return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  },

  async transacao(modo, fn) {
    const db = await this.abrir();
    return new Promise((resolver, rejeitar) => {
      const tx = db.transaction(this.LOJA, modo);
      const resultado = fn(tx.objectStore(this.LOJA));
      tx.oncomplete = () => resolver(resultado?.result ?? resultado);
      tx.onerror = () => rejeitar(tx.error);
    });
  },

  /** Reduz a imagem (mantendo a proporção) e devolve um Blob JPEG. */
  async comprimir(arquivo, { lado = this.MAX_LADO, qualidade = .82 } = {}) {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url; });
      const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * escala);
      canvas.height = Math.round(img.naturalHeight * escala);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', qualidade));
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  /** Guarda uma imagem e devolve a referência { id, nome, tipo, tamanho }. */
  async salvar(arquivo) {
    if (!/^image\//.test(arquivo.type)) throw new Error('Só dá para anexar imagens.');
    const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nome = (arquivo.name || 'imagem').replace(/\.[^.]+$/, '') + '.jpg';
    try {
      const blob = await this.comprimir(arquivo);
      await this.transacao('readwrite', (loja) => loja.put({ id, blob, nome, criado: new Date().toISOString() }));
      return { id, nome, tipo: 'image/jpeg', tamanho: blob.size };
    } catch {
      // Plano B: imagem menor, como texto no localStorage
      const blob = await this.comprimir(arquivo, { lado: 1000, qualidade: .7 });
      const reserva = this.reserva();
      reserva[id] = { nome, dados: await this.paraTexto(blob) };
      this.gravarReserva(reserva);
      return { id, nome, tipo: 'image/jpeg', tamanho: blob.size };
    }
  },

  /** URL para mostrar a imagem (fica em cache enquanto a página estiver aberta). */
  async url(id) {
    if (this._urls.has(id)) return this._urls.get(id);
    const naReserva = this.reserva()[id];
    if (naReserva) return naReserva.dados;
    try {
      const registro = await this.transacao('readonly', (loja) => loja.get(id));
      if (!registro?.blob) return null;
      const url = URL.createObjectURL(registro.blob);
      this._urls.set(id, url);
      return url;
    } catch { return null; }
  },

  /** A imagem como texto (data URL), para ir dentro do backup do mês. */
  async dados(id) {
    const naReserva = this.reserva()[id];
    if (naReserva) return naReserva.dados;
    try {
      const registro = await this.transacao('readonly', (loja) => loja.get(id));
      return registro?.blob ? await this.paraTexto(registro.blob) : null;
    } catch { return null; }
  },

  /** Volta uma imagem do backup para o navegador (restaurar o mês). */
  async restaurar(id, dataUrl, nome = 'imagem.jpg') {
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await this.transacao('readwrite', (loja) => loja.put({ id, blob, nome, criado: new Date().toISOString() }));
    } catch {
      const reserva = this.reserva();
      reserva[id] = { nome, dados: dataUrl };
      this.gravarReserva(reserva);
    }
  },

  async apagar(ids = []) {
    const reserva = this.reserva();
    let mudou = false;
    for (const id of ids) {
      if (reserva[id]) { delete reserva[id]; mudou = true; }
      try { await this.transacao('readwrite', (loja) => loja.delete(id)); } catch { /* já não existia */ }
      if (this._urls.has(id)) { URL.revokeObjectURL(this._urls.get(id)); this._urls.delete(id); }
    }
    if (mudou) this.gravarReserva(reserva);
  },

  /** Preenche as <img data-anexo="id"> de um trecho da tela. */
  async preencher(raiz = document) {
    for (const img of raiz.querySelectorAll('img[data-anexo]')) {
      const url = await this.url(img.dataset.anexo);
      if (url) img.src = url; else img.closest('.anexo')?.classList.add('anexo-sumiu');
    }
  },

  /** Abre a imagem em tela cheia. */
  async ampliar(id) {
    const url = await this.url(id);
    if (!url) return;
    let d = document.getElementById('anexoAmpliado');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'anexoAmpliado';
      d.className = 'modal modal-anexo';
      d.addEventListener('click', () => d.close());
      document.body.appendChild(d);
    }
    d.innerHTML = `<img src="${url}" alt="Imagem anexada" /><span class="anexo-fechar">Clique para fechar</span>`;
    d.showModal();
  },
};

window.Anexos = Anexos;
