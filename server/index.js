const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs'); // Added fs module
const ioClient = require('socket.io-client'); // For connecting to other instances

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3001;
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const WORD_BLACKLIST_FILE = path.join(__dirname, 'config/word_blacklist.txt');
const INSTANCE_BLACKLIST_FILE = path.join(__dirname, 'config/instance_blacklist.txt');
const PEER_LIST_FILE = path.join(__dirname, 'config/peer_list.txt');
const GUILDS_FILE = path.join(__dirname, 'guilds.json'); // Existing guilds file
const DMS_FILE = path.join(__dirname, 'direct_messages.json'); // New DMs file
let messages = [];
let users = {}; // Store socket.id -> username mapping
let wordBlacklist = [];
let instanceBlacklist = [];
let peerList = [];
let peerSockets = {}; // To store active outgoing connections to peers { 'address': socket }
let federatedUserDirectory = {}; // { "username@instanceId": { instanceId: "...", lastSeen: timestamp, localSocketId: "... (if local) } }
const OUR_INSTANCE_ID = `instance_at_${PORT}`; // Defined earlier for peer handshake

// New: Guilds and Channels
let guilds = {}; // { guildId: { id, name, ownerFKey, members: [userFKey], channels: { channelId: { id, name, type: 'text', messages: [] } }, invites: {} } }
let directMessages = {}; // New: { "sortedFKey1_sortedFKey2": [ {senderFKey, receiverFKey, content, timestamp, id} ] }

// Load word blacklist
function loadWordBlacklist() {
    try {
        if (fs.existsSync(WORD_BLACKLIST_FILE)) {
            const data = fs.readFileSync(WORD_BLACKLIST_FILE, 'utf8');
            wordBlacklist = data.split('\n').map(word => word.trim().toLowerCase()).filter(word => word.length > 0 && !word.startsWith('#'));
            console.log('Word blacklist loaded:', wordBlacklist.length, 'words');
        } else {
            console.log('Word blacklist file not found. No words blacklisted.');
            wordBlacklist = [];
        }
    } catch (err) {
        console.error('Error loading word blacklist:', err);
        wordBlacklist = [];
    }
}

// Watch word blacklist for changes
if (fs.existsSync(WORD_BLACKLIST_FILE)) {
    fs.watchFile(WORD_BLACKLIST_FILE, (curr, prev) => {
        console.log('Word blacklist file changed. Reloading...');
        loadWordBlacklist();
    });
} else {
    // If the file is created later, we won't automatically watch it with this simple setup.
    // For production, a more robust watcher would be needed (e.g., chokidar library).
    console.warn('Word blacklist file does not exist. It will not be watched for changes unless server restarts.');
}

loadWordBlacklist();

// Load instance blacklist
function loadInstanceBlacklist() {
    try {
        if (fs.existsSync(INSTANCE_BLACKLIST_FILE)) {
            const data = fs.readFileSync(INSTANCE_BLACKLIST_FILE, 'utf8');
            instanceBlacklist = data.split('\n').map(host => host.trim().toLowerCase()).filter(host => host.length > 0 && !host.startsWith('#'));
            console.log('Instance blacklist loaded:', instanceBlacklist.length, 'hosts:', instanceBlacklist);
        } else {
            console.log('Instance blacklist file not found. No instances blacklisted.');
            instanceBlacklist = [];
        }
    } catch (err) {
        console.error('Error loading instance blacklist:', err);
        instanceBlacklist = [];
    }
}
if (fs.existsSync(INSTANCE_BLACKLIST_FILE)) {
    fs.watchFile(INSTANCE_BLACKLIST_FILE, () => { console.log('Instance blacklist changed. Reloading...'); loadInstanceBlacklist(); });
} else {
    console.warn('Instance blacklist file does not exist. Will not be watched.');
}
loadInstanceBlacklist();

// Load peer list
function loadPeerListAndConnect() {
    try {
        if (fs.existsSync(PEER_LIST_FILE)) {
            const data = fs.readFileSync(PEER_LIST_FILE, 'utf8');
            const newPeerList = data.split('\n').map(peer => peer.trim()).filter(peer => peer.length > 0 && !peer.startsWith('#'));
            console.log('Peer list loaded:', newPeerList.length, 'peers ->', newPeerList);
            
            // Check for removed peers to disconnect
            for (const oldPeerAddress in peerSockets) {
                if (!newPeerList.includes(oldPeerAddress)) {
                    console.log(`Peer ${oldPeerAddress} removed from list. Disconnecting.`);
                    if (peerSockets[oldPeerAddress]) {
                        peerSockets[oldPeerAddress].disconnect();
                        delete peerSockets[oldPeerAddress];
                    }
                }
            }
            peerList = newPeerList;
        } else {
            console.log('Peer list file not found. No initial peers configured.');
            peerList = [];
            // Disconnect any existing peer connections if file is removed/emptied
            for (const peerAddress in peerSockets) {
                peerSockets[peerAddress].disconnect();
                delete peerSockets[peerAddress];
            }
        }
    } catch (err) {
        console.error('Error loading peer list:', err);
        peerList = [];
    }
    connectToPeers(); // Attempt to connect after loading/reloading
}

if (fs.existsSync(PEER_LIST_FILE)) {
    fs.watchFile(PEER_LIST_FILE, () => { 
        console.log('Peer list changed. Reloading and reconnecting peers...'); 
        loadPeerListAndConnect(); 
    });
} else {
    console.warn('Peer list file does not exist. Will not be watched.');
}
loadPeerListAndConnect(); // Initial load and connect

// Function to censor a message based on the word blacklist
function censorMessage(message) {
    let censoredMessage = message;
    for (const bannedWord of wordBlacklist) {
        // Escape special regex characters in the banned word for use in a RegExp constructor.
        const escapedBannedWord = bannedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
        // Construct the regex string for word boundary, then create the RegExp object.
        const regexString = `\\b${escapedBannedWord}\\b`;
        const regex = new RegExp(regexString, 'gi'); 
        censoredMessage = censoredMessage.replace(regex, '*'.repeat(bannedWord.length));
    }
    return censoredMessage;
}

// Load messages from file
function loadMessages() {
    try {
        if (fs.existsSync(MESSAGES_FILE)) {
            const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
            messages = JSON.parse(data);
            console.log('Messages loaded from file.');
        }
    } catch (err) {
        console.error('Error loading messages:', err);
    }
}

// Save messages to file
function saveMessages() {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
        // console.log('Messages saved to file.'); // Optional: can be noisy
    } catch (err) {
        console.error('Error saving messages:', err);
    }
}

// New: Load guilds from file
function loadGuilds() {
    try {
        if (fs.existsSync(GUILDS_FILE)) {
            const data = fs.readFileSync(GUILDS_FILE, 'utf8');
            guilds = JSON.parse(data);
            console.log('Guilds loaded from file.');
            // Ensure messages arrays exist for channels
            for (const guildId in guilds) {
                if (guilds[guildId].channels) {
                    for (const channelId in guilds[guildId].channels) {
                        if (!guilds[guildId].channels[channelId].messages) {
                            guilds[guildId].channels[channelId].messages = [];
                        }
                    }
                }
                // Ensure invites object exists
                if (!guilds[guildId].invites) {
                    guilds[guildId].invites = {};
                }
            }
        }
    } catch (err) {
        console.error('Error loading guilds:', err);
        guilds = {};
    }
}

