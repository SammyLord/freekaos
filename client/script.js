console.log('Freekaos client script loaded - New UI Version');

const socket = io(); // Connect to the server

// --- New Structure DOM Element References ---
// Modals
const usernameModal = document.getElementById('username-modal');
const createGuildModal = document.getElementById('create-guild-modal');
const joinGuildModal = document.getElementById('join-guild-modal');
const videoCallContainer = document.getElementById('video-call-container'); // Video call UI is now a modal

// Username Modal Elements
const usernameInput = document.getElementById('username-input'); // This ID is reused in the modal
const setUsernameBtn = document.getElementById('set-username-btn'); // This ID is reused
const modalCurrentUsernameTarget = document.getElementById('modal-current-username-target');

// Guilds Nav
const guildsNav = document.getElementById('guilds-nav');
const guildList = document.getElementById('guild-list');
const createGuildModalBtn = document.getElementById('create-guild-modal-btn');
const joinGuildModalBtn = document.getElementById('join-guild-modal-btn');

// Secondary Panel (Channels/DMs/User Info)
const secondaryPanel = document.getElementById('secondary-panel');
const currentContextName = document.getElementById('current-context-name');
const channelListContainer = document.getElementById('channels-list-container');
const channelList = document.getElementById('channel-list');
const createChannelArea = document.getElementById('create-channel-area');
const channelNameInput = document.getElementById('channel-name-input');
const createChannelBtn = document.getElementById('create-channel-btn');
const guildInviteArea = document.getElementById('guild-invite-area');
const generateInviteBtn = document.getElementById('generate-invite-btn');
const generatedInviteCodeDisplay = document.getElementById('generated-invite-code-display');
const userInfoPanel = document.getElementById('user-info-panel');
const currentUsernameDisplay = document.getElementById('current-username'); // In user-info-panel
const usernameSettingsBtn = document.getElementById('username-settings-btn');

// Main Chat Area
const chatMain = document.getElementById('chat-main');
const chatMainHeader = document.getElementById('chat-main-header');
const chatTitle = document.getElementById('chat-title');
const dmCallUserBtn = document.getElementById('dm-call-user-btn'); // Now in chat-main-header

const messagesContainer = document.getElementById('messages-container');
const globalChatArea = document.getElementById('global-chat-area');
const messages = document.getElementById('messages'); // Global chat messages ul (this was the old ID for global)
const guildChatArea = document.getElementById('guild-chat-area');
const guildMessages = document.getElementById('guild-messages');
const dmChatArea = document.getElementById('dm-chat-area');
const dmMessages = document.getElementById('dm-messages');

const chatInputArea = document.getElementById('chat-input-area');
const globalChatForm = document.getElementById('global-chat-form');
const globalChatInput = document.getElementById('input'); // ID 'input' from original global chat form
const guildChatForm = document.getElementById('guild-chat-form');
const guildChatInput = document.getElementById('guild-chat-input');
const dmChatForm = document.getElementById('dm-chat-form');
const dmChatInput = document.getElementById('dm-chat-input');

// User List Panel
const userListPanel = document.getElementById('user-list-panel');
const userList = document.getElementById('user-list');

// New reference for DM list container in secondary panel
const dmListContainer = document.getElementById('dm-list-container');

// Create/Join Guild Modal Inputs (ensure IDs match new HTML)
const guildNameInput = document.getElementById('guild-name-input'); // In create-guild-modal
const createGuildBtnInModal = document.querySelector('#create-guild-modal button#create-guild-btn'); 
const joinGuildCodeInput = document.getElementById('join-guild-code-input'); // In join-guild-modal
const joinGuildBtnInModal = document.querySelector('#join-guild-modal button#join-guild-btn'); 

// Video Call Elements (within video-call-container modal)
const callControls = document.getElementById('call-controls');
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
let currentFKey = null; 
let serverInstanceId = null; 
let userGuilds = [];      
let selectedGuildId = null;
let selectedChannelId = null;
let currentView = 'global'; 
let currentDmTargetFKey = null; 
let dmHistories = {};         
let unreadDms = {};           

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

// --- Modal Handling --- 
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex'; 
        modal.classList.add('active-modal'); 
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none'; 
        modal.classList.remove('active-modal');
    }
}

document.querySelectorAll('.close-modal-btn').forEach(button => {
    button.addEventListener('click', () => {
        const modalId = button.dataset.modalId;
        if (modalId) closeModal(modalId);
    });
});

if (createGuildModalBtn) createGuildModalBtn.addEventListener('click', () => openModal('create-guild-modal'));
if (joinGuildModalBtn) joinGuildModalBtn.addEventListener('click', () => openModal('join-guild-modal'));
if (usernameSettingsBtn) usernameSettingsBtn.addEventListener('click', () => {
    if (usernameInput && currentUsername !== 'Anonymous') usernameInput.value = currentUsername;
    openModal('username-modal');
});

// --- Initial UI State & Username Handling ---
function setInitialUIState() {
    if (currentUsername === 'Anonymous') {
        openModal('username-modal');
        if (guildsNav) guildsNav.style.display = 'none';
        if (secondaryPanel) secondaryPanel.style.display = 'none';
        if (chatMain) chatMain.style.display = 'none';
        if (userListPanel) userListPanel.style.display = 'none';
    } else {
        closeModal('username-modal');
        if (guildsNav) guildsNav.style.display = 'flex'; 
        if (secondaryPanel) secondaryPanel.style.display = 'flex';
        if (chatMain) chatMain.style.display = 'flex';
        if (userListPanel) userListPanel.style.display = 'flex'; 
        
        if (currentUsernameDisplay) currentUsernameDisplay.textContent = currentUsername;
        if (modalCurrentUsernameTarget) modalCurrentUsernameTarget.textContent = currentUsername;
        setDefaultView(); // Set default chat view after username is confirmed
    }
}

if (setUsernameBtn) {
    setUsernameBtn.addEventListener('click', () => {
        if (!serverInstanceId) {
            alert('Connecting to server instance. Please wait a moment and try again.');
            return;
        }
        const username = usernameInput.value.trim();
        if (username && username.length > 0) {
            currentUsername = username;
            currentFKey = `${username}@${serverInstanceId}`;
            
            if (currentUsernameDisplay) currentUsernameDisplay.textContent = currentUsername;
            if (modalCurrentUsernameTarget) modalCurrentUsernameTarget.textContent = currentUsername; 
            
            socket.emit('set username', username);
            closeModal('username-modal');
            setInitialUIState(); 

            if (createGuildModalBtn) createGuildModalBtn.disabled = false;
            if (joinGuildModalBtn) joinGuildModalBtn.disabled = false;
            if (callStatus && callStatus.textContent.includes('Set username')) {
                callStatus.textContent = 'Ready to call.';
            }
            if(initiateCallBtn) initiateCallBtn.disabled = false;
            if(callTargetUsernameInput) callTargetUsernameInput.disabled = false;
        } else {
            alert('Username cannot be empty.');
        }
    });
}

