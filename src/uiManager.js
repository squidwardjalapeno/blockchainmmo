import { hero, getLevelInfo, gameState } from './entities.js';
import { socket, playerWallet, remotePlayers, syncInventoryWithServer } from './multiplayer.js';
import { CONFIG } from './config.js';
import { ITEM_TYPES, createItem } from './items.js';
import { getWaitModifier, getRandomFish, globalFishCount } from './fish.js';
import { submitVoucherToChain, connectWallet } from './blockchainManager.js';
import { mapCanvas } from './renderer.js';
import { recalculateStats } from './interactionManager.js';

export let activeDoorCoords = null;

if (typeof window !== 'undefined') {
    logStep("uiManager.js loaded");
}

const USD_CONVERSION_RATE = 0.0001;

export const uiState = {
    isOpen: false,
    currentTab: 'inventory'
};

// ==========================================
// 📦 UNIFIED STORAGE SYSTEM
// ==========================================
export let activeStorageContext = {
    id: null,
    items: [],
    type: null // 'CHEST', 'CELLAR', 'HAY'
};

const STORAGE_CONFIGS = {
    CHEST: {
        title: "📦 STORAGE CHEST",
        subtitle: "Click or Drag items to transfer.",
        paneTitle: "CHEST",
        unloadLabel: "UNLOAD ALL",
        filter: () => true,
        limit: 8,
        transferEvent: 'requestChestTransfer',
        updateEvent: 'updateChest'
    },
    CELLAR: {
        title: "🧺 ROOT CELLAR",
        subtitle: "Storage for Organic Foodstuffs only.",
        paneTitle: "CELLAR",
        unloadLabel: "UNLOAD FOOD",
        filter: (item) => ["fish", "cooked_fish", "grass_item"].includes(item.seedType),
        limit: 10,
        transferEvent: 'requestCellarTransfer',
        updateEvent: 'updateCellar'
    },
    HAY: {
        title: "🌾 HAY STORAGE",
        subtitle: "Dry Storage for Fodder.",
        paneTitle: "STORAGE",
        unloadLabel: "UNLOAD HAY/PM",
        filter: (item) => ["hay", "plant_matter"].includes(item.seedType),
        limit: 10,
        transferEvent: 'requestHayTransfer',
        updateEvent: 'updateHayStorage'
    }
};

export function openUnifiedStorage(id, items, type) {
    activeStorageContext.id = id;
    activeStorageContext.items = items || [];
    activeStorageContext.type = type;

    const config = STORAGE_CONFIGS[type];
    if (!config) return;

    // Direct mapping to the single consolidated storage-menu UI
    const menuEl = document.getElementById('storage-menu');
    if (menuEl) {
        document.getElementById('storage-title').innerText = config.title;
        document.getElementById('storage-subtitle').innerText = config.subtitle;
        document.getElementById('storage-pane-title').innerText = config.paneTitle;
        document.getElementById('storage-unload-btn').innerText = config.unloadLabel;
        menuEl.classList.remove('hidden');
        renderStorageUI();
    }
}

export function handleRemoteStorageUpdate(id, items, type) {
    if (activeStorageContext.id === id && activeStorageContext.type === type) {
        activeStorageContext.items = items;
        renderStorageUI();
    }
}

export function renderStorageUI() {
    if (!activeStorageContext.id) return;

    const heroInv = document.getElementById('storage-hero-inv');
    const boxInv = document.getElementById('storage-box-inv');
    if (!heroInv || !boxInv) return;

    heroInv.innerHTML = hero.inventory.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="hero">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
            ${item.count > 1 ? `<span style="color:var(--banana-dark); font-size:8px;">(x${item.count})</span>` : ''}
        </div>
    `).join('');

    boxInv.innerHTML = activeStorageContext.items.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="box">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
            ${item.count > 1 ? `<span style="color:var(--banana-dark); font-size:8px;">(x${item.count})</span>` : ''}
        </div>
    `).join('');

    const items = document.querySelectorAll('#storage-menu .draggable-item');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('index', item.dataset.index);
            e.dataTransfer.setData('source', item.dataset.source);
        });
        item.addEventListener('click', () => transferStorageItem(parseInt(item.dataset.index), item.dataset.source));
    });
}

function handleStorageDrop(e, targetSource) {
    const index = e.dataTransfer.getData('index');
    const source = e.dataTransfer.getData('source');
    if (source && source !== targetSource) {
        transferStorageItem(parseInt(index), source);
    }
}

function transferStorageItem(index, source) {
    const config = STORAGE_CONFIGS[activeStorageContext.type];
    if (!config) return;

    if (source === 'hero') {
        const item = hero.inventory[index];
        if (!config.filter(item)) {
            alert(`The storage rejects this item. It is not classified as valid.`);
            return;
        }
        if (socket) {
            socket.emit(config.transferEvent, { 
                storageId: activeStorageContext.id, 
                chestId: activeStorageContext.id, 
                cellarId: activeStorageContext.id, 
                hayStorageId: activeStorageContext.id, 
                index, 
                direction: 'to_storage' || 'to_chest' || 'to_cellar' 
            });
        }
    } else {
        if (socket) {
            socket.emit(config.transferEvent, { 
                storageId: activeStorageContext.id, 
                chestId: activeStorageContext.id, 
                cellarId: activeStorageContext.id, 
                hayStorageId: activeStorageContext.id, 
                index, 
                direction: 'to_hero' 
            });
        }
    }
}

