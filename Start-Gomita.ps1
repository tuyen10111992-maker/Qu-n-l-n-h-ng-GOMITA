$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8900
$url = "http://localhost:$port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($url)
$listener.Start()
Start-Process $url
Write-Host "Gomita Flow đang chạy tại $url - nhấn Ctrl+C để dừng."
$types = @{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json'}
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext(); $path = $ctx.Request.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    if (-not $file.StartsWith([IO.Path]::GetFullPath($root)) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { $ctx.Response.StatusCode=404; $bytes=[Text.Encoding]::UTF8.GetBytes('404') }
    else { $ext=[IO.Path]::GetExtension($file); if($types.ContainsKey($ext)){$ctx.Response.ContentType=$types[$ext]}; $bytes=[IO.File]::ReadAllBytes($file) }
    $ctx.Response.ContentLength64=$bytes.Length; $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length); $ctx.Response.Close()
  }
} finally { $listener.Stop() }
