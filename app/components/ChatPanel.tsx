"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Video, X } from "lucide-react";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const endButtonRef = useRef<HTMLButtonElement>(null);
  const cancelEndRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!showEndConfirm) return;

    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === "Escape") closeEndConfirm();
    }

    cancelEndRef.current?.focus();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showEndConfirm]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  function closeEndConfirm() {
    setShowEndConfirm(false);
    endButtonRef.current?.focus();
  }

  function confirmEnd() {
    setShowEndConfirm(false);
    onEnd();
  }

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-[#1d1d1f]/10 bg-[#f5f5f7] text-[#1d1d1f] shadow-2xl dark:border-[#f5f5f7]/10 dark:bg-[#1d1d1f] dark:text-[#f5f5f7]">
      <header className="flex items-center justify-between border-b border-[#1d1d1f]/10 px-4 py-3 dark:border-[#f5f5f7]/10">
        <div>
          <p className="font-semibold">Stranger</p>
          <p className="text-xs text-[#1d1d1f]/45 dark:text-[#f5f5f7]/45">
            {connected ? "Connected" : "Connecting…"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#1d1d1f]/20 px-3 py-1.5 text-sm transition-colors duration-200 hover:border-[#1d1d1f]/45 disabled:opacity-40 dark:border-[#f5f5f7]/20 dark:hover:border-[#f5f5f7]/45"
          >
            <Video aria-hidden="true" size={16} strokeWidth={2} />
            Video
          </button>
          <button
            ref={endButtonRef}
            onClick={() => setShowEndConfirm(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2 focus:ring-offset-[#f5f5f7] dark:focus:ring-offset-[#1d1d1f]"
          >
            <X aria-hidden="true" size={16} strokeWidth={2} />
            End
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-[#1d1d1f]/45 dark:text-[#f5f5f7]/45">
            Say hello. Messages are peer-to-peer and never stored.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
          >
            <span
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.mine
                  ? "bg-[#1d1d1f] text-[#f5f5f7] dark:bg-[#f5f5f7] dark:text-[#1d1d1f]"
                  : "bg-[#1d1d1f]/10 text-[#1d1d1f] dark:bg-[#f5f5f7]/10 dark:text-[#f5f5f7]"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-[#1d1d1f]/10 p-3 dark:border-[#f5f5f7]/10">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Type a message…" : "Connecting…"}
          disabled={!connected}
          className="flex-1 rounded-full bg-[#1d1d1f]/8 px-4 py-2 text-sm outline-none placeholder:text-[#1d1d1f]/35 focus:ring-1 focus:ring-[#1d1d1f] disabled:opacity-50 dark:bg-[#f5f5f7]/8 dark:placeholder:text-[#f5f5f7]/35 dark:focus:ring-[#f5f5f7]"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-semibold text-[#f5f5f7] transition-colors duration-200 hover:bg-black disabled:opacity-40 dark:bg-[#f5f5f7] dark:text-[#1d1d1f] dark:hover:bg-white"
        >
          Send
        </button>
      </form>

      {showEndConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d1d1f]/45 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEndConfirm();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-chat-title"
            aria-describedby="end-chat-description"
            className="w-full max-w-sm rounded-2xl border border-[#1d1d1f]/10 bg-white p-5 text-[#1d1d1f] shadow-2xl dark:border-[#f5f5f7]/10 dark:bg-[#252527] dark:text-[#f5f5f7]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <AlertTriangle aria-hidden="true" size={20} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="end-chat-title" className="text-base font-semibold">
                  End chat?
                </h2>
                <p
                  id="end-chat-description"
                  className="mt-1 text-sm leading-6 text-[#1d1d1f]/60 dark:text-[#f5f5f7]/60"
                >
                  This will disconnect you from the stranger and close the current chat.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={cancelEndRef}
                type="button"
                onClick={closeEndConfirm}
                className="cursor-pointer rounded-full border border-[#1d1d1f]/15 px-4 py-2 text-sm font-medium transition-colors duration-200 hover:border-[#1d1d1f]/35 hover:bg-[#1d1d1f]/5 focus:outline-none focus:ring-2 focus:ring-[#1d1d1f]/30 dark:border-[#f5f5f7]/15 dark:hover:border-[#f5f5f7]/35 dark:hover:bg-[#f5f5f7]/8 dark:focus:ring-[#f5f5f7]/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEnd}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#252527]"
              >
                <X aria-hidden="true" size={16} strokeWidth={2} />
                End chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
