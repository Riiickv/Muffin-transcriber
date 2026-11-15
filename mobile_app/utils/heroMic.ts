import { useEffect, useState } from 'react';

// Whether the big record button on the home screen is currently drawn.
//
// The tab bar carries a small record button of its own so you can record from
// History or Settings. On the home screen, with the big one right there, that
// is the same button twice, so the bar folds its copy away while this is true.
// The home screen swaps the big button out for the transcript once there is
// one, and then the small one comes back.

let onScreen = false;
let subscribers: ((v: boolean) => void)[] = [];

export function setHeroMicOnScreen(value: boolean): void {
  if (onScreen === value) return;
  onScreen = value;
  subscribers.forEach((fn) => fn(onScreen));
}

export function useHeroMicOnScreen(): boolean {
  const [value, setValue] = useState(onScreen);
  useEffect(() => {
    setValue(onScreen);
    const fn = (v: boolean) => setValue(v);
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((s) => s !== fn);
    };
  }, []);
  return value;
}
