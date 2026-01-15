const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const keys = {};
document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

// Sounds (you need these .wav files in the same folder)
const sndPunch = new Audio("punch.wav");
const sndHit = new Audio("hit.wav");
const sndSpecial = new Audio("special.wav");
const sndGun = new Audio("gun.wav"); // bullet sound

const gravity = 0.8;
const ground = 360;

let cameraShake = 0;
let slowMo = 1;
let bullets = [];
let gameOver = false;
let mode = "multi";

class Fighter {
  constructor(x, face, color, stats, ai=false){
    this.x = x; this.y = ground; this.vy = 0;
    this.face = face; this.color = color;
    this.maxHp = stats.hp; this.hp = stats.hp;
    this.speed = stats.speed; this.power = stats.power;
    this.energy = 0; this.state="idle"; this.combo=0;
    this.lastAttack=0; this.flash=0; this.ai=ai;
  }

  draw(){
    ctx.save();
    if(this.flash>0){ ctx.globalAlpha=0.5; this.flash--; }
    ctx.strokeStyle=this.color; ctx.lineWidth=3;

    let crouchOffset = this.state==="crouch"?25:50;

    ctx.beginPath(); ctx.arc(this.x,this.y-crouchOffset-10,10,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(this.x,this.y-crouchOffset); ctx.lineTo(this.x,this.y); ctx.stroke();

    let reach = this.state==="punch"?30:this.state==="kick"?45:this.state==="special"?65:12;
    ctx.beginPath();
    ctx.moveTo(this.x,this.y-crouchOffset+10);
    ctx.lineTo(this.x+reach*this.face,this.y-crouchOffset+10);
    ctx.stroke();
    ctx.restore();
  }

  physics(){
    this.y += this.vy;
    this.vy += gravity;
    if(this.y>ground){ this.y=ground; this.vy=0; }
  }
}

const fighterStats = [
  {hp:100,speed:5,power:1},
  {hp:120,speed:4,power:1.2},
  {hp:80,speed:6,power:1.4}
];

let p1,p2;

function startGame(selectedMode){
  mode = selectedMode;
  document.getElementById("modeSelect").style.display="none";

  p1 = new Fighter(200,1,"cyan",fighterStats[0]);
  if(mode==="single") p2 = new Fighter(700,-1,"red",fighterStats[1],true);
  else p2 = new Fighter(700,-1,"red",fighterStats[1]);

  loop();
}

function hit(a,b,range){ return Math.abs(a.x-b.x)<range && Math.abs(a.y-b.y)<40; }

function attack(att,def,type){
  const now = Date.now();
  if(now-att.lastAttack<180) return;
  att.lastAttack=now; att.state=type;

  let dmg=0, range=0;
  if(type==="punch"){ dmg=5; range=30; }
  if(type==="kick"){ dmg=8; range=45; }
  if(type==="special"){ dmg=18; range=70; }

  if(hit(att,def,range)){
    def.hp -= dmg*att.power;
    def.flash=6; def.x+=att.face*18;
    cameraShake = type==="special"?15:6;
    sndHit.play();
  }
}

function aiControl(){
  if(!p2.ai) return;
  if(p2.x>p1.x) p2.x-=p2.speed; else p2.x+=p2.speed;
  if(Math.random()<0.01 && p2.vy===0) p2.vy=-14;
  if(Math.abs(p2.x-p1.x)<40) attack(p2,p1,"punch");
}

// PLAYER CONTROLS
function control(p,enemy,keysMap){
  if(keys[keysMap.left]) p.x-=p.speed;
  if(keys[keysMap.right]) p.x+=p.speed;
  if(keys[keysMap.jump] && p.vy===0) p.vy=-15;
  if(keys[keysMap.crouch]) p.state="crouch"; else p.state="idle";

  if(keys[keysMap.punch]){ sndPunch.play(); attack(p,enemy,"punch"); p.combo++; p.energy+=2; }
  if(keys[keysMap.kick] && p.combo>=2){ attack(p,enemy,"kick"); p.combo=0; p.energy+=3; }
  if(keys[keysMap.special] && p.energy>=100){ sndSpecial.play(); attack(p,enemy,"special"); p.energy=0; }
  p.energy = Math.min(100,p.energy+0.05);
}

// BULLETS WITH TRAIL
class Bullet{
  constructor(x,y,dir,color,damage,owner){
    this.x = x;
    this.y = y;
    this.speed = 12 * dir;
    this.color = color;
    this.damage = damage;
    this.owner = owner;
    this.active = true;
    this.trail = [];
  }

