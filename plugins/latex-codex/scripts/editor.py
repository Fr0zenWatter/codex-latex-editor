"""python editor.py path/to/main.tex [--port 8765] -- local TeX, pdfinfo and bundled PDF.js."""
import argparse
import difflib
from functools import lru_cache
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import unicodedata
import xml.etree.ElementTree as ET
import tkinter as tk
from tkinter import filedialog
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
from chat import ChatJob, chat_context, chat_models, main_chat_context
from history import History, difference, word_changes


VENDOR = Path(__file__).with_name('vendor')
ASSETS = {name: 'text/css' if name.endswith('.css') else 'text/javascript'
          for name in ('codemirror.js', 'codemirror.css', 'cobalt.css', 'dracula.css', 'monokai.css', 'nord.css', 'stex.js', 'vim.js', 'searchcursor.js', 'matchbrackets.js', 'comment.js', 'dialog.js', 'dialog.css', 'show-hint.js', 'show-hint.css', 'latex-hint.js', 'latex-hover.mjs', 'latex-chat.mjs', 'latex-history.mjs', 'latex-settings.mjs', 'latex-themes.mjs', 'latex-history.css')}
ASSETS.update({'history-tabs.mjs':'text/javascript','history-tabs.css':'text/css'})
ASSETS.update({name + '.css':'text/css' for name in ('eclipse', 'idea', 'neo', 'base16-light', 'solarized', 'material-darker', 'material-palenight', 'ayu-dark', 'gruvbox-dark')})
ASSETS.update({file.relative_to(VENDOR).as_posix(): {
    '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2',
}.get(file.suffix, 'application/octet-stream')
    for folder in ('pdfjs', 'katex') for file in (VENDOR / folder).rglob('*') if file.is_file()})


