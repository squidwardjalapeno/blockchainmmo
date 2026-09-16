// src/secrets.js

export const SECRET_TYPES = {
    MURDER: 'CRIME_MURDER',
    THEFT: 'CRIME_THEFT',
    ATTACK: 'CRIME_ATTACK',
    MARKET_DEMAND: 'MARKET_DEMAND',
    OFFICER_INTEL: 'OFFICER_INTEL',
    HOME_MEMORY: 'HOME_MEMORY' // 🎯 Private non-shareable secret
};

/**
 * Creates a structured secret or memory object.
 * @param {string} type - From SECRET_TYPES
 * @param {string} targetId - ID of related entity, house, or village
 * @param {{x: number, y: number}} location - Tile coordinates
 * @param {object} details - Metadata payload (home coordinates, layout, etc.)
 * @param {boolean} isPrivate - If true, this secret will never be shared during social gossip
 */
export function createSecret(type, targetId, location, details = {}, isPrivate = false) {
    return {
        id: 'sec_' + Math.random().toString(36).substr(2, 9),
        type,
        targetId,
        location: { x: Math.floor(location.x), y: Math.floor(location.y) },
        details,
        isPrivate: isPrivate || (type === SECRET_TYPES.HOME_MEMORY),
        timestamp: Date.now(),
        // Private home memories never expire; social/crime secrets decay after 5 minutes
        expiresAt: (isPrivate || type === SECRET_TYPES.HOME_MEMORY) ? Infinity : (Date.now() + (5 * 60 * 1000))
    };
}

/**
 * Adds a secret to the hobbit's memory bank if not already recorded.
 */
export function learnSecret(hobbit, secret) {
    if (!hobbit.secrets) hobbit.secrets = [];

    const now = Date.now();
    // Prune expired non-private secrets
    hobbit.secrets = hobbit.secrets.filter(s => s.expiresAt === Infinity || s.expiresAt > now);

    // 1. Private Home Memories are unique per house and never evicted
    if (secret.type === SECRET_TYPES.HOME_MEMORY) {
        hobbit.secrets = hobbit.secrets.filter(s => s.type !== SECRET_TYPES.HOME_MEMORY);
        hobbit.secrets.unshift(secret); // Kept safely at top of memory
        return true;
    }

    // 2. Officer Intel replaces previous updates for the same officer
    if (secret.type === SECRET_TYPES.OFFICER_INTEL) {
        hobbit.secrets = hobbit.secrets.filter(s => 
            !(s.type === SECRET_TYPES.OFFICER_INTEL && s.targetId === secret.targetId)
        );
        hobbit.secrets.push(secret);
        return true;
    }

    // 3. Prevent duplicate rumors in same proximity
    const exists = hobbit.secrets.some(s => 
        s.type === secret.type && 
        s.targetId === secret.targetId &&
        Math.hypot(s.location.x - secret.location.x, s.location.y - secret.location.y) < 5
    );

    if (!exists) {
        // Keep non-private rumors capped at 10 to conserve memory
        const nonPrivateSecrets = hobbit.secrets.filter(s => !s.isPrivate && s.type !== SECRET_TYPES.HOME_MEMORY);
        if (nonPrivateSecrets.length >= 10) {
            const firstEvictableIdx = hobbit.secrets.findIndex(s => !s.isPrivate && s.type !== SECRET_TYPES.HOME_MEMORY);
            if (firstEvictableIdx !== -1) hobbit.secrets.splice(firstEvictableIdx, 1);
        }

        hobbit.secrets.push(secret);
        hobbit.thoughtBubble = { icon: getSecretIcon(secret.type), timer: 2.0 };
        return true;
    }
    return false;
}

/**
 * Socialization & Emergency Threat Transmission
 * Strictly filters out any secrets flagged as `isPrivate` or `HOME_MEMORY`.
 */
// src/secrets.js (inside trySocialGossip)

