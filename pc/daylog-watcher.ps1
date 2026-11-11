# Daylog PCの見張り役
# 1分ごとに「最後に操作してから何秒たったか」と「ゲームが起動しているか」を記録する。
# 触っていなくても音が鳴っている間（動画・音楽・ASMR）は「空白時間」（~blank）として記録し、睡眠と分ける。
# 記録はこのPCの %LOCALAPPDATA%\Daylog にだけ置かれる。キー入力の中身や画面は一切記録しない。

$ErrorActionPreference = 'SilentlyContinue'
$Base = Join-Path $env:LOCALAPPDATA 'Daylog'
$LogDir = Join-Path $Base 'log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$ConfigPath = Join-Path $Base 'config.json'
$Heart = Join-Path $Base 'heartbeat.txt'
$DefaultUrl = 'https://claude.ai/artifact/BNdsmZvSnxT2NK5Z4j6kKk'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DaylogIdle {
  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")]
  public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint IdleSeconds() {
    LASTINPUTINFO l = new LASTINPUTINFO();
    l.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    if (!GetLastInputInfo(ref l)) return 0;
    return unchecked((uint)Environment.TickCount - l.dwTime) / 1000;
  }
}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDaylogMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IDaylogMMDevice ppDevice); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDaylogMMDevice { [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDaylogAudioMeter { [PreserveSig] int GetPeakValue(out float peak); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DaylogMMDeviceEnumeratorCo {}
public static class DaylogAudio {
  // 既定のスピーカーで今、音が鳴っているか（音量の針の値。音の中身は聞かない）
  public static float Peak() {
    try {
      var en = (IDaylogMMDeviceEnumerator)(new DaylogMMDeviceEnumeratorCo());
      IDaylogMMDevice dev; if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return 0;
      Guid iid = typeof(IDaylogAudioMeter).GUID; object o;
      if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0 || o == null) return 0;
      float v; ((IDaylogAudioMeter)o).GetPeakValue(out v); return v;
    } catch { return 0; }
  }
}
"@

function Get-Config {
  $c = @{ autoOpenBoot = $true; gameExes = @('VALORANT-Win64-Shipping'); bedtime = $null; bedtimeDate = $null; notify = $true; quiet = $false; daylogUrl = $DefaultUrl }
  if (Test-Path $ConfigPath) {
    try {
      $j = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($p in $j.PSObject.Properties) { if ($null -ne $p.Value -or $p.Name -eq 'bedtime') { $c[$p.Name] = $p.Value } }
    } catch {}
  }
  if (-not $c.daylogUrl) { $c.daylogUrl = $DefaultUrl }
  return $c
}

function Get-LogicalDate([datetime]$t) { return $t.AddHours(-6).ToString('yyyy-MM-dd') }

function Test-Quiet($cfg) { return ($cfg.quiet -eq $true) -and ($cfg.bedtimeDate -eq (Get-LogicalDate (Get-Date))) }

function Show-Toast([string]$title, [string]$body) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $t = [System.Security.SecurityElement]::Escape($title)
    $b = [System.Security.SecurityElement]::Escape($body)
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml("<toast><visual><binding template=`"ToastGeneric`"><text>$t</text><text>$b</text></binding></visual></toast>")
    $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
  } catch {}
}

$Version = '2.1'
function Write-Event([string]$msg) {
  try { Add-Content -Path (Join-Path $Base 'events.log') -Value ("{0}`t{1}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $msg) -Encoding UTF8 } catch {}
}

# いつも使っているブラウザが「アプリの窓」で開ける種類（Chrome・Edgeなど）なら、その実行ファイルを返す
function Get-BrowserApp {
  try {
    $progId = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -ErrorAction Stop).ProgId
    $cmd = (Get-ItemProperty ("Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command") -ErrorAction Stop).'(default)'
    if ($cmd -match '^"([^"]+)"') { $exe = $Matches[1] } else { $exe = ($cmd -split ' ')[0] }
    $name = [IO.Path]::GetFileNameWithoutExtension($exe).ToLower()
    if ((@('chrome', 'msedge', 'brave', 'vivaldi') -contains $name) -and (Test-Path $exe)) { return $exe }
  } catch {}
  return $null
}

