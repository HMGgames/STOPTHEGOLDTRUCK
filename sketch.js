/*
  STOP THE GOLD TRUCKS — p5.js vertical arcade prototype V2
  ---------------------------------------------------------
  Required assets inside /assets:

  Images:
    bg_farmland.png
    base_parliament.png
    enemy_gold_truck.png
    fx_explosion.png
    prop_gold_bar.png
    ui_heart.png
    ui_button_start.png
    ui_button_retry.png
    screen_title.png
    screen_game_over.png

  Audio:
    sfx_button.wav
    sfx_explosion.wav
    sfx_game_over.wav
    sfx_reload.wav
    sfx_base_hit.wav
    music_menu.wav
    music_gameplay.mp3

  Optional:
    sfx_hit.wav

  IMPORTANT:
  Include p5.sound in your HTML.
*/

const ASSET_DIR = "assets/";

// ----------------------------------------------------
// Logical resolution (vertical)
// ----------------------------------------------------
const BASE_W = 1080;
const BASE_H = 1920;

// ----------------------------------------------------
// State
// ----------------------------------------------------
const STATE = {
  START: "START",
  PLAYING: "PLAYING",
  GAME_OVER: "GAME_OVER",
};

let gameState = STATE.START;

// ----------------------------------------------------
// Assets
// ----------------------------------------------------
let img = {};
let sfx = {};
let music = {};
let fontMain;

// ----------------------------------------------------
// Render fit
// ----------------------------------------------------
let pg;
let lastRender = { dx: 0, dy: 0, s: 1, dw: BASE_W, dh: BASE_H };

// ----------------------------------------------------
// Audio
// ----------------------------------------------------
let audioUnlocked = false;

// Master knobs
let MASTER_SFX_VOL = 0.72;
let MASTER_MUSIC_VOL = 0.82;

// Per-sound knobs
let SFX_VOL = {
  button: 0.55,
  explosion: 0.72,
  gameOver: 0.78,
  reload: 0.22,
  baseHit: 0.28,
  hit: 0.45,
};

let MUSIC_VOL = {
  menu: 0.45,
  gameplay: 0.36,
};

// ----------------------------------------------------
// Game vars
// ----------------------------------------------------
let trucks = [];
let explosions = [];
let goldBursts = [];
let popups = [];

let score = 0;
let lives = 3;
let maxLives = 3;

let spawnTimer = 0;
let spawnInterval = 1.00;
let maxTrucks = 3;

// difficulty scales by destroyed trucks
let trucksDestroyed = 0;

// tutorial after start
let tutorialActive = false;

// reload / cooldown
let canShoot = true;
let shotCooldown = 0;
let shotCooldownDuration = 0.26;
let reloadSoundCooldown = 0;

