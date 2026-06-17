"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";

export default function VideoPanel({
  localStream,
  remoteStream,
  micOn,
  camOn,
  remoteMicOn,
  remoteCamOn,
  onToggleMic,
  onToggleCam,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  remoteMicOn: boolean;
  remoteCamOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black">
      {/* min-h-0 is essential: without it the flex item adopts the remote
          video's intrinsic height (720p/1080p), refuses to shrink, and pushes
          the control bar + PiP below the clipped viewport. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Remote (full screen) */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="h-full w-full bg-zinc-900 object-cover"
        />
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
            Waiting for stranger&rsquo;s video…
          </div>
        )}
        {/* Remote camera off — cover the frozen frame with a placeholder. */}
        {remoteStream && !remoteCamOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900 text-zinc-400">
            <VideoOff aria-hidden="true" size={40} strokeWidth={1.5} />
            <span className="text-sm">Stranger turned off their camera</span>
          </div>
        )}
        {/* Remote mic state badge (top-left). */}
        {remoteStream && (
          <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            {remoteMicOn ? (
              <Mic aria-hidden="true" size={14} strokeWidth={2} />
            ) : (
              <MicOff aria-hidden="true" size={14} strokeWidth={2} className="text-red-400" />
            )}
            <span>{remoteMicOn ? "Stranger" : "Stranger muted"}</span>
          </div>
        )}

        {/* Local (picture-in-picture) */}
        <div className="absolute bottom-4 right-4 h-40 w-28">
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full rounded-lg border border-zinc-700 bg-zinc-800 object-cover"
          />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-zinc-900 text-zinc-400">
              <VideoOff aria-hidden="true" size={22} strokeWidth={1.5} />
            </div>
          )}
          {/* My own mic state badge on the PiP. */}
          <div className="absolute left-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white backdrop-blur">
            {micOn ? (
              <Mic aria-hidden="true" size={12} strokeWidth={2} />
            ) : (
              <MicOff aria-hidden="true" size={12} strokeWidth={2} className="text-red-400" />
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 bg-zinc-950 p-4">
        <button
          onClick={onToggleMic}
          aria-pressed={!micOn}
          title={micOn ? "Mute microphone" : "Unmute microphone"}
          className={`grid h-12 w-12 place-items-center rounded-full font-semibold transition-colors duration-200 ${
            micOn
              ? "bg-zinc-700 text-white hover:bg-zinc-600"
              : "bg-red-500 text-white hover:bg-red-400"
          }`}
        >
          {micOn ? (
            <Mic aria-hidden="true" size={20} strokeWidth={2} />
          ) : (
            <MicOff aria-hidden="true" size={20} strokeWidth={2} />
          )}
        </button>
        <button
          onClick={onToggleCam}
          aria-pressed={!camOn}
          title={camOn ? "Turn off camera" : "Turn on camera"}
          className={`grid h-12 w-12 place-items-center rounded-full font-semibold transition-colors duration-200 ${
            camOn
              ? "bg-zinc-700 text-white hover:bg-zinc-600"
              : "bg-red-500 text-white hover:bg-red-400"
          }`}
        >
          {camOn ? (
            <Video aria-hidden="true" size={20} strokeWidth={2} />
          ) : (
            <VideoOff aria-hidden="true" size={20} strokeWidth={2} />
          )}
        </button>
        <button
          onClick={onEnd}
          title="End video call"
          className="inline-flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-red-400"
        >
          <PhoneOff aria-hidden="true" size={18} strokeWidth={2} />
          End video
        </button>
      </div>
    </div>
  );
}
