Add-Type -AssemblyName System.Drawing

function New-NotificationIcon {
  param(
    [Parameter(Mandatory = $true)] [string] $OutputPath,
    [Parameter(Mandatory = $true)] [int] $Size,
    [Parameter(Mandatory = $true)] [bool] $IncludeBackground
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $scale = $Size / 96.0
  if ($IncludeBackground) {
    $backgroundBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#0B80B4"))
    $graphics.FillEllipse($backgroundBrush, 4 * $scale, 4 * $scale, 88 * $scale, 88 * $scale)
    $backgroundBrush.Dispose()
  }

  $markBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $cap = [System.Drawing.PointF[]] @(
    ([System.Drawing.PointF]::new([single](48 * $scale), [single](17 * $scale))),
    ([System.Drawing.PointF]::new([single](88 * $scale), [single](37 * $scale))),
    ([System.Drawing.PointF]::new([single](48 * $scale), [single](57 * $scale))),
    ([System.Drawing.PointF]::new([single](8 * $scale), [single](37 * $scale)))
  )
  $graphics.FillPolygon($markBrush, $cap)

  $base = New-Object System.Drawing.Drawing2D.GraphicsPath
  $base.AddBezier(24 * $scale, 49 * $scale, 31 * $scale, 57 * $scale, 39 * $scale, 62 * $scale, 48 * $scale, 64 * $scale)
  $base.AddBezier(48 * $scale, 64 * $scale, 57 * $scale, 62 * $scale, 65 * $scale, 57 * $scale, 72 * $scale, 49 * $scale)
  $base.AddLine([single](72 * $scale), [single](65 * $scale), [single](68 * $scale), [single](69 * $scale))
  $base.AddBezier(68 * $scale, 69 * $scale, 56 * $scale, 78 * $scale, 40 * $scale, 76 * $scale, 28 * $scale, 68 * $scale)
  $base.AddLine([single](28 * $scale), [single](68 * $scale), [single](24 * $scale), [single](65 * $scale))
  $base.CloseFigure()
  $graphics.FillPath($markBrush, $base)

  $tasselPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, (5 * $scale))
  $tasselPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $tasselPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLines($tasselPen, [System.Drawing.PointF[]] @(
    ([System.Drawing.PointF]::new([single](68 * $scale), [single](37 * $scale))),
    ([System.Drawing.PointF]::new([single](80 * $scale), [single](45 * $scale))),
    ([System.Drawing.PointF]::new([single](80 * $scale), [single](65 * $scale)))
  ))
  $graphics.FillEllipse($markBrush, 76 * $scale, 62 * $scale, 8 * $scale, 8 * $scale)

  $outputDirectory = Split-Path -Parent $OutputPath
  if ($outputDirectory) { [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null }
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $tasselPen.Dispose()
  $base.Dispose()
  $markBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$projectRoot = Split-Path -Parent $PSScriptRoot
New-NotificationIcon -OutputPath (Join-Path $projectRoot "notification-icon.png") -Size 192 -IncludeBackground $true
New-NotificationIcon -OutputPath (Join-Path $projectRoot "notification-badge.png") -Size 96 -IncludeBackground $false
