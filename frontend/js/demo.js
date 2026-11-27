/* =========================================================
   demo.js — volumes de exemplo (comando "demo" do Console)
   Gera chaves DANFE com dígito verificador válido e datas de
   entrada espalhadas, para ver prazo, e-mail e saídas na mesa.
   Os CNPJs são fictícios.
   ========================================================= */

const Demo = {
  /** Monta uma chave DANFE de 44 dígitos com DV correto. */
  chave({ cnpj, serie, nf, aamm = '2611', uf = '35' }) {
    const base = `${uf}${aamm}${cnpj}55${String(serie).padStart(3, '0')}${String(nf).padStart(9, '0')}1${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    for (let i = 42, p = 0; i >= 0; i--, p++) soma += Number(base[i]) * pesos[p % 8];
    const resto = soma % 11;
    return base + (resto < 2 ? 0 : 11 - resto);
  },

  diasAtras(dias, hora = 9) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    d.setHours(hora, Math.floor(Math.random() * 59), 0, 0);
    return d.toISOString();
  },

  volumes(clientes) {
    const cli = (i) => clientes[i % clientes.length]?.id ?? null;
    const cnpjs = ['11222333000144', '44555666000177', '77888999000100'];
    const mk = (i, tipo, status, local, dias, extra = {}) => {
      const nf = 40000 + i * 137;
      const serie = (i % 3) + 1;
      const pedido = extra.pedido;
      return {
        tipo, status, local,
        chave: pedido ? '' : this.chave({ cnpj: cnpjs[i % 3], serie, nf }),
        pedido: pedido || '',
        nf: pedido ? '' : String(nf),
        serie: pedido ? '' : String(serie),
        cnpj: pedido ? '' : cnpjs[i % 3],
        cliente_id: cli(i),
        awb: extra.awb || '',
        nota: extra.nota || '',
        data_entrada: this.diasAtras(dias, 8 + (i % 8)),
        data_saida: extra.saida ? this.diasAtras(extra.saida === 'hoje' ? 0 : extra.saida, 15) : null,
        criado_por: 'Murilo N.B',
        historico: [{ em: this.diasAtras(dias), por: 'Murilo N.B', texto: 'Inserido no setor NC (exemplo)' }],
      };
    };
    return [
      mk(1, 'sem-integracao', 'enviar-email', 'prateleira', 2),
      mk(2, 'sem-integracao', 'email-enviado', 'pallet-dentro', 9, { nota: 'Caixa grande, duas unidades.' }),
      mk(3, 'sem-integracao', 'email-enviado', 'prateleira', 12, { nota: 'Cliente não respondeu o e-mail.' }),
      mk(4, 'duplicidade', 'aguardando-entrega', 'pallet-fora', 4, { nota: 'Status mostra em rota, mas a peça está aqui.' }),
      mk(5, 'sem-integracao', 'enviar-email', 'pallet-dentro', 0),
      mk(6, 'duplicidade', 'aguardando-entrega', 'pallet-fora', 1),
      mk(7, 'sem-integracao', 'email-enviado', 'prateleira', 5, { pedido: 'PED-88213' }),
      mk(8, 'cep', 'tratado', 'crossdocking', 1, { awb: 'TXAQ123456789TX', saida: 'hoje' }),
      mk(9, 'bloqueio', 'devolucao', 'setor-devolucao', 2, { awb: 'DEV0099812', saida: 'hoje' }),
      mk(10, 'extravio', 'gris', 'gris', 0, { nota: 'Lacre rompido, encaminhado ao GRIS.', saida: 'hoje' }),
      mk(11, 'reimpressao', 'tratado', 'crossdocking', 3, { awb: 'TXAB987654321TX', saida: 2 }),
      mk(12, 'operacional', 'devolucao', 'setor-devolucao', 4, { awb: 'DEV0100230', saida: 3 }),
    ];
  },
};

window.Demo = Demo;
