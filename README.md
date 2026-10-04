# DSH TimeBand

**v1.3.2** 支持日历到期前 30 天自动联网更新、应用内提醒、系统通知发送反馈和约半秒的轻柔提示音。修复了真实桌面宿主中的显示问题，并精简安装包；提示音在本地合成，不下载音频文件，不增加运行依赖。

DeepSeek Harness 桌面端头像右侧的峰谷时段插件。状态、切换倒计时、迷你时间轴常驻；点击查看北京时间 24 小时时间轴。没有价格、消费金额、Token、余额或预计节省功能，也不读取账户或 API Key。

支持浅色 / 深色、中英文、侧栏折叠与节假日全天谷时段。节假日卡片精简重复时段说明，规则与提醒默认折叠；关键时间与刻度使用更清晰的字号和颜色。时段按已保存日历离线计算，日历临近到期或缺少本年度数据时联网更新，采用宿主共享的 React 和 Cordis 原生插件接口。

日历自动更新并缓存，倒计时每秒刷新；时间切换、跨天、休眠唤醒和日历更新会刷新对应判断。

可选的峰时段提醒默认关闭，开启后在下一次已核实的峰时段开始前 5 分钟显示应用内提醒并尝试发送系统通知。「测试提醒」可以立即查看效果与发送状态；设置会保存，同来源的现代窗口使用浏览器锁和已发送记录去重。休眠后不补发已过期的提醒，关闭或卸载会取消待发送通知。

正式提醒和测试提醒会播放轻柔提示音。声音在本地合成，连续测试会替换上一声；关闭提醒或卸载会停止播放。音频不可用时说明原因，文字与系统通知继续工作。

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
<summary>可选提醒：开启与测试</summary>

