import { useEffect, useRef, useState } from "react";
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
        setOpen(next.length > 0);
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

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className={className}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 max-h-56 overflow-y-auto rounded-lg border border-line/20 bg-panel shadow-2xl">
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
        </div>
      )}
    </div>
  );
}
