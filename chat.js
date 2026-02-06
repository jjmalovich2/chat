// chat.js
import { PoolGame } from './pool.js';

// --- CONFIG ---
const SUPABASE_URL = "https://xyvyocpdekeewoyvomuv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dnlvY3BkZWtlZXdveXZvbXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjc0NTEsImV4cCI6MjA4NTc0MzQ1MX0.8VkWO7vxdm4GrMp2FCeF4Ds7sxUVWo1AxOrxbeu4f4Y";
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- USER ---
let myName = localStorage.getItem("chat-user");
if (!myName) {
    myName = prompt("Enter your name:") || "Player";
    localStorage.setItem("chat-user", myName);
}

// --- DOM ELEMENTS ---
const elements = {
    msgList: document.getElementById("messages"),
    input: document.getElementById("msgInput"),
    sendBtn: document.getElementById("sendBtn"),
    newGameBtn: document.getElementById("newGameBtn"),
    modal: document.getElementById("gameModal"),
    closeBtn: document.getElementById("closeGameBtn"),
    statusTitle: document.getElementById("statusTitle"),
    statusSub: document.getElementById("statusSub")
};

let poolGame = null;

// --- GAME LOGIC ---

function initGame() {
    if (!poolGame) {
        poolGame = new PoolGame('poolCanvas', (turnData) => {
            // This runs when I finish my shot
            elements.modal.style.display = 'none';
            sendGameTurn(turnData);
        });
        
        // Add a listener for when replay finishes
        poolGame.onReplayFinished = () => {
            elements.statusTitle.innerText = "Your Turn";
            elements.statusSub.innerText = "Take your shot!";
        };
    }
    poolGame.resize();
}

// 1. Start Fresh Game
elements.newGameBtn.onclick = () => {
    elements.modal.style.display = 'flex';
    initGame();
    elements.statusTitle.innerText = "New Game";
    elements.statusSub.innerText = "Break the rack!";
    poolGame.setupNewGame();
};

// 2. Play Turn from Chat
function openGameFromChat(gameData, isMyTurn) {
    elements.modal.style.display = 'flex';
    initGame();

    if (isMyTurn) {
        // REPLAY MODE: Load balls, play shot, then unlock
        elements.statusTitle.innerText = "Replaying...";
        elements.statusSub.innerText = "Watch their move";
        poolGame.loadGame(gameData); 
    } else {
        // SPECTATOR MODE: Just show the result, no interaction
        elements.statusTitle.innerText = "Waiting...";
        elements.statusSub.innerText = "It's their turn";
        // To show "current" state, we'd need to simulate the result, 
        // but for simplicity, we just load the pre-shot state. 
        // Realistically, you'd hide the "Play" button if it's not your turn.
        poolGame.loadGame(gameData);
        poolGame.canInteract = false; 
    }
}

elements.closeBtn.onclick = () => { elements.modal.style.display = 'none'; };

// --- MESSAGING LOGIC ---

async function sendGameTurn(data) {
    await _supabase.from("messages").insert([{
        sender: myName,
        content: JSON.stringify(data), // Save JSON in content
        message_type: 'game_pool'
    }]);
}

async function sendText() {
    const text = elements.input.value.trim();
    if(!text) return;
    await _supabase.from("messages").insert([{ sender: myName, content: text, message_type: 'text' }]);
    elements.input.value = "";
}

elements.sendBtn.onclick = sendText;
elements.input.onkeydown = (e) => { if(e.key==="Enter") sendText(); };

// --- RENDERING ---

function renderMessage(msg) {
    const isMe = msg.sender === myName;
    const row = document.createElement("div");
    row.className = `message-row ${isMe ? "sent" : "received"}`;
    
    if (msg.message_type === 'game_pool') {
        const bubble = document.createElement("div");
        bubble.className = "message game-bubble";
        bubble.innerHTML = `<span class="game-icon">🎱</span><span class="game-text">${isMe ? "Played" : "Your Turn"}</span>`;
        
        bubble.onclick = () => {
            let data = JSON.parse(msg.content);
            // If I sent it, I can't play it again. If they sent it, it's my turn.
            openGameFromChat(data, !isMe); 
        };
        row.appendChild(bubble);
    } else {
        const bubble = document.createElement("div");
        bubble.className = "message";
        bubble.innerText = msg.content;
        row.appendChild(bubble);
    }
    
    elements.msgList.appendChild(row);
    elements.msgList.scrollTop = elements.msgList.scrollHeight;
}

// --- SYNC ---
async function fetchHistory() {
    const { data } = await _supabase.from("messages").select("*").order("created_at", {ascending:true});
    if(data) { elements.msgList.innerHTML=""; data.forEach(renderMessage); }
}

_supabase.channel("chat-room")
    .on("postgres_changes", { event:"INSERT", schema:"public", table:"messages" }, p => renderMessage(p.new))
    .subscribe();

fetchHistory();
