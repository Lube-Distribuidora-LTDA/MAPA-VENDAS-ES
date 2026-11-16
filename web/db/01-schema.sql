-- Mapa de Vendas ES: schema proprio no DATA WAREHOUSE (migracao mapa_vendas_01_schema, 2026-11-16).
-- So o que o mapa precisa e nenhum outro sistema tem: o cadastro do cliente do ES com bairro e coordenada.
-- A VENDA vem de relatorio146.pedido e o FATURADO de comercial.fato_comissao_nf (so leitura, cruzados na consulta do painel).
-- Quem grava: o fluxo mapa_vendas.cliente do Agente Lube (PCCLIENT + PCCIDADE, UF = 'ES'), espelho do WinThor (apagar = tudo).

create schema if not exists mapa_vendas;
revoke all on schema mapa_vendas from public, anon, authenticated;

create table if not exists mapa_vendas.cliente (
  codcli     integer primary key,
  cliente    text,
  fantasia   text,
  bairro     text,          -- BAIRROENT (ou BAIRROCOB), como esta no cadastro; a tela junta as grafias
  latitude   text,          -- texto de proposito: o cadastro tem virgula e lixo; quem valida e a funcao do painel
  longitude  text,
  codusur1   integer,       -- RCA da carteira
  dtultcomp  date,
  dtexclusao date,
  codibge    integer,       -- municipio (PCCIDADE.CODIBGE)
  apto       integer        -- 1 = BLOQUEIO 'N', LIMCRED > 0, BLOQUEIOSEFAZPED 'N' e nao excluido
);
alter table mapa_vendas.cliente enable row level security;
revoke all on mapa_vendas.cliente from public, anon, authenticated;
create index if not exists ix_cliente_codibge on mapa_vendas.cliente (codibge);
comment on table mapa_vendas.cliente is 'Clientes do ES com bairro e coordenada, do WinThor (fluxo mapa_vendas.cliente do Agente Lube). Dado de pessoa: so a credencial de servidor le.';
