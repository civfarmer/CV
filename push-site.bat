@echo off
REM ===================================================================
REM  Publish the site to https://github.com/civfarmer/CV  (GitHub Pages)
REM
REM  The files were copied into this folder and checked before this ran:
REM  no unredacted reference letters, no working sources from
REM  publications/_source, no local dev servers, no unlinked CV variants.
REM
REM  This runs git locally, where Git Credential Manager can authenticate.
REM  That cannot happen from the sandbox, which is the only reason this is
REM  a script rather than something already done.
REM
REM  A transcript is written to push-log.txt next to this file.
REM ===================================================================

cd /d "%~dp0"
set LOG=%~dp0push-log.txt

echo ===== %DATE% %TIME% ===== > "%LOG%"

echo. & echo === Repository ===
git remote -v >> "%LOG%" 2>&1
git rev-parse --abbrev-ref HEAD >> "%LOG%" 2>&1
git remote -v
git rev-parse --abbrev-ref HEAD

echo. & echo === Staging ===
git add -A >> "%LOG%" 2>&1

echo. & echo === Summary of what is being committed ===
git diff --cached --stat >> "%LOG%" 2>&1
git diff --cached --shortstat

echo. & echo === Committing ===
git commit -F "%~dp0COMMIT_MESSAGE.txt" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo Commit failed or there was nothing to commit - see push-log.txt
  git log --oneline -1
  echo. & echo Nothing was pushed.
  timeout /t 30
  exit /b 1
)
git log --oneline -1

echo. & echo === Pushing to origin/main ===
git push origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo PUSH FAILED - see push-log.txt
  echo   If Credential Manager needs you to sign in, a browser window may have opened.
  echo   If the remote is ahead:  git pull --rebase origin main   then run this again.
  timeout /t 60
  exit /b 1
)

echo.
echo === Pushed. GitHub Pages usually rebuilds within a minute or two. ===
echo     https://github.com/civfarmer/CV/actions
git log --oneline -1
echo.
timeout /t 45
