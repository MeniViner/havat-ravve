// Events area: small pieces shared by the screens (links, the "not found" state, plain list rows the kit Row does not cover).
import type { MouseEvent, ReactNode } from 'react';
import { href as hrefOf, back } from '../../../router';
import { AppScreen, go } from '../../core';
import { TopBar, EmptyState, Button, Icon, cx } from '../../kit';
import { useToast } from '../../core';
import { isConflict } from '../../../db';
import './events.css';

/** Props for an in-app link: a real href (long-press, new tab) that navigates inside the app on a plain click. */
export function link(path: string) {
  return {
    href: hrefOf(path),
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault(); go(path);
    },
  };
}
export const backTo = (label: string, parent: string) => ({ label, onClick: () => back(parent) });

/** The event (or tab, product) is gone or never existed. */
export function Missing({ backLabel, parent, title = 'האירוע לא נמצא' }: { backLabel: string; parent: string; title?: string }) {
  return (
    <AppScreen variant="detail">
      <TopBar back={backTo(backLabel, parent)} />
      <EmptyState icon="calendar" title={title} text="אולי נמחק" action={<Button variant="outline" onClick={() => go(parent, true)}>{backLabel}</Button>} />
    </AppScreen>
  );
}
/** While the first snapshot loads: the frame with the back link, nothing that jumps. */
export function Loading({ backLabel, parent, bar }: { backLabel: string; parent: string; bar?: ReactNode }) {
  return <AppScreen variant="detail" bar={bar}><TopBar back={backTo(backLabel, parent)} /></AppScreen>;
}

/** Overline + h1 (26/1.15) block of the event screens and N12. */
export function TitleBlock({ over, title }: { over: ReactNode; title: ReactNode }) {
  return (
    <div className="events-titleblock">
      <span className="events-titleblock__over">{over}</span>
      <h1 className="k-h1 k-h1--detail-tight">{title}</h1>
    </div>
  );
}

/** Soft chevron as in the design rows. */
export const Chev = () => <span className="events-chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>;

/** Row of equal-height buttons, gap 8 (design button rows under cards). */
export function ButtonRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('events-btnrow', className)}>{children}</div>;
}

/** Runs a write; a conflict or a refused write shows X1, anything else a short error. */
export function useRun() {
  const toast = useToast();
  return async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try { return await fn(); }
    catch (e) {
      if (isConflict(e)) toast.refused((e as Error).message);
      else toast.show({ text: (e as Error)?.message?.startsWith('זה פריט לדוגמה') ? (e as Error).message : 'לא נשמר. נסו שוב.', tone: 'error' });
      return undefined;
    }
  };
}
