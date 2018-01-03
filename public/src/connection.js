/**
 *
 */

import {onSignal, sendAnswer, sendIceCandidate, sendOffer} from './signaling';


// A list of google owned stun servers.
// TODO: Make my own stun server instead.
const iceServers = [
  {"urls":"stun:stun.l.google.com:19302"},
  {"urls":"stun:stun1.l.google.com:19302"},
  {"urls":"stun:stun2.l.google.com:19302"},
  {"urls":"stun:stun3.l.google.com:19302"},
  {"urls":"stun:stun4.l.google.com:19302"}
];
const configuration = {iceServers};
let peerConnections = [];
let dataChannels = [];
const dataChannelMap = [];
const peerConnectionMap = {};
let pendingIceCandidates = [];
const streams = [];
let localStream = null;


let listenEvents = [];
function dispatch(event) {
  listenEvents.forEach((fn) => fn(event));
}

/**
 * The following items are related to RTCPeerConnection events.
 * @param {number} userId
 * @return {!RTCPeerConnection}
 */
function createNewPeerConnection(userId) {
  const newPeerConnection = new RTCPeerConnection(configuration);

  newPeerConnection.addEventListener('icecandidate', (ev) => {
    if (ev.candidate) {
      const candidate = ev.candidate;
      sendIceCandidate(userId, candidate);
    }
  });
  newPeerConnection.addEventListener('iceconnectionstatechange', (ev) => {
    console.log(ev.currentTarget.iceConnectionState);
    if (ev.currentTarget.iceConnectionState === 'disconnected') {
      disconnectRemoteVideo(userId);
    }
  });
  newPeerConnection.addEventListener('track', (ev) => {
    // This is almost definitely not the right way to do things. This may or may
    // not be related.. but when I open multiple peerConnections, things break.
    ev.streams.forEach((stream) => {
      if (streams.indexOf(stream) !== -1) {
        return;
      }

      streams.push(stream);
      dispatch({
        payload: {userId, stream},
        type: 'addRemoteVideo'
      });
    });
  });

  if (localStream) {
    addMediaStreamToPeerConnection(localStream, newPeerConnection);
  }

  peerConnections.push(newPeerConnection);
  peerConnectionMap[userId] = newPeerConnection;


  // Always create a local channel to accompany the peer connection.
  createNewLocalChannel(newPeerConnection, userId);

  return newPeerConnection;
}

/**
 *
 * The following items are related to data channel. While sending/receiving to
 * the DataChannel is not necessary for creating a video chat... its super
 * helpful to see if local/remote peer connections are established.
 * @param {!RTCPeerConnection} peerConnection
 * @param {number} userId
 * @return {!RTCDataChannel}
 */
function createNewLocalChannel(peerConnection, userId) {
  const newLocalChannel =
      peerConnection.createDataChannel('sendDataChannel', null);
  newLocalChannel.addEventListener('open', (ev) => {
    dispatch({
      payload: {size: dataChannels.length},
      type: 'dataChannelOpen'
    });
  });
  newLocalChannel.addEventListener('close', () => {
    disconnectRemoteVideo(userId);
    dispatch({
      payload: {size: dataChannels.length},
      type: 'dataChannelClose'
    });
  });

  peerConnection.addEventListener('datachannel', (ev) => {
    const remoteDatachannel = ev.channel;
    remoteDatachannel.addEventListener('message', (ev) => {
      dispatch({
        payload: {message: ev.data},
        type: 'dataChannelMessage'
      });
    });
  });

  dataChannels.push(newLocalChannel);
  dataChannelMap[userId] = newLocalChannel;
  return newLocalChannel;
}

/**
 * Adds a media stream to an existing peer connection.
 * @param mediaStream
 * @param peerConnection
 */
function addMediaStreamToPeerConnection(mediaStream, peerConnection) {
  mediaStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, mediaStream);
  });
}

/**
 * Requests UserMedia and adds the mediaStream track to the peerConnection.
 * @return {!Promise<undefined>}
 */
