"""SO LEITURA. Sonda: tamanho das bases de cliente possiveis e a venda da Consulta8 (regra do BI antigo) x a regra do 146."""
import os
import time

import oracledb
from dotenv import load_dotenv

load_dotenv(os.environ.get("AGENTE_ENV") or r"C:\Users\gti.julio.alves\Desktop\BI\16. INVENTARIO\etl\ENV")
con = oracledb.connect(
    user=os.environ["ORACLE_USER"], password=os.environ["ORACLE_PASSWORD"],
    dsn=f'{os.environ["ORACLE_HOST"]}:{os.environ["ORACLE_PORT"]}/{os.environ["ORACLE_SERVICE_NAME"]}')
cur = con.cursor()
cur.execute("SET TRANSACTION READ ONLY")


def q(sql, **k):
    t = time.time()
    cur.execute(sql, **k)
    r = cur.fetchall()
    print(f"   ({time.time()-t:.1f}s)")
    return r


COORD = "TRIM(C.LATITUDE) IS NOT NULL AND TRIM(C.LATITUDE) NOT IN ('0','0.0','0,0')"
print("bases de cliente no ES (cidade do cadastro), nao excluidos:")
for r in q(f"""SELECT COUNT(*) todos,
        SUM(CASE WHEN C.BLOQUEIO='N' AND C.LIMCRED > 0 AND C.BLOQUEIOSEFAZPED='N' THEN 1 ELSE 0 END) aptos_c7,
        SUM(CASE WHEN C.BLOQUEIO='N' AND C.LIMCRED > 0 AND C.BLOQUEIOSEFAZPED='N' AND {COORD} THEN 1 ELSE 0 END) aptos_coord,
        SUM(CASE WHEN C.DTULTCOMP >= ADD_MONTHS(TRUNC(SYSDATE),-12) THEN 1 ELSE 0 END) comprou_12m,
        SUM(CASE WHEN C.DTULTCOMP >= ADD_MONTHS(TRUNC(SYSDATE),-12) AND {COORD} THEN 1 ELSE 0 END) comprou_12m_coord,
        SUM(CASE WHEN C.DTULTCOMP >= ADD_MONTHS(TRUNC(SYSDATE),-24) THEN 1 ELSE 0 END) comprou_24m,
        SUM(CASE WHEN C.DTULTCOMP >= ADD_MONTHS(TRUNC(SYSDATE),-24) AND {COORD} THEN 1 ELSE 0 END) comprou_24m_coord,
        SUM(CASE WHEN C.DTULTCOMP IS NULL THEN 1 ELSE 0 END) nunca
      FROM PCCLIENT C, PCCIDADE D WHERE C.CODCIDADE = D.CODCIDADE AND D.UF='ES' AND C.DTEXCLUSAO IS NULL"""):
    print("  ", r)

print("Consulta7 inteira restrita ao ES (com as juncoes do BI antigo):")
print(q("""select count(*), count(distinct a.codcli), count(distinct a.bairrocob||'|'||e.nomecidade)
from pcclient a , pcusuari b, pcsuperv c, pcgerente d, pccidade e, pccob g, pcplpag f
WHERE a.BLOQUEIO = 'N' AND a.LIMCRED >'0' and a.BLOQUEIOSEFAZPED = 'N' and a.codusur1 = b.codusur
and b.codsupervisor = c.codsupervisor and c.codgerente = d.codgerente and a.codcidade = e.codcidade
and g.codcob = a.codcob and f.codplpag = a.codplpag and e.uf = 'ES'"""))

C8 = """
FROM PCPEDI, PCPEDC, PCCLIENT, PCPRODUT, PCDEPTO, PCPRACA, PCUSUARI, PCFORNEC, PCSUPERV
where pcpedc.DATA BETWEEN ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -7) AND SYSDATE
AND pcpedi.DATA BETWEEN ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -7) AND SYSDATE
AND PCPEDI.NUMPED = PCPEDC.NUMPED AND PCPEDC.CODCLI = PCCLIENT.CODCLI AND PCPEDI.CODPROD = PCPRODUT.CODPROD
AND PCPRODUT.CODEPTO = PCDEPTO.CODEPTO AND PCPEDC.CODUSUR = PCUSUARI.CODUSUR AND PCPEDC.CODPRACA = PCPRACA.CODPRACA
and pcclient.estcob = 'ES' AND PCPEDC.DTCANCEL IS NULL AND PCPEDC.CODSUPERVISOR = PCSUPERV.CODSUPERVISOR
AND PCPRODUT.CODFORNEC = PCFORNEC.CODFORNEC AND PCPEDC.CODFILIAL IN ('1')
AND PCPEDC.CODSUPERVISOR IN ('2','30','33','32','31','1','6','14','17','16','13','4','8','7','12','9','100','11','10','21','22','23','5','15')
AND PCPEDC.CONDVENDA IN (1)"""
VL = """(CASE WHEN NVL(PCPEDI.BONIFIC, 'N') = 'N' THEN NVL(PCPEDI.VLSUBTOTITEM,
        (DECODE(NVL(PCPEDI.TRUNCARITEM, 'N'), 'N',
          ROUND((NVL(PCPEDI.QT, 0)) * (NVL(PCPEDI.PVENDA, 0) + nvl(pcpedi.vloutrasdesp,0) + nvl(pcpedi.vlfrete,0)), 2),
          TRUNC((NVL(PCPEDI.QT, 0)) * (NVL(PCPEDI.PVENDA, 0) + nvl(pcpedi.vloutrasdesp,0) + nvl(pcpedi.vlfrete,0)), 2)))) ELSE 0 END)"""
print("Consulta8 (BI antigo), a janela inteira: linhas, venda, clientes, bairros, cidades, de/ate")
print(q(f"""SELECT COUNT(*), SUM({VL}), COUNT(DISTINCT PCCLIENT.CLIENTE), COUNT(DISTINCT PCPEDC.CODCLI),
                   COUNT(DISTINCT PCCLIENT.BAIRROCOB), COUNT(DISTINCT PCCLIENT.MUNICCOB), MIN(PCPEDC.DATA), MAX(PCPEDC.DATA) {C8}"""))
print("... os 5 maiores por MUNICCOB:")
for r in q(f"""SELECT * FROM (SELECT PCCLIENT.MUNICCOB, SUM({VL}) V {C8} GROUP BY PCCLIENT.MUNICCOB ORDER BY 2 DESC) WHERE ROWNUM <= 6"""):
    print("  ", r)

print("regra do 146 na mesma janela (cliente com cidade no ES, todas as filiais):")
print(q("""SELECT COUNT(*), COUNT(DISTINCT P.CODCLI),
     SUM(DECODE(P.CONDVENDA,5,0,6,0,11,0,12,0, P.VLATEND - NVL(P.VLOUTRASDESP,0) - NVL(P.VLFRETE,0)
         - NVL((SELECT SUM(NVL(I.ST,0)*NVL(I.QT,0)) FROM PCPEDI I WHERE I.NUMPED = P.NUMPED AND NVL(I.BONIFIC,'N')='N'),0)))
  FROM PCPEDC P, PCCLIENT C, PCCIDADE D
 WHERE P.CODCLI = C.CODCLI AND C.CODCIDADE = D.CODCIDADE AND D.UF = 'ES'
   AND P.POSICAO IN ('L','M','B','P','F','C') AND P.DTCANCEL IS NULL
   AND P.CONDVENDA NOT IN (4, 8, 10, 13, 20, 98, 99)
   AND P.DATA BETWEEN ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -7) AND SYSDATE"""))
con.rollback()
