param(
  [Parameter(Mandatory=$true)][string]$Root
)
$launcher = Join-Path $Root 'app\src\main\java\com\seongho\fold8launcher\ui\LauncherRoot.kt'
$icon = Join-Path $Root 'app\src\main\java\com\seongho\fold8launcher\ui\components\CharacterAppIcon.kt'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$s = [IO.File]::ReadAllText($launcher)
$s = [regex]::Replace($s, '(?m)^import androidx\.compose\.foundation\.layout\.weight\r?\n', '')
$s = $s.Replace('onAddToHome = { viewModel.addApp(mode, it) }', 'onAddToHome = { viewModel.addApp(mode, it.ref) }')
[IO.File]::WriteAllText($launcher, $s, $utf8)

$s = [IO.File]::ReadAllText($icon)
$s = $s.Replace('import androidx.compose.foundation.layout.matchParentSize', 'import androidx.compose.foundation.layout.fillMaxSize')
$s = $s.Replace('Canvas(Modifier.matchParentSize())', 'Canvas(Modifier.fillMaxSize())')
[IO.File]::WriteAllText($icon, $s, $utf8)

if (Select-String -LiteralPath $launcher -SimpleMatch 'import androidx.compose.foundation.layout.weight' -Quiet) { throw 'weight import regression remains' }
if (-not (Select-String -LiteralPath $launcher -SimpleMatch 'onAddToHome = { viewModel.addApp(mode, it.ref) }' -Quiet)) { throw 'AppEntry to AppRef fix missing' }
if (Select-String -LiteralPath $icon -SimpleMatch 'matchParentSize' -Quiet) { throw 'matchParentSize regression remains' }
if (-not (Select-String -LiteralPath $icon -SimpleMatch 'Canvas(Modifier.fillMaxSize())' -Quiet)) { throw 'fillMaxSize fix missing' }
Write-Host 'COMPOSE_COMPILE_FIXES_OK'
