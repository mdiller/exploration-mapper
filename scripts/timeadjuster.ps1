param (
	[Parameter(Mandatory=$true)][string]$targetVideo,
	[Parameter(Mandatory=$false)][int]$secondsDiff = 0,
	[switch]$single=$false
)

# NOTE: if video is behind what is shown on the map, secondsDiff should be negative (i think)

# adjusts the time of videos to account for clock drift

if (-not $targetVideo.EndsWith(".MP4")) {
	$targetVideo += ".MP4"
}

if (-not(Test-Path -Path $targetVideo -PathType Leaf)) {
	Write-Host "Thats not a valid video"
	exit(1)
}

function GetCreationDate($fileName) {
	$data = ffprobe -v quiet $fileName -print_format json -show_entries stream=index,codec_type:stream_tags=creation_time:format_tags=creation_time
	$data = $data | ConvertFrom-Json

	$data.format.tags.creation_time
}

function PrintVideoInfo($fileName) {
	$creationDate = GetCreationDate $fileName
	$paddedFileName = $fileName.PadRight(16)
	Write-Host "$paddedFileName $creationDate"
}

function AdjustVideoTime($filename, $adjustment) {
	Write-Host "Adjusting for $filename..."
	$creationDate = GetCreationDate $filename
	$date = [datetime]::Parse($creationDate)
	$date = $date.AddSeconds($adjustment)

	$newDate = $date.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.ffffffK")

	$tempFile = "tempout.mp4"

	ffmpeg -v quiet -y -i $filename -metadata creation_time="$newDate" -c copy $tempFile

	if(-not $?) {
		Write-Host "ffmpeg errored, stopping"
		exit(1)
	}

	rm $filename
	mv $tempFile $filename
}

function IsVideoSameDay($filename, $otherDate, $hoursBuffer) {
	$otherDate = [datetime]::Parse($otherDate)
	$minDate = $otherDate.AddHours(0 - $hoursBuffer)
	$maxDate = $otherDate.AddHours($hoursBuffer)
	$date = GetCreationDate $filename
	$date = [datetime]::Parse($date)

	$date -ge $minDate -and $date -le $maxDate
}

$videoFiles = Get-ChildItem -Path "." -Filter "*.MP4" -Name

# Write-Host "All Video Info Before:"
# $videoFiles | % { PrintVideoInfo $_ }

if ($single) {
	$targetVideos = @( $targetVideo )
	Write-Host "`nSingle Video:"
	PrintVideoInfo $targetVideo
}
else {
	Write-Host "`nFiltering Applicable Videos..."
	$mainDate = GetCreationDate $targetVideo
	$targetVideos = $videoFiles | Where-Object { IsVideoSameDay $_ $mainDate 5 }
	$targetVideos | % { PrintVideoInfo $_ }
}

if ($secondsDiff -eq 0) {
	exit(0)
}

Write-Host "`nAdjusting Dates..."
$targetVideos | % { AdjustVideoTime $_ $secondsDiff }


Write-Host "`nApplicable Video Info After:"
$targetVideos | % { PrintVideoInfo $_ }