# Daylogを、アドレスバーのない専用の窓で開く（だめなら普通にブラウザで開く）
function Open-Daylog($cfg, [string]$reason) {
  $url = [string]$cfg.daylogUrl
  $exe = Get-BrowserApp
  if ($exe) {
    try { Start-Process -FilePath $exe -ArgumentList ('--app=' + $url) -ErrorAction Stop; Write-Event "open $reason ok (app)"; return }
    catch { Write-Event ("open $reason app failed: " + $_.Exception.Message) }
  }
  try { Start-Process $url -ErrorAction Stop; Write-Event "open $reason ok" }
  catch {
    Write-Event ("open $reason start-process failed: " + $_.Exception.Message)
    try { Start-Process 'rundll32.exe' -ArgumentList ('url.dll,FileProtocolHandler ' + $url) -ErrorAction Stop; Write-Event "open $reason ok (rundll32)" }
    catch { Write-Event ("open $reason failed: " + $_.Exception.Message) }
  }
}

# デスクトップとスタートメニューに「Daylog」を置く（最初の1回だけ。消したら作り直さない）
function Install-Shortcuts($cfg) {
  $flag = Join-Path $Base 'shortcuts.done'
  if ((Test-Path $flag) -and ((Get-Content $flag -Raw -ErrorAction SilentlyContinue) -match [regex]::Escape([string]$cfg.daylogUrl))) { return }
  try {
    $url = [string]$cfg.daylogUrl
    $ico = Join-Path $Base 'daylog.ico'
    $exe = Get-BrowserApp
    $dirs = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
    $sh = New-Object -ComObject WScript.Shell
    foreach ($dir in $dirs) {
      if (-not $dir -or -not (Test-Path $dir)) { continue }
      if ($exe) {
        $s = $sh.CreateShortcut((Join-Path $dir 'Daylog.lnk'))
        $s.TargetPath = $exe
        $s.Arguments = '--app=' + $url
        $s.Description = 'Daylog'
        if (Test-Path $ico) { $s.IconLocation = $ico + ',0' }
        $s.Save()
      } else {
        $lines = @('[InternetShortcut]', ('URL=' + $url))
        if (Test-Path $ico) { $lines += ('IconFile=' + $ico); $lines += 'IconIndex=0' }
        Set-Content -Path (Join-Path $dir 'Daylog.url') -Value $lines -Encoding ASCII
      }
    }
    Set-Content -Path $flag -Value ((Get-Date).ToString('s') + ' ' + $url) -Encoding UTF8
    Write-Event ('shortcuts created' + $(if ($exe) { ' (app: ' + [IO.Path]::GetFileName($exe) + ')' } else { ' (browser)' }))
  } catch { Write-Event ('shortcuts failed: ' + $_.Exception.Message) }
}

if ($args -contains '-TestToast') { Show-Toast 'Daylog' 'PCの見張り役が動き始めた。'; exit }

# 二重に起動しないようにする
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\DaylogWatcher', [ref]$created)
if (-not $created) { exit }
Write-Event "start v$Version"
$SelfPath = $MyInvocation.MyCommand.Path
$SelfStamp = (Get-Item $SelfPath).LastWriteTimeUtc


# Steamのフォルダにあってもゲームではないもの（作業用ツールなど）
$SteamExclude = @('wallpaper32','wallpaper64','ui32','blender','obs32','obs64','aseprite','krita','vtube studio','soundpad','steamvr','vrserver','vrmonitor','vrcompositor','vrdashboard','crashhandler','unitycrashhandler64','unitycrashhandler32','easyanticheat','easyanticheat_eos','beservice')

# 今動いているゲームを集める。値が $true のものはゲーム時間に数える（マイクラは仕事なので数えない）
function Get-RunningGames($cfg) {
  $found = @{}
  foreach ($name in @($cfg.gameExes)) {
    if ($name -and (Get-Process -Name ([string]$name) -ErrorAction SilentlyContinue)) { $found[[string]$name] = $true }
  }
  if ($cfg.watchSteam -ne $false) {
    foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
      $path = $null
      try { $path = $p.Path } catch {}
      if ($path -and $path -like '*\steamapps\common\*' -and ($SteamExclude -notcontains $p.ProcessName.ToLower())) { $found[$p.ProcessName] = $true }
    }
  }
  if ($cfg.watchMinecraft -ne $false) {
    $mc = Get-Process -Name 'javaw', 'java', 'Minecraft.Windows' -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -eq 'Minecraft.Windows' -or $_.MainWindowTitle -like '*Minecraft*' }
    if ($mc) { $found['Minecraft'] = $false }
  }
  return $found
}

