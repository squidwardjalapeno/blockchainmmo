
import { hero, getLevelInfo } from './entities.js';
import { socket, remotePlayers, playerWallet, setPlayerWallet } from './multiplayer.js';
import { CONFIG } from './config.js';
import { ITEM_TYPES, createItem } from './items.js';
import { submitVoucherToChain, connectWallet } from './blockchainManager.js';
import { mapCanvas } from './renderer.js';
import { recalculateStats } from './interactionManager.js';


if (typeof window !== 'undefined') {
    logStep("uiManager.js");
}

const USD_CONVERSION_RATE = 0.0001; // 10,000 points = $1.00

export const uiState = {
    isOpen: false,
    currentTab: 'inventory'
};

// ==========================================
// CHEST, TEMPLE, & STORAGE STATES
// ==========================================
export let activeChestId = null;
export let activeChestItems = [];

export let altarItem = null;

export let activeCellarId = null;
export let activeCellarItems = [];

export let activeHayStorageId = null;
export let activeHayStorageItems = [];

const VALID_FOOD_TYPES = ["fish", "cooked_fish", "grass_item"];
const VALID_HAY_TYPES = ["hay"]; 

// ==========================================
// 🆕 PALADIN SKILLS DATABASE
// ==========================================
export const PALADIN_SKILLS = [
    { id: 'p1', name: 'Vault', icon: '⚔️' }, // Renamed from Roll
    { id: 'p2', name: 'Holy Shield / Holy Blast', icon: '✨' },
    { id: 'p3', name: 'Divine Bubble', icon: '🛡️' },
    { id: 'p4', name: "Ascension / Lion's Breath", icon: '🏃' },

    { id: 'p5', name: 'Radiant Nova', icon: '💪' },
    { id: 'p6', name: 'Flux Shot', icon: '🔥' },
    { id: 'p7', name: 'Warp', icon: '🦁' },
    { id: 'p8', name: "Heaven's Halo", icon: '🌪️' },

    { id: 'p9', name: 'Flare', icon: '🔨' },
    { id: 'p10', name: 'Fever', icon: '🤲' },
    { id: 'p11', name: 'Ring of Penance', icon: '⚡' },
    { id: 'p12', name: 'Zephyr', icon: '🔆' },
    
    { id: 'p13', name: 'Vanguard', icon: '👁️' },
    { id: 'p14', name: 'Consecration', icon: '💢' },
    { id: 'p15', name: 'Fleeting Bulwark', icon: '😤' },
    { id: 'p16', name: 'Summon: Zenith Guardian', icon: '🗡️' }
];

let selectedSkills = [];

