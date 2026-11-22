## Escopo do projeto

Para a implementação deste projeto vamo precisar usar as seguintes tecnologias:

- **Node.js** para fornecer a possibilidade de executar JS em um servidor
- **Express.js** para criar rotas de api
- **Dotenv** para criarmos configurações com mais facilidade e segurança
- **Nodemon** para termos mais produtividade em nosso ambiente de desenvolvimento
- **MySQL** para persistência de dados
- **Sequelize** para termos mais produtividade ao lidar com o banco de dados 
- **JWT** para adicionar segurança e limitar o acesso nas rotas de API
- **JEST** para nos ajudar a testar e manter a qualidade do código

## Configuração local

Copie `.env.example` para `.env` e substitua todos os valores de exemplo, em especial `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD` e `APP_KEY`. O arquivo `.env` fica ignorado pelo Git e não deve ser compartilhado. Instale as dependências com `npm install`.

Para iniciar um MySQL 8.4 local isolado em Docker, execute `docker compose up -d mysql`. O banco usa o volume persistente `mysql_data` e só publica a porta em `127.0.0.1`. Aguarde a verificação de saúde passar antes de executar a migração. `docker compose down` para o container e mantém os dados; não use `docker compose down -v` salvo se quiser apagar o banco local.

`DB_NAME`, `DB_USER` e `APP_KEY` são obrigatórios. `DB_PASSWORD` é obrigatória fora do desenvolvimento local; em `NODE_ENV=development`, pode ser omitida somente quando `DB_HOST` aponta para `localhost`, `127.0.0.1` ou `::1`. Não use senha vazia em produção. Gere uma chave JWT com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. `ADMIN_EMAIL` e `ADMIN_PASSWORD` são opcionais, mas devem ser definidas juntas.

Se a aplicação estiver atrás de um proxy reverso confiável, configure `TRUST_PROXY_HOPS` com o número exato de saltos de proxy (por exemplo, `1` para um proxy). O padrão `0` não confia em cabeçalhos encaminhados pelo cliente.

Configure `CORS_ORIGINS` com as origens exatas do frontend, separadas por vírgula e sem caminhos. O exemplo libera `localhost:5173` e `127.0.0.1:5173` apenas para desenvolvimento; em produção, informe o domínio HTTPS do site. Origens não listadas não recebem permissão CORS.

Com o MySQL em execução, crie o banco caso ainda não exista com `npx sequelize-cli db:create`, execute `npm run db:migrate:status`, depois `npm run db:migrate` e, por fim, `npm start`. A aplicação não cria nem altera tabelas automaticamente: o esquema só é aplicado pela migração. `npm run db:migrate:undo` desfaz a migração mais recente e remove as tabelas correspondentes; use com cautela.