socket.on('instance_id_info', (data) => {
    if (data && data.instanceId) {
        serverInstanceId = data.instanceId;
        console.log('Received instance ID:', serverInstanceId);
        if (currentUsername !== 'Anonymous') {
            currentFKey = `${currentUsername}@${serverInstanceId}`;
            // If username was set while serverInstanceId was null, and then setInitialUIState was called,
            // it might have called setDefaultView too early. Call it again if username is set.
            if (currentUsername !== 'Anonymous') setDefaultView();
        } else {
            // If username modal is still open, user can now proceed to set username
        }
        if (callStatus && callStatus.textContent === 'Connecting to server...') {
            callStatus.textContent = (currentUsername === 'Anonymous') ? 'Set username to enable calling.' : 'Ready to call.';
        }
    } else {
        console.error('Received invalid instance_id_info from server:', data);
        if (callStatus) callStatus.textContent = 'Error: Server connection issue.';
        if(setUsernameBtn) setUsernameBtn.disabled = true; 
        alert('Error connecting to server instance. Please refresh and try again.');
    }
});

setInitialUIState();

// --- Helper: Switch Active Chat Area & Form --- 
function setActiveChatView(viewType, contextName = 'Chat') {
    const allChatAreas = [globalChatArea, guildChatArea, dmChatArea].filter(el => el);
    const allChatForms = [globalChatForm, guildChatForm, dmChatForm].filter(el => el);

    allChatAreas.forEach(area => area.classList.remove('active-chat'));
    allChatForms.forEach(form => form.classList.remove('active-form'));

    if(chatTitle) chatTitle.textContent = contextName;
    let activeFormInput = null;

    if (viewType === 'global') {
        if (globalChatArea) globalChatArea.classList.add('active-chat');
        if (globalChatForm) globalChatForm.classList.add('active-form');
        if (dmCallUserBtn) dmCallUserBtn.style.display = 'none';
        if (globalChatInput) activeFormInput = globalChatInput;
        currentView = 'global';
        if (messages) messages.innerHTML = ''; // Clear previous messages in the global UL ('messages' is the UL)
        socket.emit('load all messages'); 
    } else if (viewType === 'guild') {
        if (guildChatArea) guildChatArea.classList.add('active-chat');
        if (guildChatForm) guildChatForm.classList.add('active-form');
        if (dmCallUserBtn) dmCallUserBtn.style.display = 'none';
        if (guildChatInput) activeFormInput = guildChatInput;
        currentView = 'guild';
        // Guild messages are loaded when a channel is selected via selectChannel
    } else if (viewType === 'dm') {
        if (dmChatArea) dmChatArea.classList.add('active-chat');
        if (dmChatForm) dmChatForm.classList.add('active-form');
        if (dmCallUserBtn && currentDmTargetFKey && currentDmTargetFKey !== currentFKey) {
            dmCallUserBtn.style.display = 'inline-block';
        } else if (dmCallUserBtn) {
            dmCallUserBtn.style.display = 'none';
        }
        if (dmChatInput) activeFormInput = dmChatInput;
        currentView = 'dm';
        // DM messages are loaded when a DM is selected
    }
    if (activeFormInput) activeFormInput.focus();
}

// --- Guild, Channel, and View Management (Focus on Guilds) ---
function renderGuilds(guildsDataFromServer) {
    if (!guildList) return;
    guildList.innerHTML = ''; // Clear existing guilds
    userGuilds = guildsDataFromServer; 

    // 1. Add "Home" / Global Chat icon
    const homeItem = document.createElement('li');
    homeItem.classList.add('guild-item');
    homeItem.textContent = 'H'; // Placeholder for Home/Global icon (e.g., a house emoji or SVG)
    homeItem.title = "Global Chat / DMs";
    homeItem.dataset.guildId = '__global__'; // Special ID for global/home
    homeItem.addEventListener('click', () => {
        selectGuild('__global__');
    });
    guildList.appendChild(homeItem);

    // 2. Render actual guilds
    userGuilds.forEach(guild => {
        const item = document.createElement('li');
        item.classList.add('guild-item');
        item.textContent = guild.name.substring(0, 2).toUpperCase(); // Simple text icon
        item.title = guild.name;
        item.dataset.guildId = guild.id;
        // TODO: Add unread indicator if guild has unread messages (future)
        // if (guildHasUnread(guild.id)) item.classList.add('has-unread'); 

        item.addEventListener('click', () => {
            selectGuild(guild.id);
        });
        guildList.appendChild(item);
    });

    // Highlight selected guild (or home by default if nothing else is selected)
    // This logic will be handled by selectGuild making the final call after rendering
}

function selectGuild(guildIdToSelect) {
    console.log(`selectGuild called with: ${guildIdToSelect}`);
    // Deselect previous guild icon
    document.querySelectorAll('#guild-list .guild-item.active-guild').forEach(el => el.classList.remove('active-guild'));

    if (guildIdToSelect === '__global__') {
        selectedGuildId = '__global__';
        selectedChannelId = null; // No channels in global view
        if (currentContextName) currentContextName.textContent = 'Direct Messages'; 
        if (channelListContainer) channelListContainer.style.display = 'none';
        if (dmListContainer) {
            dmListContainer.style.display = 'block';
            // Populate dmListContainer with DM instructions or a list of recent DMs (future)
            dmListContainer.innerHTML = '<p class="panel-info">Select a user from the list on the right to start a direct message.</p>'; 
        }
        if (createChannelArea) createChannelArea.style.display = 'none';
        if (guildInviteArea) guildInviteArea.style.display = 'none';
        
        const homeGuildIcon = document.querySelector('#guild-list .guild-item[data-guild-id="__global__"]');
        if (homeGuildIcon) homeGuildIcon.classList.add('active-guild');
        
        setActiveChatView('global', 'Global Chat / Home'); 
        if (chatTitle) chatTitle.textContent = 'Global Chat / Home';

    } else {
        const guild = userGuilds.find(g => g.id === guildIdToSelect);
        if (!guild) {
            console.error('Guild not found in selectGuild:', guildIdToSelect);
            // Optionally, select __global__ as fallback
            selectGuild('__global__');
            return;
        }
        selectedGuildId = guild.id;
        if (currentContextName) currentContextName.textContent = guild.name; 
        if (channelListContainer) channelListContainer.style.display = 'block';
        if (dmListContainer) dmListContainer.style.display = 'none';

        renderChannels(guild.channels || [], guild.ownerFKey); // Render channels for the selected guild

        const guildIcon = document.querySelector(`#guild-list .guild-item[data-guild-id="${guild.id}"]`);
        if (guildIcon) guildIcon.classList.add('active-guild');

        // Select the first channel by default, or the previously selected one if applicable
        let channelToSelect = null;
        if (guild.channels && guild.channels.length > 0) {
            // Check if oldSelectedChannelId is valid for this guild
            // This logic might be better if oldSelectedChannelId was stored per guild
            // For now, just select first channel of the newly selected guild.
            channelToSelect = guild.channels[0].id;
        }
        
        if (channelToSelect) {
            selectChannel(guild.id, channelToSelect);
        } else {
            // No channels in this guild, clear guild chat area and show info
            console.log(`No channels found in guild ${guild.name}. Clearing guild chat.`);
            if (guildMessages) guildMessages.innerHTML = '<li class="channel-info">No channels in this guild. Create one if you are the owner.</li>';
            setActiveChatView('guild', `${guild.name} - No Channels`);
            if (chatTitle) chatTitle.textContent = `${guild.name} - No Channels`;
            if (createChannelArea && guild.ownerFKey === currentFKey) createChannelArea.style.display = 'block';
            else if (createChannelArea) createChannelArea.style.display = 'none';
            if (guildInviteArea && guild.ownerFKey === currentFKey) guildInviteArea.style.display = 'block';
            else if (guildInviteArea) guildInviteArea.style.display = 'none';
            selectedChannelId = null; // Ensure no channel is marked as selected
        }
    }
    // Ensure user info panel is always visible at the bottom of secondary panel
    if (userInfoPanel) userInfoPanel.style.display = 'flex'; 
}

