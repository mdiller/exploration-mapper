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

function CopyFile($shellFile, $dest) {
	Write-Host "Copying $($shellFile.Name)"
	# not using this fucking bullshit because it spawns a new dialog for each file
	$dest.GetFolder.CopyHere($shellFile)
	if (-not $?) {
		Write-Host "Error Copying File. Exiting."
		exit 1
	}
}

$tempDir = "$PSScriptRoot\temp"
$folder = ResolvePath "HERO3+ Silver Edition/External Memory/DCIM/100GOPRO"

If(!(test-path $tempDir))
{
	New-Item -ItemType Directory -Force -Path $tempDir
}

Write-Host "] Files found:"
$folder.GetFolder.Items() | % { $_.Name }

$tempDirShell = $Shell.NameSpace($tempDir).self

# $folder.GetFolder.Items() | % { CopyFile $_ $tempDirShell }

Write-Host "] Copying files to temp dir..."
$tempDirShell.GetFolder.CopyHere($folder)

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

Set-Location -Path $prevLocation

Write-Host "] Removing temp directory..."
Remove-Item -Path $tempDir -Recurse -Force

# success ding!
[console]::Beep(523.25, 200)
[console]::Beep(659.25, 200)
[console]::Beep(783.99, 200)