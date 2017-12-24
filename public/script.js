'use strict';

const call = document.getElementById('call');
const dialogEl = document.getElementById('dialog');
const localVideoEl = document.getElementById('localVideo');
const messageEl = document.getElementById('message');
const remoteVideoEl = document.getElementById('remoteVideo');
const sendEl = document.getElementById('send');
const socket = io.connect();
const usersEl = document.getElementById('users');
const videosEl = document.getElementById('videos');

// Temporary solution, this has a high probability of collision.
const currentUserId = ~~(Math.random()*1000);
let selectedUserId;
let peerConnection;

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
  if (localVideo.srcObject) {
    return Promise.resolve();
  }
  // Note: Verify browser supports this, and catch failures.
  return navigator.mediaDevices.getUserMedia({video: true})
      .then((mediaStream) => {
        localVideoEl.srcObject = mediaStream;
        mediaStream.getTracks().forEach((track) => {
          peerConnection.addTrack(track);
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

socket.on('join', addUsers);
socket.on('leave', removeUser);
socket.on('receivedMessage', displayDialogMessage);

// PeerConnection related
socket.on('receivedOffer', receiveOffer);
socket.on('receivedAnswer', receiveAnswer);
socket.on('receivedIceCandidate', receiveIceCandidate);

usersEl.addEventListener('change', (ev) => {
  selectedUserId = parseInt(ev.target.value, 10);
});

sendEl.addEventListener('click', () => {
  const message = messageEl.value;
  socket.emit('message', {message, from: currentUserId, to: selectedUserId});
  messageEl.value = '';
});

call.addEventListener('click', () => {
  // Start video first, so that its included in the offer.
  startLocalVideo().then(createOffer);
});

window.addEventListener('beforeunload', () => {
  socket.emit('leave', currentUserId);
  peerConnection.close();
});

const servers = null;
peerConnection = new RTCPeerConnection(servers);
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
});

peerConnection.addEventListener('track', (ev) => {
  // This is almost definitely not the right way to do things. This may or may
  // not be related.. but when I open multiple peerConnections, things fall apart.
  ev.streams.forEach((stream) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('autoplay', 'true');
    videosEl.appendChild(video);
  });
});