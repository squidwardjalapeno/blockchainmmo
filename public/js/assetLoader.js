// js/loader.js

export const images = {};

const imageSources = {
    hero: "images/hero.png",
    monster: "images/cornPouch.png",
    sinster: "images/sinsterPouch.png",
    worldTiles: "images/tileset_1bit.png",
    worldTilesColor: "images/tileset_1bitGreen.png",
    random: "images/Corn_Stage_1.png",
    corn: "images/corn.png",

    heroUp:    "images/chronoUp.png",
    heroDown:  "images/chronoDown.png",
    heroLeft:  "images/chronoLeft.png",
    heroRight: "images/chronoRight.png",

    feather: "images/feather.png",

    cropTileset: "images/cropTileset.png"
};

// This function returns a Promise that resolves when all images are ready
export function loadAllImages() {
    return new Promise((resolve) => {
        let imagesLoaded = 0;
        const totalImages = Object.keys(imageSources).length;

        for (let key in imageSources) {
            images[key] = new Image();
            images[key].src = imageSources[key];
            images[key].onload = () => {
                imagesLoaded++;
                if (imagesLoaded === totalImages) {
                    console.log("All images ready!");
                    resolve(images); // This "triggers" the await in your game file
                }
            };
            
            // Helpful error check
            images[key].onerror = () => {
                console.error("Failed to load image:", imageSources[key]);
            };
        }
    });
}
