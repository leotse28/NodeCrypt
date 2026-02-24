// WebRTC Manager for video and audio communication
// WebRTC 视频和音频通信管理器

class RTCManager {
	constructor(config = {}) {
		this.config = {
			iceServers: config.iceServers || [
				{ urls: ['stun:stun.l.google.com:19302'] },
				{ urls: ['stun:stun1.l.google.com:19302'] },
				{ urls: ['stun:stun2.l.google.com:19302'] }
			],
			debug: config.debug || false,
			...config
		};

		this.peerConnections = new Map();
		this.localStream = null;
		this.dataChannels = new Map();
		this.callbacks = {
			onRemoteStream: () => {},
			onRemoteStreamRemoved: () => {},
			onDataChannelOpen: () => {},
			onDataChannelMessage: () => {},
			onDataChannelError: () => {},
			onConnectionStateChange: () => {},
			onIceCandidate: () => {},
			onOffer: () => {},
			onAnswer: () => {},
			...config.callbacks
		};
	}

	// Initialize local media stream
	// 初始化本地媒体流
	async initLocalStream(constraints = { audio: true, video: true }) {
		try {
			this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
			this.logEvent('initLocalStream', 'Local stream initialized');
			return this.localStream;
		} catch (error) {
			this.logEvent('initLocalStream', `Failed to get user media: ${error.message}`, 'error');
			throw error;
		}
	}

	// Create WebRTC peer connection
	// 创建 WebRTC 对等连接
	async createPeerConnection(peerId, isInitiator = false) {
		try {
			const peerConnection = new RTCPeerConnection({
				iceServers: this.config.iceServers
			});

			// Add local stream tracks
			// 添加本地流轨道
			if (this.localStream) {
				this.localStream.getTracks().forEach(track => {
					peerConnection.addTrack(track, this.localStream);
				});
			}

			// Handle remote stream
			// 处理远程流
			peerConnection.ontrack = (event) => {
				this.logEvent('ontrack', `Remote track added from ${peerId}`);
				this.callbacks.onRemoteStream(peerId, event.streams[0]);
			};

			// Handle ICE candidates
			// 处理 ICE 候选
			peerConnection.onicecandidate = (event) => {
				if (event.candidate) {
					this.logEvent('onicecandidate', `ICE candidate from ${peerId}`);
					this.callbacks.onIceCandidate(peerId, event.candidate);
				}
			};

			// Handle connection state changes
			// 处理连接状态变化
			peerConnection.onconnectionstatechange = () => {
				this.logEvent('onconnectionstatechange', `${peerId}: ${peerConnection.connectionState}`);
				this.callbacks.onConnectionStateChange(peerId, peerConnection.connectionState);

				if (peerConnection.connectionState === 'failed' || 
					peerConnection.connectionState === 'disconnected') {
					this.closePeerConnection(peerId);
				}
			};

			// Create data channel for encrypted signaling
			// 为加密信令创建数据通道
			if (isInitiator) {
				const dataChannel = peerConnection.createDataChannel('signal', { ordered: true });
				this.setupDataChannel(peerId, dataChannel);
			}

			// Handle incoming data channels
			// 处理传入数据通道
			peerConnection.ondatachannel = (event) => {
				this.setupDataChannel(peerId, event.channel);
			};

			this.peerConnections.set(peerId, peerConnection);
			this.logEvent('createPeerConnection', `Peer connection created for ${peerId}`);

			return peerConnection;
		} catch (error) {
			this.logEvent('createPeerConnection', `Error creating peer connection: ${error.message}`, 'error');
			throw error;
		}
	}

	// Setup data channel
	// 设置数据通道
	setupDataChannel(peerId, dataChannel) {
		dataChannel.onopen = () => {
			this.logEvent('setupDataChannel', `Data channel opened for ${peerId}`);
			this.callbacks.onDataChannelOpen(peerId, dataChannel);
		};

		dataChannel.onmessage = (event) => {
			this.callbacks.onDataChannelMessage(peerId, event.data);
		};

		dataChannel.onerror = (error) => {
			this.logEvent('setupDataChannel', `Data channel error for ${peerId}: ${error.message}`, 'error');
			this.callbacks.onDataChannelError(peerId, error);
		};

		dataChannel.onclose = () => {
			this.logEvent('setupDataChannel', `Data channel closed for ${peerId}`);
			this.dataChannels.delete(peerId);
		};

		this.dataChannels.set(peerId, dataChannel);
	}

	// Create and send offer
	// 创建并发送 offer
	async createOffer(peerId) {
		try {
			const peerConnection = this.peerConnections.get(peerId);
			if (!peerConnection) {
				throw new Error(`Peer connection not found for ${peerId}`);
			}

			const offer = await peerConnection.createOffer({
				offerToReceiveAudio: true,
				offerToReceiveVideo: true
			});

			await peerConnection.setLocalDescription(offer);
			this.logEvent('createOffer', `Offer created for ${peerId}`);
			this.callbacks.onOffer(peerId, offer);

			return offer;
		} catch (error) {
			this.logEvent('createOffer', `Error creating offer: ${error.message}`, 'error');
			throw error;
		}
	}

