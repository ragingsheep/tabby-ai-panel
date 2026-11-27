import { ConfigProvider, Platform } from 'tabby-core'
import { CONFIG_KEY, DEFAULT_CONFIG, HOTKEY_IDS } from './types/config'

/** @hidden */
export class AiPanelConfigProvider extends ConfigProvider {
    defaults = {
        [CONFIG_KEY]: { ...DEFAULT_CONFIG },
        hotkeys: {
            [HOTKEY_IDS.toggle]: ['Ctrl-Alt-Shift-A'],
            [HOTKEY_IDS.approve]: ['Ctrl-Alt-Shift-Y'],
            [HOTKEY_IDS.deny]: ['Ctrl-Alt-Shift-X'],
            [HOTKEY_IDS.stop]: ['Ctrl-Alt-Shift-S'],
            [HOTKEY_IDS.focusInput]: ['Ctrl-Alt-Shift-I'],
            [HOTKEY_IDS.newSession]: ['Ctrl-Alt-Shift-N'],
        },
    }

    platformDefaults = {
        [Platform.macOS]: {
            hotkeys: {
                [HOTKEY_IDS.toggle]: ['⌘-Alt-Shift-A'],
                [HOTKEY_IDS.approve]: ['⌘-Alt-Shift-Y'],
                [HOTKEY_IDS.deny]: ['⌘-Alt-Shift-X'],
                [HOTKEY_IDS.stop]: ['⌘-Alt-Shift-S'],
                [HOTKEY_IDS.focusInput]: ['⌘-Alt-Shift-I'],
                [HOTKEY_IDS.newSession]: ['⌘-Alt-Shift-N'],
            },
        },
    }
}
