/* =========================================================
   sons.js — os efeitos sonoros das leituras (os mesmos do Localizador de AWB)
   Uso: Sons.tocar('encontrado' | 'ja-bipado' | 'nao-encontrado' | 'invalido')
   ========================================================= */
const Sons = {
  ARQUIVOS: {
    encontrado: 'assets/sons/encontrado.mp3',
    'ja-bipado': 'assets/sons/ja-bipado.mp3',
    'nao-encontrado': 'assets/sons/nao-encontrado.mp3',
    invalido: 'assets/sons/invalido.mp3',
  },
  _base: {},
  tocar(tipo) {
    const src = this.ARQUIVOS[tipo];
    if (!src) return;
    try {
      this._base[tipo] = this._base[tipo] || Object.assign(new Audio(src), { preload: 'auto' });
      // um clone por leitura: bipando rápido, um som não corta o outro
      this._base[tipo].cloneNode().play().catch(() => { /* navegador bloqueou o som */ });
    } catch { /* sem áudio */ }
  },
};
Object.keys(Sons.ARQUIVOS).forEach((t) => { try { Sons._base[t] = Object.assign(new Audio(Sons.ARQUIVOS[t]), { preload: 'auto' }); } catch { /* */ } });
window.Sons = Sons;