// ==========================================
// 🛠️ UNIFIED PROCESSING SYSTEM
// ==========================================
export let activeJobContext = {
    id: null,
    data: null,
    type: null, // 'SMELTER', 'ANVIL', 'KITCHEN', 'HAY_TABLE'
    confirmingSpeedUp: false
};

const PROCESS_DOM_MAP = {
    SMELTER: { menuId: 'smelter-menu', barId: 'smelter-progress-bar', textId: 'smelter-progress-text', costId: 'smelter-cost-text', btnId: 'smelter-start-btn' },
    ANVIL: { menuId: 'anvil-menu', barId: 'anvil-progress-bar', textId: 'anvil-progress-text', costId: 'anvil-cost-text', btnId: 'anvil-start-btn' },
    KITCHEN: { menuId: 'kitchen-menu', barId: 'kitchen-progress-bar', textId: 'kitchen-progress-text', costId: 'kitchen-cost-text', btnId: 'kitchen-start-btn' },
    HAY_TABLE: { menuId: 'hay-table-menu', barId: 'hay-table-progress-bar', textId: 'hay-table-progress-text', costId: 'hay-table-cost-text', btnId: 'hay-table-start-btn' }
};

export function openProcessMenu(jobId, data, type) {
    activeJobContext.id = jobId;
    activeJobContext.data = data;
    activeJobContext.type = type;
    activeJobContext.confirmingSpeedUp = false;

    const dom = PROCESS_DOM_MAP[type];
    if (dom) {
        document.getElementById(dom.menuId).classList.remove('hidden');
        renderProcessUI();
    }
}

export function handleRemoteJobUpdate(jobId, data) {
    if (activeJobContext.id === jobId) {
        activeJobContext.data = data;
        renderProcessUI();
    }
}

function renderProcessUI() {
    const { type, data, confirmingSpeedUp } = activeJobContext;
    const dom = PROCESS_DOM_MAP[type];
    if (!dom || !data) return;

    const bar = document.getElementById(dom.barId);
    const text = document.getElementById(dom.textId);
    const costText = document.getElementById(dom.costId);
    const btn = document.getElementById(dom.btnId);

    const pct = ((data.maxWork - data.workLeft) / data.maxWork) * 100;
    bar.style.width = `${pct}%`;
    text.innerText = `${data.workLeft} / ${data.maxWork}`;

    const recipeContainer = document.getElementById('kitchen-recipe-select-container');
    if (recipeContainer) {
        recipeContainer.style.display = (type === 'KITCHEN' && !data.active && !data.ready) ? 'block' : 'none';
    }

    if (data.ready) {
        btn.innerText = "COLLECT OUTPUT";
        btn.className = "pixel-btn safe";
        text.innerText = "JOB COMPLETE";
        costText.innerText = "";
    } else if (data.active) {
        const speedUpCost = data.recipe === 'COOK_FISH' ? 0.0169 : (type === 'HAY_TABLE' ? 0.0407 : (type === 'ANVIL' ? 0.10167 : 0.0678));
        if (confirmingSpeedUp) {
            btn.innerText = "CONFIRM SPEED-UP";
            btn.className = "pixel-btn safe";
            costText.innerText = `COST: ${speedUpCost.toFixed(4)} UNI`;
        } else {
            btn.innerText = "SPEED - UP";
            btn.className = "pixel-btn";
            costText.innerText = "";
        }
    } else {
        btn.innerText = type === 'SMELTER' ? "START (1x Iron Ore)" : (type === 'ANVIL' ? "START (1x Iron Ingot)" : (type === 'HAY_TABLE' ? "START (8x Plant Matter)" : "START RECIPE"));
        btn.className = "pixel-btn";
        costText.innerText = "";
    }
}

function triggerJobAction() {
    const { type, data, id } = activeJobContext;
    if (!data) return;

    if (data.ready) {
        if (socket) socket.emit('collectJob', { jobId: id, type });
    } else if (!data.active) {
        if (type === 'KITCHEN') {
            const selectedRecipe = document.getElementById('kitchen-recipe-select').value;
            if (selectedRecipe === 'COOK_FISH') {
                const fishIdx = hero.inventory.findIndex(item => item.seedType === 'fish');
                if (fishIdx === -1) { alert("You need a raw River Bass to cook!"); return; }
            } else if (selectedRecipe.startsWith('EXTRACT_')) {
                const cropType = selectedRecipe.replace('EXTRACT_', '').toLowerCase();
                const cropIdx = hero.inventory.findIndex(item => item.seedType === cropType);
                if (cropIdx === -1) { alert(`You need 1x ${cropType.replace('_item', '')} to extract seeds!`); return; }
            }
            if (socket) socket.emit('startJob', { jobId: id, type, recipe: selectedRecipe });
        } else {
            const requirements = {
                SMELTER: { input: 'iron_ore', qty: 1, msg: "You need Iron Ore to start smelting!" },
                ANVIL: { input: 'iron_ingot', qty: 1, msg: "You need an Iron Ingot to start forging!" },
                HAY_TABLE: { input: 'plant_matter', qty: 8, msg: "You need 8x Plant Matter to make hay!" }
            };
            const req = requirements[type];
            const idx = hero.inventory.findIndex(item => item.seedType === req.input);
            if (idx === -1 || hero.inventory[idx].count < req.qty) {
                alert(req.msg);
                return;
            }
            if (socket) socket.emit('startJob', { jobId: id, type });
        }
    } else {
        if (!activeJobContext.confirmingSpeedUp) {
            activeJobContext.confirmingSpeedUp = true;
            renderProcessUI();
        } else {
            if (socket) socket.emit('speedUpJob', { jobId: id, type });
            activeJobContext.confirmingSpeedUp = false;
        }
    }
}

