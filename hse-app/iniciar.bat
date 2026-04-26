@echo off
title HSE Reporter
color 0A

echo.
echo  ==========================================
echo   HSE Reporter - Central Termica Diesel
echo  ==========================================
echo.

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python no esta instalado.
    echo  Descargalo desde https://www.python.org/downloads/
    echo  Instalar con la opcion "Add Python to PATH" marcada.
    pause
    exit /b 1
)

:: Instalar dependencias si faltan
echo  Verificando dependencias...
pip show flask >nul 2>&1
if errorlevel 1 (
    echo  Instalando dependencias...
    pip install flask flask-cors python-dotenv pyodbc
    echo.
)

:: Crear .env si no existe
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
    echo  IMPORTANTE: Edita el archivo backend\.env con tus datos de conexion.
    echo  Abriendo el archivo para editar...
    notepad "backend\.env"
    echo.
)

echo  Iniciando servidor...
echo.
echo  App de reporte: http://localhost:5000
echo  Panel Admin:    http://localhost:5000/admin
echo.
echo  Presiona Ctrl+C para detener.
echo.

start "" msedge "http://localhost:5000"
cd backend
python app.py

pause
