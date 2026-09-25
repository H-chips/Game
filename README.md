# 合成神龙 · 从蝌蚪到神龙 🐉

一个纯前端（零依赖）的 H5 合成进化小游戏：从一只**小蝌蚪**开始，一路吞噬、合成，最终进化成**神龙**。
手机浏览器 / **微信里点链接就能玩**。

## 🎮 在线地址

**https://h-chips.github.io/Game/**

手机 / 微信里直接打开即可玩，无需安装、无需联网下载资源。

## 玩法规则

| 规则 | 说明 |
| --- | --- |
| 操作 | 手指在屏幕上**拖动**即可控制游动（PC 用方向键 / WASD） |
| 可合并 | **等级 ≤ 自己等级**的生物，撞上去就能吸收 |
| 进化 | 集满 **3 只同级**生物 → 立刻进化一级 |
| 换算 | 3 只低一级 = 1 只同级（合成链条自洽） |
| 危险 | **等级比你高**的生物会撞伤你（红色虚线圈），共 3 颗心 |
| 回血 | 每进化一级回复 1 颗心（上限 3） |
| 胜利 | 进化到最终形态「神龙」 |

进化链（12 级）：

```
蝌蚪 → 小虾 → 泥鳅 → 青蛙 → 乌龟 → 金鱼
     → 锦鲤 → 水蛇 → 鳄鱼 → 大鲵 → 蛟龙 → 神龙
```

## 本地运行

直接双击 `index.html` 即可（纯静态，无需构建）。
或者起一个本地服务：

```bash
# Python
python -m http.server 8080
# Node（本项目自带零依赖服务器，推荐）
node serve.js 8080
```

然后访问 `http://localhost:8080`。

## 手机上玩（同一 WiFi 即可）

1. 双击 **`启动服务器.bat`**（或命令行 `node serve.js 8080`）
2. 控制台会打印出本机所有局域网地址，例如 `http://192.168.1.123:8080`
3. 手机连**同一个 WiFi**，浏览器打开该地址即可玩
4. 不想手输地址：电脑上打开 `http://localhost:8080/qr.html`，用手机扫二维码

> 若手机打不开，多半是 Windows 防火墙拦了入站，用管理员 PowerShell 放行一次端口：
> `New-NetFirewallRule -DisplayName "Dragon8080" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow`

手机端已做的适配：触摸拖拽操控、`viewport-fit=cover` 刘海安全区、禁止双击/双指缩放与下拉刷新、**小屏自动拉远视野**（`baseZoom`）、旋转屏幕与地址栏伸缩自动重排画面、刷怪半径随视野同步外推（不会在眼前凭空出现生物）。

## 部署成微信可打开的链接

游戏是纯静态文件，部署到任意静态托管后把链接发到微信即可点开。

### 方案一：GitHub Pages（免费，推荐）

1. 把本目录推到 GitHub 仓库（例如 `Synthetic_Dragon`）
2. 仓库 `Settings → Pages → Build and deployment`
3. `Source` 选 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`
4. 保存后等待 1~2 分钟，得到 `https://<用户名>.github.io/Synthetic_Dragon/`
5. 把这个链接发到微信聊天 / 朋友圈即可直接打开

### 方案二：Vercel / Netlify

- Vercel：导入仓库，Framework 选 `Other`，Build Command 留空，Output Directory 留空 → Deploy
- Netlify：把整个目录拖进 Netlify Drop 即可

### 微信内打开注意事项

- 微信内置浏览器支持 Canvas 2D、ES5 语法、WebAudio，本游戏已全部使用兼容性写法
- 微信对未备案域名的分享页有时会有「已停止访问该网页」的风险提示，若需稳定传播，建议绑定自己的已备案域名
- 页面已加入 `viewport-fit=cover`、`apple-mobile-web-app-capable`、禁止双指缩放与长按菜单，移动端体验接近原生

## 目录结构

```
index.html   页面骨架 + HUD + 开始/结算弹窗
style.css    全部样式（移动端优先、安全区适配）
game.js      游戏逻辑：生物图鉴、AI、合成规则、渲染、音效
```

## 参考的同类开源项目

本项目的玩法参考了 2021 年底爆火的《召唤神龙》（微伞小游戏，玩法为「大鱼吃小鱼 + 合成进化」）。GitHub 上有不少同源实现：

- [arcxingye/zhsl](https://github.com/arcxingye/zhsl) — 召唤神龙（原版 / 简单 / 无敌多分支 + 去广告 + 修正），在线 Demo：https://arcxingye.github.io/zhsl/
- [NatukiHw/SummonTheDragon](https://github.com/NatukiHw/SummonTheDragon) — 召唤神龙原版去广告版，可直接静态部署
- [somego/SummonTheDragon](https://github.com/somego/SummonTheDragon) — 上者的 fork，同样去广告可直接部署
- 合成类玩法鼻祖参考：[合成大西瓜 / Suika Game](https://github.com/search?q=suika+game)

> 注意：上面这些项目多为原版逆向/去广告版本，商用前请注意授权；本项目是**完全独立实现**的原创代码（生物形象为 Canvas 矢量绘制，无任何素材依赖），可自由使用与二次开发。

## 二次开发

- 生物图鉴在 `game.js` 顶部的 `SPECIES` 数组，改名字 / 颜色 / 体型即可
- `MERGE_NEED`（默认 3）改成 2 就是「两只合成一只」的快节奏版本
- `pickLevel()` 控制生物等级分布，`BASE_ENTITIES` / `targetCount()` 控制同屏数量，`dangerP` / `huntChance()` 控制危险程度，用来调难度
- `baseZoom`（`resize()` 内）控制小屏自动拉远的视野倍率