PAGE = r'''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>LaTeX Codex</title>
<link rel="stylesheet" href="/vendor/codemirror.css"><link rel="stylesheet" href="/vendor/dialog.css"><link rel="stylesheet" href="/vendor/cobalt.css">
<link rel="stylesheet" href="/vendor/history-tabs.css">
<link rel="stylesheet" href="/vendor/dracula.css"><link rel="stylesheet" href="/vendor/monokai.css"><link rel="stylesheet" href="/vendor/nord.css">
<link rel="stylesheet" href="/vendor/eclipse.css"><link rel="stylesheet" href="/vendor/idea.css"><link rel="stylesheet" href="/vendor/neo.css"><link rel="stylesheet" href="/vendor/base16-light.css"><link rel="stylesheet" href="/vendor/solarized.css"><link rel="stylesheet" href="/vendor/material-darker.css"><link rel="stylesheet" href="/vendor/material-palenight.css"><link rel="stylesheet" href="/vendor/ayu-dark.css"><link rel="stylesheet" href="/vendor/gruvbox-dark.css">
<link rel="stylesheet" href="/vendor/show-hint.css"><link rel="stylesheet" href="/vendor/latex-history.css">
<link rel="stylesheet" href="/vendor/pdfjs/web/pdf_viewer.css">
<link rel="stylesheet" href="/vendor/katex/katex.min.css">
<style>
:root{--quick-accent:#ff9d00;color-scheme:dark;--environment-command:#fff44f;--bg:#002240;--panel:#00172b;--border:#35516d;--text:#e4edf6;--muted:#93aeca;--math:#a5ff90;--operator:#ff80e1;--reference:#ff9d00;--command:#9effff;--environment:#c3a6ff;--number:#ffee80}
:root[data-theme=dracula]{--quick-accent:#bd93f9;--bg:#282a36;--panel:#21222c;--border:#44475a;--text:#f8f8f2;--muted:#99a7ce;--math:#50fa7b;--operator:#ff79c6;--reference:#ffb86c;--command:#8be9fd;--environment:#bd93f9;--number:#f1fa8c}
:root[data-theme=monokai]{--quick-accent:#a6e22e;--bg:#272822;--panel:#1e1f1c;--border:#49483e;--text:#f8f8f2;--muted:#a6a28c;--math:#a6e22e;--operator:#f92672;--reference:#fd971f;--command:#66d9ef;--environment:#ae81ff;--number:#e6db74}
:root[data-theme=nord]{--quick-accent:#88c0d0;--bg:#2e3440;--panel:#242933;--border:#4c566a;--text:#eceff4;--muted:#a4b0c3;--math:#a3be8c;--operator:#b48ead;--reference:#d08770;--command:#88c0d0;--environment:#81a1c1;--number:#ebcb8b}
:root[data-theme=eclipse]{--quick-accent:#7f0055;color-scheme:light;--environment-command:#8f5c00;--bg:#ffffff;--panel:#f5f7fa;--border:#d2dae2;--text:#242424;--muted:#536b57;--math:#237a37;--operator:#7f0055;--reference:#9a4f00;--command:#0000c0;--environment:#4f348f;--number:#164d30}
:root[data-theme=idea]{--quick-accent:#005cc5;color-scheme:light;--environment-command:#8f5c00;--bg:#ffffff;--panel:#f5f5f5;--border:#d6d6d6;--text:#202020;--muted:#686868;--math:#008000;--operator:#7f0055;--reference:#8c4b00;--command:#000080;--environment:#000080;--number:#0000ff}
:root[data-theme=neo]{--quick-accent:#047d65;color-scheme:light;--environment-command:#8f5c00;--bg:#ffffff;--panel:#f4f6f8;--border:#d7dee3;--text:#2e383c;--muted:#626b70;--math:#047d65;--operator:#75438a;--reference:#9c3328;--command:#1d75b3;--environment:#75438a;--number:#75438a}
:root[data-theme=base16-light]{--quick-accent:#9b4d19;color-scheme:light;--environment-command:#8f5c00;--bg:#f5f5f5;--panel:#eeeeee;--border:#d2d2d2;--text:#202020;--muted:#656565;--math:#486c27;--operator:#873976;--reference:#9b4d19;--command:#286884;--environment:#873976;--number:#873976}
:root[data-theme=solarized-light]{--quick-accent:#9c5600;color-scheme:light;--environment-command:#8f5c00;--bg:#fdf6e3;--panel:#eee8d5;--border:#d5ccb6;--text:#586e75;--muted:#586e75;--math:#567800;--operator:#b02665;--reference:#9c5600;--command:#176fba;--environment:#6c4fa0;--number:#6c4fa0}
:root[data-theme=material-darker]{--quick-accent:#c792ea;--bg:#212121;--panel:#191919;--border:#454545;--text:#eeffff;--muted:#a0a0a0;--math:#c3e88d;--operator:#c792ea;--reference:#f78c6c;--command:#89ddff;--environment:#c792ea;--number:#ffcb6b}
:root[data-theme=material-palenight]{--quick-accent:#c792ea;--bg:#292d3e;--panel:#232738;--border:#494f68;--text:#d5d9ee;--muted:#a6accd;--math:#c3e88d;--operator:#c792ea;--reference:#f78c6c;--command:#89ddff;--environment:#c792ea;--number:#ffcb6b}
:root[data-theme=ayu-dark]{--quick-accent:#e6b450;--bg:#0a0e14;--panel:#111820;--border:#2b3b4b;--text:#b3b1ad;--muted:#9aa1aa;--math:#c2d94c;--operator:#f07178;--reference:#ff8f40;--command:#39bae6;--environment:#ae81ff;--number:#e6b450}
:root[data-theme=gruvbox-dark]{--quick-accent:#fabd2f;--bg:#282828;--panel:#1d2021;--border:#504945;--text:#ebdbb2;--muted:#bdae93;--math:#b8bb26;--operator:#d3869b;--reference:#fe8019;--command:#83a598;--environment:#d3869b;--number:#fabd2f}
:root[data-theme=solarized-dark]{--quick-accent:#d6b447;--bg:#002b36;--panel:#073642;--border:#345b65;--text:#93a1a1;--muted:#839496;--math:#b7c951;--operator:#e578aa;--reference:#ff9460;--command:#5ab6ee;--environment:#b6a3e8;--number:#d6b447}
*{box-sizing:border-box}body{margin:0;height:100vh;display:flex;flex-direction:column;background:var(--panel);color:var(--text);font:14px system-ui,sans-serif}
header{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap}
strong{font-size:17px}button,a,select{font:inherit}button,select{border:1px solid var(--border);border-radius:6px;padding:6px 12px;background:var(--bg);color:var(--text);cursor:pointer}button:hover,select:hover{border-color:var(--command)}button:disabled{opacity:.55;cursor:default}
button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid var(--command)}a{color:var(--reference)}#status{flex:1;color:var(--muted)}#app-toolbar{padding:4px 12px;gap:8px;min-height:36px}#app-toolbar button{padding:4px 9px}#app-toolbar #settings-menu-button{width:28px;padding:4px}
main{position:relative;display:grid;grid-template-columns:minmax(0,var(--source-share,1fr)) 6px minmax(0,var(--pdf-share,1fr));flex:1;min-height:0;background:var(--border)}
.sync-rail{position:relative;background:var(--panel)}#splitter{position:absolute;inset:0;cursor:col-resize;touch-action:none;z-index:2}#splitter::before{content:'';position:absolute;inset:0 -3px}#splitter:hover,#splitter:focus-visible,main.resizing #splitter{background:var(--command)}main.resizing,main.resizing *{cursor:col-resize!important;user-select:none!important}#splitter:focus-visible{outline:2px solid var(--command)}#forward{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;padding:3px 0;width:22px;font-size:18px}
main>section{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg)}label,.caption{padding:9px 14px;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.source-caption{display:flex;align-items:center}.source-caption label{flex:1;min-width:0}
.pdf-toolbar{display:flex;align-items:center;gap:5px;padding:3px 8px;overflow-x:auto;flex-shrink:0}.pdf-toolbar button{padding:3px 8px;white-space:nowrap}
#pan-mode{display:inline-flex;align-items:center;gap:5px}#pan-mode[aria-pressed=true] .pan-select-icon,#pan-mode[aria-pressed=false] .pan-hand-icon{display:none}
#pan-hint{font-size:12px;color:var(--muted);white-space:nowrap;animation:pan-hint-fade 2.5s ease forwards}
@keyframes pan-hint-fade{0%,75%{opacity:1}100%{opacity:0}}
.compile-group{display:inline-flex;flex-shrink:0}.compile-group #compile{border-radius:999px 0 0 999px;border-right:0}.compile-group #compile-menu-button{display:grid;place-items:center;width:22px;padding:3px 3px;border-radius:0 999px 999px 0;background:#15803d;border-color:#22c55e;border-left-color:#166534;color:#fff}.compile-group #compile-menu-button:hover{background:#166534}.compile-group #compile-menu-button .toolbar-icon{width:14px;height:14px}#compile-menu{width:200px}#compile-menu label{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:6px;color:var(--text);font-size:13px}#auto-compile{accent-color:#15803d;cursor:pointer}
#compile{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:110px;padding:3px 10px;font-size:13px;background:#15803d;border-color:#22c55e;color:#fff;font-weight:600}#compile:hover:not(:disabled){background:#166534}#compile[aria-busy=true]{opacity:1;cursor:wait}
#compile::before{content:'';display:none;width:14px;height:14px;border:2px solid #ffffff55;border-top-color:#fff;border-radius:50%;animation:compile-spin .8s linear infinite}#compile[aria-busy=true]::before{display:block}.compile-busy,#compile[aria-busy=true] .compile-idle{display:none}#compile[aria-busy=true] .compile-busy{display:inline}
@keyframes compile-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#compile::before{animation:none}}
#log-toggle{margin-right:auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:4px}#log-toggle[aria-pressed=true]{background:var(--border);color:var(--command)}.pdf-toolbar[data-log-view=true] :is(#pan-mode,#pan-hint,#zoom-out,#zoom-fit,#zoom-in){display:none}
.preview-shell{position:relative;flex:1;min-height:0}#preview{position:absolute;inset:0;overflow:auto;background:var(--panel)}
#preview.hand-tool{cursor:grab;user-select:none}#preview.hand-tool .textLayer{pointer-events:none}#preview.dragging{cursor:grabbing}
.CodeMirror{flex:1;min-height:0;height:100%;border-top:1px solid var(--border);font:14px/1.65 Consolas,monospace}.CodeMirror.CodeMirror{background:var(--bg);color:var(--text);line-height:1.65}.CodeMirror .CodeMirror-gutters{background:var(--bg);border-right-color:var(--border)}.CodeMirror .CodeMirror-cursor{border-left:1px solid var(--text)}.CodeMirror-lines{padding:12px 0}.CodeMirror-focused{outline:2px solid var(--border);outline-offset:-2px}
.CodeMirror .compile-error-line{background:#ef444440;box-shadow:inset 3px 0 #ff6262}.CodeMirror .compile-error-gutter{background:#9f2525;color:#fff}
.CodeMirror-hints{background:var(--panel);border-color:var(--border);font:14px/1.6 Consolas,monospace;max-height:260px;padding:4px}.CodeMirror-hints .CodeMirror-hint{color:var(--text);padding:3px 12px}.CodeMirror-hints .CodeMirror-hint-active{background:var(--border);color:var(--command)}
#math-hover{position:fixed;z-index:1000;max-width:calc(100vw - 24px);max-height:min(60vh,360px);overflow:auto;padding:12px 16px;border:1px solid #ccd4de;border-radius:8px;background:#fff;color:#17202b;color-scheme:light;box-shadow:0 6px 24px #0004;font-size:17px}#math-hover .katex-display{margin:.35em 0}#math-hover .katex-display>.katex:has(>.tag){padding-right:3.5em}#math-hover .math-hover-error{font:13px system-ui,sans-serif}
:is(#editor-menu,#pdf-menu){position:fixed;inset:auto;margin:0;padding:4px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);box-shadow:0 6px 20px #0005}:is(#editor-menu,#pdf-menu) button{display:flex;align-items:center;gap:24px;border:0;width:100%;text-align:left}:is(#editor-menu,#pdf-menu) button:hover{background:var(--border)}#editor-menu kbd{font:12px system-ui,sans-serif;color:var(--muted)}
.CodeMirror span.cm-math{color:var(--math)}.CodeMirror span.cm-operator{color:var(--operator)}.CodeMirror span.cm-reference{color:var(--reference)}.CodeMirror span.cm-tag{color:var(--command)}.CodeMirror span.cm-atom{color:var(--environment)}.CodeMirror span.cm-environment{color:var(--environment-command)}.CodeMirror span.cm-number{color:var(--number)}.CodeMirror span.cm-comment,.CodeMirror .CodeMirror-linenumber{color:var(--muted)}
#preview .page{box-sizing:content-box}.sync-highlight{position:absolute;z-index:5;pointer-events:none;background:rgba(255,244,168,.75);mix-blend-mode:multiply;border-radius:2px}details{padding:10px 16px;background:var(--panel)}#log{position:absolute;inset:0;margin:0;padding:16px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--panel);color:var(--text);font:13px/1.6 Consolas,monospace}
@media(max-width:640px){main{grid-template-columns:1fr;overflow:auto}main>section{min-height:50vh}.sync-rail{min-height:24px}#splitter{display:none}#status{min-width:45%}}

#settings-menu .theme-setting{padding:8px}#settings-menu .theme-setting-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}#settings-menu .theme-setting-heading label{padding:0}#theme-customize{padding:3px;display:grid;place-items:center;border:0;background:transparent;color:var(--muted)}#theme-customize .toolbar-icon{width:15px;height:15px}
#theme-dialog{width:min(680px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;border:1px solid var(--border);border-radius:18px;padding:22px;background:var(--panel);color:var(--text);box-shadow:0 24px 80px #0005}#theme-dialog::backdrop{background:#0006;backdrop-filter:blur(3px)}.theme-dialog-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.theme-dialog-heading button{border:0;background:transparent;font-size:20px;padding:0 6px}.theme-help{color:var(--muted);font-size:13px;line-height:1.6}.theme-upload{display:flex;align-items:center;gap:12px;padding:12px;border:1px dashed var(--border);border-radius:10px;color:var(--text);white-space:normal}#theme-image{max-width:100%;min-width:0;font-size:12px}#theme-screenshot{display:block;max-width:100%;max-height:100px;object-fit:contain;margin:10px auto;border-radius:8px}#theme-screenshot[hidden]{display:none}.theme-generate-row{display:flex;align-items:center;gap:12px;margin:14px 0}#theme-status{font-size:12px;color:var(--muted)}#theme-generate{white-space:nowrap}.theme-name-label{display:block;padding:0 0 6px}#theme-name{width:100%;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px;font:inherit}.theme-palette-label{font-size:12px;color:var(--muted);margin:12px 0 8px}#theme-palette{display:flex;flex-wrap:wrap;gap:6px}#theme-palette button{display:flex;align-items:center;gap:6px;padding:4px 7px;font:11px Consolas,monospace}#theme-palette button[aria-pressed=true]{outline:2px solid var(--command);outline-offset:1px}.theme-palette-color{width:18px;height:18px;border:1px solid #8886;border-radius:4px}#theme-swatches{display:flex;flex-wrap:wrap;gap:18px;margin:12px 0}#theme-swatches label{display:flex;align-items:center;gap:6px;padding:0}#theme-swatches input{width:32px;height:28px;padding:0;border:0;background:transparent;cursor:pointer}#theme-sample{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:12px;overflow:hidden;padding-bottom:16px}.theme-sample-bar{background:var(--panel);border-bottom:1px solid var(--border);padding:8px 14px;font-size:12px;color:var(--muted)}#theme-sample pre{padding:0 16px;white-space:pre-wrap;font:13px/1.7 Consolas,monospace}.theme-sample-capsule{margin:0 16px;max-width:320px;padding:8px 10px 8px 16px;border:1px solid var(--border);border-radius:999px;display:flex;align-items:center;justify-content:space-between;color:var(--muted);box-shadow:0 4px 16px #0001}.theme-sample-send{background:var(--quick-accent);color:var(--quick-foreground,var(--bg));border-radius:50%;width:28px;height:28px;display:grid;place-items:center;font-size:20px}.theme-dialog-actions{display:flex;justify-content:flex-end;margin-top:16px}.cm-s-custom .CodeMirror-selected{background:color-mix(in srgb,var(--command) 18%,var(--bg))}.cm-s-custom .CodeMirror-activeline-background{background:var(--panel)}.cm-s-custom .cm-keyword,.cm-s-custom .cm-def{color:var(--command)}.cm-s-custom .cm-string,.cm-s-custom .cm-variable-2{color:var(--math)}

.theme-palette-layout{display:grid;grid-template-columns:180px minmax(0,1fr);gap:14px;align-items:center}.theme-wheel-shell{display:flex;flex-direction:column;align-items:center;gap:8px}.theme-wheel-shell small{color:var(--muted);font-size:10px;text-align:center}#theme-wheel{position:relative;width:160px;height:160px;border:1px solid var(--border);border-radius:50%;background:radial-gradient(circle,transparent 40%,var(--border) 41%,transparent 42%)}#theme-wheel::after{content:'';position:absolute;inset:30px;border:1px dashed var(--border);border-radius:50%;pointer-events:none}#theme-wheel button{position:absolute;width:20px;height:20px;padding:0;transform:translate(-50%,-50%);border:1px solid #8888;border-radius:50%;z-index:1;box-shadow:0 1px 3px #0003}#theme-neutrals{display:flex;gap:4px;flex-wrap:wrap;justify-content:center}#theme-neutrals button{width:20px;height:20px;padding:0;border:1px solid #8888;border-radius:50%}#theme-wheel button:focus-visible,#theme-neutrals button:focus-visible{outline:2px solid var(--command);outline-offset:3px}#theme-palette{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}#theme-palette button{text-align:left;min-width:0;padding:6px 7px}#theme-palette .theme-palette-color{flex-shrink:0;width:24px;height:24px}#theme-palette button>span:last-child{min-width:0}#theme-palette small{display:block;font:10px/1.4 system-ui,sans-serif;color:var(--muted);white-space:normal;margin-top:2px}.theme-role-settings{margin:12px 0}.theme-role-settings summary{font-size:12px;cursor:pointer;color:var(--muted)}#theme-swatches{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#theme-swatches label{justify-content:space-between;font-size:11px}@media(max-width:580px){.theme-palette-layout{grid-template-columns:1fr}#theme-swatches{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
<style>
#chat-panel{position:absolute;right:0;top:0;bottom:0;z-index:20;width:min(460px,48%);display:flex;flex-direction:column;background:var(--panel);border-left:1px solid var(--border);box-shadow:-8px 0 24px #0004}
#chat-panel[hidden],#chat-panel [hidden]{display:none}#chat-panel .chat-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border)}#chat-panel .chat-bar strong{flex:1;font-size:14px}#chat-panel button{font-size:12px;padding:5px 9px}
#chat-panel #chat-color{width:25px;height:25px;padding:0;flex:none;border-radius:50%;border:2px solid var(--text);background:transparent}#chat-color[data-color=""]::after{content:'∅';font-size:18px}#chat-colors{position:fixed;inset:auto;margin:0;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);z-index:30}#chat-colors button{margin:3px;padding:5px 9px}#chat-colors button[aria-pressed=true]{outline:2px solid var(--command)}#chat-context{display:block;margin-top:6px;color:var(--muted)}
#chat-panel details{padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px}#chat-panel pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;font:12px/1.5 Consolas,monospace;max-height:140px;overflow:auto}
#chat-messages{flex:1;min-height:60px;overflow:auto;padding:12px}.chat-message{margin-bottom:14px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}.chat-message b{display:block;font-size:12px;color:var(--command);margin-bottom:4px}
#chat-status{padding:6px 12px;font-size:12px;color:var(--muted)}#chat-proposal{padding:8px 12px;background:var(--bg);border-top:1px solid var(--border)}#chat-apply,#chat-send{background:#176f49;border-color:#329b72;color:white}
#chat-form{padding:10px 12px;border-top:1px solid var(--border)}#chat-form label{display:block;padding:0 0 5px}#chat-input{display:block;width:100%;resize:vertical;min-height:70px;max-height:200px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px;font:14px/1.5 system-ui}#chat-form .chat-actions{display:flex;align-items:center;gap:8px;margin-top:8px}#chat-form small{flex:1;color:var(--muted);font-size:11px}.CodeMirror .chat-selection{background:#88c0d030;outline:1px solid #88c0d080}
#chat-settings{display:flex;gap:8px;margin-bottom:8px}#chat-settings label{flex:1;min-width:0;font-size:12px;color:var(--muted)}#chat-settings select{display:block;width:100%;margin-top:4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:5px}#chat-model-status{display:block;margin-bottom:6px}
#chat-quick{position:fixed;inset:auto;margin:0;width:min(320px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;padding:0;border:1px solid var(--border);border-radius:24px;background:var(--bg);color:var(--text);box-shadow:0 8px 30px #0003;font:14px/22px system-ui;transition:width .4s cubic-bezier(.22,1.15,.36,1),border-color .2s,box-shadow .2s}
#chat-quick[data-expanded=true]{width:min(480px,calc(100vw - 16px))}#chat-quick:focus-within{border-color:var(--quick-accent);box-shadow:0 8px 30px #0003,0 0 0 3px color-mix(in srgb,var(--quick-accent) 12%,transparent)}
#chat-quick-form{position:relative;height:48px;transition:height .15s ease-out}#chat-quick-input{display:block;width:100%;height:48px;resize:none;padding:13px 48px 13px 16px;border:0;outline:0;background:transparent;color:var(--text);font:14px/22px system-ui;scrollbar-width:thin;scrollbar-color:transparent transparent;mask-image:linear-gradient(transparent,#000 5px,#000 calc(100% - 5px),transparent)}#chat-quick[data-expanded=true] #chat-quick-input{padding:12px 16px 10px}#chat-quick-input:hover{scrollbar-color:var(--border) transparent}#chat-quick-input::placeholder{color:var(--muted)}
#chat-quick-toolbar{position:absolute;bottom:8px;left:12px;right:48px;display:flex;align-items:center;gap:4px;height:32px;opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity .2s,transform .3s,visibility .2s}#chat-quick[data-expanded=true] #chat-quick-toolbar{opacity:1;visibility:visible;transform:none}
#chat-quick-send{position:absolute;bottom:8px;right:8px;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:var(--quick-accent);color:var(--quick-foreground,var(--bg));transition:background .2s,transform .3s}#chat-quick-send:hover:not(:disabled){transform:scale(1.06)}#chat-quick-send svg{width:20px;height:20px}
#chat-quick-brain,#chat-quick-effort{display:flex;align-items:center;gap:6px;height:28px;min-width:0;padding:0 6px;border:0;border-radius:14px;background:transparent;color:var(--muted);font:12px system-ui;transition:background .2s,color .2s}#chat-quick-brain{max-width:65%}#chat-quick-brain svg{flex-shrink:0;width:16px;height:16px}#chat-quick-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;animation:quick-label-in .3s ease-out}#chat-quick-effort-name{white-space:nowrap}#chat-quick-brain:hover:not(:disabled),#chat-quick-brain[aria-expanded=true],#chat-quick-effort:hover:not(:disabled){background:color-mix(in srgb,var(--quick-accent) 10%,transparent);color:var(--quick-accent)}
.quick-effort-bars{display:flex;align-items:flex-end;gap:2px;height:13px}.quick-effort-bars i{width:3px;border-radius:2px;background:currentColor;opacity:.25}.quick-effort-bars i:nth-child(1){height:5px}.quick-effort-bars i:nth-child(2){height:9px}.quick-effort-bars i:nth-child(3){height:13px}#chat-quick-effort[data-level="1"] i:nth-child(1),#chat-quick-effort[data-level="2"] i:nth-child(-n+2),#chat-quick-effort[data-level="3"] i{opacity:1}
#chat-quick button:focus-visible{outline:2px solid var(--quick-accent);outline-offset:2px}#chat-quick-status{padding:0 16px 12px;font-size:12px;white-space:pre-wrap;color:var(--muted)}#chat-quick-status[data-error=true]{color:light-dark(#b42318,#f87171)}#chat-quick-status:empty{display:none}#chat-quick-send[aria-busy=true]{opacity:1;cursor:wait}#chat-quick-send[aria-busy=true] svg{display:none}#chat-quick-send[aria-busy=true]::before{content:"";width:16px;height:16px;border:2.5px solid color-mix(in srgb,currentColor 30%,transparent);border-top-color:currentColor;border-radius:50%;animation:compile-spin .75s linear infinite}
#chat-quick-handle{position:absolute;z-index:1;top:0;left:0;display:grid;place-items:center;width:100%;height:7px;padding:0;border:0;border-radius:24px 24px 0 0;background:transparent;cursor:grab;touch-action:none;user-select:none}#chat-quick-handle::before{content:"";display:block;width:32px;height:3px;margin:0;border-radius:999px;background:var(--quick-accent);opacity:0;transform:scaleX(.75);transition:opacity .15s,transform .15s}#chat-quick-handle:hover::before,#chat-quick-handle:focus-visible::before,#chat-quick[data-dragging=true] #chat-quick-handle::before{opacity:1;transform:scaleX(1)}#chat-quick[data-dragging=true] #chat-quick-handle{cursor:grabbing}
#chat-quick-settings{position:fixed;inset:auto;margin:0;width:min(352px,calc(100vw - 16px));padding:6px;overflow:auto;border:1px solid var(--border);border-radius:18px;background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(12px);color:var(--text);box-shadow:0 12px 32px #0004;font:12px/1.5 system-ui}#chat-quick-settings .quick-settings-columns{display:flex;gap:6px}#chat-quick-models{flex:3;min-width:0}#chat-quick-efforts{flex:2;min-width:0;padding-left:6px;border-left:1px solid var(--border)}#chat-quick-settings button{display:block;width:100%;padding:6px 8px;border:0;border-radius:12px;background:transparent;color:var(--muted);text-align:left;white-space:nowrap;transition:background .15s,color .15s}#chat-quick-settings button:hover,#chat-quick-settings button[aria-pressed=true]{background:color-mix(in srgb,var(--quick-accent) 10%,transparent);color:var(--quick-accent)}#chat-quick-model-status{font-size:11px;color:var(--muted)}#chat-quick-model-status:empty{display:none}
@keyframes quick-label-in{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){#chat-quick,#chat-quick-form,#chat-quick-toolbar,#chat-quick button,#chat-quick-handle::before{transition:none}#chat-quick-model-name,#chat-quick-send[aria-busy=true]::before{animation:none}}

</style>
<header id="app-toolbar"><button id="file-menu-button" class="icon-button" aria-label="文件" data-i18n-aria-label="文件" title="文件" data-i18n-title="文件" popovertarget="file-menu" aria-expanded="false"><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H5v20h14V7zM14 2v6h5"/></svg></button><span id="status" role="status" aria-live="polite">正在打开…</span>
<button id="history-open" class="icon-button" disabled><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/></svg><span data-i18n="历史">历史</span></button><button id="settings-menu-button" class="icon-button" popovertarget="settings-menu" aria-label="设置" data-i18n-aria-label="设置" title="设置" data-i18n-title="设置" aria-expanded="false"><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 1-2h4l1 2 2 1 2-.2 2 3-1 2v3l1 2-2 3-2-.2-2 1-1 3h-4l-1-3-2-1-2 .2-2-3 1-2V9L3 7l2-3 2 .2z" transform="translate(0 1) scale(1 .95)"/><circle cx="12" cy="11" r="3"/></svg></button></header>
<div id="file-menu" class="toolbar-menu" popover="auto" aria-label="文件" data-i18n-aria-label="文件"><button id="open" data-i18n="打开文件">打开文件</button><button id="reload" data-i18n="重新读取文件">重新读取文件</button><a href="/pdf" download="document.pdf" data-i18n="下载 PDF">下载 PDF</a></div>
<div id="settings-menu" class="toolbar-menu" popover="auto" aria-label="设置" data-i18n-aria-label="设置"><label for="language"><span data-i18n="语言">语言</span><select id="language" aria-label="语言" data-i18n-aria-label="语言"><option value="system" data-i18n="跟随系统">跟随系统</option><option value="zh-CN" data-i18n="简体中文">简体中文</option><option value="en">English</option></select></label><label for="editor-mode"><span data-i18n="编辑模式">编辑模式</span><select id="editor-mode" aria-label="编辑模式" data-i18n-aria-label="编辑模式"><option value="vim">Vim</option><option value="default" data-i18n="普通编辑">普通编辑</option></select></label><div class="theme-setting"><div class="theme-setting-heading"><label for="theme" data-i18n="配色">配色</label><button id="theme-customize" class="icon-button" aria-label="截图生成主题" data-i18n-aria-label="截图生成主题" title="截图生成主题" data-i18n-title="截图生成主题"><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 1-2h4l1 2 2 1 2-.2 2 3-1 2v3l1 2-2 3-2-.2-2 1-1 3h-4l-1-3-2-1-2 .2-2-3 1-2V9L3 7l2-3 2 .2z" transform="translate(0 1) scale(1 .95)"/><circle cx="12" cy="11" r="3"/></svg></button></div><select id="theme" aria-label="配色" data-i18n-aria-label="配色"><optgroup label="浅色" data-i18n-label="浅色"><option value="eclipse" data-i18n="Eclipse · 白底">Eclipse · 白底</option><option value="idea" data-i18n="IDEA · 白底">IDEA · 白底</option><option value="neo" data-i18n="Neo · 简洁白">Neo · 简洁白</option><option value="base16-light" data-i18n="Base16 · 浅灰">Base16 · 浅灰</option><option value="solarized-light" data-i18n="Solarized · 暖白">Solarized · 暖白</option></optgroup><optgroup label="深色" data-i18n-label="深色"><option value="cobalt" data-i18n="Cobalt · 深蓝">Cobalt · 深蓝</option><option value="dracula" data-i18n="Dracula · 紫灰">Dracula · 紫灰</option><option value="monokai" data-i18n="Monokai · 炭黑">Monokai · 炭黑</option><option value="nord" data-i18n="Nord · 冷灰">Nord · 冷灰</option><option value="material-darker" data-i18n="Material · 深灰">Material · 深灰</option><option value="material-palenight" data-i18n="Palenight · 蓝紫">Palenight · 蓝紫</option><option value="ayu-dark" data-i18n="Ayu · 深夜">Ayu · 深夜</option><option value="gruvbox-dark" data-i18n="Gruvbox · 暖黑">Gruvbox · 暖黑</option><option value="solarized-dark" data-i18n="Solarized · 深青">Solarized · 深青</option></optgroup></select></div><label for="revision-color"><span data-i18n="当前用户修订色">当前用户修订色</span><select id="revision-color" aria-label="当前用户修订色" data-i18n-aria-label="当前用户修订色"><option value="orange" data-i18n="橙色">橙色</option><option value="blue" data-i18n="蓝色">蓝色</option><option value="purple" data-i18n="紫色">紫色</option><option value="green" data-i18n="绿色">绿色</option><option value="red" data-i18n="红色">红色</option></select></label></div>
<dialog id="theme-dialog" aria-labelledby="theme-dialog-title">
<div class="theme-dialog-heading"><strong id="theme-dialog-title" data-i18n="截图生成主题">截图生成主题</strong><button id="theme-close" aria-label="关闭" data-i18n-aria-label="关闭">×</button></div>
<a href="https://21st.dev/community/themes" target="_blank" rel="noopener noreferrer">21st.dev / Community Themes ↗</a>
<p class="theme-help" data-i18n="截取带色块的主题卡片，上传或在此粘贴截图。">截取带色块的主题卡片，上传或在此粘贴截图。</p>
<label class="theme-upload"><span data-i18n="上传截图">上传截图</span><input id="theme-image" type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传截图" data-i18n-aria-label="上传截图"></label>
<img id="theme-screenshot" alt="主题截图" data-i18n-alt="主题截图" hidden>
<div class="theme-generate-row"><button id="theme-generate" disabled data-i18n="生成配色">生成配色</button><span id="theme-status" role="status" aria-live="polite"></span></div>
<div id="theme-generated" hidden><label class="theme-name-label" for="theme-name" data-i18n="主题名称">主题名称</label><input id="theme-name" maxlength="60" required placeholder="例如：Modern Minimal" data-i18n-placeholder="例如：Modern Minimal"><p class="theme-palette-label" data-i18n="识别出的配色 · 点击色块设为背景">识别出的配色 · 点击色块设为背景</p><div class="theme-palette-layout"><div class="theme-wheel-shell"><div id="theme-wheel" role="group" aria-label="色盘" data-i18n-aria-label="色盘"></div><div id="theme-neutrals" role="group" aria-label="中性色" data-i18n-aria-label="中性色"></div><small data-i18n="色相位置 · 中性色按明暗排列">色相位置 · 中性色按明暗排列</small></div><div id="theme-palette" role="group" aria-label="识别出的配色" data-i18n-aria-label="识别出的配色"></div></div><details class="theme-role-settings"><summary data-i18n="语法配色 · 可逐项微调">语法配色 · 可逐项微调</summary><div id="theme-swatches"></div></details>
<div id="theme-sample"><div class="theme-sample-bar" data-i18n="配色预览">配色预览</div><pre><span style="color:var(--command)">\section</span>{Introduction}
<span style="color:var(--muted)">% LaTeX Codex</span>
<span style="color:var(--environment-command)">\begin</span>{<span style="color:var(--environment)">equation</span>}
  <span style="color:var(--math)">A</span> <span style="color:var(--operator)">=</span> <span style="color:var(--number)">2</span><span style="color:var(--math)">x</span>
<span style="color:var(--environment-command)">\end</span>{<span style="color:var(--environment)">equation</span>}
<span style="color:var(--command)">\cite</span>{<span style="color:var(--reference)">example2026</span>}</pre><div class="theme-sample-capsule"><span data-i18n="询问 Codex…">询问 Codex…</span><span class="theme-sample-send" aria-hidden="true">↑</span></div></div>
</div><div class="theme-dialog-actions"><button id="theme-save" disabled data-i18n="保存并使用">保存并使用</button></div></dialog>
<main><section><div class="source-caption"><label id="filename" for="source" data-i18n="LaTeX 源码">LaTeX 源码</label></div><textarea id="source" spellcheck="false" disabled aria-label="LaTeX 源码" data-i18n-aria-label="LaTeX 源码"></textarea></section>
<div class="sync-rail"><div id="splitter" role="separator" tabindex="0" aria-label="调整 LaTeX 和 PDF 宽度" data-i18n-aria-label="调整 LaTeX 和 PDF 宽度" aria-orientation="vertical" aria-valuemin="15" aria-valuemax="85" aria-valuenow="50" title="拖动调整宽度 · 双击恢复各半" data-i18n-title="拖动调整宽度 · 双击恢复各半"></div><button id="forward" disabled aria-label="定位光标到 PDF" data-i18n-aria-label="定位光标到 PDF" title="跳到光标对应的 PDF 位置" data-i18n-title="跳到光标对应的 PDF 位置">→</button></div>
<section><div class="pdf-toolbar"><div class="compile-group"><button id="compile" aria-busy="false" disabled><span class="compile-idle" data-i18n="保存并编译">保存并编译</span><span class="compile-busy" data-i18n="正在编译…">正在编译…</span></button><button id="compile-menu-button" popovertarget="compile-menu" aria-label="编译选项" data-i18n-aria-label="编译选项" title="编译选项" data-i18n-title="编译选项" aria-expanded="false"><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg></button></div><div id="compile-menu" class="toolbar-menu" popover="auto" aria-label="编译选项" data-i18n-aria-label="编译选项"><label for="auto-compile"><span data-i18n="自动编译">自动编译</span><input id="auto-compile" type="checkbox" checked aria-label="自动编译" data-i18n-aria-label="自动编译"></label></div><button id="log-toggle" aria-label="编译日志" data-i18n-aria-label="编译日志" title="编译日志" data-i18n-title="编译日志" aria-pressed="false" aria-controls="log"><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h8"/></svg></button><span id="pan-hint" role="status" hidden data-i18n="按住空格拖动 PDF">按住空格拖动 PDF</span><button id="pan-mode" aria-pressed="true" title="切换拖动页面与选择文字" data-i18n-title="切换拖动页面与选择文字" ><svg class="toolbar-icon pan-hand-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 11V7a2 2 0 0 0-4 0v3M14 10V5a2 2 0 0 0-4 0v6M10 10.5V7a2 2 0 0 0-4 0v5l-1-1a2 2 0 0 0-3 2l4 6a6 6 0 0 0 5 3h3a6 6 0 0 0 6-6v-3a2 2 0 0 0-4 0v1"/></svg><svg class="toolbar-icon pan-select-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m4 3 15 10-7 1-4 7Z"/></svg><span id="pan-label" data-i18n="拖动">拖动</span></button><button id="zoom-out" aria-label="缩小 PDF" data-i18n-aria-label="缩小 PDF" title="缩小 PDF" data-i18n-title="缩小 PDF">−</button><button id="zoom-fit" aria-label="适合宽度" data-i18n-aria-label="适合宽度" title="恢复适合宽度" data-i18n-title="恢复适合宽度">100%</button><button id="zoom-in" aria-label="放大 PDF" data-i18n-aria-label="放大 PDF" title="放大 PDF" data-i18n-title="放大 PDF">+</button></div><div class="preview-shell"><div id="preview" class="hand-tool" role="region" aria-label="编译后的 PDF" data-i18n-aria-label="编译后的 PDF" tabindex="0"><div id="pdf-viewer" class="pdfViewer"></div></div><pre id="log" hidden tabindex="0" role="region" aria-label="编译日志" data-i18n-aria-label="编译日志"></pre></div></section></main>
<aside id="chat-panel" role="dialog" aria-label="项目侧边聊天" data-i18n-aria-label="项目侧边聊天" hidden>
<div class="chat-bar"><strong data-i18n="Codex · 项目对话">Codex · 项目对话</strong><button id="chat-color" data-color="" aria-label="修改标记颜色：无" data-i18n-aria-label="修改标记颜色：无" title="修改标记颜色：无" data-i18n-title="修改标记颜色：无" popovertarget="chat-colors"></button><button id="chat-end" data-i18n="新对话">新对话</button><button id="chat-close" aria-label="收起项目对话" data-i18n-aria-label="收起项目对话">×</button></div>
<details><summary data-i18n="当前选区与上下文">当前选区与上下文</summary><pre id="chat-selection"></pre><button id="chat-use-selection" data-i18n="使用当前选区">使用当前选区</button><small id="chat-context" data-i18n="携带论文全文；正在读取主对话…">携带论文全文；正在读取主对话…</small></details>
<div id="chat-messages" role="log" aria-label="对话记录" data-i18n-aria-label="对话记录" aria-live="polite"></div>
<div id="chat-proposal" hidden><strong data-i18n="选区修改建议">选区修改建议</strong><pre id="chat-replacement"></pre><button id="chat-apply" data-i18n="应用到选区">应用到选区</button></div>
<div id="chat-status" role="status"></div>
<form id="chat-form"><div id="chat-settings"><label for="chat-model"><span data-i18n="模型">模型</span><select id="chat-model"><option value="" data-i18n="跟随 Codex 默认">跟随 Codex 默认</option></select></label><label for="chat-effort"><span data-i18n="思考等级">思考等级</span><select id="chat-effort" disabled><option value="" data-i18n="跟随默认">跟随默认</option></select></label></div><small id="chat-model-status" role="status"></small><label for="chat-input" data-i18n="修改要求或问题">修改要求或问题</label><textarea id="chat-input" placeholder="例如：润色这段文字，保留公式和引用" data-i18n-placeholder="例如：润色这段文字，保留公式和引用"></textarea><div class="chat-actions"><small data-i18n="项目记忆自动保存 · Ctrl+Enter 发送">项目记忆自动保存 · Ctrl+Enter 发送</small><button id="chat-stop" type="button" hidden data-i18n="停止">停止</button><button id="chat-send" type="submit" data-i18n="发送">发送</button></div></form>
</aside>
<div id="chat-colors" popover="auto" aria-label="修改标记颜色" data-i18n-aria-label="修改标记颜色"></div>
<div id="chat-quick" popover="auto" role="dialog" aria-label="Codex 悬浮对话" data-i18n-aria-label="Codex 悬浮对话"><button id="chat-quick-handle" type="button" aria-label="拖动悬浮对话框" data-i18n-aria-label="拖动悬浮对话框" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"></button><form id="chat-quick-form"><textarea id="chat-quick-input" aria-label="悬浮对话输入" data-i18n-aria-label="悬浮对话输入" placeholder="询问 Codex…" data-i18n-placeholder="询问 Codex…" rows="1"></textarea><div id="chat-quick-toolbar"><button id="chat-quick-brain" type="button" popovertarget="chat-quick-settings" aria-label="选择模型和思考等级" data-i18n-aria-label="选择模型和思考等级" aria-expanded="false" title="选择模型和思考等级" data-i18n-title="选择模型和思考等级"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 18V5a3 3 0 0 0-5.8-1A4 4 0 0 0 3 10a4 4 0 0 0 .5 7A4 4 0 0 0 12 18Zm0 0V5a3 3 0 0 1 5.8-1A4 4 0 0 1 21 10a4 4 0 0 1-.5 7A4 4 0 0 1 12 18M8 8c-2 0-3-1-3-2m3 8c-2 0-3 1-3 3m11-9c2 0 3-1 3-2m-3 8c2 0 3 1 3 3"/></svg><span id="chat-quick-model-name"></span></button><button id="chat-quick-effort" type="button" aria-label="思考等级"><span class="quick-effort-bars" aria-hidden="true"><i></i><i></i><i></i></span><span id="chat-quick-effort-name"></span></button></div><button id="chat-quick-send" type="submit" aria-label="发送" data-i18n-aria-label="发送" title="发送 · Ctrl+Enter" data-i18n-title="发送 · Ctrl+Enter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 18V6M6.5 11.5 12 6l5.5 5.5"/></svg></button></form><div id="chat-quick-status" role="status"></div><div id="chat-quick-settings" popover="auto" role="group" aria-label="模型和思考等级" data-i18n-aria-label="模型和思考等级"><div class="quick-settings-columns"><div id="chat-quick-models" role="group" aria-label="模型" data-i18n-aria-label="模型"></div><div id="chat-quick-efforts" role="group" aria-label="思考等级" data-i18n-aria-label="思考等级" hidden></div></div><div id="chat-quick-model-status" role="status"></div></div></div>
<div id="editor-menu" popover="auto" role="menu" aria-label="源码操作" data-i18n-aria-label="源码操作"><button id="toggle-comment" role="menuitem" aria-keyshortcuts="Alt+/ Control+/ Meta+/"><span data-i18n="注释 / 取消注释">注释 / 取消注释</span><kbd>Alt+/</kbd></button><button id="chat-menu" role="menuitem" data-i18n="在侧边聊天中提问">在侧边聊天中提问</button><button id="chat-quick-menu" role="menuitem" data-i18n="Codex 悬浮对话">Codex 悬浮对话</button></div>
<div id="pdf-menu" popover="auto" role="menu" aria-label="PDF 选区操作" data-i18n-aria-label="PDF 选区操作"><button id="pdf-chat-menu" role="menuitem" data-i18n="在侧边聊天中提问">在侧边聊天中提问</button><button id="pdf-chat-quick-menu" role="menuitem" data-i18n="Codex 悬浮对话">Codex 悬浮对话</button></div>
<dialog id="history-dialog" aria-labelledby="history-title"><header><strong id="history-title" data-i18n="版本历史">版本历史</strong><span id="history-file"></span><button id="history-refresh" data-i18n="刷新">刷新</button><button id="history-close" aria-label="关闭历史" data-i18n-aria-label="关闭历史">×</button></header><div id="history-status" role="status" aria-live="polite" hidden></div>
<div class="history-body"><section class="history-content"><div class="history-toolbar"><div id="history-tabs"><button id="history-diff" aria-pressed="true" data-i18n="改动对比">改动对比</button><button id="history-pdf" aria-pressed="false" data-i18n="PDF 改动">PDF 改动</button><button id="history-source" aria-pressed="false" data-i18n="此版本源码">此版本源码</button></div><label for="history-target" data-i18n="对比">对比</label><select id="history-target"><option value="previous" data-i18n="与上一版比较">与上一版比较</option><option value="current" data-i18n="当前编辑内容">当前编辑内容</option></select></div><div id="history-panes" class="history-code-shell" role="tabpanel" aria-labelledby="history-diff"><div id="history-code" tabindex="0" aria-label="历史源码与差异" data-i18n-aria-label="历史源码与差异"></div><div id="history-pdf-view" hidden tabindex="0" aria-label="改动附近的 PDF 对比" data-i18n-aria-label="改动附近的 PDF 对比"></div><button id="history-next" hidden><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6"/></svg><span id="history-next-label"></span></button></div></section><aside id="history-sidebar" class="history-sidebar" aria-label="按时间排列的版本" data-i18n-aria-label="按时间排列的版本"><div class="history-sidebar-head"><button id="history-sidebar-toggle" aria-label="展开改动记录" data-i18n-aria-label="展开改动记录" aria-expanded="false"><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg><span data-i18n="改动记录">改动记录</span></button><button id="history-sidebar-pin" aria-label="固定记录栏" title="固定记录栏" data-i18n-aria-label="固定记录栏" data-i18n-title="固定记录栏" aria-pressed="false"><svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 9V3H8v6l-3 4v2h14v-2zM12 15v7"/></svg></button></div><div class="history-activity"><small id="history-summary-status" role="status"></small><div id="history-list"></div><button id="history-more" hidden data-i18n="加载更早版本">加载更早版本</button></div></aside></div>
<div id="history-actions" popover="auto" role="menu" aria-label="历史记录操作" data-i18n-aria-label="历史记录操作"><button id="history-rename" role="menuitem" data-i18n="重命名">重命名</button><button id="history-restore" role="menuitem" disabled data-i18n="恢复此版本">恢复此版本</button></div>
<dialog id="history-name-dialog" class="history-small-dialog" aria-labelledby="history-name-title"><h3 id="history-name-title" data-i18n="重命名版本">重命名版本</h3><form id="history-label-form"><label for="history-label" data-i18n="版本名称">版本名称</label><input id="history-label" maxlength="120" placeholder="例如：投稿前定稿" data-i18n-placeholder="例如：投稿前定稿"><p id="history-label-error" role="alert"></p><div class="history-dialog-actions"><button id="history-label-cancel" type="button" data-i18n="取消">取消</button><button id="history-label-save" type="submit" data-i18n="保存名称">保存名称</button></div></form></dialog>
<dialog id="history-confirmation" class="history-small-dialog" aria-labelledby="history-confirm-title"><h3 id="history-confirm-title" data-i18n="确定恢复？">确定恢复？</h3><div class="history-dialog-actions"><button id="history-cancel" data-i18n="取消">取消</button><button id="history-confirm" data-i18n="确认恢复">确认恢复</button></div></dialog></dialog>
<script src="/vendor/codemirror.js"></script><script src="/vendor/stex.js"></script><script src="/vendor/dialog.js"></script><script src="/vendor/searchcursor.js"></script><script src="/vendor/matchbrackets.js"></script><script src="/vendor/vim.js"></script>
<script src="/vendor/show-hint.js"></script><script src="/vendor/latex-hint.js"></script>
<script src="/vendor/comment.js"></script>
<script type="module">
import * as pdfjsLib from '/vendor/pdfjs/build/pdf.mjs';
import {EventBus, PDFViewer, PDFLinkService} from '/vendor/pdfjs/web/pdf_viewer.mjs';
import katex from '/vendor/katex/katex.mjs';
import {attachMathHover,findMathRanges} from '/vendor/latex-hover.mjs';
import {attachSelectionChat} from '/vendor/latex-chat.mjs';
import {attachHistory} from '/vendor/latex-history.mjs';
import {mountHistoryTabs} from '/vendor/history-tabs.mjs';
import {t, setText, initSettings} from '/vendor/latex-settings.mjs';
import {initScreenshotThemes, applyCustomTheme} from '/vendor/latex-themes.mjs';
initSettings();
mountHistoryTabs(t);
const source=document.querySelector('#source'),status=document.querySelector('#status'),log=document.querySelector('#log');
setText(status,'正在打开…');
const openButton=document.querySelector('#open'),compileButton=document.querySelector('#compile'),forwardButton=document.querySelector('#forward'),preview=document.querySelector('#preview');
function showCompileLog(show){
  log.hidden=!show;preview.style.visibility=show?'hidden':'';preview.inert=show;
  preview.setAttribute('aria-hidden',String(show));
  document.querySelector('#log-toggle').setAttribute('aria-pressed',String(show));
  document.querySelector('.pdf-toolbar').dataset.logView=String(show);
}
document.querySelector('#log-toggle').onclick=()=>showCompileLog(log.hidden);

pdfjsLib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/build/pdf.worker.mjs';
const pdfEvents=new EventBus(),pdfLinks=new PDFLinkService({eventBus:pdfEvents,externalLinkTarget:2});
const pdfViewer=new PDFViewer({container:preview,viewer:document.querySelector('#pdf-viewer'),eventBus:pdfEvents,linkService:pdfLinks,annotationEditorMode:-1,removePageBorders:true,imageResourcesPath:'/vendor/pdfjs/web/images/'});
pdfLinks.setViewer(pdfViewer);
let pdfTask=null,pdfBuild='',panMode=true,panHintTimer;
document.querySelector('#pan-mode').onclick=()=>{
  endSpacePan();panMode=!panMode;preview.classList.toggle('hand-tool',panMode);
  const button=document.querySelector('#pan-mode');setText(document.querySelector('#pan-label'),panMode?'拖动':'选字');button.setAttribute('aria-pressed',String(panMode));
  const hint=document.querySelector('#pan-hint');clearTimeout(panHintTimer);hint.hidden=panMode;
  if(!panMode)panHintTimer=setTimeout(()=>{hint.hidden=true;},2500);
};
const editor=CodeMirror.fromTextArea(source,{mode:'text/x-stex',theme:'cobalt',keyMap:'vim',lineNumbers:true,lineWrapping:true,tabSize:2,indentUnit:2,readOnly:'nocursor',screenReaderLabel:t('LaTeX 源码'),extraKeys:{'Ctrl-S':compile,'Cmd-S':compile,'Ctrl-Space':completeLatex,'Alt-/':toggleSourceComment,'Ctrl-/':toggleSourceComment,'Cmd-/':toggleSourceComment}});
window.addEventListener('latex-language-change',()=>{editor.setOption('screenReaderLabel',t('LaTeX 源码'));setText(document.querySelector('#pan-label'),panMode?'拖动':'选字');});
attachMathHover(editor,katex);
document.querySelector('main').append(document.querySelector('#chat-panel'));
const selectionChat=attachSelectionChat(editor,request);
const historyDialog=document.querySelector('#history-dialog');
attachHistory(editor,request,()=>({path:document.querySelector('#filename').title,source:editor.getValue(),version}),restoreHistory);
const layout=document.querySelector('main'),splitter=document.querySelector('#splitter');
let splitRatio=.5,splitDrag=null;
function setSplitRatio(value){
  splitRatio=Math.max(.15,Math.min(.85,value));
  layout.style.setProperty('--source-share',splitRatio+'fr');
  layout.style.setProperty('--pdf-share',(1-splitRatio)+'fr');
  splitter.setAttribute('aria-valuenow',String(Math.round(splitRatio*100)));
  editor.refresh();
}
function saveSplitRatio(){try{localStorage.setItem('latex-codex-split',String(splitRatio));}catch(e){}}
try{const saved=Number.parseFloat(localStorage.getItem('latex-codex-split'));if(Number.isFinite(saved))setSplitRatio(saved);}catch(e){}
splitter.onpointerdown=e=>{
  if(e.button!==0||layout.clientWidth<=640)return;
  e.preventDefault();splitDrag={x:e.clientX,ratio:splitRatio};
  splitter.setPointerCapture(e.pointerId);layout.classList.add('resizing');
};
splitter.onpointermove=e=>{
  if(!splitDrag)return;
  if(!(e.buttons&1)){splitter.onpointerup(e);return;}
  setSplitRatio(splitDrag.ratio+(e.clientX-splitDrag.x)/(layout.clientWidth-6));
};
splitter.onpointerup=splitter.onpointercancel=splitter.onlostpointercapture=e=>{
  if(!splitDrag)return;
  splitDrag=null;layout.classList.remove('resizing');saveSplitRatio();
  if(splitter.hasPointerCapture(e.pointerId))splitter.releasePointerCapture(e.pointerId);
};
splitter.ondblclick=()=>{setSplitRatio(.5);saveSplitRatio();};
splitter.onkeydown=e=>{
  if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;
  e.preventDefault();setSplitRatio(e.key==='Home'?.5:splitRatio+(e.key==='ArrowLeft'?-.02:.02));saveSplitRatio();
};
function toggleSourceComment(cm){
  if(!cm.getOption('readOnly'))cm.toggleComment({indent:true});
}
const commentMenu=document.querySelector('#editor-menu'),commentAction=document.querySelector('#toggle-comment');
editor.on('contextmenu',(cm,event)=>{
  if(cm.getOption('readOnly')||(event.shiftKey&&event.button===2))return;
  event.preventDefault();
  const keyboard=event.clientX===0&&event.clientY===0;
  if(!keyboard&&!cm.somethingSelected())cm.setCursor(cm.coordsChar({left:event.clientX,top:event.clientY},'window'));
  const anchor=keyboard?cm.charCoords(cm.getCursor(),'window'):{left:event.clientX,bottom:event.clientY};
  commentMenu.showPopover();
  commentMenu.style.left=Math.max(8,Math.min(anchor.left,window.innerWidth-commentMenu.offsetWidth-8))+'px';
  commentMenu.style.top=Math.max(8,Math.min(anchor.bottom,window.innerHeight-commentMenu.offsetHeight-8))+'px';
  commentAction.focus();
});
commentAction.onclick=()=>{commentMenu.hidePopover();toggleSourceComment(editor);editor.focus();};
editor.on('scroll',()=>commentMenu.hidePopover());
function completeLatex(cm){
  if(cm.getOption('readOnly')||!['default','vim-insert'].includes(cm.getOption('keyMap'))||!CodeMirror.hint.latex(cm))return;
  cm.showHint({hint:CodeMirror.hint.latex,completeSingle:false,closeCharacters:/[\s()\[\]};:>,]/,
    extraKeys:{'Ctrl-N':'Down','Ctrl-P':'Up',Esc:(cm,menu)=>{menu.close();if(cm.getOption('keyMap')==='vim-insert')CodeMirror.Vim.handleKey(cm,'<Esc>');}}});
}
editor.on('inputRead',(cm,change)=>{if(change.origin==='+input'&&!cm.state.completionActive)completeLatex(cm);});
CodeMirror.Vim.defineAction('centerAndSync',cm=>{
  cm.scrollTo(null,cm.charCoords({line:cm.getCursor().line,ch:0},'local').bottom-cm.getScrollInfo().clientHeight/2);
  synchronize('forward');
});
CodeMirror.Vim.mapCommand('zz','action','centerAndSync',{}, {context:'normal'});
CodeMirror.Vim.defineAction('toggleSourceComment',cm=>{toggleSourceComment(cm);CodeMirror.Vim.handleKey(cm,'<Esc>');});
CodeMirror.Vim.mapCommand('gcc','action','toggleSourceComment',{}, {context:'normal'});
CodeMirror.Vim.mapCommand('gc','action','toggleSourceComment',{}, {context:'visual'});
let pdfZoom=100;
function previewPosition(){
  const page=pdfViewer.currentPageNumber,view=pdfViewer.getPageView(page-1);
  return view?{page,y:(preview.scrollTop-view.div.offsetTop)/view.div.clientHeight,x:preview.scrollLeft/Math.max(1,preview.scrollWidth)}:null;
}
function restorePreviewPosition(position){
  if(!position||!pdfViewer.pagesCount)return;
  const page=Math.min(position.page,pdfViewer.pagesCount),view=pdfViewer.getPageView(page-1);
  pdfViewer.currentPageNumber=page;
  preview.scrollTop=view.div.offsetTop+position.y*view.div.clientHeight;
  preview.scrollLeft=position.x*preview.scrollWidth;
  pdfViewer.update();
}
function setPdfZoom(value){
  const position=previewPosition();
  pdfZoom=Math.max(75,Math.min(250,value));
  if(pdfViewer.pagesCount){pdfViewer.currentScaleValue='page-width';pdfViewer.currentScale*=pdfZoom/100;restorePreviewPosition(position);}
  preview.querySelectorAll('.sync-highlight').forEach(mark=>mark.remove());
  document.querySelector('#zoom-fit').textContent=pdfZoom+'%';
  document.querySelector('#zoom-out').disabled=pdfZoom===75;
  document.querySelector('#zoom-in').disabled=pdfZoom===250;
}
let previewWidth=0;
new ResizeObserver(()=>{if(preview.clientWidth!==previewWidth){previewWidth=preview.clientWidth;setPdfZoom(pdfZoom);}}).observe(preview);
document.querySelector('#zoom-out').onclick=()=>setPdfZoom(pdfZoom-25);
document.querySelector('#zoom-in').onclick=()=>setPdfZoom(pdfZoom+25);
document.querySelector('#zoom-fit').onclick=()=>setPdfZoom(100);
const theme=document.querySelector('#theme');
initScreenshotThemes(theme,setTheme);
try{theme.value=localStorage.getItem('latex-codex-theme')||'cobalt';}catch(e){}
if(!theme.value)theme.value='cobalt';
function setTheme(){document.documentElement.dataset.theme=theme.value;editor.setOption('theme',applyCustomTheme(theme.value)?'custom':theme.value.replace(/^solarized-(light|dark)$/,'solarized $1'));try{localStorage.setItem('latex-codex-theme',theme.value);}catch(e){}}
theme.onchange=setTheme;setTheme();
CodeMirror.commands.save=compile;
editor.on('vim-mode-change',mode=>{if(mode.mode!=='insert')editor.closeHint();});
const editorMode=document.querySelector('#editor-mode');
try{editorMode.value=localStorage.getItem('latex-codex-editor-mode')||'vim';}catch(e){}
if(!['vim','default'].includes(editorMode.value))editorMode.value='vim';
function setEditorMode(){
  editor.closeHint();editor.setOption('keyMap',editorMode.value);
  editor.setOption('showCursorWhenSelecting',editorMode.value==='default');
  try{localStorage.setItem('latex-codex-editor-mode',editorMode.value);}catch(e){}
}
editorMode.onchange=setEditorMode;setEditorMode();
let version='',saved='',busy=false,timer,conflict=false,pdfVersion='',syncBusy=false,pendingForward=false,compiledLabels={};
const autoCompile=document.querySelector('#auto-compile');
autoCompile.checked=true;
try{autoCompile.checked=localStorage.getItem('latex-codex-auto-compile')!=='off';}catch(e){}
function updateCompileCaption(){
  const label=document.querySelector('#filename');
  if(label.dataset.name)setText(label,autoCompile.checked?'{name} · 停止输入 0.8 秒后自动保存并编译':'{name} · 自动保存，手动编译',{name:label.dataset.name});
}
function scheduleSave(){clearTimeout(timer);timer=setTimeout(()=>compile(autoCompile.checked),800);}
autoCompile.onchange=()=>{
  try{localStorage.setItem('latex-codex-auto-compile',autoCompile.checked?'on':'off');}catch(e){}
  clearTimeout(timer);updateCompileCaption();
  if(!conflict&&(editor.getValue()!==saved||(autoCompile.checked&&pdfVersion!==version)))scheduleSave();
};
let errorLine=null;
function showCompileError(error){
  if(errorLine){editor.removeLineClass(errorLine,'background','compile-error-line');editor.removeLineClass(errorLine,'gutter','compile-error-gutter');errorLine=null;}
  if(!error||!Number.isInteger(error.line)||error.line<1||error.line>editor.lineCount())return;
  const cursor={line:error.line-1,ch:0};
  errorLine=editor.addLineClass(cursor.line,'background','compile-error-line');
  editor.addLineClass(errorLine,'gutter','compile-error-gutter');
  editor.setCursor(cursor);editor.focus();editor.scrollIntoView(cursor,editor.getScrollInfo().clientHeight/2);
  setText(status,'编译失败 · 第 {line} 行：{message}',error);
}
function updateSyncControls(){forwardButton.disabled=busy||syncBusy||editor.getOption('readOnly');compileButton.disabled=forwardButton.disabled;openButton.disabled=busy||syncBusy;document.querySelector('#history-open').disabled=!!forwardButton.disabled;}
async function request(url,options){const r=await fetch(url,options);const data=await r.json();if(!r.ok){const e=new Error(data.error||t('请求失败'));e.conflict=r.status===409;throw e;}return data;}
function display(data){
  showCompileError(null);showCompileLog(false);
  editor.setOption('keyMap','default');editor.swapDoc(new CodeMirror.Doc(data.source,editor.getOption('mode')));editor.setOption('keyMap',editorMode.value);
  saved=data.source;version=data.version;pdfVersion='';compiledLabels={};editor.setOption('readOnly',false);conflict=false;updateSyncControls();
  const label=document.querySelector('#filename');label.dataset.name=data.name;label.title=data.path;updateCompileCaption();
  document.querySelector('a[download]').download=data.name.replace(/\.tex$/i,'.pdf');
}
async function openFile(){
  if(busy||syncBusy)return;
  if(editor.getValue()!==saved&&!confirm(t('打开其他文件会放弃尚未保存的修改。继续？')))return;
  clearTimeout(timer);busy=true;editor.setOption('readOnly','nocursor');updateSyncControls();let opened=false;
  setText(status,'请在系统窗口中选择 .tex 文件…');
  try{
    const data=await request('/open',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(data.cancelled)setText(status,'已取消打开');
    else{display(data);pdfViewer.setDocument(null);pdfLinks.setDocument(null);if(pdfTask)await pdfTask.destroy();pdfTask=null;pdfBuild='';log.textContent='';opened=true;}
  }catch(e){setText(status,'打开失败：{message}',{message:e.message});}
  finally{busy=false;editor.setOption('readOnly',false);updateSyncControls();}
  if(opened)await compile();
  else if(editor.getValue()!==saved&&!conflict)scheduleSave();
}
async function compile(compilePdf=true){
  compilePdf=compilePdf!==false;
  clearTimeout(timer);if(busy||conflict||editor.getOption('readOnly'))return;
  busy=true;compileButton.setAttribute('aria-busy',String(compilePdf));updateSyncControls();const text=editor.getValue(),changed=text!==saved;setText(status,compilePdf?'正在保存并编译…':'正在保存…');
  try{
    const data=await request(compilePdf?'/compile':'/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:text,version})});
    version=data.version;saved=text;
    if(!compilePdf){
      if(pdfVersion!==version){pdfVersion='';compiledLabels={};}
      setText(status,'已保存 · 自动编译已关闭');return;
    }
    pdfVersion='';log.textContent=data.log;
    if(!data.ok)showCompileLog(true);
    setText(status,data.ok?'已保存 · 编译成功':'已保存 · 编译失败，请查看日志');
    showCompileError(!data.ok&&editor.getValue()===text?data.diagnostic:null);
    if(data.ok){
      try{await refreshPreview(data);pdfVersion=data.sync?data.version:'';compiledLabels=data.labels||{};}
      catch(e){setText(status,'已保存 · 编译成功，PDF 预览加载失败');log.textContent+='\n'+e.message;showCompileLog(true);}
    }
  }catch(e){conflict=true;setText(status,e.conflict?'文件已被外部修改，请先重新读取':'保存状态待确认，请重新读取');log.textContent=e.message;showCompileLog(true);}
  finally{busy=false;compileButton.setAttribute('aria-busy','false');updateSyncControls();if(!conflict&&(editor.getValue()!==text||(!compilePdf&&autoCompile.checked&&pdfVersion!==version)))scheduleSave();else if(!conflict&&pendingForward&&!compilePdf){pendingForward=false;synchronize('forward');}else if(!conflict&&pdfVersion&&(pendingForward||(compilePdf&&changed))){const quiet=!pendingForward;pendingForward=false;synchronize('forward',undefined,quiet);}}
}
async function restoreHistory(data){
  if(busy||syncBusy||editor.getValue()!==data.source||version!==data.version)throw new Error(t('编辑内容已变化，请刷新历史后重试。'));
  clearTimeout(timer);busy=true;editor.setOption('readOnly','nocursor');updateSyncControls();
  try{
    const restored=await request('/history/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    display(restored);historyDialog.close();setText(status,'历史版本已恢复，正在编译…');
  }catch(e){if(e.conflict)conflict=true;throw e;}
  finally{busy=false;editor.setOption('readOnly',false);updateSyncControls();}
  await compile();
}
async function refreshPreview(data){
  if(pdfBuild===data.pdf_revision)return;
  const response=await fetch('/pdf?v='+encodeURIComponent(data.pdf_revision));
  if(!response.ok)throw new Error(t('PDF 已更新，请重新编译。'));
  const task=pdfjsLib.getDocument({data:new Uint8Array(await response.arrayBuffer()),cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/',iccUrl:'/vendor/pdfjs/iccs/',isEvalSupported:false});
  const previous=pdfTask,oldDocument=pdfViewer.pdfDocument,position=previewPosition(),scale=pdfViewer.currentScale;
  try{
    const pdf=await task.promise;await pdf.getPage(1);
    pdfLinks.setDocument(pdf);pdfViewer.setDocument(pdf);
    await pdfViewer.firstPagePromise;
    if(oldDocument)pdfViewer.currentScale=scale;else setPdfZoom(pdfZoom);
    if(position){
      const target=Math.min(position.page,pdf.numPages),view=pdfViewer.getPageView(target-1);
      if(!view.pdfPage)view.setPdfPage(await pdf.getPage(target));
      pdfViewer.currentPageNumber=target;pdfViewer.update();
      // Resolve page geometry before restoring offsets in mixed-size documents; this does not rasterize all pages.
      await pdfViewer.pagesPromise;
    }
    restorePreviewPosition(position);
    pdfTask=task;pdfBuild=data.pdf_revision;
  }catch(error){
    pdfLinks.setDocument(oldDocument);pdfViewer.setDocument(oldDocument);
    if(oldDocument){await pdfViewer.firstPagePromise;pdfViewer.currentScale=scale;await pdfViewer.pagesPromise;restorePreviewPosition(position);}
    await task.destroy();throw error;
  }
  if(previous)await previous.destroy();
}
async function load(force=false){
  if(busy||syncBusy||historyDialog.open)return;
  if(force&&editor.getValue()!==saved&&!confirm(t('重新读取会放弃编辑框中尚未保存的修改。继续？')))return;
  try{
    const data=await request('/state');
    if(busy||syncBusy||historyDialog.open)return;
    if(!force&&version&&data.version===version)return;
    if(!force&&version&&editor.getValue()!==saved){conflict=true;setText(status,'文件已被外部修改；保留了编辑框内容，请先处理冲突');return;}
    const firstLoad=!version;display(data);
    await compile(firstLoad||force||autoCompile.checked);
  }catch(e){setText(status,'读取失败：{message}',{message:e.message});}
}
async function synchronize(direction,position,quiet=false){
  if(syncBusy)return;
  if(busy){if(direction==='forward'&&!editor.getOption('readOnly'))pendingForward=true;return;}
  syncBusy=true;updateSyncControls();
  try{
    if(conflict)throw new Error(t('请先处理文件冲突。'));
    if(direction==='forward'&&(editor.getValue()!==saved||!pdfVersion))await compile();
    if(!pdfVersion||pdfVersion!==version||editor.getValue()!==saved)throw new Error(t('请先成功编译当前修改，再定位。'));
    if(direction==='selection'&&(position.version!==version||position.pdf_revision!==pdfBuild||position.source!==saved))throw new Error(t('PDF 或源码已变化，请重新选择 PDF 文字。'));
    if(direction==='forward'&&!quiet)showCompileLog(false);
    const revision=version,build=pdfBuild;
    if(direction==='forward'){const cursor=editor.getCursor();position={line:cursor.line+1,column:cursor.ch+1};}
    const locate=point=>request('/synctex',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({direction:direction==='selection'?'backward':direction,version:revision,pdf_revision:build,...point})});
    const data=direction==='selection'?await Promise.all(position.points.map(locate)):await locate(position);
    if(busy||version!==revision||pdfBuild!==build||editor.getValue()!==saved)throw new Error(t('PDF 或源码已变化，请重新选择 PDF 文字。'));
    if(direction==='selection'){
      if(selectionChat.busy)throw new Error(t('Codex 正在回复，请稍后发送。'));
      const range=sourcePdfTextRange(saved,data.map(point=>point.line),position.text,compiledLabels);
      if(editor.getOption('keyMap').startsWith('vim'))CodeMirror.Vim.handleKey(editor,'<Esc>');
      editor.setSelection(range.from,range.to);editor.scrollIntoView(range,40);
      setText(status,range.approximate?'已匹配相似 LaTeX 选区 · 第 {from}–{to} 行':'已精确选中对应 LaTeX 文字 · 第 {from}–{to} 行',{from:range.from.line+1,to:range.to.line+1});
      return true;
    }else if(direction==='forward'){
      const page=await pdfViewer.pdfDocument.getPage(data.page);
      if(busy||version!==revision||pdfBuild!==build||editor.getValue()!==saved)return;
      const view=pdfViewer.getPageView(data.page-1);if(!view.pdfPage)view.setPdfPage(page);
      pdfViewer.scrollPageIntoView({pageNumber:data.page});
      const [x1,y1]=view.viewport.convertToViewportPoint(...data.rect.slice(0,2));
      const [x2,y2]=view.viewport.convertToViewportPoint(...data.rect.slice(2));
      preview.querySelectorAll('.sync-highlight').forEach(mark=>mark.remove());
      const mark=document.createElement('div');mark.className='sync-highlight';mark.setAttribute('aria-hidden','true');
      Object.assign(mark.style,{left:Math.min(x1,x2)+'px',top:Math.min(y1,y2)+'px',width:Math.abs(x2-x1)+'px',height:Math.abs(y2-y1)+'px'});
      view.div.append(mark);
      const box=mark.getBoundingClientRect(),viewport=preview.getBoundingClientRect();
      preview.scrollTop+=box.top-viewport.top-preview.clientHeight/2+box.height/2;
      preview.scrollLeft+=box.left-viewport.left-preview.clientWidth/2+box.width/2;
      setTimeout(()=>mark.remove(),2000);
      setText(status,'已定位到 PDF 第 {page} 页',data);
    }else{
      if(editor.getOption('keyMap').startsWith('vim'))CodeMirror.Vim.handleKey(editor,'<Esc>');
      const cursor={line:Math.min(data.line-1,editor.lastLine()),ch:data.column-1};
      editor.setCursor(cursor);editor.focus();editor.scrollIntoView(cursor,editor.getScrollInfo().clientHeight/2);
      setText(status,'已定位到源码第 {line} 行',data);
    }
  }catch(e){if(!quiet)setText(status,'定位失败：{message}',{message:e.message});}
  finally{syncBusy=false;updateSyncControls();}
}
forwardButton.onclick=()=>synchronize('forward');
function sourceParagraphRange(source,locations){
  const lines=source.split('\n');
  if(locations.some(line=>!Number.isInteger(line)||line<1||line>lines.length))throw new Error(t('无法确定对应段落，请在源码中选择。'));
  let from=Math.min(...locations)-1,to=Math.max(...locations)-1;
  if([lines[from],lines[to]].some(line=>/^\s*\\(?:begin|end)\{document\}/.test(line)))throw new Error(t('无法确定对应段落，请在源码中选择。'));
  // ponytail: blank lines and common block commands delimit paragraphs; custom macros need a TeX parser.
  const boundary=line=>/^\s*(?:$|\\(?:begin|end)\{|\\(?:newpage|clearpage|pagebreak|par)\s*(?:%.*)?$|\\(?:part|chapter|(?:sub)*section|(?:sub)?paragraph)\*?(?:\[|\{))/.test(line);
  const endsParagraph=line=>/\\par\s*(?:%.*)?$/.test(line);
  while(from>0&&!boundary(lines[from])&&!boundary(lines[from-1])&&!endsParagraph(lines[from-1]))from--;
  while(to+1<lines.length&&!boundary(lines[to])&&!boundary(lines[to+1])&&!endsParagraph(lines[to]))to++;
  if(!lines.slice(from,to+1).join('').trim())throw new Error(t('无法确定对应段落，请在源码中选择。'));
  return {from:{line:from,ch:0},to:{line:to,ch:lines[to].length}};
}
function sourcePdfTextRange(source,locations,text,labels={}){
  const fail=()=>{throw new Error(t('无法唯一匹配选中的 PDF 文字，请在源码中选择。'));};
  if(typeof text!=='string'||!text.trim())fail();
  const nearby=sourceParagraphRange(source,locations),lines=source.split('\n');
  let start=lines.slice(0,nearby.from.line).reduce((offset,line)=>offset+line.length+1,0);
  let end=start+lines.slice(nearby.from.line,nearby.to.line+1).join('\n').length;
  const mathRanges=findMathRanges(source);
  // Include complete math environments when SyncTeX lands inside their body.
  for(const range of mathRanges){
    if(range.from<start&&range.to>start)start=range.from;
    if(range.from<end&&range.to>end)end=range.to;
  }
  const snippet=source.slice(start,end);
  text=text.replace(/[\u0000-\u0008\u000e-\u001f]/g,'');
  const normalize=value=>value.normalize('NFKC').replace(/[\s~\u00ad\u200b-\u200d\u2061-\u2064]/gu,'').replace(/\u2212/g,'-').replace(/\u2206/g,'Δ');
  let needle=normalize(text);
  if(!needle)fail();
  let haystack='';let offsets=[];
  const tokens=/\\(?:label|[A-Za-z]*ref|[A-Za-z]*cite[A-Za-z]*|url|href|includegraphics|input|include|bibliography|bibliographystyle)(?:\*|\[[^\]]*\])*(?:\{[^{}]*\})+|\\(?:[A-Za-z@]+|.)|%[^\n]*|[^]/gu;
  for(const token of snippet.matchAll(tokens)){
    const value=/^[\\%]/.test(token[0])?'\0':normalize(token[0]);
    haystack+=value;
    for(let i=0;i<value.length;i++)offsets.push([start+token.index,start+token.index+token[0].length]);
  }
  let found=haystack.indexOf(needle);
  if(found<0){needle=normalize(text.replace(/-\s*\n\s*/g,''));found=haystack.indexOf(needle);}
  let approximate=false,length=needle.length;
  if(found<0){
    if(snippet.length>12000||needle.length>3000)fail();
    approximate=true;haystack='';offsets=[];
    const formulas=new Map(findMathRanges(snippet).map(range=>[range.from,range]));
    const append=(value,from,to)=>{
      value=normalize(value);haystack+=value;
      for(let i=0;i<value.length;i++)offsets.push([start+from,start+to]);
    };
    let skip=0;
    const visibleTokens=/\\(?:textbf|textit|textrm|textsf|texttt|textnormal|emph|underline)\{([^{}]*)\}|\\(?:label|[A-Za-z]*ref|[A-Za-z]*cite[A-Za-z]*|url|href|includegraphics|input|include|bibliography|bibliographystyle)(?:\*|\[[^\]]*\])*(?:\{[^{}]*\})+|\\(?:[A-Za-z@]+|.)|%[^\n]*|[^]/gu;
    for(const token of snippet.matchAll(visibleTokens)){
      if(token.index<skip)continue;
      const formula=formulas.get(token.index);
      if(formula){
        const rendered=document.createElement('div');
        try{
          const tex=formula.tex.replace(/\\(begin|end)\s*\{(equation|align|alignat|gather)\}/g,'\\$1{$2*}');
          katex.render(tex,rendered,{output:'mathml',displayMode:formula.display,throwOnError:true,trust:false,strict:'ignore',maxExpand:1000,maxSize:20,macros:{'\\label':{numArgs:1,tokens:[]}}});
          rendered.querySelectorAll('annotation').forEach(node=>node.remove());
          const key=formula.tex.match(/\\label\{([^{}]+)\}/)?.[1],number=Object.hasOwn(labels,key)?labels[key]:'';
          append((number?'('+number+')':'')+rendered.textContent,formula.from,formula.to);
        }catch(e){append('\0',formula.from,formula.to);}
        skip=formula.to;
      }else{
        const reference=token[0].match(/^\\(eqref|ref)\*?\{([^{}]+)\}$/);
        const number=reference&&Object.hasOwn(labels,reference[2])?labels[reference[2]]:null;
        const value=number!==null?(reference[1]==='eqref'?'('+number+')':number):token[1]??(/^[\\%]/.test(token[0])?'\0':token[0]);
        append(value,token.index,token.index+token[0].length);
      }
    }
    found=haystack.indexOf(needle);
    if(found<0){
      // ponytail: rolling edit distance is bounded to 12k × 3k; larger selections need chunking.
      const limit=Math.floor(needle.length*.2);
      let costs=new Uint16Array(haystack.length+1),starts=new Uint16Array(haystack.length+1);
      let next=new Uint16Array(haystack.length+1),nextStarts=new Uint16Array(haystack.length+1);
      for(let j=0;j<starts.length;j++)starts[j]=j;
      for(let i=1;i<=needle.length;i++){
        next[0]=i;nextStarts[0]=0;
        for(let j=1;j<=haystack.length;j++){
          if(haystack[j-1]==='\0'){next[j]=needle.length+1;nextStarts[j]=j;continue;}
          const same=needle[i-1]===haystack[j-1];
          const diagonal=costs[j-1]+(same?0:1),removed=costs[j]+1,inserted=next[j-1]+1;
          next[j]=Math.min(diagonal,removed,inserted);
          nextStarts[j]=next[j]===diagonal?starts[j-1]:next[j]===removed?starts[j]:nextStarts[j-1];
        }
        [costs,next]=[next,costs];[starts,nextStarts]=[nextStarts,starts];
      }
      let best=limit+1,candidate=null,ambiguous=false;
      for(let j=1;j<=haystack.length;j++){
        const begin=starts[j],size=j-begin;
        if(!size||costs[j]>limit||size<needle.length*.8||size>needle.length*1.25)continue;
        if(costs[j]<best){best=costs[j];candidate={index:begin,length:size};ambiguous=false;}
        else if(costs[j]===best&&(offsets[begin][0]!==offsets[candidate.index][0]||offsets[j-1][1]!==offsets[candidate.index+candidate.length-1][1]))ambiguous=true;
      }
      if(!candidate||ambiguous)fail();
      found=candidate.index;length=candidate.length;
    }else if(haystack.indexOf(needle,found+1)>=0)fail();
  }else if(haystack.indexOf(needle,found+1)>=0)fail();
  const position=index=>{
    const prefix=source.slice(0,index),line=prefix.split('\n').length-1;
    return {line,ch:index-prefix.lastIndexOf('\n')-1};
  };
  const from=offsets[found][0],to=offsets[found+length-1][1];
  let braces=0;
  for(const token of source.slice(from,to).matchAll(/\\.|%[^\n]*|[{}]/g)){
    if(token[0]==='{')braces++;
    else if(token[0]==='}'&&--braces<0)fail();
  }
  if(braces)fail();
  return approximate?{from:position(from),to:position(to),approximate:true}:{from:position(from),to:position(to)};
}
function pdfPoint(element,left,top){
  const page=Number(element.dataset.pageNumber),view=pdfViewer.getPageView(page-1),box=element.getBoundingClientRect();
  const [x,y]=view.viewport.convertToPdfPoint((left-box.left-element.clientLeft)*view.viewport.width/element.clientWidth,(top-box.top-element.clientTop)*view.viewport.height/element.clientHeight);
  return {page,x,y};
}
function pdfMarginNumbers(spans){
  const numbers=spans.filter(span=>/^\d+$/.test(span.textContent||''));
  const bodies=spans.filter(span=>/[A-Za-z]{4}/.test(span.textContent||''));
  const boxes=new Map([...numbers,...bodies].map(span=>[span,span.getBoundingClientRect()]));
  const pages=new Map([...numbers,...bodies].map(span=>[span,span.closest('.page')]));
  const margins=new Set();
  // Consecutive small numbers beside prose identify a gutter, not equation or table digits.
  for(const span of numbers){
    if(margins.has(span))continue;
    const box=boxes.get(span),page=pages.get(span);
    const column=numbers.filter(other=>pages.get(other)===page&&Math.abs(boxes.get(other).left-box.left)<2);
    const rows=column.filter(number=>{
      const rect=boxes.get(number);
      return bodies.some(prose=>{
        const body=boxes.get(prose);
        return pages.get(prose)===page&&body.height>rect.height*1.1&&Math.abs(body.bottom-rect.bottom)<body.height*.5&&body.left>rect.right&&body.left-rect.right<body.height*4;
      });
    });
    const values=new Set(rows.map(number=>Number(number.textContent)));
    if(rows.filter(number=>values.has(Number(number.textContent)+1)).length>=2)column.forEach(number=>margins.add(number));
  }
  return margins;
}
function selectedPdfPoints(){
  const selection=window.getSelection();
  if(!selection||selection.isCollapsed||selection.rangeCount!==1||!selection.toString().trim())return null;
  const range=selection.getRangeAt(0);
  if(!preview.contains(range.startContainer)||!preview.contains(range.endContainer))return null;
  let first,last;
  const spans=Array.from(preview.querySelectorAll('.textLayer span')),margins=pdfMarginNumbers(spans),parts=[];
  // Use clipped glyph rectangles in DOM order, including reverse drags and selections across pages.
  for(const span of spans){
    if(margins.has(span))continue;
    const node=span.firstChild;
    if(node?.nodeType!==3||!range.intersectsNode(node))continue;
    const part=range.cloneRange();part.selectNodeContents(node);
    if(node===range.startContainer)part.setStart(node,range.startOffset);
    if(node===range.endContainer)part.setEnd(node,range.endOffset);
    if(part.collapsed)continue;
    parts.push(part.toString());
    if(span.nextElementSibling?.tagName==='BR')parts.push('\n');
    if(!part.toString().trim())continue;
    const rects=Array.from(part.getClientRects()).filter(rect=>rect.width>0&&rect.height>0),page=span.closest('.page');
    if(!rects.length||!page)continue;
    const point=rect=>pdfPoint(page,(rect.left+rect.right)/2,(rect.top+rect.bottom)/2);
    first??=point(rects[0]);last=point(rects.at(-1));
  }
  return first?{points:[first,last],text:margins.size?parts.join(''):selection.toString()}:null;
}
const pdfMenu=document.querySelector('#pdf-menu');
let pdfSelection=null;
preview.oncontextmenu=event=>{
  if(panMode||spacePan||event.shiftKey||editor.getOption('readOnly'))return;
  const selected=selectedPdfPoints();if(!selected)return;
  event.preventDefault();
  const selectionBox=window.getSelection().getRangeAt(0).getBoundingClientRect();
  pdfSelection={...selected,version,pdf_revision:pdfBuild,source:editor.getValue(),selectionTop:selectionBox.top,selectionBottom:selectionBox.bottom};
  const keyboard=event.clientX===0&&event.clientY===0;
  const box=keyboard?window.getSelection().getRangeAt(0).getBoundingClientRect():{left:event.clientX,bottom:event.clientY};
  pdfMenu.showPopover();
  pdfMenu.style.left=Math.max(8,Math.min(box.left,window.innerWidth-pdfMenu.offsetWidth-8))+'px';
  pdfMenu.style.top=Math.max(8,Math.min(box.bottom,window.innerHeight-pdfMenu.offsetHeight-8))+'px';
  document.querySelector('#pdf-chat-menu').focus();
};
async function askPdfSelection(quick){
  const selection=pdfSelection,anchor=pdfMenu.getBoundingClientRect();pdfMenu.hidePopover();
  if(!selection)return;
  if(busy||syncBusy){setText(status,'正在编译或定位，请稍后重试。');return;}
  if(selectionChat.busy){setText(status,'Codex 正在回复，请稍后发送。');return;}
  setText(status,'正在精确匹配选中的 LaTeX 文字…');
  if(await synchronize('selection',selection))quick?selectionChat.openQuick({left:anchor.left,top:anchor.top,selectionTop:selection.selectionTop,selectionBottom:selection.selectionBottom}):selectionChat.open();
}
document.querySelector('#pdf-chat-menu').onclick=()=>askPdfSelection(false);
document.querySelector('#pdf-chat-quick-menu').onclick=()=>askPdfSelection(true);
preview.addEventListener('scroll',()=>pdfMenu.hidePopover());
let pdfPan=null,pdfDragged=false,spacePan=false,spaceLocked=false;
function endSpacePan(){
  if(!spacePan)return;
  spacePan=false;
  if(pdfPan)preview.onpointerup({pointerId:pdfPan.id});
  preview.classList.toggle('hand-tool',panMode);
}
preview.onkeydown=e=>{
  if(e.code!=='Space'||panMode||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,button,a,[contenteditable]'))return;
  e.preventDefault();spacePan=true;preview.classList.add('hand-tool');pdfMenu.hidePopover();
};
// Keep suppressing this held key after inverse lookup moves focus to the source.
window.addEventListener('keydown',e=>{if(e.code==='Space'&&spaceLocked){e.preventDefault();e.stopImmediatePropagation();}},true);
window.addEventListener('keyup',e=>{if(e.code==='Space'){if(spacePan||spaceLocked)e.preventDefault();spaceLocked=false;endSpacePan();}},true);
window.addEventListener('blur',()=>{spaceLocked=false;endSpacePan();});
preview.addEventListener('blur',endSpacePan);
preview.onpointerdown=e=>{
  pdfDragged=false;
  if(e.button!==0||e.pointerType!=='mouse'||!e.target.closest('.page')||e.target.closest('a,input,textarea,select,button,[contenteditable]'))return;
  preview.focus({preventScroll:true});
  if(!panMode&&!spacePan)return;
  if(spacePan)e.preventDefault();
  pdfPan={id:e.pointerId,x:e.clientX,y:e.clientY,left:preview.scrollLeft,top:preview.scrollTop};
};
preview.onpointermove=e=>{
  if(!pdfPan||e.pointerId!==pdfPan.id)return;
  if(!(e.buttons&1)){preview.onpointerup(e);return;}
  const dx=e.clientX-pdfPan.x,dy=e.clientY-pdfPan.y;
  if(!pdfDragged){
    if(Math.hypot(dx,dy)<4)return;
    pdfDragged=true;preview.setPointerCapture(e.pointerId);preview.classList.add('dragging');
  }
  preview.scrollLeft=pdfPan.left-dx;preview.scrollTop=pdfPan.top-dy;e.preventDefault();
};
preview.onpointerup=preview.onpointercancel=preview.onlostpointercapture=e=>{
  if(!pdfPan||e.pointerId!==pdfPan.id)return;
  pdfPan=null;preview.classList.remove('dragging');
  if(preview.hasPointerCapture(e.pointerId))preview.releasePointerCapture(e.pointerId);
};
preview.ondblclick=e=>{
  if((!panMode&&!spacePan)||pdfDragged)return;const element=e.target.closest('.page');if(!element)return;
  if(spacePan)spaceLocked=true;
  synchronize('backward',pdfPoint(element,e.clientX,e.clientY));
};
editor.on('change',()=>{showCompileError(null);setText(status,conflict?'请先处理文件冲突':'尚未保存…');clearTimeout(timer);scheduleSave();});
document.querySelector('#compile').onclick=compile;
openButton.onclick=openFile;
document.querySelector('#reload').onclick=()=>load(true);
window.addEventListener('beforeunload',e=>{if(editor.getValue()!==saved||busy){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(!conflict)load();},2000);load();
</script></html>'''


