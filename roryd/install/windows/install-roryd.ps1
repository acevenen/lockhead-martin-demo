<#
    Install the RORY daemon as a per-user autostart task on Windows 11.

    Design choices (and why):

    * Scheduled Task, not a Windows Service. A service runs in Session 0, which
      has no access to the microphone or the interactive desktop, so a
      voice assistant cannot run as a service. A task that runs "at log on" in
      the user's own session can reach the mic and can open the HUD in the
      user's browser. It also re-fires on workstation unlock, so it comes back
      after sleep/wake.
    * pythonw.exe, not python.exe, so there is no console window flashing on
      screen. Output still goes to the daemon log file.
    * RestartCount so a crash is recovered automatically.

    Run in an ordinary (non-admin) PowerShell:
        powershell -ExecutionPolicy Bypass -File install-roryd.ps1

    Uninstall:  Unregister-ScheduledTask -TaskName "RORY Daemon" -Confirm:$false
#>

$ErrorActionPreference = "Stop"

# Repo root is three levels up from this script (install/windows/..).
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$RorydDir = Join-Path $RepoRoot "roryd"

# Prefer pythonw so no console window appears.
$PythonW = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $PythonW) {
    Write-Warning "pythonw.exe not found on PATH; falling back to python.exe (a console window will appear). Install Python from python.org and re-run."
    $PythonW = (Get-Command python.exe).Source
}

Write-Host "Repo root : $RepoRoot"
Write-Host "Python    : $PythonW"

$Action = New-ScheduledTaskAction -Execute $PythonW `
    -Argument "-m roryd.daemon" -WorkingDirectory $RorydDir

# At log on, and again whenever the workstation is unlocked (covers wake).
$TriggerLogon = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

$Principal = New-ScheduledTaskPrincipal -UserId $env:UserName -LogonType Interactive

Register-ScheduledTask -TaskName "RORY Daemon" `
    -Action $Action -Trigger $TriggerLogon -Settings $Settings -Principal $Principal `
    -Description "CentLabs RORY always-on voice daemon" -Force | Out-Null

# RORY_HOME lets the daemon find the repo regardless of the working dir.
[Environment]::SetEnvironmentVariable("RORY_HOME", $RepoRoot, "User")

Write-Host ""
Write-Host "Installed. The daemon starts at your next log on."
Write-Host "Start it now with:  Start-ScheduledTask -TaskName 'RORY Daemon'"
Write-Host ""
Write-Host "IMPORTANT — microphone permission:"
Write-Host "  Settings > Privacy & security > Microphone must be ON, and"
Write-Host "  'Let desktop apps access your microphone' must also be ON,"
Write-Host "  or the wake word will never fire."
