# M-Utility

> Utilitário para empresas logísticas. A primeira ferramenta é o **Controle NC**: o controle de tudo
> o que entra e sai do setor de **não conformidades**.
>
> Desenvolvido por **MPS · MapleProjectSeries**.

O M-Utility nasceu do código do HelpIA (portal de chamados) e herdou a identidade visual
"Papelaria Oliva": mesa verde-oliva, tickets de papel com contorno de tinta, botões em forma de
tecla e o assistente **Helpy**.

## Como acessar

- **Online**: o site fica no GitHub Pages deste repositório (a página inicial leva para `frontend/index.html`).
- **No computador**: no VS Code, clique com o botão direito em `frontend/index.html` → **Open with Live Server**.

É HTML, CSS e JavaScript puro, sem instalação. O site publicado é a pasta `frontend/`
(veja `.github/workflows/pages.yml`).

## Banco de dados (Supabase)

Os dados ficam num banco online no **Supabase**, e todos os computadores veem as mesmas informações:

- cada volume, crachá, cliente e registro de auditoria é uma linha da tabela `mutility_registros`;
  só o que muda trafega (`js/nuvem.js`);
- o que um computador grava chega aos outros **ao vivo**, e a tela se atualiza sozinha;
- o navegador guarda uma cópia de trabalho: **sem internet** o app continua funcionando e envia
  o que ficou pendente quando a conexão volta;
- o **#ID** é reservado no banco, então dois computadores nunca pegam o mesmo número;
- as **fotos dos anexos** ficam no Storage do Supabase (bucket `anexos`, privado);
- travas de segurança: backup automático antes da primeira conexão de cada navegador e bloqueio
  de apagar muitos volumes de uma vez (só o fechamento do mês faz isso).

### Login e crachás

Cada pessoa entra com o **e-mail e a senha do seu login no Supabase** (Authentication › Users).
Sem esse login o banco não abre, mesmo com o endereço e a chave pública que estão no código.
Depois do primeiro login num computador, o nome de usuário também serve para entrar, e dá para
entrar sem internet.

- **Crachá novo**: crie o crachá em **Crachás** (cargo e foto) **e** o login dele no Supabase
  (**Authentication › Users › Add user**, com o mesmo e-mail e *Auto Confirm User* marcado).
- **Trocar a própria senha**: em **Configurações** (cartão do usuário); a troca vale no Supabase.
- **Senha de outra pessoa**: no painel do Supabase (**Authentication › Users** › ⋯).
- Os cadastros novos pelo próprio Supabase ficam **desligados** (só o administrador cria logins).
- Usuário e senha do **ICS** não ficam no código: o administrador cadastra em
  **Crachás › engrenagem › Editar usuário e senha do ICS**.

## Controle NC

### Inserir volume (passo a passo com o Helpy)

1. **Tipo de NC**: CEP · Duplicidade · Reimpressão · Sem integração · Ticket de bloqueio ·
   Problemas operacionais · Sem identificação · Extravio (crítico, vai para o setor GRIS).
2. **Status**: Enviar e-mail · E-mail enviado · Aguardando entrega realizada · Tratado · Devolução.
3. **Dados**: bipe a **DANFE** (44 dígitos) e o sistema preenche **NF, série e CNPJ** sozinho
   (confere o dígito verificador). Com número de **pedido**, esses campos são digitados.
   Escolha o **cliente** (vem sozinho se o CNPJ estiver cadastrado) e a **AWB**.
4. **Local**: Prateleira · Pallet de dentro · Pallet de fora.
5. **Nota** (opcional).
6. **Revisão** → o ticket é impresso e o Helpy leva para a mesa.

### Registro em sequência (várias peças de uma vez)

É o 9º cartão em "Qual é a não conformidade?". Escolha o modo, depois o destino (cartões), e bipe uma linha atrás da outra:

| Modo | Destino → status | Colunas |
|---|---|---|
| **Sem arquivo** (Sem integração) | Prateleira ou Pallet de dentro → Enviar e-mail | DANFE |
| **Reimpressão** | Crossdocking → Tratado · Devolução → Devolução (já saem para o Histórico) | DANFE + AWB |

O cursor pula sozinho (DANFE → AWB → linha de baixo), com ou sem "Enter" do leitor. Cada linha confere a DANFE
(44 dígitos e dígito verificador) e a AWB. **DANFE ou AWB repetida é permitida** (aparece "2ª vez", sem bloquear).
Dá para colar uma lista do Excel (DANFE e AWB separadas por TAB). No fim, dá para imprimir todas as etiquetas.

### AWB (código da transportadora)

Sempre gravada como `TXAQ123456789tx`: 4 letras maiúsculas, 9 números e `tx` minúsculo. Se o leitor mandar
`txaq123456789TX` (Caps Lock trocado), o M-Utility corrige sozinho (`Catalogo.formatarAwb`).

