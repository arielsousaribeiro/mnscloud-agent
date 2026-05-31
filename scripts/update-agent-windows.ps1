param(
  [string]$ApiBase = $env:MNSCLOUD_API_BASE,
  [string]$Name = $env:AGENT_NAME,
  [string]$Ref = $env:MNSCLOUD_AGENT_REF
)

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $PSScriptRoot

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
  throw "Run this updater from an elevated PowerShell session."
}

if (Test-Path (Join-Path $RepoDir ".git")) {
  Push-Location $RepoDir
  try {
    if ($Ref) {
      git fetch --all --tags --prune
      git -c advice.detachedHead=false checkout $Ref
    } else {
      git pull --ff-only
    }
  } finally {
    Pop-Location
  }
}

& "$PSScriptRoot\install-agent-windows.ps1" -ApiBase $ApiBase -Name $Name
Restart-Service -Name "MNSCloudAgent" -Force
Get-Service -Name "MNSCloudAgent"