def snapshot(path):
    raw = path.read_bytes()
    return {'source': raw.decode('utf-8-sig'), 'version': hashlib.sha256(str(path).encode() + b'\0' + raw).hexdigest(), 'name': path.name, 'path': str(path)}


class FileConflict(ValueError):
    pass


def save_source(path, source, version, history, kind='save', draft=None):
    before = snapshot(path)
    history.record(before['source'])
    if version != before['version']:
        raise FileConflict('文件已被外部修改，请先重新读取。')
    if draft is not None:
        history.record(draft, 'before-restore')
    if source != before['source']:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, suffix='.tmp', delete=False) as output:
                temporary = Path(output.name)
                output.write(source.encode('utf-8'))
            if snapshot(path)['version'] != before['version']:
                raise FileConflict('保存期间文件已被外部修改，请先重新读取。')
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    history.record(source, kind, force=kind == 'restore')
    return snapshot(path)


def choose_file(path):
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    try:
        return filedialog.askopenfilename(parent=root, title='打开 LaTeX 文件', initialdir=str(path.parent), filetypes=[('LaTeX 文件', '*.tex')])
    finally:
        root.destroy()


def compiler(source):
    match = re.search(r'^\s*%\s*!TeX\s+program\s*=\s*(\S+)', '\n'.join(source.splitlines()[:20]), re.I | re.M)
    name = match[1].lower() if match else 'xelatex'
    if name not in ('pdflatex', 'xelatex'):
        raise ValueError('Supported TeX programs: pdflatex, xelatex.')
    executable = shutil.which(name)
    if not executable:
        raise FileNotFoundError(f'{name} is not on PATH.')
    return name, executable


