@echo off
REM ============================================================
REM  scara.bat — PlatformIO shortcuts for SCARA Robot
REM  Uses the project .venv\Scripts\pio.exe
REM  Usage:
REM    scara compile          — build only
REM    scara upload           — build + upload
REM    scara upload-only      — upload precompiled binary without verifying files
REM    scara monitor          — open serial monitor (921600 baud)
REM    scara all              — build + upload + open monitor
REM ============================================================

SET PIO="%~dp0.venv\Scripts\pio.exe"
SET CMD=%1

IF "%CMD%"=="compile" (
    echo [SCARA] Compiling...
    %PIO% run
    GOTO :EOF
)

IF "%CMD%"=="upload" (
    echo [SCARA] Compiling and uploading...
    %PIO% run --target upload
    GOTO :EOF
)

IF "%CMD%"=="upload-only" (
    echo [SCARA] Uploading last built binary (skipping compile check)...
    %PIO% run --target upload --skip-targets
    GOTO :EOF
)

IF "%CMD%"=="monitor" (
    echo [SCARA] Opening serial monitor at 921600...
    %PIO% device monitor --baud 921600 --filter direct
    GOTO :EOF
)

IF "%CMD%"=="all" (
    echo [SCARA] Compiling, uploading, then opening monitor...
    %PIO% run --target upload && %PIO% device monitor --baud 921600 --filter direct
    GOTO :EOF
)

echo Usage: scara [compile ^| upload ^| upload-only ^| monitor ^| all]
echo.
echo   compile       Build firmware only
echo   upload        Build and upload to ESP32
echo   upload-only   Upload precompiled binary directly (fastest)
echo   monitor       Open serial monitor (921600 baud)
echo   all           Build + upload + open monitor
