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
    cam: document.getElementById("camInput"),
    btnImg: document.getElementById("imgBtn"),
    btnCam: document.getElementById("camBtn"),
    btnGame: document.getElementById("newGameBtn"),
    modal: document.getElementById("gameModal"),
    closeGame: document.getElementById("closeGameBtn"),
    statusTitle: document.getElementById("statusTitle"),
    statusSub: document.getElementById("statusSub"),
    activeInd: document.getElementById("activeIndicator")
};

el.color.value = myColor;
el.color.addEventListener("change", (e) => {
    myColor = e.target.value;
    localStorage.setItem("chat-color", myColor);
});

// --- MESSAGING ---
async function sendMessage(content, type = 'text') {
    const payload = {
        sender: myName,
        content: content,
        message_type: type,
        user_color: myColor
    };
    await _supabase.from("messages").insert([payload]);
    if (type === 'text') el.input.value = "";
    resetIdleTimer(); // Typing keeps you active
}

el.send.onclick = () => { if(el.input.value.trim()) sendMessage(el.input.value.trim()); };
el.input.onkeydown = (e) => { if(e.key==="Enter" && el.input.value.trim()) sendMessage(el.input.value.trim()); };

// --- UPLOADS ---
async function uploadFile(file) {
    if(!file) return;
    const fileName = `${Date.now()}_${file.name.replace(/\s/g,'_')}`;
    const { data, error } = await _supabase.storage.from('chat-images').upload(fileName, file);
    if(error) { alert("Upload Failed: " + error.message); return; }
    const { data: publicData } = _supabase.storage.from('chat-images').getPublicUrl(fileName);
    sendMessage(publicData.publicUrl, 'image');
}

el.btnImg.onclick = () => el.file.click();
el.file.onchange = (e) => uploadFile(e.target.files[0]);
el.btnCam.onclick = () => el.cam.click();
el.cam.onchange = (e) => uploadFile(e.target.files[0]);

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
        
        // SCREAM CHECK
        if (msg.content && msg.content.length > 1 && msg.content === msg.content.toUpperCase() && /[A-Z]/.test(msg.content)) {
            bubble.classList.add('scream');
        }
    }
    
    row.appendChild(bubble);
    el.msgs.appendChild(row);
    el.msgs.scrollTop = el.msgs.scrollHeight;
}

// --- IDLE & PRESENCE SYSTEM ---
const channel = _supabase.channel('room1');
let idleTimeout;
let myStatus = 'online'; // 'online' or 'idle'

// 1. Function to broadcast status
async function updateStatus(status) {
    myStatus = status;
    await channel.track({ 
        user: myName, 
        status: status,
        online_at: new Date().toISOString() 
    });
}

// 2. Idle Timer Logic (5 Mins)
function resetIdleTimer() {
    clearTimeout(idleTimeout);
    
    // If we were idle, wake up!
    if (myStatus === 'idle') {
        updateStatus('online');
    }

    // Set timer for 5 minutes (300,000 ms)
    idleTimeout = setTimeout(() => {
        updateStatus('idle');
    }, 5 * 60 * 1000); 
}

// 3. Presence Updates (Showing names)
channel
    .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat();
        
        // Remove duplicates (if user has multiple tabs open, take the latest one)
        const uniqueUsers = {};
        users.forEach(u => {
            // Overwrite if newer or if we haven't seen them
            uniqueUsers[u.user] = u; 
        });

        // Build HTML for header
        el.activeInd.innerHTML = "";
        
        Object.values(uniqueUsers).forEach(u => {
            const isIdle = u.status === 'idle';
            const span = document.createElement('span');
            span.className = 'user-tag';
            
            // Dot color based on status
            const dotClass = isIdle ? 'dot-idle' : 'dot-online';
            const text = isIdle ? `${u.user} (Idle)` : u.user;
            
            span.innerHTML = `<div class="${dotClass}"></div> ${text}`;
            el.activeInd.appendChild(span);
        });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => renderMessage(p.new))
    .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            updateStatus('online');
            resetIdleTimer();
        }
    });

// 4. Attach Listeners for Activity
['mousemove', 'keydown', 'touchstart', 'click'].forEach(evt => {
    window.addEventListener(evt, resetIdleTimer);
});

// Load History
async function fetchHistory() {
    const { data } = await _supabase.from("messages").select("*").order("created_at", {ascending:true});
    if(data) { el.msgs.innerHTML=""; data.forEach(renderMessage); }
}
fetchHistory();