# PCを起動したとき（ログインしたとき）に開く
# ── 新しいDaylog（Supabase）へ記録を送る・設定を受け取る
$SentFile = Join-Path $Base 'cloud-sent.txt'
function Invoke-Daylog($cfg, [string]$fn, $body) {
  $url = ([string]$cfg.supabaseUrl).TrimEnd('/') + '/rest/v1/rpc/' + $fn
  $h = @{ apikey = [string]$cfg.supabaseKey; Authorization = 'Bearer ' + [string]$cfg.supabaseKey }
  $json = $body | ConvertTo-Json -Depth 6 -Compress
  return Invoke-RestMethod -Method Post -Uri $url -Headers $h -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 30
}
function J($x) { if ($null -eq $x) { return 'null' } return (ConvertTo-Json -InputObject $x -Compress -Depth 5) }
function Sync-Cloud($cfg) {
  if (-not $cfg.supabaseUrl -or -not $cfg.supabaseKey -or -not $cfg.deviceToken) { return }
  $last = 0
  try { $last = [int64]((Get-Content $SentFile -Raw -ErrorAction Stop).Trim()) } catch { $last = [DateTimeOffset]::Now.AddDays(-45).ToUnixTimeMilliseconds() }
  $rows = New-Object System.Collections.Generic.List[object]
  $files = Get-ChildItem -Path $LogDir -Filter '*.tsv' -ErrorAction SilentlyContinue | Sort-Object Name
  $fromDay = [DateTimeOffset]::FromUnixTimeMilliseconds($last).LocalDateTime.AddDays(-1).ToString('yyyy-MM-dd')
  foreach ($f in $files) {
    if ($f.BaseName -lt $fromDay) { continue }
    foreach ($line in (Get-Content $f.FullName -Encoding UTF8)) {
      $p = $line.Split("`t"); if ($p.Count -lt 2) { continue }
      $t = 0L; if (-not [int64]::TryParse($p[0].Trim([char]0xFEFF), [ref]$t)) { continue }
      if ($t -le $last) { continue }
      $rows.Add(@{ t = $t; idle = [int]$p[1]; game = $(if ($p.Count -gt 2) { $p[2] } else { '-' }) })
    }
  }
  $maxT = $last
  for ($i = 0; $i -lt $rows.Count; $i += 2000) {
    $chunk = $rows.GetRange($i, [Math]::Min(2000, $rows.Count - $i))
    Invoke-Daylog $cfg 'pc_ingest' @{ p_token = [string]$cfg.deviceToken; p_rows = $chunk.ToArray() } | Out-Null
    $maxT = [int64](($chunk | ForEach-Object { $_.t } | Measure-Object -Maximum).Maximum)
    Set-Content -Path $SentFile -Value $maxT -Encoding ASCII
  }
  # 就寝目安などの設定を受け取って、手元の設定に入れる
  $remote = Invoke-Daylog $cfg 'pc_config' @{ p_token = [string]$cfg.deviceToken }
  if ($remote) {
    $local = @{}
    try { $j = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json; foreach ($p in $j.PSObject.Properties) { $local[$p.Name] = $p.Value } } catch {}
    $changed = $false
    foreach ($k in @('autoOpenBoot', 'gameExes', 'bedtime', 'bedtimeDate', 'notify', 'quiet')) {
      $prop = $remote.PSObject.Properties[$k]
      if ($prop) { $v = $prop.Value; if ((J $local[$k]) -ne (J $v)) { $local[$k] = $v; $changed = $true } }
    }
    if ($changed) { ($local | ConvertTo-Json -Depth 5) | Set-Content -Path $ConfigPath -Encoding UTF8 }
  }
}
$lastCloud = (Get-Date).AddMinutes(-10)
# 1日1回、新しいDaylogの全データを backup フォルダに日付つきで置く
function Save-Backup($cfg) {
  if (-not $cfg.supabaseUrl -or -not $cfg.deviceToken) { return }
  $dir = Join-Path $Base 'backup'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $file = Join-Path $dir ('backup-' + (Get-Date).ToString('yyyy-MM-dd') + '.json')
  if (Test-Path $file) { return }
  $data = Invoke-Daylog $cfg 'pc_backup' @{ p_token = [string]$cfg.deviceToken }
  if ($data) { ($data | ConvertTo-Json -Depth 30) | Set-Content -Path $file -Encoding UTF8; Write-Event ('backup saved ' + (Split-Path $file -Leaf)) }
}

$cfg = Get-Config
Install-Shortcuts $cfg
$lastAutoOpen = (Get-Date).AddHours(-1)
if ($cfg.autoOpenBoot -and -not (Test-Quiet $cfg) -and -not ($args -contains '-NoBootOpen')) { Start-Sleep -Seconds 20; Open-Daylog $cfg 'boot' }