// ==========================================
// 🎛️ MAIN UI INITIALIZATION
// ==========================================
export function initUI() {
    const overlay = document.getElementById('menu-overlay');
    const tabs = document.querySelectorAll('#menu-tabs button');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            uiState.currentTab = tab.dataset.tab;
            renderTabContent();
        });
    });

    document.getElementById('close-menu').addEventListener('click', toggleMenu);

    // In src/uiManager.js -> inside initUI()
    
    // --- HELP MENU ---
    const helpBtn = document.getElementById('hud-help-btn');
    if (helpBtn) {
        helpBtn.onclick = () => document.getElementById('help-menu').classList.remove('hidden');
    }
    const closeHelpBtn = document.getElementById('close-help-btn');
    if (closeHelpBtn) {
        closeHelpBtn.onclick = () => document.getElementById('help-menu').classList.add('hidden');
    }

    // --- CHEST LISTENERS ---
    document.getElementById('close-chest-btn').addEventListener('click', () => {
        document.getElementById('chest-menu').classList.add('hidden');
        activeChestId = null;
    });

    document.getElementById('unload-all-btn').addEventListener('click', () => {
        if (!activeChestId || hero.inventory.length === 0) return;
        activeChestItems.push(...hero.inventory);
        hero.inventory = [];
        if (socket) socket.emit('updateChest', { chestId: activeChestId, items: activeChestItems });
        renderChestUI();
    });

    const heroPane = document.getElementById('chest-hero-inv');
    const chestPane = document.getElementById('chest-box-inv');

    [heroPane, chestPane].forEach(pane => {
        pane.addEventListener('dragover', (e) => e.preventDefault()); 
    });

    heroPane.addEventListener('drop', (e) => handleDrop(e, 'hero'));
    chestPane.addEventListener('drop', (e) => handleDrop(e, 'chest'));

    // --- TEMPLE LISTENERS ---
    document.getElementById('close-temple-btn').addEventListener('click', () => {
        document.getElementById('temple-menu').classList.add('hidden');
        if (altarItem) {
            hero.inventory.push(altarItem);
            altarItem = null;
        }
    });

    document.getElementById('sacrifice-btn').addEventListener('click', () => {
        if (!altarItem) {
            alert("The Altar is empty!");
            return;
        }
        if (!playerWallet) {
            alert("You must connect your wallet to receive blessings (points)!");
            return;
        }

        if (socket) {
            socket.emit('sacrificeItem', {
                itemType: altarItem.seedType,
                playerWalletAddress: playerWallet
            });
        }
        
        console.log(`💎 Sacrificed ${altarItem.name} to the Gods.`);
        alert("The Gods are pleased! A voucher has been sent to your Bank.");
        
        altarItem = null;
        renderTempleUI();
    });

    const templeHeroPane = document.getElementById('temple-hero-inv');
    const templeSlot = document.getElementById('temple-slot');

    [templeHeroPane, templeSlot].forEach(pane => {
        pane.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (pane.id === 'temple-slot') pane.classList.add('drag-over');
        });
        pane.addEventListener('dragleave', (e) => {
            if (pane.id === 'temple-slot') pane.classList.remove('drag-over');
        });
    });

    templeHeroPane.addEventListener('drop', (e) => handleTempleDrop(e, 'hero-temple'));
    templeSlot.addEventListener('drop', (e) => {
        templeSlot.classList.remove('drag-over');
        handleTempleDrop(e, 'altar');
    });

    // --- KITCHEN LISTENERS ---
    document.getElementById('close-kitchen-btn').addEventListener('click', () => {
        document.getElementById('kitchen-menu').classList.add('hidden');
    });

    document.getElementById('cook-fish-btn').addEventListener('click', () => {
        const fishIdx = hero.inventory.findIndex(item => item.seedType === 'fish');
        if (fishIdx === -1) {
            alert("You don't have any raw fish to cook!");
            return;
        }
        hero.inventory.splice(fishIdx, 1);
        hero.inventory.push(createItem(ITEM_TYPES.COOKED_BASS));
        console.log("🔥 Sizzle... Fish cooked successfully!");
        alert("Success! You cooked a hearty meal.");
    });

    // --- MAP TABLE LISTENERS ---
    document.getElementById('close-maptable-btn').addEventListener('click', () => {
        document.getElementById('maptable-menu').classList.add('hidden');
    });

    // --- CELLAR LISTENERS ---
    document.getElementById('close-cellar-btn').addEventListener('click', () => {
        document.getElementById('cellar-menu').classList.add('hidden');
        activeCellarId = null; 
    });

    document.getElementById('unload-food-btn').addEventListener('click', () => {
        if (!activeCellarId || hero.inventory.length === 0) return;
        
        const foodItems = hero.inventory.filter(i => VALID_FOOD_TYPES.includes(i.seedType));
        const nonFoodItems = hero.inventory.filter(i => !VALID_FOOD_TYPES.includes(i.seedType));

        if (foodItems.length === 0) {
            alert("No food in backpack to unload!");
            return;
        }

        activeCellarItems.push(...foodItems);
        hero.inventory = nonFoodItems; 
        
        if (socket) socket.emit('updateCellar', { cellarId: activeCellarId, items: activeCellarItems });
        renderCellarUI();
    });

    const cellarHeroPane = document.getElementById('cellar-hero-inv');
    const cellarPane = document.getElementById('cellar-box-inv');

    [cellarHeroPane, cellarPane].forEach(pane => {
        pane.addEventListener('dragover', (e) => e.preventDefault()); 
    });

    cellarHeroPane.addEventListener('drop', (e) => handleCellarDrop(e, 'hero-cellar'));
    cellarPane.addEventListener('drop', (e) => handleCellarDrop(e, 'cellar'));

    // --- HAY TABLE LISTENERS ---
    document.getElementById('close-hay-table-btn').addEventListener('click', () => {
        document.getElementById('hay-table-menu').classList.add('hidden');
    });

    document.getElementById('craft-hay-btn').addEventListener('click', () => {
        const grassIdx = hero.inventory.findIndex(item => item.seedType === 'grass_item');
        if (grassIdx === -1) {
            alert("You need Uprooted Grass to make hay!");
            return;
        }
        hero.inventory.splice(grassIdx, 1);
        hero.inventory.push(createItem(ITEM_TYPES.HAY));
        alert("Success! You crafted a bundle of Dried Hay.");
    });

    // --- HAY STORAGE LISTENERS ---
    document.getElementById('close-hay-storage-btn').addEventListener('click', () => {
        document.getElementById('hay-storage-menu').classList.add('hidden');
        activeHayStorageId = null; 
    });

    document.getElementById('unload-hay-btn').addEventListener('click', () => {
        if (!activeHayStorageId || hero.inventory.length === 0) return;
        
        const hayItems = hero.inventory.filter(i => VALID_HAY_TYPES.includes(i.seedType));
        const otherItems = hero.inventory.filter(i => !VALID_HAY_TYPES.includes(i.seedType));

        if (hayItems.length === 0) {
            alert("No hay in backpack to unload!");
            return;
        }

        activeHayStorageItems.push(...hayItems);
        hero.inventory = otherItems;
        
        if (socket) socket.emit('updateHayStorage', { hayStorageId: activeHayStorageId, items: activeHayStorageItems });
        renderHayStorageUI();
    });

    const hayHeroPane = document.getElementById('hay-storage-hero-inv');
    const hayPane = document.getElementById('hay-storage-box-inv');

    [hayHeroPane, hayPane].forEach(pane => {
        pane.addEventListener('dragover', (e) => e.preventDefault()); 
    });

    hayHeroPane.addEventListener('drop', (e) => handleHayStorageDrop(e, 'hero-hay'));
    hayPane.addEventListener('drop', (e) => handleHayStorageDrop(e, 'hay-storage'));

    // --- WITHDRAW BUTTONS ---
    const withdrawBtn = document.getElementById('hud-withdraw-btn');
    if(withdrawBtn) withdrawBtn.onclick = openWithdrawMenu;

    document.getElementById('close-withdraw-btn').onclick = () => {
        document.getElementById('withdraw-menu').classList.add('hidden');
    };

    document.getElementById('confirm-withdraw-btn').onclick = () => {
        const amount = parseFloat(document.getElementById('withdraw-input').value);

        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid amount.");
            return;
        }
        if (amount > hero.inGameUni) {
            alert(`Insufficient balance! You only have ${hero.inGameUni} UNI.`);
            return;
        }
        if (amount < 1000) {
            alert("Minimum withdrawal is 1000 UNI.");
            return;
        }

        if (socket) socket.emit('requestWithdrawal', amount);
        document.getElementById('withdraw-menu').classList.add('hidden');
    };

    // --- 🦊 MAIN MENU LOGIN SYSTEMS ---
    const mainConnectBtn = document.getElementById('main-connect-btn');
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const guestBtn = document.getElementById('guest-btn');

    // 1. Web3 Wallet Login
    if (mainConnectBtn) {
        mainConnectBtn.onclick = async () => {
            mainConnectBtn.innerText = "CONNECTING...";
            let address = await connectWallet();
            if (address && socket) {
                setPlayerWallet(address);
                socket.emit('identifyWallet', address);
            } else {
                mainConnectBtn.innerText = "CONNECT WALLET";
            }
        };
    }

    // 2. Web2 Register/Login
    const handleAuth = (type) => {
        const user = document.getElementById('login-username').value;
        const pass = document.getElementById('login-password').value;
        if (!user || !pass) { alert("Please enter a username and password."); return; }
        
        if (socket) socket.emit(type, { username: user, password: pass });
    };

    if (loginBtn) loginBtn.onclick = () => handleAuth('loginUser');
    if (registerBtn) registerBtn.onclick = () => handleAuth('registerUser');

    if (socket) {
        socket.on('authResponse', (res) => {
            if (res.success) {
                setPlayerWallet(res.wallet);
                socket.emit('identifyWallet', res.wallet);
            } else {
                alert(res.message);
            }
        });
    }

    // 3. Online Guest Mode (Just generates a random ID and connects!)
    if (guestBtn) {
        guestBtn.onclick = () => {
            const guestID = "Guest_" + Math.floor(Math.random() * 999999);
            setPlayerWallet(guestID);
            if (socket) socket.emit('identifyWallet', guestID);
        };
    }
}

// ==========================================
// 🆕 CHARACTER CREATION UI
// ==========================================
export function renderCharacterCreation() {
    const grid = document.getElementById('skill-grid');
    
    grid.innerHTML = PALADIN_SKILLS.map(skill => `
        <div class="skill-item" data-id="${skill.id}">
            <div style="font-size: 24px;">${skill.icon}</div>
            <div style="font-size: 8px; margin-top: 5px;">${skill.name}</div>
        </div>
    `).join('');

    const skillItems = document.querySelectorAll('.skill-item');
    skillItems.forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            
            if (selectedSkills.includes(id)) {
                // Deselect
                selectedSkills = selectedSkills.filter(s => s !== id);
                item.classList.remove('selected');
            } else {
                // Select (Max 4)
                if (selectedSkills.length >= 4) {
                    alert("You can only select 4 core skills!");
                    return;
                }
                selectedSkills.push(id);
                item.classList.add('selected');
            }
            updateSkillSlots();
        });
    });

    document.getElementById('finish-char-btn').addEventListener('click', () => {
        if (selectedSkills.length === 4) {
            if (socket) {
                socket.emit('createCharacter', {
                    wallet: playerWallet,
                    charClass: 'Paladin',
                    skills: selectedSkills
                });
            }
        }
    });
}

// --- Update updateSkillSlots in src/uiManager.js ---
function updateSkillSlots() {
    const slots = document.querySelectorAll('.skill-slot');
    document.getElementById('skill-count').innerText = selectedSkills.length;
    
    const reqLevels = [1, 25, 50, 75]; // The milestone levels

    for (let i = 0; i < 4; i++) {
        // Change slots to a column layout to hold the text
        slots[i].style.flexDirection = 'column';

        if (i < selectedSkills.length) {
            const skill = PALADIN_SKILLS.find(s => s.id === selectedSkills[i]);
            slots[i].innerHTML = `
                <div style="font-size: 24px;">${skill.icon}</div>
                <div style="font-size: 8px; color: #555; margin-top: 5px;">LVL ${reqLevels[i]}</div>
            `;
        } else {
            slots[i].innerHTML = `<div style="font-size: 8px; color: #888;">LVL ${reqLevels[i]}</div>`;
        }
    }

    document.getElementById('finish-char-btn').disabled = (selectedSkills.length !== 4);
}

