/* =============================================================================
 * Mapa de Vendas — ES e Bahia. Pedido do Júlio: o "LUBE ES" recriado com a identidade da Lube (2026-11-16) e, desde
 * 2026-11-17, a Bahia no mesmo mapa ("divide apenas assim: ES e BAHIA; quando clicar vem um zoom e abre o estado").
 * A tela abre com os dois estados; o clique num deles dá o zoom e abre o mapa daquele estado (um pacote por estado).
 *   dados/es_municipios.json = malha e população do IBGE (etl/baixar_ibge.py)
 *   dados/mapa.json          = clientes do ES e venda por dia × cliente × RCA × supervisor (etl/extrair.py, só leitura)
 * Tudo se calcula aqui, no navegador. O clique no município abre o mapa nele e mostra, cliente a cliente e bairro a
 * bairro, onde teve venda (verde) e onde não teve (vermelho).
 * ========================================================================== */
(function () {
"use strict";

const $ = (s, el) => (el || document).querySelector(s);
const ic = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const IC = {
  mapa: ic('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  lista: ic('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>'),
  sol: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  lua: ic('<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>'),
  menu: ic('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  seta: ic('<path d="m6 9 6 6 6-6"/>'),
  voltar: ic('<path d="M15 18l-6-6 6-6"/>'),
  busca: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  excel: ic('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13l4 5M13 13l-4 5"/>'),
  dinheiro: ic('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>'),
  pessoas: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'),
  nota: ic('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>'),
  casa2: ic('<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>'),
  girar: ic('<path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15.5"/><path d="M20 20v-4.5h-4.5"/>'),
  alvo: ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  alerta: ic('<path d="M12 3 2 20h20z"/><path d="M12 10v5M12 17.5v.01"/>'),
  casa: ic('<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  gente: ic('<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>'),
  calend: ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  filtro: ic('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
};

const brl = (v) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function curto(v) {
  const a = Math.abs(v || 0);
  if (a >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " mi";
  if (a >= 1e3) return "R$ " + (v / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " mil";
  return brl(v);
}
const pct = (v) => ((v || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const inteiro = (v) => Math.round(v || 0).toLocaleString("pt-BR");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const titulo = (s) => String(s || "").toLowerCase().replace(/(^|[\s\-(/.])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(D[aeo]s?|E)\b/g, (m) => m.toLowerCase()).replace(/\b(Ltda|Me|Epp|Sa|S\/a|Mei|Eireli)\b/gi, (m) => m.toUpperCase());
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const calmo = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function marcar(txt, q) {
  const t = esc(txt); if (!q) return t;
  const i = sem(txt).indexOf(q); if (i < 0) return t;
  return esc(txt.slice(0, i)) + "<mark>" + esc(txt.slice(i, i + q.length)) + "</mark>" + esc(txt.slice(i + q.length));
}

/* ------------------------------------------------------------------ dados e estado */
let D = null, C = null, V = null, FT = null;
const NOMES_UF = { ES: "Espírito Santo", BA: "Bahia" }, UFS_ORDEM = ["ES", "BA"];
const UFX = {};                                 // uf -> { D, GEO, CID, camada, cam, itl, erro }: o que cada estado já carregou
let EST = null, RG = null;                      // contorno dos estados (visão geral) e os números de cada estado na visão geral
const nomeUF = () => S.uf ? NOMES_UF[S.uf] : "ES e Bahia";
let BASE = null, FIM = 0;                       // dia 0 e o último dia (hoje) em índice de dia
let CID = new Map();                            // ibge -> { ibge, nome, pop, feicao, centro } (do estado aberto)
const SUP_NOME = new Map(), RCA_NOME = new Map(), RCA_SUP = new Map();
const S = {
  uf: null, d0: 0, d1: 0, rapido: "mes", sup: new Set(), rca: new Set(), forn: new Set(), prod: new Set(), base: "aptos",
  cidade: null, bairro: null, metrica: "venda", camada: "clientes", ruas: true, interna: false,
  ordCid: "venda", ordBai: "sem", tbFiltro: "todos", tbBusca: "", tbOrd: "venda", tbDir: -1, tbPag: 0, tbTam: 50,
};
let R = null;                                   // resultado do cálculo do recorte
/* Fornecedor e produto (Júlio, 2026-11-17): a venda do 146 e a nota do Central Comercial não abrem por produto. Com um
   deles escolhido, a tela pede ao banco (api/itens) a venda por item da MESMA base da aba Fornecedor do app Supervisor Lube
   e da Análise Comercial: item de pedido faturado (regra do 146, sem ST) e, no lugar do faturado, venda − devolução. */
let ITL = null, ITL_PEDIDO = null;              // lista de fornecedores e produtos do estado aberto
let IT = null, IT_PEDIDO = null;                // { chave, cur: [linhas], ant: [linhas], perdido }
const CIDX = new Map();                         // código do cliente -> índice no pacote
const itemAtivo = () => S.forn.size > 0 || S.prod.size > 0;
const rotFat = () => itemAtivo() ? "Líquido" : "Faturado";

const diaData = (i) => new Date(BASE.getTime() + i * 86400000);
const iso = (i) => { const d = diaData(i); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const dataBR = (i) => i == null ? "" : iso(i).split("-").reverse().join("/");
const indice = (s) => Math.round((new Date(s + "T00:00:00") - BASE) / 86400000);
const BAI = (i) => C.bai[i] || "(sem bairro)";

function periodoRapido(k) {
  const f = diaData(FIM), a = f.getFullYear(), m = f.getMonth();
  const ix = (d) => Math.max(0, Math.round((d - BASE) / 86400000));
  if (k === "mes") return [ix(new Date(a, m, 1)), FIM];
  if (k === "ant") return [ix(new Date(a, m - 1, 1)), ix(new Date(a, m, 0))];
  if (k === "3m") return [ix(new Date(a, m - 2, 1)), FIM];
  if (k === "ano") return [ix(new Date(a, 0, 1)), FIM];
  return [0, FIM];
}
function periodoAnterior() {                     // o trecho de antes, com o mesmo número de dias (mês: os mesmos dias do mês anterior)
  const a = diaData(S.d0), b = diaData(S.d1);
  const ix = (d) => Math.round((d - BASE) / 86400000);
  if (a.getDate() === 1 && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    const ini = new Date(a.getFullYear(), a.getMonth() - 1, 1), ult = new Date(a.getFullYear(), a.getMonth(), 0).getDate();
    const cheio = b.getDate() === new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
    return [ix(ini), ix(new Date(ini.getFullYear(), ini.getMonth(), cheio ? ult : Math.min(b.getDate(), ult)))];
  }
  const n = S.d1 - S.d0 + 1;
  return [S.d0 - n, S.d0 - 1];
}
function inicioEm(T, d) { let lo = 0, hi = T.d.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T.d[m] < d) lo = m + 1; else hi = m; } return lo; }

/* ------------------------------------------------------------------ cálculo do recorte */
function calcular() {
  const n = C.cod.length;
  const venda = new Float64Array(n), ped = new Float64Array(n), comprou = new Uint8Array(n), uni = new Uint8Array(n), dev = new Float64Array(n);
  const fat = new Float64Array(n), nfs = new Int32Array(n), fora = new Float64Array(n), moveu = new Uint8Array(n);
  const foraF = new Float64Array(n), vint = new Float64Array(n), fint = new Float64Array(n), temInt = new Uint8Array(n), soInt = new Uint8Array(n);
  const fs = S.sup.size, fr = S.rca.size;
  // Grupo do supervisor (g): 0 = equipe de venda (ES, BA, RJ), 1 = OPERAÇÃO INTERNA, 2 = outras equipes.
  // Só as equipes somam nos totais e contam o cliente como atendido. A operação interna é uma categoria à parte
  // (Júlio, 2026-11-16: "fica como OPERAÇÃO INTERNA, se ele quiser ver ele clica e aparece"), na venda e no faturado.
  if (itemAtivo()) {
    // Fornecedor/produto: [per, codcli, rca, sup, grupo, venda, devolução, qt]; venda = item de pedido faturado, "faturado" = venda − devolução
    const linhas = IT && IT.chave === chaveItens() ? IT.cur : [];
    for (const [, cod, r, s, g, v, dv, q] of linhas) {
      if (fs && !S.sup.has(s)) continue;
      if (fr && !S.rca.has(r)) continue;
      const c = CIDX.get(cod); if (c == null) continue;
      if (g === 1) { vint[c] += v; fint[c] += v - dv; temInt[c] = 1; continue; }
      if (g) { fora[c] += v; foraF[c] += v - dv; continue; }
      venda[c] += v; dev[c] += dv; fat[c] += v - dv; ped[c] += q; moveu[c] = 1; if (v > 0) comprou[c] = 1;
    }
  } else {
  // VENDA = Relatório 146 (pedido digitado, sem ST, todas as filiais).
  for (let i = inicioEm(V, S.d0), m = V.d.length; i < m && V.d[i] <= S.d1; i++) {
    if (fs && !S.sup.has(V.s[i])) continue;
    if (fr && !S.rca.has(V.r[i])) continue;
    const c = V.c[i], g = V.g[i];
    if (g === 1) { vint[c] += V.v[i]; temInt[c] = 1; continue; }
    if (g) { fora[c] += V.v[i]; continue; }
    venda[c] += V.v[i]; ped[c] += V.n[i]; comprou[c] = 1; moveu[c] = 1;
  }
  // FATURADO = total líquido da aba ST do Central Comercial (venda − devolução sem ST), o mesmo do app dos supervisores
  for (let i = inicioEm(FT, S.d0), m = FT.d.length; i < m && FT.d[i] <= S.d1; i++) {
    if (fs && !S.sup.has(FT.s[i])) continue;
    if (fr && !S.rca.has(FT.r[i])) continue;
    const c = FT.c[i], g = FT.g[i];
    if (g === 1) { fint[c] += FT.v[i]; temInt[c] = 1; continue; }
    if (g) { foraF[c] += FT.v[i]; continue; }
    fat[c] += FT.v[i]; nfs[c] += FT.n[i]; moveu[c] = 1;
  }
  }
  const corte12 = FIM - 365;
  const cid = new Map();
  for (const c of CID.values()) cid.set(c.ibge, { ibge: c.ibge, nome: c.nome, pop: c.pop, venda: 0, fat: 0, fora: 0, foraF: 0, ped: 0, nfs: 0, cli: 0, at: 0, semPonto: 0, vInt: 0, fInt: 0, nInt: 0, idsInt: [], bairros: new Map() });
  for (let i = 0; i < n; i++) {
    const o = cid.get(C.ib[i]);
    if (fora[i] || foraF[i]) { o.fora += fora[i]; o.foraF += foraF[i]; }     // é valor de venda: não depende da base escolhida
    if (temInt[i]) { o.vInt += vint[i]; o.fInt += fint[i]; }
    if (temInt[i] && !moveu[i]) {                  // só comprou pela operação interna: categoria à parte, fora da base e do "sem venda"
      soInt[i] = 1; o.nInt++; o.idsInt.push(i); continue;
    }
    let dentro = moveu[i];
    if (!dentro) {
      const naBase = S.base === "aptos" ? C.apto[i] : S.base === "12m" ? (C.ult[i] != null && C.ult[i] >= corte12) : 1;
      dentro = naBase && (!fr || S.rca.has(C.rca[i])) && (!fs || S.sup.has(RCA_SUP.get(C.rca[i])));
    }
    if (!dentro) continue;
    uni[i] = 1;
    o.cli++; o.venda += venda[i]; o.fat += fat[i]; o.ped += ped[i]; o.nfs += nfs[i]; if (comprou[i]) o.at++; if (!C.loc[i]) o.semPonto++;
    const nb = BAI(i);
    let b = o.bairros.get(nb); if (!b) o.bairros.set(nb, (b = { nome: nb, venda: 0, fat: 0, fora: 0, foraF: 0, ped: 0, nfs: 0, cli: 0, at: 0, ids: [] }));
    b.cli++; b.venda += venda[i]; b.fat += fat[i]; b.fora += fora[i]; b.foraF += foraF[i]; b.ped += ped[i]; b.nfs += nfs[i]; if (comprou[i]) b.at++; b.ids.push(i);
  }
  R = { venda, ped, comprou, uni, cid, fat, nfs, fora, foraF, vint, fint, temInt, soInt, dev };
}
function escopo() {                              // visão geral: a soma dos estados; senão, o recorte do estado aberto
  if (S.uf != null || !RG) return escopoUF();
  const o = { venda: 0, fat: 0, fora: 0, foraF: 0, ped: 0, nfs: 0, cli: 0, at: 0, bai: 0, baiAt: 0, pop: 0, vInt: 0, fInt: 0, nInt: 0, ids: null, nome: "ES e Bahia" };
  for (const uf in RG) for (const k in o) if (typeof o[k] === "number") o[k] += RG[uf].e[k];
  return o;
}
function escopoUF() {                            // os números do recorte que está na tela: estado, município ou bairro
  const o = { venda: 0, fat: 0, fora: 0, foraF: 0, ped: 0, nfs: 0, cli: 0, at: 0, bai: 0, baiAt: 0, pop: 0, vInt: 0, fInt: 0, nInt: 0, ids: null, nome: NOMES_UF[D.uf || "ES"] };
  const soma = (x) => { o.venda += x.venda; o.fat += x.fat; o.fora += x.fora; o.foraF += x.foraF; o.ped += x.ped; o.nfs += x.nfs; o.cli += x.cli; o.at += x.at;
    if (x.idsInt) { o.vInt += x.vInt; o.fInt += x.fInt; o.nInt += x.nInt; } };
  if (S.cidade != null) {
    const c = R.cid.get(S.cidade);
    o.nome = c.nome;
    if (S.bairro != null) {
      const b = c.bairros.get(S.bairro);
      o.nome = titulo(S.bairro) + " · " + c.nome; o.bai = 1;
      if (b) { soma(b); o.baiAt = b.at ? 1 : 0; o.ids = b.ids; for (const i of b.ids) { o.vInt += R.vint[i]; o.fInt += R.fint[i]; } }
      for (const i of c.idsInt) if (BAI(i) === S.bairro) { o.vInt += R.vint[i]; o.fInt += R.fint[i]; o.nInt++; }
    } else {
      soma(c); o.pop = c.pop; o.bai = c.bairros.size;
      for (const b of c.bairros.values()) if (b.at) o.baiAt++;
    }
    return o;
  }
  for (const c of R.cid.values()) {
    soma(c); o.pop += c.pop; o.bai += c.bairros.size;
    for (const b of c.bairros.values()) if (b.at) o.baiAt++;
  }
  return o;
}
function trecho(d0, d1) {                        // venda e faturado de outro período no mesmo recorte (filtros e lugar), para comparar
  if (d1 < 0) return null;
  if (S.uf == null && RG) { const t = { venda: 0, fat: 0 }; for (const uf in RG) if (RG[uf].ant) { t.venda += RG[uf].ant.venda; t.fat += RG[uf].ant.fat; } return t; }
  const fs = S.sup.size, fr = S.rca.size;
  if (itemAtivo()) {                               // o período de antes vem junto na leitura do fornecedor/produto
    if (!IT || IT.chave !== chaveItens()) return null;
    let v = 0, f = 0;
    for (const [, cod, r, s, g, vv, dv] of IT.ant) {
      if (g || (fs && !S.sup.has(s)) || (fr && !S.rca.has(r))) continue;
      const c = CIDX.get(cod); if (c == null) continue;
      if (S.cidade != null && C.ib[c] !== S.cidade) continue;
      if (S.bairro != null && BAI(c) !== S.bairro) continue;
      v += vv; f += vv - dv;
    }
    return { venda: v, fat: f };
  }
  const somar = (T, soEquipe) => {
    let t = 0;
    for (let i = inicioEm(T, Math.max(0, d0)), m = T.d.length; i < m && T.d[i] <= d1; i++) {
      if ((soEquipe && T.g[i]) || (fs && !S.sup.has(T.s[i])) || (fr && !S.rca.has(T.r[i]))) continue;
      const c = T.c[i];
      if (S.cidade != null && C.ib[c] !== S.cidade) continue;
      if (S.bairro != null && BAI(c) !== S.bairro) continue;
      t += T.v[i];
    }
    return t;
  };
  return { venda: somar(V, true), fat: somar(FT, true) };
}

/* ------------------------------------------------------------------ peças pequenas */
function toast(msg, tipo) {
  const el = document.createElement("div"); el.className = "toast " + (tipo || ""); el.textContent = msg;
  $("#toasts").appendChild(el); setTimeout(() => el.remove(), 4200);
}
const dica = $("#dica");
function mostrarDica(html, x, y) {
  dica.innerHTML = html; dica.classList.add("on");
  const r = dica.getBoundingClientRect();
  dica.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x + 16)) + "px";
  dica.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, y + 16)) + "px";
}
const esconderDica = () => dica.classList.remove("on");
const linhaDica = (rot, v, cor) => `<div class="l"><span>${cor ? `<i style="background:${cor}"></i>` : ""}${rot}</span><b>${v}</b></div>`;
function contar(el, alvo, fmt) {                  // o número corre até o valor novo (finito; desligado com movimento reduzido)
  const de = +el.dataset.v || 0; el.dataset.v = alvo;
  const f = fmt === "brl" ? brl : inteiro;
  if (calmo || de === alvo) { el.firstChild ? (el.firstChild.nodeValue = f(alvo)) : (el.textContent = f(alvo)); return; }
  const t0 = performance.now(), dur = 520;
  if (!el.firstChild || el.firstChild.nodeType !== 3) el.insertBefore(document.createTextNode(""), el.firstChild);
  (function passo(t) {
    if (+el.dataset.v !== alvo) return;            // o alvo mudou no meio do caminho: este quadro não escreve mais
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.firstChild.nodeValue = f(de + (alvo - de) * e);
    if (p < 1 && +el.dataset.v === alvo) requestAnimationFrame(passo);
  })(t0);
}

/* ------------------------------------------------------------------ casca: menu, topo, filtros */
function montarCasca() {
  $("#btn-menu").innerHTML = IC.menu;
  $("#btn-menu").onclick = () => document.body.classList.toggle("menu-aberto");
  const tema = () => document.documentElement.getAttribute("data-tema");
  $("#btn-tema").innerHTML = tema() === "claro" ? IC.lua : IC.sol;
  $("#btn-tema").onclick = () => {
    const t = tema() === "claro" ? "escuro" : "claro";
    document.documentElement.setAttribute("data-tema", t); try { localStorage.setItem("mapa-tema", t); } catch (e) {}
    $("#btn-tema").innerHTML = t === "claro" ? IC.lua : IC.sol;
    if (camMasc) camMasc.setStyle({ fillColor: cssVar("--mp-mascara") });
    if (camFoco) camFoco.setStyle({ color: cssVar("--ouro") || "#e9c877" });
    pintarMapa(); desenharPontos();
  };
  $("#btn-atualizar").innerHTML = IC.girar;
  $("#btn-atualizar").onclick = () => atualizarDados(true);
  $("#menu-itens").innerHTML = `<div class="grupo-menu">Análise</div>
    <button class="item-menu ativo" data-ir="topo">${IC.mapa}Mapa de vendas</button>
    <button class="item-menu" data-ir="lista">${IC.lista}Lista de clientes</button>`;
  $("#menu-itens").onclick = (e) => {
    const b = e.target.closest("[data-ir]"); if (!b) return;
    document.body.classList.remove("menu-aberto");
    (b.dataset.ir === "lista" ? $("#sec-lista") : $("#conteudo")).scrollIntoView({ behavior: calmo ? "auto" : "smooth", block: "start" });
  };
  mostrarQuando();
}
function mostrarQuando() {                        // o horário verdadeiro do dado que está na tela, nunca a hora do acesso
  const hora = (s) => s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const doBanco = D.origem === "banco";
  $("#atualizado").innerHTML = doBanco ? `Venda e faturado de <b>${hora(D.geradoEm)}</b>` : `<span style="color:var(--atencao)">Cópia guardada de <b>${hora(D.geradoEm)}</b></span>`;
  $("#atualizado").title = doBanco ? "Lido do banco agora: o Agente Lube mantém a venda (Relatório 146), o faturado (Central Comercial) e o cadastro. A tela relê sozinha de 5 em 5 minutos."
    : "Não consegui ler o banco: a tela abriu com a última cópia guardada nesta máquina.";
  $("#menu-rodape").innerHTML = `<div><span class="vivo" ${doBanco ? "" : 'style="background:var(--atencao)"'}></span><b>${doBanco ? "Ao vivo" : "Sem banco agora"}</b> · Agente Lube</div>
    <div>${doBanco ? "Venda e faturado: banco, " + hora(D.geradoEm) : "Cópia guardada de " + hora(D.geradoEm)}</div>
    ${doBanco ? `<div ${D.cadastroStatus && D.cadastroStatus !== "OK" ? 'style="color:var(--atencao)"' : ""}>Cadastro (Agente Lube): ${hora(D.cadastroEm)}${D.cadastroStatus && D.cadastroStatus !== "OK" ? " · " + esc(D.cadastroStatus) : ""}</div>` : ""}
    <div>${UFS_ORDEM.filter((u) => UFX[u] && UFX[u].D).map((u) => u + ": " + inteiro(UFX[u].D.cli.cod.length) + " clientes · " + inteiro(UFX[u].CID.size) + " municípios").join("<br>")}</div>
    <div>População: IBGE, Censo 2022</div><div>versão ${window.VERSAO}</div>`;
}
function montarFiltros() {
  const rap = [["mes", "Mês atual"], ["ant", "Mês passado"], ["3m", "3 meses"], ["ano", "Ano"], ["tudo", "Tudo"]];
  const nSup = S.sup.size, nRca = S.rca.size;
  const cid = S.cidade != null ? CID.get(S.cidade) : null;
  $("#faixa-filtros").innerHTML = `
    <span class="fx-rot">${IC.calend}Período</span>
    ${rap.map(([k, t]) => `<button class="fx-btn ${S.rapido === k ? "on" : ""}" data-rap="${k}">${t}</button>`).join("")}
    <label class="fx-data">de <input type="date" id="f-d0" value="${iso(S.d0)}" min="${iso(0)}" max="${iso(FIM)}"></label>
    <label class="fx-data">até <input type="date" id="f-d1" value="${iso(S.d1)}" min="${iso(0)}" max="${iso(FIM)}"></label>
    <span class="fx-sep"></span>
    ${S.uf == null ? `<span class="fx-rot" style="color:var(--t3)">Supervisor, RCA, cidade, fornecedor, produto e bairro: abra um estado no mapa</span>` : `
    <button class="fx-btn ${nSup ? "on" : ""}" data-pop="sup">Supervisor ${nSup ? `<span class="n">${nSup}</span>` : ""}${IC.seta}</button>
    <button class="fx-btn ${nRca ? "on" : ""}" data-pop="rca">RCA ${nRca ? `<span class="n">${nRca}</span>` : ""}${IC.seta}</button>
    <button class="fx-btn ${cid ? "on" : ""}" data-pop="cidade">${cid ? esc(cid.nome) : "Cidade"} ${IC.seta}</button>
    <button class="fx-btn ${S.forn.size ? "on" : ""}" data-pop="forn" title="Venda por fornecedor: a base da aba Fornecedor do app Supervisor Lube e da Análise Comercial">Fornecedor ${S.forn.size ? `<span class="n">${S.forn.size}</span>` : ""}${IC.seta}</button>
    <button class="fx-btn ${S.prod.size ? "on" : ""}" data-pop="prod" title="${S.forn.size ? "Produtos dos fornecedores escolhidos" : "Todos os produtos com venda no estado"}">Produto ${S.prod.size ? `<span class="n">${S.prod.size}</span>` : ""}${IC.seta}</button>
    <span class="fx-sep"></span>
    <button class="fx-btn ${S.bairro != null ? "on" : ""}" data-pop="bairro" title="${cid ? "Bairros de " + esc(cid.nome) : "Bairros de todos os municípios (escolher um abre o município)"}">${S.bairro != null ? esc(titulo(S.bairro)) : "Bairro"} ${IC.seta}</button>`}
    <span class="fx-sep"></span>
    <span class="fx-rot" title="Quem conta como cliente da base, além de quem comprou no período">Base</span>
    <span class="seg" id="seg-base">
      <button class="${S.base === "aptos" ? "on" : ""}" data-base="aptos" title="Sem bloqueio, com limite de crédito e sem bloqueio na Sefaz">Aptos a comprar</button>
      <button class="${S.base === "12m" ? "on" : ""}" data-base="12m" title="Última compra há menos de 12 meses">Compraram em 12 meses</button>
      <button class="${S.base === "todos" ? "on" : ""}" data-base="todos" title="Aptos + quem comprou nos últimos 24 meses">Todos</button>
    </span>
    ${nSup || nRca || cid || itemAtivo() || S.rapido !== "mes" || S.base !== "aptos" ? `<button class="fx-limpar" id="f-limpar">Limpar filtros</button>` : ""}
    ${itemAtivo() ? `<span class="fx-aviso" title="A venda do Relatório 146 e a nota do Central Comercial não abrem por produto: com fornecedor ou produto, a venda é a do item de pedido faturado (regra do 146, sem ST) e, no lugar do faturado, venda − devolução. É a mesma base da aba Fornecedor do app Supervisor Lube e da Análise Comercial.">${document.body.classList.contains("lendo-itens") ? "Lendo a venda do fornecedor…" : "Venda por item · base da Análise Comercial"}</span>` : ""}`;
}
function ligarFiltros() {
  const fx = $("#faixa-filtros");
  fx.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.rap) { S.rapido = b.dataset.rap; [S.d0, S.d1] = periodoRapido(S.rapido); return refazer(); }
    if (b.dataset.base) { S.base = b.dataset.base; return refazer(); }
    if (b.id === "f-limpar") {
      S.sup.clear(); S.rca.clear(); S.forn.clear(); S.prod.clear(); S.base = "aptos"; S.rapido = "mes"; [S.d0, S.d1] = periodoRapido("mes");
      if (S.cidade != null) { calcular(); return voltarEstado(); } return refazer();
    }
    if (b.dataset.pop === "sup") return abrirPop(b, { itens: D.sup.map(([k, t]) => ({ k, t: k + " · " + t })), sel: S.sup,
      aoMudar: () => { for (const r of [...S.rca]) if (S.sup.size && !S.sup.has(RCA_SUP.get(r))) S.rca.delete(r); refazer(); } });
    if (b.dataset.pop === "rca") return abrirPop(b, { itens: D.rca.filter((r) => !S.sup.size || S.sup.has(r[2])).map(([k, t]) => ({ k, t: k + " · " + t })), sel: S.rca, aoMudar: refazer });
    if (b.dataset.pop === "cidade") return abrirPop(b, { unico: true, itens: [...CID.values()].map((c) => ({ k: c.ibge, t: c.nome, n: R.cid.get(c.ibge).cli })),
      sel: new Set(S.cidade != null ? [S.cidade] : []), aoMudar: (sel) => { const k = [...sel][0]; k == null ? voltarEstado() : abrirCidade(k); } });
    if (b.dataset.pop === "forn" || b.dataset.pop === "prod") {
      const qual = b.dataset.pop;
      const abrir = (L) => {
        const botao = document.querySelector(`[data-pop="${qual}"]`); if (!botao) return;
        if (qual === "forn") return abrirPop(botao, { itens: L.forn.map(([k, t, , n]) => ({ k, t: k + " · " + t, n })), sel: S.forn, unidade: "clientes",
          aoMudar: () => { for (const p of [...S.prod]) { const x = L.prodDe.get(p); if (S.forn.size && (!x || !S.forn.has(x[2]))) S.prod.delete(p); } S.tbPag = 0; refazer(); } });
        const lista = S.forn.size ? L.prod.filter((x) => S.forn.has(x[2])) : L.prod;
        abrirPop(botao, { itens: lista.map(([k, t, f, , n]) => ({ k, t: k + " · " + t + (S.forn.size > 1 || !S.forn.size ? " — " + (L.nomeForn.get(f) || "") : ""), n })), sel: S.prod, aoMudar: () => { S.tbPag = 0; refazer(); } });
      };
      if (ITL) return abrir(ITL);
      toast("Lendo os fornecedores e produtos do estado…");
      return carregarLista().then((L) => { if (S.uf) abrir(L); }).catch((e) => toast("Não consegui ler a lista: " + e.message, "erro"));
    }
    if (b.dataset.pop === "bairro") {
      // Bairro só existe dentro de um município (o mesmo nome se repete em cidades diferentes): a chave é "ibge|bairro".
      // Com um município aberto, a lista é a dos bairros dele; sem município, a de todos, com o nome da cidade ao lado.
      const itens = [];
      const doMun = (c, comCidade) => { for (const x of c.bairros.values()) itens.push({ k: c.ibge + "|" + x.nome, t: titulo(x.nome) + (comCidade ? " · " + c.nome : ""), n: x.cli }); };
      if (S.cidade != null) doMun(R.cid.get(S.cidade), false); else for (const c of R.cid.values()) doMun(c, true);
      itens.sort((a, z) => a.t.localeCompare(z.t, "pt-BR"));
      return abrirPop(b, { unico: true, rotLimpar: "Todos", itens, sel: new Set(S.bairro != null ? [S.cidade + "|" + S.bairro] : []),
        aoMudar: (sel) => {
          const k = [...sel][0];
          if (k == null) { if (S.bairro != null) abrirBairro(null); return; }
          const p = String(k).indexOf("|"), ib = +String(k).slice(0, p), nome = String(k).slice(p + 1);
          if (S.cidade !== ib) abrirCidade(ib);
          abrirBairro(nome);
        } });
    }
  });
  fx.addEventListener("change", (e) => {
    if ((e.target.id !== "f-d0" && e.target.id !== "f-d1") || !e.target.value) return;
    const campo = e.target.id;
    const a = indice($("#f-d0").value || iso(0)), b = indice($("#f-d1").value || iso(FIM));
    if (isNaN(a) || isNaN(b)) return;
    S.d0 = Math.max(0, Math.min(a, b)); S.d1 = Math.min(FIM, Math.max(a, b)); S.rapido = ""; refazer();
    const c = $("#" + campo); if (c) c.focus();       // a faixa é redesenhada: o foco volta para o campo que estava sendo digitado
  });
}

/* popover de escolha (chips: vazio = todos; a busca destaca o trecho achado) */
let popAberto = null;
function abrirPop(btn, o) {
  const pop = $("#pop");
  if (popAberto === btn) return fecharPop();
  popAberto = btn;
  const desenhar = (q) => {
    const lista = o.itens.filter((it) => !q || sem(it.t).includes(q));
    $(".pp-lista", pop).innerHTML = (lista.slice(0, 400).map((it) => `<button class="pp-item ${o.sel.has(it.k) ? "on" : ""}" data-k="${esc(it.k)}">
      <span class="cx">${o.sel.has(it.k) ? "✓" : ""}</span><span>${marcar(it.t, q)}</span>${it.n != null ? `<small>${inteiro(it.n)}</small>` : ""}</button>`).join("")
      || `<div class="vazio">Nada encontrado</div>`)
      + (lista.length > 400 ? `<div class="vazio">Mostrando 400 de ${inteiro(lista.length)}: digite para achar</div>` : "");
  };
  pop.innerHTML = `<div class="pp-topo"><input type="search" placeholder="Buscar…" autocomplete="off" spellcheck="false"></div>
    <div class="pp-lista"></div><div class="pp-pe"><button class="mini-btn" data-a="limpar">${o.rotLimpar || (o.unico ? "Todas" : "Limpar")}</button><button class="mini-btn ativo" data-a="ok">Fechar</button></div>`;
  desenhar("");
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(innerWidth - 328, r.left)) + "px"; pop.style.top = r.bottom + 6 + "px";
  pop.classList.add("on");
  const campo = $("input", pop); campo.focus();
  campo.oninput = () => desenhar(sem(campo.value.trim()));
  pop.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "ok") return fecharPop();
    if (b.dataset.a === "limpar") { o.sel.clear(); o.aoMudar(o.sel); return fecharPop(); }
    const k = isNaN(+b.dataset.k) ? b.dataset.k : +b.dataset.k;
    if (o.unico) { o.sel.clear(); o.sel.add(k); o.aoMudar(o.sel); return fecharPop(); }
    o.sel.has(k) ? o.sel.delete(k) : o.sel.add(k);
    desenhar(sem(campo.value.trim())); o.aoMudar(o.sel); popAberto = btn2();
  };
  const btn2 = () => document.querySelector(`[data-pop="${btn.dataset.pop}"]`);   // a faixa é redesenhada a cada mudança
}
function fecharPop() { $("#pop").classList.remove("on"); popAberto = null; }
document.addEventListener("mousedown", (e) => { if (popAberto && !e.target.closest("#pop") && !e.target.closest("[data-pop]")) fecharPop(); });

