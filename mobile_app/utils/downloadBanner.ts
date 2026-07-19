import { useEffect, useState } from 'react';

// Whether the download indicator is showing its full BANNER (expanded) or has
// collapsed to just the header RING. Shared at module scope because the two live
// in different parts of the tree: the ring is in the tab header, the banner is
// an app-wide overlay. Mirrors modelPresence - an in-memory store with a hook.
let expanded = false;
let subscribers: ((v: boolean) => void)[] = [];

export function setBannerExpanded(value: boolean): void {
  if (expanded === value) return;
  expanded = value;
  subscribers.forEach((fn) => fn(expanded));
}

export function useBannerExpanded(): boolean {
  const [value, setValue] = useState(expanded);
  useEffect(() => {
    setValue(expanded);
    const fn = (v: boolean) => setValue(v);
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((s) => s !== fn);
    };
  }, []);
  return value;
}
