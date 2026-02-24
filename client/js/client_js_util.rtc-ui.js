// WebRTC UI components for video and audio calls
// WebRTC 视频和音频通话的 UI 组件

import { RTCSignaling } from '../../webrtc/rtc-signaling.js';

class RTCUIManager {
	constructor(nodeCrypt, config = {}) {
		this.nodeCrypt = nodeCrypt;
		this.rtcSignaling = null;
		this.config = {
			debug: config.debug || false,
			...config
		};
		this.localVideoElement = null;
		this.remoteVideoElements = new Map();
		this.isCallActive = false;
	}

	// Initialize RTC UI
	async initRTCUI() {
		try {
			// Create RTC signaling instance
			this.rtcSignaling = new RTCSignaling(this.nodeCrypt, {
				debug: this.config.debug,
				onRemoteStream: (peerId, stream) => this.handleRemoteStream(peerId, stream),
				onRemoteStreamRemoved: (peerId) => this.handleRemoteStreamRemoved(peerId),
				onConnectionStateChange: (peerId, state) => this.handleConnectionStateChange(peerId, state),
				onCallRequest: (peerId, callId) => this.handleCallRequest(peerId, callId),
				onCallAccept: (peerId, callId) => this.handleCallAccept(peerId, callId),
				onCallReject: (peerId, callId, reason) => this.handleCallReject(peerId, callId, reason),
				onCallEnd: (peerId, callId) => this.handleCallEnd(peerId, callId)
			});

			// Initialize local stream
			await this.rtcSignaling.initialize({
				audio: true,
				video: { width: { ideal: 1280 }, height: { ideal: 720 } }
			});

			// Create local video element
			this.createLocalVideoElement();

			// Create call UI elements
			this.createCallUIElements();

			// Setup event listeners
			this.setupEventListeners();

			this.logEvent('initRTCUI', 'RTC UI initialized successfully');
			return true;
		} catch (error) {
			this.logEvent('initRTCUI', `Initialization failed: ${error.message}`, 'error');
			this.showNotification(`Failed to initialize video call: ${error.message}`, 'error');
			return false;
		}
	}

	// Create local video element
	createLocalVideoElement() {
		const container = document.getElementById('rtc-container') || this.createRTCContainer();
		
		const localVideoWrapper = document.createElement('div');
		localVideoWrapper.id = 'local-video-wrapper';
		localVideoWrapper.className = 'video-wrapper local';
		
		const video = document.createElement('video');
		video.id = 'local-video';
		video.autoplay = true;
		video.muted = true;
		video.playsinline = true;
		video.srcObject = this.rtcSignaling.rtcManager.localStream;
		
		const label = document.createElement('div');
		label.className = 'video-label';
		label.textContent = 'You';
		
		localVideoWrapper.appendChild(video);
		localVideoWrapper.appendChild(label);
		container.appendChild(localVideoWrapper);
		
		this.localVideoElement = video;
	}

	// Create remote video element
	createRemoteVideoElement(peerId, peerName) {
		const container = document.getElementById('rtc-container');
		
		const remoteVideoWrapper = document.createElement('div');
		remoteVideoWrapper.id = `remote-video-wrapper-${peerId}`;
		remoteVideoWrapper.className = 'video-wrapper remote';
		
		const video = document.createElement('video');
		video.id = `remote-video-${peerId}`;
		video.autoplay = true;
		video.playsinline = true;
		
		const label = document.createElement('div');
		label.className = 'video-label';
		label.textContent = peerName;
		
		remoteVideoWrapper.appendChild(video);
		remoteVideoWrapper.appendChild(label);
		container.appendChild(remoteVideoWrapper);
		
		this.remoteVideoElements.set(peerId, { wrapper: remoteVideoWrapper, video: video });
		return video;
	}

	// Create RTC container
	createRTCContainer() {
		const container = document.createElement('div');
		container.id = 'rtc-container';
		container.className = 'rtc-container';
		document.body.appendChild(container);
		return container;
	}

