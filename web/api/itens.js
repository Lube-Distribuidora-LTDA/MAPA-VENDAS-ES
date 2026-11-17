/**
 * /api/itens — venda por fornecedor e produto, para os filtros Fornecedor e Produto do mapa (pedido do Júlio, 2026-11-17).
 *
 * A venda e a nota do Relatório 146 e do Central Comercial são por pedido e por nota: não abrem por produto. Por isso, com
 * fornecedor ou produto escolhido, o mapa usa a MESMA base e a mesma regra da aba Fornecedor do app Supervisor Lube e da
 * Análise Comercial (analise_comercial.venda e .devolucao, mantidas pelo Agente Lube):
 *   VENDA     = item de pedido FATURADO pela regra do 146 (qt × (pvenda − ST), sem bonificação), pela data do pedido;
 *   DEVOLUÇÃO = devolução de cliente sem ST, pela data da devolução;  LÍQUIDO = venda − devolução.
 *
 *   ?lista=1&uf=ES                                → fornecedores e produtos com venda no estado desde o início do pacote
 *   ?uf=ES&forn=1,2&prod=3&de=AAAA-MM-DD&ate=…&de2=…&ate2=…
 *                                                 → por cliente × RCA × supervisor: [período (0 = escolhido, 1 = o de antes),
 *                                                   codcli, codusur, codsupervisor, grupo, venda, devolução, quantidade]
 * Só leitura. Entradas checadas: números inteiros (até 300 de cada), datas AAAA-MM-DD.
 */
"use strict";
const zlib = require("zlib");
const { lerNaMesmaFoto, json, semConfiguracao, erroBanco } = require("./_db");
const { BASE_DIA } = require("./_montar");

const UFS = { ES: 32, BA: 29 };                   // prefixo do código IBGE do município do cliente
const LISTA_MS = 30 * 60 * 1000;
const listas = new Map();                         // uf -> { em, corpo }
const emCurso = new Map();

const ids = (s) => {
  if (!s) return [];
  const v = String(s).split(",").filter(Boolean);
  if (v.length > 300 || v.some((x) => !/^\d{1,9}$/.test(x))) throw Object.assign(new Error("lista inválida"), { status: 400 });
  return [...new Set(v.map(Number))];
};
const data = (s, obrig) => {
  if (!s && !obrig) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) || isNaN(new Date(s + "T00:00:00"))) throw Object.assign(new Error("data inválida"), { status: 400 });
  return s;
};

function responder(res, corpo, gz) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (gz) res.setHeader("Content-Encoding", "gzip");
  res.end(corpo);
}

async function lerLista(uf) {
  const pref = UFS[uf];
  const b = await lerNaMesmaFoto(async (c) => (await c.query({
    rowMode: "array",
    text: `select p.codfornec, v.codprod, sum(v.venda)::float8, count(distinct v.codcli)::int, grouping(v.codprod)::int
             from analise_comercial.venda v
             join mapa_vendas.cliente c on c.codcli = v.codcli and c.codibge / 100000 = $1
             left join analise_comercial.produto p on p.codprod = v.codprod
            where v.data >= date '${BASE_DIA}' and v.venda > 0
            group by grouping sets ((p.codfornec), (v.codprod, p.codfornec))`,
    values: [pref],
  })).rows);
  const nomes = await lerNaMesmaFoto(async (c) => ({
    f: (await c.query({ rowMode: "array", text: "select codfornec, fornecedor from analise_comercial.fornecedor" })).rows,
    p: (await c.query({ rowMode: "array", text: "select codprod, descricao from analise_comercial.produto" })).rows,
  }));
  const nf = new Map(nomes.f), np = new Map(nomes.p), tx = (s) => String(s == null ? "" : s).trim();
  const forn = [], prod = [];
  for (const [f, p, v, n, soForn] of b) {
    const fc = f == null ? 0 : f;
    if (soForn) forn.push([fc, tx(nf.get(fc)) || (fc ? "FORNECEDOR " + fc : "SEM FORNECEDOR"), Math.round(v * 100) / 100, n]);
    else prod.push([p, tx(np.get(p)) || "PRODUTO " + p, fc, Math.round(v * 100) / 100, n]);
  }
  forn.sort((a, z) => z[2] - a[2]); prod.sort((a, z) => z[3] - a[3]);
  const corpo = zlib.gzipSync(Buffer.from(JSON.stringify({ uf, desde: BASE_DIA, forn, prod }), "utf8"));
  return { em: Date.now(), corpo };
}

