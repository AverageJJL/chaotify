
const bodyParser = require('body-parser');
const port = process.env.PORT || 3000;
const geolib = require('geolib'); // Import geolib for distance calculation

const dotenv = require('dotenv');

const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const { error } = require('node:console');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(bodyParser.json());
app.use(express.static("public"))


let self_socket = undefined;
let all_users = [];  //socket, coords
//let songsData = [];

// Set EJS as the view engine
app.set('view engine', 'ejs');

//route for index page
app.get("/", function (req, res) {
    res.render("index");
});

//route for user page
app.get("/user", function (req, res) {
    //const songs = songsData || [];
    res.render('user', { songs: [] });
});   

app.get("/data", function (req, res) {
    dotenv.config();
    let data = {client_id: process.env.clientId, clientSecret: process.env.clientSecret, redirectUri: process.env.redirect_uri};
    console.log(data);
    res.json(data);
});

app.post('/user/get_nearest', async (req, res) => {
    const { latitude, longitude, accessToken, socketId} = req.body;
    let nearest_users = [];
    let current_user_index = 0;
    
    console.log("///////////////////////////////////   socketId:"+socketId)
    console.log("                                                        ");
    console.log("accessToken:"+accessToken);;
    console.log("                                                        ");

    //find current user
    for (let i = 0; i < all_users.length; i++) {
        if(all_users[i][0] == socketId){
            //update the current user's location and access token
            all_users[i] = [socketId, {lat:latitude, long:longitude}, accessToken];
            current_user_index = i;
        }
    }
    console.log(all_users[current_user_index]);
    if(all_users.length>1){
        // this is the current user's coordinates
        const currentUserCoord = {
            latitude: all_users[current_user_index][1].lat,
            longitude: all_users[current_user_index][1].long
        };

        // loop through the array of users and find the nearest users
        for (let j = 0; j < all_users.length; j++) {
            // make sure the user doesn't add themselves as a nearest user
            if(current_user_index!=j){
                const newUserCoord = {
                    latitude: all_users[j][1].lat,
                    longitude: all_users[j][1].long
                };
                const distance = geolib.getDistance(newUserCoord, currentUserCoord,accuracy=1);
                if (distance >=0) { // set to anyone using the app for development purposes - will be 3km in the future
                    //add this user to nearest users object
                    console.log("all_users[j][2]:"+all_users[j][2]);
                    console.log("                                                        ");
                    //one final check
                    if(all_users[j][2]!=accessToken && all_users[j][2]!=""){
                        console.log("adding to array");
                        nearest_users.push(all_users[j][2]); //pass in the access token of the nearest users
                    }
                    
                }
            }
        

        }
    }  
    // Send a nearestUsers back
    res.json({nearestUsers: nearest_users});
    
});

app.post("/user/get_access_token", async (req, res) => {
    let socketId = req.body.id;
    //find current user
    for (let i = 0; i < all_users.length; i++) {
        if(all_users[i][0] == socketId){
            res.send(all_users[i][2]);
        }
    }
});   


io.on('connection', (socket) => {
    console.log('New client connected:'+socket.id);
    const newUserCoord = {
        lat: 0,
        long: 0
    };
    all_users.push([socket.id,newUserCoord,""]);
    console.log("all_users:"+all_users);
    console.log('all_users.length:'+all_users.length);

    socket.on('update_nearest', () => {
        console.log("RECIEVED UPDATE NEAREST REQUEST FROM: "+socket.id);
        //tell all clients to update their nearest users array
        //console.log(Object.keys(io.sockets.sockets));
        io.emit('client_update_nearest');
    });

    socket.on('update_access_token',(data) =>{
        
        const data_obj = JSON.parse(data);
        let index =-1;
        console.log("UPDATING ACCESS TOKEN FOR:"+data_obj.id);
        for (let i = 0; i < all_users.length; i++) {
            if(all_users[i][0] == data_obj.id){
                index = i;
            }
        }
        
        console.log("index:"+index);
        if(index!==-1){
            console.log("updating access token")
            all_users[index][2] = data_obj.accessToken;
        }
        console.log("all_users[index]:"+all_users[index]);
    });

    socket.on("pause_playback", (access_t) => {
        console.log("pause playback for:"+access_t);
        // find the socket id of the user with this access token
        let index =-1;
        for (let i = 0; i < all_users.length; i++) {
            if(all_users[i][2] == access_t){
                index = i;
            }
        }
        console.log("index:"+index);
        if(index!==-1){
            // send a private message to the socket with the given id
            socket.to(all_users[index][0]).emit("pause_playback");
        }
        
      });

    socket.on("resume_playback", (access_t) => {
        console.log("resume playback for:"+access_t);
        // find the socket id of the user with this access token
        let index =-1;
        for (let i = 0; i < all_users.length; i++) {
            if(all_users[i][2] == access_t){
                index = i;
            }
        }
        console.log("index:"+index);
        if(index!==-1){
            // send a private message to the socket with the given id
            socket.to(all_users[index][0]).emit("resume_playback");
        }
    
    });
    
    socket.on("skip_song", (access_t) =>{
        console.log("skip song for:"+access_t);
        // find the socket id of the user with this access token
        let index =-1;
        for (let i = 0; i < all_users.length; i++) {
            if(all_users[i][2] == access_t){
                index = i;
            }
        }
        console.log("index:"+index);
        if(index!==-1){
            // send a private message to the socket with the given id
            socket.to(all_users[index][0]).emit("skip_song");
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:'+socket.id);
        // Find the index of the socket in the array
        let index =-1;
        console.log("UPDATING ACCESS TOKEN FOR:"+socket.id);
        for (let i = 0; i < all_users.length; i++) {
            if(all_users[i][0] == socket.id){
                index = i;
            }
        }
        
        // Remove the socket from the array
        all_users.splice(index, 1);
        
        console.log("all_users:"+all_users);
        console.log('all_users.length:'+all_users.length);
        socket.broadcast.emit('client_update_nearest');
    });
});

server.listen(port, () => {
    console.log('server running on port:'+port);
});