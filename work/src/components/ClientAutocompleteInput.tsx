import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clientDisplayName,
  fetchClientAutocompleteEnabled,
  searchClients,
  type ClientSuggestion,
} from "../lib/clientLink";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onPick: (client: ClientSuggestion) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
};

export function ClientAutocompleteInput({
  value,
  onChange,
  onPick,
  placeholder,
  className,
  autoFocus,
}: Props) {
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<ClientSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pickedRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClientAutocompleteEnabled().then((next) => {
      if (!cancelled) setEnabled(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || pickedRef.current) {
      pickedRef.current = false;
      setItems([]);
      setOpen(false);
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      setLoading(true);
      searchClients(q).then((next) => {
        if (cancelled) return;
        setItems(next);
        if (next.length > 0) {
          if (wrapRef.current) {
            const r = wrapRef.current.getBoundingClientRect();
            setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
          }
          setOpen(true);
        } else {
          setOpen(false);
        }
        setLoading(false);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [enabled, value]);

  function pick(client: ClientSuggestion) {
    pickedRef.current = true;
    onPick(client);
    setOpen(false);
    setItems([]);
  }

  function updateDropPos() {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (items.length > 0) { updateDropPos(); setOpen(true); }
        }}
        onKeyDown={updateDropPos}
        placeholder={placeholder}
        className={className}
      />
      {open && dropPos && createPortal(
        <div
          className="fixed z-[300] max-h-56 overflow-y-auto rounded-lg border border-line/20 bg-panel shadow-2xl"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          {items.map((client) => (
            <button
              key={client.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(client)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-surface"
            >
              <span className="block truncate font-medium text-fg">{clientDisplayName(client) || client.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {[client.phone, client.email].filter(Boolean).join(" · ") || "—"}
              </span>
            </button>
          ))}
          {loading && <p className="px-3 py-2 text-xs text-muted">...</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
