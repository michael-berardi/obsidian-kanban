import { useContext, useRef, useEffect, useMemo } from 'preact/compat';
import update from 'immutability-helper';
import { Board, Lane, Item } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';

export interface DetailContentProps {
    onClose: () => void;
}

type Priority = 'standard' | 'high' | 'low';

// v5.0 Client field types
type ClientCode = 'PEP' | 'JPA-44D' | 'JPA-53W' | 'SHO' | 'ROC' | 'LMH' | 'TRB';

interface ClientOption {
    code: ClientCode;
    label: string;
    keywords: string[];
}

// Client options for routing (order matters - first match wins)
const CLIENT_OPTIONS: ClientOption[] = [
    { code: 'JPA-44D', label: 'JP Associates (Decatur)', keywords: ['decatur', '44 decatur', '46 decatur', '44-46 decatur'] },
    { code: 'JPA-53W', label: 'JP Associates (53 Wooster)', keywords: ['53 wooster'] },
    { code: 'SHO', label: 'SoHoJohnny LLC', keywords: ['soho johnny', 'sohojohnny', 'soho records', 'sohorecords'] },
    { code: 'ROC', label: 'Rock NYC', keywords: ['rock nyc', 'rock new york'] },
    { code: 'LMH', label: 'Let Me Help Inc.', keywords: ['let me help'] },
    { code: 'TRB', label: 'Tribeca Records', keywords: ['tribeca records', 'tribeca'] },
    { code: 'PEP', label: 'PEP Real Estate', keywords: [] }, // Default fallback
];

// Regex patterns for inline fields
const PRIORITY_REGEX = /\[priority::(standard|high|low)\]/gi;
const NOTES_REGEX = /\[notes::([^\]]*)\]/gi;
const CLIENT_REGEX = /\[client::([^\]]+)\]/gi;
const ARCHIVE_DATE_REGEX = /@\{(\d{4}-\d{2}-\d{2})\}/;

// Extract priority from titleRaw
function getPriorityFromTitle(titleRaw: string): Priority {
    const match = titleRaw.match(/\[priority::(high|low)\]/i);
    if (match) {
        return match[1].toLowerCase() as Priority;
    }
    return 'standard';
}

// Extract notes from titleRaw (URL-encoded to handle special chars)
function getNotesFromTitle(titleRaw: string): string {
    const match = titleRaw.match(/\[notes::([^\]]*)\]/i);
    if (match && match[1]) {
        try {
            return decodeURIComponent(match[1]);
        } catch {
            return match[1];
        }
    }
    return '';
}

// Extract explicit client from titleRaw
function getClientFromTitle(titleRaw: string): ClientCode | null {
    const match = titleRaw.match(/\[client::([^\]]+)\]/i);
    if (match && match[1]) {
        const code = match[1].toUpperCase() as ClientCode;
        if (CLIENT_OPTIONS.some(c => c.code === code)) {
            return code;
        }
    }
    return null;
}

// Auto-detect client from task content keywords
function autoDetectClient(titleRaw: string): ClientCode {
    const content = titleRaw.toLowerCase();
    for (const option of CLIENT_OPTIONS) {
        for (const keyword of option.keywords) {
            if (content.includes(keyword)) {
                return option.code;
            }
        }
    }
    return 'PEP'; // Default
}

// Get effective client (explicit > auto-detect)
function getEffectiveClient(titleRaw: string): ClientCode {
    return getClientFromTitle(titleRaw) || autoDetectClient(titleRaw);
}

// Update priority in titleRaw
function updatePriorityInTitle(titleRaw: string, newPriority: Priority): string {
    const cleaned = titleRaw.replace(PRIORITY_REGEX, '').trim();
    if (newPriority === 'standard') {
        return cleaned;
    }
    return `${cleaned} [priority::${newPriority}]`;
}

// Update notes in titleRaw (URL-encode to handle newlines/special chars)
function updateNotesInTitle(titleRaw: string, notes: string): string {
    const cleaned = titleRaw.replace(NOTES_REGEX, '').trim();
    if (!notes || notes.trim() === '') {
        return cleaned;
    }
    const encoded = encodeURIComponent(notes);
    return `${cleaned} [notes::${encoded}]`;
}

