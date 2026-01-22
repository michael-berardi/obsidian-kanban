import update from 'immutability-helper';
import { App, TFile, moment } from 'obsidian';
import { useEffect, useState } from 'preact/compat';

import { KanbanView } from './KanbanView';
import { KanbanSettings, SettingRetrievers } from './Settings';
import { getDefaultDateFormat, getDefaultTimeFormat } from './components/helpers';
import { Board, BoardTemplate, Item } from './components/types';
import { ListFormat } from './parsers/List';
import { BaseFormat, frontmatterKey, shouldRefreshBoard } from './parsers/common';
import { getTaskStatusDone } from './parsers/helpers/inlineMetadata';
import { defaultDateTrigger, defaultMetadataPosition, defaultTimeTrigger } from './settingHelpers';

export class StateManager {
  onEmpty: () => void;
  getGlobalSettings: () => KanbanSettings;

  stateReceivers: Array<(state: Board) => void> = [];
  settingsNotifiers: Map<keyof KanbanSettings, Array<() => void>> = new Map();

  viewSet: Set<KanbanView> = new Set();
  compiledSettings: KanbanSettings = {};

  app: App;
  state: Board;
  file: TFile;

  parser: BaseFormat;

  // v2 Selection state
  selectedItemId: string | null = null;

  // v2.1 Archive pane state
  isArchiveOpen: boolean = false;

  // v2.1 Done pane state
  isDoneOpen: boolean = false;

  // v2.1 Pane drill-down: track which pane to return to when closing detail
  previousPaneMode: 'archive' | 'done' | 'delegated' | 'recurring' | 'proposals' | 'waiting' | null = null;

  // v2.6 Custom Undo Buffer
  lastDeletedBuffer: {
    item: Item;
    location:
    | { type: 'lane'; laneIndex: number; itemIndex: number }
    | { type: 'virtual'; listName: 'archive' | 'done' | 'delegated' | 'recurring' | 'proposals' | 'waiting'; itemIndex: number };
  } | null = null;

  constructor(
    app: App,
    initialView: KanbanView,
    initialData: string,
    onEmpty: () => void,
    getGlobalSettings: () => KanbanSettings
  ) {
    this.app = app;
    this.file = initialView.file;
    this.onEmpty = onEmpty;
    this.getGlobalSettings = getGlobalSettings;
    this.parser = new ListFormat(this);

    this.registerView(initialView, initialData, true);
  }

  getAView(): KanbanView {
    return this.viewSet.values().next().value;
  }

  hasError(): boolean {
    return !!this.state?.data?.errors?.length;
  }

  async registerView(view: KanbanView, data: string, shouldParseData: boolean) {
    if (!this.viewSet.has(view)) {
      this.viewSet.add(view);
    }

    // This helps delay blocking the UI until the the loading indicator is displayed
    await new Promise((res) => activeWindow.setTimeout(res, 10));

    if (shouldParseData) {
      await this.newBoard(view, data);
    } else {
      await view.prerender(this.state);
    }

    view.populateViewState(this.state.data.settings);
  }

  unregisterView(view: KanbanView) {
    if (this.viewSet.has(view)) {
      this.viewSet.delete(view);

      if (this.viewSet.size === 0) {
        this.onEmpty();
      }
    }
  }

  buildSettingRetrievers(): SettingRetrievers {
    return {
      getGlobalSettings: this.getGlobalSettings,
      getGlobalSetting: this.getGlobalSetting,
      getSetting: this.getSetting,
    };
  }

  async newBoard(view: KanbanView, md: string) {
    try {
      const board = this.getParsedBoard(md);
      await view.prerender(board);
      this.setState(board, false);
    } catch (e) {
      this.setError(e);
    }
  }

  saveToDisk() {
    if (this.state.data.errors.length > 0) {
      return;
    }

    const view = this.getAView();

    if (view) {
      const fileStr = this.parser.boardToMd(this.state);
      view.requestSaveToDisk(fileStr);

      this.viewSet.forEach((view) => {
        view.data = fileStr;
      });
    }
  }

