console.log('SYNC_POINT_FOR_WEBRTC_FEATURE_ADDITION_001');

const socket = io(); // Connect to the server

// --- General Chat Elements ---
const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usernameInput = document.getElementById('username-input');
const setUsernameBtn = document.getElementById('set-username-btn');
const currentUsernameDisplay = document.getElementById('current-username');
const userList = document.getElementById('user-list'); 

// --- Guild & Channel Elements ---
const guildsColumn = document.getElementById('guilds-column');
const guildList = document.getElementById('guild-list');
const guildNameInput = document.getElementById('guild-name-input');
const createGuildBtn = document.getElementById('create-guild-btn');

const channelsColumn = document.getElementById('channels-column');
const channelsHeader = document.getElementById('channels-header');
const channelList = document.getElementById('channel-list');
const channelNameInput = document.getElementById('channel-name-input');
const createChannelBtn = document.getElementById('create-channel-btn');
const createChannelArea = document.getElementById('create-channel-area');

const chatColumn = document.getElementById('chat-column');
const showGlobalChatBtn = document.getElementById('show-global-chat-btn');
const showGuildChatBtn = document.getElementById('show-guild-chat-btn');
const globalChatArea = document.getElementById('global-chat-area');
const guildChatArea = document.getElementById('guild-chat-area');
const guildChatHeader = document.getElementById('guild-chat-header');
const guildMessages = document.getElementById('guild-messages');
const guildChatForm = document.getElementById('guild-chat-form');
const guildChatInput = document.getElementById('guild-chat-input');

// --- Video Call Elements ---
const callTargetUsernameInput = document.getElementById('call-target-username');
const initiateCallBtn = document.getElementById('initiate-call-btn');
const answerCallBtn = document.getElementById('answer-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');
const hangUpBtn = document.getElementById('hang-up-btn');
const callStatus = document.getElementById('call-status');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

// --- Client State ---
let currentUsername = 'Anonymous';
let currentFKey = null; // username@instanceId, set when username is set
let userGuilds = [];      // Array of guild objects this user is part of
let selectedGuildId = null;
let selectedChannelId = null;

// WebRTC Global Variables
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentCallTargetSocketId = null; 
let currentCallTargetUsername = null; 
let currentCallTargetFederatedKey = null; 
let incomingCallData = null; 

const STUN_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

if (setUsernameBtn) {
    setUsernameBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (username) {
            currentUsername = username;
            // Assuming server's OUR_INSTANCE_ID is available client-side for local user FKey construction
            // This is a simplification; in a real app, server would confirm/provide the FKey or instance ID.
            // For now, we construct it, but it's mainly for client-side checks like guild ownership.
            // Server will use socket.username + OUR_INSTANCE_ID for actual FKey.
            // Let's use a placeholder for instance ID until server provides it directly on connect.
            currentFKey = `${currentUsername}@local_user`; // Placeholder
            currentUsernameDisplay.textContent = currentUsername;
            socket.emit('set username', username);
            usernameInput.disabled = true;
            setUsernameBtn.disabled = true;
            if (initiateCallBtn) initiateCallBtn.disabled = false;
            if (callTargetUsernameInput) callTargetUsernameInput.disabled = false;
            if (callStatus) callStatus.textContent = 'Ready to call.'; 
            if (createGuildBtn) createGuildBtn.disabled = false;
            if (guildNameInput) guildNameInput.disabled = false;
        } else {
            alert('Username cannot be empty.');
        }
    });
}

function resetCallStateAndUI() {
    console.log("Resetting call state and UI");
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        console.log("Local stream stopped.");
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        console.log("PeerConnection closed.");
    }
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    
    const isAnon = (currentUsername === 'Anonymous');
    if (initiateCallBtn) {
        initiateCallBtn.style.display = 'inline-block';
        initiateCallBtn.disabled = isAnon;
    }
    if (callTargetUsernameInput) {
        callTargetUsernameInput.disabled = isAnon;
        callTargetUsernameInput.value = '';
    }
    if (answerCallBtn) answerCallBtn.style.display = 'none';
    if (rejectCallBtn) rejectCallBtn.style.display = 'none';
    if (hangUpBtn) hangUpBtn.style.display = 'none';
    if (callStatus) {
        callStatus.textContent = isAnon ? 'Set username to enable calling.' : 'Ready to call.';
    }
    currentCallTargetSocketId = null;
    currentCallTargetUsername = null;
    currentCallTargetFederatedKey = null;
    incomingCallData = null;
    // Only reset selected channel, not guild, when a call ends.
    selectedChannelId = null;
    if (guildMessages) guildMessages.innerHTML = '';
    if (guildChatHeader && selectedGuildId) {
        const guild = userGuilds.find(g => g.id === selectedGuildId);
        if (guild) guildChatHeader.textContent = `Select a channel in ${guild.name}`;
    } else if (guildChatHeader) {
        guildChatHeader.textContent = 'Select a guild and channel';
    }
    document.querySelectorAll('#channel-list li.selected-channel').forEach(el => el.classList.remove('selected-channel'));
}

