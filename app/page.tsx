"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, {
  type ChatMessage,
  type SystemIcon,
} from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import VibePicker from "./components/VibePicker";
import { ThemeToggle } from "./components/theme";
import { join, leave, poll, sendSignal, updateVibe } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { EchoPeer, DUMMY_PEER_ID } from "@/lib/echobot";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";

// Drops a clickable test dot on the map that connects to a local echo bot,
// so chat/video can be tested solo. Set to false (or remove) to disable.
const DUMMY_ENABLED = false;

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // Track state for the on-call controls. *Mine = my own toggle; *Remote = the
  // stranger's state, kept in sync via mic-on/off + cam-on/off controls.
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteMicOn, setRemoteMicOn] = useState(true);
  const [remoteCamOn, setRemoteCamOn] = useState(true);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [myVibe, setMyVibe] = useState<string | null>(null);

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | EchoPeer | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session-scoped blocklist. Purely client-side (the server is stateless and
  // anonymous, so there's nothing durable to block on): a blocked peer's dot is
  // hidden and any request from them is auto-declined for the rest of this tab.
  const [blocked, setBlocked] = useState<string[]>([]);
  const blockedRef = useRef<Set<string>>(new Set());
  function blockPeer(id: string) {
    if (blockedRef.current.has(id)) return;
    blockedRef.current.add(id);
    setBlocked([...blockedRef.current]);
  }

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [
      ...prev,
      { id: msgId.current++, kind: "user", mine, text },
    ]);
  }

  function addSystemMessage(icon: SystemIcon, text: string) {
    setMessages((prev) => [
      ...prev,
      { id: msgId.current++, kind: "system", icon, text },
    ]);
  }

  function resetMediaToggles() {
    setMicOn(true);
    setCamOn(true);
    setRemoteMicOn(true);
    setRemoteCamOn(true);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    resetMediaToggles();
    setVideo("none");
    setMessages([]);
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          // Peer vanished without a clean "end" (e.g. tab closed / network
          // drop). Send one so the server clears busy on both sides; without
          // this our own presence stays busy=true until reload.
          void sendSignal(sessionId, peerId, "end");
          teardown("Connection failed (network).");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          // Release the camera we pre-acquired on click — the peer said no.
          ps?.stopVideo();
          setVideo("none");
          addSystemMessage("call-missed", "Missed a Video Call");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        resetMediaToggles();
        setVideo("none");
        addSystemMessage("call-ended", "Video Call Ended");
        break;
      case "mic-on":
        setRemoteMicOn(true);
        break;
      case "mic-off":
        setRemoteMicOn(false);
        break;
      case "cam-on":
        setRemoteCamOn(true);
        break;
      case "cam-off":
        setRemoteCamOn(false);
        break;
    }
  }

  function connectDummy() {
    setConn({ kind: "connecting", peerId: DUMMY_PEER_ID });
    const ps = new EchoPeer(true, {
      onSignal: () => {},
      onChat: (text) => addMessage(false, text),
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: () => {},
      onChannelOpen: () => setConn({ kind: "connected", peerId: DUMMY_PEER_ID }),
    });
    peerRef.current = ps;
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    if (peerId === DUMMY_PEER_ID) {
      connectDummy();
      return;
    }
    setConn({ kind: "requesting", peerId });
    void sendSignal(sessionId, peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(sessionId, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(sessionId, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(sessionId, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    // Declining also blocks: a stranger you said no to can't immediately
    // re-spam you with another request this session.
    blockPeer(peerId);
    void sendSignal(sessionId, peerId, "decline");
    setConn({ kind: "idle" });
  }

  // End the current connection AND hide the peer for the rest of the session.
  function blockAndSkip() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      blockPeer(c.peerId);
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown("Skipped — you won't see them again this session.");
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown();
  }

  // Leave the live map entirely and return to the entry gate. Ends any active
  // connection, drops our presence from the server, and clears session-scoped
  // state (peers, blocklist) so a fresh entry starts clean.
  function disconnect() {
    const c = connRef.current;
    if (c.kind !== "idle") {
      void sendSignal(sessionId, c.peerId, "end");
    }
    teardown();
    leave(sessionId);
    setPeers([]);
    blockedRef.current.clear();
    setBlocked([]);
    setPhase("gate");
  }

  async function startVideoRequest() {
    const ps = peerRef.current;
    if (videoRef.current !== "none" || !ps) return;
    // Grab the camera NOW, inside the click gesture. getUserMedia is rejected by
    // Safari/iOS (and flaky elsewhere) when called later from the signaling
    // callback that fires on the peer's accept — which left the requester with
    // no camera and no controls. We only acquire here; tracks aren't sent until
    // startVideo() attaches them once the peer accepts.
    try {
      await ps.acquireMedia();
    } catch {
      showNotice("Camera unavailable.");
      return;
    }
    if (videoRef.current !== "none") {
      // Chat ended / state changed while the permission prompt was open.
      ps.stopVideo();
      return;
    }
    setVideo("requesting");
    ps.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
    addSystemMessage("call-missed", "Missed a Video Call");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    resetMediaToggles();
    setVideo("none");
    addSystemMessage("call-ended", "Video Call Ended");
  }

  function toggleMic() {
    const ps = peerRef.current;
    if (!ps) return;
    const next = !micOn;
    ps.setMic(next);
    setMicOn(next);
    ps.sendControl(next ? "mic-on" : "mic-off");
  }

  function toggleCam() {
    const ps = peerRef.current;
    if (!ps) return;
    const next = !camOn;
    ps.setCam(next);
    setCamOn(next);
    ps.sendControl(next ? "cam-on" : "cam-off");
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (blockedRef.current.has(sig.fromId)) {
          void sendSignal(sessionId, sig.fromId, "decline");
        } else if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sessionId, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(sessionId);
        if (!active) return;
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);
      } catch {}
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const onLeave = () => leave(sessionId);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sessionId, phase]);

  function changeVibe(id: string) {
    if (id === myVibe) return;
    setMyVibe(id);
    void updateVibe(sessionId, id);
  }

  async function handleReady(lat: number, lng: number, vibe: string) {
    setMyLocation({ lat, lng });
    setMyVibe(vibe);
    await join(sessionId, lat, lng, vibe);
    setPhase("live");
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";

  // Fake test dot placed near you; clicking it connects to the local echo bot.
  const connPeerId = "peerId" in conn ? conn.peerId : null;
  const allPeers =
    DUMMY_ENABLED && myLocation
      ? [
          ...peers,
          {
            id: DUMMY_PEER_ID,
            lat: myLocation.lat + 0.018,
            lng: myLocation.lng + 0.018,
            busy: connPeerId === DUMMY_PEER_ID,
            vibe: "chat",
          },
        ]
      : peers;
  // Hide anyone this session has blocked/skipped.
  const mapPeers = allPeers.filter((p) => !blocked.includes(p.id));

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#f5f5f7] text-[#1d1d1f] dark:bg-[#1d1d1f] dark:text-[#f5f5f7]">
      <WorldMap
        peers={mapPeers}
        me={myLocation}
        myVibe={myVibe}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
      />

      {/* Top navigation bar — Pulse wordmark + theme toggle. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-[#1d1d1f]/10 bg-white/80 px-3.5 py-2 shadow-lg backdrop-blur dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/80">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1d1d1f] opacity-30 dark:bg-[#f5f5f7]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1d1d1f] dark:bg-[#f5f5f7]" />
            </span>
            <span className="font-display text-lg font-bold leading-none tracking-tight">
              Pulse
            </span>
          </div>
          <VibePicker vibe={myVibe} onChange={changeVibe} />
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={disconnect}
            title="Disconnect and return to the entry screen"
            className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-[#1d1d1f]/10 bg-white/80 px-4 text-sm font-medium text-[#1d1d1f] shadow-lg backdrop-blur transition-colors duration-200 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1f] dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/80 dark:text-[#f5f5f7] dark:hover:bg-[#1d1d1f] dark:focus-visible:outline-[#f5f5f7]"
          >
            <LogOut aria-hidden="true" size={16} strokeWidth={2} />
            Disconnect
          </button>
          <ThemeToggle className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-[#1d1d1f]/10 bg-white/80 text-[#1d1d1f] shadow-lg backdrop-blur transition-colors duration-200 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1f] dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/80 dark:text-[#f5f5f7] dark:hover:bg-[#1d1d1f] dark:focus-visible:outline-[#f5f5f7]" />
        </div>
      </header>

      {notice && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full border border-[#1d1d1f]/10 bg-white/90 px-4 py-2 text-sm text-[#1d1d1f] shadow-lg backdrop-blur dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/90 dark:text-[#f5f5f7]">
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#1d1d1f]/10 bg-white/90 px-4 py-2 text-sm text-[#1d1d1f] shadow-lg backdrop-blur dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/90 dark:text-[#f5f5f7]">
          <span>Requesting connection…</span>
          <button
            onClick={cancelRequest}
            className="rounded-full bg-[#1d1d1f]/10 px-3 py-1 text-xs transition-colors duration-200 hover:bg-[#1d1d1f]/15 dark:bg-[#f5f5f7]/12 dark:hover:bg-[#f5f5f7]/20"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
          onBlock={blockAndSkip}
        />
      )}

      {video === "requesting" && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full border border-[#1d1d1f]/10 bg-white/90 px-4 py-2 text-sm text-[#1d1d1f] shadow-lg backdrop-blur dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f]/90 dark:text-[#f5f5f7]">
          Waiting for stranger to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle="The stranger wants to turn on video."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          micOn={micOn}
          camOn={camOn}
          remoteMicOn={remoteMicOn}
          remoteCamOn={remoteCamOn}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}
