#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""訓練三個分類器，五折交叉驗證，把結果寫成 metrics.json。

    python train.py

幾個刻意的選擇：

**字元 n-gram，不斷詞。** 中文斷詞器對「大麥克或勁辣雞腿堡＋小薯$89」這種
混了品名、數字、符號的短句常常切壞，而且多一個套件依賴。char_wb 2–4 gram
不用斷詞就能抓到「買一送」「折價券」「免費」「滿$」這些關鍵片段。

**一定要有 baseline。** 每個任務都先跑「永遠猜最大宗類別」，模型沒贏過它就
沒有價值。581 筆資料很小，不先釘住這條線很容易自我感覺良好。

**看 macro-F1，不只看準確率。** 類別很不平均（最大的 49%、最小的 6%），
只看準確率會獎勵「全部猜最大宗」。

**交叉驗證用 out-of-fold 預測。** 每一筆都由沒看過它的那一折來預測，
所以下面的準確率、混淆矩陣、信心門檻曲線全部是同一份乾淨的預測算出來的。
"""

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import make_pipeline
from sklearn.svm import LinearSVC

import dataset as ds

HERE = Path(__file__).resolve().parent
OUT = HERE / "metrics.json"
MODELS = HERE / "models"
SEED = 20261124
FOLDS = 5


def vec():
    return TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4),
                           min_df=2, sublinear_tf=True)


def candidates():
    return {
        "最大宗（baseline）": make_pipeline(vec(), DummyClassifier(strategy="most_frequent")),
        "ComplementNB": make_pipeline(vec(), ComplementNB(alpha=0.3)),
        "羅吉斯迴歸": make_pipeline(vec(), LogisticRegression(max_iter=3000, C=5)),
        "羅吉斯迴歸（平衡類別）": make_pipeline(
            vec(), LogisticRegression(max_iter=3000, C=5, class_weight="balanced")),
        "線性 SVM（校準過）": make_pipeline(
            vec(), CalibratedClassifierCV(LinearSVC(C=1), cv=3)),
    }


def coverage_curve(proba, classes, y_true, y_pred):
    """信心門檻 → 覆蓋率與準確率。

    產品上不需要模型每一筆都答；只要「有把握的那些」夠準，就可以自動預填，
    其餘留給人。這條曲線就是在找那個門檻。"""
    conf = proba.max(axis=1)
    out = []
    for th in [0.0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
        keep = conf >= th
        n = int(keep.sum())
        out.append({
            "threshold": th,
            "coverage": round(100 * n / len(y_true), 1),
            "accuracy": round(100 * accuracy_score(np.array(y_true)[keep],
                                                   np.array(y_pred)[keep]), 1) if n else None,
            "n": n,
        })
    return out


def run_task(task):
    X, y = ds.load(task)
    X, y = np.array(X), np.array(y)
    cv = StratifiedKFold(n_splits=FOLDS, shuffle=True, random_state=SEED)
    counts = Counter(y)
    base_acc = 100 * counts.most_common(1)[0][1] / len(y)

    results = {}
    for name, pipe in candidates().items():
        pred = cross_val_predict(pipe, X, y, cv=cv, n_jobs=1)
        results[name] = {
            "accuracy": round(100 * accuracy_score(y, pred), 1),
            "macro_f1": round(100 * f1_score(y, pred, average="macro"), 1),
        }
        print(f"    {name:22} 準確率 {results[name]['accuracy']:5.1f}%"
              f"   macro-F1 {results[name]['macro_f1']:5.1f}")

    best_name = max((n for n in results if "baseline" not in n),
                    key=lambda n: results[n]["macro_f1"])
    best = candidates()[best_name]
    proba = cross_val_predict(best, X, y, cv=cv, method="predict_proba", n_jobs=1)
    classes = np.unique(y)
    pred = classes[proba.argmax(axis=1)]

    rep = classification_report(y, pred, output_dict=True, zero_division=0)
    labels = sorted(classes)
    cm = confusion_matrix(y, pred, labels=labels).tolist()

    best.fit(X, y)
    MODELS.mkdir(exist_ok=True)
    import joblib
    joblib.dump(best, MODELS / f"{task}.joblib")

    return {
        "task": task,
        "title": ds.TASK_TITLE[task],
        "n": len(y),
        "n_classes": len(classes),
        "baseline_accuracy": round(base_acc, 1),
        "models": results,
        "best": best_name,
        "accuracy": round(100 * accuracy_score(y, pred), 1),
        "macro_f1": round(100 * f1_score(y, pred, average="macro"), 1),
        "labels": [ds.pretty(task, c) for c in labels],
        "raw_labels": labels,
        "support": [int(counts[c]) for c in labels],
        "per_class": [{
            "label": ds.pretty(task, c),
            "precision": round(100 * rep[c]["precision"], 1),
            "recall": round(100 * rep[c]["recall"], 1),
            "f1": round(100 * rep[c]["f1-score"], 1),
            "support": int(rep[c]["support"]),
        } for c in labels],
        "confusion": cm,
        "coverage": coverage_curve(proba, classes, y, pred),
        # 上線要用的門檻：在「自動填的那些至少九成對」的前提下，覆蓋率最大的那一個。
        # 九成是自己定的——預填錯一欄的代價是審稿的人要改回來，不是災難，
        # 所以可以換比較高的覆蓋率；如果這個欄位改錯會直接影響使用者，門檻要再拉高。
        "operating_point": next(
            (c for c in coverage_curve(proba, classes, y, pred)
             if c["accuracy"] is not None and c["accuracy"] >= 90 and c["n"] >= 20),
            None),
    }


def quick(X, y):
    """只要一組準確率／macro-F1，給消融實驗用。"""
    X, y = np.array(X), np.array(y)
    cv = StratifiedKFold(n_splits=FOLDS, shuffle=True, random_state=SEED)
    pipe = make_pipeline(vec(), LogisticRegression(max_iter=3000, C=5,
                                                   class_weight="balanced"))
    pred = cross_val_predict(pipe, X, y, cv=cv, n_jobs=1)
    return (round(100 * accuracy_score(y, pred), 1),
            round(100 * f1_score(y, pred, average="macro"), 1),
            len(y), len(set(y)))


def ablations():
    """兩個對照實驗，解釋「為什麼有的任務做不起來」。"""
    out = []

    # 1. 分類法本身：把餐廳／火鍋／燒肉／速食併成「餐飲」再分一次。
    #    如果準確率大跳，那瓶頸是標籤怎麼切，不是模型不夠強。
    base_acc, base_f1, n, k = quick(*ds.load("category"))
    m_acc, m_f1, mn, mk = quick(*ds.load("category", merge_dining=True))
    out.append({
        "name": "把餐飲細類合併成一類",
        "task": "category",
        "before": {"accuracy": base_acc, "macro_f1": base_f1, "n_classes": k},
        "after": {"accuracy": m_acc, "macro_f1": m_f1, "n_classes": mk},
        "note": "餐廳／火鍋／燒肉／速食在語意上互相包含，模型分不開很合理。"
                "合併之後準確率跳多少，就是「分類法切太細」要負的責任。",
    })

    # 2. 資料洩漏示範：membership_type 的任務，把 membership 自由文字加進特徵。
    #    準確率會漂亮很多，但那一欄跟答案是同一個人同一個畫面填的，上線時拿不到。
    b_acc, b_f1, *_ = quick(*ds.load("membership_type"))
    l_acc, l_f1, *_ = quick(*ds.load("membership_type", include_membership=True))
    out.append({
        "name": "把 membership 自由文字也餵進去（洩漏）",
        "task": "membership_type",
        "before": {"accuracy": b_acc, "macro_f1": b_f1},
        "after": {"accuracy": l_acc, "macro_f1": l_f1},
        "note": "這一欄幾乎把答案寫在臉上。數字好看，但投稿當下還沒有這一欄，"
                "上線就會掉回原形——這就是為什麼正式模型不收它。",
    })
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    out = {"seed": SEED, "folds": FOLDS, "tasks": []}
    for task in ds.TASKS:
        print(f"\n{ds.TASK_TITLE[task]}（{task}）")
        out["tasks"].append(run_task(task))
    print()
    print("消融實驗")
    out["ablations"] = ablations()
    for a in out["ablations"]:
        print(f"  {a['name']:28} {a['before']['accuracy']}% → {a['after']['accuracy']}%")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n寫好 {OUT.name}")
    for t in out["tasks"]:
        lift = t["accuracy"] - t["baseline_accuracy"]
        print(f"  {t['title']:6} {t['best']:22} 準確率 {t['accuracy']:5.1f}%"
              f"（baseline {t['baseline_accuracy']:.1f}%，+{lift:.1f}）"
              f"  macro-F1 {t['macro_f1']:.1f}")


if __name__ == "__main__":
    main()
