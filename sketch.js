/*
  STOP THE GOLD TRUCKS — FINAL POLICE NET VERSION
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
  netCapture: 0.62,
  gameOver: 0.78,
  reload: 0.22,
  baseHit: 0.28,
};

let MUSIC_VOL = {
  menu: 0.45,
  gameplay: 0.36,
};

// ----------------------------------------------------
// Game vars
// ----------------------------------------------------
let trucks = [];
let captures = [];
let popups = [];

let score = 0;

// gold deliveries instead of hearts
let deliveredGold = 0;
let maxDeliveredGold = 3;

let spawnTimer = 0;
let spawnInterval = 1.0;
let maxTrucks = 3;

// difficulty scales by captured trucks
let trucksCaptured = 0;

// tutorial after start
let tutorialActive = false;

// reload / cooldown
let canShoot = true;
let shotCooldown = 0;
let shotCooldownDuration = 0.26;
let reloadSoundCooldown = 0;

// ----------------------------------------------------
// Hungarian text
// ----------------------------------------------------
let tutorialLines = [
  "Aranyszállító konvojok lépnek be",
  "Magyarországra.",
  "",
  "Magyar Péterhez próbálnak eljutni.",
  "",
  "Koppints a teherautókra,",
  "hogy a rendőrségi háló elfogja őket.",
  "",
  "Ne hagyd, hogy az arany",
  "eljusson Magyar Péterhez.",
  "",
  "Koppints a kezdéshez."
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
  spawnInterval = clamp(0.92 - trucksCaptured * 0.022, 0.42, 0.92);

  if (trucksCaptured < 4) {
    maxTrucks = 3;
  } else if (trucksCaptured < 10) {
    maxTrucks = 4;
  } else if (trucksCaptured < 18) {
    maxTrucks = 5;
  } else if (trucksCaptured < 30) {
    maxTrucks = 6;
  } else {
    maxTrucks = 7;
  }
}

function getTruckSpeedBonus() {
  return Math.min(300, trucksCaptured * 6.5);
}

function getZigAmountBonus() {
  return Math.min(42, trucksCaptured * 0.9);
}

function getGoldMeterImage() {
  if (deliveredGold <= 0) return img.goldMeter0;
  if (deliveredGold === 1) return img.goldMeter1;
  if (deliveredGold === 2) return img.goldMeter2;
  return img.goldMeter3;
}

// ----------------------------------------------------
// Preload
// ----------------------------------------------------
function preload() {
  img.bg = loadImage(assetPath("bg_farmland_v2.png"));
  img.base = loadImage(assetPath("base_peter_magyar.png"));
  img.truck = loadImage(assetPath("enemy_gold_truck.png"));
  img.truckNet = loadImage(assetPath("enemy_gold_truck_net.png"));
  img.net = loadImage(assetPath("fx_net.png"));

  img.buttonStart = loadImage(assetPath("ui_gold_button_start.png"));
  img.buttonRetry = loadImage(assetPath("ui_gold_button_retry.png"));

  img.goldMeter0 = loadImage(assetPath("ui_gold_meter_0.png"));
  img.goldMeter1 = loadImage(assetPath("ui_gold_meter_1.png"));
  img.goldMeter2 = loadImage(assetPath("ui_gold_meter_2.png"));
  img.goldMeter3 = loadImage(assetPath("ui_gold_meter_3.png"));

  img.screenTitle = loadImage(assetPath("screen_title_police.png"));
  img.screenGameOver = loadImage(assetPath("screen_game_over_fun.png"));

  try {
    fontMain = loadFont(assetPath("PressStart2P-Regular.ttf"));
  } catch (e) {
    fontMain = null;
  }

  sfx.button = loadSound(assetPath("sfx_button.wav"));
  sfx.netCapture = loadSound(assetPath("sfx_net_capture.wav"));
  sfx.gameOver = loadSound(assetPath("sfx_game_over.wav"));
  sfx.reload = loadSound(assetPath("sfx_reload.wav"));
  sfx.baseHit = loadSound(assetPath("sfx_base_hit.wav"));

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
  captures = [];
  popups = [];

  score = 0;
  deliveredGold = 0;

  trucksCaptured = 0;
  tutorialActive = false;

  spawnTimer = 0.2;
  spawnInterval = 0.92;
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
    pg.background(140, 110, 70);
  }
}

function drawBase() {
  if (!img.base) return;

  const targetW = BASE_W * 0.84;
  const ratio = img.base.height / img.base.width;
  const targetH = targetW * ratio;

  const x = 70;
  const y = BASE_H - targetH - 10;

  pg.image(img.base, x, y, targetW, targetH);
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

  const meterImg = getGoldMeterImage();
  if (meterImg) {
    const w = 250;
    const h = (meterImg.height / meterImg.width) * w;
    const x = BASE_W - w - 28;
    const y = BASE_H - h - 42;
    pg.image(meterImg, x, y, w, h);
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
    pg.text("KEZDÉS", btn.x + btn.w / 2, btn.y + btn.h / 2);
  }
}

function drawTutorialOverlay() {
  const w = 900;
  const h = 520;
  const x = (BASE_W - w) / 2;
  const y = BASE_H * 0.39;

  pg.push();
  pg.noStroke();
  pg.fill(0, 170);
  pg.rect(0, 0, BASE_W, BASE_H);

  pg.fill(0, 210);
  pg.rect(x, y, w, h, 24);

  pg.textFont(fontMain || "Arial");
  pg.textAlign(CENTER, TOP);
  pg.fill(255);
  pg.textSize(20);

  const startY = y + 34;
  const lineH = 32;

  for (let i = 0; i < tutorialLines.length; i++) {
    pg.text(tutorialLines[i], BASE_W / 2, startY + i * lineH);
  }

  pg.pop();
}

function drawPlaying() {
  drawBase();

  for (const t of trucks) t.draw(pg);
  for (const c of captures) c.draw(pg);
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

  pg.fill(0, 100);
  pg.rect(0, 0, BASE_W, BASE_H);

  pg.push();
  pg.textFont(fontMain || "Arial");
  pg.textAlign(CENTER, CENTER);

  pg.fill(255);
  pg.textSize(52);
  pg.text("VÉGE A JÁTÉKNAK", BASE_W / 2, BASE_H * 0.58);

  pg.fill(255, 220, 0);
  pg.textSize(22);
  pg.text("Az arany eljutott Magyar Péterhez.", BASE_W / 2, BASE_H * 0.65);

  pg.fill(255);
  pg.textSize(30);
  pg.text(`VÉGSŐ PONTSZÁM: ${score}`, BASE_W / 2, BASE_H * 0.72);

  const btn = getRetryButtonRect();
  if (img.buttonRetry) {
    pg.image(img.buttonRetry, btn.x, btn.y, btn.w, btn.h);
  } else {
    pg.fill(40);
    pg.rect(btn.x, btn.y, btn.w, btn.h, 16);
    pg.fill(255);
    pg.textSize(30);
    pg.text("PRÓBÁLD ÚJRA", btn.x + btn.w / 2, btn.y + btn.h / 2);
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
  for (const c of captures) c.update(dt);
  for (const p of popups) p.update(dt);

  trucks = trucks.filter(t => !t.dead);
  captures = captures.filter(c => !c.dead);
  popups = popups.filter(p => !p.dead);
}

// ----------------------------------------------------
// Entities
// ----------------------------------------------------
class Truck {
  constructor() {
    this.scale = random(0.86, 0.98);
    this.y = -240;
    this.dead = false;

    this.w = 170;
    this.h = 230;

    this.baseX = random(120, BASE_W - 120);
    this.x = this.baseX;

    // faster overall
    this.speed = random(390, 540) + getTruckSpeedBonus();

    // movement type
    const r = random();
    if (r < 0.45) {
      this.moveType = "straight";
    } else if (r < 0.72) {
      this.moveType = "drift";
    } else {
      this.moveType = "zigzag";
    }

    // natural drift
    this.driftVx = random(-22, 22);

    // curvy zig-zag params
    this.zigPhase = random(TWO_PI);
    this.zigTimer = 0;
    this.zigSpeed = random(1.2, 2.0);
    this.zigAmount = random(28, 58) + getZigAmountBonus();
  }

  getBottomDangerY() {
    return BASE_H - 330;
  }

  update(dt) {
    this.y += this.speed * dt;

    if (this.moveType === "straight") {
      this.x += this.driftVx * 0.18 * dt;
    } else if (this.moveType === "drift") {
      this.x += this.driftVx * dt;
    } else if (this.moveType === "zigzag") {
      this.zigTimer += dt;
      this.x = this.baseX + Math.sin(this.zigPhase + this.zigTimer * this.zigSpeed) * this.zigAmount;
    }

    if (this.moveType !== "zigzag") {
      if (this.x < 95 || this.x > BASE_W - 95) {
        this.driftVx *= -1;
      }
      this.x = clamp(this.x, 95, BASE_W - 95);
    } else {
      this.x = clamp(this.x, 95, BASE_W - 95);
    }

    if (this.y >= this.getBottomDangerY()) {
      this.dead = true;
      loseLife(this.x, this.y);
    }
  }

  draw(g) {
    if (!img.truck) return;

    const drawW = img.truck.width * this.scale;
    const drawH = img.truck.height * this.scale;

    g.push();
    g.imageMode(CENTER);
    g.image(img.truck, this.x, this.y, drawW, drawH);
    g.pop();
  }

  hitTest(px, py) {
    const drawW = img.truck.width * this.scale;
    const drawH = img.truck.height * this.scale;

    const left = this.x - drawW * 0.35;
    const right = this.x + drawW * 0.35;
    const top = this.y - drawH * 0.38;
    const bottom = this.y + drawH * 0.38;

    return px >= left && px <= right && py >= top && py <= bottom;
  }

  capture() {
    this.dead = true;

    captures.push(new CaptureEffect(this.x, this.y, this.scale));
    popups.push(new ScorePopup(this.x, this.y, "+100"));

    score += 100;
    trucksCaptured += 1;
    updateDifficultyFromKills();

    canShoot = false;
    shotCooldown = shotCooldownDuration;

    playSFX(sfx.netCapture, SFX_VOL.netCapture);
  }
}

class CaptureEffect {
  constructor(x, y, scale = 1) {
    this.x = x;
    this.y = y;
    this.scale = scale;
    this.life = 0.38;
    this.t = this.life;
    this.dead = false;
  }

  update(dt) {
    this.t -= dt;
    if (this.t <= 0) this.dead = true;
  }

  draw(g) {
    const a = clamp(this.t / this.life, 0, 1);

    g.push();
    g.imageMode(CENTER);
    g.tint(255, 255 * a);

    if (img.truckNet) {
      const w = img.truckNet.width * this.scale;
      const h = img.truckNet.height * this.scale;
      g.image(img.truckNet, this.x, this.y, w, h);
    } else if (img.truck) {
      const w = img.truck.width * this.scale;
      const h = img.truck.height * this.scale;
      g.image(img.truck, this.x, this.y, w, h);
    }

    if (img.net) {
      const pulse = 1 + (1 - a) * 0.1;
      const w = img.net.width * 0.45 * pulse;
      const h = img.net.height * 0.45 * pulse;
      g.image(img.net, this.x, this.y, w, h);
    }

    g.noTint();
    g.pop();
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

  deliveredGold += 1;

  if (deliveredGold < maxDeliveredGold) {
    playSFX(sfx.baseHit, SFX_VOL.baseHit);
  }

  if (deliveredGold >= maxDeliveredGold) {
    deliveredGold = maxDeliveredGold;
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
      truck.capture();
      return;
    }
  }
}

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py <= r.y + r.h && py >= r.y;
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
