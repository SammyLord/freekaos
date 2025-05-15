console.log('SYNC_POINT_FOR_WEBRTC_FEATURE_ADDITION_001');

const socket = io(); // Connect to the server

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usernameInput = document.getElementById('username-input');
const setUsernameBtn = document.getElementById('set-username-btn');
const currentUsernameDisplay = document.getElementById('current-username');
const userList = document.getElementById('user-list'); // Get the user list UL

// Video Call Elements
const callTargetUsernameInput = document.getElementById('call-target-username');
const initiateCallBtn = document.getElementById('initiate-call-btn');
const answerCallBtn = document.getElementById('answer-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');
const hangUpBtn = document.getElementById('hang-up-btn');
const callStatus = document.getElementById('call-status');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

// WebRTC Global Variables
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentCallTargetSocketId = null; 
let currentCallTargetUsername = null; 
let currentCallTargetFederatedKey = null; 
let incomingCallData = null; // Will store { offer, fromUsername, fromSocketId, fromFederatedKey }
let makingOffer = false; 
let politePeer = false; 

const STUN_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let currentUsername = 'Anonymous';

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
    // Assuming DOM elements like localVideo are declared elsewhere successfully
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
    currentCallTargetFederatedKey = null; // Reset this too
    incomingCallData = null;
    makingOffer = false;
    politePeer = false; 
}

async function startLocalMedia() {
    console.log("Attempting to start local media...");
    try {
        if (localStream) { // Stop existing tracks before starting new ones
            localStream.getTracks().forEach(track => track.stop());
            console.log("Stopped existing local stream tracks.");
        }
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) {
            localVideo.srcObject = localStream;
        } else {
            console.warn("localVideo DOM element not found when trying to set srcObject.");
        }
        console.log("Local media stream acquired successfully.");
        // Ensure buttons that depend on local media are enabled/disabled appropriately
        if (initiateCallBtn) initiateCallBtn.disabled = (currentUsername === 'Anonymous');
        if (answerCallBtn && incomingCallData) answerCallBtn.disabled = false; // Enable answer if media is up
        return true;
    } catch (error) {
        console.error("Error accessing media devices:", error);
        if (callStatus) callStatus.textContent = "Error: Could not access camera/microphone. Check permissions.";
        // alert("Could not access camera/microphone. Please check permissions and ensure no other app/tab is using them.");
        // Disable call-related buttons if media fails
        if (initiateCallBtn) initiateCallBtn.disabled = true;
        if (answerCallBtn) answerCallBtn.disabled = true;
        return false;
    }
}

function createAndConfigurePeerConnection() {
    if (peerConnection) {
        console.warn("PeerConnection already exists. Closing the old one before creating a new one.");
        peerConnection.close();
        peerConnection = null;
    }
    try {
        peerConnection = new RTCPeerConnection(STUN_SERVERS);
        console.log("RTCPeerConnection created successfully.");
    } catch (e) {
        console.error("Failed to create RTCPeerConnection:", e);
        if (callStatus) callStatus.textContent = "Error: Failed to initialize call services.";
        return; // Cannot proceed
    }

    peerConnection.onicecandidate = event => {
        const targetIsFederated = !currentCallTargetSocketId && currentCallTargetFederatedKey;
        if (event.candidate && (currentCallTargetSocketId || targetIsFederated)) {
            // console.log('Sending ICE candidate to', currentCallTargetUsername);
            socket.emit('webrtc-ice-candidate', {
                targetSocketId: currentCallTargetSocketId, // Will be null if federated
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
            } else {
                console.warn("remoteVideo DOM element not found when trying to set srcObject for track event.");
            }
            remoteStream = event.streams[0]; 
            console.log("Remote stream assigned to remoteVideo element.");
        } else {
            // Fallback for browsers that might add tracks individually to a stream
            if (remoteVideo && !remoteVideo.srcObject) {
                remoteVideo.srcObject = new MediaStream();
            }
            if (remoteVideo && remoteVideo.srcObject && typeof remoteVideo.srcObject.addTrack === 'function') {
                 remoteVideo.srcObject.addTrack(event.track);
                 console.log("Remote track added individually to remoteVideo element's stream.");
            } else {
                console.warn("Could not add individual remote track.", event.track);
            }
        }
    };
    
    // Add local tracks if localStream is available
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
        console.warn("Local stream not available when creating peer connection. Ensure startLocalMedia() was called and successful.");
        // Optionally, try to start media here if critical, or rely on calling flow to ensure it.
    }
    
    // Perfect Negotiation handler (simplified: only if polite and offer received)
    // A full perfect negotiation pattern is more complex and stateful.
    // For this phase, offers and answers will be more explicitly managed by the button handlers.
    /* 
    peerConnection.onnegotiationneeded = async () => {
        if (politePeer && peerConnection.signalingState === 'have-remote-offer') {
            try {
                console.log("Negotiation needed as polite peer with remote offer, creating answer.");
                await peerConnection.setLocalDescription(await peerConnection.createAnswer());
                socket.emit('webrtc-answer', {
                    targetSocketId: currentCallTargetSocketId,
                    answer: peerConnection.localDescription
                });
            } catch (err) {
                console.error("Error in onnegotiationneeded (polite peer answering):", err);
            }
        }
    };
    */
}