// New: Save guilds to file
function saveGuilds() {
    try {
        fs.writeFileSync(GUILDS_FILE, JSON.stringify(guilds, null, 2));
        // console.log('Guilds saved to file.');
    } catch (err) {
        console.error('Error saving guilds:', err);
    }
}

// New: Load Direct Messages from file
function loadDirectMessages() {
    try {
        if (fs.existsSync(DMS_FILE)) {
            const data = fs.readFileSync(DMS_FILE, 'utf8');
            directMessages = JSON.parse(data);
            console.log('Direct Messages loaded from file.');
        } else {
            directMessages = {};
            console.log('Direct Messages file not found. Initializing empty DMs.');
        }
    } catch (err) {
        console.error('Error loading direct messages:', err);
        directMessages = {};
    }
}

// New: Save Direct Messages to file
function saveDirectMessages() {
    try {
        fs.writeFileSync(DMS_FILE, JSON.stringify(directMessages, null, 2));
        // console.log('Direct Messages saved to file.');
    } catch (err) {
        console.error('Error saving direct messages:', err);
    }
}

loadMessages();
loadGuilds(); // Load guilds on startup
loadDirectMessages(); // Load DMs on startup

// Function to broadcast the updated user list
function broadcastUserList() {
    io.emit('update user list', Object.values(users));
}

// Function to update and broadcast the combined user list
function broadcastFederatedUserList() {
    const userListForClients = Object.keys(federatedUserDirectory);
    io.emit('update user list', userListForClients);

    // Also inform peers about our local users (excluding peers themselves)
    const localUsersForPeers = {};
    for (const key in federatedUserDirectory) {
        if (federatedUserDirectory[key].instanceId === OUR_INSTANCE_ID && !key.startsWith('PEER:')) {
            localUsersForPeers[key] = { instanceId: OUR_INSTANCE_ID }; // Peers only need to know username@instance
        }
    }
    if (Object.keys(localUsersForPeers).length > 0) {
        // console.log('Broadcasting our local users to peers:', localUsersForPeers);
        for (const peerAddr in peerSockets) {
            if (peerSockets[peerAddr] && peerSockets[peerAddr].connected) {
                peerSockets[peerAddr].emit('peer_user_update', { users: localUsersForPeers });
            }
        }
    }
}

// Serve static files from the 'client' directory
app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
  // Serve the index.html from the client folder
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

function addFederatedWebRTCHandlersToPeerSocket(peerSocketConnection, peerInstanceId) {
    console.log(`Adding federated WebRTC handlers for peer: ${peerInstanceId} (socket: ${peerSocketConnection.id})`);

    peerSocketConnection.on('federated-webrtc-offer', (fdata) => {
        // fdata: { originalCallerFKey, targetFKey, offer }
        console.log(`Received federated-webrtc-offer via peer ${peerInstanceId} for target ${fdata.targetFKey} from ${fdata.originalCallerFKey}`);
        
        // Ensure the target is actually on this instance
        if (!fdata.targetFKey || !fdata.targetFKey.endsWith(`@${OUR_INSTANCE_ID}`)) {
            console.warn(`Federated offer received by ${OUR_INSTANCE_ID} but target ${fdata.targetFKey} is not for this instance. Ignoring.`);
            return;
        }
        const localTargetUsername = fdata.targetFKey.split('@')[0];
        const localTargetSocket = Object.values(io.sockets.sockets).find(s => s.username === localTargetUsername && federatedUserDirectory[fdata.targetFKey]?.localSocketId === s.id);
        
        if (localTargetSocket) {
            console.log(`Forwarding federated offer to local user ${localTargetUsername} (${localTargetSocket.id})`);
            localTargetSocket.emit('webrtc-offer', { // Emit standard event to local client
                offer: fdata.offer,
                fromUsername: fdata.originalCallerFKey.split('@')[0], // Show simple username for UI
                fromSocketId: null, // No direct local socket for the original federated caller
                fromFederatedKey: fdata.originalCallerFKey // Pass full origin key for client to store
            });
        } else {
            console.warn(`Federated offer received for ${fdata.targetFKey}, but target user ${localTargetUsername} not found locally on this instance.`);
            // Optionally, notify the originating peer that the user is no longer here.
        }
    });

    peerSocketConnection.on('federated-webrtc-answer', (fdata) => {
        // fdata: { originalAnswererFKey, targetFKey (original caller), answer }
        console.log(`Received federated-webrtc-answer via peer ${peerInstanceId} for target ${fdata.targetFKey} from ${fdata.originalAnswererFKey}`);

        if (!fdata.targetFKey || !fdata.targetFKey.endsWith(`@${OUR_INSTANCE_ID}`)) {
            console.warn(`Federated answer received by ${OUR_INSTANCE_ID} but target ${fdata.targetFKey} (original caller) is not for this instance. Ignoring.`);
            return;
        }
        const localTargetUsername = fdata.targetFKey.split('@')[0]; // Original caller is the target now
        const localTargetSocket = Object.values(io.sockets.sockets).find(s => s.username === localTargetUsername && federatedUserDirectory[fdata.targetFKey]?.localSocketId === s.id);
        
        if (localTargetSocket) {
            console.log(`Forwarding federated answer to local user ${localTargetUsername} (${localTargetSocket.id})`);
            localTargetSocket.emit('webrtc-answer', {
                answer: fdata.answer,
                fromSocketId: null,
                fromFederatedKey: fdata.originalAnswererFKey
            });
        } else { 
            console.warn(`Federated answer received for ${fdata.targetFKey}, but target (original caller) ${localTargetUsername} not found locally.`);
        }
    });

    peerSocketConnection.on('federated-webrtc-ice-candidate', (fdata) => {
        // fdata: { originalSenderFKey, targetFKey, candidate }
        // console.log(`Received federated-webrtc-ice-candidate via peer ${peerInstanceId} for ${fdata.targetFKey} from ${fdata.originalSenderFKey}`);

        if (!fdata.targetFKey || !fdata.targetFKey.endsWith(`@${OUR_INSTANCE_ID}`)) {
            // console.warn(`Federated ICE candidate received by ${OUR_INSTANCE_ID} but target ${fdata.targetFKey} is not for this instance. Ignoring.`);
            return;
        }
        const localTargetUsername = fdata.targetFKey.split('@')[0];
        const localTargetSocket = Object.values(io.sockets.sockets).find(s => s.username === localTargetUsername && federatedUserDirectory[fdata.targetFKey]?.localSocketId === s.id);
        
        if (localTargetSocket) {
            // console.log(`Forwarding federated ICE to local user ${localTargetUsername} (${localTargetSocket.id})`);
            localTargetSocket.emit('webrtc-ice-candidate', {
                candidate: fdata.candidate,
                fromSocketId: null, // No direct local socket for original federated sender
                fromFederatedKey: fdata.originalSenderFKey
            });
        } else {
            // console.warn(`Federated ICE candidate for ${localTargetUsername} not found locally.`);
        }
    });

    // TODO: Add handlers for federated versions of 'call-rejected', 'hang-up', 'call-busy'
    // e.g., peerSocketConnection.on('federated-call-rejected', (fdata) => { ... });
}

