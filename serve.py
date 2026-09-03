#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本機測試伺服器。

為什麼需要這個？
----------------
直接雙擊 index.html 時網址是 file:///C:/...，
Google OAuth 與 Supabase 都**不接受 file:// 這種來源**，所以登入按鈕會沒反應。
用這支腳本把網站跑在 http://localhost:5173，登入才會動。

用法：
    python serve.py
然後瀏覽器打開 http://localhost:5173

記得到 Supabase → Authentication → URL Configuration，
把 http://localhost:5173 加進 Redirect URLs。
"""
import http.server
import socketserver
import webbrowser
from pathlib import Path

PORT = 5173
HERE = Path(__file__).parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def end_headers(self):
        # service worker 需要正確的 MIME 與不快取，開發時才不會改了沒反應
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "GET" in (args[0] if args else ""):
            super().log_message(fmt, *args)


def main():
    if not (HERE / "config.js").exists():
        print("⚠️  找不到 config.js —— 網站會以離線示範模式開啟，無法登入。")
        print("    請先把 config.example.js 複製成 config.js 並填入 Supabase 金鑰。\n")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"網站已啟動：{url}")
        print(f"（Supabase → Authentication → URL Configuration 要加入 {url}）")
        print("按 Ctrl+C 結束\n")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")


if __name__ == "__main__":
    main()
