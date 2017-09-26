const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const port = process.env.PORT || 4001;


const app = express();
app.use(cors({ origin: '*' }));
// Settings for CORS
app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.header('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.header('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', false);

    // Pass to next layer of middleware
    next();
});

const server = http.createServer(app);

const io = socketIo(server); // < Interesting!
// io.origins('*:*')
io.configure('production', function(){
    console.log("Server in production mode");
    io.enable('browser client minification');  // send minified client
    io.enable('browser client etag'); // apply etag caching logic based on version number
    io.enable('browser client gzip'); // the file
    io.set('log level', 1);           // logging
    io.set('transports', [            // all transports (optional if you want flashsocket)
        'websocket'
        , 'flashsocket'
        , 'htmlfile'
        , 'xhr-polling'
        , 'jsonp-polling'
    ]);
io.set('origins', '*:*');
});

class Manager{
  constructor(){
    this.waitingGame = new Game(2);
    this.runningGames=[];
  }
  assignPlayer(user_id){
    console.log(`assigning ${user_id}`);
    this.waitingGame.addPlayer(user_id);
    if(this.waitingGame.isFull()){
      console.log("starting...");
      this.runningGames.push(this.waitingGame);
      this.waitingGame=new Game(2);
    }
  }
  handleEvent(user_id,event,message){
    if(event==="disconnect"){
      this.waitingGame.processMessage(user_id,event,message);
    }
    for (var i = 0; i < this.runningGames.length; i++) {
      var game = this.runningGames[i];
      game.processMessage(user_id,event,message);
    }
  }
}
class Game{
  constructor(maxPlayers){
    this.players=[];
    this.nodes=[];
    this.links=[];
    this.maxPlayers = maxPlayers || 3;
    this.nextId=0;
    this.currentPlayerIndex=0;
  }

