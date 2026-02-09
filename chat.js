import { PoolGame } from './pool.js';
import { KnockoutGame } from './knockout.js';

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

// --- STATE ---
let replyingTo = null; 

// --- DOM ELEMENTS ---
const el = {
    msgs: document.getElementById("messages"),
    input: document.getElementById("msgInput"),
    send: document.getElementById("sendBtn"),
    color: document.getElementById("colorInput"),
    file: document.getElementById("fileInput"),
    btnImg: document.getElementById("imgBtn"),
    btnCam: document.getElementById("camBtn"),
    btnGame: document.getElementById("newGameBtn"),
    modal: document.getElementById("gameModal"),
    closeGame: document.getElementById("closeGameBtn"),
    statusTitle: document.getElementById("statusTitle"),
    statusSub: document.getElementById("statusSub"),
    camModal: document.getElementById("cameraModal"),
    camView: document.getElementById("cameraView"),
    shutter: document.getElementById("shutterBtn"),
    closeCam: document.getElementById("closeCamBtn"),
    activeInd: document.getElementById("activeIndicator"),
    replyBar: document.getElementById("replyBar"),
    replyUser: document.getElementById("replyUser"),
    replyText: document.getElementById("replyText"),
    closeReply: document.getElementById("closeReplyBtn")
};

el.color.value = myColor;
el.color.addEventListener("change", (e) => {
    myColor = e.target.value;
    localStorage.setItem("chat-color", myColor);
    updateStatus(myStatus);
});

// --- REPLY SYSTEM ---
function setReply(msg) {
    replyingTo = msg;
    el.replyBar.style.display = "flex";
    el.replyUser.innerText = `Replying to ${msg.sender}`;
    if (msg.message_type === 'image') {
        el.replyText.innerText = "🖼️ Photo";
    } else if (msg.message_type === 'game_pool') {
        el.replyText.innerText = "🎱 8-Ball Pool";
    } else {
        el.replyText.innerText = msg.content;
    }
    el.input.focus();
}

function clearReply() {
    replyingTo = null;
    el.replyBar.style.display = "none";
}

el.closeReply.onclick = clearReply;

