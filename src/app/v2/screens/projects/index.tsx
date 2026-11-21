// v2 screens: projects. Placeholders until the area is implemented; the shell routes to these names (v2/routes.tsx).
import type { ReactNode } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { Placeholder } from '../../placeholder';

/** P2-List */
export function ProjectsList(p: ScreenProps): ReactNode { return <Placeholder name="ProjectsList" ids="P2-List" params={p.params} />; }
/** P3-Project */
export function ProjectScreen(p: ScreenProps): ReactNode { return <Placeholder name="ProjectScreen" ids="P3-Project" params={p.params} />; }
/** P4-Step */
export function StepScreen(p: ScreenProps): ReactNode { return <Placeholder name="StepScreen" ids="P4-Step" params={p.params} />; }
/** P5-New */
export function ProjectForm(p: ScreenProps): ReactNode { return <Placeholder name="ProjectForm" ids="P5-New" params={p.params} />; }

/** The 'פרויקטים' block that TasksRoot shows above all regular tasks for managers (P1/P6). Renders nothing for staff. */
export function ProjectsBlock(_: { ctx: V2Ctx }): ReactNode { return null; }

export type { V2Ctx };