  softRefresh() {
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  forceRefresh() {
    if (this.state) {
      try {
        this.compileSettings();
        this.state = this.parser.reparseBoard();

        this.stateReceivers.forEach((receiver) => receiver(this.state));
        this.settingsNotifiers.forEach((notifiers) => {
          notifiers.forEach((fn) => fn());
        });
        this.viewSet.forEach((view) => view.initHeaderButtons());
      } catch (e) {
        console.error(e);
        this.setError(e);
      }
    }
  }

  setState(state: Board | ((board: Board) => Board), shouldSave: boolean = true) {
    try {
      const oldSettings = this.state?.data.settings;
      const newState = typeof state === 'function' ? state(this.state) : state;
      const newSettings = newState?.data.settings;

      if (oldSettings && newSettings && shouldRefreshBoard(oldSettings, newSettings)) {
        this.state = update(this.state, {
          data: {
            settings: {
              $set: newSettings,
            },
          },
        });
        this.compileSettings();
        this.state = this.parser.reparseBoard();
      } else {
        this.state = newState;
        this.compileSettings();
      }

      this.viewSet.forEach((view) => {
        view.initHeaderButtons();
        view.validatePreviewCache(newState);
      });

      if (shouldSave) {
        this.saveToDisk();
      }

      this.stateReceivers.forEach((receiver) => receiver(this.state));

      if (oldSettings !== newSettings && newSettings) {
        this.settingsNotifiers.forEach((notifiers, key) => {
          if ((!oldSettings && newSettings) || oldSettings[key] !== newSettings[key]) {
            notifiers.forEach((fn) => fn());
          }
        });
      }
    } catch (e) {
      console.error(e);
      this.setError(e);
    }
  }

  useState(): Board {
    const [state, setState] = useState(this.state);

    useEffect(() => {
      this.stateReceivers.push((state) => setState(state));
      setState(this.state);
      return () => {
        this.stateReceivers.remove(setState);
      };
    }, []);

    return state;
  }

  useSetting<K extends keyof KanbanSettings>(key: K): KanbanSettings[K] {
    const [state, setState] = useState<KanbanSettings[K]>(this.getSetting(key));

    useEffect(() => {
      const receiver = () => setState(this.getSetting(key));

      if (this.settingsNotifiers.has(key)) {
        this.settingsNotifiers.get(key).push(receiver);
      } else {
        this.settingsNotifiers.set(key, [receiver]);
      }

      return () => {
        this.settingsNotifiers.get(key).remove(receiver);
      };
    }, []);

    return state;
  }

  compileSettings(suppliedSettings?: KanbanSettings) {
    const globalKeys = this.getGlobalSetting('metadata-keys') || [];
    const localKeys = this.getSettingRaw('metadata-keys', suppliedSettings) || [];
    const metadataKeys = Array.from(new Set([...globalKeys, ...localKeys]));

    const dateFormat =
      this.getSettingRaw('date-format', suppliedSettings) || getDefaultDateFormat(this.app);
    const dateDisplayFormat =
      this.getSettingRaw('date-display-format', suppliedSettings) || dateFormat;

    const timeFormat =
      this.getSettingRaw('time-format', suppliedSettings) || getDefaultTimeFormat(this.app);

    const archiveDateFormat =
      this.getSettingRaw('archive-date-format', suppliedSettings) || `${dateFormat} ${timeFormat}`;

    this.compiledSettings = {
      [frontmatterKey]: this.getSettingRaw(frontmatterKey, suppliedSettings) || 'board',
      'date-format': dateFormat,
      'date-display-format': dateDisplayFormat,
      'date-time-display-format': dateDisplayFormat + ' ' + timeFormat,
      'date-trigger': this.getSettingRaw('date-trigger', suppliedSettings) || defaultDateTrigger,
      'inline-metadata-position':
        this.getSettingRaw('inline-metadata-position', suppliedSettings) || defaultMetadataPosition,
      'time-format': timeFormat,
      'time-trigger': this.getSettingRaw('time-trigger', suppliedSettings) || defaultTimeTrigger,
      'link-date-to-daily-note': this.getSettingRaw('link-date-to-daily-note', suppliedSettings),
      'move-dates': this.getSettingRaw('move-dates', suppliedSettings),
      'move-tags': this.getSettingRaw('move-tags', suppliedSettings),
      'move-task-metadata': this.getSettingRaw('move-task-metadata', suppliedSettings),
      'metadata-keys': metadataKeys,
      'archive-date-separator': this.getSettingRaw('archive-date-separator') || '',
      'archive-date-format': archiveDateFormat,
      'show-add-list': this.getSettingRaw('show-add-list', suppliedSettings) ?? true,
      'show-archive-all': this.getSettingRaw('show-archive-all', suppliedSettings) ?? true,
      'show-view-as-markdown':
        this.getSettingRaw('show-view-as-markdown', suppliedSettings) ?? true,
      'show-board-settings': this.getSettingRaw('show-board-settings', suppliedSettings) ?? true,
      'show-search': this.getSettingRaw('show-search', suppliedSettings) ?? true,
      'show-set-view': this.getSettingRaw('show-set-view', suppliedSettings) ?? true,
      'tag-colors': this.getSettingRaw('tag-colors', suppliedSettings) ?? [],
      'tag-sort': this.getSettingRaw('tag-sort', suppliedSettings) ?? [],
      'date-colors': this.getSettingRaw('date-colors', suppliedSettings) ?? [],
      'tag-action': this.getSettingRaw('tag-action', suppliedSettings) ?? 'obsidian',
    };
  }

  getSetting = <K extends keyof KanbanSettings>(
    key: K,
    suppliedLocalSettings?: KanbanSettings
  ): KanbanSettings[K] => {
    if (suppliedLocalSettings?.[key] !== undefined) {
      return suppliedLocalSettings[key];
    }

    if (this.compiledSettings?.[key] !== undefined) {
      return this.compiledSettings[key];
    }

    return this.getSettingRaw(key);
  };

  getSettingRaw = <K extends keyof KanbanSettings>(
    key: K,
    suppliedLocalSettings?: KanbanSettings
  ): KanbanSettings[K] => {
    if (suppliedLocalSettings?.[key] !== undefined) {
      return suppliedLocalSettings[key];
    }

    if (this.state?.data?.settings?.[key] !== undefined) {
      return this.state.data.settings[key];
    }

    return this.getGlobalSetting(key);
  };

  getGlobalSetting = <K extends keyof KanbanSettings>(key: K): KanbanSettings[K] => {
    const globalSettings = this.getGlobalSettings();

    if (globalSettings?.[key] !== undefined) {
      return globalSettings[key];
    }

    return null;
  };

  getParsedBoard(data: string) {
    const trimmedContent = data.trim();

    let board: Board = {
      ...BoardTemplate,
      id: this.file.path,
      children: [],
      data: {
        archive: [],
        done: [],
        delegated: [],
        recurring: [],
        proposals: [],
        waiting: [],
        settings: { [frontmatterKey]: 'board' },
        frontmatter: {},
        isSearching: false,
        errors: [],
      },
    };

    try {
      if (trimmedContent) {
        board = this.parser.mdToBoard(trimmedContent);
      }
    } catch (e) {
      console.error(e);

      board = update(board, {
        data: {
          errors: {
            $push: [{ description: e.toString(), stack: e.stack }],
          },
        },
      });
    }

    return board;
  }

  setError(e: Error) {
    this.setState(
      update(this.state, {
        data: {
          errors: {
            $push: [{ description: e.toString(), stack: e.stack }],
          },
        },
      }),
      false
    );
  }

  onFileMetadataChange() {
    this.reparseBoardFromMd();
  }

  async reparseBoardFromMd() {
    try {
      this.setState(this.getParsedBoard(this.getAView().data), false);
    } catch (e) {
      console.error(e);
      this.setError(e);
    }
  }

  async archiveCompletedCards() {
    const board = this.state;

    const archived: Item[] = [];
    const shouldAppendArchiveDate = !!this.getSetting('archive-with-date');
    const archiveDateSeparator = this.getSetting('archive-date-separator');
    const archiveDateFormat = this.getSetting('archive-date-format');
    const archiveDateAfterTitle = this.getSetting('append-archive-date');

    const appendArchiveDate = (item: Item) => {
      const newTitle = [moment().format(archiveDateFormat)];

      if (archiveDateSeparator) newTitle.push(archiveDateSeparator);

      newTitle.push(item.data.titleRaw);

      if (archiveDateAfterTitle) newTitle.reverse();

      const titleRaw = newTitle.join(' ');

      return this.parser.updateItemContent(item, titleRaw);
    };

    const lanes = board.children.map((lane) => {
      return update(lane, {
        children: {
          $set: lane.children.filter((item) => {
            const isComplete = item.data.checked && item.data.checkChar === getTaskStatusDone();
            if (lane.data.shouldMarkItemsComplete || isComplete) {
              archived.push(item);
            }

            return !isComplete && !lane.data.shouldMarkItemsComplete;
          }),
        },
      });
    });

    try {
      this.setState(
        update(board, {
          children: {
            $set: lanes,
          },
          data: {
            archive: {
              $push: shouldAppendArchiveDate
                ? await Promise.all(archived.map((item) => appendArchiveDate(item)))
                : archived,
            },
          },
        })
      );
    } catch (e) {
      this.setError(e);
    }
  }

  getNewItem(content: string, checkChar: string, forceEdit?: boolean) {
    return this.parser.newItem(content, checkChar, forceEdit);
  }

  updateItemContent(item: Item, content: string) {
    return this.parser.updateItemContent(item, content);
  }

  // v2 Selection methods
  selectItem(itemId: string | null) {
    this.selectedItemId = itemId;
    // Close archive pane when selecting a card (mutual exclusion)
    if (itemId !== null) {
      this.isArchiveOpen = false;
    }
    // Trigger re-render by notifying state receivers
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  getSelectedItem(): Item | null {
    if (!this.selectedItemId || !this.state) return null;

    // Search visible lanes first
    for (const lane of this.state.children) {
      for (const item of lane.children) {
        if (item.id === this.selectedItemId) {
          return item;
        }
      }
    }

    // Search hidden pane arrays (archive, done, delegated, recurring, proposals, waiting)
    for (const item of this.state.data.archive || []) {
      if (item.id === this.selectedItemId) return item;
    }
    for (const item of this.state.data.done || []) {
      if (item.id === this.selectedItemId) return item;
    }
    for (const item of this.state.data.delegated || []) {
      if (item.id === this.selectedItemId) return item;
    }
    for (const item of this.state.data.recurring || []) {
      if (item.id === this.selectedItemId) return item;
    }
    for (const item of this.state.data.proposals || []) {
      if (item.id === this.selectedItemId) return item;
    }
    for (const item of this.state.data.waiting || []) {
      if (item.id === this.selectedItemId) return item;
    }

    return null;
  }

  // v2.1 Archive pane methods
  toggleArchive() {
    this.isArchiveOpen = !this.isArchiveOpen;
    // Close all other panes when opening archive
    if (this.isArchiveOpen) {
      this.selectedItemId = null;
      this.isDoneOpen = false;
      this.isDelegatedOpen = false;
    }
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  openArchive() {
    this.isArchiveOpen = true;
    this.selectedItemId = null;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  closeArchive() {
    this.isArchiveOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  getIsArchiveOpen(): boolean {
    return this.isArchiveOpen;
  }

  // v2.1 Done pane methods
  toggleDone() {
    this.isDoneOpen = !this.isDoneOpen;
    // Close all other panes when opening done
    if (this.isDoneOpen) {
      this.selectedItemId = null;
      this.isArchiveOpen = false;
      this.isDelegatedOpen = false;
    }
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  openDone() {
    this.isDoneOpen = true;
    this.selectedItemId = null;
    this.isArchiveOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  closeDone() {
    this.isDoneOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  getIsDoneOpen(): boolean {
    return this.isDoneOpen;
  }

  // v2.1 Delegated pane methods
  isDelegatedOpen: boolean = false;

  toggleDelegated() {
    this.isDelegatedOpen = !this.isDelegatedOpen;
    // Close detail, archive, and done pane when opening delegated
    if (this.isDelegatedOpen) {
      this.selectedItemId = null;
      this.isArchiveOpen = false;
      this.isDoneOpen = false;
    }
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  openDelegated() {
    this.isDelegatedOpen = true;
    this.selectedItemId = null;
    this.isArchiveOpen = false;
    this.isDoneOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  closeDelegated() {
    this.isDelegatedOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  getIsDelegatedOpen(): boolean {
    return this.isDelegatedOpen;
  }

  // v2.5 Recurring pane methods
  isRecurringOpen: boolean = false;

  toggleRecurring() {
    this.isRecurringOpen = !this.isRecurringOpen;
    if (this.isRecurringOpen) {
      this.selectedItemId = null;
      this.isArchiveOpen = false;
      this.isDoneOpen = false;
      this.isDelegatedOpen = false;
      this.isProposalsOpen = false;
      this.isWaitingOpen = false;
    }
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  openRecurring() {
    this.isRecurringOpen = true;
    this.selectedItemId = null;
    this.isArchiveOpen = false;
    this.isDoneOpen = false;
    this.isDelegatedOpen = false;
    this.isProposalsOpen = false;
    this.isWaitingOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  closeRecurring() {
    this.isRecurringOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  getIsRecurringOpen(): boolean {
    return this.isRecurringOpen;
  }

  // v2.5 Proposals pane methods
  isProposalsOpen: boolean = false;

  toggleProposals() {
    this.isProposalsOpen = !this.isProposalsOpen;
    if (this.isProposalsOpen) {
      this.selectedItemId = null;
      this.isArchiveOpen = false;
      this.isDoneOpen = false;
      this.isDelegatedOpen = false;
      this.isRecurringOpen = false;
      this.isWaitingOpen = false;
    }
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  openProposals() {
    this.isProposalsOpen = true;
    this.selectedItemId = null;
    this.isArchiveOpen = false;
    this.isDoneOpen = false;
    this.isDelegatedOpen = false;
    this.isRecurringOpen = false;
    this.isWaitingOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  closeProposals() {
    this.isProposalsOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  getIsProposalsOpen(): boolean {
    return this.isProposalsOpen;
  }

  // v2.5 Waiting/Blocked pane methods
  isWaitingOpen: boolean = false;

  toggleWaiting() {
    this.isWaitingOpen = !this.isWaitingOpen;
    if (this.isWaitingOpen) {
      this.selectedItemId = null;
      this.isArchiveOpen = false;
      this.isDoneOpen = false;
      this.isDelegatedOpen = false;
      this.isRecurringOpen = false;
      this.isProposalsOpen = false;
    }
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  openWaiting() {
    this.isWaitingOpen = true;
    this.selectedItemId = null;
    this.isArchiveOpen = false;
    this.isDoneOpen = false;
    this.isDelegatedOpen = false;
    this.isRecurringOpen = false;
    this.isProposalsOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  closeWaiting() {
    this.isWaitingOpen = false;
    this.stateReceivers.forEach((receiver) => receiver({ ...this.state }));
  }

  getIsWaitingOpen(): boolean {
    return this.isWaitingOpen;
  }

  // Undo Buffer Methods
  saveDeletedItem(
    item: Item,
    location: {
      type: 'lane';
      laneIndex: number;
      itemIndex: number;
    } | {
      type: 'virtual';
      listName: 'archive' | 'done' | 'delegated' | 'recurring' | 'proposals' | 'waiting';
      itemIndex: number;
    }
  ) {
    this.lastDeletedBuffer = { item, location };
  }

  restoreLastDeleted() {
    if (!this.lastDeletedBuffer) return;

    const { item, location } = this.lastDeletedBuffer;

    this.setState((board) => {
      if (location.type === 'lane') {
        const lane = board.children[location.laneIndex];
        // Safety check if lane exists
        if (!lane) return board;

        return update(board, {
          children: {
            [location.laneIndex]: {
              children: { $splice: [[location.itemIndex, 0, item]] },
            },
          },
        });
      } else {
        // Virtual lane
        return update(board, {
          data: {
            [location.listName]: { $splice: [[location.itemIndex, 0, item]] },
          },
        });
      }
    });

    this.lastDeletedBuffer = null;
  }
}
