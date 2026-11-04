$ErrorActionPreference='Stop'
$gameRoot=Split-Path -Parent $PSScriptRoot
try { $health=Invoke-RestMethod 'http://127.0.0.1:3103/health' -TimeoutSec 3; if($health.service -eq 'fatfish-game'){exit 0} } catch {}
$nodeExe=(Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path (Join-Path $gameRoot 'state') | Out-Null
$process=Start-Process $nodeExe -ArgumentList 'src/server.mjs' -WorkingDirectory $gameRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $gameRoot 'state/core.stdout.log') -RedirectStandardError (Join-Path $gameRoot 'state/core.stderr.log')
[IO.File]::WriteAllText((Join-Path $gameRoot 'state/core.pid'),[string]$process.Id)
for($i=0;$i -lt 15;$i++){Start-Sleep -Seconds 1;try{$health=Invoke-RestMethod 'http://127.0.0.1:3103/health' -TimeoutSec 2;if($health.service -eq 'fatfish-game'){exit 0}}catch{}}
throw '小屋核心启动失败，请运行 npm run doctor'
