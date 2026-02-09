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

        this.state = 'idle'; // idle, aiming, moving, gameover
        this.penguins = [];
        this.currentPlayer = 'p1'; // 'p1' (Red) or 'p2' (Blue)
        
        // Aiming vars
        this.selectedPenguin = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragCurrentX = 0;
        this.dragCurrentY = 0;

        this.animationId = null;

        // Bind inputs
        this.handleStart = this.handleStart.bind(this);
        this.handleMove = this.handleMove.bind(this);
        this.handleEnd = this.handleEnd.bind(this);

        this.canvas.addEventListener('mousedown', this.handleStart);
        this.canvas.addEventListener('mousemove', this.handleMove);
        window.addEventListener('mouseup', this.handleEnd);

        this.canvas.addEventListener('touchstart', this.handleStart, {passive: false});
        this.canvas.addEventListener('touchmove', this.handleMove, {passive: false});
        window.addEventListener('touchend', this.handleEnd);
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height || 400;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.rinkRadius = Math.min(this.width, this.height) / 2 - 20;
    }

    // --- GAME SETUP ---

    setupNewGame() {
        this.penguins = [];
        this.currentPlayer = 'p1';
        this.state = 'idle';

        // Setup 3 penguins per team in a triangle formation
        // P1 (Red) on Left, P2 (Blue) on Right
        const gap = 40;
        
        // P1
        this.penguins.push(this.createPenguin(this.centerX - 100, this.centerY, 'p1'));
        this.penguins.push(this.createPenguin(this.centerX - 140, this.centerY - 30, 'p1'));
        this.penguins.push(this.createPenguin(this.centerX - 140, this.centerY + 30, 'p1'));

        // P2
        this.penguins.push(this.createPenguin(this.centerX + 100, this.centerY, 'p2'));
        this.penguins.push(this.createPenguin(this.centerX + 140, this.centerY - 30, 'p2'));
        this.penguins.push(this.createPenguin(this.centerX + 140, this.centerY + 30, 'p2'));

        this.startLoop();
    }

    createPenguin(x, y, team) {
        return {
            x: x, y: y,
            vx: 0, vy: 0,
            radius: 15,
            team: team, // 'p1' or 'p2'
            alive: true
        };
    }

    loadGame(data) {
        // Load state from message
        this.penguins = data.penguins;
        this.currentPlayer = data.nextTurn;
        this.state = data.gameOver ? 'gameover' : 'idle';
        this.startLoop();
    }

    // --- GAME LOOP ---

    startLoop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        this.loop();
    }

    loop() {
        this.update();
        this.draw();
        if (this.state !== 'gameover' || this.moving) {
            this.animationId = requestAnimationFrame(this.loop.bind(this));
        }
    }

    // --- INPUTS ---

    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    handleStart(e) {
        if (this.state !== 'idle') return;
        e.preventDefault();
        const pos = this.getPos(e);

        // Find clicked penguin
        for (let p of this.penguins) {
            if (!p.alive) continue;
            if (p.team !== this.currentPlayer) continue; // Can only move your own team

            const dist = Math.hypot(pos.x - p.x, pos.y - p.y);
            if (dist < p.radius * 2) {
                this.selectedPenguin = p;
                this.state = 'aiming';
                this.dragStartX = pos.x;
                this.dragStartY = pos.y;
                this.dragCurrentX = pos.x;
                this.dragCurrentY = pos.y;
                break;
            }
        }
    }

    handleMove(e) {
        if (this.state !== 'aiming') return;
        e.preventDefault(); 
        const pos = this.getPos(e);
        this.dragCurrentX = pos.x;
        this.dragCurrentY = pos.y;
    }

    handleEnd(e) {
        if (this.state !== 'aiming') return;
        
        // Calculate velocity based on drag distance (Sling shot logic)
        // Drag BACK to shoot FORWARD
        const dx = this.dragStartX - this.dragCurrentX;
        const dy = this.dragStartY - this.dragCurrentY;
        
        const power = Math.min(Math.hypot(dx, dy), 150) * 0.15; // Cap max power
        const angle = Math.atan2(dy, dx);

        this.selectedPenguin.vx = Math.cos(angle) * power;
        this.selectedPenguin.vy = Math.sin(angle) * power;

        this.selectedPenguin = null;
        this.state = 'moving';
    }

    // --- PHYSICS ---

    update() {
        if (this.state === 'gameover') return;

        let isMoving = false;
        const friction = 0.98;

        // 1. Movement & Wall collisions
        this.penguins.forEach(p => {
            if (!p.alive) return;

            if (Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1) {
                isMoving = true;
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= friction;
                p.vy *= friction;
            } else {
                p.vx = 0;
                p.vy = 0;
            }

            // Check if fallen off ice (Distance from center > Radius)
            const distFromCenter = Math.hypot(p.x - this.centerX, p.y - this.centerY);
            if (distFromCenter > this.rinkRadius) {
                p.alive = false; // Splash!
            }
        });

        // 2. Collision between penguins
        for (let i = 0; i < this.penguins.length; i++) {
            for (let j = i + 1; j < this.penguins.length; j++) {
                let p1 = this.penguins[i];
                let p2 = this.penguins[j];
                if (!p1.alive || !p2.alive) continue;

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.hypot(dx, dy);

                if (dist < p1.radius + p2.radius) {
                    // Collision detected - Simple elastic collision
                    const angle = Math.atan2(dy, dx);
                    
                    // Separate them slightly to prevent sticking
                    const overlap = (p1.radius + p2.radius - dist) / 2;
                    p1.x -= Math.cos(angle) * overlap;
                    p1.y -= Math.sin(angle) * overlap;
                    p2.x += Math.cos(angle) * overlap;
                    p2.y += Math.sin(angle) * overlap;

                    // Swap velocities (simplified physics)
                    // In a real engine we'd use mass, but equal mass is fine here
                    const u1 = p1.vx * Math.cos(angle) + p1.vy * Math.sin(angle);
                    const u2 = p2.vx * Math.cos(angle) + p2.vy * Math.sin(angle);
                    
                    const v1 = u2;
                    const v2 = u1;
                    
                    // Perpendicular components remain same
                    const u1Perp = -p1.vx * Math.sin(angle) + p1.vy * Math.cos(angle);
                    const u2Perp = -p2.vx * Math.sin(angle) + p2.vy * Math.cos(angle);

                    p1.vx = v1 * Math.cos(angle) - u1Perp * Math.sin(angle);
                    p1.vy = v1 * Math.sin(angle) + u1Perp * Math.cos(angle);
                    p2.vx = v2 * Math.cos(angle) - u2Perp * Math.sin(angle);
                    p2.vy = v2 * Math.sin(angle) + u2Perp * Math.cos(angle);
                    
                    isMoving = true;
                }
            }
        }

        // 3. Turn Logic
        if (this.state === 'moving' && !isMoving) {
            this.finishTurn();
        }
    }

    finishTurn() {
        // Count remaining
        const p1Count = this.penguins.filter(p => p.team === 'p1' && p.alive).length;
        const p2Count = this.penguins.filter(p => p.team === 'p2' && p.alive).length;

        let gameOver = false;
        let winner = null;

        if (p1Count === 0) { gameOver = true; winner = 'p2'; }
        if (p2Count === 0) { gameOver = true; winner = 'p1'; }

        if (gameOver) {
            this.state = 'gameover';
        } else {
            // Switch turns
            this.currentPlayer = (this.currentPlayer === 'p1') ? 'p2' : 'p1';
            this.state = 'idle';
        }

        // Send data
        this.onTurnEnd({
            penguins: this.penguins,
            nextTurn: this.currentPlayer,
            gameOver: gameOver,
            winner: winner
        });
    }

    // --- DRAWING ---

    draw() {
        // Clear
        this.ctx.fillStyle = '#0a3d62'; // Ocean color
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw Ice Rink
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, this.rinkRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#e3f2fd'; // Ice color
        this.ctx.fill();
        this.ctx.strokeStyle = '#90caf9';
        this.ctx.lineWidth = 5;
        this.ctx.stroke();

        // Draw Penguins
        this.penguins.forEach(p => {
            if (!p.alive) return;
            
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            
            // Color based on team
            if (p.team === 'p1') {
                this.ctx.fillStyle = '#e74c3c'; // Red
                this.ctx.strokeStyle = '#c0392b';
            } else {
                this.ctx.fillStyle = '#3498db'; // Blue
                this.ctx.strokeStyle = '#2980b9';
            }
            
            // Highlight current turn team
            if (this.state === 'idle' && p.team === this.currentPlayer) {
                this.ctx.lineWidth = 3;
                this.ctx.strokeStyle = '#fff';
            } else {
                this.ctx.lineWidth = 2;
            }

            this.ctx.fill();
            this.ctx.stroke();

            // Eyes (to make them look like penguins)
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath();
            this.ctx.arc(p.x - 4, p.y - 4, 3, 0, Math.PI * 2);
            this.ctx.arc(p.x + 4, p.y - 4, 3, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = 'black';
            this.ctx.beginPath();
            this.ctx.arc(p.x - 4, p.y - 4, 1, 0, Math.PI * 2);
            this.ctx.arc(p.x + 4, p.y - 4, 1, 0, Math.PI * 2);
            this.ctx.fill();
            // Beak
            this.ctx.fillStyle = '#f1c40f';
            this.ctx.beginPath();
            this.ctx.moveTo(p.x, p.y + 4);
            this.ctx.lineTo(p.x - 3, p.y);
            this.ctx.lineTo(p.x + 3, p.y);
            this.ctx.fill();
        });

        // Draw Aiming Line
        if (this.state === 'aiming' && this.selectedPenguin) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.selectedPenguin.x, this.selectedPenguin.y);
            // Draw opposite to drag (Sling logic)
            const dx = this.dragStartX - this.dragCurrentX;
            const dy = this.dragStartY - this.dragCurrentY;
            
            this.ctx.lineTo(this.selectedPenguin.x + dx, this.selectedPenguin.y + dy);
            this.ctx.strokeStyle = 'white';
            this.ctx.setLineDash([5, 5]);
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Status Text
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 20px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        if (this.state === 'gameover') {
            this.ctx.fillStyle = 'black';
            this.ctx.fillRect(this.width/2 - 100, this.height/2 - 30, 200, 60);
            this.ctx.fillStyle = 'white';
            const winnerName = (this.currentPlayer === 'p2') ? "Red Team" : "Blue Team"; // Inverted because turn switched at end
            this.ctx.fillText(`${winnerName} Wins!`, this.width/2, this.height/2);
        }
    }
}