async function startLocalMedia() {
    console.log("Attempting to start local media...");
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) {
            localVideo.srcObject = localStream;
        } else {
            console.warn("localVideo DOM element not found when trying to set srcObject.");
        }
        console.log("Local media stream acquired successfully.");
        if (initiateCallBtn) initiateCallBtn.disabled = (currentUsername === 'Anonymous');
        if (answerCallBtn && incomingCallData) answerCallBtn.disabled = false; 
        return true;
    } catch (error) {
        console.error("Error accessing media devices:", error);
        if (callStatus) callStatus.textContent = "Error: Could not access camera/microphone. Check permissions.";
        if (initiateCallBtn) initiateCallBtn.disabled = true;
        if (answerCallBtn) answerCallBtn.disabled = true;
        return false;
    }
}

function createAndConfigurePeerConnection() {
    if (peerConnection) peerConnection.close();
    try {
        peerConnection = new RTCPeerConnection(STUN_SERVERS);
    } catch (e) {
        console.error("Failed to create RTCPeerConnection:", e);
        if (callStatus) callStatus.textContent = "Error: Failed to initialize call services.";
        return;
    }
    peerConnection.onicecandidate = event => {
        const targetIsFederated = !currentCallTargetSocketId && currentCallTargetFederatedKey;
        if (event.candidate && (currentCallTargetSocketId || targetIsFederated)) {
            socket.emit('webrtc-ice-candidate', {
                targetSocketId: currentCallTargetSocketId, 
                targetFederatedKey: targetIsFederated ? currentCallTargetFederatedKey : null,
                candidate: event.candidate
            });
        }
    };
    peerConnection.ontrack = event => {
        console.log("Remote track received:", event);
        if (event.streams && event.streams[0]) {
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
            }
            remoteStream = event.streams[0]; 
        } else {
            if (remoteVideo && !remoteVideo.srcObject) {
                remoteVideo.srcObject = new MediaStream();
            }
            if (remoteVideo && remoteVideo.srcObject && typeof remoteVideo.srcObject.addTrack === 'function') {
                 remoteVideo.srcObject.addTrack(event.track);
            } else {
                console.warn("Could not add individual remote track.", event.track);
            }
        }
    };
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            try {
                peerConnection.addTrack(track, localStream);
            } catch (e) {
                console.error("Error adding track to PeerConnection:", track, e);
            }
        });
        console.log("Local tracks added to PeerConnection.");
    } else {
        console.warn("Local stream not available when creating peer connection.");
    }
}

resetCallStateAndUI();

