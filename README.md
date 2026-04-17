# Gomoku Friends

A lightweight multiplayer Gomoku game you can share with friends.

## Features

- Create or join rooms with a short room code
- Real-time gameplay using Socket.IO
- Automatic win detection (five in a row)
- Password-protected undo (password: `1024`)
- Restart game support
- Mobile-friendly UI

## Local Run

Prerequisite: Node.js 18+.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000), create a room, and share the room code or copied URL.

## Share Online (Render Blueprint)

This repo includes `render.yaml`, so deployment is straightforward.

1. Push this project to your GitHub repository.
2. Open [Render](https://render.com/) and sign in.
3. Click `New` -> `Blueprint`.
4. Select your GitHub repository and deploy.
5. Wait for build to finish, then copy the generated URL (for example `https://xxx.onrender.com`).
6. Send this URL to your friend. They can open and play directly in browser.

Both players use the same website URL and the same room code.
