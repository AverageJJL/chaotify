let clientId = undefined;
let client_secret = undefined;
let redirectUri = undefined;
fetch('/data')
    .then(response => response.json())
    .then(data => {
        clientId = data.client_id;
        client_secret = data.clientSecret;
        redirectUri = data.redirectUri || 'http://localhost:3000/user';
    })
    .catch(error => console.error('Error:', error));
const params = new URLSearchParams(window.location.search);
const code = params.get("code");
let currentSong = undefined;

let nearest_users = [];


document.addEventListener('DOMContentLoaded', async () => {
  if(!window.location.href.includes('user')){
    const loginButton = document.getElementById('login-btn');

    if(loginButton){
      loginButton.addEventListener('click', () => {
        redirectToAuthCodeFlow(clientId); 
      });
    }
    
  }
  else{
    if(currentSong!=undefined && !currentSong.error){
      populate_current_song(currentSong);
      update_nearest_users();
    }
  
  }
});

window.get_new_token = async function(msg){
    //get new token
    let tokens = await getNewAccessToken(code); 
    localStorage.setItem("access_token",tokens.access);
    localStorage.setItem("refresh_token",tokens.refresh);
    socket.emit("pause_playback", localStorage.getItem("access_token"));
}

window.get_user = async function (token=undefined) {
  if(token==undefined){
    token = localStorage.getItem("access_token");
  }
  
  const result = await fetch("https://api.spotify.com/v1/me", {
      method: "GET", 
      headers: {    Authorization: `Bearer ${token}` }
  });

  return await result.json();
}




//this allows it to be run from the script tags
window.update_nearest_users = function (){
  const successCallback = async (position) => {
    //get user location
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    
    // Fetch the user's access token from local storage or wherever you store it
    const accessToken = localStorage.getItem("access_token");

    // Create a data object containing the user's location and access token
    const data = {
      latitude: latitude,
      longitude: longitude,
      accessToken: accessToken,
      socketId: socket.id
    };

    // Send the location data to the server and get the nearest people
    await fetch('/user/get_nearest', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(async response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        let msg = await response.json();
        nearest_users = msg.nearestUsers;
        if(nearest_users.length>0 && !currentSong.error){
          populate_nearby(nearest_users);
        }
        
    })
    .catch(error => {
        console.error('Error sending location:', error);
    });
  };
  
  const errorCallback = (error) => {
    console.log(error);
  };
  
  navigator.geolocation.getCurrentPosition(successCallback, errorCallback);
}

export async function redirectToAuthCodeFlow(clientId) {
  const verifier = generateCodeVerifier(128);
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem("verifier", verifier);


  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("response_type", "code");
  params.append("redirect_uri", redirectUri);
  params.append("scope", "user-read-private user-read-email user-read-currently-playing user-modify-playback-state user-read-playback-state app-remote-control streaming");
  params.append("code_challenge_method", "S256"); 
  params.append("code_challenge", challenge);

  document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function generateCodeVerifier(length) {
  let text = '';
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
}



window.get_current_song = async function(){
  // Use the access token here
  currentSong = await fetchCurrentlyPlaying(localStorage.getItem("access_token"));
  while(currentSong.error){
      //try to get access token
      if(localStorage.getItem("access_token")==undefined){
      const tokens = await getAccessToken(clientId, code);
      localStorage.setItem("access_token",tokens.access);
      localStorage.setItem("refresh_token",tokens.refresh);
      }
      else{
          const tokens = await getNewAccessToken(code);
          localStorage.setItem("access_token",tokens.access);
          localStorage.setItem("refresh_token",tokens.refresh);
      }
      
      currentSong = await fetchCurrentlyPlaying(localStorage.getItem("access_token"));
  }
  populate_current_song(currentSong);
  
  let data = {
    id: socket.id,
    accessToken: localStorage.getItem("access_token")
  }
  await socket.emit("update_access_token",JSON.stringify(data));
  
  //send message to server to tell all clients to update their nearest users bc someone new joined
  socket.emit('update_nearest');
}

export async function getAccessToken(clientId, code) {
  const verifier = localStorage.getItem("verifier");

  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirectUri);
  params.append("code_verifier", verifier);

  const result = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
  });

  
  const data = await result.json();
  const { access_token, refresh_token } = data;

  return { access:access_token, refresh:refresh_token };
}

