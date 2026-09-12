@echo off
setlocal
title QubiQ Server Launcher - desarrollo

rem El proyecto es la carpeta donde esta este .bat, sin importar desde donde lo abras.
cd /d "%~dp0"

rem VS Code deja esta variable puesta al abrir una terminal. Con ella, require('electron')
rem devuelve una ruta en vez del modulo y la app se cierra nada mas arrancar.
set "ELECTRON_RUN_AS_NODE="

rem Nada de bloques entre parentesis aqui abajo: npm devuelve codigos negativos (-4058 y
rem similares) y dentro de un bloque la comprobacion del codigo de salida no es fiable.

where node >nul 2>nul
if not "%errorlevel%"=="0" goto sin_node

if exist "node_modules\" goto tiene_deps
echo Primera vez aqui: instalando dependencias. Tarda un par de minutos.
echo.
call npm install
if not "%errorlevel%"=="0" goto error

:tiene_deps
if exist "node_modules\electron\dist\electron.exe" goto arrancar
echo Falta el binario de Electron. Descargandolo...
echo.
call node node_modules\electron\install.js
if not "%errorlevel%"=="0" goto error

:arrancar
echo Arrancando QubiQ Server Launcher en modo desarrollo.
echo Deja esta ventana abierta: aqui salen los errores y aqui vive la recarga en caliente.
echo Para pararlo, cierra la ventana o pulsa Ctrl+C.
echo.
call npm run dev
if not "%errorlevel%"=="0" goto error
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
echo Algo ha fallado. El mensaje de arriba dice el motivo.
echo ------------------------------------------------------
echo.
pause
exit /b 1
