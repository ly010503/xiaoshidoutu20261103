param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [int]$TargetWidth = 1024,
    [int]$TargetHeight = 1536
)

$ErrorActionPreference = 'Stop'

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)

if ($resolvedInput -eq $resolvedOutput) {
    throw 'InputPath and OutputPath must be different.'
}

if ($TargetWidth -le 0 -or $TargetHeight -le 0) {
    throw 'Target dimensions must be positive.'
}

$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Image]::FromFile($resolvedInput)
try {
    $canvas = New-Object System.Drawing.Bitmap(
        $TargetWidth,
        $TargetHeight,
        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )

    try {
        $canvas.SetResolution(96, 96)
        $graphics = [System.Drawing.Graphics]::FromImage($canvas)

        try {
            $graphics.Clear([System.Drawing.Color]::White)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

            $scale = [Math]::Min(
                $TargetWidth / [double]$source.Width,
                $TargetHeight / [double]$source.Height
            )
            $drawWidth = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
            $drawHeight = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
            $drawX = [int][Math]::Floor(($TargetWidth - $drawWidth) / 2)
            $drawY = [int][Math]::Floor(($TargetHeight - $drawHeight) / 2)

            $destination = New-Object System.Drawing.Rectangle($drawX, $drawY, $drawWidth, $drawHeight)
            $graphics.DrawImage($source, $destination)
        }
        finally {
            $graphics.Dispose()
        }

        $canvas.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $canvas.Dispose()
    }
}
finally {
    $source.Dispose()
}

$result = [System.Drawing.Image]::FromFile($resolvedOutput)
try {
    if ($result.Width -ne $TargetWidth -or $result.Height -ne $TargetHeight) {
        throw "Normalized image has unexpected dimensions: $($result.Width)x$($result.Height)"
    }

    [PSCustomObject]@{
        Path = $resolvedOutput
        Width = $result.Width
        Height = $result.Height
    }
}
finally {
    $result.Dispose()
}