// ==========================================
// 🎒 IN-GAME MENU (INVENTORY / STATS)
// ==========================================

export function toggleMenu() {
    uiState.isOpen = !uiState.isOpen;
    document.getElementById('menu-overlay').classList.toggle('hidden', !uiState.isOpen);
    if (uiState.isOpen) renderTabContent();
}

function getItemIcon(item) {
    if (item.seedType === "fish") return "🐟";
    if (item.seedType === "cooked_fish") return "🍱";
    if (item.seedType === "plant_matter") return "🌿"; // 👈 Changed from grass_item
    if (item.seedType === "grass_seed") return "🌱"; // 👈 NEW
    if (item.seedType === "rose_seed") return "🌹";       // 👈 NEW
    if (item.seedType === "violet_seed") return "🪻";     // 👈 NEW
    if (item.seedType === "sunflower_seed") return "🌻";  // 👈 NEW
    if (item.seedType === "turnip_item") return "🧅";
    if (item.seedType === "turnip_seed") return "🌰";
    if (item.seedType === "tomato_item") return "🍅";       // 👈 NEW
    if (item.seedType === "tomato_seed") return "🌱";       // 👈 NEW
    // Add to getItemIcon(item):
    if (item.seedType === "eggplant_item") return "🍆";
    if (item.seedType === "strawberry_item") return "🍓";
    if (item.seedType === "pumpkin_item") return "🎃";
    if (item.seedType === "watermelon_item") return "🍉";
// Add to getItemIcon(item):
    if (item.seedType === "corn_item") return "🌽";
    if (item.seedType === "pineapple_item") return "🍍";
    if (item.seedType === "potato_item") return "🥔";
    if (item.seedType === "wheat_item") return "🌾";
    if (item.seedType.includes("_seed")) return "🌱";

    if (item.seedType === "egg") return "🥚";

    if (item.seedType === "hay") return "🌾";
    if (item.seedType === "ore") return "🪨";
    if (item.seedType === "coin") return "💰";
    if (item.seedType === "weapon_dagger") return "🗡️"; // 👈 ADD THIS LINE

    if (item.isKey) return "🔑";
    return "❓";
}

// --- Replace renderTabContent in src/uiManager.js ---

export function renderTabContent() {
    const container = document.getElementById('tab-content');
    container.innerHTML = ""; 

    switch (uiState.currentTab) {
        case 'inventory':
            const heldItem = hero.equipment?.mainHand;
            container.innerHTML = `<h3 style="margin-top:0;">Backpack</h3><div class="inv-grid">` + 
                hero.inventory.map((item, index) => {
                    // Check if this item matches the one in our hand (by instance)
                    const isActive = (heldItem === item);
                    const borderStyle = isActive ? 'border: 4px dashed var(--highlight); background: rgba(138, 154, 91, 0.2);' : '';
                    
                    return `
                    <div class="inv-item draggable-item" draggable="true" data-index="${index}" data-source="hero" 
                         onclick="window.equipItem(${index})" style="${borderStyle}">
                        <div class="item-icon" style="font-size: 20px; margin-bottom:5px;">${getItemIcon(item)}</div>
                        <span>${item.name} ${item.count > 1 ? `<br><span style="color:var(--banana-dark);">(x${item.count})</span>` : ''}</span>
                    </div>
                `}).join('') + `</div>
                <p style="font-size: 8px; text-align: center; margin-top: 10px; color: #555;">Click to hold in Main Hand.</p>`;
            
            // 👇 Add Drag listeners to the new items
            setTimeout(() => {
                const items = document.querySelectorAll('#tab-content .draggable-item');
                items.forEach(item => {
                    item.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('index', item.dataset.index);
                        e.dataTransfer.setData('source', item.dataset.source);
                    });
                });
            }, 50);
            break; 

        case 'stats':
            // ... (Keep your existing stats case exactly as it is) ...
            const info = getLevelInfo(hero.xp);
            container.innerHTML = `
                <h3 style="margin-top:0; color: var(--highlight);">${hero.charClass ? hero.charClass.toUpperCase() : 'PEASANT'} LVL ${info.level}</h3>
                <div class="stat-row"><span>HP:</span> <span>${Math.floor(hero.hp)}/${hero.maxHp}</span></div>
                <div class="stat-row"><span>EN:</span> <span style="color:var(--banana-dark);">${Math.floor(hero.energy)}/${hero.maxEnergy}</span></div>
                <div class="stat-row"><span>ATK:</span> <span>${hero.ad}</span></div>
                <div class="stat-row"><span>DEF:</span> <span>${hero.armor}</span></div>
                <div class="stat-row"><span>XP:</span> <span>${Math.floor(hero.xp)}</span></div>
                <div class="stat-row" style="color:var(--highlight);"><span>PTS:</span> <span>${info.points - hero.spentPoints}</span></div>
                <br><p style="font-size: 10px; text-align:center;">Press 'C' to eat food.</p>
            `;
            break;

        case 'map':
            // 🌍 THE 9x9 MACRO MAP
            const currentSysX = Math.floor(Math.floor(hero.x / 1600) / 100);
            const currentSysY = Math.floor(Math.floor(hero.y / 1600) / 100);

            let mapHTML = `<h3 style="margin-top:0; text-align:center;">WORLD MAP</h3>
                           <div style="display: grid; grid-template-columns: repeat(9, 30px); gap: 2px; justify-content: center; margin-top: 10px;">`;

            // Draw the 9x9 Grid
            for (let y = 0; y < 9; y++) {
                for (let x = 0; x < 9; x++) {
                    const sysKey = `${x}_${y}`;
                    const isUnlocked = window.unlockedSystemsCache && window.unlockedSystemsCache.includes(sysKey);
                    const isHere = (x === currentSysX && y === currentSysY);
                    
                    let color = isUnlocked ? "rgba(0, 255, 0, 0.4)" : "rgba(100, 100, 100, 0.8)"; // Green or Clouded
                    let text = isHere ? "📍" : (isUnlocked ? "" : "☁️");

                    mapHTML += `<div onclick="window.checkSystemUnlock(${x}, ${y})" 
                                     style="width: 30px; height: 30px; background: ${color}; border: 2px solid var(--bg-dark); 
                                     display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 14px;">
                                     ${text}
                                </div>`;
                }
            }
            mapHTML += `</div><p style="font-size: 8px; text-align:center; margin-top:15px; color:#555;">Click a cloud to view expansion costs.</p>`;
            
            container.innerHTML = mapHTML;
            break;

        // Update the 'equipment' tab case in renderTabContent() to show the mainHand
        case 'equipment':
            const held = hero.equipment.mainHand;
            container.innerHTML = `
                <h3 style="margin-top:0; text-align: center;">GEAR</h3>
                <div style="display: flex; flex-direction: column; gap: 15px; align-items: center; margin-top: 20px;">
                    <div style="text-align: center;">
                        <span style="font-size: 10px; color: #555;">MAIN HAND</span>
                        <div class="inv-item" style="width: 80px; height: 80px; margin-top: 5px;" ${held ? `onclick="window.unequipMainHand()"` : ''}>
                            <div style="font-size: 32px;">${held ? getItemIcon(held) : '🤚'}</div>
                            <span style="font-size: 8px;">${held ? held.name : 'Empty (Fists)'}</span>
                            ${held && held.count > 1 ? `<br><span style="color:var(--banana-dark); font-size:8px;">(x${held.count})</span>` : ''}
                        </div>
                    </div>
                </div>
                <p style="font-size: 8px; text-align: center; margin-top: 15px; color: #555;">Click an equipped item to unequip.</p>
            `;
            break;

        case 'skills':
            // ... (Keep your existing skills case exactly as it is) ...
            let mySkillsHTML = `<p style="font-size:10px; text-align:center;">NO SKILLS LEARNED</p>`;
            if (hero.skills && hero.skills.length > 0) {
                mySkillsHTML = `<div class="inv-grid" style="grid-template-columns: repeat(2, 1fr);">` + 
                hero.skills.map(skillId => {
                    const skillData = PALADIN_SKILLS.find(s => s.id === skillId);
                    if (!skillData) return '';
                    return `
                        <div class="inv-item">
                            <div style="font-size: 24px;">${skillData.icon}</div>
                            <span style="margin-top: 5px;">${skillData.name}</span>
                        </div>
                    `;
                }).join('') + `</div>`;
            }
            container.innerHTML = `
                <h3 style="margin-top:0; text-align:center;">CORE ABILITIES</h3>
                ${mySkillsHTML}
                <p style="font-size:8px; text-align:center; color:#555; margin-top:15px;">Passive basic attack always active.</p>
            `;
            break;
    }
}