// ==========================================
// 🗺️ MAP, TABS & STATS
// ==========================================
export const PALADIN_SKILLS = [
    { id: 'p1', name: 'Vault', icon: '⚔️' },
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

    const activityBtn = document.getElementById('hud-activity-btn');
    if (activityBtn) {
        activityBtn.onclick = () => { if (socket) socket.emit('requestActivityLog'); };
    }
    const closeActivityBtn = document.getElementById('close-activity-btn');
    if (closeActivityBtn) {
        closeActivityBtn.onclick = () => document.getElementById('activity-menu').classList.add('hidden');
    }

    if (socket) {
        socket.on('activityData', (logData) => renderActivityLog(logData));
    }
    
    const helpBtn = document.getElementById('hud-help-btn');
    if (helpBtn) {
        helpBtn.onclick = () => document.getElementById('help-menu').classList.remove('hidden');
    }
    const closeHelpBtn = document.getElementById('close-help-btn');
    if (closeHelpBtn) {
        closeHelpBtn.onclick = () => document.getElementById('help-menu').classList.add('hidden');
    }

    // --- COOPERATIVE UNIFIED STORAGE MARKUP BINDING ---
    const closeStorageBtn = document.getElementById('close-storage-btn');
    if (closeStorageBtn) {
        closeStorageBtn.addEventListener('click', () => {
            document.getElementById('storage-menu').classList.add('hidden');
            activeStorageContext.id = null;
        });
    }

    const unloadBtn = document.getElementById('storage-unload-btn');
    if (unloadBtn) {
        unloadBtn.addEventListener('click', () => {
            const config = STORAGE_CONFIGS[activeStorageContext.type];
            if (!activeStorageContext.id || hero.inventory.length === 0 || !config) return;

            const valids = hero.inventory.filter(i => config.filter(i));
            const remainders = hero.inventory.filter(i => !config.filter(i));

            if (valids.length === 0) {
                alert("No valid items in backpack to unload!");
                return;
            }

            activeStorageContext.items.push(...valids);
            hero.inventory = remainders;
            if (socket) socket.emit(config.updateEvent, { chestId: activeStorageContext.id, cellarId: activeStorageContext.id, hayStorageId: activeStorageContext.id, items: activeStorageContext.items });
            renderStorageUI();
            syncInventoryWithServer();
        });
    }

    const storageHeroPane = document.getElementById('storage-hero-inv');
    const storageBoxPane = document.getElementById('storage-box-inv');
    if (storageHeroPane && storageBoxPane) {
        [storageHeroPane, storageBoxPane].forEach(p => p.addEventListener('dragover', (e) => e.preventDefault()));
        storageHeroPane.addEventListener('drop', (e) => handleStorageDrop(e, 'hero'));
        storageBoxPane.addEventListener('drop', (e) => handleStorageDrop(e, 'box'));
    }

    // --- TEMPLE ALTAR ---
    const closeAltar = document.getElementById('close-temple-btn');
    if (closeAltar) {
        closeAltar.addEventListener('click', () => {
            document.getElementById('temple-menu').classList.add('hidden');
            if (altarItem) {
                hero.inventory.push(altarItem);
                altarItem = null;
            }
        });
    }

    const sacrificeBtn = document.getElementById('sacrifice-btn');
    if (sacrificeBtn) {
        sacrificeBtn.addEventListener('click', () => {
            if (!altarItem) { alert("The Altar is empty!"); return; }
            if (!playerWallet) { alert("Connect your wallet to receive UNI points!"); return; }
            if (socket) {
                socket.emit('sacrificeItem', { itemType: altarItem.seedType, count: altarItem.count, playerWalletAddress: playerWallet });
            }
            altarItem = null;
            renderTempleUI();
        });
    }

    const templeHeroPane = document.getElementById('temple-hero-inv');
    const templeSlot = document.getElementById('temple-slot');
    if (templeHeroPane && templeSlot) {
        [templeHeroPane, templeSlot].forEach(p => {
            p.addEventListener('dragover', (e) => { e.preventDefault(); if (p.id === 'temple-slot') p.classList.add('drag-over'); });
            p.addEventListener('dragleave', () => p.classList.remove('drag-over'));
        });
        templeHeroPane.addEventListener('drop', (e) => handleTempleDrop(e, 'hero-temple'));
        templeSlot.addEventListener('drop', (e) => { templeSlot.classList.remove('drag-over'); handleTempleDrop(e, 'altar'); });
    }

    // --- MAP TABLE ---
    const closeMapTable = document.getElementById('close-maptable-btn');
    if (closeMapTable) closeMapTable.addEventListener('click', () => document.getElementById('maptable-menu').classList.add('hidden'));

    // --- FINANCIAL WALLETS ---
    const withdrawBtn = document.getElementById('hud-withdraw-btn');
    if (withdrawBtn) withdrawBtn.onclick = openWithdrawMenu;

    const closeWithdrawBtn = document.getElementById('close-withdraw-btn');
    if (closeWithdrawBtn) closeWithdrawBtn.onclick = () => document.getElementById('withdraw-menu').classList.add('hidden');

    const confirmWithdrawBtn = document.getElementById('confirm-withdraw-btn');
    if (confirmWithdrawBtn) {
        confirmWithdrawBtn.onclick = async () => {
            const amount = parseFloat(document.getElementById('withdraw-input').value);
            if (isNaN(amount) || amount <= 0) { alert("Enter a valid amount."); return; }
            if (amount > hero.inGameUni) { alert("Insufficient balance."); return; }

            let targetAddress = playerWallet;
            if (!targetAddress.startsWith('0x')) {
                alert("MetaMask will now request connection to verify address destination.");
                const addr = await connectWallet();
                if (!addr) { alert("Web3 connection refused."); return; }
                targetAddress = addr;
            }

            if (socket) socket.emit('requestWithdrawal', { amount, targetAddress });
            document.getElementById('withdraw-menu').classList.add('hidden');
        };
    }

    // --- DOOR CONTROLS ---
    const closeDoorBtn = document.getElementById('close-door-btn');
    if (closeDoorBtn) closeDoorBtn.onclick = () => { document.getElementById('door-menu').classList.add('hidden'); activeDoorCoords = null; };

    const lockDoorBtn = document.getElementById('door-lock-btn');
    if (lockDoorBtn) {
        lockDoorBtn.onclick = () => {
            if (activeDoorCoords && socket) socket.emit('setDoorLock', { gx: activeDoorCoords.gx, gy: activeDoorCoords.gy, locked: true });
        };
    }
    const unlockDoorBtn = document.getElementById('door-unlock-btn');
    if (unlockDoorBtn) {
        unlockDoorBtn.onclick = () => {
            if (activeDoorCoords && socket) socket.emit('setDoorLock', { gx: activeDoorCoords.gx, gy: activeDoorCoords.gy, locked: false });
        };
    }

    // --- WEB2 / WEB3 CREDENTIALS ---
    const mainConnectBtn = document.getElementById('main-connect-btn');
    if (mainConnectBtn) {
        mainConnectBtn.onclick = async () => {
            mainConnectBtn.innerText = "CONNECTING...";
            const addr = await connectWallet();
            if (addr && socket) {
                setPlayerWallet(addr);
                socket.emit('identifyWallet', addr);
            } else {
                mainConnectBtn.innerText = "CONNECT WALLET";
            }
        };
    }

    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    if (loginBtn) loginBtn.onclick = () => handleAuth('loginUser');
    if (registerBtn) registerBtn.onclick = () => handleAuth('registerUser');

    const guestBtn = document.getElementById('guest-btn');
    if (guestBtn) {
        guestBtn.onclick = () => {
            const guestID = "Guest_" + Math.floor(Math.random() * 999999);
            setPlayerWallet(guestID);
            if (socket) socket.emit('identifyWallet', guestID);
        };
    }

    if (socket) {
        socket.on('authResponse', (res) => {
            if (res.success) {
                setPlayerWallet(res.wallet);
                socket.emit('identifyWallet', res.wallet);
            } else {
                alert(res.message);
            }
        });

        socket.on('jobUpdated', (res) => {
            if (activeJobContext.id === res.jobId) {
                activeJobContext.data = res.data;
                renderProcessUI();
            }
        });

        socket.on('receiveLoot', (res) => {
            import('./interactionManager.js').then(m => {
                const item = createItem(ITEM_TYPES[res.itemType.toUpperCase()]);
                if (res.qty) item.count = res.qty;
                if (m.giveItemToHero(item)) {
                    renderTabContent();
                    syncInventoryWithServer();
                } else {
                    alert("Backpack full! Make space.");
                }
            });
        });
    }

    // --- CRAFTING BUTTONS ASSOCIATION ---
    Object.keys(PROCESS_DOM_MAP).forEach(type => {
        const dom = PROCESS_DOM_MAP[type];
        const btn = document.getElementById(dom.btnId);
        if (btn) btn.addEventListener('click', triggerJobAction);

        const closeBtn = document.getElementById(`close-${type.toLowerCase().replace('_', '-')}-btn`);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById(dom.menuId).classList.add('hidden');
                activeJobContext.confirmingSpeedUp = false;
            });
        }
    });

    initMiningListeners();
}

