// pool.js
export class PoolGame {
    constructor(canvasId, onTurnComplete) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.onTurnComplete = onTurnComplete; // Callback to save to DB
        
        // Physics Params
        this.friction = 0.98;
        this.balls = [];
        this.width = 300;
        this.height = 600;
        this.ballRadius = 10;
        
        // State
        this.isDragging = false;
        this.canInteract = false; // Locked until animation finishes
        this.dragStart = { x:0, y:0 };
        this.dragCurrent = { x:0, y:0 };
        
        // Snapshot for Replay
        this.ballsBeforeShot = []; 

        this.initListeners();
        this.resize();
        this.loop();
    }

    resize() {
        const maxW = window.innerWidth * 0.9;
        this.width = Math.min(maxW, 500);
        this.height = this.width * 1.8;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ballRadius = this.width * 0.035;
    }

    initListeners() {
        // Touch / Mouse Logic
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

    // --- GAME SETUP ---

    setupNewGame() {
        this.balls = [];
        // Cue ball
        this.balls.push({ id:0, x: this.width/2, y: this.height*0.8, vx:0, vy:0, color:'#fff', active:true });
        
        // Rack
        const startX = this.width/2;
        const startY = this.height*0.25;
        const colors = ['#f1c40f', '#e74c3c', '#3498db', '#8e44ad', '#000000']; 
        let c = 0;
        for(let r=0; r<4; r++){
            for(let k=0; k<=r; k++){
                let ox = (k * this.ballRadius*2.1) - (r * this.ballRadius*1.05);
                let oy = r * this.ballRadius*1.85;
                this.balls.push({
                    id: c+1, x: startX+ox, y: startY+oy, vx:0, vy:0,
                    color: (r==2 && k==1) ? '#000' : colors[c%colors.length], active:true
                });
                c++;
            }
        }
        this.saveStateForReplay(); // Snapshot initial state
        this.canInteract = true;   // Ready to shoot immediately
        return "Your Break!";
    }

    loadGame(stateData) {
        // stateData contains: { balls: [...], shot: {vx, vy} }
        
        // 1. Load the balls exactly as they were BEFORE the opponent shot
        this.balls = JSON.parse(JSON.stringify(stateData.balls));
        
        // 2. Lock controls so you can't interfere with replay
        this.canInteract = false; 

        // 3. Apply the opponent's shot vector
        const cue = this.balls[0];
        cue.vx = stateData.shot.vx;
        cue.vy = stateData.shot.vy;

        // 4. The update loop will now animate the result
        return "Watching Replay...";
    }

    // --- PHYSICS ENGINE ---

    update() {
        let moving = false;
        
        this.balls.forEach(b => {
            if(!b.active) return;
            
            // Movement
            b.x += b.vx; 
            b.y += b.vy;
            b.vx *= this.friction; 
            b.vy *= this.friction;

            // Stop threshold
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
                if(Math.hypot(b.x-p.x, b.y-p.y) < this.ballRadius*2) {
                    if(b.id === 0) {
                        // Scratch: Reset Cue Ball
                        b.x = this.width/2; b.y = this.height*0.8; b.vx=0; b.vy=0;
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
                    // Rotate
                    let v1 = { x: b1.vx*cos + b1.vy*sin, y: b1.vy*cos - b1.vx*sin };
                    let v2 = { x: b2.vx*cos + b2.vy*sin, y: b2.vy*cos - b2.vx*sin };
                    // Swap
                    let temp = v1.x; v1.x = v2.x; v2.x = temp;
                    // Unstuck
                    let overlap = (this.ballRadius*2 - dist)/2;
                    b1.x -= overlap*cos; b1.y -= overlap*sin;
                    b2.x += overlap*cos; b2.y += overlap*sin;
                    // Rotate Back
                    b1.vx = v1.x*cos - v1.y*sin; b1.vy = v1.y*cos + v1.x*sin;
                    b2.vx = v2.x*cos - v2.y*sin; b2.vy = v2.y*cos + v2.x*sin;
                }
            }
        }

        // --- TURN LOGIC ---
        // If we were moving but now stopped...
        if(!moving && this.balls.some(b => b.active)) {
             // If we were watching a replay, UNLOCK controls now
             if(!this.canInteract) {
                 this.canInteract = true;
                 this.saveStateForReplay(); // Save this position as the start of MY turn
                 if(this.onReplayFinished) this.onReplayFinished();
             }
             // If I just shot, the game is over, send data
             else if(this.didJustShoot) {
                 this.didJustShoot = false;
                 // Send: The balls BEFORE I shot, and the vector I used
                 this.onTurnComplete({
                     balls: this.ballsBeforeShot,
                     shot: this.lastShotVector
                 });
             }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = '#2e7d32'; this.ctx.fillRect(0,0,this.width,this.height);
        
        // Pockets
        this.ctx.fillStyle = '#000';
        [{x:0,y:0},{x:this.width,y:0},{x:0,y:this.height},{x:this.width,y:this.height}].forEach(p=>{
            this.ctx.beginPath(); this.ctx.arc(p.x,p.y,this.ballRadius*2,0,Math.PI*2); this.ctx.fill();
        });

        // Balls
        this.balls.forEach(b => {
            if(!b.active) return;
            this.ctx.beginPath(); this.ctx.fillStyle = b.color;
            this.ctx.arc(b.x,b.y,this.ballRadius,0,Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle='#ffffff44'; this.ctx.beginPath();
            this.ctx.arc(b.x-2,b.y-2,4,0,Math.PI*2); this.ctx.fill();
        });

        // Stick
        if(this.isDragging && this.canInteract) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.balls[0].x, this.balls[0].y);
            this.ctx.lineTo(this.dragCurrent.x, this.dragCurrent.y);
            this.ctx.strokeStyle = 'white'; this.ctx.lineWidth = 4; this.ctx.stroke();
        }
    }

    loop() { this.update(); this.draw(); requestAnimationFrame(()=>this.loop()); }

    // --- CONTROLS ---
    saveStateForReplay() {
        // Deep copy current ball positions
        this.ballsBeforeShot = JSON.parse(JSON.stringify(this.balls));
    }

    handleInputStart(e) {
        if(!this.canInteract) return;
        let pos = this.getPos(e);
        if(Math.hypot(pos.x - this.balls[0].x, pos.y - this.balls[0].y) < 30) {
            this.isDragging = true;
            this.dragStart = { x: this.balls[0].x, y: this.balls[0].y };
            this.dragCurrent = pos;
        }
    }
    handleInputMove(e) {
        if(this.isDragging) this.dragCurrent = this.getPos(e);
    }
    handleInputEnd() {
        if(!this.isDragging) return;
        this.isDragging = false;
        
        let dx = this.balls[0].x - this.dragCurrent.x;
        let dy = this.balls[0].y - this.dragCurrent.y;
        
        // Shoot!
        this.lastShotVector = { vx: dx*0.15, vy: dy*0.15 }; // Save vector for DB
        this.balls[0].vx = this.lastShotVector.vx;
        this.balls[0].vy = this.lastShotVector.vy;
        
        this.canInteract = false; // Lock
        this.didJustShoot = true; // Flag to trigger save when stopped
    }
    getPos(e) {
        let r = this.canvas.getBoundingClientRect();
        let x = e.touches ? e.touches[0].clientX : e.clientX;
        let y = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: x-r.left, y: y-r.top };
    }
}
