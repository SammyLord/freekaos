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

// --- Direct Message Elements (New) ---
const showDmChatBtn = document.getElementById('show-dm-chat-btn');
const dmChatArea = document.getElementById('dm-chat-area');
const dmChatHeader = document.getElementById('dm-chat-header');
const dmCallUserBtn = document.getElementById('dm-call-user-btn');
const dmMessages = document.getElementById('dm-messages');
const dmTargetInfo = document.getElementById('dm-target-info');
const dmChattingWith = document.getElementById('dm-chatting-with');
const dmChatForm = document.getElementById('dm-chat-form');
const dmChatInput = document.getElementById('dm-chat-input');

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
let serverInstanceId = null; // Will be populated by the server
let userGuilds = [];      // Array of guild objects this user is part of
let selectedGuildId = null;
let selectedChannelId = null;
let currentDmTargetFKey = null; // New: Federated key of the current DM partner
let dmHistories = {};         // New: Cache for DM conversations, e.g., { "conversationId": [messages] }
let unreadDms = {};           // New: { conversationId: true } for unread DM conversations

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

// New Guild Invite Elements
const joinGuildCodeInput = document.getElementById('join-guild-code-input');
const joinGuildBtn = document.getElementById('join-guild-btn');
const guildActionsArea = document.getElementById('guild-actions-area'); // Container for invite button
const generateInviteBtn = document.getElementById('generate-invite-btn');
const generatedInviteCodeDisplay = document.getElementById('generated-invite-code-display');

