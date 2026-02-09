export class KnockoutGame {
    constructor(canvasId, onTurnEnd) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.onTurnEnd = onTurnEnd;

        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.rinkRadius = Math.min(this.width, this.height) / 2 - 20;

        // UI State
        this.state = 'idle'; // 'planning', 'replay', 'gameover'
        this.matchData = null;
        this.myPlayerId = 'p1'; // 'p1' or 'p2'

        // Interaction
        this.dragTarget = null;
        this.dragCurrentX = 0;
        this.dragCurrentY = 0;

        // Button dimensions
        this.btnRect = { x: this.width / 2 - 60, y: this.height - 60, w: 120, h: 40 };

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

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height || 450;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.rinkRadius = Math.min(this.width, this.height) / 2 - 20;
        this.btnRect = { x: this.width / 2 - 60, y: this.height - 60, w: 120, h: 40 };
    }

    // --- GAME STATE MANAGEMENT ---

    setupNewGame() {
        // Initial setup
        const p1 = 'p1';
        const p2 = 'p2';
        const penguins = [];
        
        // Setup Triangle formation (Bigger Penguins = Bigger Gap)
        const gap = 55; 
        const startOffset = 120;

        // P1 (Red) Left
        penguins.push(this.createPenguin(this.centerX - startOffset, this.centerY, p1));
        penguins.push(this.createPenguin(this.centerX - startOffset - 40, this.centerY - gap/1.5, p1));
        penguins.push(this.createPenguin(this.centerX - startOffset - 40, this.centerY + gap/1.5, p1));

        // P2 (Blue) Right
        penguins.push(this.createPenguin(this.centerX + startOffset, this.centerY, p2));
        penguins.push(this.createPenguin(this.centerX + startOffset + 40, this.centerY - gap/1.5, p2));
        penguins.push(this.createPenguin(this.centerX + startOffset + 40, this.centerY + gap/1.5, p2));

        this.matchData = {
            penguins: penguins,
            phase: 'p1_planning', // p1_planning -> p2_planning -> replay
            p1_moves: [],
            p2_moves: [],
            turnCount: 1,
            gameOver: false,
            winner: null
        };

        this.myPlayerId = 'p1'; // Creator is always P1
        this.state = 'planning';
        this.startLoop();
    }

    loadGame(data, isMyTurn) {
        // Clone data to avoid reference issues
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
            radius: 25, // Bigger penguins
            team: team, 
            alive: true,
            plannedVx: 0, // Planned move
            plannedVy: 0
        };
    }

    // --- GAME LOOP ---

    startLoop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.loop();
    }

    loop() {
        this.draw();
        
        if (this.state === 'resolving') {
            this.updatePhysics();
        }

        this.animationId = requestAnimationFrame(this.loop.bind(this));
    }

    // --- INPUT HANDLERS ---

    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    handleStart(e) {
        if (this.state !== 'planning') return;
        
        // Prevent default only if we are interacting with canvas elements
        const pos = this.getPos(e);

        // Check Button Click
        if (pos.x > this.btnRect.x && pos.x < this.btnRect.x + this.btnRect.w &&
            pos.y > this.btnRect.y && pos.y < this.btnRect.y + this.btnRect.h) {
            this.submitTurn();
            return;
        }

        // Check Penguin Drag
        for (let p of this.matchData.penguins) {
            if (!p.alive) continue;
            // Only allow moving my own penguins
            if (p.team !== this.myPlayerId) continue; 

            const dist = Math.hypot(pos.x - p.x, pos.y - p.y);
            if (dist < p.radius * 1.5) {
                this.dragTarget = p;
                this.dragCurrentX = pos.x;
                this.dragCurrentY = pos.y;
                e.preventDefault();
                return;
            }
        }
    }

    handleMove(e) {
        if (!this.dragTarget) return;
        e.preventDefault();
        const pos = this.getPos(e);
        this.dragCurrentX = pos.x;
        this.dragCurrentY = pos.y;

        // Update the planned vector instantly for visual feedback
        // Drag BACK to shoot FORWARD (Slingshot)
        const dx = this.dragTarget.x - this.dragCurrentX;
        const dy = this.dragTarget.y - this.dragCurrentY;
        
        // Power cap
        const maxPull = 150;
        const currentPull = Math.hypot(dx, dy);
        const scale = Math.min(currentPull, maxPull) / currentPull || 0;
        
        const powerMultiplier = 0.25; // Speed factor
        this.dragTarget.plannedVx = dx * scale * powerMultiplier;
        this.dragTarget.plannedVy = dy * scale * powerMultiplier;
    }

    handleEnd(e) {
        if (this.dragTarget) {
            this.dragTarget = null;
        }
    }

    // --- LOGIC ---

    submitTurn() {
        // Collect moves
        const moves = this.matchData.penguins
            .filter(p => p.team === this.myPlayerId)
            .map(p => ({ vx: p.plannedVx, vy: p.plannedVy }));

        if (this.matchData.phase === 'p1_planning') {
            // P1 is done, now wait for P2
            this.matchData.p1_moves = moves;
            this.matchData.phase = 'p2_planning';
            this.onTurnEnd(this.matchData); // Send to chat
        } else if (this.matchData.phase === 'p2_planning') {
            // P2 is done, Run the resolution!
            this.matchData.p2_moves = moves;
            this.matchData.phase = 'replay'; // Next time it opens, it's a replay
            
            // Apply moves locally to resolve and save result
            this.startReplay();
        }
    }

    startReplay() {
        this.state = 'resolving';
        
        // 1. Reset Penguins to positions (if needed) - simplified here by assuming current positions are start positions
        // 2. Apply Vectors
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
            // Reset planned vectors so arrows disappear
            p.plannedVx = 0;
            p.plannedVy = 0;
        });
    }

    updatePhysics() {
        let isMoving = false;
        const friction = 0.96; // Ice friction

        this.matchData.penguins.forEach(p => {
            if (!p.alive) return;

            // Move
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

            // Boundary Death
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
                    // Physics collision response
                    const angle = Math.atan2(dy, dx);
                    const overlap = (minDist - dist) / 2;
                    
                    p1.x -= Math.cos(angle) * overlap;
                    p1.y -= Math.sin(angle) * overlap;
                    p2.x += Math.cos(angle) * overlap;
                    p2.y += Math.sin(angle) * overlap;

                    // Bounce
                    const normalX = Math.cos(angle);
                    const normalY = Math.sin(angle);
                    
                    // Relative velocity
                    const dvx = p1.vx - p2.vx;
                    const dvy = p1.vy - p2.vy;
                    
                    const dot = dvx * normalX + dvy * normalY;

                    if (dot > 0) {
                        const bounce = 0.8; // Bounciness
                        const impulse = (1 + bounce) * dot / 2; // Equal mass
                        
                        p1.vx -= impulse * normalX;
                        p1.vy -= impulse * normalY;
                        p2.vx += impulse * normalX;
                        p2.vy += impulse * normalY;
                    }
                }
            }
        }

        // End of Resolution
        if (!isMoving) {
            this.state = 'planning'; // Stop animation
            this.finishResolution();
        }
    }

    finishResolution() {
        // Check winners
        const p1Alive = this.matchData.penguins.filter(p => p.team === 'p1' && p.alive).length;
        const p2Alive = this.matchData.penguins.filter(p => p.team === 'p2' && p.alive).length;

        if (p1Alive === 0 || p2Alive === 0) {
            this.matchData.gameOver = true;
            if (p1Alive > 0) this.matchData.winner = 'p1';
            else if (p2Alive > 0) this.matchData.winner = 'p2';
            else this.matchData.winner = 'draw';
        } else {
            // Next Round
            this.matchData.turnCount++;
            this.matchData.phase = 'p1_planning';
            this.matchData.p1_moves = [];
            this.matchData.p2_moves = [];
        }

        // Only the person who triggered the physics sends the update
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

        // UI
        if (this.state === 'planning') {
            // Draw Arrows for plans
            this.matchData.penguins.forEach(p => {
                if (!p.alive || p.team !== this.myPlayerId) return;
                if (Math.abs(p.plannedVx) > 0.1 || Math.abs(p.plannedVy) > 0.1) {
                    this.drawArrow(p);
                }
            });

            // Draw Button
            this.ctx.fillStyle = '#27ae60';
            this.ctx.fillRect(this.btnRect.x, this.btnRect.y, this.btnRect.w, this.btnRect.h);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 16px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            let btnText = "Ready";
            if (this.matchData.phase === 'p1_planning') btnText = "P1 Ready";
            if (this.matchData.phase === 'p2_planning') btnText = "Flick All!";
            
            this.ctx.fillText(btnText, this.btnRect.x + this.btnRect.w/2, this.btnRect.y + this.btnRect.h/2);

            // Instructions
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px sans-serif';
            this.ctx.fillText("Drag your penguins to aim. Move all, then click Ready.", this.centerX, 30);
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
        
        // Body Color
        if (p.team === 'p1') {
            this.ctx.fillStyle = '#e74c3c';
            this.ctx.strokeStyle = '#c0392b';
        } else {
            this.ctx.fillStyle = '#3498db';
            this.ctx.strokeStyle = '#2980b9';
        }

        // Highlight if it's my turn
        if (this.state === 'planning' && p.team === this.myPlayerId) {
             this.ctx.lineWidth = 4;
             this.ctx.strokeStyle = 'white';
        } else {
             this.ctx.lineWidth = 2;
        }

        this.ctx.fill();
        this.ctx.stroke();

        // Face
        this.ctx.fillStyle = 'white';
        const eyeOffset = 8;
        this.ctx.beginPath();
        this.ctx.arc(p.x - eyeOffset, p.y - 8, 5, 0, Math.PI * 2);
        this.ctx.arc(p.x + eyeOffset, p.y - 8, 5, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.fillStyle = 'black';
        this.ctx.beginPath();
        this.ctx.arc(p.x - eyeOffset, p.y - 8, 2, 0, Math.PI * 2);
        this.ctx.arc(p.x + eyeOffset, p.y - 8, 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Beak
        this.ctx.fillStyle = '#f1c40f';
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y + 5);
        this.ctx.lineTo(p.x - 5, p.y);
        this.ctx.lineTo(p.x + 5, p.y);
        this.ctx.fill();
    }

    drawArrow(p) {
        const endX = p.x + p.plannedVx * 4; // Scale up for visual
        const endY = p.y + p.plannedVy * 4;

        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.lineTo(endX, endY);
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Arrow head
        const angle = Math.atan2(p.plannedVy, p.plannedVx);
        const headLen = 10;
        this.ctx.beginPath();
        this.ctx.moveTo(endX, endY);
        this.ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
        this.ctx.fillStyle = 'white';
        this.ctx.fill();
    }
}