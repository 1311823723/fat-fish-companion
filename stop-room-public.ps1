$ErrorActionPreference='Stop'
$state=Join-Path $PSScriptRoot 'state/room-public'
foreach($kind in @('tunnel','gateway')){
 $file=Join-Path $state ($kind+'-pid');if(!(Test-Path -LiteralPath $file)){continue}
 $processId=[int](Get-Content -LiteralPath $file)
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$processId) -ErrorAction SilentlyContinue
 if(!$process){continue}
 $pattern=if($kind -eq 'tunnel'){'cloudflared.*127\.0\.0\.1:'}else{'room-public-server\.mjs'}
 if($process.CommandLine -notmatch $pattern){throw 'Saved process ID belongs to another service'}
 Invoke-CimMethod -InputObject $process -MethodName Terminate -Arguments @{Reason=0} | Out-Null
}
Write-Output 'Room gateway and tunnel stopped. QQ bot services remain running.'
