'use strict';

const Hapi = require('hapi');
const Inert = require('inert');
const Path = require('path');

// Create a server with a host and port
const server = Hapi.server({
  host: 'localhost',
  port: '3000',
  routes: {
    files: {
      relativeTo: Path.join(__dirname, 'public')
    }
  }
});

// Start the server
async function start() {

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
