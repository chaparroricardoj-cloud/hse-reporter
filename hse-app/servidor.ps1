# HSE Reporter — Servidor HTTP local en PowerShell puro
# No requiere instalar Python ni Node.js
# Ejecutar: click derecho → "Ejecutar con PowerShell"
# O desde terminal: powershell -ExecutionPolicy Bypass -File servidor.ps1

$port    = 5000
$root    = $PSScriptRoot
$prefix  = "http://localhost:$port/"

# Carpeta de datos para persistir reportes
$dataDir  = Join-Path $root "data"
$dataFile = Join-Path $dataDir "reportes.json"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
if (-not (Test-Path $dataFile)) { "[]" | Set-Content $dataFile -Encoding UTF8 }

function Get-MimeType($ext) {
    switch ($ext) {
        ".html" { "text/html; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".png"  { "image/png" }
        ".jpg"  { "image/jpeg" }
        ".ico"  { "image/x-icon" }
        default { "application/octet-stream" }
    }
}

function Write-Response($ctx, $status, $body, $mime = "application/json; charset=utf-8") {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $ctx.Response.StatusCode   = $status
    $ctx.Response.ContentType  = $mime
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
    $ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host "   HSE Reporter - Servidor Local" -ForegroundColor Green
Write-Host "  ==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  App de reporte: " -NoNewline; Write-Host "http://localhost:$port/" -ForegroundColor Cyan
Write-Host "  Panel Admin:    " -NoNewline; Write-Host "http://localhost:$port/admin" -ForegroundColor Cyan
Write-Host "  API:            " -NoNewline; Write-Host "http://localhost:$port/api/reportes" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Presiona Ctrl+C para detener." -ForegroundColor Yellow
Write-Host ""

# Abrir navegador automáticamente
Start-Process "msedge" "http://localhost:$port/"

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $url = $req.Url.AbsolutePath

        # ── CORS preflight ──
        if ($req.HttpMethod -eq "OPTIONS") {
            Write-Response $ctx 200 ""
            continue
        }

        # ── API: GET /api/reportes ──
        if ($url -eq "/api/reportes" -and $req.HttpMethod -eq "GET") {
            $json = Get-Content $dataFile -Raw -Encoding UTF8
            $body = "{`"reportes`":$json,`"total`":$((ConvertFrom-Json $json).Count)}"
            Write-Response $ctx 200 $body
            continue
        }

        # ── API: POST /api/reportes ──
        if ($url -eq "/api/reportes" -and $req.HttpMethod -eq "POST") {
            $reader  = New-Object System.IO.StreamReader($req.InputStream)
            $payload = $reader.ReadToEnd()
            $reader.Close()

            $reportes = ConvertFrom-Json (Get-Content $dataFile -Raw -Encoding UTF8)
            $nuevo    = ConvertFrom-Json $payload

            # Agregar si no existe
            $exists = $reportes | Where-Object { $_.id -eq $nuevo.id }
            if (-not $exists) {
                $nuevo | Add-Member -NotePropertyName "estado"      -NotePropertyValue "pendiente" -Force
                $nuevo | Add-Member -NotePropertyName "received_at" -NotePropertyValue (Get-Date -Format "o") -Force
                $lista = @($reportes) + $nuevo
                $lista | ConvertTo-Json -Depth 10 | Set-Content $dataFile -Encoding UTF8
                Write-Host "  [+] Reporte guardado: $($nuevo.id) | $($nuevo.area) | $($nuevo.riesgo)" -ForegroundColor Green
            }
            Write-Response $ctx 201 "{`"status`":`"ok`",`"id`":`"$($nuevo.id)`"}"
            continue
        }

        # ── API: PUT /api/reportes/<id> ──
        if ($url -match "^/api/reportes/(.+)$" -and $req.HttpMethod -eq "PUT") {
            $id     = $Matches[1]
            $reader = New-Object System.IO.StreamReader($req.InputStream)
            $upd    = ConvertFrom-Json ($reader.ReadToEnd())
            $reader.Close()

            $reportes = @(ConvertFrom-Json (Get-Content $dataFile -Raw -Encoding UTF8))
            for ($i = 0; $i -lt $reportes.Count; $i++) {
                if ($reportes[$i].id -eq $id) {
                    $upd.PSObject.Properties | ForEach-Object {
                        $reportes[$i] | Add-Member -NotePropertyName $_.Name -NotePropertyValue $_.Value -Force
                    }
                    break
                }
            }
            $reportes | ConvertTo-Json -Depth 10 | Set-Content $dataFile -Encoding UTF8
            Write-Host "  [~] Reporte actualizado: $id" -ForegroundColor Yellow
            Write-Response $ctx 200 "{`"status`":`"ok`"}"
            continue
        }

        # ── API: GET /api/health ──
        if ($url -eq "/api/health") {
            Write-Response $ctx 200 "{`"status`":`"ok`",`"timestamp`":`"$(Get-Date -Format 'o')`"}"
            continue
        }

        # ── ARCHIVOS ESTÁTICOS ──
        # Rutas especiales
        if ($url -eq "/" -or $url -eq "") {
            $filePath = Join-Path $root "index.html"
        } elseif ($url -eq "/admin" -or $url -eq "/admin/") {
            $filePath = Join-Path $root "admin.html"
        } else {
            # Limpiar la URL y construir path
            $cleanUrl = $url.TrimStart("/")
            $filePath = Join-Path $root $cleanUrl
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext   = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime  = Get-MimeType $ext
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ctx.Response.StatusCode   = 200
            $ctx.Response.ContentType  = $mime
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $ctx.Response.OutputStream.Close()
        } else {
            Write-Response $ctx 404 "{`"error`":`"Not found: $url`"}"
        }

    } catch [System.Net.HttpListenerException] {
        break
    } catch {
        Write-Host "  Error: $_" -ForegroundColor Red
        try { Write-Response $ctx 500 "{`"error`":`"Internal error`"}" } catch {}
    }
}

$listener.Stop()
