import * as THREE from 'three';
import { createScene } from './scene';
import { Player } from './player';
import { Minimap } from './minimap';
import { GameAudio } from './audio';
import { Effects } from './effects';
import {
  PRIMARY_WEAPON_IDS,
  WEAPON_DEFS,
  WeaponSystem,
  type PrimaryWeaponId,
} from './weapons';
import {
  CombatantManager,
  createCoverPoints,
  createDefaultSpawns,
  setCombatantRespawnTime,
} from './combatant';
import { GameRules, GameMode } from './game';
import { PixelComposer, PIXEL_SCALE, ENABLE_DITHER } from './pixelPass';
import { ConquestMode } from './conquest';
import { sampleHeight } from './terrain';
import { MAP_HALF } from './map';
import { NavigationGrid } from './navigation';
import { AmmoSupplySystem } from './supplies';

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setClearColor(0xc9e3f8, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

// 像素化后处理：低分辨率 RT + NearestFilter 放大
const pixel = new PixelComposer(renderer);
let runtimeScale = PIXEL_SCALE;

let sceneBundle;
try {
  sceneBundle = createScene();
} catch (err) {
  console.error('[createScene failed]', err);
  document.body.innerHTML =
    `<pre style="color:#f66;padding:16px;font:14px monospace">场景初始化失败:\n${err}</pre>`;
  throw err;
}

const { scene, obstacles, minimap: mapFeatures, spawn, terrain, shootables } =
  sceneBundle;

const player = new Player(window.innerWidth / window.innerHeight);
player.obstacles = obstacles;
player.getHeight = (x, z) => terrain.getHeight(x, z);
scene.add(player.camera);

const safeY = terrain.getHeight(spawn.x, spawn.z) + 0.9;
player.setSpawn(new THREE.Vector3(spawn.x, safeY, spawn.z), 0);

const audio = new GameAudio();
const effects = new Effects(scene);
const weapons = new WeaponSystem(player.camera, audio, effects);
const rules = new GameRules();
const conquest = new ConquestMode(scene);
const supplies = new AmmoSupplySystem(
  scene,
  obstacles,
  (x, z) => terrain.getHeight(x, z),
  audio,
);
const navigation = new NavigationGrid(obstacles);
const combatants = new CombatantManager(
  scene,
  createDefaultSpawns(),
  createCoverPoints(obstacles),
  navigation,
  audio,
  effects,
);

const mapBlockers = [...shootables, supplies.root];
weapons.setShootables([...mapBlockers, combatants.getShootRoot()]);
combatants.setEnemyDeathCallback(position => {
  supplies.spawnDrop(position, (x, z) => terrain.getHeight(x, z));
});
weapons.setShotCallback(position => {
  combatants.reportGunfire('player', position);
});

const $ = (id: string) => document.getElementById(id);

const menuEl = $('menu');
const hudRoot = $('hud-root');
const resultEl = $('result-overlay');
const resultTitle = $('result-title');
const resultStats = $('result-stats');
const weaponNameEl = $('weapon-name');
const ammoEl = $('ammo');
const reloadEl = $('reload-status');
const crosshairEl = $('crosshair');
const adsSightEl = $('ads-sight');
const hpFillEl = $('hp-fill');
const hpTextEl = $('hp-text');
const killsEl = $('kills');
const killTargetEl = $('kill-target');
const modeLabelEl = $('mode-label');
const timerEl = $('timer');
const hurtEl = $('hurt-vignette');
const dmgDirEls = {
  front: document.querySelector('#damage-dirs .front') as HTMLElement | null,
  right: document.querySelector('#damage-dirs .right') as HTMLElement | null,
  back: document.querySelector('#damage-dirs .back') as HTMLElement | null,
  left: document.querySelector('#damage-dirs .left') as HTMLElement | null,
};
const fpsEl = $('fps');
const posEl = $('pos');
const deathHint = $('death-hint');
const ticketsBar = $('tickets-bar');
const blueTicketsEl = $('blue-tickets');
const redTicketsEl = $('red-tickets');
const blueTicketsFill = $('blue-tickets-fill');
const redTicketsFill = $('red-tickets-fill');
const capturePrompt = $('capture-prompt');
const captureNameEl = $('capture-name');
const captureFillEl = $('capture-fill');
const captureStatusEl = $('capture-status');
const captureBlueCountEl = $('capture-blue-count');
const captureRedCountEl = $('capture-red-count');
const capturePctEl = $('capture-pct');
const breakthroughEl = $('breakthrough-banner');
const sectorStripEl = $('sector-strip');
const sectorPointsEl = $('sector-points');
const squadStatusEl = $('squad-status');
const squadListEl = $('squad-list');
const interactionPromptEl = $('interaction-prompt');
const blueForceEl = $('blue-force');
const redForceEl = $('red-force');
const deploymentEl = $('deployment-overlay');
const deploymentCurrentEl = $('deployment-current');
const loadoutOptionsEl = $('loadout-options');
const loadoutButtonEl = $('btn-loadout');
const spawnOverlayEl = $('spawn-overlay');
const spawnOptionsEl = $('spawn-options');
const spawnCountdownEl = $('spawn-countdown');
const spawnMapEl = $('spawn-map');
const controlsOverlayEl = $('controls-overlay');

let hitMarkerActive = false;
let deploymentOpen = false;
let spawnSelectOpen = false;
let selectedPrimary: PrimaryWeaponId = weapons.getPrimaryWeaponId();
let lastSpawnOptionsKey = '';
let spawnRefreshCd = 0;
let lastCapturePromptId = '';
let sectorStripBuilt = false;

weapons.setHudCallback(h => {
  if (weaponNameEl) weaponNameEl.textContent = h.name;
  if (ammoEl) {
    ammoEl.textContent = `${h.mag} / ${h.reserve}`;
    ammoEl.classList.toggle('ammo-low', h.mag <= Math.ceil(h.magSize * 0.25));
    ammoEl.classList.toggle('ammo-empty', h.mag === 0);
  }
  if (reloadEl) reloadEl.textContent = h.reloading ? 'RELOADING...' : '';

  // 腰射准星间距 ∝ 散布角度；开镜切换机瞄
  if (crosshairEl) {
    const gap = 4 + h.spreadDeg * 9;
    crosshairEl.style.setProperty('--spread', `${Math.min(72, Math.max(2, gap))}px`);
    crosshairEl.classList.toggle('hidden-ads', h.ads);
  }
  if (adsSightEl) {
    adsSightEl.classList.toggle('show', h.adsBlend > 0.55);
  }
});

weapons.setHitCallback((obj, weaponId, damage, isHeadshot) => {
  const r = combatants.applyPlayerHit(obj, weaponId, damage);
  if (r === 'none' || r === 'friendly') return false;
  hitMarkerActive = true;
  if (r === 'kill') {
    pushKillSkull(isHeadshot);
    audio.playKillConfirm(isHeadshot);
    const won = rules.addKill();
    updateScoreHud();
    if (won) endMatch('victory');
  }
  return true;
});

const killFeedEl = $('kill-feed');
const MAX_KILL_SKULLS = 4;

function skullSvg(headshot: boolean): string {
  const bone = headshot ? '#ffe566' : '#e8e8e8';
  const socket = headshot ? '#5a3a00' : '#1a1a1a';
  const glow = headshot ? '#ffb000' : '#9a9a9a';
  return `
<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="4" y="1" width="8" height="2" fill="${bone}"/>
  <rect x="3" y="3" width="10" height="6" fill="${bone}"/>
  <rect x="4" y="9" width="8" height="2" fill="${bone}"/>
  <rect x="5" y="11" width="6" height="2" fill="${bone}"/>
  <rect x="5" y="13" width="2" height="2" fill="${bone}"/>
  <rect x="9" y="13" width="2" height="2" fill="${bone}"/>
  <rect x="4" y="5" width="3" height="3" fill="${socket}"/>
  <rect x="9" y="5" width="3" height="3" fill="${socket}"/>
  <rect x="7" y="8" width="2" height="2" fill="${socket}"/>
  <rect x="6" y="11" width="1" height="1" fill="${socket}"/>
  <rect x="9" y="11" width="1" height="1" fill="${socket}"/>
  <rect x="2" y="4" width="1" height="4" fill="${glow}"/>
  <rect x="13" y="4" width="1" height="4" fill="${glow}"/>
</svg>`;
}

function pushKillSkull(headshot: boolean) {
  if (!killFeedEl) return;
  while (killFeedEl.childElementCount >= MAX_KILL_SKULLS) {
    killFeedEl.firstElementChild?.remove();
  }
  const el = document.createElement('div');
  el.className = headshot ? 'kill-skull headshot' : 'kill-skull';
  el.innerHTML = `${skullSvg(headshot)}<span class="skull-label">${headshot ? 'HEADSHOT' : 'ELIM'}</span>`;
  killFeedEl.appendChild(el);
  window.setTimeout(() => el.remove(), 1700);
}

player.setHpCallback((hp, max, dead) => {
  const pct = Math.max(0, (hp / max) * 100);
  if (hpFillEl) {
    hpFillEl.style.width = `${pct}%`;
    hpFillEl.classList.toggle('hp-low', pct <= 30 && pct > 0);
    hpFillEl.classList.toggle('hp-crit', pct <= 15 && pct > 0);
  }
  if (hpTextEl) hpTextEl.textContent = `${Math.ceil(hp)} / ${max}`;
  const showDeath =
    dead &&
    rules.allowRespawn() &&
    rules.isPlaying &&
    rules.mode !== 'conquest';
  deathHint?.classList.toggle('show', showDeath);
  if (dead && rules.mode === 'conquest' && rules.isPlaying) {
    setSpawnSelectOpen(true);
  } else if (!dead) {
    setSpawnSelectOpen(false);
  }
});

player.setDeathCallback(() => {
  audio.playPlayerDeath();
  const permanent = rules.onPlayerDeath();
  if (permanent) endMatch('gameover');
  if (rules.mode === 'conquest' && rules.isPlaying) {
    setSpawnSelectOpen(true);
    refreshSpawnOptions(true);
  }
});

function updateScoreHud() {
  if (killsEl) killsEl.textContent = String(rules.kills);
  if (killTargetEl) {
    killTargetEl.textContent =
      rules.mode === 'kill' ? `/ ${rules.killTarget}` : '';
  }
  if (modeLabelEl) {
    const labels: Record<GameMode, string> = {
      kill: 'KILL RUSH',
      survival: 'SURVIVAL',
      conquest: 'CONQUEST',
    };
    modeLabelEl.textContent = labels[rules.mode];
  }
  ticketsBar?.classList.toggle('show', rules.mode === 'conquest' && rules.isPlaying);
  sectorStripEl?.classList.toggle('show', rules.mode === 'conquest' && rules.isPlaying);
  squadStatusEl?.classList.toggle(
    'show',
    rules.isPlaying && (rules.mode === 'conquest' || rules.mode === 'kill' || rules.mode === 'survival'),
  );
}

function updateSquadHud() {
  if (!squadListEl || !rules.isPlaying) return;
  const nearby = combatants.getNearestAllies(player.position, 4);
  if (blueForceEl) {
    blueForceEl.textContent = String(
      combatants.allies.filter(unit => unit.alive).length + (player.alive ? 1 : 0),
    );
  }
  if (redForceEl) {
    redForceEl.textContent = String(
      combatants.enemies.filter(unit => unit.alive).length,
    );
  }
  const orderLabels: Record<(typeof nearby)[number]['order'], string> = {
    objective: 'ATK',
    intercept: 'CUT',
    investigate: 'SND',
    patrol: 'MOV',
    none: '---',
  };
  squadListEl.replaceChildren(
    ...nearby.map(unit => {
      const row = document.createElement('div');
      row.className = 'squad-row';

      const label = document.createElement('span');
      label.className = 'squad-id';
      label.textContent = unit.id;

      const order = document.createElement('span');
      order.className = `squad-order ${unit.order}`;
      order.textContent = orderLabels[unit.order];
      order.title =
        unit.order === 'objective'
          ? '突击前沿'
          : unit.order === 'intercept'
            ? '拦截路线'
            : unit.order === 'investigate'
              ? '调查枪声'
              : '机动巡逻';

      const track = document.createElement('span');
      track.className = 'squad-hp-track';
      const fill = document.createElement('span');
      fill.className = 'squad-hp-fill';
      fill.style.width = `${Math.max(0, (unit.hp / unit.maxHp) * 100)}%`;
      if (unit.hp <= 30) fill.classList.add('critical');
      track.appendChild(fill);

      const distance = document.createElement('span');
      distance.className = 'squad-distance';
      distance.textContent = `${Math.round(unit.distance)}m`;
      row.append(label, order, track, distance);
      return row;
    }),
  );
}

function updateConquestHud(
  st: ReturnType<ConquestMode['getState']>,
) {
  if (blueTicketsEl) blueTicketsEl.textContent = String(Math.ceil(st.blueTickets));
  if (redTicketsEl) redTicketsEl.textContent = String(Math.ceil(st.redTickets));
  const max = st.maxTickets;
  if (blueTicketsFill) {
    blueTicketsFill.style.width = `${(st.blueTickets / max) * 100}%`;
  }
  if (redTicketsFill) {
    redTicketsFill.style.width = `${(st.redTickets / max) * 100}%`;
  }

  // 战线据点条：HQ · A→E · HQ（原地更新，避免每帧重建导致进度条失效）
  if (sectorPointsEl) {
    const order = ['HQ_BLUE', 'A', 'B', 'C', 'D', 'E', 'HQ_RED'];
    const byId = new Map(st.points.map(p => [p.id, p]));
    if (!sectorStripBuilt) {
      const nodes: HTMLElement[] = [];
      for (let i = 0; i < order.length; i++) {
        const p = byId.get(order[i]);
        if (!p) continue;
        if (i > 0) {
          const link = document.createElement('div');
          link.className = 'sector-link';
          nodes.push(link);
        }
        const node = document.createElement('div');
        node.className = 'sector-node';
        node.dataset.pointId = p.id;

        const id = document.createElement('span');
        id.className = 'sector-id';
        id.textContent =
          p.kind === 'hq' ? (p.id === 'HQ_BLUE' ? 'BHQ' : 'RHQ') : p.id;

        const pip = document.createElement('span');
        pip.className = 'sector-pip';
        const fill = document.createElement('span');
        fill.className = 'sector-pip-fill';
        pip.appendChild(fill);
        node.append(id, pip);
        nodes.push(node);
      }
      sectorPointsEl.replaceChildren(...nodes);
      sectorStripBuilt = true;
    }

    for (const id of order) {
      const p = byId.get(id);
      const node = sectorPointsEl.querySelector<HTMLElement>(
        `.sector-node[data-point-id="${id}"]`,
      );
      if (!p || !node) continue;
      node.className = `sector-node ${p.owner}${p.kind === 'hq' ? ' hq' : ''}`;
      if (p.contestable) node.classList.add('contestable');
      if (p.contesting) node.classList.add('contesting');
      const fill = node.querySelector<HTMLElement>('.sector-pip-fill');
      if (fill) {
        fill.style.width = `${p.progress}%`;
        fill.style.background =
          p.progress >= 55
            ? 'repeating-linear-gradient(90deg, #3388ff 0 4px, #2266dd 4px 6px)'
            : p.progress <= 45
              ? 'repeating-linear-gradient(90deg, #ff4433 0 4px, #cc2211 4px 6px)'
              : 'repeating-linear-gradient(90deg, #999 0 4px, #777 4px 6px)';
      }
    }
  }

  if (capturePrompt && captureNameEl && captureFillEl) {
    const statuses = [
      'capturing',
      'securing',
      'losing',
      'contested',
      'neutralizing',
    ] as const;
    for (const s of statuses) capturePrompt.classList.remove(s);

    if (st.activePrompt) {
      const prompt = st.activePrompt;
      const switched = prompt.id !== lastCapturePromptId;
      lastCapturePromptId = prompt.id;

      capturePrompt.classList.add('show', prompt.status);
      const statusLabels: Record<(typeof statuses)[number], string> = {
        capturing: 'CAPTURING',
        securing: 'SECURING',
        losing: 'LOSING',
        contested: 'CONTESTED',
        neutralizing: 'NEUTRALIZING',
      };
      if (captureStatusEl) {
        captureStatusEl.textContent = statusLabels[prompt.status];
      }
      captureNameEl.textContent = prompt.name;
      if (captureBlueCountEl) {
        captureBlueCountEl.textContent = `B${prompt.blueCount}`;
      }
      if (captureRedCountEl) {
        captureRedCountEl.textContent = `R${prompt.redCount}`;
      }
      const pct = Math.round(prompt.progress);
      // 切换据点时先清零再赋值，避免沿用上一次 100% 宽度
      if (switched) {
        captureFillEl.style.width = '0%';
        void captureFillEl.offsetWidth;
      }
      captureFillEl.style.width = `${pct}%`;
      captureFillEl.classList.toggle('blue', prompt.progress >= 50);
      captureFillEl.classList.toggle('red', prompt.progress < 50);
      if (capturePctEl) capturePctEl.textContent = `${pct}%`;
    } else {
      capturePrompt.classList.remove('show');
      lastCapturePromptId = '';
    }
  }

  breakthroughEl?.classList.toggle(
    'show',
    st.breakthrough && !st.winner && rules.isPlaying,
  );
}

const loadoutRoles: Record<PrimaryWeaponId, string> = {
  rifle: '均衡中距离 · 稳定持续火力',
  smg: '近距离压制 · 高射速机动',
  shotgun: '室内突破 · 多弹丸爆发',
  sniper: '近中距一枪死 · 远距衰减 · 爆头高伤',
};

function refreshLoadoutSelection() {
  if (deploymentCurrentEl) {
    deploymentCurrentEl.textContent = WEAPON_DEFS[selectedPrimary].name;
  }
  loadoutOptionsEl?.querySelectorAll<HTMLButtonElement>('.loadout-option')
    .forEach(button => {
      const selected = button.dataset.weapon === selectedPrimary;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
}

function buildLoadoutOptions() {
  if (!loadoutOptionsEl) return;
  const options = PRIMARY_WEAPON_IDS.map(id => {
    const def = WEAPON_DEFS[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'loadout-option';
    button.dataset.weapon = id;

    const name = document.createElement('span');
    name.className = 'loadout-name';
    name.textContent = def.name;

    const role = document.createElement('span');
    role.className = 'loadout-role';
    role.textContent = loadoutRoles[id];

    const stats = document.createElement('span');
    stats.className = 'loadout-stats';
    const values: [string, string][] = [
      ['DMG', def.pellets > 1 ? `${def.damage} x ${def.pellets}` : String(def.damage)],
      ['RPM', String(def.rpm)],
      ['MAG', String(def.magSize)],
      ['RANGE', `${def.range}m`],
    ];
    for (const [labelText, valueText] of values) {
      const label = document.createElement('span');
      label.textContent = labelText;
      const value = document.createElement('b');
      value.textContent = valueText;
      stats.append(label, value);
    }

    button.append(name, role, stats);
    button.addEventListener('click', event => {
      event.stopPropagation();
      selectedPrimary = id;
      audio.playUiClick();
      refreshLoadoutSelection();
    });
    return button;
  });
  loadoutOptionsEl.replaceChildren(...options);
  refreshLoadoutSelection();
}

function setDeploymentOpen(open: boolean, restorePointer = false) {
  if (open && !rules.isPlaying) return;
  deploymentOpen = open;
  deploymentEl?.classList.toggle('show', open);
  deploymentEl?.setAttribute('aria-hidden', String(!open));
  player.allowPointerLock = rules.isPlaying && !open && !spawnSelectOpen;
  if (open) {
    selectedPrimary = weapons.getPrimaryWeaponId();
    refreshLoadoutSelection();
    document.exitPointerLock?.();
  } else if (restorePointer && rules.isPlaying && player.alive && !spawnSelectOpen) {
    try {
      void document.body.requestPointerLock().catch(() => undefined);
    } catch {
      // 嵌入式预览可能不允许恢复 Pointer Lock。
    }
  }
}

function setSpawnSelectOpen(open: boolean) {
  if (open && (rules.mode !== 'conquest' || !rules.isPlaying)) return;
  spawnSelectOpen = open;
  spawnOverlayEl?.classList.toggle('show', open);
  spawnOverlayEl?.setAttribute('aria-hidden', String(!open));
  player.allowPointerLock = rules.isPlaying && !open && !deploymentOpen && player.alive;
  if (open) {
    document.exitPointerLock?.();
    refreshSpawnOptions(true);
  } else {
    lastSpawnOptionsKey = '';
  }
}

function refreshSpawnOptions(force = false) {
  if (rules.mode !== 'conquest') return;
  const options = conquest.getBlueSpawnOptions();
  const allPoints = conquest.getState(null).points;
  const key = options.map(o => `${o.id}:${o.frontline ? 1 : 0}`).join('|');
  const ready = player.canChooseSpawn();
  const cd = player.getRespawnCountdown();

  if (spawnCountdownEl) {
    if (ready) {
      spawnCountdownEl.textContent = 'READY';
      spawnCountdownEl.classList.add('ready');
    } else {
      spawnCountdownEl.textContent = `${Math.ceil(cd)}s`;
      spawnCountdownEl.classList.remove('ready');
    }
  }

  if (!spawnMapEl) return;

  if (!force && key === lastSpawnOptionsKey) {
    spawnMapEl.querySelectorAll<HTMLButtonElement>('.spawn-map-point').forEach(btn => {
      if (btn.classList.contains('available')) btn.disabled = !ready;
    });
    return;
  }
  lastSpawnOptionsKey = key;

  const available = new Map(options.map(o => [o.id, o]));
  // 地图：南(+Z)在下，北(-Z)在上 —— 与小地图一致
  const toPct = (x: number, z: number) => ({
    left: ((x + MAP_HALF) / (MAP_HALF * 2)) * 100,
    top: ((z + MAP_HALF) / (MAP_HALF * 2)) * 100,
  });

  const buttons = allPoints.map(p => {
    const opt = available.get(p.id);
    const owned = !!opt;
    const pos = toPct(p.x, p.z);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'spawn-map-point';
    btn.style.left = `${pos.left}%`;
    btn.style.top = `${pos.top}%`;
    btn.dataset.pointId = p.id;

    if (owned) {
      btn.classList.add('available');
      if (opt.frontline) btn.classList.add('frontline');
      btn.disabled = !ready;
      btn.title = opt.frontline ? `${opt.name} · 前沿` : opt.name;
      btn.addEventListener('click', event => {
        event.stopPropagation();
        deployAtPoint(p.id);
      });
    } else {
      btn.classList.add('locked');
      btn.disabled = true;
      btn.title = `${p.name} · 未占领`;
    }

    const idEl = document.createElement('span');
    idEl.className = 'spawn-map-id';
    idEl.textContent =
      p.kind === 'hq' ? (p.id === 'HQ_BLUE' ? 'BHQ' : 'RHQ') : p.id;
    const nameEl = document.createElement('span');
    nameEl.className = 'spawn-map-name';
    nameEl.textContent = owned ? (opt!.frontline ? 'FRONT' : 'OWNED') : '---';
    btn.append(idEl, nameEl);
    return btn;
  });

  spawnMapEl.replaceChildren(...buttons);
}

function deployAtPoint(pointId: string) {
  if (!player.canChooseSpawn() || rules.mode !== 'conquest') return;
  const pos = conquest.getSpawnInPoint(pointId, 0);
  if (!pos) return;
  const gy = sampleHeight(pos.x, pos.z) + 0.9;
  audio.playUiClick();
  player.respawnAt(new THREE.Vector3(pos.x, gy, pos.z), 0);
  setSpawnSelectOpen(false);
  setDeploymentOpen(false);
  deathHint?.classList.remove('show');
  setTimeout(() => {
    try {
      void document.body.requestPointerLock().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }, 80);
}

function setUiPlaying(playing: boolean) {
  menuEl?.classList.toggle('hidden', playing);
  hudRoot?.classList.toggle('hidden', !playing);
  player.allowPointerLock = playing && !spawnSelectOpen && !deploymentOpen;
  if (!playing) {
    setDeploymentOpen(false);
    setSpawnSelectOpen(false);
    resultEl?.classList.remove('show');
    document.exitPointerLock?.();
  }
}

function endMatch(kind: 'victory' | 'gameover') {
  setDeploymentOpen(false);
  setSpawnSelectOpen(false);
  rules.phase = kind;
  audio.stopBattleMusic();
  if (kind === 'victory') audio.playVictory();
  else audio.playGameOver();

  if (resultTitle) {
    resultTitle.textContent = kind === 'victory' ? 'VICTORY' : 'GAME OVER';
    resultTitle.className = kind === 'victory' ? 'win' : 'lose';
  }
  if (resultStats) {
    const modeName =
      rules.mode === 'kill'
        ? 'KILL RUSH'
        : rules.mode === 'survival'
          ? 'SURVIVAL'
          : 'CONQUEST';
    let extra = '';
    if (rules.mode === 'conquest') {
      extra = `<div>TICKETS: <b>蓝 ${Math.ceil(conquest.blueTickets)}</b> / <b>红 ${Math.ceil(conquest.redTickets)}</b></div>`;
    }
    resultStats.innerHTML = `
      <div>MODE: <b>${modeName}</b></div>
      <div>KILLS: <b>${rules.kills}</b>${rules.mode === 'kill' ? ` / ${rules.killTarget}` : ''}</div>
      ${extra}
      <div>TIME: <b>${rules.formatTime()}</b></div>
    `;
  }
  ticketsBar?.classList.remove('show');
  sectorStripEl?.classList.remove('show');
  squadStatusEl?.classList.remove('show');
  interactionPromptEl?.classList.remove('show');
  breakthroughEl?.classList.remove('show');
  capturePrompt?.classList.remove('show');
  resultEl?.classList.add('show');
  deathHint?.classList.remove('show');
  document.exitPointerLock?.();
}

function startGame(mode: GameMode) {
  audio.unlock();
  audio.playUiClick();
  audio.startBattleMusic();

  setCombatantRespawnTime(
    mode === 'survival' ? 5.5 : mode === 'conquest' ? 8 : 10,
  );
  rules.start(mode, 15);
  setDeploymentOpen(false);
  setSpawnSelectOpen(false);
  sectorStripBuilt = false;
  lastCapturePromptId = '';
  // 击杀自动重生；征服手动选据点
  player.resetForMatch(mode === 'kill');
  weapons.resetLoadout();
  supplies.resetDrops();
  conquest.reset();

  if (mode === 'conquest') {
    const sp = conquest.getHqSpawn('player');
    const gy = sampleHeight(sp.x, sp.z) + 0.9;
    player.setSpawn(new THREE.Vector3(sp.x, gy, sp.z), 0);
    combatants.configureConquest(
      conquest.getHqSpawn('player'),
      conquest.getHqSpawn('enemy'),
    );
    combatants.applyConquestOrders(
      conquest.getFrontlineObjectives('player'),
      conquest.getFrontlineObjectives('enemy'),
      player.position,
    );
  } else {
    combatants.configureSkirmish();
    const gy = terrain.getHeight(spawn.x, spawn.z) + 0.9;
    player.setSpawn(new THREE.Vector3(spawn.x, gy, spawn.z), 0);
  }

  updateScoreHud();
  setUiPlaying(true);
  resultEl?.classList.remove('show');

  setTimeout(() => {
    try {
      void document.body.requestPointerLock().catch(() => undefined);
    } catch {
      // 浏览器或嵌入式预览可能禁止 Pointer Lock，点击画面后仍可再次请求。
    }
  }, 100);
}

function backToMenu() {
  audio.stopBattleMusic();
  audio.playUiClick();
  rules.backToMenu();
  setDeploymentOpen(false);
  setSpawnSelectOpen(false);
  setUiPlaying(false);
  resultEl?.classList.remove('show');
  deathHint?.classList.remove('show');
  squadStatusEl?.classList.remove('show');
  sectorStripEl?.classList.remove('show');
  interactionPromptEl?.classList.remove('show');
}

$('btn-kill')?.addEventListener('click', () => startGame('kill'));
$('btn-survival')?.addEventListener('click', () => startGame('survival'));
$('btn-conquest')?.addEventListener('click', () => startGame('conquest'));
$('btn-controls')?.addEventListener('click', () => {
  audio.playUiClick();
  controlsOverlayEl?.classList.add('show');
  controlsOverlayEl?.setAttribute('aria-hidden', 'false');
});
$('btn-controls-close')?.addEventListener('click', () => {
  audio.playUiClick();
  controlsOverlayEl?.classList.remove('show');
  controlsOverlayEl?.setAttribute('aria-hidden', 'true');
});
$('btn-restart')?.addEventListener('click', () => {
  resultEl?.classList.remove('show');
  startGame(rules.mode);
});
$('btn-menu')?.addEventListener('click', () => backToMenu());

loadoutButtonEl?.addEventListener('click', event => {
  event.stopPropagation();
  audio.playUiClick();
  setDeploymentOpen(true);
});
$('btn-deployment-cancel')?.addEventListener('click', event => {
  event.stopPropagation();
  audio.playUiClick();
  setDeploymentOpen(false, true);
});
$('btn-redeploy')?.addEventListener('click', event => {
  event.stopPropagation();
  audio.playUiClick();
  weapons.setPrimaryWeapon(selectedPrimary);
  weapons.resetLoadout();
  player.respawnImmediate();
  deathHint?.classList.remove('show');
  setDeploymentOpen(false, true);
});

document.addEventListener('click', () => {
  if (rules.isPlaying) audio.unlock();
});

document.addEventListener('keydown', event => {
  if (
    event.code === 'KeyM' &&
    !event.repeat &&
    rules.isPlaying
  ) {
    setDeploymentOpen(!deploymentOpen, deploymentOpen);
    return;
  }
  if (event.code === 'Escape' && deploymentOpen) {
    setDeploymentOpen(false);
    return;
  }
  if (event.code !== 'KeyF' || event.repeat || !rules.isPlaying) return;
  supplies.tryUseCrate(
    player.position,
    player.alive,
    () => weapons.refillAllAmmo(),
  );
});

function onPlayerDamaged(amount: number, fromPos?: THREE.Vector3) {
  if (!player.alive || !rules.isPlaying) return;
  player.takeDamage(amount, fromPos);
  if (player.alive) audio.playPlayerHurt();
}

const minimapEl = $('minimap') as HTMLCanvasElement | null;
const minimap = minimapEl ? new Minimap(minimapEl, mapFeatures, 168) : null;

function applyPixelSize() {
  const fullW = Math.max(1, window.innerWidth);
  const fullH = Math.max(1, window.innerHeight);
  pixel.setSize(fullW, fullH, runtimeScale);
  player.camera.aspect = fullW / fullH;
  player.camera.updateProjectionMatrix();
}

window.addEventListener('resize', applyPixelSize);
applyPixelSize();
buildLoadoutOptions();
setUiPlaying(false);

const clock = new THREE.Clock();
let frameCount = 0;
let fpsTime = 0;
let measuredFps = 60;
let hitMarkerCd = 0;
let squadHudCd = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (rules.phase === 'menu') {
    pixel.render(scene, player.camera);
    return;
  }

  if (deploymentOpen) {
    pixel.render(scene, player.camera);
    return;
  }

  rules.update(dt);
  player.update(dt);

  if (rules.isPlaying && player.alive) {
    weapons.update(dt, {
      yaw: player.yaw,
      pitch: player.pitch,
      applyRecoil: (p, y) => player.applyRecoil(p, y),
      setFov: f => player.setFov(f),
      setAdsSpeedMul: m => player.setAdsSpeedMul(m),
      moving: player.moving,
      sprinting: player.sprinting,
      grounded: player.grounded,
      airborne: player.airborne,
    });
    if (player.moving && player.grounded) {
      audio.playFootstep(player.sprinting, dt);
    }
  }

  if (rules.isPlaying) {
    combatants.update(
      dt,
      player.position,
      player.alive,
      obstacles,
      (x, z) => terrain.getHeight(x, z),
      mapBlockers,
      onPlayerDamaged,
    );
    supplies.update(
      dt,
      player.position,
      player.alive,
      () => weapons.addMagazineAmmo(),
    );
    interactionPromptEl?.classList.toggle(
      'show',
      supplies.canUseCrate(player.position, player.alive),
    );

    // 征服模式：票数 + 占领
    if (rules.mode === 'conquest') {
      const units: { x: number; z: number; team: 'blue' | 'red'; alive: boolean }[] = [
        {
          x: player.position.x,
          z: player.position.z,
          team: 'blue',
          alive: player.alive,
        },
      ];
      for (const unit of combatants.units) {
        if (!unit.active) continue;
        units.push({
          x: unit.pos.x,
          z: unit.pos.z,
          team: unit.faction === 'player' ? 'blue' : 'red',
          alive: unit.alive,
        });
      }

      const st = conquest.update(dt, units);
      updateConquestHud(st);

      // 死亡选点面板倒计时刷新
      if (spawnSelectOpen && !player.alive) {
        spawnRefreshCd -= dt;
        if (spawnRefreshCd <= 0) {
          spawnRefreshCd = 0.2;
          refreshSpawnOptions();
        }
      }

      // AI 复活点随占领点广布
      combatants.refreshConquestRespawns(
        conquest.getFactionSpawnAnchors('player'),
        conquest.getFactionSpawnAnchors('enemy'),
      );

      // 低频刷新前线订单；Manager 仅在战线变化时重新随机分配。
      if (Math.floor(rules.surviveTime) !== Math.floor(rules.surviveTime - dt)) {
        combatants.applyConquestOrders(
          conquest.getFrontlineObjectives('player'),
          conquest.getFrontlineObjectives('enemy'),
          player.position,
        );
      }

      if (st.winner === 'blue') {
        rules.setVictory();
        endMatch('victory');
      } else if (st.winner === 'red') {
        rules.setDefeat();
        endMatch('gameover');
      }
    }

    squadHudCd -= dt;
    if (squadHudCd <= 0) {
      squadHudCd = 0.25;
      updateSquadHud();
    }
  }

  effects.update(dt);
  pixel.render(scene, player.camera);

  if (minimap && rules.isPlaying) {
    const pts =
      rules.mode === 'conquest'
        ? conquest.getState(null).points
        : undefined;
    minimap.draw(player.position.x, player.position.z, player.yaw, pts);
  }

  if (crosshairEl) {
    const hm = weapons.getHitMarker() > 0 || hitMarkerActive;
    if (hm) {
      hitMarkerCd = 0.15;
      hitMarkerActive = false;
    }
    if (hitMarkerCd > 0) hitMarkerCd -= dt;
    crosshairEl.classList.toggle('hit', hitMarkerCd > 0);
  }
  if (adsSightEl) {
    adsSightEl.classList.toggle('hit', hitMarkerCd > 0);
  }

  if (timerEl && rules.isPlaying) {
    timerEl.textContent = rules.formatTime();
  }

  if (hurtEl) {
    const f = player.getHurtFlash();
    hurtEl.style.opacity = String(Math.min(0.35, f * 0.9));
  }
  const dirs = player.getHurtDirections();
  for (const key of ['front', 'right', 'back', 'left'] as const) {
    const el = dmgDirEls[key];
    if (el) el.style.opacity = String(Math.min(1, dirs[key] * 1.15));
  }

  frameCount++;
  fpsTime += dt;
  if (fpsTime >= 1) {
    measuredFps = frameCount;
    if (fpsEl) fpsEl.textContent = String(frameCount);
    frameCount = 0;
    fpsTime = 0;

    // 帧率低时略增大降采样（更糊的像素块换性能），高帧率收回
    let next = runtimeScale;
    if (measuredFps < 40 && runtimeScale < 3.2) next = Math.min(3.2, runtimeScale + 0.2);
    else if (measuredFps > 70 && runtimeScale > PIXEL_SCALE) next = Math.max(PIXEL_SCALE, runtimeScale - 0.15);
    if (Math.abs(next - runtimeScale) > 0.05) {
      runtimeScale = next;
      applyPixelSize();
    }
  }

  if (posEl) {
    const p = player.position;
    posEl.textContent = `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`;
  }
}

animate();

console.info('[PIXEL FRONT] pixel+ADS ready', {
  PIXEL_SCALE,
  ENABLE_DITHER,
});
