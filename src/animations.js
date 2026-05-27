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
    const imgKey = `heroWalk${hero.dir}`;
    return { img: images[imgKey] || images.heroWalkSouth, srcX: hero.frame * srcW, srcY: 0, srcW, srcH };
}

export function getPetAnimationData(pet, images) {
    const srcW = 16; 
    const srcH = 16; 

    if (!pet.dir) pet.dir = 'South';

    const isMoving = (Math.abs(pet.dx) > 0.1 || Math.abs(pet.dy) > 0.1);

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

    const isMoving = animal.state === 'walking';
    const imgKey = `chickenWalk${animal.dir}`;
    const img = images[imgKey] || images.chickenWalkEast;
    const frame = isMoving ? Math.floor(Date.now() / 150) % 4 : 0; 

    return { 
        img: img, 
        srcX: frame * srcW, 
        srcY: 0, 
        srcW, 
        srcH 
    };
}