/* =========================================================
   api.js — banco de dados local do M-Utility
   Não há servidor: tudo fica no localStorage deste navegador.
   As telas continuam chamando "await API.algo()" e recebem
   { ok, status, dados } — se um dia houver backend (ou a
   planilha online), só este arquivo muda.

   Toda ação que altera dados entra no Registro de Auditoria.
   ATENÇÃO: senhas e dados ficam no navegador. Serve para uso
   pessoal/local, não é segurança de verdade.
   ========================================================= */

const Banco = (() => {
  const CHAVE = 'mutility-db-v1';
  const SENHA_PADRAO = '1234';
  const MIN_SENHA = 4;
  // PIN da opção secreta do Helpy (duplo clique nele): mostra o usuário e a senha do ICS
  const PIN_ICS = '0109';
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const PERFIS = ['usuario', 'admin'];
  const LIMITE_AUDITORIA = 5000;

  class ErroBanco extends Error {
    constructor(status, mensagem) { super(mensagem); this.status = status; }
  }
  const invalido = (msg) => new ErroBanco(422, msg);
  const negado = (msg = 'Só o administrador pode fazer isso.') => new ErroBanco(403, msg);
  const naoAchou = (msg) => new ErroBanco(404, msg);
  const naoLogado = () => new ErroBanco(401, 'Sessão encerrada. Entre novamente.');

  const agora = () => new Date().toISOString();
  const copia = (v) => JSON.parse(JSON.stringify(v));
  const chaveEmail = (e) => String(e || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');


  /* Clientes cadastrados no setor (vieram do navegador do administrador em 24/11/2026).
     Ficam no código para nunca se perderem: se faltar algum no banco, ele volta
     (sem mexer nos que já existem, que podem ter sido editados). */
  const CLIENTES_PADRAO = [
    { id: 4, nome: 'NEWELL BRANDS', cnpj: '60594538000950', cor: '#e3c567' },
    { id: 5, nome: 'ESSENTIAL (SELIA)', cnpj: '17979609000742', cor: '#242424' },
    { id: 6, nome: 'RPM (ENIVIX)', cnpj: '37136796000203', cor: '#9c7fd6' },
    { id: 7, nome: 'PROHALL', cnpj: '24815160000408', cor: '#6db85a' },
    { id: 8, nome: 'ENGAGE ELETRO', cnpj: '24867555000870', cor: '#d9668a' },
    { id: 9, nome: 'MUNDIAL', cnpj: '12744404000764', cor: '#cf4f4f' },
    { id: 10, nome: 'SCS-2', cnpj: '28778134002605', cor: '#fcff52' },
    { id: 11, nome: 'IZU STD', cnpj: '34744895000352', cor: '#b3b3b3' },
    { id: 12, nome: 'PLIE - STANDARD', cnpj: '35473287001719', cor: '#5d7fd1' },
  ];

  function garantirClientes(db) {
    let mudou = false;
    for (const padrao of CLIENTES_PADRAO) {
      const existe = db.clientes.some((c) => c.cnpj === padrao.cnpj
        || String(c.nome).trim().toLowerCase() === padrao.nome.toLowerCase());
      if (existe || (db.clientes_removidos || []).includes(padrao.cnpj)) continue;
      const id = db.clientes.some((c) => c.id === padrao.id) ? Math.max(db.seq.cliente, ...db.clientes.map((c) => c.id)) + 1 : padrao.id;
      db.clientes.push({ ...padrao, id });
      mudou = true;
    }
    db.seq.cliente = Math.max(db.seq.cliente || 0, ...db.clientes.map((c) => c.id));
    if (mudou) salvar(db);
  }
  /* Contas do setor, na ordem dos IDs: Murilo N.B (0001, administrador), Rafaela S.B (0002, usuária)
     e Total Guest (0003, a conta de usuário padrão para quem não tem crachá). */
  const CONTA_MURILO = { nome: 'Murilo N.B', email: 'murilonb@mutility.com.br', perfil: 'admin', senha: '010918', foto: 'https://github.com/Canadensuh.png?size=200' };
  const CONTA_RAFAELA = { nome: 'Rafaela S.B', email: 'rafaelasb@mutility.com.br', perfil: 'usuario', senha: SENHA_PADRAO, foto: '' };
  const CONTA_GUEST = { nome: 'Total Guest', email: 'totalguest@mutility.com.br', perfil: 'usuario', senha: SENHA_PADRAO, foto: 'assets/total-guest.png' };
  const CONTAS_PADRAO = [CONTA_MURILO, CONTA_RAFAELA, CONTA_GUEST];

  /** 25/11/2026 (2ª): a conta da Rafaela passa a ser "Rafaela S.B" (rafaelasb@), senha 1234. Uma vez só. */
  function migrarRafaela(db) {
    db.migracoes = Array.isArray(db.migracoes) ? db.migracoes : [];
    if (db.migracoes.includes('rafaela-sb')) return;
    const nova = CONTA_RAFAELA;
    const conta = db.contas.find((c) => ['rafaela@mutility.com.br', nova.email].includes(chaveEmail(c.email)))
      || db.contas.find((c) => /^rafaela\b/i.test(chaveEmail(c.nome)));
    if (conta) Object.assign(conta, { nome: nova.nome, email: nova.email, senha: nova.senha, perfil: nova.perfil });
    else {
      db.seq.conta = Math.max(db.seq.conta || 0, ...db.contas.map((c) => c.id)) + 1;
      db.contas.push({ id: db.seq.conta, ...nova, ativo: true, criado_em: agora() });
    }
    db.migracoes.push('rafaela-sb');
    salvar(db);
  }

  /**
   * Usuário e senha do ICS NÃO ficam no código: o administrador cadastra em
   * Crachás › engrenagem › Editar usuário e senha do ICS (ficam só no navegador).
   * Esta função ficou só para marcar a migração antiga como feita.
   */
  function migrarIcs(db) {
    db.migracoes = Array.isArray(db.migracoes) ? db.migracoes : [];
    if (db.migracoes.includes('ics-murilo')) return;
    db.migracoes.push('ics-murilo');
    salvar(db);
  }

  /**
   * Uma vez só, nos bancos que já existiam (25/11/2026):
   * - a antiga conta de usuário "Murilo N.B" vira o Total Guest;
   * - o administrador Murilo N.B passa a entrar com murilonb@mutility.com.br;
   * - a Rafaela Superbi (administradora) é criada, se ainda não existir.
   * Depois disso, senhas e dados trocados pelas telas não são mais tocados.
   */
  function migrarContas(db) {
    db.migracoes = Array.isArray(db.migracoes) ? db.migracoes : [];
    if (db.migracoes.includes('contas-2026-11-25')) return;
    const [guest, murilo, rafaela] = [CONTA_GUEST, CONTA_MURILO, CONTA_RAFAELA];
    const porEmail = (e) => db.contas.find((c) => chaveEmail(c.email) === chaveEmail(e));
    const antigoUsuario = db.contas.find((c) => c.perfil === 'usuario' && chaveEmail(c.email) === chaveEmail(murilo.email));
    if (antigoUsuario) {
      if (porEmail(guest.email)) db.contas = db.contas.filter((c) => c !== antigoUsuario);   // o Total Guest já existe: some
      else Object.assign(antigoUsuario, { ...guest, ativo: true });
    } else if (!porEmail(guest.email)) {
      db.seq.conta += 1;
      db.contas.push({ id: db.seq.conta, ...guest, ativo: true, criado_em: agora() });
    }
    const adm = porEmail('admin@mutility.com.br') || db.contas.find((c) => c.perfil === 'admin' && c.nome === murilo.nome);
    if (adm && !db.contas.some((c) => c !== adm && chaveEmail(c.email) === chaveEmail(murilo.email))) {
      Object.assign(adm, { nome: murilo.nome, email: murilo.email, senha: murilo.senha, perfil: 'admin' });
    } else if (!adm && !porEmail(murilo.email)) {
      db.seq.conta += 1;
      db.contas.push({ id: db.seq.conta, ...murilo, ativo: true, criado_em: agora() });
    }
    if (!porEmail(rafaela.email) && !porEmail('rafaela@mutility.com.br')) {
      db.seq.conta = Math.max(db.seq.conta, ...db.contas.map((c) => c.id)) + 1;
      db.contas.push({ id: db.seq.conta, ...rafaela, ativo: true, criado_em: agora() });
    }
    db.migracoes.push('contas-2026-11-25');
    salvar(db);
  }

  /**
   * 27/11/2026: IDs fixos dos crachás (Murilo N.B 0001 · Rafaela S.B 0002 · Total Guest 0003)
   * e a Rafaela passa a ser usuária (não mais administradora). Uma vez só.
   * Outras contas que estavam nesses IDs ganham um número novo; a auditoria e a
   * sessão aberta acompanham a troca.
   */
  function migrarIds(db) {
    db.migracoes = Array.isArray(db.migracoes) ? db.migracoes : [];
    if (db.migracoes.includes('ids-2026-11-27')) return;
    const porEmail = (e) => db.contas.find((c) => chaveEmail(c.email) === chaveEmail(e));
    const fixas = new Map();   // conta -> id fixo
    CONTAS_PADRAO.forEach((padrao, i) => { const c = porEmail(padrao.email); if (c) fixas.set(c, i + 1); });
    const rafaela = porEmail(CONTA_RAFAELA.email);
    if (rafaela) rafaela.perfil = 'usuario';
    const mapa = new Map();   // id antigo -> id novo
    let proximo = Math.max(CONTAS_PADRAO.length, ...db.contas.filter((c) => !fixas.has(c)).map((c) => c.id));
    for (const c of db.contas) {
      const novo = fixas.has(c) ? fixas.get(c) : (c.id <= CONTAS_PADRAO.length ? (proximo += 1) : c.id);
      if (novo !== c.id) mapa.set(c.id, novo);
    }
    if (mapa.size) {
      db.contas.forEach((c) => { if (mapa.has(c.id)) c.id = mapa.get(c.id); });
      (db.auditoria || []).forEach((r) => { if (mapa.has(r.usuario_id)) r.usuario_id = mapa.get(r.usuario_id); });
      // a sessão aberta (token "local-<id>") continua apontando para a mesma pessoa
      for (const area of [sessionStorage, localStorage]) {
        try {
          const bruto = area.getItem('mutility-sessao');
          const sessao = bruto && JSON.parse(bruto);
          const antigo = Number(String(sessao?.token || '').replace('local-', ''));
          if (sessao && mapa.has(antigo)) {
            sessao.token = `local-${mapa.get(antigo)}`;
            if (sessao.usuario) { sessao.usuario.id = mapa.get(antigo); }
            area.setItem('mutility-sessao', JSON.stringify(sessao));
          }
        } catch { /* sem sessão guardada */ }
      }
    }
    // quem está logado como Rafaela vê o cargo novo já na próxima tela
    for (const area of [sessionStorage, localStorage]) {
      try {
        const sessao = JSON.parse(area.getItem('mutility-sessao') || 'null');
        if (sessao?.usuario && rafaela && sessao.token === `local-${rafaela.id}`) {
          sessao.usuario.perfil = 'usuario';
          area.setItem('mutility-sessao', JSON.stringify(sessao));
        }
      } catch { /* sem sessão guardada */ }
    }
    db.contas.sort((a, b) => a.id - b.id);
    db.seq.conta = Math.max(db.seq.conta || 0, ...db.contas.map((c) => c.id));
    db.migracoes.push('ids-2026-11-27');
    salvar(db);
  }

  function inicial() {
    const criado = agora();
    return {
      versao: 1,
      seq: { volume: 0, conta: CONTAS_PADRAO.length, cliente: Math.max(...CLIENTES_PADRAO.map((c) => c.id)), auditoria: 0 },
      contas: CONTAS_PADRAO.map((c, i) => ({ id: i + 1, ...c, ativo: true, criado_em: criado })),
      migracoes: ['contas-2026-11-25', 'rafaela-sb', 'ids-2026-11-27'],
      // Clientes do setor (CLIENTES_PADRAO)
      clientes: CLIENTES_PADRAO.map((c) => ({ ...c })),
      volumes: [],
      auditoria: [],
    };
  }

  /**
   * Ciclos mensais: o banco tem o ciclo aberto (ex.: "2026-11") e cada volume guarda de qual
   * ciclo é e o #ID dentro dele (id_ciclo). "numero" continua sendo a chave interna única,
   * porque o #001 de Outubro e o #001 de Novembro podem estar juntos na mesa.
   */
  function garantirCiclo(db) {
    let mudou = false;
    if (!db.ciclo?.id) { db.ciclo = { id: Catalogo.cicloDe(), aberto_em: agora() }; mudou = true; }
    for (const v of db.volumes) {
      if (!v.ciclo) { v.ciclo = db.ciclo.id; mudou = true; }
      if (!Number.isInteger(v.id_ciclo)) { v.id_ciclo = v.numero; mudou = true; }
    }
    if (!Number.isInteger(db.seq.ciclo)) {
      db.seq.ciclo = Math.max(0, ...db.volumes.filter((v) => v.ciclo === db.ciclo.id).map((v) => v.id_ciclo));
      mudou = true;
    }
    if (mudou) salvar(db);
  }

  function ler() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        const db = JSON.parse(bruto);
        if (db?.versao === 1) { migrarContas(db); migrarRafaela(db); migrarIds(db); migrarIcs(db); garantirClientes(db); garantirCiclo(db); return db; }
      }
    } catch { /* corrompido ou indisponível: recomeça */ }
    const db = inicial();
    migrarIcs(db);
    garantirCiclo(db);
    salvar(db);
    return db;
  }

  function salvar(db) {
    try { localStorage.setItem(CHAVE, JSON.stringify(db)); }
    catch { throw new ErroBanco(507, 'O armazenamento do navegador está cheio ou bloqueado.'); }
  }

  /* ---------- Sessão ---------- */
  function contaDoToken(db, token) {
    const id = Number(String(token || '').replace('local-', ''));
    const conta = db.contas.find((c) => c.id === id);
    if (!conta || !conta.ativo) throw naoLogado();
    return conta;
  }
  const publico = (c) => ({ id: c.id, nome: c.nome, email: c.email, perfil: c.perfil, ativo: c.ativo, foto: c.foto || '', criado_em: c.criado_em });
  const exigirAdmin = (conta) => { if (conta.perfil !== 'admin') throw negado(); };

  /* ---------- Auditoria ---------- */
  function registrar(db, conta, acao, alvo = '', detalhe = '') {
    db.seq.auditoria += 1;
    db.auditoria.push({
      id: db.seq.auditoria, em: agora(),
      usuario_id: conta?.id ?? null, usuario: conta?.nome || 'Sistema', perfil: conta?.perfil || '',
      acao, alvo, detalhe,
    });
    if (db.auditoria.length > LIMITE_AUDITORIA) db.auditoria.splice(0, db.auditoria.length - LIMITE_AUDITORIA);
  }

  /* ---------- Volumes ---------- */
  function clientePorCnpj(db, cnpj) {
    const d = Catalogo.somenteDigitos(cnpj);
    return d ? db.clientes.find((c) => Catalogo.somenteDigitos(c.cnpj) === d) || null : null;
  }

  /** #ID que aparece na tela, na etiqueta e na planilha: o número dentro do ciclo. */
  const cod = (v) => Catalogo.codigo(v.id_ciclo ?? v.numero);

  function volumeDict(db, v) {
    const cliente = db.clientes.find((c) => c.id === v.cliente_id) || null;
    const ciclo = v.ciclo || db.ciclo?.id;
    return {
      ...copia(v),
      codigo: cod(v),
      ciclo,
      ciclo_titulo: Catalogo.tituloCiclo(ciclo),
      // ficou de um mês que já foi fechado (aparece com o marcador e o visual "antigo")
      anterior: !!db.ciclo && ciclo !== db.ciclo.id,
      cliente_nome: cliente?.nome || v.cliente_nome || '',
      cliente_cor: cliente?.cor || '',
      tipo_titulo: Catalogo.tipo(v.tipo)?.titulo || v.tipo,
      status_titulo: Catalogo.statusDe(v.status)?.titulo || v.status,
      local_titulo: Catalogo.local(v.local)?.titulo || v.local,
    };
  }

  /**
   * Valida e normaliza os campos de um volume (novo ou alterado).
   * Regras: tipo, status e local do catálogo; DANFE válida preenche NF, série, CNPJ (e o cliente pelo CNPJ);
   * Tratado/Devolução exigem AWB e ganham DATA (S); os demais status não têm data de saída.
   */
  function normalizar(db, base, campos, { entrada = false } = {}) {
    const v = { ...base };
    const texto = (valor, max = 120) => String(valor ?? '').trim().slice(0, max);

    if ('tipo' in campos) v.tipo = campos.tipo;
    if ('status' in campos) v.status = campos.status;
    if ('local' in campos) v.local = campos.local;
    if ('awb' in campos) v.awb = Catalogo.formatarAwb(texto(campos.awb, 60));
    if ('nota' in campos) v.nota = texto(campos.nota, 1000);
    if ('anexos' in campos) {
      v.anexos = (Array.isArray(campos.anexos) ? campos.anexos : []).slice(0, 4)
        .filter((a) => a && a.id).map((a) => ({ id: String(a.id).slice(0, 40), nome: texto(a.nome, 80), tipo: texto(a.tipo, 40), tamanho: Number(a.tamanho) || 0 }));
    }
    if ('id_ciclo' in campos && campos.id_ciclo !== '' && campos.id_ciclo != null) {
      const id = Number(String(campos.id_ciclo).replace(/^#/, ''));
      if (!Number.isInteger(id) || id < 1 || id > 9999) throw invalido('O #ID precisa ser um número de 1 a 9999.');
      const ciclo = v.ciclo || db.ciclo?.id;
      if (db.volumes.some((x) => x.numero !== v.numero && (x.ciclo || db.ciclo?.id) === ciclo && (x.id_ciclo ?? x.numero) === id)) {
        throw new ErroBanco(409, `Já existe o ${Catalogo.codigo(id)} neste mês.`);
      }
      v.id_ciclo = id;
      if (ciclo === db.ciclo?.id && id > (db.seq.ciclo || 0)) db.seq.ciclo = id;   // a numeração continua depois do maior
    }
    if ('nf' in campos) v.nf = Catalogo.somenteDigitos(campos.nf).slice(0, 12);
    if ('serie' in campos) v.serie = Catalogo.somenteDigitos(campos.serie).slice(0, 5);
    if ('cnpj' in campos) v.cnpj = Catalogo.somenteDigitos(campos.cnpj).slice(0, 14);
    if ('cliente_id' in campos) v.cliente_id = campos.cliente_id ? Number(campos.cliente_id) : null;
    // Cliente escrito à mão: se o nome bater com um cadastrado, liga ao cadastro (e pega a cor)
    if ('cliente_nome' in campos) {
      v.cliente_nome = texto(campos.cliente_nome, 60);
      const porNome = db.clientes.find((c) => chaveEmail(c.nome) === chaveEmail(v.cliente_nome));
      v.cliente_id = porNome ? porNome.id : null;
      if (porNome) v.cliente_nome = porNome.nome;
      // sem CNPJ digitado (pedido / sem identificação): usa o do cadastro, para a coluna CNPJ da planilha
      if (porNome && !v.cnpj && !('cnpj' in campos && campos.cnpj)) v.cnpj = Catalogo.somenteDigitos(porNome.cnpj).slice(0, 14);
    }

    if ('codigo_caixa' in campos) {
      const bruto = texto(campos.codigo_caixa, 60);
      const danfe = Catalogo.danfe(bruto);
      if (danfe) {
        if (!danfe.valida) throw invalido('Essa chave DANFE não confere (dígito verificador). Confira se bipou a etiqueta certa.');
        v.chave = danfe.chave; v.pedido = '';
        v.nf = danfe.nf; v.serie = danfe.serie; v.cnpj = danfe.cnpj;
        const cli = clientePorCnpj(db, danfe.cnpj);
        if (cli && !v.cliente_id && !v.cliente_nome) { v.cliente_id = cli.id; v.cliente_nome = cli.nome; }
      } else {
        if (/^\d{40,48}$/.test(bruto.replace(/\s/g, ''))) throw invalido('A chave DANFE tem 44 dígitos. Confira se nenhum número ficou de fora.');
        v.chave = ''; v.pedido = bruto.toUpperCase();
      }
    }

    if (!Catalogo.tipo(v.tipo)) throw invalido('Escolha o tipo de não conformidade.');
    if (!Catalogo.statusDe(v.status)) throw invalido('Escolha o status atual da encomenda.');
    if (!Catalogo.local(v.local)) throw invalido('Escolha para onde o volume vai.');
    if (entrada && !Catalogo.statusDaEntrada(v.tipo).some((s) => s.id === v.status)) {
      throw invalido(`${Catalogo.tipo(v.tipo).titulo} só entra como: ${Catalogo.statusDaEntrada(v.tipo).map((s) => s.titulo).join(' ou ')}.`);
    }
    if (!Catalogo.statusDaEdicao(v.tipo).some((s) => s.id === v.status)) throw invalido(`O status ${Catalogo.statusDe(v.status).titulo} não vale para ${Catalogo.tipo(v.tipo).titulo}.`);
    const locais = Catalogo.locaisPermitidos(v.tipo, v.status).map((l) => l.id);
    if (!locais.includes(v.local)) {
      if (entrada) throw invalido(`Esse volume só pode ir para: ${Catalogo.locaisPermitidos(v.tipo, v.status).map((l) => l.titulo).join(', ')}.`);
      if (locais.length) v.local = locais[0];        // a troca de status muda o destino (ex.: Duplicidade → Devolução)
    }
    if (!v.chave && !v.pedido) throw invalido('Bipe a DANFE ou digite o número do pedido.');
    if (v.cliente_id && !db.clientes.some((c) => c.id === v.cliente_id)) throw invalido('Cliente não encontrado.');
    if (v.cnpj && v.cnpj.length !== 14) throw invalido('O CNPJ precisa ter 14 dígitos.');

    if (Catalogo.statusDe(v.status).saida) {
      if (Catalogo.exigeAwb(v.status, v.tipo) && !v.awb) throw invalido(`Para marcar como ${Catalogo.statusDe(v.status).titulo}, informe a AWB: sem ela o volume não sai do NC.`);
      if (!v.data_saida) v.data_saida = agora();
    } else {
      v.data_saida = null;
      v.oculto_bandeja = false;
    }
    return v;
  }

  const ROTULOS_CAMPO = {
    id_ciclo: '#ID', status: 'Status', tipo: 'Tipo', local: 'Local', awb: 'AWB', nota: 'Nota', nf: 'NF', serie: 'Série',
    cnpj: 'CNPJ', cliente_nome: 'Cliente', chave: 'DANFE', pedido: 'Pedido', data_saida: 'DATA (S)',
  };
  function valorLegivel(db, campo, valor) {
    if (valor == null || valor === '') return '—';
    if (campo === 'id_ciclo') return Catalogo.codigo(valor);
    if (campo === 'status') return Catalogo.statusDe(valor)?.titulo || valor;
    if (campo === 'tipo') return Catalogo.tipo(valor)?.titulo || valor;
    if (campo === 'local') return Catalogo.local(valor)?.titulo || valor;
    if (campo === 'cliente_id') return db.clientes.find((c) => c.id === valor)?.nome || `#${valor}`;
    if (campo === 'data_saida') return new Date(valor).toLocaleString('pt-BR');
    return String(valor);
  }

  function buscarVolume(db, numero) {
    const v = db.volumes.find((x) => x.numero === Number(numero));
    if (!v) throw naoAchou(`Volume ${Catalogo.codigo(numero)} não encontrado.`);
    return v;
  }

  /* ---------- Rotas ---------- */
  const rotas = {
    // Entra com o e-mail OU com o nome de usuário (ex.: "MURILO N.B"), sem ligar para maiúsculas e acentos
    login(db, _, { email, senha }) {
      const chave = chaveEmail(email).replace(/\s+/g, ' ');
      const conta = db.contas.find((c) => chaveEmail(c.email) === chave)
        || db.contas.find((c) => chaveEmail(c.nome).replace(/\s+/g, ' ') === chave);
      if (!conta || conta.senha !== senha) throw new ErroBanco(401, 'Usuário ou senha incorretos.');
      if (!conta.ativo) throw new ErroBanco(403, 'Esta conta está suspensa. Fale com o administrador.');
      registrar(db, conta, 'Entrou no sistema');
      return { token: `local-${conta.id}`, usuario: publico(conta) };
    },
    eu(db, token) { return publico(contaDoToken(db, token)); },
    trocarSenha(db, token, { atual, nova }) {
      const conta = contaDoToken(db, token);
      if (conta.senha !== atual) throw invalido('A senha atual não confere.');
      if (String(nova || '').length < MIN_SENHA) throw invalido(`A nova senha precisa de pelo menos ${MIN_SENHA} caracteres.`);
      conta.senha = nova;
      registrar(db, conta, 'Trocou a própria senha');
      return { ok: true };
    },

    // Crachás (contas) — administrador
    listarContas(db, token) { exigirAdmin(contaDoToken(db, token)); return db.contas.map(publico); },
    criarConta(db, token, { nome, email, perfil = 'usuario', senha = SENHA_PADRAO }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      nome = String(nome || '').trim(); email = String(email || '').trim();
      if (nome.length < 2) throw invalido('Informe o nome.');
      if (!EMAIL.test(email)) throw invalido('Informe um e-mail válido.');
      if (!PERFIS.includes(perfil)) throw invalido('Cargo inválido.');
      if (String(senha).length < MIN_SENHA) throw invalido(`A senha precisa de pelo menos ${MIN_SENHA} caracteres.`);
      if (db.contas.some((c) => chaveEmail(c.email) === chaveEmail(email))) throw new ErroBanco(409, 'Já existe uma conta com esse e-mail.');
      if (db.contas.some((c) => chaveEmail(c.nome) === chaveEmail(nome))) throw new ErroBanco(409, 'Já existe uma conta com esse nome (o nome também serve para entrar).');
      db.seq.conta += 1;
      const conta = { id: db.seq.conta, nome, email, perfil, senha, ativo: true, foto: '', criado_em: agora() };
      db.contas.push(conta);
      registrar(db, adm, 'Criou um crachá', nome, `${perfil === 'admin' ? 'Administrador' : 'Usuário'} · ${email}`);
      return publico(conta);
    },
    atualizarConta(db, token, { id, ...campos }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      const conta = db.contas.find((c) => c.id === Number(id));
      if (!conta) throw naoAchou('Conta não encontrada.');
      if (conta.id === adm.id && (campos.ativo === false || campos.perfil === 'usuario')) {
        throw invalido('Você não pode suspender nem rebaixar a própria conta de administrador.');
      }
      const mudou = [];
      if ('nome' in campos && String(campos.nome).trim().length >= 2) {
        if (db.contas.some((c) => c.id !== conta.id && chaveEmail(c.nome) === chaveEmail(campos.nome))) throw new ErroBanco(409, 'Já existe uma conta com esse nome (o nome também serve para entrar).');
        conta.nome = String(campos.nome).trim(); mudou.push('nome');
      }
      if ('email' in campos) {
        if (!EMAIL.test(campos.email)) throw invalido('Informe um e-mail válido.');
        if (db.contas.some((c) => c.id !== conta.id && chaveEmail(c.email) === chaveEmail(campos.email))) throw new ErroBanco(409, 'Já existe uma conta com esse e-mail.');
        conta.email = String(campos.email).trim(); mudou.push('e-mail');
      }
      if ('perfil' in campos && PERFIS.includes(campos.perfil)) { conta.perfil = campos.perfil; mudou.push('cargo'); }
      if ('ativo' in campos) { conta.ativo = !!campos.ativo; mudou.push(conta.ativo ? 'reativada' : 'suspensa'); }
      registrar(db, adm, 'Alterou um crachá', conta.nome, mudou.join(', '));
      return publico(conta);
    },
    redefinirSenha(db, token, { id, senha }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      const conta = db.contas.find((c) => c.id === Number(id));
      if (!conta) throw naoAchou('Conta não encontrada.');
      if (String(senha || '').length < MIN_SENHA) throw invalido(`A senha precisa de pelo menos ${MIN_SENHA} caracteres.`);
      conta.senha = senha;
      registrar(db, adm, 'Gerou senha nova', conta.nome);
      return { ok: true };
    },

    // ICS (o aplicativo de trabalho): a própria pessoa vê com o PIN (duplo clique no Helpy);
    // o administrador edita em Crachás. A senha do ICS nunca vai para a auditoria.
    verIcs(db, token, { pin }) {
      const conta = contaDoToken(db, token);
      if (String(pin || '') !== PIN_ICS) throw new ErroBanco(403, 'PIN errado.');
      registrar(db, conta, 'Viu o usuário e a senha do ICS');
      return { usuario: conta.ics_usuario || '', senha: conta.ics_senha || '' };
    },
    icsDaConta(db, token, { id }) {
      exigirAdmin(contaDoToken(db, token));
      const conta = db.contas.find((c) => c.id === Number(id));
      if (!conta) throw naoAchou('Conta não encontrada.');
      return { usuario: conta.ics_usuario || '', senha: conta.ics_senha || '' };
    },
    salvarIcs(db, token, { id, usuario, senha }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      const conta = db.contas.find((c) => c.id === Number(id));
      if (!conta) throw naoAchou('Conta não encontrada.');
      conta.ics_usuario = String(usuario ?? '').trim();
      conta.ics_senha = String(senha ?? '');
      registrar(db, adm, 'Alterou o usuário e a senha do ICS', conta.nome, conta.ics_usuario ? '' : 'ICS apagado');
      return { ok: true };
    },

    // Volumes do Controle NC
    volumes(db, token) { contaDoToken(db, token); return db.volumes.map((v) => volumeDict(db, v)); },
    volume(db, token, { numero }) { contaDoToken(db, token); return volumeDict(db, buscarVolume(db, numero)); },

    inserirVolume(db, token, dados) {
      const conta = contaDoToken(db, token);
      const v = normalizar(db, {
        tipo: null, status: null, local: null, chave: '', pedido: '', nf: '', serie: '', cnpj: '',
        cliente_id: null, cliente_nome: '', awb: '', nota: '', anexos: [], data_entrada: agora(), data_saida: null, oculto_bandeja: false,
      }, dados, { entrada: true });
      db.seq.volume += 1;
      v.numero = db.seq.volume;
      db.seq.ciclo += 1;                 // #ID do mês: recomeça do #001 a cada ciclo
      v.id_ciclo = db.seq.ciclo;
      v.ciclo = db.ciclo.id;
      v.criado_por = conta.nome;
      // Registro em sequência: as peças da mesma leva formam um "pacote de tickets"
      if (dados?.pacote) v.pacote = String(dados.pacote).replace(/[^\w-]/g, '').slice(0, 40);
      v.criado_em = v.data_entrada;
      v.atualizado_em = v.data_entrada;
      v.historico = [{ em: v.data_entrada, por: conta.nome, texto: `Inserido no setor NC (${Catalogo.statusDe(v.status).titulo})` }];
      db.volumes.push(v);
      registrar(db, conta, 'Inseriu um volume', cod(v),
        `${Catalogo.tipo(v.tipo).titulo} · ${Catalogo.statusDe(v.status).titulo} · ${Catalogo.local(v.local).titulo}`);
      return volumeDict(db, v);
    },

    atualizarVolume(db, token, { numero, ...campos }) {
      const conta = contaDoToken(db, token);
      const atual = buscarVolume(db, numero);
      const novo = normalizar(db, atual, campos);
      const mudancas = Object.keys(ROTULOS_CAMPO)
        .filter((k) => (atual[k] ?? '') !== (novo[k] ?? ''))
        .map((k) => `${ROTULOS_CAMPO[k]}: ${valorLegivel(db, k, atual[k])} → ${valorLegivel(db, k, novo[k])}`);
      if (!mudancas.length) return volumeDict(db, atual);
      novo.atualizado_em = agora();
      novo.historico = [...(atual.historico || []), ...mudancas.map((texto) => ({ em: novo.atualizado_em, por: conta.nome, texto }))];
      Object.assign(atual, novo);
      registrar(db, conta, 'Alterou um volume', cod(atual), mudancas.join(' · '));
      return volumeDict(db, atual);
    },

    /** Número do próximo pacote de tickets (Registro em sequência): pct-001, pct-002… */
    novoPacote(db, token) {
      contaDoToken(db, token);
      db.seq.pacote = (Number(db.seq.pacote) || 0) + 1;
      return { id: `pct-${String(db.seq.pacote).padStart(3, '0')}`, numero: db.seq.pacote };
    },

    excluirVolume(db, token, { numero }) {
      const conta = contaDoToken(db, token);
      const v = buscarVolume(db, numero);
      db.volumes = db.volumes.filter((x) => x !== v);
      registrar(db, conta, 'Excluiu um volume', cod(v),
        `${Catalogo.tipo(v.tipo)?.titulo || v.tipo} · ${v.chave || v.pedido}`);
      return { ok: true };
    },

    /** Tira da bandeja "Saíram hoje" (continua no Histórico de Tickets). */
    tirarDaBandeja(db, token, { numero }) {
      const conta = contaDoToken(db, token);
      const v = buscarVolume(db, numero);
      if (!Catalogo.saiu(v)) throw invalido('Só volumes que já saíram do NC vão para o histórico.');
      v.oculto_bandeja = true;
      registrar(db, conta, 'Tirou da bandeja do dia', cod(v));
      return { ok: true };
    },

    // Clientes
    clientes(db, token) { contaDoToken(db, token); return copia(db.clientes); },
    salvarCliente(db, token, { id, nome, cnpj = '', cor }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      nome = String(nome || '').trim();
      const d = Catalogo.somenteDigitos(cnpj);
      if (nome.length < 2) throw invalido('Informe o nome do cliente.');
      if (d && d.length !== 14) throw invalido('O CNPJ precisa ter 14 dígitos.');
      if (d && db.clientes.some((c) => c.id !== Number(id) && Catalogo.somenteDigitos(c.cnpj) === d)) throw new ErroBanco(409, 'Já existe um cliente com esse CNPJ.');
      const corOk = /^#[0-9a-f]{6}$/i.test(cor || '') ? cor : Catalogo.cores[db.clientes.length % Catalogo.cores.length];
      let cli = db.clientes.find((c) => c.id === Number(id));
      if (cli) {
        Object.assign(cli, { nome, cnpj: d, cor: corOk });
        registrar(db, adm, 'Alterou um cliente', nome, d ? Catalogo.formatarCnpj(d) : 'sem CNPJ');
      } else {
        db.seq.cliente += 1;
        cli = { id: db.seq.cliente, nome, cnpj: d, cor: corOk };
        db.clientes.push(cli);
        registrar(db, adm, 'Cadastrou um cliente', nome, d ? Catalogo.formatarCnpj(d) : 'sem CNPJ');
      }
      return copia(cli);
    },
    removerCliente(db, token, { id }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      const cli = db.clientes.find((c) => c.id === Number(id));
      if (!cli) throw naoAchou('Cliente não encontrado.');
      // Os volumes guardam o nome para o histórico não perder a informação
      db.volumes.forEach((v) => { if (v.cliente_id === cli.id) { v.cliente_nome = cli.nome; v.cliente_id = null; } });
      db.clientes = db.clientes.filter((c) => c !== cli);
      if (cli.cnpj) db.clientes_removidos = [...new Set([...(db.clientes_removidos || []), cli.cnpj])];   // não volta sozinho
      registrar(db, adm, 'Removeu um cliente', cli.nome);
      return { ok: true };
    },

    // Administração
    auditoria(db, token) { exigirAdmin(contaDoToken(db, token)); return copia(db.auditoria).reverse(); },
    registrarAcao(db, token, { acao, alvo, detalhe }) {
      registrar(db, contaDoToken(db, token), String(acao).slice(0, 80), alvo, detalhe);
      return { ok: true };
    },
    /** Alinha a numeração com a planilha: o próximo volume recebe este #ID. */
    definirProximoId(db, token, { numero }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      const n = Math.floor(Number(numero));
      const maior = Math.max(0, ...db.volumes.filter((v) => v.ciclo === db.ciclo.id).map((v) => v.id_ciclo));
      if (!Number.isFinite(n) || n < 1) throw invalido('Informe um número de #ID válido.');
      if (n <= maior) throw invalido(`Já existe o volume ${Catalogo.codigo(maior)} neste mês: o próximo #ID precisa ser maior que ${maior}.`);
      db.seq.ciclo = n - 1;
      registrar(db, adm, 'Definiu o próximo #ID', Catalogo.codigo(n), Catalogo.tituloCiclo(db.ciclo.id));
      return { proximo: n };
    },
    proximoId(db, token) { contaDoToken(db, token); return { proximo: db.seq.ciclo + 1 }; },

    // ---------- Ciclo do mês ----------
    /** O ciclo aberto e se o mês já virou (precisa fechar). */
    ciclo(db, token) {
      contaDoToken(db, token);
      const doCiclo = db.volumes.filter((v) => v.ciclo === db.ciclo.id);
      return {
        id: db.ciclo.id, titulo: Catalogo.tituloCiclo(db.ciclo.id), nome: Catalogo.nomeMes(db.ciclo.id),
        aberto_em: db.ciclo.aberto_em, fechados: copia(db.ciclos_fechados || []),
        proximo: db.seq.ciclo + 1, volumes: doCiclo.length,
        anteriores: db.volumes.filter((v) => v.ciclo !== db.ciclo.id).length,
        // o mês do calendário passou do mês do ciclo aberto
        pendente: Catalogo.cicloDe() > db.ciclo.id,
        mes_atual: Catalogo.cicloDe(),
      };
    },
    /**
     * Cópia completa do que está no banco agora (para o arquivo do mês). Quem estiver logado pode
     * pedir: é ela que o salvamento automático grava na pasta escolhida.
     */
    backupCiclo(db, token) {
      const conta = contaDoToken(db, token);
      return {
        app: 'M-Utility', tipo: 'controle-nc-ciclo', versao: 1,
        ciclo: { id: db.ciclo.id, titulo: Catalogo.tituloCiclo(db.ciclo.id), aberto_em: db.ciclo.aberto_em },
        gerado_em: agora(), gerado_por: conta.nome,
        volumes: db.volumes.map((v) => volumeDict(db, v)),
        clientes: copia(db.clientes),
      };
    },
    /**
     * Fecha o ciclo DEPOIS que os arquivos foram salvos: o que já saiu do NC fica só no arquivo do mês;
     * o que ainda está no setor passa para o mês novo com o mesmo #ID (marcado como do mês anterior).
     * O #ID recomeça do #001.
     */
    fecharCiclo(db, token, { id }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      if (id !== db.ciclo.id) throw new ErroBanco(409, 'O ciclo mudou enquanto os arquivos eram salvos. Tente de novo.');
      const fechado = db.ciclo.id;
      const saidos = db.volumes.filter((v) => Catalogo.saiu(v));
      const ficam = db.volumes.filter((v) => !Catalogo.saiu(v));
      const novo = Catalogo.cicloDe() > fechado ? Catalogo.cicloDe() : Catalogo.proximoCiclo(fechado);
      db.volumes = ficam;
      db.ciclos_fechados = [...(db.ciclos_fechados || []), { id: fechado, fechado_em: agora(), por: adm.nome, volumes: saidos.length + ficam.length, saidos: saidos.length, passaram: ficam.length }];
      db.ciclo = { id: novo, aberto_em: agora() };
      db.seq.ciclo = 0;
      registrar(db, adm, 'Fechou o ciclo do mês', Catalogo.tituloCiclo(fechado),
        `${saidos.length} saíram (ficam no arquivo) · ${ficam.length} passaram para ${Catalogo.tituloCiclo(novo)} · #ID recomeça do #001`);
      return {
        fechado: { id: fechado, titulo: Catalogo.tituloCiclo(fechado) },
        novo: { id: novo, titulo: Catalogo.tituloCiclo(novo) },
        arquivados: saidos.map((v) => ({ numero: v.numero, anexos: (v.anexos || []).map((a) => a.id) })),
        passaram: ficam.length,
      };
    },
    /** Desastre (o navegador foi limpo): volta o mês a partir do backup salvo na pasta. */
    restaurarCiclo(db, token, { backup }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      if (backup?.tipo !== 'controle-nc-ciclo' || !Array.isArray(backup.volumes) || !backup.ciclo?.id) throw invalido('Este arquivo não é um backup do Controle NC (.backup.json).');
      const CAMPOS = ['numero', 'id_ciclo', 'ciclo', 'tipo', 'status', 'local', 'chave', 'pedido', 'nf', 'serie', 'cnpj', 'cliente_id', 'cliente_nome',
        'awb', 'nota', 'anexos', 'data_entrada', 'data_saida', 'criado_por', 'criado_em', 'atualizado_em', 'oculto_bandeja', 'historico', 'pacote'];
      db.volumes = backup.volumes.map((v) => {
        const limpo = Object.fromEntries(CAMPOS.filter((k) => k in v).map((k) => [k, copia(v[k])]));
        if (limpo.cliente_id && !db.clientes.some((c) => c.id === limpo.cliente_id)) limpo.cliente_id = null;
        return limpo;
      });
      db.ciclo = { id: backup.ciclo.id, aberto_em: backup.ciclo.aberto_em || agora() };
      db.seq.volume = Math.max(db.seq.volume, ...db.volumes.map((v) => v.numero || 0));
      db.seq.ciclo = Math.max(0, ...db.volumes.filter((v) => v.ciclo === db.ciclo.id).map((v) => v.id_ciclo || 0));
      registrar(db, adm, 'Restaurou o mês pelo backup', Catalogo.tituloCiclo(db.ciclo.id), `${db.volumes.length} volume(s)`);
      return { volumes: db.volumes.length, ciclo: Catalogo.tituloCiclo(db.ciclo.id) };
    },
    limparVolumes(db, token) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      const n = db.volumes.length;
      db.volumes = [];
      registrar(db, adm, 'Apagou todos os volumes', '', `${n} volume(s)`);
      return { removidos: n };
    },
    exportar(db, token) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      registrar(db, adm, 'Exportou o banco (JSON)');
      const saida = copia(db);
      saida.contas = saida.contas.map(({ senha, ics_senha, ...c }) => c);   // a cópia não leva senhas (nem a do ICS)
      return saida;
    },
    importarVolumes(db, token, { volumes }) {
      const adm = contaDoToken(db, token); exigirAdmin(adm);
      if (!Array.isArray(volumes)) throw invalido('Arquivo sem a lista "volumes".');
      const CAMPOS = ['tipo', 'status', 'local', 'chave', 'pedido', 'nf', 'serie', 'cnpj', 'cliente_id', 'cliente_nome',
        'awb', 'nota', 'data_entrada', 'data_saida', 'criado_por', 'oculto_bandeja', 'historico', 'pacote'];
      let n = 0;
      for (const original of volumes) {
        const bruto = Object.fromEntries(CAMPOS.filter((k) => k in original).map((k) => [k, original[k]]));
        if (bruto.cliente_id && !db.clientes.some((c) => c.id === Number(bruto.cliente_id))) bruto.cliente_id = null;
        const v = normalizar(db, { ...bruto, data_entrada: bruto.data_entrada || agora() }, {});
        db.seq.volume += 1;
        v.numero = db.seq.volume;
        db.seq.ciclo += 1;
        v.id_ciclo = db.seq.ciclo;
        v.ciclo = db.ciclo.id;
        v.criado_por = v.criado_por || adm.nome;
        v.criado_em = v.data_entrada;
        v.atualizado_em = agora();
        v.historico = [...(Array.isArray(bruto.historico) ? bruto.historico : []), { em: agora(), por: adm.nome, texto: 'Importado' }];
        db.volumes.push(v); n += 1;
      }
      registrar(db, adm, 'Importou volumes', '', `${n} volume(s)`);
      return { importados: n };
    },
  };

  const SO_LEITURA = new Set(['eu', 'icsDaConta', 'volumes', 'volume', 'clientes', 'auditoria', 'listarContas', 'proximoId', 'ciclo', 'backupCiclo', 'exportar', 'login', 'registrarAcao']);

  async function chamar(rota, corpo = {}) {
    const db = ler();
    try {
      const dados = rotas[rota](db, window.Sessao?.token(), corpo);
      salvar(db);
      // avisa quem salva os arquivos do mês na pasta (js/arquivos.js) que algo mudou
      if (!SO_LEITURA.has(rota)) window.dispatchEvent(new CustomEvent('mutility:dados', { detail: { rota } }));
      return { ok: true, status: 200, dados };
    } catch (erro) {
      if (!(erro instanceof ErroBanco)) { console.error(erro); return { ok: false, status: 500, dados: { erro: 'Erro inesperado. Veja o console do navegador.' } }; }
      // Mesmo com erro, guarda a auditoria do que já aconteceu (ex.: login)
      return { ok: false, status: erro.status, dados: { erro: erro.message } };
    }
  }

  return { chamar, CHAVE, SENHA_PADRAO, ler };
})();

