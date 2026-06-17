export type DescType = "offer" | "answer" | "ice";
export type PeerControl =
  | "video-request"
  | "video-accept"
  | "video-decline"
  | "video-end"
  | "mic-on"
  | "mic-off"
  | "cam-on"
  | "cam-off";

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (text: string) => void;
  onControl: (ctrl: PeerControl) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
}

// STUN alone only works when both peers can reach each other directly (same
// network / friendly NAT). Cross-network calls (mobile data, symmetric NAT,
// firewalls) need a TURN relay or the connection goes to "failed". TURN creds
// are read from env so they aren't hardcoded; without them we fall back to
// STUN-only, which is fine for local dev.
function buildIceConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];

  const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrls && turnUser && turnCred) {
    iceServers.push({
      urls: turnUrls.split(",").map((u) => u.trim()).filter(Boolean),
      username: turnUser,
      credential: turnCred,
    });
  }

  return { iceServers };
}

const ICE_CONFIG: RTCConfiguration = buildIceConfig();

// TEMP diagnostic — confirms whether TURN actually made it into the running
// bundle. If you don't see hasTURN:true here, the build didn't pick up the env
// vars (rebuild needed, or deploy host is missing them). Remove once fixed.
if (typeof window !== "undefined") {
  const hasTURN = (ICE_CONFIG.iceServers ?? []).some((s) => {
    const u = s.urls;
    return Array.isArray(u)
      ? u.some((x) => x.startsWith("turn"))
      : typeof u === "string" && u.startsWith("turn");
  });
  console.log("[webrtc] ICE config", { hasTURN, servers: ICE_CONFIG.iceServers });
}

export class PeerSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private localStream: MediaStream | null = null;
  private tracksAttached = false;
  private closed = false;
  private readonly cb: PeerCallbacks;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    this.polite = !initiator;
    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        // TEMP diagnostic — log candidate type. "relay" = TURN is working and
        // cross-network will connect. If you only ever see "host"/"srflx" and
        // never "relay", TURN creds/host are wrong or quota is exhausted.
        console.log("[webrtc] local candidate", candidate.type, candidate.candidate);
        this.cb.onSignal("ice", JSON.stringify(candidate));
      }
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.cb.onSignal("offer", JSON.stringify(this.pc.localDescription));
        }
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.ontrack = ({ streams }) => {
      this.cb.onRemoteStream(streams[0] ?? null);
    };

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionState(this.pc.connectionState);
    };

    if (initiator) {
      this.dc = this.pc.createDataChannel("chat");
      this.wireDataChannel(this.dc);
    } else {
      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this.wireDataChannel(this.dc);
      };
    }
  }

  private wireDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => this.cb.onChannelOpen();
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.t === "chat" && typeof msg.text === "string") {
          this.cb.onChat(msg.text);
        } else if (msg.t === "ctrl" && typeof msg.ctrl === "string") {
          this.cb.onControl(msg.ctrl as PeerControl);
        }
      } catch {}
    };
  }

  async handleSignal(type: DescType, payload: string) {
    if (this.closed) return;
    const data = JSON.parse(payload);

    if (type === "ice") {
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(data);
        return;
      }
      try {
        await this.pc.addIceCandidate(data);
      } catch {}
      return;
    }

    const desc = data as RTCSessionDescriptionInit;
    const offerCollision =
      desc.type === "offer" &&
      (this.makingOffer || this.pc.signalingState !== "stable");
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    await this.pc.setRemoteDescription(desc);
    // Flush AFTER remoteDescription is set — addIceCandidate throws if it runs
    // first, which would silently drop every queued (early-arriving) candidate.
    await this.flushPendingCandidates();
    if (desc.type === "offer") {
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        this.cb.onSignal("answer", JSON.stringify(this.pc.localDescription));
      }
    }
  }

  private async flushPendingCandidates() {
    if (this.pendingCandidates.length === 0) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {}
    }
  }

  sendChat(text: string) {
    // Receiver (wireDataChannel) dispatches on t === "chat".
    this.safeSend({ t: "chat", text });
  }

  sendControl(ctrl: PeerControl) {
    this.safeSend({ t: "ctrl", ctrl });
  }

  private safeSend(obj: unknown) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(obj));
    }
  }

  // Grab the camera/mic only. Split out from startVideo so the *requester* can
  // call this synchronously inside the click handler (getUserMedia must run in a
  // user gesture — calling it later from a network/signaling callback is
  // rejected by Safari/iOS and is flaky elsewhere). Does NOT addTrack, so no
  // media is sent until the peer accepts and startVideo() attaches.
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
    const stream = await this.acquireMedia();
    if (!this.tracksAttached) {
      for (const track of stream.getTracks()) {
        this.pc.addTrack(track, stream);
      }
      this.tracksAttached = true;
    }
    return stream;
  }

  // Toggle the local mic track on/off. Returns the new enabled state (false if
  // there's no audio track yet). Uses track.enabled so the sender/connection
  // stays intact — no renegotiation, peer just receives silence.
  setMic(on: boolean): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = on;
    return on;
  }

  // Toggle the local camera track on/off. Same approach as setMic: track.enabled
  // keeps the track in place (no renegotiation), peer receives a frozen/black
  // frame and is told via the cam-on/cam-off control.
  setCam(on: boolean): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = on;
    return on;
  }

  stopVideo() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      for (const sender of this.pc.getSenders()) {
        if (sender.track) {
          try {
            this.pc.removeTrack(sender);
          } catch {}
        }
      }
      this.localStream = null;
      this.tracksAttached = false;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopVideo();
    if (this.dc) {
      try {
        this.dc.close();
      } catch {}
    }
    try {
      this.pc.close();
    } catch {}
  }
}
