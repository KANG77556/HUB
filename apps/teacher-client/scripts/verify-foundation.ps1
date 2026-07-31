[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE"
    }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactsDirectory = Join-Path $projectRoot "artifacts"
$vitestOutput = Join-Path $artifactsDirectory "foundation-vitest.json"
$verificationOutput = Join-Path $artifactsDirectory "teacher-client-foundation-verification.json"

$scenarioDefinitions = @(
    [ordered]@{ name = "foundation:first-login"; code = "FIRST_LOGIN" },
    [ordered]@{ name = "foundation:auto-login"; code = "AUTO_LOGIN" },
    [ordered]@{ name = "foundation:single-refresh"; code = "SINGLE_REFRESH" },
    [ordered]@{ name = "foundation:permission-union"; code = "PERMISSION_UNION" },
    [ordered]@{ name = "foundation:offline-cache"; code = "OFFLINE_CACHE" },
    [ordered]@{ name = "foundation:reconnection-summary"; code = "RECONNECTION_SUMMARY" },
    [ordered]@{ name = "foundation:certificate-block"; code = "CERTIFICATE_BLOCK" },
    [ordered]@{ name = "foundation:logout-cleanup"; code = "LOGOUT_CLEANUP" }
)

Push-Location $projectRoot
try {
    New-Item -ItemType Directory -Path $artifactsDirectory -Force | Out-Null

    Invoke-CheckedCommand "npm ci" { npm ci }
    Invoke-CheckedCommand "native rebuild" { npm run rebuild:native }
    Invoke-CheckedCommand "teacher client verification" { npm run verify }
    Invoke-CheckedCommand "foundation harness" {
        npm test -- src/main/integration/foundationHarness.test.ts --reporter=json --outputFile=$vitestOutput
    }

    $rawVitest = Get-Content -Path $vitestOutput -Raw
    if ($rawVitest -match '(?i)"(password|access_token|refresh_token)"\s*:') {
        throw "Foundation test output contains a forbidden sensitive field"
    }

    $vitest = $rawVitest | ConvertFrom-Json
    $assertions = @(
        $vitest.testResults | ForEach-Object {
            @($_.assertionResults)
        }
    )

    $scenarioResults = @(
        foreach ($definition in $scenarioDefinitions) {
            $matches = @(
                $assertions | Where-Object {
                    $_.title -eq $definition.name -or $_.fullName -eq $definition.name
                }
            )

            $passed = $false
            $diagnosticCode = "NOT_REPORTED"
            if ($matches.Count -gt 1) {
                $diagnosticCode = "DUPLICATE_RESULT"
            }
            elseif ($matches.Count -eq 1) {
                $status = [string]$matches[0].status
                if ($status -eq "passed") {
                    $passed = $true
                    $diagnosticCode = "OK"
                }
                elseif ($status -eq "failed") {
                    $diagnosticCode = "TEST_FAILED"
                }
                elseif ($status -eq "pending" -or $status -eq "skipped") {
                    $diagnosticCode = "TEST_SKIPPED"
                }
                else {
                    $diagnosticCode = "UNKNOWN_STATUS"
                }
            }

            [ordered]@{
                name = $definition.name
                scenario_code = $definition.code
                passed = $passed
                diagnostic_code = $diagnosticCode
            }
        }
    )

    $overallPassed = @($scenarioResults | Where-Object { -not $_.passed }).Count -eq 0
    $verification = [ordered]@{
        schema_version = 1
        generated_at_utc = [DateTime]::UtcNow.ToString("o")
        overall_passed = $overallPassed
        scenarios = $scenarioResults
    }
    $verificationJson = $verification | ConvertTo-Json -Depth 8

    if ($verificationJson -match '(?i)"(password|access_token|refresh_token)"\s*:') {
        throw "Foundation verification output contains a forbidden sensitive field"
    }

    Set-Content -Path $verificationOutput -Value $verificationJson -Encoding utf8
    Write-Output $verificationOutput

    if (-not $overallPassed) {
        throw "One or more teacher-client foundation scenarios failed"
    }
}
finally {
    Pop-Location
}
