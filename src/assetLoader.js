// src/assetLoader.js

if (typeof window !== 'undefined') {
    if (window.logStep) logStep("assetLoader.js loaded");
}

export const images = {};

// We can confidently load all assets now!
const imageSources = {

    // 🐔 CHICKENS
    chicken:             "images/chicken.png",
    chickenWalkEast:     "images/chickenWalkEast.png",
    chickenWalkWest:     "images/chickenWalkWest.png",

    // 🆕 ZENITH GUARDIAN WALK (4 Frames)
    zenithGuardianWalkNorth:     "images/zenithGuardianWalkNorth.png",
    zenithGuardianWalkSouth:     "images/zenithGuardianWalkSouth.png",
    zenithGuardianWalkEast:      "images/zenithGuardianWalkEast.png",
    zenithGuardianWalkWest:      "images/zenithGuardianWalkWest.png",
    zenithGuardianWalkNorthEast: "images/zenithGuardianWalkNorthEast.png",
    zenithGuardianWalkNorthWest: "images/zenithGuardianWalkNorthWest.png",
    zenithGuardianWalkSouthEast: "images/zenithGuardianWalkSouthEast.png",
    zenithGuardianWalkSouthWest: "images/zenithGuardianWalkSouthWest.png",

    // Inside the imageSources object in src/assetLoader.js:

    // 🧝 HOBBIT WALK (4 Frames each)
    hobbitWalkSouth:     "images/hobbitWalkSouth.png",
    hobbitWalkSouthEast: "images/hobbitWalkSouthEast.png",
    hobbitWalkEast:      "images/hobbitWalkEast.png",
    hobbitWalkNorthEast: "images/hobbitWalkNorthEast.png",
    hobbitWalkNorth:     "images/hobbitWalkNorth.png",
    hobbitWalkNorthWest: "images/hobbitWalkNorthWest.png",
    hobbitWalkWest:      "images/hobbitWalkWest.png",
    hobbitWalkSouthWest: "images/hobbitWalkSouthWest.png",

    // 🧝 HOBBIT LUNGE (3 Frames each)
    hobbitLungeSouth:     "images/hobbitLungeSouth.png",
    hobbitLungeSouthEast: "images/hobbitLungeSouthEast.png",
    hobbitLungeEast:      "images/hobbitLungeEast.png",
    hobbitLungeNorthEast: "images/hobbitLungeNorthEast.png",
    hobbitLungeNorth:     "images/hobbitLungeNorth.png",
    hobbitLungeNorthWest: "images/hobbitLungeNorthWest.png",
    hobbitLungeWest:      "images/hobbitLungeWest.png",
    hobbitLungeSouthWest: "images/hobbitLungeSouthWest.png",

    hobbit: "hobbit.png",

    // 🆕 ZENITH GUARDIAN IDLE (8 Frames - 1 for each direction)
    zenithGuardianIdle: "images/zenithGuardianIdle.png",

    // 🆕 HERO IDLE
    heroIdle: "images/heroIdle.png",
    
    heroWalkNorth:     "images/heroWalkNorth.png",
    heroWalkSouth:     "images/heroWalkSouth.png",
    heroWalkEast:      "images/heroWalkEast.png",
    heroWalkWest:      "images/heroWalkWest.png",
    heroWalkNorthEast: "images/heroWalkNorthEast.png",
    heroWalkNorthWest: "images/heroWalkNorthWest.png",
    heroWalkSouthEast: "images/heroWalkSouthEast.png",
    heroWalkSouthWest: "images/heroWalkSouthWest.png",

    // 🆕 ADD YOUR 8 NEW VAULT ANIMATIONS HERE
    heroVaultNorth:     "images/heroVaultNorth.png",
    heroVaultSouth:     "images/heroVaultSouth.png",
    heroVaultEast:      "images/heroVaultEast.png",
    heroVaultWest:      "images/heroVaultWest.png",
    heroVaultNorthEast: "images/heroVaultNorthEast.png",
    heroVaultNorthWest: "images/heroVaultNorthWest.png",
    heroVaultSouthEast: "images/heroVaultSouthEast.png",
    heroVaultSouthWest: "images/heroVaultSouthWest.png",

    // 🆕 ADD YOUR 8 LUNGE ANIMATIONS HERE
    heroLungeNorth:     "images/heroLungeNorth.png",
    heroLungeSouth:     "images/heroLungeSouth.png",
    heroLungeEast:      "images/heroLungeEast.png",
    heroLungeWest:      "images/heroLungeWest.png",
    heroLungeNorthEast: "images/heroLungeNorthEast.png",
    heroLungeNorthWest: "images/heroLungeNorthWest.png",
    heroLungeSouthEast: "images/heroLungeSouthEast.png",
    heroLungeSouthWest: "images/heroLungeSouthWest.png",
    
    worldTilesColor: "images/tileset_1bitGreen.png", // Main terrain and buildings
    feather:         "images/feather.png",         // Fishing bobber
    keyTileset:      "images/keyTileset.png",       // Keys
    cropTileset:     "images/cropTileset.png",      // Crops
    cropTileset2:    "images/cropTileset2.png", // 👈 ADD THIS LINE

    weaponTileset:   "images/weaponTileset.png", // 👈 Ensure this is here!
    gardenTileset:   "images/gardenTileset.png",  // 👈 ADD THIS LINE
    fishTileset:     "images/fishTileset.png", // 👈 ADD THIS LINE
    mainTileset2:    "images/mainTileset2.png", // 👈 ADD THIS LINE
    foodTileset:     "images/foodTileset.png", // 👈 ADD THIS LINE
    woodsTileset2:   "images/woodsTileset2.png", // 👈 ADD THIS LINE



    transparentTileset: "images/transparentTileset.png",





    
    // As you add more spritesheets (Weapons, Spells, etc.), just add them here!
};

// Reverted back to a clean ES6 Promise!
export function loadAllImages() {
    return new Promise((resolve) => {
        let imagesProcessed = 0;
        const keys = Object.keys(imageSources);
        const totalImages = keys.length;

        // If no images to load, resolve immediately
        if (totalImages === 0) {
            resolve(images);
            return;
        }

        for (let key of keys) {
            images[key] = new Image();
            
            const onFinish = () => {
                imagesProcessed++;
                if (imagesProcessed === totalImages) {
                    resolve(images); // Done!
                }
            };
            
            images[key].onload = onFinish;
            
            images[key].onerror = () => {
                console.error(`⚠️ Failed to load asset: ${imageSources[key]}`);
                onFinish(); // Still resolve so the game doesn't hang forever
            };

            // Setting the src triggers the download
            images[key].src = imageSources[key];
        }
    });
}