param([ValidateSet('local','lan','public')][string]$Mode,[string]$Cloudflared='cloudflared')
$ErrorActionPreference='Stop'
$projectRoot=$PSScriptRoot
$node=(Get-Command node -ErrorAction Stop).Source
if($Mode){ & $node (Join-Path $projectRoot 'scripts/room-setup.mjs') --mode $Mode }else{ & $node (Join-Path $projectRoot 'scripts/room-setup.mjs') }
if($LASTEXITCODE -ne 0){throw 'Room setup failed'}
$config=Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'room.config.json') | ConvertFrom-Json
$port=if($config.port){[int]$config.port}else{3102}
$state=Join-Path $projectRoot 'state/room-public'
$listener=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if($listener){throw 'Room gateway already running. Stop it with stop-room-public.ps1 before changing mode or restarting.'}
$gateway=Start-Process $node -ArgumentList ('"'+(Join-Path $projectRoot 'src/room-public-server.mjs')+'"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'gateway-out.log') -RedirectStandardError (Join-Path $state 'gateway-error.log') -PassThru
[IO.File]::WriteAllText((Join-Path $state 'gateway-pid'),[string]$gateway.Id)
if($config.mode -ne 'public'){
 $hostLabel=if($config.mode -eq 'lan'){'<YOUR-LAN-IP>'}else{'127.0.0.1'}
 Write-Output ('Room: http://'+$hostLabel+':'+$port+'/room')
 exit
}
$binary=(Get-Command $Cloudflared -ErrorAction Stop).Source
$pidFile=Join-Path $state 'tunnel-pid'
if(Test-Path -LiteralPath $pidFile){
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int](Get-Content -LiteralPath $pidFile)) -ErrorAction SilentlyContinue
 if($process -and $process.CommandLine -match 'cloudflared.*127\.0\.0\.1:'){Write-Output 'Room tunnel already running';exit}
}
$tunnel=Start-Process $binary -ArgumentList @('tunnel','--url',('http://127.0.0.1:'+$port),'--protocol','http2','--no-autoupdate') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'tunnel-out.log') -RedirectStandardError (Join-Path $state 'tunnel-error.log') -PassThru
[IO.File]::WriteAllText($pidFile,[string]$tunnel.Id)
Write-Output 'HTTPS URL: state/room-public/tunnel-error.log. New tunnels may get new URLs.'
