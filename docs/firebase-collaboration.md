# Firebase 云端协同接入

状态：2026-10-20 正式首页已打开云端。根目录 `firebase-config.json` 的 `enabled` 是 `true`。网址 https://q414994573.github.io/chuanchuanxiang-pandian/ 。测试页 https://q414994573.github.io/chuanchuanxiang-pandian/cloud-test/ 仍在，红字是「云端测试版·不是正式订单」，那边的订单编号以 `test-` 开头。正式订单编号是 `count-`，正式页不打开 `test-` 订单。项目 `chuanchuanxiang-order` 停在免费 Spark。2026-10-20 约 01:04（韩国时间）控制台里已经加上授权网域 `q414994573.github.io`，关闭了自行注册和自行删除，并建好 `dawei`（负责人）和 `laobanniang`（订单编辑者）两个账号及成员文档。不要把密码写进仓库，也不要发给任何聊天机器人。这次发布没有重新部署 Firestore 规则，也没有删除云端数据。

## 账号（已定）

两个人各用各的账号，不能共用一个。修改记录才能分出是谁改的。

| 谁 | 登录时输入的账号 | 控制台里要填的邮箱 | 成员角色 | 成员文档里的显示名 |
| --- | --- | --- | --- | --- |
| 大伟 | `dawei` | `dawei@chuanchuanxiang.app` | `owner` | `大伟` |
| 老板娘 | `laobanniang` | `laobanniang@chuanchuanxiang.app` | `editor` | `老板娘` |

`@chuanchuanxiang.app` 不是真邮箱，收不到信。这个域名只写在 `cloud/account.cjs` 的常量 `ACCOUNT_DOMAIN` 里。登录框没有 `@` 时，网页会自动补上再交给 Firebase。如果输入里已经有 `@`，就按原样登录。

不要开 Google 登录。KakaoTalk 内置浏览器会被 Google 拒绝（`disallowed_useragent`），而且 Google 账号的 UID 和上面这两个账号不是同一个。网页上已经拿掉 Google 按钮、自行注册和“忘记密码”邮件。老板娘在 KakaoTalk 里直接填账号和密码。

## 权限（规则里强制，不是只藏按钮）

成员文档在 `members/{UID}`。网页读得到自己的那一份，谁都不能在网页上创建或修改成员。大伟在 Firebase 控制台里管成员。

- `owner`（大伟）：可以新建订单，改订货数量，改正这份订单里的库存，把旧版本的数量载回页面再保存成新版本。不能在网页上改成员，不能删订单，不能删历史，不能删掉 129 种商品。
- `editor`（老板娘）：可以看订单和库存，改订货数量，把某一项改成这次不订，从 129 种里搜出来补订，然后保存。不能改库存快照，不能改单位，不能改成员，不能删目录，不能删订单或历史。
- 没登录、登录了但 `members` 里没有自己、或 `active` 不是布尔值 `true`：不能读也不能写订单。链接本身不是权限。
- 每次保存都会写入 `updatedByName`。规则要求它等于该用户成员文档里的 `name`。修改记录显示的是这个名字，不是把 UID 写死在网页里。

库存留空仍然不是 0。老板娘的保存不能改库存。大伟改正库存时，留空会保持留空，写成 `0` 才是 0。

## 上线清单（用你自己的 Google 账号，免费 Spark）

下面每一步都对着现在这份代码。做完以前，仓库里的 `enabled` 保持 `false`。这一步不要合并到 `main`，也不要改 Google 表格。

### 1. 建项目，停在免费档

1. 打开 https://console.firebase.google.com/ ，用你自己的 Google 账号登录。
2. 添加项目。名字可以自取，例如 `chuanchuanxiang-pandian`。项目 ID 一旦建好就不能改，记下来。
3. Google Analytics 可以关。不要绑定结算账号，不要升级到 Blaze（按量付费）。
4. 如果后面某一页不升级、不填信用卡就无法继续，停下来。不要为了继续而开通付费档。

