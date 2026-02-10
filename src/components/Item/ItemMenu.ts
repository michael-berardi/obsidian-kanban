import update from 'immutability-helper';
import { Menu, Platform, TFile, TFolder } from 'obsidian';
import { Dispatch, StateUpdater, useCallback } from 'preact/hooks';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { moveEntity } from 'src/dnd/util/data';
import { t } from 'src/lang/helpers';

import { BoardModifiers } from '../../helpers/boardModifiers';
import { applyTemplate, escapeRegExpStr, generateInstanceId } from '../helpers';
import { EditState, Item } from '../types';
import {
  constructDatePicker,
  constructMenuDatePickerOnChange,
  constructMenuTimePickerOnChange,
  constructTimePicker,
} from './helpers';

const illegalCharsRegEx = /[\\/:"*?<>|]+/g;
const embedRegEx = /!?\[\[([^\]]*)\.[^\]]+\]\]/g;
const wikilinkRegEx = /!?\[\[([^\]]*)\]\]/g;
const mdLinkRegEx = /!?\[([^\]]*)\]\([^)]*\)/g;
const tagRegEx = /#([^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s\n\r]+)/g;
const condenceWhiteSpaceRE = /\s+/g;

interface UseItemMenuParams {
  setEditState: Dispatch<StateUpdater<EditState>>;
  item: Item;
  path: Path;
  boardModifiers: BoardModifiers;
  stateManager: StateManager;
}

