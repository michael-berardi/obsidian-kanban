import { useContext, useCallback } from 'preact/compat';
import { c } from './helpers';
import { KanbanContext } from './context';

export type PortusView = 'pasquale' | 'studio';

// Map views to their board file paths
const VIEW_CONFIG: Record<PortusView, string> = {
    pasquale: 'Control/Portus.md',
    studio: 'Control/Portus-Studio.md',
};

// Human-readable labels for the tabs
const VIEW_LABELS: Record<PortusView, string> = {
    pasquale: 'Pasquale',
    studio: 'Studio',
};

interface ViewSwitcherProps {
    /** Currently active view, derived from current file path */
    activeView: PortusView | null;
}

/**
 * A minimal tab-style view switcher for toggling between Pasquale and Studio boards.
 * Positioned above the lanes, left-aligned.
 */
export function ViewSwitcher({ activeView }: ViewSwitcherProps) {
    const { view, stateManager } = useContext(KanbanContext);

    const handleSwitchView = useCallback((targetView: PortusView) => {
        if (targetView === activeView) return;

        const targetPath = VIEW_CONFIG[targetView];
        const app = stateManager.app;
        const file = app.vault.getAbstractFileByPath(targetPath);

        if (file) {
            // Open the target file in the same leaf (replacing current view)
            view.leaf.openFile(file as any, { active: true });
        } else {
            // File doesn't exist - could create it, but for now just show notice
            new (app as any).Notice(`Board file not found: ${targetPath}`);
        }
    }, [activeView, view, stateManager]);

    // Don't render if we can't determine the active view (not a Portus board)
    if (!activeView) return null;

    return (
        <div className={c('view-switcher')}>
            {(Object.keys(VIEW_CONFIG) as PortusView[]).map((viewKey) => (
                <button
                    key={viewKey}
                    className={`${c('view-switcher-tab')} ${activeView === viewKey ? c('view-switcher-tab-active') : ''}`}
                    onClick={() => handleSwitchView(viewKey)}
                >
                    {VIEW_LABELS[viewKey]}
                </button>
            ))}
        </div>
    );
}

/**
 * Utility to determine active view from file path
 */
export function getActiveViewFromPath(filePath: string): PortusView | null {
    for (const [viewKey, path] of Object.entries(VIEW_CONFIG)) {
        if (filePath === path) {
            return viewKey as PortusView;
        }
    }
    return null;
}
