# AFW-Exp v2

这个版本在你现有 index.html 基础上做了三项修改：

1. 使用 0–9 分评分；页面显示 0–9 十个数字键，也可直接键盘选择，Enter 提交。
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
- Build output directory: `dist`

构建脚本仅将首页、材料列表和图片复制到 `dist`，避免将 `git.zip` 等备份上传到 Pages。`functions/` 保留在仓库根目录，由 Pages 单独编译。修改此设置后需重新部署。

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


## 2026-09-15 更新：补评与人口学信息

### 已部署网站的升级顺序（保留全部原数据）

1. 在 Cloudflare 打开 afw-exp → Settings → Bindings，确认 Production 的 `DB` 指向哪个数据库。
2. 打开该 D1 数据库的 Console，执行 `migrations/001_demographics.sql` 的全部内容。它只新增人口学信息表，可以重复运行；不要执行 DELETE 或 DROP。
3. 在 GitHub Desktop 提交本次网页及接口修改：`index.html`、`functions/`、`schema.sql`、`migrations/`、`README.md`、`tests/`。不要把原始评分 CSV 和统计结果作为网页文件提交。
4. Push origin；等待 Cloudflare 部署成功。构建命令仍为 `node generate-stimuli.js`，输出目录仍为 `dist`，`functions/` 必须留在仓库根目录。
5. 用新测试编号填写性别（男/女）、年龄（1–120整数周岁），评分一张后刷新，验证不会重做已保存图片。请使用线上网站测试，双击 HTML 无法连接 Pages 接口。
6. 导出 CSV，检查新增的 `gender`、`age` 列。旧会话未补填时为空；原有 `fear_rating_0_100` 字段名保留，新评分仍是0–9。

### 本次行为

- 保存时锁定数字键、Enter和下一张。长按Enter不连续提交。服务器重复请求保留第一次已保存评分，不覆盖原评分。
- 图片加载成功后才允许评分，反应时从加载成功开始计算。图片失败时可重试。
- 服务器不可用时不开始或不前进；不再从不含分数的旧本地缓存恢复“已完成”状态。
- 完成接口核对每一个试次与对应图片的实际评分。只有确认全部保存，才显示成功页；失败可重试，有缺项则补评。
- 同编号优先恢复存在缺项的会话，包括旧版错误标为completed的会话。多次会话保持独立，优先补最近创建的缺项会话，不合并历史评分。全部完整时返回原会话，不自动重开实验。
- 基本信息关联本次会话。已有被试在进入时补填；补评只针对数据库缺失的试次，保留原图片顺序和已存评分。
- 同编号多设备同时进入会共享会话；研究者仍应保证编号唯一，不让不同人使用同一个编号。

### 验证

运行 `node --test tests/regression.mjs`（需 Node.js 和 Python）。测试使用临时 SQLite 数据库及网页模拟环境，不连接线上数据库。
涵盖无损重复迁移、旧会话缺项恢复、并发开始、重复评分幂等、人口学验证和导出、完成校验、连续提交、断网重试和图片加载门槛。
线上 D1 的升级及实际部署仍需在 Cloudflare 完成。
