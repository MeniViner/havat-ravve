// The demo strip (Z2) and its sheet (Z3) for screens outside the v2 shell (guest app, registration, suspended).
import { useState } from 'react';
import { useDemo, setDemo, PERSONA_ROLE, SCENARIOS } from '../demo/store';
import { navigate } from '../router';
import { leaveDemoTarget } from '../demo/intro';
import { DemoStrip } from './kit';
import { DemoSheet } from './screens/system';

export function V2DemoStrip() {
  const demo = useDemo();
  const [open, setOpen] = useState(false);
  if (!demo.on) return null;
  return (
    <div className="v2" dir="rtl">
      <DemoStrip roleName={PERSONA_ROLE[demo.persona]} day={SCENARIOS[demo.scenario].label} expanded={open} onSwitch={() => setOpen(true)} onExit={() => { setDemo({ on: false }); navigate(leaveDemoTarget(), true); }} />
      <DemoSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