// ==========================================
// 📦 CHEST UI LOGIC
// ==========================================

export function openChestMenu(chestId, items) {
    activeChestId = chestId;
    activeChestItems = items || [];
    document.getElementById('chest-menu').classList.remove('hidden');
    renderChestUI();
}

export function handleRemoteChestUpdate(chestId, items) {
    if (activeChestId === chestId) {
        activeChestItems = items;
        renderChestUI();
    }
}

function renderChestUI() {
    if (!activeChestId) return;

    const heroInv = document.getElementById('chest-hero-inv');
    const chestInv = document.getElementById('chest-box-inv');

    heroInv.innerHTML = hero.inventory.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="hero">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
        </div>
    `).join('');

    chestInv.innerHTML = activeChestItems.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="chest">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
        </div>
    `).join('');

    const items = document.querySelectorAll('.draggable-item');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('index', item.dataset.index);
            e.dataTransfer.setData('source', item.dataset.source);
        });

        item.addEventListener('click', () => {
            transferItem(item.dataset.index, item.dataset.source);
        });
    });
}

function handleDrop(e, targetSource) {
    const index = e.dataTransfer.getData('index');
    const source = e.dataTransfer.getData('source');
    
    if (source && source !== targetSource) {
        transferItem(index, source);
    }
}

function transferItem(index, source) {
    if (source === 'hero') {
        const item = hero.inventory.splice(index, 1)[0];
        activeChestItems.push(item);
    } else {
        if (hero.inventory.length >= hero.maxSlots) {
            alert("Backpack is full!");
            return;
        }
        const item = activeChestItems.splice(index, 1)[0];
        hero.inventory.push(item);
    }

    if (socket) {
        socket.emit('updateChest', { chestId: activeChestId, items: activeChestItems });
    }

    renderChestUI();
}

// ==========================================
// 🏪 GENERAL STORE UI LOGIC
// ==========================================

export let activeStoreId = null;
let activeStoreData = null;
let currentStoreTab = 'market';

const typeNames = {
    "fish": "River Bass",
    "cooked_fish": "Cooked Bass",
    "grass_item": "Uprooted Grass",
    "grass_seed": "Grass Seed", // 👈 NEW
    "rose_seed": "Rose Seed",           // 👈 NEW
    "violet_seed": "Violet Seed",       // 👈 NEW
    "sunflower_seed": "Sunflower Seed", // 👈 NEW

    "turnip_item": "Turnip",
    "turnip_seed": "Turnip Seed",

    "tomato_item": "Tomato",        // 👈 NEW
    "tomato_seed": "Tomato Seed",   // 👈 NEW

    // Add to typeNames:
    "eggplant_item": "Eggplant", "eggplant_seed": "Eggplant Seed",
    "strawberry_item": "Strawberry", "strawberry_seed": "Strawberry Seed",
    "pumpkin_item": "Pumpkin", "pumpkin_seed": "Pumpkin Seed",
    "watermelon_item": "Watermelon", "watermelon_seed": "Watermelon Seed",

    "corn_item": "Corn", "corn_seed": "Corn Seed",
    "pineapple_item": "Pineapple", "pineapple_seed": "Pineapple Crown",
    "potato_item": "Potato", "potato_seed": "Potato Eye",
    "wheat_item": "Wheat", "wheat_seed": "Wheat Seed",

    "chicken_poop": "Fertilizer",
    "ore": "Gold Ore",
    "coin": "Gold Coin",
    "key": "House Key"
};

export function openStoreMenu(storeId, data) {
    activeStoreId = storeId;
    activeStoreData = data;
    
    document.getElementById('store-menu').classList.remove('hidden');
    
    document.getElementById('tab-market').onclick = () => switchStoreTab('market');
    document.getElementById('tab-ledger').onclick = () => switchStoreTab('ledger');
    document.getElementById('tab-lockbox').onclick = () => switchStoreTab('lockbox');
    document.getElementById('close-store-btn').onclick = () => {
        document.getElementById('store-menu').classList.add('hidden');
        activeStoreId = null;
    };

    switchStoreTab(currentStoreTab);
}

export function handleRemoteStoreUpdate(storeId, data) {
    if (activeStoreId === storeId) {
        activeStoreData = data;
        renderStoreUI();
    }
}

export function processClaimedStorage(items) {
    items.forEach(item => {
        if (hero.inventory.length < hero.maxSlots) hero.inventory.push(item);
        else console.log("Dropped due to full inventory:", item.name);
    });
    alert(`Looted ${items.length} items from Lockbox!`);
}

function switchStoreTab(tab) {
    currentStoreTab = tab;
    document.getElementById('tab-market').className = tab === 'market' ? 'pixel-btn' : 'pixel-btn pixel-btn-cancel';
    document.getElementById('tab-ledger').className = tab === 'ledger' ? 'pixel-btn' : 'pixel-btn pixel-btn-cancel';
    document.getElementById('tab-lockbox').className = tab === 'lockbox' ? 'pixel-btn' : 'pixel-btn pixel-btn-cancel';
    
    renderStoreUI();
}

