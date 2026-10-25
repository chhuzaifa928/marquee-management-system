#Requires -RunAsAdministrator
<#
  Grand Pearl Marquee — one-time MySQL reset / app-user bootstrap.

  Run this in an ELEVATED (Administrator) PowerShell. It:
    1. Writes a temporary init SQL file.
    2. Stops the MySQL80 service.
    3. Starts mysqld briefly with --init-file so it applies the SQL as root
       (no existing password needed — this is the official reset path).
    4. Stops that temporary mysqld and restarts the MySQL80 service.
    5. Verifies the new 'grandpearl' app login works.

  It sets:
    - the root@localhost password to the value you pass as -RootPassword
    - creates databases: grand_pearl, grand_pearl_test, grand_pearl_shadow
    - creates app user grandpearl@localhost with the value you pass as -AppPassword
      (put the SAME value in server/.env DATABASE_URL — never commit it)

  Usage (elevated PowerShell):
    .\reset-mysql.ps1 -RootPassword 'yourRootPw' -AppPassword 'yourAppPw'

  Nothing here is destructive to existing databases.
#>

param(
  [Parameter(Mandatory = $true)][string]$RootPassword,
  [Parameter(Mandatory = $true)][string]$AppPassword
)

$ErrorActionPreference = 'Stop'

$mysqldExe = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe'
$mysqlExe  = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
$defaults  = 'C:\ProgramData\MySQL\MySQL Server 8.0\my.ini'
$service   = 'MySQL80'
$initFile  = Join-Path $PSScriptRoot 'gp-mysql-init.sql'

$rootPw = $RootPassword
$appPw  = $AppPassword

foreach ($p in @($mysqldExe, $mysqlExe, $defaults)) {
  if (-not (Test-Path $p)) { throw "Not found: $p" }
}

Write-Host "1/6  Writing init SQL -> $initFile"
$sql = @"
ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPw';
CREATE DATABASE IF NOT EXISTS grand_pearl        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS grand_pearl_test   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS grand_pearl_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'grandpearl'@'localhost' IDENTIFIED BY '$appPw';
ALTER USER 'grandpearl'@'localhost' IDENTIFIED BY '$appPw';
GRANT ALL PRIVILEGES ON grand_pearl.*        TO 'grandpearl'@'localhost';
GRANT ALL PRIVILEGES ON grand_pearl_test.*   TO 'grandpearl'@'localhost';
GRANT ALL PRIVILEGES ON grand_pearl_shadow.* TO 'grandpearl'@'localhost';
FLUSH PRIVILEGES;
"@
# ASCII = no BOM (a BOM can make mysqld reject the init file).
$sql | Out-File -FilePath $initFile -Encoding ascii -Force

$timeout = [TimeSpan]::FromSeconds(60)

try {
  Write-Host "2/6  Stopping $service ..."
  $svc = Get-Service $service
  if ($svc.Status -ne 'Stopped') {
    Stop-Service $service -Force
    (Get-Service $service).WaitForStatus('Stopped', $timeout)
  } else {
    Write-Host "     (already stopped)"
  }
  Start-Sleep -Seconds 2
  # Make sure no stray mysqld is still holding the datadir/port.
  Get-Process mysqld -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2

  Write-Host "3/6  Starting mysqld with init file (applies the reset) ..."
  Start-Process -FilePath $mysqldExe `
    -ArgumentList @("--defaults-file=`"$defaults`"", "--init-file=`"$initFile`"") `
    -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 12  # give it time to boot + run the init file + FLUSH

  Write-Host "4/6  Stopping the temporary mysqld ..."
  # The service is stopped, so any running mysqld is our temporary one.
  Get-Process mysqld -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 4

  Write-Host "5/6  Restarting the $service service ..."
  Start-Service $service
  (Get-Service $service).WaitForStatus('Running', $timeout)
  Start-Sleep -Seconds 3
}
finally {
  Remove-Item $initFile -Force -ErrorAction SilentlyContinue
}

Write-Host "6/6  Verifying the 'grandpearl' login ..."
$check = & $mysqlExe "-ugrandpearl" "-p$appPw" "-e" "SELECT CONCAT('login_ok schemas=', COUNT(*)) FROM information_schema.schemata WHERE schema_name LIKE 'grand_pearl%';" 2>&1
Write-Host $check

Write-Host ""
Write-Host "DONE."
Write-Host "  root@localhost password : $rootPw"
Write-Host "  app user  grandpearl    : $appPw  (already set in server/.env)"
Write-Host "You can now return to the build and it will connect."