function handleAuth(type) {
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;
    if (!user || !pass) { alert("Username and password are required."); return; }
    if (socket) socket.emit(type, { username: user, password: pass });
}

// ==========================================
// 🎛️ CHARACTER CREATION UI
// ==========================================
export function renderCharacterCreation() {
    const grid = document.getElementById('skill-grid');
    if (!grid) return;
    
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
                selectedSkills = selectedSkills.filter(s => s !== id);
                item.classList.remove('selected');
            } else {
                if (selectedSkills.length >= 4) { alert("Maximum of 4 core skills allowed!"); return; }
                selectedSkills.push(id);
                item.classList.add('selected');
            }
            updateSkillSlots();
        });
    });

    const finishBtn = document.getElementById('finish-char-btn');
    if (finishBtn) {
        finishBtn.addEventListener('click', () => {
            if (selectedSkills.length === 4 && socket) {
                socket.emit('createCharacter', { wallet: playerWallet, charClass: 'Paladin', skills: selectedSkills });
            }
        });
    }
}

function updateSkillSlots() {
    const slots = document.querySelectorAll('.skill-slot');
    const displayCount = document.getElementById('skill-count');
    if (displayCount) displayCount.innerText = selectedSkills.length;
    const reqLevels = [1, 25, 50, 75];

    for (let i = 0; i < 4; i++) {
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

    const finishBtn = document.getElementById('finish-char-btn');
    if (finishBtn) finishBtn.disabled = (selectedSkills.length !== 4);
}

// ==========================================
// 🎒 MENU CONTROLS & RENDER
// ==========================================
export function toggleMenu() {
    uiState.isOpen = !uiState.isOpen;
    document.getElementById('menu-overlay').classList.toggle('hidden', !uiState.isOpen);
    if (uiState.isOpen) renderTabContent();
}

export function getItemIcon(item) {
    if (!item) return "❓";
    const typeKey = Object.keys(ITEM_TYPES).find(k => ITEM_TYPES[k].seedType === item.seedType);
    if (typeKey && ITEM_TYPES[typeKey].icon) {
        return ITEM_TYPES[typeKey].icon;
    }
    // Static Fallback mapping
    const fallbacks = {
        fish: "🐟", cooked_fish: "🍱", plant_matter: "🌿", grass_seed: "🌱",
        turnip_item: "🧅", tomato_item: "🍅", eggplant_item: "🍆", strawberry_item: "🍓",
        pumpkin_item: "🎃", watermelon_item: "🍉", corn_item: "🌽", pineapple_item: "🍍",
        potato_item: "🥔", wheat_item: "🌾", egg: "🥚", hay: "🌾", ore: "🪨",
        coin: "💰", weapon_dagger: "🗡️", key: "🔑"
    };
    return fallbacks[item.seedType] || "❓";
}

export function renderTabContent() {
    const container = document.getElementById('tab-content');
    if (!container) return;
    container.innerHTML = "";

    switch (uiState.currentTab) {
        case 'inventory':
            const heldItem = hero.equipment?.mainHand;
            container.innerHTML = `<h3 style="margin-top:0;">Backpack</h3><div class="inv-grid">` + 
                hero.inventory.map((item, index) => {
                    const isActive = (heldItem === item);
                    const borderStyle = isActive ? 'border: 4px dashed var(--highlight); background: rgba(138, 154, 91, 0.2);' : '';
                    return `
                    <div class="inv-item draggable-item" draggable="true" data-index="${index}" data-source="hero" 
                         onclick="window.equipItem(${index})" style="${borderStyle}">
                        <div class="item-icon" style="font-size: 20px; margin-bottom:5px;">${getItemIcon(item)}</div>
                        <span>${item.name} ${item.count > 1 ? `<br><span style="color:var(--banana-dark);">(x${item.count})</span>` : ''}</span>
                    </div>
                `}).join('') + `</div>`;
            
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
            const info = getLevelInfo(hero.xp);
            container.innerHTML = `
                <h3 style="margin-top:0; color: var(--highlight);">${hero.charClass ? hero.charClass.toUpperCase() : 'PEASANT'} LVL ${info.level}</h3>
                <div class="stat-row"><span>HP:</span> <span>${Math.floor(hero.hp)}/${hero.maxHp}</span></div>
                <div class="stat-row"><span>EN:</span> <span style="color:var(--banana-dark);">${Math.floor(hero.energy)}/${hero.maxEnergy}</span></div>
                <div class="stat-row"><span>ATK:</span> <span>${hero.ad}</span></div>
                <div class="stat-row"><span>DEF:</span> <span>${hero.armor}</span></div>
                <div class="stat-row"><span>XP:</span> <span>${Math.floor(hero.xp)}</span></div>
                <div class="stat-row" style="color:var(--highlight);"><span>PTS:</span> <span>${info.points - hero.spentPoints}</span></div>
            `;
            break;

        case 'map':
            container.innerHTML = `
                <h3 style="margin-top:0; text-align:center;">WORLD MAP</h3>
                <p style="font-size: 8px; text-align:center; margin-top:15px; color:#555;">(Use a Map Table in any settlement to display region chart)</p>
            `;
            break;

        case 'equipment':
            const held = hero.equipment?.mainHand;
            container.innerHTML = `
                <h3 style="margin-top:0; text-align: center;">GEAR</h3>
                <div style="display: flex; flex-direction: column; gap: 15px; align-items: center; margin-top: 20px;">
                    <div>
                        <span style="font-size: 10px; color: #555;">MAIN HAND</span>
                        <div class="inv-item" style="width: 80px; height: 80px; margin-top: 5px;" ${held ? `onclick="window.unequipMainHand()"` : ''}>
                            <div style="font-size: 32px;">${held ? getItemIcon(held) : '🤚'}</div>
                            <span style="font-size: 8px;">${held ? held.name : 'Fists'}</span>
                        </div>
                    </div>
                </div>
            `;
            break;

        case 'skills':
            let skillsHTML = `<p style="font-size:10px; text-align:center;">NO core SKILLS LEARNED</p>`;
            if (hero.skills && hero.skills.length > 0) {
                skillsHTML = `<div class="inv-grid" style="grid-template-columns: repeat(2, 1fr);">` + 
                hero.skills.map(id => {
                    const skill = PALADIN_SKILLS.find(s => s.id === id);
                    if (!skill) return '';
                    return `
                        <div class="inv-item">
                            <div style="font-size: 24px;">${skill.icon}</div>
                            <span style="margin-top: 5px;">${skill.name}</span>
                        </div>
                    `;
                }).join('') + `</div>`;
            }
            container.innerHTML = `
                <h3 style="margin-top:0; text-align:center;">CORE ABILITIES</h3>
                ${skillsHTML}
            `;
            break;
    }
}

// ==========================================
// 🏪 GENERAL MARKET RENDER
// ==========================================
export let activeStoreId = null;
let activeStoreData = null;
let currentStoreTab = 'market';

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
            content.innerHTML = `<p style="text-align:center; font-size:10px;">MARKET RECORD IS EMPTY</p>`;
            return;
        }

        othersListings.forEach(l => {
            const hasExactItem = hero.inventory.some(i => i.seedType === l.wantedType);
            content.innerHTML += `
                <div style="background: #fff; border: 4px solid var(--bg-dark); margin-bottom: 10px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 14px; margin-bottom: 5px;">${getItemIcon(l.offeredItem)} ${l.offeredItem.name}</div>
                        <div style="font-size: 10px;">WANTS: ${l.wantedType.toUpperCase().replace('_', ' ')}</div>
                    </div>
                    <div>
                        <button onclick="window.buyListing('${l.id}', '${l.wantedType}')" class="${hasExactItem ? 'pixel-btn' : 'pixel-btn pixel-btn-cancel'}" ${!hasExactItem ? 'disabled' : ''}>BUY</button>
                    </div>
                </div>
            `;
        });
    } 
    else if (currentStoreTab === 'ledger') {
        let inventoryOptions = hero.inventory.map((item, idx) => `<option value="${idx}">${getItemIcon(item)} ${item.name}</option>`).join('');
        let wantedOptions = Object.keys(ITEM_TYPES).map(key => `<option value="${ITEM_TYPES[key].seedType}">${ITEM_TYPES[key].name}</option>`).join('');

        content.innerHTML += `
            <div style="background: var(--banana); padding: 10px; margin-bottom: 15px; border: 4px solid var(--bg-dark);">
                <h4 style="margin:0 0 10px 0; text-align:center;">POST LISTING</h4>
                ${hero.inventory.length === 0 ? `<p style="font-size:10px; text-align:center;">INVENTORY EMPTY</p>` : `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <select id="offer-select" style="width: 45%; padding: 5px; font-size:10px; border: 4px solid var(--bg-dark);">${inventoryOptions}</select>
                        <span style="font-size:10px;">FOR</span>
                        <select id="wanted-select" style="width: 45%; padding: 5px; font-size:10px; border: 4px solid var(--bg-dark);">${wantedOptions}</select>
                    </div>
                    <button onclick="window.createListing()" class="pixel-btn" style="width: 100%; margin-top: 10px; background: #fff;">POST TO MARKET</button>
                `}
            </div>
        `;
    }
    else if (currentStoreTab === 'lockbox') {
        const myStorage = activeStoreData.storage[playerWallet] || [];
        content.innerHTML += `<p style="text-align:center; font-size:10px;">ESCROW LOCKBOX</p>`;
        if (myStorage.length === 0) {
            content.innerHTML += `<div style="text-align:center; margin-top: 20px;">[ LOCKBOX EMPTY ]</div>`;
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
        syncInventoryWithServer();
        renderStoreUI();
    }
};

