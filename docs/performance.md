# v1.3.4 资源优化记录

2026-10-05。对照版本 v1.3.3，优化版本 v1.3.4；安装包通过 GitHub Releases 分发，npm 版本不变。

## 结果与范围

本次可测出的收益主要是小幅减少 JavaScript 堆占用、减少主线程工作和停止闲置音频处理。不能据此宣称 Harness 总内存减少几十或几百 MB。

Chrome 加载真实 rc.2 渲染器与插件构建产物，使用同一宿主模拟页和开发版 React。每版启动 3 个独立浏览器进程，每个场景静置 1 秒并执行两次垃圾回收后采样；下表是 3 次结果的中位数，MB 为十进制。测试通知为替身，音频使用真实 AudioContext。音频观察器会保留上下文引用，因此音频状态用于验证生命周期，不用于推算系统音频内存。

| 场景 | 旧版页面 JS 堆 | 新版页面 JS 堆 | 减少 | 主线程耗时，旧 → 新 |
|---|---:|---:|---:|---:|
| 启动，详情关闭 | 3.081 MB | 2.940 MB | 0.141 MB | 2.748 → 2.222 ms/s |
| 播放提醒后，详情关闭 | 3.867 MB | 3.724 MB | 0.143 MB | 2.292 → 2.028 ms/s |
| 关闭提醒，详情关闭 | 3.937 MB | 3.867 MB | 0.070 MB | 2.271 → 1.917 ms/s |

主线程耗时在本次测试中降低约 11%–19%，这是测试页面的指标，不是整个应用的 CPU 使用率。短时间采样受系统负载影响，不能当作固定承诺。上述页面堆包括宿主模拟页，并不等于插件独占内存；未测量真实 Electron 桌面进程的启用/禁用差值，也未量化操作系统音频资源的内存收益。

关闭详情时，插件在文档中的元素数由 58 个降为 13 个。旧版提示音播放后与关闭提醒后，音频上下文均保持 `running`；新版对应状态为 `suspended` 和 `closed`。卸载后，两版插件界面元素均为 0。

## 实现

- 保留原生 Popover 外壳，详情关闭时卸载内容，重新打开时保留「规则与提醒」的展开状态。
- 每秒更新只驱动倒计时组件；主界面和时间轴按分钟更新，峰谷边界仍按原时钟处理。侧栏收起后，其按钮也按分钟更新。
- 没有提醒时不创建提醒浮层；时间轴与提醒浮层避免跟随倒计时重复渲染。
- 音频首次解锁后移除全局交互监听，空闲时暂停；关闭提醒时关闭上下文，再次开启可重新创建。
- 保留秒级倒计时、日历自动更新、后台提醒、手动版本更新与原有通知权限。

## 验证

类型检查、构建、59 项 Node 检查和 35 项 Chrome 检查通过。新增检查覆盖详情反复关闭/重开、分钟与秒独立刷新、暂停后定时提醒恢复、关闭提醒释放音频和重新开启后播放。

本机随附 CLI 为 0.2.0-rc.2。通过正常退出空闲 Harness 后使用官方 CLI 安装 v1.3.4，5 项运行/配置文件的 SHA-256 与构建源一致；其他插件依赖声明与 profile bundles 列表保持一致。桌面端已重新打开，检查了倒计时、时间轴和版本显示。原有提醒处于关闭状态，未在真实桌面申请权限或发送通知；音频生命周期结论来自真实 Chrome Web Audio 测试。

## 复测

先运行 `npm run build` 和 `npm run preview`，再分别运行：

```powershell
node scripts/measure-resources.mjs artifacts/performance/baseline-client.js baseline
node scripts/measure-resources.mjs dist/client.js optimized
```

本地原始数据保存在 `artifacts/performance/baseline.json` 与 `artifacts/performance/optimized.json`。`artifacts` 不随 Git 仓库分发；在新克隆的仓库中复测时，从 [v1.3.3 安装包](https://github.com/a961282799-crypto/dsh-timeband/releases/tag/v1.3.3) 提取 `package/dist/client.js`，放到 `artifacts/performance/baseline-client.js` 后执行上面的命令。旧版安装包仍可用于回退。
