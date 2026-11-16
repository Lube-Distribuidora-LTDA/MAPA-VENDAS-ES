/**
 * Monta o pacote do mapa a partir do que o banco devolveu (a mesma conta do etl/extrair.py, que fica de reserva):
 *   - quem entra: cliente com venda ou nota no período do pacote, ou apto a comprar, ou com compra nos últimos 24 meses;
 *   - lugar no mapa: a coordenada do cadastro quando cai dentro do município (com ~2 km de folga na borda); sem isso,
 *     o meio do bairro (mediana dos vizinhos com coordenada), marcado como aproximado; sem os dois, fica sem ponto;
 *   - bairro escrito de jeitos diferentes (acento, ponto, hífen) é um bairro só: vale a grafia mais usada no município.
 * Nada aqui muda número de venda nem de faturado: esses vêm somados do banco e só ganham o índice do cliente.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const BASE_DIA = "2025-01-01";
let MALHA = null;
function malha() {
  if (MALHA) return MALHA;
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dados", "es_municipios.json"), "utf8"));
  MALHA = new Map();
  for (const f of g.features) {
    let polis = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    const perto = polis.filter((p) => p[0][0][0] < -39);        // sem Trindade e Martim Vaz
    if (perto.length) polis = perto;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of polis) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    MALHA.set(f.properties.ibge, { polis, caixa: [x0, y0, x1, y1] });
  }
  return MALHA;
}
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[^\x00-\x7f]/g, "").toUpperCase().replace(/[.\-]/g, " ").split(/\s+/).filter(Boolean).join(" ");
const limpo = (s) => String(s == null ? "" : s).toUpperCase().split(/\s+/).filter(Boolean).join(" ");
function num(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
function dentroAnel(a, x, y) {
  let ok = false;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const xi = a[i][0], yi = a[i][1], xj = a[j][0], yj = a[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}
function noMunicipio(m, x, y) {
  for (const p of m.polis) if (dentroAnel(p[0], x, y) && !p.slice(1).some((furo) => dentroAnel(furo, x, y))) return true;
  return false;
}
const mediana = (v) => { const a = v.slice().sort((p, q) => p - q), h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const r5 = (v) => Math.round(v * 1e5) / 1e5;

/**
 * @param {object} b  o que o banco devolveu: clientes, venda, faturado (linhas em array), grupos, rcas, sups, hoje, lidoEm, cadastro
 */
