import { useState, useMemo, useContext } from 'preact/compat';
import { Item } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';
import { Icon } from '../Icon/Icon';
import { SidePaneItemCard } from './SidePaneItemCard';

export interface WaitingContentProps {
    onClose: () => void;
}

export function WaitingContent({ onClose }: WaitingContentProps) {
    const { stateManager } = useContext(KanbanContext);
    const board = stateManager.useState();
    const [searchQuery, setSearchQuery] = useState('');

    const waiting = board?.data?.waiting || [];

    const filteredWaiting = useMemo(() => {
        if (!searchQuery.trim()) return waiting;
        const query = searchQuery.toLowerCase();
        return waiting.filter((item: Item) =>
            item.data.title?.toLowerCase().includes(query) ||
            item.data.titleRaw?.toLowerCase().includes(query)
        );
    }, [waiting, searchQuery]);

    return (
        <>
            <div className={c('side-pane-header')}>
                <div className={c('side-pane-title')}>
                    <Icon name="lucide-pause-circle" />
                    <span>Waiting / Blocked</span>
                    <span className={c('archive-count')}>({waiting.length})</span>
                </div>
                <button className={c('side-pane-close')} onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className={c('archive-search-wrapper')}>
                <input
                    type="text"
                    className={c('archive-search-input')}
                    placeholder="Search waiting..."
                    value={searchQuery}
                    onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                />
                {searchQuery && (
                    <button className={c('archive-search-clear')} onClick={() => setSearchQuery('')} aria-label="Clear">
                        <Icon name="lucide-x" />
                    </button>
                )}
            </div>

            <div className={c('archive-list')}>
                {filteredWaiting.length === 0 ? (
                    <div className={c('archive-empty')}>
                        {waiting.length === 0 ? 'No waiting items' : 'No matches found'}
                    </div>
                ) : (
                    filteredWaiting.map((item: Item) => (
                        <SidePaneItemCard key={item.id} item={item} paneType="waiting" />
                    ))
                )}
            </div>
        </>
    );
}