不要开的东西：电话号码登录、Cloud Functions、App Check 强制执行、Google 登录。这个网页没有接 App Check。一旦强制执行，登录和保存都会失败。Spark 的免费额度对两个人够用。

### 2. 注册 Web 应用，并对照配置文件

1. 项目概览 → 添加应用 → Web（`</>`）。
2. 应用昵称可以填「川川香盘货」。不要勾选 Firebase Hosting。这个网站继续放在 GitHub Pages。
3. 注册之后，控制台给出一段 `firebaseConfig`。只把公开的 Web 配置抄进仓库根目录的 `firebase-config.json`。这不是管理员密钥。不要下载、不要上传 service account JSON。

文件必须长这样（把尖括号换成控制台里的值）：

```json
{
  "enabled": false,
  "firebase": {
    "apiKey": "<apiKey>",
    "authDomain": "<项目ID>.firebaseapp.com",
    "projectId": "<项目ID>",
    "storageBucket": "<控制台给出的 storageBucket>",
    "messagingSenderId": "<messagingSenderId>",
    "appId": "<appId>"
  }
}
```

代码只认两处：`enabled` 为真，并且 `firebase` 被原样传给 `initializeApp`。`measurementId` 可以不写。`authDomain` 必须是控制台片段里的 `xxxx.firebaseapp.com`，不要写成 `q414994573.github.io`。

2026-10-20 已把 Web 应用 `ccx-web` 的公开配置写入这个文件。正式发布时根目录 `enabled` 改为 `true`。`authDomain` 是 `chuanchuanxiang-order.firebaseapp.com`。

### 3. 建 Firestore，地区选首尔

1. 构建 → Firestore Database → 创建数据库。
2. 版本选标准版，不要选 Enterprise，也不要选和 MongoDB 兼容的那种。
3. 位置选 `asia-northeast3`（首尔）。地区以后不能改。如果列表里暂时没有这一项，就在亚洲里选离首尔最近、而且不用升级付费档的地区，把实际选中的地区记在工作日志里。
4. 启动模式选生产模式 / 锁定模式。不要选测试模式。测试模式会在大约 30 天里允许任何人读写。

### 4. 打开邮箱密码登录，并关掉自行注册

1. Authentication（身份验证）→ Sign-in method（登录方法）→ Email/Password。
2. 只打开第一项「邮箱/密码」。第二项「邮箱链接 / 无密码登录」保持关闭。保存。
3. 不要启用 Google，也不要启用电话。
4. Authentication → Settings → Authorized domains → 添加网域：`q414994573.github.io`。不要加 `https://`，也不要加路径 `/chuanchuanxiang-pandian/`。`localhost` 可以留着。
5. Authentication → Settings → User actions → 关闭 Enable create (sign-up)（允许用户自行注册）→ 保存。建议同时关闭 Enable delete（允许用户自行删除账号）。
6. 如果这一页要求先启用 Identity Platform 或某个免费 API，只按提示打开那个设置。不要因此升级 Blaze。关掉的是网页自己注册；控制台里的「添加用户」仍然可以用。关掉之后，网页如果再调用注册，会得到 `auth/admin-restricted-operation`。

### 5. 添加两个用户（密码只在这一步由你输入）

1. Authentication → Users → Add user（添加用户）。
2. 第一个：Email 填 `dawei@chuanchuanxiang.app`，Password 由你自己设定。点 Add user。
3. 第二个：Email 填 `laobanniang@chuanchuanxiang.app`，另设一个不同的密码。点 Add user。
4. 在用户表里分别复制两个人的 User UID。UID 是一长串字母数字，不是邮箱，也不是 `dawei` 这两个字。
5. 网页上大伟输入账号 `dawei` 和密码。老板娘输入 `laobanniang` 和密码。不用把 `@chuanchuanxiang.app` 打进去。
6. 密码不要写进 Git，不要写进这个说明，不要贴到聊天里。

这两个地址收不到邮件。不要点「发送密码重置邮件」。本人还记得当前密码时，登录后用网页里的「修改我的密码」：先填当前密码，再填至少 8 位的新密码。网页会先用当前密码重新验证，再更新密码。