@lru_cache(maxsize=4)
def engine_flags(engine):
    probe = subprocess.run([engine, '--version'], capture_output=True, timeout=10)
    return ['--disable-installer'] if b'miktex' in (probe.stdout + probe.stderr).lower() else []


def bibliography_signature(path, build, env):
    lines = []
    for aux in sorted(Path(build).rglob('*.aux')):
        lines.extend(re.findall(r'^\\(?:citation|bibdata|bibstyle|@input)\{[^\n]*', aux.read_text(encoding='utf-8', errors='replace'), re.M))
    digest = hashlib.sha256('\n'.join(lines).encode())
    for kind, names in re.findall(r'\\(bibdata|bibstyle)\{([^}]+)\}', '\n'.join(lines)):
        for name in names.split(','):
            suffix = '.bib' if kind == 'bibdata' else '.bst'
            name = name.strip()
            filename = name if name.endswith(suffix) else name + suffix
            dependency = path.parent / filename
            if not dependency.is_file():
                finder = shutil.which('kpsewhich')
                if not finder:
                    return None  # Unknown dependencies: safely rerun BibTeX.
                result = subprocess.run([finder, filename], cwd=path.parent, env=env, capture_output=True, timeout=10)
                found = result.stdout.decode('utf-8', errors='replace').strip()
                dependency = path.parent / found
                if not found or not dependency.is_file():
                    return None
            digest.update(str(dependency).encode())
            digest.update(dependency.read_bytes())
    return digest.hexdigest()


