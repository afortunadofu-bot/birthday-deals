# 版本紀錄

每個版本對應一個 `schema_vN_*.sql` 檔案（資料庫變更）跟／或 `template.html`
的前端變更。**新版本上線前，要先把對應的 `schema_vN_*.sql` 貼進 Supabase
SQL Editor 執行一次**，前端才會抓得到新的欄位／view／RPC。全部可重複執行
（`create or replace`），跑第二次不會壞。

由新到舊排序。

---

## v52　「建議修改」補齊漏掉的欄位（適用縣市等）

`schema_v52_offer_edits_more_fields.sql`

celine 回饋：建議修改只改「適用縣市」，填了修改原因還是被「沒有偵測到任何
欄位變動」擋下來送不出去。前端比對「改之前 vs 改之後」的欄位清單原本只有
8 個（品牌／內容／條件／會員取得／期間／提前天數／價值／檔期迄日），漏了
適用縣市、類別、會員種類、免費層級、生效日、需同行、可轉讓、資料來源。
更深一層的問題是：就算前端偵測到了、管理員也核可了，`review_offer_edit()`
套用 patch 到 offers 表時同樣只處理那 8 個欄位，改「適用縣市」這種漏掉的
欄位會被靜靜忽略——核可訊息顯示成功，但網站上的內容其實沒變。這支把兩邊
都補齊了。

## v51　類別「連鎖餐廳」改名「餐廳」

`schema_v51_category_restaurant.sql`

celine 回饋：「19to1鮮選牛排專賣店」這種單店餐廳不屬於速食／火鍋燒肉，卻
也不太敢選「連鎖餐廳」，結果只能選「其他」——但「其他」在依類別篩選時常
被當成非餐飲類漏掉。類別名稱拿掉「連鎖」兩字改成「餐廳」，泛指各種內用型
餐廳（含單店），既有資料庫裡的 category='連鎖餐廳' 一起改成'餐廳'。

## v50　待辦清單年度標籤 ＋ 一批體驗修正

`schema_v50_wishlist_year.sql`

待辦清單加「年度」欄位，可以提早存明年的代辦、切換看哪一年的清單；清單裡
順便顯示每一筆對應的入會註冊死線日期（跟著生日算，不用自己心算）。另外這
批純前端修正：成就徽章點下去用 toast 講清楚達成條件跟目前數值；排行榜分頁
七個區塊都能收合成小標題；使用回報第一次送出後提示要不要留言分享心得或提
出修改建議；修好手機版往上滑到一半搜尋鍵按不到的 bug（根因是搜尋列黏著的
容器只有 230px 高，滑過去就整個消失，要滑回接近最頂端才會再出現——移到跟
卡片列表同一個容器底下後，黏著範圍就跟整份列表一樣長）。

## v49　最多人收藏／大家都在用什麼 加排名升降指標

`schema_v49_popular_wished_prev.sql`

「大家都在用什麼」「最多人收藏」這兩張榜跟「7 天前」比，補上 ▲▼ 名次升降
箭頭跟 NEW 標記（原本只有省錢榜／貢獻度榜有）。

## v48　管理員可看排行榜上榜人電子信箱

`schema_v48_admin_leaderboard_email.sql`

管理員長按（手機）／按住頭貼可以看到排行榜上榜人的信箱，方便聯絡查證。

## v47　待辦清單可手動排序 ＋ 踩點日記優惠

`schema_v47_wishlist_sort_order.sql`　`schema_v47_diary_offers.sql`

待辦清單項目可以拖曳排序；桃園／淡水／南港／北車踩點日記爬文核實後新增與
修正的優惠。

## v46　公告改版 ＋ 貢獻度排行榜

`schema_v46_announcements_v2.sql`　`schema_v46_contribution_leaderboard.sql`

公告改成有歷史紀錄的表，可編輯／刪除／調整顯示天數，不用登入也看得到；
新增「貢獻度排行榜」（投稿 + 修改建議被核可的次數）。

## v45　排行榜本週區間 ＋ 可轉讓欄位

`schema_v45_leaderboard_weekly.sql`　`schema_v45_transferable.sql`

排行榜加「本週」時間區間；優惠加「可轉讓」欄位並補上篩選。

## v44　修 profiles 隱私漏洞

`schema_v44_profiles_privacy.sql`

任何人拿 anon key 直接打 REST API 都能讀到全部使用者的個資，重新設計排行榜
隱私（預設上榜 + 匿名化）。

## v43　新增 UNIQLO／GU 優惠

`schema_v43_new_offers_uniqlo_gu.sql`

## v42　修改建議可先調整內容再核可

`schema_v42_edit_review_override.sql`

