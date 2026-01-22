import { useState, useMemo, useContext } from 'preact/compat';
import { Item } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';
import { Icon } from '../Icon/Icon';
import { SidePaneItemCard } from './SidePaneItemCard';

export interface ProposalsContentProps {
    onClose: () => void;
}

export function ProposalsContent({ onClose }: ProposalsContentProps) {
    const { stateManager } = useContext(KanbanContext);
    const board = stateManager.useState();
    const [searchQuery, setSearchQuery] = useState('');

    const proposals = board?.data?.proposals || [];

    const filteredProposals = useMemo(() => {
        if (!searchQuery.trim()) return proposals;
        const query = searchQuery.toLowerCase();
        return proposals.filter((item: Item) =>
            item.data.title?.toLowerCase().includes(query) ||
            item.data.titleRaw?.toLowerCase().includes(query)
        );
    }, [proposals, searchQuery]);

    return (
        <>
            <div className={c('side-pane-header')}>
                <div className={c('side-pane-title')}>
                    <Icon name="lucide-file-text" />
                    <span>Pending Proposals</span>
                    <span className={c('archive-count')}>({proposals.length})</span>
                </div>
                <button className={c('side-pane-close')} onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className={c('archive-search-wrapper')}>
                <input
                    type="text"
                    className={c('archive-search-input')}
                    placeholder="Search proposals..."
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
                {filteredProposals.length === 0 ? (
                    <div className={c('archive-empty')}>
                        {proposals.length === 0 ? 'No pending proposals' : 'No matches found'}
                    </div>
                ) : (
                    filteredProposals.map((item: Item) => (
                        <SidePaneItemCard key={item.id} item={item} paneType="proposals" />
                    ))
                )}
            </div>
        </>
    );
}