window.buyListing = (listingId, wantedType) => {
    const itemIdx = hero.inventory.findIndex(i => i.seedType === wantedType);
    if (itemIdx !== -1) {
        const paymentItem = hero.inventory.splice(itemIdx, 1)[0];
        socket.emit('buyListing', { storeId: activeStoreId, listingId, buyerWallet: playerWallet, paymentItem });
        switchStoreTab('lockbox');
    }
};

window.claimStorage = () => {
    socket.emit('claimStorage', { storeId: activeStoreId, wallet: playerWallet });
};

// ==========================================
// ⛩️ TEMPLE ALTAR
// ==========================================
export function renderTempleUI() {
    const heroInv = document.getElementById('temple-hero-inv');
    const altarSlot = document.getElementById('temple-slot');
    if (!heroInv || !altarSlot) return;

    heroInv.innerHTML = hero.inventory.map((item, i) => `
        <div class="inv-item click-sacrifice-item" data-index="${i}" data-source="hero">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
            ${item.count > 1 ? `<span style="color:var(--banana-dark); font-size:8px;">(x${item.count})</span>` : ''}
        </div>
    `).join('');

    altarSlot.innerHTML = `<div style="color: var(--banana-dark); font-size: 10px; text-align: center; padding: 20px;">CLICK SEEDS TO OFFER</div>`;

    const items = document.querySelectorAll('#temple-menu .click-sacrifice-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            const inventoryItem = hero.inventory[index];
            if (!inventoryItem.seedType.includes("_seed")) {
                alert("Only biological crop seeds are accepted at the Holy Altar.");
                return;
            }
            if (confirm(`Do you wish to sacrifice ${inventoryItem.count}x ${inventoryItem.name} for UNI?`)) {
                if (socket) socket.emit('sacrificeItem', { index });
            }
        });
    });
}

