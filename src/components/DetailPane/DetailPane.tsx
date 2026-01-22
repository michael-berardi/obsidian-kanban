import { useContext } from 'preact/compat';
import { Item } from '../types';
import { c } from '../helpers';
import { KanbanContext } from '../context';

export interface DetailPaneProps {
    item: Item;
    onClose: () => void;
}

export function DetailPane({ item, onClose }: DetailPaneProps) {
    const { stateManager } = useContext(KanbanContext);
    const board = stateManager.useState();

    // Find which lane this item is in
    const currentLane = board.children.find((lane) =>
        lane.children.some((child) => child.id === item.id)
    );

    return (
        <div className={c('detail-pane')}>
            <div className={c('detail-pane-header')}>
                <button
                    className={c('detail-pane-close')}
                    onClick={onClose}
                    aria-label="Close"
                >
                    ✕
                </button>
            </div>
            <div className={c('detail-pane-content')}>
                {/* Title */}
                <div>
                    <div className={c('pane-label')}>Title</div>
                    <h2 className={c('pane-title')}>{item.data.title}</h2>
                </div>

                {/* Status */}
                <div>
                    <div className={c('pane-label')}>Status</div>
                    <select
                        className={c('pane-status-select')}
                        value={currentLane?.id || ''}
                        onChange={(e) => {
                            const targetId = (e.target as HTMLSelectElement).value;
                            if (targetId && targetId !== currentLane?.id) {
                                // Move item to new lane
                                stateManager.setState((board) => {
                                    const newBoard = { ...board };
                                    newBoard.children = board.children.map((lane) => {
                                        if (lane.id === currentLane?.id) {
                                            return {
                                                ...lane,
                                                children: lane.children.filter((c) => c.id !== item.id),
                                            };
                                        }
                                        if (lane.id === targetId) {
                                            return { ...lane, children: [...lane.children, item] };
                                        }
                                        return lane;
                                    });
                                    return newBoard;
                                });
                            }
                        }}
                    >
                        {board.children.map((lane) => (
                            <option key={lane.id} value={lane.id}>
                                {lane.data.title}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Notes */}
                <div>
                    <div className={c('pane-label')}>Notes</div>
                    <textarea
                        className={c('pane-notes-input')}
                        value={item.data.notes || ''}
                        placeholder="Add notes..."
                        onInput={(e) => {
                            const value = (e.target as HTMLTextAreaElement).value;
                            stateManager.setState((board) => ({
                                ...board,
                                children: board.children.map((lane) => ({
                                    ...lane,
                                    children: lane.children.map((child) =>
                                        child.id === item.id
                                            ? { ...child, data: { ...child.data, notes: value } }
                                            : child
                                    ),
                                })),
                            }));
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