initiateCallBtn.addEventListener('click', async () => {
    if (currentUsername === 'Anonymous') {
        alert("Please set your username first.");
        return;
    }
    const targetUsername = callTargetUsernameInput.value.trim();
    if (!targetUsername) {
        alert("Please enter a username to call.");
        return;
    }
    if (targetUsername === currentUsername) {
        alert("You cannot call yourself.");
        return;
    }

    currentCallTargetUsername = targetUsername;
    currentCallTargetSocketId = null;
    currentCallTargetFederatedKey = null;
    
    callStatus.textContent = `Calling ${targetUsername}...`;
    initiateCallBtn.style.display = 'none';
    callTargetUsernameInput.disabled = true;
    hangUpBtn.style.display = 'inline-block';

    if (!await startLocalMedia()) { 
        callStatus.textContent = "Failed to start camera/mic. Cannot call.";
        resetCallStateAndUI(); 
        return;
    }

    if (!peerConnection) {
        createAndConfigurePeerConnection();
    } else { 
        if (localStream && peerConnection.signalingState === 'stable') { 
            peerConnection.getSenders().forEach(sender => {
                if (sender.track) {
                    try { peerConnection.removeTrack(sender); } catch(e) { console.warn("Error removing old track:", e); }
                }
            });
            localStream.getTracks().forEach(track => {
                try { peerConnection.addTrack(track, localStream); } catch (e) { console.error("Error re-adding track:", track, e); }
            });
        } else if (peerConnection.signalingState !== 'stable') {
            console.warn("PeerConnection not stable, cannot re-add tracks now. Will rely on negotiation.");
        }
    }
    if (!peerConnection) { 
        callStatus.textContent = "Error: Call service initialization failed.";
        resetCallStateAndUI();
        return;
    }

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log('Sending webrtc-offer to server for target:', targetUsername);
        socket.emit('webrtc-offer', { 
            targetUsername: targetUsername, 
            callerUsername: currentUsername, 
            offer: peerConnection.localDescription 
        });
    } catch (error) {
        console.error("Error creating or sending offer:", error);
        callStatus.textContent = "Error: Could not initiate call.";
        resetCallStateAndUI(); 
    }
});

answerCallBtn.addEventListener('click', async () => {
    if (!incomingCallData || !incomingCallData.offer) {
        console.error("No incoming call data to answer.");
        callStatus.textContent = "Error: No call to answer.";
        resetCallStateAndUI();
        return;
    }
    
    if (!await startLocalMedia()) {
        callStatus.textContent = "Failed to start camera/mic. Cannot answer.";
        answerCallBtn.disabled = true; 
        return;
    }
    answerCallBtn.disabled = false;

    if (!peerConnection) createAndConfigurePeerConnection();
     if (!peerConnection) { 
        callStatus.textContent = "Error: Call service initialization failed for answering.";
        resetCallStateAndUI();
        return;
    }

    currentCallTargetSocketId = incomingCallData.fromSocketId; 
    currentCallTargetFederatedKey = incomingCallData.fromFederatedKey;
    currentCallTargetUsername = incomingCallData.fromUsername; 

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('Sending webrtc-answer to:', currentCallTargetFederatedKey || currentCallTargetSocketId);
        socket.emit('webrtc-answer', {
            targetSocketId: currentCallTargetSocketId, 
            targetFederatedKey: currentCallTargetFederatedKey, 
            answer: peerConnection.localDescription,
        });
        
        callStatus.textContent = `In call with ${currentCallTargetUsername}`;
        answerCallBtn.style.display = 'none';
        rejectCallBtn.style.display = 'none';
        hangUpBtn.style.display = 'inline-block';
        initiateCallBtn.style.display = 'none';
        callTargetUsernameInput.disabled = true;
        callTargetUsernameInput.value = currentCallTargetUsername; 

    } catch (err) {
        console.error("Error creating/sending answer:", err);
        callStatus.textContent = "Error: Could not answer call.";
        resetCallStateAndUI(); 
    }
});

rejectCallBtn.addEventListener('click', () => {
    if (incomingCallData && (incomingCallData.fromSocketId || incomingCallData.fromFederatedKey)) {
        console.log("Rejecting call from:", incomingCallData.fromUsername);
        socket.emit('call-rejected', { 
            targetSocketId: incomingCallData.fromSocketId, 
            targetFederatedKey: incomingCallData.fromFederatedKey, 
        });
    }
    resetCallStateAndUI();
    callStatus.textContent = "Call rejected.";
});

hangUpBtn.addEventListener('click', () => {
    if (currentCallTargetSocketId || currentCallTargetFederatedKey) {
        console.log("Hanging up call with:", currentCallTargetUsername);
        socket.emit('hang-up', { 
            targetSocketId: currentCallTargetSocketId, 
            targetFederatedKey: currentCallTargetFederatedKey, 
        });
    } else if (callTargetUsernameInput.value && !answerCallBtn.style.display.includes('none')) {
        console.log("Cancelling outgoing call attempt to:", callTargetUsernameInput.value);
    }
    resetCallStateAndUI();
    callStatus.textContent = "Call ended.";
});


