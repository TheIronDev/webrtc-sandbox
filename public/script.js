'use strict';

const socket = io.connect();

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
 * Start Application view specific logic. This should be fairly decoupled from
 * signaling and webrtc logic.
 */

/**
 * This `data` object should act as the application's source of truth for all
 * things view related.
 */
const vueData = {
  datachannelMsg: '',
  isDatachannelActive: false,
  isOfferDialogActive: false,
  localVideoSrcObject: null,
  offeringUser: null,
  otherUsers: [],
  pendingSdp: null,
  receivedDatachannelMsg: '',
  receivedWebsocketMsg: '',
  remoteVideos: [],
  selectedUserId: null,
  userId: currentUserId,
  websocketMsg: ''
};

Vue.component('user-list-item', {
  methods: {
    onSelectUserClick: function() {
      const userId = this.user.id;
      this.$emit('selectuser', userId);
    }
  },
  props: ['selectedUserId', 'user'],
  template: '<li class="userListItem" v-on:click="onSelectUserClick" v-bind:class="{userListItem_active: (user.id === selectedUserId)}">{{ user.id }}</li>'
});

Vue.component('remote-video', {
  mounted: function() {
    this.$el.srcObject = this.video.stream;
  },
  props: ['video'],
  template: '<video autoplay class="remoteVideo" playsinline></video>'
});

const vueInstance = new Vue({
  el: '#app',
  data: vueData,
  methods: {
    onAnswerOfferClick: function() {
      vueData.isOfferDialogActive = false;
      acceptOffer(this.offeringUser, this.pendingSdp);
    },
    onCallClick: function() {
      startLocalVideo().then(createOffer);
    },
    onRejectOfferClick: function() {
      vueData.isOfferDialogActive = false;
      this.pendingSdp = null;
    },
    onSelectUser: function (userId) {
      this.selectedUserId = userId;
    },
    onSendDatachannelMsgClick: function() {
      const message = this.datachannelMsg;
      if (localChannel.readyState !== 'open') {
        return;
      }
      localChannel.send(message);
      this.receivedDatachannelMsg = `You: ${message}\n${this.receivedDatachannelMsg}`;
      this.datachannelMsg = '';
      this.$refs.datachannelMsg.focus();
    },
    onSendWebsocketMsgClick: function() {

      const message = this.websocketMsg;
      socket.emit('message', {message, from: this.userId, to: this.selectedUserId});
      this.receivedWebsocketMsg = `You -> ${this.selectedUserId}: ${message}\n${this.receivedWebsocketMsg}`;
      this.websocketMsg = '';
      this.$refs.websocketMsg.focus();
    },
  }
});


/**
 * End view-specific logic. Everything beyond here should probably get moved to
 * an external module or something.
 */



/**
 * Adds an array of users
 * @param {{userIds: !Array<number>, newUserId: number}} addUsersMessage
 */
function addUsers({userIds}) {
  vueData.otherUsers = [...userIds]
      .filter((userId) => userId !== vueData.userId)
      .map((id) => ({id}));

  if (!vueData.selectedUserId && vueData.otherUsers.length) {
    vueData.selectedUserId = vueData.otherUsers[0].id;
  }
}

/**
 * Removes a user from the DOM
 * @param {{userId: number}} removeUserMessage
 */
function removeUser({userId}) {
  vueData.otherUsers = vueData.otherUsers.filter((user) => user.id !== userId);
  if (vueData.selectedUserId === userId) {
    vueData.selectedUserId = null;
  }
}

/**
 * Requests UserMedia and adds the mediaStream track to the peerConnection.
 * @return {!Promise<undefined>}
 */
function startLocalVideo() {
  if (vueData.localVideoSrcObject) {
    return Promise.resolve();
  }
  // Note: Verify browser supports this, and catch failures.
  return navigator.mediaDevices.getUserMedia({video: true})
      .then((mediaStream) => {
        localStream = mediaStream;
        vueInstance.$refs.localVideo.srcObject = mediaStream;
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
        {description, from: currentUserId, to: vueData.selectedUserId});
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
  vueData.offeringUser = from;
  vueData.pendingSdp = description;

  vueData.isOfferDialogActive = true;
}

/**
 *
 * @param from
 * @param description
 */
function acceptOffer(from, description) {
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
  vueData.localVideoSrcObject = null;

  senders.forEach((sender) => {
    peerConnection.removeTrack(sender);
  });


  // Lets start fresh and reset our peer connection and data channel.
  peerConnection = createNewPeerConnection();
  localChannel = createNewLocalChannel(peerConnection);
}

socket.emit('login', currentUserId);
socket.emit('join', currentUserId);

socket.on('join', addUsers);
socket.on('leave', removeUser);
socket.on('receivedMessage', (msg) => {
  vueData.receivedWebsocketMsg = `${msg}\n${vueData.receivedWebsocketMsg}`;
});

// PeerConnection related
socket.on('receivedOffer', receiveOffer);
socket.on('receivedAnswer', receiveAnswer);
socket.on('receivedIceCandidate', receiveIceCandidate);


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
          {candidate, from: currentUserId, to: vueData.selectedUserId});
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

      const remoteVideo = {stream, id: 1};
      vueData.remoteVideos.push(remoteVideo);
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
    vueData.isDatachannelActive = true;
  });
  newLocalChannel.addEventListener('close', () => {
    console.log('DataChannel close');
    vueData.isDatachannelActive = false;
    disconnectVideo();
  });

  peerConnection.addEventListener('datachannel', (ev) => {
    const remoteDatachannel = ev.channel;
    remoteDatachannel.addEventListener('message', (ev) => {
      vueData.receivedDatachannelMsg = `${ev.data}\n${vueData.receivedDatachannelMsg}`;
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
