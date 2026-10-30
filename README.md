# 川川香 · 订货总控台

手机盘货、双账号共同订货与供应商文字复制工具。

正式网址：https://q414994573.github.io/chuanchuanxiang-pandian/ordering/

## 接手先读

1. [接手维护说明](docs/接手维护说明.md)：当前业务规则、代码结构、协作逻辑、新增商品步骤、测试和发布/回退。
2. [改版与漏洞记录](docs/改版与漏洞记录.md)：历史问题、根因、修复与必须回归的案例。
3. [v55测试与发布状态](docs/v55/regression.md)：本次实际结果、证据和未完成步骤。
4. [完整工作日志](docs/工作日志.md)：更早改动原始记录。旧记录描述当时版本，不能直接替代当前规则。

## 当前候选版本 v55

韩国食品新增 **칼국수면**，单位 **봉**，普通商品逻辑。新建目录138种：韩国50、中国70、其他13、饮料5。旧129/137种订单继续保留，不自动扩写历史。

**上线状态以v55报告为准。提交代码不等于Firebase规则已发布，也不等于GitHub Pages已更新。**

## 不能改错的事情

- 主商品名称、稳定ID、分类、单位和顺序必须遵守用户确认；不批量翻译、合并相似商品或猜测数量。
- 库存与订货独立；空白不是0，库存0不自动补货。历史来源文件不是今天实时库存。
- 两个有效账号在新版业务权限相同；定稿后锁定，解除定稿后重新编辑，复制成功不代表已发送。
- 不同格可合并，同格冲突保留本机内容。事务成功用已提交版本确认，不让旧读取覆盖新输入。
- 不删除真实订单、修订、存档或手机草稿作为测试/回退方式。
- 不添加最低备货量、星标、重点商品或自动补货。

完整例外和特殊单位见接手说明，不能仅靠这几条摘要实施改动。

## 开发与测试

依赖安装：`npm ci`。

构建：`npm run build` 和 `npm run build:preview`。

逻辑全套：`npm test`。

云端模拟器：`npm run test:rules`、`npm run test:shared`、`npm run test:shared-view`、`npm run test:shared-transitions`、`npm run test:supplier-rehearsal`。三代目录兼容命令见接手说明。

浏览器全套：安装Playwright及对应浏览器/系统依赖后，配置 `CCX_PLAYWRIGHT_MODULE`，运行 `python3 scripts/run-browser-regression.py`。默认Chromium/WebKit，包含手机宽度、两角色、不同订单状态，输出逐套报告与源码哈希。

测试必须使用隔离数据/本地demo模拟器。自动测试不等于实体iPhone、三星、KakaoTalk、弱网及硬件验收。

## 文件与入口

- `current-order.json`：当前目录和有日期的历史参考数量；新建盘货实际数量为空。
- `catalog-legacy.json`、`catalog-v137.json`：原129和137种目录兼容基准。
- `count-core.js`：盘货核心与历史校验。
- `redesign-preview/preview.js`：当前共用界面源码；正式 `/ordering/` 使用其构建产物。
- `cloud/`：Firestore订单、事务、审计与共同盘货。
- `scripts/generate-rules.cjs`：生成 `firestore.rules`；先核验新旧兼容规则再发布新目录页面。
- `/redesign-preview/`、`/cloud-test/`：测试入口，不能当作正式订单页。
- 根目录 `/`：旧兼容入口，继续保留；不能遗漏其显示、搜索及导出回归。
- `backups/`、`archive/`：历史代码备份，不作为当前目录编辑目标。

每次修改都更新相应规则说明、漏洞记录和工作日志，注明实际测试与发布状态。
