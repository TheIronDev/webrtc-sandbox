# WebRTC Sandbox

A simple video chat application.

* [Project Url](https://theirondev.com/) (May get repurposed later...)
* [Load Balance Url](awseb-AWSEB-11A9E1ZX0CCF9-2076541077.us-west-2.elb.amazonaws.com)

## Motivation

The intent of this project is learn and play around with WebRTC. :+1:

## TODO:

- [ ] Turn / stun
- [ ] Prettier UI

## Architecture

The 20 foot pole to describe the architecture of this application is...
I'm using RTCPeerConnections to send/receive userMedia between users.

Individual components of this application include:

* `getUserMedia` - retrieves video/audio
* `RTCPeerConnection` - used to map connections between clients
  * Also contains extra information like connected userMedia.
* `WebSocket` - duplex communication channel
  * used to relay rtcpeerconnection `offer` / `answers` to other clients.


The general flow is:

**Local**

```
createPeerConnection
getUserMedia()
  createOffer()
    setLocalDescription
    emit('offer') // with websocket
```

**Remote**

```
receiveOffer() // with websocket
  setRemoteDescription()
  getUserMedia()
    createAnswer()
      setLocalDescription()
      emit('answer') // with websocket
```

**Local**

```
receiveAnswer() // with websocket
  setRemoteDescription()
```

Along with this flow, `iceCandidate` information is passed around
through websocket messages as well.

## Problems Encountered

### `Nginx 502 Bad Gateway`

Theres a *slew* of different reasons why this occurs. Root causes I encountered
were:

* NodeJS application was using wrong port, 8081 appears to be an nginx default.
* Wrong NodeJS version - AWS defaults to a `6.*.*` version of node, which may
  not be compatabile with `8.*.*` application that users new syntax.
    * In my case I was using `async` / `await`, which wouldn't even run.
      Checking logs found in ELB helped with this.
    * The fix is entirely on AWS side, updating `package.json` doesn't change
      anything when deploying an instance of th application.

### `Only secure origins are allowed`

When I was developing this project on localdev, nearly everything was working
end-to-end. But, on production environments the `getUserMedia` method would
fail because I was on an insecure `http` connection.

The fix was "simple", get on `https`. Doing that with elastic beanstalk... not
super simple. My particular setup involved working between Namecheap and AWS,
and I ran into a lot of hiccups.

I'm documenting the problems I encountered and the steps I took so that
hopefully someone (myself included) may be saved from a little bit of pain.

1. Custom Domain
  1. You need to assign a certificate to your application, but you don't own
     elasticbeanstalk.com, so you're likely stuck with getting a custom domain.
  1. Get a domain from anywhere, doesn't matter where, you're going to be
     updating dns records. to point to a load balancer.
1. SSL Certificate
  1. Get a certificate for your domain. There's a lot of resources on this,
     even some free resources too.
1. Upload your SSL Certificate with ACM
  1. Upload your certificate to ACM
  1. You may be given a code to verify using a CNAME record that may contain
     underscores. Namecheap apparently doesn't allow these value, but TXT
     records can act as a replacement for CNAME records.
1. Setup load balancer / add HTTPS port 443 listener
  1. https://colintoh.com/blog/configure-ssl-for-aws-elastic-beanstalk
  1. After this step, you should be able to hit your application with http and
     https.
1. Wire custom domain to load balancer
  1. Helpful link: http://techgenix.com/namecheap-aws-ec2-linux/
  1. NOTE: use the load balance url instead of the elastic beanstalk url
  1. NOTE: Add the ns records directly so you can add additional records.
  

### `Error during WebSocket handshake: Unexpected response code: 400`

After deploying my application and making sure the websocket connections were
working as expected, I saw this in my error console. It turns out one of the
reasons this appears is `socket.io` was not actually establishing a websocket
connection, and instead was falling back on polling.

The root cause had something to do with the nginx configuration.

The best *solution* I found was to update the following:

```
# ssh into my project.
sudo vim /etc/nginx/conf.d/00_elastic_beanstalk_proxy.conf
```

Making the following update:

```
 ...
 location / {
        ...
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        ...
```

Afterward, I ran the following:

```
sudo service nginx restart
```

And magically websocket connections were not getting degraded to polling. Yay!

## Development and forking

Contributions are always welcome, also feel free to fork this if you want to
do your own thing. :)

## License

MIT License

Copyright (c) 2017 Tyler Stark

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.