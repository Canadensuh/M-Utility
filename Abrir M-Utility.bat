@echo off
REM ==========================================================
REM  Abre o M-Utility no Google Chrome com IMPRESSAO SILENCIOSA:
REM  o ticket vai direto para a impressora, sem a janela de imprimir.
REM
REM  Antes, uma vez so:
REM   1. Deixe a "ZDesigner ZT410" como impressora PADRAO do Windows.
REM   2. Nas Preferencias de impressao dela, escolha a etiqueta
REM      que esta na maquina (ex.: 100 x 50 mm).
REM   3. No M-Utility (Impressora Zebra), use "Janela de impressao"
REM      ou "Automatico".
REM
REM  Abra o M-Utility SEMPRE por este atalho: ele usa um perfil
REM  proprio do Chrome, e os dados (volumes, contas) ficam nele.
REM ==========================================================
setlocal
set "PAGINA=%~dp0frontend\index.html"
set "PAGINA=%PAGINA:\=/%"
set "PERFIL=%LOCALAPPDATA%\M-Utility\Chrome"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Nao encontrei o Google Chrome neste computador.
  pause
  exit /b 1
)

start "" "%CHROME%" --user-data-dir="%PERFIL%" --kiosk-printing --app="file:///%PAGINA%"
