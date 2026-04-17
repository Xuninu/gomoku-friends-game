# Gomoku Friends

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Xuninu/gomoku-friends-game)

A lightweight multiplayer Gomoku game you can share with friends.

## Features

- Create or join rooms with a short room code
- Real-time gameplay using Socket.IO
- Automatic win detection (five in a row)
- Password-protected undo (password: `1024`)
- Restart game support
- Mobile-friendly UI

## One-Click Deploy

1. Open this repository README and click `Deploy to Render`.
2. Sign in to Render and confirm the Blueprint deploy.
3. Wait for build completion and copy your service URL (for example `https://xxx.onrender.com`).
4. Send that URL to your friend.

Your friend only needs a browser, with no extra setup.

## Local Run

Prerequisite: Node.js 18+.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000), create a room, and share the room code or copied URL.
