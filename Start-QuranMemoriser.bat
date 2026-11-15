@echo off
title QuranMemoriser LAN server
cd /d C:\Apps\QuranMemoriser
echo Starting QuranMemoriser on your local network...
echo Keep this window open while you use the app. Closing it stops the server.
echo.
npm run serve:lan
echo.
echo The server stopped. If this was unexpected, read any error above.
pause
