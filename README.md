# DSH TimeBand

DeepSeek Harness 桌面端头像右侧的峰谷时段插件。状态、切换倒计时、迷你时间轴常驻；点击查看北京时间 24 小时时间轴。没有价格、消费金额、Token、余额或预计节省功能，也不读取账户或 API Key。

支持浅色 / 深色、中英文、侧栏折叠与节假日全天谷时段。节假日卡片精简重复时段说明，规则与日历默认折叠；关键时间与刻度使用更清晰的字号和颜色。离线运行，采用宿主共享的 React 和 Cordis 原生插件接口。

v1.1.0 增加本地日历导入与恢复、到期前 30 天提示，并缓存时段计算。倒计时仍每秒刷新；时间切换、跨天、休眠唤醒和日历替换会刷新对应判断。

v1.2.0 增加可选的峰时段提醒：默认关闭，开启后在下一次已核实的峰时段开始前 5 分钟发送系统通知。提供「测试提醒」按钮；设置会保存，同来源的现代窗口使用浏览器锁和已发送记录去重。休眠后不补发已过期的提醒，关闭或卸载会取消待发送通知。

## 展示

以下截图使用插件真实构建产物，宿主布局和账户区域为模拟，日期与时间固定；不是实际桌面端截图。

![工作日峰时段，头像旁的状态与展开时间轴](https://raw.githubusercontent.com/a961282799-crypto/dsh-timeband/main/docs/images/peak-light.png)

<details>
<summary>午间谷时段：分钟与小字号秒数</summary>

![午间谷时段](https://raw.githubusercontent.com/a961282799-crypto/dsh-timeband/main/docs/images/offpeak-light.png)

</details>

<details>
<summary>国庆假期：全天绿色，跨天倒计时</summary>

![国庆假期全天谷时段](https://raw.githubusercontent.com/a961282799-crypto/dsh-timeband/main/docs/images/holiday-light.png)

</details>

<details>
<summary>深色模式：不足一分钟只显示秒</summary>

![深色模式](https://raw.githubusercontent.com/a961282799-crypto/dsh-timeband/main/docs/images/peak-dark.png)

</details>

<details>
<summary>日历更新：导入、恢复与来源</summary>

![日历更新入口](https://raw.githubusercontent.com/a961282799-crypto/dsh-timeband/main/docs/images/calendar-update.png)

</details>

<details>
<summary>可选提醒：开启、测试与日历</summary>

![提醒开关及测试按钮](https://raw.githubusercontent.com/a961282799-crypto/dsh-timeband/main/docs/images/reminders.png)

</details>

## 安装

已针对 **DeepSeek Harness 0.2.0-rc.2** 制作。2026-10-03 核对 npm `latest` 仍为此版本，四个宿主测试依赖与随附桌面 CLI 版本一致。版本声明只覆盖此版本，宿主升级后应重新验证并更新 peer 范围。

插件已发布到 [npm](https://www.npmjs.com/package/dsh-timeband)。可在桌面端「插件 → 添加插件」输入 `dsh-timeband`；或在退出桌面端后执行 `dsh plugin --profile desktop add dsh-timeband`。需要固定版本时，可使用 npm 页面列出的版本号；也可直接安装下方的 GitHub 预构建包。

从 [GitHub Releases](https://github.com/a961282799-crypto/dsh-timeband/releases/tag/v1.2.0) 下载预构建安装包 `dsh-timeband-1.2.0.tgz`。不需要安装开发依赖或自行编译。

从托盘完全退出 Harness，在下载目录执行：

```powershell
dsh plugin --profile desktop add ./dsh-timeband-1.2.0.tgz
```

如果 `dsh` 不在 PATH，使用桌面端安装目录中随附的命令，例如：

```powershell
& 'C:\path\to\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add ./dsh-timeband-1.2.0.tgz
```

安装后重新打开 Harness，侧栏底部即可看到插件。卸载：

```powershell
dsh plugin --profile desktop remove dsh-timeband
```

### 从源码打包

```powershell
npm ci
npm run build
npm pack --pack-destination artifacts
```

先从托盘完全退出 Harness，再在本目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-desktop.ps1
```

脚本默认使用 PATH 中的 `dsh`，也可传入 `-DshCommand` 指定随附 `dsh.cmd` 的完整路径。脚本通过官方 CLI 安装，不修改应用文件；如应用仍运行会停止并提示退出，不强制结束进程。重新打开 Harness 后生效。

Web 版可改成 `--profile web`，组件显示在侧栏底部原生插槽。

## 界面与兼容边界

- 桌面端侧栏展开：头像右侧显示时段、倒计时和今日迷你时间轴。倒计时按剩余时间显示「天、小时、分钟」，秒以较小字号跟随；不足一天省略天，不足一小时只显示分钟和秒，不足一分钟只显示秒。
- 侧栏收起：紧凑图标和状态点；点击仍可查看完整卡片。
- 原生 Popover 提供顶层显示、外部点击关闭；Escape 关闭并回到触发按钮。卡片会限制在窗口内，支持中英文与宿主颜色变量。
- 头像右侧没有独立的官方插槽。插件注册到 `sidebar.footer.action`，以带严格结构条件的 CSS 调整 rc.2 的两个底部容器，保留原头像按钮及其事件。若同一插槽有其他插件或宿主布局不匹配，保留原生上下排列，不强行修改 DOM。
- 当前信息只表示 **DeepSeek 官方 API 的时间规则**；第三方中转服务是否采用这些规则由其自行决定。

## 规则与日历

2026-09-30 核实：[DeepSeek 官方定价说明](https://api-docs.deepseek.com/quick_start/pricing/)。北京时间周一至周五 09:00–12:00、14:00–18:00 为峰时段，开始包含、结束不包含；其他时间为谷时段。周末即使是调休上班日也保持谷时段。

`calendars/2026.json` 是内置日历的唯一数据源，取自[国务院办公厅通知的政府转载](https://www.lufengshi.gov.cn/swlfsjj/gkmlpt/content/1/1199/mpost_1199727.html)，覆盖完整放假区间。尚未收录 2027 年官方假期，不预测下一年安排。

点击时间轴，在「规则、日历与提醒」内选择「获取新日历」，从本项目下载对应 JSON，再选择「导入日历」。日历覆盖年份与核对日期会随文件更新，侧栏和弹窗立即刷新；导入结果保存在当前 Harness 网页来源的本地存储，重启后继续使用，同来源的多个窗口同步。也可选择「恢复内置」。Web 与桌面端的来源不同，需要各自导入。

导入日历替换整份当前日历；文件未包含的年份仍为待核实。到当前连续覆盖年份结束前 30 天，会在弹窗提示到期日期。错误文件、超过 64 KB、无效日期、范围重叠、覆盖年份缺少条目或非 HTTPS 政府来源的文件会被拒绝；保存失败保留原日历。来源字段校验只检查地址格式，不代表插件已在线核验公告内容，请使用本项目发布并人工核对的文件。日历格式及维护步骤见[日历维护说明](https://github.com/a961282799-crypto/dsh-timeband/blob/main/docs/calendar-maintenance.md)。

未收录年份的工作日峰时段显示「待核实」，不推断假日。倒计时遇到未知日历区间会停止给出确定峰谷切换时间。插件离线计算，不自动抓网页、联网更新或收集数据；仅用户点击外部链接时打开浏览器。

## 峰时段提醒

展开「规则、日历与提醒」，开启「峰时段前 5 分钟提醒」。只有手动开启时才申请系统通知权限；被拒绝、接口不支持或设置无法保存时，开关保持关闭并给出说明。允许通知后，可点击「测试提醒」立即确认系统能否显示通知，测试不会改写峰时段的去重记录。

提醒使用北京时间与当前日历，在 09:00、14:00 峰时段开始前的 5 分钟窗口内发送一次。节假日、周末和待核实的峰时段不发送确定提醒；窗口内开启或唤醒会提醒尚未开始的峰时段，已经开始则不补发。应用需要保持运行，退出后无法继续提醒。系统通知的展示还受宿主及操作系统设置影响，详见[提醒说明](https://github.com/a961282799-crypto/dsh-timeband/blob/main/docs/reminders.md)。

## 架构

TypeScript 7 + React 18（宿主共享实例）+ Cordis 官方插槽生命周期；esbuild 生成 DSH 的 `__ModuleLoader__.load({ id, factory })` 格式。发布包没有运行时 npm 依赖，也不打包另一份 React。

`src/schedule.ts` 是纯时间逻辑及按时段复用的日程读取器；`calendar.ts` 校验日历，`calendar-store.ts` 负责本地持久化与窗口同步；`clock.ts` 是单一可订阅时钟，隐藏时暂停，唤醒时重读系统时间；`reminder-store.ts` 管理提醒偏好与用户触发的授权，`reminders.ts` 在开启时保留一个截止时间计时器，重新核对日历、墙钟和发送记录；`client.ts` 持有注册、字典、系统通知及清理；`view.tsx` 接收宿主注入的状态、时钟和翻译函数。`cordis.patch.yml` 与 `dsh.bundle` 负责安装后进入宿主配置。

接口依据：[官方 Client Slots](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/slots)、npm 发布的 `0.2.0-rc.2` 类型与 SlotRegistry；源码布局参照上游提交 `639ed015397290b3745d163aafe02ffee4aa3f84`。不承诺未测试版本兼容。

## 开发与验证

```powershell
npm ci
npm run check
npm run compatibility
npm run preview
npm pack --pack-destination artifacts
```

浏览器测试使用本机 Chrome。预览地址 `http://127.0.0.1:4173`，支持切换普通工作日、国庆、调休周六和未知年份。预览加载真实构建产物，宿主布局和账户按钮为模拟，时间固定用于检查。

预览运行时，在另一个终端执行 `npm run screenshots`，可重建 `docs/images/` 中的四张展示截图。

测试覆盖四个毫秒级切换边界、2026 全年时间轴一致性、多日假期、时区、跨年未知日历、休眠恢复和清理；使用真实 rc.2 Cordis/SlotRegistry 验证延迟插槽声明、移除重建及卸载；Chrome 检查头像右侧排列、弹层、键盘、外部关闭、窄窗口、中英文与浅深色截图。

当前验证：类型检查、28 项 Node 测试、17 项 Chrome 测试通过。包含日历导入与恢复、持久化、窗口同步、损坏文件、存储失败、到期提示、窄窗口与缓存失效；新增提醒检查覆盖默认关闭、用户授权、截止时间、假日跳过、休眠及回拨、跨窗口去重、错误反馈、测试通知和卸载清理。Chrome 检查中的系统通知由受控替身接收，不会向使用者发送测试横幅。v1.0.2 的官方桌面 CLI 安装、bundle 启用与安装产物一致性已验证；v1.2.0 完成构建产物及真实 rc.2 注册器检查，独立预览、通知替身和注册器测试不等同于新版桌面安装及 Windows 通知展示验收。

`npm run compatibility` 核对 npm 最新正式标签与已验证版本，并检查四个宿主依赖版本。GitHub 的 Plugin checks 在提交、PR 或手动运行时执行此检查和功能测试；新宿主出现时会提示重新验证，不自动扩大兼容版本。详情见[兼容性记录](https://github.com/a961282799-crypto/dsh-timeband/blob/main/docs/compatibility.md)。

## 许可证

[MIT](LICENSE)
