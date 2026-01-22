import { useState, useMemo, useContext } from 'preact/compat';
import { Board, Item, Lane } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';
import { Icon } from '../Icon/Icon';
import { t } from '../../lang/helpers';

export interface ArchivePaneProps {
    onClose: () => void;
}

export function ArchivePane({ onClose }: ArchivePaneProps) {
    const { stateManager, boardModifiers } = useContext(KanbanContext);
    const board = stateManager.useState();
    const [searchQuery, setSearchQuery] = useState('');

    const archive = board?.data?.archive || [];

    // Filter archive based on search
    const filteredArchive = useMemo(() => {
        if (!searchQuery.trim()) return archive;
        const query = searchQuery.toLowerCase();
        return archive.filter((item: Item) =>
            item.data.title?.toLowerCase().includes(query) ||
            item.data.titleRaw?.toLowerCase().includes(query)
        );
    }, [archive, searchQuery]);

    const handleRestore = (item: Item) => {
        // Restore to first lane
        const firstLane = board.children[0];
        if (!firstLane) return;

        stateManager.setState((board: Board) => ({
            ...board,
            children: board.children.map((lane: Lane, idx: number) =>
                idx === 0
                    ? { ...lane, children: [...lane.children, item] }
                    : lane
            ),
            data: {
                ...board.data,
                archive: board.data.archive.filter((a: Item) => a.id !== item.id),
            },
        }));
    };

    return (
        <div className={c('archive-pane')}>
            <div className={c('archive-pane-header')}>
                <div className={c('archive-pane-title')}>
                    <Icon name="lucide-archive" />
                    <span>Archive</span>
                    <span className={c('archive-count')}>({archive.length})</span>
                </div>
                <button
                    className={c('archive-pane-close')}
                    onClick={onClose}
                    aria-label="Close"
                >
                    ✕
                </button>
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
                    <button
                        className={c('archive-search-clear')}
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                    >
                        <Icon name="lucide-x" />
                    </button>
                )}
            </div>

            <div className={c('archive-list')}>
                {filteredArchive.length === 0 ? (
                    <div className={c('archive-empty')}>
                        {archive.length === 0
                            ? 'No archived items'
                            : 'No matches found'}
                    </div>
                ) : (
                    filteredArchive.map((item: Item) => (
                        <div key={item.id} className={c('archive-item')}>
                            <div className={c('archive-item-content')}>
                                <span className={c('archive-item-title')}>
                                    {item.data.title || item.data.titleRaw}
                                </span>
                            </div>
                            <button
                                className={c('archive-restore-btn')}
                                onClick={() => handleRestore(item)}
                                aria-label="Restore to board"
                            >
                                <Icon name="lucide-undo-2" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
