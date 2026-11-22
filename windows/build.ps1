# SPDX-FileCopyrightText: 2026 Optimey CommV
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Builds VIES-Belgie.exe with the C# compiler that ships with the .NET Framework 4.x,
# which is present on every Windows 10 and 11 machine. No SDK or Visual Studio needed.
#
#   powershell -ExecutionPolicy Bypass -File windows\build.ps1

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
    $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path $csc)) { throw 'csc.exe of the .NET Framework 4.x not found.' }

$out = Join-Path $here 'VIES-Belgie.exe'
& $csc /nologo /target:winexe /optimize+ /codepage:65001 `
    "/win32icon:$(Join-Path $here 'app.ico')" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    "/out:$out" (Join-Path $here 'ViesBelgie.cs')
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }
Write-Host "Built $out"
