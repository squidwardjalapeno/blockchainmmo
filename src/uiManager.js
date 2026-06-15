
import { hero, getLevelInfo, gameState } from './entities.js';
import { socket, remotePlayers, playerWallet, setPlayerWallet, syncInventoryWithServer } from './multiplayer.js';
import { CONFIG } from './config.js';
import { ITEM_TYPES, createItem } from './items.js';
import { getWaitModifier, getRandomFish, globalFishCount } from './fish.js';
import { submitVoucherToChain, connectWallet } from './blockchainManager.js';
import { mapCanvas } from './renderer.js';
import { recalculateStats } from './interactionManager.js';

export let activeDoorCoords = null;


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

// ==========================================
// 🛠️ CRAFTING RENDERERS (Smelter & Anvil)
// ==========================================
// 🛠️ CRAFTING RENDERERS (Smelter & Anvil)
// ==========================================
export let activeSmelterId = null;
export let activeSmelterData = null;
export let activeAnvilId = null;
export let activeAnvilData = null;

let confirmingSmelterSpeedUp = false;
let confirmingAnvilSpeedUp = false;

export function openCraftingTableMenu() {
    document.getElementById('workshop-menu').classList.remove('hidden');
}


function renderSmelterUI() {
    if (!activeSmelterData) return;
    const bar = document.getElementById('smelter-progress-bar');
    const text = document.getElementById('smelter-progress-text');
    const costText = document.getElementById('smelter-cost-text');
    const btn = document.getElementById('smelter-start-btn');

    const pct = ((activeSmelterData.maxWork - activeSmelterData.workLeft) / activeSmelterData.maxWork) * 100;
    bar.style.width = `${pct}%`;
    text.innerText = `${activeSmelterData.workLeft} / ${activeSmelterData.maxWork}`;

    if (activeSmelterData.ready) {
        btn.innerText = "COLLECT INGOT";
        btn.className = "pixel-btn safe";
        text.innerText = "JOB COMPLETE";
        costText.innerText = "";
        confirmingSmelterSpeedUp = false;
    } else if (activeSmelterData.active) {
        if (confirmingSmelterSpeedUp) {
            btn.innerText = "SPEED - UP NOW!";
            btn.className = "pixel-btn safe";
            costText.innerText = "COST: 50 UNI";
        } else {
            btn.innerText = "SPEED - UP";
            btn.className = "pixel-btn";
            costText.innerText = "";
        }
    } else {
        btn.innerText = "START (1x Iron Ore)";
        btn.className = "pixel-btn";
        costText.innerText = "";
        confirmingSmelterSpeedUp = false;
    }
}

function renderAnvilUI() {
    if (!activeAnvilData) return;
    const bar = document.getElementById('anvil-progress-bar');
    const text = document.getElementById('anvil-progress-text');
    const costText = document.getElementById('anvil-cost-text');
    const btn = document.getElementById('anvil-start-btn');

    const pct = ((activeAnvilData.maxWork - activeAnvilData.workLeft) / activeAnvilData.maxWork) * 100;
    bar.style.width = `${pct}%`;
    text.innerText = `${activeAnvilData.workLeft} / ${activeAnvilData.maxWork}`;

    if (activeAnvilData.ready) {
        btn.innerText = "COLLECT DAGGER";
        btn.className = "pixel-btn safe";
        text.innerText = "JOB COMPLETE";
        costText.innerText = "";
        confirmingAnvilSpeedUp = false;
    } else if (activeAnvilData.active) {
        if (confirmingAnvilSpeedUp) {
            btn.innerText = "SPEED - UP NOW!";
            btn.className = "pixel-btn safe";
            costText.innerText = "COST: 50 UNI";
        } else {
            btn.innerText = "SPEED - UP";
            btn.className = "pixel-btn";
            costText.innerText = "";
        }
    } else {
        btn.innerText = "FORGE DAGGER (1x Iron Ingot)";
        btn.className = "pixel-btn";
        costText.innerText = "";
        confirmingAnvilSpeedUp = false;
    }
}

export function handleRemoteSmelterUpdate(jobId, data) {
    if (activeSmelterId === jobId) { activeSmelterData = data; renderSmelterUI(); }
}
export function handleRemoteAnvilUpdate(jobId, data) {
    if (activeAnvilId === jobId) { activeAnvilData = data; renderAnvilUI(); }
}

