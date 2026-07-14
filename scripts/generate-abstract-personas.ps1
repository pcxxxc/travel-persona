$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $Root "public-site\travel-persona\assets\personas"
if (!(Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$Personas = @(
  @{ id="quiet-restore"; bg="#eef4ee"; a="#0f8b6f"; b="#2f6df6"; c="#f6d66b"; mode="rings"; seed=11 },
  @{ id="city-spark"; bg="#f4f0e8"; a="#e5634f"; b="#275efe"; c="#0f8b6f"; mode="blocks"; seed=23 },
  @{ id="aesthetic-collector"; bg="#edf2f6"; a="#6b5cff"; b="#0f8b6f"; c="#e8b24d"; mode="lens"; seed=37 },
  @{ id="slow-nomad"; bg="#f2f5ef"; a="#6f9c7b"; b="#2d6a90"; c="#d9b66f"; mode="horizon"; seed=41 },
  @{ id="heritage-drifter"; bg="#f3eee7"; a="#8b5f3c"; b="#0f8b6f"; c="#c5523f"; mode="strata"; seed=53 },
  @{ id="efficient-hunter"; bg="#edf0f3"; a="#1f2937"; b="#275efe"; c="#f0b44c"; mode="grid"; seed=67 },
  @{ id="wild-calibrator"; bg="#eef5f3"; a="#2f7d4f"; b="#8abf3f"; c="#275efe"; mode="terrain"; seed=79 },
  @{ id="ritual-archivist"; bg="#f5efe9"; a="#7c4d2f"; b="#d39b42"; c="#264653"; mode="archive"; seed=83 },
  @{ id="taste-cartographer"; bg="#f5f0e7"; a="#d95f43"; b="#0f8b6f"; c="#f2c14e"; mode="dots"; seed=97 },
  @{ id="night-flaneur"; bg="#ecf0f5"; a="#16213e"; b="#7b61ff"; c="#f4a261"; mode="nocturne"; seed=101 },
  @{ id="social-orbit"; bg="#f1f3ee"; a="#275efe"; b="#e5634f"; c="#0f8b6f"; mode="orbit"; seed=113 },
  @{ id="comfort-navigator"; bg="#eff4f2"; a="#4c8c7a"; b="#2f6df6"; c="#c7a45d"; mode="compass"; seed=127 },
  @{ id="edge-explorer"; bg="#f2f1ed"; a="#111827"; b="#e5634f"; c="#00a896"; mode="diagonal"; seed=131 },
  @{ id="micro-escape"; bg="#f3f6f1"; a="#83a95c"; b="#0f8b6f"; c="#f4d35e"; mode="pocket"; seed=149 },
  @{ id="family-anchor"; bg="#f4f2ec"; a="#446c7c"; b="#d99a6c"; c="#7aa95c"; mode="anchor"; seed=157 },
  @{ id="workation-weaver"; bg="#eef3f6"; a="#275efe"; b="#0f8b6f"; c="#8d6e63"; mode="weave"; seed=163 }
)

function ColorFromHex([string]$Hex, [int]$Alpha = 255) {
  $clean = $Hex.TrimStart("#")
  [System.Drawing.Color]::FromArgb(
    $Alpha,
    [Convert]::ToInt32($clean.Substring(0, 2), 16),
    [Convert]::ToInt32($clean.Substring(2, 2), 16),
    [Convert]::ToInt32($clean.Substring(4, 2), 16)
  )
}

function DrawCapsule($Graphics, $Brush, [float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Angle) {
  $state = $Graphics.Save()
  $Graphics.TranslateTransform($X + $Width / 2, $Y + $Height / 2)
  $Graphics.RotateTransform($Angle)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc(-$Width / 2, -$Height / 2, $Height, $Height, 90, 180)
  $path.AddArc($Width / 2 - $Height, -$Height / 2, $Height, $Height, 270, 180)
  $path.CloseFigure()
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
  $Graphics.Restore($state)
}

function DrawBlob($Graphics, $Brush, [float]$X, [float]$Y, [float]$Width, [float]$Height, [int]$Seed) {
  $rand = [Random]::new($Seed)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $points = New-Object "System.Drawing.PointF[]" 8
  for ($i = 0; $i -lt 8; $i += 1) {
    $angle = [Math]::PI * 2 * $i / 8
    $rx = $Width * (0.38 + $rand.NextDouble() * 0.14)
    $ry = $Height * (0.38 + $rand.NextDouble() * 0.14)
    $points[$i] = [System.Drawing.PointF]::new(
      [float]($X + $Width / 2 + [Math]::Cos($angle) * $rx),
      [float]($Y + $Height / 2 + [Math]::Sin($angle) * $ry)
    )
  }
  $path.AddClosedCurve($points, 0.62)
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

foreach ($persona in $Personas) {
  $bitmap = [System.Drawing.Bitmap]::new(1200, 900)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear((ColorFromHex $persona.bg))

  $rand = [Random]::new($persona.seed)
  $brushA = [System.Drawing.SolidBrush]::new((ColorFromHex $persona.a 190))
  $brushB = [System.Drawing.SolidBrush]::new((ColorFromHex $persona.b 160))
  $brushC = [System.Drawing.SolidBrush]::new((ColorFromHex $persona.c 150))
  $penA = [System.Drawing.Pen]::new((ColorFromHex $persona.a 165), 9)
  $penB = [System.Drawing.Pen]::new((ColorFromHex $persona.b 130), 5)
  $penC = [System.Drawing.Pen]::new((ColorFromHex $persona.c 120), 3)
  $finePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(42, 32, 38, 42), 1)

  for ($i = 0; $i -lt 28; $i += 1) {
    $x = $rand.Next(0, 1200)
    $y = $rand.Next(0, 900)
    $g.DrawLine($finePen, $x, $y, $x + $rand.Next(-180, 180), $y + $rand.Next(-140, 140))
  }

  switch ($persona.mode) {
    "rings" {
      for ($i = 0; $i -lt 7; $i += 1) {
        $g.DrawEllipse(@($penA, $penB, $penC)[$i % 3], 160 + $i * 52, 120 + $i * 36, 720 - $i * 54, 560 - $i * 38)
      }
      DrawBlob $g $brushC 650 430 270 210 $persona.seed
    }
    "blocks" {
      for ($i = 0; $i -lt 12; $i += 1) {
        DrawCapsule $g (@($brushA, $brushB, $brushC)[$i % 3]) ($rand.Next(60, 980)) ($rand.Next(80, 720)) ($rand.Next(150, 360)) ($rand.Next(34, 88)) ($rand.Next(-22, 23))
      }
    }
    "lens" {
      DrawBlob $g $brushB 250 130 620 560 $persona.seed
      $g.DrawEllipse($penA, 280, 180, 560, 470)
      $g.DrawEllipse($penC, 420, 260, 340, 280)
      DrawCapsule $g $brushC 645 190 360 64 -18
    }
    "horizon" {
      for ($i = 0; $i -lt 9; $i += 1) {
        DrawCapsule $g (@($brushA, $brushB, $brushC)[$i % 3]) 120 (150 + $i * 68) (920 - $i * 42) 36 ($i % 2 * 3 - 2)
      }
      DrawBlob $g $brushB 720 450 250 180 $persona.seed
    }
    "strata" {
      for ($i = 0; $i -lt 13; $i += 1) {
        DrawCapsule $g (@($brushA, $brushB, $brushC)[$i % 3]) ($rand.Next(80, 380)) (80 + $i * 56) ($rand.Next(580, 920)) ($rand.Next(20, 52)) ($rand.Next(-8, 8))
      }
      $g.DrawRectangle($penB, 210, 175, 720, 540)
    }
    "grid" {
      for ($x = 170; $x -le 960; $x += 112) { $g.DrawLine($penB, $x, 120, $x, 780) }
      for ($y = 150; $y -le 760; $y += 94) { $g.DrawLine($penC, 120, $y, 1040, $y) }
      DrawCapsule $g $brushA 315 300 470 80 0
      DrawCapsule $g $brushC 460 455 350 58 0
    }
    "terrain" {
      for ($i = 0; $i -lt 10; $i += 1) {
        $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
        $y = 160 + $i * 55
        $path.StartFigure()
        $path.AddBezier(110, $y, 360, $y - 120, 620, $y + 120, 1090, $y - 20)
        $g.DrawPath(@($penA, $penB, $penC)[$i % 3], $path)
        $path.Dispose()
      }
      DrawBlob $g $brushA 680 300 300 330 $persona.seed
    }
    "archive" {
      for ($i = 0; $i -lt 8; $i += 1) {
        $g.DrawRectangle(@($penA, $penB, $penC)[$i % 3], 150 + $i * 56, 130 + $i * 42, 700 - $i * 44, 520 - $i * 28)
      }
      DrawCapsule $g $brushC 360 360 430 54 -12
    }
    "dots" {
      for ($i = 0; $i -lt 80; $i += 1) {
        $r = $rand.Next(16, 54)
        $g.FillEllipse(@($brushA, $brushB, $brushC)[$i % 3], $rand.Next(70, 1090), $rand.Next(80, 800), $r, $r)
      }
      DrawCapsule $g $brushB 250 400 640 72 7
    }
    "nocturne" {
      for ($i = 0; $i -lt 14; $i += 1) {
        DrawCapsule $g (@($brushA, $brushB, $brushC)[$i % 3]) ($rand.Next(80, 920)) ($rand.Next(90, 760)) ($rand.Next(180, 430)) ($rand.Next(18, 54)) ($rand.Next(-38, 39))
      }
      $g.DrawEllipse($penB, 345, 155, 470, 470)
    }
    "orbit" {
      for ($i = 0; $i -lt 9; $i += 1) { $g.DrawEllipse(@($penA, $penB, $penC)[$i % 3], 185 + $i * 34, 100 + $i * 34, 760 - $i * 48, 650 - $i * 48) }
      for ($i = 0; $i -lt 16; $i += 1) {
        $r = 26 + $i % 4 * 8
        $g.FillEllipse(@($brushA, $brushB, $brushC)[$i % 3], $rand.Next(180, 950), $rand.Next(120, 720), $r, $r)
      }
    }
    "compass" {
      $g.DrawEllipse($penA, 210, 100, 720, 650)
      $g.DrawLine($penB, 570, 130, 570, 780)
      $g.DrawLine($penB, 210, 440, 930, 440)
      DrawCapsule $g $brushC 410 390 330 68 -35
      DrawBlob $g $brushB 680 470 220 190 $persona.seed
    }
    "diagonal" {
      for ($i = 0; $i -lt 11; $i += 1) { DrawCapsule $g (@($brushA, $brushB, $brushC)[$i % 3]) (-120 + $i * 105) (130 + $i * 42) 700 42 -32 }
      DrawBlob $g $brushC 710 160 260 420 $persona.seed
    }
    "pocket" {
      for ($i = 0; $i -lt 12; $i += 1) { $g.DrawArc(@($penA, $penB, $penC)[$i % 3], 180 + $i * 22, 150 + $i * 18, 680 - $i * 34, 560 - $i * 28, 210, 270) }
      DrawBlob $g $brushA 555 375 260 210 $persona.seed
    }
    "anchor" {
      $g.DrawRectangle($penB, 230, 150, 700, 560)
      DrawCapsule $g $brushA 260 250 620 86 0
      DrawCapsule $g $brushC 320 390 500 72 0
      DrawBlob $g $brushB 720 510 190 180 $persona.seed
      for ($i = 0; $i -lt 5; $i += 1) { $g.DrawLine($penC, 280 + $i * 90, 180, 280 + $i * 90, 680) }
    }
    "weave" {
      for ($i = 0; $i -lt 8; $i += 1) {
        DrawCapsule $g $brushA (160 + $i * 88) 150 46 620 0
        DrawCapsule $g $brushB 120 (210 + $i * 58) 880 36 0
      }
      DrawCapsule $g $brushC 330 370 470 62 16
    }
  }

  $overlay = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25, 255, 255, 255))
  $g.FillRectangle($overlay, 0, 0, 1200, 900)
  $path = Join-Path $OutDir ("abstract-{0}.jpg" -f $persona.id)
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)

  $finePen.Dispose()
  $penA.Dispose()
  $penB.Dispose()
  $penC.Dispose()
  $brushA.Dispose()
  $brushB.Dispose()
  $brushC.Dispose()
  $overlay.Dispose()
  $g.Dispose()
  $bitmap.Dispose()
}

Write-Output ("generated {0} abstract persona images" -f $Personas.Count)
