# PIXEL FRONT

纯前端 3D 像素风 FPS 单机 Demo  
**Vite + TypeScript + Three.js** · 无需后端 · 无外部贴图/音效资源

战地风格**超大战场（500×500）** · 第一人称枪战 · 双阵营 AI · 线性征服 / 击杀 / 生存三模式  
程序化建筑生成 · Web Audio 合成热血 BGM · 已占据点可选复活

---

## 运行

```bash
cd "/Users/zzn/项目/games/战地/pixel-fps"
npm install
npm run dev
```

浏览器打开终端提示的本地地址（默认 `http://localhost:5173`）。  
菜单选模式后，点击画面锁定鼠标。

```bash
npm run build    # 生产构建 → dist/
npm run preview  # 预览构建结果
```

### 在线试玩（GitHub Pages）

推送到 `main` 后 Actions 会自动部署。

- 自定义域名：`https://fps.lovezzn.com`
- 备用地址：`https://bestxiangest.github.io/pixel-fps/`

---

## 操作

| 输入 | 功能 |
|------|------|
| WASD | 移动 |
| Shift | 冲刺（开镜时禁用） |
| 空格 | 跳跃 |
| 鼠标移动 | 视角 |
| 左键 | 射击 |
| **右键按住** | **开镜（ADS）** |
| R | 换弹 |
| 1 / 2 | 步枪 / 手枪 |
| F | 使用附近固定弹药箱 |
| M / LOADOUT | 打开重新部署（换枪） |
| 点击画面 | 锁定指针 + 解锁音频 |

征服模式阵亡后：弹出**据点选择面板**，点击已占领据点即可在据点内复活。

---

## 游戏模式

| 模式 | 说明 |
|------|------|
| **CONQUEST** | 线性征服：A→E 推进 + 双方 HQ；票数 450；打穿全线后突入敌 HQ 可直接获胜；阵亡可选已占点复活 |
| **KILL RUSH** | 击杀 15 名敌军获胜；死亡后自动重生 |
| **SURVIVAL** | 敌军持续刷新；血量归零 Game Over（不可重生） |

### 征服模式要点

- 资源点：**A → B → C → D → E**（南蓝 → 北红）+ 双方 **HQ**，点距约 70–90m
- 线性解锁：只能争夺「己方最前沿相邻」的下一个点
- 占领：进入旗点半径，人数越多占领越快（双方同在则按人数差转化）
- 票数：每控制 1 个点，对敌方约 1.0 票/秒
- 突破：占满 A–E 后可攻 **RED HQ**，占满即胜
- 复活：冷却约 2 秒后，可部署至蓝方 HQ 或任意已占蓝点

---

## 项目结构（重点文件）

```
pixel-fps/
├── index.html                 # 菜单 / HUD / 票数条 / 据点复活 / 结算 DOM
├── package.json               # three、vite、typescript
├── vite.config.ts
├── tsconfig.json
├── README.md
├── dist/                      # build 输出
└── src/
    ├── main.ts                # ★ 入口：模式切换、主循环、HUD / 复活绑定
    ├── game.ts                # ★ 规则状态机（menu/playing/victory/gameover）
    ├── conquest.ts            # ★ 征服：旗点、线性解锁、票数、HQ、出生选项
    ├── player.ts              # 第一人称移动、HP、后坐力角、ADS、手动复活
    ├── weapons.ts             # ★ 枪械、腰射/开镜散布、ADS、后坐力累积
    ├── combatant.ts           # 双阵营 AI + FSM（18v18 征服）
    ├── navigation.ts          # A* 导航网格、绕障路径与可用出生点查询
    ├── supplies.ts            # 敌人弹药包掉落、自动拾取、固定弹药箱
    ├── pixelPass.ts           # ★ 像素化 RT（NearestFilter）+ Bayer 抖动
    ├── scene.ts               # 白天光照、远雾、天空、组装地形/地图
    ├── map.ts                 # 建筑原语：民房/残垣/碉堡/沙袋/树木等
    ├── structureGen.ts        # ★ 程序化战场建筑生成器
    ├── terrain.ts             # 500×500 高度场（高地/战壕/弹坑）
    ├── textures.ts            # Canvas 程序化像素贴图（浅色地面等）
    ├── collision.ts           # AABB 轴分离 + 地形高度
    ├── minimap.ts             # 俯视小地图 + 资源点状态
    ├── audio.ts               # Web Audio 合成音效 + 战场 BGM
    ├── effects.ts             # 弹痕 / 像素飞溅
    └── style.css              # 像素风 UI（准星/票数/战线条/占领/复活）
```

### 按功能索引

