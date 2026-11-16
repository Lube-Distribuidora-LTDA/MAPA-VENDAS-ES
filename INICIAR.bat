@echo off
rem Abre a PREVIA do Mapa de Vendas ES nesta maquina (http://localhost:3115). So esta maquina acessa.
rem A tela le o banco sozinha (venda do 146, faturado do Central Comercial e o cadastro do Agente Lube): sempre ate hoje.
cd /d "%~dp0web"
if not exist node_modules call npm install --no-audit --no-fund
start "" http://localhost:3115
node servidor_local.js
pause
