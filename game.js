'use strict';
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: true });
  const shell = document.getElementById('gameShell');
  const el = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const mobileQuery = matchMedia('(pointer: coarse)');
  const COLORS = { cyan: '#62f5d2', pink: '#ff658a', gold: '#ffc77b', white: '#f3f5fa' };
  const keys = new Set();
  let W = 0, H = 0, dpr = 1, lastFrame = 0, raf = 0;
  let state = 'menu', player, enemies, bullets, enemyBullets, particles, pickups, props, decos;
  let runTime = 0, kills = 0, wave = 1, spawnClock = 0, shotClock = 0, shake = 0, score = 0;
  let upgrades = {}, xp = 0, xpNeeded = 8, level = 1, boss = null, bossSpawned = false;
  let pointerMove = false, joystick = { active: false, id: null, x: 0, y: 0 }, dashQueued = false;
  let toastTimer = 0, highScore = loadRecord();
  const D = { arena: { x: 0, y: 0, w: 0, h: 0 }, scale: 1 };

  function loadRecord() { try { return JSON.parse(localStorage.getItem('afterlight-best') || 'null'); } catch { return null; } }
  function saveRecord(data) { try { localStorage.setItem('afterlight-best', JSON.stringify(data)); } catch { /* private browsing */ } }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist2(a, b) { const x = a.x - b.x, y = a.y - b.y; return x * x + y * y; }
  function resize() {
    const rect = canvas.getBoundingClientRect(); W = rect.width; H = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = Math.min(W * .79, H * .78, 830);
    D.arena.w = size; D.arena.h = size * .72; D.arena.x = (W - D.arena.w) / 2; D.arena.y = (H - D.arena.h) / 2 + 28;
    if (player) clampPlayer();
    createProps(); draw();
  }
  function createProps() {
    props = []; decos = [];
    for (let i = 0; i < 16; i++) {
      const x = rand(D.arena.x + 25, D.arena.x + D.arena.w - 25), y = rand(D.arena.y + 25, D.arena.y + D.arena.h - 25);
      if (player && Math.hypot(x - player.x, y - player.y) < 70) continue;
      props.push({ x, y, r: rand(8, 18), hue: Math.random() < .5 ? COLORS.cyan : '#a989ff', phase: rand(0, TAU) });
    }
    for (let i = 0; i < 55; i++) decos.push({ x: Math.random() * W, y: Math.random() * H, r: rand(.5, 1.8), a: rand(.12, .48), p: rand(0, TAU) });
  }
  function arenaBounds() { return { left: D.arena.x + 18, right: D.arena.x + D.arena.w - 18, top: D.arena.y + 18, bottom: D.arena.y + D.arena.h - 18 }; }
  function clampPlayer() { const b = arenaBounds(); player.x = clamp(player.x, b.left + player.r, b.right - player.r); player.y = clamp(player.y, b.top + player.r, b.bottom - player.r); }
  function formatTime(s) { const n = Math.floor(s); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
  function setScreen(name) {
    ['menuScreen', 'pauseScreen', 'upgradeScreen', 'gameOverScreen'].forEach(id => { const node = el(id); node.classList.toggle('is-visible', id === name); node.setAttribute('aria-hidden', id === name ? 'false' : 'true'); });
  }
  function setToast(text) { const node = el('toast'); node.textContent = text; node.classList.add('show'); toastTimer = 2.3; }
  function resetGame() {
    player = { x: W / 2, y: H / 2 + 28, r: 12, speed: 210, hp: 100, maxHp: 100, angle: -Math.PI / 2, invuln: 0, dash: 0, dashCd: 0, fireRate: .36, bulletSpeed: 480, damage: 1, multishot: 1, magnet: 90, regen: 0, glow: 0 };
    enemies = []; bullets = []; enemyBullets = []; particles = []; pickups = []; runTime = 0; kills = 0; wave = 1; spawnClock = .8; shotClock = .2; shake = 0; score = 0; xp = 0; xpNeeded = 8; level = 1; boss = null; bossSpawned = false; upgrades = {};
    createProps(); updateHud();
  }
  function startGame() {
    resetGame(); state = 'playing'; shell.classList.add('in-game', 'playing'); shell.classList.remove('paused', 'leveling'); setScreen('');
    el('bossHud').classList.remove('active'); lastFrame = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function pauseGame() { if (state !== 'playing') return; state = 'paused'; shell.classList.add('paused'); setScreen('pauseScreen'); }
  function resumeGame() { if (state !== 'paused') return; state = 'playing'; shell.classList.remove('paused'); setScreen(''); lastFrame = performance.now(); raf = requestAnimationFrame(loop); }
  function exitToMenu() { state = 'menu'; shell.classList.remove('in-game', 'playing', 'paused', 'leveling'); setScreen('menuScreen'); el('bossHud').classList.remove('active'); cancelAnimationFrame(raf); draw(); }

  function loop(now) {
    if (state !== 'playing') return;
    const dt = Math.min((now - lastFrame) / 1000, .04); lastFrame = now;
    update(dt); draw();
    if (state === 'playing') raf = requestAnimationFrame(loop);
  }
  function update(dt) {
    runTime += dt; wave = Math.floor(runTime / 25) + 1; spawnClock -= dt; shotClock -= dt;
    if (toastTimer > 0) toastTimer -= dt; else el('toast').classList.remove('show');
    if (shake > 0) shake = Math.max(0, shake - dt * 25);
    if (player.invuln > 0) player.invuln -= dt;
    if (player.dash > 0) player.dash -= dt;
    if (player.dashCd > 0) player.dashCd -= dt;
    player.glow = Math.max(0, player.glow - dt);
    if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    movePlayer(dt);
    updateEnemies(dt); updateBullets(dt); updatePickups(dt);
    if (state !== 'playing') return;
    updateParticles(dt);
    if (shotClock <= 0) { shoot(); shotClock = player.fireRate; }
    if (!bossSpawned && runTime >= 90) spawnBoss();
    if (spawnClock <= 0 && !boss) { spawnEnemy(); const interval = Math.max(.38, 1.32 - runTime * .005); spawnClock = interval * rand(.68, 1.22); }
    if (boss && boss.hp <= 0) { killBoss(); }
    updateHud();
    if (player.hp <= 0) endGame();
  }
  function movePlayer(dt) {
    let x = 0, y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x--; if (keys.has('KeyD') || keys.has('ArrowRight')) x++;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y--; if (keys.has('KeyS') || keys.has('ArrowDown')) y++;
    if (joystick.active) { x += joystick.x; y += joystick.y; }
    const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
    const dash = dashQueued; dashQueued = false;
    if (dash && player.dashCd <= 0 && len > .1) { player.dash = .19; player.dashCd = 1.15; player.invuln = .27; burst(player.x, player.y, COLORS.cyan, 12, 150); }
    const speed = player.speed * (player.dash > 0 ? 3.2 : 1);
    player.x += x * speed * dt; player.y += y * speed * dt;
    if (len > .1) player.angle = Math.atan2(y, x);
    clampPlayer();
  }
  function spawnEnemy() {
    const b = arenaBounds(), edge = Math.floor(Math.random() * 4); let x, y;
    if (edge === 0) { x = rand(b.left, b.right); y = b.top; } else if (edge === 1) { x = b.right; y = rand(b.top, b.bottom); } else if (edge === 2) { x = rand(b.left, b.right); y = b.bottom; } else { x = b.left; y = rand(b.top, b.bottom); }
    const roll = Math.random(), type = runTime > 55 && roll > .78 ? 'shooter' : runTime > 30 && roll > .57 ? 'brute' : 'stalker';
    const scale = 1 + Math.min(runTime / 100, 1.25);
    const data = type === 'brute' ? { r: 17, hp: 4, speed: 43, damage: 18, color: COLORS.gold, points: 3 } : type === 'shooter' ? { r: 11, hp: 2, speed: 55, damage: 11, color: '#b892ff', points: 2, shoot: rand(1.2, 2.5) } : { r: 10, hp: 2, speed: 72, damage: 12, color: COLORS.pink, points: 1 };
    enemies.push({ x, y, ...data, hp: Math.ceil(data.hp * scale), maxHp: Math.ceil(data.hp * scale), speed: data.speed * (1 + Math.min(runTime / 180, .6)), hit: 0, phase: rand(0, TAU), type });
  }
  function spawnBoss() {
    bossSpawned = true; boss = { x: D.arena.x + D.arena.w / 2, y: D.arena.y + 54, r: 27, hp: 70 + Math.floor(runTime * .2), maxHp: 70 + Math.floor(runTime * .2), speed: 33, hit: 0, shoot: 1.5, phase: 0 };
    el('bossHud').classList.add('active'); setToast('HOSTILE SIGNAL DETECTED'); shake = 4;
  }
  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i], a = Math.atan2(player.y - e.y, player.x - e.x); e.phase += dt * 3; if (e.hit > 0) e.hit -= dt;
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if (e.type === 'shooter') {
        if (d > 230) { e.x += Math.cos(a) * e.speed * dt; e.y += Math.sin(a) * e.speed * dt; }
        if (d < 175) { e.x -= Math.cos(a) * e.speed * .55 * dt; e.y -= Math.sin(a) * e.speed * .55 * dt; }
        e.shoot -= dt; if (e.shoot <= 0 && d < 380) { enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 145, vy: Math.sin(a) * 145, r: 5, damage: e.damage, life: 3, color: e.color }); e.shoot = rand(1.6, 2.7); }
      } else { e.x += Math.cos(a) * e.speed * dt; e.y += Math.sin(a) * e.speed * dt; }
      if (d < e.r + player.r && player.invuln <= 0) hurtPlayer(e.damage);
    }
    if (boss) {
      boss.phase += dt; boss.hit = Math.max(0, boss.hit - dt); boss.shoot -= dt;
      const tx = player.x + Math.cos(boss.phase * .4) * 95, ty = D.arena.y + 58 + Math.sin(boss.phase * .65) * 32, a = Math.atan2(ty - boss.y, tx - boss.x);
      boss.x += Math.cos(a) * boss.speed * dt; boss.y += Math.sin(a) * boss.speed * dt;
      if (boss.shoot <= 0) { const aim = Math.atan2(player.y - boss.y, player.x - boss.x); for (let j = -1; j <= 1; j++) { const ang = aim + j * .22; enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(ang) * 180, vy: Math.sin(ang) * 180, r: 6, damage: 13, life: 4, color: COLORS.pink }); } boss.shoot = 1.25; }
      if (Math.hypot(boss.x - player.x, boss.y - player.y) < boss.r + player.r && player.invuln <= 0) hurtPlayer(22);
    }
  }
  function shoot() {
    let target = null, best = 400 * 400;
    for (const e of enemies) { const d = dist2(player, e); if (d < best) { best = d; target = e; } }
    if (boss && dist2(player, boss) < best) target = boss;
    if (!target) return;
    const a = Math.atan2(target.y - player.y, target.x - player.x); player.angle = a;
    for (let i = 0; i < player.multishot; i++) { const offset = (i - (player.multishot - 1) / 2) * .14 + rand(-.035, .035), ang = a + offset; bullets.push({ x: player.x + Math.cos(ang) * 15, y: player.y + Math.sin(ang) * 15, vx: Math.cos(ang) * player.bulletSpeed, vy: Math.sin(ang) * player.bulletSpeed, r: 3, damage: player.damage, life: 1.2 }); }
  }
  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) { const e = enemies[j]; if (dist2(b, e) < (e.r + b.r) ** 2) { e.hp -= b.damage; e.hit = .1; burst(b.x, b.y, e.color, 3, 35); hit = true; if (e.hp <= 0) killEnemy(j); break; } }
      if (!hit && boss && dist2(b, boss) < (boss.r + b.r) ** 2) { boss.hp -= b.damage; boss.hit = .1; hit = true; burst(b.x, b.y, COLORS.pink, 3, 45); }
      if (hit || b.life <= 0 || b.x < D.arena.x || b.x > D.arena.x + D.arena.w || b.y < D.arena.y || b.y > D.arena.y + D.arena.h) bullets.splice(i, 1);
    }
    for (let i = enemyBullets.length - 1; i >= 0; i--) { const b = enemyBullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (dist2(b, player) < (b.r + player.r) ** 2 && player.invuln <= 0) { hurtPlayer(b.damage); enemyBullets.splice(i, 1); continue; } if (b.life <= 0) enemyBullets.splice(i, 1); }
  }
  function killEnemy(index) {
    const e = enemies[index]; enemies.splice(index, 1); kills++; score += e.points * 10; burst(e.x, e.y, e.color, 12, 120); pickups.push({ x: e.x, y: e.y, r: 5, type: 'xp', life: 12, phase: rand(0, TAU) });
    if (Math.random() < .075) pickups.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), r: 6, type: 'heal', life: 10, phase: 0 });
  }
  function killBoss() { burst(boss.x, boss.y, COLORS.pink, 46, 240); for (let i = 0; i < 8; i++) pickups.push({ x: boss.x + rand(-40, 40), y: boss.y + rand(-35, 35), r: 6, type: 'xp', life: 18, phase: 0 }); pickups.push({ x: boss.x, y: boss.y, r: 8, type: 'heal', life: 18, phase: 0 }); boss = null; el('bossHud').classList.remove('active'); kills += 1; score += 100; setToast('WARDEN SILENCED  //  SIGNAL SECURED'); shake = 12; }
  function hurtPlayer(amount) { player.hp -= amount; player.invuln = .52; shake = 7; burst(player.x, player.y, COLORS.pink, 10, 120); }
  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) { const p = pickups[i]; p.life -= dt; p.phase += dt * 3; const d = Math.hypot(player.x - p.x, player.y - p.y); if (d < player.magnet) { const pull = clamp((player.magnet - d) / player.magnet, .08, .85); p.x += (player.x - p.x) * pull * dt * 4; p.y += (player.y - p.y) * pull * dt * 4; }
      if (d < player.r + p.r + 5) { if (p.type === 'xp') { xp++; if (xp >= xpNeeded) { burst(p.x, p.y, COLORS.cyan, 5, 45); pickups.splice(i, 1); levelUp(); return; } } else player.hp = Math.min(player.maxHp, player.hp + 25); burst(p.x, p.y, p.type === 'xp' ? COLORS.cyan : COLORS.pink, 5, 45); pickups.splice(i, 1); continue; }
      if (p.life <= 0) pickups.splice(i, 1);
    }
  }
  function updateParticles(dt) { for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(.045, dt); p.vy *= Math.pow(.045, dt); p.life -= dt; if (p.life <= 0) particles.splice(i, 1); } }
  function burst(x, y, color, count, force) { for (let i = 0; i < count; i++) { const a = Math.random() * TAU, speed = rand(force * .2, force); particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(.18, .55), max: .55, r: rand(1, 3), color }); } }
  const UPGRADE_LIST = [
    { id: 'rapid', icon: '⌁', title: 'QUICK HANDS', desc: 'Fire 22% faster.', apply: () => player.fireRate *= .78 },
    { id: 'power', icon: '✳', title: 'HOT LOAD', desc: 'Shots hit 1 extra damage.', apply: () => player.damage += 1 },
    { id: 'stride', icon: '➤', title: 'GHOST STEP', desc: 'Move 14% faster.', apply: () => player.speed *= 1.14 },
    { id: 'vital', icon: '♡', title: 'DEEP BREATH', desc: 'Restore 40% of your vitals.', apply: () => player.hp = Math.min(player.maxHp, player.hp + 40) },
    { id: 'armor', icon: '⬡', title: 'SECOND SKIN', desc: 'Max vitals +25. Heal 25.', apply: () => { player.maxHp += 25; player.hp += 25; } },
    { id: 'split', icon: '⋔', title: 'SPLIT SIGNAL', desc: 'Fire one extra shot per volley.', apply: () => player.multishot = Math.min(5, player.multishot + 1) },
    { id: 'magnet', icon: '◉', title: 'DEEP FIELD', desc: 'Collect signal from further away.', apply: () => player.magnet += 65 },
    { id: 'repair', icon: '✚', title: 'SLOW REPAIR', desc: 'Regenerate 1.2 vitals each second.', apply: () => player.regen += 1.2 }
  ];
  function levelUp() {
    if (state === 'levelup') return;
    level++; xp -= xpNeeded; xpNeeded = Math.ceil(xpNeeded * 1.34); state = 'levelup'; shell.classList.add('leveling'); shell.classList.remove('playing');
    const available = UPGRADE_LIST.filter(u => u.id !== 'split' || player.multishot < 5);
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const choices = shuffled.slice(0, 3); const grid = el('upgradeGrid'); grid.innerHTML = '';
    choices.forEach(u => { const button = document.createElement('button'); button.className = 'upgrade-card'; button.innerHTML = `<span class="upgrade-icon">${u.icon}</span><h3>${u.title}</h3><p>${u.desc}</p>`; button.addEventListener('click', () => { u.apply(); upgrades[u.id] = (upgrades[u.id] || 0) + 1; state = 'playing'; shell.classList.remove('leveling'); shell.classList.add('playing'); setScreen(''); if (xp >= xpNeeded) levelUp(); else { lastFrame = performance.now(); raf = requestAnimationFrame(loop); } }); grid.appendChild(button); });
    setScreen('upgradeScreen');
  }
  function updateHud() {
    el('waveValue').textContent = String(wave).padStart(2, '0'); el('timeValue').textContent = formatTime(runTime); el('scoreValue').textContent = String(score).padStart(4, '0'); el('killsValue').textContent = String(kills).padStart(3, '0');
    if (!player) return; el('healthText').textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`; el('healthFill').style.width = `${clamp(player.hp / player.maxHp * 100, 0, 100)}%`; el('levelText').textContent = `LV ${String(level).padStart(2, '0')}`; el('xpText').textContent = `${xp} / ${xpNeeded}`; el('xpFill').style.width = `${xp / xpNeeded * 100}%`; if (boss) el('bossFill').style.width = `${clamp(boss.hp / boss.maxHp * 100, 0, 100)}%`;
  }
  function endGame() {
    state = 'gameover'; shell.classList.remove('playing'); shell.classList.remove('in-game'); shell.classList.remove('paused'); shell.classList.remove('leveling');
    const isBest = !highScore || score > highScore.score; if (isBest) { highScore = { score, time: runTime, kills, wave }; saveRecord(highScore); }
    el('finalScore').textContent = String(score).padStart(4, '0'); el('finalTime').textContent = formatTime(runTime); el('finalWave').textContent = String(wave).padStart(2, '0'); el('finalKills').textContent = String(kills).padStart(3, '0'); el('newRecord').classList.toggle('visible', isBest); setScreen('gameOverScreen'); cancelAnimationFrame(raf);
  }

  function draw() {
    if (!ctx || !W || !H) return; ctx.clearRect(0, 0, W, H); const time = performance.now() / 1000;
    const bg = ctx.createRadialGradient(W * .5, H * .48, 0, W * .5, H * .48, Math.max(W, H) * .7); bg.addColorStop(0, '#11172a'); bg.addColorStop(.52, '#0a0e1b'); bg.addColorStop(1, '#060810'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    for (const d of decos || []) { ctx.globalAlpha = d.a * (.7 + Math.sin(time + d.p) * .3); ctx.fillStyle = '#d4e5ff'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    if (D.arena.w) drawArena(time);
    ctx.save(); if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    (pickups || []).forEach(p => drawPickup(p)); (bullets || []).forEach(b => drawBullet(b)); (enemyBullets || []).forEach(b => drawEnemyBullet(b)); (enemies || []).forEach(e => drawEnemy(e, time)); if (boss) drawBoss(boss, time); (particles || []).forEach(p => drawParticle(p)); if (player && state !== 'menu') drawPlayer(time); ctx.restore();
    if (state === 'menu') drawAmbient();
  }
  function drawArena(time) {
    const a = D.arena; ctx.save();
    ctx.shadowColor = '#62f5d222'; ctx.shadowBlur = 30; ctx.fillStyle = 'rgba(11,16,30,.76)'; ctx.fillRect(a.x, a.y, a.w, a.h); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(98,245,210,.17)'; ctx.lineWidth = 1; ctx.strokeRect(a.x, a.y, a.w, a.h);
    const grad = ctx.createLinearGradient(a.x, a.y, a.x + a.w, a.y + a.h); grad.addColorStop(0, 'rgba(98,245,210,.025)'); grad.addColorStop(.5, 'rgba(135,148,255,.025)'); grad.addColorStop(1, 'rgba(255,101,138,.02)'); ctx.fillStyle = grad; ctx.fillRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2);
    ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
    const spacing = 42; ctx.strokeStyle = 'rgba(147,171,211,.055)'; ctx.lineWidth = 1; for (let x = a.x; x < a.x + a.w; x += spacing) { ctx.beginPath(); ctx.moveTo(x, a.y); ctx.lineTo(x, a.y + a.h); ctx.stroke(); } for (let y = a.y; y < a.y + a.h; y += spacing) { ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(a.x + a.w, y); ctx.stroke(); }
    props?.forEach(p => { const pulse = .6 + Math.sin(time * 1.2 + p.phase) * .25; ctx.globalAlpha = pulse; ctx.fillStyle = 'rgba(14,20,34,.95)'; ctx.strokeStyle = `${p.hue}35`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = p.hue; ctx.globalAlpha = pulse * .32; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, TAU); ctx.fill(); }); ctx.globalAlpha = 1; ctx.restore();
    drawCorner(a.x, a.y, 1, 1); drawCorner(a.x + a.w, a.y, -1, 1); drawCorner(a.x, a.y + a.h, 1, -1); drawCorner(a.x + a.w, a.y + a.h, -1, -1);
    const label = 'NORTH DISTRICT   /   SECTOR 09'; ctx.font = '8px "DM Mono", monospace'; ctx.fillStyle = 'rgba(176,192,218,.44)'; ctx.fillText(label, a.x, a.y - 12); const rec = 'SIGNAL: UNSTABLE'; ctx.textAlign = 'right'; ctx.fillText(rec, a.x + a.w, a.y - 12); ctx.textAlign = 'left'; ctx.restore();
  }
  function drawCorner(x, y, sx, sy) { ctx.strokeStyle = 'rgba(98,245,210,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + sy * 15); ctx.lineTo(x, y); ctx.lineTo(x + sx * 15, y); ctx.stroke(); }
  function drawPlayer(time) {
    const p = player; if (p.invuln > 0 && Math.floor(time * 22) % 2) return; const boost = p.dash > 0;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = boost ? 35 : 18;
    ctx.fillStyle = boost ? '#c1fff2' : '#b5ffed'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -9); ctx.lineTo(-6, 0); ctx.lineTo(-10, 9); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#101b26'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(98,245,210,.24)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8 + Math.sin(time * 5) * 1.5, 0, TAU); ctx.stroke();
    if (p.dashCd > 0) { ctx.strokeStyle = 'rgba(98,245,210,.22)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 13, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / 1.15)); ctx.stroke(); }
  }
  function drawEnemy(e, time) {
    ctx.save(); ctx.translate(e.x, e.y); const pulse = Math.sin(time * 5 + e.phase) * 1.5; ctx.shadowColor = e.color; ctx.shadowBlur = e.hit > 0 ? 23 : 12; ctx.fillStyle = e.hit > 0 ? '#fff' : `${e.color}d9`; ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
    if (e.type === 'brute') { ctx.rotate(time * .35 + e.phase); ctx.beginPath(); ctx.moveTo(0, -e.r - pulse); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r + pulse); ctx.lineTo(-e.r, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (e.type === 'shooter') { ctx.rotate(Math.PI / 4); ctx.fillRect(-e.r * .72, -e.r * .72, e.r * 1.44, e.r * 1.44); ctx.strokeRect(-e.r * .72, -e.r * .72, e.r * 1.44, e.r * 1.44); }
    else { ctx.beginPath(); for (let i = 0; i < 6; i++) { const ang = i * TAU / 6 + time * .5; const r = e.r + (i % 2 ? 0 : pulse); const x = Math.cos(ang) * r, y = Math.sin(ang) * r; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.shadowBlur = 0; ctx.fillStyle = '#171420'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); ctx.restore();
    if (e.hp < e.maxHp) { ctx.fillStyle = '#ffffff22'; ctx.fillRect(e.x - e.r, e.y - e.r - 7, e.r * 2, 2); ctx.fillStyle = e.color; ctx.fillRect(e.x - e.r, e.y - e.r - 7, e.r * 2 * e.hp / e.maxHp, 2); }
  }
  function drawBoss(b, time) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(time * .22); ctx.shadowColor = COLORS.pink; ctx.shadowBlur = b.hit > 0 ? 35 : 22; ctx.strokeStyle = COLORS.pink; ctx.fillStyle = b.hit > 0 ? '#fff' : '#ff658a35'; ctx.lineWidth = 2;
    ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12, r = i % 2 ? b.r * .72 : b.r; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.rotate(-time * .45); ctx.beginPath(); ctx.arc(0, 0, b.r * .48, 0, TAU); ctx.stroke(); ctx.fillStyle = COLORS.pink; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill(); ctx.restore();
  }
  function drawBullet(b) { ctx.save(); ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 12; ctx.fillStyle = '#d6fff7'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.restore(); }
  function drawEnemyBullet(b) { ctx.save(); ctx.shadowColor = b.color; ctx.shadowBlur = 12; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.restore(); }
  function drawPickup(p) { const bob = Math.sin(p.phase) * 2; ctx.save(); ctx.translate(p.x, p.y + bob); const color = p.type === 'xp' ? COLORS.cyan : COLORS.pink; ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.fillStyle = color; ctx.rotate(Math.PI / 4); ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r); ctx.restore(); }
  function drawParticle(p) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  function drawAmbient() { const t = performance.now() / 1000; const x = W * .66, y = H * .52; ctx.save(); ctx.globalAlpha = .3; ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 28; ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(t * 2) * 2, 0, TAU); ctx.stroke(); ctx.rotate(t * .35); ctx.beginPath(); ctx.moveTo(x - 34, y); ctx.lineTo(x + 34, y); ctx.moveTo(x, y - 34); ctx.lineTo(x, y + 34); ctx.stroke(); ctx.restore(); }

  function updateRecordDisplay() { el('bestScore').textContent = highScore ? String(highScore.score).padStart(4, '0') : '—'; el('bestMeta').textContent = highScore ? `${formatTime(highScore.time)} SURVIVED  ·  ${highScore.kills} THREATS` : 'NO FIELD DATA'; }
  function onKeyDown(e) { if (state === 'playing' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (e.repeat && e.code === 'Space') return; keys.add(e.code); if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame(); } if (e.code === 'Space' && state === 'playing') dashQueued = true; if ((e.code === 'Enter' || e.code === 'Space') && state === 'menu') startGame(); if (e.code === 'Enter' && state === 'gameover') startGame(); }
  function onKeyUp(e) { keys.delete(e.code); }
  function joyStart(e) { e.preventDefault(); joystick.active = true; joystick.id = e.pointerId; el('joystick').setPointerCapture(e.pointerId); joyMove(e); }
  function joyMove(e) { if (!joystick.active || e.pointerId !== joystick.id) return; const rect = el('joystick').getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2; let dx = (e.clientX - cx) / 40, dy = (e.clientY - cy) / 40, len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; } joystick.x = dx; joystick.y = dy; el('joyKnob').style.transform = `translate(${dx * 34}px, ${dy * 34}px)`; }
  function joyEnd(e) { if (e.pointerId !== joystick.id) return; joystick.active = false; joystick.id = null; joystick.x = joystick.y = 0; el('joyKnob').style.transform = ''; }
  el('startButton').addEventListener('click', startGame); el('retryButton').addEventListener('click', startGame); el('menuButton').addEventListener('click', exitToMenu); el('pauseButton').addEventListener('click', pauseGame); el('resumeButton').addEventListener('click', resumeGame); el('quitButton').addEventListener('click', exitToMenu); el('dashButton').addEventListener('pointerdown', e => { e.preventDefault(); dashQueued = true; });
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', () => { keys.clear(); if (state === 'playing') pauseGame(); });
  el('joystick').addEventListener('pointerdown', joyStart); el('joystick').addEventListener('pointermove', joyMove); el('joystick').addEventListener('pointerup', joyEnd); el('joystick').addEventListener('pointercancel', joyEnd);
  window.addEventListener('resize', resize); document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pauseGame(); });
  updateRecordDisplay(); resize();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
})();