async function lerItens(uf, forns, prods, faixas) {
  const pref = UFS[uf];
  const partes = [], valores = [pref, forns, prods];
  faixas.forEach(([de, ate], per) => {
    if (!de) return;
    valores.push(de, ate);
    const a = "$" + (valores.length - 1), z = "$" + valores.length;
    partes.push(`select ${per} as per, v.codcli, v.codusur, v.codsupervisor, v.venda, 0::numeric as dev, v.qt
                   from analise_comercial.venda v where v.codprod in (select codprod from pr) and v.data between ${a}::date and ${z}::date`);
    partes.push(`select ${per}, d.codcli, d.codusur, coalesce(d.codsupervisor, 0), 0::numeric, d.dev, 0::numeric
                   from analise_comercial.devolucao d where d.codprod in (select codprod from pr) and d.data between ${a}::date and ${z}::date`);
  });
  const sql = `
    with pr as (select codprod from analise_comercial.produto
                 where (cardinality($2::int[]) = 0 or codfornec = any ($2::int[]))
                   and (cardinality($3::int[]) = 0 or codprod = any ($3::int[]))),
         x as (${partes.join("\n union all ")})
    select x.per, x.codcli::int, x.codusur::int, x.codsupervisor::int,
           case g.grupo when 'INTERNA' then 1 when 'ES' then 0 when 'BA' then 0 when 'RJ' then 0 else 2 end,
           sum(x.venda)::float8, sum(x.dev)::float8, sum(x.qt)::float8
      from x
      join mapa_vendas.cliente c on c.codcli = x.codcli and c.codibge / 100000 = $1
      left join relatorio146.grupo_supervisor g on g.codsupervisor = x.codsupervisor
     group by 1, 2, 3, 4, 5`;
  const linhas = await lerNaMesmaFoto(async (c) => (await c.query({ rowMode: "array", text: sql, values: valores })).rows);
  const r6 = (v) => Math.round((v || 0) * 1e6) / 1e6;
  return linhas.map((l) => [l[0], l[1], l[2], l[3], l[4], r6(l[5]), r6(l[6]), Math.round((l[7] || 0) * 1000) / 1000]);
}

module.exports = async function handler(req, res) {
  if (semConfiguracao(res)) return;
  let q;
  try { q = new URL(req.url, "http://x").searchParams; } catch (e) { return json(res, 400, { erro: "requisicao_invalida" }); }
  const uf = String(q.get("uf") || "ES").toUpperCase();
  if (!UFS[uf]) return json(res, 400, { erro: "uf_invalida", mensagem: "Estado não atendido: " + uf });
  try {
    if (q.get("lista") === "1") {
      let l = listas.get(uf);
      if (!l || Date.now() - l.em > LISTA_MS) {
        if (!emCurso.has(uf)) emCurso.set(uf, lerLista(uf).finally(() => emCurso.delete(uf)));
        l = await emCurso.get(uf); listas.set(uf, l);
      }
      return responder(res, l.corpo, true);
    }
    const forns = ids(q.get("forn")), prods = ids(q.get("prod"));
    if (!forns.length && !prods.length) return json(res, 400, { erro: "sem_filtro", mensagem: "Escolha um fornecedor ou um produto." });
    const faixas = [[data(q.get("de"), true), data(q.get("ate"), true)], [data(q.get("de2")), data(q.get("ate2"))]];
    if (!!faixas[1][0] !== !!faixas[1][1]) return json(res, 400, { erro: "data_invalida" });
    const linhas = await lerItens(uf, forns, prods, faixas);
    responder(res, zlib.gzipSync(Buffer.from(JSON.stringify({ uf, linhas }), "utf8")), true);
  } catch (e) {
    if (e && e.status === 400) return json(res, 400, { erro: "entrada_invalida", mensagem: e.message });
    erroBanco(res, e);
  }
};
