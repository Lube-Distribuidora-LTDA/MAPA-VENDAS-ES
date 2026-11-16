"""
Baixa do IBGE (dado publico, roda uma vez) o que o mapa precisa do Espirito Santo:
  - a malha dos 78 municipios (GeoJSON, qualidade maxima)   -> web/dados/es_municipios.json
  - o nome oficial de cada municipio
  - a populacao do Censo 2022 (tabela 4709, variavel 93), a mesma do Excel do BI antigo (ES = 3.833.712)
Nao manda nada da Lube para fora: sao 3 pedidos GET sem parametro nosso.
Uso: python -I -X utf8 baixar_ibge.py
"""
import json
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "web" / "dados" / "es_municipios.json"
UF = "32"


def pegar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


malha = pegar(f"https://servicodados.ibge.gov.br/api/v3/malhas/estados/{UF}"
              "?formato=application/vnd.geo%2Bjson&qualidade=maxima&intrarregiao=municipio")
nomes = {str(m["id"]): m["nome"] for m in pegar(f"https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios")}
pop_bruta = pegar("https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/93?localidades=N6[N3[32]]")
pop = {s["localidade"]["id"]: int(s["serie"]["2022"]) for s in pop_bruta[0]["resultados"][0]["series"]}


def arredondar(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 5), round(coords[1], 5)]
    return [arredondar(c) for c in coords]


feicoes = []
for f in malha["features"]:
    cod = str(f["properties"]["codarea"])
    feicoes.append({
        "type": "Feature",
        "properties": {"ibge": int(cod), "nome": nomes[cod], "pop": pop[cod]},
        "geometry": {"type": f["geometry"]["type"], "coordinates": arredondar(f["geometry"]["coordinates"])},
    })
feicoes.sort(key=lambda f: f["properties"]["nome"])
SAIDA.parent.mkdir(parents=True, exist_ok=True)
SAIDA.write_text(json.dumps({"type": "FeatureCollection", "fonte": "IBGE: malha municipal e Censo 2022 (tabela 4709)",
                             "features": feicoes}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(feicoes)} municipios, populacao {sum(pop.values()):,} -> {SAIDA} ({SAIDA.stat().st_size/1024:.0f} KB)")
