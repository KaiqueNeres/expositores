# Expositores SIAL Paris 2026

Sistema em Node.js para coletar dados públicos dos expositores da feira **SIAL Paris 2026**
(https://www.sialparis.com/en/exhibitors-2026/exhibitors) e visualizá-los em uma página HTML local.

## Como funciona

A página de expositores do site carrega a lista dinamicamente através de uma busca **Algolia**
(a mesma tecnologia usada pelo próprio site). Em vez de abrir o navegador e visitar milhares de
páginas individuais (uma por empresa), este projeto consulta diretamente essa API pública —
o que é muito mais rápido, mais confiável e usa a chave de busca pública que o próprio site já
expõe no navegador de qualquer visitante.

Cada registro retornado pela API já contém: nome, endereço completo (com país em campo separado),
stand(s) na feira, site e redes sociais da empresa — não é necessário abrir a página individual de
cada expositor.

Além do índice de expositores, o site usa um **segundo índice Algolia com os produtos**
(`catalog.prod.sial.products.en`, ~12 mil produtos). Cada produto traz o campo `exhibitor.id`,
que usamos para agrupar os produtos dentro do expositor correspondente. Como esperado, nem toda
empresa cadastra produtos — a maioria (~78%) não tem nenhum produto no catálogo.

### O desafio da paginação e como foi resolvido

A busca "normal" desse índice Algolia tem uma limitação de configuração: não é possível paginar
além de ~2.000 resultados por consulta, mesmo quando existem mais registros no total (atualmente
6.487). Isso acontece por causa da configuração `distinct` do índice combinada com o limite de
paginação (`paginationLimitedTo`), e não há como contornar isso apenas incrementando `page`/`offset`.

A solução implementada: todo registro do índice tem um campo numérico `_createUTCTimestamp`
(data de criação), presente em 100% dos registros — diferente de campos como `address.country`,
que podem vir vazios. O script divide o índice inteiro em **faixas de tempo** e, sempre que uma
faixa tem mais de ~1.800 registros, ela é dividida ao meio recursivamente (bisseção), até que
cada fatia fique pequena o suficiente para ser paginada com segurança. No final, o script
**valida automaticamente** se a quantidade coletada bate com o total informado pela API.

## Requisitos

- Node.js 18 ou superior (usa `fetch` nativo)

## Instalação

```bash
npm install
```

## Uso

### 1. Iniciar a página

```bash
npm start
```

Abra http://localhost:3020. A página **sempre consome os dados salvos em `data/`** — ela não
sai coletando de novo a cada vez que você abre. Na primeira execução, se ainda não existir
nenhum dado local, o servidor dispara a coleta completa automaticamente em segundo plano (a
página já mostra isso e acompanha o progresso).

Tem um botão **"🔄 Atualizar dados"** no topo da página: ele chama a API do servidor
(`POST /api/refresh`), que roda a coleta completa em segundo plano e mostra o progresso em
tempo real ("Coletando expositores: 2.450/7.046..."). A tela continua funcionando normalmente
com os dados antigos enquanto isso — os arquivos em `data/` só são **substituídos se a coleta
terminar com sucesso** (a escrita é atômica: grava em um arquivo temporário e só troca no final,
então ninguém nunca vê um JSON pela metade). Se a coleta falhar, os dados antigos continuam
intactos e a página mostra a mensagem de erro.

Só é possível ter uma atualização em andamento por vez — clicar de novo (ou uma segunda aba)
apenas acompanha a que já está rodando.

`npm run dev` faz a mesma coisa, mas com **nodemon**: reinicia o servidor automaticamente quando
`server.js`, algo em `src/` ou em `public/` é alterado. `npm run serve` é o equivalente sem
auto-reload.

### 2. Coletar manualmente pelo terminal (opcional)

Além do botão na página, também é possível gerar/atualizar os arquivos direto pelo terminal,
sem precisar do servidor rodando:

```bash
npm run collect
```

Isso coleta o índice de expositores **e** o índice de produtos, cruza os dois e gera:

- `data/exhibitors.json` — cada expositor já com `products: [...]` (lista de produtos, vazia
  quando a empresa não cadastrou nenhum) e `socialMedia: {...}` (linkedin, facebook, instagram,
  twitter, tiktok, youtube, pinterest — `null` quando não informado)
- `data/exhibitors.csv` — mesma informação em formato tabular, pronta para abrir direto no Excel
  (separador de colunas `;`, padrão do Excel em português). Não inclui a coluna `id`. A coluna
  `products` traz todos os produtos numa única célula, separados por vírgula (para o detalhe
  completo, incluindo descrição e imagem, use o JSON)

O terminal mostra o progresso, imprime um exemplo do registro bruto recebido da API (tanto de
expositor quanto de produto, na primeira ocorrência de cada) para inspeção, e ao final confirma se
a coleta ficou 100% completa (comparando com o total informado pela própria API).

### 3. Coletar apenas expositores de um filtro específico

A página do site guarda o estado dos filtros (categoria, certificação, etc.) na própria URL.
Basta aplicar o filtro desejado no site, copiar a URL da barra de endereço e passar como
argumento:

```bash
npm run collect -- "https://www.sialparis.com/en/exhibitors-2026/exhibitors?catalog.prod.sial.exhibitors.en%5BhierarchicalMenu%5D%5BbusinessArea.categories.lvl0%5D%5B0%5D=Fruits%20and%20vegetables"
```

O script extrai o(s) filtro(s) da URL automaticamente e coleta apenas os expositores
correspondentes.

> Tipos de filtro suportados: categoria (menu hierárquico) e listas de refinamento (checkboxes,
> ex.: certificações). Filtros de intervalo (sliders numéricos) ainda não são convertidos
> automaticamente — o script avisa no terminal caso encontre um.
>
> Esse filtro só vale para a coleta manual pelo terminal — o botão "Atualizar dados" na página
> sempre coleta tudo.

### 4. Navegando pelos dados na página

A página permite buscar por nome/cidade/stand, filtrar por país e por Activity Field ("Todos" ou
"Alimentos e Produtos" — agrupa as 16 categorias que são efetivamente produtos alimentícios,
excluindo Business Hub, Equipment/Technologies/Services, Organizations/federations/institutions,
Services and trade press e Wines & spirits).

Os botões "Baixar JSON" / "Baixar CSV (Excel)" exportam **apenas os resultados filtrados na tela**
(respeitando busca, país e Activity Field selecionados) — não o arquivo completo.

## Publicando no IIS (ou outra hospedagem estática)

A página usa caminhos relativos, então basta apontar o site para a pasta `public/`. Os arquivos
`index.html`, `app.js` e `styles.css` já ficam lá; falta apenas garantir os **dados**, porque uma
hospedagem estática só enxerga o que está dentro da raiz do site. Duas opções:

```bash
npm run sync:data
```

copia `data/` para `public/data/` (rode de novo depois de cada `npm run collect`). Alternativa sem
cópia: criar no IIS um **diretório virtual chamado `data`** dentro do site, apontando para a pasta
`data/` do projeto — assim os dados novos aparecem sozinhos.

O `public/web.config` já vem com o necessário: `index.html` como documento padrão e os MIME types
de `.json`/`.csv`/`.js` (sem isso, o IIS devolve 404.3 no `exhibitors.json`).

Nesse modo o site é **somente leitura**: não existe o servidor Node por trás, então a API de coleta
(`/api/status`, `/api/refresh`) não responde e a página esconde automaticamente o botão
"Atualizar dados", mostrando a data do arquivo publicado. Para atualizar, rode `npm run collect`
seguido de `npm run sync:data`.

### Deixando o botão "Atualizar dados" funcionar no IIS

O botão precisa do `server.js` rodando **na mesma máquina do IIS**, com o IIS encaminhando `/api/`
para ele. O `public/web.config` já traz a regra de proxy pronta, mas ela só funciona com dois
módulos instalados no servidor:

1. **URL Rewrite** — https://www.iis.net/downloads/microsoft/url-rewrite
2. **Application Request Routing (ARR)** — https://www.iis.net/downloads/microsoft/application-request-routing

Depois de instalar o ARR, é preciso **ligar o proxy** (ele vem desligado): no IIS Manager, clique no
nó do servidor → *Application Request Routing Cache* → *Server Proxy Settings* → marque
**Enable proxy** → *Apply*. Pelo terminal, o equivalente é:

```powershell
C:\Windows\System32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /enabled:true /commit:apphost
```

O `server.js` precisa ficar no ar continuamente na porta 3020 (a mesma da regra do `web.config`).
Rodar `npm start` num terminal só vale para teste: para valer, registre como serviço do Windows
(ex.: [NSSM](https://nssm.cc/) ou `pm2`), senão a API cai quando a sessão fecha.

O site do IIS deve apontar para a pasta `public/` **do próprio projeto** na máquina onde o Node
roda. Assim, quando a coleta termina, o `public/data/` é atualizado automaticamente junto com o
`data/` e o IIS já serve os dados novos, sem cópia manual.

#### Erro 405 (Method Not Allowed) no `/api/refresh`

Vale checar o **corpo da resposta** antes de mexer no IIS: se vier `Método não permitido`, o 405 é
do Node, não do IIS — o proxy funcionou, mas entregou uma rota que o `server.js` não conhece
(típico de usar `{R:1}` na regra em vez de `{R:0}`, o que remove o prefixo `api/`). Uma página de
erro HTML do IIS, por outro lado, indica que a regra de rewrite não chegou a rodar.

## Estrutura do projeto

```
src/
  algoliaClient.js     Cliente HTTP para a API da Algolia (com retry)
  collectEngine.js      Motor genérico de coleta (bisseção + paginação), usado nos dois índices
  parseFilterUrl.js     Lê uma URL do site e extrai os filtros aplicados
  mapExhibitor.js       Converte um registro bruto de expositor no formato final
  mapProduct.js         Converte um registro bruto de produto no formato final
  collectExhibitors.js  Orquestra a coleta completa (expositores + produtos + validação)
  syncPublicData.js     Copia data/ para public/data/ (publicação estática, ex.: IIS)
server.js               Servidor HTTP: serve public/ na raiz e data/ em /data, e expõe a API
                        de atualização (GET /api/status, POST /api/refresh)
public/                 Página HTML de visualização dos dados (raiz do site)
data/                   Saída da coleta (gerada automaticamente; não vai para o git)
```

## Campos coletados

| Campo       | Descrição                                   |
|-------------|----------------------------------------------|
| `id`        | Identificador único do expositor              |
| `name`      | Nome da empresa                               |
| `address_1` a `address_3` | Linhas do endereço                |
| `zipcode`   | CEP / código postal                           |
| `city`      | Cidade                                        |
| `state`     | Estado/região (quando informado)              |
| `country`   | País (campo separado, conforme solicitado)    |
| `stand`     | Hall + número do estande na feira             |
| `website`   | Site da empresa (quando informado)            |
| `mainActivityField` | Categoria principal ("Activity Field") do expositor, ex.: "Grocery products" |
| `activityFields` | Lista de todas as categorias de nível 0 associadas ao expositor (JSON; geralmente só 1) |
| `socialMedia` | Objeto com linkedin, facebook, instagram, twitter, tiktok, youtube, pinterest (JSON) |
| `products`  | Lista de produtos da empresa: `id`, `name`, `brand`, `url`, `madeIn`, `description`, `image` (JSON; vazia se a empresa não cadastrou produtos) |

Alguns expositores têm endereço total ou parcialmente vazio no próprio site oficial — nesse
caso os campos correspondentes vêm como `null`.

## Observações

- Os dados são públicos e vêm da mesma fonte usada pelo site oficial da feira.
- O script inclui um pequeno intervalo entre requisições para ser gentil com a API.
- Este projeto não realiza login, não acessa áreas restritas e não contorna nenhuma proteção —
  apenas consulta a mesma API pública que o navegador de qualquer visitante já usa.