function handleTempleDrop(e, targetSource) {
    const index = e.dataTransfer.getData('index');
    const source = e.dataTransfer.getData('source');
    if (source && source !== targetSource) {
        const item = hero.inventory[index];
        if (item.seedType.includes("_seed")) {
            altarItem = hero.inventory.splice(index, 1)[0];
            renderTempleUI();
        } else {
            alert("This altar accepts seeds only.");
        }
    }
}

// ==========================================
// ⛏️ MINING ENGINE
// ==========================================
export let activeOreId = null;
export let activeOreData = null;
let confirmingSpeedUp = false;

export function openMiningMenu(oreId, data) {
    activeOreId = oreId;
    activeOreData = data;
    confirmingSpeedUp = false;
    document.getElementById('mining-menu').classList.remove('hidden');
    renderMiningUI();
}

function renderMiningUI() {
    if (!activeOreData) return;
    const bar = document.getElementById('mining-progress-bar');
    const text = document.getElementById('mining-progress-text');
    const costText = document.getElementById('mining-cost-text');
    const actionBtn = document.getElementById('mining-action-btn');

    const pct = ((activeOreData.maxWork - activeOreData.workLeft) / activeOreData.maxWork) * 100;
    bar.style.width = `${pct}%`;
    text.innerText = `${activeOreData.workLeft} / ${activeOreData.maxWork}`;

    if (activeOreData.claimed) {
        actionBtn.innerText = "DEPLETED";
        actionBtn.disabled = true;
        costText.innerText = "";
    } else if (activeOreData.workLeft <= 0) {
        actionBtn.innerText = "COLLECT NOW!";
        actionBtn.className = "pixel-btn safe";
        actionBtn.disabled = false;
        costText.innerText = "";
    } else {
        actionBtn.disabled = false;
        if (confirmingSpeedUp) {
            actionBtn.innerText = "CONFIRM SPEEDUP";
            actionBtn.className = "pixel-btn safe";
            costText.innerText = "COST: 1.22 UNI";
        } else {
            actionBtn.innerText = "SPEED - UP";
            actionBtn.className = "pixel-btn";
            costText.innerText = "";
        }
    }
}