// Initialize call UI state on script load
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
    // Reset potential previous target identifiers
    currentCallTargetSocketId = null;
    currentCallTargetFederatedKey = null;
    
    callStatus.textContent = `Calling ${targetUsername}...`;
    initiateCallBtn.style.display = 'none';
    callTargetUsernameInput.disabled = true;
    hangUpBtn.style.display = 'inline-block'; // Show hang up as soon as call attempt starts

    if (!await startLocalMedia()) { // Start media first
        callStatus.textContent = "Failed to start camera/mic. Cannot call.";
        resetCallStateAndUI(); // Reset UI if media fails
        return;
    }

    if (!peerConnection) {
        createAndConfigurePeerConnection();
    } else { // If PC exists, ensure tracks are fresh if localStream was restarted or changed
        if (localStream && peerConnection.signalingState === 'stable') { // Only modify tracks if stable
            // Remove old tracks
            peerConnection.getSenders().forEach(sender => {
                if (sender.track) {
                    try { peerConnection.removeTrack(sender); } catch(e) { console.warn("Error removing old track:", e); }
                }
            });
            // Add new tracks
            localStream.getTracks().forEach(track => {
                try { peerConnection.addTrack(track, localStream); } catch (e) { console.error("Error re-adding track:", track, e); }
            });
        } else if (peerConnection.signalingState !== 'stable') {
            console.warn("PeerConnection not stable, cannot re-add tracks now. Will rely on negotiation.");
        }
    }
    if (!peerConnection) { // Guard against createAndConfigurePeerConnection failing silently
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
            callerUsername: currentUsername, // Server constructs callerFederatedKey
            offer: peerConnection.localDescription 
        });
        // currentCallTargetSocketId/FederatedKey for the *target* will be set when an answer comes in
        // or if the server directly provides it upon call setup (not current flow).
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
        // Do not reset UI here, as an incoming call is still active. User might fix media and try again.
        // Or, server might timeout the offer if no answer.
        // For simplicity, just disable answer button if media fails for now.
        answerCallBtn.disabled = true; 
        return;
    }
    answerCallBtn.disabled = false; // Re-enable if startLocalMedia was tried again and succeeded.

    if (!peerConnection) createAndConfigurePeerConnection();
     if (!peerConnection) { // Guard clause
        callStatus.textContent = "Error: Call service initialization failed for answering.";
        resetCallStateAndUI();
        return;
    }


    // Set who we are answering. This is crucial for sending ICE candidates correctly.
    currentCallTargetSocketId = incomingCallData.fromSocketId; 
    currentCallTargetFederatedKey = incomingCallData.fromFederatedKey;
    currentCallTargetUsername = incomingCallData.fromUsername; // For display and context
    // politePeer = true; // Not strictly needed for this explicit answer flow.

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('Sending webrtc-answer to:', currentCallTargetFederatedKey || currentCallTargetSocketId);
        socket.emit('webrtc-answer', {
            targetSocketId: currentCallTargetSocketId, // Null if federated call
            targetFederatedKey: currentCallTargetFederatedKey, // Key of the original offerer
            answer: peerConnection.localDescription,
            // No need to send answererUsername, server knows it from the socket.
        });
        
        callStatus.textContent = `In call with ${currentCallTargetUsername}`;
        answerCallBtn.style.display = 'none';
        rejectCallBtn.style.display = 'none';
        hangUpBtn.style.display = 'inline-block';
        initiateCallBtn.style.display = 'none';
        callTargetUsernameInput.disabled = true;
        callTargetUsernameInput.value = currentCallTargetUsername; // Show who we're in call with

    } catch (err) {
        console.error("Error creating/sending answer:", err);
        callStatus.textContent = "Error: Could not answer call.";
        resetCallStateAndUI(); // Reset if answering fails fundamentally
    }
});

