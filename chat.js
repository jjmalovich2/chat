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

// Set initial color
el.color.value = myColor;
el.color.addEventListener("change", (e) => {
    myColor = e.target.value;
    localStorage.setItem("chat-color", myColor);
});

// --- MESSAGING FUNCTIONS ---

async function sendMessage(content, type = 'text') {
    const payload = {
        sender: myName,
        content: content,
        message_type: type,
        user_color: myColor
    };
    await _supabase.from("messages").insert([payload]);
    if (type === 'text') el.input.value = "";
}

// Send Text
el.send.onclick = () => { if(el.input.value.trim()) sendMessage(el.input.value.trim()); };
el.input.onkeydown = (e) => { if(e.key==="Enter" && el.input.value.trim()) sendMessage(el.input.value.trim()); };

// --- FILE UPLOADS (FIXED FOR 'chat-images') ---

async function uploadFile(file) {
    if(!file) return;
    
    // Sanitize filename
    const fileName = `${Date.now()}_${file.name.replace(/\s/g,'_')}`;
    
    // 1. Upload to 'chat-images' bucket
    const { data, error } = await _supabase.storage
        .from('chat-images') // <--- UPDATED HERE
        .upload(fileName, file);
    
    if(error) {
        console.error("Upload Error:", error);
        alert("Upload Failed: " + error.message);
        return;
    }
    
    // 2. Get Public URL from 'chat-images'
    const { data: publicData } = _supabase.storage
        .from('chat-images') // <--- UPDATED HERE
        .getPublicUrl(fileName);
        
    // 3. Send URL as a message
    sendMessage(publicData.publicUrl, 'image');
}

// Button Listeners
el.btnImg.onclick = () => el.file.click();
el.file.onchange = (e) => uploadFile(e.target.files[0]);

el.btnCam.onclick = () => el.cam.click();
el.cam.onchange = (e) => uploadFile(e.target.files[0]);


// --- POOL GAME LOGIC (Horizontal) ---

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


// --- RENDERING ---

function renderMessage(msg) {
    const isMe = msg.sender === myName;
    const row = document.createElement("div");
    row.className = `message-row ${isMe ? "sent" : "received"}`;
    
    const bubble = document.createElement("div");
    
    // 1. GAME BUBBLE
    if(msg.message_type === 'game_pool') {
        bubble.className = "message game-bubble";
        bubble.innerHTML = `<span class="game-icon">🎱</span><span class="game-text">${isMe?"Played":"Your Turn"}</span>`;
        bubble.onclick = () => {
            try {
                const data = JSON.parse(msg.content);
                openGameFromChat(data, !isMe);
            } catch(e) { console.error("Game data error", e); }
        };
    } 
    // 2. IMAGE BUBBLE
    else if (msg.message_type === 'image') {
        bubble.className = "message";
        if(isMe && msg.user_color) bubble.style.backgroundColor = msg.user_color;
        
        const img = document.createElement("img");
        img.src = msg.content;
        img.onload = () => { el.msgs.scrollTop = el.msgs.scrollHeight; }; // Scroll when loaded
        bubble.appendChild(img);
    }
    // 3. TEXT BUBBLE
    else {
        bubble.className = "message";
        bubble.innerText = msg.content;
        if(isMe && msg.user_color) bubble.style.backgroundColor = msg.user_color;
    }
    
    row.appendChild(bubble);
    el.msgs.appendChild(row);
    el.msgs.scrollTop = el.msgs.scrollHeight;
}


// --- REALTIME & HISTORY ---

// Presence (Active Status)
const channel = _supabase.channel('room1');
channel
    .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat();
        // Identify if anyone else is here
        const others = users.filter(u => u.user !== myName);
        el.activeInd.style.display = others.length > 0 ? 'flex' : 'none';
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        renderMessage(payload.new);
    })
    .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await channel.track({ user: myName, online_at: new Date().toISOString() });
        }
    });

// Load History
async function fetchHistory() {
    const { data } = await _supabase.from("messages").select("*").order("created_at", {ascending:true});
    if(data) { 
        el.msgs.innerHTML=""; 
        data.forEach(renderMessage); 
    }
}

fetchHistory();
