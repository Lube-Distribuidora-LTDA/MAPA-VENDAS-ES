/**
 * /api/dados — o pacote do Mapa de Vendas ES, lido do DATA WAREHOUSE na hora (sempre até hoje):
 *   VENDA    = relatorio146.pedido (o Relatório 146), cliente com uf = 'ES'
 *   FATURADO = comercial.fato_comissao_nf (venda − devolução sem ST: a aba ST do Central Comercial), cliente uf = 'ES'
 *   CADASTRO = mapa_vendas.cliente (fluxo mapa_vendas.cliente do Agente Lube: bairro e coordenada do WinThor)
 * As três tabelas são mantidas pelo Agente Lube; aqui é só leitura, numa transação que vê a mesma foto.
 * A resposta fica 60 s na memória do servidor (várias abas não repetem a leitura); ?fresco=1 lê de novo.
 */
"use strict";
const zlib = require("zlib");
const { lerNaMesmaFoto, json, semConfiguracao, erroBanco } = require("./_db");
const { montar, BASE_DIA } = require("./_montar");

const GUARDA_MS = 60000;
let guardado = null, emCurso = null;

const SQL = {
  agora: `select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') as lido_em,
                 to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as hoje,
                 ((now() at time zone 'America/Sao_Paulo')::date - date '${BASE_DIA}') as hoje_dia`,
  venda: `select (p.data - date '${BASE_DIA}')::int, p.codcli::int, p.codusur::int, p.codsupervisor::int, sum(p.venda)::float8, count(*)::int
            from relatorio146.pedido p
           where p.uf = 'ES' and p.data >= date '${BASE_DIA}' and p.data <= (now() at time zone 'America/Sao_Paulo')::date
           group by 1, 2, 3, 4 order by 1, 2, 3, 4`,
  faturado: `select (f.dtmov - date '${BASE_DIA}')::int, f.codcli::int, f.codusur::int, f.codsupervisor::int,
                    sum(f.venda - f.devolucao_sem_st)::float8, (count(*) filter (where f.venda <> 0))::int
               from comercial.fato_comissao_nf f join core.dim_cliente c on c.codcli = f.codcli
              where c.uf = 'ES' and f.dtmov >= date '${BASE_DIA}' and f.dtmov <= (now() at time zone 'America/Sao_Paulo')::date
              group by 1, 2, 3, 4 order by 1, 2, 3, 4`,
  clientes: `select codcli, cliente, fantasia, bairro, latitude, longitude, codusur1, (dtultcomp - date '${BASE_DIA}')::int,
                    (dtexclusao is not null), codibge, apto
               from mapa_vendas.cliente`,
  grupos: `select codsupervisor, grupo from relatorio146.grupo_supervisor`,
  rcas: `select codusur, nome, codsupervisor from core.dim_rca`,
  sups: `select codsupervisor, nome from core.dim_supervisor`,
  cadastro: `select to_char(lido_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') as lido_em, status
               from agente.estado where fluxo = 'mapa_vendas.cliente'`,
};

async function ler() {
  const t0 = Date.now();
  const b = await lerNaMesmaFoto(async (c) => {
    const linhas = async (q) => (await c.query({ text: SQL[q], rowMode: "array" })).rows;
    const agora = (await c.query(SQL.agora)).rows[0];
    return {
      lidoEm: agora.lido_em, hoje: agora.hoje, hojeDia: agora.hoje_dia,
      venda: await linhas("venda"), faturado: await linhas("faturado"), clientes: await linhas("clientes"),
      grupos: await linhas("grupos"), rcas: await linhas("rcas"), sups: await linhas("sups"),
      cadastro: (await c.query(SQL.cadastro)).rows[0] || null,
    };
  });
  if (!b.clientes.length) throw new Error("mapa_vendas.cliente está vazia: o fluxo do Agente Lube ainda não gravou o cadastro");
  const pacote = montar(b);
  pacote.msBanco = Date.now() - t0;
  return { em: Date.now(), corpo: zlib.gzipSync(Buffer.from(JSON.stringify(pacote), "utf8"), { level: 6 }), lidoEm: pacote.geradoEm };
}

module.exports = async function handler(req, res) {
  if (semConfiguracao(res)) return;
  const fresco = /[?&]fresco=1\b/.test(req.url || "");
  try {
    if (!guardado || fresco || Date.now() - guardado.em > GUARDA_MS) {
      if (!emCurso) emCurso = ler().finally(() => { emCurso = null; });     // pedidos simultâneos esperam a mesma leitura
      guardado = await emCurso;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Lido-Em", guardado.lidoEm);
    res.end(guardado.corpo);
  } catch (e) { erroBanco(res, e); }
};
