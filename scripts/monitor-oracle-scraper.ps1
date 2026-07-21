param(
  [string]$ServerIp = "193.122.242.178",
  [string]$ServerUser = "ubuntu",
  [string]$SshKey = "$PSScriptRoot\..\keys\ssh-key-2026-06-25.key",
  [int]$TimeoutMinutes = 45,
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"
$resolvedKey = (Resolve-Path -LiteralPath $SshKey).Path
$target = "$ServerUser@$ServerIp"

if ($StartNow) {
  Write-Host "Iniciando uma execução imediata do oracle-scraper..." -ForegroundColor Yellow
  & ssh -i $resolvedKey -o BatchMode=yes $target "pm2 restart oracle-scraper"
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível reiniciar o oracle-scraper na VPS." }
  Start-Sleep -Seconds 2
}

Write-Host "Monitorando $target. Aguarde a linha final do ciclo..." -ForegroundColor Cyan
Write-Host "Para sair sem interromper o scraper, pressione Ctrl+C." -ForegroundColor DarkGray

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = "ssh.exe"
$psi.Arguments = "-i `"$resolvedKey`" -o BatchMode=yes $target `"pm2 logs oracle-scraper --raw --lines 0`""
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $psi
$startedAt = Get-Date
$lastCycle = $null

$null = $process.Start()
$process.BeginOutputReadLine()
$process.BeginErrorReadLine()

$handler = {
  param($sender, $event)
  if ([string]::IsNullOrWhiteSpace($event.Data)) { return }
  $line = $event.Data
  $color = if ($line -match "\[Oracle Discovery-Only V5\] ciclo=") { "Green" } else { "Gray" }
  Write-Host $line -ForegroundColor $color
  if ($line -match "\[Oracle Discovery-Only V5\] ciclo=([^ ]+) duração=.*estado=([^ ]+)") {
    $script:lastCycle = $Matches[1]
    Write-Host "`nCICLO FINALIZADO: $($Matches[1]) | estado=$($Matches[2])" -ForegroundColor Green
    if (-not $process.HasExited) { $process.Kill() }
  }
}

$process.add_OutputDataReceived($handler)
$process.add_ErrorDataReceived($handler)

try {
  while (-not $process.HasExited) {
    if (((Get-Date) - $startedAt).TotalMinutes -ge $TimeoutMinutes) {
      throw "Tempo limite de $TimeoutMinutes minutos atingido. O processo remoto continua rodando; apenas o monitor será encerrado."
    }
    Start-Sleep -Seconds 1
  }
  $process.WaitForExit()
} finally {
  if (-not $process.HasExited) { $process.Kill() }
  $process.Dispose()
}

if (-not $lastCycle) {
  Write-Host "O monitor foi encerrado sem detectar a linha final do ciclo." -ForegroundColor Yellow
  exit 1
}

Write-Host "`nResumo: consulte acima as linhas Shopee, Mercado Livre, Amazon e a duração total." -ForegroundColor Cyan
