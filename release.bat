@echo off
setlocal
title QubiQ Server Launcher - generar release

rem El proyecto es la carpeta donde esta este .bat, sin importar desde donde lo abras.
cd /d "%~dp0"

rem Ver dev.bat: la variable que deja VS Code rompe Electron.
set "ELECTRON_RUN_AS_NODE="

where node >nul 2>nul
if not "%errorlevel%"=="0" goto sin_node

if exist "node_modules\" goto tiene_deps
echo Instalando dependencias...
call npm install
if not "%errorlevel%"=="0" goto error

:tiene_deps
rem Todo lo que se escriba detras (una version, --e2e, --no-e2e) pasa al script.
node scripts\release.mjs %*
if not "%errorlevel%"=="0" goto error

echo.
pause
exit /b 0

:sin_node
echo.
echo No encuentro Node.js en este equipo.
echo Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
echo.
pause
exit /b 1

:error
echo.
echo ------------------------------------------------------
echo No se ha generado la release. El motivo esta arriba.
echo ------------------------------------------------------
echo.
pause
exit /b 1
