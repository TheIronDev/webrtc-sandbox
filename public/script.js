'use strict';

const answerOfferEl = document.getElementById('answerOffer');
const call = document.getElementById('call');
const dialogEl = document.getElementById('dialog');
const localVideoEl = document.getElementById('localVideo');
const offerDialogEl = document.getElementById('offerDialog');
const offerFromEl = document.getElementById('offerFrom');
const rejectOfferEl = document.getElementById('rejectOffer');
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
let pendingIceCandidates = [];
let senders = [];
let localStream;
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
    updateWebsocketButtons(true);
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
  if (!usersEl.children.length) {
    updateWebsocketButtons(false);
  }
  displayDialogMessage(`${userId} left`);
}

/**
 * Updates the ui of the websocket "call" and "message" buttons to be disabled
 * or enabled.
 * @param {boolean} isActive
 */
function updateWebsocketButtons(isActive) {
  if (isActive) {
    call.removeAttribute('disabled');
    sendWebsocketEl.removeAttribute('disabled');
  } else {
    call.setAttribute('disabled', 'disabled');
    sendWebsocketEl.setAttribute('disabled', 'disabled');
  }
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
        localStream = mediaStream;
        localVideoEl.srcObject = mediaStream;
        mediaStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, mediaStream);
        });
      });
}

/**
 * Renders a prompt to answer a call
 * @param {number} from
 * @return {Promise}
 */
function displayCallPrompt(from) {
  return new Promise((resolve, reject) => {
    offerFromEl.innerText = `Call From user: ${from}`;

    // Accept should start local video and send over an answer.
    answerOfferEl.onclick = () => {
      resolve();
      offerDialogEl.classList.remove('offerDialog_active');
    };

    // Reject click should simply close the dialog.
    rejectOfferEl.onclick = () => {
      reject();
      offerDialogEl.classList.remove('offerDialog_active');
    };
    offerDialogEl.classList.add('offerDialog_active');
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
  return displayCallPrompt(from).then(() => {
    peerConnection.setRemoteDescription(description);

    if (pendingIceCandidates.length) {
      pendingIceCandidates.forEach((iceCandidate) => {
        peerConnection.addIceCandidate(iceCandidate);
      });
      pendingIceCandidates = [];
    }
    startLocalVideo().then(() => {
      peerConnection.createAnswer().then((description) => {
        peerConnection.setLocalDescription(description);
        socket.emit('answer', {description, from: currentUserId, to: from});
      });
    });
  }).catch(() => {
    // User clicked "Reject"
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

  if (!peerConnection.getRemoteStreams().length) {
    pendingIceCandidates.push(iceCandidate);
    return;
  }
  peerConnection.addIceCandidate(iceCandidate);
}

/**
 * Disconnects the video, removing video elements and removing tracks.
 */
function disconnectVideo() {
  Array.from(document.querySelectorAll('.remoteVideo')).forEach((video) => {
    video.parentNode.removeChild(video);
  });

  // Disable local video.
  localStream && localStream.getTracks().forEach((track) => {
    track.stop();
  });
  localVideoEl.srcObject = null;

  senders.forEach((sender) => {
    peerConnection.removeTrack(sender);
  });


  // Lets start fresh and reset our peer connection and data channel.
  peerConnection = createNewPeerConnection();
  localChannel = createNewLocalChannel(peerConnection);
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

// "Calls" a different client by creating and sending an offer.
call.addEventListener('click', () => {
  // Start video first, so that its included in the offer.
  startLocalVideo().then(createOffer);
});

sendDatachannelEl.addEventListener('click', () => {
  const data = dataChannelSendEl.value;
  if (localChannel.readyState !== 'open') {
    return;
  }
  localChannel.send(data);
  dataChannelSendEl.value = '';
});

// Sends a text message to a different client.
sendWebsocketEl.addEventListener('click', () => {
  const message = websocketSendEl.value;
  socket.emit('message', {message, from: currentUserId, to: selectedUserId});
  websocketReceiveEl.value = `You: ${message}\n${websocketReceiveEl.value}`;

  websocketSendEl.value = '';
  websocketSendEl.focus();
});


/**
 * The following items are related to RTCPeerConnection events.
 * @return {!RTCPeerConnection}
 */
function createNewPeerConnection() {
  const newPeerConnection = new RTCPeerConnection(configuration);
  newPeerConnection.addEventListener('icecandidate', (ev) => {
    if (ev.candidate) {
      const candidate = ev.candidate;
      socket.emit(
          'iceCandidate',
          {candidate, from: currentUserId, to: selectedUserId});
    }
  });
  newPeerConnection.addEventListener('iceconnectionstatechange', (ev) => {
    console.log(ev.currentTarget.iceConnectionState);
    if (ev.currentTarget.iceConnectionState === 'disconnected') {
      disconnectVideo();
    }
  });
  newPeerConnection.addEventListener('track', (ev) => {
    // This is almost definitely not the right way to do things. This may or may
    // not be related.. but when I open multiple peerConnections, things break.
    ev.streams.forEach((stream) => {
      if (streams.indexOf(stream) !== -1) {
        return;
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
  return newPeerConnection;
}


/**
 *
 * The following items are related to data channel. While sending/receiving to
 * the DataChannel is not necessary for creating a video chat... its super
 * helpful to see if local/remote peer connections are established.
 * @param {!RTCPeerConnection} peerConnection
 * @return {!RTCDataChannel}
 */
function createNewLocalChannel(peerConnection) {
  const newLocalChannel =
      peerConnection.createDataChannel('sendDataChannel', null);
  newLocalChannel.addEventListener('open', (ev) => {
    console.log('DataChannel open', ev);
    sendDatachannelEl.disabled = false;
  });
  newLocalChannel.addEventListener('close', () => {
    console.log('DataChannel close');
    sendDatachannelEl.disabled = true;
    disconnectVideo();
  });

  peerConnection.addEventListener('datachannel', (ev) => {
    const remoteDatachannel = ev.channel;
    remoteDatachannel.addEventListener('message', (ev) => {
      dataChannelReceiveEl.value = ev.data;
    });
  });

  return newLocalChannel;
}


// Create a new peer connection at the start of the application
peerConnection = createNewPeerConnection();

// Create a new local channel at the start of the application.
localChannel = createNewLocalChannel(peerConnection);


window.addEventListener('beforeunload', () => {
  socket.emit('leave', currentUserId);
  localChannel.close();
  peerConnection.close();
});
