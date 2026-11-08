ReAggie - Aggie Remake
=======

[The frontend is this way](https://git.coom.tech/coomdev/reaggie-frontend)

This is the code for a backend compatible with Aggie's client.

Supports:
- Saving rooms in a database (happens every 10 second)
- Multiple sets with rots

Differences with Aggie that don't require fixing:
- Puzzle generation isn't limited to 4 images (requires client-side modifications to enable)
- Images in sets aren't resized, they are always full size;
- Antibot autoban (Allowed solve rates and movement rates)

Differences with Aggie that do require fixing:
- Desyncs issues (seem more frequent than on aggie)
- Possible recoverable crashes are occuring
- Puzzle generation algorithm generates significantly smaller pieces when the images have vastly different dimensions
- Board size algorithm might be different, especially noticable on multisets
- Timer is a bit fucky?

Future Features:
- Load balancing to better serve users on both main continents
- Split room creation and room handling in different processes, to make better use of threads (and makes load-balancing easier)

Features that require the frontend to be cleaned up:
- Basically everything


# Installing and running

## Install
clone this repo, then

`npm i`

`npm run build`

## Setup

Create a .env file with these settings

```
# path for the front page
FRONTENDPATH=[frontend path]/home
# path to the other pages
ROOMPATH=[frontend path]/room
# obvious
MONGOUSER=
# this is also used to authenticate with the /auth command
MONGOPASS=
# listening port for the web server
PORT=

## OPTIONAL ##
# only if behind cloudflare, used to purge content from caches
CF_AUTHKEY=
CF_EMAIL=
CF_ZONE=
# dump individual rooms log to individual files (can get messy)
DEBUG=true
# optional webhook receiving { sub, com } JSON; alerts are always stored locally and shown at /alerts
ALERT_WEBHOOK_URL=
```

Keep in mind that connections initiating from localhost are assumed to be the admin (so no /auth required). So properly configure whatever reverse proxy you're running on the same machine to properly expose the originating IP in `x-forwarded-for` (or enable `cf-connecting-ip` in cloudflare)

## Running

Either run as root (lol) or use the boot script

`gcc boot.c -o boot`
`./boot /usr/bin/node ./dist/main.js`

##### what does this do

It runs the `main` script as a ""privileged"" process: instead of being a real root process, it's ran inside of a namespace as root, so only processes inside that namespace will see it as root. Otherwise it will have the same privileges as whatever user it was originally ran as. It will also try to join whatever existing namespace there is.

##### why does this need root

To take advantage of multiprocessing, each room runs in its own process. There's just a master process that handles the front page, and incoming connections to rooms are handed off to the proper room process (when reading websocket messages).
The issue with node's mechanism for handing connections to other processes is that it works only towards child processes, meaning if I need to just update the master process code, as I have to restart the process, the incoming connections cannot be handed off back to the proper rooms, they become innaccessible, and have to be killed, causing everyone in the room to experience a disconnect and losing up to 30 seconds of progress.
This solution allows the room to reconnect to a new master process, but the mechanism to passing file descriptors relies on the `pidfd_open` and `pidfd_getfd` syscalls, making this project require certain privileges and Linux-only. Might work on a docker container on other OSes as it should use a light VM.

##### why didn't you just use send/recvmsg and SCM_RIGHTS
im a retard, no bully

Commands
========

New commands that differ from aggie:

## /votekick

Initiates a vote kick, requires 60% of the size of the room (number of unique IPs) at the time to kick whoever held the most pieces at the time it was started.

## /stop

Stops a votekick. Can only be done by the votekick initier or the room host.

## /vote

Add a vote to the votekick.

## /playlist

Displays the current minimum price required to add a song to the queue and the amount of currency you own.
You gain 1 currency each time you connect pieces.
The current minimum price is initialized to 5;

## /pladd [X] [URL]

X is a number to pay, must be greater than the current minimum price (so the first time it must be at least 6).
URL is a valid URL to a youtube video. 

The target audio stream size must be below 10 megabytes, more than 80 seconds and maximum of 6 minutes + 20 seconds.


Will append the audio stream pointed by URL at the end of the queue

The new current minimum price for the room will be set to X + 1

## /pljam [X] [URL]

Same as pladd, except that X must be over two times the current minimum price.

The current playing song will be stopped, put at the end of the queue, and the new song pointed by URL will be played immediately.

The new current minimum price for the room will be set to (X / 2) + 1

## /help

Prints additionnal commands not detailed here.