管理員審核「修改建議」時可以先調整內容再核可，不是只能整筆照收或退回。

## v41　儀表板數字全面跟隨時間區間

`schema_v41_dashboard_range.sql`

## v40　優惠修改歷史公開可見

`schema_v40_public_edit_history.sql`

已上架優惠的修改歷史，改成大家都看得到，不只投稿人跟管理員。

## v39　管理員公告

`schema_v39_announcements.sql`

管理員可以發公告到大家的通知鈴鐺。

## v38　使用回報成功自動標記已查證

`schema_v38_auto_verify.sql`

## v37　審核區塊補分析圖表

`schema_v37_review_insights.sql`

核可率、平均審核耗時、待審類別分布、投稿最多的人。

## v36　管理員儀表板：在線人數 + 使用時段分布

`schema_v36_dashboard_online_hours.sql`

## v35　新上架／自上次來訪 入口

`schema_v35_last_seen.sql`

## v34　問題回報改用站內通知回覆

`schema_v34_feedback_reply_notification.sql`

不用再留信箱。

## v33　收藏可加備註

`schema_v33_wishlist_note.sql`

只有自己看得到。

## v32　處理 Security Advisor 警告

`schema_v32_security_advisor_warnings.sql`

## v31　修 admin_list_feedback() 讀取失敗

`schema_v31_fix_admin_list_feedback.sql`

## v30　問題回報分「問題／建議」

`schema_v30_feedback_and_edit_preview.sql`

登入者不用另填信箱，管理員看得到帳號信箱。

## v21–v29　全台品牌分店查核（8 批）＋ 合併重複投稿

`schema_v21_region_fixes_batch1.sql` ～ `schema_v29_region_fixes_batch8_final.sql`
`schema_v23_merge_duplicate_and_batch3.sql`（含合併「門牛十二鍋」→「鬥牛士二鍋」）
`schema_v24_region_fixes_user_submitted.sql`（觀眾投稿的部分）

大型資料查核任務，逐批確認「全台」標示的品牌實際分店分布是否屬實。

## v20　收藏留言通知 ＋ 排行榜最近動態

`schema_v20_notifications.sql`

## v19　管理員改投稿差異紀錄 ＋ 同行者篩選

`schema_v19_misc.sql`

## v18　生日存到個人資料

`schema_v18_misc.sql`

管理員可看會員生日月份分布。

## v17　會員種類加「其他」等雜項

`schema_v17_misc.sql`

## v16　集團優惠資料拆分

`schema_v16_split_groups.sql`

王品集團／三商集團／爭鮮集團。

## v15　管理員儀表板趨勢圖

`schema_v15_dashboard.sql`

## v14　投稿可取消 ＋ 問題回報 ＋ 成效追蹤

`schema_v14_misc.sql`

## v13　民眾評分 ＋ 收藏統計 ＋ 每月排行榜

`schema_v13_ratings.sql`

待審投稿公開預覽。

## v12　審核流程永續化

`schema_v12_restore.sql`

## v11　民眾提出修改建議

`schema_v11_edits.sql`

已上架的優惠可以被提出修改建議，管理員審核通過才會真的改到。

## v10　集團優惠子品牌內容

`schema_v10_suboffers.sql`

## v9　修管理員設定不生效的真正原因

`schema_v9_admin.sql`

網站內直接新增／移除管理員。

## v8　待辦清單

`schema_v8.sql`

## v7　修管理員權限沒生效

`schema_v7_admin_fix.sql`

## v6　投稿者可編輯待審投稿

`schema_v6.sql`

## v5　排行榜可看「這人用過哪些店家」

`schema_v5.sql`

## v4　排行榜／熱門優惠／站台總計

`schema_v4.sql`

---

## v1–v3　初版

從離線示範（58 筆種子資料，`offers.json`）到接上 Supabase 的正式版：
會員種類拆七類、免費層級分兩層、民眾投稿 + 管理員審核、使用回報與留言。
詳見 `README.md`。

---

## 大版本（前端功能，未對應單一 schema 檔）

除了上面資料庫變更，`template.html` 這邊還累積了大量前端功能與體驗優化，
包括但不限於：排行榜可摺疊／分批展開、手機版多次跑版修正、審核批次核可、
管理員儀表板圖表、洞察分析走勢圖、公告系統前端、分享圖卡、徽章成就系統、
省錢摘要推播等。這些多半不需要額外的資料庫 migration，只要重新產出
`index.html` 部署上去就生效。完整的一筆一筆紀錄目前只存在對話紀錄裡，
還沒有整理成文件——如果需要，可以另外拉一份「前端功能清單」出來。
