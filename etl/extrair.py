"""
SO LEITURA. Monta os dados do MAPA DE VENDAS do Espirito Santo (recriacao do Power BI "LUBE ES"; pedido do Julio em
2026-11-16).

Os dois numeros do mapa sao os dos BIs de referencia, lidos de onde eles leem (decisao do Julio em 2026-11-16:
"VENDAS (RELATORIO 146) E O FATURADO (DA CENTRAL DO COMERCIAL / ST), O MESMO NUMERO QUE VAI PRO APLICATIVO DOS SUPERVISORES"):

  VENDA    = relatorio146.pedido do DATA WAREHOUSE (a tabela que o Relatorio 146 mostra, mantida ao vivo pelo Agente
             Lube): pedido digitado, sem ST, todas as filiais; cliente com UF = 'ES'. So as equipes de venda somam
             (relatorio146.grupo_supervisor: ES, BA, RJ); a operacao interna e as outras equipes vao marcadas a parte,
             fora do total, como no 146.
  FATURADO = comercial.fato_comissao_nf do DATA WAREHOUSE (a base da aba "Comissao RCA - ST" do Central Comercial):
             venda - devolucao SEM ST, por nota, todas as filiais e todos os supervisores: o TOTAL LIQUIDO da aba ST, o
             mesmo FATURADO do app Supervisor Lube. Cliente com UF = 'ES' (core.dim_cliente).

Do WinThor vem so o cadastro: os clientes do ES (cidade do cadastro, PCCIDADE.UF) que estao "aptos" (BLOQUEIO = 'N',
LIMCRED > 0 e BLOQUEIOSEFAZPED = 'N'), ou compraram nos ultimos 24 meses, ou tem venda ou nota no periodo.
Lugar no mapa: LATITUDE/LONGITUDE do cadastro quando cai dentro do proprio municipio; sem isso, o meio do bairro
(mediana dos clientes do mesmo bairro que tem coordenada), marcado como aproximado; sem nenhum dos dois, fica sem ponto.

Uso: python -I -X utf8 extrair.py [AAAA-MM-DD inicio] [AAAA-MM-DD fim]
Grava web/dados/mapa.json. Nao escreve nada no WinThor (transacao READ ONLY) nem no banco (so SELECT).
"""
import datetime as dt
import json
import math
import os
import statistics
import sys
import time
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import oracledb
import psycopg2
from dotenv import dotenv_values

# O ENV manda sobre as variaveis do Windows (as SUPABASE_* do sistema apontam para outro projeto): le-se o arquivo.
ENV = dotenv_values(os.environ.get("AGENTE_ENV") or r"C:\Users\gti.julio.alves\Desktop\BI\16. INVENTARIO\etl\ENV")
PROJETO_DW = "ivcnotrynogaljrvvyes"

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "web" / "dados" / "mapa.json"
MALHA = RAIZ / "web" / "dados" / "es_municipios.json"

hoje = dt.date.today()
INI = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.date(2025, 1, 1)
FIM = dt.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else hoje
BASE_DIA = dt.date(2025, 1, 1)
if INI < BASE_DIA or FIM < INI:
    raise SystemExit(f"Periodo invalido: o pacote comeca em {BASE_DIA} (a tela conta os dias a partir dai) e o fim nao pode ser antes do inicio.")

SQL_VENDA = """
select p.data, p.codcli, p.codusur, p.codsupervisor, sum(p.venda), count(*)
  from relatorio146.pedido p
 where p.uf = 'ES' and p.data between %s and %s
 group by 1, 2, 3, 4"""

SQL_FATURADO = """
select f.dtmov, f.codcli, f.codusur, f.codsupervisor, sum(f.venda - f.devolucao_sem_st),
       count(*) filter (where f.venda <> 0)        -- notas de venda; a linha so de devolucao (venda = 0) soma no valor e nao conta como nota
  from comercial.fato_comissao_nf f
  join core.dim_cliente c on c.codcli = f.codcli
 where c.uf = 'ES' and f.dtmov between %s and %s
 group by 1, 2, 3, 4"""