function montar(b) {
  const M = malha();
  const grupo = new Map(b.grupos.map((g) => [g[0], g[1] === "INTERNA" ? 1 : g[1] === "ES" || g[1] === "BA" || g[1] === "RJ" ? 0 : 2]));
  const g = (s) => (grupo.has(s) ? grupo.get(s) : 2);            // supervisor fora da tabela = outras equipes
  const comMovimento = new Set();
  for (const l of b.venda) comMovimento.add(l[1]);
  for (const l of b.faturado) comMovimento.add(l[1]);
  const corte24 = b.hojeDia - 730;

  // ---- clientes do pacote: [cod, nome, fant, bairro, lat, lng, rca, ult, ibge, apto, excluido]
  const ficam = [], fora = { antigos: 0, cidade_sem_malha: 0 };
  for (const c of b.clientes) {
    const [cod, nome, fant, bairro, lat, lng, rca, ult, excluido, ibge, apto] = c;
    if (!M.has(ibge)) { fora.cidade_sem_malha++; continue; }
    if (!comMovimento.has(cod) && (excluido || !(apto || (ult != null && ult >= corte24)))) { fora.antigos++; continue; }
    ficam.push({ cod, nome, fant, bairro, lat: num(lat), lng: num(lng), rca, ult, ibge, apto: apto ? 1 : 0, loc: 0, chave: ibge + "|" + norm(bairro), bn: norm(bairro) });
  }

  // ---- lugar no mapa
  const cont = { exata: 0, bairro: 0, sem: 0, coord_fora: 0 }, porBairro = new Map(), F = 0.02;
  for (const c of ficam) {
    let { lat, lng } = c;
    if (lat == null || lng == null) continue;
    if (lat > 0 && lng > 0) { lat = -lat; lng = -lng; }              // sinal esquecido no cadastro
    const m = M.get(c.ibge), [x0, y0, x1, y1] = m.caixa;
    let ok = lng >= x0 - F && lng <= x1 + F && lat >= y0 - F && lat <= y1 + F && noMunicipio(m, lng, lat);
    if (!ok && lng >= x0 - F && lng <= x1 + F && lat >= y0 - F && lat <= y1 + F) {
      for (const dx of [-F, 0, F]) { for (const dy of [-F, 0, F]) if (noMunicipio(m, lng + dx, lat + dy)) { ok = true; break; } if (ok) break; }
    }
    if (ok) {
      c.loc = 1; c.lat = lat; c.lng = lng;
      let v = porBairro.get(c.chave); if (!v) porBairro.set(c.chave, (v = { la: [], lo: [] }));
      v.la.push(lat); v.lo.push(lng);
    } else cont.coord_fora++;
  }
  const centro = new Map();
  for (const [k, v] of porBairro) centro.set(k, [mediana(v.la), mediana(v.lo)]);
  for (const c of ficam) {
    if (c.loc === 1) { cont.exata++; continue; }
    const m = c.bn ? centro.get(c.chave) : null;
    if (m) {
      const ang = ((c.cod * 137.508) % 360) * Math.PI / 180;
      const raio = 0.0006 + 0.0016 * Math.sqrt(((c.cod * 7919) % 1000) / 1000);   // ~70 a 250 m em volta do meio do bairro
      c.lat = m[0] + raio * Math.sin(ang); c.lng = m[1] + raio * Math.cos(ang) / Math.cos(m[0] * Math.PI / 180); c.loc = 2;
      cont.bairro++;
    } else { c.lat = null; c.lng = null; cont.sem++; }
  }

  // ---- um nome por bairro (a grafia mais usada; no empate, a maior em ordem alfabética, como no extrator)
  const grafias = new Map();
  for (const c of ficam) {
    let m = grafias.get(c.chave); if (!m) grafias.set(c.chave, (m = new Map()));
    const t = limpo(c.bairro); m.set(t, (m.get(t) || 0) + 1);
  }
  const nomeBairro = new Map();
  for (const [k, m] of grafias) {
    let melhor = null, n = -1;
    for (const [t, q] of m) if (q > n || (q === n && t > melhor)) { melhor = t; n = q; }
    nomeBairro.set(k, melhor);
  }

  ficam.sort((p, q) => p.cod - q.cod);
  const idx = new Map(ficam.map((c, i) => [c.cod, i]));
  const tx = (s) => String(s == null ? "" : s).trim();
  const cli = {
    cod: ficam.map((c) => c.cod), nome: ficam.map((c) => tx(c.nome)),
    fant: ficam.map((c) => (tx(c.fant) !== tx(c.nome) ? tx(c.fant) : "")),
    bai: ficam.map((c) => nomeBairro.get(c.chave)), ib: ficam.map((c) => c.ibge),
    lat: ficam.map((c) => (c.lat == null ? null : r5(c.lat))), lng: ficam.map((c) => (c.lng == null ? null : r5(c.lng))),
    loc: ficam.map((c) => c.loc), apto: ficam.map((c) => c.apto), ult: ficam.map((c) => c.ult), rca: ficam.map((c) => c.rca),
  };
  function empacotar(linhas) {                    // já vêm ordenadas por dia do banco (a tela procura o começo do período por busca binária)
    const o = { d: [], c: [], r: [], s: [], v: [], n: [], g: [] }, perdido = [0, 0];
    for (const [d, cod, r, s, v, n] of linhas) {
      const i = idx.get(cod);
      if (i == null) { perdido[0]++; perdido[1] += v || 0; continue; }   // cliente que o banco dá como ES e o cadastro não: fica dito na tela
      o.d.push(d); o.c.push(i); o.r.push(r); o.s.push(s); // valor cheio (6 casas): com 4 a soma do mês caía no meio centavo e virava 1 centavo a mais
      o.v.push(Math.round((v || 0) * 1e6) / 1e6); o.n.push(n); o.g.push(g(s));
    }
    return [o, perdido];
  }
  const [ven, perdV] = empacotar(b.venda), [fat, perdF] = empacotar(b.faturado);

  const usadosR = new Set(ven.r.concat(fat.r, cli.rca).filter((x) => x != null));
  const rcaDe = new Map(b.rcas.map((r) => [r[0], r]));
  const usadosS = new Set(ven.s.concat(fat.s).filter((x) => x != null));
  for (const r of usadosR) { const x = rcaDe.get(r); if (x && x[2] != null) usadosS.add(x[2]); }
  const supDe = new Map(b.sups);
  return {
    geradoEm: b.lidoEm, cadastroEm: b.cadastro && b.cadastro.lido_em, cadastroStatus: b.cadastro && b.cadastro.status,
    origem: "banco", baseDia: BASE_DIA, periodo: { ini: BASE_DIA, fim: b.hoje },
    sup: [...usadosS].sort((p, q) => p - q).map((s) => [s, tx(supDe.get(s)) || "Supervisor " + s]),
    rca: [...usadosR].filter((r) => rcaDe.has(r)).sort((p, q) => p - q).map((r) => [r, tx(rcaDe.get(r)[1]), rcaDe.get(r)[2]]),
    cli, ven, fat, lugar: cont, fora, semCliente: { venda: perdV, faturado: perdF },
  };
}

module.exports = { montar, BASE_DIA };
