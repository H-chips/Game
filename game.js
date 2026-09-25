/* 合成神龙 —— 从蝌蚪一路合成进化成神龙的 H5 小游戏
 * 纯前端、零依赖，手机浏览器 / 微信内置浏览器直接打开即玩。
 */
(function () {
  'use strict';

  /* ============================ 基础工具 ============================ */
  var TAU = Math.PI * 2;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angLerp(a, b, t) {
    var d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a + d * t;
  }
  function hash2(ix, iy) {
    var h = (ix | 0) * 374761393 + (iy | 0) * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h >>> 0) / 4294967296;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  /* ============================ 生物图鉴 ============================
   * form  : 体型模板（决定建模方式）
   * c1/c2 : 背光 / 暗部主色      c3: 腹面亮色（做「白肚皮」体积感）
   * size  : 体长半径（世界坐标，绘制与碰撞都基于它）
   */
  var SPECIES = [
    { name: '蝌蚪',   form: 'tadpole',    c1: '#a9d86a', c2: '#4a8034', c3: '#eaf7c8', size: 16 },
    { name: '小虾',   form: 'shrimp',     c1: '#ff8f5e', c2: '#b8472c', c3: '#ffd6bb', size: 19 },
    { name: '泥鳅',   form: 'loach',      c1: '#cba25b', c2: '#6b4a1e', c3: '#f7e3ba', size: 23 },
    { name: '青蛙',   form: 'frog',       c1: '#4fd97a', c2: '#1c7a3d', c3: '#eafbd0', size: 27 },
    { name: '乌龟',   form: 'turtle',     c1: '#57c6bb', c2: '#1f5750', c3: '#7c4f22', size: 32 },
    { name: '金鱼',   form: 'fish',       c1: '#ffb62e', c2: '#c25c12', c3: '#ffe8a4', size: 37 },
    { name: '锦鲤',   form: 'koi',        c1: '#fff1ea', c2: '#e39a94', c3: '#ffffff', size: 43 },
    { name: '水蛇',   form: 'snake',      c1: '#7d5cf0', c2: '#241a63', c3: '#e6ddff', size: 49 },
    { name: '鳄鱼',   form: 'croco',      c1: '#7fae5c', c2: '#2c4a1a', c3: '#dcebc0', size: 56 },
    { name: '大鲵',   form: 'salamander', c1: '#b98a63', c2: '#5e3a1f', c3: '#f2e0c4', size: 63 },
    { name: '蛟龙',   form: 'jiaolong',   c1: '#38c8ff', c2: '#0f5c93', c3: '#e9fbff', size: 69, glow: 0.30 },
    { name: '神龙',   form: 'dragon',     c1: '#ffd34d', c2: '#a86b07', c3: '#fff7d2', size: 80, glow: 0.62 }
  ];

  var MAX_LEVEL = SPECIES.length - 1;
  var MERGE_NEED = 3;      // 集满 3 只同级 -> 进化一级
  var MAX_HEARTS = 3;
  var BASE_ENTITIES = 52;
  var SPAWN_MIN_R = 230;
  var SPAWN_MAX_R = 680;
  var DESPAWN_R = 1200;

  // 后期生物总数递减：越往后水域越「空旷」，靠的是威胁而不是数量堆难度
  function targetCount() {
    return Math.round(BASE_ENTITIES - 20 * (player.level / MAX_LEVEL));   // 46 → 26
  }
  // 刷怪半径随等级拉开，避免屏幕塞满；手机小屏视野被拉远，所以要同步外推，
  // 否则会出现「生物在眼前凭空冒出来」
  // 屏幕可视区域的外接圆半径（世界坐标）：刷怪必须在这个圈外，否则会当着玩家的面冒出来
  function viewR() { return Math.hypot(W, H) / 2 / baseZoom; }
  function spawnR() {
    // 只在小屏上外推；设上限，否则大屏会把生物推得太远、显得空旷（密度骤降）
    var vr = Math.min(viewR() * 1.05, 900);
    return [
      Math.max(SPAWN_MIN_R, vr) + player.level * 18,
      Math.max(SPAWN_MAX_R, vr + 260) + player.level * 46
    ];
  }
  function despawnR() {
    var sr = spawnR();
    return Math.max(DESPAWN_R, sr[1] * 1.5);
  }

  function radiusOf(lvl) { return SPECIES[lvl].size * 0.75; }
  function speedOfPlayer(lvl) { return 310 + lvl * 11; }   // 游动更爽快
  function speedOfCreature(lvl) { return 96 + lvl * 11; }  // 生物同步提速，保持追逐手感

  /* ============================ DOM ============================ */
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var elHud = document.getElementById('hud');
  var elChain = document.getElementById('chain');
  var elEndChain = document.getElementById('endChain');
  var elCurName = document.getElementById('curName');
  var elCurLv = document.getElementById('curLv');
  var elScore = document.getElementById('score');
  var elBarFill = document.getElementById('barFill');
  var elBarTxt = document.getElementById('barTxt');
  var elHearts = document.getElementById('hearts');
  var elTime = document.getElementById('time');
  var elTip = document.getElementById('tip');
  var elOverlay = document.getElementById('overlay');
  var elStartCard = document.getElementById('startCard');
  var elEndCard = document.getElementById('endCard');
  var elStartBtn = document.getElementById('startBtn');
  var elAgainBtn = document.getElementById('againBtn');
  var elStartBest = document.getElementById('startBest');
  var elEndTitle = document.getElementById('endTitle');
  var elEndSub = document.getElementById('endSub');
  var elEndLv = document.getElementById('endLv');
  var elEndScore = document.getElementById('endScore');
  var elEndTime = document.getElementById('endTime');
  var elMute = document.getElementById('muteBtn');

  /* ============================ 画面尺寸 ============================ */
  var W = 0, H = 0, DPR = 1, baseZoom = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 优先保证生物够大：小屏不缩小（1.0），大屏反而放大到 1.18
    baseZoom = clamp(Math.min(W, H) / 900, 1, 1.18);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 250); });
  // 手机地址栏收起 / 软键盘弹出时 visualViewport 会变，重算尺寸
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
  }
  window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  resize();

  /* ============================ 音效 ============================ */
  var actx = null, muted = false;
  function initAudio() {
    if (actx || muted) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { actx = new AC(); } catch (e) { actx = null; }
  }
  function tone(freq, dur, type, vol, slide) {
    if (muted) return;
    initAudio();
    if (!actx) return;
    if (actx.state === 'suspended' && actx.resume) actx.resume();
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, actx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), actx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, actx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur + 0.02);
  }
  var sfx = {
    eat: function (lvl) { tone(420 + lvl * 55, 0.12, 'triangle', 0.09); },
    evolve: function () { tone(520, 0.5, 'sawtooth', 0.10, 1300); tone(780, 0.45, 'sine', 0.07, 1600); },
    hurt: function () { tone(220, 0.28, 'square', 0.10, 90); },
    win: function () { tone(660, 0.6, 'sine', 0.10); setTimeout(function () { tone(990, 0.7, 'sine', 0.09); }, 140); },
    lose: function () { tone(300, 0.7, 'sine', 0.10, 80); }
  };
  elMute.addEventListener('click', function () {
    muted = !muted;
    elMute.textContent = muted ? '🔇' : '🔊';
    if (!muted) initAudio();
  });

  /* ============================ 输入 ============================ */
  // id 记录「当前是哪根手指在操控」，避免另一根手指抬起时把操控打断（断触）
  var input = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, kx: 0, ky: 0 };
  var STICK_R = 56;        // 摇杆满速半径（px）
  var DEAD_ZONE = 7;       // 死区，手指轻微抖动不算方向

  function touchById(list, id) {
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }
  function primaryTouch(e) {
    return (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
  }
  function onDown(e) {
    if (!state.running || input.active) return;   // 已有主手指时忽略后续手指
    var t = primaryTouch(e);
    if (!t || t.clientX == null) return;
    input.active = true;
    input.id = (t.identifier == null) ? 'mouse' : t.identifier;
    input.ox = t.clientX; input.oy = t.clientY;
    input.x = t.clientX; input.y = t.clientY;
    initAudio();
    if (elTip && !elTip.dataset.faded) {
      elTip.dataset.faded = '1';
      elTip.style.opacity = '0';
    }
  }
  function onMove(e) {
    if (!input.active) return;
    var t;
    if (e.touches) {
      t = touchById(e.touches, input.id);
      if (!t) return;                    // 不是操控中的那根手指，忽略
    } else if (input.id === 'mouse') {
      t = e;
    } else return;
    input.x = t.clientX; input.y = t.clientY;
    // 摇杆底盘跟着手指走：手指滑到屏幕边缘也不会失控
    var dx = input.x - input.ox, dy = input.y - input.oy;
    var m = Math.sqrt(dx * dx + dy * dy);
    if (m > STICK_R) {
      input.ox = input.x - dx / m * STICK_R;
      input.oy = input.y - dy / m * STICK_R;
    }
  }
  function release() { input.active = false; input.id = null; }
  function onUp(e) {
    if (!input.active) return;
    if (e && e.changedTouches) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === input.id) { release(); return; }
      }
      return;                            // 抬起的是别的手指，继续操控
    }
    release();
  }

  window.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onUp, { passive: true });
  window.addEventListener('touchcancel', onUp, { passive: true });
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  // 切后台 / 失焦 / 来电话时松开操控，回来不会自己一直游
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', function () { if (document.hidden) release(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.kx = -1;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.kx = 1;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') input.ky = -1;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') input.ky = 1;
    else return;
    e.preventDefault();
    initAudio();
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D') input.kx = 0;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'ArrowDown' || k === 's' || k === 'S') input.ky = 0;
  });

  function readDir() {
    var dx = 0, dy = 0;
    if (input.active) {
      var mx = input.x - input.ox, my = input.y - input.oy;
      var m = Math.sqrt(mx * mx + my * my);
      if (m > DEAD_ZONE) {
        var k = Math.min(m, STICK_R) / STICK_R;   // 推得越远越快，56px 即满速
        dx = mx / m * k; dy = my / m * k;
      }
    }
    if (input.kx || input.ky) {
      var km = Math.sqrt(input.kx * input.kx + input.ky * input.ky) || 1;
      dx = input.kx / km; dy = input.ky / km;
    }
    return { x: dx, y: dy };
  }

  /* ============================ 游戏状态 ============================ */
  var state = {
    running: false, finished: false, won: false,
    time: 0, t: 0, score: 0,
    shake: 0, zoomPunch: 1, flash: 0, flashColor: '255,255,255'
  };

  var cam = { x: 0, y: 0 };
  var player = {
    x: 0, y: 0, vx: 0, vy: 0, ang: 0,
    level: 0, progress: 0, hearts: MAX_HEARTS, invuln: 0, seed: 0
  };
  var entities = [];
  var particles = [];
  var popups = [];
  var waves = [];
  var swallows = [];

  /* ============================ 生成生物 ============================ */
  // 等级分布：绝大多数是「可吃」的同级 / 低级，危险生物随等级升高而变多
  // 后期「送上门的同级食物」变少，危险生物增多
  function pickLevel() {
    var base = player.level;
    var dangerP = clamp(0.06 + base * 0.03, 0, 0.38);
    var lvl;
    if (Math.random() < dangerP) {
      lvl = base + (Math.random() < 0.68 ? 1 : 2);   // 比你高一级 / 两级
    } else {
      var rel = [-3, -2, -2, -1, -1, 0, 0, 0, 0];    // 同级最多，低级也有
      // 越到后期，把越多的「同级食物」换成低一级，逼玩家自己去找同级
      var drop = base > 2 ? Math.round(base / MAX_LEVEL * 2) : 0;
      for (var k = 0; k < drop; k++) rel[4 + k] = -1;
      lvl = base + rel[(Math.random() * rel.length) | 0];
    }
    return clamp(lvl, 0, MAX_LEVEL);
  }
  // 高阶生物有多大概率是「会主动猎你的捕食者」
  function huntChance() { return clamp(0.3 + player.level * 0.065, 0, 0.9); }

  function spawnEntity() {
    var a = Math.random() * TAU;
    var sr = spawnR();
    var r = rand(sr[0], sr[1]);
    var lvl = pickLevel();
    ensureSprite(lvl);
    entities.push({
      x: player.x + Math.cos(a) * r,
      y: player.y + Math.sin(a) * r,
      level: lvl,
      ang: Math.random() * TAU,
      wa: Math.random() * TAU,
      wt: rand(0.6, 2.4),
      seed: Math.random() * 10,
      dead: false,
      hunt: lvl > player.level ? Math.random() < huntChance() : false,
      dash: 0, dashCd: rand(1.2, 3.2), agro: rand(0.5, 2.5)
    });
  }

  function spawnBurst(n) { for (var i = 0; i < n; i++) spawnEntity(); }

  /* ============================ 特效 ============================ */
  function burst(x, y, color, n, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = rand(40, 200) * (power || 1);
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: rand(2, 6), life: rand(0.35, 0.8), max: 0.8, color: color
      });
    }
  }
  function wave(x, y, maxR, color, rays, life) {
    waves.push({
      x: x, y: y, r: maxR * 0.15, max: maxR,
      life: life || 0.55, maxLife: life || 0.55,
      color: color, rays: rays || 0, spin: Math.random() * TAU
    });
  }
  function popup(x, y, text, color, size) {
    popups.push({ x: x, y: y, text: text, color: color, size: size || 18, life: 1.1, max: 1.1 });
  }
  // 气泡 / 涟漪尾迹
  function trailBubble(x, y, r, vx, vy, life, color) {
    particles.push({
      x: x, y: y, vx: vx || 0, vy: vy || -rand(20, 55),
      r: r, life: life, max: life, color: color || 'rgba(210,240,255,0.75)', ring: true
    });
  }

  /* ============================ 核心玩法 ============================ */
  function absorb(e) {
    // 3 只低一级 == 1 只同级，合成链条自洽
    var gain = Math.pow(1 / 3, player.level - e.level);
    player.progress += gain;
    state.score += Math.round((e.level + 1) * 20 * gain * 3);
    burst(e.x, e.y, SPECIES[e.level].c1, 10, 0.9);
    wave(e.x, e.y, SPECIES[e.level].size * 2.2, SPECIES[e.level].c1);
    popup(e.x, e.y - SPECIES[e.level].size, '+' + (gain >= 1 ? '1' : gain.toFixed(2)), '#7ef7d1', 15);
    sfx.eat(e.level);
    e.dead = true;
    // 被吞的小家伙旋进玩家嘴里
    swallows.push({
      x: e.x, y: e.y, ang: e.ang, level: e.level,
      ph: state.t * 1.05 + e.seed, life: 0.32, max: 0.32
    });
    checkEvolve();
  }

  function checkEvolve() {
    while (player.progress >= MERGE_NEED - 1e-6 && player.level < MAX_LEVEL) {
      player.level++;
      player.progress -= MERGE_NEED;
      onEvolve();
    }
  }

  function onEvolve() {
    var sp = SPECIES[player.level];
    state.zoomPunch = 1.14;
    state.flash = 0.45;
    state.flashColor = '255,255,255';
    wave(player.x, player.y, sp.size * 6, sp.c1);
    burst(player.x, player.y, sp.c1, 30, 1.6);
    popup(player.x, player.y - sp.size * 1.6, '进化 · ' + sp.name, sp.c1, 22);
    sfx.evolve();
    renderChain(player.level);
    ensureNearbySprites();

    // 进化特效：多层光环 + 放射光柱 + 火星
    wave(player.x, player.y, sp.size * 7, sp.c1, 14, 0.8);
    wave(player.x, player.y, sp.size * 4.6, '#ffffff', 0, 0.5);
    wave(player.x, player.y, sp.size * 10, sp.c3, 0, 1.0);
    burst(player.x, player.y, sp.c1, 34, 1.8);
    burst(player.x, player.y, '#ffffff', 16, 2.4);
    for (var b = 0; b < 14; b++) {
      trailBubble(player.x + rand(-sp.size, sp.size), player.y + rand(-sp.size, sp.size),
        rand(3, 8), rand(-30, 30), rand(-70, -20), rand(0.6, 1.1));
    }
    // 每进化一级回复 1 颗心（上限 3）
    if (player.hearts < MAX_HEARTS) {
      player.hearts++;
      popup(player.x, player.y - sp.size * 2.4, '+1 ❤', '#ff9db0', 16);
    }
    // 进化后刷新一圈周围生物，保证附近总有可吃的同级
    for (var i = entities.length - 1; i >= 0; i--) {
      var d = Math.hypot(entities[i].x - player.x, entities[i].y - player.y);
      if (d > SPAWN_MIN_R * 0.9) entities.splice(i, 1);
    }
    if (player.level >= MAX_LEVEL) win();
  }

  function hurt(e) {
    player.hearts--;
    player.invuln = 1.5;
    player.progress = Math.max(0, player.progress - 1);
    state.shake = 14;
    state.flash = 0.4;
    state.flashColor = '255,80,80';
    var dx = player.x - e.x, dy = player.y - e.y;
    var m = Math.hypot(dx, dy) || 1;
    player.vx += dx / m * 320;
    player.vy += dy / m * 320;
    burst(player.x, player.y, '#ff6b6b', 16, 1.2);
    popup(player.x, player.y - SPECIES[player.level].size, '-1 ❤', '#ff6b6b', 17);
    sfx.hurt();
    if (player.hearts <= 0) lose();
  }

  /* ============================ 每帧更新 ============================ */
  function update(dt) {
    state.t += dt;
    var i, e;

    if (state.running && !state.finished) {
      state.time += dt;
      var d = readDir();
      var sp = speedOfPlayer(player.level);
      player.vx = lerp(player.vx, d.x * sp, clamp(dt * 14, 0, 1));
      player.vy = lerp(player.vy, d.y * sp, clamp(dt * 14, 0, 1));
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      if (Math.hypot(player.vx, player.vy) > 8) {
        player.ang = angLerp(player.ang, Math.atan2(player.vy, player.vx), clamp(dt * 10, 0, 1));
      }
      if (player.invuln > 0) player.invuln -= dt;

      // 游动尾迹：气泡 + 涟漪
      player.trail = (player.trail || 0) - dt;
      if (player.trail <= 0 && Math.hypot(player.vx, player.vy) > 40) {
        player.trail = 0.075;
        var pr2 = radiusOf(player.level);
        var bx = player.x - Math.cos(player.ang) * pr2 * 0.9;
        var by = player.y - Math.sin(player.ang) * pr2 * 0.9;
        trailBubble(bx + rand(-4, 4), by + rand(-4, 4), rand(1.5, 4), rand(-18, 18), rand(-46, -16), rand(0.5, 0.95));
        if (Math.random() < 0.35) {
          particles.push({
            x: bx, y: by, vx: rand(-8, 8), vy: rand(-8, 8),
            r: pr2 * 0.5, life: 0.7, max: 0.7, color: SPECIES[player.level].c1, ring: true
          });
        }
      }

      // 生物 AI
      for (i = 0; i < entities.length; i++) {
        e = entities[i];
        var dx = player.x - e.x, dy = player.y - e.y;
        var dist = Math.hypot(dx, dy);
        var cs = speedOfCreature(e.level);
        if (e.hunt && dist < 520) {
          // 捕食者：锁定并持续追击，冷不丁来一记短突进
          if (e.dash > 0) e.dash -= dt;
          e.dashCd -= dt;
          if (e.dash <= 0 && e.dashCd <= 0 && dist < 320) {
            e.dash = 0.42;
            e.dashCd = rand(1.6, 3.2);
            wave(e.x, e.y, radiusOf(e.level) * 2.2, '#ff8f8f');
          }
          var hs2 = cs * (e.dash > 0 ? 2.6 : 1.05);
          e.x += dx / (dist || 1) * hs2 * dt;
          e.y += dy / (dist || 1) * hs2 * dt;
          e.ang = angLerp(e.ang, Math.atan2(dy, dx), clamp(dt * (e.dash > 0 ? 9 : 5), 0, 1));
        } else if (e.level > player.level && dist < 240) {
          // 非捕食者的高阶生物也会在近距离缓慢逼近
          e.x += dx / (dist || 1) * cs * 0.5 * dt;
          e.y += dy / (dist || 1) * cs * 0.5 * dt;
          e.ang = angLerp(e.ang, Math.atan2(dy, dx), clamp(dt * 3, 0, 1));
        } else {
          e.wt -= dt;
          if (e.wt <= 0) { e.wt = rand(1.2, 3.2); e.wa = rand(0, TAU); }
          e.x += Math.cos(e.wa) * cs * dt;
          e.y += Math.sin(e.wa) * cs * dt;
          e.ang = angLerp(e.ang, Math.atan2(Math.sin(e.wa), Math.cos(e.wa)), clamp(dt * 3, 0, 1));
        }
      }

      // 碰撞
      var pr = radiusOf(player.level);
      for (i = 0; i < entities.length; i++) {
        e = entities[i];
        if (e.dead) continue;
        var ddx = e.x - player.x, ddy = e.y - player.y;
        var dd = Math.hypot(ddx, ddy);
        if (dd > pr + radiusOf(e.level)) continue;
        if (e.level <= player.level) {
          absorb(e);
        } else if (player.invuln <= 0) {
          hurt(e);
        }
      }

      // 清理 + 补充
      for (i = entities.length - 1; i >= 0; i--) {
        e = entities[i];
        if (e.dead || Math.hypot(e.x - player.x, e.y - player.y) > despawnR()) entities.splice(i, 1);
      }
      var need = targetCount() - entities.length;
      if (need > 0) spawnBurst(Math.min(need, 4));
    }

    // 相机
    cam.x = lerp(cam.x, player.x, clamp(dt * 11, 0, 1));
    cam.y = lerp(cam.y, player.y, clamp(dt * 11, 0, 1));

    state.shake = Math.max(0, state.shake - dt * 40);
    state.zoomPunch = lerp(state.zoomPunch, 1, clamp(dt * 5, 0, 1));
    state.flash = Math.max(0, state.flash - dt * 1.6);

    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (i = waves.length - 1; i >= 0; i--) {
      var w = waves[i];
      w.life -= dt;
      w.r = lerp(w.r, w.max, clamp(dt * 5, 0, 1));
      if (w.life <= 0) waves.splice(i, 1);
    }
    for (i = popups.length - 1; i >= 0; i--) {
      var u = popups[i];
      u.life -= dt;
      u.y -= dt * 34;
      if (u.life <= 0) popups.splice(i, 1);
    }
    for (i = swallows.length - 1; i >= 0; i--) {
      swallows[i].life -= dt;
      if (swallows[i].life <= 0) swallows.splice(i, 1);
    }

    syncHud();
  }

  /* ============================ 美术：颜色工具 ============================ */
  function hex2rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbCss(r, g, b, a) {
    return 'rgba(' + clamp(r | 0, 0, 255) + ',' + clamp(g | 0, 0, 255) + ',' +
      clamp(b | 0, 0, 255) + ',' + (a == null ? 1 : a) + ')';
  }
  function mixHex(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return rgbCss(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, 1);
  }
  function lit(c, t) { return mixHex(c, '#ffffff', clamp(t, 0, 1)); }
  function dk(c, t) { return mixHex(c, '#000000', clamp(t, 0, 1)); }
  function alp(c, a) {
    if (String(c).charAt(0) !== '#') {
      var i = String(c).lastIndexOf(',');
      return String(c).slice(0, i + 1) + a + ')';
    }
    var A = hex2rgb(c);
    return rgbCss(A[0], A[1], A[2], a);
  }
  // 确定性随机：保证每帧精灵上的花纹位置一致，不会闪烁
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ============================ 美术：生物建模 ============================
   * 建模方式：所有生物都用「脊线 spine + 宽度剖面 profile」生成一条连续封闭路径，
   * 比原先叠加椭圆的做法轮廓自然得多，而且可以统一做：
   * 渐变上色 / 背部高光 / 腹面提亮 / 底部暗部 / 描边 / 鳞片 / 鳍 / 四肢。
   */
  function crAt(p, s) {   // Catmull-Rom 插值宽度剖面
    var n = p.length - 1;
    var x = clamp(s, 0, 1) * n;
    var i = Math.min(n - 1, Math.floor(x));
    var t = x - i;
    var p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n, i + 2)];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }
  function buildBody(fn, n) {
    n = n || 32;
    var P = [], i;
    for (i = 0; i <= n; i++) P.push(fn(i / n));
    var up = [], dn = [], nrm = [];
    for (i = 0; i <= n; i++) {
      var a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)];
      var dx = b.x - a.x, dy = b.y - a.y;
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = dy / L, ny = -dx / L;          // 指向「背部」
      nrm.push([nx, ny]);
      var w = Math.max(0.01, P[i].w);
      up.push([P[i].x + nx * w, P[i].y + ny * w]);
      dn.push([P[i].x - nx * w, P[i].y - ny * w]);
    }
    return { pts: P, up: up, dn: dn, nrm: nrm, n: n };
  }
  function trBody(g, B) {
    var i;
    g.beginPath();
    g.moveTo(B.up[0][0], B.up[0][1]);
    for (i = 1; i <= B.n; i++) g.lineTo(B.up[i][0], B.up[i][1]);
    for (i = B.n; i >= 0; i--) g.lineTo(B.dn[i][0], B.dn[i][1]);
    g.closePath();
  }
  function softBlob(g, x, y, rx, ry, col, a) {   // 柔和椭圆光斑：做高光/暗部
    if (!(rx > 0.05) || !(ry > 0.05)) return;
    g.save();
    g.translate(x, y);
    g.scale(1, Math.max(0.05, ry / rx));
    var r0 = Math.max(0.2, rx);
    var rg = g.createRadialGradient(0, 0, 0, 0, 0, r0);
    rg.addColorStop(0, alp(col, a));
    rg.addColorStop(1, alp(col, 0));
    g.fillStyle = rg;
    g.beginPath(); g.arc(0, 0, r0, 0, TAU); g.fill();
    g.restore();
  }
  // 体积上色：底色渐变 + 背部高光 + 腹面提亮 + 底部暗部 + 描边
  function paintVolume(g, B, sp, o) {
    o = o || {};
    var ry = o.ry, rx = o.rx, gh = o.gh == null ? 1.12 : o.gh;
    trBody(g, B);
    var gr = g.createLinearGradient(0, -ry * gh, 0, ry * gh);
    gr.addColorStop(0, lit(sp.c1, o.hi == null ? 0.3 : o.hi));
    gr.addColorStop(0.44, sp.c1);
    gr.addColorStop(1, sp.c2);
    g.fillStyle = gr;
    g.fill();
    g.save();
    trBody(g, B); g.clip();
    softBlob(g, -rx * 0.08, -ry * 0.52, rx * 0.88, ry * 0.46, '#ffffff', 0.24);
    softBlob(g, rx * 0.05, ry * 0.8, rx * 0.95, ry * 0.5, sp.c3, 0.42);
    softBlob(g, 0, ry * 1.0, rx * 1.0, ry * 0.42, '#001018', 0.26);
    if (o.extra) o.extra(g);
    g.restore();
    trBody(g, B);
    g.strokeStyle = alp(dk(sp.c2, 0.45), 0.5);
    g.lineWidth = Math.max(0.8, ry * 0.09);
    g.stroke();
  }
  function paintEye(g, x, y, r, iris, o) {
    o = o || {};
    g.fillStyle = '#f6fbff';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = iris;
    g.beginPath(); g.arc(x + r * 0.2, y, r * (o.irisR || 0.74), 0, TAU); g.fill();
    g.fillStyle = '#0d131c';
    var pw = r * (o.slit ? 0.15 : 0.36), ph2 = r * (o.slit ? 0.78 : 0.36);
    g.beginPath(); g.ellipse(x + r * 0.2, y, pw, ph2, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(x + r * 0.02, y - r * 0.38, r * 0.26, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(10,22,34,0.32)';
    g.lineWidth = Math.max(0.7, r * 0.15);
    g.beginPath(); g.arc(x, y, r * 0.98, 0, TAU); g.stroke();
  }
  function paintFin(g, o) {   // 半透明鳍：自带鳍条
    g.save();
    g.translate(o.x, o.y);
    g.rotate(o.ang);
    var L = o.len, Wd = o.wid, bd = o.bend || 0;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(L * 0.45, bd * L * 0.5 - Wd * 0.6, L, bd * L * 0.95 - Wd * 0.1);
    g.quadraticCurveTo(L * 0.55, bd * L * 0.2 + Wd * 0.4, 0, Wd * 0.28);
    g.closePath();
    var gr = g.createLinearGradient(0, 0, L, 0);
    gr.addColorStop(0, alp(o.col, o.alpha));
    gr.addColorStop(1, alp(lit(o.col, 0.4), o.alpha * 0.3));
    g.fillStyle = gr;
    g.fill();
    if (o.rays) {
      g.strokeStyle = alp(dk(o.col, 0.3), o.alpha * 0.45);
      g.lineWidth = Math.max(0.6, Wd * 0.05);
      for (var i = 1; i <= o.rays; i++) {
        var t = i / (o.rays + 1);
        g.beginPath();
        g.moveTo(0, Wd * 0.14);
        g.quadraticCurveTo(L * 0.5, bd * L * 0.3, L * (0.72 + t * 0.28), bd * L * 0.9 - Wd * (0.05 + t * 0.55));
        g.stroke();
      }
    }
    g.restore();
  }
  function paintLimb(g, o) {   // 四肢：可选蹼 / 爪
    g.save();
    g.translate(o.x, o.y);
    g.rotate(o.ang);
    g.fillStyle = o.col;
    g.beginPath(); g.ellipse(o.len * 0.42, 0, o.len * 0.5, o.wid, 0, 0, TAU); g.fill();
    if (o.web) {
      g.fillStyle = alp(o.col, 0.85);
      g.beginPath();
      g.moveTo(o.len * 0.72, 0);
      g.lineTo(o.len * 1.42, -o.wid * 2.1);
      g.lineTo(o.len * 1.18, 0);
      g.lineTo(o.len * 1.42, o.wid * 2.1);
      g.closePath(); g.fill();
    } else if (o.claw) {
      var cn = o.clawN || 3;
      var half = (cn - 1) / 2;
      for (var i = -half; i <= half; i++) {
        var fi = half ? i / half : 0;
        g.fillStyle = o.claw;
        g.beginPath();
        g.moveTo(o.len * 0.86, fi * o.wid * 0.45);
        g.lineTo(o.len * 1.34, fi * o.wid * 1.45);
        g.lineTo(o.len * 0.96, fi * o.wid * 1.05);
        g.closePath(); g.fill();
      }
    }
    g.restore();
  }
  function finRibbon(g, B, hFn, col, a) {   // 沿脊线的连续背鳍
    var i, h, ox, oy;
    g.beginPath();
    g.moveTo(B.up[0][0], B.up[0][1]);
    for (i = 1; i <= B.n; i++) g.lineTo(B.up[i][0], B.up[i][1]);
    for (i = B.n; i >= 0; i--) {
      h = Math.max(0, hFn(i / B.n)) * B.pts[i].w;
      ox = B.pts[i].x + B.nrm[i][0] * (B.pts[i].w + h);
      oy = B.pts[i].y + B.nrm[i][1] * (B.pts[i].w + h);
      g.lineTo(ox, oy);
    }
    g.closePath();
    g.fillStyle = col;
    if (a != null) g.globalAlpha = a;
    g.fill();
    if (a != null) g.globalAlpha = 1;
  }

  /* ---------------- 蝌蚪 ---------------- */
  function paintTadpole(g, sp, ph) {
    var rx = sp.size, ry = rx * 0.7;
    var sw = Math.sin(TAU * ph);
    var B = buildBody(function (s) {
      var x = -rx * 2.0 + rx * 2.9 * s;
      var tail = Math.pow(clamp(1 - s, 0, 1), 1.7);
      return { x: x, y: sw * rx * 0.26 * tail, w: ry * crAt([0.02, 0.05, 0.14, 0.38, 0.72, 0.96, 1.0, 0.84, 0.48], s) };
    }, 36);
    trBody(g, B);
    var gr = g.createLinearGradient(-rx * 2, 0, rx * 0.7, 0);
    gr.addColorStop(0, alp(sp.c2, 0.3));
    gr.addColorStop(0.42, alp(sp.c1, 0.88));
    gr.addColorStop(1, sp.c1);
    g.fillStyle = gr; g.fill();
    g.save();
    trBody(g, B); g.clip();
    softBlob(g, rx * 0.34, -ry * 0.5, rx * 0.55, ry * 0.4, '#ffffff', 0.3);
    softBlob(g, rx * 0.3, ry * 0.62, rx * 0.72, ry * 0.45, sp.c3, 0.38);
    g.strokeStyle = alp(sp.c2, 0.3);
    g.lineWidth = Math.max(0.6, rx * 0.04);
    g.beginPath();
    g.moveTo(-rx * 1.95, sw * rx * 0.22);
    g.quadraticCurveTo(-rx * 0.6, sw * rx * 0.08, rx * 0.3, 0);
    g.stroke();
    g.restore();
    trBody(g, B);
    g.strokeStyle = alp(dk(sp.c2, 0.35), 0.4);
    g.lineWidth = Math.max(0.7, rx * 0.055); g.stroke();
    paintEye(g, rx * 0.46, -ry * 0.44, Math.max(1.5, rx * 0.15), '#37422c');
    paintEye(g, rx * 0.46, ry * 0.44, Math.max(1.5, rx * 0.15), '#37422c');
    g.strokeStyle = alp(dk(sp.c2, 0.3), 0.5);
    g.lineWidth = Math.max(0.7, rx * 0.05);
    g.beginPath(); g.moveTo(rx * 0.8, -ry * 0.14); g.quadraticCurveTo(rx, 0, rx * 0.8, ry * 0.14); g.stroke();
  }

  /* ---------------- 小虾 ---------------- */
  function paintShrimp(g, sp, ph) {
    var rx = sp.size, ry = rx * 0.62;
    var sw = Math.sin(TAU * ph);
    var sg, i;
    g.strokeStyle = alp(sp.c1, 0.7);
    g.lineWidth = Math.max(0.7, rx * 0.045);
    g.lineCap = 'round';
    for (sg = -1; sg <= 1; sg += 2) {
      g.beginPath();
      g.moveTo(rx * 0.86, sg * ry * 0.4);
      g.quadraticCurveTo(rx * 1.75, sg * ry * (1.1 + sw * 0.3), rx * 2.2, sg * ry * (0.25 + sw * 0.5));
      g.stroke();
    }
    paintFin(g, { x: -rx * 1.1, y: sw * rx * 0.1, len: rx * 0.85, wid: ry * 1.5, ang: Math.PI + sw * 0.3, col: sp.c1, alpha: 0.6, rays: 4, bend: sw * 0.4 });
    paintFin(g, { x: -rx * 1.1, y: sw * rx * 0.1, len: rx * 0.75, wid: ry * 1.2, ang: Math.PI * 0.8 + sw * 0.3, col: sp.c1, alpha: 0.5, rays: 3, bend: sw * 0.4 });
    paintFin(g, { x: -rx * 1.1, y: sw * rx * 0.1, len: rx * 0.75, wid: ry * 1.2, ang: Math.PI * 1.2 + sw * 0.3, col: sp.c1, alpha: 0.5, rays: 3, bend: -sw * 0.4 });
    var B = buildBody(function (s) {
      var x = -rx * 1.15 + rx * 2.05 * s;
      var arch = Math.sin(Math.PI * clamp(s, 0, 1)) * ry * 0.55;
      return { x: x, y: -arch + sw * rx * 0.1 * (1 - s), w: ry * crAt([0.26, 0.5, 0.75, 0.92, 1.0, 0.96, 0.8, 0.6, 0.4], s) };
    }, 32);
    for (i = 0; i < 5; i++) {   // 步足
      var aa = 0.62 - i * 0.13;
      var ii = Math.round(aa * B.n), P = B.pts[ii], N = B.nrm[ii], side;
      for (side = -1; side <= 1; side += 2) {
        g.strokeStyle = alp(dk(sp.c1, 0.2), 0.75);
        g.lineWidth = Math.max(0.6, rx * 0.05);
        g.beginPath();
        g.moveTo(P.x - N[0] * P.w * 0.5 * side, P.y - N[1] * P.w * 0.5 * side);
        g.lineTo(P.x - N[0] * (P.w + ry * 0.5) * side, P.y - N[1] * (P.w + ry * 0.5) * side + rx * 0.1);
        g.stroke();
      }
    }
    paintVolume(g, B, sp, {
      rx: rx, ry: ry,
      extra: function (gg) {
        for (var k = 1; k <= 6; k++) {   // 体节
          var idx = Math.round((1 - k / 7) * B.n), PP = B.pts[idx], NN = B.nrm[idx];
          gg.strokeStyle = alp(dk(sp.c2, 0.15), 0.3);
          gg.lineWidth = Math.max(0.6, rx * 0.045);
          gg.beginPath();
          gg.moveTo(PP.x + NN[0] * PP.w, PP.y + NN[1] * PP.w);
          gg.lineTo(PP.x - NN[0] * PP.w, PP.y - NN[1] * PP.w);
          gg.stroke();
        }
        softBlob(gg, rx * 0.1, -ry * 0.35, rx * 0.8, ry * 0.35, '#ffffff', 0.22);
      }
    });
    for (sg = -1; sg <= 1; sg += 2) {   // 眼柄
      g.strokeStyle = alp(dk(sp.c1, 0.1), 0.9);
      g.lineWidth = Math.max(0.8, rx * 0.06);
      g.beginPath();
      g.moveTo(rx * 0.72, sg * ry * 0.3);
      g.lineTo(rx * 0.9, sg * ry * 0.72);
      g.stroke();
      paintEye(g, rx * 0.94, sg * ry * 0.8, Math.max(1.4, rx * 0.14), '#25304a');
    }
  }

  /* ---------------- 蛇形通用：泥鳅 / 水蛇 / 蛟龙 / 神龙 ---------------- */
  function paintSerpent(g, sp, ph, o) {
    var rx = sp.size, ry = rx * (o.thick || 0.6);   // 粗细是最大的辨识度
    var back = o.back, wav = o.wav || 2.0, amp = o.amp;
    var B = buildBody(function (s) {
      var x = -rx * back + rx * (1 + back) * s;
      var y = Math.sin(TAU * (ph - s * wav)) * ry * amp * Math.pow(clamp(1 - s, 0, 1), 0.85);
      return { x: x, y: y, w: ry * crAt(o.prof, s) };
    }, o.n || 42);
    var k, PP, NN;
    // 鳍（身体之后画）
    if (o.backFin) {
      finRibbon(g, B, function (s) { return o.backFin * Math.pow(clamp(1 - s, 0, 1), 0.7); }, alp(o.finC || sp.c1, 0.55), 1);
    }
    if (o.bellyFin) {
      finRibbon(g, B, function (s) { return o.bellyFin * Math.pow(clamp(1 - s, 0, 1), 0.7); }, alp(o.finC || sp.c1, 0.5), 1);
    }
    // 四肢
    if (o.legs) {
      for (k = 0; k < o.legs.at.length; k++) {
        var idx0 = Math.round(o.legs.at[k] * B.n);
        PP = B.pts[idx0]; NN = B.nrm[idx0];
        for (var sd = -1; sd <= 1; sd += 2) {
          g.save();
          g.translate(PP.x, PP.y);
          g.rotate(Math.atan2(NN[1] * sd, NN[0] * sd));
          paintLimb(g, {
            x: 0, y: 0, ang: sd > 0 ? -0.5 : 0.5, len: o.legs.len, wid: o.legs.wid,
            col: dk(sp.c1, 0.16), claw: o.legs.claw || null, clawN: o.legs.clawN || 3
          });
          g.restore();
        }
      }
    }
    // 尾鳍
    if (o.tailFin) {
      paintFin(g, { x: B.pts[0].x, y: B.pts[0].y, len: rx * 0.7, wid: ry * 1.3, ang: Math.PI + 0.25, col: o.finC || sp.c1, alpha: 0.6, rays: 3 });
      paintFin(g, { x: B.pts[0].x, y: B.pts[0].y, len: rx * 0.7, wid: ry * 1.3, ang: Math.PI - 0.25, col: o.finC || sp.c1, alpha: 0.6, rays: 3 });
    }
    // 身体
    paintVolume(g, B, sp, {
      rx: rx, ry: ry, gh: 1.05,
      extra: function (gg) {
        var kk;
        if (o.spikes) {   // 背脊尖刺
          for (kk = 3; kk < B.n - 2; kk += 3) {
            var s2 = kk / B.n;
            PP = B.pts[kk]; NN = B.nrm[kk];
            var hh = PP.w * o.spikes * Math.sin(Math.PI * clamp(s2 * 1.1, 0, 1));
            gg.fillStyle = alp(o.spikeC || sp.c3, 0.9);
            gg.beginPath();
            gg.moveTo(PP.x + NN[0] * PP.w - PP.w * 0.4, PP.y + NN[1] * PP.w);
            gg.lineTo(PP.x + NN[0] * (PP.w + hh) + PP.w * 0.15, PP.y + NN[1] * (PP.w + hh));
            gg.lineTo(PP.x + NN[0] * PP.w + PP.w * 0.4, PP.y + NN[1] * PP.w);
            gg.closePath(); gg.fill();
          }
        }
        if (o.belly) {    // 腹面亮带
          gg.beginPath();
          for (kk = 0; kk <= B.n; kk++) {
            PP = B.pts[kk];
            var yy = PP.y + PP.w * 0.42;
            if (kk) gg.lineTo(PP.x, yy); else gg.moveTo(PP.x, yy);
          }
          gg.strokeStyle = alp(sp.c3, o.belly);
          gg.lineWidth = Math.max(1, ry * 0.42);
          gg.lineJoin = 'round';
          gg.stroke();
        }
        if (o.bands) {    // 横向环形斑纹（水蛇用亮色环纹）
          for (kk = 0; kk < o.bands[0]; kk++) {
            var bs = (kk + 0.7) / (o.bands[0] + 0.7);
            var bi = Math.round(bs * B.n);
            PP = B.pts[bi]; NN = B.nrm[bi];
            gg.strokeStyle = alp(o.bands[1], o.bands[2]);
            gg.lineWidth = Math.max(1, PP.w * o.bands[3]);
            gg.beginPath();
            gg.moveTo(PP.x + NN[0] * PP.w * 1.05, PP.y + NN[1] * PP.w * 1.05);
            gg.lineTo(PP.x - NN[0] * PP.w * 1.05, PP.y - NN[1] * PP.w * 1.05);
            gg.stroke();
          }
        }
        if (o.pattern) {  // 斑纹 / 鳞纹
          var R = rng(9137 + Math.round(sp.size));
          for (kk = 0; kk < o.pattern[0]; kk++) {
            var px = -rx * back * 0.9 + R() * rx * (1.5 + back);
            var py = -ry * 0.7 + R() * ry * 1.4;
            var pr = rx * (o.pattern[1] + R() * o.pattern[1]);
            gg.fillStyle = alp(o.pattern[2], o.pattern[3]);
            gg.beginPath();
            gg.ellipse(px, py, pr, pr * (0.5 + R() * 0.6), R() * TAU, 0, TAU);
            gg.fill();
          }
        }
        softBlob(gg, rx * 0.1, -ry * 0.5, rx, ry * 0.4, '#ffffff', 0.2);
      }
    });
    // 头部：鬃毛 / 龙须 / 龙角 / 龙珠 / 眼睛
    var iH = B.n - 3, PH = B.pts[iH];
    if (o.mane) {
      for (k = 0; k < 5; k++) {
        var mi = Math.round((0.86 - k * 0.07) * B.n);
        PP = B.pts[mi]; NN = B.nrm[mi];
        g.save();
        g.translate(PP.x, PP.y);
        g.rotate(Math.atan2(NN[1], NN[0]));
        paintFin(g, { x: 0, y: 0, len: rx * (0.5 - k * 0.05), wid: ry * 0.5, ang: Math.PI + (k - 2) * 0.32, col: o.mane, alpha: 0.75, rays: 2 });
        g.restore();
      }
    }
    if (o.headMask) {   // 明显的头部形态（扁头 / 尖吻）
      g.save();
      g.translate(PH.x, PH.y);
      g.rotate(Math.atan2(B.pts[B.n].y - B.pts[iH].y, B.pts[B.n].x - B.pts[iH].x));
      g.fillStyle = lit(sp.c1, o.headMaskL == null ? 0.1 : o.headMaskL);
      g.beginPath();
      g.ellipse(rx * 0.08, 0, rx * o.headMask[0], PH.w * o.headMask[1], 0, 0, TAU);
      g.fill();
      g.strokeStyle = alp(dk(sp.c2, 0.4), 0.42);
      g.lineWidth = Math.max(0.7, rx * 0.045);
      g.stroke();
      // 嘴缝
      g.strokeStyle = alp(dk(sp.c2, 0.35), 0.55);
      g.beginPath();
      g.moveTo(rx * 0.02, -PH.w * o.headMask[1] * 0.5);
      g.quadraticCurveTo(rx * (o.headMask[0] + 0.05), 0, rx * 0.02, PH.w * o.headMask[1] * 0.5);
      g.stroke();
      g.restore();
    }
    if (o.barbels) {    // 口部短须（泥鳅 / 锦鲤感）
      g.strokeStyle = alp(o.barbelC || sp.c3, 0.85);
      g.lineWidth = Math.max(0.7, rx * 0.03);
      g.lineCap = 'round';
      for (var bb = 0; bb < o.barbels; bb++) {
        var by2 = (bb - (o.barbels - 1) / 2) * PH.w * 0.45;
        g.beginPath();
        g.moveTo(PH.x + rx * 0.06, PH.y + by2);
        g.quadraticCurveTo(PH.x + rx * 0.4, PH.y + by2 * 1.5 + Math.sin(TAU * ph + bb) * rx * 0.08,
          PH.x + rx * 0.62, PH.y + by2 * 2.2 + Math.sin(TAU * ph + bb) * rx * 0.12);
        g.stroke();
      }
    }
    if (o.tongue) {     // 分叉蛇信
      var fx = B.pts[B.n].x, fy = B.pts[B.n].y;
      var flick = 0.5 + 0.5 * Math.sin(TAU * ph * 2);
      g.strokeStyle = '#ff5f6b';
      g.lineWidth = Math.max(0.8, rx * 0.032);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + rx * (0.1 + 0.1 * flick), fy - rx * 0.05);
      g.moveTo(fx, fy);
      g.lineTo(fx + rx * (0.1 + 0.1 * flick), fy + rx * 0.05);
      g.stroke();
    }
    if (o.whisker) {
      g.strokeStyle = alp(o.whisker, 0.9);
      g.lineWidth = Math.max(0.9, rx * 0.055);
      g.lineCap = 'round';
      for (var ws = -1; ws <= 1; ws += 2) {
        g.beginPath();
        g.moveTo(PH.x + rx * 0.12, PH.y + ws * PH.w * 0.5);
        g.quadraticCurveTo(PH.x + rx * 0.9, PH.y + ws * ry * (1.0 + Math.sin(TAU * ph) * 0.25),
          PH.x + rx * 1.55, PH.y + ws * ry * (0.25 + Math.sin(TAU * ph + 1) * 0.4));
        g.stroke();
      }
    }
    if (o.hornKind === 'spike') {   // 独角
      for (var hk = -1; hk <= 1; hk += 2) {
        g.save();
        g.translate(PH.x - rx * 0.3, PH.y + hk * PH.w * 0.5);
        g.rotate(hk * 0.6);
        g.fillStyle = o.hornC || '#eaf7ff';
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(-rx * 0.24, -rx * 0.12, -rx * 0.5, -rx * 0.3);
        g.quadraticCurveTo(-rx * 0.18, -rx * 0.05, 0, rx * 0.07);
        g.closePath(); g.fill();
        g.restore();
      }
    }
    if (o.hornKind === 'deer' || o.horn) {   // 分叉龙角
      g.fillStyle = o.hornC || '#fff4c2';
      for (var hs = -1; hs <= 1; hs += 2) {
        g.save();
        g.translate(PH.x - rx * 0.34, PH.y + hs * PH.w * 0.55);
        g.rotate(hs * 0.75);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-rx * 0.28, -rx * 0.05);
        g.lineTo(-rx * 0.5, -rx * 0.34);
        g.lineTo(-rx * 0.2, -rx * 0.12);
        g.lineTo(-rx * 0.16, -rx * 0.32);
        g.lineTo(-rx * 0.04, -rx * 0.06);
        g.closePath(); g.fill();
        g.restore();
      }
    }
    if (o.pearl) {  // 颔下龙珠
      var gx = PH.x + rx * 0.42, gy = PH.y + ry * 0.05;
      softBlob(g, gx, gy, rx * 0.42, rx * 0.42, '#fff6c8', 0.85);
      g.fillStyle = '#fffdf0';
      g.beginPath(); g.arc(gx, gy, rx * 0.13, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.arc(gx - rx * 0.04, gy - rx * 0.04, rx * 0.045, 0, TAU); g.fill();
    }
    var ex = PH.x - rx * 0.02, ew = PH.w;
    var er = Math.max(1.8, rx * (o.eyeR || 0.13));
    paintEye(g, ex, PH.y - ew * 0.55, er, o.iris || '#1b2733', { slit: !!o.slit });
    paintEye(g, ex, PH.y + ew * 0.55, er, o.iris || '#1b2733', { slit: !!o.slit });
  }

  /* ---------------- 鱼类通用：金鱼 / 锦鲤 ---------------- */
  function paintFish(g, sp, ph, o) {
    var rx = sp.size, ry = rx * (o.deep || 0.68);      // 胖瘦
    var bl = o.bodyLen == null ? 0.92 : o.bodyLen;     // 体长
    var sw = Math.sin(TAU * ph);
    var prof = o.prof || [0.2, 0.48, 0.8, 0.98, 1.0, 0.93, 0.74, 0.48, 0.22];
    var B = buildBody(function (s) {
      var x = -rx * bl + rx * (1 + bl) * s;
      var y = sw * ry * 0.14 * (Math.pow(clamp(1 - s, 0, 1), 2) - Math.pow(clamp(s, 0, 1), 2) * 0.35);
      return { x: x, y: y, w: ry * crAt(prof, s) };
    }, 34);
    var tx = -rx * bl * 0.94, ty = B.pts[0].y;
    var fc = o.finC || sp.c1;
    var tl = o.tailL || 1.45;
    paintFin(g, { x: tx, y: ty, len: rx * tl, wid: ry * 1.5, ang: Math.PI + sw * 0.3, col: fc, alpha: 0.72, rays: 5, bend: sw * 0.5 });
    paintFin(g, { x: tx, y: ty, len: rx * tl * 0.92, wid: ry * 1.2, ang: Math.PI * 0.8 + sw * 0.3, col: fc, alpha: 0.6, rays: 4, bend: sw * 0.45 });
    paintFin(g, { x: tx, y: ty, len: rx * tl * 0.92, wid: ry * 1.2, ang: Math.PI * 1.2 + sw * 0.3, col: fc, alpha: 0.6, rays: 4, bend: -sw * 0.45 });
    // 背鳍 / 腹鳍（身体之后）
    paintFin(g, { x: -rx * 0.05, y: -ry * 0.75, len: ry * (o.dorsal || 1.3), wid: rx * 0.7, ang: -Math.PI / 2 + sw * 0.12, col: fc, alpha: 0.7, rays: 5, bend: sw * 0.25 });
    paintFin(g, { x: -rx * 0.35, y: ry * 0.6, len: ry * 0.85, wid: rx * 0.4, ang: Math.PI / 2 - sw * 0.15, col: fc, alpha: 0.6, rays: 3, bend: sw * 0.3 });
    paintVolume(g, B, sp, {
      rx: rx, ry: ry,
      extra: function (gg) {
        var i;
        gg.strokeStyle = alp('#ffffff', 0.14);       // 鳞列
        gg.lineWidth = Math.max(0.6, rx * 0.028);
        for (i = 1; i <= 8; i++) {
          var px = rx * 0.78 - i * rx * 0.19;
          var hh = ry * 0.95 * Math.sqrt(Math.max(0.04, 1 - Math.pow((px - rx * 0.12) / (rx * 1.05), 2)));
          gg.beginPath();
          gg.moveTo(px, -hh);
          gg.quadraticCurveTo(px - rx * 0.13, 0, px, hh);
          gg.stroke();
        }
        if (o.patches) {                              // 斑块
          var R = rng(4271 + Math.round(sp.size));
          var pc = o.patchColors || [sp.c3, dk(sp.c2, 0.1)];
          for (i = 0; i < o.patches; i++) {
            var qx = -rx * bl * 0.85 + R() * rx * (1.1 + bl);
            var qy = -ry * 0.85 + R() * ry * 1.7;
            var qr = rx * (0.16 + R() * 0.24);
            gg.fillStyle = i % 2 ? alp(pc[0], 0.9) : alp(pc[1], 0.85);
            gg.beginPath();
            gg.ellipse(qx, qy, qr, qr * (0.55 + R() * 0.6), R() * TAU, 0, TAU);
            gg.fill();
          }
        }
        softBlob(gg, rx * 0.1, -ry * 0.5, rx * 0.8, ry * 0.4, '#ffffff', 0.2);
      }
    });
    if (o.hump) {   // 头部肉瘤（金鱼）
      g.save();
      trBody(g, B); g.clip();
      softBlob(g, rx * 0.5, -ry * 0.6, rx * 0.42, ry * 0.55, lit(sp.c1, 0.25), 0.6);
      g.restore();
    }
    // 胸鳍（身体之前）
    paintFin(g, { x: rx * 0.2, y: -ry * 0.55, len: rx * 0.6, wid: ry * 0.7, ang: Math.PI * 0.82 + sw * 0.3, col: fc, alpha: 0.55, rays: 3, bend: sw * 0.4 });
    paintFin(g, { x: rx * 0.2, y: ry * 0.55, len: rx * 0.6, wid: ry * 0.7, ang: Math.PI * 1.18 + sw * 0.3, col: fc, alpha: 0.55, rays: 3, bend: -sw * 0.4 });
    var cx2 = rx * (o.noseX == null ? 0.5 : o.noseX);
    paintEye(g, cx2, -ry * (o.eyeY || 0.44), Math.max(2, rx * (o.eyeR || 0.15)), o.iris || '#2a2118', { irisR: 0.78 });
    paintEye(g, cx2, ry * (o.eyeY || 0.44), Math.max(2, rx * (o.eyeR || 0.15)), o.iris || '#2a2118', { irisR: 0.78 });
    // 嘴
    g.strokeStyle = alp(dk(sp.c2, 0.3), 0.45);
    g.lineWidth = Math.max(0.7, rx * 0.045);
    g.beginPath();
    g.moveTo(rx * 0.92, -ry * (o.mouthY || 0.1));
    g.quadraticCurveTo(rx * 1.02, 0, rx * 0.92, ry * (o.mouthY || 0.1));
    g.stroke();
    if (o.barbels) {   // 口须（锦鲤）
      g.strokeStyle = alp(o.barbelC || sp.c3, 0.8);
      g.lineWidth = Math.max(0.7, rx * 0.028);
      g.lineCap = 'round';
      for (var fb = -1; fb <= 1; fb += 2) {
        g.beginPath();
        g.moveTo(rx * 0.93, fb * ry * 0.22);
        g.quadraticCurveTo(rx * 1.25, fb * ry * 0.5 + Math.sin(TAU * ph) * rx * 0.1,
          rx * 1.5, fb * ry * 0.3 + Math.sin(TAU * ph + 1) * rx * 0.14);
        g.stroke();
      }
    }
  }

  /* ---------------- 两栖通用：青蛙 / 大鲵 ---------------- */
  function paintAmphibian(g, sp, ph, o) {
    var rx = sp.size, ry = rx * 0.72;
    var sw = Math.sin(TAU * ph);
    var B = buildBody(function (s) {
      var x = -rx * o.back + rx * (1 + o.back) * s;
      return { x: x, y: sw * ry * 0.05 * (1 - s), w: ry * crAt(o.prof, s) };
    }, 32);
    var sd;
    if (o.finFold) {    // 背尾鳍褶（大鲵那种软塌的皮褶）
      finRibbon(g, B, function (s) { return o.finFold * Math.pow(clamp(1 - s, 0, 1), 0.8); }, alp(dk(sp.c1, 0.1), 0.5), 1);
    }
    if (o.hind) {   // 后腿蹬水
      for (sd = -1; sd <= 1; sd += 2) {
        g.save();
        g.translate(-rx * o.back * (o.hindX || 0.72), sd * ry * 0.45);
        g.rotate(sd * (1.15 + sw * 0.12));
        paintLimb(g, { x: 0, y: 0, ang: 0, len: rx * (o.hindLen || 0.95), wid: ry * 0.24, col: dk(sp.c1, 0.22), web: true });
        g.restore();
      }
    }
    if (o.fore) {   // 前腿
      for (sd = -1; sd <= 1; sd += 2) {
        g.save();
        g.translate(rx * (o.foreX || 0.42), sd * ry * 0.5);
        g.rotate(sd * (0.75 - sw * 0.15));
        paintLimb(g, { x: 0, y: 0, ang: 0, len: rx * (o.foreLen || 0.6), wid: ry * 0.2, col: dk(sp.c1, 0.14), web: !!o.web });
        g.restore();
      }
    }
    paintVolume(g, B, sp, {
      rx: rx, ry: ry, hi: 0.26,
      extra: function (gg) {
        var R = rng(7717 + Math.round(sp.size)), k;
        for (k = 0; k < (o.spots || 0); k++) {
          var px = -rx * o.back * 0.9 + R() * rx * (1.5 + o.back);
          var py = -ry * 0.6 + R() * ry * 1.1;
          var pr = rx * (0.07 + R() * 0.09);
          gg.fillStyle = alp(dk(sp.c2, 0.15), 0.55);
          gg.beginPath(); gg.ellipse(px, py, pr, pr * 0.8, 0, 0, TAU); gg.fill();
        }
        if (o.wrinkles) {   // 皮肤皱褶（大鲵那种松弛的皮）
          for (k = 0; k < o.wrinkles; k++) {
            var wx = -rx * o.back * 0.85 + (k + 0.5) / o.wrinkles * rx * (1.4 + o.back);
            gg.strokeStyle = alp(dk(sp.c2, 0.3), 0.3);
            gg.lineWidth = Math.max(0.7, rx * 0.03);
            gg.beginPath();
            gg.moveTo(wx, -ry * 0.9);
            gg.quadraticCurveTo(wx - rx * 0.05, 0, wx, ry * 0.9);
            gg.stroke();
          }
        }
        if (o.dorsalFold) { // 背侧褶（青蛙那两道线）
          for (k = -1; k <= 1; k += 2) {
            gg.strokeStyle = alp(lit(sp.c3, 0.1), 0.55);
            gg.lineWidth = Math.max(0.8, rx * 0.04);
            gg.beginPath();
            gg.moveTo(-rx * o.back * 0.8, k * ry * 0.42);
            gg.quadraticCurveTo(0, k * ry * 0.72, rx * 0.9, k * ry * 0.3);
            gg.stroke();
          }
        }
        softBlob(gg, 0, -ry * 0.55, rx, ry * 0.45, '#ffffff', 0.22);
        softBlob(gg, 0, ry * 0.85, rx, ry * 0.5, sp.c3, 0.4);
      }
    });
    if (o.headPlate) {   // 明显的扁阔头部
      g.save();
      g.translate(rx * (o.headX || 0.72), 0);
      g.fillStyle = lit(sp.c1, 0.06);
      g.beginPath();
      g.ellipse(0, 0, rx * o.headPlate[0], ry * o.headPlate[1], 0, 0, TAU);
      g.fill();
      g.strokeStyle = alp(dk(sp.c2, 0.42), 0.42);
      g.lineWidth = Math.max(0.7, rx * 0.04);
      g.stroke();
      // 宽扁的嘴线
      g.strokeStyle = alp(dk(sp.c2, 0.4), 0.5);
      g.beginPath();
      g.moveTo(rx * o.headPlate[0] * 0.2, -ry * o.headPlate[1] * 0.45);
      g.quadraticCurveTo(rx * o.headPlate[0] * 1.0, 0, rx * o.headPlate[0] * 0.2, ry * o.headPlate[1] * 0.45);
      g.stroke();
      g.restore();
    }
    var hx = rx * (o.headX || 0.72);
    var ey = ry * (o.eyeY || 0.5);
    paintEye(g, hx, -ey, Math.max(2, rx * (o.eyeR || 0.19)), o.iris || '#d9a53a', { irisR: 0.82 });
    paintEye(g, hx, ey, Math.max(2, rx * (o.eyeR || 0.19)), o.iris || '#d9a53a', { irisR: 0.82 });
    if (o.brow) {
      g.strokeStyle = alp(dk(sp.c2, 0.25), 0.55);
      g.lineWidth = Math.max(0.8, rx * 0.055);
      for (sd = -1; sd <= 1; sd += 2) {
        g.beginPath();
        g.moveTo(hx - rx * 0.2, sd * ry * 0.24);
        g.quadraticCurveTo(hx, sd * ry * 0.3, hx + rx * 0.24, sd * ry * 0.16);
        g.stroke();
      }
    }
    g.strokeStyle = alp(dk(sp.c2, 0.35), 0.55);
    g.lineWidth = Math.max(0.8, rx * 0.05);
    g.beginPath();
    g.moveTo(rx * 0.98, -ry * 0.22);
    g.quadraticCurveTo(rx * 0.72, 0, rx * 0.98, ry * 0.22);
    g.stroke();
  }

  /* ---------------- 乌龟 ---------------- */
  function paintTurtle(g, sp, ph) {
    var rx = sp.size, ry = rx * 0.68;
    var sw = Math.sin(TAU * ph);
    var fl = [[0.55, -0.95, -0.9], [0.55, 0.95, 0.9], [-0.5, -0.9, -1.25], [-0.5, 0.9, 1.25]];
    for (var i = 0; i < 4; i++) {
      var a = fl[i];
      g.save();
      g.translate(rx * a[0], ry * a[1] * 0.85);
      g.rotate(a[2] + sw * 0.14 * (i < 2 ? 1 : -1));
      paintLimb(g, { x: 0, y: 0, ang: 0, len: rx * 0.72, wid: ry * 0.2, col: dk(sp.c1, 0.3), claw: '#f2e6cd' });
      g.restore();
    }
    // 头颈
    g.save();
    g.translate(rx * 0.72, sw * ry * 0.1);
    g.fillStyle = dk(sp.c1, 0.05);
    g.beginPath(); g.ellipse(0, 0, rx * 0.42, ry * 0.4, 0, 0, TAU); g.fill();
    g.strokeStyle = alp(dk(sp.c2, 0.3), 0.4);
    g.lineWidth = Math.max(0.7, rx * 0.04);
    g.stroke();
    paintEye(g, rx * 0.16, -ry * 0.2, Math.max(1.8, rx * 0.11), '#c98a2a');
    paintEye(g, rx * 0.16, ry * 0.2, Math.max(1.8, rx * 0.11), '#c98a2a');
    g.strokeStyle = alp(dk(sp.c2, 0.35), 0.6);
    g.lineWidth = Math.max(0.7, rx * 0.04);
    g.beginPath(); g.moveTo(rx * 0.36, -ry * 0.1); g.quadraticCurveTo(rx * 0.46, 0, rx * 0.36, ry * 0.1); g.stroke();
    g.restore();
    // 龟甲
    g.save();
    g.translate(-rx * 0.06, 0);
    var shellG = g.createRadialGradient(-rx * 0.25, -ry * 0.4, rx * 0.1, 0, 0, rx);
    shellG.addColorStop(0, lit(sp.c3, 0.35));
    shellG.addColorStop(0.55, sp.c3);
    shellG.addColorStop(1, dk(sp.c3, 0.4));
    g.fillStyle = shellG;
    g.beginPath(); g.ellipse(0, 0, rx * 0.92, ry * 0.95, 0, 0, TAU); g.fill();
    g.strokeStyle = alp(dk(sp.c3, 0.55), 0.55);
    g.lineWidth = Math.max(0.9, rx * 0.05);
    g.stroke();
    g.save();
    g.beginPath(); g.ellipse(0, 0, rx * 0.92, ry * 0.95, 0, 0, TAU); g.clip();
    g.strokeStyle = alp(dk(sp.c3, 0.45), 0.6);
    g.lineWidth = Math.max(0.7, rx * 0.035);
    for (var s2 = 1; s2 <= 2; s2++) {
      g.beginPath(); g.ellipse(0, 0, rx * 0.92 * (s2 / 3), ry * 0.95 * (s2 / 3), 0, 0, TAU); g.stroke();
    }
    for (var k2 = 0; k2 < 6; k2++) {
      var ang = k2 / 6 * TAU + 0.3;
      g.beginPath();
      g.moveTo(Math.cos(ang) * rx * 0.3, Math.sin(ang) * ry * 0.31);
      g.lineTo(Math.cos(ang) * rx * 0.92, Math.sin(ang) * ry * 0.95);
      g.stroke();
    }
    softBlob(g, -rx * 0.3, -ry * 0.45, rx * 0.6, ry * 0.5, '#ffffff', 0.3);
    g.restore();
    g.restore();
  }

  /* ---------------- 鳄鱼 ---------------- */
  function paintCroco(g, sp, ph) {
    var rx = sp.size, ry = rx * 0.48;
    var sw = Math.sin(TAU * ph);
    var B = buildBody(function (s) {
      var x = -rx * 1.85 + rx * 2.85 * s;
      var y = sw * rx * 0.16 * Math.pow(clamp(1 - s, 0, 1), 1.6);
      return { x: x, y: y, w: ry * crAt([0.05, 0.16, 0.4, 0.7, 0.95, 1.0, 0.72, 0.42, 0.3], s) };
    }, 44);
    var lp = [[0.62, -0.95, -0.7], [0.62, 0.95, 0.7], [-0.62, -0.9, -1.1], [-0.62, 0.9, 1.1]];
    for (var i = 0; i < 4; i++) {
      var a = lp[i];
      g.save();
      g.translate(rx * a[0], ry * a[1] * 0.7);
      g.rotate(a[2] + sw * 0.1);
      paintLimb(g, { x: 0, y: 0, ang: 0, len: rx * 0.5, wid: ry * 0.34, col: dk(sp.c1, 0.32), claw: '#efe6cd' });
      g.restore();
    }
    finRibbon(g, B, function (s) {
      return 0.55 * Math.pow(Math.max(0, Math.sin(Math.PI * clamp((s - 0.1) * 1.1, 0, 1))), 0.6);
    }, alp(dk(sp.c1, 0.25), 0.9), 1);
    paintVolume(g, B, sp, {
      rx: rx, ry: ry * 1.5, gh: 0.8,
      extra: function (gg) {
        for (var k = 3; k < B.n - 3; k += 3) {   // 背部鳞脊
          var PP = B.pts[k], NN = B.nrm[k];
          gg.fillStyle = alp(dk(sp.c2, 0.2), 0.55);
          gg.beginPath();
          gg.ellipse(PP.x + NN[0] * PP.w * 0.75, PP.y + NN[1] * PP.w * 0.75, rx * 0.08, rx * 0.05,
            Math.atan2(NN[1], NN[0]), 0, TAU);
          gg.fill();
        }
        softBlob(gg, -rx * 0.2, -ry * 0.6, rx * 1.4, ry * 0.7, '#ffffff', 0.18);
        softBlob(gg, rx * 0.1, ry * 1.1, rx * 1.6, ry * 0.7, sp.c3, 0.35);
      }
    });
    g.save();                                   // 牙齿
    trBody(g, B); g.clip();
    g.fillStyle = '#fdfbf2';
    for (var ti = 0; ti < 9; ti++) {
      var tx2 = rx * (0.42 + ti * 0.075);
      for (var ts = -1; ts <= 1; ts += 2) {
        g.beginPath();
        g.moveTo(tx2, ts * ry * 0.55);
        g.lineTo(tx2 + rx * 0.02, ts * ry * 1.15);
        g.lineTo(tx2 + rx * 0.045, ts * ry * 0.55);
        g.closePath(); g.fill();
      }
    }
    g.restore();
    paintEye(g, rx * 0.66, -ry * 0.62, Math.max(2, rx * 0.1), '#e0b64a', { slit: true });
    paintEye(g, rx * 0.66, ry * 0.62, Math.max(2, rx * 0.1), '#e0b64a', { slit: true });
    g.fillStyle = alp(dk(sp.c2, 0.3), 0.6);
    g.beginPath(); g.ellipse(rx * 1.02, -ry * 0.2, rx * 0.05, ry * 0.16, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(rx * 1.02, ry * 0.2, rx * 0.05, ry * 0.16, 0, 0, TAU); g.fill();
  }

  /* ---------------- 总入口 ---------------- */
  function paintCreature(g, lvl, ph) {
    var sp = SPECIES[lvl];
    var rx = sp.size;
    switch (sp.form) {
      case 'tadpole': paintTadpole(g, sp, ph); break;
      case 'shrimp': paintShrimp(g, sp, ph); break;
      // 泥鳅：极细长、土黄带云斑、四对小须、几乎滑行般的小幅摆尾
      case 'loach': paintSerpent(g, sp, ph, {
        thick: 0.32, n: 46, back: 1.75, amp: 0.42, wav: 2.6,
        prof: [0.3, 0.55, 0.8, 0.95, 1.0, 0.96, 0.85, 0.6, 0.34],
        backFin: 0.35, bellyFin: 0.22, finC: mixHex(sp.c1, sp.c2, 0.5), belly: 0.3,
        pattern: [8, 0.07, dk(sp.c2, 0.2), 0.45],
        headMask: [0.1, 1.05], barbels: 4, barbelC: dk(sp.c3, 0.15),
        iris: '#211a10', eyeR: 0.1
      }); break;
      // 青蛙：短圆胖、壮健后腿、背侧褶、金色大突眼
      case 'frog': paintAmphibian(g, sp, ph, {
        back: 0.95, prof: [0.5, 0.78, 0.96, 1.0, 0.95, 0.86, 0.74, 0.58, 0.42],
        hind: true, hindLen: 1.05, fore: true, foreLen: 0.55,
        spots: 7, dorsalFold: true, iris: '#e8b52a', eyeR: 0.2, brow: true
      }); break;
      case 'turtle': paintTurtle(g, sp, ph); break;
      // 金鱼：短胖高身、额头肉瘤、长纱一样飘荡的大尾巴
      case 'fish': paintFish(g, sp, ph, {
        deep: 0.82, bodyLen: 0.78, tailL: 1.9, dorsal: 1.5,
        prof: [0.24, 0.55, 0.86, 1.0, 1.0, 0.95, 0.8, 0.56, 0.28],
        finC: mixHex(sp.c1, '#ffffff', 0.15), patchColors: [mixHex(sp.c2, '#ffffff', 0.55), '#c25c12'],
        patches: 4, hump: true, iris: '#3a2412', eyeR: 0.17, noseX: 0.52, mouthY: 0.14
      }); break;
      // 锦鲤：白身红斑、身体修长、短宽尾、两根口须
      case 'koi': paintFish(g, sp, ph, {
        deep: 0.48, bodyLen: 1.25, tailL: 1.15, dorsal: 0.9,
        prof: [0.16, 0.42, 0.74, 0.96, 1.0, 0.98, 0.84, 0.56, 0.24],
        finC: '#ffe9e4', patchColors: ['#d8362a', '#2f3b4a'], patches: 5,
        barbels: true, iris: '#2b1d16', eyeR: 0.12, noseX: 0.62, mouthY: 0.16
      }); break;
      // 水蛇：细长蛇身、亮黄环纹、分叉蛇信、竖瞳
      case 'snake': paintSerpent(g, sp, ph, {
        thick: 0.4, n: 48, back: 2.1, amp: 0.95, wav: 2.6,
        prof: [0.06, 0.22, 0.5, 0.8, 0.96, 1.0, 0.9, 0.6, 0.26],
        belly: 0.35, bands: [11, '#ffd84d', 0.55, 0.3], tongue: true,
        headMask: [0.12, 1.15], iris: '#ffd84d', slit: true, eyeR: 0.11
      }); break;
      case 'croco': paintCroco(g, sp, ph); break;
      // 大鲵：扁阔大头、皮肤皱褶、短腿、背尾皮褶、眯缝小眼
      case 'salamander': paintAmphibian(g, sp, ph, {
        back: 1.5, prof: [0.44, 0.72, 0.94, 1.0, 0.96, 0.88, 0.74, 0.58, 0.34],
        finFold: 0.42, wrinkles: 5, spots: 10,
        headPlate: [0.42, 0.66], headX: 0.82,
        hind: true, hindLen: 0.6, hindX: 0.82, fore: true, foreLen: 0.42, foreX: 0.5,
        web: true, iris: '#2a2118', eyeR: 0.1
      }); break;
      // 蛟龙：水蓝、独角、四爪、连续背帆 + 背刺，体型比龙更细
      case 'jiaolong': paintSerpent(g, sp, ph, {
        thick: 0.46, n: 46, back: 2.0, amp: 0.9, wav: 2.2,
        prof: [0.08, 0.24, 0.46, 0.68, 0.86, 1.0, 0.9, 0.66, 0.32],
        backFin: 0.7, belly: 0.42, spikes: 0.45, spikeC: '#e9fbff',
        legs: { at: [0.82, 0.34], len: rx * 0.5, wid: rx * 0.12, claw: '#e9fbff', clawN: 3 },
        hornKind: 'spike', hornC: '#eaf7ff', whisker: '#e9fbff',
        mane: lit(sp.c1, 0.35), iris: '#ffe27a', slit: true, eyeR: 0.12
      }); break;
      // 神龙：最粗壮、金色鹿角、颔下龙珠、五爪、高背帆 + 高背刺
      case 'dragon': paintSerpent(g, sp, ph, {
        thick: 0.64, n: 44, back: 2.15, amp: 0.7, wav: 1.8,
        prof: [0.1, 0.24, 0.44, 0.66, 0.86, 1.0, 0.95, 0.74, 0.36],
        backFin: 0.95, belly: 0.5, spikes: 0.72, spikeC: '#fff4c2', pattern: [12, 0.05, '#fff3c0', 0.3],
        legs: { at: [0.84, 0.36], len: rx * 0.62, wid: rx * 0.16, claw: '#fff4c2', clawN: 5 },
        hornKind: 'deer', hornC: '#fff4c2', whisker: '#fff0b8', mane: '#ffd75c',
        pearl: true, iris: '#ff7a3d', slit: true, eyeR: 0.1
      }); break;
      default: paintFish(g, sp, ph, {}); break;
    }
  }

  /* ============================ 美术：精灵预渲染 ============================
   * 每种生物预渲染若干帧游动动画，运行时只做一次 drawImage，
   * 所以上面的高细节建模（渐变/鳞片/光斑/鳍条）几乎不消耗运行开销。
   * 体型越大 → 帧数与分辨率越低（控制显存），小生物则给足清晰度。
   */
  var EXT = {
    tadpole: [2.25, 1.25, 1.3, 1.3], shrimp: [1.7, 2.45, 1.45, 1.45], loach: [2.1, 1.7, 1.2, 1.3],
    frog: [2.2, 1.6, 1.6, 1.6], turtle: [1.85, 1.7, 1.35, 1.35], fish: [2.9, 1.6, 2.1, 2.1],
    koi: [2.9, 1.7, 1.5, 1.5], snake: [2.8, 1.6, 1.3, 1.3], croco: [2.7, 1.7, 1.25, 1.35],
    salamander: [2.5, 1.7, 1.35, 1.35], jiaolong: [2.8, 2.5, 1.5, 1.5], dragon: [3.0, 2.5, 1.7, 1.7]
  };
  var sprCache = [], sprOrder = [];
  function framesOf(size) { return size > 50 ? 6 : 10; }
  function ensureSprite(lvl) {
    if (sprCache[lvl]) return sprCache[lvl];
    var sp = SPECIES[lvl];
    var ext = EXT[sp.form] || [2.4, 1.6, 1.4, 1.4];
    var q = clamp(44 / sp.size, 0.8, 1.5);
    var N = framesOf(sp.size);
    var w = Math.max(2, Math.ceil((ext[0] + ext[1]) * sp.size * q));
    var h = Math.max(2, Math.ceil((ext[2] + ext[3]) * sp.size * q));
    var frames = [], f;
    for (f = 0; f < N; f++) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g2 = c.getContext('2d');
      g2.setTransform(q, 0, 0, q, ext[0] * sp.size * q, ext[2] * sp.size * q);
      paintCreature(g2, lvl, f / N);
      frames.push(c);
    }
    sprCache[lvl] = { frames: frames, ext: ext, q: q, n: frames.length };
    sprOrder.push(lvl);
    pruneSprites();
    return sprCache[lvl];
  }
  function pruneSprites() {   // 控制显存：最多保留 8 级，淘汰离当前等级最远的
    if (sprOrder.length <= 8) return;
    var cur = player.level, worst = -1, wl = -1, i;
    for (i = 0; i < sprOrder.length; i++) {
      var lv = sprOrder[i];
      if (lv === cur) continue;
      var d = Math.abs(lv - cur);
      if (d > wl) { wl = d; worst = i; }
    }
    if (worst < 0) return;
    sprCache[sprOrder[worst]] = null;
    sprOrder.splice(worst, 1);
  }

  function drawCreature(g, lvl, x, y, ang, ph, alpha) {
    var sp = SPECIES[lvl];
    g.save();
    if (alpha != null) g.globalAlpha *= alpha;
    g.translate(x, y);
    g.rotate(ang);
    var S = sprCache[lvl];
    if (S) {
      var f = Math.floor((((ph % 1) + 1) % 1) * S.n) % S.n;
      g.drawImage(S.frames[f], -sp.size * S.ext[0], -sp.size * S.ext[2],
        sp.size * (S.ext[0] + S.ext[1]), sp.size * (S.ext[2] + S.ext[3]));
    } else {
      paintCreature(g, lvl, ph);
    }
    g.restore();
  }

  /* ============================ 美术：场景 ============================ */
  function drawBackground() {
    var g = ctx;
    var grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#12557c');
    grd.addColorStop(0.35, '#0d3e5f');
    grd.addColorStop(0.7, '#08283f');
    grd.addColorStop(1, '#04182a');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    g.save();   // 水面光柱
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 5; i++) {
      var x = (i * 0.24 + 0.05) * W + Math.sin(state.t * 0.22 + i * 1.7) * W * 0.06;
      var w = W * (0.1 + (i % 2) * 0.05);
      var lg = g.createLinearGradient(x, 0, x + w * 0.7, H);
      lg.addColorStop(0, 'rgba(165,230,255,0.13)');
      lg.addColorStop(0.6, 'rgba(140,210,255,0.05)');
      lg.addColorStop(1, 'rgba(140,210,255,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w * 2.1, H); g.lineTo(x + w, H);
      g.closePath(); g.fill();
    }
    g.restore();
  }

  // 视差层：p 越小越远；以哈希网格铺满无限水域
  function scapePass(p, o) {
    var g = ctx;
    var cx = cam.x * p, cy = cam.y * p;
    var z = state.zoomPunch * baseZoom;
    var hw = W / 2 / z + 300, hh = H / 2 / z + 300;
    var cs = o.cell;
    var ix0 = Math.floor((cx - hw) / cs), ix1 = Math.ceil((cx + hw) / cs);
    var iy0 = Math.floor((cy - hh) / cs), iy1 = Math.ceil((cy + hh) / cs);
    g.save();
    g.translate(cam.x * (1 - p), cam.y * (1 - p));
    for (var iy = iy0; iy <= iy1; iy++) {
      for (var ix = ix0; ix <= ix1; ix++) {
        var h1 = hash2(ix, iy), h2 = hash2(ix + 4211, iy - 1739), h3 = hash2(ix - 887, iy + 3301);
        if (h1 > o.density) continue;
        o.draw(g, (ix + h2) * cs, (iy + h3) * cs, h1, h2, h3, cs);
      }
    }
    g.restore();
  }

  function drawRockScape() {          // 远景礁影
    scapePass(0.35, {
      cell: 460, density: 0.55,
      draw: function (g, x, y, h1, h2) {
        var r = 130 + h2 * 220;
        g.save();
        g.globalAlpha = 0.5;
        var rg = g.createRadialGradient(x - r * 0.3, y - r * 0.5, r * 0.1, x, y, r * 1.15);
        rg.addColorStop(0, 'rgba(14,58,86,0.9)');
        rg.addColorStop(0.65, 'rgba(9,40,62,0.75)');
        rg.addColorStop(1, 'rgba(7,30,48,0)');
        g.fillStyle = rg;
        g.beginPath(); g.arc(x, y, r * 1.15, 0, TAU); g.fill();
        g.restore();
      }
    });
  }

  function drawWeedScape() {          // 中景水草
    scapePass(0.62, {
      cell: 340, density: 0.42,
      draw: function (g, x, y, h1, h2, h3, cs) {
        var n = 2 + Math.floor(h2 * 3);
        for (var i = 0; i < n; i++) {
          var hh = hash2(Math.round(x) + i, Math.round(y) - i);
          var bx = x + (hh - 0.5) * cs * 0.7;
          var len = cs * (0.5 + hh * 0.8);
          var sway = Math.sin(state.t * 0.7 + h3 * 8 + i) * len * 0.16;
          g.save();
          g.globalAlpha = 0.4;
          g.strokeStyle = 'rgba(24,86,86,0.85)';
          g.lineWidth = Math.max(2, cs * 0.035);
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(bx, y);
          g.quadraticCurveTo(bx + sway, y - len * 0.55, bx + sway * 1.6, y - len);
          g.stroke();
          g.fillStyle = 'rgba(30,102,96,0.55)';
          for (var k = 1; k <= 3; k++) {
            var t = k / 4;
            g.beginPath();
            g.ellipse(bx + sway * t * 1.4 + (k % 2 ? 1 : -1) * cs * 0.09, y - len * t,
              cs * 0.11, cs * 0.035, (k % 2 ? -0.6 : 0.6), 0, TAU);
            g.fill();
          }
          g.restore();
        }
      }
    });
  }

  function drawCaustics() {           // 水面焦散光斑
    var g = ctx;
    g.save();
    g.globalCompositeOperation = 'lighter';
    scapePass(0.5, {
      cell: 240, density: 1.01,
      draw: function (gg, x, y, h1, h2, h3) {
        var t = state.t * 0.5 + h3 * 9;
        var r = 90 + h1 * 90;
        var px = x + Math.sin(t) * 40, py = y + Math.cos(t * 0.8) * 34;
        var rg = gg.createRadialGradient(px, py, 0, px, py, r);
        rg.addColorStop(0, 'rgba(150,225,255,' + (0.05 + h2 * 0.05).toFixed(3) + ')');
        rg.addColorStop(1, 'rgba(150,225,255,0)');
        gg.fillStyle = rg;
        gg.beginPath(); gg.arc(px, py, r, 0, TAU); gg.fill();
      }
    });
    g.restore();
  }

  function drawBubbles() {            // 上升气泡
    scapePass(0.85, {
      cell: 170, density: 0.5,
      draw: function (g, x, y, h1, h2, h3, cs) {
        var span = cs * 3;
        var rise = (state.t * (18 + h3 * 26) + h2 * span * 3) % span;
        var bx = x + Math.sin(rise * 0.02 + h1 * 6) * 8;
        var by = y + cs * 0.7 - rise;
        var br = 2 + h1 * 5;
        g.save();
        g.globalAlpha = 0.34;
        g.strokeStyle = 'rgba(200,240,255,0.9)';
        g.lineWidth = 1.2;
        g.beginPath(); g.arc(bx, by, br, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(230,250,255,0.5)';
        g.beginPath(); g.arc(bx - br * 0.3, by - br * 0.3, br * 0.32, 0, TAU); g.fill();
        g.restore();
      }
    });
  }

  function drawPlankton() {           // 浮游微粒
    var g = ctx;
    var pad = 180;
    var z = state.zoomPunch * baseZoom;
    var hw = W / 2 / z + pad, hh = H / 2 / z + pad;
    var cs = 150;
    var ix0 = Math.floor((cam.x - hw) / cs), ix1 = Math.ceil((cam.x + hw) / cs);
    var iy0 = Math.floor((cam.y - hh) / cs), iy1 = Math.ceil((cam.y + hh) / cs);
    g.save();
    g.fillStyle = '#cfeeff';
    for (var iy = iy0; iy <= iy1; iy++) {
      for (var ix = ix0; ix <= ix1; ix++) {
        var h1 = hash2(ix, iy), h2 = hash2(ix + 9137, iy - 5731);
        if (h1 > 0.6) continue;
        var px = (ix + h1) * cs + Math.sin(state.t * 0.4 + h2 * 12) * 16;
        var py = (iy + h2) * cs + Math.cos(state.t * 0.32 + h1 * 12) * 16;
        g.globalAlpha = 0.08 + h2 * 0.14;
        g.beginPath(); g.arc(px, py, 1 + h1 * 2.6, 0, TAU); g.fill();
      }
    }
    g.restore();
  }

  function drawGlow(x, y, r, hex, a) {
    var g = ctx;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(x, y);
    var rg = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    rg.addColorStop(0, alp(hex, a));
    rg.addColorStop(0.45, alp(hex, a * 0.35));
    rg.addColorStop(1, alp(hex, 0));
    g.fillStyle = rg;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.restore();
  }

  function drawRing(x, y, r, color, dash, alpha) {
    var g = ctx;
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = 2;
    if (dash) g.setLineDash([7, 7]);
    g.lineDashOffset = -state.t * 26;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    g.restore();
  }

  function drawShadow(x, y, r) {
    var g = ctx;
    g.save();
    g.translate(x, y + r * 0.5);
    g.scale(1, 0.45);
    var rg = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.2);
    rg.addColorStop(0, 'rgba(2,14,26,0.30)');
    rg.addColorStop(1, 'rgba(2,14,26,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(0, 0, r * 1.2, 0, TAU); g.fill();
    g.restore();
  }

  /* ============================ 渲染 ============================ */
  function render() {
    var g = ctx;
    drawBackground();

    g.save();
    var sx = state.shake ? rand(-state.shake, state.shake) : 0;
    var sy = state.shake ? rand(-state.shake, state.shake) : 0;
    g.translate(W / 2 + sx, H / 2 + sy);
    g.scale(state.zoomPunch * baseZoom, state.zoomPunch * baseZoom);
    g.translate(-cam.x, -cam.y);

    drawRockScape();
    drawCaustics();
    drawWeedScape();
    drawBubbles();
    drawPlankton();

    // 被吞噬者的旋入残影
    for (var s = 0; s < swallows.length; s++) {
      var sw = swallows[s];
      var k = 1 - sw.life / sw.max;
      var kx = k * k;
      drawCreature(g, sw.level, sw.x + (player.x - sw.x) * kx, sw.y + (player.y - sw.y) * kx,
        sw.ang + k * 6, sw.ph, Math.max(0, 1 - k * 1.15));
    }

    // 冲击波 / 光爆
    for (var w = 0; w < waves.length; w++) {
      var wv = waves[w];
      var wa = clamp(wv.life / wv.maxLife, 0, 1);
      g.save();
      g.globalAlpha = wa * 0.8;
      g.strokeStyle = wv.color;
      g.lineWidth = Math.max(1.5, wv.max * 0.012 * wa);
      g.beginPath(); g.arc(wv.x, wv.y, wv.r, 0, TAU); g.stroke();
      if (wv.rays) {
        g.globalAlpha = wa * 0.45;
        g.lineWidth = Math.max(1, wv.max * 0.008);
        for (var ri = 0; ri < wv.rays; ri++) {
          var ra = ri / wv.rays * TAU + wv.spin;
          g.beginPath();
          g.moveTo(wv.x + Math.cos(ra) * wv.r * 0.35, wv.y + Math.sin(ra) * wv.r * 0.35);
          g.lineTo(wv.x + Math.cos(ra) * wv.r * 1.25, wv.y + Math.sin(ra) * wv.r * 1.25);
          g.stroke();
        }
      }
      g.restore();
    }

    // 其它生物
    var vz = state.zoomPunch * baseZoom;
    var cullR = Math.max(W, H) / vz * 0.75 + 420;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (Math.hypot(e.x - cam.x, e.y - cam.y) > cullR) continue;
      var r = radiusOf(e.level);
      drawShadow(e.x, e.y, r);
      if (e.level > player.level) {
        var warning = e.hunt ? (e.dash > 0 ? 1 : 0.72) : 0.45;
        drawRing(e.x, e.y, r * 1.45, e.hunt ? '#ff4d4d' : '#ff6b6b', true, warning);
        drawRing(e.x, e.y, r * (1.6 + 0.12 * Math.sin(state.t * 3 + e.seed)), '#ff8f8f', false, warning * 0.36);
        if (e.hunt) drawRing(e.x, e.y, r * 1.15, '#ff2d2d', false, 0.2);
      } else if (e.level === player.level) {
        drawRing(e.x, e.y, r * 1.32, '#7ef7d1', false, 0.2);
      }
      var eg = SPECIES[e.level].glow;
      if (eg) drawGlow(e.x, e.y, r * 3.2, SPECIES[e.level].c1, eg * 0.45);
      drawCreature(g, e.level, e.x, e.y, e.ang, state.t * 1.05 + e.seed, 1);
    }

    // 玩家
    var pa = player.invuln > 0 ? (0.35 + 0.65 * Math.abs(Math.sin(state.t * 18))) : 1;
    var pr = radiusOf(player.level);
    var psp = SPECIES[player.level];
    drawShadow(player.x, player.y, pr);
    drawRing(player.x, player.y, pr * 1.4, '#ffffff', false, 0.16);
    if (psp.glow) drawGlow(player.x, player.y, pr * 3.8, psp.c1, psp.glow * 0.7);
    drawCreature(g, player.level, player.x, player.y, player.ang, state.t * 1.35 + player.seed, pa);

    // 粒子 / 气泡尾迹
    g.save();
    for (var p = 0; p < particles.length; p++) {
      var pt = particles[p];
      g.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      if (pt.ring) {
        g.strokeStyle = pt.color;
        g.lineWidth = 1.2;
        g.beginPath(); g.arc(pt.x, pt.y, pt.r, 0, TAU); g.stroke();
      } else {
        g.fillStyle = pt.color;
        g.beginPath(); g.arc(pt.x, pt.y, pt.r, 0, TAU); g.fill();
      }
    }
    g.restore();

    // 飘字
    g.save();
    g.textAlign = 'center';
    for (var u = 0; u < popups.length; u++) {
      var pu = popups[u];
      g.globalAlpha = clamp(pu.life / pu.max, 0, 1);
      g.font = '700 ' + pu.size + 'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,20,35,0.75)';
      g.strokeText(pu.text, pu.x, pu.y);
      g.fillStyle = pu.color;
      g.fillText(pu.text, pu.x, pu.y);
    }
    g.restore();

    g.restore();

    // 闪白 / 闪红
    if (state.flash > 0.01) {
      g.save();
      g.fillStyle = 'rgba(' + state.flashColor + ',' + (state.flash * 0.5) + ')';
      g.fillRect(0, 0, W, H);
      g.restore();
    }

    // 虚拟摇杆
    if (input.active && state.running) {
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(input.ox, input.oy, 34, 0, TAU); g.stroke();
      var mx = input.x - input.ox, my = input.y - input.oy;
      var mm = Math.hypot(mx, my) || 1;
      var kk = Math.min(mm, 34);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.beginPath(); g.arc(input.ox + mx / mm * kk, input.oy + my / mm * kk, 14, 0, TAU); g.fill();
      g.restore();
    }

    // 暗角
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,8,18,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  /* ============================ HUD ============================ */
  var chainNodes = [], endNodes = [];
  function buildChains() {
    var i, n;
    for (i = 0; i < SPECIES.length; i++) {
      n = document.createElement('div');
      n.className = 'node';
      n.textContent = String(i + 1);
      n.title = SPECIES[i].name;
      elChain.appendChild(n);
      chainNodes.push(n);

      n = document.createElement('div');
      n.className = 'node';
      n.textContent = String(i + 1);
      n.title = SPECIES[i].name;
      elEndChain.appendChild(n);
      endNodes.push(n);
    }
  }

  function renderChain(lvl) {
    var arr = [chainNodes, endNodes];
    for (var a = 0; a < arr.length; a++) {
      var nodes = arr[a];
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i], sp = SPECIES[i];
        var done = i <= lvl;
        n.classList.toggle('done', done && i < lvl);
        n.classList.toggle('cur', i === lvl);
        if (done) {
          n.style.background = sp.c1;
          n.style.color = sp.c1;
          n.style.borderColor = 'rgba(255,255,255,0.35)';
          n.textContent = '';
        } else {
          n.style.background = '';
          n.style.color = '';
          n.style.borderColor = '';
          n.textContent = String(i + 1);
        }
      }
    }
  }

  var lastHud = {};
  function syncHud() {
    var sp = SPECIES[player.level];
    if (lastHud.lv !== player.level) {
      lastHud.lv = player.level;
      elCurName.textContent = sp.name;
      elCurLv.textContent = 'Lv.' + (player.level + 1);
      elCurName.style.color = sp.c1;
    }
    var sc = String(state.score);
    if (lastHud.score !== sc) { lastHud.score = sc; elScore.textContent = sc; }
    var pct = clamp(player.progress / MERGE_NEED, 0, 1) * 100;
    elBarFill.style.width = pct.toFixed(1) + '%';
    var txt = (Math.round(player.progress * 100) / 100) + ' / ' + MERGE_NEED +
      (player.level < MAX_LEVEL ? '  → ' + SPECIES[player.level + 1].name : '  · 已是神龙');
    if (lastHud.txt !== txt) { lastHud.txt = txt; elBarTxt.textContent = txt; }
    var hs = '';
    for (var i = 0; i < MAX_HEARTS; i++) hs += (i < player.hearts ? '♥' : '<em>♥</em>');
    if (lastHud.hp !== hs) { lastHud.hp = hs; elHearts.innerHTML = hs; }
    var tm = fmtTime(state.time);
    if (lastHud.time !== tm) { lastHud.time = tm; elTime.textContent = tm; }
  }

  /* ============================ 流程控制 ============================ */
  var BEST_KEY = 'synthetic_dragon_best_v1';
  function loadBest() {
    try {
      var raw = localStorage.getItem(BEST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveBest(b) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* ignore */ }
  }

  function reset() {
    state.running = false;
    state.finished = false;
    state.won = false;
    state.time = 0;
    state.score = 0;
    state.shake = 0;
    state.zoomPunch = 1;
    state.flash = 0;
    player.x = 0; player.y = 0; player.vx = 0; player.vy = 0; player.ang = 0;
    player.level = 0; player.progress = 0; player.hearts = MAX_HEARTS;
    player.invuln = 0; player.seed = Math.random() * 10;
    cam.x = 0; cam.y = 0;
    entities.length = 0; particles.length = 0; popups.length = 0; waves.length = 0;
    swallows.length = 0;
    player.trail = 0;
    lastHud = {};
  }

  function ensureNearbySprites() {
    for (var i = Math.max(0, player.level - 2); i <= Math.min(MAX_LEVEL, player.level + 2); i++) {
      ensureSprite(i);
    }
  }

  function start() {
    reset();
    state.running = true;
    ensureNearbySprites();
    spawnBurst(targetCount());
    elOverlay.classList.add('hide');
    elHud.classList.remove('hide');
    elMute.classList.remove('hide');
    elTip.style.opacity = '1';
    delete elTip.dataset.faded;
    renderChain(0);
    syncHud();
    initAudio();
  }

  function finish(won) {
    if (state.finished) return;
    state.finished = true;
    state.running = false;
    state.won = won;
    if (won) {
      state.score += Math.max(0, 900 - Math.floor(state.time) * 3);
      sfx.win();
    } else {
      sfx.lose();
    }
    var best = loadBest() || { level: 0, score: 0, time: 0 };
    if (player.level > best.level || (player.level === best.level && state.score > best.score)) {
      best = { level: player.level, score: state.score, time: Math.floor(state.time) };
      saveBest(best);
    }
    setTimeout(showEnd, won ? 1100 : 700);
  }
  function win() { finish(true); }
  function lose() { finish(false); }

  function showEnd() {
    elHud.classList.add('hide');
    elEndCard.classList.remove('hide');
    elStartCard.classList.add('hide');
    elOverlay.classList.remove('hide');
    elEndTitle.textContent = state.won ? '神龙降世！' : '进化失败';
    elEndTitle.style.color = state.won ? '#ffd75c' : '';
    elEndSub.textContent = state.won
      ? '你从一只蝌蚪一路吃成了神龙 🐉'
      : '你止步于「' + SPECIES[player.level].name + '」，再来一次？';
    elEndLv.textContent = SPECIES[player.level].name;
    elEndScore.textContent = String(state.score);
    elEndTime.textContent = fmtTime(state.time);
    renderChain(player.level);
  }

  function refreshBestText() {
    var b = loadBest();
    elStartBest.textContent = b
      ? '最佳记录：' + SPECIES[clamp(b.level, 0, MAX_LEVEL)].name + ' · ' + b.score + ' 分'
      : '';
  }

  elStartBtn.addEventListener('click', start);
  elAgainBtn.addEventListener('click', start);

  /* ============================ 主循环 ============================ */
  var lastTs = 0;
  function frame(ts) {
    var dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    dt = clamp(dt, 0, 1 / 24);
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) lastTs = 0;
  });

  buildChains();
  renderChain(0);
  refreshBestText();
  reset();
  spawnBurst(30);   // 背景演示用
  requestAnimationFrame(frame);
})();
