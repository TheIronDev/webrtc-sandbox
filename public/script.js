'use strict';

const call = document.getElementById('call');
const dialogEl = document.getElementById('dialog');
const localVideoEl = document.getElementById('localVideo');
const dataChannelSendEl = document.getElementById('dataChannelSend');
const dataChannelReceiveEl = document.getElementById('dataChannelReceive');
const sendDatachannelEl = document.getElementById('sendDatachannel');
const sendWebsocketEl = document.getElementById('sendWebsocket');
const socket = io.connect();
const userIdEl = document.getElementById('userId');
const usersEl = document.getElementById('users');
const videosEl = document.getElementById('videos');
const websocketSendEl = document.getElementById('websocketSend');
const websocketReceiveEl = document.getElementById('websocketReceive');

// Temporary solution, this has a high probability of collision.
const currentUserId = ~~(Math.random()*1000);

// A list of google owned stun servers. Its better if I use my own instead.
const iceServers = [
  {"urls":"stun:stun.l.google.com:19302"},
  {"urls":"stun:stun1.l.google.com:19302"},
  {"urls":"stun:stun2.l.google.com:19302"},
  {"urls":"stun:stun3.l.google.com:19302"},
  {"urls":"stun:stun4.l.google.com:19302"}
];
const configuration = {iceServers};
const streams = [];
let peerConnection;
let localChannel;
let selectedUserId;

/**
 * Displays a dialog message. This mostly acts as a helper method.
 * @param {string} msg
 */
function displayDialogMessage(msg) {
  const div = document.createElement('div');
  div.innerText = msg;
  dialogEl.appendChild(div);
  setTimeout(() => {
    div.parentNode.removeChild(div);
  }, 10000);
}

/**
 * Adds a user to the DOM and renders a dialog if the user is new.
 * @param {number} userId
 * @param {boolean=} isNewUser
 */
function addUser(userId, isNewUser = false) {
  const li = document.createElement('li');
  li.id = userId;

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'user';
  radio.value = userId;

  const span = document.createElement('span');
  span.innerText = userId;

  li.appendChild(radio);
  li.appendChild(span);
  usersEl.appendChild(li);

  if (isNewUser) {
    displayDialogMessage(`${userId} joined`);
  }

  if (!selectedUserId) {
    selectedUserId = userId;
    radio.checked = true;
  }
}

/**
 * Adds an array of users to the dom.
 * @param {{userIds: !Array<number>, newUserId: number}} addUsersMessage
 */
function addUsers({userIds, userId: newUserId}) {
  userIds.forEach((userId) => {
    if (!document.getElementById(userId) && userId !== currentUserId) {
      addUser(userId, newUserId === userId);
    }
  });
}

/**
 * Removes a user from the DOM
 * @param {{userId: number}} removeUserMessage
 */
function removeUser({userId}) {
  const userEl = document.getElementById(userId);
  if (userEl) {
    userEl.parentNode.removeChild(userEl);
  }
  if (selectedUserId === userId) {
    selectedUserId = null;
  }
  displayDialogMessage(`${userId} left`);
}

/**
 * Requests UserMedia and adds the mediaStream track to the peerConnection.
 * @return {!Promise<undefined>}
 */
function startLocalVideo() {
  if (localVideoEl.srcObject) {
    return Promise.resolve();
  }
  // Note: Verify browser supports this, and catch failures.
  return navigator.mediaDevices.getUserMedia({video: true})
      .then((mediaStream) => {
        localVideoEl.srcObject = mediaStream;
        mediaStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, mediaStream);
        });
      });
}

/**
 * Create an SDP offer to a remote peerConnection.
 */
function createOffer() {
  peerConnection.createOffer().then((description) => {
    peerConnection.setLocalDescription(description);
    socket.emit(
        'offer',
        {description, from: currentUserId, to: selectedUserId});
  });
}

/**
 * Handles receiving an offer from a remote peerConnection. This offer
 * presumably includes MediaStream tracks that were already attached to the
 * remote peerConnection. Given this offer, we create an SDP answer.
 * @param {number} from - userId that sent the offer
 * @param {!RTCSessionDescription} description
 */
function receiveOffer({from, description}) {
  peerConnection.setRemoteDescription(description);
  startLocalVideo().then(() => {
    peerConnection.createAnswer().then((description) => {
      peerConnection.setLocalDescription(description);
      socket.emit('answer', {description, from: currentUserId, to: from});
    });
  });
}

