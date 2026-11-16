"""SO LEITURA. Sonda: o que o WinThor tem de localizacao do cliente (latitude/longitude, bairro, cidade IBGE)."""
import os

import oracledb
from dotenv import load_dotenv

load_dotenv(os.environ.get("AGENTE_ENV") or r"C:\Users\gti.julio.alves\Desktop\BI\16. INVENTARIO\etl\ENV")
con = oracledb.connect(
    user=os.environ["ORACLE_USER"], password=os.environ["ORACLE_PASSWORD"],
    dsn=f'{os.environ["ORACLE_HOST"]}:{os.environ["ORACLE_PORT"]}/{os.environ["ORACLE_SERVICE_NAME"]}')
cur = con.cursor()
cur.execute("SET TRANSACTION READ ONLY")


def q(sql, **k):
    cur.execute(sql, **k)
    return cur.fetchall()


print("colunas PCCLIENT de lugar:")
for r in q("""SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'PCCLIENT'
              AND (COLUMN_NAME LIKE '%LATIT%' OR COLUMN_NAME LIKE '%LONGIT%' OR COLUMN_NAME LIKE '%BAIRRO%'
                   OR COLUMN_NAME LIKE '%MUNIC%' OR COLUMN_NAME LIKE '%CIDADE%' OR COLUMN_NAME LIKE '%CEP%'
                   OR COLUMN_NAME LIKE 'EST%' OR COLUMN_NAME LIKE '%GEO%' OR COLUMN_NAME LIKE 'ENDER%')
              ORDER BY 1"""):
    print("  ", r)
print("colunas PCCIDADE:", [r[0] for r in q("SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME='PCCIDADE' ORDER BY COLUMN_ID")])

print("\nclientes ESTCOB=ES / ESTENT=ES / cidade(UF)=ES:")
print(q("""SELECT COUNT(*), SUM(CASE WHEN C.ESTCOB='ES' THEN 1 ELSE 0 END), SUM(CASE WHEN C.ESTENT='ES' THEN 1 ELSE 0 END),
                  SUM(CASE WHEN D.UF='ES' THEN 1 ELSE 0 END)
             FROM PCCLIENT C, PCCIDADE D WHERE C.CODCIDADE = D.CODCIDADE(+)"""))

print("\nES (cidade): com latitude/longitude preenchida, por situacao:")
for r in q("""SELECT CASE WHEN C.DTEXCLUSAO IS NULL THEN 'ativo' ELSE 'excluido' END,
                     COUNT(*) total,
                     SUM(CASE WHEN TRIM(C.LATITUDE) IS NOT NULL AND TRIM(C.LONGITUDE) IS NOT NULL
                               AND TRIM(C.LATITUDE) NOT IN ('0','0.0','0,0') THEN 1 ELSE 0 END) com_coord,
                     SUM(CASE WHEN TRIM(C.BAIRROCOB) IS NOT NULL THEN 1 ELSE 0 END) com_bairrocob,
                     SUM(CASE WHEN TRIM(C.BAIRROENT) IS NOT NULL THEN 1 ELSE 0 END) com_bairroent,
                     SUM(CASE WHEN TRIM(C.CEPENT) IS NOT NULL THEN 1 ELSE 0 END) com_cepent
                FROM PCCLIENT C, PCCIDADE D WHERE C.CODCIDADE = D.CODCIDADE AND D.UF = 'ES'
               GROUP BY CASE WHEN C.DTEXCLUSAO IS NULL THEN 'ativo' ELSE 'excluido' END"""):
    print("  ", r)

print("\namostra de latitude/longitude:")
for r in q("""SELECT * FROM (SELECT C.CODCLI, C.LATITUDE, C.LONGITUDE, C.MUNICENT, C.BAIRROENT, C.BAIRROCOB, D.NOMECIDADE, D.CODIBGE
                FROM PCCLIENT C, PCCIDADE D WHERE C.CODCIDADE = D.CODCIDADE AND D.UF='ES' AND TRIM(C.LATITUDE) IS NOT NULL
                 AND C.DTEXCLUSAO IS NULL ORDER BY C.DTULTCOMP DESC NULLS LAST) WHERE ROWNUM <= 12"""):
    print("  ", r)

print("\ncompradores dos ultimos 7 meses (filial 1, condvenda 1, ESTCOB=ES): total e com coordenada")
print(q("""SELECT COUNT(*), SUM(CASE WHEN TRIM(C.LATITUDE) IS NOT NULL AND TRIM(C.LATITUDE) NOT IN ('0','0.0','0,0') THEN 1 ELSE 0 END),
                  SUM(CASE WHEN C.ESTCOB = D.UF THEN 1 ELSE 0 END), SUM(CASE WHEN D.UF='ES' THEN 1 ELSE 0 END)
             FROM PCCLIENT C, PCCIDADE D
            WHERE C.CODCIDADE = D.CODCIDADE(+) AND C.ESTCOB = 'ES'
              AND C.CODCLI IN (SELECT P.CODCLI FROM PCPEDC P WHERE P.DATA >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-7)
                                 AND P.DTCANCEL IS NULL AND P.CODFILIAL='1' AND P.CONDVENDA = 1)"""))

print("\ncidades ES no cadastro (PCCIDADE) com e sem CODIBGE:")
print(q("SELECT COUNT(*), COUNT(CODIBGE), COUNT(DISTINCT CODIBGE) FROM PCCIDADE WHERE UF='ES'"))
con.rollback()