export function useItemMenu({
  setEditState,
  item,
  path,
  boardModifiers,
  stateManager,
}: UseItemMenuParams) {
  return useCallback(
    (e: MouseEvent) => {
      const coordinates = { x: e.clientX, y: e.clientY };
      const hasDate = !!item.data.metadata.date;
      const hasTime = !!item.data.metadata.time;

      const menu = new Menu();

      // =============================================
      // MOBILE MENU - Streamlined for touch
      // =============================================
      if (Platform.isMobile) {
        menu
          // Edit card
          .addItem((i) => {
            i.setIcon('lucide-edit')
              .setTitle(t('Edit card'))
              .onClick(() => setEditState(coordinates));
          })
          .addSeparator()
          // Delegate (move to Delegated hidden lane)
          .addItem((i) => {
            i.setIcon('lucide-send')
              .setTitle('Delegate')
              .onClick(() => {
                stateManager.setState((board) => {
                  const delegated = board.data.delegated || [];
                  return {
                    ...board,
                    data: {
                      ...board.data,
                      delegated: [...delegated, item],
                    },
                    children: board.children.map((lane, laneIdx) => {
                      if (laneIdx === path[0]) {
                        return {
                          ...lane,
                          children: lane.children.filter((_, itemIdx) => itemIdx !== path[1]),
                        };
                      }
                      return lane;
                    }),
                  };
                });
              });
          })
          // Mark as Complete (move to Done hidden lane + sync to Tabula)
          .addItem((i) => {
            i.setIcon('lucide-check-circle')
              .setTitle('Mark Complete')
              .onClick(() => {
                // v5.0 Tabula Integration: Use markTaskComplete for invoice sync
                stateManager.markTaskComplete(item, path[0], path[1]);
              });
          })
          .addSeparator()
          // Add/Edit due date
          .addItem((i) => {
            i.setIcon('lucide-calendar')
              .setTitle(hasDate ? t('Edit date') : t('Add date'))
              .onClick(() => {
                constructDatePicker(
                  e.view,
                  stateManager,
                  coordinates,
                  constructMenuDatePickerOnChange({
                    stateManager,
                    boardModifiers,
                    item,
                    hasDate,
                    path,
                  }),
                  item.data.metadata.date?.toDate()
                );
              });
          });

        // Remove date if exists
        if (hasDate) {
          menu.addItem((i) => {
            i.setIcon('lucide-calendar-x')
              .setTitle(t('Remove date'))
              .onClick(() => {
                const shouldLinkDates = stateManager.getSetting('link-date-to-daily-note');
                const dateTrigger = stateManager.getSetting('date-trigger');
                const contentMatch = shouldLinkDates
                  ? '(?:\\[[^\\]]+\\]\\([^\\)]+\\)|\\[\\[[^\\]]+\\]\\])'
                  : '{[^}]+}';
                const dateRegEx = new RegExp(
                  `(^|\\s)${escapeRegExpStr(dateTrigger as string)}${contentMatch}`
                );
                const titleRaw = item.data.titleRaw.replace(dateRegEx, '').trim();
                boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRaw));
              });
          });
        }

        menu
          .addSeparator()
          // Delete card
          .addItem((i) => {
            i.setIcon('lucide-trash-2')
              .setTitle(t('Delete card'))
              .onClick(() => boardModifiers.deleteEntity(path));
          })
          .addSeparator();

        // Move to list options (inline on mobile)
        const lanes = stateManager.state.children;
        if (lanes.length > 1) {
          for (let i = 0, len = lanes.length; i < len; i++) {
            menu.addItem((menuItem) =>
              menuItem
                .setIcon('lucide-square-kanban')
                .setChecked(path[0] === i)
                .setTitle(lanes[i].data.title)
                .onClick(() => {
                  if (path[0] === i) return;
                  stateManager.setState((boardData) => {
                    return moveEntity(boardData, path, [i, 0]);
                  });
                })
            );
          }
        }

        menu.showAtPosition(coordinates);
        return;
      }

      // =============================================
      // DESKTOP MENU - The Strict "Genius" Set (User Mandate)
      // =============================================

      // 1. Edit Card
      menu.addItem((i) => {
        i.setIcon('lucide-edit')
          .setTitle(t('Edit card'))
          .onClick(() => setEditState(coordinates));
      });

      menu.addSeparator();

      // 2. Mark Complete (v5.0 Tabula Integration)
      menu.addItem((i) => {
        i.setIcon('lucide-check-circle')
          .setTitle('Mark Complete')
          .onClick(() => {
            // v5.0 Tabula Integration: Use markTaskComplete for invoice sync
            stateManager.markTaskComplete(item, path[0], path[1]);
          });
      })
        // 3. Delegate
        .addItem((i) => {
          i.setIcon('lucide-send')
            .setTitle('Delegate')
            .onClick(() => {
              stateManager.setState((board) => {
                const delegated = board.data.delegated || [];
                return {
                  ...board,
                  data: {
                    ...board.data,
                    delegated: [...delegated, item],
                  },
                  children: board.children.map((lane, laneIdx) => {
                    if (laneIdx === path[0]) {
                      return {
                        ...lane,
                        children: lane.children.filter((_, itemIdx) => itemIdx !== path[1]),
                      };
                    }
                    return lane;
                  }),
                };
              });
            });
        });

      menu.addSeparator();

      // 4. High Priority
      menu.addItem((i) => {
        const hasPriority = /\[priority::high\]/i.test(item.data.titleRaw || '');
        i.setIcon('lucide-alert-circle')
          .setTitle(hasPriority ? 'Remove high priority' : 'Set high priority')
          .onClick(() => {
            let newTitleRaw = (item.data.titleRaw || '').replace(/\[priority::(standard|high|low)\]/gi, '').trim();
            if (!hasPriority) {
              newTitleRaw = `${newTitleRaw} [priority::high]`;
            }
            boardModifiers.updateItem(path, stateManager.updateItemContent(item, newTitleRaw));
          });
      });

      menu.addSeparator();

      // 5. Delete (Destructive)
      menu.addItem((i) => {
        i.setIcon('lucide-trash-2')
          .setTitle(t('Delete card'))
          .onClick(() => boardModifiers.deleteEntity(path));
      });



      menu.addSeparator();

      const addMoveToOptions = (menu: Menu) => {
        const lanes = stateManager.state.children;
        if (lanes.length <= 1) return;
        for (let i = 0, len = lanes.length; i < len; i++) {
          menu.addItem((item) =>
            item
              .setIcon('lucide-square-kanban')
              .setChecked(path[0] === i)
              .setTitle(lanes[i].data.title)
              .onClick(() => {
                if (path[0] === i) return;
                stateManager.setState((boardData) => {
                  return moveEntity(boardData, path, [i, 0]);
                });
              })
          );
        }
      };

      menu.addItem((item) => {
        const submenu = (item as any)
          .setTitle(t('Move to list'))
          .setIcon('lucide-square-kanban')
          .setSubmenu();

        addMoveToOptions(submenu);
      });

      menu.showAtPosition(coordinates);
    },
    [setEditState, item, path, boardModifiers, stateManager]
  );
}
