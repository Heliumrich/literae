param(
  [string]$ArtworkId,
  [string]$Source,
  [string]$Output = 'G:\literae-art\workdir\deepzoom',
  [string]$StorageCredentials = 'G:\literae-art\login-bucket-object-storage.txt'
)

$ErrorActionPreference = 'Stop'
if (!$ArtworkId) { $ArtworkId = Read-Host 'UUID de la fiche Directus' }
if (!$Source) { $Source = Read-Host "Chemin de l'image originale" }
$id = [guid]::Empty
if (![guid]::TryParseExact($ArtworkId.Trim(), 'D', [ref]$id) -or $id -eq [guid]::Empty) {
  throw "Saisir l’UUID de la fiche Directus."
}
$image = Get-Item -LiteralPath $Source.Trim().Trim('"')
if ($image.PSIsContainer) { throw 'Choisir un fichier image.' }

$credentials = @{}
foreach ($line in Get-Content -LiteralPath $StorageCredentials) {
  if ($line -match '^\s*(cle acces|cle secrete)\s*[:=]\s*(.+?)\s*$') {
    $credentials[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
  }
}
$vips = $env:ART_VIPS
if (!$vips) {
  $installed = 'G:\literae-art\tools\libvips-windows-x64-8.18\bin\vips.exe'
  $vips = if (Test-Path -LiteralPath $installed -PathType Leaf) { $installed } else { 'vips' }
}
Get-Command -Name $vips -CommandType Application | Out-Null
$values = @{
  ART_S3_ENDPOINT = 'https://s3.gva2.infomaniak.cloud'
  ART_S3_REGION = 'gva2'
  ART_S3_BUCKET = 'literae-gallery'
  ART_S3_KEY = $credentials['cle acces']
  ART_S3_SECRET = $credentials['cle secrete']
  ART_VIPS = $vips
}
foreach ($name in $values.Keys) {
  if (!$values[$name]) { throw "Valeur manquante : $name" }
}

$folder = (New-Item -ItemType Directory -Force -Path $Output).FullName
$lock = [IO.File]::Open((Join-Path $folder 'migration.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$previous = @{}
try {
  foreach ($name in $values.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
  }
  node (Join-Path $PSScriptRoot 'art-deep-zoom.mjs') upload $id.ToString() $image.FullName $folder
  if ($LASTEXITCODE -ne 0) { throw 'Transfert interrompu. Relancer la même commande pour reprendre.' }
} finally {
  foreach ($name in $previous.Keys) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
  }
  $lock.Dispose()
}