	// Create call UI elements
	createCallUIElements() {
		const controlsPanel = document.createElement('div');
		controlsPanel.id = 'rtc-controls';
		controlsPanel.className = 'rtc-controls hidden';
		
		controlsPanel.innerHTML = `
			<div class="call-info">
				<span id="call-duration">00:00</span>
				<span id="call-status">Connecting...</span>
			</div>
			<div class="call-controls">
				<button id="rtc-toggle-audio" class="control-btn audio-btn" title="Toggle Audio">
					<svg viewBox="0 0 24 24"><path d="M19 11c0 .7-.13 1.37-.39 2H23v-2h-4zm-4 .9v2.05c3.39-.49 6-3.4 6-6.9 0-3.5-2.61-6.41-6-6.9v2.05c2.89.5 5 2.88 5 4.85 0 1.97-2.11 4.35-5 4.85zM3 5v14h4l5 5v-5h4v-2H9.41c.54-.65.94-1.41 1.25-2.25.31-.84.52-1.75.6-2.75H13V7h-2.15c-.08-1-.29-1.91-.6-2.75-.31-.84-.71-1.6-1.25-2.25H17V5H3z"/></svg>
				</button>
				<button id="rtc-toggle-video" class="control-btn video-btn" title="Toggle Video">
					<svg viewBox="0 0 24 24"><path d="M15 11V5H3v14h12v-6l4 4V7l-4 4z"/></svg>
				</button>
				<button id="rtc-end-call" class="control-btn end-call-btn" title="End Call">
					<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
				</button>
			</div>
		`;
		
		document.body.appendChild(controlsPanel);
	}

	// Setup event listeners
	setupEventListeners() {
		// Audio toggle
		document.getElementById('rtc-toggle-audio')?.addEventListener('click', (e) => {
			const btn = e.currentTarget;
			const isEnabled = !btn.classList.toggle('disabled');
			this.rtcSignaling.toggleAudio(isEnabled);
		});

		// Video toggle
		document.getElementById('rtc-toggle-video')?.addEventListener('click', (e) => {
			const btn = e.currentTarget;
			const isEnabled = !btn.classList.toggle('disabled');
			this.rtcSignaling.toggleVideo(isEnabled);
		});

		// End call
		document.getElementById('rtc-end-call')?.addEventListener('click', () => {
			this.endAllCalls();
		});

		// Listen for RTC signaling messages from server
		const originalOnMessage = this.nodeCrypt.onMessage;
		this.nodeCrypt.onMessage = (message) => {
			if (message.type === 'rtc:signal') {
				this.rtcSignaling.handleSignalingMessage(message.from, message.data);
			}
			originalOnMessage?.call(this.nodeCrypt, message);
		};
	}

	// Handle remote stream
	handleRemoteStream(peerId, stream) {
		const peerName = this.getPeerName(peerId) || `User ${peerId.substring(0, 6)}`;
		const videoElement = this.createRemoteVideoElement(peerId, peerName);
		videoElement.srcObject = stream;
		
		this.showNotification(`Connected with ${peerName}`, 'success');
		this.updateCallStatus('Connected');
	}

	// Handle remote stream removed
	handleRemoteStreamRemoved(peerId) {
		const elements = this.remoteVideoElements.get(peerId);
		if (elements) {
			elements.wrapper.remove();
			this.remoteVideoElements.delete(peerId);
		}
	}

	// Handle connection state change
	handleConnectionStateChange(peerId, state) {
		const stateTexts = {
			'connecting': 'Connecting...',
			'connected': 'Connected',
			'disconnected': 'Disconnected',
			'failed': 'Connection Failed',
			'closed': 'Closed'
		};
		
		this.updateCallStatus(stateTexts[state] || state);
		
		if (state === 'failed' || state === 'disconnected') {
			this.showNotification(`Connection ${state}`, 'warning');
		}
	}

