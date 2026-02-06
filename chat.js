import { PoolGame } from './pool.js';

// --- CONFIG ---
const SUPABASE_URL = "https://xyvyocpdekeewoyvomuv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dnlvY3BkZWtlZXdveXZvbXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjc0NTEsImV4cCI6MjA4NTc0MzQ1MX0.8VkWO7vxdm4GrMp2FCeF4Ds7sxUVWo1AxOrxbeu4f4Y";
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- USER SETUP ---
let myName = localStorage.getItem("chat-user");
if (!myName) {
    myName = prompt("Enter your name:") || "Guest";
    localStorage.setItem("chat-user", myName);
}
let myColor = localStorage.getItem("chat-color") || "#3797f0";

// --- DOM ELEMENTS ---
const el = {
    msgs: document.getElementById("messages"),
    input: document.getElementById("msgInput"),
    send: document.getElementById("sendBtn"),
    color: document.getElementById("colorInput"),
    file: document.getElementById("fileInput"),
    
    // Buttons
    btnImg: document.getElementById("imgBtn"),
    btnCam: document.getElementById("camBtn"),
    btnGame: document.getElementById("newGameBtn"),
    
    // Modals
    modal: document.getElementById("gameModal"),
    closeGame: document.getElementById("closeGameBtn"),
    statusTitle: document.getElementById("statusTitle"),
    statusSub: document.getElementById("statusSub"),
    camModal: document.getElementById("cameraModal"),
    camView: document.getElementById("cameraView"),
    shutter: document.getElementById("shutterBtn"),
    closeCam: document.getElementById("closeCamBtn"),
    
    activeInd: document.getElementById("activeIndicator")
};

el.color.value = myColor;
el.color.addEventListener("change", (e) => {
    myColor = e.target.value;
    localStorage.setItem("chat-color", myColor);
    updateStatus(myStatus);
});

// --- MESSAGING ---
async function sendMessage(content, type = 'text') {
    const payload = {
        sender: myName,
        content: content,
        message_type: type,
        user_color: myColor,
        is_liked: false
    };
    await _supabase.from("messages").insert([payload]);
    if (type === 'text') el.input.value = "";
    resetIdleTimer();
}

el.send.onclick = () => { if(el.input.value.trim()) sendMessage(el.input.value.trim()); };
el.input.onkeydown = (e) => { if(e.key==="Enter" && el.input.value.trim()) sendMessage(el.input.value.trim()); };

// --- FILE UPLOADS & CAMERA ---
async function uploadFile(file) {
    if(!file) return;
    const fileName = `${Date.now()}_${file.name ? file.name.replace(/\s/g,'_') : 'cam_photo.jpg'}`;
    const { data, error } = await _supabase.storage.from('chat-images').upload(fileName, file);
    if(error) { alert("Upload Failed: " + error.message); return; }
    const { data: publicData } = _supabase.storage.from('chat-images').getPublicUrl(fileName);
    sendMessage(publicData.publicUrl, 'image');
}

el.btnImg.onclick = () => el.file.click();
el.file.onchange = (e) => uploadFile(e.target.files[0]);

let stream = null;
async function startCamera() {
    try {
        el.camModal.style.display = 'flex';
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        el.camView.srcObject = stream;
    } catch (err) {
        alert("Camera error: " + err.message);
        el.camModal.style.display = 'none';
    }
}
function stopCamera() {
    if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
    el.camModal.style.display = 'none';
}
function takePhoto() {
    if (!stream) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.camView.videoWidth;
    canvas.height = el.camView.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(el.camView, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
        const file = new File([blob], "camera_snap.jpg", { type: "image/jpeg" });
        uploadFile(file);
        stopCamera();
    }, "image/jpeg", 0.8);
}

el.btnCam.onclick = startCamera;
el.closeCam.onclick = stopCamera;
el.shutter.onclick = takePhoto;

// --- POOL GAME ---
let poolGame = null;
function initPool() {
    if (!poolGame) {
        poolGame = new PoolGame('poolCanvas', (turnData) => {
            el.modal.style.display = 'none';
            sendMessage(JSON.stringify(turnData), 'game_pool');
        });
        poolGame.onReplayFinished = () => {
            el.statusTitle.innerText = "Your Turn";
            el.statusSub.innerText = "Take your shot!";
        };
    }
    poolGame.resize();
}

el.btnGame.onclick = () => {
    el.modal.style.display = 'flex';
    initPool();
    el.statusTitle.innerText = "New Game";
    el.statusSub.innerText = "Break the rack!";
    poolGame.setupNewGame();
    resetIdleTimer();
};
el.closeGame.onclick = () => { el.modal.style.display = 'none'; };

function openGameFromChat(gameData, isMyTurn) {
    el.modal.style.display = 'flex';
    initPool();
    if(isMyTurn) {
        el.statusTitle.innerText = "Replaying...";
        el.statusSub.innerText = "Watch their move";
        poolGame.loadGame(gameData);
    } else {
        el.statusTitle.innerText = "Waiting...";
        el.statusSub.innerText = "It's their turn";
        poolGame.loadGame(gameData);
    }
}

