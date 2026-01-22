import { useState, useMemo, useContext } from 'preact/compat';
import { Item } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';
import { Icon } from '../Icon/Icon';
import { SidePaneItemCard } from './SidePaneItemCard';

export interface DoneContentProps {
    onClose: () => void;
}

export function DoneContent({ onClose }: DoneContentProps) {
    const { stateManager } = useContext(KanbanContext);
    const board = stateManager.useState();
    const [searchQuery, setSearchQuery] = useState('');

    const done = board?.data?.done || [];

    const filteredDone = useMemo(() => {
        if (!searchQuery.trim()) return done;
        const query = searchQuery.toLowerCase();
        return done.filter((item: Item) =>
            item.data.title?.toLowerCase().includes(query) ||
            item.data.titleRaw?.toLowerCase().includes(query)
        );
    }, [done, searchQuery]);

    return (
        <>
            <div className={c('side-pane-header')}>
                <div className={c('side-pane-title')}>
                    <Icon name="lucide-check-circle" />
                    <span>Done</span>
                    <span className={c('archive-count')}>({done.length})</span>
                </div>
                <button className={c('side-pane-close')} onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className={c('archive-search-wrapper')}>
                <input
                    type="text"
                    className={c('archive-search-input')}
                    placeholder="Search completed..."
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
                {filteredDone.length === 0 ? (
                    <div className={c('archive-empty')}>
                        {done.length === 0 ? 'No completed items' : 'No matches found'}
                    </div>
                ) : (
                    filteredDone.map((item: Item) => (
                        <SidePaneItemCard key={item.id} item={item} paneType="done" />
                    ))
                )}
            </div>
        </>
    );
}