export function initMiningListeners() {
    const closeBtn = document.getElementById('close-mining-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('mining-menu').classList.add('hidden');
            activeOreId = null;
            confirmingSpeedUp = false;
        });
    }

    const actionBtn = document.getElementById('mining-action-btn');
    if (actionBtn) {
        actionBtn.addEventListener('click', () => {
            if (activeOreData.claimed) return;
            if (activeOreData.workLeft <= 0) {
                if (socket) socket.emit('collectOre', { oreId: activeOreId });
            } else {
                if (!confirmingSpeedUp) {
                    confirmingSpeedUp = true;
                    renderMiningUI();
                } else {
                    if (socket) socket.emit('speedUpOre', { oreId: activeOreId });
                    confirmingSpeedUp = false;
                }
            }
        });
    }
}

// ==========================================
// 🏦 BANK REDEMPTIONS
// ==========================================
export function openWithdrawMenu() {
    if (!playerWallet) { alert("Web3 identity connection required."); return; }
    document.getElementById('withdraw-balance-max').innerText = hero.inGameUni.toFixed(8);
    document.getElementById('withdraw-input').value = "";
    document.getElementById('withdraw-menu').classList.remove('hidden');
}

export function updateHUD() {
    const uniDisplay = document.getElementById('uni-display');
    const playerCount = document.getElementById('player-count');
    const fishDisplay = document.getElementById('fish-display');
    const tgvDisplay = document.getElementById('tgv-display');

    if (uniDisplay) uniDisplay.innerText = `${(hero.inGameUni || 0).toFixed(8)} UNI`;
    if (playerCount) {
        let count = 1;
        remotePlayers.forEach(p => { if (!p.isOffline) count++; });
        playerCount.innerText = `PLAYERS: ${count}`;
    }
    if (fishDisplay) fishDisplay.innerText = `FISH: ${Math.floor(globalFishCount)}`;
    if (tgvDisplay) tgvDisplay.innerText = `TGV: ${(gameState.tvl || 0).toFixed(8)} UNI`;
}

// ==========================================
// 🎛️ GLOBAL BINDINGS
// ==========================================
window.equipItem = (invIndex) => {
    if (socket) socket.emit('requestEquip', { index: invIndex, currentEnergy: hero.energy });
};

window.unequipMainHand = () => {
    if (socket) socket.emit('requestUnequip', { currentEnergy: hero.energy });
};

// ==========================================
// 📱 TOUCH DRAGGING ENGINE
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
        else if (item.isFodder) statsEl.innerText = `Bites Left: ${Math.ceil(item.health / 10)} / 10`;
        else statsEl.innerText = "";
        
        document.getElementById('tt-desc').innerText = item.description || "No description.";
        tooltip.style.display = 'block';
        tooltip.style.left = `${x + 15}px`;
        tooltip.style.top = `${y + 15}px`;
    }
}

function getItemFromDOM(source, index) {
    if (!source) return null;
    if (source === 'hero' || source.startsWith('hero-')) return hero.inventory[index];
    if (source === 'box') return activeStorageContext.items[index];
    if (source === 'altar') return altarItem;
    return null;
}

