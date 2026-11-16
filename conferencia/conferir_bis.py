"""
Confere o pacote (web/dados/mapa.json) contra os dois BIs de referencia, mes a mes, direto no DATA WAREHOUSE.
Nao grava nada (so SELECT).

  VENDA    x relatorio146.pedido (uf = 'ES', so as equipes de venda de relatorio146.grupo_supervisor: ES, BA, RJ)
  FATURADO x comercial.fato_comissao_nf (venda - devolucao_sem_st, cliente uf = 'ES'): o TOTAL LIQUIDO da aba ST do
             Central Comercial, o mesmo FATURADO do app Supervisor Lube

O banco e ao vivo: o mes corrente pode andar entre a extracao e a conferencia; mes fechado tem que dar diferenca zero.
Os numeros de referencia (outubro/2026) ficam na nota MAPA DE VENDAS ES do cerebro, fora do repositorio.
Uso: python -I -X utf8 conferir_bis.py [AAAA-MM do primeiro mes]
"""
import datetime as dt
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2
from dotenv import dotenv_values

ENV = dotenv_values(os.environ.get("AGENTE_ENV") or r"C:\Users\gti.julio.alves\Desktop\BI\16. INVENTARIO\etl\ENV")
if "ivcnotrynogaljrvvyes" not in (ENV.get("SUPABASE_DB_USER") or ""):
    raise SystemExit("O ENV nao aponta para o DATA WAREHOUSE.")
D = json.loads((Path(__file__).resolve().parent.parent / "web" / "dados" / "mapa.json").read_text(encoding="utf-8"))
base = dt.date.fromisoformat(D["baseDia"])
DESDE = (sys.argv[1] if len(sys.argv) > 1 else "2026-01") + "-01"
mes = lambda i: (base + dt.timedelta(days=i)).strftime("%Y-%m")

pac_v, pac_p, pac_c, pac_f, pac_n = defaultdict(float), defaultdict(int), defaultdict(set), defaultdict(float), defaultdict(int)
V, F = D["ven"], D["fat"]
for i, d in enumerate(V["d"]):
    if V["g"][i] == 0:
        m = mes(d); pac_v[m] += V["v"][i]; pac_p[m] += V["n"][i]; pac_c[m].add(V["c"][i])
for i, d in enumerate(F["d"]):
    m = mes(d); pac_f[m] += F["v"][i]; pac_n[m] += F["n"][i]

pg = psycopg2.connect(host=ENV["SUPABASE_DB_HOST"], port=int(ENV.get("SUPABASE_DB_PORT") or 5432), dbname=ENV.get("SUPABASE_DB_NAME") or "postgres",
                      user=ENV["SUPABASE_DB_USER"], password=ENV["SUPABASE_DB_PASSWORD"], connect_timeout=20, sslmode="require")
pg.set_session(readonly=True)
c = pg.cursor()
c.execute("""select to_char(p.data, 'YYYY-MM'), sum(p.venda), count(*), count(distinct p.codcli)
               from relatorio146.pedido p join relatorio146.grupo_supervisor g on g.codsupervisor = p.codsupervisor
              where p.uf = 'ES' and g.grupo in ('ES', 'BA', 'RJ') and p.data >= %s and p.data <= %s group by 1""", (DESDE, D["periodo"]["fim"]))
bd_v = {r[0]: r[1:] for r in c.fetchall()}
c.execute("""select to_char(f.dtmov, 'YYYY-MM'), sum(f.venda - f.devolucao_sem_st), count(*) filter (where f.venda <> 0)
               from comercial.fato_comissao_nf f join core.dim_cliente k on k.codcli = f.codcli
              where k.uf = 'ES' and f.dtmov >= %s and f.dtmov <= %s group by 1""", (DESDE, D["periodo"]["fim"]))
bd_f = {r[0]: r[1:] for r in c.fetchall()}
pg.rollback(); pg.close()

print(f"pacote lido do banco em {D['geradoEm']}")
print(f"{'mes':8}{'venda pacote':>17}{'venda 146':>17}{'dif':>10}{'ped':>7}{'cli':>6} | {'faturado pacote':>17}{'aba ST':>17}{'dif':>10}{'notas':>7}")
ruim = 0
for m in sorted(set(bd_v) | set(bd_f)):
    v, p, k = bd_v.get(m, (0, 0, 0)); f, n = bd_f.get(m, (0, 0))
    dv, df = pac_v[m] - float(v or 0), pac_f[m] - float(f or 0)
    ok = abs(dv) < 0.005 and abs(df) < 0.005 and pac_p[m] == p and len(pac_c[m]) == k and pac_n[m] == n
    ruim += not ok
    print(f"{m:8}{pac_v[m]:>17,.2f}{float(v or 0):>17,.2f}{dv:>+10.2f}{pac_p[m] - p:>+7d}{len(pac_c[m]) - k:>+6d} | {pac_f[m]:>17,.2f}{float(f or 0):>17,.2f}{df:>+10.2f}{pac_n[m] - n:>+7d}{'' if ok else '   <<'}")
print("tudo igual" if not ruim else f"{ruim} mes(es) com diferenca (se for so o mes corrente, o banco andou depois da extracao)")
