#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""訓練資料：從 analysis.db 拿已經人工標好的優惠。

輸入（投稿的人一開始就會打的東西）：品牌名 ＋ 優惠內容 ＋ 條件
輸出（現在要人工判斷、想讓模型先填好的三欄）：
    free_tier        免費無低消／免費有低消／買一送一／折扣
    membership_type  不用會員／品牌 APP／LINE／Ocard／品牌自家會員／其他
    category         餐廳／火鍋／燒肉／甜點烘焙／飲料／速食／零售美妝／娛樂樂園／其他

**刻意不放進特徵的欄位**：`membership`（會員取得方式的自由文字，例如
「麥當勞 APP 會員」）。它幾乎直接把 membership_type 寫在臉上，放進去準確率會
好看很多，但那是作弊——真正的投稿流程裡，這一欄跟 membership_type 是同一個
人在同一個畫面填的，模型要在那之前就給出建議才有用。

品牌名可以放：每個品牌在資料裡只出現一次，不會有同一個品牌同時出現在訓練集
跟驗證集的問題；而「○○燒肉」「○○咖啡」這種名字本身就是有效的線索。
"""

import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = HERE.parent / "analysis" / "analysis.db"

# 少於 10 筆的類別合併成「其他」：五折交叉驗證至少要每個類別有 5 筆，
# 4 筆的 tier 會直接讓 StratifiedKFold 爆掉。合併掉比丟掉誠實——
# 那些優惠還是存在，只是模型不該假裝分得出來。
MERGE_INTO_OTHER = {"membership_type": {"card", "tier"}}
# free_tier 的 unknown 不是一個類別，是「還沒標」，所以整列不收。
DROP_LABEL = {"free_tier": {"unknown"}}

LABEL_NAMES = {
    "free_tier": {"free_no_min": "免費無低消", "free_min": "免費有低消",
                  "bogo": "買一送一", "discount": "折扣"},
    "membership_type": {"none": "不用會員", "app": "品牌 APP", "line": "LINE 官方帳號",
                        "ocard": "Ocard 集點", "brand": "品牌自家會員", "其他": "其他"},
}
TASKS = ["free_tier", "membership_type", "category"]
DINING = {"餐廳", "火鍋", "燒肉", "速食"}
TASK_TITLE = {"free_tier": "優惠型態", "membership_type": "入會方式", "category": "類別"}


def text_of(row):
    """投稿當下就有的三樣東西，串成一段文字餵給向量化器。"""
    return " ".join(x for x in (row["brand"], row["offer_text"], row["conditions"]) if x)


def load(task, *, include_membership=False, merge_dining=False):
    """include_membership：示範洩漏用，把 membership 自由文字也餵進去。
    merge_dining：把餐廳／火鍋／燒肉／速食併成「餐飲」，用來證明分類法本身的影響。"""
    if not DB.exists():
        sys.exit(f"找不到 {DB}，先到 analysis/ 跑 python build_db.py --live")
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "select brand, offer_text, conditions, membership,"
        "       free_tier, membership_type, category"
        "  from offers where offer_text is not null and length(offer_text) > 1").fetchall()
    con.close()

    X, y = [], []
    for r in rows:
        label = r[task]
        if label is None or label in DROP_LABEL.get(task, ()):
            continue
        if label in MERGE_INTO_OTHER.get(task, ()):
            label = "其他"
        if merge_dining and task == "category" and label in DINING:
            label = "餐飲"
        txt = text_of(r)
        if include_membership and r["membership"]:
            txt += " " + r["membership"]
        X.append(txt)
        y.append(label)
    return X, y


def pretty(task, label):
    return LABEL_NAMES.get(task, {}).get(label, label)


if __name__ == "__main__":
    import collections
    sys.stdout.reconfigure(encoding="utf-8")
    for t in TASKS:
        X, y = load(t)
        c = collections.Counter(y)
        print(f"{TASK_TITLE[t]}（{t}）：{len(X)} 筆 / {len(c)} 類")
        for k, n in c.most_common():
            print(f"    {pretty(t, k):10} {n:4}  {100 * n / len(y):4.1f}%")
        print(f"    最大類別占比（= 猜最大宗的正確率）{100 * c.most_common(1)[0][1] / len(y):.1f}%")
        print()
    X, _ = load("category")
    print(f"文字長度：最短 {min(len(x) for x in X)}、"
          f"平均 {sum(len(x) for x in X) // len(X)}、最長 {max(len(x) for x in X)} 字")
    print("範例：", X[0][:70])
