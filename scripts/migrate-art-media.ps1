param(
  [string]$Manifest = 'G:\literae-art\workdir\migration\correspondances.txt',
  [string]$Output = 'G:\literae-art\workdir\deepzoom',
  [string]$Credentials = 'G:\literae-art\login.txt',
  [ValidateRange(0,100000)][int]$Limit = 0,
  [switch]$PlanOnly,
  [switch]$Audit
)
$ErrorActionPreference = 'Stop'
$data = @{}
foreach ($line in Get-Content -LiteralPath $Credentials) {
  if ($line -cmatch '^\s*(token|S3_KEY|S3_SECRET|STORAGE_S3_ENDPOINT|STORAGE_S3_REGION)\s*[:=]\s*(.+?)\s*$') {
    $data[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
  }
}
$values = @{
  ART_DIRECTUS_TOKEN = $data['token']
  ART_S3_ENDPOINT = $data['STORAGE_S3_ENDPOINT']
  ART_S3_REGION = $data['STORAGE_S3_REGION']
  ART_S3_BUCKET = 'literae-art-deepzoom'
  ART_S3_KEY = $data['S3_KEY']
  ART_S3_SECRET = $data['S3_SECRET']
  ART_VIPS = 'G:\literae-art\tools\libvips-windows-x64-8.18\bin\vips.exe'
}
foreach ($name in $values.Keys) { if (!$values[$name]) { throw "Variable manquante : $name" } }
New-Item -ItemType Directory -Force -Path $Output | Out-Null
$lock = [IO.File]::Open((Join-Path (Resolve-Path -LiteralPath $Output).Path 'migration.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$previous = @{}
$temporaryManifest = $null
try {
  if ([IO.Path]::GetExtension($Manifest) -in @('.txt', '.tsv')) {
    $paths = [ordered]@{}
    foreach ($row in Import-Csv -LiteralPath $Manifest -Delimiter ([char]9) -Encoding utf8) {
      if ($row.statut_directus -ne 'published' -or $row.'état' -notin @('confirmé', 'validé', 'déjà lié')) { continue }
      if (!$row.uuid -or !$row.fichier -or $paths.Contains($row.uuid)) { throw 'UUID ou fichier manquant ou en double dans les correspondances.' }
      $paths[$row.uuid] = $row.fichier
    }
    if (!$paths.Count) { throw 'Aucune correspondance publiée et validée dans le fichier.' }
    $temporaryManifest = Join-Path (Resolve-Path -LiteralPath $Output).Path "migration-input.$PID.json"
    $paths | ConvertTo-Json -Depth 2 | Set-Content -LiteralPath $temporaryManifest -Encoding utf8
    $Manifest = $temporaryManifest
  }
  foreach ($name in $values.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
  }
  if ($PlanOnly -and $Audit) { throw 'Choisir PlanOnly ou Audit.' }
  $mode = if ($Audit) { 'audit' } elseif ($PlanOnly) { 'plan' } else { 'run' }
  node (Join-Path $PSScriptRoot 'migrate-art-media.mjs') $Manifest $Output $Limit $mode
  if ($LASTEXITCODE -ne 0) { throw 'Migration arrêtée. Corriger la cause, puis relancer la même commande.' }
} finally {
  foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
  if ($temporaryManifest -and (Test-Path -LiteralPath $temporaryManifest)) { Remove-Item -LiteralPath $temporaryManifest }
  $lock.Dispose()
}
