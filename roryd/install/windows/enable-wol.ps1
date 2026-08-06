<#
    Prepare Windows for Wake-on-LAN so "Alexa, turn on Node 001" can work.

    This script does the WINDOWS half. The BIOS half is manual and is printed
    at the end, because setting names differ by vendor and cannot be scripted.

    The single most common reason WoL "works from sleep but not from shutdown"
    is Windows Fast Startup: a normal shutdown is actually a hibernate, and the
    network adapter is not armed. This script disables Fast Startup.

    Run as Administrator:
        powershell -ExecutionPolicy Bypass -File enable-wol.ps1
#>

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this in an Administrator PowerShell."
}

# 1. Disable Fast Startup (HiberbootEnabled = 0). The classic silent killer.
Write-Host "Disabling Fast Startup..."
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power" `
    -Name HiberbootEnabled -Value 0 -Type DWord

# 2. Arm every wired adapter: allow it to wake the machine, magic packet only.
Write-Host "Arming wired network adapters for magic-packet wake..."
$adapters = Get-NetAdapter -Physical | Where-Object {
    $_.MediaType -eq "802.3" -and $_.Status -ne "Disabled"
}
if (-not $adapters) { Write-Warning "No wired adapters found — WoL needs Ethernet, not Wi-Fi." }
foreach ($a in $adapters) {
    Write-Host "  $($a.Name)  [$($a.MacAddress)]"
    try {
        Enable-NetAdapterPowerManagement -Name $a.Name -WakeOnMagicPacket -ErrorAction Stop
    } catch {
        # Older drivers expose this only through the advanced-property route.
        try { Set-NetAdapterAdvancedProperty -Name $a.Name -DisplayName "Wake on Magic Packet" -DisplayValue "Enabled" -ErrorAction Stop } catch {}
    }
    powercfg /deviceenablewake "$($a.InterfaceDescription)" 2>$null
}

Write-Host ""
Write-Host "Windows side done. Note each adapter's MAC above — you send the"
Write-Host "magic packet TO that address."
Write-Host ""
Write-Host "=========================  BIOS / UEFI  ========================="
Write-Host "Reboot into UEFI and set (names vary by board — Ryzen 7 7700X"
Write-Host "boards usually under Advanced > APM or Power):"
Write-Host "  * ErP Ready / EuP 2013            -> DISABLED   (else NIC loses standby power)"
Write-Host "  * Deep Sleep / Deep Idle          -> DISABLED"
Write-Host "  * Power On By PCIe / Onboard LAN  -> ENABLED"
Write-Host "  * PME Event Wake Up               -> ENABLED"
Write-Host ""
Write-Host "Waking from FULL SHUTDOWN (S5) is supported on most desktop boards"
Write-Host "once the above are set. Waking from SLEEP (S3) is the most reliable."
Write-Host "Wake-on-WIRELESS (Wi-Fi) is rare and unreliable on desktops — use"
Write-Host "Ethernet for Node 001."