// New function to handle federated DM events from a peer
function addFederatedDMHandlersToPeerSocket(peerSocketConnection, peerInstanceId) {
    console.log(`Adding federated DM handlers for peer: ${peerInstanceId} (socket: ${peerSocketConnection.id})`);

    peerSocketConnection.on('federated_send_dm', ({ originalSenderFKey, targetUserFKey, messageObject }) => {
        console.log(`Received federated_send_dm from peer ${peerInstanceId} for target ${targetUserFKey} from ${originalSenderFKey}`);

        if (!targetUserFKey.endsWith(`@${OUR_INSTANCE_ID}`)) {
            console.warn(`Federated DM received by ${OUR_INSTANCE_ID} but target ${targetUserFKey} is not for this instance. Ignoring.`);
            return;
        }
        if (!messageObject || !messageObject.id || !messageObject.senderFKey || !messageObject.content) {
            console.warn(`Invalid messageObject in federated_send_dm from ${peerInstanceId}. Ignoring.`, messageObject);
            return;
        }

        // The messageObject.senderFKey should be originalSenderFKey.
        // The messageObject.receiverFKey should be targetUserFKey.
        // Ensure consistency if they differ, or trust the outer fields.
        // For now, let's ensure messageObject fields are correctly set if they are part of the message object sent.
        // The critical part is storing and delivering correctly.

        const conversationId = getDmConversationId(originalSenderFKey, targetUserFKey);
        if (!directMessages[conversationId]) {
            directMessages[conversationId] = [];
        }
        // Avoid duplicating if by some chance it was already stored (e.g. complex routing, though unlikely here)
        if (!directMessages[conversationId].find(m => m.id === messageObject.id)) {
            directMessages[conversationId].push(messageObject);
            if (directMessages[conversationId].length > 200) { // Prune DM history
                directMessages[conversationId].shift();
            }
            saveDirectMessages();
        }
        
        // Deliver to the local target user
        const localTargetUsername = targetUserFKey.split('@')[0];
        const localTargetSocket = Object.values(io.sockets.sockets).find(s => s.username === localTargetUsername && federatedUserDirectory[targetUserFKey]?.localSocketId === s.id);
        
        if (localTargetSocket) {
            console.log(`Forwarding federated DM to local user ${localTargetUsername} (${localTargetSocket.id})`);
            localTargetSocket.emit('receive_dm', { ...messageObject, conversationId });
        } else {
            console.warn(`Federated DM received for ${targetUserFKey}, but target user ${localTargetUsername} not found locally on this instance.`);
            // Message is saved. User will get it if they connect and load history.
        }
    });
}

// New function to handle federated guild-related events from a peer
function addFederatedGuildHandlersToPeerSocket(peerSocketConnection, peerInstanceId) {
    console.log(`Adding federated Guild handlers for peer: ${peerInstanceId} (socket: ${peerSocketConnection.id})`);

    peerSocketConnection.on('federated_guild_chat_message', ({ guildId, channelId, messageData }) => {
        // messageData is { userFKey, username, message, timestamp, instance (origin instance) }
        console.log(`Received federated_guild_chat_message from peer ${peerInstanceId} for guild ${guildId}, channel ${channelId}`);

        const guild = guilds[guildId];
        if (!guild) {
            console.warn(`Federated guild message for non-existent guild ${guildId} from peer ${peerInstanceId}. Ignoring.`);
            return;
        }
        const channel = guild.channels[channelId];
        if (!channel) {
            console.warn(`Federated guild message for non-existent channel ${channelId} in guild ${guildId} from peer ${peerInstanceId}. Ignoring.`);
            return;
        }

        // Add message to local store for this channel
        channel.messages.push(messageData);
        if (channel.messages.length > 100) {
            channel.messages.shift();
        }
        saveGuilds(); // Persist the new message

        // Broadcast to local clients of this instance who are members of this guild
        Object.values(io.sockets.sockets).forEach(localClientSocket => {
            if (localClientSocket.username && localClientSocket.username !== 'Anonymous' && !users[localClientSocket.id]?.startsWith('PEER:')) {
                const localUserFKey = `${localClientSocket.username}@${OUR_INSTANCE_ID}`;
                if (guild.members.includes(localUserFKey)) {
                    localClientSocket.emit('new guild chat message', { guildId, channelId, message: messageData });
                }
            }
        });
    });

    // TODO: Add handlers for other federated guild events (e.g., member join/leave, channel create/delete) if full guild sync is implemented
}