window.get_premium_status  = async function(access_t) {

  const result = await fetch("https://api.spotify.com/v1/me", {
      method: "GET", 
      headers: {    Authorization: `Bearer ${access_t}` }
  });
  let msg = await result.json();
  if(msg.product == "premium"){
    return true;
  }
  return false;
}


window.getNewAccessToken = async function(code) {
    const verifier = localStorage.getItem("verifier");
  
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUri);
    params.append("code_verifier", verifier);
    
    const basicAuth = btoa(`${clientId}:${client_secret}`);
    const result = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { 'Content-Type': 'application/x-www-form-urlencoded',"Authorization": `Basic ${basicAuth}`},
        body: params
    });
  
    
    const data = await result.json();
    const { access_token, refresh_token } = data;
    return { access:access_token, refresh:refresh_token };
  }

window.fetchCurrentlyPlaying = async function (token) {
    const result = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
        method: "GET", 
        headers: {    Authorization: `Bearer ${token}` }
    });
    return await result.json();
}

async function populate_current_song(song){
  const trackImageUrl = song.item.album.images[1].url;

  // Get a reference to the image element
  const trackImage = document.getElementById('user_track_img');

  // Set the src attribute of the image to the track image URL
  trackImage.src = trackImageUrl;

  const trackTitle = document.getElementById('user_track_title');
  const trackArtist = document.getElementById('user_track_artist');

  trackTitle.innerText = song.item.name;
  trackArtist.innerText = song.item.artists[0].name;

  // Extract colors from the album cover image using Vibrant.js
  Vibrant.from(trackImageUrl).getPalette((err, palette)=> {
      if (err) {
          console.error('Error extracting colors:', err);
          return;
      }

      // Retrieve dominant colors from the palette
      let colors = Object.values(palette)
        .map(color => color.getHex());
      let colors_string = colors.join(',');
      const background = document.getElementById('background');
      background.style.background = `linear-gradient(-45deg, ${colors_string})`;
  });
}


async function populate_nearby(nearest_users) {
  if(nearest_users.length>0){
    //populate nearby users' section
    let all_nearby_songs = [];
    //loop through nearest user's array
  
    for (let i=0; i<nearest_users.length; i++){
      let song_details = await fetchSong(nearest_users[i]);
      all_nearby_songs.push([nearest_users[i],song_details]);
    }
    //update frontend
    const nearbySongsContainer = document.querySelector('.nearby-song');
    nearbySongsContainer.innerHTML = ''; // Clear previous content

    //get the user who this song belongs to

    all_nearby_songs.forEach(async song_arr => {

      //check if user has premium or not
      let premium = await get_premium_status(song_arr[0]);
      
      const songElement = document.createElement('div');
      songElement.classList.add('song');

      if(premium){
        songElement.innerHTML = `
          <img src="${song_arr[1].img}" alt="${song_arr[1].title}">
          <div class="song-info">
              <h3 class="song-title">${song_arr[1].title}</h3>
              <p class="artist">${song_arr[1].artist}</p>
              <div id=${song_arr[0]} class="song-buttons">
                <img class="play-button" src="./buttons/pause.png" alt="Play" onclick="handlePlayClick('${song_arr[0]}')">
                <img class="skip-button" src="./buttons/fast-forward.png" alt="Skip" onclick="handleSkipClick('${song_arr[0]}')">
            </div>
          </div>
        `;
      }
      else{
        songElement.innerHTML = `
          <img src="${song_arr[1].img}" alt="${song_arr[1].title}">
          <div class="song-info">
              <h3 class="song-title">${song_arr[1].title}</h3>
              <p class="artist">${song_arr[1].artist}</p>
              <div class="premium_container">
                <p>This user does not have Spotify Premium</p>
              </div>
          </div>
        `;
      }
      nearbySongsContainer.appendChild(songElement);
    
    });
    
  }
  else if(nearest_users.length==0){
    const nearbySongsContainer = document.querySelector('.nearby-song');
    nearbySongsContainer.innerHTML = ''; // Clear previous content
  }
}

async function fetchSong(access_T){
  //get the current song with the access token
  currentSong = await fetchCurrentlyPlaying(access_T);
  let song_data = {
    title: currentSong.item.name,
    artist: currentSong.item.artists[0].name,
    img: currentSong.item.album.images[1].url
  }
  return song_data;
}




 