socket.on('webrtc-offer', async (data) => {
    console.log(`Incoming webrtc-offer from: ${data.fromUsername} (${data.fromFederatedKey || data.fromSocketId})`);
    
    if (peerConnection && peerConnection.signalingState !== "stable") {
        console.warn("Received an offer while not in a stable state. Current state:", peerConnection.signalingState);
    }

    incomingCallData = { 
        offer: data.offer, 
        fromUsername: data.fromUsername,
        fromSocketId: data.fromSocketId,    
        fromFederatedKey: data.fromFederatedKey 
    };

    callStatus.textContent = `Incoming call from ${data.fromUsername}. Ready to answer?`;
    answerCallBtn.style.display = 'inline-block';
    answerCallBtn.disabled = false; 
    rejectCallBtn.style.display = 'inline-block';
    initiateCallBtn.style.display = 'none'; 
    callTargetUsernameInput.disabled = true; 
    callTargetUsernameInput.value = data.fromUsername; 
    hangUpBtn.style.display = 'none'; 
});

socket.on('webrtc-answer', async (data) => {
    console.log(`Received webrtc-answer from: ${data.fromUsername} (${data.fromFederatedKey || data.fromSocketId})`);
    
    if (!peerConnection || !data.answer) {
        console.error("PeerConnection not ready or no answer received. State:", peerConnection ? peerConnection.signalingState : 'null');
        callStatus.textContent = "Error: Problem processing call answer.";
        return;
    }

    currentCallTargetSocketId = data.fromSocketId;
    currentCallTargetFederatedKey = data.fromFederatedKey;

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        callStatus.textContent = `In call with ${currentCallTargetUsername}`;
        
        initiateCallBtn.style.display = 'none';
        callTargetUsernameInput.disabled = true;
        callTargetUsernameInput.value = currentCallTargetUsername;
        answerCallBtn.style.display = 'none';
        rejectCallBtn.style.display = 'none';
        hangUpBtn.style.display = 'inline-block';

    } catch (err) {
        console.error("Error setting remote description for answer:", err);
        callStatus.textContent = "Error: Failed to establish call connection.";
        resetCallStateAndUI(); 
    }
});

socket.on('webrtc-ice-candidate', async (data) => {
    if (!peerConnection) {
        return;
    }
    if (data.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
        }
    }
});

socket.on('call-rejected', (data) => {
    console.log(`Call rejected by: ${data.byUser} (${data.byUserFederatedKey})`);
    if (callStatus) callStatus.textContent = `Call rejected by ${data.byUser}.`;
    resetCallStateAndUI();
});

socket.on('call-ended', (data) => {
    console.log(`Call ended by: ${data.fromUsername} (${data.fromKey})`);
    if (callStatus) callStatus.textContent = `Call ended by ${data.fromUsername}.`;
    resetCallStateAndUI();
});

socket.on('call-busy', (data) => {
    console.log(`Call target is busy: ${data.busyUser} (${data.busyUserKey})`);
    if (callStatus) callStatus.textContent = `${data.busyUser} is busy. Try later.`;
    resetCallStateAndUI();
});

socket.on('call-target-not-found', (data) => {
    console.log(`Call target not found: ${data.targetUsername}, Reason: ${data.reason}`);
    if (callStatus) callStatus.textContent = `Could not reach ${data.targetUsername}: ${data.reason}.`;
    resetCallStateAndUI();
});

form.addEventListener('submit', function(e) {
    e.preventDefault();
    if (input.value && currentUsername !== 'Anonymous') {
        socket.emit('chat message', { message: input.value, username: currentUsername });
        input.value = '';
    } else if (currentUsername === 'Anonymous') {
        alert('Please set your username first!');
    }
});

socket.on('update user list', (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
        const item = document.createElement('li');
        item.textContent = user; 
        userList.appendChild(item);
    });
});

socket.on('load all messages', (msgs) => {
    messages.innerHTML = ''; 
    msgs.forEach(msg => {
        const item = document.createElement('li');
        const timestamp = new Date(msg.timestamp).toLocaleTimeString();
        item.textContent = `[${timestamp}] ${msg.user}${msg.instance ? '@' + msg.instance : ''}: ${msg.message}`;
        messages.appendChild(item);
    });
    messages.scrollTop = messages.scrollHeight; 
});