def compile_tex(path, build, source, entry=None):
    name, engine = compiler(source)
    flags = engine_flags(engine)
    command = [engine, *flags, '-no-shell-escape', '-synctex=1', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-output-directory=' + str(build), str(entry or path)]
    logs = []
    tex_env = os.environ.copy()
    # MiKTeX otherwise reads stale source-side .aux/.out before the current build.
    tex_env['TEXINPUTS'] = str(build) + os.pathsep + str(path.parent) + os.pathsep + tex_env.get('TEXINPUTS', '')

    def run(argv, cwd=path.parent, env=tex_env):
        result = subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=45)
        logs.append(result.stdout.decode('utf-8', errors='replace'))
        return result.returncode == 0

    ok = run(command)
    aux = Path(build) / (path.stem + '.aux')
    if ok and aux.exists() and '\\bibdata{' in aux.read_text(encoding='utf-8', errors='replace'):
        bibtex = shutil.which('bibtex')
        if not bibtex:
            raise FileNotFoundError('BibTeX is not on PATH.')
        env = os.environ.copy()
        for key in ('BIBINPUTS', 'BSTINPUTS'):
            env[key] = str(path.parent) + os.pathsep + env.get(key, '')
        signature = bibliography_signature(path, build, env)
        cached = Path(build) / '.bib-inputs.sha256'
        if signature is None or not aux.with_suffix('.bbl').is_file() or not cached.is_file() or cached.read_text() != signature:
            ok = run([bibtex, path.stem], cwd=build, env=env)
            if ok:
                cached.write_text(signature or '')
                ok = run(command) and run(command)
    if ok and 'Rerun to get cross-references right' in logs[-1]:
        ok = run(command)
    # ponytail: bounded BibTeX sequence; use latexmk for Biber or unusual rerun rules.
    return ok, '\n'.join(logs), name


