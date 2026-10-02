param(
  [ValidateSet('Install', 'Remove')][string]$Action = 'Install',
  [string]$DshCommand = 'dsh'
)
$ErrorActionPreference = 'Stop'
if (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue) {
  throw '请先从托盘完全退出 DeepSeek Harness，再运行此脚本。桌面端 CLI 修改 profile 时要求应用退出。'
}
$resolvedDsh = Get-Command $DshCommand -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $resolvedDsh) {
  throw '未找到桌面端随附的 dsh.cmd，请使用 -DshCommand 指定实际路径。'
}
$DshCommand = $resolvedDsh.Source
if ($Action -eq 'Remove') {
  & $DshCommand plugin --profile desktop remove dsh-timeband
} else {
  $packagePath = Join-Path $PSScriptRoot '../artifacts/dsh-timeband-1.0.2.tgz'
  if (-not (Test-Path -LiteralPath $packagePath)) { throw '缺少安装包，请先运行 npm pack --pack-destination artifacts。' }
  $packagePath = (Resolve-Path -LiteralPath $packagePath).Path
  & $DshCommand plugin --profile desktop add $packagePath
}
if ($LASTEXITCODE -ne 0) { throw "DSH 插件操作失败，退出码：$LASTEXITCODE" }
Write-Host '操作完成。重新打开 DeepSeek Harness 后生效。'
