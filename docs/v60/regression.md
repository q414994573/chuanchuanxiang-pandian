# v60 依赖安全修复（韩国时间2026-11-12）

基线1d201a83cc4120a5db9d873a9fe61f7944f5026d。用户授权继续修复上一轮未处理的依赖告警。

firebase-tools从14.27.0升级到15.35.0；Firebase浏览器SDK保持13.0.0。刷新兼容依赖锁定；对仍由上游约束锁在受影响版本的包设置精确override：Firestore的grpc-js 1.14.6、glob14.0.2、OpenTelemetry core2.8.0、uuid11.1.1。没有使用audit fix --force的旧版SDK降级建议，也没有关闭审计或隐藏告警。glob/core跨主版本覆盖通过专项兼容与完整回归验证后才发布。

审计结果：原29告警节点（16中危、12高危、1严重）→第一轮16→兼容更新14中危→最终0。根公告与依赖传播节点不等于独立漏洞数量。审计依据为当次npm数据库，0已知告警不等于没有未知漏洞。原始JSON见audit-before.json和audit-after.json。

新增5项依赖兼容测试：glob异步/同步及忽略、取消遍历、CLI实际归档ZIP、PubSub追踪注入/提取及模块载入、UUID生成及过小缓冲区拒绝。全量CI增加npm audit --audit-level=low，保留固定浏览器镜像和源码冻结检查。两bundle重新构建，四入口缓存标记更新；业务源码、商品目录、数据库规则与营业数据不改。

官方参考：https://firebase.google.com/support/release-notes/cli ; https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j ; https://github.com/advisories/GHSA-8988-4f7v-96qf ; https://github.com/advisories/GHSA-3g3m-2fjr-6pw4 ; https://github.com/advisories/GHSA-w5hq-g745-h8pq

验证与发布结果待实际完成补齐。未使用生产订单测试、未操作用户手机存储。