function renderStoreUI() {
    if (!activeStoreData) return;
    const content = document.getElementById('store-content');
    content.innerHTML = '';

    if (currentStoreTab === 'market') {
        const othersListings = activeStoreData.listings.filter(l => l.seller !== playerWallet);
        
        if (othersListings.length === 0) {
            content.innerHTML = `<p style="text-align:center; font-size:10px;">MARKET IS EMPTY.</p>`;
            return;
        }

        othersListings.forEach(l => {
            const hasExactItem = hero.inventory.some(i => i.seedType === l.wantedType);
            const isNegotiating = l.counterOffer !== null;

            content.innerHTML += `
                <div style="background: #fff; border: 4px solid var(--bg-dark); margin-bottom: 10px; padding: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: inset -4px -4px 0px rgba(0,0,0,0.1);">
                    <div>
                        <div style="font-size: 14px; margin-bottom: 5px;">${getItemIcon(l.offeredItem)} ${l.offeredItem.name}</div>
                        <div style="font-size: 10px;">WANTS: ${typeNames[l.wantedType] || 'Unknown'}</div>
                    </div>
                    <div style="text-align: right;">
                        ${isNegotiating ? 
                            `<span style="color: var(--banana-dark); font-size: 10px;">PENDING...</span>` : 
                            `
                            <button onclick="window.buyListing('${l.id}', '${l.wantedType}')" class="${hasExactItem ? 'pixel-btn' : 'pixel-btn pixel-btn-cancel'}" ${!hasExactItem ? 'disabled' : ''} style="padding: 8px; font-size: 10px; margin-bottom: 5px;">BUY</button><br>
                            <button onclick="window.counterOffer('${l.id}')" class="pixel-btn" style="padding: 8px; font-size: 10px;">COUNTER</button>
                            `
                        }
                    </div>
                </div>
            `;
        });
    } 
    else if (currentStoreTab === 'ledger') {
        let inventoryOptions = hero.inventory.map((item, idx) => `<option value="${idx}">${getItemIcon(item)} ${item.name}</option>`).join('');
        let wantedOptions = Object.keys(typeNames).map(key => `<option value="${key}">${typeNames[key]}</option>`).join('');

        content.innerHTML += `
            <div style="background: var(--banana); padding: 10px; margin-bottom: 15px; border: 4px solid var(--bg-dark);">
                <h4 style="margin:0 0 10px 0; text-align:center;">POST LISTING</h4>
                ${hero.inventory.length === 0 ? `<p style="font-size:10px; text-align:center;">BACKPACK EMPTY.</p>` : `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <select id="offer-select" style="width: 45%; padding: 5px; font-size:10px; border: 4px solid var(--bg-dark);">${inventoryOptions}</select>
                        <span style="font-size:10px;">FOR</span>
                        <select id="wanted-select" style="width: 45%; padding: 5px; font-size:10px; border: 4px solid var(--bg-dark);">${wantedOptions}</select>
                    </div>
                    <button onclick="window.createListing()" class="pixel-btn" style="width: 100%; margin-top: 10px; background: #fff;">POST TO MARKET</button>
                `}
            </div>
        `;

        const myListings = activeStoreData.listings.filter(l => l.seller === playerWallet);
        if (myListings.length === 0) {
            content.innerHTML += `<p style="text-align:center; font-size:10px;">NO ACTIVE LISTINGS.</p>`;
        } else {
            myListings.forEach(l => {
                content.innerHTML += `
                    <div style="background: #fff; border: 4px solid var(--bg-dark); margin-bottom: 10px; padding: 10px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom:5px;">
                            <span style="font-size:12px;">${getItemIcon(l.offeredItem)} SELLING: ${l.offeredItem.name}</span>
                            <button onclick="window.cancelListing('${l.id}')" class="pixel-btn pixel-btn-cancel" style="padding:4px 8px; font-size:10px;">X</button>
                        </div>
                        <div style="font-size: 10px;">ASKING FOR: ${typeNames[l.wantedType] || 'Unknown'}</div>
                        
                        ${l.counterOffer ? `
                            <div style="margin-top: 10px; padding: 10px; background: var(--bg-panel); border: 4px solid var(--bg-dark);">
                                <span style="color:var(--banana-dark); font-size: 10px;">COUNTER OFFER!</span><br>
                                <span style="font-size: 12px;">${getItemIcon(l.counterOffer.item)} ${l.counterOffer.item.name}</span>
                                <div style="margin-top: 10px; display:flex; gap:10px;">
                                    <button onclick="window.resolveCounter('${l.id}', true)" class="pixel-btn" style="flex:1; font-size: 10px; padding:8px;">ACCEPT</button>
                                    <button onclick="window.resolveCounter('${l.id}', false)" class="pixel-btn pixel-btn-cancel" style="flex:1; font-size: 10px; padding:8px;">REJECT</button>
                                </div>
                            </div>
                        ` : `<div style="font-size: 10px; margin-top:10px; opacity:0.5;">WAITING FOR BUYERS...</div>`}
                    </div>
                `;
            });
        }
    }
    else if (currentStoreTab === 'lockbox') {
        const myStorage = activeStoreData.storage[playerWallet] || [];
        
        content.innerHTML += `<h3 style="text-align:center; margin-top:0;">ESCROW LOCKBOX</h3>`;
        content.innerHTML += `<p style="text-align:center; font-size:10px;">Secure storage for completed/cancelled trades.</p>`;

        if (myStorage.length === 0) {
            content.innerHTML += `<div style="text-align:center; margin-top: 20px;">[ EMPTY ]</div>`;
        } else {
            content.innerHTML += `<div class="inv-grid">` + myStorage.map(item => `
                <div class="inv-item">
                    <div class="item-icon" style="font-size: 20px; margin-bottom:5px;">${getItemIcon(item)}</div>
                    <span>${item.name}</span>
                </div>
            `).join('') + `</div>`;

            content.innerHTML += `<button onclick="window.claimStorage()" class="pixel-btn" style="width:100%; margin-top:15px;">LOOT TO BACKPACK</button>`;
        }
    }
}

window.createListing = () => {
    const invIdx = document.getElementById('offer-select').value;
    const wantedType = document.getElementById('wanted-select').value;
    if (invIdx !== "" && wantedType) {
        const itemToOffer = hero.inventory.splice(invIdx, 1)[0]; 
        socket.emit('createListing', { storeId: activeStoreId, wallet: playerWallet, offeredItem: itemToOffer, wantedType });
        renderStoreUI(); 
    }
};

window.buyListing = (listingId, wantedType) => {
    const itemIdx = hero.inventory.findIndex(i => i.seedType === wantedType);
    if (itemIdx !== -1) {
        const paymentItem = hero.inventory.splice(itemIdx, 1)[0];
        socket.emit('buyListing', { storeId: activeStoreId, listingId, buyerWallet: playerWallet, paymentItem });
        alert("Trade successful! Check your Lockbox for your new item.");
        switchStoreTab('lockbox');
    }
};

window.counterOffer = (listingId) => {
    if (hero.inventory.length === 0) {
        alert("You have no items to offer!");
        return;
    }
    if (confirm(`Counter-Offer with your ${hero.inventory[0].name}?`)) {
        const counterItem = hero.inventory.splice(0, 1)[0];
        socket.emit('makeCounterOffer', { storeId: activeStoreId, listingId, buyerWallet: playerWallet, counterItem });
        alert("Counter-offer sent! Check back later to see if they accepted.");
    }
};

window.resolveCounter = (listingId, accept) => {
    socket.emit('resolveCounterOffer', { storeId: activeStoreId, listingId, accept });
    if (accept) {
        alert("Trade complete! Check your Lockbox.");
        switchStoreTab('lockbox');
    } else {
        renderStoreUI();
    }
};

window.cancelListing = (listingId) => {
    if(confirm("Cancel this listing and return the item to your Lockbox?")) {
        socket.emit('cancelListing', { storeId: activeStoreId, listingId, wallet: playerWallet });
    }
};

window.claimStorage = () => {
    const slotsAvailable = hero.maxSlots - hero.inventory.length;
    const waitingItems = activeStoreData.storage[playerWallet] ? activeStoreData.storage[playerWallet].length : 0;
    
    if (slotsAvailable < waitingItems) {
        alert(`You only have ${slotsAvailable} empty slots! Clear space in your backpack first.`);
        return;
    }
    socket.emit('claimStorage', { storeId: activeStoreId, wallet: playerWallet });
};

// ==========================================
// ⛩️ TEMPLE UI LOGIC
// ==========================================

export function openTempleMenu() {
    altarItem = null;
    document.getElementById('temple-menu').classList.remove('hidden');
    renderTempleUI();
}