socket.on('chat message', (msg) => {
    const item = document.createElement('li');
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    item.textContent = `[${timestamp}] ${msg.user}${msg.instance ? '@' + msg.instance : ''}: ${msg.message}`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight; 
});

// --- Guild & Channel Logic ---

function renderGuilds(guildsData) {
    if (!guildList) return;
    guildList.innerHTML = ''; 
    userGuilds = guildsData; 

    guildsData.forEach(guild => {
        const item = document.createElement('li');
        item.textContent = guild.name;
        item.dataset.guildId = guild.id;
        item.addEventListener('click', () => {
            document.querySelectorAll('#guild-list li.selected-guild').forEach(el => el.classList.remove('selected-guild'));
            item.classList.add('selected-guild');
            
            selectedGuildId = guild.id;
            selectedChannelId = null; 

            if (channelsColumn) channelsColumn.style.display = 'block';
            if (channelsHeader) channelsHeader.textContent = `Channels in ${guild.name}`;
            
            renderChannels(guild.channels || {}, guild.ownerFKey);
            
            if (guildMessages) guildMessages.innerHTML = '';
            if (guildChatHeader) guildChatHeader.textContent = `Select a channel in ${guild.name}`;

            switchToGuildChatView(); 
        });
        guildList.appendChild(item);
    });
}

if (createGuildBtn) {
    createGuildBtn.addEventListener('click', () => {
        const name = guildNameInput.value.trim();
        if (name && currentUsername !== 'Anonymous') {
            socket.emit('create guild', { guildName: name });
            guildNameInput.value = '';
        } else if (currentUsername === 'Anonymous') {
            alert('Please set your username to create a guild.');
        } else {
            alert('Guild name cannot be empty.');
        }
    });
}

if (showGlobalChatBtn) showGlobalChatBtn.addEventListener('click', switchToGlobalChatView);
if (showGuildChatBtn) showGuildChatBtn.addEventListener('click', switchToGuildChatView);

function switchToGlobalChatView() {
    if (globalChatArea) globalChatArea.style.display = 'block';
    if (guildChatArea) guildChatArea.style.display = 'none';
    if (channelsColumn) channelsColumn.style.display = 'none';
    
    if (showGlobalChatBtn) showGlobalChatBtn.classList.add('active-view');
    if (showGuildChatBtn) showGuildChatBtn.classList.remove('active-view');
    
    const currentSelectedGuild = guildList ? guildList.querySelector('.selected-guild') : null;
    if (currentSelectedGuild) {
        currentSelectedGuild.classList.remove('selected-guild');
    }
    selectedGuildId = null;
    selectedChannelId = null;
    if (guildChatHeader) guildChatHeader.textContent = 'Select a guild and channel';
}

function switchToGuildChatView() {
    if (globalChatArea) globalChatArea.style.display = 'none';
    if (guildChatArea) {
        guildChatArea.style.display = 'flex'; 
    }
    
    if (selectedGuildId && channelsColumn) {
        channelsColumn.style.display = 'block';
    } else if (!selectedGuildId && channelsColumn) {
        channelsColumn.style.display = 'none'; 
        if (guildChatHeader) guildChatHeader.textContent = 'Select a guild first';
    }

    if (showGuildChatBtn) showGuildChatBtn.classList.add('active-view');
    if (showGlobalChatBtn) showGlobalChatBtn.classList.remove('active-view');
}

socket.on('update guild list', ({ guilds }) => {
    console.log('Received guild list:', guilds);
    if(guilds) renderGuilds(guilds);
});

socket.on('guild created', ({ guild }) => {
    console.log('Guild created event:', guild);
    // Server also sends 'update guild list', so explicit add/re-render might be redundant
    // but good for immediate feedback if list update is delayed.
    // Let's ensure userGuilds state is updated and then render.
    const existingGuild = userGuilds.find(g => g.id === guild.id);
    if (!existingGuild) {
        userGuilds.push(guild);
    }
    renderGuilds(userGuilds); // Re-render to reflect new guild immediately
    alert(`Guild "${guild.name}" created successfully!`);
});

socket.on('guild creation error', ({ message }) => {
    console.error('Guild creation error:', message);
    alert(`Guild creation failed: ${message}`);
});

// Initial UI setup
if (createGuildBtn) createGuildBtn.disabled = true;
if (guildNameInput) guildNameInput.disabled = true;
switchToGlobalChatView();