  addPlayer(user_id){
    if (!this.isFull()) {
      this.players.push({id:user_id,socket:users[user_id]});
      if(this.isFull()){
        this.startGame();

      }
    }
  }
  isFull(){
    console.log(this.players.length);
    console.log(`max players: ${this.maxPlayers}`);
    return this.players.length === this.maxPlayers;
  }
  generateNodeGrid(){
    const width = 7,height=7;
    var newNodes = new Array(width);
    var newLinks=[]
    for (var x = 0; x < width; x++) {
      newNodes[x] = new Array(height);
      for (var y = 0; y < height; y++) {
        newNodes[x][y]={id:this.nextId++};
      }
    }
    var nodes = [];
    for (var x = 0; x < newNodes.length; x++) {
      for (var y = 0; y < newNodes[x].length; y++) {
        nodes.push(newNodes[x][y]);
        var left = x-1,
        right = x+1,
        top = y-1,
        bottom = y+1;
        if (left>0 && left < width) {
          newLinks.push({id:this.nextId++,source:newNodes[x][y].id,target:newNodes[left][y].id})
        }
        if (right>0 && right < width) {
          newLinks.push({id:this.nextId++,source:newNodes[x][y].id,target:newNodes[right][y].id})
        }
        if (top>0 && top < height) {
          newLinks.push({id:this.nextId++,source:newNodes[x][y].id,target:newNodes[x][top].id})
        }
        if (bottom>0 && bottom < height) {
          newLinks.push({id:this.nextId++,source:newNodes[x][y].id,target:newNodes[x][bottom].id})
        }
      }
    }
    this.nodes = nodes;
    this.links=newLinks;
    }
  generateRandomMap(){
    var nodeAmount = 80;
    var nodes = [];
    var links=[];
    for (var i = 0; i < nodeAmount; i++) {
      nodes.push({id:this.nextId++});
    }
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var newLink ={
        id:this.nextId++,
        source:node.id,
        target:getRandomArrElement(nodes).id
      };
      links.push(newLink);
      if(Math.random()<0.2){
        var newLink ={
          id:this.nextId++,
          source:node.id,
          target:getRandomArrElement(nodes).id
        };
        links.push(newLink);
      }
    }
    this.nodes=nodes;
    this.links=links;
  }
  setStartingPositions(){ //temp!
    for (var i = 0; i < this.players.length; i++) {
      getRandomUnownedNode(this.nodes).owner=this.players[i].id
    }
  }
  startGame(){
    console.log("game started");

    //this.generateNodeGrid();
    this.generateRandomMap();
    this.setStartingPositions();
    this.messagePlayers("game_started",{nodes:this.nodes,links:this.links,nextPlayer:this.players[this.currentPlayerIndex].id})
  }
  playerIsInGame(user_id){
    for (var i = 0; i < this.players.length; i++) {
      if(this.players[i].id === user_id){
        return true;
      }
    }
    return false;
  }
  processMessage(user_id,event,message){
    if(this.playerIsInGame(user_id)){
      switch (event) {
        case "turn":
          this.handleTurn(user_id,message);
          break;
        case "disconnect":
          this.players=this.players.filter(player=>player.id!==user_id);
          this.stopGame();
          break;
        case "skip":
          this.handleSkip(user_id);
          break;
      }
    }
  }
  nextPlayer(){
    var nextIndex = (this.currentPlayerIndex+1)%this.maxPlayers;
    this.currentPlayerIndex = nextIndex;
    return nextIndex;
  }
  handleSkip(user_id){
    if (user_id===this.players[this.currentPlayerIndex].id) {
      this.messagePlayers("turn_skipped",{nextPlayer:this.players[this.nextPlayer()].id});
    }
  }
  handleTurn(user_id,data){
    var currentPlayer = this.players[this.currentPlayerIndex];
    if(currentPlayer.id === user_id && this.isInRangeOfPlayer(user_id,data.id)){
    this.nodes.forEach((node)=>{
      if(node.id === data.id){
        if(!node.owner){
          node.owner = user_id;
          this.messagePlayers("turn_made",{nextPlayer:this.players[this.nextPlayer()].id,action:{player:user_id,node_id:data.id}});

        }else if (node.owner === user_id) {
          this.destroyNode(node.id);
          this.messagePlayers("turn_made",{nextPlayer:this.players[this.nextPlayer()].id,action:{player:user_id,node_id:data.id}});

        }
      }
    })
    }
  }
  destroyNode(node_id){

    var connectedLinks = this.links.filter(link=>(link.source === node_id || link.target === node_id));
    var directlyConnectedNodes = this.nodes.filter(node=>{
      return connectedLinks.filter(link=>(link.source === node.id || link.target == node.id)).length>0
    });
    var destroyedNodes = this.nodes.filter(node=>!(
      directlyConnectedNodes.filter(directNode=>(
        directNode.id === node.id
      )).length === 0 //|| node.owner
    ));
    var restLinks=this.links.filter(link=>(
      destroyedNodes.filter(node=>(node.id===link.target||node.id===link.source)).length===0
    ));
    var restNodes = this.nodes.filter(node=>(
      destroyedNodes.filter(destroyedNode=>destroyedNode.id===node.id).length === 0
    ));
    this.link=restLinks;

    this.nodes = restNodes;
  }
  stopGame(){
    this.messagePlayers("game_stopped");
  }
  messagePlayers(eventName,message){
    for (var i = 0; i < this.players.length; i++) {
      var player = this.players[i];
      player.socket.emit(eventName,message);
    }
  }
  isInRangeOfPlayer(user_id,node_id){

    var connectedLinks = this.links.filter(link=>(link.source === node_id || link.target === node_id));
    var directlyConnectedNodes = this.nodes.filter(node=>{
      return connectedLinks.filter(link=>(link.source === node.id || link.target == node.id)).length>0
    });
    var indirectLinks = this.links.filter(link=>{
      return directlyConnectedNodes.filter(node=>(node.id===link.source || node.id===link.target)).length > 0;
    });
    var indirectNodes=this.nodes.filter(node=>(
      indirectLinks.filter(link=>(link.source===node.id || link.target===node.id)).length>0
    ));
    var nodesInRange = directlyConnectedNodes.concat(indirectNodes);
    var hasOneOwned = nodesInRange.filter(node=>node.owner===user_id).length > 0;

    return hasOneOwned;
  }
}

var users = {};
var connections = 0;
var manager = new Manager();
io.on("connection", socket => {
  users[socket.id] = socket;
  connections++;
  console.log(socket.id);
  console.log(`New client connected (${connections})`);
  io.emit("join",{connectedUsers:connections});
  socket.emit("set_id",{id:socket.id});
  socket.on("turn",(data)=>{
    manager.handleEvent(socket.id,"turn",data);
  })
  socket.on("skip",()=>{
    manager.handleEvent(socket.id,"skip");
  })
  manager.assignPlayer(socket.id);
  socket.on("disconnect", () => {
    manager.handleEvent(socket.id,"disconnect");
    console.log(`Client disconnected (${connections})`);
    connections--;
    io.emit("join",{connectedUsers:connections});
    users[socket.id]=undefined;
  });
});


server.listen(port, () => console.log(`Listening on port ${port}`));



function getRandomArrElement(arr){
  var length = arr.length;
  return arr[Math.floor(length*Math.random())];
}
function getRandomUnownedNode(nodes){
  console.log(nodes);
  var randomNode = getRandomArrElement(nodes);
  console.log(randomNode);
  while (randomNode.owner) {
   randomNode = getRandomArrElement(nodes);
  }
  return randomNode;
}
