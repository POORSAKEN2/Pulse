import type { DescType, PeerControl } from "./webrtc";

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (text: string) => void;
  onControl: (ctrl: PeerControl) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
}

// Stable id for the dummy/test dot. page.tsx detects this id to route a click
// to a local EchoPeer instead of the real server-signaled WebRTC path.
export const DUMMY_PEER_ID = "dummy-echo-bot";

// A fake peer for testing the chat/video UI solo, with no second device and no
// server/WebRTC. Structurally mirrors PeerSession's public surface so it can be
// dropped into the same peerRef. Echoes chat back; for video it mirrors your own
// camera back as the "remote" stream.
export class EchoPeer {
  private readonly cb: PeerCallbacks;
  private localStream: MediaStream | null = null;
  private closed = false;

  constructor(_initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    // Open the "data channel" on the next tick, mirroring a real connection
    // handshake completing.
    setTimeout(() => {
      if (!this.closed) this.cb.onChannelOpen();
    }, 300);
  }

  // Never invoked for the dummy (no server signals are routed to it), but kept
  // so EchoPeer is interchangeable with PeerSession in peerRef.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handleSignal(_type: DescType, _payload: string) {}

  sendChat(text: string) {
    if (this.closed) return;
    const reply = `🤖 echo: ${text}`;
    setTimeout(() => {
      if (!this.closed) this.cb.onChat(reply);
    }, 600);
  }

  sendControl(ctrl: PeerControl) {
    if (this.closed) return;
    // Auto-accept a video request so the local video UI lights up.
    if (ctrl === "video-request") {
      setTimeout(() => {
        if (!this.closed) this.cb.onControl("video-accept");
      }, 500);
    }
  }

  // Mirrors PeerSession.acquireMedia — gesture-safe camera grab with no "send".
  async acquireMedia(): Promise<MediaStream> {
    if (!this.localStream) {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    }
    return this.localStream;
  }

  async startVideo(): Promise<MediaStream> {
    if (!this.localStream) {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    }
    // Mirror your own camera back as the "remote" stream so VideoPanel has
    // something to show.
    this.cb.onRemoteStream(this.localStream);
    return this.localStream;
  }

  // Mirror PeerSession's track toggles so EchoPeer stays interchangeable. Since
  // the echo's "remote" stream IS the local stream, toggling also affects the
  // mirrored view — good enough for solo UI testing.
  setMic(on: boolean): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = on;
    return on;
  }

  setCam(on: boolean): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = on;
    return on;
  }

  stopVideo() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
    this.cb.onRemoteStream(null);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopVideo();
  }
}
