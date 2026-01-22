import { useState, useMemo, useContext } from 'preact/compat';
import { Item } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';
import { Icon } from '../Icon/Icon';
import { SidePaneItemCard } from './SidePaneItemCard';

export interface ArchiveContentProps {
    onClose: () => void;
}

export function ArchiveContent({ onClose }: ArchiveContentProps) {
    const { stateManager } = useContext(KanbanContext);
    const board = stateManager.useState();
    const [searchQuery, setSearchQuery] = useState('');

    const archive = board?.data?.archive || [];

    const filteredArchive = useMemo(() => {
        if (!searchQuery.trim()) return archive;
        const query = searchQuery.toLowerCase();
        return archive.filter((item: Item) =>
            item.data.title?.toLowerCase().includes(query) ||
            item.data.titleRaw?.toLowerCase().includes(query)
        );
    }, [archive, searchQuery]);

    return (
        <>
            <div className={c('side-pane-header')}>
                <div className={c('side-pane-title')}>
                    <Icon name="lucide-archive" />
                    <span>Archive</span>
                    <span className={c('archive-count')}>({archive.length})</span>
                </div>
                <button className={c('side-pane-close')} onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className={c('archive-search-wrapper')}>
                <input
                    type="text"
                    className={c('archive-search-input')}
                    placeholder="Search archive..."
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
                {filteredArchive.length === 0 ? (
                    <div className={c('archive-empty')}>
                        {archive.length === 0 ? 'No archived items' : 'No matches found'}
                    </div>
                ) : (
                    filteredArchive.map((item: Item) => (
                        <SidePaneItemCard key={item.id} item={item} paneType="archive" />
                    ))
                )}
            </div>
        </>
    );
}