如果密码忘了：在控制台删除这个用户，再用同一个邮箱点「添加用户」并设定新密码。新用户的 UID 会变。接着做第 6 步时，删掉 Firestore 里旧 UID 那份成员文档，用新 UID 再建一份，`role`、`name`、`account`、`active` 保持原来的值。

### 6. 把 UID 写成授权成员

1. Firestore → 数据 → 开始集合。集合 ID 填 `members`。
2. 第一份文档的文档 ID 粘贴大伟的 UID，不要用邮箱当文档 ID。字段：

| 字段 | 类型 | 值 |
| --- | --- | --- |
| `active` | boolean | `true` |
| `role` | string | `owner` |
| `name` | string | `大伟` |
| `account` | string | `dawei` |

3. 再添加一份文档。文档 ID 是老板娘的 UID。字段：

| 字段 | 类型 | 值 |
| --- | --- | --- |
| `active` | boolean | `true` |
| `role` | string | `editor` |
| `name` | string | `老板娘` |
| `account` | string | `laobanniang` |

`active` 必须是布尔值 `true`，不能是文字 `"true"`。`role` 只能是 `owner` 或 `editor`。`name` 必须和上表完全一致，最长 20 个字；每次保存订单时，规则会核对此名字。`account` 只是让你在控制台里认人，网页不读取它。

不要做「所有登录用户都能读写」。陌生人即使拿到链接，也没有成员文档，规则会拒绝读取和修改。

### 7. 发布规则，并给库存快照取消索引

订单正文里的 `snapshot` 是一整份盘货，通常超过 Firestore 单字段索引大约 1500 字节的上限。不取消这个字段的索引，第一次提交订单会失败。`firestore.indexes.json` 已经写了这两条例外：集合组 `orders` 的字段 `snapshot`，以及集合组 `revisions` 的字段 `snapshot`。

任选一种办法。

控制台：

1. Firestore → Rules → 删掉编辑器里的原文，把仓库里 `firestore.rules` 的全部内容粘进去 → 发布。
2. Firestore → Indexes → Single field → Add exemption（添加例外）。
3. 集合组填 `orders`，字段路径填 `snapshot`，升序和降序索引都关掉，集合范围和集合组范围都关掉。保存。
4. 再添加一条：集合组 `revisions`，字段路径 `snapshot`，同样全部关掉。

或者在你自己的电脑上，用已经登录这个项目的账号执行：

```bash
firebase deploy --only firestore --project <你的项目ID>
```

这条命令会同时发布 `firestore.rules` 和 `firestore.indexes.json`。不要把测试用的 `demo-ccx-collaboration` 写进这条命令。本地模拟器测试和正式项目无关。

正式网页只读写集合 `orders`。`sandboxOrders` 只给本地模拟器用，页面不会打开它。2026-10-20 规则和 `snapshot` 索引例外已经发布到 `chuanchuanxiang-order`。隔离测试如果要在云端留一份订单，用单独的订单编号，测完由负责人在控制台删掉。不要改 10 月 18 日存档。

### 8. 确认没有开错开关

- App Check 不要强制执行。
- 没有绑定信用卡，项目仍显示 Spark。
- Google 登录提供商是关的。
- 自行注册是关的。
- 授权网域里有 `q414994573.github.io`。
- 两个成员文档的 ID 是 UID，`name` 分别是 `大伟` 和 `老板娘`。

### 9. 正式网页开关（2026-10-20 已打开）

根目录 `firebase-config.json` 的 `enabled` 已是 `true`，并合并进 `main`。测试页自己的配置仍是 `enabled: true`，两份文件互不影响。正式订单编号不以 `test-` 开头。测试页上的 `test-` 订单先留着，这次没有删除云端数据。临时关掉网页上的云端入口，把根目录 `enabled` 改回 `false` 再发布即可，数据库里的订单不删除。

## 隔离的真实云端测试（测试页仍保留）

