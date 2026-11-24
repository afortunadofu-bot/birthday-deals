#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把一段投稿文字丟進模型，看它會預填什麼。

    python predict.py "星巴克 生日當月買一送一，需出示會員條碼"
    echo "..." | python predict.py

每一欄會印出三件事：猜什麼、多有把握、以及**會不會真的自動填**。
門檻是 train.py 從交叉驗證的覆蓋率曲線挑的——挑「自動填的那些至少九成對」
之下覆蓋率最大的那個點，寫在 metrics.json 的 operating_point 裡。
低於門檻就留白給人填，這比填一個錯的省事。
"""

import json
import sys
from pathlib import Path

import joblib

import dataset as ds

HERE = Path(__file__).resolve().parent
MODELS = HERE / "models"
METRICS = HERE / "metrics.json"


def load_all():
    if not METRICS.exists():
        sys.exit("還沒有 metrics.json，先跑 python train.py")
    metrics = {t["task"]: t for t in json.loads(METRICS.read_text(encoding="utf-8"))["tasks"]}
    models = {}
    for task in ds.TASKS:
        f = MODELS / f"{task}.joblib"
        if not f.exists():
            sys.exit(f"找不到 {f}，先跑 python train.py")
        models[task] = joblib.load(f)
    return models, metrics


def predict(text, models, metrics):
    out = []
    for task in ds.TASKS:
        model = models[task]
        proba = model.predict_proba([text])[0]
        i = proba.argmax()
        label = model.classes_[i]
        conf = float(proba[i])
        op = metrics[task].get("operating_point") or {}
        th = op.get("threshold", 1.1)
        runner = sorted(zip(model.classes_, proba), key=lambda kv: -kv[1])[1]
        out.append({
            "task": task,
            "title": ds.TASK_TITLE[task],
            "label": ds.pretty(task, label),
            "confidence": conf,
            "autofill": conf >= th,
            "threshold": th,
            "runner_up": (ds.pretty(task, runner[0]), float(runner[1])),
        })
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    text = " ".join(sys.argv[1:]).strip() or sys.stdin.read().strip()
    if not text:
        sys.exit('用法：python predict.py "品牌 優惠內容 條件"')
    models, metrics = load_all()
    print(f"輸入：{text[:90]}")
    print()
    for r in predict(text, models, metrics):
        mark = "自動填" if r["autofill"] else "留白給人填"
        print(f"  {r['title']:6} {r['label']:10} 信心 {r['confidence']:.0%}"
              f"（門檻 {r['threshold']:.0%}）  → {mark}")
        print(f"         第二名：{r['runner_up'][0]}（{r['runner_up'][1]:.0%}）")


if __name__ == "__main__":
    main()