let tutorialLines = [
  "Gold convoys are racing across Hungary",
  "trying to deliver dirty money.",
  "",
  "Tap the trucks to launch missiles",
  "from Parliament and stop them.",
  "",
  "Don't let the gold reach the city.",
  "",
  "Tap to begin"
];

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------
function assetPath(fileName) {
  return ASSET_DIR + fileName;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function screenToWorld(sx, sy) {
  const { dx, dy, s } = lastRender;
  const wx = (sx - dx) / s;
  const wy = (sy - dy) / s;
  return {
    x: clamp(wx, 0, BASE_W),
    y: clamp(wy, 0, BASE_H),
  };
}

function renderToScreenFit(buffer) {
  const sx = width / BASE_W;
  const sy = height / BASE_H;
  const s = Math.min(sx, sy);

  const dw = BASE_W * s;
  const dh = BASE_H * s;

  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;

  lastRender = { dx, dy, s, dw, dh };

  background(0);
  image(buffer, dx, dy, dw, dh);
}

function unlockAudioOnce() {
  if (audioUnlocked) return;
  try { userStartAudio(); } catch (e) {}
  audioUnlocked = true;
  syncMusicToState();
}

function playSFX(sound, vol = 1.0) {
  if (!audioUnlocked || !sound) return;
  sound.setVolume(clamp(vol * MASTER_SFX_VOL, 0, 1));
  sound.play();
}

function loopMusic(track, vol = 0.4) {
  if (!audioUnlocked || !track) return;
  track.setVolume(clamp(vol * MASTER_MUSIC_VOL, 0, 1));
  if (!track.isPlaying()) track.loop();
}

function stopMusic(track) {
  if (!track) return;
  if (track.isPlaying()) track.stop();
}

function syncMusicToState() {
  if (!audioUnlocked) return;

  if (gameState === STATE.START) {
    stopMusic(music.gameplay);
    loopMusic(music.menu, MUSIC_VOL.menu);
  } else if (gameState === STATE.PLAYING) {
    stopMusic(music.menu);
    loopMusic(music.gameplay, MUSIC_VOL.gameplay);
  } else if (gameState === STATE.GAME_OVER) {
    stopMusic(music.gameplay);
    stopMusic(music.menu);
  }
}

function updateDifficultyFromKills() {
  // starts a bit harder, but scales more smoothly
  spawnInterval = clamp(1.00 - trucksDestroyed * 0.022, 0.48, 1.00);

  // slower ramp for simultaneous trucks
  if (trucksDestroyed < 5) {
  maxTrucks = 3;
} else if (trucksDestroyed < 12) {
  maxTrucks = 4;
} else if (trucksDestroyed < 22) {
  maxTrucks = 5;
} else if (trucksDestroyed < 34) {
  maxTrucks = 6;
} else {
  maxTrucks = 7;
}
}

function getTruckSpeedBonus() {
  // less explosive curve than before
  return Math.min(240, trucksDestroyed * 5.5);
}

// ----------------------------------------------------
// Preload
// ----------------------------------------------------
function preload() {
  img.bg = loadImage(assetPath("bg_farmland_v2.png"));
  img.parliament = loadImage(assetPath("base_parliament.png"));
  img.truck = loadImage(assetPath("enemy_gold_truck.png"));
  img.explosion = loadImage(assetPath("fx_explosion.png"));
  img.gold = loadImage(assetPath("prop_gold_bar.png"));
  img.heart = loadImage(assetPath("ui_heart.png"));
  img.buttonStart = loadImage(assetPath("ui_button_start.png"));
  img.buttonRetry = loadImage(assetPath("ui_button_retry.png"));
  img.screenTitle = loadImage(assetPath("screen_title.png"));
  img.screenGameOver = loadImage(assetPath("screen_game_over.png"));

  try {
    fontMain = loadFont(assetPath("PressStart2P-Regular.ttf"));
  } catch (e) {
    fontMain = null;
  }

  sfx.button = loadSound(assetPath("sfx_button.wav"));
  sfx.explosion = loadSound(assetPath("sfx_explosion.wav"));
  sfx.gameOver = loadSound(assetPath("sfx_game_over.wav"));
  sfx.reload = loadSound(assetPath("sfx_reload.wav"));
  sfx.baseHit = loadSound(assetPath("sfx_base_hit.wav"));

  try {
    sfx.hit = loadSound(assetPath("sfx_hit.wav"));
  } catch (e) {}

  music.menu = loadSound(assetPath("music_menu.wav"));
  music.gameplay = loadSound(assetPath("music_gameplay.mp3"));
}

// ----------------------------------------------------
// Setup
// ----------------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  pg = createGraphics(BASE_W, BASE_H);
  pg.pixelDensity(1);
  pg.noSmooth();

  textFont(fontMain || "Arial");
  resetGame();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ----------------------------------------------------
// Game flow
// ----------------------------------------------------
function resetGame() {
  trucks = [];
  explosions = [];
  goldBursts = [];
  popups = [];

  score = 0;
  lives = 3;

  trucksDestroyed = 0;
  tutorialActive = false;

  // Arranca un poco más difícil que antes
  spawnTimer = 0.25;
  spawnInterval = 1.00;
  maxTrucks = 3;

  canShoot = true;
  shotCooldown = 0;
  reloadSoundCooldown = 0;
}

function setState(next) {
  if (gameState === next) return;
  gameState = next;
  syncMusicToState();
}

// ----------------------------------------------------
// Draw loop
// ----------------------------------------------------
function draw() {
  const dt = deltaTime / 1000;

  pg.clear();
  drawBackground();

  if (gameState === STATE.START) {
    drawStartScreen();
  } else if (gameState === STATE.PLAYING) {
    if (!tutorialActive) {
      updatePlaying(dt);
    }
    drawPlaying();
    if (tutorialActive) {
      drawTutorialOverlay();
    }
  } else if (gameState === STATE.GAME_OVER) {
    drawGameOver();
  }

  renderToScreenFit(pg);
}

// ----------------------------------------------------
// Drawing
// ----------------------------------------------------
function drawBackground() {
  if (img.bg) {
    pg.image(img.bg, 0, 0, BASE_W, BASE_H);
  } else {
    pg.background(120, 170, 90);
  }
}

function drawParliament() {
  if (!img.parliament) return;

  const targetW = BASE_W * 1.05;
  const ratio = img.parliament.height / img.parliament.width;
  const targetH = targetW * ratio;

  const x = (BASE_W - targetW) / 2;
  const y = BASE_H - targetH - 0.2;

  pg.image(img.parliament, x, y, targetW, targetH);
}

function drawHUD() {
  pg.push();
  pg.textFont(fontMain || "Arial");
  pg.textAlign(LEFT, TOP);

  pg.fill(0, 180);
  pg.rect(26, 24, 320, 72, 14);
  pg.fill(255);
  pg.textSize(28);
  pg.text(`SCORE ${score}`, 44, 46);

  const heartSize = 56;
  const gap = 14;
  const totalW = maxLives * heartSize + (maxLives - 1) * gap;
  const startX = BASE_W - totalW - 30;
  const y = 30;

  for (let i = 0; i < lives; i++) {
    if (img.heart) {
      pg.image(img.heart, startX + i * (heartSize + gap), y, heartSize, heartSize);
    } else {
      pg.fill(220, 40, 50);
      pg.circle(startX + i * (heartSize + gap) + 28, y + 28, 42);
    }
  }

  if (!canShoot) {
    const barX = 26;
    const barY = 108;
    const barW = 220;
    const barH = 16;
    const p = 1 - clamp(shotCooldown / shotCooldownDuration, 0, 1);

    pg.fill(0, 160);
    pg.rect(barX, barY, barW, barH, 8);

    pg.fill(255, 180, 30);
    pg.rect(barX, barY, barW * p, barH, 8);
  }

  pg.pop();
}

function drawStartScreen() {
  if (img.screenTitle) {
    pg.image(img.screenTitle, 0, 0, BASE_W, BASE_H);
  } else {
    pg.fill(20, 20, 20, 200);
    pg.rect(0, 0, BASE_W, BASE_H);
  }

  const btn = getStartButtonRect();
  if (img.buttonStart) {
    pg.image(img.buttonStart, btn.x, btn.y, btn.w, btn.h);
  } else {
    pg.fill(40);
    pg.rect(btn.x, btn.y, btn.w, btn.h, 16);
    pg.fill(255);
    pg.textAlign(CENTER, CENTER);
    pg.textSize(36);
    pg.text("START GAME", btn.x + btn.w / 2, btn.y + btn.h / 2);
  }
}

function drawTutorialOverlay() {
  const w = 900;
  const h = 430;
  const x = (BASE_W - w) / 2;
  const y = BASE_H * 0.44;

  pg.push();

  pg.noStroke();
  pg.fill(0, 170);
  pg.rect(0, 0, BASE_W, BASE_H);

  pg.fill(0, 210);
  pg.rect(x, y, w, h, 24);

  pg.textFont(fontMain || "Arial");
  pg.textAlign(CENTER, TOP);

  pg.fill(255);
  pg.textSize(22);

  const startY = y + 36;
  const lineH = 34;

  for (let i = 0; i < tutorialLines.length; i++) {
    pg.text(tutorialLines[i], BASE_W / 2, startY + i * lineH);
  }

  pg.pop();
}

function drawPlaying() {
  drawParliament();

  for (const t of trucks) t.draw(pg);
  for (const e of explosions) e.draw(pg);
  for (const g of goldBursts) g.draw(pg);
  for (const p of popups) p.draw(pg);

  drawHUD();
}

function drawGameOver() {
  if (img.screenGameOver) {
    pg.image(img.screenGameOver, 0, 0, BASE_W, BASE_H);
  } else {
    pg.fill(0, 0, 0, 220);
    pg.rect(0, 0, BASE_W, BASE_H);
  }

  pg.fill(0, 130);
  pg.rect(0, 0, BASE_W, BASE_H);

  pg.push();
  pg.textFont(fontMain || "Arial");
  pg.textAlign(CENTER, CENTER);

  pg.fill(255);
  pg.textSize(52);
  pg.text("GAME OVER", BASE_W / 2, BASE_H * 0.58);

  pg.fill(255, 220, 0);
  pg.textSize(22);
  pg.text("The convoy broke through.", BASE_W / 2, BASE_H * 0.65);

  pg.fill(255);
  pg.textSize(32);
  pg.text(`FINAL SCORE: ${score}`, BASE_W / 2, BASE_H * 0.72);

  const btn = getRetryButtonRect();
  if (img.buttonRetry) {
    pg.image(img.buttonRetry, btn.x, btn.y, btn.w, btn.h);
  } else {
    pg.fill(40);
    pg.rect(btn.x, btn.y, btn.w, btn.h, 16);
    pg.fill(255);
    pg.textSize(34);
    pg.text("TRY AGAIN", btn.x + btn.w / 2, btn.y + btn.h / 2);
  }

  pg.pop();
}

function getStartButtonRect() {
  return {
    x: (BASE_W - 900) / 2,
    y: BASE_H * 0.81,
    w: 900,
    h: 220,
  };
}

function getRetryButtonRect() {
  return {
    x: (BASE_W - 520) / 2,
    y: BASE_H * 0.79,
    w: 520,
    h: 120,
  };
}

// ----------------------------------------------------
// Gameplay update
// ----------------------------------------------------
function updatePlaying(dt) {
  if (!canShoot) {
    shotCooldown -= dt;
    if (shotCooldown <= 0) {
      shotCooldown = 0;
      canShoot = true;
    }
  }

  if (reloadSoundCooldown > 0) {
    reloadSoundCooldown -= dt;
  }

  spawnTimer -= dt;
  if (spawnTimer <= 0 && trucks.length < maxTrucks) {
    trucks.push(new Truck());
    spawnTimer = spawnInterval;
  }

  for (const t of trucks) t.update(dt);
  for (const e of explosions) e.update(dt);
  for (const g of goldBursts) g.update(dt);
  for (const p of popups) p.update(dt);

  trucks = trucks.filter(t => !t.dead);
  explosions = explosions.filter(e => !e.dead);
  goldBursts = goldBursts.filter(g => !g.dead);
  popups = popups.filter(p => !p.dead);
}

// ----------------------------------------------------
// Entities
// ----------------------------------------------------
class Truck {
  constructor() {
    this.scale = random(0.86, 0.98);
    this.x = random(120, BASE_W - 120);
    this.y = -240;
    this.speed = random(340, 470) + getTruckSpeedBonus();
    this.dead = false;

    this.vx = random(-30, 30);

    this.w = 170;
    this.h = 230;
  }

  getBottomDangerY() {
    return BASE_H - 330;
  }

  update(dt) {
    this.y += this.speed * dt;
    this.x += this.vx * dt;

    if (this.x < 95 || this.x > BASE_W - 95) {
      this.vx *= -1;
    }

    if (this.y >= this.getBottomDangerY()) {
      this.dead = true;
      loseLife(this.x, this.y);
    }
  }

  draw(g) {
    if (!img.truck) {
      g.push();
      g.fill(40);
      g.rectMode(CENTER);
      g.rect(this.x, this.y, this.w, this.h, 16);
      g.pop();
      return;
    }

    const drawW = img.truck.width * this.scale;
    const drawH = img.truck.height * this.scale;

    g.push();
    g.imageMode(CENTER);
    g.image(img.truck, this.x, this.y, drawW, drawH);
    g.pop();
  }

  hitTest(px, py) {
    if (!img.truck) {
      return (
        px >= this.x - this.w / 2 &&
        px <= this.x + this.w / 2 &&
        py >= this.y - this.h / 2 &&
        py <= this.y + this.h / 2
      );
    }

    const drawW = img.truck.width * this.scale;
    const drawH = img.truck.height * this.scale;

    const left = this.x - drawW * 0.35;
    const right = this.x + drawW * 0.35;
    const top = this.y - drawH * 0.38;
    const bottom = this.y + drawH * 0.38;

    return px >= left && px <= right && py >= top && py <= bottom;
  }

  destroy() {
    this.dead = true;

    explosions.push(new Explosion(this.x, this.y, random(0.90, 1.10)));
    goldBursts.push(new GoldBurst(this.x, this.y));
    popups.push(new ScorePopup(this.x, this.y, "+100"));

    score += 100;
    trucksDestroyed += 1;
    updateDifficultyFromKills();

    canShoot = false;
    shotCooldown = shotCooldownDuration;

    playSFX(sfx.explosion, SFX_VOL.explosion);
  }
}

class Explosion {
  constructor(x, y, scale = 1) {
    this.x = x;
    this.y = y;
    this.scale = scale;
    this.life = 0.32;
    this.t = this.life;
    this.dead = false;
  }

  update(dt) {
    this.t -= dt;
    if (this.t <= 0) this.dead = true;
  }

  draw(g) {
    const a = clamp(this.t / this.life, 0, 1);

    if (img.explosion) {
      const pulse = 1 + (1 - a) * 0.15;
      const w = img.explosion.width * this.scale * pulse;
      const h = img.explosion.height * this.scale * pulse;

      g.push();
      g.imageMode(CENTER);
      g.tint(255, 255 * a);
      g.image(img.explosion, this.x, this.y, w, h);
      g.noTint();
      g.pop();
    } else {
      g.push();
      g.noStroke();
      g.fill(255, 180, 40, 220 * a);
      g.circle(this.x, this.y, 140 * this.scale);
      g.pop();
    }
  }
}

class GoldParticle {
  constructor(x, y, angle, speed) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - random(30, 80);
    this.gravity = 360;
    this.rot = random(-0.2, 0.2);
    this.angle = random(TWO_PI);
    this.scale = random(0.18, 0.28);
    this.life = 0.8;
    this.t = this.life;
    this.dead = false;
  }

  update(dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.dead = true;
      return;
    }

    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.rot;
  }

  draw(g) {
    const a = clamp(this.t / this.life, 0, 1);

    if (img.gold) {
      const w = img.gold.width * this.scale;
      const h = img.gold.height * this.scale;
      g.push();
      g.translate(this.x, this.y);
      g.rotate(this.angle);
      g.tint(255, 255 * a);
      g.imageMode(CENTER);
      g.image(img.gold, 0, 0, w, h);
      g.noTint();
      g.pop();
    }
  }
}

