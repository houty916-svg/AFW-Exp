# AFW-Exp v2

这个版本在你现有 index.html 基础上做了三项修改：

1. 取消滑块，保留 0–100 分；页面显示 0–9 十个数字键，也可直接键盘输入，Enter 提交。
2. 每张评分自动写入 Cloudflare D1；被试不再下载 CSV。输入相同被试编号可以跨浏览器/设备继续未完成进度。
3. `generate-stimuli.js` 在每次部署时自动扫描 `Fear_images/` 并生成 `stimuli.json`，以后增删图片无需再改 index.html。

## 仓库结构

```text
AFW-Exp/
├── index.html
├── generate-stimuli.js
├── schema.sql
├── Fear_images/
└── functions/api/
    ├── session.js
    ├── response.js
    ├── complete.js
    └── export.js
```

## Cloudflare Pages 构建设置

- Framework preset: None
- Build command: `node generate-stimuli.js`
- Build output directory: `.`

## 一次性配置 D1

1. Cloudflare 控制台创建 D1 数据库，例如 `afw-fear-ratings`。
2. 打开数据库 Console / Query，把 `schema.sql` 全部执行一次。
3. Pages 项目 → Settings → Bindings → D1 database bindings：
   - Variable name: `DB`
   - Database: 选择刚创建的数据库
4. 重新部署。

## 导出 CSV（可选）

在 Pages 项目的环境变量中设置：

`ADMIN_KEY = 你自己的复杂密码`

之后访问：

`https://你的网址.pages.dev/api/export?key=你的密码`

即可下载全部 `fear_ratings.csv`。不要把这个网址发给被试。

## 以后增删材料

只需要在 GitHub 的 `Fear_images/` 里添加/删除图片并 Commit。Cloudflare 重新部署时会自动更新材料列表。
