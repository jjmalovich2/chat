export class KnockoutGame {
    constructor(canvasId, onTurnEnd) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.onTurnEnd = onTurnEnd;

        // Force canvas styling to prevent CSS layout bugs
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.touchAction = 'none'; // Prevents scrolling while dragging

        // Internal resolution
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.rinkRadius = 0;

        // Configuration
        this.PENGUIN_RADIUS = 22.5; 
        this.MAX_POWER = 15; 
        this.DRAG_SCALE = 0.15; 

        // UI State
        this.state = 'idle'; 
        this.matchData = null;
        this.myPlayerId = 'p1'; 

        // Interaction
        this.dragTarget = null;
        this.dragStartPos = { x: 0, y: 0 };

        // Button dimensions
        this.btnRect = { x: 0, y: 0, w: 120, h: 45 };

        // Bind inputs
        this.handleStart = this.handleStart.bind(this);
        this.handleMove = this.handleMove.bind(this);
        this.handleEnd = this.handleEnd.bind(this);

        this.canvas.addEventListener('mousedown', this.handleStart);
        this.canvas.addEventListener('mousemove', this.handleMove);
        window.addEventListener('mouseup', this.handleEnd);

        this.canvas.addEventListener('touchstart', this.handleStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleMove, { passive: false });
        window.addEventListener('touchend', this.handleEnd);
    }

    // Completely fixes the "Down and to the Right" bug
    // by ensuring internal resolution matches visual size 1:1
    fixResolution() {
        const rect = this.canvas.getBoundingClientRect();
        
        // Only resize if the display size has changed (prevents flickering)
        if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height; // Use full height
            this.width = rect.width;
            this.height = rect.height;
            this.centerX = this.width / 2;
            this.centerY = this.height / 2;
            this.rinkRadius = Math.min(this.width, this.height) / 2 - 10;
            this.btnRect = { x: this.width / 2 - 60, y: this.height - 70, w: 120, h: 45 };
        }
    }

    resize() {
        this.fixResolution();
    }

    // --- GAME STATE MANAGEMENT ---

    setupNewGame() {
        this.fixResolution(); // Ensure size is correct before placing penguins

        const p1 = 'p1';
        const p2 = 'p2';
        const penguins = [];
        
        const gap = 80; 
        const startOffset = 140; 

        // P1 (Red) Left
        penguins.push(this.createPenguin(this.centerX - startOffset, this.centerY, p1));
        penguins.push(this.createPenguin(this.centerX - startOffset - 50, this.centerY - gap, p1));
        penguins.push(this.createPenguin(this.centerX - startOffset - 50, this.centerY + gap, p1));

        // P2 (Blue) Right
        penguins.push(this.createPenguin(this.centerX + startOffset, this.centerY, p2));
        penguins.push(this.createPenguin(this.centerX + startOffset + 50, this.centerY - gap, p2));
        penguins.push(this.createPenguin(this.centerX + startOffset + 50, this.centerY + gap, p2));

        this.matchData = {
            penguins: penguins,
            phase: 'p1_planning',
            p1_moves: [],
            p2_moves: [],
            gameOver: false,
            winner: null
        };

        this.myPlayerId = 'p1';
        this.state = 'planning';
        this.startLoop();
    }

    loadGame(data, isMyTurn) {
        this.fixResolution(); 

        this.matchData = JSON.parse(JSON.stringify(data)); 
        this.myPlayerId = isMyTurn ? (this.matchData.phase === 'p1_planning' ? 'p1' : 'p2') : 'spectator';

        if (this.matchData.gameOver) {
            this.state = 'gameover';
        } else if (this.matchData.phase === 'replay') {
            this.state = 'replay';
            this.startReplay();
        } else {
            this.state = 'planning';
        }
        this.startLoop();
    }

    createPenguin(x, y, team) {
        return {
            x: x, y: y,
            vx: 0, vy: 0,
            radius: this.PENGUIN_RADIUS,
            team: team, 
            alive: true,
            plannedVx: 0, 
            plannedVy: 0
        };
    }

    // --- GAME LOOP ---

    startLoop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.loop();
    }

    loop() {
        // If the window resized while playing, update immediately
        if (this.canvas.width !== this.canvas.clientWidth) {
            this.fixResolution();
        }

        this.draw();
        
        if (this.state === 'resolving') {
            this.updatePhysics();
        }

        this.animationId = requestAnimationFrame(this.loop.bind(this));
    }

    // --- INPUT HANDLERS (Corrected) ---

    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // Strict mapping ratio
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    handleStart(e) {
        if (this.state !== 'planning') return;
        
        // 1. Ensure resolution is perfect before calculating hit logic
        this.fixResolution();

        const pos = this.getPos(e);

        // 2. Check Button Click
        if (this.areAllMovesReady()) {
            if (pos.x > this.btnRect.x && pos.x < this.btnRect.x + this.btnRect.w &&
                pos.y > this.btnRect.y && pos.y < this.btnRect.y + this.btnRect.h) {
                this.submitTurn();
                return;
            }
        }

        // 3. Check Penguin Click
        // Iterate BACKWARDS so we click the one "on top" if they overlap slightly
        for (let i = this.matchData.penguins.length - 1; i >= 0; i--) {
            let p = this.matchData.penguins[i];
            if (!p.alive) continue;
            if (p.team !== this.myPlayerId) continue; 

            const dist = Math.hypot(pos.x - p.x, pos.y - p.y);
            
            // Hitbox 1.2x bigger for easier grabbing
            if (dist < p.radius * 1.5) { 
                this.dragTarget = p;
                this.dragStartPos = pos; 
                e.preventDefault();
                return;
            }
        }
    }

    handleMove(e) {
        if (!this.dragTarget) return;
        e.preventDefault();
        const pos = this.getPos(e);

        const dx = this.dragStartPos.x - pos.x; 
        const dy = this.dragStartPos.y - pos.y;
        
        const rawPower = Math.hypot(dx, dy);
        let speed = rawPower * this.DRAG_SCALE;
        if (speed > this.MAX_POWER) speed = this.MAX_POWER;

        const angle = Math.atan2(dy, dx);
        
        this.dragTarget.plannedVx = Math.cos(angle) * speed;
        this.dragTarget.plannedVy = Math.sin(angle) * speed;
    }

    handleEnd(e) {
        this.dragTarget = null;
    }

    areAllMovesReady() {
        if (!this.matchData) return false;
        const myPenguins = this.matchData.penguins.filter(p => p.team === this.myPlayerId && p.alive);
        return myPenguins.every(p => Math.hypot(p.plannedVx, p.plannedVy) > 0.5);
    }

    // --- LOGIC ---

    submitTurn() {
        const moves = this.matchData.penguins
            .filter(p => p.team === this.myPlayerId)
            .map(p => ({ vx: p.plannedVx, vy: p.plannedVy }));

        if (this.matchData.phase === 'p1_planning') {
            this.matchData.p1_moves = moves;
            this.matchData.phase = 'p2_planning';
            this.onTurnEnd(this.matchData);
        } else if (this.matchData.phase === 'p2_planning') {
            this.matchData.p2_moves = moves;
            this.matchData.phase = 'replay';
            this.startReplay();
        }
    }

    startReplay() {
        this.state = 'resolving';
        let p1Idx = 0;
        let p2Idx = 0;

        this.matchData.penguins.forEach(p => {
            if (!p.alive) return;
            if (p.team === 'p1') {
                const move = this.matchData.p1_moves[p1Idx] || {vx:0, vy:0};
                p.vx = move.vx;
                p.vy = move.vy;
                p1Idx++;
            } else if (p.team === 'p2') {
                const move = this.matchData.p2_moves[p2Idx] || {vx:0, vy:0};
                p.vx = move.vx;
                p.vy = move.vy;
                p2Idx++;
            }
            p.plannedVx = 0;
            p.plannedVy = 0;
        });
    }

    updatePhysics() {
        let isMoving = false;
        const friction = 0.97; 

        this.matchData.penguins.forEach(p => {
            if (!p.alive) return;

            if (Math.abs(p.vx) > 0.05 || Math.abs(p.vy) > 0.05) {
                isMoving = true;
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= friction;
                p.vy *= friction;
            } else {
                p.vx = 0;
                p.vy = 0;
            }

            const dist = Math.hypot(p.x - this.centerX, p.y - this.centerY);
            if (dist > this.rinkRadius) {
                p.alive = false;
            }
        });

        // Collisions
        for (let i = 0; i < this.matchData.penguins.length; i++) {
            for (let j = i + 1; j < this.matchData.penguins.length; j++) {
                let p1 = this.matchData.penguins[i];
                let p2 = this.matchData.penguins[j];
                if (!p1.alive || !p2.alive) continue;

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.hypot(dx, dy);
                const minDist = p1.radius + p2.radius;

                if (dist < minDist) {
                    isMoving = true;
                    const angle = Math.atan2(dy, dx);
                    const overlap = (minDist - dist) / 2;
                    p1.x -= Math.cos(angle) * overlap;
                    p1.y -= Math.sin(angle) * overlap;
                    p2.x += Math.cos(angle) * overlap;
                    p2.y += Math.sin(angle) * overlap;

                    const normalX = Math.cos(angle);
                    const normalY = Math.sin(angle);
                    const dvx = p1.vx - p2.vx;
                    const dvy = p1.vy - p2.vy;
                    const dot = dvx * normalX + dvy * normalY;

                    if (dot > 0) {
                        const bounce = 0.9; 
                        const impulse = (1 + bounce) * dot / 2;
                        p1.vx -= impulse * normalX;
                        p1.vy -= impulse * normalY;
                        p2.vx += impulse * normalX;
                        p2.vy += impulse * normalY;
                    }
                }
            }
        }

        if (!isMoving) {
            this.state = 'planning';
            this.finishResolution();
        }
    }

    finishResolution() {
        const p1Alive = this.matchData.penguins.filter(p => p.team === 'p1' && p.alive).length;
        const p2Alive = this.matchData.penguins.filter(p => p.team === 'p2' && p.alive).length;

        if (p1Alive === 0 || p2Alive === 0) {
            this.matchData.gameOver = true;
            if (p1Alive > 0) this.matchData.winner = 'p1';
            else if (p2Alive > 0) this.matchData.winner = 'p2';
            else this.matchData.winner = 'draw';
        } else {
            this.matchData.phase = 'p1_planning';
            this.matchData.p1_moves = [];
            this.matchData.p2_moves = [];
        }

        if (this.myPlayerId === 'p2' || this.myPlayerId === 'spectator') { 
             this.onTurnEnd(this.matchData);
        }
    }

    // --- DRAWING ---

    draw() {
        // Clear
        this.ctx.fillStyle = '#0a3d62'; 
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Rink
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.rinkRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#e3f2fd';
        this.ctx.fill();
        this.ctx.strokeStyle = '#90caf9';
        this.ctx.lineWidth = 5;
        this.ctx.stroke();

        // Penguins
        this.matchData.penguins.forEach(p => {
            if (!p.alive) return;
            this.drawPenguin(p);
        });

        // UI: Planning Phase
        if (this.state === 'planning') {
            
            this.matchData.penguins.forEach(p => {
                if (!p.alive || p.team !== this.myPlayerId) return;
                if (Math.hypot(p.plannedVx, p.plannedVy) > 0.5) {
                    this.drawArrow(p);
                }
            });

            if (this.areAllMovesReady()) {
                this.ctx.fillStyle = '#27ae60';
                this.ctx.beginPath();
                this.ctx.roundRect(this.btnRect.x, this.btnRect.y, this.btnRect.w, this.btnRect.h, 10);
                this.ctx.fill();
                this.ctx.strokeStyle = '#2ecc71';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();

                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 16px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                
                let btnText = "Submit";
                if (this.matchData.phase === 'p1_planning') btnText = "P1 Ready";
                if (this.matchData.phase === 'p2_planning') btnText = "P2 Ready";
                
                this.ctx.fillText(btnText, this.btnRect.x + this.btnRect.w/2, this.btnRect.y + this.btnRect.h/2);
            } else {
                this.ctx.fillStyle = 'white';
                this.ctx.font = '14px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillText("Aim every penguin to continue!", this.centerX, this.height - 30);
            }
        }

        if (this.state === 'gameover') {
            this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 30px sans-serif';
            this.ctx.textAlign = 'center';
            let msg = "Game Over";
            if (this.matchData.winner === 'p1') msg = "Red Team Wins!";
            if (this.matchData.winner === 'p2') msg = "Blue Team Wins!";
            this.ctx.fillText(msg, this.centerX, this.centerY);
        }
    }

    drawPenguin(p) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        
        if (p.team === 'p1') {
            this.ctx.fillStyle = '#e74c3c';
            this.ctx.strokeStyle = '#c0392b';
        } else {
            this.ctx.fillStyle = '#3498db';
            this.ctx.strokeStyle = '#2980b9';
        }

        if (this.state === 'planning' && p.team === this.myPlayerId) {
             const hasMove = Math.hypot(p.plannedVx, p.plannedVy) > 0.5;
             this.ctx.lineWidth = hasMove ? 2 : 4; 
             this.ctx.strokeStyle = hasMove ? '#333' : 'white';
        } else {
             this.ctx.lineWidth = 2;
        }

        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = 'white';
        const eyeOffset = 7;
        this.ctx.beginPath();
        this.ctx.arc(p.x - eyeOffset, p.y - 7, 5, 0, Math.PI * 2);
        this.ctx.arc(p.x + eyeOffset, p.y - 7, 5, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.fillStyle = 'black';
        this.ctx.beginPath();
        this.ctx.arc(p.x - eyeOffset, p.y - 7, 2, 0, Math.PI * 2);
        this.ctx.arc(p.x + eyeOffset, p.y - 7, 2, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#f1c40f';
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y + 6);
        this.ctx.lineTo(p.x - 5, p.y);
        this.ctx.lineTo(p.x + 5, p.y);
        this.ctx.fill();
    }

    drawArrow(p) {
        const lineScale = 5.0; 
        const endX = p.x + p.plannedVx * lineScale; 
        const endY = p.y + p.plannedVy * lineScale;

        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.lineTo(endX, endY);
        
        this.ctx.strokeStyle = '#333333'; 
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();

        const angle = Math.atan2(p.plannedVy, p.plannedVx);
        const headLen = 12;
        this.ctx.beginPath();
        this.ctx.moveTo(endX, endY);
        this.ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
        this.ctx.fillStyle = '#333333';
        this.ctx.fill();
    }
}