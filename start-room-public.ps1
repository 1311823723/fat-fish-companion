param([string]$Cloudflared='cloudflared')
& (Join-Path $PSScriptRoot 'start-room.ps1') -Mode public -Cloudflared $Cloudflared