function renderChannels(channelsData, ownerFKey) {
    if (!channelList) return;
    channelList.innerHTML = '';
    const isOwner = currentFKey === ownerFKey;

    if (createChannelArea) {
        createChannelArea.style.display = isOwner ? 'flex' : 'none';
        if (channelNameInput) channelNameInput.value = ''; // Clear input
    }
    if (guildInviteArea) {
        guildInviteArea.style.display = isOwner ? 'block' : 'none';
    }
    if (generatedInviteCodeDisplay) {
        generatedInviteCodeDisplay.value = ''; // Clear previous code
        generatedInviteCodeDisplay.style.display = 'none'; // Hide by default
    }

    if (Object.keys(channelsData).length === 0) {
        channelList.innerHTML = isOwner ? '<li class="channel-info">No channels. Create one!</li>' : '<li class="channel-info">No channels in this guild yet.</li>';
        // If no channels, ensure guild chat area reflects this state
        setActiveChatView('guild', `${currentContextName.textContent || 'Guild'} - No Channels`);
        if(guildMessages) guildMessages.innerHTML = '<li class="channel-info">Select or create a channel.</li>';
        return;
    }

    for (const channelId in channelsData) {
        const channel = channelsData[channelId];
        const item = document.createElement('li');
        item.textContent = `# ${channel.name}`; 
        item.dataset.channelId = channel.id;
        item.dataset.guildId = selectedGuildId; 
        // TODO: Add unread indicator for channel

        item.addEventListener('click', () => {
            selectChannel(selectedGuildId, channel.id);
        });
        channelList.appendChild(item);
    }
}

function selectChannel(guildId, channelId) { 
    const guild = userGuilds.find(g => g.id === guildId);
    if (!guild) {
        console.error('Guild not found for channel selection:', guildId);
        setActiveChatView('guild', 'Unknown Guild');
        if(guildMessages) guildMessages.innerHTML = '<li class="channel-info">Error: Guild data not found.</li>';
        return;
    }

    // Ensure channels are stored as an array (as per server guild structure)
    const channel = guild.channels && Array.isArray(guild.channels) ? guild.channels.find(c => c.id === channelId) : null;
    
    if (!channel) {
        console.error('Channel not found:', channelId, 'in guild', guildId);
        setActiveChatView('guild', guild.name); // Keep guild name in title
        if(guildMessages) guildMessages.innerHTML = '<li class="channel-info">Error: Channel data not found. Select another channel.</li>';
        if(createChannelArea && guild.ownerFKey === currentFKey) createChannelArea.style.display = 'block';
        else if(createChannelArea) createChannelArea.style.display = 'none';
        if(guildInviteArea && guild.ownerFKey === currentFKey) guildInviteArea.style.display = 'block';
        else if(guildInviteArea) guildInviteArea.style.display = 'none';
        return;
    }

    selectedGuildId = guildId;
    selectedChannelId = channelId;

    document.querySelectorAll('#channel-list .channel-item').forEach(item => item.classList.remove('active-channel'));
    const channelElement = document.querySelector(`#channel-list .channel-item[data-channel-id="${channelId}"]`);
    if (channelElement) {
        channelElement.classList.add('active-channel');
    }
    
    const newChatTitle = `${guild.name} - ${channel.name}`;
    setActiveChatView('guild', newChatTitle);
    // chatTitle is updated by setActiveChatView, but if more specific update needed:
    // if (chatTitle) chatTitle.textContent = newChatTitle; 

    if (guildMessages) guildMessages.innerHTML = ''; // Clear previous messages for the UL 'guildMessages'

    // Request messages for this channel from the server.
    socket.emit('load guild channel messages', { guildId, channelId });

    // Show/hide create channel and invite generation based on ownership
    if(createChannelArea && guild.ownerFKey === currentFKey) createChannelArea.style.display = 'block';
    else if(createChannelArea) createChannelArea.style.display = 'none';
    if(guildInviteArea && guild.ownerFKey === currentFKey) guildInviteArea.style.display = 'block';
    else if(guildInviteArea) guildInviteArea.style.display = 'none';

    console.log(`Selected Guild: ${selectedGuildId}, Channel: ${selectedChannelId} (Owner: ${guild.ownerFKey === currentFKey})`);
}

function setDefaultView() {
    // If already in a guild or DM, don't forcibly switch to global, unless no selection.
    if (currentView === 'guild' && selectedGuildId && selectedChannelId) {
        // Potentially re-select or verify current guild/channel view
        // For now, assume it's handled if selectGuild/selectChannel was called
        console.log("setDefaultView: Already in guild view.");
        // Ensure guild chat form is visible, others hidden
        if (guildChatForm) guildChatForm.style.display = 'flex';
        if (globalChatForm) globalChatForm.style.display = 'none';
        if (dmChatForm) dmChatForm.style.display = 'none';
        return;
    }
    if (currentView === 'dm' && currentDmTargetFKey) {
        console.log("setDefaultView: Already in DM view.");
         // Ensure DM chat form is visible, others hidden
        if (dmChatForm) dmChatForm.style.display = 'flex';
        if (globalChatForm) globalChatForm.style.display = 'none';
        if (guildChatForm) guildChatForm.style.display = 'none';
        return;
    }

    // Default to global chat if no other view is active or appropriate
    console.log("setDefaultView: Setting to Global Chat.");
    selectGuild('__global__'); // This will trigger setActiveChatView('global')
}

