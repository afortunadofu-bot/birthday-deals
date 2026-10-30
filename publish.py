"""把要上傳到 Cloudflare 的檔案整理進 ../birthday-deals（celine 上傳的就是那個資料夾）。

    python build.py      # 先產生 index.html／updates.html
    python publish.py    # 再整理上傳資料夾

做三件事：
  1. 網站用得到的檔案（下面 SITE_FILES）複製過去，有變的才覆蓋
  2. 上傳資料夾裡**不在清單上的**東西搬到 ../birthday-deals-不上傳/<今天>/，
     不刪——之前那裡混了 .git、mint_edge_jwt.py、template.html，線上全部看得到
  3. 印一張表：哪些更新了、哪些搬走了、最後資料夾裡有什麼

全部攤平放在最上層，不放子資料夾：上傳時 vendor/ 那一層被攤平過一次，
supabase.min.js 線上只有根目錄那個找得到（前端兩個位置都會找）。
"""
import datetime
import filecmp
import glob
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.normpath(os.path.join(HERE, '..', 'birthday-deals'))
ASIDE = os.path.normpath(os.path.join(HERE, '..', 'birthday-deals-不上傳',
                                      datetime.date.today().isoformat()))

# 上傳後的檔名 → repo 裡的來源
SITE_FILES = {
    'index.html': 'index.html',
    'updates.html': 'updates.html',
    'about.html': 'about.html',
    'privacy.html': 'privacy.html',
    'terms.html': 'terms.html',
    'config.js': 'config.js',              # 只有公開的 anon key；service_role 絕對不能放進去
    'track.js': 'track.js',
    'sw.js': 'sw.js',
    'supabase.min.js': 'vendor/supabase.min.js',
    'manifest.json': 'manifest.json',
    'icon.svg': 'icon.svg',
    'icon-192.png': 'icon-192.png',
    'icon-512.png': 'icon-512.png',
    'og-image.png': 'og-image.png',
    'robots.txt': 'robots.txt',
    'sitemap.xml': 'sitemap.xml',
    'google63fde25685d9acd8.html': 'google63fde25685d9acd8.html',  # Search Console 驗證
}
# 更新動畫的截圖（v162 起），檔名跟著那一波更新換
for f in sorted(glob.glob(os.path.join(HERE, 'whatsnew-*.jpg'))):
    SITE_FILES[os.path.basename(f)] = os.path.basename(f)


def main():
    if not os.path.isdir(DEST):
        sys.exit(f'找不到上傳資料夾：{DEST}')
    missing = [src for src in SITE_FILES.values() if not os.path.isfile(os.path.join(HERE, src))]
    if missing:
        sys.exit('repo 裡少了這些，先跑 build.py 或補檔：' + '、'.join(missing))

    # config.js 是唯一一個帶金鑰的檔案：再擋一次
    cfg = open(os.path.join(HERE, 'config.js'), encoding='utf-8').read()
    import base64, json, re
    for tok in re.findall(r'eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+', cfg):
        payload = json.loads(base64.urlsafe_b64decode(tok + '=' * (-len(tok) % 4)))
        if payload.get('role') != 'anon':
            sys.exit(f'config.js 裡有一把 role={payload.get("role")} 的金鑰——不能上傳，停下來。')

    updated, same, moved = [], [], []
    for name, src in SITE_FILES.items():
        a, b = os.path.join(HERE, src), os.path.join(DEST, name)
        if os.path.isfile(b) and filecmp.cmp(a, b, shallow=False):
            same.append(name)
        else:
            shutil.copy2(a, b)
            updated.append(name)

    for name in sorted(os.listdir(DEST)):
        if name in SITE_FILES:
            continue
        os.makedirs(ASIDE, exist_ok=True)
        target = os.path.join(ASIDE, name)
        if os.path.exists(target):
            target += '.' + datetime.datetime.now().strftime('%H%M%S')
        shutil.move(os.path.join(DEST, name), target)
        moved.append(name)

    print(f'上傳資料夾：{DEST}')
    print(f'  更新了 {len(updated)} 個：' + ('、'.join(updated) if updated else '（沒有）'))
    print(f'  沒變的 {len(same)} 個')
    if moved:
        print(f'  不該上傳、搬走了 {len(moved)} 個（沒有刪，在 {ASIDE}）：' + '、'.join(moved))
    print(f'  現在裡面一共 {len(os.listdir(DEST))} 個檔案，整個資料夾直接上傳就好。')


if __name__ == '__main__':
    main()