export function trySocialGossip(hobbitA, hobbitB) {
    if (!hobbitA.secrets) hobbitA.secrets = [];
    if (!hobbitB.secrets) hobbitB.secrets = [];
    if (!hobbitA.officerIntelCooldowns) hobbitA.officerIntelCooldowns = new Map();
    if (!hobbitB.officerIntelCooldowns) hobbitB.officerIntelCooldowns = new Map();

    const dist = Math.hypot(hobbitA.x - hobbitB.x, hobbitA.y - hobbitB.y);
    if (dist > 48) return; // Must be within 3 tiles

    const now = Date.now();
    const INTEL_COOLDOWN_MS = 5 * 60 * 1000;

    // Helper to apply the +15% socialization boost
    const boostSocial = (h) => {
        h.socialization = Math.min(100, (h.socialization || 0) + 15);
    };

    // 1. Officer Intel Exchange
    const isBOfficer = (hobbitB.villageRole === 'GUARD' || hobbitB.villageRole === 'QUARTERMASTER');
    if (isBOfficer) {
        const lastKnownB = hobbitA.officerIntelCooldowns.get(hobbitB.id) || 0;
        if (now - lastKnownB >= INTEL_COOLDOWN_MS) {
            hobbitA.officerIntelCooldowns.set(hobbitB.id, now);
            const intel = createSecret(SECRET_TYPES.OFFICER_INTEL, hobbitB.id, { x: hobbitB.x / 16, y: hobbitB.y / 16 }, {
                name: hobbitB.name, role: hobbitB.villageRole, homeX: hobbitB.homeX, homeY: hobbitB.homeY, doorX: hobbitB.doorX, doorY: hobbitB.doorY, houseId: hobbitB.houseId
            });
            learnSecret(hobbitA, intel);
            hobbitA.thoughtBubble = { icon: '🛡️', timer: 1.5 };
            boostSocial(hobbitA);
            boostSocial(hobbitB);
        }
    }

    const isAOfficer = (hobbitA.villageRole === 'GUARD' || hobbitA.villageRole === 'QUARTERMASTER');
    if (isAOfficer) {
        const lastKnownA = hobbitB.officerIntelCooldowns.get(hobbitA.id) || 0;
        if (now - lastKnownA >= INTEL_COOLDOWN_MS) {
            hobbitB.officerIntelCooldowns.set(hobbitA.id, now);
            const intel = createSecret(SECRET_TYPES.OFFICER_INTEL, hobbitA.id, { x: hobbitA.x / 16, y: hobbitA.y / 16 }, {
                name: hobbitA.name, role: hobbitA.villageRole, homeX: hobbitA.homeX, homeY: hobbitA.homeY, doorX: hobbitA.doorX, doorY: hobbitA.doorY, houseId: hobbitA.houseId
            });
            learnSecret(hobbitB, intel);
            hobbitB.thoughtBubble = { icon: '🛡️', timer: 1.5 };
            boostSocial(hobbitA);
            boostSocial(hobbitB);
        }
    }

    // 🚨 2. Emergency Threat Transmission (Murder / Assault)
    const urgentTypes = [SECRET_TYPES.MURDER, SECRET_TYPES.ATTACK];
    let urgentExchanged = false;

    for (const sec of hobbitA.secrets) {
        if (!sec.isPrivate && sec.type !== SECRET_TYPES.HOME_MEMORY && urgentTypes.includes(sec.type) && learnSecret(hobbitB, sec)) {
            urgentExchanged = true;
            boostSocial(hobbitA);
            boostSocial(hobbitB);
            if (hobbitB.courage === 'FIGHT' && hobbitB.villageRole === 'CITIZEN') hobbitB.thoughtBubble = { icon: '⚔️', timer: 3.0 };
            else if (hobbitB.villageRole === 'GUARD' || hobbitB.villageRole === 'QUARTERMASTER') hobbitB.thoughtBubble = { icon: '🚨', timer: 3.0 };
            else { hobbitB.isFleeing = true; hobbitB.thoughtBubble = { icon: '😱', timer: 3.0 }; }
        }
    }
    for (const sec of hobbitB.secrets) {
        if (!sec.isPrivate && sec.type !== SECRET_TYPES.HOME_MEMORY && urgentTypes.includes(sec.type) && learnSecret(hobbitA, sec)) {
            urgentExchanged = true;
            boostSocial(hobbitA);
            boostSocial(hobbitB);
            if (hobbitA.courage === 'FIGHT' && hobbitA.villageRole === 'CITIZEN') hobbitA.thoughtBubble = { icon: '⚔️', timer: 3.0 };
            else if (hobbitA.villageRole === 'GUARD' || hobbitA.villageRole === 'QUARTERMASTER') hobbitA.thoughtBubble = { icon: '🚨', timer: 3.0 };
            else { hobbitA.isFleeing = true; hobbitA.thoughtBubble = { icon: '😱', timer: 3.0 }; }
        }
    }

    if (urgentExchanged) return;

    // 💬 3. General Peaceful Gossip (Throttled to 6 seconds)
    if (hobbitA.lastSocialTime && now - hobbitA.lastSocialTime < 6000) return;
    if (hobbitB.lastSocialTime && now - hobbitB.lastSocialTime < 6000) return;

    hobbitA.lastSocialTime = now;
    hobbitB.lastSocialTime = now;

    let exchanged = false;
    for (const sec of hobbitA.secrets) {
        if (!sec.isPrivate && sec.type !== SECRET_TYPES.HOME_MEMORY && sec.type !== SECRET_TYPES.OFFICER_INTEL && learnSecret(hobbitB, sec)) {
            exchanged = true;
        }
    }
    for (const sec of hobbitB.secrets) {
        if (!sec.isPrivate && sec.type !== SECRET_TYPES.HOME_MEMORY && sec.type !== SECRET_TYPES.OFFICER_INTEL && learnSecret(hobbitA, sec)) {
            exchanged = true;
        }
    }

    // Even if no new secrets, chatting on a walk boosts socialization!
    boostSocial(hobbitA);
    boostSocial(hobbitB);
    hobbitA.thoughtBubble = { icon: '💬', timer: 2.0 };
    hobbitB.thoughtBubble = { icon: '💬', timer: 2.0 };
}

export function getSecretIcon(type) {
    if (type === SECRET_TYPES.MURDER) return '💀';
    if (type === SECRET_TYPES.THEFT) return '💰';
    if (type === SECRET_TYPES.ATTACK) return '⚔️';
    if (type === SECRET_TYPES.MARKET_DEMAND) return '📈';
    if (type === SECRET_TYPES.OFFICER_INTEL) return '🛡️';
    if (type === SECRET_TYPES.HOME_MEMORY) return '🏡';
    return '💬';
}