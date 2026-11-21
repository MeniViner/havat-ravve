// Shown for a routed screen that is not implemented yet.
import { AppScreen } from './core';
export function Placeholder({ name, ids, params }: { name: string; ids: string; params: Record<string, string> }) {
  return <AppScreen variant="plain"><h1 style={{ fontSize: 22 }}>{name}</h1><p>{ids}</p><pre dir="ltr" style={{ fontSize: 12 }}>{JSON.stringify(params)}</pre></AppScreen>;
}
