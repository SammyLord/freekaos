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
    *   **Major Overhaul (Discord/Slack-like Layout):**
        *   **Multi-Column Structure:** The client now features a multi-column layout:
            *   Far-left: Guilds navigation bar.
            *   Secondary panel: Displays channels (for selected guild) or DM-related information (when "Home" is selected). Also houses user settings access.
            *   Main content area: Displays the active chat (global, guild channel, or DM).
            *   Far-right: User list panel.
        *   **Modal-Driven Interactions:** Key actions are handled through modals:
            *   Username input on first launch.
            *   Creating and joining guilds.
            *   Initiating and managing WebRTC video/audio calls.
        *   **Client-Side Refactoring:** `client/script.js` has been significantly refactored to support the new UI:
            *   Updated DOM element references and modal management logic.
            *   Streamlined initial UI state management (`setInitialUIState`).
            *   Guild display (`renderGuilds`) and selection (`selectGuild`) in the new guilds navigation bar.
            *   Channel display (`renderChannels`) and selection (`selectChannel`) logic for the secondary panel.
            *   Global, guild, and DM chat rendering and form submissions are now managed within their respective views in the main content area.
            *   User list rendering (`renderUserList`) populates the right-hand user panel, with clicks initiating DMs.
            *   DM functionality (message rendering, history loading, unread indicators) is fully integrated with the new layout.
            *   WebRTC video call logic (media handling, peer connection setup, signaling via sockets) is integrated with the new video call modal.
            *   The secondary panel now dynamically shows channel lists or DM-related information based on guild selection.
*   **Real-time Chat (Global):**
    *   Text-based global chat room.
    *   Usernames for identification.
    *   Message persistence: Chat history is saved on the server (`messages.json`) and loaded on startup (prunes to the last 100 messages). Timestamps are included.
*   **Direct Messages (DMs):**
    *   **One-to-One Messaging:** Users can initiate direct message conversations with other users by clicking on their name in the user list.
    *   **DM Interface:** A dedicated DM view in the client allows users to switch between global chat, guild chat, and DMs.
    *   **Message Persistence:** DM history is saved on the server (`direct_messages.json`) and loaded when a DM conversation is opened (prunes to the last 200 messages per conversation).
    *   **Federated DMs:** DMs can be sent between users on different connected instances. The server handles relaying DM messages to the appropriate peer instance.
    *   **Unread DM Indicators:** The client UI now visually indicates unread DMs, both on the "Direct Messages" tab and next to specific users in the user list.
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
    *   **Dynamic Peer Discovery & Connection:**
        *   Instances can bootstrap connections using an optional `config/bootstrap_nodes.txt` file.
        *   Connected peers share lists of their active peer connections (instance IDs) with each other (gossip mechanism) to facilitate broader network discovery.
        *   The server attempts to connect to discovered, non-blacklisted peers. Discovered peers are *not* automatically written to any local configuration file by the server.
    *   **Federated Global Chat:** Global chat messages from local clients are relayed to connected peer instances and displayed to their clients, indicating the origin instance.
    *   **Federated User List:** User lists are shared between connected instances.
*   **Administrative Controls:**
    *   **Word Blacklist:** Instance administrators can define a list of words/phrases in `word_blacklist.txt` that will be censored in chat messages (applies to global chat, guild chat, and DMs).
    *   **Peer Blacklist (`peer_blacklist.txt`):** Instance administrators can define a list of peer instance addresses (e.g., `instance_at_3002`, `another.host.com:4000`) in `peer_blacklist.txt`. This file acts as a persistent blacklist to prevent connections *to or from* these specified peers, regardless of whether they are manually added for bootstrapping or discovered via gossip. It is *not* a list of peers to actively connect to.
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
│       ├── word_blacklist.txt      # List of words to censor
│       ├── peer_blacklist.txt      # List of peer instance addresses to always block
│       └── bootstrap_nodes.txt     # Optional list of initial peer addresses for discovery
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
    *   **Bootstrap Nodes (`server/config/bootstrap_nodes.txt`):** Create this file and add the addresses of other freekaos instances you want to initially connect to for peer discovery, one per line (e.g., `localhost:3002`, `peer.example.com:3001`). If this file is empty or absent, the instance will start passively, relying on incoming connections or manual API calls (if developed) to join the network.
    *   **Peer Blacklist (`server/config/peer_blacklist.txt`):** Create or edit this file to add peer instance addresses (e.g., `localhost:3003`, `spammer.instance.com:3001`) that your instance should *never* connect to, nor accept connections from. This list is checked against both bootstrap nodes and peers discovered through gossip.
    *   **Word Blacklist:** Edit `server/config/word_blacklist.txt` to add words/phrases to censor (one per line, lines starting with `#` are ignored).
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

Core functionality for global chat, user lists, administration, federated WebRTC calls, basic guild features (creation, channels, chat, intra-instance invites), Direct Messages (DMs) with call integration and unread indicators, and a dynamic peer discovery mechanism is implemented. The UI has undergone an initial refresh and a subsequent major overhaul to a multi-column, modal-driven design, with significant refactoring of the client-side JavaScript to support this new structure.

The immediate next steps involve:
*   Thorough testing of all features within the new UI, especially:
    *   Interactions within the secondary panel (channel selection, DM info display when "Home" guild is selected).
    *   All modal workflows (username, guilds, video calls).
    *   Federated DMs, calls from DMs, and guild interactions across instances.
    *   Dynamic peer discovery.
*   Refining UI/UX elements, particularly for guild owner controls within the new layout, and ensuring the user info panel is functional.
*   Implementing content switching for the secondary panel (e.g., showing a list of recent DMs or DM instructions when "Home" is selected, and a user profile/settings area).

Further development could include:
*   User accounts with persistent identities (beyond session-based usernames).
*   Full federation of guild structures (creation, deletion, channel changes) and memberships, including federated guild invites.
*   More robust error handling and UI/UX improvements across all features.
*   Encryption for messages and calls.
*   Support for file sharing in DMs and guild channels.
*   Rich text formatting in messages. 