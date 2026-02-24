// WebRTC Signaling through encrypted channels
// 通过加密通道的 WebRTC 信令

import { RTCManager } from './rtc-manager.js';

class RTCSignaling {
	constructor(nodeCrypt, config = {}) {
		this.nodeCrypt = nodeCrypt;
		this.rtcManager = null;
		this.config = {
			debug: config.debug || false,
			...config
		};
		this.activeCalls = new Map();
		this.messageHandlers = {
			'rtc:offer': this.handleOffer.bind(this),
			'rtc:answer': this.handleAnswer.bind(this),
			'rtc:ice-candidate': this.handleIceCandidate.bind(this),
			'rtc:call-request': this.handleCallRequest.bind(this),
			'rtc:call-accept': this.handleCallAccept.bind(this),
			'rtc:call-reject': this.handleCallReject.bind(this),
			'rtc:call-end': this.handleCallEnd.bind(this)
		};
	}

	// Initialize RTC signaling
	// 初始化 RTC 信令
	async initialize(constraints = { audio: true, video: true }) {
		try {
			this.rtcManager = new RTCManager({
				debug: this.config.debug,
				callbacks: {
					onRemoteStream: (peerId, stream) => {
						this.config.onRemoteStream?.(peerId, stream);
					},
					onRemoteStreamRemoved: (peerId) => {
						this.config.onRemoteStreamRemoved?.(peerId);
					},
					onIceCandidate: (peerId, candidate) => {
						this.sendSignalingMessage(peerId, 'rtc:ice-candidate', {
							candidate: candidate.candidate,
							sdpMLineIndex: candidate.sdpMLineIndex,
							sdpMid: candidate.sdpMid
						});
					},
					onOffer: (peerId, offer) => {
						this.sendSignalingMessage(peerId, 'rtc:offer', {
							sdp: offer.sdp
						});
					},
					onAnswer: (peerId, answer) => {
						this.sendSignalingMessage(peerId, 'rtc:answer', {
							sdp: answer.sdp
						});
					},
					onConnectionStateChange: (peerId, state) => {
						this.config.onConnectionStateChange?.(peerId, state);
					},
					onDataChannelOpen: (peerId, channel) => {
						this.config.onDataChannelOpen?.(peerId, channel);
					},
					onDataChannelMessage: (peerId, message) => {
						this.config.onDataChannelMessage?.(peerId, message);
					}
				}
			});

			await this.rtcManager.initLocalStream(constraints);
			this.logEvent('initialize', 'RTC Signaling initialized successfully');
			return true;
		} catch (error) {
			this.logEvent('initialize', `Initialization failed: ${error.message}`, 'error');
			throw error;
		}
	}

	// Initiate a call
	// 发起通话
	async initiateCall(peerId, callId = null) {
		try {
			const id = callId || this.generateCallId();
			
			// Send call request
			this.sendSignalingMessage(peerId, 'rtc:call-request', {
				callId: id
			});

			// Create peer connection and send offer
			await this.rtcManager.createPeerConnection(peerId, true);
			await this.rtcManager.createOffer(peerId);

			this.activeCalls.set(peerId, {
				callId: id,
				initiator: true,
				startTime: Date.now(),
				state: 'connecting'
			});

			this.logEvent('initiateCall', `Call initiated to ${peerId}`);
			return id;
		} catch (error) {
			this.logEvent('initiateCall', `Failed to initiate call: ${error.message}`, 'error');
			throw error;
		}
	}

	// Accept an incoming call
	// 接受传入的呼叫
	async acceptCall(peerId, callId) {
		try {
			await this.rtcManager.createPeerConnection(peerId, false);
			this.sendSignalingMessage(peerId, 'rtc:call-accept', {
				callId: callId
			});

			this.activeCalls.set(peerId, {
				callId: callId,
				initiator: false,
				startTime: Date.now(),
				state: 'connecting'
			});

			this.logEvent('acceptCall', `Call accepted from ${peerId}`);
		} catch (error) {
			this.logEvent('acceptCall', `Failed to accept call: ${error.message}`, 'error');
			throw error;
		}
	}

	// Reject an incoming call
	// 拒绝传入的呼叫
	rejectCall(peerId, callId, reason = 'user-rejected') {
		this.sendSignalingMessage(peerId, 'rtc:call-reject', {
			callId: callId,
			reason: reason
		});

		this.activeCalls.delete(peerId);
		this.logEvent('rejectCall', `Call rejected from ${peerId}`);
	}