/* ------------------------------------------------------------------ esqueleto da página */
function montarPagina() {
  $("#conteudo").innerHTML = `
    <div class="kpis" id="kpis"></div>
    <div class="palco">
      <div class="mapa-caixa">
        <div id="mapa"></div>
        <div class="mapa-topo" id="mapa-topo"></div>
        <div class="mapa-legenda" id="mapa-legenda"></div>
      </div>
      <section class="painel lado" id="lado"></section>
    </div>
    <section class="painel" id="sec-lista"></section>`;
}

/* ------------------------------------------------------------------ cartões */
function desenharKpis() {
  const e = escopo(), sv = e.cli - e.at;
  const [p0, p1] = periodoAnterior(), ant = trecho(p0, p1);
  const cmpDe = (agora, antes) => antes == null || p0 < 0 ? "" : antes <= 0 ? `<span>${antes ? "antes " + brl(antes) : "nada"} de ${dataBR(p0)} a ${dataBR(p1)}</span>`
    : `<span style="color:var(${agora >= antes ? "--ok" : "--perigo"});font-weight:700" title="${brl(antes)} de ${dataBR(Math.max(0, p0))} a ${dataBR(p1)}">${agora >= antes ? "▲" : "▼"} ${pct(Math.abs(agora / antes - 1))}</span><span>contra ${dataBR(Math.max(0, p0)).slice(0, 5)} a ${dataBR(p1).slice(0, 5)}</span>`;
  const cmp = cmpDe(e.venda, ant && ant.venda), cmpF = cmpDe(e.fat, ant && ant.fat);
  // o que o extrator não conseguiu pôr no mapa (cliente do banco sem cadastro no ES) fica dito, não some calado
  const foraMapa = (q) => { const x = D.semCliente && D.semCliente[q]; return S.uf != null && S.cidade == null && x && Math.abs(x[1]) >= 0.005 ? `<span style="flex-basis:100%;color:var(--atencao)" title="Soma do pacote inteiro, não do período">Fora do mapa: ${brl(x[1])} de cliente sem cadastro no estado</span>` : ""; };
  const k = (cls, rot, icone, corpo, leg, extra) => `<div class="kpi ${cls}" ${extra || ""}><div class="rot">${icone}${rot}</div>${corpo}<div class="leg">${leg}</div></div>`;
  const el = $("#kpis");
  if (!el.dataset.pronto) {
    el.dataset.pronto = 1;
    el.innerHTML =
      k("heroi", `<span id="k-venda-rot">Total de vendas</span>`, IC.dinheiro, `<div class="val num" id="k-venda"></div>`, `<span id="k-venda-leg" style="display:contents"></span>`, `title="A venda do Relatório 146: pedido digitado, sem ST, todas as filiais, só as equipes de venda"`) +
      k("info largo", `<span id="k-fat-rot">Faturado</span>`, IC.nota, `<div class="val num" id="k-fat"></div>`, `<span id="k-fat-leg" style="display:contents"></span>`, `title="O total líquido da aba ST do Central Comercial (venda − devolução sem ST), o mesmo FATURADO do app dos supervisores"`) +
      k("ok click", "Clientes atendidos", IC.pessoas, `<div class="val num"><span id="k-at"></span><small id="k-cli"></small></div>`, `<div class="barra-duo"><i id="k-at-b"></i></div><span id="k-at-leg"></span>`, `data-tb="com" title="Ver na lista os clientes com venda"`) +
      k("perigo click", "Clientes sem venda", IC.alerta, `<div class="val num" id="k-sv" style="color:var(--mp-nao)"></div>`, `<span id="k-sv-leg"></span>`, `data-tb="sem" title="Ver na lista os clientes sem venda"`) +
      k("", "Bairros atendidos", IC.casa, `<div class="val num"><span id="k-bat"></span><small id="k-bai"></small></div>`, `<div class="barra-duo"><i id="k-bat-b"></i></div><span id="k-bat-leg"></span>`) +
      k("interna click", "Operação interna", IC.casa2, `<div class="val num" id="k-int"></div>`, `<span id="k-int-leg" style="display:contents"></span>`, `data-int="1" title="Fora dos totais de venda e de faturado. Clique para mostrar ou esconder no mapa e na lista"`) +
      k("", "População", IC.gente, `<div class="val num" id="k-pop"></div>`, `<span>IBGE · Censo 2022</span>`) +
      k("", "Venda por habitante", IC.alvo, `<div class="val num" id="k-vh"></div>`, `<span>venda ÷ população</span>`);
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-int]")) return alternarInterna();
      const c = ev.target.closest("[data-tb]"); if (!c) return;
      S.tbFiltro = c.dataset.tb; S.tbPag = 0; desenharLista(); $("#sec-lista").scrollIntoView({ behavior: calmo ? "auto" : "smooth", block: "start" });
    });
  }
  const it = itemAtivo();
  const qtd = (v) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  $("#k-venda-rot").textContent = it ? "Venda do " + (S.prod.size ? (S.prod.size > 1 ? S.prod.size + " produtos" : "produto") : S.forn.size > 1 ? S.forn.size + " fornecedores" : "fornecedor") : "Total de vendas";
  $("#k-fat-rot").textContent = it ? "Líquido (venda − devolução)" : "Faturado";
  $("#k-venda").parentElement.title = it ? "Item de pedido faturado pela regra do Relatório 146 (sem ST, sem bonificação), pela data do pedido: a mesma base da aba Fornecedor do app Supervisor Lube e da Análise Comercial" : "A venda do Relatório 146: pedido digitado, sem ST, todas as filiais, só as equipes de venda";
  $("#k-fat").parentElement.title = it ? "Venda do item menos a devolução sem ST (pela data da devolução): o sell out da Análise Comercial" : "O total líquido da aba ST do Central Comercial (venda − devolução sem ST), o mesmo FATURADO do app dos supervisores";
  contar($("#k-venda"), e.venda, "brl");
  const perdIt = it && IT && IT.perdido && S.cidade == null && Math.abs(IT.perdido) >= 0.005 ? `<span style="flex-basis:100%;color:var(--atencao)">Fora do mapa: ${brl(IT.perdido)} de cliente sem cadastro no mapa</span>` : "";
  $("#k-venda-leg").innerHTML = `<span style="flex-basis:100%">${it ? qtd(e.ped) + " unidades · pedido faturado" : inteiro(e.ped) + " pedidos" + (e.ped ? " · ticket " + brl(e.venda / e.ped) : "")}</span>${cmp}${Math.abs(e.fora) >= 0.005 ? `<span style="flex-basis:100%" title="Supervisor que não é equipe de venda nem operação interna: não entra nos totais, como no Relatório 146">Fora dos totais: ${brl(e.fora)} de outras equipes</span>` : ""}${it ? perdIt : foraMapa("venda")}`;
  contar($("#k-int"), e.vInt, "brl");
  $("#k-int").parentElement.classList.toggle("on", S.interna);
  $("#k-int-leg").innerHTML = `<span style="flex-basis:100%">${it ? "líquido" : "faturado"} ${brl(e.fInt)} · ${inteiro(e.nInt)} cliente${e.nInt === 1 ? "" : "s"} só por ela</span><span style="flex-basis:100%;font-weight:700;color:var(--mp-int)">${S.interna ? "Aparecendo no mapa e na lista · clique para esconder" : "Fora dos totais · clique para ver"}</span>`;
  contar($("#k-fat"), e.fat, "brl");
  $("#k-fat-leg").innerHTML = `<span style="flex-basis:100%">${it ? "devolução " + brl(e.venda - e.fat) + " · base da Análise Comercial" : inteiro(e.nfs) + " notas · Central Comercial, aba ST"}</span>${cmpF}${Math.abs(e.foraF) >= 0.005 ? `<span style="flex-basis:100%" title="Supervisor que não é equipe de venda nem operação interna: não entra nos totais">Fora dos totais: ${brl(e.foraF)} de outras equipes</span>` : ""}${it ? "" : foraMapa("faturado")}`;
  contar($("#k-at"), e.at); $("#k-cli").textContent = "de " + inteiro(e.cli);
  $("#k-at-b").style.setProperty("--p", (e.cli ? 100 * e.at / e.cli : 0).toFixed(1) + "%");
  $("#k-at-leg").textContent = pct(e.cli ? e.at / e.cli : 0) + " da base";
  contar($("#k-sv"), sv); $("#k-sv-leg").textContent = e.cli ? pct(sv / e.cli) + " da base não comprou no período" : "";
  contar($("#k-bat"), e.baiAt); $("#k-bai").textContent = "de " + inteiro(e.bai);
  $("#k-bat-b").style.setProperty("--p", (e.bai ? 100 * e.baiAt / e.bai : 0).toFixed(1) + "%");
  $("#k-bat-leg").textContent = pct(e.bai ? e.baiAt / e.bai : 0) + (e.bai - e.baiAt ? " · " + inteiro(e.bai - e.baiAt) + " sem venda" : "");
  if (e.pop) { contar($("#k-pop"), e.pop); contar($("#k-vh"), e.venda / e.pop, "brl"); }
  else { $("#k-pop").textContent = "—"; $("#k-pop").dataset.v = 0; $("#k-vh").textContent = "—"; $("#k-vh").dataset.v = 0; }
  $("#olho").textContent = (S.rapido ? { mes: "Mês atual", ant: "Mês passado", "3m": "3 meses", ano: "Ano", tudo: "Todo o período" }[S.rapido] + " · " : "") + dataBR(S.d0) + " a " + dataBR(S.d1);
  $("#titulo").textContent = "Mapa de vendas · " + e.nome;
  const sub = $("#marca-uf"); if (sub) sub.textContent = nomeUF();
}

