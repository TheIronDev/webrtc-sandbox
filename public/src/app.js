/**
 * Webpack entry point
 */

import 'webrtc-adapter';
import {login, leave, join} from './signaling';
import {disconnect} from "./connection";
import {loadHomeVM} from './homeViewModel';

// Temporary solution, this has a high probability of collision.
const currentUserId = ~~(Math.random()*1000);

login(currentUserId);
join();


window.addEventListener('beforeunload', () => {
  leave();
  disconnect();
});

loadHomeVM(currentUserId);