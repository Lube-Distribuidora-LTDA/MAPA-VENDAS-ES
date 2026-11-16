/**
 * Conexão com o DATA WAREHOUSE (o mesmo desenho do Relatório 146: session pooler na 5432, abrir → consultar → fechar,
 * tentativas escalonadas). Aqui a função recebe a conexão aberta para rodar várias consultas na mesma foto do banco.
 * A senha vem só de variável de ambiente (local: o ENV carregado pelo servidor_local.js; Vercel: variável do projeto).
 */
"use strict";
const { Client } = require("pg");
try { require("dns").setDefaultResultOrder("ipv4first"); } catch (_) { /* Node antigo */ }

/* ref do projeto DATA WAREHOUSE: variável de outro projeto leria o banco errado sem avisar */
const REF_ESPERADO = "ivcnotrynogaljrvvyes";
const OBRIGATORIAS = ["SUPABASE_DB_HOST", "SUPABASE_DB_USER", "SUPABASE_DB_PASSWORD"];
const ESCALONAR_MS = Number(process.env.DB_ESCALONAR_MS || 4000);
const MAX_TENTATIVAS = Number(process.env.DB_MAX_TENTATIVAS || 3);
const TEMPO_POR_TENTATIVA_MS = Number(process.env.DB_TEMPO_TENTATIVA_MS || 14000);

function configuracao() {
  const usuario = process.env.SUPABASE_DB_USER || "";
  if (!usuario.endsWith(REF_ESPERADO)) throw new Error("SUPABASE_DB_USER aponta para outro projeto (esperado ..." + REF_ESPERADO + ")");
  return {
    host: process.env.SUPABASE_DB_HOST || "aws-0-sa-east-1.pooler.supabase.com",
    port: Number(process.env.SUPABASE_DB_PORT || 5432),
    database: process.env.SUPABASE_DB_NAME || "postgres",
    user: usuario,
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: TEMPO_POR_TENTATIVA_MS,
    query_timeout: 75000,          // limite do lado do cliente: conexão que morre calada não deixa a consulta pendurada (o de 60 s é do servidor)
    keepAlive: true,
    application_name: "painel-mapa-vendas",
  };
}

function conectar() {
  const cfg = configuracao();
  return new Promise((resolve, reject) => {
    let iniciadas = 0, falhas = 0, vencida = false, ultimoErro = null, timer = null;
    function proxima() {
      if (vencida || iniciadas >= MAX_TENTATIVAS) return;
      iniciadas++;
      const c = new Client(cfg);
      c.on("error", () => { /* descartado ou falha tratada abaixo */ });
      c.connect().then(
        () => { if (vencida) { c.end().catch(() => {}); return; } vencida = true; clearTimeout(timer); resolve(c); },
        (e) => {
          ultimoErro = e; falhas++;
          if (vencida) return;
          if (falhas >= MAX_TENTATIVAS) { clearTimeout(timer); reject(ultimoErro); return; }
          if (iniciadas < MAX_TENTATIVAS) { clearTimeout(timer); proxima(); }
        });
      if (iniciadas < MAX_TENTATIVAS) { clearTimeout(timer); timer = setTimeout(proxima, ESCALONAR_MS); }
    }
    proxima();
  });
}

function erroDeConexao(e) {
  if (e && e.code === "57014") return false;      // statement_timeout: o banco respondeu e cancelou; repetir só dobraria a carga
  return /timeout|ECONNRESET|ECONNREFUSED|terminated|ETIMEDOUT|EAUTHQUERY|Connection ended/i.test(String((e && e.message) || ""));
}

/* Abre uma conexão, roda fn(c) dentro de UMA transação só de leitura (todas as consultas veem a mesma foto) e fecha.
   Se a conexão morrer no meio, refaz uma vez. O limite de tempo vai por SET: o pooler ignora as opções da conexão. */
async function lerNaMesmaFoto(fn) {
  let ultimoErro;
  for (let i = 0; i < 2; i++) {
    const c = await conectar();
    try {
      await c.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await c.query("SET LOCAL statement_timeout = 60000");
      const r = await fn(c);
      await c.query("ROLLBACK");
      return r;
    } catch (e) { ultimoErro = e; if (!erroDeConexao(e)) throw e; }
    finally { c.end().catch(() => {}); }
  }
  throw ultimoErro;
}

function faltandoVariaveis() { return OBRIGATORIAS.filter((v) => !process.env[v]); }

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
function semConfiguracao(res) {
  const faltando = faltandoVariaveis();
  if (!faltando.length) return false;
  json(res, 500, { erro: "configuracao_incompleta", mensagem: "Faltam variáveis de ambiente: " + faltando.join(", ") + "." });
  return true;
}
function erroBanco(res, e) {
  console.error("Falha ao consultar o DATA WAREHOUSE:", (e && e.message) || e);
  json(res, 502, { erro: "falha_no_banco", mensagem: "Não consegui ler o banco agora. Tente de novo em instantes; persistindo, fale com o Suporte comercial (julio.cesar@lube.com.br).", detalhe: String(e && e.message ? e.message : e) });
}

module.exports = { lerNaMesmaFoto, faltandoVariaveis, json, semConfiguracao, erroBanco };
