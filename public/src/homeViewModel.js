/**
 * @fileoverview Manages the HomeView of the application. this should only map
 * to presentation logic.
 */

import {leave, join, sendMessage, onSignal} from './signaling';
import {acceptOffer, createOffer, sendDatachannelMsg, onConnectionUpdate} from "./connection";
import Vue from 'vue';

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

/**
 *
 * @param {number} currentUserId
 * @return {!CombinedVueInstance<V extends Vue, Object, Object, Object, Record<never, any>>}
 */
export function loadHomeVM(currentUserId) {

  /**
   * This `data` object should act as the application's source of truth for all
   * things view related.
   */
  const vueData = {
    datachannelCount: 0,
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

  const vueInstance = new Vue({
    el: '#app',
    data: vueData,
    methods: {
      onAnswerOfferClick: function() {
        vueData.isOfferDialogActive = false;
        acceptOffer(this.offeringUser, this.pendingSdp);
      },
      onCallClick: function() {
        createOffer(this.selectedUserId);
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
        sendDatachannelMsg(message);
        this.receivedDatachannelMsg = `You: ${message}\n${this.receivedDatachannelMsg}`;
        this.datachannelMsg = '';
        this.$refs.datachannelMsg.focus();
      },
      onSendWebsocketMsgClick: function() {

        const message = this.websocketMsg;
        sendMessage(this.selectedUserId, message);
        this.receivedWebsocketMsg = `You -> ${this.selectedUserId}: ${message}\n${this.receivedWebsocketMsg}`;
        this.websocketMsg = '';
        this.$refs.websocketMsg.focus();
      },
    }
  });

  onSignal(({type, payload}) => {
    switch (type) {
      case 'join':
        let {userIds} = payload;
        vueData.otherUsers = [...userIds]
            .filter((userId) => userId !== vueData.userId)
            .map((id) => ({id}));

        if (!vueData.selectedUserId && vueData.otherUsers.length) {
          vueData.selectedUserId = vueData.otherUsers[0].id;
        }
        break;
      case 'leave':
        let {userId} = payload;
        vueData.otherUsers = vueData.otherUsers.filter((user) => user.id !== userId);
        if (vueData.selectedUserId === userId) {
          vueData.selectedUserId = null;
        }
        break;
      case 'message':
        let {message} = payload;
        vueData.receivedWebsocketMsg = `${message}\n${vueData.receivedWebsocketMsg}`;
        break;
      case 'offer':
        let {from, description} = payload;
        vueData.offeringUser = from;
        vueData.pendingSdp = description;

        vueData.isOfferDialogActive = true;
        break;
    }
  });

  onConnectionUpdate(({payload, type}) => {
    switch (type) {
      case 'addRemoteVideo':
        const remoteVideo = {stream: payload.stream, id: payload.userId};
        vueData.remoteVideos.push(remoteVideo);
        break;
      case 'connectLocalVideo':
        vueInstance.$refs.localVideo.srcObject = payload.mediaStream;
        break;
      case 'dataChannelClose':
        vueData.datachannelCount = payload.size;
        vueData.isDatachannelActive = false;
        break;
      case 'dataChannelMessage':
        const {message} = payload;
        vueData.receivedDatachannelMsg = `${message}\n${vueData.receivedDatachannelMsg}`;
        break;
      case 'dataChannelOpen':
        vueData.datachannelCount = payload.size;
        vueData.isDatachannelActive = true;
        break;
      case 'disconnectLocalVideo':
        vueData.localVideoSrcObject = null;
        break;
      case 'disconnectRemoteVideo':
        vueData.remoteVideos = vueData.remoteVideos
            .filter((remoteVideo) => remoteVideo.id !== payload.id);
        break;
    }
  });

  return vueInstance;
}