const API = {
  // Contas e acesso
  login(email, senha) { return Banco.chamar('login', { email, senha }); },
  eu() { return Banco.chamar('eu'); },
  trocarSenha(atual, nova) { return Banco.chamar('trocarSenha', { atual, nova }); },
  listarContas() { return Banco.chamar('listarContas'); },
  criarConta(dados) { return Banco.chamar('criarConta', dados); },
  atualizarConta(id, dados) { return Banco.chamar('atualizarConta', { id, ...dados }); },
  redefinirSenha(id, senha) { return Banco.chamar('redefinirSenha', { id, senha }); },
  verIcs(pin) { return Banco.chamar('verIcs', { pin }); },
  icsDaConta(id) { return Banco.chamar('icsDaConta', { id }); },
  salvarIcs(id, usuario, senha) { return Banco.chamar('salvarIcs', { id, usuario, senha }); },

  // Volumes
  volumes() { return Banco.chamar('volumes'); },
  volume(numero) { return Banco.chamar('volume', { numero }); },
  /** dados: { tipo, status, local, codigo_caixa, nf?, serie?, cnpj?, cliente_id?, awb?, nota? } */
  inserirVolume(dados) { return Banco.chamar('inserirVolume', dados); },
  atualizarVolume(numero, campos) { return Banco.chamar('atualizarVolume', { numero, ...campos }); },
  excluirVolume(numero) { return Banco.chamar('excluirVolume', { numero }); },
  novoPacote() { return Banco.chamar('novoPacote'); },
  tirarDaBandeja(numero) { return Banco.chamar('tirarDaBandeja', { numero }); },

  // Clientes
  clientes() { return Banco.chamar('clientes'); },
  salvarCliente(dados) { return Banco.chamar('salvarCliente', dados); },
  removerCliente(id) { return Banco.chamar('removerCliente', { id }); },

  // Administração
  auditoria() { return Banco.chamar('auditoria'); },
  registrarAcao(acao, alvo = '', detalhe = '') { return Banco.chamar('registrarAcao', { acao, alvo, detalhe }); },
  limparVolumes() { return Banco.chamar('limparVolumes'); },
  definirProximoId(numero) { return Banco.chamar('definirProximoId', { numero }); },
  proximoId() { return Banco.chamar('proximoId'); },
  ciclo() { return Banco.chamar('ciclo'); },
  backupCiclo() { return Banco.chamar('backupCiclo'); },
  fecharCiclo(id) { return Banco.chamar('fecharCiclo', { id }); },
  restaurarCiclo(backup) { return Banco.chamar('restaurarCiclo', { backup }); },
  exportar() { return Banco.chamar('exportar'); },
  importarVolumes(volumes) { return Banco.chamar('importarVolumes', { volumes }); },

  // ---------- Utilitários de tela ----------
  escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  },
  formatarHora(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },
  /** Classe da etiqueta de status (ver .tag-st-* em css/nc.css). */
  classeStatus(status) { return Catalogo.statusDe(status)?.tag || 'tag-neutra'; },
  lerPreferencia(chave, padrao = '') {
    try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; }
  },
  salvarPreferencia(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch {}
  },
  mostrarOffline(container) {
    container.hidden = false;
    container.textContent = 'Não foi possível acessar os dados salvos neste navegador.';
  },
};

window.escaparHtml = API.escaparHtml;
window.formatarHora = API.formatarHora;
window.classeStatus = API.classeStatus;
window.lerPreferencia = API.lerPreferencia;
window.salvarPreferencia = API.salvarPreferencia;
window.mostrarOffline = API.mostrarOffline;

window.Banco = Banco;
window.API = API;
