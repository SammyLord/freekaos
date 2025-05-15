# freekaos: A Decentralized Communication Platform

Freekaos aims to be a decentralized communication platform, similar in spirit to Discord, built with Node.js for both the server and client-side (utilizing plain HTML, CSS, and JavaScript). It emphasizes inter-instance communication and user control over data.

## Core Features (Current Implementation)

*   **Server & Client Architecture:**
    *   Node.js backend using Express.js and Socket.IO.
    *   Frontend built with HTML, CSS, and vanilla JavaScript, served by the Node.js server.
*   **Real-time Chat:**
    *   Text-based chat rooms.
    *   Usernames for identification.
    *   Message persistence: Chat history is saved on the server (`messages.json`) and loaded on startup (prunes to the last 100 messages). Timestamps are included.
*   **User Management (Basic):**
    *   Users can set a username.
    *   Display of connected users (local and federated).
*   **Federation & P2P Communication:**
    *   **Inter-Instance Connection:** Instances can connect to each other as peers based on a manual `peer_list.txt`.
    *   **Federated Chat:** Messages from local clients are relayed to connected peer instances and displayed to their clients, indicating the origin instance.
    *   **Federated User List:** User lists are shared between connected instances.
*   **Administrative Controls:**
    *   **Word Blacklist:** Instance administrators can define a list of words/phrases in `word_blacklist.txt` that will be censored in chat messages.
    *   **Instance Blacklist:** Instance administrators can define a list of peer instances in `instance_blacklist.txt` to block incoming/outgoing connections.
*   **Voice/Video Calls (WebRTC):**
    *   **Intra-Instance Calls:** Direct video/audio calls between users connected to the *same* server instance.
    *   **Federated Call Signaling:** Signaling messages for WebRTC (offers, answers, ICE candidates, rejections, hang-ups, busy status) are federated between instances, enabling calls between users on *different* connected instances.

## Project Structure

```
freekaos/
├── client/                       # Frontend application
│   ├── index.html                # Main HTML file
│   ├── script.js                 # Client-side JavaScript
│   ├── style.css                 # CSS styles
│   └── package.json              # Client-side dependencies (e.g., socket.io-client)
├── server/                       # Backend application
│   ├── index.js                  # Main server logic
│   ├── messages.json             # Stores chat message history
│   ├── package.json              # Server-side dependencies (e.g., express, socket.io)
│   └── config/                   # Server configuration files
│       ├── instance_blacklist.txt  # List of banned instance hostnames/IPs
│       ├── peer_list.txt           # List of peer instance addresses (e.g., localhost:3002)
│       └── word_blacklist.txt      # List of words to censor
└── README.md                     # This file
```

## Setup and Running

### Prerequisites

*   **Node.js and npm:** Ensure you have Node.js (which includes npm) installed. You can download it from [nodejs.org](https://nodejs.org/).

### 1. Server Setup

1.  **Navigate to the server directory:**
    ```bash
    cd freekaos/server
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure (Optional but Recommended for Federation):**
    *   **Peer List:** Edit `server/config/peer_list.txt`. Add the addresses of other freekaos instances you want to connect to, one per line (e.g., `localhost:3002`).
    *   **Word Blacklist:** Edit `server/config/word_blacklist.txt` to add words/phrases to censor (one per line, lines starting with `#` are ignored).
    *   **Instance Blacklist:** Edit `server/config/instance_blacklist.txt` to add instance addresses (hostnames or IPs) to block.
4.  **Run the server:**
    ```bash
    node index.js
    ```
    By default, the server runs on port `3001`. You can specify a different port using the `PORT` environment variable:
    ```bash
    PORT=3000 node index.js
    ```

### 2. Client Access

Once the server is running (e.g., on `http://localhost:3001`):

1.  Open your web browser.
2.  Navigate to the server's address (e.g., `http://localhost:3001`). The server will serve the `client/index.html` file.

### 3. Running Multiple Instances (for Testing Federation)

1.  **Copy the Server (or run from the same codebase with a different port):**
    You can duplicate the `freekaos/server` directory or simply run a second instance from the original directory using a different port.
2.  **Start the first server (Instance A):**
    ```bash
    cd path/to/freekaos/server
    node index.js # Runs on default port 3001
    ```
    In its `server/config/peer_list.txt`, add the address of Instance B (e.g., `localhost:3002`).
3.  **Start the second server (Instance B):**
    Open a new terminal window.
    ```bash
    cd path/to/freekaos/server # Or path/to/copied_server_directory
    PORT=3002 node index.js # Runs on port 3002
    ```
    In its `server/config/peer_list.txt`, add the address of Instance A (e.g., `localhost:3001`).
4.  **Access Clients:**
    *   Instance A client: `http://localhost:3001`
    *   Instance B client: `http://localhost:3002`

    The two instances should now connect to each other (you'll see logs in the server terminals). Chat messages and user lists should federate, and you can attempt WebRTC calls between users on different instances.

## Key Technologies

*   **Node.js:** JavaScript runtime for the server.
*   **Express.js:** Web application framework for Node.js.
*   **Socket.IO:** Enables real-time, bidirectional event-based communication.
    *   `socket.io` (server-side)
    *   `socket.io-client` (client-side and server-to-server peer connections)
*   **WebRTC:** For peer-to-peer voice/video calls directly between clients, orchestrated by the server(s).
*   **HTML5, CSS3, Vanilla JavaScript:** For the client-side user interface.

## Current Status & Next Steps

The core functionality for chat, user lists, basic administration, and federated communication (including WebRTC signaling) is in place.
The immediate next step would be to thoroughly test the federated WebRTC call features, including call rejection, hang-ups, and busy states across instances.

Further development could include:
*   User accounts with persistent identities (beyond session-based usernames).
*   Group chats and guilds.
*   Friend systems.
*   More robust error handling and UI/UX improvements.
*   Encryption for messages and calls.
*   A more dynamic peer discovery mechanism instead of a manual `peer_list.txt`. 