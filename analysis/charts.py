#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""報告裡的圖：直接吐 inline SVG，不用 matplotlib。

為什麼不用 matplotlib：
  1. 中文字型在不同機器上常常缺，圖上出現豆腐方塊；SVG 交給瀏覽器排版就沒這問題。
  2. 顏色用 CSS 變數寫，深色模式自己跟著換，不用出兩套圖檔。
  3. 報告是單一個 HTML 檔，沒有一堆 PNG 要一起搬。

畫法遵守幾條固定規則（出處是 dataviz 的設計規範）：
  * 單一數列只用一個顏色，不照大小漸層（長度已經在表達大小了，顏色不要重複講）
  * 條狀圖最厚 24px，資料那一端圓角 4px、基線那端是方的
  * 格線是 1px 實線、顏色只比底色深一階；不用虛線
  * 不標每一個點的數字，只標該被看見的那幾個
  * 每張圖都有 <title> 可以 hover，底下也都有一份表格（顏色不是唯一的資訊通道）
"""

import html

PAD_L = 8


def esc(s):
    return html.escape(str(s if s is not None else ""))


def fmt_int(n):
    return f"{int(n):,}" if n is not None else "—"


def fmt_num(v):
    """表格用：整數加千分位，小數留兩位（1.54 不要被 int() 砍成 1）。"""
    if v is None:
        return "—"
    if isinstance(v, int) or (isinstance(v, float) and float(v).is_integer()):
        return f"{int(v):,}"
    return f"{v:,.2f}".rstrip("0").rstrip(".")


def _rounded_right(x, y, w, h, r=4):
    """右端圓角、左端（基線）方角的橫條。"""
    r = max(0.0, min(r, h / 2, w))
    if w <= 0.5:
        w = 0.5
        r = 0
    return (f"M{x:.1f},{y:.1f} H{x + w - r:.1f} "
            f"A{r},{r} 0 0 1 {x + w:.1f},{y + r:.1f} "
            f"V{y + h - r:.1f} A{r},{r} 0 0 1 {x + w - r:.1f},{y + h:.1f} "
            f"H{x:.1f} Z")


def _rounded_top(x, y, w, h, r=4):
    """上端圓角、下端（基線）方角的直條。"""
    r = max(0.0, min(r, w / 2, h))
    if h <= 0.5:
        h, r = 0.5, 0
    return (f"M{x:.1f},{y + h:.1f} V{y + r:.1f} "
            f"A{r},{r} 0 0 1 {x + r:.1f},{y:.1f} "
            f"H{x + w - r:.1f} A{r},{r} 0 0 1 {x + w:.1f},{y + r:.1f} "
            f"V{y + h:.1f} Z")


def _ticks(vmax, want=4):
    """挑好看的刻度：1／2／2.5／5 ×10^n。"""
    if vmax <= 0:
        return [0], 1
    raw = vmax / want
    mag = 10 ** (len(str(int(raw))) - 1) if raw >= 1 else 0.1
    for m in (1, 2, 2.5, 5, 10):
        step = m * mag
        if raw <= step:
            break
    top = step * (int(vmax / step) + (0 if abs(vmax % step) < 1e-9 else 1))
    n = int(round(top / step))
    return [step * i for i in range(n + 1)], top


def hbar(rows, *, label, value, note=None, highlight=None, unit="",
         width=720, row_h=28, bar_h=16, label_w=132, title=None,
         ref=None, ref_label=""):
    """橫條圖：類別比大小用。rows 是 dict 的 list。

    highlight：要被看見的那一列（label 值），用實色；其他列同色但淡一階，
    這是「強調一個，其餘退後」而不是把顏色拿去編碼大小。
    ref：一條參考線（例如「全台連鎖就有的地板」），標籤放在圖上方的留白，不壓到任何一條。
    """
    rows = list(rows)
    vals = [float(r[value] or 0) for r in rows]
    tick_vals, top = _ticks(max(vals) if vals else 0)
    x0 = label_w + PAD_L
    x1 = width - 56
    span = x1 - x0
    pad_top = 18 if ref is not None else 0
    y_top = 6 + pad_top
    h = len(rows) * row_h + 34 + pad_top
    out = [f'<svg class="chart" viewBox="0 0 {width} {h}" role="img" '
           f'aria-label="{esc(title or "")}" preserveAspectRatio="xMidYMid meet">']
    # 格線（先畫，才會在條狀圖底下）
    for t in tick_vals:
        x = x0 + span * (t / top if top else 0)
        out.append(f'<line class="grid" x1="{x:.1f}" y1="{y_top}" x2="{x:.1f}" y2="{h - 28}"/>')
        out.append(f'<text class="tick" x="{x:.1f}" y="{h - 12}" text-anchor="middle">'
                   f'{fmt_int(t)}</text>')
    for i, r in enumerate(rows):
        y = y_top + i * row_h
        v = float(r[value] or 0)
        w = span * (v / top if top else 0)
        cls = "bar" if (highlight is None or r[label] == highlight) else "bar bar-dim"
        tip = f'{esc(r[label])}：{fmt_int(v)}{esc(unit)}'
        if note and r.get(note) is not None:
            tip += f'（{esc(r[note])}）'
        out.append(f'<g class="row"><title>{tip}</title>')
        out.append(f'<text class="lbl" x="{label_w}" y="{y + bar_h - 3}" '
                   f'text-anchor="end">{esc(r[label])}</text>')
        out.append(f'<path class="{cls}" d="{_rounded_right(x0, y, w, bar_h)}"/>')
        out.append(f'<text class="val" x="{x0 + w + 6:.1f}" y="{y + bar_h - 3}">'
                   f'{fmt_int(v)}{esc(unit)}</text>')
        out.append('</g>')
    # 參考線畫在長條之後，才不會被長條蓋掉
    if ref is not None:
        xr = x0 + span * (ref / top if top else 0)
        out.append(f'<line class="refline" x1="{xr:.1f}" y1="{y_top - 12}" '
                   f'x2="{xr:.1f}" y2="{h - 28}"/>')
        out.append(f'<text class="reflbl" x="{xr + 5:.1f}" y="{y_top - 6}">'
                   f'{esc(ref_label)}</text>')
    out.append(f'<line class="axis" x1="{x0}" y1="{y_top}" x2="{x0}" y2="{h - 28}"/>')
    out.append('</svg>')
    return "\n".join(out)


def column(rows, *, label, value, unit="", width=720, height=240, title=None, sub=None):
    """直條圖：少數幾個有順序的分組。"""
    rows = list(rows)
    vals = [float(r[value] or 0) for r in rows]
    tick_vals, top = _ticks(max(vals) if vals else 0)
    left, right, bottom = 44, 12, 46
    x0, y0 = left, 10
    plot_w, plot_h = width - left - right, height - bottom - y0
    n = len(rows)
    band = plot_w / max(1, n)
    bar_w = min(24.0, band - 18)
    out = [f'<svg class="chart" viewBox="0 0 {width} {height}" role="img" '
           f'aria-label="{esc(title or "")}">']
    for t in tick_vals:
        y = y0 + plot_h * (1 - (t / top if top else 0))
        out.append(f'<line class="grid" x1="{x0}" y1="{y:.1f}" x2="{width - right}" y2="{y:.1f}"/>')
        out.append(f'<text class="tick" x="{x0 - 8}" y="{y + 4:.1f}" text-anchor="end">'
                   f'{fmt_int(t)}</text>')
    for i, r in enumerate(rows):
        v = float(r[value] or 0)
        bh = plot_h * (v / top if top else 0)
        x = x0 + band * i + (band - bar_w) / 2
        y = y0 + plot_h - bh
        out.append(f'<g class="row"><title>{esc(r[label])}：{fmt_int(v)}{esc(unit)}</title>')
        out.append(f'<path class="bar" d="{_rounded_top(x, y, bar_w, bh)}"/>')
        out.append(f'<text class="val" x="{x + bar_w / 2:.1f}" y="{y - 6:.1f}" '
                   f'text-anchor="middle">{fmt_int(v)}{esc(unit)}</text>')
        out.append(f'<text class="lbl" x="{x0 + band * i + band / 2:.1f}" '
                   f'y="{y0 + plot_h + 18}" text-anchor="middle">{esc(r[label])}</text>')
        if sub and r.get(sub):
            out.append(f'<text class="sublbl" x="{x0 + band * i + band / 2:.1f}" '
                       f'y="{y0 + plot_h + 33}" text-anchor="middle">{esc(r[sub])}</text>')
        out.append('</g>')
    out.append(f'<line class="axis" x1="{x0}" y1="{y0 + plot_h}" '
               f'x2="{width - right}" y2="{y0 + plot_h}"/>')
    out.append('</svg>')
    return "\n".join(out)


def scatter(points, *, x, y, name, width=720, height=340, xlabel="", ylabel="",
            xticks=None, annotate=(), log_x=True, title=None):
    """散佈圖：兩個連續變數的關係。x 取 log10（門市數從 1 到 583，不取對數會擠成一團）。"""
    import math
    pts = list(points)
    left, right, top_pad, bottom = 52, 16, 30, 44
    x0, y0 = left, top_pad
    plot_w, plot_h = width - left - right, height - bottom - top_pad

    xs = [(math.log10(max(1.0, float(p[x]))) if log_x else float(p[x])) for p in pts]
    ys = [float(p[y]) for p in pts]
    xmin, xmax = min(xs), max(xs)
    xmin -= (xmax - xmin) * 0.04
    xmax += (xmax - xmin) * 0.04
    ytick_vals, ytop = _ticks(max(ys))

    def px(v):
        return x0 + plot_w * ((v - xmin) / (xmax - xmin))

    def py(v):
        return y0 + plot_h * (1 - v / ytop)

    out = [f'<svg class="chart" viewBox="0 0 {width} {height}" role="img" '
           f'aria-label="{esc(title or "")}">']
    for t in ytick_vals:
        yy = py(t)
        out.append(f'<line class="grid" x1="{x0}" y1="{yy:.1f}" x2="{width - right}" y2="{yy:.1f}"/>')
        out.append(f'<text class="tick" x="{x0 - 8}" y="{yy + 4:.1f}" text-anchor="end">'
                   f'{fmt_int(t)}</text>')
    for t in (xticks or [1, 3, 10, 30, 100, 300]):
        v = math.log10(t) if log_x else t
        if not (xmin <= v <= xmax):
            continue
        xx = px(v)
        out.append(f'<text class="tick" x="{xx:.1f}" y="{y0 + plot_h + 18}" '
                   f'text-anchor="middle">{fmt_int(t)}</text>')
    for p, vx, vy in zip(pts, xs, ys):
        out.append(f'<g class="row"><title>{esc(p[name])}：{fmt_int(p[x])} 家店、'
                   f'面額 {fmt_int(p[y])} 元</title>'
                   f'<circle class="dot" cx="{px(vx):.1f}" cy="{py(vy):.1f}" r="4.5"/></g>')
    for nm, dx, dy in annotate:
        for p, vx, vy in zip(pts, xs, ys):
            if p[name] == nm:
                # 靠右邊的點改成往左標，不然字會被圖的右緣切掉
                anchor = "end" if dx < 0 else "start"
                out.append(f'<text class="anno" x="{px(vx) + dx:.1f}" y="{py(vy) + dy:.1f}" '
                           f'text-anchor="{anchor}">{esc(nm)}</text>')
    out.append(f'<line class="axis" x1="{x0}" y1="{y0 + plot_h}" x2="{width - right}" '
               f'y2="{y0 + plot_h}"/>')
    out.append(f'<text class="axlbl" x="{width - right}" y="{height - 6}" '
               f'text-anchor="end">{esc(xlabel)}</text>')
    out.append(f'<text class="axlbl" x="2" y="12">{esc(ylabel)}</text>')
    out.append('</svg>')
    return "\n".join(out)


def heat_table(rows, *, row_label, cols, total_key=None, extra=()):
    """交叉表：格子底色用單一藍色由淺到深（連續量只用一個色相，不用彩虹）。
    數字一定印在格子裡，顏色只是輔助——色盲或列印時還是讀得到。"""
    vmax = max([float(r[c] or 0) for r in rows for c, _ in cols] or [1])
    th = "".join(f"<th>{esc(t)}</th>" for _, t in cols)
    extra_th = "".join(f"<th>{esc(t)}</th>" for _, t in extra)
    body = []
    for r in rows:
        tds = []
        for c, _ in cols:
            v = float(r[c] or 0)
            a = 0 if vmax == 0 else (v / vmax) ** 0.65
            ink = ' class="on-fill"' if a > 0.62 else ""
            tds.append(f'<td{ink} style="background:rgba(42,120,214,{a * 0.92:.2f})">'
                       f'{fmt_int(v) if v else "·"}</td>')
        ex = "".join(f"<td>{fmt_num(r[c]) if r.get(c) is not None else '—'}</td>" for c, _ in extra)
        tot = f"<td><b>{fmt_int(r[total_key])}</b></td>" if total_key else ""
        body.append(f"<tr><th scope=\"row\">{esc(r[row_label])}</th>{tot}"
                    f"{''.join(tds)}{ex}</tr>")
    tot_th = "<th>合計</th>" if total_key else ""
    return (f'<table class="matrix"><thead><tr><th></th>{tot_th}{th}{extra_th}</tr></thead>'
            f'<tbody>{"".join(body)}</tbody></table>')


def table(rows, cols, cls="data"):
    """一般表格：每張圖都配一份，讓所有數字都讀得到。"""
    th = "".join(f"<th>{esc(t)}</th>" for _, t in cols)
    body = []
    for r in rows:
        tds = []
        for k, _ in cols:
            v = r.get(k)
            tds.append(f"<td>{fmt_num(v) if isinstance(v, (int, float)) else esc(v or '—')}</td>")
        body.append(f"<tr>{''.join(tds)}</tr>")
    return f'<table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{"".join(body)}</tbody></table>'


def stat(label, value, sub=None, tone=""):
    t = f' data-tone="{tone}"' if tone else ""
    s = f'<div class="stat-sub">{esc(sub)}</div>' if sub else ""
    return (f'<div class="stat"{t}><div class="stat-label">{esc(label)}</div>'
            f'<div class="stat-value">{value}</div>{s}</div>')