### Enviar e-mail

- **Página Enviar E-mail** (menu lateral): só os tickets em "Enviar e-mail", separados por cliente. Escolhendo o cliente:
  tabela de **#ID até STATUS** (sem AWB e DATA (S)), **Copiar tabela** (cola com bordas no corpo do e-mail) e
  **Marcar como E-mail enviado** para os selecionados.
- **Na Minha Mesa**: marque as caixinhas dos tickets (ou na tabela) e clique no **envelope** (ao lado do X): a mesma tela,
  com **todas** as colunas da planilha.

### Tipo × status × destino

| Tipo de NC | Entra como | Vai para |
|---|---|---|
| CEP | Tratado ou Devolução | Crossdocking |
| Duplicidade | Aguardando entrega realizada ou Devolução | Pallet de fora (aguardando) · Devolução |
| Reimpressão | Tratado ou Devolução | Crossdocking ou Devolução |
| Sem integração | Enviar e-mail, E-mail enviado, Tratado ou Devolução | Prateleira ou Pallet de dentro |
| Ticket de bloqueio | Devolução | Devolução |
| Problemas operacionais | Tratado ou Devolução | Prateleira, Pallet de dentro, Crossdocking ou Devolução |
| Sem identificação (caixa sem etiqueta) | Devolução (sempre, com a AWB gerada a partir do número de referência) | Devolução |
| Extravio | GRIS | Setor GRIS |

**Sem identificação**: só pede um número de pedido (qualquer um; o botão "Usar a data de hoje"
gera `SI-ddmmaaaa-hhmm`) e o cliente.

Quando só existe uma opção, a etapa é preenchida e pulada. Na edição (lápis) o status pode ser
trocado por qualquer outro (GRIS só para extravio) e o destino acompanha.
Imagens da nota sobem para o Storage do Supabase; cada computador guarda uma cópia no IndexedDB
do navegador depois de abrir a imagem pela primeira vez.

### Regras

| Regra | Onde |
|---|---|
| Todo volume recebe um **#ID** sequencial e a **DATA (E)** na inserção | `js/api.js` → `inserirVolume` |
| **Tratado** e **Devolução** tiram o volume do NC: exigem **AWB** e gravam a **DATA (S)** | `js/api.js` → `normalizar` |
| Os demais status não têm data de saída | `js/api.js` → `normalizar` |
| **Sem integração**: relógio no ticket (passe o mouse: quantos dias faltam); a partir do **8º dia** fica vermelho e treme; passou de **10 dias**, fica **vencido** (virar devolução) | `js/catalogo.js` → `prazo`, `js/ticket-ui.js` → `aviso` |
| Os clientes cadastrados ficam no banco online (os iniciais vêm em `CLIENTES_PADRAO`) | `js/api.js` → `CLIENTES_PADRAO` |
| A faixa do ticket tem a **cor do cliente** | `js/catalogo.js` → `estiloCliente` |
| Toda alteração entra na **linha do tempo** do volume e no **Registro de Auditoria** | `js/api.js` |

### A mesa

- **Centro — Minha Mesa**: os volumes que estão no setor, com busca por #ID, NF, DANFE, AWB, cliente ou tipo.
  Cabem 4 colunas × 3 linhas sem rolagem (os tickets encolhem para caber). O ícone na faixa mostra
  onde a caixa está. Dá para arrastar os tickets e excluir (caixinha + X).
  O botão de **menu** (canto esquerdo) volta para a escolha: Todos · Pallet de fora · Prateleira · Pallet de dentro.
  Cada visão guarda as **suas** posições: arrastar um ticket na Prateleira não muda onde ele está em Todos.
  **Tickets / Tabela**: a tabela tem as mesmas colunas da planilha e o botão **Copiar**.
- Volume que sai (Tratado, Devolução, GRIS) vai direto para o **Histórico de Tickets**.
- **Direita**: **Score** (sem integração · aguardando entrega · resolvidos hoje) e o **Helpy**, que
  dá o resumo do setor, avisa dos volumes perto dos 10 dias, cobra os e-mails pendentes e lembra de
  conferir se os **Aguardando entrega realizada** já integraram (com quantos dias cada um tem).
- Clicando num ticket: atualizar status, AWB, local, cliente, tipo e nota.

## Localizador de AWB (utilitário)

Fica no grupo **Utilitários** do menu lateral (`localizador-awb.html`) e está disponível para todos os perfis.

1. **Cliente**: por enquanto, só o **PET LOVE**. A cor e o CNPJ vêm da tela Clientes.
2. **Separação**: escolha **por lote** ou **parcial e integral**.
3. **Importar**: cole as colunas da planilha.
   - Por lote: a coluna AWB e a coluna LOTE. A linha N de uma casa com a linha N da outra. Se as duas colunas forem coladas juntas no campo AWB, o sistema separa pelo TAB.
   - Parcial e integral: uma lista de AWBs INTEGRAL e outra de AWBs PARCIAL.
   - AWBs inválidas ou repetidas são avisadas e não entram na lista.
