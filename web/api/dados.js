/**
 * /api/dados?uf=ES|BA — o pacote do Mapa de Vendas de um estado, lido do DATA WAREHOUSE na hora (sempre até hoje).
 * A Bahia entrou em 2026-11-17 (Júlio: "o mapa da Bahia pode ficar junto com o ES"):
 *   VENDA    = relatorio146.pedido (o Relatório 146), uf do pedido = o estado (a UF do cliente)
 *   FATURADO = comercial.fato_comissao_nf (venda − devolução sem ST: a aba ST do Central Comercial), cliente da UF
 *   CADASTRO = mapa_vendas.cliente (fluxo mapa_vendas.cliente do Agente Lube: bairro e coordenada do WinThor), pelo
 *              código IBGE do município (32 = ES, 29 = BA)
 * As três tabelas são mantidas pelo Agente Lube; aqui é só leitura, numa transação que vê a mesma foto.
 * A resposta fica 60 s na memória do servidor (várias abas não repetem a leitura); ?fresco=1 lê de novo.
 */
"use strict";
const zlib = require("zlib");
const { lerNaMesmaFoto, json, semConfiguracao, erroBanco } = require("./_db");
const { montar, BASE_DIA } = require("./_montar");

const GUARDA_MS = 60000;
const UFS = { ES: 32, BA: 29 };
const guardado = new Map(), emCurso = new Map();   // por estado

const SQL = {
  agora: `select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') as lido_em,
                 to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as hoje,
                 ((now() at time zone 'America/Sao_Paulo')::date - date '${BASE_DIA}') as hoje_dia`,
  venda: `select (p.data - date '${BASE_DIA}')::int, p.codcli::int, p.codusur::int, p.codsupervisor::int, sum(p.venda)::float8, count(*)::int
            from relatorio146.pedido p
           where p.uf = $1 and p.data >= date '${BASE_DIA}' and p.data <= (now() at time zone 'America/Sao_Paulo')::date
           group by 1, 2, 3, 4 order by 1, 2, 3, 4`,
  faturado: `select (f.dtmov - date '${BASE_DIA}')::int, f.codcli::int, f.codusur::int, f.codsupervisor::int,
                    sum(f.venda - f.devolucao_sem_st)::float8, (count(*) filter (where f.venda <> 0))::int
               from comercial.fato_comissao_nf f join core.dim_cliente c on c.codcli = f.codcli
              where c.uf = $1 and f.dtmov >= date '${BASE_DIA}' and f.dtmov <= (now() at time zone 'America/Sao_Paulo')::date
              group by 1, 2, 3, 4 order by 1, 2, 3, 4`,
  clientes: `select codcli, cliente, fantasia, bairro, latitude, longitude, codusur1, (dtultcomp - date '${BASE_DIA}')::int,
                    (dtexclusao is not null), codibge, apto
               from mapa_vendas.cliente where codibge / 100000 = $1`,
  grupos: `select codsupervisor, grupo from relatorio146.grupo_supervisor`,
  rcas: `select codusur, nome, codsupervisor from core.dim_rca`,
  sups: `select codsupervisor, nome from core.dim_supervisor`,
  cadastro: `select to_char(lido_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') as lido_em, status
               from agente.estado where fluxo = 'mapa_vendas.cliente'`,
};

async function ler(uf) {
  const t0 = Date.now();
  const b = await lerNaMesmaFoto(async (c) => {
    const valores = { venda: [uf], faturado: [uf], clientes: [UFS[uf]] };
    const linhas = async (q) => (await c.query({ text: SQL[q], rowMode: "array", values: valores[q] })).rows;
    const agora = (await c.query(SQL.agora)).rows[0];
    return {
      lidoEm: agora.lido_em, hoje: agora.hoje, hojeDia: agora.hoje_dia,
      venda: await linhas("venda"), faturado: await linhas("faturado"), clientes: await linhas("clientes"),
      grupos: await linhas("grupos"), rcas: await linhas("rcas"), sups: await linhas("sups"),
      cadastro: (await c.query(SQL.cadastro)).rows[0] || null,
    };
  });
  if (!b.clientes.length) throw new Error("mapa_vendas.cliente sem clientes de " + uf + ": o fluxo do Agente Lube ainda não gravou o cadastro");
  const pacote = montar(b, uf);
  pacote.msBanco = Date.now() - t0;
  return { em: Date.now(), corpo: zlib.gzipSync(Buffer.from(JSON.stringify(pacote), "utf8"), { level: 6 }), lidoEm: pacote.geradoEm };
}

module.exports = async function handler(req, res) {
  if (semConfiguracao(res)) return;
  const fresco = /[?&]fresco=1\b/.test(req.url || "");
  const m = /[?&]uf=([A-Za-z]{2})\b/.exec(req.url || ""), uf = m ? m[1].toUpperCase() : "ES";
  if (!UFS[uf]) return json(res, 400, { erro: "uf_invalida", mensagem: "Estado não atendido: " + uf });
  try {
    let g = guardado.get(uf);
    if (!g || fresco || Date.now() - g.em > GUARDA_MS) {
      if (!emCurso.has(uf)) emCurso.set(uf, ler(uf).finally(() => emCurso.delete(uf)));   // pedidos simultâneos esperam a mesma leitura
      g = await emCurso.get(uf); guardado.set(uf, g);
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Lido-Em", g.lidoEm);
    res.end(g.corpo);
  } catch (e) { erroBanco(res, e); }
};