def compile_diagnostic(log, path):
    # ponytail: locate errors in the open file only; included-file navigation needs a project editor.
    names = (str(path), path.as_posix(), path.name, './' + path.name)
    # TeX can wrap both the filename and the line number at its print-width limit.
    filename = '|'.join(r'(?:\r?\n)?'.join(re.escape(char) for char in name) for name in names)
    match = re.search(r'^(?:' + filename + r')(?:\r?\n)?:(?:\r?\n)?(\d[\d\r\n]*):\s*([^\r\n]+)', log, re.M)
    if match:
        return {'line': int(re.sub(r'\s', '', match[1])), 'message': match[2].strip()}
    return None


def compiled_labels(aux):
    if not aux.is_file():
        return {}
    # ponytail: plain label values cover numbered refs; macro-rich labels need TeX expansion.
    return dict(re.findall(r'\\newlabel\{([^{}]+)\}\{\{([^{}\\]*)\}', aux.read_text(encoding='utf-8', errors='replace')))


def synctex_records(arguments, directory):
    executable = shutil.which('synctex')
    if not executable:
        raise FileNotFoundError('未找到本机 synctex 命令。')
    env = os.environ.copy()
    for key in ('SYNCTEX_EDITOR', 'SYNCTEX_VIEWER'):
        env.pop(key, None)  # Query coordinates only; never launch external commands.
    result = subprocess.run([executable, *arguments], cwd=directory, env=env,
                            capture_output=True, timeout=10)
    records, record = [], {}
    for line in result.stdout.decode('utf-8', errors='replace').splitlines():
        key, separator, value = line.partition(':')
        if key == 'Output' and record:
            records.append(record)
            record = {}
        if separator:
            record[key] = value.strip()
    if record:
        records.append(record)
    return records


