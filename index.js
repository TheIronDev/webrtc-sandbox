'use strict';

const Hapi = require('hapi');
const Inert = require('inert');
const Path = require('path');
const socketIO = require('socket.io');
const webpack = require("webpack");
const webpackConfig = require('./webpack.config');

webpack(webpackConfig, (err, stats) => {
  if (err || stats.hasErrors()) {
      console.log('Serverside error: ', err)
  }
});

// Create a server with a host and port
const server = Hapi.server({
  host: 'localhost',
  port: process.env.PORT || 8081,
  routes: {
    files: {
      relativeTo: Path.join(__dirname, 'public')
    }
  }
});

// Start the server
async function start() {

  const io = socketIO(server.listener);
  let users = {};
  let userIds = [];

  io.on('connection', (socket) => {

    // The login event binds the socket id to the userId for private messaging.
    socket.on('login', (userId) => {
      users[userId] = socket.id;
    });

    socket.on('join', (userId) => {
      userIds = userIds.filter((user) => user !== userId);
      userIds.push(userId);
      io.emit('join', {userIds, userId});
    });

    socket.on('leave', (userId) => {
      userIds = userIds.filter((user) => user !== userId);
      io.emit('leave', {userIds, userId});
    });

    socket.on('message', ({from, to, message}) => {
      // Send a private message.
      socket.to(users[to]).emit('message', {from, message: `${from} -> You: ${message}`});
    });

    socket.on('offer', ({from, to, description}) => {
      socket.to(users[to]).emit('offer', {from, description});
    });

    socket.on('answer', ({from, to, description}) => {
      socket.to(users[to]).emit('answer', {from, description});
    });

    socket.on('iceCandidate', ({from, to, candidate}) => {
      socket.to(users[to]).emit('iceCandidate', {from, candidate});
    });
  });

  await server.register(Inert);

  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: '.',
        redirectToSlash: true,
        index: true,
      }
    }
  });

  try {
    await server.start();
  }
  catch (err) {
    console.log(err);
    process.exit(1);
  }

  console.log('Server running at:', server.info.uri);
};

start();
