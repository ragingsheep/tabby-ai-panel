import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider } from 'tabby-core'
import { HOTKEY_IDS } from './types/config'

/** @hidden */
@Injectable()
export class AiPanelHotkeyProvider extends HotkeyProvider {
    async provide (): Promise<HotkeyDescription[]> {
        return [
            { id: HOTKEY_IDS.toggle, name: 'AI Panel-oAIsub: toggle' },
            { id: HOTKEY_IDS.approve, name: 'AI Panel-oAIsub: approve pending action' },
            { id: HOTKEY_IDS.deny, name: 'AI Panel-oAIsub: deny pending action' },
            { id: HOTKEY_IDS.stop, name: 'AI Panel-oAIsub: stop the agent' },
            { id: HOTKEY_IDS.focusInput, name: 'AI Panel-oAIsub: focus the prompt' },
            { id: HOTKEY_IDS.newSession, name: 'AI Panel-oAIsub: new session' },
        ]
    }
}