O cadastro público cria contas com perfil `customer`. Apenas contas `admin` podem alterar categorias e produtos. Em cada requisição protegida, a API consulta a conta e o perfil atuais no banco; o papel registrado no JWT não concede permissões por si só, e a exclusão da conta revoga o token imediatamente. Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` na primeira inicialização para criar a conta administrativa; se o e-mail já existir, a inicialização promove essa conta sem trocar sua senha. Alterações dos dados de usuário exigem token e só podem atingir a própria conta. Tokens expiram em uma hora. Rotas de escrita protegidas usam `Authorization: Bearer <JWT>` e retornam `401` sem token válido; cadastro e login são públicos. O login retorna `400` para dados malformados e `401` para credenciais incorretas; senhas têm mínimo de 8 caracteres.

Para rotas protegidas, envie o cabeçalho HTTP `Authorization` usando o esquema `Bearer` seguido do JWT.

Imagens são armazenadas no disco local em `MEDIA_DIR` e servidas por `/media`. Cada imagem deve ser PNG, JPEG ou WebP válido, ter no máximo 4 MB; o JSON tem limite de 12 MB. Em produção com múltiplas instâncias, configure um volume compartilhado e persistente, ou migre o serviço de armazenamento para objeto.

## Execução e verificação de concorrência

- `npm start` inicia o servidor na porta `3000` por padrão. Configure `PORT` e `HOST` pelo ambiente.
- `GET /health` verifica se o processo HTTP está respondendo; não verifica a conexão com o banco de dados.
- `GET /health/ready` verifica o acesso ao banco e retorna `503` quando a aplicação não está pronta para receber tráfego.
- `npm test -- --runInBand` executa testes unitários, de controladores e HTTP ponta a ponta usando SQLite em memória, sem conectar ao MySQL.
- `npm run test:e2e` executa apenas os testes HTTP ponta a ponta.
- `npm run test:concurrency` tenta manter 5.000 requisições HTTP simultâneas no endpoint `/health`. O teste segura as respostas por 15 segundos para criar requisições em voo; isso não mede a latência normal nem garante capacidade em produção.
- `npm run test:load` faz uma carga curta e somente leitura em `/health`, `/health/ready` e na busca pública de produtos. Por padrão usa `http://127.0.0.1:3000`, 5 conexões simultâneas e 10 segundos; configure `LOAD_TEST_URL`, `LOAD_TEST_CONCURRENCY` (máximo 20) e `LOAD_TEST_DURATION_SECONDS` (máximo 60). Hosts remotos exigem `LOAD_TEST_ALLOW_REMOTE=true`; rode-os apenas em ambiente autorizado e monitore banco, CPU, memória, latência e taxa de erro.
- O CI executa as migrações em MySQL 8.4, desfaz todas e as reaplica, inicia a API ligada ao MySQL, executa uma carga curta somente leitura e testa backup/restauração do banco e da mídia em um destino vazio. Isso complementa os testes funcionais de aplicação em SQLite.
- O CI também executa `npm audit` sem excluir dependências de desenvolvimento.

## Backup e recuperação

`npm run db:backup` usa `mysqldump` e o `MEDIA_DIR` configurado para gerar `backups/<data-UTC>/database.sql` e uma cópia da pasta de imagens. Requer o cliente `mysqldump` instalado e conexão configurada pelas variáveis de banco. Para restaurar, `db:restore-check` também requer o cliente `mysql`. Para manter banco e imagens consistentes, suspenda gravações durante o backup. Copie os backups para armazenamento externo, restrito e criptografado; um backup no mesmo disco do servidor não protege contra perda desse disco.

Para ensaiar uma recuperação sem sobrescrever o banco ativo, crie previamente um banco MySQL vazio e diferente de `DB_NAME`, configure `RESTORE_DB_NAME` com esse nome e execute `npm run db:restore-check -- <pasta-do-backup>`. O comando recusa usar `DB_NAME` ou uma base que não esteja vazia e restaura as imagens em uma pasta `MEDIA_DIR.restore-check-*`; ele não altera a pasta ativa. Depois, verifique tabelas, registros e arquivos restaurados e remova manualmente a base/pasta de verificação quando não forem mais necessárias.

Em hospedagem gerenciada, prefira os snapshots e testes de restauração do provedor para o banco; mantenha cópias de mídia no mesmo ciclo de backup e defina retenção e objetivo de recuperação (RPO/RTO) com o responsável pelo serviço.

## Validação do Mercado Pago em sandbox

Para validar a integração real, use somente um `MP_ACCESS_TOKEN` de teste (`TEST-...`), o segredo de webhook correspondente e uma URL HTTPS pública de túnel em `MP_PUBLIC_API_URL`. Não coloque credenciais no Git nem as envie em mensagens. Com as migrações aplicadas e a API acessível pelo túnel, crie um pedido e checkout, conclua o pagamento usando comprador/cartão de teste do Mercado Pago e confirme que o webhook atualizou o pedido e criou a notificação. Repita a notificação para conferir idempotência e teste o caminho de pagamento tardio com um pedido expirado/cancelado, verificando o estorno no painel sandbox. Nunca use cartão real ou token de produção nesse procedimento.

O login real é `POST /v1/user/token`; os antigos endpoints de demonstração `/token` e `/validar-token` ficam desativados por padrão. O preço é armazenado como `DECIMAL(10,2)` em vez de ponto flutuante, para evitar erros de arredondamento monetário.

## Enderecos de entrega e carrinho

