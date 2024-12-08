const port = process.env.PORT || 3000;

const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

// Set static folder
app.use(express.static("public"));

// GAME LOGIC

var collectX;
var collectY;
var collectRegionX;
var collectRegionY;

x = [];

for (i=0; i<100; i++){
	x[i] = [];		
}

for (i=0; i<100; i++){
	for (j=0; j<100; j++){					
		x[i][j] = Math.floor(Math.random() * 100) + 1;				
	}
}

matrix = [];
for (i=0; i<100; i++){
	matrix[i] = [];
}
	function swapLoad(i, j) {

		if (x[i][j] >= 67){	
			
			matrix[i][j] = []

			for (k=0; k<=19; k++){

				matrix[i][j][k] = []

				for (l=0; l<=19; l++){ 

					var randomBlock = Math.floor(Math.random() * 100000) + 1;					
					var density = 6000;
					var grassDensity = 20000;
                    var shroomDensity = 10;
					
                    if ( randomBlock > shroomDensity){
						if ( randomBlock > density){
							if ( randomBlock > grassDensity) {
							matrix[i][j][k][l] = 63;
						}
						else{
							matrix[i][j][k][l] = 6;
						}
					}
					else {
						matrix[i][j][k][l] = 7;
					}						
				}
                else {
                    matrix[i][j][k][l] = 44;
                    collectRegionX = i;
                    collectRegionY = j;
                    collectX = k;
                    collectY = l;
                }					
			}	
		}
    }				
		else {
			matrix[i][j] = [];
			for(k=0; k<=19; k++){
				matrix[i][j][k] = []
				for(l=0; l<=19; l++){
					matrix[i][j][k][l] = 17;
				}
			}
		}	
}

var players = {
};

swapLoad(50, 50);
swapLoad(50, 50 + 1);
swapLoad(50 + 1, 50);
swapLoad(50, 50 - 1);
swapLoad(50 - 1, 50);
swapLoad(50 - 1, 50 - 1);
swapLoad(50 + 1, 50 - 1);
swapLoad(50 - 1, 50 + 1);
swapLoad(50 + 1, 50 + 1);



colors = ['red', 'blue', 'green'];



var fuckIt = 0;


//console.log(matrix[0][0]);





io.on('connection', (socket) => {

  
  //setTimeout( function() {socket.emit('state', {map: matrix})}, 200);


  socket.emit('state', {map: matrix});
  console.log("hell go");




  console.log('a user connected:', socket.id);
  socket.on('disconnect', function() {
  console.log('user disconnected', socket.id);
  });


  




  socket.on('new player', function() {
    



    players[socket.id] = {
      x: 60,
      y: 60,
      regionX: 50,
      regionY: 50
      };

      

      



      



    

      
      

    
  });

  socket.on('movement', function(data) {

    var player = players[socket.id] || {};
    if (data.left) {player.x -= 2;}
    if (data.up) {player.y -= 2;}
    if (data.right) {player.x += 2;}
    if (data.down) {player.y += 2;}

    if (player.y < 0)
      {
        player.y = 20 * 16;
        
        --player.regionY;


        if (matrix[player.regionX - 1][player.regionY - 1] === undefined){
          swapLoad(player.regionX - 1, player.regionY - 1);
          }

        if (matrix[player.regionX][player.regionY - 1] === undefined){
          swapLoad(player.regionX, player.regionY - 1);
          }

        if (matrix[player.regionX + 1][player.regionY - 1] === undefined){
          swapLoad(player.regionX + 1, player.regionY - 1);
          }

          socket.emit('state', {map: matrix});
        
      }

    
      if (player.x > 20 * 16)
      {
  
        ++player.regionX;

        player.x = 0;
        
        if (matrix[player.regionX + 1][player.regionY + 1] === undefined){
          swapLoad(player.regionX + 1, player.regionY + 1);          
          }
         

        if (matrix[player.regionX + 1][player.regionY] === undefined){
          swapLoad(player.regionX + 1, player.regionY);
          }
          

        if (matrix[player.regionX + 1][player.regionY - 1] === undefined){
          swapLoad(player.regionX + 1, player.regionY - 1);
          }


          socket.emit('state', {map: matrix});
          //console.log("hello");
          


      

        //socket.emit('secret', matrix);
        

        

        
        
        
        
      }

    
      if (player.y > 20 * 16)
      {
        player.y = 0;
    
        ++player.regionY;

        if (matrix[player.regionX - 1][player.regionY + 1] === undefined){
          swapLoad(player.regionX - 1, player.regionY + 1);
          }

        if (matrix[player.regionX][player.regionY + 1] === undefined){
          swapLoad(player.regionX, player.regionY + 1);
          }

        if (matrix[player.regionX + 1][player.regionY + 1] === undefined){
          swapLoad(player.regionX + 1, player.regionY + 1);
          }

        
          socket.emit('state', {map: matrix});
        
      }

    
      if (player.x < 0)
      {
        player.x = 20 * 16;
          
        --player.regionX;

        if (matrix[player.regionX - 1][player.regionY + 1] === undefined){
          swapLoad(player.regionX - 1, player.regionY + 1);
          }

        if (matrix[player.regionX - 1][player.regionY] === undefined){
          swapLoad(player.regionX - 1, player.regionY);
          }

        if (matrix[player.regionX - 1][player.regionY - 1] === undefined){
          swapLoad(player.regionX - 1, player.regionY - 1);
          }

        
          socket.emit('state', {map: matrix});
        
      }

      if (player.x <= (collectX * 16 + 16)
		&& (collectX * 16) <= (player.x + 16)
		&& player.y <= (collectY * 16 + 16)
		&& (collectY * 16) <= (player.y + 16)
        && player.regionX == collectRegionX
        && player.regionY == collectRegionY ) {

            matrix[player.regionX][player.regionY][collectX][collectY] = 6;
            console.log("wodrokeing");
            socket.emit('callContract');

            collectX = 10000;
            collectY = 10000;

            
        }


      socket.emit('position', {playerbase: players, currentPlayer: player});
      

  });

  

  
});

//setInterval(function() {io.sockets.emit('message', 'hi!');}, 1000);




/*
setInterval(function() {
  io.sockets.emit('state', {players});}, 1000 / 60);
  */
  



server.listen(port, () => {
  console.log('server running at http://localhost:3000');
});