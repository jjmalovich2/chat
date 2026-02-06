// pool.js
export class PoolGame {
    constructor(canvasId, onTurnComplete) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.onTurnComplete = onTurnComplete;
        
        this.friction = 0.985; // Slightly less friction for horizontal fun
        this.balls = [];
        this.width = 600;
        this.height = 300; // Landscape Aspect Ratio (2:1)
        this.ballRadius = 10;
        
        this.isDragging = false;
        this.canInteract = false;
        this.dragStart = { x:0, y:0 };
        this.dragCurrent = { x:0, y:0 };
        this.ballsBeforeShot = []; 

        this.initListeners();
        this.resize();
        this.loop();
    }

    resize() {
        // Max width based on screen width
        const maxW = window.innerWidth * 0.95;
        this.width = Math.min(maxW, 800);
        this.height = this.width * 0.5; // Keep 2:1 Ratio
        
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ballRadius = this.width * 0.018; // Smaller balls relative to width
    }

    initListeners() {
        const start = (e) => this.handleInputStart(e);
        const move = (e) => this.handleInputMove(e);
        const end = () => this.handleInputEnd();

        this.canvas.addEventListener('mousedown', start);
        this.canvas.addEventListener('touchstart', start);
        window.addEventListener('mousemove', move);
        window.addEventListener('touchmove', move);
        window.addEventListener('mouseup', end);
        window.addEventListener('touchend', end);
    }

    // --- SETUP ---
    setupNewGame() {
        this.balls = [];
        // Cue ball (Left side)
        this.balls.push({ id:0, x: this.width*0.25, y: this.height*0.5, vx:0, vy:0, color:'#fff', active:true });
        
        // Rack (Right side)
        const startX = this.width * 0.75;
        const startY = this.height * 0.5;
        const colors = ['#f1c40f', '#e74c3c', '#3498db', '#8e44ad', '#000']; 
        
        let c = 0;
        for(let col=0; col<4; col++) {
            for(let row=0; row<=col; row++) {
                // Triangle math rotated 90 degrees
                let ox = col * (this.ballRadius * 1.8);
                let oy = (row * this.ballRadius * 2.1) - (col * this.ballRadius * 1.05);
                
                this.balls.push({
                    id: c+1, 
                    x: startX + ox, 
                    y: startY + oy, 
                    vx:0, vy:0,
                    color: (col==2 && row==1) ? '#000' : colors[c%colors.length], 
                    active:true
                });
                c++;
            }
        }
        this.saveStateForReplay();
        this.canInteract = true;
    }

    loadGame(stateData) {
        this.balls = JSON.parse(JSON.stringify(stateData.balls));
        this.canInteract = false; 
        const cue = this.balls[0];
        cue.vx = stateData.shot.vx;
        cue.vy = stateData.shot.vy;
    }

    // --- PHYSICS ---
    update() {
        let moving = false;
        
        this.balls.forEach(b => {
            if(!b.active) return;
            b.x += b.vx; b.y += b.vy;
            b.vx *= this.friction; b.vy *= this.friction;

            if(Math.abs(b.vx)<0.05 && Math.abs(b.vy)<0.05) { b.vx=0; b.vy=0; }
            else moving = true;

            // Walls
            if(b.x < this.ballRadius) { b.x=this.ballRadius; b.vx*=-1; }
            if(b.x > this.width-this.ballRadius) { b.x=this.width-this.ballRadius; b.vx*=-1; }
            if(b.y < this.ballRadius) { b.y=this.ballRadius; b.vy*=-1; }
            if(b.y > this.height-this.ballRadius) { b.y=this.height-this.ballRadius; b.vy*=-1; }

            // Pockets
            const pockets = [{x:0,y:0},{x:this.width,y:0},{x:0,y:this.height},{x:this.width,y:this.height}];
            pockets.forEach(p => {
                if(Math.hypot(b.x-p.x, b.y-p.y) < this.ballRadius*2.5) {
                    if(b.id === 0) {
                        b.x = this.width*0.25; b.y = this.height*0.5; b.vx=0; b.vy=0;
                    } else {
                        b.active = false;
                    }
                }
            });
        });

        // Collisions
        for(let i=0; i<this.balls.length; i++) {
            for(let j=i+1; j<this.balls.length; j++) {
                let b1 = this.balls[i], b2 = this.balls[j];
                if(!b1.active || !b2.active) continue;
                let dx = b2.x - b1.x, dy = b2.y - b1.y;
                let dist = Math.hypot(dx, dy);
                if(dist < this.ballRadius*2) {
                    let angle = Math.atan2(dy, dx);
                    let sin = Math.sin(angle), cos = Math.cos(angle);
                    let v1 = { x: b1.vx*cos + b1.vy*sin, y: b1.vy*cos - b1.vx*sin };
                    let v2 = { x: b2.vx*cos + b2.vy*sin, y: b2.vy*cos - b2.vx*sin };
                    let temp = v1.x; v1.x = v2.x; v2.x = temp;
                    let overlap = (this.ballRadius*2 - dist)/2;
                    b1.x -= overlap*cos; b1.y -= overlap*sin;
                    b2.x += overlap*cos; b2.y += overlap*sin;
                    b1.vx = v1.x*cos - v1.y*sin; b1.vy = v1.y*cos + v1.x*sin;
                    b2.vx = v2.x*cos - v2.y*sin; b2.vy = v2.y*cos + v2.x*sin;
                }
            }
        }

        // Turn End Logic
        if(!moving && this.balls.some(b => b.active)) {
             if(!this.canInteract) {
                 this.canInteract = true;
                 this.saveStateForReplay();
                 if(this.onReplayFinished) this.onReplayFinished();
             }
             else if(this.didJustShoot) {
                 this.didJustShoot = false;
                 this.onTurnComplete({ balls: this.ballsBeforeShot, shot: this.lastShotVector });
             }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Pockets
        this.ctx.fillStyle = '#111';
        [{x:0,y:0},{x:this.width,y:0},{x:0,y:this.height},{x:this.width,y:this.height}].forEach(p=>{
            this.ctx.beginPath(); this.ctx.arc(p.x,p.y,this.ballRadius*2.2,0,Math.PI*2); this.ctx.fill();
        });

        // Balls
        this.balls.forEach(b => {
            if(!b.active) return;
            this.ctx.beginPath(); this.ctx.fillStyle = b.color;
            this.ctx.arc(b.x,b.y,this.ballRadius,0,Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle='#ffffff44'; this.ctx.beginPath();
            this.ctx.arc(b.x-2,b.y-2,4,0,Math.PI*2); this.ctx.fill();
        });

        // Cue Stick
        if(this.isDragging && this.canInteract) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.balls[0].x, this.balls[0].y);
            this.ctx.lineTo(this.dragCurrent.x, this.dragCurrent.y);
            this.ctx.strokeStyle = 'white'; this.ctx.lineWidth = 4; this.ctx.stroke();
        }
    }

    loop() { this.update(); this.draw(); requestAnimationFrame(()=>this.loop()); }

    saveStateForReplay() { this.ballsBeforeShot = JSON.parse(JSON.stringify(this.balls)); }

    handleInputStart(e) {
        if(!this.canInteract) return;
        let pos = this.getPos(e);
        if(Math.hypot(pos.x - this.balls[0].x, pos.y - this.balls[0].y) < 40) {
            this.isDragging = true;
            this.dragStart = { x: this.balls[0].x, y: this.balls[0].y };
            this.dragCurrent = pos;
        }
    }
    handleInputMove(e) { if(this.isDragging) this.dragCurrent = this.getPos(e); }
    handleInputEnd() {
        if(!this.isDragging) return;
        this.isDragging = false;
        let dx = this.balls[0].x - this.dragCurrent.x;
        let dy = this.balls[0].y - this.dragCurrent.y;
        this.lastShotVector = { vx: dx*0.12, vy: dy*0.12 }; // Adjusted power for horizontal
        this.balls[0].vx = this.lastShotVector.vx;
        this.balls[0].vy = this.lastShotVector.vy;
        this.canInteract = false; 
        this.didJustShoot = true; 
    }
    getPos(e) {
        let r = this.canvas.getBoundingClientRect();
        let x = e.touches ? e.touches[0].clientX : e.clientX;
        let y = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: x-r.left, y: y-r.top };
    }
}
