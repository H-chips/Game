@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   正在启动「合成神龙」本地服务器...
echo   启动后用手机浏览器打开下面输出的地址即可玩（手机与电脑同一 WiFi）
echo.
node serve.js 8080
echo.
echo   服务器已停止。
pause