const VALID_FOOD_TYPES = ["fish", "cooked_fish", "grass_item"];
const VALID_HAY_TYPES = ["hay", "plant_matter"]; // 🎯 THE FIX: Add plant_matter to the valid hay storage list
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

    // --- ACTIVITY LEDGER ---
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
                count: altarItem.count, // 👈 THE FIX: Send the stack count!
                playerWalletAddress: playerWallet
            });
        }
        
        console.log(`💎 Sacrificed ${altarItem.count}x ${altarItem.name} to the Gods.`);
        alert("The Gods are pleased! Points have been added to your balance.");
        
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

    // --- HAY STORAGE LISTENERS ---
    document.getElementById('close-hay-storage-btn').addEventListener('click', () => {
        document.getElementById('hay-storage-menu').classList.add('hidden');
        activeHayStorageId = null; 
    });

    // --- HAY STORAGE UNLOAD BUTTON ---
    document.getElementById('unload-hay-btn').addEventListener('click', () => {
        if (!activeHayStorageId || hero.inventory.length === 0) return;
        
        const hayItems = hero.inventory.filter(i => VALID_HAY_TYPES.includes(i.seedType));
        const otherItems = hero.inventory.filter(i => !VALID_HAY_TYPES.includes(i.seedType));

        if (hayItems.length === 0) {
            alert("No Hay or Plant Matter in backpack to unload!");
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


    // Inside initUI() for the withdraw button:
    document.getElementById('confirm-withdraw-btn').onclick = async () => {
        const amount = parseFloat(document.getElementById('withdraw-input').value);

        if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount."); return; }
        if (amount > hero.inGameUni) { alert(`Insufficient balance! You only have ${hero.inGameUni.toFixed(8)} UNI.`); return; }
        if (amount < 0.00000001) { alert("Minimum withdrawal is 0.00000001 UNI."); return; }

        let targetAddress = playerWallet;

        // 👈 THE FIX: If they are a Web2 User/Guest, force MetaMask to connect!
        if (!targetAddress.startsWith('0x')) {
            alert("You are logged in via Username/Password. MetaMask will now open to link your withdrawal address.");
            const web3Address = await connectWallet();
            if (!web3Address) {
                alert("MetaMask connection failed. Cannot withdraw.");
                return;
            }
            targetAddress = web3Address; // Send the voucher to this real Web3 wallet instead!
        }

        if (socket) {
            // Send the targetAddress along with the amount!
            socket.emit('requestWithdrawal', { amount: amount, targetAddress: targetAddress });
        }
        document.getElementById('withdraw-menu').classList.add('hidden');
    };

    // --- DOOR CONTROL LISTENERS ---
    const closeDoorBtn = document.getElementById('close-door-btn');
    if (closeDoorBtn) {
        closeDoorBtn.onclick = () => {
            document.getElementById('door-menu').classList.add('hidden');
            activeDoorCoords = null;
        };
    }

    const lockDoorBtn = document.getElementById('door-lock-btn');
    if (lockDoorBtn) {
        lockDoorBtn.onclick = () => {
            if (activeDoorCoords && socket) {
                socket.emit('setDoorLock', { 
                    gx: activeDoorCoords.gx, 
                    gy: activeDoorCoords.gy, 
                    locked: true 
                });
            }
        };
    }

    const unlockDoorBtn = document.getElementById('door-unlock-btn');
    if (unlockDoorBtn) {
        unlockDoorBtn.onclick = () => {
            if (activeDoorCoords && socket) {
                socket.emit('setDoorLock', { 
                    gx: activeDoorCoords.gx, 
                    gy: activeDoorCoords.gy, 
                    locked: false 
                });
            }
        };
    }

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

    // ==========================================
    // 🛠️ SMELTER & ANVIL LISTENERS
    // ==========================================
    if (socket) {
        socket.on('smelterData', (data) => { 
            activeSmelterId = data.jobId; 
            activeSmelterData = data.data; 
            document.getElementById('smelter-menu').classList.remove('hidden');
            renderSmelterUI(); 
        });
        
        socket.on('smelterUpdated', (data) => { 
            if (activeSmelterId === data.jobId) { 
                activeSmelterData = data.data; 
                renderSmelterUI(); 
            } 
        });
        
        socket.on('receiveSmelterLoot', () => { 
            import('./interactionManager.js').then(m => {
                if (m.giveItemToHero(createItem(ITEM_TYPES.IRON_INGOT))) {
                    alert("🔥 Collected 1x Iron Ingot!");
                    renderTabContent();
                                        syncInventoryWithServer(); // 👈 Syncs after the factory gives the item

                } else {
                    alert("Backpack full! Make space first.");
                }
            });
        });

        socket.on('anvilData', (data) => { 
            activeAnvilId = data.jobId; 
            activeAnvilData = data.data; 
            document.getElementById('anvil-menu').classList.remove('hidden');
            renderAnvilUI(); 
        });
        
        socket.on('anvilUpdated', (data) => { 
            if (activeAnvilId === data.jobId) { 
                activeAnvilData = data.data; 
                renderAnvilUI(); 
            } 
        });
        
        socket.on('receiveAnvilLoot', () => { 
            import('./interactionManager.js').then(m => {
                if (m.giveItemToHero(createItem(ITEM_TYPES.DAGGER))) {
                    alert("🗡️ Crafted a Rusty Dagger!");
                    renderTabContent();
                                        syncInventoryWithServer(); // 👈 Syncs after the factory gives the item

                } else {
                    alert("Backpack full! Make space first.");
                }
            });
        });
    }

    // --- SMELTER BUTTON CLICKS ---
    document.getElementById('close-smelter-btn').addEventListener('click', () => {
        document.getElementById('smelter-menu').classList.add('hidden');
        confirmingSmelterSpeedUp = false;
    });

    // --- SMELTER BUTTON CLICK ---
    document.getElementById('smelter-start-btn').addEventListener('click', () => {
        if (!activeSmelterData) return;
        
        if (activeSmelterData.ready) {
            if (socket) socket.emit('collectSmelter', { jobId: activeSmelterId });
        } else if (!activeSmelterData.active) {
            const oreIdx = hero.inventory.findIndex(item => item.seedType === 'iron_ore');
            if (oreIdx === -1) {
                alert("You need Iron Ore to start smelting!");
                return;
            }
            
            // 1. Tell the server to start the job (The server will securely deduct the item)
            if (socket) socket.emit('startSmelterJob', { jobId: activeSmelterId });
            
            // 2. We must manually remove it from the client's RAM so the UI updates instantly without waiting for a server sync
            hero.inventory.splice(oreIdx, 1);
            renderTabContent();
                                syncInventoryWithServer(); // 👈 Syncs after the factory gives the item

            
        } else {
            if (!confirmingSmelterSpeedUp) {
                confirmingSmelterSpeedUp = true;
                renderSmelterUI();
            } else {
                if (socket) socket.emit('speedUpSmelter', { jobId: activeSmelterId });
                confirmingSmelterSpeedUp = false;
            }
        }
    });

    // --- ANVIL BUTTON CLICKS ---
    document.getElementById('close-anvil-btn').addEventListener('click', () => {
        document.getElementById('anvil-menu').classList.add('hidden');
        confirmingAnvilSpeedUp = false;
    });

    // --- ANVIL BUTTON CLICK ---
    document.getElementById('anvil-start-btn').addEventListener('click', () => {
        if (!activeAnvilData) return;
        
        if (activeAnvilData.ready) {
            if (socket) socket.emit('collectAnvil', { jobId: activeAnvilId });
        } else if (!activeAnvilData.active) {
            const ingotIdx = hero.inventory.findIndex(item => item.seedType === 'iron_ingot');
            if (ingotIdx === -1) {
                alert("You need an Iron Ingot to start forging!");
                return;
            }
            
            // 1. Tell the server to start the job (The server will securely deduct the item)
            if (socket) socket.emit('startAnvilJob', { jobId: activeAnvilId });

            // 2. We must manually remove it from the client's RAM so the UI updates instantly without waiting for a server sync
            hero.inventory.splice(ingotIdx, 1);
            renderTabContent();
                                syncInventoryWithServer(); // 👈 Syncs after the factory gives the item

            
        } else {
            if (!confirmingAnvilSpeedUp) {
                confirmingAnvilSpeedUp = true;
                renderAnvilUI();
            } else {
                if (socket) socket.emit('speedUpAnvil', { jobId: activeAnvilId });
                confirmingAnvilSpeedUp = false;
            }
        }
    });

    // 👇 ADD THIS LINE TO ACTIVATE THE MINING BUTTONS!
    initMiningListeners();
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
            container.innerHTML = `
                <h3 style="margin-top:0; text-align:center;">WORLD MAP</h3>
                <p style="font-size: 8px; text-align:center; margin-top:15px; color:#555;">(Find a Map Table in town for detailed navigation.)</p>
            `;
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

// Locate renderChestUI inside src/uiManager.js and modify both innerHTML maps:
export function renderChestUI() {
    if (!activeChestId) return;

    const heroInv = document.getElementById('chest-hero-inv');
    const chestInv = document.getElementById('chest-box-inv');

    // 🎯 THE FIX: Appended item count output
    heroInv.innerHTML = hero.inventory.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="hero">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
            ${item.count > 1 ? `<br><span style="color:var(--banana-dark); font-size:8px;">(x${item.count})</span>` : ''}
        </div>
    `).join('');

    // 🎯 THE FIX: Appended item count output
    chestInv.innerHTML = activeChestItems.map((item, i) => `
        <div class="inv-item draggable-item" draggable="true" data-index="${i}" data-source="chest">
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
            ${item.count > 1 ? `<br><span style="color:var(--banana-dark); font-size:8px;">(x${item.count})</span>` : ''}
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

// Inside src/uiManager.js:

function transferItem(index, source) {
    if (source === 'hero') {
        // 🎯 THE SECURE FIX: Send secure chest-transfer requests
        if (socket) socket.emit('requestChestTransfer', { chestId: activeChestId, index: index, direction: 'to_chest' });
    } else {
        if (socket) socket.emit('requestChestTransfer', { chestId: activeChestId, index: index, direction: 'to_hero' });
    }
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
    "plant_matter": "Plant Matter", // 🎯 FIXED
    "grass_seed": "Grass Seed", // 👈 NEW
    "rose_seed": "Rose Seed",           // 👈 NEW
    "violet_seed": "Violet Seed",       // 👈 NEW
    "sunflower_seed": "Sunflower Seed", // 👈 NEW

    "egg": "Farm Egg", // 🎯 THE FIX: Added Egg to store dictionary

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
        syncInventoryWithServer(); // 👈 Sync changes to server

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
        
        // 🎯 THE FIX: Force the server to sync the deducted inventory immediately!
        syncInventoryWithServer(); 
        
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

// Inside renderTempleUI() in src/uiManager.js:

// Replace your renderTempleUI function in src/uiManager.js with this:

export function renderTempleUI() {
    const heroInv = document.getElementById('temple-hero-inv');
    const altarSlot = document.getElementById('temple-slot');

    // Draw backpack items inside the Temple Altar window
    heroInv.innerHTML = hero.inventory.map((item, i) => `
        <div class="inv-item click-sacrifice-item" data-index="${i}" data-source="hero"> <!-- 👈 🎯 THE FIX: Added data-source="hero" -->
            <div class="item-icon" style="font-size: 24px;">${getItemIcon(item)}</div>
            <strong>${item.name}</strong>
            ${item.count > 1 ? `<span style="color:var(--banana-dark); font-size:8px;">(x${item.count})</span>` : ''}
        </div>
    `).join('');

    // Clear the redundant drag slot
    altarSlot.innerHTML = `<div style="color: var(--banana-dark); font-size: 10px; text-align: center; padding: 20px;">CLICK BACKPACK<br>SEED TO<br>SACRIFICE</div>`;

    // Click to Sacrifice directly (highly secure and foolproof)
    const items = document.querySelectorAll('#temple-menu .click-sacrifice-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            const inventoryItem = hero.inventory[index];
            
            // Check if it's a seed
            if (!inventoryItem.seedType.includes("_seed")) {
                alert("The Gods reject this offering! They only accept Seeds.");
                return;
            }

            if (confirm(`Do you want to sacrifice ${inventoryItem.count}x ${inventoryItem.name} for UNI?`)) {
                if (socket) {
                    socket.emit('sacrificeItem', { index: index });
                }
            }
        });
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
        
        // 🛑 STRICT CHECK: Only accepts items with "_seed" in their type
        const isSeed = item.seedType.includes("_seed");
        if (!isSeed) {
            alert("The Gods reject this offering! They only accept Seeds.");
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
        syncInventoryWithServer(); // 👈 Sync changes to server

}

// Add these variables, event registration, and functions to src/uiManager.js:

export let activeHayTableId = null;
export let activeHayTableData = null;
let confirmingHayTableSpeedUp = false;

// Register listeners once multiplayer is ready
import('./multiplayer.js').then(m => {
    const checkSocket = setInterval(() => {
        if (m.socket) {
            clearInterval(checkSocket);
            m.socket.on('hayTableData', (data) => {
                activeHayTableId = data.jobId;
                activeHayTableData = data.data;
                renderHayTableUI();
            });
            m.socket.on('hayTableUpdated', (data) => {
                if (activeHayTableId === data.jobId) {
                    activeHayTableData = data.data;
                    renderHayTableUI();
                }
            });
            m.socket.on('receiveHayTableLoot', () => {
                import('./items.js').then(items => {
                    import('./interactionManager.js').then(im => {
                        const hay = items.createItem(items.ITEM_TYPES.HAY);
                        if (im.giveItemToHero(hay)) {
                            alert("🌾 Collected 1x Dried Hay!");
                            renderTabContent();
                            syncInventoryWithServer();
                        } else {
                            alert("Backpack full! Make space first.");
                        }
                    });
                });
            });
        }
    }, 100);
});

export function openHayTableMenu(jobId) {
    activeHayTableId = jobId;
    confirmingHayTableSpeedUp = false;
    document.getElementById('hay-table-menu').classList.remove('hidden');
    if (socket) socket.emit('requestHayTable', jobId);
}

function renderHayTableUI() {
    if (!activeHayTableData) return;
    const bar = document.getElementById('hay-table-progress-bar');
    const text = document.getElementById('hay-table-progress-text');
    const costText = document.getElementById('hay-table-cost-text');
    const btn = document.getElementById('hay-table-start-btn');

    const pct = ((activeHayTableData.maxWork - activeHayTableData.workLeft) / activeHayTableData.maxWork) * 100;
    bar.style.width = `${pct}%`;
    text.innerText = `${activeHayTableData.workLeft} / ${activeHayTableData.maxWork}`;

    if (activeHayTableData.ready) {
        btn.innerText = "COLLECT NOW!";
        btn.className = "pixel-btn safe";
        text.innerText = "JOB COMPLETE";
        costText.innerText = "";
        confirmingHayTableSpeedUp = false;
    } else if (activeHayTableData.active) {
        if (confirmingHayTableSpeedUp) {
            btn.innerText = "SPEED - UP NOW!";
            btn.className = "pixel-btn safe";
            costText.innerText = "COST: 0.0407 UNI";
        } else {
            btn.innerText = "SPEED - UP";
            btn.className = "pixel-btn";
            costText.innerText = "";
        }
    } else {
        btn.innerText = "START (8x Plant Matter)";
        btn.className = "pixel-btn";
        costText.innerText = "";
        confirmingHayTableSpeedUp = false;
    }
}

// Register click handlers inside the existing UI checkElements loop in src/uiManager.js:
if (typeof window !== 'undefined') {
    const checkTableElements = setInterval(() => {
        const startTableBtn = document.getElementById('hay-table-start-btn');
        if (startTableBtn) {
            clearInterval(checkTableElements);

            document.getElementById('close-hay-table-btn').addEventListener('click', () => {
                document.getElementById('hay-table-menu').classList.add('hidden');
                confirmingHayTableSpeedUp = false;
            });

            startTableBtn.addEventListener('click', () => {
                if (!activeHayTableData) return;

                if (activeHayTableData.ready) {
                    if (socket) socket.emit('collectHayTable', { jobId: activeHayTableId });
                } else if (!activeHayTableData.active) {
                    // Client-side ingredient validation
                    const pmIdx = hero.inventory.findIndex(item => item.seedType === 'plant_matter');
                    if (pmIdx === -1 || hero.inventory[pmIdx].count < 8) {
                        alert("You need 8x Plant Matter to make hay!");
                        return;
                    }

                    if (socket) socket.emit('startHayTableJob', { jobId: activeHayTableId });
                } else {
                    if (!confirmingHayTableSpeedUp) {
                        confirmingHayTableSpeedUp = true;
                        renderHayTableUI();
                    } else {
                        if (socket) socket.emit('speedUpHayTable', { jobId: activeHayTableId });
                        confirmingHayTableSpeedUp = false;
                    }
                }
            });
        }
    }, 100);
}

// ==========================================
// 🍳 KITCHEN UI LOGIC

// Add these variables, event registration, and functions to src/uiManager.js:

export let activeKitchenId = null;
export let activeKitchenData = null;
let confirmingKitchenSpeedUp = false;

// Register the listeners once multiplayer is ready
import('./multiplayer.js').then(m => {
    const checkSocket = setInterval(() => {
        if (m.socket) {
            clearInterval(checkSocket);
            m.socket.on('kitchenData', (data) => {
                activeKitchenId = data.jobId;
                activeKitchenData = data.data;
                renderKitchenUI();
            });
            m.socket.on('kitchenUpdated', (data) => {
                if (activeKitchenId === data.jobId) {
                    activeKitchenData = data.data;
                    renderKitchenUI();
                }
            });
            m.socket.on('receiveKitchenLoot', (data) => {
                const { recipe } = data;
                import('./items.js').then(items => {
                    import('./interactionManager.js').then(im => {
                        let newItem = null;
                        
                        if (recipe === 'COOK_FISH') {
                            newItem = items.createItem(items.ITEM_TYPES.COOKED_BASS);
                        } else if (recipe.startsWith('EXTRACT_')) {
                            // Extract crop type name (e.g. 'EXTRACT_TOMATO_ITEM' -> 'tomato')
                            const cropType = recipe.replace('EXTRACT_', '').replace('_ITEM', '').toLowerCase();
                            const seedConstName = `${cropType.toUpperCase()}_SEED`;
                            
                            if (items.ITEM_TYPES[seedConstName]) {
                                newItem = items.createItem(items.ITEM_TYPES[seedConstName]);
                                // 🎯 THE FIX: Dynamically generate 5 to 8 seeds!
                                const seedCount = Math.floor(Math.random() * 4) + 5; 
                                newItem.count = seedCount;
                            }
                        }

                        if (newItem && im.giveItemToHero(newItem)) {
                            alert(`Success! Collected: ${newItem.name} (x${newItem.count || 1})`);
                            renderTabContent();
                            syncInventoryWithServer();
                        } else {
                            alert("Backpack full! Make space first.");
                        }
                    });
                });
            });
        }
    }, 100);
});

export function openKitchenMenu(kitchenId) {
    activeKitchenId = kitchenId;
    confirmingKitchenSpeedUp = false;
    document.getElementById('kitchen-menu').classList.remove('hidden');
    if (socket) socket.emit('requestKitchen', kitchenId);
}

function renderKitchenUI() {
    if (!activeKitchenData) return;
    const bar = document.getElementById('kitchen-progress-bar');
    const text = document.getElementById('kitchen-progress-text');
    const costText = document.getElementById('kitchen-cost-text');
    const btn = document.getElementById('kitchen-start-btn');
    const selectContainer = document.getElementById('kitchen-recipe-select-container');

    const pct = ((activeKitchenData.maxWork - activeKitchenData.workLeft) / activeKitchenData.maxWork) * 100;
    bar.style.width = `${pct}%`;
    text.innerText = `${activeKitchenData.workLeft} / ${activeKitchenData.maxWork}`;

    if (activeKitchenData.ready) {
        selectContainer.style.display = 'none';
        btn.innerText = "COLLECT NOW!";
        btn.className = "pixel-btn safe";
        text.innerText = "JOB COMPLETE";
        costText.innerText = "";
        confirmingKitchenSpeedUp = false;
    } else if (activeKitchenData.active) {
        selectContainer.style.display = 'none';
        const cost = activeKitchenData.recipe === 'COOK_FISH' ? 0.0169 : 0.0068;
        
        if (confirmingKitchenSpeedUp) {
            btn.innerText = "SPEED - UP NOW!";
            btn.className = "pixel-btn safe";
            costText.innerText = `COST: ${cost} UNI`;
        } else {
            btn.innerText = "SPEED - UP";
            btn.className = "pixel-btn";
            costText.innerText = "";
        }
    } else {
        selectContainer.style.display = 'block';
        btn.innerText = "START RECIPE";
        btn.className = "pixel-btn";
        costText.innerText = "";
        confirmingKitchenSpeedUp = false;
    }
}

// Register clicking handlers inside initUI() or at the bottom of uiManager.js:
if (typeof window !== 'undefined') {
    const checkElements = setInterval(() => {
        const startBtn = document.getElementById('kitchen-start-btn');
        if (startBtn) {
            clearInterval(checkElements);

            document.getElementById('close-kitchen-btn').addEventListener('click', () => {
                document.getElementById('kitchen-menu').classList.add('hidden');
                confirmingKitchenSpeedUp = false;
            });

            startBtn.addEventListener('click', () => {
                if (!activeKitchenData) return;

                if (activeKitchenData.ready) {
                    if (socket) socket.emit('collectKitchen', { jobId: activeKitchenId });
                } else if (!activeKitchenData.active) {
                    const selectedRecipe = document.getElementById('kitchen-recipe-select').value;
                    
                    // Client-side ingredient validation
                    if (selectedRecipe === 'COOK_FISH') {
                        const fishIdx = hero.inventory.findIndex(item => item.seedType === 'fish');
                        if (fishIdx === -1) { alert("You need a raw River Bass to cook!"); return; }
                    } else if (selectedRecipe.startsWith('EXTRACT_')) {
                        const cropType = selectedRecipe.replace('EXTRACT_', '').toLowerCase();
                        const cropIdx = hero.inventory.findIndex(item => item.seedType === cropType);
                        if (cropIdx === -1) { alert(`You need 1x ${cropType.replace('_item', '')} to extract seeds!`); return; }
                    }

                    if (socket) socket.emit('startKitchenJob', { jobId: activeKitchenId, recipe: selectedRecipe });
                } else {
                    if (!confirmingKitchenSpeedUp) {
                        confirmingKitchenSpeedUp = true;
                        renderKitchenUI();
                    } else {
                        if (socket) socket.emit('speedUpKitchen', { jobId: activeKitchenId });
                        confirmingKitchenSpeedUp = false;
                    }
                }
            });
        }
    }, 100);
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

export function renderCellarUI() {
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

// Inside src/uiManager.js:

function transferCellarItem(index, source) {
    if (source === 'hero-cellar') {
        const item = hero.inventory[index];
        if (!VALID_FOOD_TYPES.includes(item.seedType)) {
            alert("The Root Cellar is for food only!");
            return;
        }
        // 🎯 THE SECURE FIX: Send cellar-transfer requests
        if (socket) socket.emit('requestCellarTransfer', { cellarId: activeCellarId, index: index, direction: 'to_cellar' });
    } else {
        if (socket) socket.emit('requestCellarTransfer', { cellarId: activeCellarId, index: index, direction: 'to_hero' });
    }
}

// ==========================================
// 🌾 HAY UI LOGIC
// ==========================================

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

export function renderHayStorageUI() {
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

// Inside src/uiManager.js:

function transferHayStorageItem(index, source) {
    if (source === 'hero-hay') {
        const item = hero.inventory[index];
        if (!VALID_HAY_TYPES.includes(item.seedType)) {
            alert("Only Dried Hay or Plant Matter can be stored here!");
            return;
        }
        // Send transfer request to server
        if (socket) socket.emit('requestHayTransfer', { hayStorageId: activeHayStorageId, index: index, direction: 'to_storage' });
    } else {
        if (socket) socket.emit('requestHayTransfer', { hayStorageId: activeHayStorageId, index: index, direction: 'to_hero' });
    }
}

// ==========================================
// 🔥 SMELTER UI LOGIC
// ==========================================


// ==========================================
// ⛏️ MINING UI LOGIC
// ==========================================
export let activeOreId = null;
export let activeOreData = null;
let confirmingSpeedUp = false;

export function openMiningMenu(oreId, data) {
    activeOreId = oreId;
    activeOreData = data;
    confirmingSpeedUp = false; // Reset the state
    document.getElementById('mining-menu').classList.remove('hidden');
    renderMiningUI();
}

export function handleRemoteOreUpdate(oreId, data) {
    if (activeOreId === oreId) {
        activeOreData = data;
        renderMiningUI();
    }
}

function renderMiningUI() {
    if (!activeOreData) return;
    
    const bar = document.getElementById('mining-progress-bar');
    const text = document.getElementById('mining-progress-text');
    const costText = document.getElementById('mining-cost-text'); // 👈 Grab the new element
    const actionBtn = document.getElementById('mining-action-btn');

    // Always keep the fraction visible in the bar now!
    const pct = ((activeOreData.maxWork - activeOreData.workLeft) / activeOreData.maxWork) * 100;
    bar.style.width = `${pct}%`;
    text.innerText = `${activeOreData.workLeft} / ${activeOreData.maxWork}`;

    if (activeOreData.claimed) {
        actionBtn.innerText = "DEPLETED";
        actionBtn.className = "pixel-btn";
        actionBtn.disabled = true;
        text.innerText = "0 / 3600";
        costText.innerText = "";
    } else if (activeOreData.workLeft <= 0) {
        actionBtn.innerText = "COLLECT NOW!";
        actionBtn.className = "pixel-btn safe";
        actionBtn.disabled = false;
        text.innerText = "JOB COMPLETE";
        costText.innerText = "";
        confirmingSpeedUp = false;
    } else {
        actionBtn.disabled = false;
        
        // The dynamic Speed Up flip logic!
        if (confirmingSpeedUp) {
            actionBtn.innerText = "SPEED - UP NOW!";
            actionBtn.className = "pixel-btn safe";
            costText.innerText = "COST: 50 UNI"; // 👈 Put the cost underneath the bar
        } else {
            actionBtn.innerText = "SPEED - UP";
            actionBtn.className = "pixel-btn";
            costText.innerText = ""; // 👈 Clear it when not confirming
        }
    }
}

export function initMiningListeners() {
    document.getElementById('close-mining-btn').addEventListener('click', () => {
        document.getElementById('mining-menu').classList.add('hidden');
        activeOreId = null;
        confirmingSpeedUp = false;
    });

    document.getElementById('mining-action-btn').addEventListener('click', () => {
        if (activeOreData.claimed) return;

        if (activeOreData.workLeft <= 0) {
            if (socket) socket.emit('collectOre', { oreId: activeOreId });
        } else {
            if (!confirmingSpeedUp) {
                confirmingSpeedUp = true;
                renderMiningUI(); // Flip to confirm screen
            } else {
                if (socket) socket.emit('speedUpOre', { oreId: activeOreId });
                confirmingSpeedUp = false; 
                renderMiningUI(); // Re-render to catch server sync
            }
        }
    });
}

// ==========================================
// 🏦 WITHDRAWAL UI LOGIC
// ==========================================
export function openWithdrawMenu() {
    if (!playerWallet) { alert("Connect your wallet first!"); return; }
    document.getElementById('withdraw-balance-max').innerText = hero.inGameUni.toFixed(8); // 👈 4 decimals
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
// 🔄 HUD UPDATES
// ==========================================
export function updateHUD() {
    const uniDisplay = document.getElementById('uni-display');
    const playerCount = document.getElementById('player-count');
    const fishDisplay = document.getElementById('fish-display');
    const tgvDisplay = document.getElementById('tgv-display');

    if (uniDisplay) {
        uniDisplay.innerText = `${(hero.inGameUni || 0).toFixed(8)} UNI`;
    }

    if (playerCount) {
        let onlineCount = 1;
        import('./multiplayer.js').then(m => {
            m.remotePlayers.forEach(p => {
                if (!p.isOffline) onlineCount++;
            });
            playerCount.innerText = `PLAYERS: ${onlineCount}`;
        });
    }

    if (fishDisplay) {
        fishDisplay.innerText = `FISH: ${Math.floor(globalFishCount)}`;
        fishDisplay.style.color = globalFishCount < 2000 ? "#FF4444" : "#00FFFF";
    }

    // Inside updateHUD() in src/uiManager.js
    if (tgvDisplay) {
        // 👈 THE TWEAK: Added " UNI" to the string template
        tgvDisplay.innerText = `TGV: ${(gameState.tvl || 0).toFixed(8)} UNI`;
    }
}


// At the bottom of src/uiManager.js

// src/uiManager.js

// Replace these two functions inside src/uiManager.js:

window.equipItem = (invIndex) => {
    if (socket) {
        // 🎯 THE FIX: Pass active energy in the payload
        socket.emit('requestEquip', { index: invIndex, currentEnergy: hero.energy });
    }
};

window.unequipMainHand = () => {
    if (socket) {
        // 🎯 THE FIX: Pass active energy in the payload
        socket.emit('requestUnequip', { currentEnergy: hero.energy });
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

// Inside src/uiManager.js:

function dropItemToWorld(index, amount) {
    const originTX = Math.floor((hero.x + 8) / 16);
    const originTY = Math.floor((hero.y + 15) / 16); // Feet

    // 🎯 THE SECURE FIX: Ask the server to drop the item coordinate securely
    if (socket) {
        socket.emit('requestDrop', { index: index, amount: amount, tx: originTX, ty: originTY });
    }
}


// ==========================================
// 📱 UNIFIED TOUCH DRAG & TOOLTIP ENGINE
// ==========================================
const tooltip = document.getElementById('item-tooltip');
let touchTimer = null;
let dragClone = null;
let dragData = null;

// Locate showTooltip() inside src/uiManager.js and modify the stat check:
function showTooltip(itemEl, x, y) {
    const item = getItemFromDOM(itemEl.dataset.source, parseInt(itemEl.dataset.index));
    if (item) {
        document.getElementById('tt-name').innerText = item.name;
        document.getElementById('tt-type').innerText = item.typeLabel || "Item";
        
        const statsEl = document.getElementById('tt-stats');
        if (item.energy) statsEl.innerText = `Nutrition: +${item.energy} Energy`;
        else if (item.ad) statsEl.innerText = `Damage: +${item.ad} ATK`;
        // 🎯 THE FIX: Output remaining bites for Hay bundles in the inventory
        else if (item.isFodder) {
            statsEl.innerText = `Bites Left: ${Math.ceil(item.health / 10)} / 10`;
        }
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
    // 🎯 THE FOOLPROOF FIX: Instantly exit if source is missing to prevent crashes
    if (!source) return null; 

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
// 📖 ACTIVITY LEDGER RENDERER
// ==========================================
function renderActivityLog(logData) {
    const list = document.getElementById('activity-list');
    document.getElementById('activity-menu').classList.remove('hidden');

    if (!logData || logData.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #888; margin-top: 100px;">No activity in the last 24 hours.</div>`;
        return;
    }

    list.innerHTML = logData.map(entry => {
        // Calculate "Time Ago"
        const mins = Math.floor((Date.now() - entry.timestamp) / 60000);
        let timeStr = mins < 1 ? "Just now" : (mins < 60 ? `${mins}m ago` : `${Math.floor(mins/60)}h ago`);
        
        // Format the Wallet string (Shorten it if it's a long hex address)
        let shortWallet = entry.wallet;
        if (shortWallet.startsWith('0x') && shortWallet.length > 10) {
            shortWallet = shortWallet.substring(0, 6) + "..." + shortWallet.substring(shortWallet.length - 4);
        }

        // Color coding based on action type
        const color = entry.type === 'SACRIFICE' ? '#00FFFF' : '#FFD700';

        return `
            <div style="border-bottom: 2px dashed #444; padding-bottom: 6px;">
                <span style="color: #aaa;">[${timeStr}]</span> 
                <strong style="color: ${color};">${shortWallet}</strong>: 
                ${entry.description}
            </div>
        `;
    }).join('');
}


// ==========================================
// 🗺️ LOCATION BANNER ENGINE
// ==========================================
const prefixes = ["Oak", "Pine", "River", "Stone", "Iron", "Gold", "Silver", "Wind", "Storm", "High", "Low", "Dark", "Light", "Ash", "Thorn", "Green", "Red", "Blue", "Gryph", "Dragon", "Dawn", "Dusk"];
const suffixes = ["wood", "ford", "bridge", "mont", "ville", "town", "bury", "ton", "vale", "dale", "peak", "haven", "keep", "watch", "fall", "stead", "moor", "marsh", "gate", "run", "brook"];

function getZoneName(seed1, seed2) {
    // A simple, deterministic math hash based on coordinates/IDs
    const hash = Math.sin(seed1 * 12.9898 + seed2 * 78.233) * 43758.5453;
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
    const chunkIdx = cy * CONFIG.MAP_SIZE + cx;

    if (cellType === 101) {
        zoneName = getZoneName(cx, cy);
        zoneDesc = "PEACEFUL VILLAGE";
    } else if (cellType === 102) {
        zoneName = getZoneName(cx, cy);
        zoneDesc = "FORTIFIED TOWN";
    } else if (cellType === 103) {
        zoneName = getZoneName(cx, cy) + " Castle";
        zoneDesc = "ROYAL STRONGHOLD";
    } else if (cellType === 107) { // 👈 NEW: Mining Camp Banner
        zoneName = getZoneName(cx, cy) + " Camp";
        zoneDesc = "MINING EXPEDITION";
    } else if (cellType < 55 || cellType === 10 || cellType === 11 || cellType === 12) {
        // --- WATER GEOGRAPHY ---
        let isLake = false;
        let lakeId = -1;
        
        // Scan the geography arrays to see if this chunk belongs to a lake
        if (window.geography && window.geography.lakes) {
            for (let i = 0; i < window.geography.lakes.length; i++) {
                if (window.geography.lakes[i].includes(chunkIdx)) {
                    isLake = true; lakeId = i; break;
                }
            }
        }

        if (isLake) {
            zoneName = getZoneName(lakeId * 10, lakeId * 20) + " Lake";
            zoneDesc = "FRESH WATER";
        } else if (cellType === 12) {
            zoneName = getZoneName(cx, cy) + " River";
            zoneDesc = "FLOWING WATER";
        } else {
            zoneName = getZoneName(999, 999) + " Ocean"; // Constant seed for the main ocean
            zoneDesc = "OPEN WATER";
        }
    } else {
        // --- LAND GEOGRAPHY (Continents) ---
        let contId = -1;
        if (window.geography && window.geography.continents) {
            for (let i = 0; i < window.geography.continents.length; i++) {
                if (window.geography.continents[i].includes(chunkIdx)) {
                    contId = i; break;
                }
            }
        }

        // Continent 0 is always the largest landmass (sorted in mapGenerator)
        let landName = getZoneName(contId * 5, contId * 15);
        zoneName = landName + (contId === 0 ? " Continent" : " Isle");
        
        if (cellType === 104) zoneDesc = "FOREST BIOME";
        else if (cellType === 105) zoneDesc = "DESERT BIOME";
        else if (cellType === 106) zoneDesc = "MOUNTAIN BIOME";
        else zoneDesc = "THE WILDS";
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

// Add these functions to the bottom of src/uiManager.js:

let selectedHobbitId = null;

export function openHobbitManagerMenu() {
    selectedHobbitId = null; // Clear selection
    document.getElementById('hobbit-manager-menu').classList.remove('hidden');
    renderHobbitManagerUI();

    document.getElementById('close-hobbit-manager-btn').onclick = () => {
        document.getElementById('hobbit-manager-menu').classList.add('hidden');
    };
}

function renderHobbitManagerUI() {
    const listEl = document.getElementById('hobbit-list');
    const detailsEl = document.getElementById('selected-hobbit-details');
    const buttonContainer = document.getElementById('job-button-container');
    
    // Statically import the local hobbit array
    import('./hobbits.js').then(m => {
        const activeHobbits = m.hobbits;

        if (activeHobbits.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; font-size:8px; color:#555; margin-top:80px;">NO ACTIVE WORKERS IN RANGE</div>`;
            detailsEl.innerText = "Workforce empty.";
            buttonContainer.innerHTML = "";
            return;
        }

        // Render roster list
        listEl.innerHTML = activeHobbits.map(hob => {
            const isSelected = (hob.id === selectedHobbitId);
            const style = isSelected ? 'background: var(--highlight); color: white; border: 4px solid var(--bg-dark);' : 'background: white; border: 4px solid var(--bg-dark);';
            return `
                <div class="workforce-row" onclick="window.selectHobbit('${hob.id}')" style="${style} padding: 8px; font-size: 8px; cursor: pointer; display: flex; justify-content: space-between;">
                    <strong>${hob.name}</strong>
                    <span style="color: ${hob.job === 'Idle' ? '#888' : 'var(--banana-dark)'};">${hob.job.toUpperCase()}</span>
                </div>
            `;
        }).join('');

        // Render Details & Role selectors
        const selected = activeHobbits.find(h => h.id === selectedHobbitId);
        if (selected) {
            detailsEl.innerHTML = `
                <strong style="font-size: 10px; color: var(--text-dark);">${selected.name}</strong><br>
                <span style="font-size:8px; color: #555;">CURRENT ROLE: <strong style="color:var(--highlight);">${selected.job.toUpperCase()}</strong></span>
            `;

            buttonContainer.innerHTML = `
                <button onclick="window.assignHobbitJob('Forager')" class="pixel-btn ${selected.job === 'Forager' ? 'safe' : ''}" style="padding: 8px; font-size: 8px;">FORAGER</button>
                <button onclick="window.assignHobbitJob('Farmer')" class="pixel-btn ${selected.job === 'Farmer' ? 'safe' : ''}" style="padding: 8px; font-size: 8px;">FARMER</button>
                <button onclick="window.assignHobbitJob('Trader')" class="pixel-btn ${selected.job === 'Trader' ? 'safe' : ''}" style="padding: 8px; font-size: 8px;">TRADER</button>
                <button onclick="window.assignHobbitJob('Idle')" class="pixel-btn ${selected.job === 'Idle' ? 'safe' : ''}" style="padding: 8px; font-size: 8px;">IDLE</button>
            `;
        } else {
            detailsEl.innerText = "Select a hobbit to modify their duties.";
            buttonContainer.innerHTML = "";
        }
    });
}

// Attach functions globally to handle UI onclick actions
window.selectHobbit = (id) => {
    selectedHobbitId = id;
    renderHobbitManagerUI();
};

window.assignHobbitJob = (jobName) => {
    if (!selectedHobbitId) return;
    import('./hobbits.js').then(m => {
        const target = m.hobbits.find(h => h.id === selectedHobbitId);
        if (target) {
            target.job = jobName;
            target.path = []; // Cancel current path to evaluate new job immediately
            target.state = 'idle';
            renderHobbitManagerUI();
        }
    });
};

export function openDoorControlMenu(gx, gy, roomID) {
    activeDoorCoords = { gx, gy, roomID };
    document.getElementById('door-menu-title').innerText = `🚪 ROOM #${roomID}`;
    document.getElementById('door-menu').classList.remove('hidden');
    
    // Request current state from the server
    if (socket) socket.emit('requestDoorState', { gx, gy });
}

export function updateDoorControlUI(gx, gy, locked) {
    if (activeDoorCoords && activeDoorCoords.gx === gx && activeDoorCoords.gy === gy) {
        const label = document.getElementById('door-status-label');
        if (label) {
            label.innerText = locked ? "LOCKED" : "UNLOCKED";
            label.style.color = locked ? "#d95757" : "var(--highlight)";
        }
    }
}