/* ------------------------------------------------------------------ mapa */
let mapa = null, camGeo = null, camRot = null, camPts = null, camMasc = null, camFoco = null, camRuas = null;
let camada = new Map();                          // ibge -> layer do município (do estado aberto)
const ponto = new Map();                         // índice do cliente -> marcador
const CLASSES_PCT = ["#d93a45", "#ee8a3c", "#f2c14e", "#7fd18b", "#34e89e"];
const corPct = (p) => CLASSES_PCT[Math.min(4, Math.floor(p * 5))];
function centroide(geo) {
  const polis = geo.type === "MultiPolygon" ? geo.coordinates : [geo.coordinates];
  let melhor = null, maior = -1;
  for (const p of polis) {
    const a = p[0]; let ar = 0, cx = 0, cy = 0;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) { const f = a[j][0] * a[i][1] - a[i][0] * a[j][1]; ar += f; cx += (a[j][0] + a[i][0]) * f; cy += (a[j][1] + a[i][1]) * f; }
    if (Math.abs(ar) > maior) { maior = Math.abs(ar); melhor = [cy / (3 * ar), cx / (3 * ar)]; }
  }
  return melhor;
}
const longe = (geo) => {                         // Trindade e Martim Vaz (de Vitória, a 1.100 km da costa, a -29°) esticavam o mapa
  if (geo.type !== "MultiPolygon") return;
  const perto = geo.coordinates.filter((p) => p[0][0][0] < -34);   // a costa da Bahia vai até -37°: o corte é depois dela
  if (perto.length && perto.length < geo.coordinates.length) geo.coordinates = perto;
};
let camEstados = null;
const camRotUF = L.layerGroup();
function criarMapa() {
  mapa = L.map("mapa", { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 4, maxZoom: 18, attributionControl: true, wheelPxPerZoomLevel: 90 });
  mapa.attributionControl.setPrefix(false).addAttribution("Malha e população: IBGE");
  L.control.zoom({ position: "topright", zoomInTitle: "Aproximar", zoomOutTitle: "Afastar" }).addTo(mapa);
  mapa.createPane("estados").style.zIndex = 380;
  mapa.createPane("mascara").style.zIndex = 410;
  mapa.createPane("foco").style.zIndex = 420;
  mapa.createPane("pontos").style.zIndex = 450;
  camEstados = L.geoJSON(EST, {
    pane: "estados", style: estiloEstado,
    onEachFeature: (f, l) => {
      const uf = f.properties.uf;
      l.on("mousemove", (e) => { if (S.uf === uf) return esconderDica(); mostrarDica(dicaEstado(uf), e.originalEvent.clientX, e.originalEvent.clientY); });
      l.on("mouseover", () => { if (S.uf !== uf) l.setStyle({ weight: 3, color: cssVar("--ouro") || "#e9c877" }); });
      l.on("mouseout", () => { esconderDica(); camEstados.resetStyle(l); });
      l.on("click", (e) => { L.DomEvent.stopPropagation(e); if (S.uf !== uf) abrirUF(uf); });
    },
  }).addTo(mapa);
  camRotUF.addTo(mapa);
  camRot = L.layerGroup().addTo(mapa);
  camPts = L.layerGroup().addTo(mapa);
  mapa.invalidateSize();
  mapa.on("zoomend", rotular);
  mapa.fitBounds(camEstados.getBounds(), { padding: [24, 24] });
  mapa.setMaxBounds(camEstados.getBounds().pad(0.6));
  if (window.ResizeObserver) {                    // a caixa muda de tamanho (janela, menu): o mapa acompanha
    let t = null;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => {
      mapa.invalidateSize({ animate: false });
      if (S.uf == null) mapa.fitBounds(camEstados.getBounds(), { padding: [24, 24], animate: false });
      else if (S.cidade == null) mapa.fitBounds(camGeo.getBounds(), { padding: [18, 18], animate: false });
    }, 120); }).observe($("#mapa"));
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (popAberto) return fecharPop();
    if (e.target.closest && e.target.closest("input, select, textarea")) return;   // Esc dentro de um campo é do campo
    if (S.bairro != null) return abrirBairro(null); if (S.cidade != null) return voltarEstado(); if (S.uf != null) voltarGeral();
  });
}
function camadaUF(uf) {                          // os municípios do estado, montados na primeira vez que ele abre
  const x = UFX[uf];
  if (x.cam) return x.cam;
  x.cam = L.geoJSON(x.GEO, {
    style: estiloMunicipio,
    onEachFeature: (f, l) => {
      x.camada.set(f.properties.ibge, l);
      l.on("mousemove", (e) => { if (S.cidade === f.properties.ibge) return esconderDica(); mostrarDica(dicaCidade(f.properties.ibge), e.originalEvent.clientX, e.originalEvent.clientY); });
      l.on("mouseover", () => { if (S.cidade !== f.properties.ibge) l.setStyle({ weight: 2.2, color: cssVar("--mp-divisa-forte") }); l.bringToFront(); });
      l.on("mouseout", () => { esconderDica(); x.cam.resetStyle(l); });
      l.on("click", (e) => { L.DomEvent.stopPropagation(e); if (S.cidade !== f.properties.ibge) abrirCidade(f.properties.ibge); });
    },
  });
  return x.cam;
}
/* ---- visão geral: ES e Bahia */
function estiloEstado(f) {
  const uf = f.properties.uf, divisa = cssVar("--mp-divisa-forte");
  if (S.uf === uf) return { color: divisa, weight: 0, opacity: 0, fillOpacity: 0 };          // o aberto: quem desenha são os municípios
  if (S.uf != null) return { color: divisa, weight: 1.4, opacity: 0.8, dashArray: "5 4", fillColor: cssVar("--mp-e1"), fillOpacity: 0.18 };   // o outro: clicável
  const x = RG && RG[uf];
  if (!x) return { color: divisa, weight: 1.6, opacity: 1, fillColor: cssVar("--mp-vazio"), fillOpacity: 0.9 };
  const mv = S.metrica === "fat" ? "fat" : "venda";
  const max = Math.max(1, ...Object.values(RG).map((r) => Math.max(0, r.e[mv])));
  const t = Math.sqrt(Math.max(0, x.e[mv]) / max);
  return { color: divisa, weight: 1.6, opacity: 1, fillColor: cssVar("--mp-e" + (t > 0.8 ? 5 : t > 0.6 ? 4 : t > 0.4 ? 3 : t > 0.2 ? 2 : 1)), fillOpacity: 0.94 };
}
function dicaEstado(uf) {
  const x = RG && RG[uf], u = UFX[uf];
  if (!x) return `<div class="t">${NOMES_UF[uf]}</div><div class="l"><span>${u && u.erro ? "Sem dados agora: " + esc(u.erro) : "Carregando…"}</span></div>`;
  const e = x.e;
  return `<div class="t">${NOMES_UF[uf]}</div>
    ${linhaDica("Venda", brl(e.venda), "var(--d1)")}${linhaDica("Faturado", brl(e.fat), "var(--info)")}
    ${linhaDica("Clientes com venda", inteiro(e.at) + " de " + inteiro(e.cli), "var(--mp-com)")}
    ${linhaDica("Municípios com venda", inteiro([...x.R.cid.values()].filter((c) => c.at).length) + " de " + inteiro(x.R.cid.size))}
    ${linhaDica("População", inteiro(e.pop))}
    <div class="dica-clique">Clique para abrir o mapa do estado</div>`;
}
function calcularGeral() {                       // os números de cada estado no período (sem os filtros de dentro do estado)
  RG = {};
  for (const uf of UFS_ORDEM) {
    if (!UFX[uf] || !UFX[uf].D) continue;
    usarUF(uf); calcular();
    const [p0, p1] = periodoAnterior();
    RG[uf] = { e: escopoUF(), ant: trecho(p0, p1), R };
  }
}
function pintarGeral() {
  camEstados.setStyle(estiloEstado);
  camRotUF.clearLayers(); camRot.clearLayers();
  if (S.uf == null) for (const f of EST.features) {
    const uf = f.properties.uf, x = RG && RG[uf], mv = S.metrica === "fat" ? "fat" : "venda";
    L.marker(centroide(f.geometry), { interactive: false, keyboard: false, icon: L.divIcon({ className: "", iconSize: [0, 0],
      html: `<div class="rot-estado">${NOMES_UF[uf]}<small>${x ? curto(x.e[mv]) : UFX[uf] && UFX[uf].erro ? "sem dados" : "…"}</small></div>` }) }).addTo(camRotUF);
  }
  desenharTopoMapa(); desenharLegenda();
}
function usarUF(uf) {                            // troca o estado que as contas usam (pacote, municípios, camada)
  const x = UFX[uf];
  aplicarDados(x.D);
  CID = x.CID; camada = x.camada; camGeo = x.cam; ITL = x.itl || null;
}
function abrirUF(uf) {
  const x = UFX[uf];
  if (!x || !x.D) return toast(x && x.erro ? "Sem dados de " + NOMES_UF[uf] + " agora: " + x.erro : "Ainda carregando " + NOMES_UF[uf] + "…", "erro");
  S.uf = uf; S.cidade = null; S.bairro = null; S.tbPag = 0; S.sup.clear(); S.rca.clear(); S.forn.clear(); S.prod.clear();
  if (S.tbFiltro === "int" && !S.interna) S.tbFiltro = "todos";
  esconderDica(); mapa.closePopup(); fecharPop();
  for (const u in UFX) if (UFX[u].cam && mapa.hasLayer(UFX[u].cam)) mapa.removeLayer(UFX[u].cam);
  usarUF(uf); camGeo = camadaUF(uf); camGeo.addTo(mapa);
  try { history.replaceState(null, "", "?uf=" + uf); } catch (e) {}
  refazer(); camEstados.setStyle(estiloEstado); camRotUF.clearLayers();
  mapa.flyToBounds(camGeo.getBounds(), { padding: [18, 18], duration: calmo ? 0 : 1.1, easeLinearity: 0.2 });
  setTimeout(() => carregarLista().catch(() => {}), 1500);
}
function voltarGeral() {
  S.uf = null; S.cidade = null; S.bairro = null; S.tbPag = 0; S.sup.clear(); S.rca.clear(); S.forn.clear(); S.prod.clear();
  if (S.metrica !== "fat") S.metrica = "venda";
  esconderDica(); mapa.closePopup(); fecharPop();
  if (camMasc) { mapa.removeLayer(camMasc); camMasc = null; }
  if (camFoco) { mapa.removeLayer(camFoco); camFoco = null; }
  if (camGeo && mapa.hasLayer(camGeo)) mapa.removeLayer(camGeo);
  camPts.clearLayers(); ponto.clear(); ruas();
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  refazer();
  mapa.flyToBounds(camEstados.getBounds(), { padding: [24, 24], duration: calmo ? 0 : 1, easeLinearity: 0.2 });
}
function valorMetrica(c) { return S.metrica === "venda" ? c.venda : S.metrica === "fat" ? Math.max(0, c.fat) : S.metrica === "pct" ? (c.cli ? c.at / c.cli : 0) : (c.pop ? c.venda / c.pop : 0); }
let maxMetrica = 1;
function estiloMunicipio(f) {
  const ib = f.properties.ibge, c = R && R.cid.get(ib);
  const divisa = cssVar("--mp-divisa");
  if (S.cidade != null) {                         // um município aberto: os outros ficam só com a divisa, para as ruas aparecerem
    return { color: divisa, weight: 1, opacity: S.cidade === ib ? 0 : 0.9, fillColor: cssVar("--mp-e1"), fillOpacity: S.cidade === ib ? 0 : (S.ruas ? 0.04 : 0.25) };
  }
  let cor;
  if (!c || !c.cli) cor = cssVar("--mp-vazio");
  else if (S.metrica === "fat" ? !c.at && c.fat <= 0 : !c.at) cor = cssVar("--mp-sem");
  else if (S.metrica === "pct") cor = corPct(c.at / c.cli);
  else { const t = Math.sqrt(valorMetrica(c) / (maxMetrica || 1)); cor = cssVar("--mp-e" + (t > 0.8 ? 5 : t > 0.6 ? 4 : t > 0.4 ? 3 : t > 0.2 ? 2 : 1)); }
  return { color: divisa, weight: 0.8, opacity: 1, fillColor: cor, fillOpacity: 0.94 };
}
function dicaCidade(ib) {
  const c = R.cid.get(ib);
  if (!c.cli) return `<div class="t">${esc(c.nome)}</div><div class="l"><span>Nenhum cliente na base</span></div>${linhaDica("População", inteiro(c.pop))}`;
  return `<div class="t">${esc(c.nome)}</div>
    ${linhaDica("Venda", brl(c.venda), "var(--d1)")}${linhaDica(rotFat(), brl(c.fat), "var(--info)")}
    ${linhaDica("Clientes com venda", inteiro(c.at) + " de " + inteiro(c.cli), "var(--mp-com)")}
    ${linhaDica("Clientes sem venda", inteiro(c.cli - c.at) + " · " + pct((c.cli - c.at) / c.cli), "var(--mp-nao)")}
    ${linhaDica("Bairros com venda", [...c.bairros.values()].filter((b) => b.at).length + " de " + c.bairros.size)}
    ${linhaDica("População", inteiro(c.pop))}${linhaDica("Venda por habitante", brl(c.pop ? c.venda / c.pop : 0))}
    <div class="dica-clique">Clique para abrir o município</div>`;
}
function pintarMapa() {
  if (S.uf == null) return pintarGeral();
  maxMetrica = 0;
  for (const c of R.cid.values()) maxMetrica = Math.max(maxMetrica, valorMetrica(c));
  camGeo.setStyle(estiloMunicipio);
  rotular(); desenharTopoMapa(); desenharLegenda();
}
function rotular() {                              // nomes dos maiores no mapa do estado; rótulo que encostaria em outro não aparece
  camRot.clearLayers();
  if (S.uf == null || S.cidade != null || !R) return;
  const postos = [];
  const mv = S.metrica === "fat" ? "fat" : "venda";
  for (const c of [...R.cid.values()].filter((x) => x[mv] > 0).sort((a, b) => b[mv] - a[mv]).slice(0, 24)) {
    const p = mapa.latLngToContainerPoint(CID.get(c.ibge).centro), larg = Math.max(60, c.nome.length * 6.6);
    if (postos.some((q) => Math.abs(q.x - p.x) < (q.l + larg) / 2 + 6 && Math.abs(q.y - p.y) < 30)) continue;
    postos.push({ x: p.x, y: p.y, l: larg });
    L.marker(CID.get(c.ibge).centro, { interactive: false, keyboard: false, icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div class="rot-cidade">${esc(c.nome)}<small>${curto(c[mv]).replace("R$ ", "")}</small></div>` }) }).addTo(camRot);
    if (postos.length >= 12) break;
  }
}
function desenharTopoMapa() {
  const c = S.cidade != null ? R.cid.get(S.cidade) : null;
  $("#mapa-topo").innerHTML = c
    ? `<button class="mapa-voltar" id="mp-voltar" title="Voltar (Esc)">${IC.voltar}${S.bairro != null ? esc(c.nome) : esc(nomeUF())}</button>
       <span class="mapa-onde">${S.bairro != null ? esc(titulo(S.bairro)) : esc(c.nome)}<small>${S.bairro != null ? esc(c.nome) : inteiro(c.cli) + " clientes"}</small></span>
       <span class="seg"><button class="${S.camada === "clientes" ? "on" : ""}" data-cam="clientes">Clientes</button><button class="${S.camada === "bairros" ? "on" : ""}" data-cam="bairros">Bairros</button></span>
       <span class="seg"><button class="${S.ruas ? "on" : ""}" data-ruas="1" title="Mostrar as ruas (precisa de internet)">Ruas</button></span>`
    : S.uf == null ? `<span class="mapa-onde">ES e Bahia<small>clique no estado para abrir o mapa dele</small></span>
       <span class="seg">${[["venda", "Venda"], ["fat", "Faturado"]].map(([k, t]) => `<button class="${S.metrica === k || (k === "venda" && S.metrica !== "fat") ? "on" : ""}" data-met="${k}">${t}</button>`).join("")}</span>`
    : `<button class="mapa-voltar" id="mp-geral" title="Voltar para ES e Bahia (Esc)">${IC.voltar}ES e Bahia</button>
       <span class="seg">${[["venda", "Venda"], ["fat", rotFat()], ["pct", "% de clientes atendidos"], ["hab", "Venda por habitante"]].map(([k, t]) => `<button class="${S.metrica === k ? "on" : ""}" data-met="${k}">${t}</button>`).join("")}</span>`;
}
function desenharLegenda() {
  const el = $("#mapa-legenda");
  if (S.uf == null) {
    el.innerHTML = `<div class="lt">${S.metrica === "fat" ? "Faturado" : "Venda"} no período</div>
      ${UFS_ORDEM.map((uf) => `<div class="li"><i class="q" style="background:var(--mp-e3)"></i>${NOMES_UF[uf]}<b>${RG && RG[uf] ? curto(RG[uf].e[S.metrica === "fat" ? "fat" : "venda"]) : "—"}</b></div>`).join("")}
      <div class="li" style="color:var(--t3)">Clique no estado: o mapa abre nele</div>`;
    return;
  }
  if (S.cidade == null) {
    const semAt = [...R.cid.values()].filter((c) => c.cli && (S.metrica === "fat" ? !c.at && c.fat <= 0 : !c.at)).length, vazios = [...R.cid.values()].filter((c) => !c.cli).length;
    const escala = S.metrica === "pct" ? CLASSES_PCT : [1, 2, 3, 4, 5].map((i) => cssVar("--mp-e" + i));
    const max = S.metrica === "venda" || S.metrica === "fat" ? curto(maxMetrica) : S.metrica === "pct" ? "100%" : brl(maxMetrica);
    el.innerHTML = `<div class="lt">${{ venda: "Venda no período", fat: rotFat() + " no período", pct: "% de clientes atendidos", hab: "Venda por habitante" }[S.metrica]}</div>
      <div class="escala">${escala.map((c) => `<i style="background:${c}"></i>`).join("")}</div>
      <div class="pontas"><span>${S.metrica === "pct" ? "0%" : "menor"}</span><span>${max}</span></div>
      <div class="li"><i class="q" style="background:var(--mp-sem)"></i>Sem atendimento no período<b>${semAt}</b></div>
      ${vazios ? `<div class="li"><i class="q" style="background:var(--mp-vazio);border:1px solid var(--linha-2)"></i>Sem cliente na base<b>${vazios}</b></div>` : ""}`;
    return;
  }
  const e = escopo();
  el.innerHTML = S.camada === "bairros"
    ? `<div class="lt">Bairros · % de clientes atendidos</div><div class="escala">${CLASSES_PCT.map((c) => `<i style="background:${c}"></i>`).join("")}</div>
       <div class="pontas"><span>0%</span><span>100%</span></div><div class="li" style="color:var(--t3)">O número é com venda / clientes do bairro</div>`
    : `<div class="lt">Clientes no período</div>
       <div class="li"><i style="background:var(--mp-com)"></i>Com venda (tamanho = valor)<b>${inteiro(e.at)}</b></div>
       <div class="li"><i style="background:var(--mp-nao)"></i>Sem venda<b>${inteiro(e.cli - e.at)}</b></div>
       ${S.interna ? `<div class="li"><i style="background:var(--mp-int)"></i>Só operação interna<b>${inteiro(e.nInt)}</b></div>` : ""}
       <div class="li"><i class="aprox"></i>Posição aproximada pelo bairro</div>`;
}
function ligarMapa() {
  $("#mapa-topo").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "mp-voltar") return S.bairro != null ? abrirBairro(null) : voltarEstado();
    if (b.id === "mp-geral") return voltarGeral();
    if (b.dataset.met) { S.metrica = b.dataset.met; return S.uf == null ? pintarGeral() : pintarMapa(); }
    if (b.dataset.cam) { S.camada = b.dataset.cam; desenharTopoMapa(); desenharLegenda(); return desenharPontos(); }
    if (b.dataset.ruas) { S.ruas = !S.ruas; ruas(); camGeo.setStyle(estiloMunicipio); return desenharTopoMapa(); }
  });
}
function ruas() {
  if (S.cidade != null && S.ruas) {
    if (!camRuas) camRuas = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' });
    if (!mapa.hasLayer(camRuas)) camRuas.addTo(mapa);
  } else if (camRuas && mapa.hasLayer(camRuas)) mapa.removeLayer(camRuas);
}
function abrirCidade(ib) {
  if (!CID.has(ib)) return;
  S.cidade = ib; S.bairro = null; S.tbPag = 0; esconderDica();
  const f = CID.get(ib).feicao, l = camada.get(ib);
  if (camMasc) mapa.removeLayer(camMasc);
  if (camFoco) mapa.removeLayer(camFoco);
  const polis = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
  camMasc = L.polygon([[[-60, -110], [-60, 20], [30, 20], [30, -110]]].concat(polis.map((p) => p[0].map(([x, y]) => [y, x]))),
    { pane: "mascara", stroke: false, fillColor: cssVar("--mp-mascara"), fillOpacity: 0.6, interactive: false }).addTo(mapa);
  camFoco = L.geoJSON(f, { pane: "foco", interactive: false, style: { fill: false, color: cssVar("--ouro") || "#e9c877", weight: 2.6, opacity: 0.95 } }).addTo(mapa);
  ruas();
  mapa.flyToBounds(l.getBounds(), { padding: [34, 34], duration: calmo ? 0 : 0.95, easeLinearity: 0.18 });
  montarFiltros(); desenharKpis(); pintarMapa(); desenharPontos(true); desenharLado(); desenharLista();
}
function voltarEstado() {
  S.cidade = null; S.bairro = null; S.tbPag = 0;
  if (camMasc) { mapa.removeLayer(camMasc); camMasc = null; }
  if (camFoco) { mapa.removeLayer(camFoco); camFoco = null; }
  ruas(); mapa.closePopup();
  mapa.flyToBounds(camGeo.getBounds(), { padding: [18, 18], duration: calmo ? 0 : 0.85, easeLinearity: 0.2 });
  montarFiltros(); desenharKpis(); pintarMapa(); desenharPontos(); desenharLado(); desenharLista();
}
function abrirBairro(nome) {
  S.bairro = nome; S.tbPag = 0; mapa.closePopup();
  const c = R.cid.get(S.cidade);
  if (nome != null) {
    const pts = (c.bairros.get(nome) || { ids: [] }).ids.filter((i) => C.loc[i]).map((i) => [C.lat[i], C.lng[i]]);
    if (pts.length) mapa.flyToBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 16, duration: calmo ? 0 : 0.8 });
    else toast("Os clientes deste bairro estão sem ponto no mapa: veja a lista ao lado.");
    if (S.camada !== "clientes") S.camada = "clientes";
  } else mapa.flyToBounds(camada.get(S.cidade).getBounds(), { padding: [34, 34], duration: calmo ? 0 : 0.8 });
  montarFiltros(); desenharKpis(); desenharTopoMapa(); desenharLegenda(); desenharPontos(); desenharLado(); desenharLista();
}
function cartaoCliente(i) {
  const com = R.comprou[i], r = C.rca[i];
  return `<div class="cartao-cli"><div class="n">${esc(titulo(C.nome[i]))}</div>
    <div class="s">${C.cod[i]}${C.fant[i] ? " · " + esc(titulo(C.fant[i])) : ""}<br>${esc(titulo(BAI(i)))} · ${esc((CID.get(C.ib[i]) || { nome: "" }).nome)}</div>
    <div class="l"><span>Situação no período</span><b style="color:var(${R.soInt[i] ? "--mp-int" : com ? "--mp-com" : "--mp-nao"})">${R.soInt[i] ? "Operação interna" : com ? "Com venda" : "Sem venda"}</b></div>
    ${com ? `<div class="l"><span>Venda</span><b>${brl(R.venda[i])}</b></div><div class="l"><span>${itemAtivo() ? "Unidades" : "Pedidos"}</span><b>${itemAtivo() ? R.ped[i].toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : inteiro(R.ped[i])}</b></div>` : ""}
    ${R.nfs[i] || R.fat[i] ? `<div class="l"><span>${rotFat()}</span><b>${brl(R.fat[i])}</b></div>` : ""}
    ${R.temInt[i] ? `<div class="l"><span>Operação interna · venda</span><b style="color:var(--mp-int)">${brl(R.vint[i])}</b></div><div class="l"><span>Operação interna · ${rotFat().toLowerCase()}</span><b style="color:var(--mp-int)">${brl(R.fint[i])}</b></div>` : ""}
    ${Math.abs(R.fora[i]) >= 0.005 || Math.abs(R.foraF[i]) >= 0.005 ? `<div class="l"><span>Outras equipes (fora dos totais)</span><b>venda ${brl(R.fora[i])} · fat. ${brl(R.foraF[i])}</b></div>` : ""}
    <div class="l"><span>Última compra</span><b>${C.ult[i] != null ? dataBR(C.ult[i]) : "nunca"}</b></div>
    <div class="l"><span>RCA da carteira</span><b>${r != null ? r + " · " + esc(titulo(RCA_NOME.get(r) || "")) : "—"}</b></div>
    ${C.loc[i] === 2 ? `<div class="aviso">Posição aproximada: o cadastro não tem coordenada, o ponto fica no meio do bairro.</div>` : ""}</div>`;
}
function desenharPontos(entrando) {
  camPts.clearLayers(); ponto.clear();
  if (S.uf == null || S.cidade == null) return;
  const c = R.cid.get(S.cidade), com = cssVar("--mp-com"), nao = cssVar("--mp-nao"), borda = cssVar("--mp-fundo");
  if (S.camada === "bairros") {
    let maxCli = 1; for (const b of c.bairros.values()) maxCli = Math.max(maxCli, b.cli);
    let k = 0;
    [...c.bairros.values()].sort((a, b) => b.cli - a.cli).forEach((b) => {
      const pts = b.ids.filter((i) => C.loc[i]); if (!pts.length) return;
      const la = pts.reduce((s, i) => s + C.lat[i], 0) / pts.length, lo = pts.reduce((s, i) => s + C.lng[i], 0) / pts.length;
      const t = 26 + 34 * Math.sqrt(b.cli / maxCli);
      const m = L.marker([la, lo], { pane: "pontos", zIndexOffset: Math.round(1000 - t), icon: L.divIcon({ className: "", iconSize: [t, t], iconAnchor: [t / 2, t / 2],
        html: `<div class="rot-bairro" style="width:${t}px;height:${t}px;background:${corPct(b.cli ? b.at / b.cli : 0)};font-size:${t < 34 ? 9.5 : 11}px;animation-delay:${Math.min(600, k++ * 12)}ms">${b.at}/${b.cli}</div>` }) });
      m.on("mousemove", (e) => mostrarDica(`<div class="t">${esc(titulo(b.nome))}</div>${linhaDica("Com venda", inteiro(b.at), "var(--mp-com)")}${linhaDica("Sem venda", inteiro(b.cli - b.at), "var(--mp-nao)")}${linhaDica("Venda", brl(b.venda), "var(--d1)")}<div class="dica-clique">Clique para ver os clientes do bairro</div>`, e.originalEvent.clientX, e.originalEvent.clientY));
      m.on("mouseout", esconderDica); m.on("click", () => { esconderDica(); abrirBairro(b.nome); });
      m.addTo(camPts);
    });
    return;
  }
  let maxV = 1; for (const b of c.bairros.values()) for (const i of b.ids) maxV = Math.max(maxV, R.venda[i]);
  const lista = [];
  for (const b of c.bairros.values()) for (const i of b.ids) if (C.loc[i]) lista.push(i);
  if (S.interna) for (const i of c.idsInt) if (C.loc[i]) lista.push(i);
  const roxo = cssVar("--mp-int");
  const raio = (i) => R.soInt[i] ? 5.4 : R.comprou[i] ? 4.5 + 9 * Math.sqrt(Math.max(0, R.venda[i]) / maxV) : 4.2;
  lista.sort((a, b) => raio(b) - raio(a));           // os maiores por baixo, para nenhum ponto pequeno ficar escondido
  lista.forEach((i, k) => {
    const ok = R.comprou[i], fora = S.bairro != null && BAI(i) !== S.bairro, aprox = C.loc[i] === 2;
    const m = L.circleMarker([C.lat[i], C.lng[i]], { pane: "pontos", radius: raio(i), color: aprox ? (R.soInt[i] ? roxo : ok ? com : nao) : borda, weight: aprox ? 1.6 : 1, dashArray: aprox ? "3 3" : null,
      opacity: fora ? 0.15 : 0.95, fillColor: R.soInt[i] ? roxo : ok ? com : nao, fillOpacity: fora ? 0.08 : aprox ? 0.38 : 0.86, className: "pt" });
    m.on("mousemove", (e) => mostrarDica(`<div class="t">${esc(titulo(C.nome[i]))}</div>${linhaDica(esc(titulo(BAI(i))), R.soInt[i] ? "op. interna " + brl(R.vint[i]) : ok ? brl(R.venda[i]) : "sem venda", R.soInt[i] ? "var(--mp-int)" : ok ? "var(--mp-com)" : "var(--mp-nao)")}<div class="dica-clique">Clique para ver o cliente</div>`, e.originalEvent.clientX, e.originalEvent.clientY));
    m.on("mouseout", esconderDica);
    m.on("click", (e) => { L.DomEvent.stopPropagation(e); esconderDica(); m.bindPopup(cartaoCliente(i), { maxWidth: 300, autoPanPadding: [30, 60] }).openPopup(); });
    m.addTo(camPts); ponto.set(i, m);
    if (entrando && !calmo && m._path) { m._path.style.transformBox = "fill-box"; m._path.style.transformOrigin = "center"; m._path.style.animation = `brota .5s cubic-bezier(.2,.9,.3,1.3) ${500 + Math.min(700, k * 0.6)}ms backwards`; }
  });
}
function focarCliente(i) {
  if (!C.loc[i]) return toast("Este cliente está sem ponto no mapa (cadastro sem coordenada e bairro sem referência).");
  const abrir = () => {
    if (S.camada !== "clientes") { S.camada = "clientes"; desenharTopoMapa(); desenharLegenda(); desenharPontos(); }
    const m = ponto.get(i); if (!m) return;
    mapa.flyTo([C.lat[i], C.lng[i]], Math.max(mapa.getZoom(), 15.5), { duration: calmo ? 0 : 0.7 });
    m.bindPopup(cartaoCliente(i), { maxWidth: 300, autoPanPadding: [30, 60] }); setTimeout(() => m.openPopup(), calmo ? 0 : 750);
  };
  if (S.cidade !== C.ib[i]) { abrirCidade(C.ib[i]); setTimeout(abrir, calmo ? 0 : 1000); } else abrir();
  $(".mapa-caixa").scrollIntoView({ behavior: calmo ? "auto" : "smooth", block: "center" });
}

/* ------------------------------------------------------------------ painel ao lado */
function desenharLado() {
  const el = $("#lado");
  if (S.uf == null) {
    el.innerHTML = `<div class="painel-cab"><div class="painel-tit"><h3>Estados</h3><p>Clique para abrir o mapa do estado</p></div></div>
      <div class="painel-corpo">${UFS_ORDEM.map((uf, i) => { const x = RG && RG[uf], u = UFX[uf];
        if (!x) return `<button class="lin" data-uf="${uf}"><span class="pos">${i + 1}</span><span class="nm">${NOMES_UF[uf]}<small>${u && u.erro ? "Sem dados agora" : "Carregando…"}</small></span></button>`;
        const e = x.e;
        return `<button class="lin" data-uf="${uf}" title="${NOMES_UF[uf]} · venda ${brl(e.venda)} · faturado ${brl(e.fat)}">
          <span class="pos">${i + 1}</span><span class="nm">${NOMES_UF[uf]}<small>${inteiro(e.at)} de ${inteiro(e.cli)} clientes com venda · ${pct(e.cli ? e.at / e.cli : 0)} · faturado ${curto(e.fat)}</small></span>
          <span class="vl">${curto(e.venda)}<small>venda</small></span><span class="duo"><i style="--p:${(e.cli ? 100 * e.at / e.cli : 0).toFixed(1)}%"></i></span></button>`; }).join("")}</div>`;
    return;
  }
  if (S.cidade == null) {
    const ord = { venda: (a, b) => b.venda - a.venda, fat: (a, b) => b.fat - a.fat, sem: (a, b) => (b.cli - b.at) - (a.cli - a.at), pct: (a, b) => (a.cli ? a.at / a.cli : 2) - (b.cli ? b.at / b.cli : 2) }[S.ordCid];
    const lista = [...R.cid.values()].filter((c) => c.cli).sort(ord);
    const mv = S.ordCid === "fat" ? "fat" : "venda", max = Math.max(1, ...lista.map((c) => c[mv]));
    el.innerHTML = `<div class="painel-cab"><div class="painel-tit"><h3>Municípios</h3><p>Clique para abrir no mapa</p></div>
      <div class="painel-acoes"><span class="seg">${[["venda", "Venda"], ["fat", rotFat()], ["sem", "Sem venda"], ["pct", "%"]].map(([k, t]) => `<button class="${S.ordCid === k ? "on" : ""}" data-ordcid="${k}">${t}</button>`).join("")}</span></div></div>
      <div class="painel-corpo">${lista.map((c, i) => `<button class="lin" data-cid="${c.ibge}" title="${esc(c.nome)} · venda ${brl(c.venda)} · faturado ${brl(c.fat)}">
        <span class="pos">${i + 1}</span><span class="nm">${esc(c.nome)}<small>${inteiro(c.at)} de ${inteiro(c.cli)} clientes com venda · ${pct(c.at / c.cli)}</small></span>
        ${S.ordCid === "venda" || S.ordCid === "fat" ? `<span class="vl">${curto(c[mv])}<small>${mv === "fat" ? "faturado" : "venda"}</small></span><span class="duo venda"><i style="--p:${Math.max(0, 100 * c[mv] / max).toFixed(1)}%"></i></span>`
          : `<span class="vl nao">${inteiro(c.cli - c.at)}<small>sem venda</small></span><span class="duo"><i style="--p:${(100 * c.at / c.cli).toFixed(1)}%"></i></span>`}</button>`).join("") || `<div class="vazio"><b>Nada no recorte</b>Mude o período ou os filtros.</div>`}</div>`;
    return;
  }
  const c = R.cid.get(S.cidade);
  if (S.bairro == null) {
    const ord = { sem: (a, b) => (b.cli - b.at) - (a.cli - a.at) || b.cli - a.cli, venda: (a, b) => b.venda - a.venda, az: (a, b) => a.nome.localeCompare(b.nome) }[S.ordBai];
    const lista = [...c.bairros.values()].sort(ord), bAt = lista.filter((b) => b.at).length;
    el.innerHTML = `<div class="painel-cab"><div class="painel-tit"><h3>${esc(c.nome)}</h3><p>${bAt} de ${inteiro(lista.length)} bairros com venda · clique para ver os clientes</p></div>
      <div class="painel-acoes"><span class="seg">${[["sem", "Sem venda"], ["venda", "Venda"], ["az", "A–Z"]].map(([k, t]) => `<button class="${S.ordBai === k ? "on" : ""}" data-ordbai="${k}">${t}</button>`).join("")}</span></div></div>
      <div class="trilha"><button data-volta="geral">ES e Bahia</button>›<button data-volta="es">${esc(nomeUF())}</button>›<b>${esc(c.nome)}</b></div>
      <div class="lado-mini"><div class="v"><span>Com venda</span><b>${inteiro(c.at)} <small>clientes</small></b></div><div class="r"><span>Sem venda</span><b>${inteiro(c.cli - c.at)} <small>clientes</small></b></div>
        <div><span>Venda</span><b>${curto(c.venda)}</b></div><div><span>${rotFat()}</span><b>${curto(c.fat)}</b></div></div>
      <div class="painel-corpo">${lista.map((b, i) => `<button class="lin" data-bai="${esc(b.nome)}" title="${esc(titulo(b.nome))} · ${brl(b.venda)}">
        <span class="pos">${i + 1}</span><span class="nm">${esc(titulo(b.nome))}<small>${inteiro(b.at)} de ${inteiro(b.cli)} com venda · ${curto(b.venda)}</small></span>
        ${b.cli - b.at ? `<span class="vl nao">${inteiro(b.cli - b.at)}<small>sem venda</small></span>` : `<span class="vl com">100%</span>`}
        <span class="duo"><i style="--p:${(100 * b.at / b.cli).toFixed(1)}%"></i></span></button>`).join("") || `<div class="vazio"><b>Nenhum cliente no recorte</b></div>`}
        ${c.semPonto ? `<div class="lado-nota"><b>${inteiro(c.semPonto)} cliente${c.semPonto > 1 ? "s" : ""} sem ponto no mapa</b>: o cadastro não tem coordenada e nenhum vizinho de bairro tem. Eles contam nos números e aparecem na lista.</div>` : ""}</div>`;
    return;
  }
  const b = c.bairros.get(S.bairro) || { nome: S.bairro, ids: [], cli: 0, at: 0, venda: 0, fat: 0 };
  const ints = S.interna ? c.idsInt.filter((i) => BAI(i) === S.bairro) : [];
  const ids = b.ids.concat(ints).sort((x, y) => (R.soInt[x] - R.soInt[y]) || (R.comprou[x] - R.comprou[y]) || (R.venda[y] - R.venda[x]) || ((C.ult[y] ?? -1e9) - (C.ult[x] ?? -1e9)));
  el.innerHTML = `<div class="painel-cab"><div class="painel-tit"><h3>${esc(titulo(b.nome))}</h3><p>${inteiro(b.cli)} clientes · os sem venda primeiro${ints.length ? " · + " + inteiro(ints.length) + " só operação interna" : ""}</p></div></div>
    <div class="trilha"><button data-volta="geral">ES e Bahia</button>›<button data-volta="es">${esc(nomeUF())}</button>›<button data-volta="cid">${esc(c.nome)}</button>›<b>${esc(titulo(b.nome))}</b></div>
    <div class="lado-mini"><div class="v"><span>Com venda</span><b>${inteiro(b.at)}</b></div><div class="r"><span>Sem venda</span><b>${inteiro(b.cli - b.at)}</b></div>
      <div><span>Venda</span><b>${curto(b.venda)}</b></div><div><span>${rotFat()}</span><b>${curto(b.fat)}</b></div></div>
    <div class="painel-corpo">${ids.map((i) => `<button class="lin" data-cli="${i}" title="${esc(titulo(C.nome[i]))}">
      <span class="bola ${R.soInt[i] ? "int" : R.comprou[i] ? "com" : ""} ${C.loc[i] === 2 ? "aprox" : !C.loc[i] ? "sem" : ""}"></span>
      <span class="nm">${esc(titulo(C.nome[i]))}<small>${C.cod[i]} · última compra ${C.ult[i] != null ? dataBR(C.ult[i]) : "nunca"}</small></span>
      ${R.soInt[i] ? `<span class="vl" style="color:var(--mp-int)">${curto(R.vint[i])}<small>op. interna</small></span>` : R.comprou[i] ? `<span class="vl">${curto(R.venda[i])}<small>${itemAtivo() ? R.ped[i].toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + " un." : R.ped[i] + " ped."}</small></span>` : `<span class="vl nao">sem venda</span>`}</button>`).join("")}</div>`;
}
function ligarLado() {
  $("#lado").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.ordcid) { S.ordCid = b.dataset.ordcid; return desenharLado(); }
    if (b.dataset.ordbai) { S.ordBai = b.dataset.ordbai; return desenharLado(); }
    if (b.dataset.cid) return abrirCidade(+b.dataset.cid);
    if (b.dataset.bai != null) return abrirBairro(b.dataset.bai);
    if (b.dataset.volta === "geral") return voltarGeral();
    if (b.dataset.uf) return abrirUF(b.dataset.uf);
    if (b.dataset.volta === "es") return voltarEstado();
    if (b.dataset.volta === "cid") return abrirBairro(null);
    if (b.dataset.cli) return focarCliente(+b.dataset.cli);
  });
  $("#lado").addEventListener("mouseover", (e) => {     // passar o mouse na cidade acende o município no mapa
    const b = e.target.closest("[data-cid]"); if (!b || S.cidade != null) return;
    const l = camada.get(+b.dataset.cid); if (l) { l.setStyle({ weight: 2.4, color: cssVar("--ouro") }); l.bringToFront(); }
  });
  $("#lado").addEventListener("mouseout", (e) => { const b = e.target.closest("[data-cid]"); if (b && S.cidade == null) camGeo.resetStyle(camada.get(+b.dataset.cid)); });
}

/* ------------------------------------------------------------------ lista de clientes */
const COLS = [
  { k: "cidade", t: "Cidade", v: (i) => (CID.get(C.ib[i]) || { nome: "" }).nome },
  { k: "bairro", t: "Bairro", v: (i) => titulo(BAI(i)) },
  { k: "cliente", t: "Cliente", v: (i) => C.nome[i] },
  { k: "rca", t: "RCA da carteira", v: (i) => C.rca[i] != null ? C.rca[i] + " · " + titulo(RCA_NOME.get(C.rca[i]) || "") : "" },
  { k: "ult", t: "Última compra", num: 1, v: (i) => C.ult[i] == null ? -1e9 : C.ult[i] },
  { k: "sit", t: "Situação", v: (i) => R.soInt[i] ? 2 : R.comprou[i] },
  { k: "ped", t: "Pedidos", num: 1, v: (i) => R.ped[i] },
  { k: "venda", t: "Venda", num: 1, v: (i) => R.venda[i] },
  { k: "fat", t: "Faturado", num: 1, v: (i) => R.fat[i] },
];
function linhasLista() {
  const q = sem(S.tbBusca.trim()), ids = [];
  for (let i = 0, n = C.cod.length; i < n; i++) {
    if (!R.uni[i] && !(S.interna && R.soInt[i])) continue;
    if (S.tbFiltro === "int" && !R.soInt[i]) continue;
    if (S.cidade != null && C.ib[i] !== S.cidade) continue;
    if (S.bairro != null && BAI(i) !== S.bairro) continue;
    if (S.tbFiltro === "com" && !R.comprou[i]) continue;
    if (S.tbFiltro === "sem" && (R.comprou[i] || R.soInt[i])) continue;
    if (q && !(sem(C.nome[i]).includes(q) || String(C.cod[i]).includes(q) || sem(BAI(i)).includes(q) || sem((CID.get(C.ib[i]) || { nome: "" }).nome).includes(q) || sem(C.fant[i]).includes(q))) continue;
    ids.push(i);
  }
  const col = COLS.find((c) => c.k === S.tbOrd), d = S.tbDir;
  ids.sort((a, b) => { const x = col.v(a), y = col.v(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * d || R.venda[b] - R.venda[a]; });
  return ids;
}
function desenharLista() {
  if (S.uf == null) { $("#sec-lista").innerHTML = `<div class="painel-cab"><div class="painel-tit"><h3>Clientes por cidade e bairro</h3><p>ES e Bahia · ${dataBR(S.d0)} a ${dataBR(S.d1)}</p></div></div><div class="vazio"><b>Escolha um estado</b>Clique no Espírito Santo ou na Bahia, no mapa ou no painel ao lado, para ver os clientes.</div>`; return; }
  const ids = linhasLista(), q = sem(S.tbBusca.trim());
  let tot = 0, totF = 0, com = 0, nInt = 0, vInt = 0; for (const i of ids) { tot += R.venda[i]; totF += R.fat[i]; com += R.comprou[i]; vInt += R.vint[i]; if (R.soInt[i]) nInt++; }   // a operação interna de todas as linhas, como o cartão e o Excel
  const pags = Math.max(1, Math.ceil(ids.length / S.tbTam)); S.tbPag = Math.min(S.tbPag, pags - 1);
  const pag = ids.slice(S.tbPag * S.tbTam, (S.tbPag + 1) * S.tbTam);
  const el = $("#sec-lista"), foco = document.activeElement && document.activeElement.id === "tb-busca";
  el.innerHTML = `<div class="painel-cab"><div class="painel-tit"><h3>Clientes por cidade e bairro</h3><p>${esc(escopo().nome)} · ${dataBR(S.d0)} a ${dataBR(S.d1)}</p></div>
      <div class="painel-acoes"><button class="mini-btn" id="tb-excel">${IC.excel}Excel</button></div></div>
    <div class="tb-topo">
      <label class="tb-busca">${IC.busca}<input id="tb-busca" type="search" placeholder="Buscar cliente, código, bairro ou cidade…" value="${esc(S.tbBusca)}" autocomplete="off" spellcheck="false" style="background:transparent;border:0;outline:0;color:var(--t1);font:500 13px var(--f-txt);width:290px"></label>
      <span class="seg">${[["todos", "Todos"], ["com", "Com venda"], ["sem", "Sem venda"], ["int", "Operação interna"]].map(([k, t]) => `<button class="${S.tbFiltro === k ? "on" : ""}" data-tbf="${k}">${t}</button>`).join("")}</span>
    </div>
    <div class="tb-totais"><div class="t g"><span>Venda</span><b class="num">${brl(tot)}</b></div><div class="t"><span>${rotFat()}</span><b class="num" style="color:var(--info)">${brl(totF)}</b></div><div class="t"><span>Clientes</span><b class="num">${inteiro(ids.length - nInt)}</b></div>
      <div class="t"><span>Com venda</span><b class="num" style="color:var(--mp-com)">${inteiro(com)}</b></div><div class="t"><span>Sem venda</span><b class="num" style="color:var(--mp-nao)">${inteiro(ids.length - com - nInt)}</b></div>
      ${S.interna && (nInt || Math.abs(vInt) >= 0.005) ? `<div class="t" title="Fora dos totais de venda e de faturado"><span>Operação interna</span><b class="num" style="color:var(--mp-int)">${curto(vInt)} · ${inteiro(nInt)} só por ela</b></div>` : ""}</div>
    <div class="tb-wrap"><table class="tabela"><thead><tr>${COLS.map((c) => `<th class="ord ${c.num ? "num" : ""}" data-ord="${c.k}">${c.k === "ped" && itemAtivo() ? "Unidades" : c.k === "fat" ? rotFat() : c.t}${S.tbOrd === c.k ? (S.tbDir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead>
      <tbody>${pag.map((i) => `<tr class="click" data-cli="${i}" title="Ver no mapa">
        <td>${marcar((CID.get(C.ib[i]) || { nome: "" }).nome, q)}</td><td>${marcar(titulo(BAI(i)), q)}</td>
        <td><span class="cod">${marcar(String(C.cod[i]), q)}</span>${marcar(titulo(C.nome[i]), q)}</td>
        <td>${C.rca[i] != null ? `<span class="cod">${C.rca[i]}</span>${esc(titulo(RCA_NOME.get(C.rca[i]) || ""))}` : ""}</td>
        <td class="num">${C.ult[i] != null ? dataBR(C.ult[i]) : "—"}</td>
        <td><span class="tag ${R.soInt[i] ? "int" : R.comprou[i] ? "com" : "nao"}">${R.soInt[i] ? "Operação interna" : R.comprou[i] ? "Com venda" : "Sem venda"}</span></td>
        ${R.soInt[i] ? `<td class="num"></td><td class="num" style="color:var(--mp-int)" title="Operação interna: fora do total">${brl(R.vint[i])}</td><td class="num" style="color:var(--mp-int)" title="Operação interna: fora do total">${brl(R.fint[i])}</td>`
          : `<td class="num">${R.ped[i] ? R.ped[i].toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : ""}</td><td class="num">${R.comprou[i] ? brl(R.venda[i]) : "—"}</td><td class="num">${R.nfs[i] || R.fat[i] ? brl(R.fat[i]) : "—"}</td>`}</tr>`).join("") || `<tr><td colspan="9"><div class="vazio"><b>Nenhum cliente no recorte</b>Mude a busca ou os filtros.</div></td></tr>`}</tbody></table></div>
    <div class="tb-pe"><span>${inteiro(ids.length - nInt)} clientes${nInt ? " + " + inteiro(nInt) + " só operação interna" : ""} · página ${S.tbPag + 1} de ${pags}</span>
      <span class="pg"><button class="mini-btn" data-pg="-1" ${S.tbPag ? "" : "disabled"}>Anterior</button><button class="mini-btn" data-pg="1" ${S.tbPag < pags - 1 ? "" : "disabled"}>Próxima</button>
      <select id="tb-tam">${[25, 50, 100, 500].map((n) => `<option ${S.tbTam === n ? "selected" : ""}>${n}</option>`).join("")}</select></span></div>`;
  if (foco) { const c = $("#tb-busca"); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
}
function ligarLista() {
  const el = $("#sec-lista");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button, th.ord, tr.click"); if (!b) return;
    if (b.dataset.tbf) {
      S.tbFiltro = b.dataset.tbf; S.tbPag = 0;
      if (S.tbFiltro === "int" && !S.interna) return alternarInterna();      // pedir a operação interna na lista liga ela na tela toda
      return desenharLista();
    }
    if (b.dataset.ord) { S.tbOrd === b.dataset.ord ? (S.tbDir = -S.tbDir) : (S.tbOrd = b.dataset.ord, S.tbDir = COLS.find((c) => c.k === S.tbOrd).num ? -1 : 1); return desenharLista(); }
    if (b.dataset.pg) { S.tbPag += +b.dataset.pg; return desenharLista(); }
    if (b.id === "tb-excel") return excel();
    if (b.dataset.cli) return focarCliente(+b.dataset.cli);
  });
  let espera = null;
  el.addEventListener("input", (e) => { if (e.target.id !== "tb-busca") return; S.tbBusca = e.target.value; S.tbPag = 0; clearTimeout(espera); espera = setTimeout(desenharLista, 160); });
  el.addEventListener("change", (e) => { if (e.target.id === "tb-tam") { S.tbTam = +e.target.value; S.tbPag = 0; desenharLista(); } });
}
function filtrosTexto() {
  return [["Período", dataBR(S.d0) + " a " + dataBR(S.d1)], ["Lugar", escopo().nome],
    ["Supervisor", S.sup.size ? [...S.sup].map((s) => s + " " + (SUP_NOME.get(s) || "")).join("; ") : "Todos"],
    ["RCA", S.rca.size ? [...S.rca].map((r) => r + " " + (RCA_NOME.get(r) || "")).join("; ") : "Todos"],
    ["Base de clientes", { aptos: "Aptos a comprar (sem bloqueio, com limite) + quem comprou no período", "12m": "Compraram nos últimos 12 meses + quem comprou no período", todos: "Todos (aptos ou com compra em 24 meses)" }[S.base]],
  ].concat(itemAtivo() ? [
    ["Fornecedor", S.forn.size ? [...S.forn].map((f) => f + " " + ((ITL && ITL.nomeForn.get(f)) || "")).join("; ") : "Todos"],
    ["Produto", S.prod.size ? [...S.prod].map((p) => p + " " + ((ITL && ITL.prodDe.get(p) || [])[1] || "")).join("; ") : "Todos"],
    ["Venda", "Item de pedido faturado pela regra do Relatório 146 (sem ST, sem bonificação), pela data do pedido: a base da aba Fornecedor do app Supervisor Lube e da Análise Comercial"],
    ["Líquido", "Venda do item − devolução sem ST (pela data da devolução)"],
  ] : [
    ["Venda", "A do Relatório 146: pedido digitado, sem ST, todas as filiais, só as equipes de venda; cliente do estado"],
    ["Faturado", "O total líquido da aba ST do Central Comercial (venda − devolução sem ST), o mesmo do app dos supervisores"],
  ]).concat([
    ["Operação interna", "Fora dos totais de venda e de faturado" + (S.interna ? "; os clientes que só compraram por ela estão na lista, com os valores em colunas próprias" : "; não listada")],
    ["Lista", { todos: "Todos os clientes", com: "Só com venda", sem: "Só sem venda", int: "Só operação interna" }[S.tbFiltro] + (S.tbBusca.trim() ? ' · busca "' + S.tbBusca.trim() + '"' : "")]]);
}
function excel() {
  if (!window.Planilha) return toast("Excel indisponível", "erro");
  const ids = linhasLista(); let tot = 0, totF = 0, com = 0, nInt = 0; for (const i of ids) { tot += R.venda[i]; totF += R.fat[i]; com += R.comprou[i]; nInt += R.soInt[i]; }
  Planilha.baixar({
    arquivo: "Mapa de Vendas " + S.uf + " - clientes " + iso(S.d0) + " a " + iso(S.d1), titulo: "Mapa de Vendas · " + nomeUF(), subtitulo: "Clientes por cidade e bairro", aba: "Clientes",
    filtros: filtrosTexto(), resumo: [["Venda", tot, "moeda"], [rotFat(), totF, "moeda"], ["Clientes", ids.length - nInt, "inteiro"], ["Com venda", com, "inteiro"], ["Sem venda", ids.length - com - nInt, "inteiro"]].concat(nInt ? [["Só operação interna", nInt, "inteiro"]] : []),
    colunas: [
      { titulo: "Cidade", tipo: "texto", valor: (i) => (CID.get(C.ib[i]) || { nome: "" }).nome },
      { titulo: "Bairro", tipo: "texto", valor: (i) => BAI(i) },
      { titulo: "Código", tipo: "codigo", valor: (i) => C.cod[i] },
      { titulo: "Cliente", tipo: "texto", valor: (i) => C.nome[i] },
      { titulo: "Fantasia", tipo: "texto", valor: (i) => C.fant[i] },
      { titulo: "RCA", tipo: "codigo", valor: (i) => C.rca[i] },
      { titulo: "Nome do RCA", tipo: "texto", valor: (i) => RCA_NOME.get(C.rca[i]) || "" },
      { titulo: "Última compra", tipo: "data", valor: (i) => C.ult[i] != null ? iso(C.ult[i]) : null },
      { titulo: "Situação", tipo: "texto", valor: (i) => R.soInt[i] ? "Operação interna" : R.comprou[i] ? "Com venda" : "Sem venda" },
      itemAtivo() ? { titulo: "Unidades", tipo: "decimal", somar: true, valor: (i) => R.ped[i] } : { titulo: "Pedidos", tipo: "inteiro", somar: true, valor: (i) => R.ped[i] },
      { titulo: "Venda", tipo: "moeda", somar: true, valor: (i) => R.venda[i] },
      { titulo: rotFat(), tipo: "moeda", somar: true, valor: (i) => R.fat[i] },
      { titulo: "Venda op. interna", tipo: "moeda", somar: true, valor: (i) => R.vint[i] },
      { titulo: rotFat() + " op. interna", tipo: "moeda", somar: true, valor: (i) => R.fint[i] },
    ],
    linhas: ids, rodape: "Mapa de Vendas " + S.uf + " · Lube Distribuidora · gerado em " + new Date().toLocaleString("pt-BR"),
  }).then(() => toast("Planilha gerada", "ok")).catch((e) => toast("Erro no Excel: " + e.message, "erro"));
}

function alternarInterna() {                     // a operação interna aparece só quando pedem (cartão ou filtro da lista)
  S.interna = !S.interna; S.tbPag = 0;
  if (!S.interna && S.tbFiltro === "int") S.tbFiltro = "todos";
  desenharKpis(); desenharLegenda(); desenharPontos(); desenharLado(); desenharLista();
  toast(S.interna ? "Operação interna aparecendo em roxo no mapa e na lista (fora dos totais)" : "Operação interna escondida");
}

/* ------------------------------------------------------------------ ciclo */
function chaveItens() {
  const [p0, p1] = periodoAnterior();
  return [[...S.forn].sort().join(","), [...S.prod].sort().join(","), S.d0, S.d1, p0, p1].join("|");
}
async function carregarItens() {                  // a venda do fornecedor/produto no período e no de antes (para a comparação)
  const chave = chaveItens();
  if (IT && IT.chave === chave) return;
  if (IT_PEDIDO && IT_PEDIDO.chave === chave) return IT_PEDIDO.p;
  const [p0, p1] = periodoAnterior();
  const q = new URLSearchParams({ uf: S.uf, de: iso(S.d0), ate: iso(S.d1) });
  if (S.forn.size) q.set("forn", [...S.forn].join(","));
  if (S.prod.size) q.set("prod", [...S.prod].join(","));
  if (p1 >= 0) { q.set("de2", iso(Math.max(0, p0))); q.set("ate2", iso(p1)); }   // como na conta sem filtro: o pacote começa em 01/01/2025
  const p = (async () => {
    const r = await fetch("api/itens?" + q, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.mensagem || "HTTP " + r.status);
    const cur = [], ant = []; let perdido = 0;
    for (const l of j.linhas) { (l[0] ? ant : cur).push(l); if (!l[0] && !CIDX.has(l[1])) perdido += l[5]; }
    IT = { chave, cur, ant, perdido };
  })();
  IT_PEDIDO = { chave, p };
  try { await p; } finally { if (IT_PEDIDO && IT_PEDIDO.chave === chave) IT_PEDIDO = null; }
}
const ITL_PEDIDOS = {};
async function carregarLista() {                 // por estado, uma vez (o banco leva ~6 s; fica pronta antes do clique)
  const uf = S.uf; if (!uf) throw new Error("abra um estado");
  if (UFX[uf].itl) return (ITL = UFX[uf].itl);
  if (!ITL_PEDIDOS[uf]) ITL_PEDIDOS[uf] = fetch("api/itens?lista=1&uf=" + uf, { cache: "no-store" }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.mensagem || "HTTP " + r.status);
    j.nomeForn = new Map(j.forn.map((f) => [f[0], f[1]])); j.prodDe = new Map(j.prod.map((x) => [x[0], x]));
    UFX[uf].itl = j; if (S.uf === uf) ITL = j;
    return j;
  }).finally(() => { delete ITL_PEDIDOS[uf]; });
  return ITL_PEDIDOS[uf];
}
let lendoItens = 0;
function refazer() {
  if (S.uf == null) { calcularGeral(); montarFiltros(); desenharKpis(); pintarGeral(); desenharLado(); desenharLista(); return; }
  if (itemAtivo() && !(IT && IT.chave === chaveItens())) {
    const chave = chaveItens(), marca = ++lendoItens;
    document.body.classList.add("lendo-itens"); $("#btn-atualizar").classList.add("girando");
    montarFiltros();
    const fim = () => { document.body.classList.remove("lendo-itens"); if (!atualizando) $("#btn-atualizar").classList.remove("girando"); };
    carregarItens().then(() => { if (marca === lendoItens) { fim(); if (chave === chaveItens()) refazer(); } })
      .catch((e) => { if (marca !== lendoItens) return; fim(); toast("Não consegui ler a venda do fornecedor/produto: " + e.message, "erro"); S.forn.clear(); S.prod.clear(); refazer(); });
    return;
  }
  calcular();
  if (S.bairro != null && !(R.cid.get(S.cidade).bairros.has(S.bairro))) S.bairro = null;
  montarFiltros(); desenharKpis(); pintarMapa(); desenharPontos(); desenharLado(); desenharLista();
}
/* Os dados vêm do banco (api/dados: sempre até hoje). Se o banco não responder, a tela abre com a última cópia guardada
   nesta máquina (dados/mapa.json, do etl/extrair.py) e diz isso no topo, em vez de ficar muda. */
async function buscarDados(fresco, uf) {
  uf = uf || "ES";
  try {
    const r = await fetch("api/dados?uf=" + uf + (fresco ? "&fresco=1" : ""), { cache: "no-store" });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).mensagem || "HTTP " + r.status);
    const d = await r.json(); d.uf = d.uf || uf;
    return d;
  } catch (e) {
    if (uf !== "ES") throw e;                      // a cópia guardada (etl/extrair.py) é só do ES
    console.warn("Banco indisponível, usando a cópia guardada:", e.message);
    const d = await fetch("dados/mapa.json", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("sem banco (" + e.message + ") e sem cópia guardada"); return r.json(); });
    if (!d.ven || !d.ven.g || !d.fat || !d.fat.g) throw new Error("sem banco (" + e.message + ") e a cópia guardada é antiga (sem o grupo do supervisor): rode o ATUALIZAR DADOS.bat");
    d.origem = "guardado"; d.erroBanco = e.message; d.uf = "ES";
    return d;
  }
}
function aplicarDados(d) {
  D = d; C = d.cli; V = d.ven; FT = d.fat; IT = null;
  CIDX.clear(); C.cod.forEach((c, i) => CIDX.set(c, i));
  BASE = new Date(D.baseDia + "T00:00:00"); FIM = indice(D.periodo.fim);
  SUP_NOME.clear(); RCA_NOME.clear(); RCA_SUP.clear();
  for (const [k, t] of D.sup) SUP_NOME.set(k, t);
  for (const [k, t, s] of D.rca) { RCA_NOME.set(k, t); RCA_SUP.set(k, s); }
}
let atualizando = false, ultimaLeitura = 0;
const RELER_MS = 5 * 60 * 1000;
async function atualizarDados(manual) {
  if (atualizando) return;
  if (!manual && (document.hidden || popAberto || document.querySelector(".leaflet-popup"))) return;   // não mexe na tela no meio de uma leitura da pessoa
  atualizando = true; $("#btn-atualizar").classList.add("girando");
  try {
    const ufs = S.uf ? [S.uf] : UFS_ORDEM.filter((u) => UFX[u]);
    const novos = await Promise.all(ufs.map((u) => buscarDados(manual, u).then((d) => [u, d], (e) => [u, null, e])));
    const ae = document.activeElement;             // a pessoa abriu algo enquanto o banco respondia: fica para a próxima volta
    if (!manual && (popAberto || document.querySelector(".leaflet-popup") || (ae && (ae.id === "f-d0" || ae.id === "f-d1")))) return;
    const fimAntes = FIM; let algum = false, falhou = false;
    for (const [u, d, e] of novos) {
      const x = UFX[u];
      if (!d || (d.origem !== "banco" && x.D && x.D.origem === "banco")) { falhou = true; continue; }   // banco fora: fica com o de antes
      x.D = d; x.erro = null; algum = true;
    }
    if (!algum) { if (manual) toast("O banco não respondeu agora: a tela continua com os dados de antes.", "erro"); return; }
    usarUF(S.uf || ufs[0]); ultimaLeitura = Date.now();
    if (S.rapido) [S.d0, S.d1] = periodoRapido(S.rapido);          // virou o dia: "mês atual" anda junto
    else if (S.d1 === fimAntes) S.d1 = FIM;
    S.d1 = Math.min(S.d1, FIM); S.d0 = Math.min(S.d0, S.d1);
    mapa.closePopup(); refazer(); mostrarQuando();
    if (manual) toast(falhou ? "Parte dos dados não veio do banco agora: o resto foi atualizado" : "Dados lidos do banco agora", falhou ? "erro" : "ok");
  } catch (e) { if (manual) toast("Não consegui atualizar: " + e.message, "erro"); }
  finally { atualizando = false; $("#btn-atualizar").classList.remove("girando"); }
}
async function iniciar() {
  const json = (u) => fetch(u, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(u + ": HTTP " + r.status); return r.json(); });
  try {
    EST = await json("dados/estados.json");
  } catch (e) { $("#conteudo").innerHTML = `<div class="vazio"><b>Não consegui ler o mapa dos estados</b>${esc(e.message)}</div>`; return; }
  for (const f of EST.features) longe(f.geometry);
  // os dois estados em paralelo; um que falhe não derruba o outro (fica dito no mapa e no painel)
  const pedidoUF = new URLSearchParams(location.search).get("uf"), pedido = pedidoUF && NOMES_UF[pedidoUF.toUpperCase()] ? pedidoUF.toUpperCase() : null;
  const carregados = await Promise.all(UFS_ORDEM.map((uf) => Promise.all([json("dados/" + uf.toLowerCase() + "_municipios.json"), buscarDados(false, uf)])
    .then(([g, d]) => [uf, g, d], (e) => [uf, null, null, e])));
  for (const [uf, g, d, e] of carregados) {
    const x = UFX[uf] = { CID: new Map(), camada: new Map(), cam: null, itl: null, erro: e ? e.message : null };
    if (e) continue;
    for (const f of g.features) longe(f.geometry);
    x.GEO = g; x.D = d;
    for (const f of g.features) x.CID.set(f.properties.ibge, { ibge: f.properties.ibge, nome: f.properties.nome, pop: f.properties.pop, feicao: f, centro: centroide(f.geometry) });
  }
  const primeiro = UFS_ORDEM.find((u) => UFX[u].D);
  if (!primeiro) { $("#conteudo").innerHTML = `<div class="vazio"><b>Não consegui ler os dados</b>${esc(UFX.ES.erro || "")}</div>`; return; }
  usarUF(primeiro); ultimaLeitura = Date.now();
  [S.d0, S.d1] = periodoRapido("mes");
  calcularGeral();
  montarCasca(); montarPagina(); montarFiltros(); ligarFiltros();
  criarMapa(); ligarMapa(); ligarLado(); ligarLista();
  refazer();
  if (pedido && UFX[pedido].D) setTimeout(() => abrirUF(pedido), calmo ? 0 : 450);   // link direto (?uf=ES ou ?uf=BA) abre no estado
  setInterval(() => atualizarDados(false), RELER_MS);              // a tela relê o banco sozinha
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - ultimaLeitura > RELER_MS) atualizarDados(false); });
  window.__mapa = { S, get R() { return R; }, get D() { return D; }, get RG() { return RG; }, abrirUF, voltarGeral, abrirCidade, abrirBairro, voltarEstado, escopo, refazer, atualizarDados };   // para conferência no console
}
iniciar().catch((e) => { console.error(e); $("#conteudo").innerHTML = `<div class="vazio"><b>Não consegui montar a tela</b>${esc(e.message)}</div>`; });
})();
