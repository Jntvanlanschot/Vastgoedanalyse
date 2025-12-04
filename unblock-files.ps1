# Script to unblock all files in the Realworks files folder
$folderPath = "C:\Users\meesv\OneDrive\Documenten\04_Ander Werk\_Vastgoedtool\30 oktober 2025\Realworks files"

Write-Host "Unblocking files in: $folderPath" -ForegroundColor Cyan

if (-not (Test-Path $folderPath)) {
    Write-Host "Error: Folder does not exist!" -ForegroundColor Red
    exit 1
}

# Get all files recursively
$files = Get-ChildItem -Path $folderPath -File -Recurse

$count = 0
foreach ($file in $files) {
    try {
        Unblock-File -Path $file.FullName -ErrorAction SilentlyContinue
        $count++
        Write-Host "Unblocked: $($file.Name)" -ForegroundColor Green
    } catch {
        Write-Host "Failed to unblock: $($file.Name) - $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "`nCompleted! Unblocked $count file(s)." -ForegroundColor Cyan

