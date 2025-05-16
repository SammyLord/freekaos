# freekaos: A Decentralized Communication Platform
***(Pronounced like "Free Chaos")***

Freekaos aims to be a decentralized communication platform, similar in spirit to Discord, built with Node.js for the server and a client-side application using plain HTML, CSS, and JavaScript. It emphasizes inter-instance communication and user control over data.

## Core Features (Current Implementation)

*   **Server & Client Architecture:**
    *   Node.js backend using Express.js and Socket.IO.
    *   Frontend built with HTML, CSS, and vanilla JavaScript, served by the Node.js server.
    *   Client-side user identification (`currentFKey`) uses a server-provided instance ID for better consistency in federated contexts.
*   **User Interface (UI):**
    *   Refreshed UI with improved styling for consistency, layout, and visual hierarchy using CSS variables.
*   **Real-time Chat (Global):**
    *   Text-based global chat room.
    *   Usernames for identification.
    *   Message persistence: Chat history is saved on the server (`messages.json`) and loaded on startup (prunes to the last 100 messages). Timestamps are included.
*   **Direct Messages (DMs):**
    *   **One-to-One Messaging:** Users can initiate direct message conversations with other users by clicking on their name in the user list.
    *   **DM Interface:** A dedicated DM view in the client allows users to switch between global chat, guild chat, and DMs.
    *   **Message Persistence:** DM history is saved on the server (`direct_messages.json`) and loaded when a DM conversation is opened (prunes to the last 200 messages per conversation).
    *   **Federated DMs:** DMs can be sent between users on different connected instances. The server handles relaying DM messages to the appropriate peer instance.
*   **User Management (Basic):**
    *   Users can set a username.
    *   Display of connected users (local and federated).
*   **Guilds and Channels:**
    *   **Guild Creation:** Users can create new guilds. Each new guild gets a default `#general` text channel.
    *   **Channel Creation:** Guild owners can create additional text channels within their guilds.
    *   **Guild Chat:** Users can send and receive messages within specific guild channels they are part of.
    *   **Persistence:** Guild structures, channels, and their messages are saved on the server (`guilds.json`).
    *   **Basic Message Federation:** Messages sent in guild channels are federated to directly connected peer instances.
    *   **Guild Invites (Intra-Instance):** Guild owners can generate single-use invite codes that other users on the same instance can use to join the guild.
*   **Federation & P2P Communication:**
    *   **Inter-Instance Connection:** Instances can connect to each other as peers based on a manual `peer_list.txt`.
    *   **Federated Global Chat:** Global chat messages from local clients are relayed to connected peer instances and displayed to their clients, indicating the origin instance.
    *   **Federated User List:** User lists are shared between connected instances.
*   **Administrative Controls:**
    *   **Word Blacklist:** Instance administrators can define a list of words/phrases in `word_blacklist.txt` that will be censored in chat messages (applies to global chat, guild chat, and DMs).
    *   **Instance Blacklist:** Instance administrators can define a list of peer instances in `instance_blacklist.txt` to block incoming/outgoing connections.
*   **Voice/Video Calls (WebRTC):**
    *   **Intra-Instance Calls:** Direct video/audio calls between users connected to the *same* server instance.
    *   **Federated Call Signaling:** Signaling messages for WebRTC (offers, answers, ICE candidates, rejections, hang-ups, busy status) are federated between instances, enabling calls between users on *different* connected instances.
    *   **Call Integration with DMs:** Users can initiate a video/audio call with their DM partner directly from the DM chat interface.

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
│   ├── messages.json             # Stores global chat message history
│   ├── guilds.json               # Stores guild and channel data, including messages
│   ├── direct_messages.json      # Stores direct message history
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

    The two instances should now connect to each other (you'll see logs in the server terminals). Chat messages, user lists, DMs, and calls should federate appropriately.

## Key Technologies

*   **Node.js:** JavaScript runtime for the server.
*   **Express.js:** Web application framework for Node.js.
*   **Socket.IO:** Enables real-time, bidirectional event-based communication.
    *   `socket.io` (server-side)
    *   `socket.io-client` (client-side and server-to-server peer connections)
*   **WebRTC:** For peer-to-peer voice/video calls directly between clients, orchestrated by the server(s).
*   **HTML5, CSS3, Vanilla JavaScript:** For the client-side user interface.

## Current Status & Next Steps

Core functionality for global chat, user lists, administration, federated WebRTC calls, basic guild features (creation, channels, chat, intra-instance invites), and Direct Messages (DMs) with call integration is implemented. The UI has undergone an initial refresh for better consistency and appearance.

The immediate next steps involve:
*   Thorough testing of all features, especially federated DMs, calls from DMs, and guild interactions across instances.
*   Refining UI/UX elements, particularly for DM notifications (e.g., unread indicators) and guild owner controls.

Further development could include:
*   User accounts with persistent identities (beyond session-based usernames).
*   Full federation of guild structures (creation, deletion, channel changes) and memberships, including federated guild invites.
*   More robust error handling and UI/UX improvements across all features.
*   Encryption for messages and calls.
*   A more dynamic peer discovery mechanism instead of a manual `peer_list.txt`.
*   Support for file sharing in DMs and guild channels.
*   Rich text formatting in messages. 