/**
 * Handles receiving an answer back from a remote peerConnection. This answer
 * presumably includes MediaStream tracks from the remote peerConnection.
 * @param {!RTCSessionDescription} description
 */
function receiveAnswer({description}) {
  peerConnection.setRemoteDescription(description);
}

/**
 * Handles receiving an IceCandidate from a remote peerConnection.
 * @param {!Object} candidate
 */
function receiveIceCandidate({candidate}) {
  const iceCandidate = new RTCIceCandidate({
    sdpMLineIndex: candidate.sdpMLineIndex,
    candidate: candidate.candidate
  });
  peerConnection.addIceCandidate(iceCandidate);
}

socket.emit('login', currentUserId);
socket.emit('join', currentUserId);
userIdEl.innerText = currentUserId;

socket.on('join', addUsers);
socket.on('leave', removeUser);
socket.on('receivedMessage', (msg) => {
  websocketReceiveEl.value = `${msg}\n${websocketReceiveEl.value}`;
});

// PeerConnection related
socket.on('receivedOffer', receiveOffer);
socket.on('receivedAnswer', receiveAnswer);
socket.on('receivedIceCandidate', receiveIceCandidate);

usersEl.addEventListener('change', (ev) => {
  selectedUserId = parseInt(ev.target.value, 10);
});

// Sends a text message to a different client.
sendWebsocketEl.addEventListener('click', () => {
  const message = websocketSendEl.value;
  socket.emit('message', {message, from: currentUserId, to: selectedUserId});
  websocketReceiveEl.value = `You: ${message}\n${websocketReceiveEl.value}`;

  websocketSendEl.value = '';
  websocketSendEl.focus();
});

window.addEventListener('beforeunload', () => {
  socket.emit('leave', currentUserId);
  peerConnection.close();
});

/**
 * The following items are related to RTCPeerConnection events.
 */
peerConnection = new RTCPeerConnection(configuration);
peerConnection.addEventListener('icecandidate', (ev) => {
  if (ev.candidate) {
    const candidate = ev.candidate;
    socket.emit(
        'iceCandidate',
        {candidate, from: currentUserId, to: selectedUserId});
  }
});
peerConnection.addEventListener('iceconnectionstatechange', (ev) => {
  console.log(ev.currentTarget.iceConnectionState);
  if (ev.currentTarget.iceConnectionState === 'disconnected') {
    Array.from(document.querySelectorAll('.remoteVideo')).forEach((video) => {
      video.parentNode.removeChild(video);
    });
  }
});
peerConnection.addEventListener('track', (ev) => {
  // This is almost definitely not the right way to do things. This may or may
  // not be related.. but when I open multiple peerConnections, things fall apart.
  ev.streams.forEach((stream) => {
    if (streams.indexOf(stream) !== -1) {
      return
    }
    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('autoplay', 'true');
    video.setAttribute('playsinline', 'true'); // Needed for iPhone to work.
    video.className = 'remoteVideo';
    videosEl.appendChild(video);
    streams.push(stream);
  });
});

// "Calls" a different client by creating and sending an offer.
call.addEventListener('click', () => {
  // Start video first, so that its included in the offer.
  startLocalVideo().then(createOffer);
});


/**
 * The following items are related to data channel. While sending/receiving to
 * the DataChannel is not necessary for creating a video chat... its super
 * helpful to see if local/remote peer connections are established.
 */
localChannel = peerConnection.createDataChannel('sendDataChannel', null);
localChannel.addEventListener('open', (ev) => {
  console.log('DataChannel open', ev);
  sendDatachannelEl.disabled = false;
});
localChannel.addEventListener('close', () => {
  console.log('DataChannel close');
  sendDatachannelEl.disabled = true;
});


peerConnection.addEventListener('datachannel', (ev) => {
  const remoteDatachannel = ev.channel;
  remoteDatachannel.addEventListener('message', (ev) => {
    dataChannelReceiveEl.value = ev.data;
  });
});

sendDatachannelEl.addEventListener('click', () => {
  const data = dataChannelSendEl.value;
  if (localChannel.readyState !== 'open') {
    return;
  }
  localChannel.send(data);
  dataChannelSendEl.value = '';
});