def pdf_page_boxes(pdf):
    # Metadata only: page images are rendered in the browser by PDF.js.
    result = subprocess.run(['pdfinfo', '-f', '1', '-l', '2147483647', '-box', str(pdf)],
                            capture_output=True, timeout=10)
    text = result.stdout.decode('utf-8', errors='replace')
    boxes = [list(map(float, row.split())) for row in re.findall(r'^Page\s+\d+\s+MediaBox:\s*([^\r\n]+)', text, re.M)]
    count = re.search(r'^Pages:\s*(\d+)', text, re.M)
    if result.returncode or not count or not boxes or len(boxes) != int(count[1]) or any(
        len(box) != 4 or not all(math.isfinite(n) for n in box) or box[2] <= box[0] or box[3] <= box[1] for box in boxes
    ):
        raise ValueError('Unable to read PDF page dimensions: ' + result.stderr.decode('utf-8', errors='replace'))
    return boxes


def forward_pdf_points(records, boxes):
    for record in records:
        if all(key in record for key in ('Page', 'h', 'v', 'W', 'H')):
            page = int(record['Page'])
            x, bottom, width, height = (float(record[key]) for key in ('h', 'v', 'W', 'H'))
            if 1 <= page <= len(boxes) and all(math.isfinite(n) for n in (x, bottom, width, height)) and width > 0:
                left, _, _, top = boxes[page - 1]
                height = max(height, 6)
                # SyncTeX starts at the top left; PDF coordinates start at the bottom left.
                yield {'page': page, 'rect': [left+x, top-bottom, left+x+width, top-bottom+height]}


def locate(path, build, boxes, data):
    pdf = str(Path(build) / (path.stem + '.pdf'))
    if data.get('direction') == 'forward':
        line, column = data.get('line'), data.get('column', 1)
        if type(line) is not int or not 1 <= line <= len(snapshot(path)['source'].splitlines()):
            raise ValueError('源码行号无效。')
        if type(column) is not int or not 1 <= column <= 1_000_000:
            raise ValueError('源码列号无效。')
        records = synctex_records(['view', '-i', f'{line}:{column}:{path}', '-o', pdf], path.parent)
        for point in forward_pdf_points(records, boxes):
            return point
        raise ValueError('这个位置没有对应的 PDF 内容，请将光标放到正文或公式中。')
    if data.get('direction') != 'backward':
        raise ValueError('定位方向无效。')
    page, x, y = data.get('page'), data.get('x'), data.get('y')
    if type(page) is not int or not 1 <= page <= len(boxes):
        raise ValueError('PDF 页码无效。')
    left, bottom, right, top = boxes[page - 1]
    if not all(type(n) in (int, float) and math.isfinite(n) for n in (x, y)) or not (left <= x <= right and bottom <= y <= top):
        raise ValueError('PDF 坐标无效。')
    records = synctex_records(['edit', '-o', f'{page}:{x-left}:{top-y}:{pdf}'], path.parent)
    for record in records:
        if 'Input' in record and 'Line' in record:
            target = (path.parent / record['Input']).resolve()
            if target == path:
                return {'line': max(1, int(record['Line'])), 'column': max(1, int(record.get('Column', '1')))}
    if any('Input' in record for record in records):
        raise ValueError('该处来自其他文件：' + Path(next(r['Input'] for r in records if 'Input' in r)).name)
    raise ValueError('该处没有对应源码，请双击 PDF 正文或公式。')


def history_pdf_snapshot(server, path, source):
    key = hashlib.sha256(str(path).encode() + b'\0' + source.encode()).hexdigest()
    cached = server.history_pdfs.pop(key, None)
    if cached:
        server.history_pdfs[key] = cached
        return key, cached
    directory = tempfile.TemporaryDirectory(prefix='latex-history-pdf-')
    try:
        entry = Path(directory.name) / path.name
        entry.write_bytes(source.encode('utf-8'))
        ok, log, _ = compile_tex(path, directory.name, source, entry=entry)
        pdf = entry.with_suffix('.pdf')
        if not ok or not pdf.is_file():
            raise ValueError('历史版本编译失败：' + log[-1800:])
        cached = {'directory': directory, 'entry': entry, 'pdf': pdf, 'boxes': pdf_page_boxes(pdf)}
        server.history_pdfs[key] = cached
        # ponytail: four compiled snapshots stay in memory/disk until eviction or server exit.
        while len(server.history_pdfs) > 4:
            server.history_pdfs.pop(next(iter(server.history_pdfs)))['directory'].cleanup()
        return key, cached
    except Exception:
        directory.cleanup()
        raise


def history_pdf_regions(snapshot, first, last):
    regions = {}
    lines = snapshot['entry'].read_text(encoding='utf-8').splitlines()
    # Query source lines, not page differences: later reflow never creates another change.
    for line in range(first, last):
        if not lines[line].strip() or lines[line].lstrip().startswith('%'):
            continue
        for column in (1, max(1, len(lines[line]))):
            records = synctex_records(['view', '-i', f"{line + 1}:{column}:{snapshot['entry']}", '-o', str(snapshot['pdf'])], snapshot['directory'].name)
            for point in forward_pdf_points(records, snapshot['boxes']):
                page, rect = point['page'], point['rect']
                if page in regions:
                    old = regions[page]
                    rect = [min(old[0], rect[0]), min(old[1], rect[1]), max(old[2], rect[2]), max(old[3], rect[3])]
                regions[page] = rect
    result = []
    for page, rect in sorted(regions.items()):
        left, bottom, right, top = snapshot['boxes'][page - 1]
        result.append({'page': page, 'rect': [left, max(bottom, rect[1] - 12), right, min(top, rect[3] + 12)]})
    return result


def history_pdf_changes(server, path, before, after):
    if before == after:
        return {'changes': []}
    old_key, old = history_pdf_snapshot(server, path, before)
    new_key, new = history_pdf_snapshot(server, path, after)
    changes = []
    old_lines, new_lines = before.splitlines(), after.splitlines()
    matcher = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=len(old_lines)*len(new_lines)>4_000_000)
    for kind, a, b, c, d in matcher.get_opcodes():
        if kind != 'equal':
            change = {'kind': kind, 'before': history_pdf_regions(old, a, b),
                      'after': history_pdf_regions(new, c, d)}
            changes.append(change)
    history_pdf_highlights(old, new, changes)
    return {'before': '/history/pdf/' + old_key, 'after': '/history/pdf/' + new_key, 'changes': changes}