- `POST /v1/user` aceita um objeto `address` com `postal_code`, `street`, `number`, `complement`, `neighborhood`, `city` e `state`; o endereco e salvo junto com o cadastro.
- `GET` e `PUT /v1/user/:id/address` permitem consultar e atualizar somente o endereco da propria conta autenticada.
- `GET /v1/cart`, `POST /v1/cart/items`, `PATCH /v1/cart/items/:itemId` e `DELETE /v1/cart/items/:itemId` exigem JWT. O backend valida opcoes e estoque e mantem um carrinho por usuario.
- Execute `npm run db:migrate` para criar as tabelas de enderecos e carrinhos antes de usar esses endpoints.
- `GET /v1/user/:id` exige JWT e permite acesso ao titular da conta ou a um administrador.
- A busca e a consulta pública de produtos retornam somente produtos habilitados.
- `POST /v1/order` finaliza o carrinho com o endereço salvo, valida novamente disponibilidade/opções/estoque, registra os preços vigentes, reserva o estoque por 30 minutos e cria um pedido `pending` numa transação. `GET /v1/order` e `GET /v1/order/:id` mostram somente pedidos do usuário autenticado.
- Envie um `Idempotency-Key` único por tentativa lógica em `POST /v1/order`; repetição da chave para o mesmo cliente retorna o pedido original em vez de criar outro. Sem o cabeçalho, o endpoint mantém o comportamento legado.
- Para pagar, o cliente autenticado chama `POST /v1/order/:id/payment`; a resposta contém `checkout_url`, para redirecionar ao Checkout Pro. O pedido só muda para `paid` após confirmação assinada do webhook; URLs de retorno do navegador não confirmam pagamentos.
- `POST /v1/order/:id/cancel` cancela um pedido pendente e libera o estoque. Pedidos pendentes expiram automaticamente após 30 minutos; uma aprovação recebida após cancelamento/expiração é estornada pelo backend.
- Administradores consultam pedidos em `GET /v1/admin/orders` com paginação (`page`, `limit`) e filtros opcionais (`status`, `fulfillment_status`). `PATCH /v1/admin/orders/:id/fulfillment-status` avança pedidos pagos uma etapa por vez: `unfulfilled` → `processing` → `shipped` → `delivered`. A confirmação de pagamento não pode ser alterada por esse endpoint.
- `GET /v1/notifications` lista as notificações do cliente autenticado, com paginação e contagem de não lidas. `PATCH /v1/notifications/:id/read` marca uma notificação própria como lida. Pagamento confirmado e atualizações de preparação/entrega são salvos no banco e podem ser consultados na API; não há envio de e-mail configurado.
- `GET /v1/order/:id` inclui `fulfillment_status` e `fulfillment_history` para o acompanhamento do cliente. As mudanças são registradas com autor e horário.
- Login, cadastro, criação de pedido e início de pagamento têm limites por IP: 10 logins por 15 minutos, 5 cadastros por hora e 10 criações/inícios de pagamento por 15 minutos. Em instalações com várias instâncias, use um armazenamento compartilhado de rate limit e configure corretamente o proxy confiável.
- Configure `MP_ENVIRONMENT=sandbox`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `MP_PUBLIC_API_URL` no `.env`. Use as credenciais de teste do Mercado Pago no desenvolvimento e credenciais de produção somente em implantação HTTPS. `MP_PUBLIC_API_URL` deve ser uma URL pública do backend (em desenvolvimento, use um túnel HTTPS) e o webhook deve estar configurado para eventos de pagamentos (`payment`). Nunca exponha essas credenciais no frontend.
- As URLs de retorno do frontend ficam em `MP_SUCCESS_URL`, `MP_PENDING_URL` e `MP_FAILURE_URL`; os valores de exemplo apontam para `http://localhost:5173`.
- Execute `npm run db:migrate` para criar as tabelas de pedidos, itens, histórico de etapas e notificações.
- A configuração escolhida para este projeto é uma única instância: o rate limit usa memória local e as imagens ficam em `MEDIA_DIR`. Se a implantação mudar para várias instâncias, migre para armazenamento compartilhado de limite e imagens antes de escalar.