// --- Global Chat Functionality ---
function renderChatMessage(msg) {
    if (!messages) { // 'messages' is the UL element for global chat (original ID)
        console.error("Global messages container ('messages') not found.");
        return;
    }
    const item = document.createElement('li');
    item.classList.add('message-item');
    
    let displayName = msg.username || 'User';
    // Add instance identifier if it's a federated message and not from our instance
    if (msg.instance && msg.instance !== serverInstanceId && !displayName.includes(`@${msg.instance}`)) {
        displayName += ` @${msg.instance.replace(/^local:/, '')}`;
    } else if (msg.userFKey && msg.userFKey.includes('@')) {
        const [namePart, instancePart] = msg.userFKey.split('@');
        if (instancePart !== serverInstanceId && !displayName.includes(`@${instancePart}`)) {
            displayName += ` @${instancePart.replace(/^local:/, '')}`;
        }
    }

    // Determine if message is sent by current user or received
    if (msg.userFKey === currentFKey || (msg.username === currentUsername && (!msg.userFKey || msg.userFKey.split('@')[1] === serverInstanceId))) {
        item.classList.add('sent');
    } else {
        item.classList.add('received');
    }
    
    const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
    item.innerHTML = `
        <div class="message-content">
            <span class="username">${displayName}:</span>
            <span class="text">${msg.text}</span>
        </div>
        <span class="timestamp">${timestamp}</span>
    `;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

function loadAndRenderAllMessages(msgs) {
    if (!messages) return; // 'messages' is the UL
    messages.innerHTML = ''; // Clear existing messages
    if (Array.isArray(msgs)) {
        msgs.forEach(msg => renderChatMessage(msg));
    }
    messages.scrollTop = messages.scrollHeight;
}

if (globalChatForm) {
    globalChatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (globalChatInput && globalChatInput.value.trim() && currentUsername !== 'Anonymous' && currentFKey) {
            const messageText = globalChatInput.value.trim();
            socket.emit('chat message', { text: messageText }); // Server adds username, FKey, instance
            globalChatInput.value = '';
        } else {
            console.warn('Cannot send global message: Username not set or message empty.');
            if (currentUsername === 'Anonymous') alert('Please set your username first!');
        }
    });
}

socket.on('chat message', (msg) => { // msg from server: { username, text, timestamp, instance?, userFKey? }
    if (currentView === 'global') {
        renderChatMessage(msg);
    }
    // TODO: Add unread indicator for global/home if not active
});

socket.on('load all messages', (msgs) => { // msgs: Array of message objects
    if (currentView === 'global') { // Ensure messages are loaded only if global view is active
        loadAndRenderAllMessages(msgs);
    }
});

// --- Guild Creation and Joining Logic ---
socket.on('update guild list', ({ guilds }) => {
    console.log("Received 'update guild list' from server:", guilds);
    const oldSelectedGuildId = selectedGuildId;
    const oldSelectedChannelId = selectedChannelId;
    renderGuilds(guilds); // Re-render the guild list
    
    const stillExists = userGuilds.find(g => g.id === oldSelectedGuildId);
    if (oldSelectedGuildId && oldSelectedGuildId !== '__global__' && stillExists) {
        selectGuild(oldSelectedGuildId); // Reselect the guild
        if (oldSelectedChannelId && stillExists.channels && stillExists.channels[oldSelectedChannelId]){
            selectChannel(oldSelectedGuildId, oldSelectedChannelId); // And reselect the channel if it also still exists
        }
    } else if (oldSelectedGuildId && !stillExists) {
         console.log(`Selected guild ${oldSelectedGuildId} no longer in list. Defaulting view.`);
        selectGuild('__global__');
    } else if (!oldSelectedGuildId) {
        selectGuild('__global__');
    }
});

socket.on('guild created', ({ guild }) => {
    console.log('Guild created:', guild);
    // Server should send 'update guild list' which will handle rendering and selection.
    // Optionally, directly select the new guild:
    // renderGuilds(userGuilds); // Assuming userGuilds is updated by 'update guild list' before this
    // selectGuild(guild.id);
});

socket.on('channel created', ({ guildId, channel }) => {
    console.log(`Channel ${channel.name} created in guild ${guildId}`);
    const guild = userGuilds.find(g => g.id === guildId);
    if (guild) {
        if (!guild.channels) guild.channels = {};
        guild.channels[channel.id] = channel;
        if (guildId === selectedGuildId) { // If the modified guild is currently selected
            renderChannels(guild.channels, guild.ownerFKey); // Re-render its channels
            selectChannel(guildId, channel.id); // And select the new channel
        }
    }
});

socket.on('guild structure updated', ({ guild: updatedGuild }) => {
    console.log('Guild structure updated for:', updatedGuild.name);
    const index = userGuilds.findIndex(g => g.id === updatedGuild.id);
    if (index !== -1) {
        userGuilds[index] = updatedGuild; // Update local cache of guild data
        if (updatedGuild.id === selectedGuildId) { // If the updated guild is currently selected
            renderChannels(updatedGuild.channels || {}, updatedGuild.ownerFKey);
            // If current channel was deleted or is no longer valid, select the first available one
            if (selectedChannelId && !updatedGuild.channels[selectedChannelId]) {
                const firstChannelId = Object.keys(updatedGuild.channels || {})[0];
                if (firstChannelId) {
                    selectChannel(updatedGuild.id, firstChannelId);
                } else { // No channels left
                    if(guildMessages) guildMessages.innerHTML = '<li class="channel-info">No channels available.</li>';
                    setActiveChatView('guild', `${updatedGuild.name} - No Channels`);
                }
            } else if (selectedChannelId) {
                // Re-select current channel to refresh its view (in case its name changed, though not handled yet)
                selectChannel(updatedGuild.id, selectedChannelId);
            } else {
                 // No channel was selected, select first if available
                const firstChannelId = Object.keys(updatedGuild.channels || {})[0];
                if (firstChannelId) selectChannel(updatedGuild.id, firstChannelId);
            }
        }
    } else {
        // This might be a guild the user just joined via invite, 
        // 'update guild list' should handle adding it and then selection logic would apply.
        console.log('Received structure update for a guild not in local list, waiting for update guild list event.');
    }
});

// --- Guild Chat Functionality ---
function renderGuildChannelMessage(msg) { // msg: { guildId, channelId, username, text, timestamp, instance?, userFKey? }
    if (!guildMessages) { // 'guildMessages' is the UL element for guild chat
        console.error("Guild messages container ('guildMessages') not found.");
        return;
    }
    const item = document.createElement('li');
    item.classList.add('message-item');

    let displayName = msg.username || 'User';
    if (msg.instance && msg.instance !== serverInstanceId && !displayName.includes(`@${msg.instance}`)) {
        displayName += ` @${msg.instance.replace(/^local:/, '')}`;
    } else if (msg.userFKey && msg.userFKey.includes('@')) {
        const [namePart, instancePart] = msg.userFKey.split('@');
        if (instancePart !== serverInstanceId && !displayName.includes(`@${instancePart}`)) {
            displayName += ` @${instancePart.replace(/^local:/, '')}`;
        }
    }
    
    if (msg.userFKey === currentFKey) {
        item.classList.add('sent');
    } else {
        item.classList.add('received');
    }
    
    const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
    item.innerHTML = `
        <div class="message-content">
            <span class="username">${displayName}:</span>
            <span class="text">${msg.text}</span>
        </div>
        <span class="timestamp">${timestamp}</span>
    `;
    guildMessages.appendChild(item);
    guildMessages.scrollTop = guildMessages.scrollHeight;
}

