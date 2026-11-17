# Mapa de Vendas — ES e Bahia — Lube Distribuidora

O painel "LUBE ES" (mapa de vendas do Espírito Santo) recriado com a identidade da Lube. Pedido do Júlio em 2026-11-16.
**Bahia no mesmo mapa desde 2026-11-17** (Júlio: "divide apenas assim: ES e BAHIA; quando clicar vem um zoom e abre o
mapa do estado"): a tela abre com os dois estados; o clique num deles abre o mapa dele. Link direto: `?uf=ES` ou `?uf=BA`.
Os filtros valem também com os dois estados na tela (somam ES e BA; cidade ou bairro abre o estado dela) e seguem ao trocar de estado.
**Filtros Fornecedor e Produto desde 2026-11-17** (ver abaixo).
**No ar desde 2026-11-16** em https://mapa-vendas-es.vercel.app, fechado pela Sentinela (só entra quem tem acesso pelo\nPainel Lube; cartão em COMERCIAL). Na máquina: `INICIAR.bat` (http://localhost:3115).

## Abrir
- `INICIAR.bat` → http://localhost:3115 (só esta máquina; os dados têm nome de cliente). Na primeira vez instala o `pg`.
- **Não precisa atualizar nada:** a tela lê o DATA WAREHOUSE por `/api/dados`, relê sozinha de 5 em 5 minutos e tem o
  botão Atualizar. O topo mostra a hora da leitura; o rodapé do menu, a hora do cadastro.
- `ATUALIZAR DADOS.bat` é **reserva**: refaz a cópia guardada (`web/dados/mapa.json`) que a tela usa, com aviso em
  âmbar, quando o banco não responde.

## De onde vem (sempre até hoje, pelo Agente Lube)
| Dado | Tabela no banco | Quem mantém |
|---|---|---|
| Venda | `relatorio146.pedido` | fluxos do Relatório 146 (segundos) |
| Faturado | `comercial.fato_comissao_nf` | fluxos do Central Comercial |
| Cadastro com bairro e coordenada (ES e BA) | `mapa_vendas.cliente` (schema deste painel, `web/db/01-schema.sql`) | fluxo **`mapa_vendas.cliente`** (`22. AGENTE LUBE\2 - AGENTE\fluxos\mapa_vendas.toml`), de hora em hora |

`web/api/dados.js?uf=ES|BA` lê as três numa transação só de leitura, um estado por vez (a venda por item dos filtros
Fornecedor e Produto vem de `analise_comercial.venda` e `.devolucao`, por `web/api/itens.js`); `web/api/_montar.js` põe cada cliente no mapa (a mesma conta
do `etl/extrair.py`). A senha do banco vem do arquivo ENV que o `servidor_local.js` carrega (só as `SUPABASE_DB_*`).
Ver se o fluxo rodou: `select status, lido_em, linhas from agente.estado where fluxo = 'mapa_vendas.cliente'`.

## Fornecedor e Produto (2026-11-17)
A venda do Relatório 146 e a nota do Central Comercial são por pedido e por nota: não abrem por produto. Com fornecedor
ou produto escolhido, a tela pede `web/api/itens.js` e usa a **mesma base da aba Fornecedor do app Supervisor Lube e da
Análise Comercial**: venda = item de pedido **faturado** pela regra do 146 (sem ST, sem bonificação), pela data do
pedido; no lugar do faturado, **líquido = venda − devolução sem ST**. A faixa de filtros avisa a troca. Conferido: COAMO
(2181) no ES de 01 a 17/11/2026 igual à consulta direta no banco (valor e clientes).

## Operação interna
Categoria à parte, na venda e no faturado (Júlio, 2026-11-16: "se ele quiser ver ele clica e aparece"): cartão roxo, fora
dos totais; o clique mostra no mapa, no painel e na lista os clientes que só compraram por ela (que não contam como
"sem venda"). Faturado das equipes + operação interna + outras equipes = total líquido da aba ST.

## Os dois números (decisão do Júlio, 2026-11-16)
"VENDAS (RELATÓRIO 146) E O FATURADO (DA CENTRAL DO COMERCIAL / ST), O MESMO NÚMERO QUE VAI PRO APLICATIVO DOS SUPERVISORES."
Os dois são lidos das tabelas que os próprios BIs mostram, no DATA WAREHOUSE (mantidas ao vivo pelo Agente Lube):

| Número | De onde | Regra |
|---|---|---|
| **Venda** | `relatorio146.pedido`, `uf = 'ES'` | pedido digitado, sem ST, todas as filiais. Só as **equipes de venda** (`relatorio146.grupo_supervisor`: ES, BA, RJ) somam e contam o cliente como atendido; a **operação interna** e as outras equipes aparecem à parte, "fora do total", como no Relatório 146 |
| **Faturado** | `comercial.fato_comissao_nf`, cliente `uf = 'ES'` | `venda − devolucao_sem_st` por nota, todos os supervisores e filiais: o TOTAL LIQUIDO da aba "Comissão RCA - ST" do Central Comercial, o mesmo FATURADO do app Supervisor Lube |

**Cliente atendido** = tem pedido de equipe de venda no período (a positivação do 146). O faturado é pela data da nota:
um cliente pode ter faturado sem venda no período (pedido do mês anterior) e o contrário.

## O que mostra
- Cartões: total de vendas e faturado (cada um com a comparação com o período de antes), clientes atendidos e sem
  venda, bairros atendidos, população (IBGE, Censo 2022) e venda por habitante.
- **Mapa:** os 78 municípios pintados pela venda (ou faturado, % de clientes atendidos, venda por habitante); em
  vermelho, os sem atendimento no período. **O clique abre o município**: o mapa voa até ele, mostra as ruas e cada
  cliente como um ponto, **verde = com venda** (tamanho = valor), **vermelho = sem venda**. Botão Bairros: uma bolha por
  bairro (com venda / clientes). O clique no bairro abre os clientes dele; o clique no cliente abre o cartão dele.
- Painel ao lado: municípios → bairros → clientes. Lista embaixo, com busca, ordenação e Excel.
- Filtros: período, supervisor, RCA, cidade, fornecedor, produto, bairro (sem município aberto, todos os bairros com a cidade ao lado;
  escolher abre o município e o bairro), base de clientes.

## Outras regras
- **Base** (quem pode aparecer "sem venda") = aptos a comprar (sem bloqueio, com limite de crédito, sem bloqueio na
  Sefaz) + quem teve movimento no período; ou quem comprou em 12 meses; ou todos (aptos ou compra em 24 meses).
  Com filtro de RCA ou supervisor: venda e faturado pelo RCA/supervisor **do pedido ou da nota**; a base, pelo RCA 1 do cliente.
- **Lugar no mapa:** latitude/longitude do cadastro quando cai dentro do município; sem isso, o meio do bairro (mediana
  dos vizinhos com coordenada), desenhado tracejado; sem os dois, o cliente conta nos números e na lista, sem ponto.
- População e malha: IBGE (`etl/baixar_ibge.py`, uma vez). As ruas são do OpenStreetMap (precisa de internet; o painel
  só pede os ladrilhos do mapa, nenhum dado da Lube sai).

## Conferência
`conferencia/conferir_bis.py` compara o pacote com os dois BIs no banco, mês a mês. Em 2026-11-16: **janeiro a
outubro/2026 iguais ao centavo** nos dois (venda, pedidos, clientes com venda e faturado; os números ficam no cérebro,\nfora do repositório). O mês corrente anda entre a extração e a conferência: o banco é ao vivo.

## Em relação ao painel antigo (Power BI)
- A venda do antigo era outra conta (itens com ST, só filial 1 e condição 1, 24 supervisores fixos); a regra foi lida do
  modelo e conferida (outubro/2026 ao centavo) antes de ser trocada pela do 146. `conferencia/conferir_power_bi.py` é o registro.
- "Total de clientes" é a base de clientes, não só quem comprou (no antigo, com o período inteiro, dava sempre 100%).
- Cliente e bairro se contam pelo código e por cidade + bairro; cidade vem do cadastro de cidades (código IBGE).
- Período desde 01/01/2025 (o antigo guardava 7 meses); o faturado não existia no antigo.

## Pastas
`etl/` extrator e IBGE · `conferencia/` sondas e conferências · `web/` a tela (`js/app.js`, `css/mapa.css`, Leaflet em `vendor/`).
`web/dados/mapa.json` nunca vai para repositório (nome de cliente).
