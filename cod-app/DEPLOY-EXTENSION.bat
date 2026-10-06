@echo off
setlocal EnableExtensions
title COD Realistic - Theme Extension Deploy
cd /d "%~dp0"

echo ==================================================
echo   COD REALISTIC  -  THEME EXTENSION DEPLOY
echo   (Ek dafa chalao - phir hamesha automatic!)
echo ==================================================
echo.

if not exist "shopify.app.toml" (
  echo [ERROR] shopify.app.toml nahi mila!
  echo Ye bat file ko usi folder me rakhna jisme shopify.app.toml hai.
  echo.
  pause
  exit /b 1
)
echo [STEP 1/5] shopify.app.toml mil gaya - OK
echo.

rem ---------- NODE DHUNDO ----------
set "NODEEXE="
where node >nul 2>nul && set "NODEEXE=node"
if not defined NODEEXE (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%PATH%;%ProgramFiles%\nodejs"
    set "NODEEXE=node"
  )
)
if not defined NODEEXE (
  if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "PATH=%PATH%;%ProgramFiles(x86)%\nodejs"
    set "NODEEXE=node"
  )
)
if not defined NODEEXE (
  if exist "%LocalAppData%\Programs\nodejs\node.exe" (
    set "PATH=%PATH%;%LocalAppData%\Programs\nodejs"
    set "NODEEXE=node"
  )
)
if not defined NODEEXE (
  echo [ERROR] Node.js computer par nahi mila!
  echo.
  echo Ye karo:
  echo   1. https://nodejs.org kholo
  echo   2. LTS wala button dabao, install karo
  echo   3. Computer RESTART karo
  echo   4. Phir ye file dobara double-click karo
  echo.
  pause
  exit /b 1
)
echo [STEP 2/5] Node.js mil gaya:
node -v
echo.

rem ---------- NODE VERSION CHECK (18+ chahiye) ----------
set "VER="
for /f "delims=v tokens=2" %%a in ('node -v') do set "VER=%%a"
for /f "delims=. tokens=1" %%a in ("%VER%") do set "MAJOR=%%a"
if %MAJOR% LSS 18 (
  echo [ERROR] Node version purana hai ^(v%VER%^). Node 18+ chahiye.
  echo nodejs.org se LTS version install karo, RESTART karo, phir dobara chalao.
  echo.
  pause
  exit /b 1
)

rem ---------- SHOPIFY CLI ----------
set "USENPX="
where shopify >nul 2>nul
if errorlevel 1 set "USENPX=1"
if defined USENPX (
  echo [STEP 3/5] Shopify CLI install ho rahi hai...
  echo            Isme 5-10 minute lag sakte hain. Progress neeche chalta
  echo            rahega - WINDOW BAND MAT KARNA.
  echo.
  call npm install -g @shopify/cli@latest --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [ERROR] CLI install nahi hui. Internet check karo.
    echo Phir bhi na ho to ye poora text mujhe bhej do.
    echo.
    pause
    exit /b 1
  )
  call shopify version >nul 2>nul
  if errorlevel 1 set "USENPX=1"
) else (
  echo [STEP 3/5] Shopify CLI pehle se installed hai - OK
)
echo.

echo [STEP 4/5] LOGIN TAYYAR HAI:
echo            Deploy dabate hi ek BROWSER window khulegi.
echo            Apne SHOPIFY PARTNER account se login karo
echo            aur Authorize / Continue par click karo.
echo            Ye sirf EK dafa hota hai - phir kabhi nahi.
echo.
echo            (Shuru karne ke liye koi bhi key dabao...)
pause >nul
echo.

echo Deploy chal raha hai... 2-5 minute lag sakte hain.
echo.
if defined USENPX (
  call npx -y @shopify/cli@latest app deploy --force
) else (
  call shopify app deploy --force
)
if errorlevel 1 goto :fail

echo.
echo ==================================================
echo   SUCCESS! EXTENSION SHOPIFY PAR DEPLOY HO GAYA
echo ==================================================
echo.
echo AB BAS YE KARO:
echo   1. Shopify Admin - Online Store - Themes
echo   2. Apne theme par "Customize" click karo
echo   3. Top bar me "App embeds" icon dabao (puzzle jaisa icon)
echo   4. "COD Order Form" ka toggle ON karo
echo   5. Save karo
echo   6. Koi product page kholo - COD form wahan mojood hai!
echo.
pause
exit /b 0

:fail
echo.
echo ==================================================
echo   DEPLOY ME ERROR AYA
echo ==================================================
echo.
echo Is window ke UPAR wala poora error text copy kar ke mujhe bhejo.
echo (Window par right-click karo - Select All - phir Enter dabao)
echo.
pause
exit /b 1
