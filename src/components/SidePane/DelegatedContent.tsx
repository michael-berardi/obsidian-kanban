import { useState, useMemo, useContext } from 'preact/compat';
import { Item } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';
import { Icon } from '../Icon/Icon';
import { SidePaneItemCard } from './SidePaneItemCard';

export interface DelegatedContentProps {
    onClose: () => void;
}

export function DelegatedContent({ onClose }: DelegatedContentProps) {
    const { stateManager } = useContext(KanbanContext);
    const board = stateManager.useState();
    const [searchQuery, setSearchQuery] = useState('');

    const delegated = board?.data?.delegated || [];

    const filteredDelegated = useMemo(() => {
        if (!searchQuery.trim()) return delegated;
        const query = searchQuery.toLowerCase();
        return delegated.filter((item: Item) =>
            item.data.title?.toLowerCase().includes(query) ||
            item.data.titleRaw?.toLowerCase().includes(query)
        );
    }, [delegated, searchQuery]);

    return (
        <>
            <div className={c('side-pane-header')}>
                <div className={c('side-pane-title')}>
                    <Icon name="lucide-send" />
                    <span>Delegated</span>
                    <span className={c('archive-count')}>({delegated.length})</span>
                </div>
                <button className={c('side-pane-close')} onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className={c('archive-search-wrapper')}>
                <input
                    type="text"
                    className={c('archive-search-input')}
                    placeholder="Search delegated..."
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
                {filteredDelegated.length === 0 ? (
                    <div className={c('archive-empty')}>
                        {delegated.length === 0 ? 'No delegated items' : 'No matches found'}
                    </div>
                ) : (
                    filteredDelegated.map((item: Item) => (
                        <SidePaneItemCard key={item.id} item={item} paneType="delegated" />
                    ))
                )}
            </div>
        </>
    );
}
