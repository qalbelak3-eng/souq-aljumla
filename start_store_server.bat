@echo off
title Etihad Store Server
echo Starting Etihad Store Server on http://localhost:3000 ...
call npx next start -H 0.0.0.0 -p 3000
pause