// This function replaces the old placeholder or partially updated one.
function loadAndRenderGuildChannelMessages(guildId, channelId, channelMessages) {
    if (selectedGuildId === guildId && selectedChannelId === channelId && guildMessages) {
        guildMessages.innerHTML = ''; // Clear existing messages
        if (Array.isArray(channelMessages)) {
            channelMessages.forEach(msg => renderGuildChannelMessage(msg));
        }
        guildMessages.scrollTop = guildMessages.scrollHeight;
    } else {
        console.log('Not rendering guild messages - view/selection mismatch or no container', 
                    {sg: selectedGuildId, sc: selectedChannelId, currentG: guildId, currentC: channelId });
    }
}

if (guildChatForm) {
    guildChatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (guildChatInput && guildChatInput.value.trim() && selectedGuildId && selectedChannelId && currentUsername !== 'Anonymous' && currentFKey) {
            const messageContent = guildChatInput.value.trim();
            socket.emit('guild chat message', {
                guildId: selectedGuildId,
                channelId: selectedChannelId,
                message: messageContent // Server will add username, FKey, instance, timestamp
            });
            guildChatInput.value = '';
        } else {
            console.warn('Cannot send guild message: No guild/channel selected, message empty, or username not set.');
             if (currentUsername === 'Anonymous') {
                alert('Please set your username first!');
                openModal('username-modal');
             }
        }
    });
}

// This replaces or ensures the correct definition for the socket listener
socket.on('new guild chat message', (msg) => { // msg: { guildId, channelId, username, text, timestamp, instance?, userFKey? }
    if (currentView === 'guild' && msg.guildId === selectedGuildId && msg.channelId === selectedChannelId) {
        renderGuildChannelMessage(msg);
    }
    // TODO: Add unread indicator for guild channels if not active (and user is a member)
});

// This replaces or ensures the correct definition for the socket listener
socket.on('guild channel messages', (data) => { // data: { guildId, channelId, messages: [] }
    if (currentView === 'guild' && data.guildId === selectedGuildId && data.channelId === selectedChannelId) {
        loadAndRenderGuildChannelMessages(data.guildId, data.channelId, data.messages);
    } else {
         console.log('Received guild channel messages for non-active/non-matching guild/channel', 
                    {sg: selectedGuildId, sc: selectedChannelId, receivedG: data.guildId, receivedC: data.channelId, view: currentView });
    }
});

// --- User List Functionality ---
function renderUserList(users) {
    if (!userList) return;
    userList.innerHTML = ''; // Clear existing user list

    const sortedUsers = Object.entries(users).sort(([fKeyA, userA], [fKeyB, userB]) => {
        // Sort self to the top, then by username, then by instance ID
        if (fKeyA === currentFKey) return -1;
        if (fKeyB === currentFKey) return 1;
        const usernameComparison = (userA.username || '').localeCompare(userB.username || '');
        if (usernameComparison !== 0) return usernameComparison;
        return (userA.instanceId || '').localeCompare(userB.instanceId || '');
    });

    sortedUsers.forEach(([fKey, user]) => {
        const item = document.createElement('li');
        item.classList.add('user-list-item');
        item.dataset.fkey = fKey;
        item.dataset.username = user.username;
        
        let displayName = user.username;
        if (user.instanceId && user.instanceId !== serverInstanceId) {
            displayName += ` @${user.instanceId.replace(/^local:/, '')}`;
        }
        item.textContent = displayName;

        if (fKey === currentFKey) {
            item.classList.add('current-user');
            item.textContent += ' (You)';
        } else {
            // Add click listener for non-self users to initiate DM
            item.addEventListener('click', () => {
                if (currentUsername === 'Anonymous' || !currentFKey) {
                    alert('Please set your username first to start a DM.');
                    openModal('username-modal');
                    return;
                }
                if (fKey === currentDmTargetFKey && currentView === 'dm') {
                    console.log('Already in DM with this user.');
                    return; // Already in DM with this user
                }
                currentDmTargetFKey = fKey;
                if (dmMessages) dmMessages.innerHTML = ''; // Clear previous DM messages
                dmHistories[fKey] = []; // Reset local history cache for this DM
                socket.emit('load_dm_history', { withUserFKey: fKey });
                setActiveChatView('dm', `DM with ${user.username}`);
                if (unreadDms[fKey]) {
                    unreadDms[fKey] = 0;
                    updateDmUnreadIndicators();
                }
            });
        }
        if (unreadDms[fKey] > 0) {
            item.classList.add('has-unread-dm');
        }

        userList.appendChild(item);
    });
}

socket.on('user list', (users) => {
    renderUserList(users);
    updateDmUnreadIndicators(); // Update indicators based on new list and existing unreadDms
});

// --- DM Chat Functionality ---
function renderDmMessage(msg, toSelf = false) {
    if (!dmMessages) { // dmMessages is the UL for DM chat
        console.error("DM messages container not found");
        return;
    }
    const item = document.createElement('li');
    item.classList.add('message-item');

    // msg: { senderFKey, targetFKey, content, timestamp, conversationId }
    let displayName = 'User';
    let isSentByMe = msg.senderFKey === currentFKey;

    if (isSentByMe) {
        item.classList.add('sent');
        displayName = currentUsername; // or extract from currentFKey
    } else {
        item.classList.add('received');
        displayName = msg.senderFKey ? msg.senderFKey.split('@')[0] : 'User';
        if (msg.senderFKey && msg.senderFKey.includes('@') && msg.senderFKey.split('@')[1] !== serverInstanceId) {
            displayName += ` @${msg.senderFKey.split('@')[1].replace(/^local:/, '')}`;
        }
    }

    const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
    item.innerHTML = `
        <div class="message-content">
            <span class="username">${displayName}:</span>
            <span class="text">${msg.content}</span>
        </div>
        <span class="timestamp">${timestamp}</span>
    `;
    dmMessages.appendChild(item);
    dmMessages.scrollTop = dmMessages.scrollHeight;

    // Store in local history
    const conversationId = determineConversationId(msg.senderFKey, msg.targetFKey);
    if (!dmHistories[conversationId]) {
        dmHistories[conversationId] = [];
    }
    // Avoid duplicates if server also sends history
    if (!dmHistories[conversationId].find(m => m.timestamp === msg.timestamp && m.content === msg.content)) {
         dmHistories[conversationId].push(msg);
    }
}

function determineConversationId(fKey1, fKey2) {
    return [fKey1, fKey2].sort().join('--');
}

function loadAndRenderDmHistory(targetFKey, historyMessages) {
    if (currentView === 'dm' && currentDmTargetFKey === targetFKey && dmMessages) {
        dmMessages.innerHTML = ''; // Clear existing messages
        const conversationId = determineConversationId(currentFKey, targetFKey);
        dmHistories[conversationId] = historyMessages || [];
        if (Array.isArray(dmHistories[conversationId])) {
            dmHistories[conversationId].forEach(msg => renderDmMessage(msg));
        }
        dmMessages.scrollTop = dmMessages.scrollHeight;
    } else {
        // Store history if not currently viewing, for later.
        const conversationId = determineConversationId(currentFKey, targetFKey);
        dmHistories[conversationId] = historyMessages || [];
        console.log(`Stored DM history with ${targetFKey} while not in view.`);
    }
}

