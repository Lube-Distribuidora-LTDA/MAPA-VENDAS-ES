"""
Baixa do IBGE (dado publico, roda uma vez) o que o mapa precisa de cada estado (ES e, desde 2026-11-17, BA):
  - a malha dos municipios (GeoJSON)                        -> web/dados/<uf>_municipios.json
    (ES na qualidade maxima; BA, com 417 municipios e 12 vezes a area, na intermediaria, para a tela abrir rapido)
  - o contorno dos estados, para a visao ES + BAHIA         -> web/dados/estados.json
  - o nome oficial de cada municipio
  - a populacao do Censo 2022 (tabela 4709, variavel 93), a mesma do Excel do BI antigo (ES = 3.833.712)
Nao manda nada da Lube para fora: sao 3 pedidos GET sem parametro nosso.
Uso: python -I -X utf8 baixar_ibge.py [ES|BA|estados]   (sem argumento: os tres)
"""
import json
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "web" / "dados"
UFS = {"ES": ("32", "maxima"), "BA": ("29", "intermediaria")}


def pegar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def arredondar(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 5), round(coords[1], 5)]
    return [arredondar(c) for c in coords]


def gravar(saida, feicoes, fonte):
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps({"type": "FeatureCollection", "fonte": fonte, "features": feicoes},
                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def municipios(sigla):
    uf, qualidade = UFS[sigla]
    malha = pegar(f"https://servicodados.ibge.gov.br/api/v3/malhas/estados/{uf}"
                  f"?formato=application/vnd.geo%2Bjson&qualidade={qualidade}&intrarregiao=municipio")
    nomes = {str(m["id"]): m["nome"] for m in pegar(f"https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios")}
    pop_bruta = pegar(f"https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/93?localidades=N6[N3[{uf}]]")
    pop = {s["localidade"]["id"]: int(s["serie"]["2022"]) for s in pop_bruta[0]["resultados"][0]["series"]}
    feicoes = []
    for f in malha["features"]:
        cod = str(f["properties"]["codarea"])
        feicoes.append({
            "type": "Feature",
            "properties": {"ibge": int(cod), "nome": nomes[cod], "pop": pop[cod]},
            "geometry": {"type": f["geometry"]["type"], "coordinates": arredondar(f["geometry"]["coordinates"])},
        })
    feicoes.sort(key=lambda f: f["properties"]["nome"])
    saida = DADOS / f"{sigla.lower()}_municipios.json"
    gravar(saida, feicoes, "IBGE: malha municipal e Censo 2022 (tabela 4709)")
    print(f"{sigla}: {len(feicoes)} municipios, populacao {sum(pop.values()):,} -> {saida} ({saida.stat().st_size/1024:.0f} KB)")


def estados():
    feicoes = []
    for sigla, (uf, _) in UFS.items():
        g = pegar(f"https://servicodados.ibge.gov.br/api/v3/malhas/estados/{uf}?formato=application/vnd.geo%2Bjson&qualidade=intermediaria")
        for f in g["features"]:
            feicoes.append({"type": "Feature", "properties": {"uf": sigla},
                            "geometry": {"type": f["geometry"]["type"], "coordinates": arredondar(f["geometry"]["coordinates"])}})
    saida = DADOS / "estados.json"
    gravar(saida, feicoes, "IBGE: malha dos estados")
    print(f"estados: {len(feicoes)} -> {saida} ({saida.stat().st_size/1024:.0f} KB)")


pedidos = [a.upper() for a in sys.argv[1:]] or ["ES", "BA", "ESTADOS"]
for p in pedidos:
    estados() if p == "ESTADOS" else municipios(p)