class GoldBurst {
  constructor(x, y) {
    this.list = [];
    this.dead = false;

    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = random(-PI * 0.95, -PI * 0.05);
      const speed = random(120, 320);
      this.list.push(new GoldParticle(x, y, angle, speed));
    }
  }

  update(dt) {
    for (const p of this.list) p.update(dt);
    this.list = this.list.filter(p => !p.dead);
    if (this.list.length === 0) this.dead = true;
  }

  draw(g) {
    for (const p of this.list) p.draw(g);
  }
}

class ScorePopup {
  constructor(x, y, text) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.life = 0.8;
    this.t = this.life;
    this.dead = false;
    this.vy = -60;
  }

  update(dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.dead = true;
      return;
    }
    this.y += this.vy * dt;
  }

  draw(g) {
    const a = clamp(this.t / this.life, 0, 1);
    g.push();
    g.textFont(fontMain || "Arial");
    g.textAlign(CENTER, CENTER);
    g.textSize(24);
    g.fill(0, 190 * a);
    g.text(this.text, this.x + 2, this.y + 2);
    g.fill(255, 220, 0, 255 * a);
    g.text(this.text, this.x, this.y);
    g.pop();
  }
}

// ----------------------------------------------------
// Life / fail
// ----------------------------------------------------
function loseLife(x, y) {
  if (gameState !== STATE.PLAYING) return;

  lives -= 1;
  explosions.push(new Explosion(x, y, 0.8));

  // base hit softer than before
  if (lives > 0) {
    playSFX(sfx.baseHit, SFX_VOL.baseHit);
  }

  if (lives <= 0) {
    lives = 0;
    playSFX(sfx.gameOver, SFX_VOL.gameOver);
    setState(STATE.GAME_OVER);
  }
}

