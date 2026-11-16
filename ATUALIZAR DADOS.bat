@echo off
rem RESERVA: a tela ja le o banco sozinha. Este .bat so refaz a copia guardada (web\dados\mapa.json), que a tela usa
rem quando o banco nao responde. Le o banco e o cadastro do WinThor, so leitura, ~15 s.
cd /d "%~dp0etl"
python -I -X utf8 extrair.py
pause