## Estrutura de diretório
```
project-root/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── app.js
│   └── server.js
├── scripts/
│   ├── backup.js
│   └── restore-check.js
├── tests/
├── .env
├── .gitignore
└── package.json
```

## Response status code
- [200 OK](https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status/200)
  - Indica que a API REST executou com êxito qualquer ação solicitada pelo cliente
  - Ao contrário do código de status 204, uma   200 deve incluir um corpo de resposta
- [201 CREATED](https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status/201)
  - Indica que a requisição foi bem sucedida e que um novo recurso foi criado
- [204 No content](https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status/204)
  - O código de status 204 geralmente é enviado em resposta a uma solicitação PUT ou DELETE quando a API se recusa a retornar qualquer corpo de mensagem no response
  - A resposta 204 NÃO DEVE incluir um corpo de mensagem
- [400 Bad Request](https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status/400)
  - Indica que o servidor não pode ou não irá processar a requisição devido a alguma coisa que foi entendida como um erro do cliente
- [401 Unauthorized](https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status/401)
  - Indica que a solicitação não foi aplicada porque não possui credenciais de autenticação válidas para o recurso de destino
- [404 Not Found](https://developer.mozilla.org/pt-BR/docs/Web/HTTP/Status/404)
  - Indica que o servidor não conseguiu encontrar o recurso solicitado


## Seção 01 - Implementar o banco de dados da aplicação

<details>
  <summary><strong>Requisito 01 - Criar a tabela de usuários</strong></summary><br>

O objetivo deste requisito é criar a tabela de usuários no banco de dados utilizando o Sequelize ORM. A tabela deve conter as colunas a seguir:

- **id**: Coluna do tipo INTEGER que representa a chave primária da tabela. Seu valor deve ser incrementado automaticamente pelo banco de dados
- **firstname**: Coluna do tipo STRING e de preenchimento obrigatório que armazena o primeiro nome do usuário
- **surname**: Coluna do tipo STRING e de preenchimento obrigatório que armazena o sobrenome do usuário.
- **email**: Coluna do tipo STRING e de preenchimento obrigatório que armazena o endereço de email do usuário
- **password**: Coluna do tipo STRING e de preenchimento obrigatório que armazena a senha do usuário. O valor a ser armazenado deve ser o hash da senha gerado pelo pacote bcrypt.

> Use a configuração `timestamps: true` do sequelize para gerar as colunas **created_at** e **updated_at**

</details>

<details>
  <summary><strong>Requisito 02 - Criar a tabela de categorias</strong></summary><br>

O objetivo deste requisito é criar a tabela de categorias no banco de dados utilizando o Sequelize ORM. A tabela deve conter as colunas a seguir:

- **id**: Coluna do tipo INTEGER que representa a chave primária da tabela. Seu valor deve ser incrementado automaticamente pelo banco de dados
- **name**: Coluna do tipo STRING e de preenchimento obrigatório que armazena o nome da categoria
- **slug**: Coluna do tipo STRING, e de preenchimento obrigatório que armazena o slug da categoria.
- **use_in_menu**: Coluna do tipo BOOLEAN e de preenchimento opcional que define se a categoria pode ser exibida no menu. Valor padrão deve ser 0.

> Use a configuração `timestamps: true` do sequelize para gerar as colunas **created_at** e **updated_at**

</details>

<details>
  <summary><strong>Requisito 03 - Criar a tabela de produtos</strong></summary><br>

O objetivo deste requisito é criar a tabela de produtos no banco de dados utilizando o Sequelize ORM. A tabela deve conter as colunas a seguir:

- **id**: Coluna do tipo INTEGER que representa a chave primária da tabela. Seu valor deve ser incrementado automaticamente pelo banco de dados
- **enabled**: Coluna do tipo BOOLEAN e de preenchimento opcional que define se o produto está habilitado (1) ou desabilitado (0). Valor padrão deve ser 0.
- **name**: Coluna do tipo STRING e de preenchimento obrigatório que armazena o nome do produto.
- **slug**: Coluna do tipo STRING e de preenchimento obrigatório que armazena o slug do produto.
- **use_in_menu**: Coluna do tipo BOOLEAN e de preenchimento opcional que define se a categoria pode ser exibida no menu. Valor padrão deve ser 0.
- **stock**: Coluna do tipo INTEGER e de preenchimento opcional que armazena a quantidade de produto disponível. Valor padrão deve ser 0.
- **description**: Coluna do tipo STRING e de preenchimento opcional que armazena a descrição do produto.
- **price**: Coluna do tipo FLOAT e de preenchimento obrigatório que armazena o preço do produto. 
- **price_with_discount**: Coluna do tipo FLOAT e de preenchimento obrigatório que armazena o preço do produto com desconto. 

> Use a configuração `timestamps: true` do sequelize para gerar as colunas **created_at** e **updated_at**

</details>

<details>
  <summary><strong>Requisito 04 - Criar a tabela de imagens do produto</strong></summary><br>

O objetivo deste requisito é criar a tabela de imagens dos produtos no banco de dados utilizando o Sequelize ORM. A tabela deve conter as colunas a seguir:

- **id**: Coluna do tipo INTEGER que representa a chave primária da tabela. Seu valor deve ser incrementado automaticamente pelo banco de dados
- **product_id**: Coluna do tipo INTEGER que representa a chave estrangeira da tabela. Seu valor deve ser uma referência de um valor existente na primary key da tabela de produtos
- **enabled**: Coluna do tipo BOOLEAN e de preenchimento opcional que define se o produto está habilitado (1) ou desabilitado (0). Valor padrão deve ser 0.
- **path**: Coluna do tipo STRING e de preenchimento obrigatório que armazena o caminho relativo da imagem salva no servidor.

</details>

<details>
  <summary><strong>Requisito 05 - Criar a tabela de opções do produto</strong></summary><br>

O objetivo deste requisito é criar a tabela de opções do produto no banco de dados utilizando o Sequelize ORM. A tabela deve conter as colunas a seguir:

- **id**: Coluna do tipo INTEGER que representa a chave primária da tabela. Seu valor deve ser incrementado automaticamente pelo banco de dados
- **product_id**: Coluna do tipo INTEGER e de preenchimento obrigatório que representa a chave estrangeira da tabela. Seu valor deve ser uma referência de um valor existente na primary key da tabela de produtos
- **title**: Coluna do tipo STRING e de preenchimento obrigatório que armazena o título da opção.
- **shape**: Coluna do tipo ENUM e de preenchimento opcional que armazena o formato em que a opção do produto deve ser renderizada. Essa coluna deve aceitar apenas dois valores (square ou circle). Valor padrão deve ser "square"
- **radius**: Coluna do tipo INTEGER e de preenchimento opcional que armazena o valor do `border-radius` da opção do produto. Valor padrão deve ser 0
- **type**: Coluna do tipo ENUM e de preenchimento opcional que armazena o tipo do input usado como opção. Essa coluna deve aceitar apenas dois valores (text ou color). Valor padrão deve ser "text"
- **values**: Coluna do tipo STRING e de preenchimento obrigatório que armazena todas as opção do produto separadas por vírgula.

</details>

<details>
  <summary><strong>Requisito 06 - Criar a tabela de produtos e categoria</strong></summary><br>

O objetivo deste requisito é criar a tabela de opções do produto no banco de dados utilizando o Sequelize ORM. A tabela deve conter as colunas a seguir:

- **product_id**: Coluna do tipo INTEGER e de preenchimento obrigatório que representa a chave estrangeira da tabela. Seu valor deve ser referência de um valor existente na primary key da tabela de produtos
- **category_id**: Coluna do tipo INTEGER e de preenchimento obrigatório que representa a chave estrangeira da tabela. Seu valor deve ser referência de um valor existente na primary key da tabela de categorias

</details>

## Seção 02 - Implementar endpoints para o CRUD de usuarios

<details>
  <summary><strong>Requisito 01 - Criar endpoint para obter informações do usuário pelo ID</strong></summary><br>
  
- GET /v1/user/:id

**Response body**
```json
{
  "id": 1,
  "firstname": "user firstname",
  "surname": "user surname",
  "email": "user@mail.com"
}  
```

**Response Status Code**
- 200 OK - Deve ser retornado quando a requisição foi bem sucedida
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe
</details>


<details>
  <summary><strong>Requisito 02 - Criar endpoint de cadastro de usuário</strong></summary><br>
  
- POST /v1/user

**Headers**
- Content-type: application/json

**Payload**

```json
{
  "firstname": "user firstname",
  "surname": "user surname",
  "email": "user@mail.com",
  "password": "123@1234",
  "confirmPassword": "123@1234",
}  
```

**Response Status Code**
- 201 Created - Deve ser retornado quando o cadastro for bem sucedido
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
</details>

<details>
  <summary><strong>Requisito 04 - Criar endpoint atualizar usuário</strong></summary><br>

  - PUT /v1/user/:id

**Headers**
- Content-type: application/json

**Payload**
```json
{
  "firstname": "user firstname",
  "surname": "user surname",
  "email": "user@mail.com",
}  
```

**Response Status Code**
- 204 No Content - Deve ser retornado quando a requisição foi bem sucedida mas nenhum corpo deve ser retornado.
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
- 401 Unauthorized - Deve ser retornado quando o token de autorização não for enviado ou estiver incorreto
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe
</details>


<details>
  <summary><strong>Requisito 05 - Criar endpoint de deletar usuário</strong></summary><br>

- DELETE /v1/user/:id

**Headers**
- Content-type: application/json

**Response Status Code**
- 204 No Content - Deve ser retornado quando a requisição foi bem sucedida mas nenhum corpo deve ser retornado.
- 401 Unauthorized - Deve ser retornado quando o token de autorização não for enviado ou estiver incorreto
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe

</details>

## Seção 03 - Implementar endpoints para o CRUD de categorias

<details>
  <summary><strong>Requisito 01 - Criar endpoint para obter uma lista de categorias</strong></summary><br>

- GET /v1/category/search

**Query params**
  - `limit=-1`
    - Query string para definir o limit de itens por página
    - Use `-1` como valor para buscar todos os itens
    - Padrão: 12
  - `page=1`
    - Query string para definir a paginação dos dados retornados
    - Quando `limit` receber `-1` a opção de `page` não tem nenhum efeito no resultado da busca e pode ser omitida da query string
    - Padrão: 1
  - `fields=name,slug`
    - Query string para limitar quais campos serão retornados
  - `use_in_menu=true`
    - Query string para filtrar apenas as categorias que podem aparecer no menu

**Response body**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Shoes",
      "slug": "shoes",
      "use_in_menu": true
    },
    {
      "id": 2,
      "name": "Offers",
      "slug": "offers",
      "use_in_menu": true
    },
    {
      "id": 3,
      "name": "Black Friday",
      "slug": "black-friday",
      "use_in_menu": false
    }
  ],
  "total": 10,
  "limit": -1,
  "page": 1
}  
```

**Response Status Code**
- 200 OK - Deve ser retornado quando a requisição foi bem sucedida
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
</details>

<details>
  <summary><strong>Requisito 02 - Criar endpoint para obter informações da categoria pelo ID</strong></summary><br>

- GET /v1/category/:id

**Response body**
```json
{
  "id": 1,
  "name": "Shoes",
  "slug": "shoes",
  "use_in_menu": true
}  
```

**Response Status Code**
- 200 OK - Deve ser retornado quando a requisição foi bem sucedida
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe
</details>


<details>
  <summary><strong>Requisito 03 - Criar endpoint de cadastro de categoria</strong></summary><br>

- POST /v1/category

**Headers**
- Content-type: application/json

**Payload**

```json
{
  "name": "Shoes",
  "slug": "shoes",
  "use_in_menu": true
}  
```

**Response Status Code**
- 201 Created - Deve ser retornado quando o cadastro for bem sucedido
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
- 401 Unauthorized - Deve ser retornado quando o token de autorização não for enviado ou estiver incorreto
</details>

<details>
  <summary><strong>Requisito 04 - Criar endpoint de atualização de categoria</strong></summary><br>

- PUT /v1/category/:id

**Headers**
- Content-type: application/json

**Payload**
```json
{
  "name": "Shoes",
  "slug": "shoes",
  "use_in_menu": true
} 
```

**Response Status Code**
- 204 No Content - Deve ser retornado quando a requisição foi bem sucedida mas nenhum corpo deve ser retornado.
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
- 401 Unauthorized - Deve ser retornado quando o token de autorização não for enviado ou estiver incorreto
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe
</details>

<details>
  <summary><strong>Requisito 05 - Criar endpoint de deletar categoria</strong></summary><br>

- DELETE /v1/category/:id

**Headers**
- Content-type: application/json

**Response Status Code**
- 204 No Content - Deve ser retornado quando a requisição foi bem sucedida mas nenhum corpo deve ser retornado.
- 401 Unauthorized - Deve ser retornado quando o token de autorização não for enviado ou estiver incorreto
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe
</details>

## Seção 04 - Implementar endpoints para o CRUD de produtos

<details>
  <summary><strong>Requisito 01 - Criar endpoint para obter uma lista de produtos</strong></summary><br>

- GET /v1/product/search

**Query params**
  - `limit=30`
    - Query string para definir o limit de itens por página
    - Use `-1` como valor para buscar todos os itens
    - Padrão: 12
  - `page=2`
    - Query string para definir a paginação dos dados retornados
    - Quando `limit` receber `-1` a opção de `page` não tem nenhum efeito no resultado da busca e pode ser omitida da query string
    - Padrão: 1
  - `fields=name,images,price`
    - Query string para limitar quais campos serão retornados
  - `match=Tênis`
    - Query string usada para filtrar o resultado de produtos por um termo que combine com o nome ou descrição do produto
  - `category_ids=15,24`
    - Query string usada para filtrar o resultado de produtos pelo ID das categorias
  - `price-range=100-200`
    - Query string para filtrar o resultado de produtos por uma determinada "janela" de preços 
  - `option[45]=GG,PP`
    - Query string para filtrar o resultado de produtos pelo valor das opções disponíveis

**Response body**
```json
{
  "data": [
    {
      "id": 1,
      "enabled": true,
      "name": "Produto 01",
      "slug": "produto-01",
      "stock": 10,
      "description": "Descrição do produto 01",
      "price": 119.90,
      "price_with_discount": 99.90,
      "category_ids": [1, 15, 24, 68],
      "images": [
        {
          "id": 1,
          "content": "https://store.com/media/product-01/image-01.png"
        },
        {
          "id": 2,
          "content": "https://store.com/media/product-01/image-02.png"
        },
        {
          "id": 3,
          "content": "https://store.com/media/product-01/image-02.jpg"
        }
      ],
      "options": [
        { 
          "id": 1
          ... 
        },
        { 
          "id": 2
          ... 
        }
      ]
    }
  ],
  "total": 120,
  "limit": 12,
  "page": 1,
}  
```
**Response Status Code**
- 200 OK - Deve ser retornado quando a requisição foi bem sucedida
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
</details>

<details>
  <summary><strong>Requisito 02 - Criar endpoint para obter informações do produto pelo ID</strong></summary><br>

- GET /v1/product/:id

**Response body**
```json
{
  "id": 1,
  "enabled": true,
  "name": "Produto 01",
  "slug": "product-01",
  "stock": 10,
  "description": "Descrição do produto 01",
  "price": 119.90,
  "price_with_discount": 99.90,
  "category_ids": [1, 15, 24, 68],
  "images": [
    {
      "id": 1,
      "content": "https://store.com/media/product-01/image-01.png"
    },
    {
      "id": 2,
      "content": "https://store.com/media/product-01/image-02.png"
    },
    {
      "id": 3,
      "content": "https://store.com/media/product-01/image-02.jpg"
    }
  ],
  "options": [
    { 
      "id": 1
      ... 
    },
    { 
      "id": 2
      ... 
    }
  ]
}  
```

**Response Status Code**
- 200 OK - Deve ser retornado quando a requisição foi bem sucedida
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe
</details>

<details>
  <summary><strong>Requisito 03 - Criar endpoint de criação de produto</strong></summary><br>

- POST /v1/product

**Headers**
- Content-type: application/json

**Payload**

```json
  {
    "enabled": true,
    "name": "Produto 01",
    "slug": "produto-01",
    "stock": 10,
    "description": "Descrição do produto 01",
    "price": 119.90,
    "price_with_discount": 99.90,
    "category_ids": [1, 15, 24, 68],
    "images": [ 
      {
        "type": "image/png",
        "content": "base64 da imagem 1" 
      },
      {
        "type": "image/png",
        "content": "base64 da imagem 2" 
      },
      {
        "type": "image/jpg",
        "content": "base64 da imagem 3" 
      }
    ],
    "options": [
      {
        "title": "Cor",
        "shape": "square",
        "radius": "4px",
        "type": "text",
        "value": ["PP", "GG", "M"]
      },
      {
        "title": "Tamanho",
        "shape": "circle",
        "type": "color",
        "values": ["#000", "#333"]
      }
    ]
  }
  ```

**Response Status Code**
- 201 Created - Deve ser retornado quando o cadastro for bem sucedido
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
- 401 Unauthorized - Deve ser retornado quando o token de autorização não for enviado ou estiver incorreto
</details>

<details>
  <summary><strong>Requisito 04 - Criar endpoint de atualização de produto</strong></summary><br>

- PUT /v1/product/:id

**Headers**
- Content-type: application/json

**Payload**

```json
  {
    "enabled": true,
    "name": "Produto 01 atualizado",
    "slug": "produto-01-atualizado",
    "stock": 20,
    "description": "Descrição do produto 01 atualizado",
    "price": 49.9,
    "price_with_discount": 0,
    "category_ids": [1, 15, 24, 68],
    "images": [ 
      {
        "type": "image/png",
        "content": "base64 da imagem 1" 
      },
      {
        "id": 2,
        "deleted": true
      },
      {
        "id": 3,
        "content": "base64 da imagem 3" 
      },
      {
        "id": 1,
        "content": "https://store.com/media/product-01/image-01.jpg"
      }
    ],
    "options": [
      {
        "id": 1,
        "deleted": true,
      }
      {
        "id": 2,
        "radius": "10px",
        "value": ["42/43", "44/45"]
      },
      {
        "title": "Tipo",
        "shape": "square",
        "type": "text",
        "values": ["100% algodão", "65% algodão"]
      }
    ]
  }
  ```

**Response Status Code**
- 204 No Content - Deve ser retornado quando a requisição foi bem sucedida mas nenhum corpo deve ser retornado.
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
- 401 Unauthorized - Deve ser retornado quando o token de autorização não for enviado ou estiver incorreto
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe
</details>


<details>
  <summary><strong>Requisito 05 - Criar endpoint de atualização de produto</strong></summary><br>

- DELETE /v1/product/:id

**Headers**
- Content-type: application/json

**Response Status Code**
- 204 No Content - Deve ser retornado quando a requisição foi bem sucedida mas nenhum corpo deve ser retornado.
- 401 Unauthorized - Deve ser retornado quando o token de autorização não for enviado ou estiver incorreto
- 404 Not Found - Deve ser retornado quando o recurso solicitado não existe
</details>


## Seção 05 - Implementar e validar token JWT
<details>
  <summary><strong>Requisito 01 - Criar endpoint de geração do token JWT</strong></summary><br>

- POST /v1/user/token

**Headers**
- Content-type: application/json

**Payload**

```json
{
  "email": "user@mail.com",
  "password": "123@1234",
}  
```

**Response body**
```json
{
  "token": "<JWT>",
}  
```

**Response Status Code**
- 200 OK - Deve ser retornado quando a requisição foi bem sucedida
- 400 Bad Request - Deve ser retornado quando a os dados da requisição estiverem incorretos
</details>

<details>
  <summary><strong>Requisito 02 - Validar token nos métodos POST, PUT e DELETE</strong></summary><br>

  As rotas de escrita protegidas devem conter o cabeçalho `Authorization: Bearer <jwt>`, caso contrario a requisição
  deve ser rejeitada com o status code **401 Unauthorized**
<details>