const { ethers } = require("ethers");
// Making Connection
io.connect("http://localhost:3000");


var canvas = document.getElementById("myCanvas");
var canvas2 = document.getElementById("myCanvas2");

var ctx = canvas.getContext("2d");
var ctx2 = canvas2.getContext("2d");

// Hero image
var heroReady = false;
var heroImage = new Image();
heroImage.onload = function () {
	heroReady = true;
};
heroImage.src = "images/hero.png";

var tilesReady = false;
var worldTilesColor = new Image();
worldTilesColor.onload = function () {
    tilesReady = true;
}
worldTilesColor.src = "images/tileset_1bitGreen.png";

// VIEWPORT
var viewport = {
	screen		 : [0,0],
	startTile	 : [0,0],
	endTile		 : [0,0],
	offset		 : [0,0],
	update		 : function(px, py)
	{
		this.offset[0] = Math.floor((this.screen[0]/2) - px);
		this.offset[1] = Math.floor((this.screen[1]/2) - py);

		var tile = [ Math.floor(px/tileW), Math.floor(py/tileH) ];

		this.startTile[0] = tile[0] - 1 - Math.ceil((this.screen[0]/2) / tileW);
		this.startTile[1] = tile[1] - 1 - Math.ceil((this.screen[1]/2) / tileH);

		if(this.startTile[0] < 0) { this.startTile[0] = 0; }
		if(this.startTile[1] < 0) { this.startTile[1] = 0; }

		this.endTile[0] = tile[0] + 1 + Math.ceil((this.screen[0]/2) / tileW);
		this.endTile[1] = tile[1] + 1 + Math.ceil((this.screen[1]/2) / tileH);

		if(this.endTile[0] >= mapW) { this.endTile[0] = mapW; }
		if(this.endTile[1] >= mapH) { this.endTile[1] = mapH; }

	}
};

window.onload = function(){

    
	viewport.screen = [document.getElementById('myCanvas').width,
		document.getElementById('myCanvas').height];

    ;
}

var baseMap;

socket.on('state', function(data) {
    
    baseMap = data.map;
    

    
});

   

    
    //console.log(map);


    
    

    socket.on('position', function(data) {
        var currentPlayer = data.currentPlayer;
        var playerbase = data.playerbase; 
       // var map = data.map;
        
         
          

        var playerList = [];
        
        
    

        for (var id in playerbase) {
            var player = playerbase[id];
            playerList.push(player);                  
        }

        viewport.update(currentPlayer.x, currentPlayer.y);

        
        

        
        ctx.clearRect(0, 0, 640, 640);
        
        
        ctx.drawImage(heroImage, viewport.offset[0] + currentPlayer.x, viewport.offset[1] + currentPlayer.y, 16, 16);

        

        
        if (playerList.length == 2){

            console.log("wokdr");

            if( currentPlayer.regionX == playerList[1].regionX  && currentPlayer.regionY == playerList[1].regionY ||

                currentPlayer.regionX == playerList[1].regionX  && currentPlayer.regionY == playerList[1].regionY - 1 ||
                currentPlayer.regionX == playerList[1].regionX  && currentPlayer.regionY == playerList[1].regionY + 1 ||
                currentPlayer.regionX == playerList[1].regionX - 1  && currentPlayer.regionY == playerList[1].regionY ||
                currentPlayer.regionX == playerList[1].regionX + 1  && currentPlayer.regionY == playerList[1].regionY ||
                currentPlayer.regionX == playerList[1].regionX - 1  && currentPlayer.regionY == playerList[1].regionY - 1 ||
                currentPlayer.regionX == playerList[1].regionX + 1  && currentPlayer.regionY == playerList[1].regionY - 1 ||
                currentPlayer.regionX == playerList[1].regionX + 1  && currentPlayer.regionY == playerList[1].regionY + 1 ||
                currentPlayer.regionX == playerList[1].regionX - 1  && currentPlayer.regionY == playerList[1].regionY + 1

            ){

                var xDifference1 = currentPlayer.regionX - playerList[1].regionX;
                var yDifference1 = currentPlayer.regionY - playerList[1].regionY;

                var xDifference2 = currentPlayer.regionX - playerList[0].regionX;
                var yDifference2 = currentPlayer.regionY - playerList[0].regionY;

                ctx.drawImage(heroImage, viewport.offset[0] + playerList[0].x - (320 * xDifference2), viewport.offset[1] + playerList[0].y - (320 * yDifference2), 16, 16);

                ctx.drawImage(heroImage, viewport.offset[0] + playerList[1].x - (320 * xDifference1), viewport.offset[1] + playerList[1].y - (320 * yDifference1), 16, 16);

                //ctx.clearRect(0, 0, 640, 320);

            }

            

        
            
    
    
    
        }
        
            

        



       // socket.on('secret', function(matrix) {
        

            //console.log(matrix);


            console.log("working xd");

            ctx2.clearRect(0, 0, 640, 640);

            

            if (tilesReady){

            for ( k = 0; k <= 19; k++){
                for ( l = 0; l <= 19; l++){
        
        
        
                    //for ( i=0; i < playerList.length; i++){
                        
                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX][currentPlayer.regionY][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX][currentPlayer.regionY][k][l] / 8) * 16), 16, 16, viewport.offset[0] + k * 16, viewport.offset[1] + l * 16, 16, 16);

                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX + 1][currentPlayer.regionY][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX + 1][currentPlayer.regionY][k][l] / 8) * 16), 16, 16, viewport.offset[0] + (k+20) * 16, viewport.offset[1] + l * 16, 16, 16);
                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX][currentPlayer.regionY + 1][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX][currentPlayer.regionY + 1][k][l] / 8) * 16), 16, 16, viewport.offset[0] + k * 16, viewport.offset[1] + (l+20) * 16, 16, 16);
                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX - 1][currentPlayer.regionY][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX - 1][currentPlayer.regionY][k][l] / 8) * 16), 16, 16, viewport.offset[0] + (k-20) * 16, viewport.offset[1] + l * 16, 16, 16);
                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX][currentPlayer.regionY - 1][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX][currentPlayer.regionY - 1][k][l] / 8) * 16), 16, 16, viewport.offset[0] + k * 16, viewport.offset[1] + (l-20) * 16, 16, 16);
                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX - 1][currentPlayer.regionY - 1][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX - 1][currentPlayer.regionY - 1][k][l] / 8) * 16), 16, 16, viewport.offset[0] + (k-20) * 16, viewport.offset[1] + (l-20) * 16, 16, 16);
                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX + 1][currentPlayer.regionY - 1][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX + 1][currentPlayer.regionY - 1][k][l] / 8) * 16), 16, 16, viewport.offset[0] + (k+20) * 16, viewport.offset[1] + (l-20) * 16, 16, 16);
                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX - 1][currentPlayer.regionY + 1][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX - 1][currentPlayer.regionY + 1][k][l] / 8) * 16), 16, 16, viewport.offset[0] + (k-20) * 16, viewport.offset[1] + (l+20) * 16, 16, 16);
                        ctx2.drawImage(worldTilesColor, ((baseMap[currentPlayer.regionX + 1][currentPlayer.regionY + 1][k][l]%8) * 16), (Math.floor(baseMap[currentPlayer.regionX + 1][currentPlayer.regionY + 1][k][l] / 8) * 16), 16, 16, viewport.offset[0] + (k+20) * 16, viewport.offset[1] + (l+20) * 16, 16, 16);
                
                
                    //}
        
        
                    //if(matrix[i][j][k][l] == 63 || 7 || 6){
                   // ctx2.drawImage(worldTilesColor, ((map[player.regionX][player.regionY][k][l]%8) * 16), (Math.floor(map[player.regionX][player.regionY][k][l] / 8) * 16), 16, 16, k * 16, l * 16, 16, 16);  
                   // }	    
                    
                }
        
            }


            }


            ctx2.fillStyle = "rgb(250, 25, 250)";
	        ctx2.font = "18px Helvetica";
	        ctx2.textAlign = "left";
	        ctx2.textBaseline = "top";
	        ctx2.fillText("YOU ROCK " +  currentPlayer.regionX + ":" + currentPlayer.regionY, 32, 32);

        
            
   
      //  });











    })

    
    
    

   

    
    
    
        

    

    
      
    //});
    

    

    

    
    

    
    

    
    

    


    


    


    

    

    

    

    
    

    



    

    
    