![提醒开关及测试按钮](https://raw.githubusercontent.com/a961282799-crypto/dsh-timeband/main/docs/images/reminders.png)

</details>

## 安装

已针对 **DeepSeek Harness 0.2.0-rc.2** 制作。2026-10-04 核对 npm `latest` 仍为此版本，四个宿主测试依赖与随附桌面 CLI 版本一致。版本声明只覆盖此版本，宿主升级后应重新验证并更新 peer 范围。

可通过 [npm](https://www.npmjs.com/package/dsh-timeband) 安装，在桌面端「插件 → 添加插件」输入 `dsh-timeband`；或在退出桌面端后执行 `dsh plugin --profile desktop add dsh-timeband@1.3.2`。也可直接安装下方的 GitHub 预构建包。

从 [GitHub Releases](https://github.com/a961282799-crypto/dsh-timeband/releases/tag/v1.3.2) 下载预构建安装包 `dsh-timeband-1.3.2.tgz`。不需要安装开发依赖或自行编译。

从托盘完全退出 Harness，在下载目录执行：

```powershell
dsh plugin --profile desktop add ./dsh-timeband-1.3.2.tgz
```

如果 `dsh` 不在 PATH，使用桌面端安装目录中随附的命令，例如：

```powershell
& 'C:\path\to\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add ./dsh-timeband-1.3.2.tgz
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

到当前连续覆盖年份结束前 30 天，插件自动下载下一年度日历；若打开应用时已经缺少本年度数据，会立即检查本年度文件。更新源是自动抓取国务院公告的 [holiday-cn](https://github.com/NateScarlet/holiday-cn)，固定地址为 `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{年份}.json`，不需要你每年在本项目上传文件。不发送账户信息、Cookie、API Key 或消费数据。有效数据合并进已有日历并保存在本地，重启继续使用，同来源的多个窗口同步。

更新文件尚未发布、网络失败或内容不合格时保留已有数据，每 24 小时重试；网络恢复时可立即重试失败请求。启动、系统时钟恢复、跨日及后台每小时检查是否进入更新窗口；成功扩展覆盖后停止联网检查，直到再次临近到期。应用完全退出时不执行后台更新，重新打开后检查。检查记录在本地保存，支持 Web Locks 的同来源窗口会串行检查，避免重复下载。

下载超时限制为 10 秒，内容最大 64 KB；验证目标年份、真实日期、休息日标记和政府公告来源地址。没有公告及日期的空占位文件表示尚未发布；错误文件或保存失败不会替换已有数据。仅将实际休息日转换为假期间隔，调休周末仍全天为谷时段；下一年公告涉及上年 12 月时，只补充已经有完整覆盖的年份。旧缓存不会覆盖更新的内置核对结果，新年份也不会删除此前年份。2026 年实时数据已与内置假期逐段比对一致。来源地址校验不等于再次在线核验公告内容；格式及维护步骤见[日历维护说明](https://github.com/a961282799-crypto/dsh-timeband/blob/main/docs/calendar-maintenance.md)。

正常界面没有日历操作区，仅在检查中、等待新年度文件或更新失败时显示简短状态。未收录年份的工作日峰时段显示「待核实」，不推断假日。倒计时遇到未知日历区间会停止给出确定峰谷切换时间。

## 峰时段提醒

展开「规则与提醒」，开启「峰时段前 5 分钟提醒」。只有手动开启时才申请系统通知权限；被拒绝、接口不支持或设置无法保存时，开关保持关闭并给出说明。允许通知后，可点击「测试提醒」立即显示应用内提示并检查系统通知的发送状态，测试不会改写峰时段的去重记录。5 秒没有系统回执时说明「未确认通知显示」；发送失败时保留应用内提醒，开关仍保持开启。

提醒使用北京时间与当前日历，在 09:00、14:00 峰时段开始前的 5 分钟窗口内发送一次。节假日、周末和待核实的峰时段不发送确定提醒；窗口内开启或唤醒会提醒尚未开始的峰时段，已经开始则不补发。应用需要保持运行，退出后无法继续提醒。系统通知的展示还受宿主及操作系统设置影响，详见[提醒说明](https://github.com/a961282799-crypto/dsh-timeband/blob/main/docs/reminders.md)。

## 架构

TypeScript 7 + React 18（宿主共享实例）+ Cordis 官方插槽生命周期；esbuild 生成 DSH 的 `__ModuleLoader__.load({ id, factory })` 格式。发布包没有运行时 npm 依赖，也不打包另一份 React。

安装包只包含构建后的运行文件、内置日历、插件配置和说明。源码映射仅保留在本地 `dist/client.js.map` 用于调试，不随安装包分发，客户端也不会请求这个文件。

`src/schedule.ts` 是纯时间逻辑及按时段复用的日程读取器；`calendar.ts` 校验并合并日历，`calendar-feed.ts` 将公告数据转换为计费假期，`calendar-store.ts` 负责本地持久化与窗口同步，`calendar-updater.ts` 负责到期检查、限量下载、每日重试和卸载取消；`clock.ts` 是单一可订阅时钟，隐藏时暂停，唤醒时重读系统时间；`reminder-store.ts` 管理提醒偏好与用户触发的授权，`reminders.ts` 在开启时保留一个截止时间计时器，重新核对日历、墙钟和发送记录；`reminder-delivery.ts` 保留应用内提醒并监测系统通知回执，`reminder-sound.ts` 合成提示音并管理播放与清理；`client.ts` 持有注册、字典及清理；`view.tsx` 接收宿主注入的状态、时钟和翻译函数。`cordis.patch.yml` 与 `dsh.bundle` 负责安装后进入宿主配置。

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

v1.3.2 发布检查包含 49 项 Node 检查和 27 项 Chrome 检查，共 76 项通过。自动更新覆盖 30 天边界、跨年、缓存、多窗口、404 每日重试、断网恢复、无效文件、限量下载、保存错误、超时和卸载取消。原有时间轴、提醒及生命周期检查继续保留。提醒反馈覆盖系统无回执、构造与异步错误、重复点击、关闭与卸载；提示音使用真实 Web Audio 验证波形、重复播放和清理。检查和桌面安装结果见[兼容性记录](https://github.com/a961282799-crypto/dsh-timeband/blob/main/docs/compatibility.md)。Chrome 中使用合成年度日历和受控网络响应，不表示 2027 官方安排已发布；通知替身不代表 Windows 实际横幅。

`npm run compatibility` 核对 npm 最新正式标签与已验证版本，并检查四个宿主依赖版本。GitHub 的 Plugin checks 在提交、PR 或手动运行时执行此检查和功能测试；新宿主出现时会提示重新验证，不自动扩大兼容版本。详情见[兼容性记录](https://github.com/a961282799-crypto/dsh-timeband/blob/main/docs/compatibility.md)。

## 许可证

[MIT](LICENSE)
