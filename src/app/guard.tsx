// A screen that broke must not take the whole app with it. Used by the guest shell and the v2 shell.
import { Component, type ReactNode } from 'react';
import { back } from './router';

type Props = { children: ReactNode; resetKey: string; fallback?: (retry: () => void) => ReactNode };
export class Guard extends Component<Props, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  componentDidUpdate(prev: Props) { if (prev.resetKey !== this.props.resetKey && this.state.broken) this.setState({ broken: false }); }
  componentDidCatch(error: unknown) { console.error('screen crashed', error); }
  render() {
    if (!this.state.broken) return this.props.children;
    if (this.props.fallback) return this.props.fallback(() => this.setState({ broken: false }));
    return (
      <div className="screen" role="alert" style={{ padding: 20 }}>
        <h1>המסך הזה נתקע</h1>
        <p>שאר האפליקציה עובדת. אפשר לחזור אחורה או לטעון מחדש.</p>
        <div style={{ display: 'flex', gap: 10 }}><button type="button" className="btn" onClick={() => back('/')}>חזרה</button><button type="button" className="btn ghost" onClick={() => location.reload()}>טעינה מחדש</button></div>
      </div>
    );
  }
}