4. **Scan**: bipe as peças. Cada leitura mostra um aviso com som próprio:
   - **ENCONTRADO** (verde), com o lote ou o selo PARCIAL / INTEGRAL;
   - **NÃO ENCONTRADO** (amarelo): é uma AWB, mas não está na lista;
   - **INVÁLIDO** (vermelho): o código não segue o padrão.

O padrão da AWB é `TXA` + 1 letra + 9 números + `tx`. Ela pode ser bipada em maiúsculas ou minúsculas, mas aparece sempre como `TXAQ123456789tx`. A separação em andamento fica guardada no navegador, então recarregar a página não perde a lista.

## Ciclo do mês e arquivos

Os dados de cada mês viram dois arquivos na pasta escolhida pelo administrador (de preferência uma
pasta do OneDrive ou do Google Drive, para ter cópia na nuvem). O fechamento também deixa o banco
online leve: o que já saiu do NC fica só nos arquivos.

- `M-Utility - Controle NC (Nov-2026).csv`: a planilha do mês (colunas B a L + mês do #ID, local, nota, quem inseriu)
- `M-Utility - Controle NC (Nov-2026).backup.json`: a cópia completa, com linha do tempo e imagens das notas

**Salvamento automático**: em **Localizar › Escolher pasta** (Edge/Chrome) o sistema grava os dois arquivos a cada
alteração. Ao reabrir o navegador, o Helpy mostra **Permitir acesso à pasta** (um clique). Em outros navegadores, os
arquivos são baixados.

**Fechar o ciclo** (Localizar, ou o aviso do Helpy quando o mês vira):
1. salva a planilha e o backup do mês;
2. o que já saiu do NC sai do banco online e do navegador (fica no arquivo, com as fotos);
3. o que está no setor passa para o mês novo **com o mesmo #ID**, marcado "Do mês anterior · Out/2026", com o ticket
   de visual antigo, e ganha um cartão próprio ("Mês de Outubro") na escolha da Minha Mesa;
4. o #ID recomeça do **#001**.

**Consultar meses anteriores**: em Localizar, **Importar planilhas** (.csv ou .backup.json, vários de uma vez) ou
**Carregar da pasta**, e procurar com a mesma busca da mesa (#ID, NF, DANFE, AWB, cliente). Só consulta.

**Restaurar**: **Restaurar backup** com o `.backup.json` do mês (por exemplo, para trazer de volta um mês fechado).

**Limpeza opcional**: cada volume apagado deixa no banco uma linha vazia marcada como apagada (cerca de
100 bytes), para os computadores desligados ficarem sabendo da exclusão. Para limpar as antigas, rode no
SQL Editor do Supabase de tempos em tempos:

```sql
delete from public.mutility_registros where apagado and atualizado_em < now() - interval '60 days';
```

## Impressão do ticket (Zebra ZT410)

Ao gerar o ticket (e no botão **Imprimir ticket** de um volume) sai uma etiqueta física com
**#ID, DATA (E), CLIENTE, TIPO DE NC e o STATUS atual**, mais um código de barras Code128 do ID.

- A ZT410 é térmica de 4": até 104 mm de largura, 203 dpi no modelo padrão (300/600 opcionais).
  Etiqueta padrão: **100 × 150 mm** (4" × 6", a de AWB). Também há 100×100, 100×75 e 100×50.
- Configuração: botão de engrenagem no escritório do Helpy → **Impressora Zebra** (tamanho,
  resolução, método, cópias, prévia, impressão de teste e "Copiar ZPL").
- **Zebra Browser Print** (recomendado): o M-Utility gera ZPL e manda direto para a impressora,
  sem janela. Instale o Browser Print, escolha a ZT410 como padrão e aceite este site na primeira vez.
- **Pela rede**: com a ZT410 no cabo de rede/Wi-Fi, informe o IP (visor da impressora) e o ZPL vai
  direto para ela (`http://IP/pstprnt`), sem janela e sem instalar nada.
- **Sem janela pelo Chrome**: deixe a ZDesigner ZT410 como impressora padrão do Windows e abra o
  sistema pelo **`Abrir M-Utility.bat`** (Chrome com `--kiosk-printing` e perfil próprio; os dados
  vêm do banco online, então basta entrar com o seu login na primeira vez).
- **Janela de impressão**: escolha a **ZDesigner ZT410**, papel do tamanho da etiqueta e margens "Nenhuma".
- **Reimprimir**: o botão de impressora na tela do volume (clique no ticket) imprime de novo com o **status atual**.
- A data sai como **ENTRADA NA NC** enquanto o volume está no setor e **SAÍDA DA NC** depois de Tratado/Devolução;
  "Enviar e-mail" sai impresso como **E-mail enviado**.
- O layout fica em `js/impressao.js` (ZPL e versão HTML).

## Telas

| Tela | Quem vê | O que faz |
|---|---|---|
| `controle-nc.html` | Todos | A mesa do setor NC |
| `historico.html` | Todos | Todos os volumes (tickets ou tabela), filtros, **copiar para a planilha**, **exportar CSV** e marcar (caixinha) + **X** para excluir |
| `emails.html` | Todos | Enviar E-mail: tickets em "Enviar e-mail" por cliente, tabela para o e-mail e marcar como enviado |
| `estatisticas.html` | Administrador | Indicadores e gráficos (cada um vira Barras, Colunas, Pizza ou Rosca; 7 dias em Colunas ou Linhas) e **Exportar imagem** (PNG) |
| `clientes.html` | Administrador | Nome, CNPJ e cor; **Novo cliente** e o **lápis** do ticket abrem o mesmo pop-up |
| `localizar.html` | Administrador | O mês aberto, **fechar o ciclo**, a pasta dos arquivos, restaurar backup e a consulta dos meses anteriores |
| `criar-conta.html` | Administrador | Crachás: emitir, editar, trocar cargo, suspender, ICS (o login de cada crachá é criado no Supabase) |
| `console.html` | Administrador | Tela inteira de comandos de texto (`help`, `nextid`, `list`, `show`, `status`, `awb`, `move`, `export`, `import`, `drop`…). `drop` apaga todos os tickets e pede um código de 6 dígitos |
| `auditoria.html` | Administrador | Quem fez o quê e quando, com filtros e CSV |

Dica: no Console, `demo` insere 12 volumes de exemplo para ver a mesa e as estatísticas cheias.

## Histórico → planilha

As colunas ficam em `js/planilha.js`, na ordem das colunas **B a L** da planilha do controle de NC:
#ID · DATA (E) · NOTA FISCAL (NF) · SÉRIE · DANFE/PEDIDO · CLIENTE · CNPJ · TIPO DE NC · STATUS · AWB · DATA (S).

- **Copiar para a planilha** (Histórico, com os filtros aplicados) e **Copiar** (Minha Mesa em tabela):
  clique na coluna **B** da primeira linha vazia da planilha online e cole (Ctrl+V). A DANFE vai como texto.
- **Exportar CSV**: para Excel / Google Planilhas.
- **#ID igual ao da planilha**: no Console, `nextid` mostra o próximo número e `nextid 250`
  faz a numeração continuar do 250 (precisa ser maior que o último #ID do sistema).
- Sincronizar sozinho com o SharePoint exige Microsoft Graph (app registrado no Azure AD da empresa)
  ou um fluxo do Power Automate; ainda não está feito.

## Estrutura

```
M-Utility/
├── index.html               # leva para frontend/ (GitHub Pages pelo branch)
├── .github/workflows/pages.yml  # publica frontend/ no GitHub Pages
└── frontend/
    ├── index.html · login.html  # site público (apresentação em slides) e login
    ├── controle-nc.html · historico.html · emails.html · localizador-awb.html
    ├── estatisticas.html · clientes.html · criar-conta.html · localizar.html · console.html · auditoria.html
    ├── assets/
    ├── css/                 # identidade "Papelaria Oliva" + css/vitrine.css (site e login)
    └── js/
        ├── nuvem.js         # banco online (Supabase): login, sincronização, ao vivo, fotos
        ├── api.js           # cópia de trabalho no navegador e as regras; registra a auditoria
        ├── landing.js · vitrine.js  # a apresentação em slides e a salinha do Helpy do site
        ├── catalogo.js      # tipos de NC, status, locais, DANFE, prazo, cores
        ├── controle-nc.js   # a mesa e o passo a passo de inserir volume
        ├── sequencia-emails.js  # registro em sequência e e-mail dos tickets marcados na mesa
        ├── email-tabela.js  # a tabela do e-mail (mesa e página Enviar E-mail)
        ├── emails.js        # página Enviar E-mail
        ├── ticket-ui.js     # o ticket do volume em todas as telas
        ├── planilha.js      # colunas do histórico / CSV / relatório do mês
        ├── arquivos.js      # arquivos do mês na pasta, fechar e restaurar o ciclo
        ├── demo.js          # volumes de exemplo (comando "demo")
        └── …                # sessão, menu, Helpy, telas de administração
```

## Próximos passos

1. Planilha do fechamento em `.xlsx` formatado (hoje é `.csv`).
2. Sincronização automática com a planilha online (Microsoft Graph ou Power Automate).
3. Novas ferramentas do M-Utility além do Controle NC.