	// Handle received offer and create answer
	// 处理接收    offer 并创建 answer
	async handleOffer(peerId, offer) {
		try {
			const peerConnection = this.peerConnections.get(peerId);
			if (!peerConnection) {
				throw new Error(`Peer connection not found for ${peerId}`);
			}

			await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
			const answer = await peerConnection.createAnswer();
			await peerConnection.setLocalDescription(answer);

			this.logEvent('handleOffer', `Answer created for ${peerId}`);
			this.callbacks.onAnswer(peerId, answer);

			return answer;
		} catch (error) {
			this.logEvent('handleOffer', `Error handling offer: ${error.message}`, 'error');
			throw error;
		}
	}

	// Handle received answer
	// 处理接收的 answer
	async handleAnswer(peerId, answer) {
		try {
			const peerConnection = this.peerConnections.get(peerId);
			if (!peerConnection) {
				throw new Error(`Peer connection not found for ${peerId}`);
			}

			await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
			this.logEvent('handleAnswer', `Answer handled for ${peerId}`);
		} catch (error) {
			this.logEvent('handleAnswer', `Error handling answer: ${error.message}`, 'error');
			throw error;
		}
	}

	// Add ICE candidate
	// 添加 ICE 候选
	async addIceCandidate(peerId, candidate) {
		try {
			const peerConnection = this.peerConnections.get(peerId);
			if (!peerConnection) {
				throw new Error(`Peer connection not found for ${peerId}`);
			}

			if (candidate) {
				await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
			}
		} catch (error) {
			this.logEvent('addIceCandidate', `Error adding ICE candidate: ${error.message}`, 'error');
		}
	}

	// Send message through data channel
	// 通过数据通道发送消息
	sendDataChannelMessage(peerId, message) {
		const dataChannel = this.dataChannels.get(peerId);
		if (dataChannel && dataChannel.readyState === 'open') {
			dataChannel.send(JSON.stringify(message));
			return true;
		}
		return false;
	}

	// Close peer connection
	// 关闭对等连接
	closePeerConnection(peerId) {
		const peerConnection = this.peerConnections.get(peerId);
		if (peerConnection) {
			const senders = peerConnection.getSenders();
			senders.forEach(sender => {
				if (sender.track) {
					sender.track.stop();
				}
			});

			peerConnection.close();
			this.peerConnections.delete(peerId);
			this.dataChannels.delete(peerId);
			this.logEvent('closePeerConnection', `Peer connection closed for ${peerId}`);
		}
	}

	// Stop local stream
	// 停止本地流
	stopLocalStream() {
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => track.stop());
			this.localStream = null;
		}
	}

	// Mute/unmute audio
	// 静音/取消静音音频
	toggleAudio(enabled) {
		if (this.localStream) {
			this.localStream.getAudioTracks().forEach(track => {
				track.enabled = enabled;
			});
		}
	}

	// Enable/disable video
	// 启用/禁用视频
	toggleVideo(enabled) {
		if (this.localStream) {
			this.localStream.getVideoTracks().forEach(track => {
				track.enabled = enabled;
			});
		}
	}

	// Get connection stats
	// 获取连接统计
	async getStats(peerId) {
		const peerConnection = this.peerConnections.get(peerId);
		if (!peerConnection) return null;

		const stats = await peerConnection.getStats();
		const result = {
			audio: {},
			video: {},
			connection: {}
		};

		stats.forEach(report => {
			if (report.type === 'inbound-rtp') {
				if (report.mediaType === 'audio') {
					result.audio = {
						bytesReceived: report.bytesReceived,
						packetsLost: report.packetsLost,
						jitter: report.jitter
					};
				} else if (report.mediaType === 'video') {
					result.video = {
						bytesReceived: report.bytesReceived,
						framesDecoded: report.framesDecoded,
						frameRate: report.framesPerSecond
					};
				}
			} else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
				result.connection = {
					currentRoundTripTime: report.currentRoundTripTime,
					availableOutgoingBitrate: report.availableOutgoingBitrate
				};
			}
		});

		return result;
	}

	// Log events for debugging
	// 记录事件用于调试
	logEvent(source, message, level = 'info') {
		if (this.config.debug) {
			console.log(`[RTCManager] [${level.toUpperCase()}] ${source}:`, message);
		}
	}

	// Cleanup
	// 清理
	destroy() {
		this.stopLocalStream();
		this.peerConnections.forEach((pc, peerId) => {
			this.closePeerConnection(peerId);
		});
		this.peerConnections.clear();
		this.dataChannels.clear();
	}
}

if (typeof window !== 'undefined') {
	window.RTCManager = RTCManager;
}

export { RTCManager };
