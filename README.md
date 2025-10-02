# Mustafar Variedades – Controle de Estoque

Aplicação web em Next.js 14 (App Router) para controle de estoque do e-commerce Mustafar Variedades. O sistema é otimizado para operação em dispositivos móveis, utiliza Tailwind CSS com componentes shadcn/ui e integrações diretas com Firebase Auth e Firestore (via SDK client-side). Inclui scanner de código de barras Code128, dashboard com gráficos e geração de etiquetas Zebra (ZPL) prontas para impressão.

## Funcionalidades

- **Autenticação Firebase** com papéis `admin` e `staff`.
- **Proteção de rotas** e controle de acesso com base no papel.
- **Scanner de código de barras** (Code128) usando webcam ou câmera do celular.
- **Dashboard administrativo** com métricas de estoque e histórico de saídas, gráficos em Chart.js.
- **Tabela de estoque editável** com criação, importação/exportação de produtos e geração de etiquetas ZPL 40x25 mm.
- **Transações de baixa** com validação de estoque, histórico em `stockMovements` e prevenção de quantidade negativa.
- **Toast notifications** para feedback rápido e estados de carregamento responsivos.

## Pré-requisitos

- Node.js 18+ (recomendado 20).
- Conta Firebase com Firestore e Authentication habilitados.
- Navegador com suporte à API `BarcodeDetector` (Chrome/Edge modernos; para iOS utilize Safari 17+).

## Configuração do ambiente

1. Instale as dependências:

   ```bash
   npm install
   ```

   > Caso esteja rodando em um ambiente restritivo sem acesso ao registry da npm, garanta o download das dependências antes ou configure um mirror liberado.

2. Copie `.env.example` para `.env.local` e preencha os valores do projeto Firebase:

   ```bash
   cp .env.example .env.local
   ```

   | Variável | Descrição |
   | --- | --- |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | API Key do projeto |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ID do projeto |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Bucket de storage |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID |
| `NEXT_PUBLIC_ENABLE_KIT_SKU` | Flag para habilitar os kits de SKU (`true`/`false`) |

3. Publique as regras do Firestore contidas em `firestore.rules`:

   ```bash
   firebase deploy --only firestore:rules
   ```

   As regras garantem que:

   - `staff` pode ler produtos, registrar saídas e apenas reduzir o estoque.
   - `admin` possui CRUD completo em produtos, categorias, fornecedores e leitura total de movimentos.


## Cadastro de usuarios no Firebase

Siga o passo a passo abaixo sempre que precisar liberar acesso ao app:

1. No console do Firebase, abra Authentication > Usuarios e clique em Adicionar usuario. Informe o email e a senha que serao usados no login (pode ser um endereco ficticio, contanto que tenha formato de email).
2. Copie o UID exibido na lista de usuarios (coluna ID do usuario).
3. Acesse Firestore Database > Dados. Se for o primeiro cadastro, crie a colecao `users`. Adicione um documento com ID exatamente igual ao UID copiado e cadastre os campos:
   - `uid` (string) = UID copiado
   - `email` (string) = email cadastrado
   - `displayName` (string) opcional
   - `role` (string) = `admin` para acesso completo ou `staff` para uso apenas do scanner
4. Clique em Salvar. Em seguida, faca logout e login novamente no app para aplicar o novo papel.
5. Se aparecer erro de permissao no Firestore, confirme que as regras em `firestore.rules` ja foram publicadas em Firestore Database > Regras.

## Execução local

```bash
npm run dev
```

A aplicação ficará disponível em `http://localhost:3000`.

### Testando o scanner

- Utilize conexão **HTTPS** (por exemplo `https://localhost:3000` com certificado válido) para liberar a câmera em celulares.
- No desktop, escolha a câmera pelo seletor do scanner. Em celulares, adicione o app ao home screen para experiência quase nativa.
- Para ambientes que não suportam `BarcodeDetector`, informe o SKU manualmente.

## Historico & Scanner com Enter

- A tela `/scan` aceita leitores manuais (USB/Bluetooth) que enviam Enter ao final. O campo de SKU mantem foco automatico e a baixa é registrada imediatamente com quantidade padrão 1.
- Informe uma quantidade diferente de 1 antes do Enter ou do clique em **Dar baixa** para aplicar o novo valor.
- O botão **Scan** alterna o uso da câmera; quando o navegador não estiver em contexto seguro (HTTPS ou localhost) apenas o fluxo manual fica disponível com aviso na interface.
- A tela `/history` lista movimentos (`stockMovements`) com filtros por intervalo, SKU, usuário e exportação CSV.

### Permissoes de papel

- `staff`: pode executar transações de baixa e registrar movimentos `type: "out"` via scanner ou entrada manual.
- `admin`: possui acesso completo (CRUD) a produtos, movimentos e toda a área administrativa.

## Estrutura de rotas

| Rota | Papel | Descrição |
| --- | --- | --- |
| `/login` | público | Autenticação (e-mail + senha). |
| `/scan` | `staff` e `admin` | Scanner de código de barras e baixa de estoque. |
| `/admin/dashboard` | `admin` | Painel com métricas, gráficos, filtros por categoria e fornecedor. |
| `/admin/estoque` | `admin` | Tabela editável de produtos, importação/exportação JSON, etiquetas ZPL e dados de exemplo. |

## Geração de etiquetas (ZPL)

- Função utilitária `generateZPL` localizada em `lib/zpl.ts` produz etiquetas 40x25 mm (203 dpi) com código de barras **Code128**.
- A visualização HTML no modal ajuda a validar o layout antes de enviar para uma impressora Zebra.
- Baixe o arquivo `.zpl` e envie para a impressora via driver ZebraDesigner ou utilitário equivalente.

## Deploy na Vercel

1. Crie ou conecte o projeto na Vercel apontando para este repositório.
2. Configure as variáveis de ambiente obrigatórias (painel Environment Variables):
   - NEXT_PUBLIC_FIREBASE_API_KEY
   - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
   - NEXT_PUBLIC_FIREBASE_PROJECT_ID
   - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
   - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
   - NEXT_PUBLIC_FIREBASE_APP_ID
- NEXT_PUBLIC_ENABLE_KIT_SKU (opcional; default `false`)
3. Habilite os domínios de autenticação do Firebase para cada ambiente (Auth > Configurações > Domínios autorizados):
   1. Adicione localhost para uso local com HTTPS.
   2. Inclua o domínio padrão dos previews da Vercel (*.vercel.app).
   3. Inclua o domínio customizado de produção (quando existir).
4. Execute os comandos locais abaixo para garantir que o deploy passará na Vercel:
   - npm ci
   - npm run build
   - npx vercel
   - npx vercel deploy --prod
5. Os gráficos baseados em Recharts são carregados por next/dynamic com ssr: false, evitando erros de renderização no ambiente serverless da Vercel.

### Domínios autorizados no Firebase Auth

1. Abra Firebase Console > Authentication > Configurações > Domínios autorizados.
2. Clique em Adicionar domínio para cada URL listada acima (preview e produção).
3. Salve as alterações e rode um login de teste para validar.

## Dicas adicionais

- Use a ação “Criar dados de exemplo” em `/admin/estoque` para popular produtos fictícios durante a homologação.
- Exportações JSON podem ser importadas novamente para migração rápida entre ambientes.
- Para evitar erros de câmera em celulares Android, confira se o app está acessando via `https://` e com permissão explícita de câmera.

## Scripts úteis

| Script | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Build para produção |
| `npm run start` | Servidor em modo produção |
| `npm run lint` | Verificação com ESLint |

Boa gestão e que a Força esteja com o seu estoque!