// Update client in titleRaw
function updateClientInTitle(titleRaw: string, client: ClientCode): string {
    const cleaned = titleRaw.replace(CLIENT_REGEX, '').trim();
    // Only add explicit tag if not PEP (default) or if overriding auto-detect
    const autoDetected = autoDetectClient(titleRaw);
    if (client === autoDetected) {
        return cleaned; // No need to add explicit tag if matches auto-detect
    }
    return `${cleaned} [client::${client}]`;
}

export function DetailContent({ onClose }: DetailContentProps) {
    const { stateManager } = useContext(KanbanContext);
    const board = stateManager.useState();
    const item = stateManager.getSelectedItem();
    const notesRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize notes textarea
    useEffect(() => {
        if (notesRef.current) {
            notesRef.current.style.height = 'auto';
            notesRef.current.style.height = Math.max(100, notesRef.current.scrollHeight) + 'px';
        }
    }, [item?.data.titleRaw]);

    // Keydown handler for Delete/Backspace
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input/textarea is focused
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                e.stopPropagation();

                // Custom Undo: Save item to buffer before deleting
                const boardDataSync = stateManager.state;
                let location: any = null;

                // Check standard lanes
                for (let laneIdx = 0; laneIdx < boardDataSync.children.length; laneIdx++) {
                    const idx = boardDataSync.children[laneIdx].children.findIndex((i: Item) => i.id === item.id);
                    if (idx !== -1) {
                        location = { type: 'lane', laneIndex: laneIdx, itemIndex: idx };
                        break;
                    }
                }

                // Check virtual lanes if not found
                if (!location) {
                    const virtualLanes = ['archive', 'done', 'delegated', 'recurring', 'proposals', 'waiting'] as const;
                    for (const key of virtualLanes) {
                        const list = boardDataSync.data[key];
                        if (list) {
                            const idx = list.findIndex((i: Item) => i.id === item.id);
                            if (idx !== -1) {
                                location = { type: 'virtual', listName: key, itemIndex: idx };
                                break;
                            }
                        }
                    }
                }

                if (location) {
                    stateManager.saveDeletedItem(item, location);
                }

                stateManager.setState((boardData: Board) => {
                    // Check standard lanes
                    for (let laneIdx = 0; laneIdx < boardData.children.length; laneIdx++) {
                        const lane = boardData.children[laneIdx];
                        const itemIdx = lane.children.findIndex(i => i.id === item.id);
                        if (itemIdx !== -1) {
                            return update(boardData, {
                                children: {
                                    [laneIdx]: {
                                        children: { $splice: [[itemIdx, 1]] }
                                    }
                                }
                            });
                        }
                    }

                    // Check virtual lanes
                    const virtualLanes = ['archive', 'done', 'delegated', 'recurring', 'proposals', 'waiting'] as const;
                    for (const key of virtualLanes) {
                        const list = boardData.data[key];
                        if (list) {
                            const itemIdx = list.findIndex(i => i.id === item.id);
                            if (itemIdx !== -1) {
                                return update(boardData, {
                                    data: {
                                        [key]: { $splice: [[itemIdx, 1]] }
                                    }
                                });
                            }
                        }
                    }

                    return boardData;
                });
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [item.id, onClose]);

    // Get priority from titleRaw (persisted)
    const priority: Priority = useMemo(() => {
        if (!item) return 'standard';
        return getPriorityFromTitle(item.data.titleRaw || '');
    }, [item?.data.titleRaw]);

    // Get notes from titleRaw (persisted)
    const notes: string = useMemo(() => {
        if (!item) return '';
        return getNotesFromTitle(item.data.titleRaw || '');
    }, [item?.data.titleRaw]);

    // v5.0: Get client from titleRaw (explicit or auto-detected)
    const client: ClientCode = useMemo(() => {
        if (!item) return 'PEP';
        return getEffectiveClient(item.data.titleRaw || '');
    }, [item?.data.titleRaw]);

    // v5.0: Is client explicitly set (vs auto-detected)?
    const isClientExplicit: boolean = useMemo(() => {
        if (!item) return false;
        return getClientFromTitle(item.data.titleRaw || '') !== null;
    }, [item?.data.titleRaw]);

    if (!item) return null;

    // Find which lane this item is in
    const currentLane = board.children.find((lane: Lane) =>
        lane.children.some((child: Item) => child.id === item.id)
    );

    // Check if this item is from archive/done/delegated
    const isArchived = useMemo(() => {
        return board.data.archive?.some((a: Item) => a.id === item.id) || false;
    }, [board.data.archive, item.id]);

    const isDone = useMemo(() => {
        return board.data.done?.some((d: Item) => d.id === item.id) || false;
    }, [board.data.done, item.id]);

    const isDelegated = useMemo(() => {
        return board.data.delegated?.some((d: Item) => d.id === item.id) || false;
    }, [board.data.delegated, item.id]);

    const isRecurring = useMemo(() => {
        return board.data.recurring?.some((r: Item) => r.id === item.id) || false;
    }, [board.data.recurring, item.id]);

    const isProposals = useMemo(() => {
        return board.data.proposals?.some((p: Item) => p.id === item.id) || false;
    }, [board.data.proposals, item.id]);

    const isWaiting = useMemo(() => {
        return board.data.waiting?.some((w: Item) => w.id === item.id) || false;
    }, [board.data.waiting, item.id]);

    // Parse archive date from titleRaw
    const archiveDate = useMemo(() => {
        const match = (item.data.titleRaw || '').match(ARCHIVE_DATE_REGEX);
        if (match) {
            const date = new Date(match[1]);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        return null;
    }, [item.data.titleRaw]);

    // Get display title (without inline fields and archive date)
    const displayTitle = (item.data.titleRaw || '')
        .replace(PRIORITY_REGEX, '')
        .replace(NOTES_REGEX, '')
        .replace(ARCHIVE_DATE_REGEX, '')
        .trim();

    const updateContent = (newTitleRaw: string) => {
        stateManager.setState((board: Board) => ({
            ...board,
            children: board.children.map((lane: Lane) => ({
                ...lane,
                children: lane.children.map((child: Item) =>
                    child.id === item.id
                        ? stateManager.updateItemContent(child, newTitleRaw)
                        : child
                ),
            })),
        }));
    };

    const updateTitle = (newTitle: string) => {
        // Preserve priority and notes when updating title
        let newTitleRaw = newTitle;
        const currentPriority = getPriorityFromTitle(item.data.titleRaw || '');
        const currentNotes = getNotesFromTitle(item.data.titleRaw || '');
        newTitleRaw = updatePriorityInTitle(newTitleRaw, currentPriority);
        newTitleRaw = updateNotesInTitle(newTitleRaw, currentNotes);
        updateContent(newTitleRaw);
    };

    const updatePriority = (newPriority: Priority) => {
        const currentNotes = getNotesFromTitle(item.data.titleRaw || '');
        let newTitleRaw = updatePriorityInTitle(displayTitle, newPriority);
        newTitleRaw = updateNotesInTitle(newTitleRaw, currentNotes);
        updateContent(newTitleRaw);
    };

    const updateNotes = (newNotes: string) => {
        const currentPriority = getPriorityFromTitle(item.data.titleRaw || '');
        let newTitleRaw = updatePriorityInTitle(displayTitle, currentPriority);
        newTitleRaw = updateNotesInTitle(newTitleRaw, newNotes);
        // Preserve client if explicitly set
        const explicitClient = getClientFromTitle(item.data.titleRaw || '');
        if (explicitClient) {
            newTitleRaw = updateClientInTitle(newTitleRaw, explicitClient);
        }
        updateContent(newTitleRaw);
    };

    // v5.0: Update client field
    const updateClient = (newClient: ClientCode) => {
        const currentPriority = getPriorityFromTitle(item.data.titleRaw || '');
        const currentNotes = getNotesFromTitle(item.data.titleRaw || '');
        let newTitleRaw = updatePriorityInTitle(displayTitle, currentPriority);
        newTitleRaw = updateNotesInTitle(newTitleRaw, currentNotes);
        newTitleRaw = updateClientInTitle(newTitleRaw, newClient);
        updateContent(newTitleRaw);
    };

    return (
        <>
            <div className={c('side-pane-header')}>
                <div className={c('side-pane-title')}>
                    <span>Details</span>
                </div>
                <button
                    className={c('side-pane-close')}
                    onClick={onClose}
                    aria-label="Close"
                >
                    ✕
                </button>
            </div>
            <div className={c('side-pane-content')}>
                {/* Title */}
                <div>
                    <div className={c('pane-label')}>Title</div>
                    <textarea
                        className={c('pane-title-input')}
                        value={displayTitle}
                        rows={Math.max(2, Math.ceil(displayTitle.length / 40))}
                        onInput={(e) => {
                            const textarea = e.target as HTMLTextAreaElement;
                            textarea.style.height = 'auto';
                            textarea.style.height = textarea.scrollHeight + 'px';
                            updateTitle(textarea.value);
                        }}
                        ref={(el) => {
                            if (el) {
                                el.style.height = 'auto';
                                el.style.height = el.scrollHeight + 'px';
                            }
                        }}
                    />
                </div>

                {/* Status and Priority Row */}
                <div className={c('pane-row')}>
                    <div className={c('pane-field')}>
                        <div className={c('pane-label')}>Status</div>
                        {isArchived ? (
                            <div className={c('pane-status-chip')}>Archived</div>
                        ) : isDone ? (
                            <div className={c('pane-status-chip')}>Done</div>
                        ) : isDelegated ? (
                            <div className={c('pane-status-chip')}>Delegated</div>
                        ) : (
                            <select
                                className={c('pane-status-select')}
                                value={
                                    currentLane?.id ||
                                    (isArchived ? 'archive' : '') ||
                                    (isDone ? 'done' : '') ||
                                    (isDelegated ? 'delegated' : '') ||
                                    (isRecurring ? 'recurring' : '') ||
                                    (isProposals ? 'proposals' : '') ||
                                    (isWaiting ? 'waiting' : '')
                                }
                                onChange={(e) => {
                                    const targetId = (e.target as HTMLSelectElement).value;

                                    // Special handlers for virtual lanes
                                    if (['archive', 'done', 'delegated', 'recurring', 'proposals', 'waiting'].includes(targetId)) {
                                        console.log('Moving to virtual lane:', targetId);

                                        // v5.0 Tabula Integration: Sync to invoice when moving to Done
                                        if (targetId === 'done') {
                                            // Find source location and use markTaskComplete for proper sync
                                            const laneIndex = board.children.findIndex((lane: Lane) =>
                                                lane.children.some((child: Item) => child.id === item.id)
                                            );
                                            if (laneIndex !== -1) {
                                                const itemIndex = board.children[laneIndex].children.findIndex((child: Item) => child.id === item.id);
                                                stateManager.markTaskComplete(item, laneIndex, itemIndex);
                                                return;
                                            }
                                            // If from virtual lane (delegated/recurring/etc), use markTaskCompleteFromVirtual
                                            const virtualSources = ['delegated', 'recurring', 'proposals', 'waiting'] as const;
                                            for (const source of virtualSources) {
                                                const list = board.data[source] || [];
                                                const idx = list.findIndex((i: Item) => i.id === item.id);
                                                if (idx !== -1) {
                                                    stateManager.markTaskCompleteFromVirtual(item, source, idx);
                                                    return;
                                                }
                                            }
                                        }

                                        // Helper to remove item from any location
                                        const removeItem = (b: Board, itemId: string): Board => {
                                            // Check real lanes
                                            const newChildren = b.children.map(lane => ({
                                                ...lane,
                                                children: lane.children.filter(i => i.id !== itemId)
                                            }));

                                            // Check virtual lanes
                                            const newData = { ...b.data };
                                            if (newData.archive) newData.archive = newData.archive.filter(i => i.id !== itemId);
                                            if (newData.done) newData.done = newData.done.filter(i => i.id !== itemId);
                                            if (newData.delegated) newData.delegated = newData.delegated.filter(i => i.id !== itemId);
                                            if (newData.recurring) newData.recurring = newData.recurring.filter(i => i.id !== itemId);
                                            if (newData.proposals) newData.proposals = newData.proposals.filter(i => i.id !== itemId);
                                            if (newData.waiting) newData.waiting = newData.waiting.filter(i => i.id !== itemId);

                                            return { ...b, children: newChildren, data: newData };
                                        };

                                        // Helper to add item to target location
                                        const addItem = (b: Board, target: string, item: Item): Board => {
                                            const newBoard = { ...b };

                                            // If target is a real lane ID
                                            const targetLaneIndex = newBoard.children.findIndex(l => l.id === target);
                                            if (targetLaneIndex !== -1) {
                                                newBoard.children[targetLaneIndex].children.push(item);
                                                return newBoard;
                                            }

                                            // If target is a virtual lane key
                                            if (target === 'archive') { newBoard.data.archive = [...(newBoard.data.archive || []), item]; }
                                            else if (target === 'done') { newBoard.data.done = [...(newBoard.data.done || []), item]; }
                                            else if (target === 'delegated') { newBoard.data.delegated = [...(newBoard.data.delegated || []), item]; }
                                            else if (target === 'recurring') { newBoard.data.recurring = [...(newBoard.data.recurring || []), item]; }
                                            else if (target === 'proposals') { newBoard.data.proposals = [...(newBoard.data.proposals || []), item]; }
                                            else if (target === 'waiting') { newBoard.data.waiting = [...(newBoard.data.waiting || []), item]; }

                                            return newBoard;
                                        };

                                        stateManager.setState((prevBoard: Board) => {
                                            const boardWithoutItem = removeItem(prevBoard, item.id);
                                            return addItem(boardWithoutItem, targetId, item);
                                        });
                                        return;
                                    }

                                    // Handle move to standard lane
                                    if (targetId && targetId !== currentLane?.id) {
                                        // Helper reuse from above (duplicate for safety context)
                                        const removeItem = (b: Board, itemId: string): Board => {
                                            const newChildren = b.children.map(lane => ({
                                                ...lane,
                                                children: lane.children.filter(i => i.id !== itemId)
                                            }));
                                            const newData = { ...b.data };
                                            if (newData.archive) newData.archive = newData.archive.filter(i => i.id !== itemId);
                                            if (newData.done) newData.done = newData.done.filter(i => i.id !== itemId);
                                            if (newData.delegated) newData.delegated = newData.delegated.filter(i => i.id !== itemId);
                                            if (newData.recurring) newData.recurring = newData.recurring.filter(i => i.id !== itemId);
                                            if (newData.proposals) newData.proposals = newData.proposals.filter(i => i.id !== itemId);
                                            if (newData.waiting) newData.waiting = newData.waiting.filter(i => i.id !== itemId);
                                            return { ...b, children: newChildren, data: newData };
                                        };

                                        stateManager.setState((prevBoard: Board) => {
                                            const boardWithoutItem = removeItem(prevBoard, item.id);

                                            // Add to real lane
                                            const newChildren = boardWithoutItem.children.map(lane => {
                                                if (lane.id === targetId) {
                                                    return { ...lane, children: [...lane.children, item] };
                                                }
                                                return lane;
                                            });

                                            return { ...boardWithoutItem, children: newChildren };
                                        });
                                    }
                                }}
                            >
                                {/* Standard Lanes */}
                                <option disabled>-- Lanes --</option>
                                {board.children.map((lane: Lane) => (
                                    <option key={lane.id} value={lane.id}>
                                        {lane.data.title}
                                    </option>
                                ))}

                                {/* Virtual Lanes (Always Visible) */}
                                <option disabled>-- Status --</option>
                                <option value="done">Done</option>
                                <option value="delegated">Delegated</option>
                                <option value="waiting">Waiting / Blocked</option>
                                <option value="recurring">Recurring</option>
                                <option value="proposals">Proposals</option>
                                <option value="archive">Archive</option>
                            </select>
                        )}
                        {/* Archive date chip */}
                        {isArchived && archiveDate && (
                            <div className={c('pane-date-chip')}>
                                Archived {archiveDate}
                            </div>
                        )}
                    </div>
                    <div className={c('pane-field')}>
                        <div className={c('pane-label')}>Priority</div>
                        <select
                            className={c('pane-priority-select')}
                            value={priority}
                            onChange={(e) => updatePriority((e.target as HTMLSelectElement).value as Priority)}
                        >
                            <option value="standard">Standard</option>
                            <option value="high">High</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                    <div className={c('pane-field')}>
                        <div className={c('pane-label')}>
                            Client {isClientExplicit ? '' : '(auto)'}
                        </div>
                        <select
                            className={c('pane-client-select')}
                            value={client}
                            onChange={(e) => updateClient((e.target as HTMLSelectElement).value as ClientCode)}
                        >
                            {CLIENT_OPTIONS.map((opt) => (
                                <option key={opt.code} value={opt.code}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Notes */}
                <div className={c('pane-notes-section')}>
                    <div className={c('pane-label')}>Notes</div>
                    <textarea
                        ref={notesRef}
                        className={c('pane-notes-input')}
                        value={notes}
                        placeholder="Add notes..."
                        onInput={(e) => {
                            const textarea = e.target as HTMLTextAreaElement;
                            textarea.style.height = 'auto';
                            textarea.style.height = Math.max(100, textarea.scrollHeight) + 'px';
                        }}
                        onBlur={(e) => {
                            // Save notes on blur to avoid too many updates while typing
                            updateNotes((e.target as HTMLTextAreaElement).value);
                        }}
                    />
                </div>
            </div>
        </>
    );
}
