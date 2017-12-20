'use strict';

const dialogEl = document.getElementById('dialog');
const localVideoEl = document.getElementById('localVideo');
const messageEl = document.getElementById('message');
const remoteVideoEl = document.getElementById('remoteVideo');
const sendEl = document.getElementById('send');
const socket = io.connect();
const startVideoButtonEl = document.getElementById('startVideoButton');
const usersEl = document.getElementById('users');

// Temporary solution, this has a high probability of collusion.
const currentUserId = ~~(Math.random()*1000);
let selectedUserId;

/**
 * Displays a dialog message. This mostly acts as a helper method.
 * @param {string} msg
 */
function displayDialogMessage(msg) {
  const div = document.createElement('div');
  div.innerText = msg;
  dialogEl.append(div);
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
  displayDialogMessage(`${userId} left`);
}

function startLocalVideo() {
  // Note: Verify browser supports this, and catch failures.
  navigator.mediaDevices.getUserMedia({video: true})
      .then((mediaStream) => {
        localVideoEl.srcObject = mediaStream;
      });
}

socket.emit('login', currentUserId);
socket.emit('join', currentUserId);

socket.on('join', addUsers);
socket.on('leave', removeUser);
socket.on('receivedMessage', displayDialogMessage);

usersEl.addEventListener('change', (ev) => {
  selectedUserId = ev.target.value;
});

sendEl.addEventListener('click', () => {
  const message = messageEl.value;
  const userId = parseInt(selectedUserId, 10);
  socket.emit('message', {message, to: userId, from: currentUserId});
  messageEl.value = '';
});

startVideoButtonEl.addEventListener('click', startLocalVideo);

window.addEventListener('unload', () => {
  socket.emit('leave', currentUserId);
});