def history_pdf_highlights(old, new, changes):
    def words(snapshot):
        if 'words' not in snapshot:
            # Reuse the installed Poppler tools; no rasterization or source markup.
            sibling = Path(shutil.which('pdfinfo')).with_name('pdftotext' + ('.exe' if os.name == 'nt' else ''))
            executable = str(sibling) if sibling.is_file() else shutil.which('pdftotext')
            if not executable:
                raise ValueError('PDF 改动标红需要 Poppler 的 pdftotext。')
            result = subprocess.run([executable, '-bbox', '-enc', 'UTF-8', str(snapshot['pdf']), '-'],
                                    capture_output=True, timeout=10)
            if result.returncode:
                raise ValueError('无法读取历史 PDF 的文字位置。')
            # Some TeX math fonts use control codes that Poppler emits as invalid XML text.
            xml = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', lambda match: chr(0xe000 + ord(match[0])),
                         result.stdout.decode('utf-8', errors='replace'))
            try:
                pages = ET.fromstring(xml).findall('.//{*}page')
            except ET.ParseError as error:
                raise ValueError('无法解析历史 PDF 的文字位置。') from error
            snapshot['words'] = []
            for number, page in enumerate(pages, 1):
                left, _, _, top = snapshot['boxes'][number - 1]
                for word in page.findall('.//{*}word'):
                    rect = [left + float(word.get('xMin')), top - float(word.get('yMax')),
                            left + float(word.get('xMax')), top - float(word.get('yMin'))]
                    snapshot['words'].append((number, rect, unicodedata.normalize('NFKC', word.text or '')))
        return snapshot['words']

    def tokens(items):
        result = []
        for word in items:
            page, rect, text = word
            if result:
                previous, parts = result[-1]
                last_page, last_rect, _ = parts[-1]
                if re.search(r'[^\W\d_]-$', previous) and text[:1].isalpha() and (
                    page != last_page or rect[3] < last_rect[1]
                ):
                    result[-1] = (previous[:-1] + text, parts + [word])
                    continue
            result.append((text, [word]))
        return result

    # Compare before cropping; normalize line-end hyphens so reflow never colors unchanged words.
    before, after = tokens(words(old)), tokens(words(new))
    regions = [region for change in changes for region in change['after']]
    for region in regions:
        region['highlights'] = []
    matcher = difflib.SequenceMatcher(None, [word[0] for word in before], [word[0] for word in after],
                                     autojunk=len(before)*len(after)>4_000_000)
    for kind, _, _, first, last in matcher.get_opcodes():
        if kind in ('insert', 'replace'):
            for page, rect, _ in (word for _, parts in after[first:last] for word in parts):
                for region in regions:
                    if page == region['page'] and region['rect'][0] <= (rect[0]+rect[2])/2 <= region['rect'][2] and region['rect'][1] <= (rect[1]+rect[3])/2 <= region['rect'][3]:
                        region['highlights'].append(rect)


def make_server(path, port=0, main_thread=None):
    main_thread = main_thread if main_thread is not None else os.environ.get('CODEX_THREAD_ID')
    path = Path(path).resolve(strict=True)
    if not path.is_file() or path.suffix.lower() != '.tex':
        raise ValueError('Choose an existing UTF-8 .tex file.')
    compiler(snapshot(path)['source'])
    if not shutil.which('pdfinfo'):
        raise RuntimeError('pdfinfo is not on PATH. Use Poppler from the Codex bundled workspace runtime.')
    history = History(path)
    history.record(snapshot(path)['source'], 'open')
    build = tempfile.TemporaryDirectory(prefix='latex-codex-')
    state_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        timeout = 10

        def log_message(self, *_):
            pass

        def reply(self, code, data, content_type='application/json; charset=utf-8'):
            body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'SAMEORIGIN')
            self.end_headers()
            self.wfile.write(body)

        def local(self):
            expected = f'127.0.0.1:{self.server.server_port}'
            if self.headers.get('Host') != expected or self.headers.get('Origin', 'http://' + expected) != 'http://' + expected:
                self.reply(403, {'error': 'Only same-origin loopback requests are accepted.'})
                return False
            return True

        def do_GET(self):
            if urlsplit(self.path).path == '/' or self.path.startswith('/vendor/'):
                self.get()
            else:
                with state_lock:
                    self.get()

        def get(self):
            if not self.local():
                return
            parsed = urlsplit(self.path)
            route = parsed.path
            if route == '/':
                self.reply(200, PAGE.encode('utf-8'), 'text/html; charset=utf-8')
            elif route.startswith('/vendor/') and route[8:] in ASSETS:
                self.reply(200, (VENDOR / route[8:]).read_bytes(), ASSETS[route[8:]] + '; charset=utf-8')
            elif route == '/state':
                try:
                    state = snapshot(path)
                    history.record(state['source'])
                    self.reply(200, state)
                except (OSError, UnicodeError, sqlite3.Error) as error:
                    self.reply(500, {'error': str(error)})
            elif route == '/history':
                try:
                    query = parse_qs(parsed.query)
                    if query.get('path', [''])[0] != str(path):
                        raise FileConflict('当前文件已切换，请重新打开历史。')
                    state = snapshot(path)
                    history.record(state['source'])
                    before = query.get('before', [None])[0]
                    self.reply(200, {**history.list(int(before) if before is not None else None), 'path': str(path)})
                except FileConflict as error:
                    self.reply(409, {'error': str(error)})
                except ValueError as error:
                    self.reply(400, {'error': str(error)})
                except (OSError, UnicodeError, sqlite3.Error) as error:
                    self.reply(500, {'error': str(error)})
            elif route == '/chat/history':
                try:
                    self.reply(200, history.chat_read())
                except (OSError, sqlite3.Error) as error:
                    self.reply(500, {'error': str(error)})
            elif route == '/history/summaries':
                job = self.server.history_summary
                if not job or parse_qs(parsed.query).get('id',[''])[0] != job.id:
                    self.reply(404, {'error':'改动摘要任务已结束。'})
                else:
                    self.reply(200, job.result)
            elif route == '/chat/context':
                try:
                    context = main_chat_context(main_thread)
                    self.reply(200, {'available': context['available'], 'count': len(context['messages']), 'truncated': context['truncated']})
                except (OSError, ValueError) as error:
                    self.reply(500, {'error': '主对话读取失败：' + str(error)})
            elif route == '/chat/models':
                try:
                    self.reply(200, {'models': chat_models()})
                except ValueError as error:
                    self.reply(500, {'error': str(error)})
            elif route == '/chat':
                job = self.server.chat
                if not job or parse_qs(parsed.query).get('id', [''])[0] != job.id:
                    self.reply(404, {'error': '临时对话已结束。'})
                else:
                    self.reply(200, job.result)
            elif route.startswith('/history/pdf/') and route[13:] in self.server.history_pdfs:
                self.reply(200, self.server.history_pdfs[route[13:]]['pdf'].read_bytes(), 'application/pdf')
            elif route == '/pdf' and self.server.pdf:
                requested = parse_qs(parsed.query).get('v', [self.server.pdf_revision])[0]
                if requested != self.server.pdf_revision:
                    self.reply(409, {'error': 'PDF version has changed. Compile again.'})
                else:
                    self.reply(200, self.server.pdf, 'application/pdf')
            else:
                self.reply(404, {'error': 'Not found. Compile successfully to create a PDF.'})

        def do_POST(self):
            with state_lock:
                self.post()

        def post(self):
            nonlocal path, history
            if not self.local():
                return
            if self.path not in ('/compile', '/save', '/open', '/synctex', '/chat', '/chat/cancel', '/chat/new', '/history/diff', '/history/label', '/history/restore', '/history/pdf', '/history/summaries', '/history/summaries/cancel'):
                self.reply(404, {'error': 'Not found.'})
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if self.headers.get('Content-Type') != 'application/json' or not 0 < size <= 1_000_000:
                    raise ValueError('Expected a JSON request of at most 1 MB.')
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise ValueError('Expected a JSON object.')
                if self.path.startswith('/history/'):
                    if data.get('path') != str(path):
                        raise FileConflict('当前文件已切换，请重新打开历史。')
                    if self.path == '/history/summaries/cancel':
                        job = self.server.history_summary
                        if job and job.id == data.get('id') and job.result['status']=='running': job.cancel()
                        self.reply(200, {'ok':True})
                        return
                    if self.path == '/history/summaries':
                        job = self.server.history_summary
                        if job and job.result['status']=='running':
                            self.reply(200, {'id':job.id})
                            return
                        items = history.summary_context(data.get('ids'))
                        if not items:
                            self.reply(200, {'status':'done','summaries':[]})
                            return
                        self.server.history_summary = ChatJob({'task':'history-summary','items':items,'effort':'low'},history).start()
                        self.reply(200, {'id':self.server.history_summary.id})
                        return
                    revision = history.get(data.get('id'))
                    if self.path == '/history/label':
                        history.label(revision['id'], data.get('label'))
                        self.reply(200, {'ok': True})
                        return
                    if self.path in ('/history/diff', '/history/pdf'):
                        baseline = history.previous(revision['id']) if data.get('compare') == 'previous' else revision
                        old = (baseline or revision)['source']
                        target = revision['source'] if data.get('compare') == 'previous' else history.get(data['target_id'])['source'] if 'target_id' in data else data.get('source')
                        if not isinstance(target, str):
                            raise ValueError('缺少用于对比的源码。')
                        if self.path == '/history/pdf':
                            self.reply(200, history_pdf_changes(self.server, path, old, target))
                            return
                        self.reply(200, {**revision, 'diff': difference(old, target), 'changes': word_changes(old, target),
                                         'same': old == target, 'first': baseline is None})
                        return
                    if not isinstance(data.get('source'), str) or not isinstance(data.get('version'), str):
                        raise ValueError('Expected source and version strings.')
                    # Preserve even an unsaved editor draft before restoring a snapshot.
                    state = save_source(path, revision['source'], data['version'], history, 'restore', data['source'])
                    self.server.sync_version = ''
                    self.reply(200, state)
                    return
                if self.path == '/chat/cancel':
                    if self.server.chat and data.get('id') == self.server.chat.id:
                        self.server.chat.cancel()
                        self.server.chat = None
                    self.reply(200, {'cancelled': True})
                    return
                if self.path == '/chat/new':
                    if data.get('path') != str(path):
                        raise FileConflict('当前文件已切换，请重新打开对话。')
                    if self.server.chat and self.server.chat.result['status'] == 'running':
                        raise FileConflict('请先停止当前回复。')
                    self.reply(200, history.chat_new())
                    return
                if self.path == '/chat':
                    if self.server.chat and self.server.chat.result['status'] == 'running':
                        self.reply(409, {'error': 'Codex 正在回复，请稍候或停止后重试。'})
                        return
                    memory = None
                    memory_revision = None
                    if data.get('remember') is True:
                        state = history.chat_read()
                        if type(data.get('memory_revision')) is not int or data['memory_revision'] != state['revision']:
                            raise FileConflict('项目对话已更新，请重新打开对话后重试。')
                        incoming = data.get('messages')
                        if not isinstance(incoming, list) or not incoming:
                            raise ValueError('请输入问题。')
                        recent = state['messages'][-38:]
                        # ponytail: replay the recent 20 turns within 80k characters; summarize older turns if needed later.
                        while recent and len(json.dumps(recent,ensure_ascii=False)) > 80_000:
                            recent = recent[2:]
                        data = {**data, 'messages': recent + [incoming[-1]]}
                        memory, memory_revision = history, state['revision']
                    self.server.chat = ChatJob(chat_context(data, path, main_thread), memory, memory_revision).start()
                    self.reply(200, {'id': self.server.chat.id})
                    return
                if self.path == '/synctex':
                    if not self.server.sync_version or data.get('version') != self.server.sync_version or data.get('pdf_revision') != self.server.pdf_revision or snapshot(path)['version'] != self.server.sync_version:
                        self.reply(409, {'error': '源码与 PDF 版本不同，请先成功编译后再定位。'})
                        return
                    self.reply(200, locate(path, self.server.build.name, self.server.page_boxes, data))
                    return
                if self.path == '/open':
                    selected = choose_file(path)
                    if not selected:
                        self.reply(200, {'cancelled': True})
                        return
                    candidate = Path(selected).resolve(strict=True)
                    if not candidate.is_file() or candidate.suffix.lower() != '.tex':
                        raise ValueError('Choose an existing UTF-8 .tex file.')
                    state = snapshot(candidate)
                    new_history = History(candidate)
                    new_history.record(state['source'], 'open')
                    new_build = tempfile.TemporaryDirectory(prefix='latex-codex-')
                    self.server.build.cleanup()
                    self.server.build = new_build
                    if self.server.history_summary:
                        self.server.history_summary.cancel()
                        self.server.history_summary = None
                    path = candidate
                    history = new_history
                    self.server.pdf, self.server.pdf_revision = b'', ''
                    self.server.page_boxes, self.server.sync_version = [], ''
                    self.reply(200, state)
                    return
                if not isinstance(data.get('source'), str) or not isinstance(data.get('version'), str):
                    raise ValueError('Expected source and version strings.')
                if self.path == '/save':
                    state = save_source(path, data['source'], data['version'], history)
                    if state['version'] != self.server.sync_version:
                        self.server.sync_version = ''
                    self.reply(200, state)
                    return
                engine_name, _ = compiler(data['source'])
                version = save_source(path, data['source'], data['version'], history)['version']
                self.server.sync_version = ''
                try:
                    ok, log, engine_name = compile_tex(path, self.server.build.name, data['source'])
                    pdf = Path(self.server.build.name) / (path.stem + '.pdf')
                    ok = ok and pdf.is_file()
                    if ok:
                        boxes = pdf_page_boxes(pdf)
                        self.server.pdf = pdf.read_bytes()
                        self.server.pdf_revision = hashlib.sha256(self.server.pdf).hexdigest()
                        self.server.page_boxes = boxes
                        if pdf.with_suffix('.synctex.gz').exists() or pdf.with_suffix('.synctex').exists():
                            self.server.sync_version = version
                except subprocess.TimeoutExpired:
                    ok, log = False, 'Compilation timed out after 45 seconds. Source saved; previous preview retained.'
                self.reply(200, {'ok': ok, 'log': log[-24000:], 'diagnostic': None if ok else compile_diagnostic(log, path), 'version': version, 'pages': len(self.server.page_boxes), 'pdf_revision': self.server.pdf_revision, 'engine': engine_name, 'sync': bool(self.server.sync_version), 'labels': compiled_labels(pdf.with_suffix('.aux')) if ok else {}})
            except subprocess.TimeoutExpired:
                self.reply(500, {'error': '历史版本编译或定位超时，请重试。' if self.path == '/history/pdf' else '定位超时，请重试。'})
            except FileConflict as error:
                self.reply(409, {'error': str(error)})
            except (ValueError, UnicodeError) as error:
                self.reply(400, {'error': str(error)})
            except (OSError, tk.TclError, sqlite3.Error) as error:
                self.reply(500, {'error': str(error)})

    # Browser preconnects must not monopolize accept(); serialize document operations, not idle sockets.
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.chat = None
    server.history_summary = None
    server.history_pdfs = {}
    server.pdf = b''
    server.pdf_revision = ''
    server.page_boxes = []
    server.sync_version = ''
    server.build = build
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--port', type=int, default=0)
    args = parser.parse_args()
    try:
        server = make_server(args.file, args.port)
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired, sqlite3.Error) as error:
        parser.exit(1, str(error) + '\n')
    print(f'http://127.0.0.1:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if server.chat:
            server.chat.cancel()
        if server.history_summary:
            server.history_summary.cancel()
        server.build.cleanup()
        for cached in server.history_pdfs.values():
            cached['directory'].cleanup()