这一节记的是正式打开之前的隔离测试。测试页继续留着。正式首页从 2026-10-20 起 `enabled` 为 `true`，正式订单编号是 `count-`，不读取 `test-` 订单。不要再用 localhost 做验收：店里只有手机，授权网域是 `q414994573.github.io`。

测试页地址：`https://q414994573.github.io/chuanchuanxiang-pandian/cloud-test/`

测试页顶部有红字「云端测试版·不是正式订单」。本机盘货编号仍是 `count-`（目录校验要求这个前缀）。提交到云端时，测试页把订单编号改成 `test-count-`。正式页面不打开 `test-` 订单，测试页也不打开没有 `test-` 的订单。

手机步骤、成员文档如果建错时的现象，以及测完如何在控制台删除 `orders/test-…` 和 `revisions`，写在 `docs/工作日志.md` 2026-10-20 那一条。不要删 `members`，不要改 `current-order.json`，不要改 10 月 18 日存档。不要清除 github.io 的全部网站数据，那会把正式盘货页存在手机里的本机记录一起清掉。测试页用的是另一组本机存储键。

## 手机验收（还没做）

1. iPhone 的 Safari 用账号 `dawei` 登录，做一次真实盘货，或明确标明的隔离测试订单。完成检查后提交。记下版本号。
2. 把链接发到 KakaoTalk。老板娘的三星手机在 KakaoTalk 里打开，用账号 `laobanniang` 登录。不要走 Google。她应能看到全部商品和库存。
3. 她改一个数量、取消一项、从 129 种里补一项，保存。iPhone 刷新后应看到同样的数量和修改记录里的「老板娘」。关掉再打开，数据还在。
4. 她不能改库存。大伟可以改正库存；留空的库存刷新后仍然是空的，不要变成 0。
5. 两部手机同时打开同一版本，各自修改，先后保存。后保存的一部必须提示冲突，并留下还没保存的内容。
6. 未登录的人打开同一个链接：不能看到这份云端订单。
7. 断网时保存：显示没有保存到云端。网络恢复后再试。导出备份再恢复成一份独立的本机记录，核对库存的空白和 0。
8. 核对 129 = 45 + 66 + 18，顺序没变，三个分类没有被当成三家供应商。Google 表格完全没被改。

## 已知限制

- `cn:45` 莲藕粉耗子、`other:11` 小汤碗的原目录单位是空的。没有替它们补单位。单位仍空着时，共享页不能给这两项填正数订货量，也不能把它们的库存写成有数量。这是网页上的检查。规则因为 129 项逐条表达式超出额度，没有再逐项核对「空单位必须是 0」。未授权的人仍然不能写。
- 竹签的中文别名仍空着。没有改永久目录。
- 供应商还没配置。三个分类不是三家供应商。

## 测试

- `npm test`：原有盘货测试，加上账号映射、密码提示和库存空白检查。
- `npm run test:rules`：只连接本地模拟器项目 `demo-ccx-collaboration`。先测 3 种模拟商品，再测 129 种。不要把正式项目 ID 填进这条命令。
- `npm run build`：改了 `cloud/` 之后要重新生成 `cloud-app.bundle.js` 并一起提交。
- `npm run rules:generate`：目录编号变化时，用它重写 `firestore.rules`。它不改商品数据。

## 回退

- 正式打开云端之前的 `main`：标签 `backup-before-firebase-2026-10-20`，指向 `62633734714a7f89dba35c95778e0428724e86f5`。当时的首页副本在 `backups/index-before-firebase-20261020.html`。
- 更早的接入前版本：`70b9cb382c1dfe6157c9e9ba71a86fe07fe795f8`。远程备份分支 `backup/pre-firebase-20261019`。
- 原来的 backups、archive、old-website-backup 和 2026-10-18 存档不要动。
- 把根目录 `enabled` 设回 `false` 会关掉正式网页上的云端入口，数据库里的订单不删除。
- 整页退回时检出上面的标签再发布。不要为了回退而删除云端订单，包括 `test-` 开头的测试订单。
