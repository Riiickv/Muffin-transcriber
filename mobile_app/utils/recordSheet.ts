import { useEffect, useState } from 'react';

// Whether the "recording options" bottom sheet is open. Held at module scope
// because the mic button (in the tab bar) opens it while the sheet itself is an
// app-wide overlay - two different parts of the tree. Mirrors downloadBanner.
let open = false;
let subscribers: ((v: boolean) => void)[] = [];

export function setRecordSheetOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  subscribers.forEach((fn) => fn(open));
}

export function useRecordSheetOpen(): boolean {
  const [value, setValue] = useState(open);
  useEffect(() => {
    setValue(open);
    const fn = (v: boolean) => setValue(v);
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((s) => s !== fn);
    };
  }, []);
  return value;
}