/*
socket.on('secret', function(secret) {
    console.log(secret);
}
);
*/

//socket.on('message', function(data) {console.log(data);});



var movement = {
    up: false,
    down: false,
    left: false,
    right: false
}

document.addEventListener('keydown', function(event) {switch (event.keyCode) {
    case 65: 
    // A
    movement.left = true;
    break;

    case 87:
    // W
    movement.up = true;
    break;

    case 68: 
    // D
    movement.right = true;
    break;

    case 83:
    // S
    movement.down = true;
    break;

}});
    document.addEventListener('keyup', function(event) {switch (event.keyCode) {
        case 65:
         // A
        movement.left = false;
        break;

        case 87:
          // W
        movement.up = false;
        break;

        case 68:
           // D
        movement.right = false;
        break;

        case 83:
            // S
        movement.down = false;
        break;
        
    }});
    
socket.emit('new player');

setInterval(function() {socket.emit('movement', movement);}, 1000 / 60);

async function connect() {
    

    if (typeof window.ethereum !== undefined){
    
        console.log("we see metamask");
        ethereum.request({ method: "eth_requestAccounts"});
    }
    
}


    
  const contractAddress = "0x70444877C082cDa2221B49F2FB8118310F6D57f5";

  const abi = [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [],
      "name": "collect",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "ethAmount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getBalance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getMasterBalance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address payable",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "withdraw",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "stateMutability": "payable",
      "type": "receive"
    }
  ];

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const contract = new ethers.Contract(contractAddress, abi, signer);

async function collect() {

  await contract.collect();
        
}

async function withdraw() {

  await contract.withdraw(1000000000000000);
        
}

socket.on('callContract', function() {
  collect();
});

async function getBalance() {

    const result = await contract.getBalance();
    console.log("result:" + result);
    
}

async function getMasterBalance() {

  const result = await contract.getMasterBalance();
  console.log("result:" + result);
  
}


    module.exports = {
        connect,
        collect,
        getBalance,
        getMasterBalance,
        withdraw,
      };