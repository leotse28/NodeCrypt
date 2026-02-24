// rtc-manager.js

class RTCManager {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
    }

    async init(localVideoElement) {
        // Get user media
        this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
        });
        localVideoElement.srcObject = this.localStream;
        this.createPeerConnection();
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection();
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });
    }

    async createOffer() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        return offer;
    }

    async setRemoteDescription(offer) {
        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        return answer;
    }

    onTrackReceived(callback) {
        this.peerConnection.ontrack = (event) => {
            callback(event.streams[0]);
        };
    }
}

export default RTCManager;
