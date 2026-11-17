/**
 * servidor_local.js — abre a PRÉVIA do Mapa de Vendas ES nesta máquina (http://localhost:3115).
 * A tela lê o DATA WAREHOUSE por /api/dados (venda do Relatório 146, faturado do Central Comercial e o cadastro que o
 * Agente Lube mantém), então está sempre até hoje. A senha do banco vem do arquivo ENV (o mesmo dos outros painéis):
 *   node servidor_local.js ["C:\caminho\ENV"]   ou a variável AGENTE_ENV; sem isso, o ENV do agente ou o do Inventário.
 * Só escuta a própria máquina (127.0.0.1) e só responde a quem chamou por localhost: aqui não tem o login do Painel Lube.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const WEB = __dirname;
const PORTA = Number(process.env.PORT || process.env.PORTA || 3115);
const BI = path.join(WEB, "..", "..");

const candidatos = [process.argv[2], process.env.AGENTE_ENV,
  path.join(BI, "22. AGENTE LUBE", "1 - CONFIGURACAO", "ENV"),
  path.join(BI, "16. INVENTARIO", "etl", "ENV")].filter(Boolean);
const arquivoEnv = candidatos.find((c) => fs.existsSync(c));
if (arquivoEnv) {
  for (const linha of fs.readFileSync(arquivoEnv, "utf8").split(/\r?\n/)) {
    const m = /^\s*(SUPABASE_DB_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);    // só o que o painel usa; nada do Oracle entra aqui
    if (!m) continue;
    let v = m[2];
    if (/^".*"$/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;                        // o ENV manda sobre as variáveis do Windows (as SUPABASE_* do sistema são de outro projeto)
  }
} else console.error("Aviso: não achei o arquivo ENV; sem a senha do banco a tela abre com a cópia guardada em dados/mapa.json.");
process.env.SUPABASE_DB_PORT = process.env.SUPABASE_DB_PORT || "5432";

const rotas = { "/api/dados": require(path.join(WEB, "api", "dados.js")), "/api/itens": require(path.join(WEB, "api", "itens.js")) };
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".webp": "image/webp",
};

http.createServer((req, res) => {
  // só atende quem chamou por localhost (uma página de fora não lê os dados apontando um nome para 127.0.0.1)
  const host = String(req.headers.host || "").toLowerCase();
  if (host !== "localhost:" + PORTA && host !== "127.0.0.1:" + PORTA) { res.statusCode = 403; return res.end("proibido"); }
  let u, f;
  try {
    u = new URL(req.url, "http://localhost");
    if (rotas[u.pathname]) return rotas[u.pathname](req, res);
    f = path.join(WEB, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
  } catch (e) { res.statusCode = 400; return res.end("requisicao invalida"); }
  // só serve o que é da tela, por lista do que PODE (o Windows ignora maiúscula, ponto final e ::$DATA: lista de proibidos fura):
  // na raiz, as páginas, as imagens e o planilha.js; nas pastas css, js, fonts, vendor e dados, os tipos conhecidos.
  const rel = path.relative(WEB, f).toLowerCase();
  const ok = f.startsWith(WEB + path.sep) && !!TIPOS[path.extname(rel)] &&
             (!rel.includes(path.sep) ? (rel === "planilha.js" || !/\.(js|json)$/.test(rel)) : /^(css|js|fonts|vendor|dados)\\[^\\]+$/.test(rel)) &&
             fs.existsSync(f) && fs.statSync(f).isFile();
  if (!ok) { res.statusCode = 404; return res.end("nao encontrado"); }
  res.setHeader("Content-Type", TIPOS[path.extname(rel)]);
  res.setHeader("Cache-Control", "no-cache");
  res.end(fs.readFileSync(f));
}).listen(PORTA, "127.0.0.1", () => console.log("Mapa de Vendas ES (previa) em http://localhost:" + PORTA + "   (Ctrl+C para parar)"));
