@echo off
SETLOCAL

IF "%~1"=="" (
    ECHO Usage: build-wasm.bat ^<file.c^>
    EXIT /B 1
)

SET SRC=%~1

IF NOT EXIST "%SRC%" (
    ECHO File not found: %SRC%
    EXIT /B 1
)

SET DIR=%~dp1
SET BASE=%~n1
SET OUT=%DIR%%BASE%.wasm

emcc "%SRC%" -O3 -ffast-math -fno-math-errno ^
    -s STANDALONE_WASM=1 -s IMPORTED_MEMORY=1 ^
    -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=128kb ^
    -Wl,--no-entry -Wl,--import-memory ^
    -o "%OUT%"

IF %ERRORLEVEL% NEQ 0 (
    ECHO Build failed.
    EXIT /B 1
)

ECHO Built "%OUT%"
ENDLOCAL