// ----------------------------------------------------
// Input
// ----------------------------------------------------
function mousePressed() {
  handlePress(mouseX, mouseY);
  return false;
}

function touchStarted() {
  handlePress(mouseX, mouseY);
  return false;
}

function handlePress(sx, sy) {
  unlockAudioOnce();

  const { x, y } = screenToWorld(sx, sy);

  if (gameState === STATE.START) {
    const btn = getStartButtonRect();
    if (pointInRect(x, y, btn)) {
      playSFX(sfx.button, SFX_VOL.button);
      resetGame();
      setState(STATE.PLAYING);
      tutorialActive = true;
    }
    return;
  }

  if (gameState === STATE.GAME_OVER) {
    const btn = getRetryButtonRect();
    if (pointInRect(x, y, btn)) {
      playSFX(sfx.button, SFX_VOL.button);
      resetGame();
      setState(STATE.START);
    }
    return;
  }

  if (gameState !== STATE.PLAYING) return;

  if (tutorialActive) {
    tutorialActive = false;
    return;
  }

  if (!canShoot) {
    if (reloadSoundCooldown <= 0) {
      playSFX(sfx.reload, SFX_VOL.reload);
      reloadSoundCooldown = 0.10;
    }
    return;
  }

  for (let i = trucks.length - 1; i >= 0; i--) {
    const truck = trucks[i];
    if (truck.hitTest(x, y)) {
      truck.destroy();
      return;
    }
  }
}

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// ----------------------------------------------------
// Optional keyboard shortcuts
// ----------------------------------------------------
function keyPressed() {
  unlockAudioOnce();

  if (key === "r" || key === "R") {
    resetGame();
    setState(STATE.START);
  }

  if (gameState === STATE.PLAYING && tutorialActive) {
    tutorialActive = false;
  }
}
