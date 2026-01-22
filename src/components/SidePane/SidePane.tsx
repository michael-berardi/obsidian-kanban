import { useRef, useEffect, useContext } from 'preact/compat';
import { c, baseClassName } from '../helpers';
import { KanbanContext } from '../context';
import { DetailContent } from './DetailContent';
import { ArchiveContent } from './ArchiveContent';
import { DoneContent } from './DoneContent';
import { DelegatedContent } from './DelegatedContent';
import { RecurringContent } from './RecurringContent';
import { ProposalsContent } from './ProposalsContent';
import { WaitingContent } from './WaitingContent';

export type SidePaneMode = 'detail' | 'archive' | 'done' | 'delegated' | 'recurring' | 'proposals' | 'waiting' | null;

export interface SidePaneProps {
    mode: SidePaneMode;
    onClose: () => void;
}

export function SidePane({ mode, onClose }: SidePaneProps) {
    const paneRef = useRef<HTMLDivElement>(null);

    // Click-outside handler
    useEffect(() => {
        if (!mode) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // Ignore clicks on the pane itself
            if (paneRef.current?.contains(target)) return;

            // Ignore clicks on elements marked to ignore (header buttons, menus, etc)
            if (target.closest(`.${c('ignore-click-outside')}`)) return;
            if (target.closest('.view-action')) return;
            if (target.closest('.menu')) return;
            if (target.closest('.modal')) return;

            // Only close if click is within the Kanban plugin root
            const kanbanRoot = target.closest(`.${baseClassName}`);
            if (!kanbanRoot) return;

            // Close the pane
            onClose();
        };

        // Small delay to avoid closing immediately on the opening click
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 150);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [mode, onClose]);

    if (!mode) return null;

    return (
        <div ref={paneRef} className={c('side-pane')}>
            {mode === 'detail' && <DetailContent onClose={onClose} />}
            {mode === 'archive' && <ArchiveContent onClose={onClose} />}
            {mode === 'done' && <DoneContent onClose={onClose} />}
            {mode === 'delegated' && <DelegatedContent onClose={onClose} />}
            {mode === 'recurring' && <RecurringContent onClose={onClose} />}
            {mode === 'proposals' && <ProposalsContent onClose={onClose} />}
            {mode === 'waiting' && <WaitingContent onClose={onClose} />}
        </div>
    );
}

