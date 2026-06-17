# HeroChat - WhatsApp-like Messaging and Calling Clone

HeroChat is a full-stack, secure, real-time messaging and peer-to-peer audio/video calling application. It features a modern obsidian-dark glassmorphism user interface with micro-interactions, responsive layouts, and robust connection recovery mechanisms.

## Tech Stack
- **Backend**: Node.js, Express, Socket.io (real-time events & WebRTC signaling), SQLite (via `sqlite3` for zero-configuration local database persistence)
- **Frontend**: React, Vite, Socket.io-client, Lucide React (icons)
- **Calling Protocol**: WebRTC (using standard browser native `RTCPeerConnection` and ICE STUN servers)

---

## Features
1. **User Authentication**: Secure registration and login using JWT and bcryptjs password hashing.
2. **Contact Search & Directory**: Dynamic search bar to lookup other registered users and add them to the contact history lists.
3. **Real-time Chatting**:
   - Send and receive messages instantly.
   - Message status indicators:
     - Single gray checkmark (✓): Sent (recipient offline, saved in SQLite DB).
     - Double gray checkmark (✓✓): Delivered (recipient online).
     - Double green checkmark (✓✓): Read (recipient actively viewing the chat).
   - Typing indicators ("typing...") dynamically sent to the peer.
4. **Presence Indicators**: Glowing green badges for active online users; gray badges for offline users.
5. **WebRTC Voice and Video Calling**:
   - Outgoing ringing and incoming accept/reject interfaces.
   - Live call duration timer logs.
   - Draggable floating picture-in-picture local video and full-screen remote video.
   - **Device Fallback**: Programmatically generates a synthetic video canvas animation and silent audio wave if no webcam/microphone is attached (ideal for headless server testing, VM testing, or virtual workspaces).
6. **Call Logs History**: Dynamic history tracking missed, connected, and rejected calls with call durations.

---

## Prerequisites
- **Node.js**: version `18.x` or above.
- **NPM**: version `9.x` or above.

---

## Installation & Setup

1. **Install all dependencies** across root, backend, and frontend directories:
   ```bash
   npm run install-all
   ```

2. **Start the applications**:
   ```bash
   npm start
   ```
   This command starts the backend Express server on port `5000` and the Vite React frontend on port `5173` concurrently.

3. **Open the App**:
   Navigate to [http://localhost:5173](http://localhost:5173) in your web browser.

---

## How to Test the App End-to-End

To test the application's real-time messaging, presence sync, and calling features on a single local machine:

1. **Launch two sessions**:
   - Open [http://localhost:5173](http://localhost:5173) in a standard browser window (e.g. Chrome).
   - Open [http://localhost:5173](http://localhost:5173) in an Incognito/Private window (or a different browser like Edge/Firefox).

2. **Create two accounts**:
   - On the first tab, register a new user: username `alice`, password `password123`, display name `Alice`.
   - On the second tab, register another user: username `bob`, password `password123`, display name `Bob`.

3. **Connect the users**:
   - In **Alice's** panel, type `bob` in the search bar.
   - Select `Bob` from the search results. This automatically inserts Bob as a contact and initializes an active chat window.

4. **Test Real-Time Chatting**:
   - Type a message on Alice's side and press Send. It appears on Bob's screen instantly with double checkmarks.
   - Notice the green presence badge showing Bob is online.
   - Type in Bob's text box; Alice will see a glowing green `typing...` indicator.
   - Close Bob's tab. Send a message from Alice. The message will show a single checkmark (✓), denoting it is saved in the database but offline.
   - Reopen Bob's tab and log back in. The message is synced instantly, and Alice's screen updates the message checkmark to double checkmarks (✓✓).

5. **Test Audio/Video Calling**:
   - In Alice's chat window, click the **Video Call** or **Voice Call** icon at the top right.
   - Alice will see a ringing card ("Ringing...").
   - Bob will receive a full-screen overlay panel showing an incoming call from Alice with Acceptance and Rejection controls.
   - Click **Accept** on Bob's side.
   - The WebRTC connection will establish. You will see the video feeds (or the synthetic pulsing visual streams if no camera exists) and a call duration timer.
   - Press the **Mute** or **Camera Off** icons to toggle streams, and click the red **PhoneOff** button to hang up.
   - Go to the **Calls** tab in the sidebar on either side to review the call logs history.