  update(){
    this.x += this.speed;
    this.trail.push({x:this.x,y:this.y});
    if(this.trail.length > 10) this.trail.shift();
    if(this.x < 0 || this.x > canvas.width) this.active = false;
  }

  draw(){
    for(let i=0;i<this.trail.length;i++){
      let pos = this.trail[i];
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, i*0.7, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,0,${i/this.trail.length})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI*2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

function shootControls(){
  if(gameOver) return;

  if(keys["j"]){
    bullets.push(
      new Bullet(p1.x, p1.y - 40, p1.face, "yellow", 10, p1)
    );
    sndGun.currentTime = 0;
    sndGun.play();
    keys["j"] = false;
  }

  if(mode === "multi" && keys[";"]){
    bullets.push(
      new Bullet(p2.x, p2.y - 40, p2.face, "orange", 10, p2)
    );
    sndGun.currentTime = 0;
    sndGun.play();
    keys[";"] = false;
  }
}

function handleBullets(){
  for(let i = bullets.length - 1; i >= 0; i--){
    const b = bullets[i];

    b.update();
    b.draw();

    [p1, p2].forEach(p => {
      if(
        b.owner &&                 // owner exists
        p !== b.owner &&           // no self hit
        Math.abs(b.x - p.x) < 30 &&// wider hitbox
        Math.abs(b.y - p.y) < 60
      ){
        p.hp -= b.damage;          // DAMAGE
        p.flash = 6;
        sndHit.currentTime = 0;
        sndHit.play();
        b.active = false;
      }
    });

    if(!b.active){
      bullets.splice(i, 1); // safe remove
    }
  }
}


function updateUI(){
  document.getElementById("p1hp").style.width=(p1.hp/p1.maxHp*100)+"%";
  document.getElementById("p2hp").style.width=(p2.hp/p2.maxHp*100)+"%";
  document.getElementById("p1en").style.width=p1.energy+"%";
  document.getElementById("p2en").style.width=p2.energy+"%";
}

function showWinner(text){
  gameOver=true;
  const div=document.createElement("div"); div.innerText=text;
  div.style.cssText="color:gold;font-size:48px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)";
  document.body.appendChild(div);
  const btn=document.createElement("button"); btn.innerText="Restart";
  btn.style.cssText="font-size:24px;position:absolute;top:60%;left:50%;transform:translateX(-50%)";
  document.body.appendChild(btn);
  btn.onclick=()=>location.reload();
}

// MAIN LOOP
function loop(){
  if(gameOver) return;
  ctx.setTransform(1,0,0,1,0,0);
  if(cameraShake>0){ ctx.translate(Math.random()*6-3,Math.random()*6-3); cameraShake--; }
  ctx.clearRect(0,0,canvas.width,canvas.height);

  shootControls();
  if(mode==="multi") control(p2,p1,{left:"ArrowLeft",right:"ArrowRight",jump:"ArrowUp",crouch:"ArrowDown",punch:"0",kick:".",special:"/"});
  control(p1,p2,{left:"a",right:"d",jump:"w",crouch:"s",punch:"f",kick:"g",special:"h"});
  if(mode==="single") aiControl();

  p1.physics(); p2.physics();
  p1.draw(); p2.draw();
  handleBullets();
  updateUI();

  if(p1.hp<=0){ showWinner("🏆 Player 2 Wins!"); p1.hp=0; }
  else if(p2.hp<=0){ showWinner("🏆 Player 1 Wins!"); p2.hp=0; }

  if(!gameOver) setTimeout(()=>requestAnimationFrame(loop),16*slowMo);
}