if (dmChatForm) {
    dmChatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (dmChatInput && dmChatInput.value.trim() && currentDmTargetFKey && currentUsername !== 'Anonymous' && currentFKey) {
            const messageContent = dmChatInput.value.trim();
            socket.emit('send_dm', {
                targetUserFKey: currentDmTargetFKey,
                messageContent: messageContent
            });
            // Optimistically render sent message
            const tempMsg = {
                senderFKey: currentFKey,
                targetFKey: currentDmTargetFKey,
                content: messageContent,
                timestamp: new Date().toISOString()
            };
            renderDmMessage(tempMsg);
            dmChatInput.value = '';
        } else {
            console.warn('Cannot send DM: No target, message empty, or username not set.');
            if (currentUsername === 'Anonymous') {
                alert('Please set your username first!');
                openModal('username-modal');
            }
        }
    });
}

socket.on('receive_dm', (msg) => {
    const otherUserFKey = msg.senderFKey === currentFKey ? msg.targetFKey : msg.senderFKey;
    const conversationId = determineConversationId(msg.senderFKey, msg.targetFKey);

    if (!dmHistories[conversationId]) dmHistories[conversationId] = [];
     // Avoid duplicates if server also sends history or if already rendered optimistically
    if (!dmHistories[conversationId].find(m => m.timestamp === msg.timestamp && m.content === msg.content)) {
         dmHistories[conversationId].push(msg);
    }

    if (currentView === 'dm' && currentDmTargetFKey === otherUserFKey) {
        // If it's the message we just sent optimistically, it might be a dupe from server.
        // The renderDmMessage and history push already tries to avoid exact dupes.
        // For simplicity, if the view is active, we re-render from history, which handles sorting and display.
        // Let's just call renderDmMessage if it's not an echo of what we typed
        if (msg.senderFKey !== currentFKey) {
             renderDmMessage(msg);
        }
    } else {
        // DM received for a non-active chat, update unread count
        if (msg.senderFKey !== currentFKey) { // Don't count self-echoes from other tabs as unread
            if (!unreadDms[otherUserFKey]) {
                unreadDms[otherUserFKey] = 0;
            }
            unreadDms[otherUserFKey]++;
            updateDmUnreadIndicators();
        }
    }
});

socket.on('dm_history', (data) => { // data: { withUserFKey, history: [] }
    loadAndRenderDmHistory(data.withUserFKey, data.history);
});

socket.on('dm_error', (error) => {
    alert(`DM Error: ${error.message}`);
    // Potentially clear DM view or show error in DM chat area
    if (currentView === 'dm' && currentDmTargetFKey === error.targetFKey) {
        if(dmMessages) dmMessages.innerHTML = `<li class='error-message'>DM Error: ${error.message}</li>`;
    }
});

// --- DM Unread Indicators ---
function updateDmUnreadIndicators() {
    const dmTabButton = document.querySelector('.view-switcher-btn[data-view="dms"]'); // Assuming new UI might have such a button
    let totalUnread = 0;

    document.querySelectorAll('#user-list .user-list-item').forEach(item => {
        const fKey = item.dataset.fkey;
        if (unreadDms[fKey] > 0) {
            item.classList.add('has-unread-dm');
            item.setAttribute('data-unread-count', unreadDms[fKey]); // For potential display in ::after
            totalUnread += unreadDms[fKey];
        } else {
            item.classList.remove('has-unread-dm');
            item.removeAttribute('data-unread-count');
        }
    });

    // If there's a general DM tab/button, update its indicator
    // This part depends on the final HTML for switching to DM view (e.g. if DMs are a tab in secondary panel)
    // For now, let's assume a generic selector or handle this more specifically when side panel is built.
    if (dmTabButton) { // Placeholder - this selector needs to match the actual DM view trigger
        if (totalUnread > 0) {
            dmTabButton.classList.add('has-unread');
            dmTabButton.setAttribute('data-total-unread', totalUnread);
        } else {
            dmTabButton.classList.remove('has-unread');
            dmTabButton.removeAttribute('data-total-unread');
        }
    }
}

// --- DM Call Button --- 
if (dmCallUserBtn) {
    dmCallUserBtn.addEventListener('click', () => {
        if (currentDmTargetFKey && currentUsername !== 'Anonymous' && currentFKey) {
            const targetUsernameToCall = currentDmTargetFKey.split('@')[0]; // Extract username part
            if (callTargetUsernameInput) callTargetUsernameInput.value = targetUsernameToCall; 
            // If the target is federated, we need the full FKey for the server
            // The server-side initiate call logic already handles federatedKey if available.
            // We store currentDmTargetFKey which is the federated key.
            // currentCallTargetFederatedKey will be set based on this in initiateCall logic below.
            
            console.log(`Initiating call from DM to: ${currentDmTargetFKey}`);
            openModal('video-call-container'); // Open the video call modal
            // The main 'initiate-call-btn' in the modal will handle the actual call emission
            // We might want to directly trigger that button's action or a common function here
            // For now, just opening modal and pre-filling. User then clicks initiate.
            if(initiateCallBtn) initiateCallBtn.disabled = false;
            if(callTargetUsernameInput) callTargetUsernameInput.disabled = false;

        } else {
            alert('Cannot initiate call. No DM target selected or username not set.');
            if (currentUsername === 'Anonymous') openModal('username-modal');
        }
    });
}

// --- WebRTC Signaling and Call Handling (Adapted/Reviewed for New UI) ---
// ... existing code (WebRTC functions like createAndConfigurePeerConnection, startLocalMedia etc should be here)
// ... ensure resetCallStateAndUI is present and adapted for the modal ...

// Example: resetCallStateAndUI adaptation (ensure this is defined or updated)
function resetCallStateAndUI() {
    console.log("Resetting call state and UI (Modal Version)");
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        console.log("Closing existing peer connection in resetCallStateAndUI.");
        peerConnection.close();
        peerConnection = null;
    }
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    
    const isAnon = (currentUsername === 'Anonymous');
    const serverConnected = !!serverInstanceId;

    if (initiateCallBtn) {
        initiateCallBtn.style.display = 'inline-block';
        initiateCallBtn.disabled = isAnon || !serverConnected;
    }
    if (callTargetUsernameInput) {
         callTargetUsernameInput.disabled = isAnon || !serverConnected;
         // Don't clear it here if it was pre-filled by DM call button, 
         // but do clear if no DM target (i.e. user might type manually)
         if (!currentDmTargetFKey && currentView !== 'dm') callTargetUsernameInput.value = ''; 
    }
    if (answerCallBtn) answerCallBtn.style.display = 'none';
    if (rejectCallBtn) rejectCallBtn.style.display = 'none';
    if (hangUpBtn) hangUpBtn.style.display = 'none'; // Hide hang up initially
    if (callStatus) {
        callStatus.textContent = !serverConnected ? 'Connecting to server...' : (isAnon ? 'Set username to enable calling.' : 'Ready to call.');
    }

    currentCallTargetSocketId = null; 
    currentCallTargetUsername = null; 
    currentCallTargetFederatedKey = null; 
    incomingCallData = null;
    
    if(localVideo) localVideo.style.visibility = 'visible';
    if(remoteVideo) remoteVideo.style.visibility = 'visible';
    // closeModal('video-call-container'); // Keep modal open if user initiated it
}

