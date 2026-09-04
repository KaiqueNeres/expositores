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

### 1. Coletar todos os expositores

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

### 2. Coletar apenas expositores de um filtro específico

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

### 3. Visualizar os dados coletados

```bash
npm run dev
```

Abra http://localhost:3000 no navegador. A página permite buscar por nome/cidade/stand, filtrar
por país e por Activity Field ("Todos" ou "Alimentos e Produtos" — agrupa as 16 categorias que são
efetivamente produtos alimentícios, excluindo Business Hub, Equipment/Technologies/Services,
Organizations/federations/institutions, Services and trade press e Wines & spirits).

Os botões "Baixar JSON" / "Baixar CSV (Excel)" exportam **apenas os resultados filtrados na tela**
(respeitando busca, país e Activity Field selecionados) — não o arquivo completo.

`npm run dev` usa o **nodemon**, reiniciando o servidor automaticamente sempre que um arquivo em
`server.js` ou `public/` for alterado. Para rodar sem auto-reload, use `npm run serve`.

## Estrutura do projeto

```
src/
  algoliaClient.js     Cliente HTTP para a API da Algolia (com retry)
  collectEngine.js      Motor genérico de coleta (bisseção + paginação), usado nos dois índices
  parseFilterUrl.js     Lê uma URL do site e extrai os filtros aplicados
  mapExhibitor.js       Converte um registro bruto de expositor no formato final
  mapProduct.js         Converte um registro bruto de produto no formato final
  collectExhibitors.js  Orquestra a coleta completa (expositores + produtos + validação)
server.js               Servidor HTTP estático (serve /public e /data)
public/                 Página HTML de visualização dos dados
data/                   Saída da coleta (gerada por "npm run collect")
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