// Function to attempt connections to all configured peers
function connectToPeers() {
    console.log('Attempting to connect to configured peers...');
    peerList.forEach(peerAddress => {
        if (instanceBlacklist.includes(peerAddress.toLowerCase())) {
            console.log(`Peer ${peerAddress} is in instance blacklist. Skipping connection.`);
            return;
        }
        if (peerSockets[peerAddress] && peerSockets[peerAddress].connected) {
            // console.log(`Already connected to peer ${peerAddress}.`);
            return;
        }

        const fullPeerAddress = peerAddress.startsWith('http') ? peerAddress : `http://${peerAddress}`;
        console.log(`Attempting to connect to peer: ${fullPeerAddress}`);
        
        const peerSocket = ioClient(fullPeerAddress, {
            reconnectionAttempts: 3, 
            timeout: 5000,
            auth: { instanceId: OUR_INSTANCE_ID } // Send our instanceId during connection for handshake
        });

        peerSocket.on('connect', () => {
            console.log(`Successfully connected to (outgoing) peer instance: ${fullPeerAddress}`);
            // peerSockets[peerAddress] = peerSocket; // Store by the original address from peer_list.txt
                                                // Storing by actual connected URI or instanceId might be better.

            // Send a handshake message to identify this instance as a peer (already done by auth, but can do explicit too)
            peerSocket.emit('peer_handshake', { 
                instanceId: OUR_INSTANCE_ID, 
                address: `localhost:${PORT}`, // Our advertised address (simplification)
                version: '1.0.0' 
            });
        });

        peerSocket.on('peer_handshake_ack', (ackData) => {
            // ackData should contain { instanceId: theirInstanceId }
            console.log(`Outgoing peer handshake to ${fullPeerAddress} acknowledged by their instance: ${ackData.instanceId}`);
            peerSocket.instanceId = ackData.instanceId; // Store their instance ID on our socket object for them
            peerSockets[peerAddress] = peerSocket; // Now formally add to active peers by configured address

            // Add handlers for federated messages from this specific OUTGOING peer
            addFederatedWebRTCHandlersToPeerSocket(peerSocket, ackData.instanceId);
            addFederatedUserListHandlersToPeerSocket(peerSocket, ackData.instanceId); // Assuming this function exists or will be added
            addFederatedChatMessageHandlersToPeerSocket(peerSocket, ackData.instanceId); // Assuming this function exists or will be added
            addFederatedGuildHandlersToPeerSocket(peerSocket, ackData.instanceId); // Add guild handlers for outgoing peer
            addFederatedDMHandlersToPeerSocket(peerSocket, ackData.instanceId); // Add DM handlers for outgoing peer

            // Send our user list to the newly connected peer
            const localUsersForPeers = {};
            for (const key in federatedUserDirectory) {
                if (federatedUserDirectory[key].instanceId === OUR_INSTANCE_ID && !key.startsWith('PEER:')) {
                    localUsersForPeers[key] = { instanceId: OUR_INSTANCE_ID };
                }
            }
            if (Object.keys(localUsersForPeers).length > 0) {
                peerSocket.emit('peer_user_update', { users: localUsersForPeers });
            }
        });

        peerSocket.on('connect_error', (err) => {
            console.warn(`Failed to connect to (outgoing) peer ${fullPeerAddress}: ${err.message}`);
            if (peerSockets[peerAddress]) delete peerSockets[peerAddress];
        });

        peerSocket.on('disconnect', (reason) => {
            console.log(`Disconnected from (outgoing) peer ${fullPeerAddress} (Instance: ${peerSocket.instanceId || 'N/A'}): ${reason}`);
            if (peerSockets[peerAddress]) delete peerSockets[peerAddress];
            // When an outgoing peer connection disconnects, we might want to remove users associated with its instanceId
            let changed = false;
            if (peerSocket.instanceId) {
                console.log(`Cleaning up users from disconnected outgoing peer instance: ${peerSocket.instanceId}`);
                for (const fKey in federatedUserDirectory) {
                    if (federatedUserDirectory[fKey].instanceId === peerSocket.instanceId) {
                        console.log(`Removing user ${fKey} due to outgoing peer disconnect.`);
                        delete federatedUserDirectory[fKey];
                        changed = true;
                    }
                }
            }
            if (changed) broadcastFederatedUserList();
        });
    });
}

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    // Emit the instance ID to the newly connected client
    socket.emit('instance_id_info', { instanceId: OUR_INSTANCE_ID });

    // By default, assume it's a client connection
    let isPeer = false;
    let peerAddress = null; // For identified peers

    // console.log('A new socket connected:', socket.id);

    socket.on('peer_handshake', (data) => {
        // 'data' might contain { instanceId: 'some_unique_id', address: 'their_advertised_address:port' }
        // For now, we can use the socket's remote address as a simple identifier
        const incomingPeerCandidateAddress = socket.handshake.address; // This might be ::1 or 127.0.0.1 for local
        // A more robust way would be for the peer to declare its address, but that requires trust or verification.
        
        console.log(`Received peer_handshake from ${socket.id} (address: ${incomingPeerCandidateAddress}), data:`, data);

        // Normalize the address for blacklist checking (e.g., remove port if blacklist is just hostnames)
        // For simplicity, let's assume instanceBlacklist contains host:port or just host.
        const remoteHost = (socket.handshake.address.includes('::ffff:') ? socket.handshake.address.split('::ffff:')[1] : socket.handshake.address).toLowerCase();

        let isBlacklisted = false;
        for (const blacklistedEntry of instanceBlacklist) {
            if (remoteHost.includes(blacklistedEntry) || (data && data.address && data.address.toLowerCase().includes(blacklistedEntry))) {
                isBlacklisted = true;
                break;
            }
        }

        if (isBlacklisted) {
            console.log(`Incoming peer connection from ${remoteHost} (socket ${socket.id}) is blacklisted. Disconnecting.`);
            socket.disconnect(true);
            return;
        }

        isPeer = true;
        peerAddress = (data && data.address) ? data.address : remoteHost; // Prefer declared address if provided and verified
        users[socket.id] = `PEER:${peerAddress}`;
        socket.username = `PEER:${peerAddress}`;
        console.log(`Socket ${socket.id} identified as INCOMING PEER: ${peerAddress}`);
        // Store the recognized peerAddress (their instance ID) on the socket object for this incoming connection.
        socket.instanceId = peerAddress; 

        addFederatedWebRTCHandlersToPeerSocket(socket, peerAddress); // peerAddress is their instance ID
        addFederatedUserListHandlersToPeerSocket(socket, peerAddress); // Placeholder
        addFederatedChatMessageHandlersToPeerSocket(socket, peerAddress); // Placeholder
        addFederatedGuildHandlersToPeerSocket(socket, peerAddress); // Add guild handlers for incoming peer
        addFederatedDMHandlersToPeerSocket(socket, peerAddress); // Add DM handlers for incoming peer

        broadcastFederatedUserList(); // Update lists
        socket.emit('peer_handshake_ack', { instanceId: OUR_INSTANCE_ID });
        // ... rest of handshake logic for incoming peers (like their user_update listeners) ...

        // TODO: Store this incoming peer socket for bi-directional communication if needed
        // peerSockets[peerAddress] = socket; // Careful: this might overwrite outgoing connections if keys collide
        // Need a more robust way to manage incoming vs outgoing peer sockets if addresses are the same.

        // Example: Acknowledge handshake
        socket.on('federated_chat_message', (messageData) => {
            console.log(`Received federated message from INCOMING peer ${peerAddress} (socket ${socket.id}):`, messageData);
            const displayMessage = { 
                ...messageData, 
                user: `${messageData.user}@${messageData.instance || peerAddress}`
            };
            io.emit('chat message', displayMessage); // Broadcast to local clients
            // Persist? messages.push(displayMessage); saveMessages(); 
        });

        // Handler for user list updates from this specific INCOMING peer
        socket.on('peer_user_update', (update) => {
            // update = { users: { "username@theirInstanceId": { instanceId: "..." } } }
            console.log(`Received peer_user_update from ${peerAddress}:`, Object.keys(update.users).length, 'users');
            let changed = false;
            for (const fKey in update.users) {
                if (!federatedUserDirectory[fKey] || federatedUserDirectory[fKey].instanceId !== update.users[fKey].instanceId) {
                    federatedUserDirectory[fKey] = { 
                        instanceId: update.users[fKey].instanceId, 
                        lastSeen: Date.now() 
                    };
                    changed = true;
                } else {
                    federatedUserDirectory[fKey].lastSeen = Date.now(); // Refresh lastSeen
                }
            }
            // Clean up users from this peer's instance that were not in the latest update (optional, needs careful handling)
            if (changed) broadcastFederatedUserList();
        });

        socket.on('peer_user_disconnect', (disconnectData) => {
            // disconnectData = { federatedKey: "username@theirInstanceId" }
            console.log(`Received peer_user_disconnect for ${disconnectData.federatedKey} from ${peerAddress}`);
            if (federatedUserDirectory[disconnectData.federatedKey]) {
                delete federatedUserDirectory[disconnectData.federatedKey];
                broadcastFederatedUserList();
            }
        });

        if (!isBlacklisted) {
            addFederatedWebRTCHandlersToPeerSocket(socket, peerAddress);
        }

        // New Guild/Channel Events
        socket.on('create guild', ({ guildName }) => {
            if (isPeer || !socket.username || socket.username === 'Anonymous') {
                socket.emit('guild creation error', { message: 'Authentication required to create guild.' });
                return;
            }
            if (!guildName || guildName.trim().length < 3) {
                socket.emit('guild creation error', { message: 'Guild name must be at least 3 characters.' });
                return;
            }

            const guildId = `guild_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const creatorFKey = `${socket.username}@${OUR_INSTANCE_ID}`;
            const defaultChannelId = `channel_general_${Date.now()}`;

            const newGuild = {
                id: guildId,
                name: guildName.trim(),
                ownerFKey: creatorFKey,
                members: [creatorFKey],
                channels: {
                    [defaultChannelId]: {
                        id: defaultChannelId,
                        name: 'general',
                        type: 'text',
                        messages: []
                    }
                }
            };
            guilds[guildId] = newGuild;
            saveGuilds();
            
            console.log(`User ${creatorFKey} created guild: ${guildName} (ID: ${guildId})`);

            // Notify the creator (and potentially broadcast to others later or send full list)
            socket.emit('guild created', { guild: newGuild });

            // For now, let's just send the updated list of guilds this user is part of
            const userGuilds = Object.values(guilds).filter(g => g.members.includes(creatorFKey));
            socket.emit('update guild list', { guilds: userGuilds });
        });

        socket.on('generate guild invite', ({ guildId }) => {
            if (isPeer || !socket.username || socket.username === 'Anonymous') {
                socket.emit('guild invite error', { guildId, message: 'Authentication required.' });
                return;
            }
            const userFKey = `${socket.username}@${OUR_INSTANCE_ID}`;
            const guild = guilds[guildId];

            if (!guild) {
                socket.emit('guild invite error', { guildId, message: 'Guild not found.' });
                return;
            }
            if (guild.ownerFKey !== userFKey) {
                socket.emit('guild invite error', { guildId, message: 'Only the guild owner can generate invites.' });
                return;
            }

            // Create a simple unique invite code
            const inviteCode = `invite_${guildId.substring(0,5)}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(-4)}`;
            
            if (!guild.invites) guild.invites = {};
            guild.invites[inviteCode] = { 
                code: inviteCode, // Store the code itself for easier reference if needed
                createdAt: Date.now(), 
                usesLeft: 1, // Single use for now
                createdBy: userFKey
            };
            saveGuilds();

            console.log(`User ${userFKey} generated invite code ${inviteCode} for guild ${guild.name}`);
            socket.emit('guild invite generated', { guildId, inviteCode });
        });

        socket.on('join guild with invite', ({ inviteCode }) => {
            if (isPeer || !socket.username || socket.username === 'Anonymous') {
                socket.emit('guild join error', { inviteCode, message: 'Authentication required.' });
                return;
            }
            const userFKey = `${socket.username}@${OUR_INSTANCE_ID}`;
            let foundGuild = null;
            let actualInviteCode = null;

            // Find the guild and the invite code
            for (const guildId in guilds) {
                if (guilds[guildId].invites && guilds[guildId].invites[inviteCode]) {
                    foundGuild = guilds[guildId];
                    actualInviteCode = guilds[guildId].invites[inviteCode];
                    break;
                }
            }

            if (!foundGuild || !actualInviteCode) {
                socket.emit('guild join error', { inviteCode, message: 'Invalid or expired invite code.' });
                return;
            }

            if (actualInviteCode.usesLeft <= 0) {
                socket.emit('guild join error', { inviteCode, message: 'Invite code has no uses left.' });
                // Optionally delete the invite code here if usesLeft is 0 and it wasn't caught by a prune
                delete foundGuild.invites[inviteCode];
                saveGuilds();
                return;
            }

            if (foundGuild.members.includes(userFKey)) {
                socket.emit('guild join info', { guildId: foundGuild.id, message: 'You are already a member of this guild.' });
                 // Still decrement use if they tried to use it, or not? For now, let's assume they didn't "use" it.
                return;
            }

            foundGuild.members.push(userFKey);
            actualInviteCode.usesLeft--;

            if (actualInviteCode.usesLeft <= 0) {
                delete foundGuild.invites[inviteCode]; // Remove single-use invite after use
            }
            saveGuilds();

            console.log(`User ${userFKey} joined guild ${foundGuild.name} using invite code ${inviteCode}`);
            socket.emit('guild join success', { guild: foundGuild });

            // Notify the joining user with their updated full list of guilds
            const userGuilds = Object.values(guilds).filter(g => g.members.includes(userFKey));
            socket.emit('update guild list', { guilds: userGuilds });

            // Notify all members of the guild about the structural update (new member)
            Object.values(io.sockets.sockets).forEach(s => {
                if (!s.username || s.username === 'Anonymous') return;
                const memberFKeyLoop = `${s.username}@${OUR_INSTANCE_ID}`;
                if (foundGuild.members.includes(memberFKeyLoop)) {
                    s.emit('guild structure updated', { guild: foundGuild });
                }
            });
        });

        socket.on('create channel', ({ guildId, channelName, channelType = 'text' }) => {
            if (isPeer || !socket.username || socket.username === 'Anonymous') {
                socket.emit('channel creation error', { guildId, message: 'Authentication required.' });
                return;
            }
            const userFKey = `${socket.username}@${OUR_INSTANCE_ID}`;
            const guild = guilds[guildId];

            if (!guild) {
                socket.emit('channel creation error', { guildId, message: 'Guild not found.' });
                return;
            }
            if (guild.ownerFKey !== userFKey) {
                socket.emit('channel creation error', { guildId, message: 'Only the guild owner can create channels.' });
                return;
            }
            if (!channelName || channelName.trim().length < 1) { // Allow shorter channel names like #g
                socket.emit('channel creation error', { guildId, message: 'Channel name must be at least 1 character.' });
                return;
            }
            // Prevent duplicate channel names within the same guild (case-insensitive check)
            const existingChannel = Object.values(guild.channels).find(ch => ch.name.toLowerCase() === channelName.trim().toLowerCase());
            if (existingChannel) {
                socket.emit('channel creation error', { guildId, message: `Channel '${channelName.trim()}' already exists in this guild.` });
                return;
            }

            const channelId = `channel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const newChannel = {
                id: channelId,
                name: channelName.trim(),
                type: channelType, // For now, only 'text' is truly supported
                messages: []
            };

            guild.channels[channelId] = newChannel;
            saveGuilds();

            console.log(`User ${userFKey} created channel '${newChannel.name}' in guild '${guild.name}' (ID: ${channelId})`);
            socket.emit('channel created', { guildId: guild.id, channel: newChannel });

            // Notify all members of the guild about the structural update
            Object.values(io.sockets.sockets).forEach(s => {
                if (!s.username || s.username === 'Anonymous') return;
                const memberFKeyLoop = `${s.username}@${OUR_INSTANCE_ID}`;
                if (guild.members.includes(memberFKeyLoop)) {
                    s.emit('guild structure updated', { guild });
                }
            });
        });

        socket.on('guild chat message', ({ guildId, channelId, message }) => {
            if (isPeer || !socket.username || socket.username === 'Anonymous') {
                // Silently ignore or emit an error, for now ignore for peers
                if(!isPeer) socket.emit('guild message error', { guildId, channelId, message: 'Authentication required.' });
                return;
            }
            const userFKey = `${socket.username}@${OUR_INSTANCE_ID}`;
            const guild = guilds[guildId];

            if (!guild) {
                if(!isPeer) socket.emit('guild message error', { guildId, channelId, message: 'Guild not found.' });
                return;
            }
            if (!guild.channels[channelId]) {
                if(!isPeer) socket.emit('guild message error', { guildId, channelId, message: 'Channel not found.' });
                return;
            }
            if (!guild.members.includes(userFKey)) {
                 if(!isPeer) socket.emit('guild message error', { guildId, channelId, message: 'You are not a member of this guild.' });
                return;
            }
            if (!message || message.trim() === '') {
                if(!isPeer) socket.emit('guild message error', { guildId, channelId, message: 'Message cannot be empty.' });
                return;
            }

            const originalMessage = message;
            const censoredText = censorMessage(originalMessage);
            const messageData = {
                userFKey: userFKey,
                username: socket.username, // For convenience on client
                message: censoredText,
                timestamp: new Date(),
                instance: OUR_INSTANCE_ID // Tagging local instance
            };

            const channelMessages = guild.channels[channelId].messages;
            channelMessages.push(messageData);
            if (channelMessages.length > 100) { // Prune to last 100 messages
                channelMessages.shift();
            }
            saveGuilds();

            console.log(`Guild Message in ${guild.name}/${guild.channels[channelId].name} from ${userFKey}: ${censoredText}`);

            // Broadcast to all members of the guild who are on this instance
            Object.values(io.sockets.sockets).forEach(s => {
                if (!s.username || s.username === 'Anonymous') return;
                const memberFKeyLoop = `${s.username}@${OUR_INSTANCE_ID}`;
                if (guild.members.includes(memberFKeyLoop)) {
                    s.emit('new guild chat message', { guildId, channelId, message: messageData });
                }
            });
            // TODO: Federate guild chat messages to members on other instances
            // Federate the guild message to connected peers
            console.log(`Federating guild message from ${userFKey} in ${guild.name}/${guild.channels[channelId].name} to ${Object.keys(peerSockets).length} peers.`);
            for (const peerAddr in peerSockets) {
                if (peerSockets[peerAddr] && peerSockets[peerAddr].connected) {
                    peerSockets[peerAddr].emit('federated_guild_chat_message', {
                        guildId,
                        channelId,
                        messageData // This already contains userFKey, username, message, timestamp, instance (origin)
                    });
                }
            }
        });

    });

    // If it's not identified as a peer after a short timeout, treat as a client.
    // This is a simple way; a more robust method would be needed for production.
    const peerHandshakeTimeout = setTimeout(() => {
        if (!isPeer) {
            // Standard client connection setup
            console.log('Socket connected (identified as client):', socket.id);
            users[socket.id] = 'Anonymous'; 
            socket.username = 'Anonymous';
            broadcastUserList();
            socket.emit('load all messages', messages);

            socket.on('set username', (username) => {
                const oldUserFKey = socket.username ? `${socket.username}@${OUR_INSTANCE_ID}` : null;
                if (oldUserFKey && federatedUserDirectory[oldUserFKey]) {
                    delete federatedUserDirectory[oldUserFKey];
                }
                if (users[socket.id] && users[socket.id].startsWith('PEER:')) { // Don't process for peers here
                    return;
                }

                socket.username = username; // Keep this for local convenience
                users[socket.id] = username; // Original map for local socket to username
                
                const federatedKey = `${username}@${OUR_INSTANCE_ID}`;
                federatedUserDirectory[federatedKey] = { instanceId: OUR_INSTANCE_ID, localSocketId: socket.id, lastSeen: Date.now() };
                console.log(`User ${socket.id} set username to: ${username}. Federated key: ${federatedKey}`);
                broadcastFederatedUserList();
            });

            socket.on('chat message', (data) => { 
                if (isPeer) return; 
                const originalMessage = data.message;
                const censoredText = censorMessage(originalMessage);
                const messageData = { user: socket.username, message: censoredText, timestamp: new Date(), instance: `local:${PORT}` }; // Tagging local instance
                console.log(`${socket.username} (local client): ${originalMessage} -> ${censoredText}`);
                
                messages.push(messageData);
                if (messages.length > 100) { messages.shift(); }
                saveMessages();
                
                // Broadcast to local clients
                io.emit('chat message', messageData); 

                // Federate to connected peers
                console.log(`Federating message to ${Object.keys(peerSockets).length} peers.`);
                for (const peerAddr in peerSockets) {
                    if (peerSockets[peerAddr] && peerSockets[peerAddr].connected) {
                        // Add a hop counter or unique message ID to prevent infinite loops if networks are complex
                        // For now, simple federation.
                        peerSockets[peerAddr].emit('federated_chat_message', messageData);
                    }
                }

                // --- Direct Message Handlers ---
                function getDmConversationId(fKey1, fKey2) {
                    return [fKey1, fKey2].sort().join('_');
                }

                socket.on('send_dm', async ({ targetUserFKey, messageContent }) => {
                    if (!socket.username || socket.username === 'Anonymous') {
                        // Optionally send an error event back to client
                        console.warn('DM send attempt by unauthenticated user:', socket.id);
                        socket.emit('dm_error', { message: 'Authentication required to send DMs.' });
                        return;
                    }
                    if (!targetUserFKey || !messageContent || messageContent.trim() === '') {
                        console.warn('Invalid send_dm payload:', { targetUserFKey, messageContent });
                        socket.emit('dm_error', { message: 'Target user and message content are required.' });
                        return;
                    }

                    const senderFKey = `${socket.username}@${OUR_INSTANCE_ID}`;
                    if (senderFKey === targetUserFKey) {
                        socket.emit('dm_error', { message: 'You cannot send a DM to yourself.' });
                        return;
                    }

                    const censoredContent = censorMessage(messageContent.trim());
                    const messageId = `dm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    const messageObject = {
                        id: messageId,
                        senderFKey: senderFKey,
                        receiverFKey: targetUserFKey,
                        content: censoredContent,
                        timestamp: new Date().toISOString(),
                    };

                    const conversationId = getDmConversationId(senderFKey, targetUserFKey);
                    if (!directMessages[conversationId]) {
                        directMessages[conversationId] = [];
                    }
                    directMessages[conversationId].push(messageObject);
                    if (directMessages[conversationId].length > 200) { // Prune DM history per conversation
                        directMessages[conversationId].shift();
                    }
                    saveDirectMessages();

                    console.log(`DM from ${senderFKey} to ${targetUserFKey}: ${censoredContent}`);

                    // Deliver to local target if they are on this instance
                    const targetInstanceId = targetUserFKey.split('@')[1];
                    if (targetInstanceId === OUR_INSTANCE_ID) {
                        const targetUsername = targetUserFKey.split('@')[0];
                        const targetSocket = Object.values(io.sockets.sockets).find(s => s.username === targetUsername && federatedUserDirectory[targetUserFKey]?.localSocketId === s.id);
                        if (targetSocket) {
                            targetSocket.emit('receive_dm', { ...messageObject, conversationId });
                        }
                    } else {
                        // Federate DM to the target's instance
                        let relayedToPeer = false;
                        for (const peerAddr in peerSockets) {
                            const peerSocket = peerSockets[peerAddr];
                            if (peerSocket && peerSocket.connected && peerSocket.instanceId === targetInstanceId) {
                                console.log(`Federating DM for ${targetUserFKey} to peer instance ${targetInstanceId} via ${peerAddr}`);
                                peerSocket.emit('federated_send_dm', {
                                    originalSenderFKey: senderFKey, // The actual original sender
                                    targetUserFKey: targetUserFKey, // The final recipient
                                    messageObject: messageObject // The complete message object
                                });
                                relayedToPeer = true;
                                break;
                            }
                        }
                        if (!relayedToPeer) {
                            console.warn(`Could not federate DM: Target instance ${targetInstanceId} for ${targetUserFKey} peer not found or disconnected.`);
                            // Optionally inform sender that user is unreachable if federation fails
                            socket.emit('dm_error', { message: `User ${targetUserFKey.split('@')[0]} is currently unreachable (instance offline).` });
                            // To prevent data loss if target instance is temporarily down, we might not remove the message here.
                            // Or, implement a retry queue or store it as undelivered.
                            // For now, it's saved, and if the instance comes back & user requests history, they'll get it.
                        }
                    }

                    // Send message back to the original sender so their DM window updates
                    socket.emit('receive_dm', { ...messageObject, conversationId });
                });

                socket.on('load_dm_history', ({ withUserFKey }) => {
                    if (!socket.username || socket.username === 'Anonymous') {
                        socket.emit('dm_error', { message: 'Authentication required.' });
                        return;
                    }
                    if (!withUserFKey) {
                        socket.emit('dm_error', { message: 'Target user FKey is required.' });
                        return;
                    }

                    const currentUserFKey = `${socket.username}@${OUR_INSTANCE_ID}`;
                    const conversationId = getDmConversationId(currentUserFKey, withUserFKey);
                    const history = directMessages[conversationId] || [];
                    
                    socket.emit('dm_history', { withUserFKey, messages: history, conversationId });
                });

                // WebRTC Signaling Handlers (Phase 1: Intra-Instance)
                socket.on('webrtc-offer', (data) => {
                    // data: { targetUsername (plain), callerUsername, offer }
                    if (!data.callerUsername || !data.targetUsername || !data.offer) {
                        console.warn('Invalid webrtc-offer data received:', data);
                        return;
                    }
                    const callerFederatedKey = `${data.callerUsername}@${OUR_INSTANCE_ID}`;
                    console.log(`Received client webrtc-offer from ${callerFederatedKey} for target user '${data.targetUsername}'`);

                    // Try to find target locally first
                    const localTargetSocket = Object.values(io.sockets.sockets).find(s => s.username === data.targetUsername && s.id !== socket.id && users[s.id] && !users[s.id].startsWith('PEER:'));

                    if (localTargetSocket) {
                        console.log(`Forwarding local webrtc-offer to ${data.targetUsername} (${localTargetSocket.id})`);
                        localTargetSocket.emit('webrtc-offer', { 
                            offer: data.offer, 
                            fromUsername: data.callerUsername, 
                            fromSocketId: socket.id, 
                            fromFederatedKey: callerFederatedKey 
                        });
                    } else {
                        // Not local, try to find in federated directory
                        let targetInstanceId = null;
                        let targetUserFederatedKey = null;
                        for (const fKey in federatedUserDirectory) {
                            // Match username and ensure it's not our own instance (already checked by localTargetSocket)
                            if (fKey.startsWith(`${data.targetUsername}@`) && federatedUserDirectory[fKey].instanceId !== OUR_INSTANCE_ID) {
                                targetUserFederatedKey = fKey;
                                targetInstanceId = federatedUserDirectory[fKey].instanceId;
                                break;
                            }
                        }

                        if (targetInstanceId && targetUserFederatedKey) {
                            let relayedToPeer = false;
                            for (const peerAddr in peerSockets) { // Iterate through active outgoing peer connections
                                const peerSocket = peerSockets[peerAddr];
                                if (peerSocket && peerSocket.connected && peerSocket.instanceId === targetInstanceId) {
                                     console.log(`Relaying webrtc-offer for ${targetUserFederatedKey} to peer instance ${targetInstanceId} via ${peerAddr}`);
                                     peerSocket.emit('federated-webrtc-offer', {
                                        originalCallerFKey: callerFederatedKey,
                                        targetFKey: targetUserFederatedKey,
                                        offer: data.offer
                                     });
                                     relayedToPeer = true;
                                     break; 
                                }
                            }
                            if (!relayedToPeer) {
                                 console.warn(`User ${data.targetUsername} found on instance ${targetInstanceId}, but no active peer connection to that instance.`);
                                 socket.emit('call-target-not-found', { targetUsername: data.targetUsername, reason: 'Instance unreachable' });
                            }
                        } else {
                            console.warn(`Target user ${data.targetUsername} for webrtc-offer not found locally or in federated directory.`);
                            socket.emit('call-target-not-found', { targetUsername: data.targetUsername, reason: 'User unknown' });
                        }
                    }
                });

                socket.on('webrtc-answer', (data) => {
                    // Client sends: { targetSocketId (for local calls), targetFederatedKey (for federated calls), answer }
                    if (!data.answer || (!data.targetSocketId && !data.targetFederatedKey)) {
                        console.warn('Invalid webrtc-answer data:', data);
                        return;
                    }
                    const answererFederatedKey = `${socket.username}@${OUR_INSTANCE_ID}`;
                    console.log(`Received client webrtc-answer from ${answererFederatedKey} for target ${data.targetSocketId || data.targetFederatedKey}`);

                    if (data.targetSocketId) { // Answering a call initiated by a local user
                        const localTargetSocket = io.sockets.sockets[data.targetSocketId];
                        if (localTargetSocket) {
                            console.log(`Forwarding local webrtc-answer to ${localTargetSocket.username} (${localTargetSocket.id})`);
                            localTargetSocket.emit('webrtc-answer', { 
                                answer: data.answer, 
                                fromSocketId: socket.id, // Local socket ID of answerer
                                fromFederatedKey: answererFederatedKey
                            });
                        } else {
                            console.warn(`Local target socket ${data.targetSocketId} for webrtc-answer not found.`);
                        }
                    } else if (data.targetFederatedKey) { // Answering a call initiated by a federated user
                        const targetInstanceId = data.targetFederatedKey.split('@')[1];
                        if (targetInstanceId && targetInstanceId !== OUR_INSTANCE_ID) {
                            let relayedToPeer = false;
                            for (const peerAddr in peerSockets) {
                                const peerSocket = peerSockets[peerAddr];
                                if (peerSocket && peerSocket.connected && peerSocket.instanceId === targetInstanceId) {
                                    console.log(`Relaying webrtc-answer for original caller ${data.targetFederatedKey} to peer instance ${targetInstanceId}`);
                                    peerSocket.emit('federated-webrtc-answer', {
                                        originalAnswererFKey: answererFederatedKey,
                                        targetFKey: data.targetFederatedKey, // This is the Original Caller's Federated Key
                                        answer: data.answer
                                    });
                                    relayedToPeer = true; 
                                    break;
                                }
                            }
                            if (!relayedToPeer) {
                                console.warn(`Could not relay federated webrtc-answer: Target instance ${targetInstanceId} peer not found or disconnected.`);
                                // Optionally notify the answering client that the relay failed.
                            }
                        } else if (targetInstanceId === OUR_INSTANCE_ID) {
                             console.warn(`Federated answer targeted our own instance (${data.targetFederatedKey}) but should have used local targetSocketId.`);
                        } else {
                            console.warn('Invalid targetFederatedKey for webrtc-answer:', data.targetFederatedKey);
                        }
                    } else {
                        console.error('webrtc-answer received without targetSocketId or targetFederatedKey');
                    }
                });

                socket.on('webrtc-ice-candidate', (data) => {
                    // Client sends: { targetSocketId (local), targetFederatedKey (federated), candidate }
                    if (!data.candidate || (!data.targetSocketId && !data.targetFederatedKey)) {
                        return;
                    }
                    const senderFederatedKey = `${socket.username}@${OUR_INSTANCE_ID}`;
                    // console.log(`Received client webrtc-ice-candidate from ${senderFederatedKey} for ${data.targetSocketId || data.targetFederatedKey}`);

                    if (data.targetSocketId) { // Local target for ICE candidate
                        const localTargetSocket = io.sockets.sockets[data.targetSocketId];
                        if (localTargetSocket) {
                            localTargetSocket.emit('webrtc-ice-candidate', { 
                                candidate: data.candidate, 
                                fromSocketId: socket.id, 
                                fromFederatedKey: senderFederatedKey 
                            });
                        }
                    } else if (data.targetFederatedKey) { // Federated target for ICE candidate
                        const targetInstanceId = data.targetFederatedKey.split('@')[1];
                        if (targetInstanceId && targetInstanceId !== OUR_INSTANCE_ID) {
                            let relayedToPeer = false;
                            for (const peerAddr in peerSockets) {
                                const peerSocket = peerSockets[peerAddr];
                                if (peerSocket && peerSocket.connected && peerSocket.instanceId === targetInstanceId) {
                                    peerSocket.emit('federated-webrtc-ice-candidate', {
                                        originalSenderFKey: senderFederatedKey,
                                        targetFKey: data.targetFederatedKey,
                                        candidate: data.candidate
                                    });
                                    relayedToPeer = true;
                                    break;
                                }
                            }
                            // No warning if not relayed, ICE candidates are many and best-effort.
                        } else if (targetInstanceId === OUR_INSTANCE_ID) {
                            // console.warn('Federated ICE candidate for our own instance, but no local socketId');
                        }
                    }
                });

                socket.on('call-rejected', (data) => {
                    // data: { targetSocketId, byUser }
                    console.log(`${data.byUser} rejected call to ${data.targetSocketId}`);
                    const targetSocket = io.sockets.sockets[data.targetSocketId];
                    if (targetSocket) {
                        targetSocket.emit('call-rejected', { byUser: data.byUser });
                    }
                });

                socket.on('hang-up', (data) => {
                    // data: { targetSocketId }
                    console.log(`${socket.username} hung up on ${data.targetSocketId}`);
                    const targetSocket = io.sockets.sockets[data.targetSocketId];
                    if (targetSocket) {
                        targetSocket.emit('call-ended', { fromUsername: socket.username });
                    }
                });
                
                socket.on('call-busy', (data) => {
                    // data: { targetSocketId, busyUser }
                    console.log(`${data.busyUser} is busy, notifying ${data.targetSocketId}`);
                    const targetSocket = io.sockets.sockets[data.targetSocketId];
                    if (targetSocket) {
                        targetSocket.emit('call-busy', { busyUser: data.busyUser });
                    }
                });
            });
        }
    }, 2000); // Wait 2 seconds for a peer handshake

    socket.on('disconnect', () => {
        clearTimeout(peerHandshakeTimeout);
        const wasPeer = users[socket.id] && users[socket.id].startsWith('PEER:');
        const disconnectingUsername = socket.username; // Username or PEER:address
        const localUserSocketId = socket.id;

        console.log(`${wasPeer ? 'Peer' : 'User'} '${disconnectingUsername || localUserSocketId}' (socket ${localUserSocketId}) disconnected.`);

        if (wasPeer) {
            // This was an incoming peer connection that dropped
            const peerInstanceAddress = disconnectingUsername.replace('PEER:', '');
            let changed = false;
            console.log(`Cleaning up users from disconnected peer instance: ${peerInstanceAddress}`);
            for (const fKey in federatedUserDirectory) {
                if (federatedUserDirectory[fKey].instanceId === peerInstanceAddress || fKey.endsWith('@' + peerInstanceAddress) ) { // Heuristic for matching instance
                    console.log(`Removing user ${fKey} due to peer disconnect.`);
                    delete federatedUserDirectory[fKey];
                    changed = true;
                }
            }
            // Also remove from active peerSockets if this was an incoming that we also track there (unlikely with current model)
            // More relevant for outgoing peer connections stored in peerSockets, handled by their own disconnect event.
            if (changed) broadcastFederatedUserList();

        } else if (disconnectingUsername && disconnectingUsername !== 'Anonymous') {
            // This was a regular local user
            const federatedKeyToDisconnect = `${disconnectingUsername}@${OUR_INSTANCE_ID}`;
            if (federatedUserDirectory[federatedKeyToDisconnect]) {
                console.log(`Local user ${disconnectingUsername} disconnected. Removing federated key: ${federatedKeyToDisconnect}`);
                delete federatedUserDirectory[federatedKeyToDisconnect];
                // Inform actual peers about this specific user disconnecting
                for (const peerAddr in peerSockets) {
                    if (peerSockets[peerAddr] && peerSockets[peerAddr].connected) {
                        peerSockets[peerAddr].emit('peer_user_disconnect', { federatedKey: federatedKeyToDisconnect });
                    }
                }
                broadcastFederatedUserList();
            }
        }
        // Common cleanup for any socket disconnecting
        delete users[localUserSocketId]; 
    });

    socket.on('error', (err) => {
        console.error(`Socket error for ${socket.id} (${users[socket.id] || 'Unknown'}):`, err);
    });
});

// Periodically prune very old users from federatedUserDirectory (e.g., if an instance disappears without notice)
setInterval(() => {
    const now = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutes for non-local users
    let changed = false;
    for (const fKey in federatedUserDirectory) {
        // Only prune users not from our own instance and not explicitly marked as a peer connection entry
        if (federatedUserDirectory[fKey].instanceId !== OUR_INSTANCE_ID && !fKey.startsWith('PEER:')) {
            if ((now - (federatedUserDirectory[fKey].lastSeen || 0)) > timeout) {
                console.log(`Pruning stale federated user ${fKey} (no update for >10min)`);
                delete federatedUserDirectory[fKey];
                changed = true;
            }
        }
    }
    if (changed) broadcastFederatedUserList();
}, 5 * 60 * 1000); // Run every 5 minutes

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Save messages periodically and on exit (graceful shutdown)
setInterval(saveMessages, 60000); // Save every minute
setInterval(saveGuilds, 70000); // Save guilds periodically (e.g., every 70 seconds)
setInterval(saveDirectMessages, 75000); // Save DMs periodically

process.on('SIGINT', () => {
    console.log('Server shutting down, saving messages...');
    saveMessages();
    console.log('Saving guilds...');
    saveGuilds();
    console.log('Saving direct messages...');
    saveDirectMessages();
    process.exit(0);
});