// Ensure all other WebRTC related socket handlers and functions are present and correct below
// (e.g., 'webrtc-offer', 'webrtc-answer', initiateCallBtn listener etc.)

// --- Core WebRTC Functions ---
async function startLocalMedia() {
    try {
        // Prioritize camera, then microphone. Allow screen sharing in future.
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) localVideo.srcObject = localStream;
        else console.error('localVideo element not found');
        return true;
    } catch (error) {
        console.error('Error accessing local media:', error);
        if (callStatus) callStatus.textContent = 'Error: Could not access camera/microphone.';
        if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
            alert("No camera/microphone found. Please ensure they are connected and enabled.");
        } else if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
            alert("Permission to use camera/microphone was denied. Please allow access in your browser settings.");
        } else {
            alert("An error occurred while trying to access your camera/microphone.");
        }
        resetCallStateAndUI();
        return false;
    }
}

function createAndConfigurePeerConnection(targetKeyForLog) {
    console.log(`Creating RTCPeerConnection for call with ${targetKeyForLog || 'unknown target'}`);
    peerConnection = new RTCPeerConnection(STUN_SERVERS);

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            console.log(`Sending ICE candidate for ${currentCallTargetFederatedKey || currentCallTargetSocketId}`);
            const payload = {
                candidate: event.candidate,
                targetSocketId: currentCallTargetSocketId, // For local calls
                targetFederatedKey: currentCallTargetFederatedKey // For federated calls
            };
            socket.emit('webrtc-ice-candidate', payload);
        }
    };

    peerConnection.ontrack = event => {
        console.log('Received remote track:', event.streams[0]);
        if (remoteVideo) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.style.visibility = 'visible';
            localVideo.style.visibility = 'visible'; // Ensure local is also visible
        } else {
            console.error('remoteVideo element not found');
        }
        if (callStatus) callStatus.textContent = `In call with ${currentCallTargetUsername || 'user'}.`;
        if (hangUpBtn) hangUpBtn.style.display = 'inline-block';
    };

    // Add local tracks if localStream is available
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    } else {
        console.warn('Local stream not available when creating peer connection. Call startLocalMedia first.');
        // Optionally, try to start local media here again, or handle error
    }
}

// --- WebRTC Call Button Event Listeners (Modal specific) ---
if (initiateCallBtn) {
    initiateCallBtn.addEventListener('click', async () => {
        if (currentUsername === 'Anonymous' || !currentFKey) {
            alert('Please set your username first!');
            openModal('username-modal');
            return;
        }
        const targetUsernameOrFKey = callTargetUsernameInput.value.trim();
        if (!targetUsernameOrFKey) {
            alert('Please enter the username of the person you want to call.');
            return;
        }

        if (!await startLocalMedia()) {
            console.error("Failed to start local media, cannot initiate call.");
            return;
        }

        currentCallTargetUsername = targetUsernameOrFKey.split('@')[0]; // For display
        
        // Determine if it's a federated key or just a local username
        if (targetUsernameOrFKey.includes('@')) {
            currentCallTargetFederatedKey = targetUsernameOrFKey;
            currentCallTargetSocketId = null; // Not a local socket ID call
        } else {
            // This is a local username, server will find socketId
            currentCallTargetSocketId = null; // Server resolves this
            currentCallTargetFederatedKey = null; // Server will construct FKey if needed or use username
        }

        createAndConfigurePeerConnection(targetUsernameOrFKey);

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            console.log(`Sending WebRTC offer to ${targetUsernameOrFKey}`);
            socket.emit('webrtc-offer', {
                offer: offer,
                targetUsername: targetUsernameOrFKey, // Server uses this to find local user or determine if it needs to use FKey
                targetFederatedKey: currentCallTargetFederatedKey, // Explicitly send if known
                fromUsername: currentUsername,
                fromFederatedKey: currentFKey
            });
            if (callStatus) callStatus.textContent = `Calling ${currentCallTargetUsername}...`;
            initiateCallBtn.style.display = 'none';
            hangUpBtn.style.display = 'inline-block'; // Show hang up while calling

        } catch (error) {
            console.error('Error creating WebRTC offer:', error);
            if (callStatus) callStatus.textContent = 'Error: Could not create call offer.';
            resetCallStateAndUI();
        }
    });
}

if (answerCallBtn) {
    answerCallBtn.addEventListener('click', async () => {
        if (!incomingCallData || !peerConnection) {
            console.error('No incoming call data or peer connection to answer.');
            resetCallStateAndUI();
            return;
        }
        if (!localStream && !await startLocalMedia()) {
             console.error("Failed to start local media, cannot answer call.");
             // Optionally send a 'call-failed' or similar message to caller
             socket.emit('call-rejected', { 
                targetSocketId: incomingCallData.fromSocketId, // If available from offer 
                targetFederatedKey: incomingCallData.fromFederatedKey, 
                reason: 'Could not start media'
            });
            resetCallStateAndUI();
            return;
        }
        // Ensure tracks are added if localStream was started after peerConnection was created (e.g. for an incoming call)
        if (localStream && peerConnection.getSenders().length === 0) {
            localStream.getTracks().forEach(track => {
                try {
                    peerConnection.addTrack(track, localStream);
                } catch (e) {
                    console.error("Error adding track while answering:", e);
                }
            });
        }

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            console.log(`Sending WebRTC answer to ${incomingCallData.fromFederatedKey || incomingCallData.fromUsername}`);
            socket.emit('webrtc-answer', {
                answer: answer,
                targetSocketId: incomingCallData.fromSocketId, // From the offer payload
                targetFederatedKey: incomingCallData.fromFederatedKey, // From the offer payload
                fromUsername: currentUsername,
                fromFederatedKey: currentFKey
            });

            if (callStatus) callStatus.textContent = `In call with ${incomingCallData.fromUsername}.`;
            answerCallBtn.style.display = 'none';
            rejectCallBtn.style.display = 'none';
            hangUpBtn.style.display = 'inline-block';
            initiateCallBtn.style.display = 'none';

        } catch (error) {
            console.error('Error creating WebRTC answer:', error);
            if (callStatus) callStatus.textContent = 'Error: Could not create call answer.';
            resetCallStateAndUI();
        }
    });
}