	// Handle incoming call request
	handleCallRequest(peerId, callId) {
		const peerName = this.getPeerName(peerId) || `User ${peerId.substring(0, 6)}`;
		
		const dialog = document.createElement('div');
		dialog.className = 'rtc-call-dialog';
		dialog.innerHTML = `
			<div class="call-dialog-content">
				<div class="caller-name">${peerName}</div>
				<div class="call-message">is calling...</div>
				<div class="call-actions">
					<button class="accept-btn">Accept</button>
					<button class="reject-btn">Reject</button>
				</div>
			</div>
		`;
		
		document.body.appendChild(dialog);
		
		dialog.querySelector('.accept-btn').addEventListener('click', async () => {
			await this.rtcSignaling.acceptCall(peerId, callId);
			dialog.remove();
			this.showCallControls();
		});
		
		dialog.querySelector('.reject-btn').addEventListener('click', () => {
			this.rtcSignaling.rejectCall(peerId, callId);
			dialog.remove();
		});
	}

	// Handle call accept
	handleCallAccept(peerId, callId) {
		this.showNotification('Call accepted', 'success');
		this.showCallControls();
		this.startCallDurationTimer();
	}

	// Handle call reject
	handleCallReject(peerId, callId, reason) {
		this.showNotification(`Call rejected: ${reason}`, 'info');
	}

	// Handle call end
	handleCallEnd(peerId, callId) {
		this.showNotification('Call ended', 'info');
		this.hideCallControls();
		this.stopCallDurationTimer();
	}

	// Initiate call to peer
	async initiateCall(peerId) {
		try {
			const peerName = this.getPeerName(peerId) || `User ${peerId.substring(0, 6)}`;
			this.showNotification(`Calling ${peerName}...`, 'info');
			
			await this.rtcSignaling.initiateCall(peerId);
			this.showCallControls();
			this.startCallDurationTimer();
		} catch (error) {
			this.showNotification(`Failed to initiate call: ${error.message}`, 'error');
		}
	}

	// End all active calls
	endAllCalls() {
		const calls = this.rtcSignaling.getAllActiveCalls();
		calls.forEach(([peerId, call]) => {
			this.rtcSignaling.endCall(peerId);
		});
		
		// Clear remote videos
		this.remoteVideoElements.forEach((elements, peerId) => {
			elements.wrapper.remove();
		});
		this.remoteVideoElements.clear();
		
		this.hideCallControls();
		this.stopCallDurationTimer();
	}

	// Show call controls
	showCallControls() {
		const controlsPanel = document.getElementById('rtc-controls');
		if (controlsPanel) {
			controlsPanel.classList.remove('hidden');
		}
	}

	// Hide call controls
	hideCallControls() {
		const controlsPanel = document.getElementById('rtc-controls');
		if (controlsPanel) {
			controlsPanel.classList.add('hidden');
		}
	}

	// Update call status
	updateCallStatus(status) {
		const statusElement = document.getElementById('call-status');
		if (statusElement) {
			statusElement.textContent = status;
		}
	}

	// Start call duration timer
	startCallDurationTimer() {
		let seconds = 0;
		this.callTimer = setInterval(() => {
			seconds++;
			const minutes = Math.floor(seconds / 60);
			const secs = seconds % 60;
			const durationElement = document.getElementById('call-duration');
			if (durationElement) {
				durationElement.textContent = 
					`${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
			}
		}, 1000);
	}

	// Stop call duration timer
	stopCallDurationTimer() {
		if (this.callTimer) {
			clearInterval(this.callTimer);
		}
	}

	// Show notification
	showNotification(message, type = 'info') {
		const notification = document.createElement('div');
		notification.className = `notification notification-${type}`;
		notification.textContent = message;
		document.body.appendChild(notification);
		
		setTimeout(() => notification.remove(), 3000);
	}

	// Get peer name from member list
	getPeerName(peerId) {
		// This should be integrated with your member list
		// For now, return null to use default naming
		return null;
	}

	// Log events
	logEvent(source, message, level = 'info') {
		if (this.config.debug) {
			console.log(`[RTCUIManager] [${level.toUpperCase()}] ${source}:`, message);
		}
	}

	// Cleanup
	destroy() {
		this.endAllCalls();
		this.rtcSignaling.destroy();
		const container = document.getElementById('rtc-container');
		if (container) container.remove();
		const controls = document.getElementById('rtc-controls');
		if (controls) controls.remove();
	}
}

export { RTCUIManager };