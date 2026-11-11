# v60 依赖安全修复（韩国时间2026-11-12）

基线1d201a83cc4120a5db9d873a9fe61f7944f5026d。用户授权继续修复上一轮未处理的依赖告警。

firebase-tools从14.27.0升级到15.35.0；Firebase浏览器SDK保持13.0.0。刷新兼容依赖锁定；对仍由上游约束锁在受影响版本的包设置精确override：Firestore的grpc-js 1.14.6、glob14.0.2、OpenTelemetry core2.8.0、uuid11.1.1。没有使用audit fix --force的旧版SDK降级建议，也没有关闭审计或隐藏告警。glob/core跨主版本覆盖通过专项兼容与完整回归验证后才发布。

审计结果：原29告警节点（16中危、12高危、1严重）→第一轮16→兼容更新14中危→最终0。根公告与依赖传播节点不等于独立漏洞数量。审计依据为当次npm数据库，0已知告警不等于没有未知漏洞。原始JSON见audit-before.json和audit-after.json。

新增5项依赖兼容测试：glob异步/同步及忽略、取消遍历、CLI实际归档ZIP、PubSub追踪注入/提取及模块载入、UUID生成及过小缓冲区拒绝。全量CI增加npm audit --audit-level=low，保留固定浏览器镜像和源码冻结检查。两bundle重新构建，四入口缓存标记更新；业务源码、商品目录、数据库规则与营业数据不改。

官方参考：https://firebase.google.com/support/release-notes/cli ; https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j ; https://github.com/advisories/GHSA-8988-4f7v-96qf ; https://github.com/advisories/GHSA-3g3m-2fjr-6pw4 ; https://github.com/advisories/GHSA-w5hq-g745-h8pq

验证与发布结果待实际完成补齐。未使用生产订单测试、未操作用户手机存储。

## 本地验证

首轮全套程序14,834项中1项缓存一致性检查失败：只更新旧入口cloud-app缓存标记，未同时更新count-core/count-app。已按既有测试要求统一两个旧入口关联脚本版本，11项专项通过；不修改断言绕过。修正后全量14,834通过，0失败/取消/跳过，119716.289836ms。

新版CLI15.35.0、Java21及grpc-js1.14.6下六套云端模拟器全部通过：权限、共同草稿、逐商品填写、定稿/解锁循环、供应商导出及五代目录。全部使用demo项目；数据库规则与目录逐字未变。

## 当前外部阻塞（韩国时间2026-11-12）

GitHub官方状态接口https://www.githubstatus.com/api/v2/summary.json于UTC2026-11-11 20:48起报告Actions major_outage、Pages partial_outage（事件dvy0t3mvh1lg）。独立运行43097892850仍queued且无jobs，因此不能写双浏览器CI已通过或正式站点已发布。上一代码提交运行43097833428含已知缓存标记问题，不能作为最终版本通过证据。当前待测修复提交02dcdd1a20e9e281e757f5366ecf4e2c0f0d5ca9。

本地浏览器第一次因缓存中的可执行文件不存在而14组未启动；重新安装固定Playwright1.56.1浏览器后重新运行。不将该环境失败记作通过；不引用v59旧结果替代v60。

已保留恢复分支backup/before-security-v60-20261112，指向基线；不是手机数据备份。正式main与营业数据尚未改动。恢复发布前应核对独立审计、Node、六组云端及双浏览器实际结果，补齐报告后再快进main并核对Pages成功和线上文件哈希。

## 当前已完成、未完成边界

本地完整Chromium141：14套、657场景通过，0失败、0页面错误、源码冻结一致。逐套结果、Node计数、六组云端PASS及文件指纹见local-verification.json。测试期间业务源码未改变。

截至本次收尾：v60代码和依赖修复完成，完整依赖审计0，本地14,834程序、657 Chromium场景、六组云端模拟器全部通过；独立CI和WebKit本轮仍未执行，生产发布未执行。GitHub官方20:57 UTC更新仍investigating，Pages也已升级为major_outage，来源https://www.githubstatus.com/api/v2/incidents/unresolved.json。不能以v59双浏览器成功补充v60未执行项。

报告单独保存至work/security-v60-report，不再次触发同一套排队CI。最终修复分支work/security-dependencies-v60保留待测提交02dcdd1a20e9e281e757f5366ecf4e2c0f0d5ca9；恢复后核对运行43097892850。报告提交只追加文档，与该修复提交的业务文件相同；验证齐全后可将报告提交快进到main。