if (rejectCallBtn) {
    rejectCallBtn.addEventListener('click', () => {
        if (incomingCallData) {
            console.log(`Rejecting call from ${incomingCallData.fromFederatedKey || incomingCallData.fromUsername}`);
            socket.emit('call-rejected', { 
                targetSocketId: incomingCallData.fromSocketId, 
                targetFederatedKey: incomingCallData.fromFederatedKey, 
                reason: 'Call rejected by user' 
            });
        }
        closeModal('video-call-container'); // Close modal on reject
        resetCallStateAndUI();
    });
}

if (hangUpBtn) {
    hangUpBtn.addEventListener('click', () => {
        console.log(`Hanging up call with ${currentCallTargetUsername || 'user'}`);
        socket.emit('hang-up', { 
            targetSocketId: currentCallTargetSocketId, // Might be null if call was never fully established or target was federated
            targetFederatedKey: currentCallTargetFederatedKey, // Will be set if it was a federated call
            fromUsername: currentUsername,
            fromFederatedKey: currentFKey
         });
        closeModal('video-call-container'); // Close modal on hangup
        resetCallStateAndUI();
    });
}

// --- Client-Side Socket.IO Event Handlers for WebRTC (Modal specific) ---
socket.on('webrtc-offer', async (data) => {
    // data: { offer, fromUsername, fromSocketId?, fromFederatedKey? }
    console.log(`Received WebRTC offer from ${data.fromFederatedKey || data.fromUsername}`);

    // Auto-reject if already in a call or call pending
    if (peerConnection || incomingCallData) {
        console.log("Already in a call or have a pending call. Rejecting new offer.");
        socket.emit('call-busy', { 
            targetSocketId: data.fromSocketId, 
            targetFederatedKey: data.fromFederatedKey,
            fromUsername: currentUsername,
            fromFederatedKey: currentFKey
        });
        return;
    }

    incomingCallData = data;
    currentCallTargetUsername = data.fromUsername;
    currentCallTargetFederatedKey = data.fromFederatedKey; // Store who the offer is from
    currentCallTargetSocketId = data.fromSocketId; // If it's a local user

    openModal('video-call-container'); // Open the call modal
    if (callStatus) callStatus.textContent = `Incoming call from ${data.fromUsername}.`;
    
    // Create peer connection here, before setting remote description
    createAndConfigurePeerConnection(data.fromFederatedKey || data.fromUsername);
    
    // Set remote description with the offer
    // This is now done in answerCallBtn after user clicks answer and local media is ready.
    // For now, just show buttons

    if (answerCallBtn) answerCallBtn.style.display = 'inline-block';
    if (rejectCallBtn) rejectCallBtn.style.display = 'inline-block';
    if (initiateCallBtn) initiateCallBtn.style.display = 'none';
    if (hangUpBtn) hangUpBtn.style.display = 'none';
});

socket.on('webrtc-answer', async (data) => {
    // data: { answer, fromUsername, fromFederatedKey? }
    if (!peerConnection) {
        console.error('Received WebRTC answer but no peer connection exists.');
        return;
    }
    console.log(`Received WebRTC answer from ${data.fromFederatedKey || data.fromUsername}`);
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        if (callStatus) callStatus.textContent = `Call connected with ${currentCallTargetUsername || data.fromUsername}.`;
        // hangUpBtn should already be visible from initiateCall
    } catch (error) {
        console.error('Error setting remote description for answer:', error);
        if (callStatus) callStatus.textContent = 'Error: Could not connect call.';
        resetCallStateAndUI();
    }
});

socket.on('webrtc-ice-candidate', async (data) => {
    // data: { candidate, fromUsername?, fromFederatedKey? }
    if (!peerConnection) {
        // console.warn('Received WebRTC ICE candidate but no peer connection exists. Buffering?');
        // For simplicity, ignore if no peer connection yet. Could buffer if needed.
        return;
    }
    console.log(`Received ICE candidate from ${data.fromFederatedKey || data.fromUsername || 'peer'}`);
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('Error adding received ICE candidate:', error);
    }
});

socket.on('call-rejected', (data) => {
    // data: { reason, fromUsername?, fromFederatedKey? }
    console.log(`Call rejected by ${data.fromUsername || 'peer'}. Reason: ${data.reason}`);
    if (callStatus) callStatus.textContent = `Call rejected by ${currentCallTargetUsername || 'peer'}. Reason: ${data.reason}`;
    // Only reset if we were the one calling this target.
    // Check if the rejection is for the person we are currently trying to call or in call with.
    if (currentCallTargetFederatedKey === data.fromFederatedKey || 
        (!currentCallTargetFederatedKey && currentCallTargetUsername === data.fromUsername)) {
        closeModal('video-call-container');
        resetCallStateAndUI();
    }
});

socket.on('call-target-not-found', (data) => {
    // data: { targetUsername }
    console.log(`Call target not found: ${data.targetUsername}`);
    if (callStatus) callStatus.textContent = `User ${data.targetUsername} not found or offline.`;
    // Only reset if we were calling this target
    if (currentCallTargetUsername === data.targetUsername || (currentCallTargetFederatedKey && currentCallTargetFederatedKey.startsWith(data.targetUsername+"@"))) {
        closeModal('video-call-container');
        resetCallStateAndUI();
    }
});

socket.on('call-busy', (data) => {
    // data: { fromUsername }
    console.log(`Call target ${data.fromUsername || 'peer'} is busy.`);
    if (callStatus) callStatus.textContent = `${currentCallTargetUsername || 'User'} is busy.`;
    if (currentCallTargetFederatedKey === data.fromFederatedKey || 
        (!currentCallTargetFederatedKey && currentCallTargetUsername === data.fromUsername)) {
        closeModal('video-call-container');
        resetCallStateAndUI();
    }
});

socket.on('call-ended', (data) => {
    // data: { fromUsername }
    console.log(`Call ended with ${data.fromUsername || 'peer'}`);
    if (callStatus) callStatus.textContent = `Call ended with ${currentCallTargetUsername || data.fromUsername || 'peer'}.`;
    // Check if the ended call was with the current call partner
    if (currentCallTargetFederatedKey === data.fromFederatedKey || 
        (!currentCallTargetFederatedKey && currentCallTargetUsername === data.fromUsername) || 
        incomingCallData && (incomingCallData.fromFederatedKey === data.fromFederatedKey || incomingCallData.fromUsername === data.fromUsername )) {
        closeModal('video-call-container');
        resetCallStateAndUI();
    }
});

// --- Final Setup Calls ---
// setInitialUIState(); // This is already called near the top
// resetCallStateAndUI(); // Call this once to set initial call UI state within the modal

// Make sure the call to resetCallStateAndUI() is done after DOM is fully loaded
// and relevant elements are available. It might be better to call it inside setInitialUIState
// or after username is set.

document.addEventListener('DOMContentLoaded', () => {
    // Call resetCallStateAndUI here if not called effectively elsewhere like after username set.
    // setInitialUIState already handles some initial button states. resetCallStateAndUI focuses on WebRTC specifics.
    if (currentUsername !== 'Anonymous' && serverInstanceId) {
         resetCallStateAndUI();
    }
});

