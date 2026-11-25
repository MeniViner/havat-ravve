// One screen that breaks never takes the console with it: it says so, and the rest keeps working.
import { Component, type ReactNode } from 'react';
import { Failed } from './desk';

export class Crash extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  componentDidCatch(error: unknown) { console.error('console screen crashed', error); }
  render() {
    return this.state.broken ? <div style={{ padding: 32 }}><Failed text="המסך הזה נתקל בתקלה." retry={() => this.setState({ broken: false })} /></div> : this.props.children;
  }
}