rejectCallBtn.addEventListener('click', () => {
    if (incomingCallData && (incomingCallData.fromSocketId || incomingCallData.fromFederatedKey)) {
        console.log("Rejecting call from:", incomingCallData.fromUsername);
        socket.emit('call-rejected', { 
            targetSocketId: incomingCallData.fromSocketId, 
            targetFederatedKey: incomingCallData.fromFederatedKey, 
            // byUser: currentUsername // Server knows who sent 'call-rejected'
        });
    }
    resetCallStateAndUI();
    callStatus.textContent = "Call rejected.";
});

hangUpBtn.addEventListener('click', () => {
    // We need to know who to send the hang-up to.
    // This should be who we are currently in a call with, or attempting to call.
    // currentCallTargetUsername is the person we initiated call to OR received call from and accepted.
    // currentCallTargetSocketId OR currentCallTargetFederatedKey should be set.

    if (currentCallTargetSocketId || currentCallTargetFederatedKey) {
        console.log("Hanging up call with:", currentCallTargetUsername);
        socket.emit('hang-up', { 
            targetSocketId: currentCallTargetSocketId, 
            targetFederatedKey: currentCallTargetFederatedKey, 
        });
    } else if (callTargetUsernameInput.value && !answerCallBtn.style.display.includes('none')) {
        // If we were in the process of calling someone (offer sent, but no answer yet)
        // currentCallTargetUsernameInput.value would be the target.
        // We need a way to signal cancellation of an offer *before* it's answered.
        // For now, hangUpBtn only works if a call is established or if an offer was received.
        // To cancel an outgoing offer, we can just reset state. Server handles timeout or callee rejection.
        console.log("Cancelling outgoing call attempt to:", callTargetUsernameInput.value);
    }
    resetCallStateAndUI();
    callStatus.textContent = "Call ended.";
});


// Socket.IO event handlers for WebRTC signaling

// Handler for when THIS client receives an offer to start a call
socket.on('webrtc-offer', async (data) => {
    // Server sends: { offer, fromUsername, fromSocketId (if local), fromFederatedKey (if federated) }
    console.log(`Incoming webrtc-offer from: ${data.fromUsername} (${data.fromFederatedKey || data.fromSocketId})`);
    
    if (peerConnection && peerConnection.signalingState !== "stable") {
        console.warn("Received an offer while not in a stable state. Current state:", peerConnection.signalingState);
        // Potentially emit 'call-busy' back if truly busy, or handle glare if implementing perfect negotiation.
        // For now, if this client is already in a call or mid-setup, the server should ideally prevent this offer.
        // If it still arrives, the user might be confused. Let's assume server filters busy calls for now.
        // If still an issue, we might need to send a 'busy' signal.
        // For now, if an offer arrives while we are busy with something else, we will overwrite `incomingCallData`.
        // The UI will then reflect this new incoming call. User can choose to answer/reject it.
        // This is simpler than full glare handling on client.
    }

    incomingCallData = { 
        offer: data.offer, 
        fromUsername: data.fromUsername,
        fromSocketId: data.fromSocketId,     // Will be null if from a federated user
        fromFederatedKey: data.fromFederatedKey // Will be set if from a federated user
    };

    callStatus.textContent = `Incoming call from ${data.fromUsername}. Ready to answer?`;
    answerCallBtn.style.display = 'inline-block';
    answerCallBtn.disabled = false; // Ensure it's enabled
    rejectCallBtn.style.display = 'inline-block';
    initiateCallBtn.style.display = 'none'; // Hide initiate while there's an incoming call
    callTargetUsernameInput.disabled = true; // Don't allow typing new target
    callTargetUsernameInput.value = data.fromUsername; // Show who is calling
    hangUpBtn.style.display = 'none'; // Hide hangup until call is answered
});

