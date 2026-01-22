import { useContext } from 'preact/compat';
import { Item, Board } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';
import { Icon } from '../Icon/Icon';

export interface SidePaneItemCardProps {
    item: Item;
    paneType: 'archive' | 'done' | 'delegated' | 'recurring' | 'proposals' | 'waiting';
}

// Parse display title from titleRaw, stripping inline fields
function getDisplayTitle(item: Item): string {
    let title = item.data.titleRaw || item.data.title || '';
    // Remove inline fields like [priority::high], [notes::...], etc.
    title = title.replace(/\[[\w-]+::[^\]]*\]/g, '').trim();
    // Remove date stamps like @{2026-01-22}
    title = title.replace(/@\{[^}]+\}/g, '').trim();
    return title || 'Untitled';
}

// Extract archive date from titleRaw if present
function getArchiveDate(item: Item): string | null {
    const match = item.data.titleRaw?.match(/@\{(\d{4}-\d{2}-\d{2})\}/);
    if (match) {
        const date = new Date(match[1]);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return null;
}

export function SidePaneItemCard({ item, paneType }: SidePaneItemCardProps) {
    const { stateManager } = useContext(KanbanContext);

    // Click card to open detail pane (with drill-down return)
    const handleCardClick = () => {
        // Store which pane to return to when detail closes
        stateManager.previousPaneMode = paneType as any;

        // Close current pane mode
        if (paneType === 'archive') stateManager.closeArchive();
        else if (paneType === 'done') stateManager.closeDone();
        else if (paneType === 'delegated') stateManager.closeDelegated();
        else if (paneType === 'recurring') stateManager.closeRecurring();
        else if (paneType === 'proposals') stateManager.closeProposals();
        else if (paneType === 'waiting') stateManager.closeWaiting();

        // Select this item to open detail pane
        stateManager.selectItem(item.id);
    };

    // Done → Archive: Move completed task to archive
    const handleArchive = (e: MouseEvent) => {
        e.stopPropagation();
        stateManager.setState((board: Board) => ({
            ...board,
            data: {
                ...board.data,
                done: board.data.done.filter((d: Item) => d.id !== item.id),
                archive: [...board.data.archive, item],
            },
        }));
    };

    // Delegated → Done: Mark delegated task as complete
    const handleMarkComplete = (e: MouseEvent) => {
        e.stopPropagation();
        stateManager.setState((board: Board) => ({
            ...board,
            data: {
                ...board.data,
                delegated: board.data.delegated.filter((d: Item) => d.id !== item.id),
                done: [...board.data.done, item],
            },
        }));
    };

    const displayTitle = getDisplayTitle(item);
    const archiveDate = paneType === 'archive' ? getArchiveDate(item) : null;

    return (
        <div className={c('side-pane-card')} onClick={handleCardClick}>
            <div className={c('side-pane-card-content')}>
                <span className={c('side-pane-card-title')}>
                    {displayTitle}
                </span>
                {archiveDate && (
                    <span className={c('side-pane-card-meta')}>
                        {archiveDate}
                    </span>
                )}
            </div>

            {/* Done pane: Archive button */}
            {paneType === 'done' && (
                <button
                    className={c('side-pane-card-action')}
                    onClick={handleArchive}
                    aria-label="Archive"
                    title="Archive"
                >
                    <Icon name="lucide-archive" />
                </button>
            )}

            {/* Delegated pane: Mark Complete button */}
            {paneType === 'delegated' && (
                <button
                    className={c('side-pane-card-action')}
                    onClick={handleMarkComplete}
                    aria-label="Mark complete"
                    title="Mark complete"
                >
                    <Icon name="lucide-check" />
                </button>
            )}

            {/* Archive pane: No action button (view only) */}
        </div>
    );
}
