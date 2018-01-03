/**
 * @fileoverview Manages the signaling layer of this application.
 * This component provides an interface to communicate with other users before
 * peer connections are linked.
 */

import io from 'socket.io-client';

const socket = io.connect();
const eventTypes = [
  'answer',
  'iceCandidate',
  'join',
  'leave',
  'message',
  'offer'
];
let listenEvents = [];
let currentUserId;

/**
 * Dispatches an event to our pseudo eventEmitter.
 * @param event
 */
function dispatch(event) {
  listenEvents.forEach((fn) => fn(event));
}

/**
 * Loop through the list of events.
 */
eventTypes.forEach((eventName) => {
  socket.on(eventName, (payload) => {
    console.log(eventName, payload);
    dispatch({
      payload,
      type: eventName
    });
  });
});

/**
 * Sends a RTCSessionDescription through our signaling channel.
 * @param {number} to
 * @param {!RTCSessionDescription} description
 */
export function sendAnswer(to, description) {
  socket.emit('answer', {description, from: currentUserId, to});
}

/**
 * Sends a RTCIceCandidate through our signaling channel.
 * @param {number} to
 * @param {!RTCIceCandidate} candidate
 */
export function sendIceCandidate(to, candidate) {
  socket.emit('iceCandidate', {candidate, from: currentUserId, to});
}

/**
 * Sends a message through our signaling channel.
 * @param {number} to
 * @param {string} message
 */
export function sendMessage(to, message) {
  socket.emit('message', {message, from: currentUserId, to});
}

/**
 * Sends a RTCSessionDescription through our signaling channel.
 * @param {number} to
 * @param {!RTCSessionDescription} description
 */
export function sendOffer(to, description) {
  socket.emit('offer', {description, from: currentUserId, to});
}

/**
 * Handles received signal (websocket) messages using a barebone event emitter.
 * @param {!Function} fn
 */
export function onSignal(fn) {
  listenEvents.push(fn);
}

/**
 * Logs a user into the application. Invoking this is required for the rest of
 * the application to work. Also a user can't login twice.
 *
 * From the server perspective, this maps a userId to a socket.
 * @param {number} userId
 */
export function login(userId) {
  if (currentUserId) {
    throw new Error('Login can only happen once per session');
  }
  currentUserId = userId;
  socket.emit('login', userId);
}

/**
 * Informs the server a user has joined. This is different from login in that
 * its intention is to inform other users of their presence.
 */
export function join() {
  if (!currentUserId) {
    throw new Error('Login is required to join');
  }
  socket.emit('join', currentUserId);
}

/**
 * Informs the server a user has left. This is invoked automatically on
 * window.unload.
 * TODO(tystark): Handle this when window.unload fails.... likely on the server
 */
export function leave() {
  if (!currentUserId) {
    return;
  }
  socket.emit('leave', currentUserId);
}