// Handler for when THIS client (the caller) receives an answer to its offer
socket.on('webrtc-answer', async (data) => {
    // Server sends: { answer, fromUsername (answerer's simple name), fromSocketId (if local answerer), fromFederatedKey (if federated answerer) }
    console.log(`Received webrtc-answer from: ${data.fromUsername} (${data.fromFederatedKey || data.fromSocketId})`);
    
    if (!peerConnection || !data.answer) {
        console.error("PeerConnection not ready or no answer received. State:", peerConnection ? peerConnection.signalingState : 'null');
        callStatus.textContent = "Error: Problem processing call answer.";
        // Don't reset full UI yet, might be a transient issue or malformed data.
        // Consider if a more specific reset is needed.
        return;
    }

    // The target of our call has answered. Update who we're connected to.
    // currentCallTargetUsername was set when we initiated the call.
    // Now we know their specific ID (socket or federated)
    currentCallTargetSocketId = data.fromSocketId;
    currentCallTargetFederatedKey = data.fromFederatedKey;

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        callStatus.textContent = `In call with ${currentCallTargetUsername}`; // currentCallTargetUsername is the one we called
        
        // UI update:
        initiateCallBtn.style.display = 'none';
        callTargetUsernameInput.disabled = true;
        callTargetUsernameInput.value = currentCallTargetUsername; // Confirm who we are in call with
        answerCallBtn.style.display = 'none';
        rejectCallBtn.style.display = 'none';
        hangUpBtn.style.display = 'inline-block';

    } catch (err) {
        console.error("Error setting remote description for answer:", err);
        callStatus.textContent = "Error: Failed to establish call connection.";
        resetCallStateAndUI(); // Reset if setting remote description fails
    }
});

// Handler for ICE candidates from the other peer
socket.on('webrtc-ice-candidate', async (data) => {
    // Server sends: { candidate, fromUsername, fromSocketId, fromFederatedKey }
    // console.log(\`Received ICE candidate from \${data.fromUsername || (data.fromFederatedKey || data.fromSocketId)}\`);
    if (!peerConnection) {
        // console.warn("Received ICE candidate but peerConnection is not initialized.");
        return;
    }
    if (data.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            // console.error("Error adding received ICE candidate:", err);
        }
    }
});

// Handler for when a call initiated by THIS client is rejected by the target
socket.on('call-rejected', (data) => {
    // Server sends: { byUser (who rejected), byUserFederatedKey, forTargetUsername (original caller, i.e. this client) }
    console.log(`Call rejected by: ${data.byUser} (${data.byUserFederatedKey})`);
    if (callStatus) callStatus.textContent = `Call rejected by ${data.byUser}.`;
    resetCallStateAndUI();
});

// Handler for when the other party in an active call hangs up
socket.on('call-ended', (data) => {
    // Server sends: { fromUsername (who hung up), fromKey }
    console.log(`Call ended by: ${data.fromUsername} (${data.fromKey})`);
    if (callStatus) callStatus.textContent = `Call ended by ${data.fromUsername}.`;
    resetCallStateAndUI();
});

// Handler for when THIS client tries to call someone who is busy
socket.on('call-busy', (data) => {
    // Server sends: { busyUser (who is busy), busyUserKey, forTargetUsername (original caller, i.e. this client)}
    console.log(`Call target is busy: ${data.busyUser} (${data.busyUserKey})`);
    if (callStatus) callStatus.textContent = `${data.busyUser} is busy. Try later.`;
    resetCallStateAndUI();
});

// Handler for when THIS client tries to call someone who cannot be found
socket.on('call-target-not-found', (data) => {
    // Server sends: { targetUsername, reason }
    console.log(`Call target not found: ${data.targetUsername}, Reason: ${data.reason}`);
    if (callStatus) callStatus.textContent = `Could not reach ${data.targetUsername}: ${data.reason}.`;
    resetCallStateAndUI();
});

// Chat message handling
form.addEventListener('submit', function(e) {
    e.preventDefault();
    // ... existing code ...
});