| 想改什么 | 主要文件 |
|----------|----------|
| 启动 / 主循环 / 模式入口 | `src/main.ts` |
| 胜负与模式规则 | `src/game.ts` |
| 征服旗点与票数 / 复活点 | `src/conquest.ts` |
| 枪感 / 开镜 / 散布 | `src/weapons.ts` |
| 双阵营 AI / 队友协作 | `src/combatant.ts` |
| 像素清晰度 / 抖动 | `src/pixelPass.ts`（`PIXEL_SCALE`、`ENABLE_DITHER`） |
| 建筑原语（门窗墙） | `src/map.ts` |
| 建筑密度 / 种类分布 | `src/structureGen.ts` |
| 地形起伏 / 地图尺寸 | `src/terrain.ts`（`MAP_SIZE`） |
| 亮度 / 雾 / 阳光 | `src/scene.ts` |
| BGM / 音效 | `src/audio.ts` |
| UI 文案与布局 | `index.html` + `src/style.css` |

---

## 已实现功能一览

### 渲染与视觉

- 低分辨率 RenderTarget + **NearestFilter** 放大（锐利色块，非线性模糊）
- 可配置 `PIXEL_SCALE`（默认 2.3）；帧率低时自动略增降采样
- 可选 4×4 Bayer 抖动
- 程序化 Canvas 贴图 + `NearestFilter`；**浅色干草原/沙土地面**
- 白天高亮光照；树木 `InstancedMesh` 合批；500m 远雾

### 战场与建筑

- **500×500** 大战场，据点拉远分布
- **`structureGen.ts` 程序化生成**：民房（门+窗）、断壁残垣（可进入）、可进入射击碉堡、瓦砾堆、矮墙、瞭望塔、封闭机枪巢
- 旗点圆心自动净空；建筑间距去重；据点外围优先撒战术建筑
- 墙体支持多开口（门洞 / 窗口 / 射击缝）

### 枪械手感

- 步枪连发 / 手枪单发；弹匣 + 换弹动画
- **腰射圆形锥散布**（站立 / 移动 / 空中不同）；准星间距跟随
- **右键 ADS**：枪模居中、FOV 收窄、散布趋近 0、移速降低
- 后坐力连发递增、开镜削弱、停火部分回弹

### 双阵营 AI（FSM）

- 统一 `Combatant` 驱动蓝、红双方 AI
- 巡逻 → 警觉 → 追击 → 攻击 → 低血掩体 → 死亡倒地重生
- 征服模式约 **18v18**；死亡后可复活到已占领据点广布全场
- AI 使用静态 A* 导航网格绕过建筑和矮墙
- 指挥层分配突击据点、侧翼拦截、调查枪声等任务

### 生存与补给

- 玩家停止受伤 5 秒后开始呼吸回血
- 敌人死亡掉落弹药包；战场固定弹药箱按 F 补满

### 音频

- 全部 Web Audio 合成（无外部文件）
- 开局播放热血战场 BGM（148 BPM · D 小调），结束淡出

### UI

- 开始菜单、血条、弹药、击杀/计时、小地图（500M）
- 征服：票数条、**战线据点条**、占领状态 HUD（CAPTURING / CONTESTED 等）
- 阵亡据点选择面板；小队状态；突破 HQ 横幅

---

## 技术栈与约束

| 项 | 选型 |
|----|------|
| 脚手架 | Vite + TypeScript |
| 3D | Three.js ~0.169 |
| AI 导航 | PathFinding.js 0.4 |
| 贴图 | 仅 Canvas 程序化，无图片文件 |
| 物理 | 自研 AABB + 高度场，无 Cannon/Ammo |
| 音频 | Web Audio API 合成 |
| 建筑布局 | `structureGen` 确定性随机生成 |
| 后端 | 无 |

---

## 可调参数（常用）

```ts
// src/terrain.ts
export const MAP_SIZE = 500;   // 战场边长

// src/structureGen.ts（在 map.ts 调用处）
generateBattlefieldStructures(map, {
  seed: 778899,        // 换种子换布局
  attempts: 240,       // 越大建筑越密
  minSeparation: 13,   // 建筑最小间距
  flagClearExtra: 7,   // 旗点额外净空
});

// src/pixelPass.ts
export const PIXEL_SCALE = 2.3;
export const ENABLE_DITHER = true;

// src/conquest.ts
MAX_TICKETS = 450
TICKET_DRAIN_PER_POINT ≈ 1.0/秒
```

---

## 后续可扩展方向

### 已规划、尚未做

1. **友伤开关与惩罚**：当前已按阵营过滤伤害，尚未开放友伤或惩罚规则  
2. **小队指令**：集结、防守、突击等玩家主动指令  
3. **动态寻路**：复杂建筑内导航与更精确的掩体评估

### 战地特色远期

1. 载具（吉普 / 坦克）  
2. 可破坏建筑与爆炸  
3. 据点任务 / 推进线可视化路径  
4. 兵种与装备（医疗、反坦克）  
5. 多人联机（WebRTC / Colyseus）  
6. 关卡 JSON 编辑器  
7. CC0 采样音效替换合成音  

---

## 许可

Demo 学习用途。Three.js 遵循其自身 MIT 许可。
