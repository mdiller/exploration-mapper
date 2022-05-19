# based on https://plusontech.com/2019/01/05/weekend-powershell-script-copy-files-from-phone-camera-by-month/

$Shell = New-Object -ComObject Shell.Application

function ResolvePath($path) {
	$currentItem = $Shell.NameSpace(17).Self

	$dirs = $path -split "/"
	
	foreach ($dir in $dirs) {
		$currentItem = $currentItem.GetFolder.Items() | ? { $_.Name -eq $dir }
	}
	$currentItem
}

try {
	Write-Host "] Connecting to camera..."
	$folder = ResolvePath "HERO3+ Silver Edition/External Memory/DCIM/121GOPRO"

	$tempDir = "$PSScriptRoot\temp"
	If(!(test-path $tempDir))
	{
		# create tempdir if it doesnt exist
		$newdirout = New-Item -ItemType Directory -Force -Path $tempDir
	}

	Write-Host "] Files found:"
	$folder.GetFolder.Items() | % { $_.Name }
}
catch {
	Write-Host "exception connecting to camera"
	exit 1
}

$tempDirShell = $Shell.NameSpace($tempDir).self

Write-Host "] Moving files to temp dir..."
$tempDirShell.GetFolder.MoveHere($folder)

if (-not $?) {
	Write-Host "Moving files failed"
	exit 1
}

$fullpath = Join-Path -Path $tempDir -ChildPath $folder.Name

$prevLocation = Get-Location
Set-Location -Path $fullpath

Write-Host "] rsyncing to skrattpotatis"
rsync -azP ./ skrattpotatis:/storage/gopro/
# this maps to a location on my local network

if (-not $?) {
	Write-Host "rsync failed"
	exit 1
}

Write-Host "] Backing up files..."
ssh -o LogLevel=QUIET skrattpotatis "rsync -azP /storage/gopro/* /backup/gopro/"

if (-not $?) {
	Write-Host "backup failed"
	exit 1
}

Set-Location -Path $prevLocation

Write-Host "] Removing temp directory..."
Remove-Item -Path $tempDir -Recurse -Force

# success ding!
[console]::Beep(523.25, 200)
[console]::Beep(659.25, 200)
[console]::Beep(783.99, 200)