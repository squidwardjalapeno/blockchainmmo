// src/animations.js

if (typeof window !== 'undefined') {
    logStep("animations.js loaded");
}

export function getHeroAnimationData(hero, images) {
    const srcW = 16; 
    const srcH = 16; 

    // 1. ROLLING
    if (hero.animState === 'rolling') {
        const imgKey = `heroVault${hero.dir}`;
        return { img: images[imgKey] || images.heroVaultSouth, srcX: hero.frame * srcW, srcY: 0, srcW, srcH };
    }

    // 2. LUNGING
    if (hero.attackTimer < 0) {
        const imgKey = `heroLunge${hero.dir}`;
        return { img: images[imgKey] || images.heroLungeSouth, srcX: 0, srcY: 0, srcW, srcH };
    }

    // 3. DEFAULT (Walking / Standing)
    // If stopped, hero.frame is 0. It stays on the standing frame of the walk cycle.
    const imgKey = `heroWalk${hero.dir}`;
    return { img: images[imgKey] || images.heroWalkSouth, srcX: hero.frame * srcW, srcY: 0, srcW, srcH };
}

export function getPetAnimationData(pet, images) {
    const srcW = 16; 
    const srcH = 16; 

    if (!pet.dir) pet.dir = 'South';

    const isMoving = (Math.abs(pet.dx) > 0.1 || Math.abs(pet.dy) > 0.1);

    // Only update direction if actually moving
    if (isMoving) {
        if (pet.dx > 0 && pet.dy < 0) pet.dir = 'NorthEast';
        else if (pet.dx < 0 && pet.dy < 0) pet.dir = 'NorthWest';
        else if (pet.dx > 0 && pet.dy > 0) pet.dir = 'SouthEast';
        else if (pet.dx < 0 && pet.dy > 0) pet.dir = 'SouthWest';
        else if (pet.dx > 0) pet.dir = 'East';
        else if (pet.dx < 0) pet.dir = 'West';
        else if (pet.dy < 0) pet.dir = 'North';
        else if (pet.dy > 0) pet.dir = 'South';
    }

    const imgKey = `zenithGuardianWalk${pet.dir}`;
    
    // Loop 4 frames if moving, otherwise lock to frame 0 (Standing)
    const frame = isMoving ? Math.floor(Date.now() / 150) % 4 : 0; 

    return { 
        img: images[imgKey] || images.zenithGuardianWalkSouth, 
        srcX: frame * srcW, 
        srcY: 0, 
        srcW, srcH 
    };
}

export function getAnimalAnimationData(animal, images) {
    const srcW = 16; 
    const srcH = 16; 

    // If moving, use the walk cycle. If idle, just lock to frame 0.
    const isMoving = animal.state === 'walking';
    
    // Switch between East and West sheets
    const imgKey = `chickenWalk${animal.dir}`;
    const img = images[imgKey] || images.chickenWalkEast;

    // Loop 4 frames if walking, else stand still on frame 0
    const frame = isMoving ? Math.floor(Date.now() / 150) % 4 : 0; 

    return { 
        img: img, 
        srcX: frame * srcW, 
        srcY: 0, 
        srcW, 
        srcH 
    };
}

// Add to the bottom of src/animations.js

// Inside getHobbitAnimationData() in src/animations.js:

export function getHobbitAnimationData(hobbit, images) {
    const srcW = 16;
    const srcH = 16;

    if (!hobbit.dir) hobbit.dir = 'South';

    // 💤 1. SLEEPING STATE OVERRIDE (Rotate them on their side)
    if (hobbit.state === 'sleeping') {
        return { 
            img: images.hobbitWalkSouth, // Use standing frame 0
            srcX: 0, 
            srcY: 0, 
            srcW, srcH,
            isSleeping: true // 👈 Flag for the renderer to rotate the sprite!
        };
    }

    // 2. Attack / Lunge Sheet Selection
    if (hobbit.state === 'attacking') {
        const imgKey = `hobbitLunge${hobbit.dir}`;
        return { 
            img: images[imgKey] || images.hobbitLungeSouth, 
            srcX: hobbit.frame * srcW, 
            srcY: 0, srcW, srcH 
        };
    }

    // 3. Standard Walk Sheet Selection
    const imgKey = `hobbitWalk${hobbit.dir}`;
    const isMoving = hobbit.state === 'walking';
    const frame = isMoving ? hobbit.frame : 0;

    return { 
        img: images[imgKey] || images.hobbitWalkSouth, 
        srcX: frame * srcW, 
        srcY: 0, srcW, srcH 
    };
}