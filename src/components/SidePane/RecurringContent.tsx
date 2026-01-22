import { useState, useMemo, useContext } from 'preact/compat';
import { Item } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';
import { Icon } from '../Icon/Icon';
import { SidePaneItemCard } from './SidePaneItemCard';

export interface RecurringContentProps {
    onClose: () => void;
}

export function RecurringContent({ onClose }: RecurringContentProps) {
    const { stateManager } = useContext(KanbanContext);
    const board = stateManager.useState();
    const [searchQuery, setSearchQuery] = useState('');

    const recurring = board?.data?.recurring || [];

    const filteredRecurring = useMemo(() => {
        if (!searchQuery.trim()) return recurring;
        const query = searchQuery.toLowerCase();
        return recurring.filter((item: Item) =>
            item.data.title?.toLowerCase().includes(query) ||
            item.data.titleRaw?.toLowerCase().includes(query)
        );
    }, [recurring, searchQuery]);

    return (
        <>
            <div className={c('side-pane-header')}>
                <div className={c('side-pane-title')}>
                    <Icon name="lucide-repeat" />
                    <span>Recurring</span>
                    <span className={c('archive-count')}>({recurring.length})</span>
                </div>
                <button className={c('side-pane-close')} onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className={c('archive-search-wrapper')}>
                <input
                    type="text"
                    className={c('archive-search-input')}
                    placeholder="Search recurring..."
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
                {filteredRecurring.length === 0 ? (
                    <div className={c('archive-empty')}>
                        {recurring.length === 0 ? 'No recurring items' : 'No matches found'}
                    </div>
                ) : (
                    filteredRecurring.map((item: Item) => (
                        <SidePaneItemCard key={item.id} item={item} paneType="recurring" />
                    ))
                )}
            </div>
        </>
    );
}