function renderTempleUI() {
    const heroInv = document.getElementById('temple-hero-inv');
    const altarSlot = document.getElementById('temple-slot');

    heroInv.innerHTML = hero.inventory.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="hero-temple">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
        </div>
    `).join('');

    if (altarItem) {
        altarSlot.innerHTML = `
            <div class="inv-item draggable-item" draggable="true" data-index="0" data-source="altar" style="border: none; background: transparent;">
                <div class="item-icon" style="font-size: 32px;">${getItemIcon(altarItem)}</div>
                <strong>${altarItem.name}</strong>
            </div>
        `;
    } else {
        altarSlot.innerHTML = `<div style="color:#666; font-size: 12px; text-align: center;">Drag Fish<br>Here</div>`;
    }

    const items = document.querySelectorAll('#temple-menu .draggable-item');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('index', item.dataset.index);
            e.dataTransfer.setData('source', item.dataset.source);
        });
        item.addEventListener('click', () => transferTempleItem(item.dataset.index, item.dataset.source));
    });
}

function handleTempleDrop(e, targetSource) {
    const index = e.dataTransfer.getData('index');
    const source = e.dataTransfer.getData('source');
    if (source && source !== targetSource) transferTempleItem(index, source);
}

// Inside transferTempleItem (around line 430):
function transferTempleItem(index, source) {
    if (source === 'hero-temple') {
        const item = hero.inventory[index];
        
        // 👇 UPDATED: Accepts ALL seeds!
        const isSeed = item.seedType.includes("_seed");
        if (item.seedType !== "fish" && item.seedType !== "cooked_fish" && !isSeed) {
            alert("The Gods reject this offering! They hunger for fish and seeds.");
            return;
        }
        
        if (altarItem) hero.inventory.push(altarItem);
        altarItem = hero.inventory.splice(index, 1)[0];
    } else if (source === 'altar') {
        if (hero.inventory.length >= hero.maxSlots) {
            alert("Backpack is full!");
            return;
        }
        hero.inventory.push(altarItem);
        altarItem = null;
    }
    renderTempleUI();
}

// ==========================================
// 🍳 KITCHEN UI LOGIC
// ==========================================
export function openKitchenMenu() {
    document.getElementById('kitchen-menu').classList.remove('hidden');
}

// ==========================================
// 🗺️ MAP TABLE UI LOGIC
// ==========================================
// ==========================================
// 🗺️ MAP TABLE UI LOGIC
// ==========================================
export function openMapTableMenu() {
    document.getElementById('maptable-menu').classList.remove('hidden');
    const uiMapCanvas = document.getElementById('ui-map-canvas');
    const uiMapCtx = uiMapCanvas.getContext('2d');
    
    uiMapCtx.imageSmoothingEnabled = false;
    uiMapCtx.clearRect(0, 0, uiMapCanvas.width, uiMapCanvas.height);
    
    // 1. Draw the 100x100 map memory buffer stretched to fit the 800x800 UI Canvas!
    uiMapCtx.drawImage(mapCanvas, 0, 0, uiMapCanvas.width, uiMapCanvas.height);
    
    // 2. Calculate the UI scale (800 / 100 = 8 pixels per chunk)
    const scale = uiMapCanvas.width / CONFIG.MAP_SIZE;
    
    // 3. Find the player's chunk (0 to 99)
    const pX = Math.floor(hero.x / 1600);
    const pY = Math.floor(hero.y / 1600);
    
    uiMapCtx.fillStyle = "#FFD700";
    
    // 4. Draw a player blip scaled to match the grid so it stays accurate!
    // We center it slightly so it looks like a nice square dot.
    uiMapCtx.fillRect((pX * scale) - (scale / 4), (pY * scale) - (scale / 4), scale * 1.5, scale * 1.5); 
}

// ==========================================
// 🧺 ROOT CELLAR UI LOGIC
// ==========================================
export function openCellarMenu(cellarId, items) {
    activeCellarId = cellarId;
    activeCellarItems = items || [];
    document.getElementById('cellar-menu').classList.remove('hidden');
    renderCellarUI();
}

export function handleRemoteCellarUpdate(cellarId, items) {
    if (activeCellarId === cellarId) {
        activeCellarItems = items;
        renderCellarUI();
    }
}

function renderCellarUI() {
    if (!activeCellarId) return;

    const heroInv = document.getElementById('cellar-hero-inv');
    const cellarInv = document.getElementById('cellar-box-inv');

    heroInv.innerHTML = hero.inventory.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="hero-cellar">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
        </div>
    `).join('');

    cellarInv.innerHTML = activeCellarItems.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="cellar">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
        </div>
    `).join('');

    const items = document.querySelectorAll('#cellar-menu .draggable-item');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('index', item.dataset.index);
            e.dataTransfer.setData('source', item.dataset.source);
        });
        item.addEventListener('click', () => transferCellarItem(item.dataset.index, item.dataset.source));
    });
}

function handleCellarDrop(e, targetSource) {
    const index = e.dataTransfer.getData('index');
    const source = e.dataTransfer.getData('source');
    if (source && source !== targetSource) transferCellarItem(index, source);
}

function transferCellarItem(index, source) {
    if (source === 'hero-cellar') {
        const item = hero.inventory[index];
        if (!VALID_FOOD_TYPES.includes(item.seedType)) {
            alert("The Root Cellar is for food only!");
            return;
        }
        hero.inventory.splice(index, 1);
        activeCellarItems.push(item);
    } else {
        if (hero.inventory.length >= hero.maxSlots) {
            alert("Backpack is full!");
            return;
        }
        const item = activeCellarItems.splice(index, 1)[0];
        hero.inventory.push(item);
    }

    if (socket) socket.emit('updateCellar', { cellarId: activeCellarId, items: activeCellarItems });
    renderCellarUI();
}

// ==========================================
// 🌾 HAY UI LOGIC
// ==========================================
export function openHayTableMenu() {
    document.getElementById('hay-table-menu').classList.remove('hidden');
}

export function openHayStorageMenu(hayStorageId, items) {
    activeHayStorageId = hayStorageId;
    activeHayStorageItems = items || [];
    document.getElementById('hay-storage-menu').classList.remove('hidden');
    renderHayStorageUI();
}

export function handleRemoteHayStorageUpdate(hayStorageId, items) {
    if (activeHayStorageId === hayStorageId) {
        activeHayStorageItems = items;
        renderHayStorageUI();
    }
}

function renderHayStorageUI() {
    if (!activeHayStorageId) return;

    const heroInv = document.getElementById('hay-storage-hero-inv');
    const storageInv = document.getElementById('hay-storage-box-inv');

    heroInv.innerHTML = hero.inventory.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="hero-hay">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
        </div>
    `).join('');

    storageInv.innerHTML = activeHayStorageItems.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="hay-storage">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
        </div>
    `).join('');

    const items = document.querySelectorAll('#hay-storage-menu .draggable-item');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('index', item.dataset.index);
            e.dataTransfer.setData('source', item.dataset.source);
        });
        item.addEventListener('click', () => transferHayStorageItem(item.dataset.index, item.dataset.source));
    });
}

function handleHayStorageDrop(e, targetSource) {
    const index = e.dataTransfer.getData('index');
    const source = e.dataTransfer.getData('source');
    if (source && source !== targetSource) transferHayStorageItem(index, source);
}

function transferHayStorageItem(index, source) {
    if (source === 'hero-hay') {
        const item = hero.inventory[index];
        if (!VALID_HAY_TYPES.includes(item.seedType)) {
            alert("Only Dried Hay can be stored here!");
            return;
        }
        hero.inventory.splice(index, 1);
        activeHayStorageItems.push(item);
    } else {
        if (hero.inventory.length >= hero.maxSlots) {
            alert("Backpack is full!");
            return;
        }
        const item = activeHayStorageItems.splice(index, 1)[0];
        hero.inventory.push(item);
    }
    if (socket) socket.emit('updateHayStorage', { hayStorageId: activeHayStorageId, items: activeHayStorageItems });
    renderHayStorageUI();
}

// ==========================================
// 🔥 SMELTER UI LOGIC
// ==========================================
export function openSmelterMenu() {
    const oreIdx = hero.inventory.findIndex(item => item.seedType === 'ore');
    if (oreIdx === -1) {
        alert("The smelter is cold. You need Gold Ore to begin.");
        return;
    }

    const smelterUI = document.getElementById('smelter-menu');
    smelterUI.classList.remove('hidden');

    document.getElementById('mint-coin-btn').onclick = async () => {
        const currentOreIdx = hero.inventory.findIndex(item => item.seedType === 'ore');
        if (currentOreIdx !== -1) {
            hero.inventory.splice(currentOreIdx, 1);
            hero.inventory.push(createItem(ITEM_TYPES.GOLD_COIN));
            smelterUI.classList.add('hidden');
            alert("✨ Success! You minted a Gold Coin.");
        }
    };

    const closeBtn = document.getElementById('close-smelter-btn');
    if (closeBtn) closeBtn.onclick = () => smelterUI.classList.add('hidden');
}

// ==========================================
// 🏦 WITHDRAWAL UI LOGIC
// ==========================================
export function openWithdrawMenu() {
    if (!playerWallet) {
        alert("Connect your wallet first!");
        return;
    }
    document.getElementById('withdraw-balance-max').innerText = hero.inGameUni.toFixed(2);
    document.getElementById('withdraw-input').value = "";
    document.getElementById('withdraw-menu').classList.remove('hidden');
}

export async function executeWithdrawal(voucher) {
    console.log("🎟️ Received cryptographic voucher from server. Opening MetaMask...");
    await submitVoucherToChain(voucher);
}

// ==========================================
// 🔄 HUD UPDATES
// ==========================================
export function updateHUD() {
    const uniDisplay = document.getElementById('uni-display');
    const playerCount = document.getElementById('player-count');

    if (uniDisplay) {
        uniDisplay.innerText = `${(hero.inGameUni || 0).toFixed(2)} UNI`;
    }

    if (playerCount) {
        // 👇 THE FIX: Count ourselves (1) + any remote player who is NOT offline
        let onlineCount = 1;
        import('./multiplayer.js').then(m => {
            m.remotePlayers.forEach(p => {
                if (!p.isOffline) onlineCount++;
            });
            playerCount.innerText = `PLAYERS: ${onlineCount}`;
        });
    }
}


// At the bottom of src/uiManager.js

// src/uiManager.js

window.equipItem = (invIndex) => {
    // 🛠️ CRITICAL FIX: Explicitly ensure the equipment object exists on the hero
    if (!hero.equipment) hero.equipment = { mainHand: null };
    
    // Safety check: is there actually an item in this backpack slot?
    const itemToEquip = hero.inventory[invIndex];
    if (!itemToEquip) return;

    console.log(`Holding: ${itemToEquip.name}`);

    if (hero.equipment.mainHand) {
        // 🔄 SWAP: Hand -> Backpack, Backpack -> Hand
        const currentInHand = hero.equipment.mainHand;
        hero.equipment.mainHand = itemToEquip;
        hero.inventory[invIndex] = currentInHand;
    } else {
        // ✋ EQUIP: Move from Backpack to empty Hand
        hero.equipment.mainHand = itemToEquip;
        hero.inventory.splice(invIndex, 1);
    }
    
    // Immediately update stats and refresh the UI
    import('./interactionManager.js').then(m => {
        m.recalculateStats();
        renderTabContent(); // Refresh to show the border/new counts
    });
};

window.unequipMainHand = () => {
    if (hero.equipment.mainHand) {
        if (hero.inventory.length >= hero.maxSlots) {
            alert("Backpack is full!");
            return;
        }
        hero.inventory.push(hero.equipment.mainHand);
        hero.equipment.mainHand = null;
        
        import('./interactionManager.js').then(m => m.recalculateStats());
        renderTabContent(); 
    }
};

// 2. Drag to World (Drop)
document.getElementById('menu-overlay').addEventListener('dragover', (e) => e.preventDefault());
document.getElementById('menu-overlay').addEventListener('drop', (e) => {
    // If dropped directly on the overlay background (not in the grid)
    if (e.target.id === 'menu-overlay' || e.target.id === 'menu-container') {
        const index = e.dataTransfer.getData('index');
        const source = e.dataTransfer.getData('source');
        
        if (source === 'hero') {
            const item = hero.inventory[index];
            if (item.count > 1) {
                openSplitMenu(index, item);
            } else {
                dropItemToWorld(index, 1);
            }
        }
    }
});

let pendingDropIndex = -1;

function openSplitMenu(index, item) {
    pendingDropIndex = index;
    const slider = document.getElementById('split-slider');
    const label = document.getElementById('split-amount-label');
    
    slider.max = item.count;
    slider.value = item.count; // Default to dropping all
    label.innerText = item.count;
    
    document.getElementById('split-item-icon').innerText = getItemIcon(item);
    document.getElementById('split-item-name').innerText = item.name;
    
    slider.oninput = () => label.innerText = slider.value;
    
    document.getElementById('split-stack-menu').classList.remove('hidden');
}

document.getElementById('confirm-split-btn').onclick = () => {
    const amount = parseInt(document.getElementById('split-slider').value);
    dropItemToWorld(pendingDropIndex, amount);
    document.getElementById('split-stack-menu').classList.add('hidden');
};

document.getElementById('cancel-split-btn').onclick = () => {
    document.getElementById('split-stack-menu').classList.add('hidden');
};

// In src/uiManager.js

function dropItemToWorld(index, amount) {
    const item = hero.inventory[index];
    const originTX = Math.floor((hero.x + 8) / 16);
    const originTY = Math.floor((hero.y + 15) / 16); // Feet

    let droppedCount = 0;

    import('./bacteria.js').then(m => {
        
        let dropHealth = item.health;
        let dropVirulence = item.virulence;

        // 👇 THE FIX: Pass the raw 16-bit ID directly! No bit-splitting!
        if (item.isKey) {
            dropHealth = item.houseId; 
            dropVirulence = 0;
        } else if (item.seedType === "egg") {
            dropHealth = 1; // Drop 1 egg per tile scattered
        }

        // If dropping 1 item, put it directly at feet
        if (amount === 1) {
            const bac = m.getBacteriaData(originTX, originTY);
            if (bac && bac.data[bac.idx] === 0) {
                m.seedBacteria(originTX, originTY, item.seedType, dropHealth, dropVirulence);
                droppedCount++;
            }
        }

        // Scatter grid if feet are blocked or dropping a stack
        if (droppedCount < amount) {
            for (let dx = -1; dx <= 1 && droppedCount < amount; dx++) {
                for (let dy = -1; dy <= 1 && droppedCount < amount; dy++) {
                    const targetTX = originTX + dx;
                    const targetTY = originTY + dy;
                    
                    const bac = m.getBacteriaData(targetTX, targetTY);
                    if (bac && bac.data[bac.idx] === 0) {
                        m.seedBacteria(targetTX, targetTY, item.seedType, dropHealth, dropVirulence);
                        droppedCount++;
                    }
                }
            }
        }

        item.count -= droppedCount;
        if (item.count <= 0) {
            hero.inventory.splice(index, 1);
        }
        
        renderTabContent();
    });
}


window.checkSystemUnlock = (sysX, sysY) => {
    const sysKey = `${sysX}_${sysY}`;
    
    // 🛡️ SAFETY CHECK: Ensure the cache exists. If it doesn't, assume ONLY the center is unlocked.
    const cache = window.unlockedSystemsCache || ["4_4"];

    if (cache.includes(sysKey)) {
        alert("This sector is already explored.");
        return;
    }

    // Duplicate the server's price math so the UI can show the cost instantly
    const layerX = Math.abs(sysX - 4);
    const layerY = Math.abs(sysY - 4);
    const layer = Math.max(layerX, layerY);
    
    let price = 1.0;
    price *= Math.pow(1.5, layer);
    
    // 🛡️ Use the safe 'cache' variable here instead of the raw window property!
    price *= Math.pow(1.1, cache.length - 1);

    if (confirm(`Unlock System [${sysX}, ${sysY}] for the entire server?\nCost: ${price.toFixed(2)} UNI\nYour Balance: ${(hero.inGameUni || 0).toFixed(2)} UNI`)) {
        if ((hero.inGameUni || 0) >= price) {
            import('./multiplayer.js').then(m => {
                if (m.socket) m.socket.emit('unlockSystem', { sysX, sysY });
            });
            alert("Sent expansion request to the network!");
            toggleMenu(); // Close menu
        } else {
            alert("Insufficient UNI balance!");
        }
    }
};

// ==========================================
// 📱 UNIFIED TOUCH DRAG & TOOLTIP ENGINE
// ==========================================
const tooltip = document.getElementById('item-tooltip');
let touchTimer = null;
let dragClone = null;
let dragData = null;

function showTooltip(itemEl, x, y) {
    const item = getItemFromDOM(itemEl.dataset.source, parseInt(itemEl.dataset.index));
    if (item) {
        document.getElementById('tt-name').innerText = item.name;
        document.getElementById('tt-type').innerText = item.typeLabel || "Item";
        
        const statsEl = document.getElementById('tt-stats');
        if (item.energy) statsEl.innerText = `Nutrition: +${item.energy} Energy`;
        else if (item.ad) statsEl.innerText = `Damage: +${item.ad} ATK`;
        else statsEl.innerText = "";
        
        document.getElementById('tt-desc').innerText = item.description || "No description available.";
        
        tooltip.style.display = 'block';
        
        let px = x + 15; let py = y + 15;
        if (px + 160 > window.innerWidth) px = x - 175;
        if (py + 100 > window.innerHeight) py = y - 115;
        tooltip.style.left = px + 'px';
        tooltip.style.top = py + 'px';
    }
}

function getItemFromDOM(source, index) {
    if (source === 'hero' || source.startsWith('hero-')) return hero.inventory[index];
    if (source === 'chest') return activeChestItems[index];
    if (source === 'cellar') return activeCellarItems[index];
    if (source === 'hay-storage') return activeHayStorageItems[index];
    if (source === 'altar') return altarItem;
    return null;
}

// --- MOUSE LISTENERS (For PC) ---
document.body.addEventListener('mouseover', (e) => {
    const itemEl = e.target.closest('.inv-item');
    const isInsideMenu = e.target.closest('.pixel-panel') || e.target.closest('#hud');
    if (itemEl && isInsideMenu && itemEl.dataset.index) showTooltip(itemEl, e.clientX, e.clientY);
});
document.body.addEventListener('mouseout', (e) => {
    if (e.target.closest('.inv-item')) tooltip.style.display = 'none';
});

// --- TOUCH LISTENERS (For Mobile) ---
document.body.addEventListener('touchstart', (e) => {
    const itemEl = e.target.closest('.draggable-item');
    if (!itemEl) return;

    // 1. Start timer for Long-Press (Tooltip)
    touchTimer = setTimeout(() => {
        showTooltip(itemEl, e.touches[0].clientX, e.touches[0].clientY);
    }, 400); // Hold for 400ms to show tooltip

    // 2. Prep Drag Data
    dragData = { index: itemEl.dataset.index, source: itemEl.dataset.source, element: itemEl };
}, { passive: false });

document.body.addEventListener('touchmove', (e) => {
    if (!dragData) return;

    // If they start moving their finger, cancel the tooltip!
    clearTimeout(touchTimer);
    tooltip.style.display = 'none';

    // Create the drag clone
    if (!dragClone) {
        dragClone = dragData.element.cloneNode(true);
        dragClone.style.position = 'fixed';
        dragClone.style.zIndex = '99999';
        dragClone.style.opacity = '0.8';
        dragClone.style.pointerEvents = 'none'; // Crucial so we can drop it!
        document.body.appendChild(dragClone);
        
        if (navigator.vibrate) navigator.vibrate(50); // Tactile feedback on pickup
    }

    // Move the clone
    e.preventDefault(); // Stop screen from scrolling
    const touch = e.touches[0];
    dragClone.style.left = (touch.clientX - 25) + 'px';
    dragClone.style.top = (touch.clientY - 25) + 'px';
}, { passive: false });

document.body.addEventListener('touchend', (e) => {
    clearTimeout(touchTimer);
    tooltip.style.display = 'none';

    if (dragClone) {
        dragClone.remove();
        dragClone = null;

        // Find what UI element we dropped it on
        const touch = e.changedTouches[0];
        const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);

        if (dropTarget) {
            // Generate a synthetic HTML5 drop event!
            // This magically triggers all the drop listeners we already wrote!
            const dropEvent = new Event('drop', { bubbles: true });
            dropEvent.dataTransfer = { getData: (key) => dragData[key] };
            dropTarget.dispatchEvent(dropEvent);
        }
    }
    dragData = null;
});


// ==========================================
// 🗺️ LOCATION BANNER ENGINE
// ==========================================
const prefixes = ["Oak", "Pine", "River", "Stone", "Iron", "Gold", "Silver", "Wind", "Storm", "High", "Low", "Dark", "Light", "Ash", "Thorn", "Green", "Red", "Blue", "Gryph", "Dragon", "Dawn", "Dusk"];
const suffixes = ["wood", "ford", "bridge", "mont", "ville", "town", "bury", "ton", "vale", "dale", "peak", "haven", "keep", "watch", "fall", "stead", "moor", "marsh", "gate", "run", "brook"];

function getZoneName(cx, cy) {
    // A simple, deterministic math hash based on coordinates
    const hash = Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453;
    const rand1 = Math.floor(Math.abs(hash) * 100);
    const rand2 = Math.floor(Math.abs(hash * 10) * 100);
    
    const pre = prefixes[rand1 % prefixes.length];
    const suf = suffixes[rand2 % suffixes.length];
    
    return pre + suf;
}

let bannerTimeout = null;

export function triggerLocationBanner(cx, cy, cellType) {
    const banner = document.getElementById('location-banner');
    const nameEl = document.getElementById('location-name');
    const typeEl = document.getElementById('location-type');
    if (!banner || !nameEl || !typeEl) return;

    let zoneName = "The Wilds";
    let zoneDesc = "UNCLAIMED TERRITORY";

    if (cellType === 101) {
        zoneName = getZoneName(cx, cy);
        zoneDesc = "PEACEFUL VILLAGE";
    } else if (cellType === 102) {
        zoneName = getZoneName(cx, cy);
        zoneDesc = "FORTIFIED TOWN";
    } else if (cellType === 103) {
        zoneName = getZoneName(cx, cy) + " Castle";
        zoneDesc = "ROYAL STRONGHOLD";
    } else if (cellType < 55) { // CONFIG.LAND_THRESHOLD is 55
        zoneName = "The Great Sea";
        zoneDesc = "OPEN WATER";
    }

    // Set text
    nameEl.innerText = zoneName;
    typeEl.innerText = zoneDesc;

    // Fade IN
    banner.style.opacity = "1";

    // Clear any existing timeout, then wait 4 seconds and Fade OUT
    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => {
        banner.style.opacity = "0";
    }, 4000);
}