// --- MESSAGING ---
async function sendMessage(content, type = 'text') {
    let finalContent = content;
    
    // Prepare reply data
    let replyText = null;
    let replySender = null;

    if (replyingTo) {
        replySender = replyingTo.sender;
        if (replyingTo.message_type === 'image') replyText = "📷 Photo";
        else if (replyingTo.message_type === 'game_pool') replyText = "🎱 8-Ball Pool";
        else if (replyingTo.message_type === 'game_knockout') replyText = "🐧 Penguin Knockout"; // <--- Add this
        else replyText = replyingTo.content;
    }

    const payload = {
        sender: myName,
        content: finalContent,
        message_type: type,
        user_color: myColor,
        liked_by: [],
        reply_to_text: replyText,
        reply_to_sender: replySender
    };
    
    await _supabase.from("messages").insert([payload]);
    if (type === 'text') el.input.value = "";
    clearReply(); 
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

// --- KNOCKOUT PENGUIN GAME ---
let knockoutGame = null;

function initKnockout() {
    // Reuse poolCanvas
    if (!knockoutGame) {
        knockoutGame = new KnockoutGame('poolCanvas', (gameData) => {
            el.modal.style.display = 'none';
            sendMessage(JSON.stringify(gameData), 'game_knockout');
        });
    }
    knockoutGame.resize();
}

const btnKnockout = document.getElementById("knockoutBtn");
if (btnKnockout) {
    btnKnockout.onclick = () => {
        el.modal.style.display = 'flex';
        initKnockout();
        el.statusTitle.innerText = "Penguin Knockout";
        el.statusSub.innerText = "Drag to Flick!";
        knockoutGame.setupNewGame();
    };
}

function openKnockoutFromChat(gameData, isMyTurn) {
    el.modal.style.display = 'flex';
    initKnockout();
    
    if (gameData.gameOver) {
        el.statusTitle.innerText = "Game Over";
        const winner = gameData.winner === 'p1' ? "Red Team" : "Blue Team";
        el.statusSub.innerText = `${winner} Won!`;
    } else {
        el.statusTitle.innerText = "Penguin Knockout";
        el.statusSub.innerText = isMyTurn ? "Your Turn (Drag to Flick)" : "Waiting for opponent...";
    }
    
    knockoutGame.loadGame(gameData);
}

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

// --- MESSAGE RENDERING ---
function renderMessage(msg) {
    const isMe = msg.sender === myName;
    const row = document.createElement("div");
    row.className = `message-row ${isMe ? "sent" : "received"}`;
    
    // REPLY ICON
    const replyIcon = document.createElement("div");
    replyIcon.className = "reply-icon-swiping";
    replyIcon.innerHTML = "↩️"; 
    row.appendChild(replyIcon);

    const bubble = document.createElement("div");
    bubble.dataset.id = msg.id;
    
    // 1. RENDER REPLY CONTEXT
    if (msg.reply_to_text) {
        const replyBox = document.createElement("div");
        replyBox.className = "reply-context";
        replyBox.innerHTML = `
            <span class="reply-sender-name">${msg.reply_to_sender}</span>
            <span class="reply-preview-text">${msg.reply_to_text}</span>
        `;
        bubble.appendChild(replyBox);
    }
    
    // 2. RENDER MAIN CONTENT
    if(msg.message_type === 'game_pool') {
        bubble.className = "message game-bubble";
        bubble.innerHTML += `<span class="game-icon">🎱</span><span class="game-text">${isMe?"Played":"Your Turn"}</span>`;
        bubble.onclick = (e) => {
            if(!e.target.closest('.reply-context')) openGameFromChat(JSON.parse(msg.content), !isMe);
        };
    } 
    else if (msg.message_type === 'image') {
        bubble.className = "message";
        if(isMe && msg.user_color) bubble.style.backgroundColor = msg.user_color;
        
        const img = document.createElement('img');
        img.src = msg.content;
        img.onload = () => { el.msgs.scrollTop = el.msgs.scrollHeight; };
        bubble.appendChild(img);
    }
    else if(msg.message_type === 'game_knockout') {
        bubble.className = "message game-bubble";
        bubble.innerHTML += `<span class="game-icon">🐧</span><span class="game-text">${isMe?"Played":"Your Turn"}</span>`;
        bubble.onclick = (e) => {
            if(!e.target.closest('.reply-context')) openKnockoutFromChat(JSON.parse(msg.content), !isMe);
        };
    }
    else {
        bubble.className = "message";
        if(isMe) bubble.style.backgroundColor = msg.user_color || "#3797f0";
        else bubble.style.backgroundColor = "#262626";
        
        const textSpan = document.createElement("div");
        textSpan.innerHTML = msg.content;
        bubble.appendChild(textSpan);
        
        if (msg.content && msg.content.length > 1 && msg.content === msg.content.toUpperCase() && /[A-Z]/.test(msg.content)) {
            bubble.classList.add('scream');
        }
    }

    // --- LIKE BADGE ---
    const likesList = msg.liked_by || [];
    const isLikedByMe = likesList.includes(myName);
    bubble.dataset.liked = isLikedByMe ? "true" : "false";

    if(isLikedByMe) {
        const badge = document.createElement('div');
        badge.className = 'liked-badge';
        badge.innerHTML = '❤️';
        bubble.appendChild(badge);
    }

    // --- DOUBLE CLICK LIKE ---
    bubble.addEventListener('dblclick', async (e) => {
        e.stopPropagation(); e.preventDefault();
        const { data: currentMsg } = await _supabase.from('messages').select('liked_by').eq('id', msg.id).single();
        let currentLikes = currentMsg ? (currentMsg.liked_by || []) : [];
        const wasLiked = currentLikes.includes(myName);
        let newLikes;
        if (wasLiked) {
            newLikes = currentLikes.filter(name => name !== myName);
            const oldBadge = bubble.querySelector('.liked-badge');
            if(oldBadge) oldBadge.remove();
            
            const container = document.createElement('div');
            container.className = 'broken-heart-svg';
            container.innerHTML = `
                <svg viewBox="0 0 32 32" width="100%" height="100%">
                    <path class="heart-shard left-shard" d="M16,6 L13,10 L16,15 L13,20 L16,29 C6,29 2,22 2,12 C2,6 7,2 12,2 C14.5,2 16,4 16,6 Z" />
                    <path class="heart-shard right-shard" d="M16,6 L13,10 L16,15 L13,20 L16,29 C26,29 30,22 30,12 C30,6 25,2 20,2 C17.5,2 16,4 16,6 Z" />
                </svg>
            `;
            bubble.appendChild(container);
            setTimeout(() => container.remove(), 800);
            bubble.dataset.liked = "false";
        } else {
            newLikes = [...currentLikes, myName];
            const oldBadge = bubble.querySelector('.liked-badge');
            if(oldBadge) oldBadge.remove();
            const heart = document.createElement('div');
            heart.className = 'heart-pop';
            heart.innerHTML = '❤️';
            bubble.appendChild(heart);
            setTimeout(() => heart.remove(), 800);
            const badge = document.createElement('div');
            badge.className = 'liked-badge';
            badge.innerHTML = '❤️';
            bubble.appendChild(badge);
            bubble.dataset.liked = "true";
        }
        await _supabase.from("messages").update({ liked_by: newLikes }).eq("id", msg.id);
    });

    // --- SWIPE LOGIC (Mouse + Touch) ---
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    
    const startDrag = (x) => {
        startX = x; currentX = x; isDragging = true;
        bubble.style.transition = 'none'; 
    };

    const moveDrag = (x, e) => {
        if (!isDragging) return;
        currentX = x;
        const diff = currentX - startX;
        const absDiff = Math.abs(diff);

        let translate = 0;
        if (isMe) { // Me -> Drag Left
            if (diff < 0) {
                if(e.cancelable && absDiff > 5) e.preventDefault(); 
                translate = Math.max(diff, -100); 
            }
        } else { // Them -> Drag Right
            if (diff > 0) {
                if(e.cancelable && absDiff > 5) e.preventDefault();
                translate = Math.min(diff, 100);
            }
        }

        if (translate !== 0) {
            bubble.style.transform = `translateX(${translate}px)`;
            const progress = Math.min(Math.abs(translate) / 60, 1);
            replyIcon.style.opacity = progress;
            replyIcon.style.transform = `scale(${progress})`;
        }
    };

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        const diff = currentX - startX;
        bubble.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
        bubble.style.transform = `translateX(0px)`;
        replyIcon.style.opacity = 0;

        if (Math.abs(diff) > 50) { 
            if ((isMe && diff < -30) || (!isMe && diff > 30)) {
                if(navigator.vibrate) navigator.vibrate(10);
                setReply(msg);
            }
        }
    };

    // Events
    bubble.addEventListener('mousedown', (e) => startDrag(e.clientX));
    window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e));
    window.addEventListener('mouseup', endDrag);

    bubble.addEventListener('touchstart', (e) => startDrag(e.touches[0].clientX), {passive: true});
    bubble.addEventListener('touchmove', (e) => moveDrag(e.touches[0].clientX, e), {passive: false});
    bubble.addEventListener('touchend', endDrag);

    row.appendChild(bubble);
    el.msgs.appendChild(row);
    el.msgs.scrollTop = el.msgs.scrollHeight;
}

// --- UPDATE UI WHEN DB CHANGES ---
function updateMessageUI(updatedMsg) {
    const bubble = document.querySelector(`.message[data-id="${updatedMsg.id}"]`);
    if(!bubble) return;
    const likesList = updatedMsg.liked_by || [];
    const isLikedByMe = likesList.includes(myName);
    if (bubble.dataset.liked === "true" && !isLikedByMe) {
        const oldBadge = bubble.querySelector('.liked-badge');
        if(oldBadge) oldBadge.remove();
        bubble.dataset.liked = "false";
    } else if (bubble.dataset.liked === "false" && isLikedByMe) {
        const badge = document.createElement('div');
        badge.className = 'liked-badge';
        badge.innerHTML = '❤️';
        bubble.appendChild(badge);
        bubble.dataset.liked = "true";
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
channel.on('presence', { event: 'sync' }, () => {
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
            story.innerHTML = `<div class="story-ring"><div class="story-avatar" style="background: ${userColor}">${initial}</div><div class="story-status ${isIdle ? 'status-idle' : 'status-online'}"></div></div><span class="story-name">${u.user}</span>`;
            el.activeInd.appendChild(story);
        });
    })
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
