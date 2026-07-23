// src/terminalManager.js
import { gameState, hero } from './entities.js';
import { plannedWells } from './cellDecorator.js';
import { hobbits } from './hobbitCore.js';
import { setRtsMode } from './rtsControls.js';

export const terminalState = {
    active: false,
    selectedCellX: 50,
    selectedCellY: 50
};

export function setTerminalMode(enabled) {
    terminalState.active = enabled;
    window.terminalActive = enabled;

    const overlay = document.getElementById('terminal-overlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !enabled);
    }

    if (enabled) {
        setRtsMode(false); 
        gameState.spectatedHobbitId = null; 
        hero.charClass = "Overseer"; 
        
        console.log("📟 Terminal Strategic Command Deck online.");
        renderASCIIElements();
        initTerminalCLI();
    }
}

export function generateASCIIMap() {
    let mapHTML = "";
    const size = 15; 
    const centerCX = Math.floor(terminalState.selectedCellX);
    const centerCY = Math.floor(terminalState.selectedCellY);

    const startCX = Math.max(0, centerCX - Math.floor(size / 2));
    const endCX = Math.min(99, startCX + size - 1);
    const startCY = Math.max(0, centerCY - Math.floor(size / 2));
    const endCY = Math.min(99, startCY + size - 1);

    for (let cy = startCY; cy <= endCY; cy++) {
        // Wrap each row in a block-level div to prevent horizontal stretching
        let row = `<div class="term-map-row" style="display: block; text-align: center; white-space: pre; margin-bottom: 2px;">`;
        for (let cx = startCX; cx <= endCX; cx++) {
            const idx = cy * 100 + cx;
            const cellType = window.worldMap ? window.worldMap[idx] : 0;
            
            let symbol = ".";
            let isSelected = (cx === terminalState.selectedCellX && cy === terminalState.selectedCellY);

            if (cellType === 101) symbol = "V"; 
            else if (cellType === 102) symbol = "T"; 
            else if (cellType === 103) symbol = "C"; 
            else if (cellType === 107) symbol = "M"; 

            const glyphColor = isSelected ? '#FFFFFF' : (symbol !== '.' ? '#FFD700' : '#00AA00');
            const bgStyle = isSelected ? 'background:#005500;' : '';

            row += `<span onclick="window.selectTerminalCell(${cx}, ${cy})" style="color: ${glyphColor}; ${bgStyle} cursor:pointer; font-weight:${symbol !== '.' ? 'bold' : 'normal'};">[${symbol}]</span> `;
        }
        row += `</div>`;
        mapHTML += row;
    }
    return mapHTML;
}

export function renderASCIIElements() {
    if (!terminalState.active) return;

    // 1. Render Map
    const mapGrid = document.getElementById('term-map-grid');
    if (mapGrid) {
        mapGrid.innerHTML = generateASCIIMap();
    }

    // 2. Render Sector Info
    const cx = terminalState.selectedCellX;
    const cy = terminalState.selectedCellY;
    const infoPanel = document.getElementById('term-sector-info');

    if (infoPanel) {
        const idx = cy * 100 + cx;
        const cellType = window.worldMap ? window.worldMap[idx] : 0;
        let typeStr = "WILDERNESS REGION";
        if (cellType === 101) typeStr = "CONTESTED VILLAGE";
        else if (cellType === 102) typeStr = "TRADING TOWN";
        else if (cellType === 103) typeStr = "CITADEL CASTLE";
        else if (cellType === 107) typeStr = "OUTLAW MINING CAMP";

        let ownerStr = "UNCLAIMED";
        let spawningStr = "ENABLED";
        
        const well = plannedWells.find(w => Math.floor(w.x / 100) === cx && Math.floor(w.y / 100) === cy);
        if (well) {
            spawningStr = well.spawningDisabled ? "DISABLED" : "ENABLED";
            if (window.villageOwners) {
                const data = window.villageOwners.get(`${well.x}_${well.y}`);
                if (data && data.owner) {
                    ownerStr = data.owner;
                }
            }
        }

        infoPanel.innerHTML = `
            <span style="color: #fff;">COORDINATES:</span> [${cx}, ${cy}]<br>
            <span style="color: #fff;">CLASSIFICATION:</span> ${typeStr}<br>
            <span style="color: #fff;">TERRITORY OWNER:</span> ${ownerStr}<br>
            <span style="color: #fff;">REGIONAL WELL:</span> ${well ? `[${well.x}, ${well.y}]` : 'NONE'}<br>
            <span style="color: #fff;">SPAWNING LAUNCHER:</span> ${spawningStr}<br>
            <br>
            <span style="color: #88FF88;">TELEMETRY LINK SECURED...</span>
        `;
        
        renderWorkforceLedger(well);
    }
}

