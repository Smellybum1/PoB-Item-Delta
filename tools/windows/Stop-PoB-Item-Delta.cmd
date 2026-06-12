@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Stop-PoB-Item-Delta.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo PoB Item Delta did not stop successfully.
  echo Read the message above, then try again after fixing the issue.
  if /I not "%POB_ITEM_DELTA_NO_PAUSE%"=="1" pause
)
endlocal & exit /b %EXIT_CODE%