// --- RENDER MESSAGES ---
function renderMessage(msg) {
    const isMe = msg.sender === myName;
    const row = document.createElement("div");
    row.className = `message-row ${isMe ? "sent" : "received"}`;
    
    const bubble = document.createElement("div");
    bubble.dataset.id = msg.id; // Store ID for liking
    bubble.dataset.liked = msg.is_liked ? "true" : "false";

    // 1. CONTENT
    if(msg.message_type === 'game_pool') {
        bubble.className = "message game-bubble";
        bubble.innerHTML = `<span class="game-icon">🎱</span><span class="game-text">${isMe?"Played":"Your Turn"}</span>`;
        bubble.onclick = () => openGameFromChat(JSON.parse(msg.content), !isMe);
    } 
    else if (msg.message_type === 'image') {
        bubble.className = "message";
        if(isMe && msg.user_color) bubble.style.backgroundColor = msg.user_color;
        bubble.innerHTML = `<img src="${msg.content}" onload="this.parentNode.parentNode.scrollIntoView()" />`;
    }
    else {
        bubble.className = "message";
        if(isMe) bubble.style.backgroundColor = msg.user_color || "#3797f0";
        else bubble.style.backgroundColor = "#262626";
        bubble.innerHTML = msg.content; 
        
        if (msg.content && msg.content.length > 1 && msg.content === msg.content.toUpperCase() && /[A-Z]/.test(msg.content)) {
            bubble.classList.add('scream');
        }
    }

    // 2. LIKE BADGE (If exists)
    if(msg.is_liked) {
        const badge = document.createElement('div');
        badge.className = 'liked-badge';
        badge.innerHTML = '❤️';
        bubble.appendChild(badge);
    }

    // 3. DOUBLE CLICK TO LIKE
    bubble.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const currentLiked = bubble.dataset.liked === "true";
        const newLiked = !currentLiked;

        // Optimistic UI Update (Instant Visual)
        bubble.dataset.liked = newLiked;
        
        // Remove existing badge
        const oldBadge = bubble.querySelector('.liked-badge');
        if(oldBadge) oldBadge.remove();

        if (newLiked) {
            // Add Badge
            const badge = document.createElement('div');
            badge.className = 'liked-badge';
            badge.innerHTML = '❤️';
            bubble.appendChild(badge);

            // Pop Animation
            const heart = document.createElement('div');
            heart.className = 'heart-pop';
            heart.innerHTML = '❤️';
            bubble.appendChild(heart);
            setTimeout(() => heart.remove(), 800);
        }

        // Database Update
        await _supabase.from("messages").update({ is_liked: newLiked }).eq("id", msg.id);
    });
    
    row.appendChild(bubble);
    el.msgs.appendChild(row);
    el.msgs.scrollTop = el.msgs.scrollHeight;
}

// --- UPDATE HANDLER (For Realtime Likes) ---
function updateMessageUI(updatedMsg) {
    // Find the bubble
    const bubble = document.querySelector(`.message[data-id="${updatedMsg.id}"]`);
    if(!bubble) return;

    bubble.dataset.liked = updatedMsg.is_liked ? "true" : "false";

    // Remove existing badge
    const oldBadge = bubble.querySelector('.liked-badge');
    if(oldBadge) oldBadge.remove();

    // Add new badge if liked
    if (updatedMsg.is_liked) {
        const badge = document.createElement('div');
        badge.className = 'liked-badge';
        badge.innerHTML = '❤️';
        bubble.appendChild(badge);
    }
}

// --- PRESENCE & SYNC ---
const channel = _supabase.channel('room1');
let idleTimeout;
let myStatus = 'online'; 

async function updateStatus(status) {
    myStatus = status;
    await channel.track({ user: myName, status: status, color: myColor, online_at: new Date().toISOString() });
}

function resetIdleTimer() {
    clearTimeout(idleTimeout);
    if (myStatus === 'idle') updateStatus('online');
    idleTimeout = setTimeout(() => { updateStatus('idle'); }, 5 * 60 * 1000); 
}

channel
    .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat();
        const uniqueUsers = {};
        users.forEach(u => uniqueUsers[u.user] = u);

        el.activeInd.innerHTML = "";
        
        Object.values(uniqueUsers).forEach(u => {
            const isIdle = u.status === 'idle';
            const userColor = u.color || "#555";
            const initial = u.user.charAt(0).toUpperCase();
            
            const story = document.createElement('div');
            story.className = 'story-item';
            
            story.innerHTML = `
                <div class="story-ring">
                    <div class="story-avatar" style="background: ${userColor}">${initial}</div>
                    <div class="story-status ${isIdle ? 'status-idle' : 'status-online'}"></div>
                </div>
                <span class="story-name">${u.user}</span>
            `;
            el.activeInd.appendChild(story);
        });
    })
    // LISTEN FOR BOTH INSERTS AND UPDATES
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => renderMessage(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, p => updateMessageUI(p.new))
    .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            updateStatus('online');
            resetIdleTimer();
        }
    });

['mousemove', 'keydown', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, resetIdleTimer);
});

async function fetchHistory() {
    const { data } = await _supabase.from("messages").select("*").order("created_at", {ascending:true});
    if(data) { el.msgs.innerHTML=""; data.forEach(renderMessage); }
}
fetchHistory();
