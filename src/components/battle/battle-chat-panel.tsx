"use client";

import { MessageCircleIcon, SendIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { gameButtonClassName } from "@/components/ui/game-button";
import { Input } from "@/components/ui/input";

type BattleMessage = {
  id: string;
  content: string;
  createdAt: string;
  user: {
    username: string;
    avatarUrl: string | null;
  };
};

type BattleChatPanelProps = {
  battleId: string;
};

const reactionPrefix = "__reaction__:";
const emojis = [
  "\uD83D\uDD25",
  "\uD83D\uDC80",
  "\uD83C\uDFA7",
  "\uD83D\uDE80",
  "\uD83D\uDE2D",
  "\uD83C\uDFC6",
  "\uD83D\uDC4D",
  "\uD83D\uDC4E",
];

export function BattleChatPanel({ battleId }: BattleChatPanelProps) {
  const [messages, setMessages] = useState<BattleMessage[]>([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/battles/${battleId}/messages`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { messages: BattleMessage[] };
      setMessages(
        data.messages.filter(
          (message) => !message.content.startsWith(reactionPrefix),
        ),
      );
    } catch {
      // Best-effort polling.
    }
  }, [battleId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadMessages();
    }, 0);
    const intervalId = window.setInterval(loadMessages, 4000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [loadMessages]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function sendMessage() {
    const trimmedContent = content.trim();

    if (!trimmedContent || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/battles/${battleId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: trimmedContent }),
      });
      const data = (await response.json()) as
        | { message: BattleMessage }
        | { error?: string };

      if (!response.ok || !("message" in data)) {
        setError(
          "error" in data && data.error ? data.error : "Could not send message.",
        );
        return;
      }

      setMessages((current) => [...current, data.message]);
      setContent("");
    } catch {
      setError("Could not send message.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section
      className="bb-panel-soft flex h-[300px] min-h-[300px] w-full flex-col p-3 lg:h-[320px] xl:h-[340px]"
      data-testid="battle-chat"
    >
      <div className="flex shrink-0 items-center gap-2">
        <MessageCircleIcon className="size-4 text-violet-200" />
        <h2 className="font-bold uppercase tracking-[0.12em] text-white">
          Chat
        </h2>
      </div>

      <div
        ref={scrollContainerRef}
        className="bb-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
      >
        {messages.length > 0 ? (
          messages.map((message) => (
            <div key={message.id} className="rounded-lg bg-black/25 p-2.5">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center overflow-hidden rounded-md bg-white/10 text-[10px] font-black uppercase text-white">
                  {message.user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={message.user.avatarUrl}
                      alt=""
                      className="size-full object-cover object-center"
                    />
                  ) : (
                    message.user.username.slice(0, 2)
                  )}
                </span>
                <p
                  className="truncate text-xs font-semibold text-violet-100"
                  title={message.user.username}
                >
                  {message.user.username}
                </p>
              </div>
              <p className="mt-2 break-words text-sm text-zinc-200">
                {message.content}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-500">
            No messages yet.
          </p>
        )}
      </div>

      <div className="mt-2 flex shrink-0 flex-wrap justify-center gap-1">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => setContent((current) => `${current}${emoji}`)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-sm transition hover:bg-white/10"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="mt-2 flex shrink-0 gap-2">
        <Input
          value={content}
          maxLength={500}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Message"
          className="border-white/10 bg-black/20 text-zinc-100"
        />
        <Button
          type="button"
          size="icon"
          disabled={!content.trim() || isSending}
          onClick={sendMessage}
          className={gameButtonClassName("primary", "size-10 rounded-lg px-0")}
        >
          <SendIcon className="size-4" />
        </Button>
      </div>
      {error ? (
        <p className="mt-2 shrink-0 text-sm text-rose-200">{error}</p>
      ) : null}
    </section>
  );
}