function renderWorkforceLedger(well) {
    const ledger = document.getElementById('term-workforce-list');
    if (!ledger) return;

    if (!well) {
        ledger.innerHTML = `<div style="color: #555; text-align:center; padding-top:20px;">NO SATELLITE LINKS DETECTED FOR SECTOR</div>`;
        return;
    }

    const activeHobbits = hobbits.filter(h => {
        const hx = h.homeX || Math.floor(h.x / 16);
        const hy = h.homeY || Math.floor(h.y / 16);
        return Math.floor(hx / 100) === Math.floor(well.x / 100) && Math.floor(hy / 100) === Math.floor(well.y / 100);
    });

    if (activeHobbits.length === 0) {
        ledger.innerHTML = `<div style="color: #555; text-align:center; padding-top:20px;">WORKFORCE ZERO STATE</div>`;
        return;
    }

    ledger.innerHTML = activeHobbits.map(hob => `
        <div style="display:flex; justify-content:space-between; border-bottom:1px dashed rgba(0,255,0,0.25); padding-bottom:2px; font-size:10px;">
            <span style="color:#fff;">${hob.name.toUpperCase()}</span>
            <span>ROLE: <span style="color:#FFD700; font-weight:bold;">${hob.job.toUpperCase()}</span> | EN: ${Math.floor(hob.energy)}%</span>
        </div>
    `).join('');
}

window.selectTerminalCell = (cx, cy) => {
    terminalState.selectedCellX = cx;
    terminalState.selectedCellY = cy;
    renderASCIIElements();
};

export function initTerminalCLI() {
    const input = document.getElementById('term-cli-input');
    if (!input) return;

    // Remove any previously bound listeners
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const rawLine = newInput.value.trim();
            newInput.value = '';
            if (rawLine.length === 0) return;

            processCommand(rawLine);
        }
    });
}

function processCommand(rawLine) {
    const parts = rawLine.split(' ');
    const cmd = parts[0].toLowerCase();

    if (cmd === 'exit') {
        setTerminalMode(false);
        document.getElementById('main-menu').classList.remove('hidden');
        document.getElementById('hud').style.display = 'none';
    } 
    else if (cmd === 'help') {
        alert(`COMMAND LIST:\n- reassign <workerName> <job>\n- toggle <wellX> <wellY>\n- spectate <workerName>\n- exit`);
    } 
    else if (cmd === 'toggle') {
        const wx = parseInt(parts[1]);
        const wy = parseInt(parts[2]);
        
        const well = plannedWells.find(w => w.x === wx && w.y === wy);
        if (well) {
            well.spawningDisabled = !well.spawningDisabled;
            alert(`Well Spawning toggled. New State: ${well.spawningDisabled ? 'DISABLED' : 'ENABLED'}`);
            renderASCIIElements();
        } else {
            alert("Well coordinates not found in region database.");
        }
    }
    else if (cmd === 'reassign') {
        const targetName = parts[1]?.toLowerCase();
        const newJob = parts[2];
        const validJobs = ['Farmer', 'Forager', 'Trader', 'Military', 'Idle'];
        
        if (!targetName || !newJob) {
            alert("Format error. Usage: reassign <workerName> <job>");
            return;
        }
        if (!validJobs.includes(newJob)) {
            alert(`Invalid Job. Choose from: ${validJobs.join(', ')}`);
            return;
        }

        const targetHobbit = hobbits.find(h => h.name.toLowerCase().includes(targetName));
        if (targetHobbit) {
            targetHobbit.job = newJob;
            targetHobbit.path = [];
            targetHobbit.state = 'idle';
            alert(`Worker ${targetHobbit.name} reassigned to ${newJob.toUpperCase()}`);
            renderASCIIElements();
        } else {
            alert(`Worker with name segment "${targetName}" not resolved.`);
        }
    }
    else if (cmd === 'spectate') {
        const targetName = parts[1]?.toLowerCase();
        if (!targetName) {
            alert("Usage: spectate <workerName>");
            return;
        }

        const targetHobbit = hobbits.find(h => h.name.toLowerCase().includes(targetName));
        if (targetHobbit) {
            gameState.spectatedHobbitId = targetHobbit.id;
            setTerminalMode(false);
            document.getElementById('hud').style.display = 'block';
            alert(`Now spectating ${targetHobbit.name}. Mode swapped.`);
        } else {
            alert(`Worker with name "${targetName}" not resolved.`);
        }
    }
    else {
        alert(`Command "${cmd}" not recognized. Type "help" for list of strategic controls.`);
    }
}