$sent = @{}
$audioHit = $false
$blankRun = 0
$lastPrune = (Get-Date).AddDays(-1)

while ($true) {
  $now = Get-Date
  $cfg = Get-Config
  $idle = [DaylogIdle]::IdleSeconds()

  $games = Get-RunningGames $cfg
  $game = '-'
  foreach ($k in $games.Keys) { if ($games[$k]) { $game = [string]$k; break } }

  # 触っていないけれど音が鳴っていた（動画・音楽・ASMR）→ 空白時間。寝落ちに備えて、続けて3時間までにする
  if ($idle -lt 300 -or -not $audioHit) { $blankRun = 0 }
  if ($game -eq '-' -and $idle -ge 300 -and $audioHit) {
    $blankRun++
    if ($blankRun -le 180) { $game = '~blank' }
  }
  $audioHit = $false

  $ms = [DateTimeOffset]::new($now).ToUnixTimeMilliseconds()
  $file = Join-Path $LogDir ($now.ToString('yyyy-MM-dd') + '.tsv')
  Add-Content -Path $file -Value ("{0}`t{1}`t{2}" -f $ms, $idle, $game) -Encoding UTF8
  Set-Content -Path $Heart -Value $ms -Encoding ASCII

  # 5分ごとに新しいDaylogへ送る（つながらなくても次の回にまとめて送る）
  if (($now - $lastCloud).TotalMinutes -ge 5) {
    $lastCloud = $now
    try { Sync-Cloud $cfg } catch { Write-Event ('cloud sync failed: ' + $_.Exception.Message) }
    try { Save-Backup $cfg } catch { Write-Event ('backup failed: ' + $_.Exception.Message) }
  }

  # 見張り役のファイルが新しくなっていたら、入れ替えて起動し直す
  try {
    if ((Get-Item $SelfPath).LastWriteTimeUtc -ne $SelfStamp) {
      Write-Event 'restart (updated)'
      $mutex.ReleaseMutex(); $mutex.Dispose()
      Start-Process 'powershell.exe' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $SelfPath + '" -NoBootOpen') -WindowStyle Hidden
      exit
    }
  } catch {}

  # 就寝の目安の30分前と、その時刻に知らせる
  if ($cfg.notify -and $cfg.bedtime -and $cfg.bedtimeDate -and -not (Test-Quiet $cfg)) {
    try {
      $parts = ([string]$cfg.bedtime).Split(':')
      $h = [int]$parts[0]; $m = [int]$parts[1]
      $day = [datetime]::ParseExact([string]$cfg.bedtimeDate, 'yyyy-MM-dd', $null)
      if ($h -lt 6) { $day = $day.AddDays(1) }
      $target = $day.Date.AddHours($h).AddMinutes($m)
      $diff = ($target - $now).TotalMinutes
      $k1 = "$($cfg.bedtimeDate) $($cfg.bedtime) 30"
      $k2 = "$($cfg.bedtimeDate) $($cfg.bedtime) 0"
      if ($diff -le 30 -and $diff -gt 24 -and -not $sent[$k1]) { $sent[$k1] = $true; Show-Toast 'Daylog' ("あと30分で就寝の目安（{0}）。" -f $cfg.bedtime) }
      if ($diff -le 0 -and $diff -gt -6 -and -not $sent[$k2]) { $sent[$k2] = $true; Show-Toast 'Daylog' ("就寝の目安の{0}になった。夜モードで締められる。" -f $cfg.bedtime) }
    } catch {}
  }

  # 40日より古い記録を消す（1日1回）
  if (($now - $lastPrune).TotalHours -ge 24) {
    $lastPrune = $now
    Get-ChildItem $LogDir -Filter *.tsv | Where-Object { $_.LastWriteTime -lt $now.AddDays(-40) } | Remove-Item -Force -ErrorAction SilentlyContinue
  }

  # 次の1分まで待つあいだ、5秒ごとに音が鳴っているかを見る
  $until = $now.Date.AddHours($now.Hour).AddMinutes($now.Minute + 1)
  if (($until - (Get-Date)).TotalSeconds -lt 5) { $until = $until.AddMinutes(1) }
  while ((Get-Date) -lt $until) {
    if (-not $audioHit) { try { if ([DaylogAudio]::Peak() -gt 0.002) { $audioHit = $true } } catch {} }
    $left = ($until - (Get-Date)).TotalSeconds
    if ($left -le 0) { break }
    Start-Sleep -Milliseconds ([int]([Math]::Min(5, $left) * 1000))
  }
}