SQL_CLIENTES = """
SELECT C.CODCLI, C.CLIENTE, C.FANTASIA, NVL(TRIM(C.BAIRROENT), TRIM(C.BAIRROCOB)) BAIRRO, C.LATITUDE, C.LONGITUDE,
       C.CODUSUR1, C.DTULTCOMP, C.DTEXCLUSAO, D.CODIBGE, D.UF,
       CASE WHEN C.BLOQUEIO = 'N' AND C.LIMCRED > 0 AND C.BLOQUEIOSEFAZPED = 'N' AND C.DTEXCLUSAO IS NULL THEN 1 ELSE 0 END APTO
  FROM PCCLIENT C, PCCIDADE D
 WHERE C.CODCIDADE = D.CODCIDADE
   AND D.UF = 'ES'"""


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().upper()
    return " ".join(s.replace(".", " ").replace("-", " ").split())


def num(s):
    try:
        v = float(str(s).strip().replace(",", "."))
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def dentro(anel, x, y):
    ok = False
    j = len(anel) - 1
    for i in range(len(anel)):
        xi, yi = anel[i]
        xj, yj = anel[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ok = not ok
        j = i
    return ok


def no_poligono(geo, x, y):
    polis = geo["coordinates"] if geo["type"] == "MultiPolygon" else [geo["coordinates"]]
    for p in polis:
        if dentro(p[0], x, y) and not any(dentro(furo, x, y) for furo in p[1:]):
            return True
    return False


def caixa(geo):
    polis = geo["coordinates"] if geo["type"] == "MultiPolygon" else [geo["coordinates"]]
    xs = [pt[0] for p in polis for pt in p[0]]
    ys = [pt[1] for p in polis for pt in p[0]]
    return min(xs), min(ys), max(xs), max(ys)


def ler_banco():
    """Venda (146), faturado (Central Comercial) e os grupos de supervisor, tudo numa foto so do banco."""
    if PROJETO_DW not in (ENV.get("SUPABASE_DB_USER") or ""):
        raise SystemExit("O ENV nao aponta para o DATA WAREHOUSE (" + PROJETO_DW + "): nao leio de outro projeto.")
    pg = psycopg2.connect(host=ENV["SUPABASE_DB_HOST"], port=int(ENV.get("SUPABASE_DB_PORT") or 5432),
                          dbname=ENV.get("SUPABASE_DB_NAME") or "postgres", user=ENV["SUPABASE_DB_USER"],
                          password=ENV["SUPABASE_DB_PASSWORD"], connect_timeout=20, sslmode="require")
    pg.set_session(readonly=True, isolation_level="REPEATABLE READ")
    c = pg.cursor()
    c.execute("set statement_timeout = '120s'")
    c.execute("select now()")
    lido_em = c.fetchone()[0]
    c.execute(SQL_VENDA, (INI, FIM))
    venda = c.fetchall()
    c.execute(SQL_FATURADO, (INI, FIM))
    fat = c.fetchall()
    c.execute("select codsupervisor, grupo from relatorio146.grupo_supervisor")
    grupos = dict(c.fetchall())
    pg.rollback()
    pg.close()
    return venda, fat, grupos, lido_em


def main():
    t0 = time.time()
    malha = json.loads(MALHA.read_text(encoding="utf-8"))
    GEO = {f["properties"]["ibge"]: f["geometry"] for f in malha["features"]}
    CAIXA = {k: caixa(g) for k, g in GEO.items()}

    vendas, fats, grupos, lido_em = ler_banco()
    print(f"banco: {len(vendas):,} linhas de venda e {len(fats):,} de faturado (dia x cliente x RCA x supervisor) em {time.time()-t0:.1f}s")

    con = oracledb.connect(user=ENV["ORACLE_USER"], password=ENV["ORACLE_PASSWORD"],
                           dsn=f'{ENV["ORACLE_HOST"]}:{ENV["ORACLE_PORT"]}/{ENV["ORACLE_SERVICE_NAME"]}')
    cur = con.cursor()
    cur.arraysize = 5000
    cur.execute("SET TRANSACTION READ ONLY")
    cur.execute(SQL_CLIENTES)
    clientes = cur.fetchall()
    cur.execute("SELECT CODUSUR, NOME, CODSUPERVISOR FROM PCUSUARI")
    rcas = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
    cur.execute("SELECT CODSUPERVISOR, NOME FROM PCSUPERV")
    sups = dict(cur.fetchall())
    con.rollback()
    con.close()

    com_movimento = {v[1] for v in vendas} | {f[1] for f in fats}
    corte24 = dt.datetime.combine(hoje, dt.time()) - dt.timedelta(days=730)

    # ---- clientes do pacote
    ficam = []
    fora = {"antigos": 0, "cidade_sem_malha": 0}
    for (cod, nome, fant, bairro, lat, lng, rca1, ult, excl, ibge, uf, apto) in clientes:
        if ibge not in GEO:
            fora["cidade_sem_malha"] += 1
            continue
        if cod not in com_movimento and (excl is not None or not (apto or (ult and ult >= corte24))):
            fora["antigos"] += 1
            continue
        ficam.append([cod, nome, fant, bairro, num(lat), num(lng), rca1, ult, ibge, apto])

    # ---- lugar no mapa
    cont = {"exata": 0, "bairro": 0, "sem": 0, "coord_fora": 0}
    por_bairro = defaultdict(list)
    for c in ficam:
        lat, lng, ibge = c[4], c[5], c[8]
        loc = 0
        if lat is not None and lng is not None:
            if lat > 0 and lng > 0:          # sinal esquecido no cadastro
                lat, lng = -lat, -lng
            x0, y0, x1, y1 = CAIXA[ibge]
            f = 0.02                         # ~2 km de folga na borda (a malha e simplificada)
            if x0 - f <= lng <= x1 + f and y0 - f <= lat <= y1 + f and (
                    no_poligono(GEO[ibge], lng, lat) or any(no_poligono(GEO[ibge], lng + dx, lat + dy)
                                                             for dx in (-f, 0, f) for dy in (-f, 0, f))):
                loc = 1
                c[4], c[5] = lat, lng
                por_bairro[(ibge, norm(c[3]))].append((lat, lng))
            else:
                cont["coord_fora"] += 1
        c.append(loc)
    centro = {k: (statistics.median(p[0] for p in v), statistics.median(p[1] for p in v)) for k, v in por_bairro.items()}
    for c in ficam:
        if c[10] == 1:
            cont["exata"] += 1
            continue
        k = (c[8], norm(c[3]))
        if k in centro and k[1]:
            la, lo = centro[k]
            ang = math.radians((c[0] * 137.508) % 360)
            raio = 0.0006 + 0.0016 * math.sqrt(((c[0] * 7919) % 1000) / 1000)      # ~70 a 250 m em volta do meio do bairro
            c[4], c[5], c[10] = la + raio * math.sin(ang), lo + raio * math.cos(ang) / math.cos(math.radians(la)), 2
            cont["bairro"] += 1
        else:
            c[4], c[5] = None, None
            cont["sem"] += 1

    # O mesmo bairro escrito de jeitos diferentes (com e sem acento, ponto, hifen) e um bairro so: a chave e a mesma do
    # meio do bairro (municipio + norm) e o nome mostrado e a grafia mais usada no cadastro.
    limpo = lambda s: " ".join(str(s or "").upper().split())
    grafias = defaultdict(Counter)
    for c in ficam:
        grafias[(c[8], norm(c[3]))][limpo(c[3])] += 1
    nome_bairro = {k: max(v.items(), key=lambda kv: (kv[1], kv[0]))[0] for k, v in grafias.items()}

    ficam.sort(key=lambda c: c[0])
    idx = {c[0]: i for i, c in enumerate(ficam)}
    dia = lambda d: ((d.date() if isinstance(d, dt.datetime) else d) - BASE_DIA).days if d else None
    grupo = lambda s: {"INTERNA": 1, "OUTROS": 2}.get(grupos.get(s, "OUTROS"), 0)   # 0 = equipe de venda (ES, BA, RJ)

    cli = {
        "cod": [c[0] for c in ficam],
        "nome": [(c[1] or "").strip() for c in ficam],
        "fant": [(c[2] or "").strip() if (c[2] or "").strip() != (c[1] or "").strip() else "" for c in ficam],
        "bai": [nome_bairro[(c[8], norm(c[3]))] for c in ficam],
        "ib": [c[8] for c in ficam],
        "lat": [None if c[4] is None else round(c[4], 5) for c in ficam],
        "lng": [None if c[5] is None else round(c[5], 5) for c in ficam],
        "loc": [c[10] for c in ficam],
        "apto": [c[9] for c in ficam],
        "ult": [dia(c[7]) for c in ficam],
        "rca": [c[6] for c in ficam],
    }

    def empacotar(linhas, com_grupo):
        linhas.sort(key=lambda v: (v[0], v[1], v[2] or 0, v[3] or 0))
        o = {"d": [], "c": [], "r": [], "s": [], "v": [], "n": []}
        if com_grupo:
            o["g"] = []
        perdido = [0, 0.0]
        for (data, cod, usur, sup, valor, n) in linhas:
            if cod not in idx:                # cliente que o banco da como ES e o cadastro de hoje nao: fica dito, nao some calado
                perdido[0] += 1
                perdido[1] += float(valor or 0)
                continue
            o["d"].append(dia(data)); o["c"].append(idx[cod]); o["r"].append(usur); o["s"].append(sup)
            o["v"].append(round(float(valor or 0), 6)); o["n"].append(n)       # valor cheio; arredondar so na tela
            if com_grupo:
                o["g"].append(grupo(sup))
        return o, perdido

    ven, perd_v = empacotar(vendas, True)
    fat, perd_f = empacotar(fats, True)

    usados_r = set(ven["r"]) | set(fat["r"]) | {r for r in cli["rca"] if r is not None}
    usados_s = set(ven["s"]) | set(fat["s"]) | {rcas[r][1] for r in usados_r if r in rcas}
    pacote = {
        "geradoEm": lido_em.astimezone().replace(tzinfo=None).isoformat(timespec="seconds"),
        "baseDia": BASE_DIA.isoformat(),
        "periodo": {"ini": INI.isoformat(), "fim": FIM.isoformat()},
        "sup": sorted([[s, (sups.get(s) or f"Supervisor {s}").strip()] for s in usados_s if s is not None]),
        "rca": sorted([[r, (rcas[r][0] or "").strip(), rcas[r][1]] for r in usados_r if r in rcas]),
        "cli": cli, "ven": ven, "fat": fat,
        "lugar": cont, "fora": fora,
        "semCliente": {"venda": perd_v, "faturado": perd_f},
    }
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(pacote, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tv = [sum(v for v, g in zip(ven["v"], ven["g"]) if g == k) for k in (0, 1, 2)]
    print(f"clientes no pacote: {len(ficam):,}  (fora: {fora})  lugar: {cont}")
    print(f"linhas sem cliente no cadastro do ES: venda {perd_v[0]} (R$ {perd_v[1]:,.2f}) | faturado {perd_f[0]} (R$ {perd_f[1]:,.2f})")
    print(f"VENDA {INI} a {FIM}: equipes R$ {tv[0]:,.2f} | fora do total: operacao interna R$ {tv[1]:,.2f}, outras equipes R$ {tv[2]:,.2f}")
    tf = [sum(v for v, g in zip(fat["v"], fat["g"]) if g == k) for k in (0, 1, 2)]
    print(f"FATURADO {INI} a {FIM}: equipes R$ {tf[0]:,.2f} | fora do total: operacao interna R$ {tf[1]:,.2f}, outras equipes R$ {tf[2]:,.2f}")
    print(f"-> {SAIDA} ({SAIDA.stat().st_size/1e6:.1f} MB) em {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