document.body.addEventListener('mouseover', (e) => {
    const itemEl = e.target.closest('.inv-item');
    if (itemEl && itemEl.dataset.index) showTooltip(itemEl, e.clientX, e.clientY);
});
document.body.addEventListener('mouseout', (e) => {
    if (e.target.closest('.inv-item')) tooltip.style.display = 'none';
});

// ==========================================
// 📖 ACTIVITY LEDGER RENDERER
// ==========================================
function renderActivityLog(logData) {
    const list = document.getElementById('activity-list');
    document.getElementById('activity-menu').classList.remove('hidden');
    if (!logData || logData.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #888;">No recent activity logs.</div>`;
        return;
    }
    list.innerHTML = logData.map(entry => {
        const mins = Math.floor((Date.now() - entry.timestamp) / 60000);
        let timeStr = mins < 1 ? "Just now" : (mins < 60 ? `${mins}m ago` : `${Math.floor(mins/60)}h ago`);
        let shortWallet = entry.wallet;
        if (shortWallet.startsWith('0x') && shortWallet.length > 10) {
            shortWallet = shortWallet.substring(0, 6) + "..." + shortWallet.substring(shortWallet.length - 4);
        }
        return `<div><span style="color:#888;">[${timeStr}]</span> <strong>${shortWallet}</strong>: ${entry.description}</div>`;
    }).join('');
}

// ==========================================
// 🗺️ LOCATION BANNER ENGINE
// ==========================================
const prefixes = ["Oak", "Pine", "River", "Stone", "Iron", "Gold", "Silver", "Wind", "Storm", "High", "Low", "Dark", "Light", "Ash", "Thorn", "Green", "Red", "Blue"];
const suffixes = ["wood", "ford", "bridge", "mont", "ville", "town", "bury", "ton", "vale", "dale", "peak", "haven", "keep", "watch"];

function getZoneName(seed1, seed2) {
    const hash = Math.sin(seed1 * 12.9898 + seed2 * 78.233) * 43758.5453;
    const pre = prefixes[Math.floor(Math.abs(hash) * 100) % prefixes.length];
    const suf = suffixes[Math.floor(Math.abs(hash * 10) * 100) % suffixes.length];
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

    if (cellType === 101) { zoneName = getZoneName(cx, cy); zoneDesc = "PEACEFUL VILLAGE"; }
    else if (cellType === 102) { zoneName = getZoneName(cx, cy); zoneDesc = "FORTIFIED TOWN"; }
    else if (cellType === 103) { zoneName = getZoneName(cx, cy) + " Castle"; zoneDesc = "ROYAL STRONGHOLD"; }
    else if (cellType === 107) { zoneName = getZoneName(cx, cy) + " Camp"; zoneDesc = "MINING EXPEDITION"; }

    nameEl.innerText = zoneName;
    typeEl.innerText = zoneDesc;
    banner.style.opacity = "1";

    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => { banner.style.opacity = "0"; }, 4000);
}

// ==========================================
// 🎛️ HOBBIT MANAGER
// ==========================================
let selectedHobbitId = null;
export function openHobbitManagerMenu() {
    selectedHobbitId = null;
    document.getElementById('hobbit-manager-menu').classList.remove('hidden');
    renderHobbitManagerUI();
}

function renderHobbitManagerUI() {
    const listEl = document.getElementById('hobbit-list');
    const detailsEl = document.getElementById('selected-hobbit-details');
    const buttonContainer = document.getElementById('job-button-container');
    
    import('./hobbits.js').then(m => {
        const activeHobbits = m.hobbits;
        if (activeHobbits.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; font-size:8px; color:#555;">NO WORKERS ACTIVE</div>`;
            return;
        }

        listEl.innerHTML = activeHobbits.map(hob => {
            const isSelected = (hob.id === selectedHobbitId);
            const style = isSelected ? 'background: var(--highlight);' : 'background: white;';
            return `<div onclick="window.selectHobbit('${hob.id}')" style="${style} padding:8px; border:4px solid var(--bg-dark); cursor:pointer;"><strong>${hob.name}</strong> - ${hob.job.toUpperCase()}</div>`;
        }).join('');

        const selected = activeHobbits.find(h => h.id === selectedHobbitId);
        if (selected) {
            detailsEl.innerHTML = `<strong>${selected.name}</strong><br>ROLE: ${selected.job.toUpperCase()}`;
            buttonContainer.innerHTML = `
                <button onclick="window.assignHobbitJob('Forager')" class="pixel-btn">FORAGER</button>
                <button onclick="window.assignHobbitJob('Farmer')" class="pixel-btn">FARMER</button>
                <button onclick="window.assignHobbitJob('Trader')" class="pixel-btn">TRADER</button>
                <button onclick="window.assignHobbitJob('Idle')" class="pixel-btn">IDLE</button>
            `;
        } else {
            detailsEl.innerText = "Select a hobbit to modify duties.";
            buttonContainer.innerHTML = "";
        }
    });
}

window.selectHobbit = (id) => { selectedHobbitId = id; renderHobbitManagerUI(); };
window.assignHobbitJob = (jobName) => {
    if (!selectedHobbitId) return;
    import('./hobbits.js').then(m => {
        const target = m.hobbits.find(h => h.id === selectedHobbitId);
        if (target) { target.job = jobName; target.path = []; renderHobbitManagerUI(); }
    });
};