	// End an active call
	// 结束活跃的通话
	endCall(peerId) {
		const call = this.activeCalls.get(peerId);
		if (call) {
			this.sendSignalingMessage(peerId, 'rtc:call-end', {
				callId: call.callId
			});

			this.rtcManager.closePeerConnection(peerId);
			this.activeCalls.delete(peerId);
			this.logEvent('endCall', `Call ended with ${peerId}`);
		}
	}

	// Send signaling message through encrypted channel
	// 通过加密通道发送信令消息
	sendSignalingMessage(peerId, messageType, payload) {
		const message = {
			type: messageType,
			timestamp: Date.now(),
			...payload
		};

		// Send through NodeCrypt encrypted channel
		if (this.nodeCrypt && this.nodeCrypt.isOpen()) {
			this.nodeCrypt.send({
				type: 'rtc:signal',
				to: peerId,
				data: message
			});
		}
	}

	// Register signaling message handler
	// 注册信令消息处理器
	registerMessageHandler(type, handler) {
		this.messageHandlers[type] = handler;
	}

	// Handle incoming signaling messages
	// 处理传入的信令消息
	async handleSignalingMessage(peerId, message) {
		const handler = this.messageHandlers[message.type];
		if (handler) {
			try {
				await handler(peerId, message);
			} catch (error) {
				this.logEvent('handleSignalingMessage', `Error handling ${message.type}: ${error.message}`, 'error');
			}
		}
	}

	// Handle offer message
	async handleOffer(peerId, message) {
		try {
			if (!this.rtcManager.peerConnections.has(peerId)) {
				await this.rtcManager.createPeerConnection(peerId, false);
			}
			await this.rtcManager.handleOffer(peerId, {
				type: 'offer',
				sdp: message.sdp
			});
			this.logEvent('handleOffer', `Offer handled from ${peerId}`);
		} catch (error) {
			this.logEvent('handleOffer', `Error handling offer: ${error.message}`, 'error');
		}
	}

	// Handle answer message
	async handleAnswer(peerId, message) {
		try {
			await this.rtcManager.handleAnswer(peerId, {
				type: 'answer',
				sdp: message.sdp
			});
			this.logEvent('handleAnswer', `Answer handled from ${peerId}`);
		} catch (error) {
			this.logEvent('handleAnswer', `Error handling answer: ${error.message}`, 'error');
		}
	}

	// Handle ICE candidate message
	async handleIceCandidate(peerId, message) {
		try {
			const candidate = {
				candidate: message.candidate,
				sdpMLineIndex: message.sdpMLineIndex,
				sdpMid: message.sdpMid
			};
			await this.rtcManager.addIceCandidate(peerId, candidate);
		} catch (error) {
			this.logEvent('handleIceCandidate', `Error adding ICE candidate: ${error.message}`, 'error');
		}
	}

	// Handle call request
	async handleCallRequest(peerId, message) {
		this.config.onCallRequest?.(peerId, message.callId);
	}

	// Handle call accept
	async handleCallAccept(peerId, message) {
		this.config.onCallAccept?.(peerId, message.callId);
	}

	// Handle call reject
	async handleCallReject(peerId, message) {
		this.config.onCallReject?.(peerId, message.callId, message.reason);
		this.activeCalls.delete(peerId);
		this.rtcManager.closePeerConnection(peerId);
	}

	// Handle call end
	async handleCallEnd(peerId, message) {
		this.config.onCallEnd?.(peerId, message.callId);
		this.activeCalls.delete(peerId);
		this.rtcManager.closePeerConnection(peerId);
	}

	// Get active call
	getActiveCall(peerId) {
		return this.activeCalls.get(peerId);
	}

	// Get all active calls
	getAllActiveCalls() {
		return Array.from(this.activeCalls.entries());
	}

	// Generate unique call ID
	generateCallId() {
		return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	// Toggle audio
	toggleAudio(enabled) {
		this.rtcManager.toggleAudio(enabled);
	}

	// Toggle video
	toggleVideo(enabled) {
		this.rtcManager.toggleVideo(enabled);
	}

	// Get RTC stats
	async getStats(peerId) {
		return this.rtcManager.getStats(peerId);
	}

	// Log events
	logEvent(source, message, level = 'info') {
		if (this.config.debug) {
			console.log(`[RTCSignaling] [${level.toUpperCase()}] ${source}:`, message);
		}
	}

	// Cleanup
	destroy() {
		this.activeCalls.forEach((call, peerId) => {
			this.endCall(peerId);
		});
		this.rtcManager.destroy();
	}
}

if (typeof window !== 'undefined') {
	window.RTCSignaling = RTCSignaling;
}

export { RTCSignaling };