if (setUsernameBtn) {
    // Initially disable username input and related buttons until serverInstanceId is received
    usernameInput.disabled = true;
    setUsernameBtn.disabled = true;
    if (guildNameInput) guildNameInput.disabled = true;
    if (createGuildBtn) createGuildBtn.disabled = true;
    if (joinGuildCodeInput) joinGuildCodeInput.disabled = true;
    if (joinGuildBtn) joinGuildBtn.disabled = true;
    // Call buttons are handled by resetCallStateAndUI

    setUsernameBtn.addEventListener('click', () => {
        if (!serverInstanceId) {
            alert('Still connecting to the server instance. Please wait a moment.');
            return;
        }
        const username = usernameInput.value.trim();
        if (username) {
            currentUsername = username;
            currentFKey = `${username}@${serverInstanceId}`; // Use server-provided instance ID
            currentUsernameDisplay.textContent = currentUsername;
            socket.emit('set username', username);
            usernameInput.disabled = true;
            setUsernameBtn.disabled = true;
            if (initiateCallBtn) initiateCallBtn.disabled = false;
            if (callTargetUsernameInput) callTargetUsernameInput.disabled = false;
            if (callStatus) callStatus.textContent = 'Ready to call.'; 
            if (createGuildBtn) createGuildBtn.disabled = false;
            if (guildNameInput) guildNameInput.disabled = false;
            if (joinGuildCodeInput) joinGuildCodeInput.disabled = false;
            if (joinGuildBtn) joinGuildBtn.disabled = false;
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
    const isDisconnected = !serverInstanceId; // New check for initial connection

    if (initiateCallBtn) {
        initiateCallBtn.style.display = 'inline-block';
        initiateCallBtn.disabled = isAnon || isDisconnected;
    }
    if (callTargetUsernameInput) {
        callTargetUsernameInput.disabled = isAnon || isDisconnected;
        callTargetUsernameInput.value = '';
    }
    if (answerCallBtn) answerCallBtn.style.display = 'none';
    if (rejectCallBtn) rejectCallBtn.style.display = 'none';
    if (hangUpBtn) hangUpBtn.style.display = 'none';
    if (callStatus) {
        callStatus.textContent = isDisconnected ? 'Connecting to server...' : (isAnon ? 'Set username to enable calling.' : 'Ready to call.');
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
    // Hide guild-specific action buttons on full reset or if no guild selected
    if (generateInviteBtn) generateInviteBtn.style.display = 'none';
    if (generatedInviteCodeDisplay) generatedInviteCodeDisplay.style.display = 'none';
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
        if (initiateCallBtn) initiateCallBtn.disabled = (currentUsername === 'Anonymous' || !serverInstanceId);
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
    const { offer, fromUsername, fromSocketId, fromFederatedKey } = data;
    console.log(`Received WebRTC offer from ${fromUsername} (Socket: ${fromSocketId}, FKey: ${fromFederatedKey})`, offer);

    if (peerConnection) { // If already in a call or call attempt is active
        console.log("Received a new call offer while already in an active call or call attempt. Emitting 'call-busy'.");
        socket.emit('call-busy', {
            // Target for the 'call-busy' event is the original caller of this new offer
            targetSocketId: fromSocketId, 
            targetFederatedKey: fromFederatedKey,
            // busyUser: currentUsername // Server will use socket.username for this
        });
        return; // Don't process this new offer further
    }

    if (!await startLocalMedia()) {
        console.warn("Failed to start local media, rejecting call offer implicitly by not answering.");
        return;
    }

    incomingCallData = { 
        offer: offer, 
        fromUsername: fromUsername,
        fromSocketId: fromSocketId,    
        fromFederatedKey: fromFederatedKey 
    };

    callStatus.textContent = `Incoming call from ${fromUsername}. Ready to answer?`;
    answerCallBtn.style.display = 'inline-block';
    answerCallBtn.disabled = false; 
    rejectCallBtn.style.display = 'inline-block';
    initiateCallBtn.style.display = 'none'; 
    callTargetUsernameInput.disabled = true; 
    callTargetUsernameInput.value = fromUsername; 
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
    if (!userList) return;
    userList.innerHTML = '';
    users.forEach(userFKey => { // Assuming server now sends array of userFKeys
        const item = document.createElement('li');
        const usernamePart = userFKey.split('@')[0];
        const instancePart = userFKey.split('@')[1] ? `@${userFKey.split('@')[1]}` : '';
        
        item.textContent = usernamePart;
        if (instancePart && instancePart !== `@${serverInstanceId}`) {
            item.textContent += ` (${instancePart.substring(1)})`; // Show remote instance if different
        }
        item.dataset.userFKey = userFKey;

        if (userFKey === currentFKey) {
            item.classList.add('current-user-self'); // Style for self in list
            item.title = 'This is you!';
        } else {
            item.addEventListener('click', () => {
                if (currentUsername === 'Anonymous' || !currentFKey) {
                    alert('Please set your username before starting a DM.');
                    return;
                }
                console.log(`Initiating DM with: ${userFKey}`);
                switchToDmChatView(userFKey);
            });
        }
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

    if (guildsData.length === 0) {
        if (channelsColumn) channelsColumn.style.display = 'none';
        if (generateInviteBtn) generateInviteBtn.style.display = 'none'; // Hide if no guilds
        if (generatedInviteCodeDisplay) generatedInviteCodeDisplay.style.display = 'none';
    }
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
if (showDmChatBtn) showDmChatBtn.addEventListener('click', () => switchToDmChatView(null)); // Switch to DM view, but don't select a user yet

function switchToGlobalChatView() {
    if (globalChatArea) globalChatArea.style.display = 'flex'; // Changed to flex
    if (guildChatArea) guildChatArea.style.display = 'none';
    if (dmChatArea) dmChatArea.style.display = 'none';
    if (channelsColumn) channelsColumn.style.display = 'none';
    
    if (showGlobalChatBtn) showGlobalChatBtn.classList.add('active-view');
    if (showGuildChatBtn) showGuildChatBtn.classList.remove('active-view');
    if (showDmChatBtn) showDmChatBtn.classList.remove('active-view');
    
    const currentSelectedGuild = guildList ? guildList.querySelector('.selected-guild') : null;
    if (currentSelectedGuild) currentSelectedGuild.classList.remove('selected-guild');
    
    selectedGuildId = null;
    selectedChannelId = null;
    // currentDmTargetFKey = null; // Don't clear DM target when just switching views generally
    if (guildChatHeader) guildChatHeader.textContent = 'Select a guild and channel';
    if (dmCallUserBtn) dmCallUserBtn.style.display = 'none';
    if (dmTargetInfo) dmTargetInfo.style.display = 'none';
}

function switchToGuildChatView() {
    if (globalChatArea) globalChatArea.style.display = 'none';
    if (guildChatArea) guildChatArea.style.display = 'flex'; 
    if (dmChatArea) dmChatArea.style.display = 'none';
    
    if (selectedGuildId && channelsColumn) {
        channelsColumn.style.display = 'block'; // or 'flex' if it's a flex container
    } else if (!selectedGuildId && channelsColumn) {
        channelsColumn.style.display = 'none'; 
        if (guildChatHeader) guildChatHeader.textContent = 'Select a guild first';
    }

    if (showGuildChatBtn) showGuildChatBtn.classList.add('active-view');
    if (showGlobalChatBtn) showGlobalChatBtn.classList.remove('active-view');
    if (showDmChatBtn) showDmChatBtn.classList.remove('active-view');
    // currentDmTargetFKey = null;
    if (dmCallUserBtn) dmCallUserBtn.style.display = 'none';
    if (dmTargetInfo) dmTargetInfo.style.display = 'none';
}

function switchToDmChatView(targetUserFKey) {
    if (globalChatArea) globalChatArea.style.display = 'none';
    if (guildChatArea) guildChatArea.style.display = 'none';
    if (dmChatArea) dmChatArea.style.display = 'flex';
    if (channelsColumn) channelsColumn.style.display = 'none'; // Hide channels when in DM view

    if (showDmChatBtn) showDmChatBtn.classList.add('active-view');
    if (showGlobalChatBtn) showGlobalChatBtn.classList.remove('active-view');
    if (showGuildChatBtn) showGuildChatBtn.classList.remove('active-view');

    const deselectedGuild = guildList ? guildList.querySelector('.selected-guild') : null;
    if (deselectedGuild) deselectedGuild.classList.remove('selected-guild');
    selectedGuildId = null; // Deselect guild when going to DMs
    selectedChannelId = null;

    if (targetUserFKey) {
        currentDmTargetFKey = targetUserFKey;
        const targetUsername = targetUserFKey.split('@')[0];
        if (dmChatHeader) dmChatHeader.textContent = `DM with ${targetUsername}`;
        if (dmMessages) dmMessages.innerHTML = ''; // Clear previous DM messages
        if (dmTargetInfo) {
            dmTargetInfo.style.display = 'block';
            dmChattingWith.textContent = targetUsername;
        }
        if (dmCallUserBtn) {
             dmCallUserBtn.style.display = (targetUserFKey === currentFKey) ? 'none' : 'inline-block'; // Don't show call for self
        }
        
        // Clear unread status for this conversation
        const conversationId = getDmConversationId(currentFKey, targetUserFKey);
        if (conversationId && unreadDms[conversationId]) {
            delete unreadDms[conversationId];
            updateDmUnreadIndicators();
        }

        console.log(`Loading DM history with ${targetUserFKey}`);
        socket.emit('load_dm_history', { withUserFKey: targetUserFKey });
    } else {
        // No specific user selected, general DM view (e.g. show list of recent DMs - future feature)
        currentDmTargetFKey = null;
        if (dmChatHeader) dmChatHeader.textContent = 'Direct Messages';
        if (dmMessages) dmMessages.innerHTML = '<li style="text-align:center; color: #888;">Select a user to start a DM.</li>';
        if (dmTargetInfo) dmTargetInfo.style.display = 'none';
        if (dmCallUserBtn) dmCallUserBtn.style.display = 'none';
    }
}

// DM Form Submission
if (dmChatForm) {
    dmChatForm.addEventListener('submit', function(e) {
        e.preventDefault();
        if (dmChatInput.value && currentDmTargetFKey && currentUsername !== 'Anonymous') {
            socket.emit('send_dm', { 
                targetUserFKey: currentDmTargetFKey, 
                messageContent: dmChatInput.value 
            });
            dmChatInput.value = '';
        } else if (currentUsername === 'Anonymous') {
            alert('Please set your username first!');
        } else if (!currentDmTargetFKey) {
            alert('Please select a user to send a DM to.');
        }
    });
}

// --- Socket Handlers for DMs ---
socket.on('receive_dm', (messageObject) => {
    // messageObject includes senderFKey, receiverFKey, content, timestamp, id, AND conversationId
    console.log('Received DM:', messageObject);
    const conversationId = messageObject.conversationId || getDmConversationId(messageObject.senderFKey, messageObject.receiverFKey); // Ensure conversationId is present

    if (!dmHistories[conversationId]) {
        dmHistories[conversationId] = [];
    }
    // Avoid duplicates if sender also gets receive_dm for their own message
    if (!dmHistories[conversationId].find(m => m.id === messageObject.id)) {
        dmHistories[conversationId].push(messageObject);
    }
    
    const activeConversationId = currentDmTargetFKey ? getDmConversationId(currentFKey, currentDmTargetFKey) : null;

    if (currentDmTargetFKey && (conversationId === activeConversationId)) {
        renderDmMessage(messageObject);
        // If the current chat is open, it's read by definition, ensure no unread flag
        if (unreadDms[conversationId]) {
            delete unreadDms[conversationId];
            updateDmUnreadIndicators(); // Update UI if it was marked unread somehow
        }
    } else {
        // DM is for a conversation not currently active, or no DM conversation is active
        console.log(`Notification: New DM from ${messageObject.senderFKey.split('@')[0]} in conversation ${conversationId}`);
        if (messageObject.senderFKey !== currentFKey) { // Don't mark own messages as unread if window not focused
            unreadDms[conversationId] = true;
            updateDmUnreadIndicators();
        }
    }
});

socket.on('dm_history', ({ withUserFKey, messages, conversationId }) => {
    console.log(`Received DM history for ${withUserFKey}:`, messages.length, 'messages');
    dmHistories[conversationId] = messages;
    if (currentDmTargetFKey === withUserFKey) {
        if (dmMessages) dmMessages.innerHTML = ''; // Clear before loading history
        messages.forEach(msg => renderDmMessage(msg));
        if (messages.length === 0 && dmMessages) {
            dmMessages.innerHTML = '<li style="text-align:center; color: #888;">No messages yet. Say hi!</li>';
        }
    }
});

socket.on('dm_error', ({ message }) => {
    console.error('DM Error:', message);
    alert(`DM Error: ${message}`);
});

function getDmConversationId(fKey1, fKey2) { // Client-side helper
    if (!fKey1 || !fKey2) return null;
    return [fKey1, fKey2].sort().join('_');
}

function renderDmMessage(msg) {
    if (!dmMessages) return;
    const item = document.createElement('li');
    const timestamp = new Date(msg.timestamp).toLocaleTimeString();
    let prefix = msg.senderFKey === currentFKey ? "Me" : msg.senderFKey.split('@')[0];
    const instancePart = msg.senderFKey.split('@')[1];
    if (instancePart && instancePart !== serverInstanceId && msg.senderFKey !== currentFKey) {
        prefix += ` @${instancePart.substring(0, instancePart.indexOf('_') !== -1 ? instancePart.indexOf('_') : instancePart.length)}`; // Show short instance name
    }

    item.textContent = `[${timestamp}] ${prefix}: ${msg.content}`;
    item.classList.add(msg.senderFKey === currentFKey ? 'dm-message-sent' : 'dm-message-received');
    // Add unique ID for potential future use (e.g., reactions, replies)
    item.dataset.messageId = msg.id;

dmMessages.appendChild(item);
    dmMessages.scrollTop = dmMessages.scrollHeight;
}

function updateDmUnreadIndicators() {
    if (!showDmChatBtn || !userList) return;

    // Global DM indicator on the "Direct Messages" button
    if (Object.keys(unreadDms).length > 0) {
        showDmChatBtn.classList.add('has-unread');
    } else {
        showDmChatBtn.classList.remove('has-unread');
    }

    // Per-user indicator in the user list
    const userListItems = userList.querySelectorAll('li');
    userListItems.forEach(item => {
        const userFKey = item.dataset.userFKey;
        if (userFKey && userFKey !== currentFKey) {
            const conversationId = getDmConversationId(currentFKey, userFKey);
            if (unreadDms[conversationId]) {
                item.classList.add('has-unread-dm');
            } else {
                item.classList.remove('has-unread-dm');
            }
        }
    });
}

// Placeholder for styling current user in user list and DM messages
// const style = document.createElement('style');
// style.textContent = `
//     #user-list li.current-user-self {
//         font-style: italic;
//         color: var(--primary-color);
//         font-weight: bold;
//         background-color: var(--hover-item-bg);
//     }
//     #dm-messages li.dm-message-sent {
//         background-color: #dcf8c6; /* A light green, typical for sent messages */
//         margin-left: auto; /* Align to right */
//         max-width: 70%;
//         border-radius: 10px 10px 0 10px;
//     }
//     #dm-messages li.dm-message-received {
//         background-color: #f1f0f0; /* A light grey for received */
//         margin-right: auto; /* Align to left */
//         max-width: 70%;
//         border-radius: 10px 10px 10px 0;
//     }
//     #dm-messages li {
//         padding: 8px 12px;
//         margin-bottom: 5px;
//         word-wrap: break-word;
//     }
// `;
// document.head.appendChild(style);

// Call User button in DM view
if (dmCallUserBtn) {
    dmCallUserBtn.addEventListener('click', () => {
        if (!currentDmTargetFKey || currentDmTargetFKey === currentFKey) {
            alert('No valid DM target to call.');
            return;
        }
        if (currentUsername === 'Anonymous') {
            alert('Please set your username before making a call.');
            return;
        }
        const targetUsernameToCall = currentDmTargetFKey.split('@')[0];
        console.log(`Attempting to call DM target: ${targetUsernameToCall} (FKey: ${currentDmTargetFKey})`);
        if (callTargetUsernameInput) {
            callTargetUsernameInput.value = targetUsernameToCall; // Populate the main call input
        }
        // Trigger the existing call initiation logic
        // Ensure peerConnection is reset if it's in a weird state
        if (peerConnection && peerConnection.signalingState !== 'stable') {
            console.warn('Resetting potentially unstable peer connection before new call attempt.');
            resetCallStateAndUI(); // This will also recreate peerConnection on demand
        }
        initiateCallBtn.click(); 
    });
}

// Modify initial UI setup based on new DM view
switchToGlobalChatView(); // Start in global chat
if (dmChatArea) dmChatArea.style.display = 'none'; // Ensure DM area is hidden initially
// ... other initial setup calls if any ...

// Initial UI setup
// if (createGuildBtn) createGuildBtn.disabled = true; // Now handled by instance_id_info and setUsername
// if (guildNameInput) guildNameInput.disabled = true; // Now handled
// switchToGlobalChatView(); // Already called

// --- Instance ID Handling ---
socket.on('instance_id_info', (data) => {
    if (data && data.instanceId) {
        serverInstanceId = data.instanceId;
        console.log('Received instance ID:', serverInstanceId);
        // Enable username input now that we have the instance ID
        if (usernameInput) usernameInput.disabled = false;
        if (setUsernameBtn) setUsernameBtn.disabled = false;
        
        // Update call status if it was 'Connecting...'
        if (callStatus && callStatus.textContent === 'Connecting to server...') {
            if (currentUsername === 'Anonymous') {
                callStatus.textContent = 'Set username to enable calling.';
            } else {
                callStatus.textContent = 'Ready to call.';
            }
        }
        // Enable guild related buttons if username is already set (e.g. on a reconnect with stored username - though we don't have that yet)
        // For now, they will be enabled once username is set.
        if (currentUsername !== 'Anonymous') {
             if (guildNameInput) guildNameInput.disabled = false;
             if (createGuildBtn) createGuildBtn.disabled = false;
             if (joinGuildCodeInput) joinGuildCodeInput.disabled = false;
             if (joinGuildBtn) joinGuildBtn.disabled = false;
        }

    } else {
        console.error('Received invalid instance_id_info:', data);
        if (callStatus) callStatus.textContent = 'Error: Could not connect to server instance.';
    }
});