function startLocalVideo() {
  if (localStream) {
    return Promise.resolve();
  }
  // Note: Verify browser supports this, and catch failures.
  return navigator.mediaDevices.getUserMedia({audio: true, video: true})
      .then((mediaStream) => {
        localStream = mediaStream;

        dispatch({
          payload: {mediaStream},
          type: 'connectLocalVideo'
        });

        // vueInstance.$refs.localVideo.srcObject = mediaStream;
        peerConnections.forEach((peerConnection) => {
          addMediaStreamToPeerConnection(mediaStream, peerConnection);
        });
      });
}

/**
 * Disconnects the video, removing video elements and removing tracks.
 */
function disconnectLocalVideo() {
  // Disable local video.
  localStream && localStream.getTracks().forEach((track) => {
    track.stop();
  });
  localStream = null;
  dispatch({
    payload: {},
    type: 'disconnectLocalVideo'
  });
}

/**
 * Disconnects a remote video, and if no other vidoes are connected,
 * disconnects the local video as well.
 * @param {number} userId
 */
function disconnectRemoteVideo(userId) {
  const peerConnection = peerConnectionMap[userId];
  const dataChannel = dataChannelMap[userId];

  if (!peerConnection) {
    return;
  }

  peerConnection.getRemoteStreams().forEach((stream) => {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  });

  peerConnectionMap[userId] = null;
  dataChannelMap[userId] = null;
  peerConnections = peerConnections.filter((pc) => pc !== peerConnection);
  dataChannels = dataChannels.filter((dc) => dc !== dataChannel);

  dispatch({
    payload: {id: userId},
    type: 'disconnectRemoteVideo'
  });

  if (!peerConnections.length) {
    disconnectLocalVideo();
  }
}

/**
 * Accepts an offer to connect to a peer.
 * @param {number} userId
 * @param {!RTCSessionDescription} description
 */
export function acceptOffer(userId, description) {
  startLocalVideo().then(() => {
    const peerConnection = createNewPeerConnection(userId);

    peerConnection.setRemoteDescription(description);

    if (pendingIceCandidates.length) {
      pendingIceCandidates.forEach((iceCandidate) => {
        peerConnection.addIceCandidate(iceCandidate);
      });
      pendingIceCandidates = [];
    }
    peerConnection.createAnswer().then((description) => {
      peerConnection.setLocalDescription(description);
      sendAnswer(userId, description);
    });
  });
}

/**
 * Creates an offer to connect to a peer.
 * @param {number} userId
 */
export function createOffer(userId) {
  startLocalVideo().then(() => {
    const peerConnection = createNewPeerConnection(userId);

    peerConnection.createOffer().then((description) => {
      peerConnection.setLocalDescription(description);
      sendOffer(userId, description);
    });
  });
}

/**
 * Disconnects open datachannel and peer connections.
 */
export function disconnect() {
  dataChannels.forEach((dataChannel) => dataChannel.close());
  peerConnections.forEach((peerConnection) => peerConnection.close());
}

export function sendDatachannelMsg(message) {
  dataChannels.forEach((datachannel) => {
    if (datachannel.readyState !== 'open') {
      return;
    }

    datachannel.send(message);
  });
}

/**
 * Handles adding functions to a pseudo event emitter.
 * @param {!Function} fn
 */
export function onConnectionUpdate(fn) {
  listenEvents.push(fn);
}

onSignal(({type, payload}) => {
  const {from} = payload;
  const peerConnection = peerConnectionMap[from];
  switch (type) {
    case 'answer':
      const {description} = payload;
      if (!peerConnection) {
        console.log('Answering a non existent peer connection');
        return;
      }
      peerConnection.setRemoteDescription(description);
      break;
    case 'iceCandidate':
      const {candidate} = payload;

      const iceCandidate = new RTCIceCandidate({
        sdpMLineIndex: candidate.sdpMLineIndex,
        candidate: candidate.candidate
      });

      if (!peerConnection || !peerConnection.getRemoteStreams().length) {
        pendingIceCandidates.push(iceCandidate);
        return;
      }
      peerConnection.addIceCandidate(iceCandidate);
  }
});